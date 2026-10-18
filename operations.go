package main

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"time"

	"github.com/egoist/mygo"
	"github.com/yueseqaz/SakuraGit/internal/gitrepo"
)

type OperationStatus struct {
	ID        string `json:"id"`
	Label     string `json:"label"`
	State     string `json:"state"`
	Phase     string `json:"phase"`
	Percent   int    `json:"percent"`
	Detail    string `json:"detail"`
	StartedAt int64  `json:"startedAt"`
}
type operationJob struct {
	status OperationStatus
	cancel context.CancelFunc
	done   chan struct{}
}

func withOperation[T any](g *Git, ctx context.Context, label string, network bool, fn func(context.Context) (T, error)) (value T, err error) {
	var zero T
	limit := 5 * time.Minute
	if network {
		limit = 30 * time.Minute
	}
	ctx, cancel := context.WithTimeout(ctx, limit)
	g.operationMu.Lock()
	if g.exitApproved || g.operation != nil && (g.operation.status.State == "running" || g.operation.status.State == "canceling") {
		g.operationMu.Unlock()
		cancel()
		return zero, errors.New("已有 Git 操作正在执行或应用正在退出，请等待结束")
	}
	job := &operationJob{status: OperationStatus{ID: rand.Text(), Label: label, State: "running", Phase: "正在准备 / 等待 Git", Percent: -1, StartedAt: time.Now().UnixMilli()}, cancel: cancel, done: make(chan struct{})}
	g.operation = job
	g.operationMu.Unlock()
	ctx = gitrepo.WithProgress(ctx, network, func(phase string, percent int, detail string) {
		g.operationMu.Lock()
		job.status.Phase, job.status.Percent, job.status.Detail = phase, percent, detail
		g.operationMu.Unlock()
	})
	defer func() {
		if failure := recover(); failure != nil {
			err = fmt.Errorf("Git 操作意外中断，请刷新检查实际状态: %v", failure)
		}
		g.operationMu.Lock()
		job.status.State, job.status.Phase = "complete", "操作已完成"
		if err != nil || ctx.Err() != nil {
			if err == nil {
				err = ctx.Err()
			}
			job.status.State, job.status.Phase = "failed", "操作未完成，请刷新检查实际状态"
			if errors.Is(ctx.Err(), context.Canceled) {
				job.status.State = "canceled"
			}
		}
		close(job.done)
		g.operationMu.Unlock()
		cancel()
	}()
	return fn(ctx)
}
func (g *Git) OperationStatus() OperationStatus {
	g.operationMu.Lock()
	defer g.operationMu.Unlock()
	if g.operation == nil {
		return OperationStatus{State: "idle", Percent: -1}
	}
	return g.operation.status
}
func (g *Git) CancelOperation(id string) error {
	g.operationMu.Lock()
	defer g.operationMu.Unlock()
	if g.operation == nil || g.operation.status.ID != id {
		return errors.New("操作已失效，不会取消其他任务")
	}
	if g.operation.status.State == "running" {
		g.operation.status.State = "canceling"
		g.operation.cancel()
	}
	return nil
}
func (g *Git) protectExit(win *mygo.Window, quit bool) bool {
	g.operationMu.Lock()
	job := g.operation
	if g.exitApproved || job == nil || (job.status.State != "running" && job.status.State != "canceling") {
		g.operationMu.Unlock()
		return false
	}
	if g.exitPrompt {
		g.operationMu.Unlock()
		return true
	}
	g.exitPrompt = true
	g.operationMu.Unlock()
	go func() {
		defer func() { g.operationMu.Lock(); g.exitPrompt = false; g.operationMu.Unlock() }()
		choice, err := mygo.Dialog.Message(mygo.MessageOptions{Parent: win, Type: mygo.MessageWarning, Title: "Git 操作尚未结束", Message: "等待完成，还是取消后退出？", Detail: "取消不等于回滚。提交、拉取或推送可能已部分完成，下一次打开时请检查实际状态。", Buttons: []string{"继续等待", "取消操作并退出"}, DefaultButton: 0, CancelButton: 0})
		if err != nil || choice.Button != 1 {
			return
		}
		_ = g.CancelOperation(job.status.ID)
		select {
		case <-job.done:
			g.operationMu.Lock()
			// Do not exit if another window started a new operation meanwhile.
			if g.operation != job {
				g.operationMu.Unlock()
				return
			}
			g.exitApproved = true
			g.operationMu.Unlock()
			if quit {
				mygo.App.Quit()
			} else {
				win.Close()
			}
		case <-time.After(15 * time.Second):
			_, _ = mygo.Dialog.Message(mygo.MessageOptions{Parent: win, Type: mygo.MessageWarning, Message: "Git 仍在停止中，已保留窗口", Detail: "不会强制退出并遗留后台进程。请等待操作结束后再关闭。"})
		}
	}()
	return true
}
