package main

import (
	"context"
	_ "embed"

	"github.com/egoist/mygo"
)

//go:embed desktop-guard.js
var desktopGuard string

func applicationMenu() []*mygo.MenuItem {
	return []*mygo.MenuItem{
		{Role: mygo.RoleAppMenu, Submenu: []*mygo.MenuItem{
			{Role: mygo.RoleAbout}, mygo.Separator(),
			{Label: "设置…", Accelerator: "CmdOrCtrl+,", Click: func(_ *mygo.MenuItem, win *mygo.Window) { _ = settingsRequested.Broadcast(true) }},
			mygo.Separator(), {Role: mygo.RoleServices},
			mygo.Separator(), {Role: mygo.RoleHide}, {Role: mygo.RoleHideOthers}, {Role: mygo.RoleUnhide},
			mygo.Separator(), {Role: mygo.RoleQuit},
		}},
		{Role: mygo.RoleFileMenu}, {Role: mygo.RoleEditMenu},
		// The framework's default View menu includes page reload shortcuts.
		{Role: mygo.RoleViewMenu, Submenu: []*mygo.MenuItem{
			{Role: mygo.RoleResetZoom}, {Role: mygo.RoleZoomIn}, {Role: mygo.RoleZoomOut},
			mygo.Separator(), {Role: mygo.RoleToggleFullScreen},
		}},
		{Role: mygo.RoleWindowMenu},
	}
}

func textMenu(editable, selected bool) []*mygo.MenuItem {
	if editable {
		return []*mygo.MenuItem{
			{Role: mygo.RoleUndo}, {Role: mygo.RoleRedo}, mygo.Separator(),
			{Role: mygo.RoleCut}, {Role: mygo.RoleCopy}, {Role: mygo.RolePaste},
			mygo.Separator(), {Role: mygo.RoleSelectAll},
		}
	}
	if selected {
		return []*mygo.MenuItem{{Role: mygo.RoleCopy}}
	}
	return nil
}

func (g *Git) TextContextMenu(ctx context.Context, editable, selected bool) {
	win := mygo.CallerWindow(ctx)
	if items := textMenu(editable, selected); len(items) > 0 && win != nil {
		mygo.NewMenu(items).Popup(win)
	}
}
