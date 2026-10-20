package gitrepo

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

type FileBackup struct {
	ID        string `json:"id"`
	Path      string `json:"path"`
	CreatedAt string `json:"createdAt"`
	Content   string `json:"content"`
}

func replaceWorkFile(fs *os.Root, path string, before, after []byte, mode os.FileMode) error {
	tmp := filepath.Join(filepath.Dir(path), ".sakuragit-merge-"+rand.Text())
	f, err := fs.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return err
	}
	defer fs.Remove(tmp)
	if _, err = f.Write(after); err != nil {
		f.Close()
		return err
	}
	if err = f.Close(); err != nil {
		return err
	}
	info, err := fs.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return errors.New("文件类型已变化，请重新读取")
	}
	current, err := fs.ReadFile(path)
	if err != nil || string(current) != string(before) {
		return errors.New("文件已被其他工具修改，请重新读取")
	}
	return fs.Rename(tmp, path)
}

func (e *Engine) backupDirectory(ctx context.Context) (string, error) {
	gitdir, err := run(ctx, e.root, "rev-parse", "--absolute-git-dir")
	if err != nil {
		return "", err
	}
	return filepath.Join(strings.TrimSuffix(gitdir, "\n"), "sakuragit-backups"), nil
}

func (e *Engine) backupWorkFile(ctx context.Context, path string, data []byte) error {
	dir, err := e.backupDirectory(ctx)
	if err != nil {
		return err
	}
	if err = os.MkdirAll(dir, 0700); err != nil {
		return err
	}
	backup := FileBackup{ID: rand.Text(), Path: path, CreatedAt: time.Now().UTC().Format(time.RFC3339Nano), Content: string(data)}
	body, err := json.Marshal(backup)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, backup.ID+".json"), body, 0600)
}

func (e *Engine) FileBackups(ctx context.Context, root string) ([]FileBackup, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return nil, err
	}
	dir, err := e.backupDirectory(ctx)
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	items := []FileBackup{}
	for _, entry := range entries {
		info, statErr := entry.Info()
		if statErr != nil || !info.Mode().IsRegular() || info.Size() > 7<<20 || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, readErr := os.ReadFile(filepath.Join(dir, entry.Name()))
		var item FileBackup
		if readErr == nil && json.Unmarshal(data, &item) == nil && entry.Name() == item.ID+".json" {
			item.Content = ""
			items = append(items, item)
		}
	}
	sort.Slice(items, func(i, j int) bool { return items[i].CreatedAt > items[j].CreatedAt })
	return items, nil
}

func (e *Engine) RecoveryAction(ctx context.Context, root, action, path, revision string) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	w, err := e.workflow(ctx)
	if err != nil {
		return Result{}, err
	}
	if revision == "" || w.Revision != revision {
		return Result{}, errors.New("仓库已变化，请重新确认恢复操作")
	}
	if w.State != "" {
		return Result{}, errors.New("请先完成或中止当前 Git 流程")
	}
	switch action {
	case "undo-commit":
		s, err := e.snapshot(ctx)
		if err != nil {
			return Result{}, err
		}
		if s.Detached || s.Unborn {
			return Result{}, errors.New("请先选择具有提交的本地分支")
		}
		parents, err := run(ctx, e.root, "rev-list", "--parents", "-n", "1", "HEAD")
		if err != nil || len(strings.Fields(parents)) != 2 {
			return Result{}, errors.New("仅支持撤销有一个父提交的普通末次提交")
		}
		remotes, err := run(ctx, e.root, "for-each-ref", "--contains=HEAD", "--format=%(refname)", "refs/remotes")
		if err != nil {
			return Result{}, err
		}
		if strings.TrimSpace(remotes) != "" {
			return Result{}, errors.New("末次提交已被本地已知远程引用包含，请使用 Revert 而不是改写历史")
		}
		out, err := run(ctx, e.root, "reset", "--soft", "HEAD^")
		return Result{Output: out}, err
	case "discard-file":
		files, err := e.currentFiles(ctx)
		if err != nil {
			return Result{}, err
		}
		f, ok := findFile(files, path)
		if !ok || f.Untracked || f.Conflicted || f.OldPath != "" || f.Worktree != "M" {
			return Result{}, errors.New("只支持恢复普通已跟踪修改文件；不删除未跟踪文件")
		}
		fs, err := os.OpenRoot(e.root)
		if err != nil {
			return Result{}, err
		}
		defer fs.Close()
		info, err := fs.Lstat(path)
		if err != nil || !info.Mode().IsRegular() || info.Size() > 1<<20 {
			return Result{}, errors.New("此文件请使用外部工具恢复")
		}
		before, err := fs.ReadFile(path)
		if err != nil {
			return Result{}, err
		}
		if !safeMergeText(string(before)) {
			return Result{}, errors.New("只支持小型 UTF-8 文本文件")
		}
		entries, err := run(ctx, e.root, "ls-files", "--stage", "-z", "--", path)
		if err != nil {
			return Result{}, err
		}
		fields := strings.Fields(strings.SplitN(entries, "\t", 2)[0])
		if len(fields) != 3 || fields[0] != "100644" && fields[0] != "100755" || fields[2] != "0" {
			return Result{}, errors.New("暂存区文件类型不支持恢复")
		}
		after, err := run(ctx, e.root, "cat-file", "blob", fields[1])
		if err != nil {
			return Result{}, err
		}
		if !safeMergeText(after) {
			return Result{}, errors.New("暂存区文件不是小型 UTF-8 文本")
		}
		// Restore uses Git so attributes and CRLF conversions remain correct.
		if err = e.backupWorkFile(ctx, path, before); err != nil {
			return Result{}, err
		}
		latest, _ := fs.ReadFile(path)
		if string(latest) != string(before) {
			return Result{}, errors.New("文件已变化，已停止恢复")
		}
		out, err := run(ctx, e.root, "restore", "--worktree", "--", path)
		return Result{Output: out}, err
	case "restore-backup":
		if len(path) != 26 || strings.ContainsAny(path, "/\\.\x00") {
			return Result{}, errors.New("无效备份编号")
		}
		dir, err := e.backupDirectory(ctx)
		if err != nil {
			return Result{}, err
		}
		data, err := os.ReadFile(filepath.Join(dir, path+".json"))
		if err != nil {
			return Result{}, err
		}
		var backup FileBackup
		if json.Unmarshal(data, &backup) != nil || backup.ID != path || !safeMergeText(backup.Content) {
			return Result{}, errors.New("备份不可读")
		}
		resolved, err := e.developmentPath(backup.Path)
		if err != nil {
			return Result{}, err
		}
		_ = resolved
		fs, err := os.OpenRoot(e.root)
		if err != nil {
			return Result{}, err
		}
		defer fs.Close()
		info, err := fs.Lstat(backup.Path)
		if err != nil || !info.Mode().IsRegular() || info.Size() > 1<<20 {
			return Result{}, errors.New("目标不是小型普通文件")
		}
		before, err := fs.ReadFile(backup.Path)
		if err != nil {
			return Result{}, err
		}
		if !safeMergeText(string(before)) {
			return Result{}, errors.New("目标不是小型 UTF-8 文本")
		}
		if err = e.backupWorkFile(ctx, backup.Path, before); err != nil {
			return Result{}, err
		}
		return Result{Output: "已恢复到工作区，暂存区保持不变；覆盖前内容另有备份"}, replaceWorkFile(fs, backup.Path, before, []byte(backup.Content), info.Mode().Perm())
	default:
		return Result{}, errors.New("不支持的恢复操作")
	}
}

func (e *Engine) HistoryAction(ctx context.Context, root, action, hash, revision string) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	w, err := e.workflow(ctx)
	if err != nil {
		return Result{}, err
	}
	if revision == "" || w.Revision != revision {
		return Result{}, errors.New("仓库已变化，请重新确认")
	}
	s, err := e.snapshot(ctx)
	if err != nil {
		return Result{}, err
	}
	if w.State != "" || len(s.Files) != 0 || s.Detached || s.Unborn {
		return Result{}, errors.New("请先选择本地分支并提交或保存工作区，再操作历史")
	}
	if action != "revert" && action != "cherry-pick" {
		return Result{}, errors.New("不支持的历史操作")
	}
	d, err := e.commitDetails(ctx, hash)
	if err != nil {
		return Result{}, err
	}
	if len(d.Commit.Parents) > 1 {
		return Result{}, errors.New("合并提交需要明确主线，请在终端操作")
	}
	if action == "revert" {
		if _, err = run(ctx, e.root, "merge-base", "--is-ancestor", hash, "HEAD"); err != nil {
			return Result{}, errors.New("只能 Revert 当前分支包含的提交")
		}
	}
	out, err := run(ctx, e.root, "-c", "core.editor=true", action, "--no-edit", hash)
	return Result{Output: out}, err
}
