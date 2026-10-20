package gitrepo

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func positionsMatching(text, prefix string) []int {
	var positions []int
	for i, line := range strings.Split(text, "\n") {
		if strings.HasPrefix(line, prefix) {
			positions = append(positions, i)
		}
	}
	return positions
}

func TestStageSelectedLinesAndUnstagePreserveWorktree(t *testing.T) {
	for _, ending := range []string{"\n", "\r\n", ""} {
		t.Run(strings.ReplaceAll(ending, "\n", "LF"), func(t *testing.T) {
			e, root := fixture(t, true)
			git(t, root, "config", "core.autocrlf", "false")
			before := "alpha\nbeta\ngamma" + ending
			write(t, root, "hello.txt", before)
			git(t, root, "commit", "-am", "line fixture")
			after := "ALPHA\nbeta\nGAMMA" + ending
			write(t, root, "hello.txt", after)
			d, err := e.Diff(context.Background(), root, "hello.txt", false)
			if err != nil {
				t.Fatal(err)
			}
			positions := append(positionsMatching(d.Text, "-alpha"), positionsMatching(d.Text, "+ALPHA")...)
			if _, err = e.StageLines(context.Background(), root, "hello.txt", false, d.Revision, positions); err != nil {
				t.Fatal(err, d.Text)
			}
			if got := git(t, root, "show", ":hello.txt"); got != strings.TrimSpace("ALPHA\nbeta\ngamma"+ending) {
				t.Fatalf("staged unrelated lines: %q", got)
			}
			staged, err := e.Diff(context.Background(), root, "hello.txt", true)
			if err != nil {
				t.Fatal(err)
			}
			positions = append(positionsMatching(staged.Text, "-alpha"), positionsMatching(staged.Text, "+ALPHA")...)
			if _, err = e.StageLines(context.Background(), root, "hello.txt", true, staged.Revision, positions); err != nil {
				t.Fatal(err, staged.Text)
			}
			if got := git(t, root, "show", ":hello.txt"); got != strings.TrimSpace(before) {
				t.Fatalf("unstage changed other lines: %q", got)
			}
			data, _ := os.ReadFile(filepath.Join(root, "hello.txt"))
			if string(data) != after {
				t.Fatal("modified worktree")
			}
			if _, err = e.StageLines(context.Background(), root, "hello.txt", false, d.Revision, []int{0}); err == nil {
				t.Fatal("accepted metadata position")
			}
		})
	}
}

func TestStageLinesMultipleHunksAndIndependentAddRemove(t *testing.T) {
	e, root := fixture(t, true)
	var before []string
	for range 60 {
		before = append(before, "unchanged")
	}
	write(t, root, "hello.txt", strings.Join(before, "\n")+"\n")
	git(t, root, "commit", "-am", "many lines")
	after := append([]string{}, before...)
	after[1] = "first"
	after[55] = "last"
	write(t, root, "hello.txt", strings.Join(after, "\n")+"\n")
	d, _ := e.Diff(context.Background(), root, "hello.txt", false)
	selected := append(positionsMatching(d.Text, "+first"), positionsMatching(d.Text, "+last")...)
	if _, err := e.StageLines(context.Background(), root, "hello.txt", false, d.Revision, selected); err != nil {
		t.Fatal(err)
	}
	indexed := git(t, root, "show", ":hello.txt")
	if !strings.Contains(indexed, "first\nunchanged") || !strings.Contains(indexed, "last\nunchanged") || strings.Count(indexed, "unchanged") != 60 {
		t.Fatal("addition-only selection deleted old lines", indexed)
	}
	d, _ = e.Diff(context.Background(), root, "hello.txt", true)
	if _, err := e.StageLines(context.Background(), root, "hello.txt", true, d.Revision, positionsMatching(d.Text, "+first")); err != nil {
		t.Fatal(err)
	}
	indexed = git(t, root, "show", ":hello.txt")
	if strings.Contains(indexed, "first") || !strings.Contains(indexed, "last") {
		t.Fatal("unstaged unrelated addition")
	}
	write(t, root, "hello.txt", "external\n")
	if _, err := e.StageLines(context.Background(), root, "hello.txt", false, d.Revision, selected); err == nil {
		t.Fatal("accepted stale revision")
	}
}

func TestConflictThreeWaySaveAndBackup(t *testing.T) {
	e, root := conflictFixture(t)
	ctx := context.Background()
	d, err := e.Conflict(ctx, root, "hello.txt")
	if err != nil || d.Ours != "main\n" || d.Theirs != "feature\n" || d.Base == "" {
		t.Fatalf("missing three-way content: %+v %v", d, err)
	}
	if _, err = e.Stage(ctx, root, []string{"hello.txt"}, true); err == nil {
		t.Fatal("ordinary staging bypassed conflict marker checks")
	}
	if _, err = e.SaveConflict(ctx, root, "hello.txt", d.Revision, d.Result); err == nil {
		t.Fatal("accepted conflict markers")
	}
	if _, err = e.SaveConflict(ctx, root, "hello.txt", d.Revision, "resolved together\n"); err != nil {
		t.Fatal(err)
	}
	w, _ := e.Workflow(ctx, root)
	if len(w.Conflicts) != 0 || w.State != "merge" {
		t.Fatal("save must stage but not complete merge", w)
	}
	backups, err := e.FileBackups(ctx, root)
	if err != nil || len(backups) != 1 || backups[0].Path != "hello.txt" || backups[0].Content != "" {
		t.Fatalf("missing safe backup listing: %+v %v", backups, err)
	}
	if _, err = e.SaveConflict(ctx, root, "hello.txt", d.Revision, "stale\n"); err == nil {
		t.Fatal("overwrote a resolved file")
	}
}

func TestConflictRejectsExternalEditsAndUnsupportedTypes(t *testing.T) {
	e, root := conflictFixture(t)
	ctx := context.Background()
	d, err := e.Conflict(ctx, root, "hello.txt")
	if err != nil {
		t.Fatal(err)
	}
	write(t, root, "hello.txt", "external editor work\n")
	if _, err = e.SaveConflict(ctx, root, "hello.txt", d.Revision, "lost work\n"); err == nil {
		t.Fatal("overwrote external editor")
	}
	write(t, root, "hello.txt", "binary\x00data")
	if _, err = e.Conflict(ctx, root, "hello.txt"); err == nil {
		t.Fatal("accepted binary file")
	}
	if _, err = e.Conflict(ctx, root, "../outside"); err == nil {
		t.Fatal("accepted outside path")
	}
}

func TestRecoveryBacksUpAndRestoresWithoutChangingIndex(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	write(t, root, "hello.txt", "important unfinished work\n")
	w, _ := e.Workflow(ctx, root)
	index := git(t, root, "show", ":hello.txt")
	if _, err := e.RecoveryAction(ctx, root, "discard-file", "hello.txt", w.Revision); err != nil {
		t.Fatal(err)
	}
	backups, err := e.FileBackups(ctx, root)
	if err != nil || len(backups) != 1 {
		t.Fatal(backups, err)
	}
	w, _ = e.Workflow(ctx, root)
	if _, err = e.RecoveryAction(ctx, root, "restore-backup", backups[0].ID, w.Revision); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(root, "hello.txt"))
	if string(data) != "important unfinished work\n" || git(t, root, "show", ":hello.txt") != index {
		t.Fatal("did not preserve work/index")
	}
	write(t, root, "new.txt", "untracked\n")
	w, _ = e.Workflow(ctx, root)
	if _, err = e.RecoveryAction(ctx, root, "discard-file", "new.txt", w.Revision); err == nil {
		t.Fatal("discarded untracked file")
	}
	if _, err = e.RecoveryAction(ctx, root, "restore-backup", "../escape", w.Revision); err == nil {
		t.Fatal("accepted invalid backup")
	}
}

func TestUndoCommitRejectsKnownRemoteAndRetainsChanges(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	write(t, root, "hello.txt", "next commit\n")
	git(t, root, "commit", "-am", "next")
	head := git(t, root, "rev-parse", "HEAD")
	git(t, root, "update-ref", "refs/remotes/origin/main", head)
	w, _ := e.Workflow(ctx, root)
	if _, err := e.RecoveryAction(ctx, root, "undo-commit", "", w.Revision); err == nil {
		t.Fatal("rewrote known published history")
	}
	git(t, root, "update-ref", "-d", "refs/remotes/origin/main")
	w, _ = e.Workflow(ctx, root)
	if _, err := e.RecoveryAction(ctx, root, "undo-commit", "", w.Revision); err != nil {
		t.Fatal(err)
	}
	if git(t, root, "rev-parse", "HEAD") == head || !strings.Contains(git(t, root, "diff", "--cached"), "+next commit") {
		t.Fatal("undo lost staged changes")
	}
}

func TestHistoryActionsRequireCleanStateAndConfirmedRevision(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	write(t, root, "hello.txt", "next\n")
	git(t, root, "commit", "-am", "next")
	hash := git(t, root, "rev-parse", "HEAD")
	w, _ := e.Workflow(ctx, root)
	if _, err := e.HistoryAction(ctx, root, "revert", hash, "stale"); err == nil {
		t.Fatal("accepted stale confirmation")
	}
	if _, err := e.HistoryAction(ctx, root, "revert", hash, w.Revision); err != nil {
		t.Fatal(err)
	}
	if git(t, root, "rev-parse", "HEAD") == hash {
		t.Fatal("revert did not create a new commit")
	}
	write(t, root, "untracked.txt", "work\n")
	w, _ = e.Workflow(ctx, root)
	if _, err := e.HistoryAction(ctx, root, "cherry-pick", hash, w.Revision); err == nil {
		t.Fatal("accepted dirty worktree")
	}
}
