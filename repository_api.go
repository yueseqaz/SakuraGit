package main

import (
	"context"
	"github.com/egoist/mygo"
	"github.com/yueseqaz/SakuraGit/internal/gitrepo"
)

func (g *Git) ChooseParent(ctx context.Context) (string, error) {
	paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{Parent: mygo.CallerWindow(ctx), Title: "选择文件夹", Directory: true})
	if err != nil || len(paths) == 0 {
		return "", err
	}
	return paths[0], nil
}

func (g *Git) InitializeExisting(ctx context.Context, path string) (gitrepo.Snapshot, error) {
	return withOperation(g, ctx, "initialize", false, func(ctx context.Context) (gitrepo.Snapshot, error) {
		root, err := g.engine.InitializeExisting(ctx, path)
		if err != nil {
			return gitrepo.Snapshot{}, err
		}
		return g.Open(ctx, root)

	})
}
func (g *Git) CreateRepository(ctx context.Context, source, destination string, initialize bool) (gitrepo.Snapshot, error) {
	return withOperation(g, ctx, "initialize", false, func(ctx context.Context) (gitrepo.Snapshot, error) {
		path, err := g.engine.CreateRepository(ctx, source, destination, initialize)
		if err != nil {
			return gitrepo.Snapshot{}, err
		}
		return g.Open(ctx, path)

	})
}
func (g *Git) CloneRepository(ctx context.Context, source, destination, branch string, singleBranch bool, id string) (gitrepo.Snapshot, error) {
	return withOperation(g, ctx, "clone", true, func(ctx context.Context) (gitrepo.Snapshot, error) {
		path, err := g.engine.CloneRepository(ctx, id, source, destination, branch, singleBranch)
		if err != nil {
			return gitrepo.Snapshot{}, err
		}
		return g.Open(ctx, path)

	})
}
func (g *Git) CloneProgress(id string) (gitrepo.CloneProgress, error) {
	return g.engine.CloneProgress(id)
}
func (g *Git) CancelClone(id string) error {
	return g.engine.CancelClone(id)
}
func (g *Git) RemoteBranches(ctx context.Context, source string) (gitrepo.RemoteBranches, error) {
	return g.engine.RemoteBranches(ctx, source)
}
func (g *Git) History(ctx context.Context, root, query, revision string, offset int) (gitrepo.HistoryPage, error) {
	return g.engine.History(ctx, root, query, revision, offset)
}
func (g *Git) StageHunk(ctx context.Context, root, path string, staged bool, revision string, id int) (gitrepo.Result, error) {
	return withOperation(g, ctx, "stage-hunk", false, func(ctx context.Context) (gitrepo.Result, error) {
		return g.engine.StageHunk(ctx, root, path, staged, revision, id)

	})
}
func (g *Git) SaveStash(ctx context.Context, root, message string, untracked bool) (gitrepo.Result, error) {
	return withOperation(g, ctx, "stash-save", false, func(ctx context.Context) (gitrepo.Result, error) {
		return g.engine.SaveStash(ctx, root, message, untracked)

	})
}
func (g *Git) RestoreStash(ctx context.Context, root, hash string, restoreIndex bool) (gitrepo.Result, error) {
	return withOperation(g, ctx, "stash-restore", false, func(ctx context.Context) (gitrepo.Result, error) {
		return g.engine.RestoreStash(ctx, root, hash, restoreIndex)

	})
}
func (g *Git) DropStash(ctx context.Context, root, hash, ref string) (gitrepo.Result, error) {
	return withOperation(g, ctx, "stash-drop", false, func(ctx context.Context) (gitrepo.Result, error) {
		return g.engine.DropStash(ctx, root, hash, ref)

	})
}
func (g *Git) StashDiff(ctx context.Context, root, hash string) (gitrepo.Diff, error) {
	return g.engine.StashDiff(ctx, root, hash)
}
func (g *Git) Remotes(ctx context.Context, root string) ([]gitrepo.RemoteInfo, error) {
	return g.engine.Remotes(ctx, root)
}
func (g *Git) ManageRemote(ctx context.Context, root, action, name, address, revision string) (gitrepo.Result, error) {
	return withOperation(g, ctx, "remote-config", false, func(ctx context.Context) (gitrepo.Result, error) {
		return g.engine.ManageRemote(ctx, root, action, name, address, revision)

	})
}
func (g *Git) Diagnostics(ctx context.Context, root string) (gitrepo.Diagnostics, error) {
	return g.engine.Diagnostics(ctx, root)
}
func (g *Git) SetIdentity(ctx context.Context, root, name, email string) (gitrepo.Result, error) {
	return withOperation(g, ctx, "identity", false, func(ctx context.Context) (gitrepo.Result, error) {
		return g.engine.SetIdentity(ctx, root, name, email)

	})
}
func (g *Git) ChangeToken(ctx context.Context, root string) (string, error) {
	return g.engine.ChangeToken(ctx, root)
}
