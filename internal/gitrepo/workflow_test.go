package gitrepo

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func workflowAction(t *testing.T, e *Engine, root, action, name, target string) error {
	t.Helper()
	w, err := e.Workflow(context.Background(), root)
	if err != nil {
		t.Fatal(err)
	}
	_, err = e.WorkflowAction(context.Background(), root, action, name, target, w.Revision)
	return err
}

func conflictFixture(t *testing.T) (*Engine, string) {
	t.Helper()
	e, root := fixture(t, true)
	git(t, root, "switch", "-c", "feature")
	write(t, root, "hello.txt", "feature\n")
	git(t, root, "commit", "-am", "feature")
	git(t, root, "switch", "main")
	write(t, root, "hello.txt", "main\n")
	git(t, root, "commit", "-am", "main")
	if err := workflowAction(t, e, root, "merge", "feature", ""); err == nil {
		t.Fatal("expected merge conflict")
	}
	return e, root
}

func TestWorkflowResolveContinueAndAbort(t *testing.T) {
	e, root := conflictFixture(t)
	w, err := e.Workflow(context.Background(), root)
	if err != nil || w.State != "merge" || len(w.Conflicts) != 1 {
		t.Fatalf("missing conflict: %+v %v", w, err)
	}
	if workflowAction(t, e, root, "continue", "", "") == nil {
		t.Fatal("continued unresolved merge")
	}
	if workflowAction(t, e, root, "resolve", "hello.txt", "") == nil {
		t.Fatal("staged conflict markers")
	}
	write(t, root, "hello.txt", "resolved together\n")
	if err := workflowAction(t, e, root, "resolve", "hello.txt", ""); err != nil {
		t.Fatal(err)
	}
	if err := workflowAction(t, e, root, "continue", "", ""); err != nil {
		t.Fatal(err)
	}
	if len(strings.Fields(git(t, root, "rev-list", "--parents", "-n", "1", "HEAD"))) != 3 {
		t.Fatal("did not produce merge commit")
	}
	e2, root2 := conflictFixture(t)
	if err := workflowAction(t, e2, root2, "abort", "", ""); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(root2, "hello.txt"))
	if string(data) != "main\n" {
		t.Fatal("abort did not restore original contents")
	}
}

func TestWorkflowBranchSafetyAndTracking(t *testing.T) {
	e, root := fixture(t, true)
	git(t, root, "branch", "merged")
	if err := workflowAction(t, e, root, "rename", "merged", "renamed"); err != nil {
		t.Fatal(err)
	}
	if err := workflowAction(t, e, root, "delete", "renamed", ""); err != nil {
		t.Fatal(err)
	}
	if workflowAction(t, e, root, "delete", "main", "") == nil {
		t.Fatal("deleted current branch")
	}
	git(t, root, "switch", "-c", "unmerged")
	write(t, root, "hello.txt", "other\n")
	git(t, root, "commit", "-am", "other")
	git(t, root, "switch", "main")
	if workflowAction(t, e, root, "delete", "unmerged", "") == nil {
		t.Fatal("deleted unmerged commits")
	}
	git(t, root, "remote", "add", "origin", filepath.Join(t.TempDir(), "offline.git"))
	git(t, root, "update-ref", "refs/remotes/origin/topic", "HEAD")
	if err := workflowAction(t, e, root, "track", "main", "origin/topic"); err != nil {
		t.Fatal(err)
	}
	if err := workflowAction(t, e, root, "checkout-remote", "origin/topic", "topic"); err != nil {
		t.Fatal(err)
	}
	if git(t, root, "branch", "--show-current") != "topic" {
		t.Fatal("checkout did not switch")
	}
	wt := filepath.Join(t.TempDir(), "wt")
	git(t, root, "worktree", "add", wt, "main")
	if workflowAction(t, e, root, "rename", "main", "oops") == nil {
		t.Fatal("renamed branch in another worktree")
	}
}

func TestWorkflowStaleStateAndExactIgnorePaths(t *testing.T) {
	e, root := fixture(t, true)
	name, other := fixtureFilename("literal [1]*.txt"), "literal 11x.txt"
	if runtime.GOOS == "windows" {
		other = "literal 1.txt"
	}
	write(t, root, name, "keep me\n")
	write(t, root, other, "also keep\n")
	w, _ := e.Workflow(context.Background(), root)
	git(t, root, "branch", "external")
	if _, err := e.IgnoreFile(context.Background(), root, name, w.Revision); err == nil {
		t.Fatal("accepted stale revision")
	}
	w, _ = e.Workflow(context.Background(), root)
	if _, err := e.IgnoreFile(context.Background(), root, name, w.Revision); err != nil {
		t.Fatal(err)
	}
	if got := git(t, root, "ls-files", "--others", "--exclude-standard"); strings.Contains(got, "literal [1]") || !strings.Contains(got, other) {
		t.Fatalf("ignore was not literal: %s", got)
	}
	if _, err := os.Stat(filepath.Join(root, name)); err != nil {
		t.Fatal("ignore removed file")
	}
	if git(t, root, "diff", "--cached", "--name-only") != "" {
		t.Fatal("ignore auto-staged changes")
	}
}

func TestDevelopmentPathsConfined(t *testing.T) {
	e, root := fixture(t, true)
	outside := filepath.Join(t.TempDir(), "private.txt")
	if err := os.WriteFile(outside, []byte("private"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(root, "escape")); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{".git/config", "../outside", outside, "escape", "./.git/config"} {
		if _, err := e.DevelopmentPath(context.Background(), root, path); err == nil {
			t.Fatalf("opened forbidden path %s", path)
		}
	}
	if path, err := e.DevelopmentPath(context.Background(), root, "hello.txt"); err != nil || path != filepath.Join(root, "hello.txt") {
		t.Fatalf("valid path rejected: %s %v", path, err)
	}
}

func TestWorkflowContinueOrAbortExternalSequences(t *testing.T) {
	for _, state := range []string{"rebase", "cherry-pick", "revert"} {
		for _, finish := range []string{"continue", "abort"} {
			t.Run(state+"/"+finish, func(t *testing.T) {
				e, root := fixture(t, true)
				git(t, root, "switch", "-c", "feature")
				write(t, root, "hello.txt", "feature\n")
				git(t, root, "commit", "-am", "feature change")
				target := git(t, root, "rev-parse", "HEAD")
				if state == "revert" {
					git(t, root, "switch", "main")
					git(t, root, "merge", "--ff-only", "feature")
				} else {
					git(t, root, "switch", "main")
				}
				write(t, root, "hello.txt", "main\n")
				git(t, root, "commit", "-am", "main change")
				original := git(t, root, "rev-parse", "HEAD")
				cmd := exec.Command("git", "-C", root, state, target)
				cmd.Env = append(os.Environ(), "GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_CONFIG_NOSYSTEM=1", "GIT_TERMINAL_PROMPT=0", "GIT_EDITOR=true", "GIT_SEQUENCE_EDITOR=true")
				if out, err := cmd.CombinedOutput(); err == nil {
					t.Fatalf("expected conflict: %s", out)
				}
				w, err := e.Workflow(context.Background(), root)
				if err != nil || w.State != state || len(w.Conflicts) != 1 {
					t.Fatalf("sequence state: %+v %v", w, err)
				}
				if finish == "continue" {
					write(t, root, "hello.txt", "resolved\n")
					if err := workflowAction(t, e, root, "resolve", "hello.txt", ""); err != nil {
						t.Fatal(err)
					}
				}
				if err := workflowAction(t, e, root, finish, "", ""); err != nil {
					t.Fatal(err)
				}
				w, err = e.Workflow(context.Background(), root)
				if err != nil || w.State != "" || len(w.Conflicts) != 0 {
					t.Fatalf("unfinished sequence: %+v %v", w, err)
				}
				if finish == "abort" && git(t, root, "rev-parse", "HEAD") != original {
					t.Fatal("abort did not restore original HEAD")
				}
			})
		}
	}
}
