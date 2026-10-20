# Verification

Latest verification work: 2026-10-20, GitHub-hosted macOS, Windows and Linux. Earlier version sections are retained as historical records, including the former Gitlane product name and its old build paths.

## Built-in Terminal (0.5.3)

- All builds and test runs for this change run on GitHub, not the developer machine. The [initial terminal CI run](https://github.com/yueseqaz/SakuraGit/actions/runs/39364446396) passed all three OS test jobs and all five package jobs. Subsequent UI/lifecycle refinements must pass the same workflow before release.
- Three frontend tests cover the current repository and command-free IPC arguments, duplicate startup requests, failure reporting, browser-preview refusal, busy state and modal shortcut protection. Total frontend suite: 81 tests.
- Real PTY/ConPTY tests launch only a self-created helper program in a temporary fixture directory: Unicode and ANSI output, initial working directory, resize, interactive stdin, exit codes and hanging up an attached process. No user repository or remote is accessed.
- Lifecycle tests cover waiting for actual process exit, cancellation/deadlines, unopened-repository and smoke-mode refusal, pending-session deduplication, the eight-session limit and a pending terminal confirmation not leaving Git operations locked.
- The native view is also tested with MyGo's in-memory `ui.NewTester`: initial focus, explicit clipboard action, light/dark and minimum-size rendering, typed input through to the PTY, and output retained after exit. Render snapshots are uploaded as `terminal-ui-*` CI artifacts; these are headless native-view renders, not screenshots of real desktop windows.
- Release collection requires the correct bundled Ghostty library and checks Windows/Linux machine types. macOS verifies both architectures of the application and the dylib, plus the bundle's ad-hoc signature. macOS minimum deployment version is 13.0.
- Manual verification still required: real OS-window focus/IME and accessibility, desktop clipboard integration and context menus, SSH/password prompts, Ctrl+C behavior in different shells, and shutdown dialogs with long-running development servers. Windows/Linux ARM64 are cross-compiled, not ARM-device tested. Detached services are not guaranteed to terminate with the terminal.

## GitHub-hosted Cross-platform Pipeline (0.5.2)

- The [CI workflow](https://github.com/yueseqaz/SakuraGit/actions/workflows/ci.yml) requires the 78 frontend tests, strict frontend build, Go race tests, Go vet, and five Node release-tool tests on macOS, Windows, and Linux. A high-severity dependency audit also gates packaging. Vitest is updated to its patched 4.1 release line and lockfile tarballs resolve from the official npm registry.
- Five package jobs target macOS universal (ARM64 + x86_64), Windows amd64/arm64, and Linux amd64/arm64. Packaging, PE/ELF architecture checks, macOS universal/signature checks, artifact upload, and SHA-256 generation happen on GitHub-hosted runners, not the developer machine. Windows/Linux ARM64 are cross-compiled, not executed on ARM64 hardware.
- Native Go tests use filesystem-valid Windows fixture names in place of Unix-only newline/asterisk names and do not assert POSIX permission bits on Windows. The same staging, rename, Stash and ignore behavior remains tested; Unix cases retain their original filenames. This is not a claim of support for filenames forbidden by the target OS.
- The [Release workflow](https://github.com/yueseqaz/SakuraGit/actions/workflows/release.yml) pins the source commit, checks tag/version consistency, requires every test/build job to pass, and validates all seven package filenames before publishing a draft with checksums. Already published releases are not overwritten. Exact run results remain available in the linked workflows; workflow configuration alone is not a passing run.
- Windows/Linux interactive GUI, installers on clean end-user machines, online authentication, and every architecture/device remain separate manual verification gaps. macOS is ad-hoc signed without notarization; Windows installers are unsigned. No in-app updater is enabled.

## SakuraGit Rename And Publication (0.5.2)

- `npm test`: Go tests pass with the race detector; all 78 frontend tests across 17 files pass. `go vet ./...` passes.
- `npm run build`: strict TypeScript checking, Vite assets, the macOS ARM64 `SakuraGit.app`, and `SakuraGit 0.5.2 arm64.dmg` build successfully. `codesign --verify --deep --strict build/darwin-arm64/SakuraGit.app` passes with ad-hoc signing, not notarization.
- The native `--skip-auto-refresh` smoke subset passes with the renamed application: 426 automatically paged commits, oldest-commit details, full-history search, bundled Worker highlighting (14 syntax / 2 intraline tokens), Settings, Stash, workflow tools, remote-dialog bounds, and a clone of its own local fixture. Visibility-dependent polling and subsequent push-dialog continuation are explicitly skipped.
- Product/window labels, package metadata, Go module imports, fixture labels, and build paths use SakuraGit. The existing application identifier, user-data directory, and browser storage keys intentionally retain the old namespace to preserve settings and drafts. Automated tests do not claim a full real-user upgrade/relaunch migration check.
- Chinese and English READMEs include verified 1440x960 screenshots of read-only demo data, setup/build/test instructions, authentication boundaries, platform status, and missing features. No real repository content is used in these screenshots.

## Automated (0.5.0 Historical)

- `npm test`: 51 top-level Go tests (including six additional sequence subcases) with the race detector, and 70 frontend tests pass.
- `go vet ./...`: passes.
- `npm run build:web`: strict TypeScript checking and production asset build pass.
- `npm run build`: produces the macOS ARM64 app and DMG with MyGo 0.5.5.
- `codesign --verify --deep --strict build/darwin-arm64/Gitlane.app`: passes (ad-hoc signature, not notarized).
- `scripts/native-smoke.sh`: v0.5.0 WKWebView loads bundled assets through real MyGo IPC using an isolated 126-commit fixture. Native checks cover syntax/intraline tokens, viewport-contained focus reading, loading the second history page, opening the oldest commit with its 2 changed files, and searching for that commit beyond the initial 100. A typed MyGo event opens Settings; Stash and remote/environment views still load. No real user repository is modified and the push confirmation is never submitted.
- Native smoke output is recorded in `build/native-smoke-v050.log`; the retained temporary fixture path is in `build/smoke-repository.txt`.
- In this automation session macOS keeps the test WKWebView at `document.visibilityState === 'hidden'`, including after native focus and LaunchServices launch. The complete visibility-dependent smoke reaches phase 6 and cannot validate periodic refresh. The explicit `--skip-auto-refresh` subset validates the new native features, Settings/Stash/remotes, and an actual local-fixture clone through the native form; its log marks the polling and subsequent push-dialog checks as skipped, not passed. No visibility APIs are overridden and the production visibility guard remains intact.
- History integration tests traverse 251 commits without gaps or duplicates; search older subjects, authors, emails and hashes; paginate matched results; reject stale refs/repositories; preserve versions across worktree-only edits; include detached HEAD and exclude Stash-only history. Switching HEAD between two branches at the same object invalidates decoration metadata.
- Clone integration tests discover the remote default/feature branches, select the checkout branch with normal or single-branch tracking, reject invalid/missing/tag-only branches, retain directory protections, distinguish empty remotes from discovery errors, and refuse external helper protocols.
- Frontend tests additionally cover exact source-text preservation, multiline lexical state, per-file stash grammars, intraline ranges, expensive-line fallback, paged history preservation, stale search/repository responses, retries, clone selection propagation, URL invalidation and inline clone errors.
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

- v0.4.1: clone startup/progress layout visually checked at 900x846 (mist light) and 390x844 (mist dark), with a clearly labeled UI-only harness that performs no Git operations. The input fields collapse while cloning so the progress card stays visible. Actual percentage/cancel behavior is covered by frontend tests and local backend tests, not claimed as a browser network clone.

- v0.4.0: syntax and intraline highlights visually checked in mist-blue light/dark, unified/side-by-side, and focused views. Token CSS is namespaced to avoid collision with UI tag badges. Focused reader and clone modal stay within 1440x960 and 390x844 viewports; no page-level horizontal overflow.
- History author search selects the matching commit and shows an explicit result-end marker. The list no longer claims `LATEST 100`; search is labeled repository-wide (demo remains explicitly sample-only).
- Clone form exposes default-branch selection, remote branch discovery and the independent single-branch option. Browser preview refuses remote discovery explicitly, rather than fabricating branches. Source changes invalidate stale results (tested with delayed responses).

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
- Worktree view renders its data; session operation history has been removed.
- Mutation in browser preview shows an explicit read-only warning and leaves all five sample files unchanged.
- Hunk staging, Stash saving, remote URL editing, cloning and initialization all refuse mutations in browser preview rather than simulate success.
- Clone form autofocuses its URL input. Existing-project initialization hides the new-folder field and targets the selected project directly; backward Tab stays in the dialog.
- Stash and connection views have no page-level horizontal overflow at 390x844. Mist-blue Stash rendering is checked in light and dark appearance.
- Visual QA found that a remote dialog nested under an animated scrolling panel was clipped. Shared dialogs now portal into `document.body`; native smoke includes a regression check that the remote dialog overlay covers the viewport and all dialog bounds remain visible.
- Open dialog autofocuses its path input; backward Tab stays inside the dialog; Escape closes it.
- 1440x960 desktop and 390x844 narrow viewport have no page-level horizontal overflow.
- Bundled fonts reach the loaded state; runtime web font requests are unnecessary.

Browser checks use explicitly labeled demo data, not access to local Git. Native commits and local-remote synchronization are covered by the Go integration tests. The native smoke subset additionally clones only its own local fixture through the UI and real MyGo IPC.

## Clone Progress (0.4.1)

- Only self-created local fixtures are used for these tests; no private user remote is accessed.
- Go tests cover CR/newline and chunked Git progress, stage changes, actual transfer detail retention, bounded output, tracked local clone completion, stale task IDs, cancellation before start, and cancellation of a slow isolated helper plus its child process. Failed/canceled destination directories are retained.
- Frontend tests cover stage percentage vs overall progress, indeterminate startup, transfer information, input locking, exact task cancellation and inline errors.
- Clone timeout is now independently 30 minutes; ordinary commands remain 90 seconds. Real 30-minute elapsed-time behavior is not exercised.
- Session operation history is removed from navigation, snapshot data, generated bindings and styles.

## Desktop Reload Guard (0.4.2)

- Embedded preload script prevents default WebView context menus from document start and blocks Cmd/Ctrl+R, shifted reload combinations and F5. Copy/paste/undo keys remain unblocked. Normal browser preview is not intercepted.
- The application menu explicitly supplies View items instead of the framework default (which includes Reload, Force Reload and DevTools). Recursive tests check expanded application menus and text menus do not expose these actions.
- Text inputs use a restricted native editing menu; selected read-only code has a Copy menu. Frontend tests cover selection preservation, read-only inputs, blank UI, non-text controls, browser-preview isolation and failure recovery.
- Packaged native smoke checks the injected context-menu/reload guards through actual WKWebView DOM events, plus copy shortcut passthrough. This is not a claim of physical mouse long-press coverage or end-to-end native clipboard editing on every OS.
- The reload guard prevents accidental browser-style refresh; v0.5.0 adds separate session/draft persistence, not a guarantee against arbitrary storage failures.

## Development Readiness (0.5.0)

- Session tests cover atomic roundtrip and 0600 permissions, malformed files, invalid writes retaining previous data, bounded drafts, stale timestamp rejection, explicit launch-path precedence and ephemeral-mode persistence isolation. Frontend App tests restore selected files and drafts, immediately cache edits, keep per-repository drafts separate, and recover a historical selection beyond the first 100 commits via a hash lookup. Cache validation and unavailable storage are also tested.
- Operation lifecycle tests cover mutual exclusion, stale cancellation IDs, cancellation completion, overall deadlines, panic cleanup/unblocking exit waiters, and rejecting new operations once exit is approved. An isolated slow helper verifies ordinary network-command live progress and cancellation of both Git and its child. Native close-dialog interaction remains a manual check, not claimed as automated end-to-end coverage.
- Error tests cover fourteen diagnostic categories, bounded output, URL credentials and Authorization/token redaction. Clone and ordinary-operation progress details use the same redaction. This is best-effort protection for common credential formats, not a universal secret scanner.
- A `git fast-import` fixture exercises 10,000 commits and 2,500 untracked files, deep paging to the oldest commit, full-history search, preservation of the first-page cache after external index changes and invalidation after external ref changes. One local non-race run measured ~99 ms open, ~48 ms deep page and ~64 ms search; these are synthetic warm-machine observations, not production SLAs.
- Virtual-range tests bound DOM row ranges and clamp stale positions. Highlighter tests terminate stale/unmounted/timed-out workers, invalidate results when paths/languages change, verify small-diff fallback and large-diff plain-text degradation. The packaged native smoke reports **14 syntax tokens / 2 intraline tokens / `mode: worker`**, verifying the bundled Blob worker rather than silently relying on the fallback. Prism's default JSON worker transport is disabled before Prism loads.
- Workflow integration tests create real local conflicts, reject unresolved markers/early continuation, mark a manually edited file resolved, complete merge commits and abort safely. Additional cases continue/abort externally started rebase, cherry-pick and revert sequences. Branch tests cover rename, merged-only deletion, current/unmerged/other-worktree rejection, upstream tracking and remote checkout. Stale revisions, exact glob escaping in `.gitignore`, no auto-staging/deletion, and confined development paths/symlinks are covered.
- Frontend workflow tests require confirmation and captured repository revisions before marking resolved, and keep local/remote branch selections separate. Operation UI tests reject old completed jobs on unrelated reads and cancel the exact active job.
- Native smoke additionally reads the new Workflow view over real MyGo IPC. Browser UI-only mocks (clearly labeled, all real Git calls rejected) visually check workflow/progress at desktop light and 390 px dark, including confirmation bounds and no page-level horizontal overflow. They do not validate OS editor launches or real network/auth behavior.
- Session native files and frontend hydration are tested separately; full process-kill/relaunch recovery and native close/cancel dialogs are not automated. Pixel scroll positions, tags, interactive rebase, internal three-way editing, and submodule/LFS management are not implemented.

## Scroll Loading And Panel Layout (0.5.1)

- Frontend suite: 78 tests across 17 files. New coverage checks near-bottom paging, repeated-event deduplication, error/end guards, returning to earlier repository/query scopes, underfilled/hidden viewports and no-progress responses. An integrated HistoryPanel test crosses 300 to 400 rows without jumping to the selected first commit, bounds rendered rows, and still scrolls to an explicitly selected older commit.
- Split tests check horizontal/vertical clamping, malformed/unavailable local storage, pointer release persistence, remount restoration, double-click defaults, keyboard adjustments, Escape cancellation, unmount cleanup and narrow-layout drag rejection.
- Packaged native smoke uses only a self-created 426-commit fixture. It scrolls the actual list instead of clicking a pagination button, reaches all 426 commits with only 15 rendered rows, opens the oldest commit's real file Diff and finds it via full-history search. Worker highlighting remains 14 syntax tokens / 2 intraline tokens / `mode: worker`. The explicit `--skip-auto-refresh` subset passes; visibility-dependent periodic refresh and subsequent push-dialog continuation are skipped, not passed.
- Browser preview at 900x846 visually verifies real pointer drags for workspace horizontal/vertical and history horizontal/vertical boundaries, sidebar dragging, persisted ratios after reload, keyboard resizing and double-click reset. Mist-blue light/dark layouts have no page-level horizontal overflow. A 390x844 light history view retains stacked layout, hides separators and has no page-level horizontal overflow. Browser data is read-only demo data; real history paging is verified by the native smoke rather than a fabricated browser Git response.
- macOS ARM64 0.5.1 native build and strict ad-hoc signature verification pass. This does not imply notarization or cross-platform runtime verification.

## Not Verified

- v0.4.0 foreground periodic-refresh and subsequent native push-dialog continuation in this occluded automation environment (the default full smoke cannot complete phase 6). Existing change-token integration tests pass; earlier v0.3.1 native verification remains historical, not a v0.4.0 pass.
- Windows and Linux interactive GUI/runtime on end-user machines; all ARM64 Windows/Linux devices. Cloud packaging/test status is tracked in the workflows above.
- Live GitHub/GitLab authentication, credential dialogs or signed commits.
- Real large production repositories and unusual non-UTF-8 filenames (synthetic 10k/2.5k fixtures are covered).
- Apple Developer ID signing and notarization.
