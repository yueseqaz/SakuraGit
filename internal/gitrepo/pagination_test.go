package gitrepo

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

func TestHistoryPagesAndRepositoryWideSearch(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	first := git(t, root, "rev-parse", "HEAD")
	// commit-tree keeps a >250-commit fixture quick without modifying the worktree.
	tree := git(t, root, "rev-parse", "HEAD^{tree}")
	parent := first
	for i := 1; i <= 250; i++ {
		parent = git(t, root, "commit-tree", tree, "-p", parent, "-m", fmt.Sprintf("history entry %03d", i))
	}
	git(t, root, "update-ref", "refs/heads/main", parent)
	git(t, root, "branch", "other", first)
	s, err := e.Snapshot(ctx, root)
	if err != nil || len(s.Commits) != 100 || !s.HistoryHasMore || s.HistoryRevision == "" {
		t.Fatalf("snapshot: %+v %v", s, err)
	}
	seen := map[string]bool{}
	for _, c := range s.Commits {
		seen[c.Hash] = true
	}
	offset := 100
	for {
		page, err := e.History(ctx, root, "", s.HistoryRevision, offset)
		if err != nil {
			t.Fatal(err)
		}
		for _, c := range page.Commits {
			if seen[c.Hash] {
				t.Fatalf("duplicate commit %s", c.Hash)
			}
			seen[c.Hash] = true
		}
		if page.NextOffset != offset+len(page.Commits) {
			t.Fatal("invalid offset")
		}
		offset = page.NextOffset
		if !page.HasMore {
			break
		}
	}
	if len(seen) != 251 || !seen[first] {
		t.Fatalf("missing older commits: %d", len(seen))
	}
	for _, query := range []string{"INITIAL", first[:12], "SAKURAGIT@EXAMPLE.INVALID", "SakuraGit Test"} {
		page, err := e.History(ctx, root, query, "", 0)
		if err != nil || len(page.Commits) == 0 {
			t.Fatalf("search %q: %+v %v", query, page, err)
		}
		if query == "INITIAL" && page.Commits[0].Hash != first {
			t.Fatal("did not search beyond first page")
		}
	}
	page, err := e.History(ctx, root, "history entry", "", 200)
	if err == nil {
		t.Fatal("accepted unversioned pagination")
	}
	page, err = e.History(ctx, root, "history entry", s.HistoryRevision, 200)
	if err != nil || len(page.Commits) != 50 || page.HasMore {
		t.Fatalf("search page: %+v %v", page, err)
	}
	missing, err := e.History(ctx, root, "not-present-anywhere", "", 0)
	if err != nil || len(missing.Commits) != 0 || missing.HasMore {
		t.Fatalf("missing: %+v %v", missing, err)
	}
	write(t, root, "hello.txt", "worktree-only edit\n")
	same, err := e.Snapshot(ctx, root)
	if err != nil || same.HistoryRevision != s.HistoryRevision {
		t.Fatal("worktree edit invalidated history")
	}
	git(t, root, "stash", "push", "-m", "private stash")
	all, err := e.History(ctx, root, "private stash", "", 0)
	if err != nil || len(all.Commits) != 0 {
		t.Fatal("stash leaked into history")
	}
	git(t, root, "branch", "new-tip", first)
	if _, err = e.History(ctx, root, "", s.HistoryRevision, 100); err == nil || !strings.Contains(err.Error(), "已变化") {
		t.Fatalf("stale page accepted: %v", err)
	}
	if _, err = e.History(ctx, root+"/wrong", "", "", 0); err == nil {
		t.Fatal("accepted stale repository")
	}
}

func TestHistoryEmptyAndDetached(t *testing.T) {
	e, root := fixture(t, false)
	ctx := context.Background()
	page, err := e.History(ctx, root, "", "", 0)
	if err != nil || len(page.Commits) != 0 || page.HasMore {
		t.Fatalf("unborn: %+v %v", page, err)
	}
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "first")
	git(t, root, "branch", "same-tip")
	before, err := e.History(ctx, root, "", "", 0)
	if err != nil {
		t.Fatal(err)
	}
	git(t, root, "checkout", "same-tip")
	after, err := e.History(ctx, root, "", "", 0)
	if err != nil || before.Revision == after.Revision {
		t.Fatal("HEAD decoration change did not invalidate history")
	}
	git(t, root, "checkout", "--detach")
	git(t, root, "commit", "--allow-empty", "-m", "detached commit")
	page, err = e.History(ctx, root, "detached commit", "", 0)
	if err != nil || len(page.Commits) != 1 {
		t.Fatalf("detached: %+v %v", page, err)
	}
}
