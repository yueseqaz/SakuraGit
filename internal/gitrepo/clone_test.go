package gitrepo

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRemoteBranchesAndCloneSelection(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	git(t, root, "checkout", "-b", "feature/blue")
	git(t, root, "commit", "--allow-empty", "-m", "blue branch")
	git(t, root, "checkout", "main")
	before := e.root
	branches, err := e.RemoteBranches(ctx, root)
	if err != nil || branches.DefaultBranch != "main" || strings.Join(branches.Branches, ",") != "feature/blue,main" || e.root != before {
		t.Fatalf("branches: %+v %v", branches, err)
	}
	for _, single := range []bool{false, true} {
		destination := filepath.Join(t.TempDir(), "clone")
		path, err := e.CreateRepositoryWithBranch(ctx, root, destination, false, "feature/blue", single)
		if err != nil {
			t.Fatal(err)
		}
		if git(t, path, "branch", "--show-current") != "feature/blue" {
			t.Fatal("wrong checkout")
		}
		refs := git(t, path, "for-each-ref", "--format=%(refname)", "refs/remotes/origin")
		if !strings.Contains(refs, "origin/feature/blue") || strings.Contains(refs, "origin/main") == single {
			t.Fatalf("single=%v: %s", single, refs)
		}
		if _, err = e.CreateRepositoryWithBranch(ctx, root, destination, false, "main", false); err == nil {
			t.Fatal("overwrote target")
		}
	}
	for _, branch := range []string{"--help", "bad\nbranch", "../bad"} {
		destination := filepath.Join(t.TempDir(), "invalid")
		if _, err := e.CreateRepositoryWithBranch(ctx, root, destination, false, branch, false); err == nil {
			t.Fatal("invalid branch accepted")
		}
		if _, err := os.Stat(destination); !os.IsNotExist(err) {
			t.Fatal("created destination for invalid input")
		}
	}
	git(t, root, "tag", "only-a-tag")
	if _, err := e.CreateRepositoryWithBranch(ctx, root, filepath.Join(t.TempDir(), "tag"), false, "only-a-tag", false); err == nil {
		t.Fatal("tag accepted as branch")
	}
	if _, err := e.CreateRepositoryWithBranch(ctx, root, filepath.Join(t.TempDir(), "missing"), false, "not-found", false); err == nil {
		t.Fatal("missing branch accepted")
	}
	if _, err := e.RemoteBranches(ctx, "ext::bad"); err == nil {
		t.Fatal("unsafe protocol accepted")
	}
}

func TestRemoteBranchesEmptyRepository(t *testing.T) {
	e := &Engine{}
	root := t.TempDir()
	git(t, root, "init", "--bare")
	branches, err := e.RemoteBranches(context.Background(), root)
	if err != nil || len(branches.Branches) != 0 || branches.DefaultBranch != "" {
		t.Fatalf("empty: %+v %v", branches, err)
	}
	if _, err := e.RemoteBranches(context.Background(), filepath.Join(root, "missing")); err == nil {
		t.Fatal("missing remote reported as empty")
	}
}
