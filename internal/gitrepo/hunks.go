package gitrepo

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"strings"
)

func digest(text string) string { return fmt.Sprintf("%x", sha256.Sum256([]byte(text))) }

// Patches never come from the UI. We derive one hunk from the freshly read Git diff.
func splitHunks(text string) (string, []string, []Hunk) {
	lines := strings.SplitAfter(text, "\n")
	first := -1
	starts := []int{}
	hunks := []Hunk{}
	for i, line := range lines {
		if strings.HasPrefix(line, "@@ ") {
			if first < 0 {
				first = i
			}
			starts = append(starts, i)
			hunks = append(hunks, Hunk{ID: len(hunks), Line: i, Header: strings.TrimSuffix(line, "\n")})
		}
	}
	if first < 0 {
		return "", nil, nil
	}
	patches := []string{}
	for i, start := range starts {
		end := len(lines)
		if i+1 < len(starts) {
			end = starts[i+1]
		}
		patches = append(patches, strings.Join(lines[start:end], ""))
	}
	return strings.Join(lines[:first], ""), patches, hunks
}

func hunkSupported(f File, d Diff) bool {
	if f.Untracked || f.Conflicted || f.OldPath != "" || d.Binary {
		return false
	}
	if (f.Index != "." && f.Index != "M") || (f.Worktree != "." && f.Worktree != "M") {
		return false
	}
	if strings.Contains(d.Text, "\nold mode ") || strings.Contains(d.Text, "\nnew mode ") || strings.Contains(d.Text, "\nnew file mode ") || strings.Contains(d.Text, "\ndeleted file mode ") || strings.Contains(d.Text, "Subproject commit ") || strings.Contains(d.Text, " 120000\n") {
		return false
	}
	return true
}

func (e *Engine) StageHunk(ctx context.Context, root, path string, staged bool, revision string, id int) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	d, err := e.diff(ctx, path, staged)
	if err != nil {
		return Result{}, err
	}
	if revision == "" || d.Revision != revision || id < 0 || id >= len(d.Hunks) {
		return Result{}, errors.New("差异已变化，请刷新后重新选择代码块")
	}
	files, err := e.currentFiles(ctx)
	if err != nil {
		return Result{}, err
	}
	f, ok := findFile(files, path)
	if !ok || !hunkSupported(f, d) {
		return Result{}, errors.New("此文件暂不支持按块暂存，请使用整文件操作")
	}
	prefix, parts, _ := splitHunks(d.Text)
	patch := prefix + parts[id]
	args := []string{"apply", "--cached", "--recount", "--whitespace=nowarn"}
	if staged {
		args = append(args, "--reverse")
	}
	if _, err := runInput(ctx, e.root, patch, append(args, "--check")...); err != nil {
		return Result{}, fmt.Errorf("代码块无法应用，索引可能已变化，请刷新: %w", err)
	}
	out, err := runInput(ctx, e.root, patch, args...)

	return Result{Output: out}, err
}
