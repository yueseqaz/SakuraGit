package gitrepo

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestEditorSavePreservesIndexAndRejectsExternalChanges(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	for _, text := range []string{"hello\n", "hello\r\n", "no-final-newline", "\xef\xbb\xbf中文\n"} {
		write(t, root, "hello.txt", text)
		d, err := e.EditorFile(ctx, root, "hello.txt")
		if err != nil {
			t.Fatal(err)
		}
		if d.Content != text {
			t.Fatalf("read converted text %q", d.Content)
		}
		index := git(t, root, "show", ":hello.txt")
		saved, err := e.SaveEditorFile(ctx, root, "hello.txt", d.Revision, text+"edited")
		if err != nil || saved.Content != text+"edited" {
			t.Fatal(saved, err)
		}
		read, err := e.EditorFile(ctx, root, "hello.txt")
		if err != nil || read.Revision != saved.Revision {
			t.Fatal("save revision not reusable", read, saved, err)
		}
		if got := git(t, root, "show", ":hello.txt"); got != index {
			t.Fatal("saved to index")
		}
		backups, err := e.FileBackups(ctx, root)
		if err != nil || len(backups) == 0 {
			t.Fatal("no backup", err)
		}
		if _, err = e.SaveEditorFile(ctx, root, "hello.txt", d.Revision, "stale"); err == nil {
			t.Fatal("accepted stale revision")
		}
		write(t, root, "hello.txt", "external\n")
		if _, err = e.SaveEditorFile(ctx, root, "hello.txt", saved.Revision, "overwrite"); err == nil {
			t.Fatal("overwrote external edits")
		}
		data, _ := os.ReadFile(filepath.Join(root, "hello.txt"))
		if string(data) != "external\n" {
			t.Fatal("changed external file")
		}
	}
}

func TestEditorUntrackedFileAndExecutableMode(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	write(t, root, "new.sh", "#!/bin/sh\n")
	if err := os.Chmod(filepath.Join(root, "new.sh"), 0755); err != nil {
		t.Fatal(err)
	}
	before, _ := os.Stat(filepath.Join(root, "new.sh"))
	d, err := e.EditorFile(ctx, root, "new.sh")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = e.SaveEditorFile(ctx, root, "new.sh", d.Revision, "#!/bin/sh\necho ok\n"); err != nil {
		t.Fatal(err)
	}
	after, _ := os.Stat(filepath.Join(root, "new.sh"))
	if before.Mode().Perm() != after.Mode().Perm() {
		t.Fatal("changed mode")
	}
	if got := git(t, root, "ls-files", "--", "new.sh"); got != "" {
		t.Fatal("staged untracked file")
	}
}

func TestEditorConfinedAndBounded(t *testing.T) {
	e, root := fixture(t, true)
	ctx := context.Background()
	for _, path := range []string{".git/config", "../outside", "./hello.txt", "/etc/passwd", "a/../hello.txt", "a\\b", ""} {
		if _, err := e.EditorFile(ctx, root, path); err == nil {
			t.Fatalf("accepted path %q", path)
		}
	}
	for _, text := range []string{"binary\x00text", "\xff", strings.Repeat("a", (1<<20)+1), "one\r\ntwo\n", "one\rtwo"} {
		write(t, root, "unsupported.txt", text)
		if _, err := e.EditorFile(ctx, root, "unsupported.txt"); err == nil {
			t.Fatal("accepted unsupported text")
		}
	}
	if err := os.Mkdir(filepath.Join(root, "nested"), 0755); err != nil {
		t.Fatal(err)
	}
	write(t, root, "nested/.git", "gitdir: ../.git")
	write(t, root, "nested/secret.txt", "nested")
	if _, err := e.EditorFile(ctx, root, "nested/secret.txt"); err == nil {
		t.Fatal("entered nested repository")
	}
	if _, err := e.EditorDirectory(ctx, root, "nested"); err == nil {
		t.Fatal("listed nested repository")
	}
	if err := os.Symlink(".git", filepath.Join(root, "metadata-link")); err == nil {
		if _, err := e.EditorFile(ctx, root, "metadata-link/config"); err == nil {
			t.Fatal("followed metadata symlink")
		}
		if _, err := e.EditorDirectory(ctx, root, "metadata-link"); err == nil {
			t.Fatal("listed symlink")
		}
	}
	entries, err := e.EditorDirectory(ctx, root, "")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries.Entries {
		if strings.EqualFold(entry.Name, ".git") || entry.Name == "metadata-link" {
			t.Fatal("exposed metadata/link")
		}
	}
	if _, err := e.EditorFile(ctx, t.TempDir(), "hello.txt"); err == nil {
		t.Fatal("read unopened root")
	}
	d, err := e.EditorFile(ctx, root, "hello.txt")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = e.SaveEditorFile(ctx, root, "hello.txt", d.Revision, "bad\x00"); err == nil {
		t.Fatal("saved binary")
	}
}
