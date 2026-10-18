package gitrepo

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

const historyPageSize = 100

// Pin traversal to immutable tips. Stash/reflog-only commits are intentionally excluded.
func (e *Engine) historyTips(ctx context.Context) (string, string, error) {
	refs, err := run(ctx, e.root, "for-each-ref", "--sort=refname", "--format=%(refname) %(objectname)", "refs/heads", "refs/remotes")
	if err != nil {
		return "", "", err
	}
	head, headErr := run(ctx, e.root, "rev-parse", "--verify", "HEAD")
	symbolic, symbolicErr := run(ctx, e.root, "symbolic-ref", "--quiet", "HEAD")
	if headErr != nil {
		// An unborn branch has no HEAD, but invalid repositories must still fail.
		if symbolicErr != nil {
			return "", "", headErr
		}
		head = ""
	}
	tips := head
	for _, line := range strings.Split(strings.TrimSpace(refs), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 {
			tips += fields[1] + "\n"
		}
	}
	return tips, digest(refs + "\x00" + head + "\x00" + symbolic), nil
}

func (e *Engine) History(ctx context.Context, root, query, revision string, offset int) (HistoryPage, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return HistoryPage{}, err
	}
	return e.history(ctx, query, revision, offset)
}

func (e *Engine) history(ctx context.Context, query, revision string, offset int) (HistoryPage, error) {
	page := HistoryPage{Commits: []Commit{}}
	if offset < 0 || offset > 100000000 || len(query) > 512 || strings.ContainsRune(query, 0) {
		return page, errors.New("无效的历史查询")
	}
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	tips, current, err := e.historyTips(ctx)
	if err != nil {
		return page, err
	}
	page.Revision = current
	if (revision != "" && revision != current) || (offset > 0 && revision == "") {
		return page, errors.New("提交历史已变化，请刷新历史后继续加载")
	}
	if tips == "" {
		return page, nil
	}
	if query == "" && offset == 0 && e.historyCache != nil && e.historyCache.Revision == current {
		return *e.historyCache, nil
	}
	query = strings.ToLower(strings.TrimSpace(query))
	args := []string{"log", "--no-show-signature", "--topo-order", "--format=%H%x00%h%x00%P%x00%s%x00%an%x00%aI%x00%D%x00%ae", "--stdin"}
	if query == "" {
		args = append(args, "--skip="+strconv.Itoa(offset), "--max-count=101")
	}
	cmd := gitCommand(ctx, e.root, args...)
	cmd.Stdin = strings.NewReader(tips)
	var stderr limitedOutput
	cmd.Stderr = &stderr
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return page, err
	}
	if err := cmd.Start(); err != nil {
		return page, err
	}
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 4096), outputLimit)
	skipped, stopped, pageBytes := 0, false, 0
	var readErr error
	for scanner.Scan() {
		f := strings.SplitN(scanner.Text(), "\x00", 8)
		if len(f) != 8 {
			continue
		}
		if query != "" {
			if !strings.Contains(strings.ToLower(strings.Join([]string{f[0], f[3], f[4], f[7]}, " ")), query) {
				continue
			}
			if skipped < offset {
				skipped++
				continue
			}
		}
		pageBytes += len(scanner.Bytes())
		if pageBytes > outputLimit {
			readErr = errors.New("单页提交信息超过 4 MB，请在终端查看此异常大的提交记录")
			cancel()
			break
		}
		page.Commits = append(page.Commits, Commit{Hash: f[0], Short: f[1], Parents: strings.Fields(f[2]), Subject: f[3], Author: f[4], Date: f[5], Refs: f[6], AuthorEmail: f[7]})
		if len(page.Commits) > historyPageSize {
			page.HasMore, stopped = true, true
			// Search streams the entire reachable history without buffering it in memory.
			cancel()
			break
		}
	}
	scanErr := scanner.Err()
	if scanErr != nil {
		cancel()
	}
	waitErr := cmd.Wait()
	if readErr != nil {
		return HistoryPage{}, readErr
	}
	if scanErr != nil {
		return HistoryPage{}, fmt.Errorf("读取提交历史失败: %w", scanErr)
	}
	if !stopped {
		if ctx.Err() != nil {
			return HistoryPage{}, fmt.Errorf("历史查询已取消或超时: %w", ctx.Err())
		}
		if waitErr != nil {
			return HistoryPage{}, fmt.Errorf("读取提交历史失败: %s (%w)", strings.TrimSpace(stderr.String()), waitErr)
		}
	}
	if page.HasMore {
		page.Commits = page.Commits[:historyPageSize]
	}
	page.NextOffset = offset + len(page.Commits)
	if query == "" && offset == 0 {
		cached := page
		e.historyCache = &cached
	}
	return page, nil
}
