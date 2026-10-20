package main

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"sync"
	"sync/atomic"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/plugins/terminal"
	"github.com/egoist/mygo/ui"
)

// Reserve a session before creating native objects, without holding a mutex
// across calls that wait for the UI thread (including dialogs and Focus).
type repositoryTerminals struct {
	mu       sync.Mutex
	sessions map[string]*repositoryTerminal
	closing  bool
}

type repositoryTerminal struct {
	ready  chan struct{}
	win    *mygo.Window
	term   *terminal.Terminal
	prompt atomic.Bool
}

func (g *Git) openRepositoryTerminal(ctx context.Context, root string) error {
	if g.ephemeral {
		return errors.New("隔离测试模式不允许启动交互式终端")
	}
	g.terminals.mu.Lock()
	if g.terminals.closing {
		g.terminals.mu.Unlock()
		return errors.New("正在关闭终端，请先完成退出确认")
	}
	if old := g.terminals.sessions[root]; old != nil {
		g.terminals.mu.Unlock()
		select {
		case <-old.ready:
			if old.win != nil {
				old.win.Focus()
				return nil
			}
			return errors.New("终端未能启动，请重试")
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	if len(g.terminals.sessions) >= 8 {
		g.terminals.mu.Unlock()
		return errors.New("最多同时打开 8 个仓库终端，请先关闭不再使用的窗口")
	}
	s := &repositoryTerminal{ready: make(chan struct{})}
	if g.terminals.sessions == nil {
		g.terminals.sessions = make(map[string]*repositoryTerminal)
	}
	g.terminals.sessions[root] = s
	g.terminals.mu.Unlock()
	defer close(s.ready)
	term, err := terminal.New(repositoryTerminalOptions(root))
	if err != nil {
		g.terminals.mu.Lock()
		delete(g.terminals.sessions, root)
		g.terminals.mu.Unlock()
		return fmt.Errorf("无法创建内置终端，请检查终端运行库和系统 Shell：%w", err)
	}
	s.term = term
	s.win = mygo.NewWindow(mygo.WindowOptions{
		Title: "SakuraGit · 终端 · " + filepath.Base(root),
		Width: 1080, Height: 700, MinWidth: 640, MinHeight: 400,
		StateKey: "repository-terminal",
		Content:  ui.View(repositoryTerminalView(root, term)),
	})
	s.win.OnClose(func(e *mygo.CloseEvent) {
		if terminalRunning(term.Done()) {
			e.PreventDefault()
			g.terminals.mu.Lock()
			closing := g.terminals.closing
			g.terminals.mu.Unlock()
			if closing {
				return
			}
			if s.prompt.CompareAndSwap(false, true) {
				go func() {
					defer s.prompt.Store(false)
					if confirmTerminalClose(s.win, 1) {
						if err := stopTerminalWindows([]*repositoryTerminal{s}); err != nil {
							_, _ = mygo.Dialog.Message(mygo.MessageOptions{Parent: s.win, Type: mygo.MessageWarning, Message: "终端尚未停止，已保留窗口", Detail: err.Error()})
						} else {
							s.win.Close()
						}
					}
				}()
			}
		}
	})
	s.win.OnClosed(func() {
		go term.Close()
		g.terminals.mu.Lock()
		if g.terminals.sessions[root] == s {
			delete(g.terminals.sessions, root)
		}
		g.terminals.mu.Unlock()
	})
	go func() {
		<-term.Done()
		<-s.ready
		s.win.Invalidate()
	}()
	return nil
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
				status = fmt.Sprintf("Shell 已退出（%d）· 输出保留在本窗口 · 关闭后可重新打开", term.ExitCode())
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

// Both app quit and closing the workspace must account for terminal windows.
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
			if !completed {
				g.terminals.mu.Lock()
				g.terminals.closing = false
				g.terminals.mu.Unlock()
				// The Git-operation guard may already have approved quitting.
				// Canceling this second confirmation must leave the app usable.
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
			_, _ = mygo.Dialog.Message(mygo.MessageOptions{Parent: win, Type: mygo.MessageWarning, Message: "终端尚未停止，已保留窗口", Detail: err.Error()})
			return
		}
		for _, s := range sessions {
			if s.win != nil {
				s.win.Close()
			}
		}
		g.terminals.mu.Lock()
		g.terminals.closing = false
		g.terminals.mu.Unlock()
		// The next close/quit request rechecks both guards, including any
		// session or Git operation opened while this dialog was displayed.
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
