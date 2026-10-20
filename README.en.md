# SakuraGit

**A clearer view of every Git change.**

[![CI](https://github.com/yueseqaz/SakuraGit/actions/workflows/ci.yml/badge.svg)](https://github.com/yueseqaz/SakuraGit/actions/workflows/ci.yml) · [GitHub Releases](https://github.com/yueseqaz/SakuraGit/releases)

[简体中文](README.md) · [Verification Notes](QA.md) · [MyGo](https://mygo.egoist.dev/)

SakuraGit is a lightweight Git desktop client built with **MyGo, Go, React, and TypeScript**. It renders through the operating system's WebView and works with your installed Git, **without bundling Chromium**. Mist-blue themes, resizable panels, and a focused Diff reader make everyday commits, code review, and branch operations easier to follow.

> Current version: **0.6.0, early development**. Built and tested on macOS Apple Silicon, with explicit limitations; not a claim of production readiness or cross-platform verification. The application UI is currently primarily Chinese; this English README does not imply an English UI is available.

![SakuraGit workspace](docs/screenshots/workspace.png)

## Features

| Area | Available functionality |
| --- | --- |
| Repositories | Open local and recent repositories, initialize projects, clone a selected branch, optionally track only that branch |
| Working tree | Staged / unstaged groups, file and group staging / unstaging, hunk and selected-line staging / unstaging for ordinary tracked text modifications |
| Commits | Subject and body, staged-content-only commits, per-repository commit drafts |
| Diff reader | Unified / side-by-side views, syntax and intraline highlighting, wrapping, font sizes, next/previous change navigation (F7 / Shift+F7), full-window focus mode |
| History | Visible authors, email and commit details, changed files and per-file Diffs, parent graph, automatic scroll paging and full-history search |
| Branches | Create, switch, rename, safely delete merged branches, set upstream, check out remote branches, merge local branches |
| Synchronization | Fetch, fast-forward-only Pull, non-force Push, first-push upstream setup, destination-aware confirmations |
| Stash | Save, inspect, apply, and delete; optional untracked files and index restoration; applying retains the original entry |
| Workflow tools | Integrated three-way text merging, per-block choices, external editor / merge tool, detect remaining conflict markers, continue / abort Git workflows |
| Terminal | Same-window native MyGo/Ghostty bottom dock, per-repository multi-session tabs, resizing, maximize / collapse, and guarded shutdown |
| Recovery | Soft-undo a last local commit, back up and restore tracked text files, restore file backups, Cherry-pick / Revert from history |
| Connections | Manage Fetch / Push URLs, inspect Git and authentication configuration, set repository-local identity |
| Appearance | Mist-blue / graphite / forest / warm-sand themes, matching native terminal colors, light / dark / system appearance, persistent split-panel sizes, session and draft recovery |
| Operation status | Clone and synchronization progress, elapsed time, cancellation, error guidance, and protection when quitting during writes |

Workflow continuation / abort supports Git-initiated Merge, Rebase, Cherry-pick, and Revert operations. Git buttons do not accept arbitrary shell commands. Ordinary UTF-8 modify/modify conflicts have an integrated three-way editor; special conflicts use external tools. Use the built-in terminal for manual commands. Worktree support currently covers listing and opening existing worktrees.

![SakuraGit commit history](docs/screenshots/history.png)

## Downloads And Cross-platform Builds

Download successfully published versions from [GitHub Releases](https://github.com/yueseqaz/SakuraGit/releases). Binaries are built entirely on GitHub-hosted runners, not uploaded from a developer's machine.

| OS | Architectures and packages |
| --- | --- |
| macOS | Universal Intel + Apple Silicon `.dmg` |
| Windows | Separate x64 / ARM64 `setup.exe` installers |
| Linux | Separate x64 / ARM64 `.deb` and `.tar.gz` packages |

All packages require system Git. Windows needs WebView2 Runtime. Linux needs a graphical desktop, GTK 3, and WebKitGTK 4.1; Debian packages declare the dependencies. macOS builds are ad-hoc signed but not notarized; Windows installers are not Authenticode signed. Security warnings may appear. **A successful build is not comprehensive device or GUI validation.** Windows / Linux ARM64 binaries are cross-compiled on same-OS x64 runners. Use the attached `SHA256SUMS` to check downloads.

## Built-in Terminal

Open a repository, then click **终端** in the top bar, **内置终端** in Development Tools, or press **Ctrl/Cmd + backtick**. A native MyGo/Ghostty dock opens **inside the same main window**. Drag its divider, maximize / restore, collapse without ending programs, or add session tabs. Up to eight sessions can run across repositories; switching repositories shows only that repository’s sessions.

- macOS/Linux use the user's login shell. Windows prefers PowerShell, falling back to the system command interpreter. User shell startup files may change directories or run their own scripts.
- Interactive input, ANSI colors, Unicode, resizing, scrollback, context-menu copy/paste and font zoom are provided by the terminal plugin. Ctrl+C interrupts commands; Cmd/Ctrl + mouse wheel zooms.
- Closing a live session, the workspace, or the app asks before hanging up terminals and waiting for attached programs to exit. Exited shells retain output in their tab; create a new session to start another shell. Detached background programs are not guaranteed to stop; commands are never rolled back automatically.
- **This is an unrestricted shell, not the guarded Git-button API.** SakuraGit never sends startup commands or executes repository scripts automatically. Normal user shell startup files still run. Terminal-protocol clipboard reads/writes are denied; explicit copy/paste works. SakuraGit does not persist terminal output, but your shell may persist its own history.
- Existing local-state polling detects changes when returning to the Git workspace. Terminal commands and other Git clients can change a repository concurrently.

The terminal library ships with the app; installing Ghostty is unnecessary. Minimum requirements: **macOS 13**, **Windows 10 1809**, or Linux with glibc 2.28+ plus the main window's GTK 3/WebKitGTK 4.1 requirements. Chinese text needs a CJK font: DEB packages depend on `fonts-noto-cjk`; tar-archive users must install a suitable font themselves. Dock height is saved locally. Page dialogs temporarily take the terminal view’s space without ending the session. PTY restoration after app restart and a shell picker are not implemented.

## Three-way Merging And Recovery

- Select a conflicted file to compare Base, Ours (index stage 2), and Theirs (stage 3), with an editable result below. Choose either side or concatenate both **per block**, preserving Git’s other automatically merged changes.
- During Rebase, Ours is the rebased target and Theirs is the replayed commit, not simply “local / remote.”
- Saving requires removing all conflict markers, checks file/index/repository revisions, backs up the original file, writes the result and stages it. It does **not** continue the workflow or create a merge commit automatically.
- The built-in editor supports regular UTF-8 modify/modify conflicts, at most 1 MB per version. Add/delete, binary, symlink, type-change, and submodule conflicts need an external tool.
- Unsaved results are cached per repository/file. If the source changed, the draft remains available but cannot overwrite external changes; copy needed work before reloading. Cache failures are visible.
- Recovery soft-undoes an ordinary last local commit without changing files or the index. Known remote references containing the commit block the action; unknown server changes cannot be detected without Fetch.
- Single-file restore first backs up unstaged text changes, then restores the index version. Restoring a backup changes only the worktree and backs up the overwritten content. Backups live in each worktree’s Git metadata under `sakuragit-backups/`; they are not uploaded or automatically deleted, and are not a complete repository backup or an operation log.
- Cherry-pick / Revert from commit details require a clean worktree and preserve hooks/signing. Merge commits need an explicit mainline and must be handled in the terminal.

## Getting Started

### Requirements

- **Git**, installed and discoverable by the desktop application.
- **Go 1.27.1+**, as declared in `go.mod`. Go can download the required toolchain when configured to do so.
- **Node.js 22.12+** and npm.
- Native development tools for your target platform; on macOS, install Xcode Command Line Tools.

| Platform | Verification status |
| --- | --- |
| macOS Apple Silicon / ARM64 | Local GUI and native smoke checks; universal package through Actions |
| macOS Intel, Windows, Linux | Actions build targets; GUI and all target devices not comprehensively tested |

### Development

```sh
git clone https://github.com/yueseqaz/SakuraGit.git
cd SakuraGit
npm ci
npm run dev
```

`npm run dev` starts a MyGo desktop window and Vite at `http://127.0.0.1:5274`. Configuration uses JSON and npm; Bun is not required.

For a UI-only preview:

```sh
npm run dev:web
```

**Browser preview uses explicitly labeled, read-only sample data.** It cannot access local repositories and never fabricates successful Git operations. Real operations are available only inside the MyGo desktop window. Fonts and syntax highlighting are bundled, with no runtime CDN dependency.

### Desktop Build

```sh
npm run build
```

On macOS ARM64, the outputs are:

```text
build/darwin-arm64/SakuraGit.app
build/darwin-arm64/SakuraGit 0.6.0 arm64.dmg
```

```sh
open build/darwin-arm64/SakuraGit.app

# Launch with a specific repository
build/darwin-arm64/SakuraGit.app/Contents/MacOS/SakuraGit --repo /absolute/path/to/repository
```

Local builds currently use **ad-hoc signing, without Apple Developer ID signing or notarization**. Prebuilt packages are provided through the GitHub Release workflow. Run only builds you trust and have verified.

## Usage Tips

- **Panel sizing:** drag a separator; double-click to restore that separator's default size. Focus it and use arrow keys for finer adjustments, Shift for larger steps, or Escape to cancel a drag. Ratios persist locally; narrow windows use a stacked layout.
- **History:** batches contain 100 commits and load automatically near the bottom. Lists over 300 entries are virtualized. Searching subjects, authors, emails, or commit IDs covers the entire locally reachable history, not just loaded entries.
- **Appearance:** open Settings at the lower left or press `Cmd/Ctrl + ,`. Diff fonts range from 11 to 16 px; Escape leaves focus mode.
- **Authentication:** reuse system Git's SSH, credential helpers, and signing configuration. Complete interactive authentication in a terminal first when necessary. SakuraGit does not store account passwords or accept credentials embedded in repository URLs.
- **Local state:** drafts are isolated per repository, with recovery of the previous view and file selection. To preserve compatibility with the former Gitlane name, the application identifier, `Gitlane` user-data directory, and `gitlane.*` local cache keys remain unchanged. Personal settings are not stored in the source repository.

## Safety Boundaries And Limitations

- Git buttons do not offer force push, hard reset, or arbitrary shell execution; constrained file restore requires confirmation and a backup. The interactive terminal is an unrestricted shell. Branch switching and Stash application require a clean working tree. Pull is fast-forward-only, without automatic Stash, Merge, or Rebase.
- Cancellation is not rollback: commits, uploads, or partial file changes may already have happened. Refresh and inspect repository state after errors or cancellation. Failed / canceled clone directories are retained for inspection, never deleted automatically.
- Git hooks, signing, and external merge tools inherit local configuration and can execute local programs. **Open trusted repositories only.** Application-level revision checks cannot prevent concurrent writes by other Git clients.
- Hunk and line staging support ordinary tracked text modifications only. Additions, deletions, renames, binaries, symlinks, mode changes, and submodules use whole-file operations. Deletion and addition lines are selected independently; select both sides to stage a complete replacement.
- Diff does not run external diff programs or textconv. The UI displays at most 3,000 lines with an explicit limit notice. Highlighting is best-effort based on patch context; large or unsupported content falls back to plain text.
- History includes only locally reachable commits and does not fetch automatically. Shallow clones retain their depth limits. Ordinary Git commands typically have a 90-second deadline; clone has a 30-minute deadline.
- No interactive Rebase, tag management, Worktree creation / deletion, or complete submodule / LFS management. Existing submodule / LFS detection is informational only.
- Real large production repositories, live GitHub / GitLab authentication, complete crash recovery, and cross-platform runtime behavior need further verification. Session persistence is not a backup of repository files.

## Testing

```sh
npm test          # Go race detector + frontend tests
npm run build:web
go vet ./...
```

The suite currently includes frontend unit and browser-fixture tests, plus Go integration tests for repository state, commits, synchronization, paging, conflicts, cancellation, sessions, and path protection. Tests use self-created temporary repositories and local bare remotes, not your private repositories.

Native checks create and modify isolated fixtures and launch the packaged application:

```sh
scripts/native-smoke.sh

# Explicit subset for automation environments that cannot keep the window visible
scripts/native-smoke.sh build/darwin-arm64/SakuraGit.app/Contents/MacOS/SakuraGit --skip-auto-refresh
```

The script checks automatic scroll loading across 426 commits, the oldest commit's details, full-history search, the bundled highlighting Worker, desktop reload guards, and a local-only clone. Logs and the retained fixture's path are recorded in `build/`. The subset explicitly skips visibility-dependent polling and subsequent push-confirmation checks; skipped checks are not passes. See [QA.md](QA.md) for detailed coverage and unverified behavior.

## GitHub Actions And Releases

- `CI`: runs on pushes to `main`, Pull Requests, or manual dispatch. Frontend tests/builds, Go race tests, and `go vet` run on macOS, Windows, and Linux before packaging five target groups. Ordinary CI artifacts are available from the run for 14 days.
- `Release`: runs on `v*` tags or manual selection of an existing tag. The tag must match the application version in package/lock/MyGo metadata, Go, and UI labels, with release notes in `docs/releases/<tag>.md`.
- After every target succeeds, seven packages are collected. Windows / Linux executable architectures and the macOS universal binary/signature are checked, and `SHA256SUMS` is generated. Assets upload to a draft before publication, preventing partial public releases.
- Tag-triggered releases default to early-access prereleases. Manual dispatch can choose prerelease status. Published releases are never overwritten. The built-in `GITHUB_TOKEN` is sufficient; no personal token is needed. Only the final publishing job receives repository write permission.

To publish a new version, update its version metadata and release notes, wait for `main` CI to pass, then run:

```sh
git tag v0.6.0  # Example: replace with the new version number
git push origin v0.6.0
```

See the [CI](.github/workflows/ci.yml), [cross-platform build](.github/workflows/build.yml), and [Release](.github/workflows/release.yml) workflows. In-app auto-updates, Apple notarization, and Windows signing certificates are not configured.

## Source Layout

```text
main.go / *_api.go         MyGo windows, native APIs, typed IPC
internal/gitrepo/          Git commands, parsing, safety guards, integration tests
operations.go             Progress, cancellation, serialization, quit protection
session.go                Atomic session and draft persistence
src/App.tsx               Workspace, navigation, and interactions
src/DiffPanel.tsx          Diff reader
src/HistoryPanel.tsx      Automatic history paging and virtual rows
src/ResizableSplit.tsx    Persistent split-panel layout
src/WorkflowPanel.tsx     Conflict, branch, and external development tools
src/mygo.ts               Generated TypeScript IPC client
src/demo.ts               Read-only browser sample data
scripts/native-smoke.sh   Native smoke checks with isolated local fixtures
```

## Feedback And Licensing

Report problems through [Issues](https://github.com/yueseqaz/SakuraGit/issues), including your OS, version, reproduction steps, and redacted diagnostics. **Do not upload tokens, private keys, or private repository contents.**

No open-source license has been selected for this project yet. Public visibility does not by itself grant permission for unrestricted use, modification, or redistribution. Dependencies and fonts remain subject to their respective authors' licenses.
