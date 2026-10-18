package gitrepo

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCommitDetailsAndFileDiff(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	initial := git(t, root, "rev-parse", "HEAD")
	d, err := e.CommitDetails(ctx, root, initial)
	if err != nil || len(d.Files) != 1 || d.Files[0].Additions != 1 || d.Commit.AuthorEmail != "sakuragit@example.invalid" {
		t.Fatalf("root: %+v %v", d, err)
	}
	renamed := fixtureFilename("new\nname.txt")
	if err := os.Rename(filepath.Join(root, "hello.txt"), filepath.Join(root, renamed)); err != nil {
		t.Fatal(err)
	}
	write(t, root, "binary.dat", "\x00\x01binary")
	git(t, root, "add", ".")
	git(t, root, "commit", "--author=Original Author <original@example.invalid>", "-m", "rename", "-m", "Detailed body\nwith another line")
	hash := git(t, root, "rev-parse", "HEAD")
	d, err = e.CommitDetails(ctx, root, hash)
	if err != nil || len(d.Files) != 2 || d.Commit.Author != "Original Author" || d.Committer != "SakuraGit Test" || !strings.Contains(d.Body, "another line") {
		t.Fatalf("details: %+v %v", d, err)
	}
	for _, f := range d.Files {
		patch, err := e.CommitFileDiff(ctx, root, hash, f.Path)
		if err != nil {
			t.Fatal(err)
		}
		if f.Path == "binary.dat" && (!patch.Binary || patch.Text != "") {
			t.Fatalf("binary: %+v", patch)
		}
		if f.Path == renamed && (f.OldPath != "hello.txt" || !strings.Contains(patch.Text, "rename from")) {
			t.Fatalf("rename: %+v %+v", f, patch)
		}
	}
	if _, err = e.CommitFileDiff(ctx, root, hash, "../private"); err == nil {
		t.Fatal("accepted unrelated path")
	}
	if _, err = e.CommitDetails(ctx, root, "--all"); err == nil {
		t.Fatal("accepted option")
	}
}

func TestMergeDetailsCompareFirstParent(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	git(t, root, "checkout", "-b", "topic")
	write(t, root, "topic.txt", "topic\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "topic")
	git(t, root, "checkout", "main")
	write(t, root, "main.txt", "main\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "main")
	git(t, root, "merge", "--no-ff", "topic", "-m", "merge")
	hash := git(t, root, "rev-parse", "HEAD")
	d, err := e.CommitDetails(ctx, root, hash)
	if err != nil || len(d.Commit.Parents) != 2 || len(d.Files) != 1 || d.Files[0].Path != "topic.txt" {
		t.Fatalf("merge: %+v %v", d, err)
	}
	patch, err := e.CommitFileDiff(ctx, root, hash, "topic.txt")
	if err != nil || !strings.Contains(patch.Text, "+topic") {
		t.Fatalf("merge patch: %+v %v", patch, err)
	}
}

func TestPublishOnlyCurrentBranch(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	remote := t.TempDir()
	git(t, remote, "init", "--bare")
	git(t, root, "remote", "add", "origin", remote)
	git(t, root, "branch", "unrelated")
	git(t, root, "tag", "unrelated-tag")
	git(t, root, "config", "push.default", "matching")
	git(t, root, "config", "push.followTags", "true")
	for _, bad := range []string{"--all", "bad..branch", "bad:branch"} {
		if _, err := e.Publish(ctx, root, "origin", bad); err == nil {
			t.Fatalf("accepted %q", bad)
		}
	}
	if _, err := e.Publish(ctx, root, "missing", "main"); err == nil {
		t.Fatal("accepted missing remote")
	}
	if _, err := e.Publish(ctx, root, "origin", "feature/first"); err != nil {
		t.Fatal(err)
	}
	refs := git(t, remote, "for-each-ref", "--format=%(refname)")
	if refs != "refs/heads/feature/first" {
		t.Fatalf("unexpected pushed refs: %s", refs)
	}
	s, err := e.Snapshot(ctx, root)
	if err != nil || s.Upstream != "origin/feature/first" {
		t.Fatalf("upstream %+v %v", s, err)
	}
	if _, err := e.Publish(ctx, root, "origin", "another"); err == nil {
		t.Fatal("allowed replacing upstream")
	}
}

func TestPublishRejectsDivergedRemoteAndSpecialStates(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	remote := t.TempDir()
	git(t, remote, "init", "--bare")
	git(t, root, "remote", "add", "origin", remote)
	_, other := fixture(t, true)
	write(t, other, "remote.txt", "remote\n")
	git(t, other, "add", ".")
	git(t, other, "commit", "-m", "remote change")
	git(t, other, "push", remote, "HEAD:refs/heads/main")
	original := git(t, remote, "rev-parse", "refs/heads/main")
	write(t, root, "local.txt", "local\n")
	git(t, root, "add", ".")
	git(t, root, "commit", "-m", "local change")
	if _, err := e.Publish(ctx, root, "origin", "main"); err == nil {
		t.Fatal("allowed diverged push")
	}
	if got := git(t, remote, "rev-parse", "refs/heads/main"); got != original {
		t.Fatal("remote changed on rejection")
	}
	s, err := e.Snapshot(ctx, root)
	if err != nil || s.Upstream != "" {
		t.Fatalf("failed publish established tracking: %+v %v", s, err)
	}
	git(t, root, "checkout", "--detach")
	if _, err := e.Publish(ctx, root, "origin", "new"); err == nil {
		t.Fatal("accepted detached HEAD")
	}
	unborn, path := fixture(t, false)
	git(t, path, "remote", "add", "origin", remote)
	if _, err := unborn.Publish(ctx, path, "origin", "new"); err == nil {
		t.Fatal("accepted unborn branch")
	}
}
