# SakuraGit

**A clearer view of every Git change.**

[简体中文](README.md) · [Verification Notes](QA.md) · [MyGo](https://mygo.egoist.dev/)

SakuraGit is a lightweight Git desktop client built with **MyGo, Go, React, and TypeScript**. It renders through the operating system's WebView and works with your installed Git, **without bundling Chromium**. Mist-blue themes, resizable panels, and a focused Diff reader make everyday commits, code review, and branch operations easier to follow.

> Current version: **0.5.2, early development**. Built and tested on macOS Apple Silicon, with explicit limitations; not a claim of production readiness or cross-platform verification. The application UI is currently primarily Chinese; this English README does not imply an English UI is available.

![SakuraGit workspace](docs/screenshots/workspace.png)

## Features

| Area | Available functionality |
| --- | --- |
| Repositories | Open local and recent repositories, initialize projects, clone a selected branch, optionally track only that branch |
| Working tree | Staged / unstaged groups, file and group staging / unstaging, hunk staging for ordinary tracked text changes |
| Commits | Subject and body, staged-content-only commits, per-repository commit drafts |
| Diff reader | Unified / side-by-side views, syntax and intraline highlighting, wrapping, font sizes, full-window focus mode |
| History | Visible authors, email and commit details, changed files and per-file Diffs, parent graph, automatic scroll paging and full-history search |
| Branches | Create, switch, rename, safely delete merged branches, set upstream, check out remote branches, merge local branches |
| Synchronization | Fetch, fast-forward-only Pull, non-force Push, first-push upstream setup, destination-aware confirmations |
| Stash | Save, inspect, apply, and delete; optional untracked files and index restoration; applying retains the original entry |
| Workflow tools | Locate conflicts, open an external editor / merge tool, detect remaining conflict markers, continue / abort Git workflows |
| Connections | Manage Fetch / Push URLs, inspect Git and authentication configuration, set repository-local identity |
| Appearance | Mist-blue / graphite themes, light / dark / system appearance, persistent split-panel sizes, session and draft recovery |
| Operation status | Clone and synchronization progress, elapsed time, cancellation, error guidance, and protection when quitting during writes |

Workflow continuation / abort supports Git-initiated Merge, Rebase, Cherry-pick, and Revert operations. This is not an arbitrary Git command terminal or an integrated three-way merge editor. Worktree support currently covers listing and opening existing worktrees.

![SakuraGit commit history](docs/screenshots/history.png)

## Getting Started

### Requirements

- **Git**, installed and discoverable by the desktop application.
- **Go 1.27.1+**, as declared in `go.mod`. Go can download the required toolchain when configured to do so.
- **Node.js 22.12+** and npm.
- Native development tools for your target platform; on macOS, install Xcode Command Line Tools.

| Platform | Verification status |
| --- | --- |
| macOS Apple Silicon / ARM64 | Build, signature verification, and native smoke checks completed |
| macOS Intel, Windows, Linux | Not tested on real hardware; no promise of ready-made installers or full compatibility |

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
build/darwin-arm64/SakuraGit 0.5.2 arm64.dmg
```

```sh
open build/darwin-arm64/SakuraGit.app

# Launch with a specific repository
build/darwin-arm64/SakuraGit.app/Contents/MacOS/SakuraGit --repo /absolute/path/to/repository
```

Local builds currently use **ad-hoc signing, without Apple Developer ID signing or notarization**. A public source repository is not a promise of official release binaries. Run only builds you trust and have verified.

## Usage Tips

- **Panel sizing:** drag a separator; double-click to restore that separator's default size. Focus it and use arrow keys for finer adjustments, Shift for larger steps, or Escape to cancel a drag. Ratios persist locally; narrow windows use a stacked layout.
- **History:** batches contain 100 commits and load automatically near the bottom. Lists over 300 entries are virtualized. Searching subjects, authors, emails, or commit IDs covers the entire locally reachable history, not just loaded entries.
- **Appearance:** open Settings at the lower left or press `Cmd/Ctrl + ,`. Diff fonts range from 11 to 16 px; Escape leaves focus mode.
- **Authentication:** reuse system Git's SSH, credential helpers, and signing configuration. Complete interactive authentication in a terminal first when necessary. SakuraGit does not store account passwords or accept credentials embedded in repository URLs.
- **Local state:** drafts are isolated per repository, with recovery of the previous view and file selection. To preserve compatibility with the former Gitlane name, the application identifier, `Gitlane` user-data directory, and `gitlane.*` local cache keys remain unchanged. Personal settings are not stored in the source repository.

## Safety Boundaries And Limitations

- No force push, hard reset, discard-changes action, or arbitrary shell execution. Branch switching and Stash application require a clean working tree. Pull is fast-forward-only, without automatic Stash, Merge, or Rebase.
- Cancellation is not rollback: commits, uploads, or partial file changes may already have happened. Refresh and inspect repository state after errors or cancellation. Failed / canceled clone directories are retained for inspection, never deleted automatically.
- Git hooks, signing, and external merge tools inherit local configuration and can execute local programs. **Open trusted repositories only.** Application-level revision checks cannot prevent concurrent writes by other Git clients.
- Hunk staging supports ordinary tracked text modifications only. Additions, deletions, renames, binaries, symlinks, mode changes, and submodules use whole-file operations. Line-level staging is not available.
- Diff does not run external diff programs or textconv. The UI displays at most 3,000 lines with an explicit limit notice. Highlighting is best-effort based on patch context; large or unsupported content falls back to plain text.
- History includes only locally reachable commits and does not fetch automatically. Shallow clones retain their depth limits. Ordinary Git commands typically have a 90-second deadline; clone has a 30-minute deadline.
- No integrated three-way editor, interactive Rebase, tag management, Worktree creation / deletion, or complete submodule / LFS management. Existing submodule / LFS detection is informational only.
- Real large production repositories, live GitHub / GitLab authentication, complete crash recovery, and cross-platform runtime behavior need further verification. Session persistence is not a backup of repository files.

## Testing

```sh
npm test          # Go race detector + frontend tests
npm run build:web
go vet ./...
```

The suite currently includes **78 frontend tests**, plus Go integration tests for repository state, commits, synchronization, paging, conflicts, cancellation, sessions, and path protection. Tests use self-created temporary repositories and local bare remotes, not your private repositories.

Native checks create and modify isolated fixtures and launch the packaged application:

```sh
scripts/native-smoke.sh

# Explicit subset for automation environments that cannot keep the window visible
scripts/native-smoke.sh build/darwin-arm64/SakuraGit.app/Contents/MacOS/SakuraGit --skip-auto-refresh
```

The script checks automatic scroll loading across 426 commits, the oldest commit's details, full-history search, the bundled highlighting Worker, desktop reload guards, and a local-only clone. Logs and the retained fixture's path are recorded in `build/`. The subset explicitly skips visibility-dependent polling and subsequent push-confirmation checks; skipped checks are not passes. See [QA.md](QA.md) for detailed coverage and unverified behavior.

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
