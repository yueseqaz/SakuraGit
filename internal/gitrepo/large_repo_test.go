package gitrepo

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestLargeRepositoryPaginationSearchAndExternalChanges(t *testing.T) {
	if testing.Short() {
		t.Skip("10k-commit integration fixture")
	}
	root := t.TempDir()
	git(t, root, "init", "-b", "main")
	var stream strings.Builder
	for i := 1; i <= 10000; i++ {
		subject := fmt.Sprintf("bulk commit %d", i)
		if i == 1 {
			subject = "needle oldest production fixture"
		}
		fmt.Fprintf(&stream, "commit refs/heads/main\nmark :%d\nauthor Fixture Author <fixture@example.invalid> 1700000000 +0000\ncommitter Fixture Author <fixture@example.invalid> 1700000000 +0000\ndata %d\n%s\n", i, len(subject), subject)
		if i > 1 {
			fmt.Fprintf(&stream, "from :%d\n", i-1)
		}
		stream.WriteString("\n")
	}
	cmd := exec.Command("git", "-C", root, "fast-import", "--quiet")
	cmd.Stdin = strings.NewReader(stream.String())
	cmd.Env = append(os.Environ(), "GIT_CONFIG_GLOBAL="+os.DevNull, "GIT_CONFIG_NOSYSTEM=1")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("fast-import: %v %s", err, out)
	}
	for i := 0; i < 2500; i++ {
		if err := os.WriteFile(filepath.Join(root, fmt.Sprintf("file-%04d.txt", i)), []byte("content\n"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	ctx := context.Background()
	e := &Engine{}
	started := time.Now()
	s, err := e.Open(ctx, root)
	if err != nil || len(s.Files) != 2500 || len(s.Commits) != 100 || !s.HistoryHasMore {
		t.Fatalf("large snapshot: files=%d commits=%d err=%v", len(s.Files), len(s.Commits), err)
	}
	openTime := time.Since(started)
	started = time.Now()
	page, err := e.History(ctx, s.Root, "", s.HistoryRevision, 9900)
	if err != nil || len(page.Commits) != 100 || page.HasMore || page.Commits[99].Subject != "needle oldest production fixture" {
		t.Fatalf("deep page: %+v %v", page, err)
	}
	pagingTime := time.Since(started)
	started = time.Now()
	found, err := e.History(ctx, s.Root, "needle oldest", "", 0)
	if err != nil || len(found.Commits) != 1 || found.Commits[0].Author != "Fixture Author" {
		t.Fatalf("full-history search: %+v %v", found, err)
	}
	t.Logf("10,000 commits / 2,500 files: open=%s deep-page=%s search=%s", openTime, pagingTime, time.Since(started))
	cached := e.historyCache
	git(t, root, "add", "file-0000.txt")
	next, err := e.Snapshot(ctx, s.Root)
	if err != nil || e.historyCache != cached || next.Files[0].Index != "A" {
		t.Fatalf("external index/cache refresh: %v", err)
	}
	git(t, root, "branch", "external-tip")
	if _, err = e.History(ctx, s.Root, "", s.HistoryRevision, 100); err == nil {
		t.Fatal("pagination accepted changed external refs")
	}
	if _, err = e.Snapshot(ctx, s.Root); err != nil || e.historyCache == cached {
		t.Fatal("reference changes failed to invalidate cache")
	}
}
