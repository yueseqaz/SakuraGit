package main

import (
	"context"
	"fmt"

	"github.com/egoist/mygo"
	"github.com/yueseqaz/SakuraGit/internal/gitrepo"
)

func (g *Git) EditorDirectory(ctx context.Context, root, path string) (gitrepo.EditorDirectory, error) {
	return g.engine.EditorDirectory(ctx, root, path)
}
func (g *Git) EditorFile(ctx context.Context, root, path string) (gitrepo.EditorFile, error) {
	return g.engine.EditorFile(ctx, root, path)
}
func (g *Git) SaveEditorFile(ctx context.Context, root, path, revision, content string) (gitrepo.EditorFile, error) {
	return withOperation(g, ctx, "保存文件", false, func(ctx context.Context) (gitrepo.EditorFile, error) {
		return g.engine.SaveEditorFile(ctx, root, path, revision, content)
	})
}
func (g *Git) EditorDirty(count int) {
	g.editorDirty.Store(int64(max(0, min(count, 64))))
	g.editorRevision.Add(1)
	g.editorExitApproved.Store(false)
}
func (g *Git) protectEditor(win *mygo.Window, quit bool) bool {
	count := g.editorDirty.Load()
	revision := g.editorRevision.Load()
	if count == 0 || g.editorExitApproved.Load() {
		return false
	}
	if !g.editorPrompt.CompareAndSwap(false, true) {
		return true
	}
	go func() {
		defer g.editorPrompt.Store(false)
		choice, err := mygo.Dialog.Message(mygo.MessageOptions{Parent: win, Type: mygo.MessageWarning,
			Title: "编辑器有未保存内容", Message: fmt.Sprintf("还有 %d 个文件未保存到工作区", count),
			Detail:  "返回编辑器保存，或确认退出。草稿会尽力保存在本机缓存中，但缓存失败时退出会丢失未保存内容；不会自动保存、暂存或提交。",
			Buttons: []string{"返回编辑器", "仍然退出"}, DefaultButton: 0, CancelButton: 0})
		if err != nil || choice.Button != 1 {
			g.exitEditorCanceled()
			return
		}
		if revision != g.editorRevision.Load() {
			g.exitEditorCanceled()
			return
		}
		g.editorExitApproved.Store(true)
		if quit {
			mygo.App.Quit()
		} else if win != nil {
			win.Close()
		}
	}()
	return true
}
func (g *Git) exitEditorCanceled() {
	g.editorExitApproved.Store(false)
	g.operationMu.Lock()
	g.exitApproved = false
	g.operationMu.Unlock()
}
