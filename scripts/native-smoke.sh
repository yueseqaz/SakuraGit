#!/bin/sh
# Offline fixture only. The app reads it; this script creates one external edit.
set -eu
cd "$(dirname "$0")/.."
app="${1:-build/darwin-arm64/Gitlane.app/Contents/MacOS/Gitlane}"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_TERMINAL_PROMPT=0
fixture=$(mktemp -d "${TMPDIR:-/tmp}/gitlane-v031-smoke-XXXXXX")
mkdir "$fixture/project" "$fixture/remote.git"
repo="$fixture/project"
git -C "$repo" init -b main >/dev/null
git -C "$repo" config user.name 'Gitlane QA'
git -C "$repo" config user.email 'qa@example.invalid'
git -C "$repo" config commit.gpgsign false
awk 'BEGIN { for(i=1;i<=60;i++) print "line " i }' > "$repo/tracked.txt"
git -C "$repo" add tracked.txt
git -C "$repo" commit -m 'Native development workflow fixture' >/dev/null
printf '\nSaved task\n' >> "$repo/tracked.txt"
git -C "$repo" stash push -m 'A task saved for later' >/dev/null
awk 'BEGIN { for(i=1;i<=60;i++) { if(i==2) print "first edited block"; else if(i==55) print "second edited block"; else print "line " i } }' > "$repo/tracked.txt"
printf 'Untracked preview\n' > "$repo/preview.txt"
git -C "$fixture/remote.git" init --bare >/dev/null 2>&1
git -C "$repo" remote add origin "$fixture/remote.git"
git -C "$repo" push -u origin main >/dev/null 2>&1
printf '%s\n' "$repo" > build/smoke-repository.txt
(sleep 5; printf 'Changed outside Gitlane\n' > "$repo/externally-created.txt") &
writer=$!
"$app" --smoke --repo "$repo" --smoke-auto-file externally-created.txt > build/native-smoke-v031.log 2>&1 || { cat build/native-smoke-v031.log; exit 1; }
wait "$writer"
cat build/native-smoke-v031.log
printf '\nFixture retained for inspection: %s\n' "$repo"
