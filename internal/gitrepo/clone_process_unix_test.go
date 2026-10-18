//go:build !windows

package gitrepo

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCloneCancellationStopsChildrenAndRetainsDirectory(t *testing.T) {
	bin := t.TempDir()
	marker := filepath.Join(bin, "child-survived")
	// Isolated fake Git never accesses a network. A child would write this marker
	// after cancellation if only the parent process were stopped.
	script := "#!/bin/sh\n(sleep 1; echo survived > \"$CLONE_TEST_MARKER\") &\nprintf 'Receiving objects: 42%% (42/100), 2 MiB | 1 MiB/s\\r' >&2\nwait\n"
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("CLONE_TEST_MARKER", marker)
	e := &Engine{}
	destination := filepath.Join(t.TempDir(), "clone")
	done := make(chan error, 1)
	go func() {
		_, err := e.CloneRepository(context.Background(), "slow-local", bin, destination, "", false)
		done <- err
	}()
	deadline := time.Now().Add(3 * time.Second)
	for {
		status, _ := e.CloneProgress("slow-local")
		if status.Percent == 42 {
			break
		}
		if time.Now().After(deadline) {
			_ = e.CancelClone("slow-local")
			t.Fatal("no streamed progress while process running")
		}
		time.Sleep(10 * time.Millisecond)
	}
	if _, err := e.CloneRepository(context.Background(), "overlap", bin, filepath.Join(t.TempDir(), "other"), "", false); err == nil {
		t.Fatal("overlapping clone accepted")
	}
	if err := e.CancelClone("wrong-id"); err == nil {
		t.Fatal("stale cancel accepted")
	}
	if err := e.CancelClone("slow-local"); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err == nil || !strings.Contains(err.Error(), "取消") {
			t.Fatalf("cancel result: %v", err)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("cancellation did not stop process")
	}
	status, _ := e.CloneProgress("slow-local")
	if status.State != "canceled" {
		t.Fatal(status)
	}
	if _, err := os.Stat(destination); err != nil {
		t.Fatal("destination must be retained", err)
	}
	time.Sleep(1200 * time.Millisecond)
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("transport child survived cancellation")
	}
}

func TestOrdinaryNetworkCommandProgressAndProcessTreeCancellation(t *testing.T) {
	bin := t.TempDir()
	marker := filepath.Join(bin, "ordinary-child-survived")
	script := "#!/bin/sh\n(sleep 1; echo survived > \"$CLONE_TEST_MARKER\") &\nprintf 'Writing objects: 60%% (60/100), 2 MiB | 1 MiB/s\\r' >&2\nwait\n"
	if err := os.WriteFile(filepath.Join(bin, "git"), []byte(script), 0755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))
	t.Setenv("CLONE_TEST_MARKER", marker)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	progress := make(chan int, 10)
	ctx = WithProgress(ctx, true, func(_ string, percent int, _ string) { progress <- percent })
	done := make(chan error, 1)
	go func() { _, err := run(ctx, bin, "push", "--progress"); done <- err }()
	select {
	case percent := <-progress:
		if percent != 60 {
			t.Fatal(percent)
		}
	case <-time.After(3 * time.Second):
		t.Fatal("no live progress")
	}
	cancel()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("cancellation reported success")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("process failed to stop")
	}
	time.Sleep(1200 * time.Millisecond)
	if _, err := os.Stat(marker); !os.IsNotExist(err) {
		t.Fatal("ordinary command child survived cancellation")
	}
}
