package gitrepo

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

var unifiedHeader = regexp.MustCompile(`^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@`)

// The frontend sends positions, never a patch. Unselected deletions become
// context, and unselected additions disappear. Unstaging uses the inverse diff.
func selectedLinePatch(text string, selected []int, reverse bool) (string, error) {
	lines := strings.Split(strings.TrimSuffix(text, "\n"), "\n")
	wanted := make(map[int]bool, len(selected))
	for _, i := range selected {
		if i < 0 || i >= len(lines) || len(lines[i]) == 0 || (lines[i][0] != '+' && lines[i][0] != '-') {
			return "", errors.New("请选择可暂存的变更行")
		}
		wanted[i] = true
	}
	if len(wanted) == 0 || len(wanted) > 3000 {
		return "", errors.New("请选择 1 至 3000 行变更")
	}
	first := -1
	for i, line := range lines {
		if unifiedHeader.MatchString(line) {
			first = i
			break
		}
	}
	if first < 0 {
		return "", errors.New("没有可应用的差异")
	}
	patch := strings.Join(lines[:first], "\n") + "\n"
	delta, used := 0, 0
	for i := first; i < len(lines); {
		match := unifiedHeader.FindStringSubmatch(lines[i])
		if match == nil {
			return "", errors.New("不支持的差异格式")
		}
		start, _ := strconv.Atoi(match[1])
		count := 1
		if match[2] != "" {
			count, _ = strconv.Atoi(match[2])
		}
		if reverse {
			start, _ = strconv.Atoi(match[3])
			count = 1
			if match[4] != "" {
				count, _ = strconv.Atoi(match[4])
			}
		}
		i++
		body := []string{}
		oldCount, newCount, changes := 0, 0, 0
		previousKept := false
		for ; i < len(lines) && !strings.HasPrefix(lines[i], "@@ "); i++ {
			line := lines[i]
			if strings.HasPrefix(line, "\\") {
				if previousKept {
					body = append(body, line)
				}
				continue
			}
			if len(line) == 0 {
				return "", errors.New("不完整的差异行")
			}
			kind := line[0]
			if reverse {
				if kind == '+' {
					kind = '-'
				} else if kind == '-' {
					kind = '+'
				}
			}
			if wanted[i] {
				changes++
				used++
			} else if kind == '+' {
				previousKept = false
				continue
			} else if kind == '-' {
				kind = ' '
			}
			if kind != ' ' && kind != '+' && kind != '-' {
				return "", errors.New("不支持的差异行")
			}
			body = append(body, string(kind)+line[1:])
			previousKept = true
			if kind != '+' {
				oldCount++
			}
			if kind != '-' {
				newCount++
			}
		}
		if changes == 0 {
			continue
		}
		newStart := start + delta
		if count == 0 && newCount > 0 {
			newStart++
		}
		if oldCount > 0 && newCount == 0 {
			newStart--
		}
		patch += fmt.Sprintf("@@ -%d,%d +%d,%d @@\n%s\n", start, oldCount, newStart, newCount, strings.Join(body, "\n"))
		delta += newCount - oldCount
	}
	if used != len(wanted) {
		return "", errors.New("所选行不是代码变更，请刷新")
	}
	return patch, nil
}

func (e *Engine) StageLines(ctx context.Context, root, path string, staged bool, revision string, positions []int) (Result, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	if err := e.checkRoot(root); err != nil {
		return Result{}, err
	}
	d, err := e.diff(ctx, path, staged)
	if err != nil {
		return Result{}, err
	}
	if revision == "" || d.Revision != revision {
		return Result{}, errors.New("差异已变化，请刷新后重新选择行")
	}
	files, err := e.currentFiles(ctx)
	if err != nil {
		return Result{}, err
	}
	f, ok := findFile(files, path)
	if !ok || !hunkSupported(f, d) {
		return Result{}, errors.New("此文件不支持按行暂存，请使用整文件操作")
	}
	patch, err := selectedLinePatch(d.Text, positions, staged)
	if err != nil {
		return Result{}, err
	}
	args := []string{"apply", "--cached", "--recount", "--unidiff-zero", "--whitespace=nowarn"}
	if _, err = runInput(ctx, e.root, patch, append(args, "--check")...); err != nil {
		return Result{}, fmt.Errorf("所选行无法应用，请刷新：%w", err)
	}
	out, err := runInput(ctx, e.root, patch, args...)
	return Result{Output: out}, err
}
