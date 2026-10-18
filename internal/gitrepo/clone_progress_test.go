package gitrepo

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func TestCloneProgressChunksAndStages(t *testing.T) {
	var lines []string
	out := &cloneOutput{progress: func(s string) { lines = append(lines, s) }}
	for _, chunk := range []string{"remote: Enumerating objects: 12, done.\nReceiving obj", "ects:  42% (42/100), 2.00 MiB | 1.00 MiB/s\rResolving deltas: 100% (3/3), done.\r\nUpdating files: 1", "0% (1/10)", "\r"} {
		_, _ = out.Write([]byte(chunk))
	}
	if len(lines) != 4 {
		t.Fatalf("lines = %#v", lines)
	}
	for i, want := range []int{-1, 42, 100, 10} {
		phase, percent, ok := parseCloneProgress(lines[i])
		if !ok || phase == "" || percent != want {
			t.Fatalf("%q => %q %d %v", lines[i], phase, percent, ok)
		}
	}
	if _, _, ok := parseCloneProgress("fatal: permission denied"); ok {
		t.Fatal("error must not become progress")
	}
	if !strings.Contains(lines[1], "MiB/s") {
		t.Fatal("lost transfer details")
	}
}

func TestCloneProgressOutputBounded(t *testing.T) {
	out := &cloneOutput{}
	for i := 0; i < 100; i++ {
		_, _ = out.Write([]byte(strings.Repeat("x", 10000)))
	}
	if len(out.tail) > 16384 || len(out.pending) > 4096 {
		t.Fatal("unbounded output")
	}
	out.flush()
	if len(out.pending) != 0 {
		t.Fatal("flush retained pending line")
	}
}

func TestTrackedCloneLocalAndStaleJobs(t *testing.T) {
	_, source := fixture(t, true)
	e := &Engine{}
	destination := filepath.Join(t.TempDir(), "clone")
	path, err := e.CloneRepository(context.Background(), "first", source, destination, "main", false)
	resolved, _ := filepath.EvalSymlinks(destination)
	if err != nil || path != resolved {
		t.Fatalf("%s %v", path, err)
	}
	status, err := e.CloneProgress("first")
	if err != nil || status.State != "complete" || status.StartedAt == "" {
		t.Fatalf("%+v %v", status, err)
	}
	if _, err = e.CloneRepository(context.Background(), "second", source, filepath.Join(t.TempDir(), "clone"), "main", false); err != nil {
		t.Fatal(err)
	}
	if err = e.CancelClone("first"); err == nil {
		t.Fatal("stale cancel accepted")
	}
	if _, err = e.CloneProgress("first"); err == nil {
		t.Fatal("stale progress accepted")
	}
	status, _ = e.CloneProgress("second")
	if status.State != "complete" {
		t.Fatal(status)
	}
}

func TestTrackedCloneCanceledBeforeStart(t *testing.T) {
	e := &Engine{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := e.CloneRepository(ctx, "cancel-before", t.TempDir(), filepath.Join(t.TempDir(), "clone"), "", false)
	if err == nil {
		t.Fatal("canceled clone succeeded")
	}
	status, _ := e.CloneProgress("cancel-before")
	if status.State != "canceled" {
		t.Fatal(status)
	}
}
