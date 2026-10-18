package main

import (
	"context"
	"encoding/json"
	"flag"
	"log"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"

	"github.com/egoist/mygo"
	"gitlane/internal/gitrepo"
)

type Recent struct {
	Name string `json:"name"`
	Path string `json:"path"`
}

type Startup struct {
	Recents []Recent `json:"recents"`
	Path    string   `json:"path"`
}

// Git exposes only repository-scoped operations, never arbitrary shell commands.
type Git struct {
	engine      gitrepo.Engine
	mu          sync.Mutex
	recents     []Recent
	settings    string
	startupPath string
	ephemeral   bool
}

func (g *Git) Bootstrap() (Startup, error) {
	g.mu.Lock()
	defer g.mu.Unlock()
	if g.ephemeral {
		return Startup{Recents: []Recent{}, Path: g.startupPath}, nil
	}
	if g.settings == "" {
		dir, err := mygo.App.Path(mygo.PathUserData)
		if err != nil {
			return Startup{}, err
		}
		g.settings = filepath.Join(dir, "recent-repositories.json")
		data, err := os.ReadFile(g.settings)
		if err == nil {
			if err := json.Unmarshal(data, &g.recents); err != nil {
				g.recents = nil
				log.Printf("Ignoring malformed recent repositories: %v", err)
			}
		} else if !os.IsNotExist(err) {
			return Startup{}, err
		}
	}
	return Startup{Recents: append([]Recent{}, g.recents...), Path: g.startupPath}, nil
}

func (g *Git) Open(ctx context.Context, path string) (gitrepo.Snapshot, error) {
	s, err := g.engine.Open(ctx, path)
	if err != nil {
		return s, err
	}
	g.mu.Lock()
	defer g.mu.Unlock()
	items := []Recent{{Name: s.Name, Path: s.Root}}
	for _, recent := range g.recents {
		if recent.Path != s.Root && len(items) < 8 {
			items = append(items, recent)
		}
	}
	g.recents = items
	if g.settings != "" {
		if err := os.MkdirAll(filepath.Dir(g.settings), 0700); err != nil {
			log.Printf("Cannot save recent repositories: %v", err)
		} else if data, err := json.MarshalIndent(items, "", "  "); err == nil {
			tmp := g.settings + ".tmp"
			if err := os.WriteFile(tmp, data, 0600); err == nil {
				if err := os.Rename(tmp, g.settings); err != nil {
					log.Printf("Cannot save recent repositories: %v", err)
				}
			} else {
				log.Printf("Cannot save recent repositories: %v", err)
			}
		}
	}
	return s, nil
}

func (g *Git) Choose(ctx context.Context) (*gitrepo.Snapshot, error) {
	paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{Parent: mygo.CallerWindow(ctx), Title: "打开 Git 仓库", Directory: true})
	if err != nil || len(paths) == 0 {
		return nil, err
	}
	s, err := g.Open(ctx, paths[0])
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func (g *Git) Snapshot(ctx context.Context, root string) (gitrepo.Snapshot, error) {
	return g.engine.Snapshot(ctx, root)
}

func (g *Git) Diff(ctx context.Context, root, path string, staged bool) (gitrepo.Diff, error) {
	return g.engine.Diff(ctx, root, path, staged)
}

func (g *Git) CommitDiff(ctx context.Context, root, hash string) (gitrepo.Diff, error) {
	return g.engine.CommitDiff(ctx, root, hash)
}

func (g *Git) CommitDetails(ctx context.Context, root, hash string) (gitrepo.CommitDetails, error) {
	return g.engine.CommitDetails(ctx, root, hash)
}

func (g *Git) CommitFileDiff(ctx context.Context, root, hash, path string) (gitrepo.Diff, error) {
	return g.engine.CommitFileDiff(ctx, root, hash, path)
}

func (g *Git) Publish(ctx context.Context, root, remote, branch string) (gitrepo.Result, error) {
	return g.engine.Publish(ctx, root, remote, branch)
}

func (g *Git) Stage(ctx context.Context, root string, paths []string, staged bool) (gitrepo.Result, error) {
	return g.engine.Stage(ctx, root, paths, staged)
}

func (g *Git) Commit(ctx context.Context, root, message string) (gitrepo.Result, error) {
	return g.engine.Commit(ctx, root, message)
}

func (g *Git) Branch(ctx context.Context, root, name string, create bool) (gitrepo.Result, error) {
	return g.engine.Branch(ctx, root, name, create)
}

func (g *Git) Sync(ctx context.Context, root, action, branch, remote, target string) (gitrepo.Result, error) {
	return g.engine.SyncConfirmed(ctx, root, action, branch, remote, target)
}

func main() {
	repo := flag.String("repo", "", "Open this repository on launch")
	smoke := flag.Bool("smoke", false, "Read-only native webview/IPC smoke test; requires --repo")
	autoFile := flag.String("smoke-auto-file", "", "In smoke mode, wait for this externally-created file to appear via automatic refresh")
	flag.Parse()
	if *smoke && *repo == "" {
		log.Fatal("--smoke requires --repo")
	}
	mygo.App.SetName("Gitlane")
	mygo.App.SetVersion("0.3.1")
	mygo.Bind(&Git{startupPath: *repo, ephemeral: *smoke})
	var smokeOK atomic.Bool
	mygo.App.WhenReady(func() {
		prefs := defaultPreferences()
		if !*smoke {
			prefs = loadPreferences()
		}
		mygo.Theme.SetSource(mygo.ThemeSource(prefs.Appearance))
		mygo.App.SetMenu(mygo.NewMenu([]*mygo.MenuItem{
			{Role: mygo.RoleAppMenu, Submenu: []*mygo.MenuItem{
				{Role: mygo.RoleAbout}, mygo.Separator(),
				{Label: "设置…", Accelerator: "CmdOrCtrl+,", Click: func(_ *mygo.MenuItem, win *mygo.Window) { _ = settingsRequested.Emit(win, true) }},
				mygo.Separator(), {Role: mygo.RoleServices},
				mygo.Separator(), {Role: mygo.RoleHide}, {Role: mygo.RoleHideOthers}, {Role: mygo.RoleUnhide},
				mygo.Separator(), {Role: mygo.RoleQuit},
			}},
			{Role: mygo.RoleFileMenu},
			{Role: mygo.RoleEditMenu}, {Role: mygo.RoleViewMenu}, {Role: mygo.RoleWindowMenu},
		}))
		background := "#f3f6f8"
		if mygo.Theme.IsDark() {
			background = "#17212a"
		}
		stateKey := "main"
		if *smoke {
			stateKey = ""
		}
		win := mygo.NewWindow(mygo.WindowOptions{
			Title: "Gitlane", URL: "/", Width: 1440, Height: 920, MinWidth: 900, MinHeight: 620,
			TitleBarStyle: mygo.TitleBarHiddenInset, TitleBarHeight: 48, BackgroundColor: background, StateKey: stateKey,
		})
		if *smoke {
			startSmoke(win, &smokeOK, *autoFile)
		}
	})
	if err := mygo.App.Run(); err != nil {
		log.Fatal(err)
	}
	if *smoke && !smokeOK.Load() {
		os.Exit(1)
	}
}
