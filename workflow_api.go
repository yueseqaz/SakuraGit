package main

import (
	"context"
	"errors"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/egoist/mygo"
	"github.com/yueseqaz/SakuraGit/internal/gitrepo"
)

func (g *Git) Workflow(ctx context.Context, root string) (gitrepo.WorkflowInfo, error) {
	return g.engine.Workflow(ctx, root)
}
func (g *Git) WorkflowAction(ctx context.Context, root, action, name, target, revision string) (gitrepo.Result, error) {
	return withOperation(g, ctx, action, false, func(ctx context.Context) (gitrepo.Result, error) {
		return g.engine.WorkflowAction(ctx, root, action, name, target, revision)
	})
}
func (g *Git) IgnoreFile(ctx context.Context, root, path, revision string) (gitrepo.Result, error) {
	return withOperation(g, ctx, "ignore", false, func(ctx context.Context) (gitrepo.Result, error) {
		return g.engine.IgnoreFile(ctx, root, path, revision)
	})
}
func (g *Git) OpenDevelopmentPath(ctx context.Context, root, path, action, editor string) error {
	resolved, err := g.engine.DevelopmentPath(ctx, root, path)
	if err != nil {
		return err
	}
	if action == "copy" {
		return g.CopyText(resolved)
	}
	if action == "reveal" {
		mygo.Shell.ShowItemInFolder(resolved)
		return nil
	}
	if action == "folder" && path == "" {
		return mygo.Shell.OpenPath(resolved)
	}
	if action == "terminal" && path == "" {
		return g.openRepositoryTerminal(ctx, resolved)
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	var cmd *exec.Cmd
	if action == "editor" {
		apps := map[string]string{"vscode": "Visual Studio Code", "cursor": "Cursor", "zed": "Zed", "textedit": "TextEdit"}
		app, ok := apps[editor]
		if !ok {
			return errors.New("请选择支持的编辑器")
		}
		if runtime.GOOS == "darwin" {
			cmd = exec.CommandContext(ctx, "open", "-a", app, "--", resolved)
		} else {
			bins := map[string]string{"vscode": "code", "cursor": "cursor", "zed": "zed"}
			bin, ok := bins[editor]
			if !ok {
				return errors.New("此编辑器只支持 macOS")
			}
			cmd = exec.CommandContext(ctx, bin, "--", resolved)
		}
	} else {
		return errors.New("不支持的桌面操作")
	}
	output, err := cmd.CombinedOutput()
	if err != nil {
		return errors.New("无法启动所选应用，请确认已安装并配置命令行入口：" + strings.TrimSpace(string(output)))
	}
	return nil
}
