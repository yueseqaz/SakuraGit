package main

import (
	"context"
	"github.com/yueseqaz/SakuraGit/internal/gitrepo"
)

func (g *Git) StageLines(ctx context.Context, root, path string, staged bool, revision string, positions []int) (gitrepo.Result, error) {
	return withOperation(g, ctx, "stage-lines", false, func(ctx context.Context) (gitrepo.Result, error) {
		return g.engine.StageLines(ctx, root, path, staged, revision, positions)
	})
}
func (g *Git) Conflict(ctx context.Context, root, path string) (gitrepo.ConflictDetails, error) {
	return g.engine.Conflict(ctx, root, path)
}
func (g *Git) SaveConflict(ctx context.Context, root, path, revision, result string) (gitrepo.Result, error) {
	return withOperation(g, ctx, "resolve", false, func(ctx context.Context) (gitrepo.Result, error) {
		return g.engine.SaveConflict(ctx, root, path, revision, result)
	})
}
func (g *Git) FileBackups(ctx context.Context, root string) ([]gitrepo.FileBackup, error) {
	return g.engine.FileBackups(ctx, root)
}
func (g *Git) RecoveryAction(ctx context.Context, root, action, path, revision string) (gitrepo.Result, error) {
	return withOperation(g, ctx, action, false, func(ctx context.Context) (gitrepo.Result, error) {
		return g.engine.RecoveryAction(ctx, root, action, path, revision)
	})
}
func (g *Git) HistoryAction(ctx context.Context, root, action, hash, revision string) (gitrepo.Result, error) {
	return withOperation(g, ctx, action, false, func(ctx context.Context) (gitrepo.Result, error) {
		return g.engine.HistoryAction(ctx, root, action, hash, revision)
	})
}
