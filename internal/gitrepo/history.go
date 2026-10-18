package gitrepo

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"unicode/utf8"
)

// All commit views compare merges against the first parent, including the file list.
func historyArgs(hash, mode string) []string {
	return []string{"show", "--format=", "--root", "--diff-merges=first-parent", "--no-show-signature", "--no-ext-diff", "--no-textconv", "--find-renames", mode, "-z", hash, "--"}
}

func (e *Engine) commitDetails(ctx context.Context, hash string) (CommitDetails, error) {
	d := CommitDetails{Files: []CommitFile{}}
	if !hashPattern.MatchString(hash) {
		return d, errors.New("无效的提交 ID")
	}
	raw, err := run(ctx, e.root, "show", "-s", "--no-show-signature", "--format=%H%x00%h%x00%P%x00%s%x00%an%x00%ae%x00%aI%x00%cn%x00%ce%x00%cI%x00%b", hash, "--")
	if err != nil {
		return d, err
	}
	f := strings.SplitN(raw, "\x00", 11)
	if len(f) != 11 {
		return d, errors.New("无法解析提交信息")
	}
	d.Commit = Commit{Hash: f[0], Short: f[1], Parents: strings.Fields(f[2]), Subject: f[3], Author: f[4], AuthorEmail: f[5], Date: f[6]}
	d.Committer, d.CommitterEmail, d.CommittedAt, d.Body = f[7], f[8], f[9], strings.TrimSpace(f[10])
	raw, err = run(ctx, e.root, historyArgs(hash, "--name-status")...)
	if err != nil {
		return d, err
	}
	parts := strings.Split(strings.TrimSuffix(raw, "\x00"), "\x00")
	for i := 0; i < len(parts) && parts[i] != ""; {
		status := parts[i]
		i++
		if i >= len(parts) {
			return d, errors.New("无法解析提交文件")
		}
		file := CommitFile{Status: status, Path: parts[i]}
		i++
		if strings.HasPrefix(status, "R") || strings.HasPrefix(status, "C") {
			if i >= len(parts) {
				return d, errors.New("无法解析重命名文件")
			}
			file.OldPath, file.Path = file.Path, parts[i]
			i++
		}
		d.Files = append(d.Files, file)
	}
	raw, err = run(ctx, e.root, historyArgs(hash, "--numstat")...)
	if err != nil {
		return d, err
	}
	parts = strings.Split(strings.TrimSuffix(raw, "\x00"), "\x00")
	for i := 0; i < len(parts) && parts[i] != ""; i++ {
		stats := strings.SplitN(parts[i], "\t", 3)
		if len(stats) != 3 {
			return d, errors.New("无法解析文件统计")
		}
		path := stats[2]
		if path == "" {
			if i+2 >= len(parts) {
				return d, errors.New("无法解析重命名统计")
			}
			path = parts[i+2]
			i += 2
		}
		for j := range d.Files {
			if d.Files[j].Path == path {
				d.Files[j].Binary = stats[0] == "-" || stats[1] == "-"
				d.Files[j].Additions, _ = strconv.Atoi(stats[0])
				d.Files[j].Deletions, _ = strconv.Atoi(stats[1])
			}
		}
	}
	return d, nil
}

func (e *Engine) CommitDetails(ctx context.Context, root, hash string) (CommitDetails, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return CommitDetails{}, err
	}
	return e.commitDetails(ctx, hash)
}

func (e *Engine) CommitFileDiff(ctx context.Context, root, hash, path string) (Diff, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Diff{}, err
	}
	d, err := e.commitDetails(ctx, hash)
	if err != nil {
		return Diff{}, err
	}
	for _, file := range d.Files {
		if file.Path == path {
			args := historyArgs(hash, "--patch")
			args = append(args, path)
			if file.OldPath != "" {
				args = append(args, file.OldPath)
			}
			text, err := run(ctx, e.root, args...)
			binary := file.Binary || !utf8.ValidString(text)
			if binary {
				text = ""
			}
			return Diff{Path: path, Text: text, Binary: binary}, err
		}
	}
	return Diff{}, errors.New("该文件不属于所选提交")
}

func (e *Engine) Publish(ctx context.Context, root, remote, branch string) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	s, err := e.snapshot(ctx)
	if err != nil {
		return Result{}, err
	}
	if s.Detached || s.Unborn || s.State != "" || s.Upstream != "" {
		return Result{}, errors.New("首次推送需要已提交且尚未设置上游的正常分支")
	}
	found := false
	for _, r := range s.Remotes {
		if r == remote {
			found = true
		}
	}
	if !found || remote == "" || strings.HasPrefix(remote, "-") {
		return Result{}, errors.New("请选择已配置的远程仓库")
	}
	if branch == "" || strings.HasPrefix(branch, "-") {
		return Result{}, errors.New("无效的远程分支名")
	}
	if _, err := run(ctx, e.root, "check-ref-format", "refs/heads/"+branch); err != nil {
		return Result{}, errors.New("无效的远程分支名")
	}
	out, err := run(ctx, e.root, "push", "--progress", "--no-force", "--no-follow-tags", "--recurse-submodules=no", "--set-upstream", remote, "HEAD:refs/heads/"+branch)

	return Result{Output: out}, err
}
