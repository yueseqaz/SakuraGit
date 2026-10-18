package gitrepo

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func git(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	cmd.Env = append(os.Environ(), "GIT_CONFIG_NOSYSTEM=1", "GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_AUTHOR_NAME=Gitlane Test", "GIT_AUTHOR_EMAIL=gitlane@example.invalid", "GIT_COMMITTER_NAME=Gitlane Test", "GIT_COMMITTER_EMAIL=gitlane@example.invalid", "GIT_TERMINAL_PROMPT=0")
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

func fixture(t *testing.T, committed bool) (*Engine, string) {
	t.Helper()
	root := t.TempDir()
	git(t, root, "init", "-b", "main")
	git(t, root, "config", "user.name", "Gitlane Test")
	git(t, root, "config", "user.email", "gitlane@example.invalid")
	git(t, root, "config", "commit.gpgsign", "false")
	write(t, root, "hello.txt", "hello\n")
	if committed {
		git(t, root, "add", ".")
		git(t, root, "commit", "-m", "initial")
	}
	e := &Engine{}
	s, err := e.Open(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	return e, s.Root
}

func write(t *testing.T, root, path, content string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, path), []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
}

func TestWorkingTreeLifecycle(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	write(t, root, "hello.txt", "hello\nnew line\n")
	s, err := e.Snapshot(ctx, root)
	if err != nil || len(s.Files) != 1 || s.Files[0].Worktree != "M" {
		t.Fatalf("snapshot: %+v %v", s, err)
	}
	d, err := e.Diff(ctx, root, "hello.txt", false)
	if err != nil || !strings.Contains(d.Text, "+new line") {
		t.Fatalf("diff: %+v %v", d, err)
	}
	if _, err := e.Stage(ctx, root, []string{"hello.txt"}, true); err != nil {
		t.Fatal(err)
	}
	if _, err := e.Commit(ctx, root, "add a line"); err != nil {
		t.Fatal(err)
	}
	s, err = e.Snapshot(ctx, root)
	if err != nil || len(s.Files) != 0 || len(s.Commits) != 2 || s.Commits[0].Subject != "add a line" {
		t.Fatalf("after commit: %+v %v", s, err)
	}
	if _, err := e.Branch(ctx, root, "feature/new", true); err != nil {
		t.Fatal(err)
	}
	if _, err := e.Branch(ctx, root, "main", false); err != nil {
		t.Fatal(err)
	}
}

func TestTextContainingBinaryMarkerIsStillText(t *testing.T) {
	e, root := fixture(t, true)
	write(t, root, "hello.txt", "hello\nBinary files should not hide this diff\n")
	d, err := e.Diff(context.Background(), root, "hello.txt", false)
	if err != nil || d.Binary || !strings.Contains(d.Text, "+Binary files") {
		t.Fatalf("text misidentified as binary: %+v %v", d, err)
	}
}

func TestUnbornAndLiteralPaths(t *testing.T) {
	e, root := fixture(t, false)
	ctx := context.Background()
	name := "odd\nfile [1] 中文.txt"
	write(t, root, name, "new file\n")
	write(t, root, "odd1.txt", "must not stage\n")
	if _, err := e.Stage(ctx, root, []string{name}, true); err != nil {
		t.Fatal(err)
	}
	s, err := e.Snapshot(ctx, root)
	if err != nil || !s.Unborn {
		t.Fatalf("unborn: %+v %v", s, err)
	}
	f, ok := findFile(s.Files, name)
	if !ok || f.Index != "A" {
		t.Fatalf("literal file not staged: %+v", s.Files)
	}
	f, _ = findFile(s.Files, "odd1.txt")
	if !f.Untracked {
		t.Fatal("pathspec wildcard staged another file")
	}
	if _, err := e.Stage(ctx, root, []string{name}, false); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(root, name)); err != nil {
		t.Fatal("unstage deleted working file", err)
	}
	d, err := e.Diff(ctx, root, name, false)
	if err != nil || !strings.Contains(d.Text, "+new file") {
		t.Fatalf("untracked diff: %+v %v", d, err)
	}
}

func TestRenameAndUnstage(t *testing.T) {
	e, root := fixture(t, true)
	git(t, root, "mv", "hello.txt", "renamed file.txt")
	s, err := e.Snapshot(context.Background(), root)
	if err != nil || len(s.Files) != 1 || s.Files[0].OldPath != "hello.txt" || s.Files[0].Index != "R" {
		t.Fatalf("rename: %+v %v", s, err)
	}
	write(t, root, "renamed file.txt", "hello\n!\n")
	if _, err := e.Stage(context.Background(), root, []string{"renamed file.txt"}, true); err != nil {
		t.Fatal("could not stage additional changes to a staged rename", err)
	}
	if _, err := e.Stage(context.Background(), root, []string{"renamed file.txt"}, false); err != nil {
		t.Fatal(err)
	}
	if got := git(t, root, "diff", "--cached", "--name-only"); got != "" {
		t.Fatalf("unstage left rename staged: %s", got)
	}
}

func TestGuardsAndBinary(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	write(t, root, "binary.dat", "\x00\x01")
	d, err := e.Diff(ctx, root, "binary.dat", false)
	if err != nil || !d.Binary {
		t.Fatalf("binary: %+v %v", d, err)
	}
	if _, err := e.Diff(ctx, root, "../../etc/passwd", false); err == nil {
		t.Fatal("accepted a path absent from git status")
	}
	if _, err := e.Stage(ctx, "stale-root", []string{"binary.dat"}, true); err == nil {
		t.Fatal("accepted stale repository")
	}
	if _, err := e.Branch(ctx, root, "feature", true); err == nil {
		t.Fatal("switched dirty repository")
	}
	if _, err := e.Branch(ctx, root, "--detach", true); err == nil {
		t.Fatal("accepted option as branch")
	}
	if _, err := e.Commit(ctx, root, " "); err == nil {
		t.Fatal("accepted empty message")
	}
	if _, err := e.Sync(ctx, root, "reset"); err == nil {
		t.Fatal("accepted arbitrary action")
	}
	if _, err := e.CommitDiff(ctx, root, "--output=/tmp/evil"); err == nil {
		t.Fatal("accepted invalid commit hash")
	}
	outside := t.TempDir()
	write(t, outside, "secret.txt", "secret content")
	if err := os.Symlink(filepath.Join(outside, "secret.txt"), filepath.Join(root, "link.txt")); err != nil {
		t.Fatal(err)
	}
	d, err = e.Diff(ctx, root, "link.txt", false)
	if err != nil || strings.Contains(d.Text, "secret content") {
		t.Fatalf("followed untracked symlink: %+v %v", d, err)
	}
}

func TestDetachedAndConflict(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	git(t, root, "switch", "--detach")
	s, err := e.Snapshot(ctx, root)
	if err != nil || !s.Detached {
		t.Fatalf("detached: %+v %v", s, err)
	}
	write(t, root, "hello.txt", "detached edit\n")
	_, _ = e.Stage(ctx, root, []string{"hello.txt"}, true)
	if _, err := e.Commit(ctx, root, "detached commit"); err == nil {
		t.Fatal("allowed detached commit")
	}
	e, root = fixture(t, true)
	git(t, root, "switch", "-c", "other")
	write(t, root, "hello.txt", "other\n")
	git(t, root, "commit", "-am", "other")
	git(t, root, "switch", "main")
	write(t, root, "hello.txt", "main\n")
	git(t, root, "commit", "-am", "main")
	_ = exec.Command("git", "-C", root, "merge", "other").Run()
	s, err = e.Snapshot(ctx, root)
	if err != nil || s.State != "merge" || len(s.Files) != 1 || !s.Files[0].Conflicted {
		t.Fatalf("conflict: %+v %v", s, err)
	}
	if _, err := e.Commit(ctx, root, "unresolved"); err == nil {
		t.Fatal("allowed unresolved merge")
	}
}

func TestSyncOnlyPushesCurrentBranch(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	remote := t.TempDir()
	git(t, remote, "init", "--bare")
	git(t, root, "remote", "add", "origin", remote)
	git(t, root, "push", "-u", "origin", "main")
	git(t, root, "branch", "other")
	git(t, root, "push", "origin", "other")
	oldOther := git(t, remote, "rev-parse", "refs/heads/other")
	git(t, root, "switch", "other")
	write(t, root, "hello.txt", "other changes\n")
	git(t, root, "commit", "-am", "other changed")
	git(t, root, "switch", "main")
	write(t, root, "hello.txt", "main changes\n")
	git(t, root, "commit", "-am", "main changed")
	git(t, root, "config", "push.default", "matching")
	if _, err := e.Sync(ctx, root, "push"); err != nil {
		t.Fatal(err)
	}
	if git(t, remote, "rev-parse", "refs/heads/other") != oldOther {
		t.Fatal("push also changed other branch")
	}
	if git(t, remote, "rev-parse", "refs/heads/main") != git(t, root, "rev-parse", "HEAD") {
		t.Fatal("push did not update main")
	}
	if _, err := e.Sync(ctx, root, "fetch"); err != nil {
		t.Fatal(err)
	}
	if _, err := e.Sync(ctx, root, "pull"); err != nil {
		t.Fatal(err)
	}
}

func TestOpenFailurePreservesRepository(t *testing.T) {
	e, root := fixture(t, true)
	if _, err := e.Open(context.Background(), t.TempDir()); err == nil {
		t.Fatal("opened non-repository")
	}
	if _, err := e.Snapshot(context.Background(), root); err != nil {
		t.Fatal("lost previous repository", err)
	}
}

func TestDivergedPullDoesNotRewriteHistory(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	remote := t.TempDir()
	git(t, remote, "init", "--bare")
	git(t, root, "remote", "add", "origin", remote)
	git(t, root, "push", "-u", "origin", "main")
	peer := filepath.Join(t.TempDir(), "peer")
	git(t, root, "clone", "-b", "main", remote, peer)
	write(t, peer, "remote.txt", "remote change\n")
	git(t, peer, "add", ".")
	git(t, peer, "-c", "commit.gpgsign=false", "commit", "-m", "remote change")
	git(t, peer, "push")
	write(t, root, "local.txt", "local change\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "local change")
	head := git(t, root, "rev-parse", "HEAD")
	git(t, root, "config", "pull.rebase", "true")
	if _, err := e.Sync(ctx, root, "fetch"); err != nil {
		t.Fatal(err)
	}
	s, err := e.Snapshot(ctx, root)
	if err != nil || s.Ahead != 1 || s.Behind != 1 {
		t.Fatalf("diverged snapshot: %+v %v", s, err)
	}
	if _, err := e.Sync(ctx, root, "pull"); err == nil {
		t.Fatal("accepted diverged pull")
	}
	if git(t, root, "rev-parse", "HEAD") != head {
		t.Fatal("rewrote local history")
	}
	s, err = e.Snapshot(ctx, root)
	if err != nil || s.State != "" || len(s.Files) != 0 {
		t.Fatalf("pull left a merge/rebase or changed working tree: %+v %v", s, err)
	}
}

func TestWorktreeAndPartialStaging(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	linked := filepath.Join(t.TempDir(), "linked worktree")
	git(t, root, "worktree", "add", "-b", "feature/linked", linked)
	write(t, root, "hello.txt", "hello\nstaged\n")
	if _, err := e.Stage(ctx, root, []string{"hello.txt"}, true); err != nil {
		t.Fatal(err)
	}
	write(t, root, "hello.txt", "hello\nstaged\nunstaged\n")
	s, err := e.Snapshot(ctx, root)
	if err != nil || len(s.Worktrees) != 2 || len(s.Files) != 1 || s.Files[0].Index != "M" || s.Files[0].Worktree != "M" {
		t.Fatalf("partial staging/worktree: %+v %v", s, err)
	}
	staged, err := e.Diff(ctx, root, "hello.txt", true)
	if err != nil || strings.Contains(staged.Text, "+unstaged") || !strings.Contains(staged.Text, "+staged") {
		t.Fatalf("staged diff mixed in working changes: %+v %v", staged, err)
	}
	if _, err := e.Commit(ctx, root, "only staged"); err != nil {
		t.Fatal(err)
	}
	if content := git(t, root, "show", "HEAD:hello.txt"); strings.Contains(content, "unstaged") {
		t.Fatal("commit included unstaged content")
	}
}
