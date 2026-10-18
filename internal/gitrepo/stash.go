package gitrepo

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"
)

// Git stash builds internal pathspecs; inheriting --literal-pathspecs breaks -u cleanup.
// No stash endpoint accepts user-provided pathspecs.
func (e *Engine) runStash(ctx context.Context, args ...string) (string, error) {
	return run(ctx, e.root, append([]string{"--no-literal-pathspecs", "stash"}, args...)...)
}

func (e *Engine) stashes(ctx context.Context) ([]Stash, error) {
	raw, err := e.runStash(ctx, "list", "--format=%gd%x00%H%x00%gs%x00%cI")
	result := []Stash{}
	if err != nil {
		return result, err
	}
	for _, line := range strings.Split(strings.TrimSuffix(raw, "\n"), "\n") {
		f := strings.SplitN(line, "\x00", 4)
		if len(f) == 4 {
			result = append(result, Stash{Ref: f[0], Hash: f[1], Subject: f[2], Date: f[3]})
		}
	}
	return result, nil
}

func (e *Engine) SaveStash(ctx context.Context, root, message string, untracked bool) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	if strings.TrimSpace(message) == "" || len(message) > 1000 || strings.ContainsAny(message, "\r\n\x00") {
		return Result{}, errors.New("请填写单行现场说明（不超过 1000 字节）")
	}
	s, err := e.snapshot(ctx)
	if err != nil {
		return Result{}, err
	}
	if s.Unborn || s.State != "" {
		return Result{}, errors.New("请先完成首次提交，并退出正在进行的 Git 操作")
	}
	available := false
	for _, f := range s.Files {
		if f.Conflicted {
			return Result{}, errors.New("请先解决当前冲突")
		}
		available = available || !f.Untracked || untracked
	}
	if !available {
		return Result{}, errors.New("没有可保存的修改；如需保存新增文件，请勾选包含未跟踪文件")
	}
	args := []string{"push", "-m", message}
	if untracked {
		args = append(args, "--include-untracked")
	}
	out, err := e.runStash(ctx, args...)
	if err == nil {
		after, readErr := e.stashes(ctx)
		if readErr != nil {
			err = readErr
		} else if len(after) <= len(s.Stashes) {
			err = errors.New("Git 没有创建新的 Stash。子模块内部修改需要在子模块中单独保存")
		}
	}
	e.record("保存工作现场", out, err)
	return Result{Output: out}, err
}

func (e *Engine) findStash(ctx context.Context, hash, ref string) (Stash, error) {
	if !hashPattern.MatchString(hash) {
		return Stash{}, errors.New("无效的 Stash ID")
	}
	items, err := e.stashes(ctx)
	if err != nil {
		return Stash{}, err
	}
	for _, item := range items {
		if item.Hash == hash && (ref == "" || ref == item.Ref) {
			return item, nil
		}
	}
	return Stash{}, errors.New("Stash 列表已变化，请刷新后重新选择")
}

func (e *Engine) StashDiff(ctx context.Context, root, hash string) (Diff, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Diff{}, err
	}
	if _, err := e.findStash(ctx, hash, ""); err != nil {
		return Diff{}, err
	}
	text, err := e.runStash(ctx, "show", "--patch", "--include-untracked", "--no-ext-diff", "--no-textconv", hash, "--")
	d := Diff{Path: hash, Text: text, Hunks: []Hunk{}}
	if !utf8.ValidString(text) {
		d.Binary = true
		d.Text = ""
	}
	return d, err
}

func (e *Engine) RestoreStash(ctx context.Context, root, hash string, restoreIndex bool) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	if _, err := e.findStash(ctx, hash, ""); err != nil {
		return Result{}, err
	}
	s, err := e.snapshot(ctx)
	if err != nil {
		return Result{}, err
	}
	if len(s.Files) > 0 || s.State != "" {
		return Result{}, errors.New("恢复前请先提交或保存当前工作区，避免混合两份修改")
	}
	args := []string{"apply"}
	if restoreIndex {
		args = append(args, "--index")
	}
	args = append(args, hash)
	out, err := e.runStash(ctx, args...)
	e.record("恢复工作现场（保留记录）", out, err)
	if err != nil {
		return Result{}, errors.New("恢复未完整完成，可能已产生部分修改或冲突。原 Stash 保留，请检查工作区；不要直接重复恢复。\n" + err.Error())
	}
	return Result{Output: out}, nil
}

func (e *Engine) DropStash(ctx context.Context, root, hash, ref string) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	if ref == "" {
		return Result{}, errors.New("请选择要删除的 Stash")
	}
	item, err := e.findStash(ctx, hash, ref)
	if err != nil {
		return Result{}, err
	}
	out, err := e.runStash(ctx, "drop", item.Ref)
	e.record("删除工作现场", item.Subject+"\n"+out, err)
	return Result{Output: out}, err
}
