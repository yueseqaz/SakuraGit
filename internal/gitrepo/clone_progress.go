package gitrepo

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const cloneTimeout = 30 * time.Minute

type CloneProgress struct {
	ID        string `json:"id"`
	State     string `json:"state"`
	Phase     string `json:"phase"`
	Percent   int    `json:"percent"`
	Detail    string `json:"detail"`
	StartedAt string `json:"startedAt"`
}

type cloneJob struct {
	status CloneProgress
	cancel context.CancelFunc
}

func (e *Engine) CloneRepository(ctx context.Context, id, source, destination, branch string, singleBranch bool) (string, error) {
	if id == "" || len(id) > 100 {
		return "", errors.New("无效的克隆任务标识")
	}
	ctx, cancel := context.WithTimeout(ctx, cloneTimeout)
	defer cancel()
	e.cloneMu.Lock()
	if e.clone != nil && (e.clone.status.State == "running" || e.clone.status.State == "canceling" || e.clone.status.ID == id) {
		e.cloneMu.Unlock()
		return "", errors.New("已有克隆正在进行，或任务标识已使用")
	}
	job := &cloneJob{status: CloneProgress{ID: id, State: "running", Phase: "正在连接 / 等待服务器", Percent: -1, StartedAt: time.Now().Format(time.RFC3339)}, cancel: cancel}
	e.clone = job
	e.cloneMu.Unlock()
	path, err := e.createRepository(ctx, source, destination, false, branch, singleBranch, func(line string) {
		phase, percent, ok := parseCloneProgress(line)
		if !ok {
			return
		}
		e.cloneMu.Lock()
		job.status.Phase, job.status.Percent, job.status.Detail = phase, percent, line
		e.cloneMu.Unlock()
	})
	e.cloneMu.Lock()
	job.status.State, job.status.Phase = "complete", "克隆完成，正在打开仓库"
	if err != nil {
		job.status.State, job.status.Phase = "failed", "克隆未完成"
		if errors.Is(ctx.Err(), context.Canceled) {
			job.status.State, job.status.Phase = "canceled", "克隆已取消"
		}
	}
	e.cloneMu.Unlock()
	return path, err
}

func (e *Engine) CloneProgress(id string) (CloneProgress, error) {
	e.cloneMu.Lock()
	defer e.cloneMu.Unlock()
	if e.clone == nil || e.clone.status.ID != id {
		return CloneProgress{}, errors.New("克隆任务尚未开始或已失效")
	}
	return e.clone.status, nil
}

func (e *Engine) CancelClone(id string) error {
	e.cloneMu.Lock()
	defer e.cloneMu.Unlock()
	if e.clone == nil || e.clone.status.ID != id {
		return errors.New("克隆任务已失效，不会取消其他任务")
	}
	if e.clone.status.State == "running" {
		e.clone.status.State = "canceling"
		e.clone.cancel()
	}
	return nil
}

var clonePercent = regexp.MustCompile(`([0-9]{1,3})%`)
var clonePhases = []struct{ english, chinese string }{
	{"Enumerating objects:", "正在枚举对象"}, {"Counting objects:", "正在统计对象"},
	{"Compressing objects:", "正在压缩对象"}, {"Receiving objects:", "正在接收对象"},
	{"Resolving deltas:", "正在解析差异"}, {"Updating files:", "正在检出文件"},
	{"Checking out files:", "正在检出文件"}, {"Filtering content:", "正在处理文件内容"},
	{"Writing objects:", "正在发送对象"}, {"remote: Resolving deltas:", "服务器正在解析差异"},
}

func parseCloneProgress(line string) (string, int, bool) {
	for _, phase := range clonePhases {
		if strings.Contains(line, phase.english) {
			percent := -1
			if match := clonePercent.FindStringSubmatch(line); len(match) > 1 {
				percent, _ = strconv.Atoi(match[1])
				percent = min(percent, 100)
			}
			return phase.chinese, percent, true
		}
	}
	return "", -1, false
}

// Git progress uses carriage returns, not just newlines. Retain only a bounded
// error tail and line buffer: verbose progress must never exhaust memory.
type cloneOutput struct {
	pending  []byte
	tail     string
	progress func(string)
}

func (w *cloneOutput) Write(p []byte) (int, error) {
	w.tail += string(p)
	if len(w.tail) > 16384 {
		w.tail = w.tail[len(w.tail)-16384:]
	}
	for _, char := range p {
		if char == '\r' || char == '\n' {
			w.flush()
		} else if len(w.pending) < 4096 {
			w.pending = append(w.pending, char)
		}
	}
	return len(p), nil
}

func (w *cloneOutput) flush() {
	if w.progress != nil && len(w.pending) > 0 {
		w.progress(strings.TrimSpace(string(w.pending)))
	}
	w.pending = w.pending[:0]
}

func runClone(ctx context.Context, args []string, progress func(string)) error {
	ctx, cancel := context.WithTimeout(ctx, cloneTimeout)
	defer cancel()
	cmd := gitCommand(ctx, "", args...)
	configureCloneProcess(cmd)
	output := &cloneOutput{progress: func(line string) {
		if progress != nil {
			progress(line)
		}
		reportProgress(ctx, line)
	}}
	cmd.Stderr = output
	err := cmd.Run()
	output.flush()
	if ctx.Err() != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			return errors.New("克隆超过 30 分钟，已停止；请检查网络或在终端重试")
		}
		return fmt.Errorf("克隆已取消: %w", ctx.Err())
	}
	if err != nil {
		if detail := strings.TrimSpace(output.tail); detail != "" {
			return errors.New(detail)
		}
		return err
	}
	return nil
}
