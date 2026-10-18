package gitrepo

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const outputLimit = 4 << 20

type Engine struct {
	mu         sync.Mutex
	root       string
	operations []Operation
}

type limitedOutput struct {
	bytes.Buffer
	exceeded bool
}

func (b *limitedOutput) Write(p []byte) (int, error) {
	n := len(p)
	remaining := outputLimit - b.Len()
	if len(p) > remaining {
		b.exceeded = true
		p = p[:remaining]
	}
	_, _ = b.Buffer.Write(p)
	return n, nil
}

func run(ctx context.Context, root string, args ...string) (string, error) {
	return runInput(ctx, root, "", args...)
}

func runInput(ctx context.Context, root, input string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 90*time.Second)
	defer cancel()
	base := []string{"--no-pager", "--literal-pathspecs", "-c", "color.ui=false", "-c", "core.quotePath=false"}
	if root != "" {
		base = append(base, "-C", root)
	}
	cmd := exec.CommandContext(ctx, "git", append(base, args...)...)
	if input != "" {
		cmd.Stdin = strings.NewReader(input)
	}
	cmd.WaitDelay = 2 * time.Second
	// Repository selection must not be overridden by a launching shell's Git variables.
	for _, value := range os.Environ() {
		key := strings.SplitN(value, "=", 2)[0]
		if !strings.HasPrefix(key, "GIT_") && key != "LC_ALL" {
			cmd.Env = append(cmd.Env, value)
		}
	}
	cmd.Env = append(cmd.Env, "GIT_TERMINAL_PROMPT=0", "GIT_OPTIONAL_LOCKS=0", "LC_ALL=C")
	var stdout, stderr limitedOutput
	cmd.Stdout, cmd.Stderr = &stdout, &stderr
	err := cmd.Run()
	if ctx.Err() != nil {
		return "", fmt.Errorf("Git 操作已取消或超时: %w", ctx.Err())
	}
	if err != nil {
		message := strings.TrimSpace(stderr.String())
		if message == "" {
			message = err.Error()
		}
		return "", errors.New(message)
	}
	if stdout.exceeded || stderr.exceeded {
		return "", errors.New("Git 输出超过 4 MB，请使用命令行查看此大型仓库或文件")
	}
	return stdout.String(), nil
}

func (e *Engine) Open(ctx context.Context, path string) (Snapshot, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if strings.TrimSpace(path) == "" {
		return Snapshot{}, errors.New("请选择仓库文件夹")
	}
	path, err := filepath.Abs(path)
	if err != nil {
		return Snapshot{}, err
	}
	root, err := run(ctx, path, "rev-parse", "--show-toplevel")
	if err != nil {
		return Snapshot{}, fmt.Errorf("无法打开 Git 工作区: %w", err)
	}
	previousRoot, previousOperations := e.root, e.operations
	e.root, e.operations = strings.TrimSuffix(root, "\n"), nil
	snapshot, err := e.snapshot(ctx)
	if err != nil {
		e.root, e.operations = previousRoot, previousOperations
	}
	return snapshot, err
}

func (e *Engine) Snapshot(ctx context.Context, root string) (Snapshot, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Snapshot{}, err
	}
	return e.snapshot(ctx)
}

func (e *Engine) checkRoot(root string) error {
	if e.root == "" || e.root != root {
		return errors.New("仓库已切换，请刷新后重试")
	}
	return nil
}

func parseStatus(raw string) (Snapshot, error) {
	s := Snapshot{Files: []File{}}
	records := strings.Split(raw, "\x00")
	for i := 0; i < len(records); i++ {
		line := records[i]
		switch {
		case strings.HasPrefix(line, "# branch.head "):
			s.Branch = strings.TrimPrefix(line, "# branch.head ")
			s.Detached = s.Branch == "(detached)"
		case strings.HasPrefix(line, "# branch.oid "):
			s.Unborn = strings.HasSuffix(line, "(initial)")
		case strings.HasPrefix(line, "# branch.upstream "):
			s.Upstream = strings.TrimPrefix(line, "# branch.upstream ")
		case strings.HasPrefix(line, "# branch.ab "):
			_, _ = fmt.Sscanf(line, "# branch.ab +%d -%d", &s.Ahead, &s.Behind)
		case strings.HasPrefix(line, "? "):
			s.Files = append(s.Files, File{Path: line[2:], Index: ".", Worktree: "?", Untracked: true})
		case strings.HasPrefix(line, "1 "), strings.HasPrefix(line, "2 "), strings.HasPrefix(line, "u "):
			count := 9
			if line[0] == '2' {
				count = 10
			} else if line[0] == 'u' {
				count = 11
			}
			fields := strings.SplitN(line, " ", count)
			if len(fields) != count || len(fields[1]) != 2 {
				return s, errors.New("无法解析 Git 文件状态")
			}
			f := File{Path: fields[count-1], Index: fields[1][:1], Worktree: fields[1][1:], Conflicted: line[0] == 'u'}
			if line[0] == '2' {
				i++
				if i >= len(records) {
					return s, errors.New("Git 重命名记录不完整")
				}
				f.OldPath = records[i]
			}
			s.Files = append(s.Files, f)
		}
	}
	return s, nil
}

func (e *Engine) snapshot(ctx context.Context) (Snapshot, error) {
	raw, err := run(ctx, e.root, "status", "--porcelain=v2", "-z", "--branch", "--untracked-files=all")
	if err != nil {
		return Snapshot{}, err
	}
	s, err := parseStatus(raw)
	if err != nil {
		return s, err
	}
	s.Root, s.Name = e.root, filepath.Base(e.root)
	s.Operations = append([]Operation{}, e.operations...)
	s.Branches, s.Commits, s.Worktrees, s.Remotes = []Branch{}, []Commit{}, []Worktree{}, []string{}
	gitdir, err := run(ctx, e.root, "rev-parse", "--absolute-git-dir")
	if err != nil {
		return s, err
	}
	for _, marker := range []struct{ file, state string }{{"rebase-merge", "rebase"}, {"rebase-apply", "rebase"}, {"MERGE_HEAD", "merge"}, {"CHERRY_PICK_HEAD", "cherry-pick"}, {"REVERT_HEAD", "revert"}, {"BISECT_LOG", "bisect"}} {
		p := filepath.Join(strings.TrimSuffix(gitdir, "\n"), marker.file)
		if _, err := os.Stat(p); err == nil {
			s.State = marker.state
			break
		}
	}
	raw, err = run(ctx, e.root, "for-each-ref", "--sort=-committerdate", "--format=%(refname)%00%(HEAD)%00%(upstream:short)%00%(upstream:remotename)%00%(upstream:remoteref)%00%(subject)", "refs/heads", "refs/remotes")
	if err != nil {
		return s, err
	}
	for _, line := range strings.Split(strings.TrimSuffix(raw, "\n"), "\n") {
		fields := strings.SplitN(line, "\x00", 6)
		if len(fields) != 6 || strings.HasSuffix(fields[0], "/HEAD") {
			continue
		}
		remote := strings.HasPrefix(fields[0], "refs/remotes/")
		name := strings.TrimPrefix(strings.TrimPrefix(fields[0], "refs/heads/"), "refs/remotes/")
		s.Branches = append(s.Branches, Branch{Name: name, Current: fields[1] == "*", Remote: remote, Upstream: fields[2], Subject: fields[5]})
		if fields[1] == "*" {
			s.UpstreamRemote = fields[3]
			if strings.HasPrefix(fields[4], "refs/heads/") {
				s.UpstreamBranch = strings.TrimPrefix(fields[4], "refs/heads/")
			}
		}
	}
	if !s.Unborn {
		raw, err = run(ctx, e.root, "log", "--no-show-signature", "--branches", "--remotes", "HEAD", "--topo-order", "-100", "--format=%H%x00%h%x00%P%x00%s%x00%an%x00%aI%x00%D%x00%ae")
		if err != nil {
			return s, err
		}
		for _, line := range strings.Split(strings.TrimSuffix(raw, "\n"), "\n") {
			f := strings.SplitN(line, "\x00", 8)
			if len(f) == 8 {
				s.Commits = append(s.Commits, Commit{Hash: f[0], Short: f[1], Parents: strings.Fields(f[2]), Subject: f[3], Author: f[4], Date: f[5], Refs: f[6], AuthorEmail: f[7]})
			}
		}
	}
	raw, err = run(ctx, e.root, "remote")
	if err != nil {
		return s, err
	}
	s.Remotes = strings.Fields(raw)
	raw, err = run(ctx, e.root, "worktree", "list", "--porcelain", "-z")
	if err != nil {
		return s, err
	}
	var wt Worktree
	for _, record := range strings.Split(raw, "\x00") {
		switch {
		case strings.HasPrefix(record, "worktree "):
			wt = Worktree{Path: strings.TrimPrefix(record, "worktree ")}
		case strings.HasPrefix(record, "branch "):
			wt.Branch = strings.TrimPrefix(record, "branch refs/heads/")
		case record == "detached":
			wt.Detached = true
		case record == "" && wt.Path != "":
			s.Worktrees = append(s.Worktrees, wt)
			wt = Worktree{}
		}
	}
	s.Stashes, err = e.stashes(ctx)
	if err != nil {
		return s, err
	}
	return s, nil
}

func (e *Engine) Diff(ctx context.Context, root, path string, staged bool) (Diff, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Diff{}, err
	}
	return e.diff(ctx, path, staged)
}

func (e *Engine) diff(ctx context.Context, path string, staged bool) (Diff, error) {
	d := Diff{Path: path, Hunks: []Hunk{}}
	files, err := e.currentFiles(ctx)
	if err != nil {
		return d, err
	}
	f, ok := findFile(files, path)
	if !ok {
		return d, errors.New("文件状态已变化，请刷新")
	}
	if f.Untracked {
		// OpenRoot prevents symlinks and concurrent renames from escaping the repository.
		rootFS, err := os.OpenRoot(e.root)
		if err != nil {
			return d, err
		}
		defer rootFS.Close()
		info, err := rootFS.Lstat(path)
		if err != nil {
			return d, err
		}
		if !info.Mode().IsRegular() {
			d.Text = "此文件不是普通文本文件，请使用外部工具查看。"
			return d, nil
		}
		file, err := rootFS.Open(path)
		if err != nil {
			return d, err
		}
		defer file.Close()
		data, err := io.ReadAll(io.LimitReader(file, outputLimit+1))
		if err != nil {
			return d, err
		}
		if len(data) > outputLimit {
			return d, errors.New("文件超过 4 MB，请使用外部编辑器查看")
		}
		if bytes.IndexByte(data, 0) >= 0 || !utf8.Valid(data) {
			d.Binary = true
			return d, nil
		}
		lines := strings.Split(strings.TrimSuffix(string(data), "\n"), "\n")
		if len(data) == 0 {
			lines = nil
		}
		var text strings.Builder
		fmt.Fprintf(&text, "diff --git a/%s b/%s\nnew file\n--- /dev/null\n+++ b/%s\n@@ -0,0 +1,%d @@\n", path, path, path, len(lines))
		for _, line := range lines {
			text.WriteString("+" + line + "\n")
		}
		d.Text = text.String()
		return d, nil
	}
	args := []string{"diff", "--no-ext-diff", "--no-textconv", "--full-index", "--unified=4"}
	if staged {
		args = append(args, "--cached")
	}
	args = append(args, "--", f.Path)
	if f.OldPath != "" {
		args = append(args, f.OldPath)
	}
	d.Text, err = run(ctx, e.root, args...)
	if !utf8.ValidString(d.Text) {
		d.Binary, d.Text = true, ""
	} else {
		for _, line := range strings.Split(d.Text, "\n") {
			if strings.HasPrefix(line, "Binary files ") || line == "GIT binary patch" {
				d.Binary = true
				break
			}
		}
	}
	if err == nil && hunkSupported(f, d) {
		_, _, d.Hunks = splitHunks(d.Text)
		if len(d.Hunks) > 0 {
			d.Revision = digest(d.Text)
		}
	}
	return d, err
}

var hashPattern = regexp.MustCompile(`^[0-9a-f]{40,64}$`)

func (e *Engine) CommitDiff(ctx context.Context, root, hash string) (Diff, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Diff{}, err
	}
	if !hashPattern.MatchString(hash) {
		return Diff{}, errors.New("无效的提交 ID")
	}
	text, err := run(ctx, e.root, "show", "--format=fuller", "--stat", "--patch", "--no-ext-diff", "--no-textconv", hash, "--")
	return Diff{Path: hash, Text: text}, err
}

func (e *Engine) currentFiles(ctx context.Context) ([]File, error) {
	raw, err := run(ctx, e.root, "status", "--porcelain=v2", "-z", "--untracked-files=all")
	if err != nil {
		return nil, err
	}
	s, err := parseStatus(raw)
	return s.Files, err
}

func findFile(files []File, path string) (File, bool) {
	for _, f := range files {
		if f.Path == path {
			return f, true
		}
	}
	return File{}, false
}

func (e *Engine) record(label, output string, err error) {
	if err != nil {
		output = err.Error()
	}
	if len(output) > 800 {
		output = string([]rune(output)[:min(800, len([]rune(output)))])
	}
	e.operations = append([]Operation{{Label: label, Detail: strings.TrimSpace(output), Success: err == nil, Time: time.Now().Format(time.RFC3339)}}, e.operations...)
	if len(e.operations) > 40 {
		e.operations = e.operations[:40]
	}
}

func (e *Engine) Stage(ctx context.Context, root string, paths []string, staged bool) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	if len(paths) == 0 {
		return Result{}, errors.New("没有选择文件")
	}
	files, err := e.currentFiles(ctx)
	if err != nil {
		return Result{}, err
	}
	args := []string{"add", "-A", "--"}
	label := "暂存文件"
	if !staged {
		label = "取消暂存"
		if _, err := run(ctx, e.root, "rev-parse", "--verify", "HEAD"); err != nil {
			args = []string{"rm", "--cached", "-r", "-f", "--ignore-unmatch", "--"}
		} else {
			args = []string{"reset", "-q", "HEAD", "--"}
		}
	}
	for _, path := range paths {
		file, ok := findFile(files, path)
		if !ok {
			return Result{}, errors.New("文件状态已变化，请刷新后重试")
		}
		args = append(args, file.Path)
		if file.OldPath != "" && (!staged || file.Worktree == "R") {
			args = append(args, file.OldPath)
		}
	}
	out, err := run(ctx, e.root, args...)
	e.record(label, strings.Join(paths, ", ")+"\n"+out, err)
	return Result{Output: out}, err
}

func (e *Engine) Commit(ctx context.Context, root, message string) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	if strings.TrimSpace(message) == "" || len(message) > 20000 {
		return Result{}, errors.New("请填写提交说明（不超过 20000 字节）")
	}
	s, err := e.snapshot(ctx)
	if err != nil {
		return Result{}, err
	}
	if s.Detached || s.State != "" {
		return Result{}, errors.New("当前处于特殊 Git 状态，请先在命令行完成或退出该操作")
	}
	staged := false
	for _, f := range s.Files {
		if f.Conflicted {
			return Result{}, errors.New("请先解决所有冲突")
		}
		staged = staged || f.Index != "."
	}
	if !staged {
		return Result{}, errors.New("请先暂存要提交的文件")
	}
	out, err := run(ctx, e.root, "commit", "-m", message)
	e.record("创建提交", out, err)
	return Result{Output: out}, err
}

func (e *Engine) Branch(ctx context.Context, root, name string, create bool) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	if name == "" || strings.HasPrefix(name, "-") {
		return Result{}, errors.New("分支名称无效")
	}
	if checked, err := run(ctx, e.root, "check-ref-format", "--branch", name); err != nil || strings.TrimSuffix(checked, "\n") != name {
		return Result{}, errors.New("分支名称无效")
	}
	s, err := e.snapshot(ctx)
	if err != nil {
		return Result{}, err
	}
	if len(s.Files) != 0 || s.State != "" {
		return Result{}, errors.New("为保护工作区，请先提交修改，并完成正在进行的 Git 操作")
	}
	args := []string{"switch", "--no-guess"}
	label := "切换分支"
	if create {
		args = append(args, "-c")
		label = "创建分支"
	} else {
		found := false
		for _, b := range s.Branches {
			found = found || (!b.Remote && b.Name == name)
		}
		if !found {
			return Result{}, errors.New("本地分支不存在")
		}
	}
	args = append(args, name)
	out, err := run(ctx, e.root, args...)
	e.record(label+" "+name, out, err)
	return Result{Output: out}, err
}

func (e *Engine) Sync(ctx context.Context, root, action string) (Result, error) {
	return e.sync(ctx, root, action, "", "", "", false)
}

func (e *Engine) SyncConfirmed(ctx context.Context, root, action, branch, remote, target string) (Result, error) {
	return e.sync(ctx, root, action, branch, remote, target, true)
}

func (e *Engine) sync(ctx context.Context, root, action, branch, remote, target string, confirmed bool) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	s, err := e.snapshot(ctx)
	if err != nil {
		return Result{}, err
	}
	if confirmed && (action == "pull" || action == "push") && (s.Branch != branch || s.UpstreamRemote != remote || s.UpstreamBranch != target) {
		return Result{}, errors.New("当前分支或上游目标已变化，请刷新后重新确认，不会向未经确认的目标同步")
	}
	var args []string
	switch action {
	case "fetch":
		args = []string{"fetch", "--all"}
		if len(s.Remotes) == 0 {
			return Result{}, errors.New("此仓库没有配置远程仓库")
		}
	case "pull", "push":
		if s.Upstream == "" || s.Detached || s.State != "" {
			return Result{}, errors.New("需要已配置上游的正常分支；请先在终端设置 upstream")
		}
		if s.UpstreamRemote == "" || strings.HasPrefix(s.UpstreamRemote, "-") || s.UpstreamBranch == "" {
			return Result{}, errors.New("上游配置无效，需要指向一个分支")
		}
		if action == "pull" {
			if len(s.Files) != 0 {
				return Result{}, errors.New("拉取前请先提交工作区修改")
			}
			args = []string{"-c", "merge.autostash=false", "pull", "--ff-only", "--no-rebase", s.UpstreamRemote, "refs/heads/" + s.UpstreamBranch}
		} else {
			if s.Behind > 0 {
				return Result{}, errors.New("远程存在尚未整合的提交，请先拉取")
			}
			// Use the checked target directly; do not re-read a potentially changed refspec.
			args = []string{"push", "--no-force", "--no-follow-tags", "--recurse-submodules=no", s.UpstreamRemote, "HEAD:refs/heads/" + s.UpstreamBranch}
		}
	default:
		return Result{}, errors.New("不支持的同步操作")
	}
	out, err := run(ctx, e.root, args...)
	e.record(strings.ToUpper(action[:1])+action[1:], out, err)
	return Result{Output: out}, err
}
