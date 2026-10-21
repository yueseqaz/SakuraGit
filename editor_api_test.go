package main

import "testing"

func TestEditorExitStateDoesNotBypassNewDirtyBuffers(t *testing.T) {
	g := &Git{}
	if g.protectEditor(nil, true) {
		t.Fatal("blocked a clean editor")
	}
	g.editorExitApproved.Store(true)
	g.EditorDirty(1)
	if g.editorDirty.Load() != 1 || g.editorExitApproved.Load() {
		t.Fatal("new edits retained exit approval")
	}
	g.editorPrompt.Store(true)
	if !g.protectEditor(nil, true) {
		t.Fatal("did not protect an existing dirty prompt")
	}
	g.exitApproved = true
	g.exitEditorCanceled()
	if g.exitApproved || g.editorExitApproved.Load() {
		t.Fatal("cancel left writing locked or editor exit approved")
	}
	g.EditorDirty(-1)
	if g.editorDirty.Load() != 0 {
		t.Fatal("negative dirty count")
	}
}
