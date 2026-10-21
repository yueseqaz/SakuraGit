package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/yueseqaz/SakuraGit/internal/devtools"
)

func TestDeveloperConfigRoundTripAndValidation(t *testing.T) {
	path := filepath.Join(t.TempDir(), "developer", "fixture.json")
	c := DeveloperConfig{Variables: []devtools.Variable{{Name: "JAVA_HOME", Value: "/jdk with spaces"}}, Commands: []QuickCommand{{ID: "test", Name: "Development", Command: "npm run dev\necho complete", Directory: "server"}}}
	if err := writeDeveloperConfig(path, c); err != nil {
		t.Fatal(err)
	}
	read, err := readDeveloperConfig(path)
	if err != nil || len(read.Commands) != 1 || read.Commands[0] != c.Commands[0] || read.Variables[0] != c.Variables[0] {
		t.Fatal(read, err)
	}
	for _, dir := range []string{"../outside", "/tmp", "a/../b", ".git", "a/.git/objects", "a\\b", "C:/windows", "a/", "a//b", "a. "} {
		c.Commands[0].Directory = dir
		if validateDeveloperConfig(c) == nil {
			t.Fatal("accepted directory", dir)
		}
	}
	c.Commands[0].Directory = ""
	c.Variables = append(c.Variables, devtools.Variable{Name: "JAVA_HOME", Value: "duplicate"})
	if validateDeveloperConfig(c) == nil {
		t.Fatal("duplicate environment")
	}
	if err := os.WriteFile(path, []byte("broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := readDeveloperConfig(path); err == nil {
		t.Fatal("silently reset malformed configuration")
	}
}
func TestDeveloperDirectoryAndIsolatedMode(t *testing.T) {
	root := t.TempDir()
	child := filepath.Join(root, "server")
	if err := os.Mkdir(child, 0700); err != nil {
		t.Fatal(err)
	}
	if got, err := developerDirectory(root, "server"); err != nil || got != child {
		t.Fatal(got, err)
	}
	if err := os.Symlink(child, filepath.Join(root, "link")); err == nil {
		if _, err = developerDirectory(root, "link"); err == nil {
			t.Fatal("followed directory symlink")
		}
	}
	if err := os.WriteFile(filepath.Join(child, ".git"), []byte("gitdir: outside"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := developerDirectory(root, "server"); err == nil {
		t.Fatal("entered nested repository")
	}
	g := &Git{ephemeral: true}
	if _, err := g.developerPath(root); err == nil {
		t.Fatal("ephemeral mode read user tasks")
	}
	if err := g.RunDeveloperCommand(context.Background(), root, QuickCommand{ID: "fake"}); err == nil {
		t.Fatal("executed without an opened repository")
	}
}
