package main

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/egoist/mygo"
	"github.com/egoist/mygo/plugins/terminal"
	"github.com/egoist/mygo/ui"
)

var terminalDockChanged = mygo.NewEvent[bool]("terminal-dock-changed")

// Native chrome and Ghostty surround the existing React page. The page is
// never recreated when the dock hides, maximizes, or switches repositories.
type desktopWorkbench struct {
	git               *Git
	win               *mygo.Window
	page              *mygo.WebView
	root              string
	visible, expanded bool
	modal             bool
	percent           float32
	palette           string
	saveMu            sync.Mutex
	saveTimer         *time.Timer
	saveVersion       uint64
}

func newDesktopWorkbench(g *Git, background, stateKey string, p Preferences) *mygo.Window {
	d := &desktopWorkbench{git: g, percent: 65, palette: p.Palette}
	if dir, err := mygo.App.Path(mygo.PathUserData); err == nil {
		data, _ := os.ReadFile(filepath.Join(dir, "terminal-layout.json"))
		var value float32
		if json.Unmarshal(data, &value) == nil && value >= 20 && value <= 80 {
			d.percent = value
		}
	}
	g.desktop = d
	d.win = mygo.NewWindow(mygo.WindowOptions{
		Title: "SakuraGit", Width: 1440, Height: 920, MinWidth: 900, MinHeight: 620,
		TitleBarStyle: mygo.TitleBarHiddenInset, TitleBarHeight: 40, BackgroundColor: background, StateKey: stateKey,
		Content: ui.View(d.view),
	})
	page, err := d.win.NewWebView(mygo.WebViewOptions{URL: "/", BackgroundColor: background,
		Page: mygo.PageOptions{PreloadScript: `window.__SAKURAGIT_EMBEDDED__ = true;` + desktopGuard},
	})
	if err != nil {
		log.Fatalf("Cannot create workbench page: %v", err)
	}
	d.page = page
	d.win.Invalidate()
	page.Focus()
	return d.win
}

func (d *desktopWorkbench) publish() { _ = terminalDockChanged.EmitPage(d.page.Page(), d.visible) }
func (d *desktopWorkbench) hide() {
	d.visible, d.expanded = false, false
	d.publish()
	d.page.Focus()
}
func (d *desktopWorkbench) openSettings() {
	d.expanded = false
	d.page.Focus()
	_ = settingsRequested.EmitPage(d.page.Page(), true)
}

func (g *Git) WorkbenchModal(open bool) {
	if d := g.desktop; d != nil {
		d.win.Update(func() {
			d.modal = open
			if open {
				d.page.Focus()
			}
		})
	}
}
func (d *desktopWorkbench) setRoot(root string) {
	d.win.Update(func() { d.root = root; d.expanded = false; d.publish() })
}

func (d *desktopWorkbench) persistSplit() {
	value := d.percent
	dir, err := mygo.App.Path(mygo.PathUserData)
	if err != nil {
		return
	}
	d.saveMu.Lock()
	defer d.saveMu.Unlock()
	d.saveVersion++
	version := d.saveVersion
	if d.saveTimer != nil {
		d.saveTimer.Stop()
	}
	d.saveTimer = time.AfterFunc(400*time.Millisecond, func() {
		d.saveMu.Lock()
		defer d.saveMu.Unlock()
		if version != d.saveVersion {
			return
		}
		{
			data, _ := json.Marshal(value)
			f, err := os.CreateTemp(dir, ".terminal-layout-")
			if err != nil {
				return
			}
			defer os.Remove(f.Name())
			if _, err = f.Write(data); err != nil {
				f.Close()
				return
			}
			if err = f.Close(); err == nil {
				_ = os.Rename(f.Name(), filepath.Join(dir, "terminal-layout.json"))
			}
		}
	})
}

func (d *desktopWorkbench) view(c *ui.Context) {
	theme := *c.Theme()
	light, dark := terminalPalette(d.palette)
	colors := light
	if theme.Dark {
		colors = dark
	}
	theme.Background, theme.Text = colors.Background, colors.Foreground
	theme.Accent = ui.Hex("#668ba3")
	theme.Spacing, theme.FontSize = 3, 12
	c.SetTheme(&theme)
	if d.page == nil {
		ui.Text(c, "SakuraGit 正在启动…")
		return
	}
	ui.Column(c).Fill().Children(func() {
		bar := c.TitleBar()
		ui.Row(c).Height(max(bar.Height, 40)).Padding(0, max(bar.Right, 12), 0, max(bar.Left, 12)).Gap(12).DragWindow().Children(func() {
			ui.Text(c, "SakuraGit").Grow(1)
			if ui.Button(c, "设置").Clicked() {
				d.openSettings()
			}
		})
		if d.visible && d.expanded && !d.modal {
			d.terminalView(c)
		} else if d.visible && !d.modal {
			if ui.SplitVerticalPercent(c, &d.percent,
				func() { ui.WebView(c, d.page).Fill() },
				func() { d.terminalView(c) },
			).Grow(1).FillWidth().Changed() {
				d.percent = max(20, min(80, d.percent))
				d.persistSplit()
			}
		} else {
			ui.WebView(c, d.page).Grow(1).FillWidth()
		}
	})
	// When the native terminal owns focus, the page cannot hear shortcuts.
	if c.Shortcut(ui.Cmd, ui.KeyBackquote) && d.visible {
		d.hide()
	}
}

func (d *desktopWorkbench) terminalView(c *ui.Context) {
	g := d.git
	g.terminals.mu.Lock()
	sessions := []*repositoryTerminal{}
	var active *repositoryTerminal
	for _, s := range g.terminals.sessions {
		if s.root != d.root {
			continue
		}
		select {
		case <-s.ready:
			if s.term != nil {
				sessions = append(sessions, s)
			}
		default:
		}
	}
	sort.Slice(sessions, func(i, j int) bool {
		if sessions[i].sequence == sessions[j].sequence {
			return sessions[i].id < sessions[j].id
		}
		return sessions[i].sequence < sessions[j].sequence
	})
	for _, s := range sessions {
		if g.terminals.active[d.root] == s.id {
			active = s
		}
	}
	if active == nil && len(sessions) > 0 {
		active = sessions[0]
		g.terminals.active[d.root] = active.id
	}
	g.terminals.mu.Unlock()
	ui.Column(c).Fill().Children(func() {
		ui.Row(c).Padding(6).Gap(6).Children(func() {
			ui.Text(c, "终端").FontSize(12)
			for i, s := range sessions {
				label := fmtTerminalTab(i, s == active, terminalRunning(s.term.Done()))
				if s.label != "" {
					label = strings.Replace(label, "Shell "+string(rune('1'+i)), s.label, 1)
				}
				if ui.Button(c, label).Clicked() {
					g.terminals.mu.Lock()
					g.terminals.active[d.root] = s.id
					g.terminals.mu.Unlock()
					s.focus.Store(true)
				}
			}
			ui.Text(c, "").Grow(1)
			if d.root != "" && ui.Button(c, "新建终端").Clicked() {
				go g.reportTerminalOpen(d.root, true)
			}
			label := "最大化"
			if d.expanded {
				label = "恢复面板"
			}
			if ui.Button(c, label).Clicked() {
				d.expanded = !d.expanded
			}
			if active != nil && ui.Button(c, "关闭会话").Clicked() {
				g.closeTerminal(active)
			}
			if ui.Button(c, "收起").Clicked() {
				d.hide()
			}
		})
		ui.Row(c).Padding(4, 10).Children(func() {
			ui.Text(c, d.root).Font("monospace").FontSize(11).SingleLine().Grow(1)
			if ui.Button(c, "复制路径").Clicked() {
				c.WriteClipboard(d.root)
			}
		})
		if active == nil {
			ui.Text(c, "当前仓库没有终端会话 · 点击新建终端 · 其他仓库的会话继续在后台运行").Grow(1)
		} else {
			v := terminal.View(c, active.term).Grow(1).FillWidth()
			if active.focus.Swap(false) {
				v.Focus()
			}
			text := "真实 Shell · 收起不结束会话 · Cmd/Ctrl+` 切换面板 · 关闭会话将结束程序"
			if !terminalRunning(active.term.Done()) {
				text = "Shell 已退出 · 输出保留在标签中 · 点击新建终端重新启动"
			}
			ui.Text(c, text).FontSize(10).Padding(5)
		}
	})
}

func fmtTerminalTab(index int, active, running bool) string {
	label := "Shell " + string(rune('1'+index))
	if !running {
		label += " · 已退出"
	}
	if active {
		label = "● " + label
	}
	return label
}

func terminalPalette(palette string) (*terminal.Theme, *terminal.Theme) {
	light, dark := terminal.LightTheme(), terminal.DarkTheme()
	pairs := map[string][4]string{
		"mist":     {"#f3f6f8", "#273d50", "#17212a", "#e0eaf1"},
		"graphite": {"#f7f7f8", "#343740", "#202125", "#e6e7ee"},
		"forest":   {"#f2f6f2", "#2d4439", "#192720", "#dcebe0"},
		"sand":     {"#f8f5ee", "#514534", "#29251e", "#eee5d6"},
	}
	colors, ok := pairs[palette]
	if !ok {
		colors = pairs["mist"]
	}
	light.Background, light.Foreground = ui.Hex(colors[0]), ui.Hex(colors[1])
	dark.Background, dark.Foreground = ui.Hex(colors[2]), ui.Hex(colors[3])
	return light, dark
}

func (g *Git) updateTerminalPreferences(p Preferences) {
	if d := g.desktop; d != nil {
		d.win.Update(func() { d.palette = p.Palette })
	}
	g.terminals.mu.Lock()
	sessions := []*repositoryTerminal{}
	for _, s := range g.terminals.sessions {
		sessions = append(sessions, s)
	}
	g.terminals.mu.Unlock()
	light, dark := terminalPalette(p.Palette)
	for _, s := range sessions {
		select {
		case <-s.ready:
			if s.term != nil {
				s.term.SetTheme(light, dark)
			}
		default:
		}
	}
}
