package main

import (
	"encoding/json"
	"fmt"
	"github.com/egoist/mygo"
	"path/filepath"
	"sync/atomic"
	"time"
)

// The smoke runner only mutates its isolated fixture, including a local-only clone.
func startSmoke(win *mygo.Window, ok *atomic.Bool, autoFile string) {
	go func() {
		phase := 0
		cloneRoot := ""
		for deadline := time.Now().Add(45 * time.Second); time.Now().Before(deadline); {
			result, err := win.Page().Eval(`JSON.stringify({ready:document.documentElement.dataset.ready,root:document.querySelector('[data-repo-root]')?.dataset.repoRoot,files:document.querySelectorAll('[data-testid="file-row"]').length,paths:[...document.querySelectorAll('.file-select')].map(n=>n.title),diffLines:document.querySelectorAll('.diff-line').length,hunks:document.querySelectorAll('.hunk-action').length,historyReady:!!document.querySelector('.commit-summary')&&!document.querySelector('.commit-details .spin'),historyEmpty:!!document.querySelector('.history-panel .empty-state'),author:document.querySelector('.author-identity')?.textContent,historyFiles:document.querySelectorAll('.commit-file').length,settings:!!document.querySelector('#code-size'),stashReady:!!document.querySelector('.stash-list-panel')&&!document.querySelector('.stash-workbench .spin'),stashItems:document.querySelectorAll('.stash-item').length,remotesReady:!!document.querySelector('.environment-grid'),remoteItems:document.querySelectorAll('.remote-card').length,error:document.querySelector('[role="alert"]')?.textContent})`)
			if err == nil {
				text, _ := result.(string)
				var state map[string]any
				_ = json.Unmarshal([]byte(text), &state)
				if state["ready"] == "true" && state["root"] != nil && state["root"] != "" && state["error"] == nil {
					switch {
					case phase == 0 && (state["files"] == float64(0) || state["diffLines"].(float64) > 0):
						guard, _ := win.Page().Eval(`JSON.stringify((()=>{const menu=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});document.body.dispatchEvent(menu);const reload=new KeyboardEvent('keydown',{key:'r',metaKey:true,bubbles:true,cancelable:true});window.dispatchEvent(reload);const f5=new KeyboardEvent('keydown',{key:'F5',bubbles:true,cancelable:true});window.dispatchEvent(f5);const copy=new KeyboardEvent('keydown',{key:'c',metaKey:true,bubbles:true,cancelable:true});window.dispatchEvent(copy);return {contextBlocked:menu.defaultPrevented,reloadBlocked:reload.defaultPrevented,f5Blocked:f5.defaultPrevented,copyAllowed:!copy.defaultPrevented};})())`)
						guardText, _ := guard.(string)
						var checks map[string]bool
						_ = json.Unmarshal([]byte(guardText), &checks)
						if !checks["contextBlocked"] || !checks["reloadBlocked"] || !checks["f5Blocked"] || !checks["copyAllowed"] {
							break
						}
						fmt.Println("SAKURAGIT_SMOKE_DESKTOP_GUARD", guardText)
						fmt.Println("SAKURAGIT_SMOKE_WORKSPACE", text)
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
						syntax, _ := win.Page().Eval(`JSON.stringify({tokens:document.querySelectorAll('.diff-code .token').length,words:document.querySelectorAll('.diff-code .word-change').length,mode:document.querySelector('.diff-focus-modal .diff-panel')?.dataset.highlightMode})`)
						syntaxText, _ := syntax.(string)
						var counts struct {
							Tokens int
							Words  int
						}
						_ = json.Unmarshal([]byte(syntaxText), &counts)
						if counts.Tokens == 0 || counts.Words == 0 {
							break
						}
						fmt.Println("SAKURAGIT_SMOKE_DIFF_FOCUS", focusText)
						fmt.Println("SAKURAGIT_SMOKE_HIGHLIGHT", syntax)
						_, _ = win.Page().Eval(`document.querySelector('[aria-label="关闭对话框"]').click();document.querySelector('[aria-label="提交历史"]').click()`)
						phase = 1
					case phase == 1 && (state["historyReady"] == true || state["historyEmpty"] == true):
						fmt.Println("SAKURAGIT_SMOKE_HISTORY", text)
						more, _ := win.Page().Eval(`(()=>{const p=document.querySelector('.history-panel'),list=p?.querySelector('.commit-list');if(!list||p.dataset.hasMore!=='true')return false;list.scrollTop=list.scrollHeight;list.dispatchEvent(new Event('scroll'));return true;})()`)
						if more == true {
							phase = 11
							break
						}
						_ = settingsRequested.Emit(win, true)
						phase = 2
					case phase == 11:
						loaded, _ := win.Page().Eval(`(()=>{const p=document.querySelector('.history-panel'),list=p?.querySelector('.commit-list');if(!list)return false;list.scrollTop=list.scrollHeight;list.dispatchEvent(new Event('scroll'));if(p.dataset.loading==='true'||p.dataset.hasMore==='true')return false;const rows=p.querySelectorAll('.commit-row'),last=rows[rows.length-1];if(Number(p.dataset.loadedCount)!==426||rows.length>=40||!last?.textContent.includes('Native development workflow fixture'))return false;last.click();return {loaded:Number(p.dataset.loadedCount),rendered:rows.length,automatic:true};})()`)
						if loaded != false && loaded != nil {
							fmt.Println("SAKURAGIT_SMOKE_HISTORY_PAGES", loaded)
							phase = 12
						}
					case phase == 12 && state["historyReady"] == true:
						oldest, _ := win.Page().Eval(`document.querySelector('.commit-summary')?.textContent.includes('Native development workflow fixture') && document.querySelectorAll('.commit-file').length>0`)
						if oldest != true {
							break
						}
						fmt.Println("SAKURAGIT_SMOKE_OLDER_DETAILS", text)
						_, _ = win.Page().Eval(`(()=>{const input=document.querySelector('[aria-label="搜索文件或提交"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'Native development workflow fixture');input.dispatchEvent(new Event('input',{bubbles:true}));})()`)
						phase = 13
					case phase == 13:
						found, _ := win.Page().Eval(`document.querySelectorAll('.commit-row').length===1 && document.querySelector('.commit-row')?.textContent.includes('Native development workflow fixture') && !document.querySelector('.history-pagination .spin')`)
						if found != true {
							break
						}
						fmt.Println("SAKURAGIT_SMOKE_FULL_HISTORY_SEARCH", text)
						_ = settingsRequested.Emit(win, true)
						phase = 2
					case phase == 2 && state["settings"] == true:
						fmt.Println("SAKURAGIT_SMOKE_SETTINGS", text)
						_, _ = win.Page().Eval(`document.querySelector('[aria-label="关闭对话框"]').click();document.querySelector('[aria-label="工作现场"]').click()`)
						phase = 3
					case phase == 3 && state["stashReady"] == true && (state["stashItems"] == float64(0) || state["diffLines"].(float64) > 0):
						fmt.Println("SAKURAGIT_SMOKE_STASH", text)
						_, _ = win.Page().Eval(`document.querySelector('[aria-label="开发工具"]').click()`)
						phase = 24
					case phase == 24:
						workflow, _ := win.Page().Eval(`!!document.querySelector("#manage-branch") && !!document.querySelector("#development-file") && !document.querySelector(".workflow-panel [role=alert]")`)
						if workflow != true {
							break
						}
						fmt.Println("SAKURAGIT_SMOKE_WORKFLOW", workflow)
						_, _ = win.Page().Eval(`document.querySelector('[aria-label="仓库连接"]').click()`)
						phase = 4
					case phase == 4 && state["remotesReady"] == true:
						fmt.Println("SAKURAGIT_SMOKE_REMOTES", text)
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
						fmt.Println("SAKURAGIT_SMOKE_REMOTE_DIALOG", boundsText)
						_, _ = win.Page().Eval(`document.querySelector('[aria-label="关闭对话框"]').click()`)
						if autoFile == "" {
							root, _ := state["root"].(string)
							cloneRoot = filepath.Join(filepath.Dir(root), "progress-clone")
							_, _ = win.Page().Eval(`document.querySelector('[aria-label="克隆或新建仓库"]').click()`)
							phase = 30
							break
						}
						_, _ = win.Page().Eval(`document.querySelector('[aria-label="工作区"]').click()`)
						// Polling is intentionally suspended for occluded WebViews on macOS.
						mygo.App.Focus()
						win.Show()
						win.Focus()
						phase = 6
					case phase == 30:
						values, _ := json.Marshal([]string{state["root"].(string), filepath.Dir(cloneRoot), filepath.Base(cloneRoot)})
						started, _ := win.Page().Eval(fmt.Sprintf(`(()=>{const ids=['clone-url','repo-parent','repo-folder'];if(!document.querySelector('#clone-url'))return false;const values=%s;ids.forEach((id,i)=>{const input=document.getElementById(id);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,values[i]);input.dispatchEvent(new Event('input',{bubbles:true}));});return true;})()`, values))
						if started == true {
							phase = 31
						}
					case phase == 31:
						_, _ = win.Page().Eval(`document.querySelector('#clone-url').closest('form').requestSubmit()`)
						phase = 32
					case phase == 32 && state["root"] == cloneRoot:
						removed, _ := win.Page().Eval(`!document.querySelector('[aria-label="操作记录"]') && !document.querySelector('[role="dialog"]')`)
						if removed != true {
							break
						}
						ok.Store(true)
						fmt.Println("SAKURAGIT_SMOKE_LOCAL_CLONE", cloneRoot)
						fmt.Println("SAKURAGIT_SMOKE", text)
						mygo.App.Quit()
						return
					case phase == 6:
						found := false
						if paths, isArray := state["paths"].([]any); isArray {
							for _, path := range paths {
								found = found || path == autoFile
							}
						}
						if found {
							fmt.Println("SAKURAGIT_SMOKE_AUTO_REFRESH", text)
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
							fmt.Println("SAKURAGIT_SMOKE_PUSH_PLAN", planText)
							fmt.Println("SAKURAGIT_SMOKE", text)
							mygo.App.Quit()
							return
						}
					}
				}
			}
			time.Sleep(250 * time.Millisecond)
		}
		fmt.Printf("SAKURAGIT_SMOKE_FAILED: stopped at phase %d\n", phase)
		debug, _ := win.Page().Eval(`JSON.stringify({visibility:document.visibilityState,tokens:document.querySelectorAll(".diff-code .token").length,words:document.querySelectorAll(".diff-code .word-change").length,paths:[...document.querySelectorAll('.file-select')].map(n=>n.title),view:document.querySelector('h1')?.textContent,search:document.querySelector('[aria-label="搜索文件或提交"]')?.value,alerts:[...document.querySelectorAll('[role="alert"]')].map(n=>n.textContent),footer:document.querySelector('footer')?.textContent,dialogs:document.querySelectorAll('[role="dialog"]').length})`)
		fmt.Println("SAKURAGIT_SMOKE_DEBUG", debug)
		mygo.App.Quit()
	}()
}
