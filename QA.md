# Verification

Verified on 2026-10-18, macOS Apple Silicon.

## Automated

- `npm test`: 26 Go integration tests plus 2 preference tests with the race detector, and 16 frontend tests pass.
- `go vet ./...`: passes.
- `npm run build:web`: strict TypeScript checking and production asset build pass.
- `npm run build`: produces the macOS ARM64 app and DMG with MyGo 0.5.5.
- `codesign --verify --deep --strict build/darwin-arm64/Gitlane.app`: passes (ad-hoc signature, not notarized).
- `scripts/native-smoke.sh`: built v0.3.1 WKWebView loads bundled assets through MyGo IPC. Workspace renders 2 files, 19 visible Diff rows and 2 hunk actions with patch headers hidden. Focus reading stays inside the viewport. History loads author identity, 1 file and 61 visible Diff rows. A typed MyGo event opens Settings. Stash loads 1 entry and 6 visible Diff rows; remote/environment view loads the local origin. An external writer adds a third file and automatic refresh displays it. The push dialog resolves `main` to `origin` / `main`, with an exact non-template command collapsed by default. No real user repository is modified; the app does not submit the push dialog.
- Native smoke output is recorded in `build/native-smoke-v031.log`; the retained temporary fixture path is in `build/smoke-repository.txt`.
- Settings storage roundtrip, malformed-file fallback and rejected invalid writes are covered with temporary files.
- First push against local bare remotes establishes upstream, does not push unrelated refs, rejects diverged remotes, and refuses detached/unborn states.
- Commit detail tests distinguish author from committer and cover root commits, merge-first-parent comparison, rename/newline paths and binary patches.
- Hunk tests cover stage/unstage without changing worktree content, stale revisions, multiple shifted hunks and missing final newline; unsupported untracked files are rejected.
- Stash tests cover original staging and untracked-file restoration, stale deletion references, literal/newline filenames, conflict retention and exclusion of internal Stash commits from normal history.
- Repository tests cover local clone, new/existing project initialization without overwriting files, refusal of existing/nested repositories, remote CRUD with stale-config rejection, independent Push URLs, local identity and URL validation.
- Change-token tests catch repeated edits even when porcelain status remains modified.
- Snapshot tests resolve remote and local upstream destinations without splitting the display label (including remote names containing `/` and different local/remote branch names). Confirmed sync rejects changed source branches or upstream targets before any network operation.
- Frontend tests cover side-by-side pairing, independent line numbers, additions/deletions without a matching opposite row, missing-newline markers and original hunk indices. Sync tests cover real destinations, shell-safe display quoting, collapsed command details and zero-ahead/behind explanations.

## Browser UI

- v0.3.1: unified/side-by-side modes, patch-header toggle and wrap toggle work; non-wrapped long lines scroll inside the Diff rather than widening the page. Changing Diff font to 14 px survives reload.
- Focus reading stays within 1440x960 and 390x844 viewports; Escape closes it and restores keyboard focus to its entry button. Light and dark side-by-side rendering and narrow unified rendering are visually checked.
- Push confirmation shows the real local branch, remote and target branch with known commit counts; the command starts collapsed and expands to the concrete refspec. Browser preview refuses push without modifying sample files. Pull and Fetch use the same destination-oriented presentation.
- The shared reader remains read-only in history and Stash views; no hunk mutation controls appear there.
- Mist-blue and graphite palettes switch in Settings; dark/light appearance and code size survive reload.
- System appearance responds to emulated OS light/dark changes.
- History author names are visible in the list; switching the selected commit file updates the per-file Diff.
- Settings includes select controls in its keyboard focus loop; Escape closes it.
- Narrow-screen settings and history remain usable, with no page-level horizontal overflow; Settings remains available as a sidebar icon.

- Workspace file selection and staged/unstaged groups render correctly.
- File search for `README` returns exactly one matching file.
- History author search for `Mika` returns exactly one matching commit.
- Parent-based history graph shows a fork and a shared ancestor.
- Worktree and session activity views render their respective data.
- Mutation in browser preview shows an explicit read-only warning and leaves all five sample files unchanged.
- Hunk staging, Stash saving, remote URL editing, cloning and initialization all refuse mutations in browser preview rather than simulate success.
- Clone form autofocuses its URL input. Existing-project initialization hides the new-folder field and targets the selected project directly; backward Tab stays in the dialog.
- Stash and connection views have no page-level horizontal overflow at 390x844. Mist-blue Stash rendering is checked in light and dark appearance.
- Visual QA found that a remote dialog nested under an animated scrolling panel was clipped. Shared dialogs now portal into `document.body`; native smoke includes a regression check that the remote dialog overlay covers the viewport and all dialog bounds remain visible.
- Open dialog autofocuses its path input; backward Tab stays inside the dialog; Escape closes it.
- 1440x960 desktop and 390x844 narrow viewport have no page-level horizontal overflow.
- Bundled fonts reach the loaded state; runtime web font requests are unnecessary.

Browser checks use explicitly labeled demo data, not access to local Git. Native commits and local-remote synchronization are covered by the Go integration tests, not by the read-only native smoke test.

## Not Verified

- Windows and Linux packaging/runtime.
- Live GitHub/GitLab authentication, credential dialogs or signed commits.
- Large production repositories and unusual non-UTF-8 filenames.
- Apple Developer ID signing and notarization.
