package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"image/png"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/egoist/mygo/plugins/terminal"
	"github.com/egoist/mygo/ui"
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

func TestTerminalDeduplicatesPendingOpenAndLimitsSessions(t *testing.T) {
	g := &Git{}
	root := t.TempDir()
	g.terminals.sessions = map[string]*repositoryTerminal{root: {ready: make(chan struct{})}}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if err := g.openRepositoryTerminal(ctx, root); !errors.Is(err, context.Canceled) {
		t.Fatalf("duplicate open did not wait for the existing session: %v", err)
	}
	for i := range 7 {
		g.terminals.sessions[fmt.Sprint(i)] = &repositoryTerminal{ready: make(chan struct{})}
	}
	if err := g.openRepositoryTerminal(context.Background(), t.TempDir()); err == nil {
		t.Fatal("accepted more than eight sessions")
	}
}

func TestTerminalClosePromptDoesNotLockGitOperations(t *testing.T) {
	g := &Git{exitApproved: true}
	s := &repositoryTerminal{ready: make(chan struct{})}
	s.prompt.Store(true)
	g.terminals.sessions = map[string]*repositoryTerminal{"fixture": s}
	if !g.protectTerminals(nil, true) {
		t.Fatal("quit ignored an existing terminal confirmation")
	}
	if g.exitApproved {
		t.Fatal("canceling an existing dialog would leave Git operations locked")
	}
	delete(g.terminals.sessions, "fixture")
	if g.protectTerminals(nil, true) {
		t.Fatal("quit blocked despite having no terminal sessions")
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
	opts := repositoryTerminalOptions(root)
	opts.Command = []string{bin, "-test.run=^TestTerminalProcessHelper$"}
	opts.Env = append(opts.Env, "SAKURAGIT_TERMINAL_HELPER=1", "SAKURAGIT_TERMINAL_ROOT="+root)
	term, err := terminal.New(opts)
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

func TestTerminalNativeViewInputClipboardAndAppearance(t *testing.T) {
	term := newFixtureTerminal(t)
	root := "/isolated-fixture/中文仓库"
	tt := ui.NewTester(repositoryTerminalView(root, term), 1080, 700)
	if !tt.HasText(root) || !tt.Focused("Terminal") {
		t.Fatalf("terminal did not get initial focus: %v", tt.Texts())
	}
	if err := tt.Click("复制路径"); err != nil {
		t.Fatal(err)
	}
	if tt.Clipboard() != root {
		t.Fatal("copy path did not use the explicit clipboard action")
	}
	if err := os.MkdirAll("build", 0755); err != nil {
		t.Fatal(err)
	}
	for _, dark := range []bool{false, true} {
		tt.SetDark(dark)
		if dark {
			tt.SetSize(640, 400)
		}
		file, err := os.Create(filepath.Join("build", fmt.Sprintf("terminal-ui-%s-dark-%t.png", runtime.GOOS, dark)))
		if err != nil {
			t.Fatal(err)
		}
		err = png.Encode(file, tt.Image())
		_ = file.Close()
		if err != nil {
			t.Fatal(err)
		}
	}
	if err := tt.Click("Terminal"); err != nil {
		t.Fatal(err)
	}
	tt.Type("fixture-input")
	tt.Key(0, ui.KeyEnter)
	select {
	case <-term.Done():
	case <-time.After(20 * time.Second):
		t.Fatal("native view did not forward typed input to the PTY")
	}
	tt.Frame()
	if term.ExitCode() != 7 || !tt.HasText("Shell 已退出（7）") {
		t.Fatalf("view did not retain the exited session: %v", tt.Texts())
	}
}
