#!/bin/sh
# Offline fixture only. The app reads/clones it; this script creates one external edit.
set -eu
cd "$(dirname "$0")/.."
app="${1:-build/darwin-arm64/SakuraGit.app/Contents/MacOS/SakuraGit}"
mode="${2:-}"
case "$mode" in ''|--skip-auto-refresh) ;; *) echo 'Unknown smoke option' >&2; exit 2 ;; esac
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0
fixture=$(mktemp -d "${TMPDIR:-/tmp}/sakuragit-v052-smoke-XXXXXX")
mkdir "$fixture/project" "$fixture/remote.git"
repo="$fixture/project"
git -C "$repo" init -b main >/dev/null
git -C "$repo" config user.name 'SakuraGit QA'
git -C "$repo" config user.email 'qa@example.invalid'
git -C "$repo" config commit.gpgsign false
awk 'BEGIN { for(i=1;i<=60;i++) print "line " i }' > "$repo/tracked.txt"
printf 'export const color = "red";\n' > "$repo/code.ts"
git -C "$repo" add tracked.txt code.ts
git -C "$repo" commit -m 'Native development workflow fixture' >/dev/null
tree=$(git -C "$repo" rev-parse 'HEAD^{tree}')
parent=$(git -C "$repo" rev-parse HEAD)
i=1
while [ "$i" -le 425 ]; do
  parent=$(git -C "$repo" commit-tree "$tree" -p "$parent" -m "History pagination fixture $i")
  i=$((i+1))
done
git -C "$repo" update-ref refs/heads/main "$parent"
printf '\nSaved task\n' >> "$repo/tracked.txt"
git -C "$repo" stash push -m 'A task saved for later' >/dev/null
printf 'export const color = "mist-blue";\n' > "$repo/code.ts"
awk 'BEGIN { for(i=1;i<=60;i++) { if(i==2) print "first edited block"; else if(i==55) print "second edited block"; else print "line " i } }' > "$repo/tracked.txt"
printf 'Untracked preview\n' > "$repo/preview.txt"
printf '\000\377ABC' > "$repo/bytes.bin"
git -C "$fixture/remote.git" init --bare >/dev/null 2>&1
git -C "$repo" remote add origin "$fixture/remote.git"
git -C "$repo" push -u origin main >/dev/null 2>&1
printf '%s\n' "$repo" > build/smoke-repository.txt
set -- --smoke --repo "$repo"
writer=''
if [ "$mode" != --skip-auto-refresh ]; then
  (sleep 12; printf 'Changed outside SakuraGit\n' > "$repo/externally-created.txt") &
  writer=$!
  set -- "$@" --smoke-auto-file externally-created.txt
fi
trap '[ -z "$writer" ] || kill "$writer" 2>/dev/null || true' EXIT
log="$PWD/build/native-smoke-v052.log"
errors="$PWD/build/native-smoke-v052-stderr.log"
bundle="${app%/Contents/MacOS/*}"
case "$bundle" in /*) ;; *) bundle="$PWD/$bundle" ;; esac
# LaunchServices gives WKWebView the same foreground/visibility lifecycle as a normal launch.
if [ "$(uname -s)" = Darwin ] && [ -d "$bundle/Contents" ]; then
  : > "$log"
  : > "$errors"
  open -n -W --stdout "$log" --stderr "$errors" -a "$bundle" --args "$@"
else
  "$app" "$@" > "$log" 2>&1 || { cat "$log"; exit 1; }
fi
[ -z "$writer" ] || wait "$writer"
trap - EXIT
if [ "$mode" = --skip-auto-refresh ]; then
  printf '\nSAKURAGIT_SMOKE_SKIPPED_AUTO_REFRESH: explicitly skipped visibility-dependent polling and push-dialog continuation\n' >> "$log"
fi
cat "$log"
if ! grep -q '^SAKURAGIT_SMOKE ' "$log"; then
  [ ! -f "$errors" ] || cat "$errors"
  exit 1
fi
printf '\nFixture retained for inspection: %s\n' "$repo"
