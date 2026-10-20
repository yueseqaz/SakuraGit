package gitrepo

import (
	"context"
	"errors"
	"os"
	"strings"
	"unicode/utf8"
)

type ConflictDetails struct {
	Path     string `json:"path"`
	Base     string `json:"base"`
	Ours     string `json:"ours"`
	Theirs   string `json:"theirs"`
	Result   string `json:"result"`
	Revision string `json:"revision"`
	State    string `json:"state"`
}

func (e *Engine) Conflict(ctx context.Context, root, path string) (ConflictDetails, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return ConflictDetails{}, err
	}
	return e.conflict(ctx, path)
}

func (e *Engine) conflict(ctx context.Context, path string) (ConflictDetails, error) {
	d := ConflictDetails{Path: path}
	files, err := e.currentFiles(ctx)
	if err != nil {
		return d, err
	}
	f, ok := findFile(files, path)
	if !ok || !f.Conflicted {
		return d, errors.New("此文件已不再处于冲突状态")
	}
	entries, err := run(ctx, e.root, "ls-files", "--unmerged", "-z", "--", path)
	if err != nil {
		return d, err
	}
	stages := map[string]string{}
	for _, record := range strings.Split(entries, "\x00") {
		if record == "" {
			continue
		}
		fields := strings.SplitN(record, "\t", 2)
		if len(fields) != 2 || fields[1] != path {
			return d, errors.New("无法读取冲突索引")
		}
		meta := strings.Fields(fields[0])
		if len(meta) != 3 || meta[0] != "100644" && meta[0] != "100755" {
			return d, errors.New("链接、子模块和类型冲突请使用外部合并工具")
		}
		text, readErr := run(ctx, e.root, "cat-file", "blob", meta[1])
		if readErr != nil {
			return d, readErr
		}
		if !safeMergeText(text) {
			return d, errors.New("内置合并仅支持 1 MB 以内的 UTF-8 文本")
		}
		stages[meta[2]] = text
	}
	// Missing stages mean add/delete conflicts; an empty string would be
	// ambiguous and must not silently turn a deletion into an empty file.
	if len(stages) != 3 {
		return d, errors.New("新增/删除冲突请用外部合并工具处理；内置合并仅处理双方修改的文本")
	}
	fs, err := os.OpenRoot(e.root)
	if err != nil {
		return d, err
	}
	defer fs.Close()
	info, err := fs.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() > 1<<20 {
		return d, errors.New("工作文件不是可安全合并的小型普通文件")
	}
	data, err := fs.ReadFile(path)
	if err != nil {
		return d, err
	}
	if !safeMergeText(string(data)) {
		return d, errors.New("工作文件不是可安全合并的 UTF-8 文本")
	}
	d.Base, d.Ours, d.Theirs, d.Result = stages["1"], stages["2"], stages["3"], string(data)
	w, err := e.workflow(ctx)
	if err != nil {
		return d, err
	}
	d.State = w.State
	d.Revision = digest(entries + "\x00" + d.Result + "\x00" + w.Revision)
	return d, nil
}

func safeMergeText(text string) bool {
	return len(text) <= 1<<20 && utf8.ValidString(text) && !strings.ContainsRune(text, '\x00')
}
func hasConflictMarkers(text string) bool {
	for _, line := range strings.Split(text, "\n") {
		for _, prefix := range []string{"<<<<<<<", "=======", ">>>>>>>", "|||||||"} {
			if strings.HasPrefix(line, prefix) {
				return true
			}
		}
	}
	return false
}

func (e *Engine) SaveConflict(ctx context.Context, root, path, revision, result string) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	if !safeMergeText(result) || hasConflictMarkers(result) {
		return Result{}, errors.New("结果须为 1 MB 以内的 UTF-8 文本，且不能残留冲突标记")
	}
	d, err := e.conflict(ctx, path)
	if err != nil {
		return Result{}, err
	}
	if revision == "" || d.Revision != revision {
		return Result{}, errors.New("冲突文件或仓库已被其他工具修改，请重新读取后合并")
	}
	fs, err := os.OpenRoot(e.root)
	if err != nil {
		return Result{}, err
	}
	defer fs.Close()
	info, err := fs.Lstat(path)
	if err != nil || !info.Mode().IsRegular() {
		return Result{}, errors.New("工作文件类型已变化")
	}
	// Preserve the user's original conflict file before replacing it. This
	// backup is local Git metadata, not an untracked worktree file.
	if err = e.backupWorkFile(ctx, path, []byte(d.Result)); err != nil {
		return Result{}, err
	}
	if err = replaceWorkFile(fs, path, []byte(d.Result), []byte(result), info.Mode().Perm()); err != nil {
		return Result{}, err
	}
	out, err := run(ctx, e.root, "add", "--", path)
	if err != nil {
		return Result{}, errors.New("合并结果已写入，但暂存失败；文件备份已保留。请检查状态后重试：" + err.Error())
	}
	return Result{Output: out}, nil
}
