package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/egoist/mygo/plugins/terminal"
)

type testTerminalProcess struct {
	done, closed chan struct{}
	once         sync.Once
}

func (p *testTerminalProcess) Close() error {
	p.once.Do(func() { close(p.closed) })
	return nil
}
func (p *testTerminalProcess) Done() <-chan struct{} { return p.done }

func TestTerminalStopWaitsForProcessExit(t *testing.T) {
	p := &testTerminalProcess{done: make(chan struct{}), closed: make(chan struct{})}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	result := make(chan error, 1)
	go func() { result <- stopTerminalProcess(ctx, p) }()
	<-p.closed
	if !terminalRunning(p.Done()) {
		t.Fatal("a close request is not proof that a program exited")
	}
	select {
	case err := <-result:
		t.Fatalf("returned before process exit: %v", err)
	default:
	}
	close(p.done)
	if err := <-result; err != nil {
		t.Fatal(err)
	}
	if terminalRunning(p.Done()) {
		t.Fatal("exited terminal still running")
	}
}

func TestTerminalStopHonorsDeadline(t *testing.T) {
	p := &testTerminalProcess{done: make(chan struct{}), closed: make(chan struct{})}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := stopTerminalProcess(ctx, p); !errors.Is(err, context.Canceled) {
		t.Fatalf("hung process should preserve the window: %v", err)
	}
	close(p.done)
}

func TestTerminalRejectsUnopenedRepositoryAndIsolatedMode(t *testing.T) {
	g := &Git{}
	if err := g.OpenDevelopmentPath(context.Background(), t.TempDir(), "", "terminal", ""); err == nil {
		t.Fatal("accepted a repository that was not opened")
	}
	g.ephemeral = true
	if err := g.openRepositoryTerminal(context.Background(), t.TempDir()); err == nil {
		t.Fatal("smoke mode launched an interactive terminal")
	}
	g.ephemeral = false
	g.terminals.closing = true
	if err := g.openRepositoryTerminal(context.Background(), t.TempDir()); err == nil {
		t.Fatal("created a terminal during application shutdown")
	}
}

// Invoked only as a child of the PTY tests, never a user's shell or repo.
func TestTerminalProcessHelper(t *testing.T) {
	if os.Getenv("SAKURAGIT_TERMINAL_HELPER") != "1" {
		return
	}
	root, _ := filepath.EvalSymlinks(os.Getenv("SAKURAGIT_TERMINAL_ROOT"))
	wd, _ := os.Getwd()
	wd, _ = filepath.EvalSymlinks(wd)
	if wd != root {
		fmt.Printf("wrong-directory:%s\n", wd)
		os.Exit(9)
	}
	fmt.Print("\x1b[32mterminal-ready 中文\x1b[0m\r\n")
	line, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil || strings.TrimSpace(line) != "fixture-input" {
		os.Exit(8)
	}
	fmt.Print("input-ok\r\n")
	os.Exit(7)
}

func newFixtureTerminal(t *testing.T) *terminal.Terminal {
	t.Helper()
	bin, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	term, err := terminal.New(terminal.Options{
		Command: []string{bin, "-test.run=^TestTerminalProcessHelper$"}, Dir: root,
		Env: []string{"SAKURAGIT_TERMINAL_HELPER=1", "SAKURAGIT_TERMINAL_ROOT=" + root},
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = term.Close() })
	term.Resize(100, 30)
	deadline := time.After(20 * time.Second)
	for !strings.Contains(term.Text(), "terminal-ready 中文") {
		select {
		case <-deadline:
			t.Fatalf("PTY did not start in fixture directory: %q", term.Text())
		case <-term.Done():
			t.Fatalf("PTY exited before becoming ready: %d %q", term.ExitCode(), term.Text())
		case <-time.After(20 * time.Millisecond):
		}
	}
	return term
}

func TestTerminalPTYInputUnicodeResizeAndExit(t *testing.T) {
	term := newFixtureTerminal(t)
	if cols, rows := term.Size(); cols != 100 || rows != 30 {
		t.Fatalf("resize not applied: %dx%d", cols, rows)
	}
	term.Send([]byte("fixture-input\r"))
	select {
	case <-term.Done():
	case <-time.After(20 * time.Second):
		t.Fatal("PTY input did not reach helper")
	}
	if term.ExitCode() != 7 || !strings.Contains(term.Text(), "input-ok") {
		t.Fatalf("wrong exit/output: %d %q", term.ExitCode(), term.Text())
	}
}

func TestTerminalPTYCloseStopsAttachedProgram(t *testing.T) {
	term := newFixtureTerminal(t)
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := stopTerminalProcess(ctx, term); err != nil {
		t.Fatalf("attached helper survived terminal close: %v", err)
	}
}
