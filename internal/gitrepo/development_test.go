package gitrepo

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestConfirmedSyncUsesExactDestination(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	remote := t.TempDir()
	git(t, remote, "init", "--bare")
	git(t, root, "remote", "add", "team/origin", remote)
	git(t, root, "push", "-u", "team/origin", "HEAD:refs/heads/release/next")
	s, err := e.Snapshot(ctx, root)
	if err != nil || s.UpstreamRemote != "team/origin" || s.UpstreamBranch != "release/next" {
		t.Fatalf("wrong real destination: %+v %v", s, err)
	}
	write(t, root, "hello.txt", "ready to push\n")
	git(t, root, "commit", "-am", "next")
	for _, action := range []string{"push", "pull"} {
		if _, err := e.SyncConfirmed(ctx, root, action, "main", "team/origin", "main"); err == nil {
			t.Fatal("accepted a different target", action)
		}
		if _, err := e.SyncConfirmed(ctx, root, action, "another", "team/origin", "release/next"); err == nil {
			t.Fatal("accepted a different source", action)
		}
	}
	if _, err := e.SyncConfirmed(ctx, root, "push", "main", "team/origin", "release/next"); err != nil {
		t.Fatal(err)
	}
	if git(t, remote, "rev-parse", "refs/heads/release/next") != git(t, root, "rev-parse", "HEAD") {
		t.Fatal("did not update confirmed destination")
	}
	if _, err := e.SyncConfirmed(ctx, root, "pull", "main", "team/origin", "release/next"); err != nil {
		t.Fatal("explicit pull target failed", err)
	}
	git(t, root, "config", "branch.main.merge", "refs/heads/different")
	if _, err := e.SyncConfirmed(ctx, root, "push", "main", "team/origin", "release/next"); err == nil {
		t.Fatal("accepted changed upstream config")
	}
}

func TestSnapshotResolvesLocalUpstream(t *testing.T) {
	e, root := fixture(t, true)
	git(t, root, "branch", "local-target")
	git(t, root, "branch", "--set-upstream-to=local-target", "main")
	s, err := e.Snapshot(context.Background(), root)
	if err != nil || s.UpstreamRemote != "." || s.UpstreamBranch != "local-target" {
		t.Fatalf("local upstream: %+v %v", s, err)
	}
}

func TestHunkStagingPreservesWorktree(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	var lines []string
	for i := 1; i <= 60; i++ {
		lines = append(lines, fmt.Sprintf("line %d\n", i))
	}
	base := strings.Join(lines, "")
	write(t, root, "hello.txt", base)
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "lines")
	edited := strings.ReplaceAll(strings.ReplaceAll(base, "line 2\n", "first edit\n"), "line 55\n", "second edit\n")
	write(t, root, "hello.txt", edited)
	d, err := e.Diff(ctx, root, "hello.txt", false)
	if err != nil || len(d.Hunks) != 2 || d.Revision == "" {
		t.Fatalf("hunks %+v %v", d, err)
	}
	if _, err := e.StageHunk(ctx, root, "hello.txt", false, d.Revision, 0); err != nil {
		t.Fatal(err)
	}
	index := git(t, root, "show", ":hello.txt")
	if !strings.Contains(index, "first edit") || strings.Contains(index, "second edit") {
		t.Fatalf("wrong index: %s", index)
	}
	work, _ := os.ReadFile(filepath.Join(root, "hello.txt"))
	if string(work) != edited {
		t.Fatal("worktree changed")
	}
	if _, err := e.StageHunk(ctx, root, "hello.txt", false, d.Revision, 1); err == nil {
		t.Fatal("accepted stale patch")
	}
	staged, err := e.Diff(ctx, root, "hello.txt", true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.StageHunk(ctx, root, "hello.txt", true, staged.Revision, 0); err != nil {
		t.Fatal(err)
	}
	if got := git(t, root, "show", ":hello.txt"); got != strings.TrimSpace(base) {
		t.Fatal("unstage failed")
	}
	work, _ = os.ReadFile(filepath.Join(root, "hello.txt"))
	if string(work) != edited {
		t.Fatal("unstage modified worktree")
	}
}

func TestHunkRejectsChangedContentAndUnsupportedFiles(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	write(t, root, "hello.txt", "edited without newline")
	d, err := e.Diff(ctx, root, "hello.txt", false)
	if err != nil {
		t.Fatal(err)
	}
	write(t, root, "hello.txt", "different content")
	if _, err := e.StageHunk(ctx, root, "hello.txt", false, d.Revision, 0); err == nil {
		t.Fatal("accepted stale worktree")
	}
	d, _ = e.Diff(ctx, root, "hello.txt", false)
	if _, err := e.StageHunk(ctx, root, "hello.txt", false, d.Revision, 0); err != nil {
		t.Fatal(err)
	}
	if got := git(t, root, "show", ":hello.txt"); got != "different content" {
		t.Fatal(got)
	}
	write(t, root, "new.txt", "new\n")
	d, _ = e.Diff(ctx, root, "new.txt", false)
	if len(d.Hunks) != 0 || d.Revision != "" {
		t.Fatal("exposed untracked hunk")
	}
	if _, err := e.StageHunk(ctx, root, "new.txt", false, "made-up", 0); err == nil {
		t.Fatal("accepted arbitrary token")
	}
}

func TestStashLifecycleAndStaleReference(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	write(t, root, "hello.txt", "staged\n")
	git(t, root, "add", "hello.txt")
	write(t, root, "hello.txt", "staged\nunstaged\n")
	write(t, root, "new.txt", "new\n")
	if _, err := e.SaveStash(ctx, root, "first task", true); err != nil {
		t.Fatal(err)
	}
	s, err := e.Snapshot(ctx, root)
	if err != nil || len(s.Files) != 0 || len(s.Stashes) != 1 {
		t.Fatalf("stash %+v %v", s, err)
	}
	first := s.Stashes[0]
	patch, err := e.StashDiff(ctx, root, first.Hash)
	if err != nil || !strings.Contains(patch.Text, "+unstaged") || !strings.Contains(patch.Text, "+new") {
		t.Fatalf("stash patch %+v %v", patch, err)
	}
	write(t, root, "hello.txt", "another task\n")
	if _, err := e.SaveStash(ctx, root, "second task", false); err != nil {
		t.Fatal(err)
	}
	if _, err := e.DropStash(ctx, root, first.Hash, first.Ref); err == nil {
		t.Fatal("dropped wrong stash after index shifted")
	}
	if _, err := e.RestoreStash(ctx, root, first.Hash, true); err != nil {
		t.Fatal(err)
	}
	if got := git(t, root, "show", ":hello.txt"); got != "staged" {
		t.Fatalf("index not restored: %s", got)
	}
	s, _ = e.Snapshot(ctx, root)
	if len(s.Stashes) != 2 || len(s.Files) != 2 {
		t.Fatalf("restore lost stash/work: %+v", s)
	}
	if _, err := e.RestoreStash(ctx, root, first.Hash, false); err == nil {
		t.Fatal("allowed dirty restore")
	}
	if _, err := e.DropStash(ctx, root, first.Hash, "stash@{1}"); err != nil {
		t.Fatal(err)
	}
}

func TestStashConflictKeepsOriginal(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	write(t, root, "hello.txt", "stash version\n")
	e.SaveStash(ctx, root, "conflict test", false)
	s, _ := e.Snapshot(ctx, root)
	hash := s.Stashes[0].Hash
	write(t, root, "hello.txt", "different committed version\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "other task")
	if _, err := e.RestoreStash(ctx, root, hash, false); err == nil {
		t.Fatal("expected conflict")
	}
	s, err := e.Snapshot(ctx, root)
	if err != nil || len(s.Stashes) != 1 || len(s.Files) != 1 || !s.Files[0].Conflicted {
		t.Fatalf("conflict %+v %v", s, err)
	}
	if _, err := e.SaveStash(ctx, root, "conflicted", true); err == nil {
		t.Fatal("accepted unresolved conflict")
	}
}

func TestCreateRepositoriesNeverOverwrite(t *testing.T) {
	e, source := fixture(t, true)
	ctx := context.Background()
	parent := t.TempDir()
	dest := filepath.Join(parent, "clone with spaces")
	if _, err := e.CreateRepository(ctx, source, dest, false); err != nil {
		t.Fatal(err)
	}
	if got := git(t, dest, "log", "-1", "--format=%s"); got != "initial" {
		t.Fatal(got)
	}
	write(t, dest, "keep.txt", "keep")
	if _, err := e.CreateRepository(ctx, source, dest, false); err == nil {
		t.Fatal("overwrote existing destination")
	}
	if data, _ := os.ReadFile(filepath.Join(dest, "keep.txt")); string(data) != "keep" {
		t.Fatal("lost existing content")
	}
	init := filepath.Join(parent, "new-project")
	if _, err := e.CreateRepository(ctx, "", init, true); err != nil {
		t.Fatal(err)
	}
	s, err := e.Open(ctx, init)
	if err != nil || !s.Unborn || s.Branch != "main" {
		t.Fatalf("init %+v %v", s, err)
	}
}

func TestRemoteManagementAndDiagnostics(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	if _, err := e.ManageRemote(ctx, root, "add", "origin", "https://example.invalid/repo.git", ""); err != nil {
		t.Fatal(err)
	}
	items, _ := e.Remotes(ctx, root)
	if len(items) != 1 {
		t.Fatal(items)
	}
	before := items[0]
	if _, err := e.ManageRemote(ctx, root, "fetch-url", "origin", "git@example.invalid:team/repo.git", before.Revision); err != nil {
		t.Fatal(err)
	}
	if _, err := e.ManageRemote(ctx, root, "remove", "origin", "", before.Revision); err == nil {
		t.Fatal("accepted stale remote revision")
	}
	items, _ = e.Remotes(ctx, root)
	if _, err := e.ManageRemote(ctx, root, "push-url", "origin", "ssh://git@example.invalid/team/other.git", items[0].Revision); err != nil {
		t.Fatal(err)
	}
	items, _ = e.Remotes(ctx, root)
	if items[0].FetchURLs[0] == items[0].PushURLs[0] {
		t.Fatal("push URL did not separate")
	}
	if _, err := e.SetIdentity(ctx, root, "Local Author", "local@example.invalid"); err != nil {
		t.Fatal(err)
	}
	d, err := e.Diagnostics(ctx, root)
	if err != nil || d.Name != "Local Author" || d.Email != "local@example.invalid" || !strings.Contains(d.Version, "git version") {
		t.Fatalf("diagnostics %+v %v", d, err)
	}
	if _, err := e.ManageRemote(ctx, root, "remove", "origin", "", items[0].Revision); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"--upload-pack=bad", "ext::shell command", "https://user:token@example.invalid/repo", "ftp://example.invalid/repo", "git@host:path\nother"} {
		if validateRemoteURL(bad) == nil {
			t.Fatalf("accepted unsafe URL %q", bad)
		}
	}
}

func TestChangeTokenDetectsSameStatusEdits(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	before, _ := e.ChangeToken(ctx, root)
	write(t, root, "hello.txt", "edit one\n")
	first, _ := e.ChangeToken(ctx, root)
	time.Sleep(2 * time.Millisecond)
	write(t, root, "hello.txt", "edit two\n")
	second, _ := e.ChangeToken(ctx, root)
	if before == first || first == second {
		t.Fatal("missed content edits with same Git status")
	}
	again, _ := e.ChangeToken(ctx, root)
	if again != second {
		t.Fatal("unchanged repo token was unstable")
	}
}

func TestStashPreservesLiteralNamesAndDoesNotPolluteHistory(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	write(t, root, "[task].txt", "before\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "literal name")
	write(t, root, "[task].txt", "after\n")
	untracked := fixtureFilename("new\nfile.txt")
	write(t, root, untracked, "untracked\n")
	if _, err := e.SaveStash(ctx, root, "literal paths", true); err != nil {
		t.Fatal(err)
	}
	s, err := e.Snapshot(ctx, root)
	if err != nil || len(s.Files) != 0 || len(s.Commits) != 2 {
		t.Fatalf("stash polluted history or left files: %+v %v", s, err)
	}
	if _, err := e.RestoreStash(ctx, root, s.Stashes[0].Hash, false); err != nil {
		t.Fatal(err)
	}
	for path, want := range map[string]string{"[task].txt": "after\n", untracked: "untracked\n"} {
		got, err := os.ReadFile(filepath.Join(root, path))
		if err != nil || string(got) != want {
			t.Fatalf("%q: %q %v", path, got, err)
		}
	}
}

func TestHunksWithShiftedLineNumbers(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	var lines []string
	for i := 0; i < 70; i++ {
		lines = append(lines, fmt.Sprintf("unique line %d\n", i))
	}
	base := strings.Join(lines, "")
	write(t, root, "hello.txt", base)
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "many lines")
	edited := strings.ReplaceAll(base, "unique line 2\n", "extra A\nextra B\nunique line 2\n")
	edited = strings.ReplaceAll(edited, "unique line 60\n", "replacement\n")
	write(t, root, "hello.txt", edited)
	d, _ := e.Diff(ctx, root, "hello.txt", false)
	if len(d.Hunks) != 2 {
		t.Fatalf("expected 2 hunks: %+v", d)
	}
	if _, err := e.StageHunk(ctx, root, "hello.txt", false, d.Revision, 1); err != nil {
		t.Fatal(err)
	}
	index := git(t, root, "show", ":hello.txt")
	if strings.Contains(index, "extra A") || !strings.Contains(index, "replacement") {
		t.Fatal("wrong second-hunk result")
	}
	d, _ = e.Diff(ctx, root, "hello.txt", false)
	if _, err := e.StageHunk(ctx, root, "hello.txt", false, d.Revision, 0); err != nil {
		t.Fatal(err)
	}
	d, _ = e.Diff(ctx, root, "hello.txt", true)
	if _, err := e.StageHunk(ctx, root, "hello.txt", true, d.Revision, 0); err != nil {
		t.Fatal(err)
	}
	index = git(t, root, "show", ":hello.txt")
	if strings.Contains(index, "extra A") || !strings.Contains(index, "replacement") {
		t.Fatal("unstaging shifted hunk lost other changes")
	}
}

func TestInitializeExistingPreservesProjectAndRejectsNestedRepository(t *testing.T) {
	e := &Engine{}
	ctx := context.Background()
	project := t.TempDir()
	write(t, project, "source.txt", "existing code\n")
	root, err := e.InitializeExisting(ctx, project)
	if err != nil {
		t.Fatal(err)
	}
	s, err := e.Open(ctx, root)
	if err != nil || !s.Unborn || len(s.Files) != 1 {
		t.Fatalf("existing init %+v %v", s, err)
	}
	content, _ := os.ReadFile(filepath.Join(project, "source.txt"))
	if string(content) != "existing code\n" {
		t.Fatal("existing file changed")
	}
	if _, err := e.InitializeExisting(ctx, project); err == nil {
		t.Fatal("reinitialized an existing repository")
	}
	nested := filepath.Join(project, "nested")
	os.Mkdir(nested, 0755)
	if _, err := e.InitializeExisting(ctx, nested); err == nil {
		t.Fatal("initialized inside another repository")
	}
	if _, err := os.Stat(filepath.Join(nested, ".git")); !os.IsNotExist(err) {
		t.Fatal("created nested git metadata")
	}
}
