package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestSessionAtomicRoundTripAndMalformedRecovery(t *testing.T) {
	path := filepath.Join(t.TempDir(), "state", "session.json")
	s := emptySession()
	s.Root, s.View, s.UpdatedAt = t.TempDir(), "history", 42
	s.Drafts[s.Root] = CommitDraft{Title: "draft", Body: "not committed"}
	if err := writeSession(path, s); err != nil {
		t.Fatal(err)
	}
	got := readSession(path)
	if got.Root != s.Root || got.Drafts[s.Root].Body != "not committed" || got.UpdatedAt != 42 {
		t.Fatalf("lost session: %+v", got)
	}
	info, _ := os.Stat(path)
	if runtime.GOOS != "windows" && info.Mode().Perm() != 0600 {
		t.Fatalf("session permissions: %v", info.Mode())
	}
	s.View = "unknown"
	if writeSession(path, s) == nil {
		t.Fatal("accepted invalid view")
	}
	if readSession(path).View != "history" {
		t.Fatal("invalid write destroyed previous session")
	}
	if err := os.WriteFile(path, []byte("{broken"), 0600); err != nil {
		t.Fatal(err)
	}
	if readSession(path).Root != "" {
		t.Fatal("did not recover malformed session")
	}
}

func TestSessionRejectsInvalidDrafts(t *testing.T) {
	s := emptySession()
	s.Root = "relative"
	if validateSession(s) == nil {
		t.Fatal("relative root accepted")
	}
	s.Root = ""
	for i := 0; i < 65; i++ {
		s.Drafts[filepath.Join(t.TempDir(), "repo")] = CommitDraft{Title: "keep"}
	}
	if validateSession(s) == nil {
		t.Fatal("oversized draft map accepted")
	}
}

func TestSessionStaleWritesAndExplicitStartup(t *testing.T) {
	dir := t.TempDir()
	g := &Git{settings: filepath.Join(dir, "recents.json"), sessionFile: filepath.Join(dir, "session.json")}
	s := emptySession()
	s.Root = t.TempDir()
	s.UpdatedAt = 100
	s.Drafts[s.Root] = CommitDraft{Title: "latest"}
	if err := g.SaveSession(s); err != nil {
		t.Fatal(err)
	}
	s.UpdatedAt = 99
	s.Drafts[s.Root] = CommitDraft{Title: "stale"}
	if err := g.SaveSession(s); err != nil {
		t.Fatal(err)
	}
	got := readSession(g.sessionFile)
	if got.UpdatedAt != 100 || got.Drafts[s.Root].Title != "latest" {
		t.Fatalf("stale write replaced current: %+v", got)
	}
	startup, err := g.Bootstrap()
	if err != nil || startup.Path != s.Root || startup.ExplicitPath {
		t.Fatalf("session startup: %+v %v", startup, err)
	}
	g.startupPath = t.TempDir()
	startup, err = g.Bootstrap()
	if err != nil || startup.Path != g.startupPath || !startup.ExplicitPath {
		t.Fatalf("explicit startup: %+v %v", startup, err)
	}
	g.ephemeral = true
	if err := g.SaveSession(WorkspaceSession{View: "changes", UpdatedAt: 101}); err != nil {
		t.Fatal(err)
	}
	if readSession(g.sessionFile).Root != s.Root {
		t.Fatal("smoke changed user session")
	}
}
