package main

import (
	"encoding/json"
	"fmt"
	"github.com/egoist/mygo"
	"sync/atomic"
	"time"
)

// The smoke runner only reads repository data and navigates UI; fixture edits happen externally.
func startSmoke(win *mygo.Window, ok *atomic.Bool, autoFile string) {
	go func() {
		phase := 0
		for deadline := time.Now().Add(45 * time.Second); time.Now().Before(deadline); {
			result, err := win.Page().Eval(`JSON.stringify({ready:document.documentElement.dataset.ready,root:document.querySelector('[data-repo-root]')?.dataset.repoRoot,files:document.querySelectorAll('[data-testid="file-row"]').length,paths:[...document.querySelectorAll('.file-select')].map(n=>n.title),diffLines:document.querySelectorAll('.diff-line').length,hunks:document.querySelectorAll('.hunk-action').length,historyReady:!!document.querySelector('.commit-summary')&&!document.querySelector('.commit-details .spin'),historyEmpty:!!document.querySelector('.history-panel .empty-state'),author:document.querySelector('.author-identity')?.textContent,historyFiles:document.querySelectorAll('.commit-file').length,settings:!!document.querySelector('#code-size'),stashReady:!!document.querySelector('.stash-list-panel')&&!document.querySelector('.stash-workbench .spin'),stashItems:document.querySelectorAll('.stash-item').length,remotesReady:!!document.querySelector('.environment-grid'),remoteItems:document.querySelectorAll('.remote-card').length,error:document.querySelector('[role="alert"]')?.textContent})`)
			if err == nil {
				text, _ := result.(string)
				var state map[string]any
				_ = json.Unmarshal([]byte(text), &state)
				if state["ready"] == "true" && state["root"] != nil && state["root"] != "" && state["error"] == nil {
					switch {
					case phase == 0 && (state["files"] == float64(0) || state["diffLines"].(float64) > 0):
						fmt.Println("GITLANE_SMOKE_WORKSPACE", text)
						if state["files"] != float64(0) {
							_, _ = win.Page().Eval(`document.querySelector('[aria-label="专注阅读差异"]').click()`)
							phase = 20
							break
						}
						_, _ = win.Page().Eval(`document.querySelector('[aria-label="提交历史"]').click()`)
						phase = 1
					case phase == 20:
						value, _ := win.Page().Eval(`JSON.stringify((()=>{const m=document.querySelector('.diff-focus-modal');if(!m)return null;const r=m.getBoundingClientRect();return {contained:r.top>=0&&r.left>=0&&r.bottom<=innerHeight+1&&r.right<=innerWidth+1,lines:document.querySelectorAll('.diff-focus-modal .diff-line').length};})())`)
						focusText, _ := value.(string)
						var focus map[string]any
						_ = json.Unmarshal([]byte(focusText), &focus)
						if focus["contained"] != true || focus["lines"] == nil || focus["lines"] == float64(0) {
							break
						}
						fmt.Println("GITLANE_SMOKE_DIFF_FOCUS", focusText)
						_, _ = win.Page().Eval(`document.querySelector('[aria-label="关闭对话框"]').click();document.querySelector('[aria-label="提交历史"]').click()`)
						phase = 1
					case phase == 1 && (state["historyReady"] == true || state["historyEmpty"] == true):
						fmt.Println("GITLANE_SMOKE_HISTORY", text)
						_ = settingsRequested.Emit(win, true)
						phase = 2
					case phase == 2 && state["settings"] == true:
						fmt.Println("GITLANE_SMOKE_SETTINGS", text)
						_, _ = win.Page().Eval(`document.querySelector('[aria-label="关闭对话框"]').click();document.querySelector('[aria-label="工作现场"]').click()`)
						phase = 3
					case phase == 3 && state["stashReady"] == true && (state["stashItems"] == float64(0) || state["diffLines"].(float64) > 0):
						fmt.Println("GITLANE_SMOKE_STASH", text)
						_, _ = win.Page().Eval(`document.querySelector('[aria-label="仓库连接"]').click()`)
						phase = 4
					case phase == 4 && state["remotesReady"] == true:
						fmt.Println("GITLANE_SMOKE_REMOTES", text)
						_, _ = win.Page().Eval(`document.querySelector('.remote-settings-panel .collection-header button').click()`)
						phase = 5
					case phase == 5:
						bounds, _ := win.Page().Eval(`JSON.stringify((()=>{const overlay=document.querySelector('.modal-backdrop');const modal=document.querySelector('[role="dialog"]');if(!overlay||!modal)return null;const r=overlay.getBoundingClientRect();const m=modal.getBoundingClientRect();return {portal:overlay.parentElement===document.body,viewport:Math.abs(r.top)<1&&Math.abs(r.left)<1&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1,contained:m.top>=0&&m.left>=0&&m.bottom<=innerHeight+1&&m.right<=innerWidth+1};})())`)
						boundsText, _ := bounds.(string)
						var modal map[string]bool
						_ = json.Unmarshal([]byte(boundsText), &modal)
						if !modal["portal"] || !modal["viewport"] || !modal["contained"] {
							break
						}
						fmt.Println("GITLANE_SMOKE_REMOTE_DIALOG", boundsText)
						_, _ = win.Page().Eval(`document.querySelector('[aria-label="关闭对话框"]').click()`)
						if autoFile == "" {
							ok.Store(true)
							fmt.Println("GITLANE_SMOKE", text)
							mygo.App.Quit()
							return
						}
						_, _ = win.Page().Eval(`document.querySelector('[aria-label="工作区"]').click()`)
						phase = 6
					case phase == 6:
						found := false
						if paths, isArray := state["paths"].([]any); isArray {
							for _, path := range paths {
								found = found || path == autoFile
							}
						}
						if found {
							fmt.Println("GITLANE_SMOKE_AUTO_REFRESH", text)
							_, _ = win.Page().Eval(`document.querySelector('.heading-actions .primary').click()`)
							phase = 7
						}
					case phase == 7:
						value, _ := win.Page().Eval(`JSON.stringify((()=>{const route=document.querySelector('.sync-route');if(!route)return null;const source=route.querySelector('.sync-endpoint strong')?.textContent;const target=route.querySelector('.destination strong')?.textContent;const remote=route.querySelector('.destination small')?.textContent;const command=document.querySelector('.command-details > code')?.textContent;return {source,target,remote,command,collapsed:!document.querySelector('.command-details')?.open};})())`)
						planText, _ := value.(string)
						var plan map[string]any
						_ = json.Unmarshal([]byte(planText), &plan)
						if plan["source"] == "main" && plan["target"] == "main" && plan["remote"] == "origin" && plan["collapsed"] == true && plan["command"] == "git push --no-force --no-follow-tags --recurse-submodules=no origin HEAD:refs/heads/main" {
							ok.Store(true)
							fmt.Println("GITLANE_SMOKE_PUSH_PLAN", planText)
							fmt.Println("GITLANE_SMOKE", text)
							mygo.App.Quit()
							return
						}
					}
				}
			}
			time.Sleep(250 * time.Millisecond)
		}
		fmt.Printf("GITLANE_SMOKE_FAILED: stopped at phase %d\n", phase)
		mygo.App.Quit()
	}()
}
