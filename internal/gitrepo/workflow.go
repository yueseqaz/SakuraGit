package gitrepo

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

type ManagedBranch struct {
	Name    string `json:"name"`
	OID     string `json:"oid"`
	Remote  bool   `json:"remote"`
	Current bool   `json:"current"`
}
type WorkflowInfo struct {
	Revision   string          `json:"revision"`
	State      string          `json:"state"`
	Head       string          `json:"head"`
	Conflicts  []File          `json:"conflicts"`
	Branches   []ManagedBranch `json:"branches"`
	Submodules bool            `json:"submodules"`
	LFS        bool            `json:"lfs"`
}

func (e *Engine) Workflow(ctx context.Context, root string) (WorkflowInfo, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return WorkflowInfo{}, err
	}
	return e.workflow(ctx)
}
func (e *Engine) workflow(ctx context.Context) (WorkflowInfo, error) {
	result := WorkflowInfo{Conflicts: []File{}, Branches: []ManagedBranch{}}
	s, err := e.snapshot(ctx)
	if err != nil {
		return result, err
	}
	result.State = s.State
	result.Head, _ = run(ctx, e.root, "rev-parse", "--verify", "HEAD")
	result.Head = strings.TrimSpace(result.Head)
	for _, f := range s.Files {
		if f.Conflicted {
			result.Conflicts = append(result.Conflicts, f)
		}
	}
	refs, err := run(ctx, e.root, "for-each-ref", "--format=%(refname)%00%(objectname)", "refs/heads", "refs/remotes")
	if err != nil {
		return result, err
	}
	for _, line := range strings.Split(strings.TrimSpace(refs), "\n") {
		p := strings.SplitN(line, "\x00", 2)
		if len(p) != 2 || strings.HasSuffix(p[0], "/HEAD") {
			continue
		}
		remote := strings.HasPrefix(p[0], "refs/remotes/")
		name := strings.TrimPrefix(strings.TrimPrefix(p[0], "refs/heads/"), "refs/remotes/")
		result.Branches = append(result.Branches, ManagedBranch{name, p[1], remote, !remote && name == s.Branch})
	}
	token, err := e.changeToken(ctx)
	if err != nil {
		return result, err
	}
	result.Revision = digest(token + result.Head + result.State)
	fs, err := os.OpenRoot(e.root)
	if err != nil {
		return result, err
	}
	defer fs.Close()
	_, err = fs.Stat(".gitmodules")
	result.Submodules = err == nil
	attributes, _ := fs.ReadFile(".gitattributes")
	result.LFS = strings.Contains(string(attributes), "filter=lfs")
	return result, nil
}
func (e *Engine) WorkflowAction(ctx context.Context, root, action, name, target, revision string) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	w, err := e.workflow(ctx)
	if err != nil {
		return Result{}, err
	}
	if revision == "" || revision != w.Revision {
		return Result{}, errors.New("仓库状态已变化，请重新读取并确认，不执行过期操作")
	}
	var selected *ManagedBranch
	for i := range w.Branches {
		if w.Branches[i].Name == name && !w.Branches[i].Remote {
			selected = &w.Branches[i]
		}
	}
	files, err := e.currentFiles(ctx)
	if err != nil {
		return Result{}, err
	}
	var args []string
	switch action {
	case "rename", "delete", "track":
		if selected == nil || w.State != "" {
			return Result{}, errors.New("请选择存在的本地分支，并先完成正在进行的 Git 流程")
		}
		if err = validBranch(ctx, name); err != nil {
			return Result{}, err
		}
		if action == "rename" || action == "delete" {
			worktrees, readErr := run(ctx, e.root, "worktree", "list", "--porcelain", "-z")
			if readErr != nil {
				return Result{}, readErr
			}
			for _, entry := range strings.Split(worktrees, "\x00\x00") {
				if strings.Contains("\x00"+entry+"\x00", "\x00branch refs/heads/"+name+"\x00") && !strings.HasPrefix(entry, "worktree "+e.root+"\x00") {
					return Result{}, errors.New("此分支正在另一个工作树中使用，请先在那里切换分支")
				}
			}
		}
		if action == "rename" {
			if err = validBranch(ctx, target); err != nil {
				return Result{}, err
			}
			args = []string{"branch", "--move", name, target}
		}
		if action == "delete" {
			if selected.Current {
				return Result{}, errors.New("不能删除当前分支")
			}
			if _, err = run(ctx, e.root, "merge-base", "--is-ancestor", "refs/heads/"+name, "HEAD"); err != nil {
				return Result{}, errors.New("此分支尚未合并到当前 HEAD，不提供强制删除")
			}
			args = []string{"branch", "--delete", "--", name}
		}
		if action == "track" {
			found := false
			for _, b := range w.Branches {
				found = found || (b.Remote && b.Name == target)
			}
			if !found {
				return Result{}, errors.New("请选择已有的远程分支；需要时先 Fetch")
			}
			args = []string{"branch", "--set-upstream-to=refs/remotes/" + target, "--", name}
		}
	case "checkout-remote":
		if len(files) != 0 || w.State != "" {
			return Result{}, errors.New("检出远程分支前请提交或保存工作区")
		}
		if err = validBranch(ctx, target); err != nil {
			return Result{}, err
		}
		found := false
		for _, b := range w.Branches {
			found = found || (b.Remote && b.Name == name)
		}
		if !found {
			return Result{}, errors.New("远程分支已不存在")
		}
		args = []string{"switch", "--no-guess", "--create", target, "--track", "refs/remotes/" + name}
	case "merge":
		if len(files) != 0 || w.State != "" || selected == nil || selected.Current {
			return Result{}, errors.New("合并要求干净的工作区和另一个本地分支")
		}
		args = []string{"-c", "merge.autostash=false", "merge", "--no-edit", "--", "refs/heads/" + name}
	case "continue", "abort":
		if action == "continue" && len(w.Conflicts) > 0 {
			return Result{}, errors.New("仍有未解决冲突，请先逐个解决并标记")
		}
		if w.State != "merge" && w.State != "rebase" && w.State != "cherry-pick" && w.State != "revert" {
			return Result{}, errors.New("没有可继续或中止的 Git 流程")
		}
		if w.State == "merge" && action == "continue" {
			args = []string{"-c", "core.editor=true", "commit", "--no-edit"}
		} else {
			flag := "--continue"
			if action == "abort" {
				flag = "--abort"
			}
			args = []string{"-c", "core.editor=true", "-c", "sequence.editor=true", w.State, flag}
		}
	case "resolve", "mergetool":
		file, ok := findFile(w.Conflicts, name)
		if !ok || !file.Conflicted {
			return Result{}, errors.New("所选文件不再处于冲突状态")
		}
		if action == "mergetool" {
			tool, _ := run(ctx, e.root, "config", "--get", "merge.tool")
			if strings.TrimSpace(tool) == "" {
				return Result{}, errors.New("请先在终端配置可信的 merge.tool；也可在编辑器中手动解决")
			}
			args = []string{"mergetool", "--no-prompt", "--", name}
		} else {
			fs, err := os.OpenRoot(e.root)
			if err != nil {
				return Result{}, err
			}
			defer fs.Close()
			if info, statErr := fs.Lstat(name); statErr == nil {
				if !info.Mode().IsRegular() || info.Size() > 2<<20 {
					return Result{}, errors.New("此类冲突请在终端或合并工具中处理")
				}
				data, err := fs.ReadFile(name)
				if err != nil {
					return Result{}, err
				}
				if !utf8.Valid(data) || strings.Contains(string(data), "\x00") {
					return Result{}, errors.New("二进制冲突请使用外部合并工具处理")
				}
				for _, line := range strings.Split(string(data), "\n") {
					if strings.HasPrefix(line, "<<<<<<<") || strings.HasPrefix(line, "=======") || strings.HasPrefix(line, ">>>>>>>") || strings.HasPrefix(line, "|||||||") {
						return Result{}, errors.New("文件中仍有冲突标记，尚未暂存")
					}
				}
			} else if !os.IsNotExist(statErr) {
				return Result{}, statErr
			}
			args = []string{"add", "-A", "--", name}
		}
	default:
		return Result{}, errors.New("不支持的开发操作")
	}
	out, err := run(ctx, e.root, args...)
	return Result{Output: out}, err
}
func validBranch(ctx context.Context, name string) error {
	if name == "" || strings.HasPrefix(name, "-") || strings.ContainsAny(name, "\r\n\x00") {
		return errors.New("无效的分支名称")
	}
	value, err := run(ctx, "", "check-ref-format", "--branch", name)
	if err != nil || strings.TrimSpace(value) != name {
		return errors.New("无效的分支名称")
	}
	return nil
}

func (e *Engine) DevelopmentPath(ctx context.Context, root, path string) (string, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return "", err
	}
	if path == "" {
		return e.root, nil
	}
	if filepath.IsAbs(path) || path == ".git" || strings.HasPrefix(filepath.ToSlash(path), ".git/") || strings.ContainsAny(path, "\x00") {
		return "", errors.New("只允许访问仓库内的工作文件")
	}
	fs, err := os.OpenRoot(e.root)
	if err != nil {
		return "", err
	}
	defer fs.Close()
	info, err := fs.Stat(path)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() {
		return "", errors.New("请选择普通工作文件")
	}
	// EvalSymlinks plus Rel also prevents editors from following an escaping link.
	resolved, err := filepath.EvalSymlinks(filepath.Join(e.root, path))
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(e.root, resolved)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || rel == ".git" || strings.HasPrefix(filepath.ToSlash(rel), ".git/") {
		return "", errors.New("不允许打开仓库外或 Git 元数据文件")
	}
	return resolved, nil
}
func (e *Engine) IgnoreFile(ctx context.Context, root, path, revision string) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	w, err := e.workflow(ctx)
	if err != nil {
		return Result{}, err
	}
	if w.Revision != revision {
		return Result{}, errors.New("仓库状态已变化，请重新确认忽略操作")
	}
	files, err := e.currentFiles(ctx)
	if err != nil {
		return Result{}, err
	}
	f, ok := findFile(files, path)
	if !ok || !f.Untracked || path == ".gitignore" || strings.ContainsAny(path, "\r\n") {
		return Result{}, errors.New("只支持忽略普通未跟踪文件；不会取消跟踪已有文件")
	}
	fs, err := os.OpenRoot(e.root)
	if err != nil {
		return Result{}, err
	}
	defer fs.Close()
	mode := os.FileMode(0644)
	info, err := fs.Lstat(".gitignore")
	if err == nil {
		if !info.Mode().IsRegular() || info.Size() > 1<<20 {
			return Result{}, errors.New(".gitignore 不是普通小型文本文件，请手动编辑")
		}
		mode = info.Mode().Perm()
	} else if !os.IsNotExist(err) {
		return Result{}, err
	}
	before, err := fs.ReadFile(".gitignore")
	if err != nil && !os.IsNotExist(err) {
		return Result{}, err
	}
	if !utf8.Valid(before) || strings.Contains(string(before), "\x00") {
		return Result{}, errors.New(".gitignore 编码无法安全编辑")
	}
	rule := "/" + strings.NewReplacer("\\", "\\\\", "*", "\\*", "?", "\\?", "[", "\\[", "]", "\\]", "!", "\\!", "#", "\\#", " ", "\\ ").Replace(filepath.ToSlash(path))
	text := string(before)
	if text != "" && !strings.HasSuffix(text, "\n") {
		text += "\n"
	}
	text += rule + "\n"
	temp := ".sakuragit-ignore-" + rand.Text()
	file, err := fs.OpenFile(temp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		return Result{}, err
	}
	defer fs.Remove(temp)
	if _, err = file.WriteString(text); err != nil {
		file.Close()
		return Result{}, err
	}
	if err = file.Close(); err != nil {
		return Result{}, err
	}
	current, _ := fs.ReadFile(".gitignore")
	if string(current) != string(before) {
		return Result{}, errors.New(".gitignore 已被其他工具修改，请重试")
	}
	if err = fs.Rename(temp, ".gitignore"); err != nil {
		return Result{}, err
	}
	return Result{Output: fmt.Sprintf("已添加 %s；未自动暂存 .gitignore", rule)}, nil
}
