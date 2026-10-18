package main

import (
	"testing"

	"github.com/egoist/mygo"
)

func checkNoReload(t *testing.T, items []*mygo.MenuItem) {
	t.Helper()
	for _, item := range items {
		if item.Role == mygo.RoleReload || item.Role == mygo.RoleForceReload || item.Role == mygo.RoleToggleDevTools {
			t.Fatalf("browser action exposed in desktop menu: %s", item.Role)
		}
		checkNoReload(t, item.Submenu)
	}
}

func TestApplicationMenuDoesNotExposeReload(t *testing.T) {
	items := mygo.NewMenu(applicationMenu()).Items()
	checkNoReload(t, items)
	roles := map[mygo.MenuRole]bool{}
	var walk func([]*mygo.MenuItem)
	walk = func(items []*mygo.MenuItem) {
		for _, item := range items {
			roles[item.Role] = true
			walk(item.Submenu)
		}
	}
	walk(items)
	for _, role := range []mygo.MenuRole{mygo.RoleCopy, mygo.RolePaste, mygo.RoleUndo, mygo.RoleToggleFullScreen, mygo.RoleZoomIn, mygo.RoleQuit} {
		if !roles[role] {
			t.Fatalf("lost desktop menu action %s", role)
		}
	}
}

func TestTextMenuPreservesEditingWithoutBrowserActions(t *testing.T) {
	if len(textMenu(false, false)) != 0 {
		t.Fatal("blank areas should not open a menu")
	}
	copy := textMenu(false, true)
	if len(copy) != 1 || copy[0].Role != mygo.RoleCopy {
		t.Fatal("selected code must remain copyable")
	}
	items := mygo.NewMenu(textMenu(true, false)).Items()
	checkNoReload(t, items)
	roles := map[mygo.MenuRole]bool{}
	for _, item := range items {
		roles[item.Role] = true
	}
	for _, role := range []mygo.MenuRole{mygo.RoleCut, mygo.RoleCopy, mygo.RolePaste, mygo.RoleUndo, mygo.RoleRedo, mygo.RoleSelectAll} {
		if !roles[role] {
			t.Fatalf("lost text editing action %s", role)
		}
	}
}
