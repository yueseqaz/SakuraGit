package main

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/plugins/terminal"
	"github.com/egoist/mygo/ui"
)

type repositoryTerminals struct {
	mu       sync.Mutex
	sessions map[string]*repositoryTerminal
	active   map[string]string
	closing  bool
}
type repositoryTerminal struct {
	id, root string
	ready    chan struct{}
	win      *mygo.Window
	term     *terminal.Terminal
	prompt   atomic.Bool
	focus    atomic.Bool
}

func (g *Git) openRepositoryTerminal(ctx context.Context, root string) error {
	return g.createRepositoryTerminal(ctx, root, false)
}

func (g *Git) createRepositoryTerminal(ctx context.Context, root string, fresh bool) error {
	if g.ephemeral {
		return errors.New("隔离测试模式不允许启动交互式终端")
	}
	g.terminals.mu.Lock()
	if g.terminals.closing {
		g.terminals.mu.Unlock()
		return errors.New("正在关闭终端，请先完成退出确认")
	}
	if !fresh {
		var old *repositoryTerminal
		for _, s := range g.terminals.sessions {
			if s.root == root {
				old = s
				if g.terminals.active[root] == s.id {
					break
				}
			}
		}
		if old != nil {
			g.terminals.mu.Unlock()
			select {
			case <-old.ready:
				if old.term == nil {
					return errors.New("终端未能启动，请重试")
				}
				g.showTerminal(root, old.id)
				return nil
			case <-ctx.Done():
				return ctx.Err()
			}
		}
	}
	if len(g.terminals.sessions) >= 8 {
		g.terminals.mu.Unlock()
		return errors.New("最多同时运行 8 个终端，请先关闭不再使用的标签")
	}
	if g.desktop == nil {
		g.terminals.mu.Unlock()
		return errors.New("终端工作台尚未就绪")
	}
	s := &repositoryTerminal{id: rand.Text(), root: root, ready: make(chan struct{}), win: g.desktop.win}
	if g.terminals.sessions == nil {
		g.terminals.sessions = map[string]*repositoryTerminal{}
	}
	if g.terminals.active == nil {
		g.terminals.active = map[string]string{}
	}
	g.terminals.sessions[s.id] = s
	g.terminals.mu.Unlock()
	term, err := terminal.New(repositoryTerminalOptions(root))
	if err == nil {
		s.term = term
		p := loadPreferences()
		light, dark := terminalPalette(p.Palette)
		term.SetTheme(light, dark)
	}
	close(s.ready)
	if err != nil {
		g.terminals.mu.Lock()
		delete(g.terminals.sessions, s.id)
		g.terminals.mu.Unlock()
		return fmt.Errorf("无法创建内置终端，请检查终端运行库和系统 Shell：%w", err)
	}
	g.showTerminal(root, s.id)
	go func() { <-term.Done(); s.win.Invalidate() }()
	return nil
}

func (g *Git) showTerminal(root, id string) {
	if d := g.desktop; d != nil {
		d.win.Update(func() {
			g.terminals.mu.Lock()
			if g.terminals.closing {
				g.terminals.mu.Unlock()
				return
			}
			if s := g.terminals.sessions[id]; s != nil {
				s.focus.Store(true)
				g.terminals.active[root] = id
			}
			g.terminals.mu.Unlock()
			// A delayed shell startup must never switch the visible repository back.
			if d.root == root {
				d.visible = true
				d.publish()
			}
		})
	}
}

func (g *Git) ToggleTerminal(ctx context.Context, root string) error {
	if _, err := g.engine.DevelopmentPath(ctx, root, ""); err != nil {
		return err
	}
	if g.ephemeral || g.desktop == nil {
		return errors.New("此模式不提供交互式终端")
	}
	// Toggle on the UI thread; creating a shell stays off the UI thread.
	d := g.desktop
	d.win.Update(func() {
		if d.visible && d.root == root {
			d.hide()
			return
		}
		go g.reportTerminalOpen(root, false)
	})
	return nil
}
func (g *Git) reportTerminalOpen(root string, fresh bool) {
	if err := g.createRepositoryTerminal(context.Background(), root, fresh); err != nil {
		_, _ = mygo.Dialog.Message(mygo.MessageOptions{Parent: g.desktop.win, Type: mygo.MessageWarning, Message: "终端未能打开", Detail: err.Error()})
	}
}

func (g *Git) closeTerminal(s *repositoryTerminal) {
	if !s.prompt.CompareAndSwap(false, true) {
		return
	}
	go func() {
		defer s.prompt.Store(false)
		if terminalRunning(s.term.Done()) && !confirmTerminalClose(s.win, 1) {
			return
		}
		if err := stopTerminalWindows([]*repositoryTerminal{s}); err != nil {
			_, _ = mygo.Dialog.Message(mygo.MessageOptions{Parent: s.win, Type: mygo.MessageWarning, Message: "终端尚未停止", Detail: err.Error()})
			return
		}
		g.terminals.mu.Lock()
		delete(g.terminals.sessions, s.id)
		if g.terminals.active[s.root] == s.id {
			delete(g.terminals.active, s.root)
		}
		g.terminals.mu.Unlock()
		s.win.Invalidate()
	}()
}

func repositoryTerminalOptions(root string) terminal.Options {
	light, dark := terminal.LightTheme(), terminal.DarkTheme()
	light.Background, light.Foreground = ui.Hex("#f3f6f8"), ui.Hex("#263b49")
	dark.Background, dark.Foreground = ui.Hex("#17212a"), ui.Hex("#d8e4eb")
	return terminal.Options{
		Dir: root, Env: []string{"GIT_TERMINAL_PROMPT=1"},
		Font: terminal.Font{Size: 13}, Scrollback: 10 << 20,
		Theme: light, DarkTheme: dark,
		ClipboardRead: terminal.ClipboardDeny, NoClipboardWrite: true,
	}
}

func repositoryTerminalView(root string, term *terminal.Terminal) func(*ui.Context) {
	return func(c *ui.Context) {
		theme := *c.Theme()
		theme.Accent = ui.Hex("#668ba3")
		c.SetTheme(&theme)
		ui.Column(c).Fill().Children(func() {
			ui.Row(c).Padding(10).Gap(12).Children(func() {
				ui.Text(c, root).Font("monospace").SingleLine().Grow(1)
				if ui.Button(c, "复制路径").Clicked() {
					c.WriteClipboard(root)
				}
			})
			terminal.View(c, term).Grow(1).FillWidth().AutoFocus()
			status := "真实 Shell · 命令不受 Git 按钮限制 · Ctrl+C 中断 · 右键复制/粘贴 · 按住 Cmd/Ctrl 滚轮缩放"
			if !terminalRunning(term.Done()) {
				status = fmt.Sprintf("Shell 已退出（%d）· 输出保留在当前标签 · 新建终端可重新启动", term.ExitCode())
			}
			ui.Text(c, status).FontSize(11).Padding(8)
		})
	}
}

func terminalRunning(done <-chan struct{}) bool {
	select {
	case <-done:
		return false
	default:
		return true
	}
}

func confirmTerminalClose(win *mygo.Window, count int) bool {
	choice, err := mygo.Dialog.Message(mygo.MessageOptions{
		Parent: win, Type: mygo.MessageWarning, Title: "终端会话仍在运行",
		Message: fmt.Sprintf("关闭 %d 个终端会话并结束其中的程序？", count),
		Detail:  "即使只有 Shell 提示符，会话也会被视为正在运行。开发服务、SSH 和编辑器可能被中断；已脱离终端的后台进程不保证随之退出。终端命令不会自动回滚。",
		Buttons: []string{"保留终端", "结束会话并关闭"}, DefaultButton: 0, CancelButton: 0,
	})
	return err == nil && choice.Button == 1
}

// Hiding the dock never stops a process. Closing the workspace checks every
// session, including hidden repositories, before it can destroy the host.
func (g *Git) protectTerminals(win *mygo.Window, quit bool) bool {
	g.terminals.mu.Lock()
	if len(g.terminals.sessions) == 0 {
		g.terminals.mu.Unlock()
		return false
	}
	if g.terminals.closing {
		g.terminals.mu.Unlock()
		return true
	}
	var sessions []*repositoryTerminal
	for _, s := range g.terminals.sessions {
		if s.prompt.Load() {
			g.terminals.mu.Unlock()
			g.operationMu.Lock()
			g.exitApproved = false
			g.operationMu.Unlock()
			return true
		}
		sessions = append(sessions, s)
	}
	g.terminals.closing = true
	g.terminals.mu.Unlock()
	go func() {
		completed := false
		defer func() {
			g.terminals.mu.Lock()
			g.terminals.closing = false
			g.terminals.mu.Unlock()
			if !completed {
				g.operationMu.Lock()
				g.exitApproved = false
				g.operationMu.Unlock()
			}
		}()
		running := 0
		for _, s := range sessions {
			select {
			case <-s.ready:
				if s.term != nil && terminalRunning(s.term.Done()) {
					running++
				}
			default:
				running++
			}
		}
		if running > 0 && !confirmTerminalClose(win, running) {
			return
		}
		if err := stopTerminalWindows(sessions); err != nil {
			_, _ = mygo.Dialog.Message(mygo.MessageOptions{Parent: win, Type: mygo.MessageWarning, Message: "终端尚未停止，已保留工作台", Detail: err.Error()})
			return
		}
		g.terminals.mu.Lock()
		for _, s := range sessions {
			delete(g.terminals.sessions, s.id)
		}
		g.terminals.closing = false
		g.terminals.mu.Unlock()
		completed = true
		if quit {
			mygo.App.Quit()
		} else if win != nil {
			win.Close()
		}
	}()
	return true
}

type terminalProcess interface {
	Close() error
	Done() <-chan struct{}
}

func stopTerminalProcess(ctx context.Context, process terminalProcess) error {
	finished := make(chan error, 1)
	go func() {
		_ = process.Close()
		select {
		case <-process.Done():
			finished <- nil
		case <-ctx.Done():
			finished <- ctx.Err()
		}
	}()
	select {
	case err := <-finished:
		return err
	case <-ctx.Done():
		return ctx.Err()
	}
}

func stopTerminalWindows(sessions []*repositoryTerminal) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	results := make(chan error, len(sessions))
	for _, s := range sessions {
		go func() {
			select {
			case <-s.ready:
				if s.term == nil {
					results <- nil
				} else {
					results <- stopTerminalProcess(ctx, s.term)
				}
			case <-ctx.Done():
				results <- ctx.Err()
			}
		}()
	}
	for range sessions {
		if err := <-results; err != nil {
			return err
		}
	}
	return nil
}
