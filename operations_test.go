package main

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestOperationExclusionAndExactCancellation(t *testing.T) {
	g := &Git{}
	entered, done := make(chan struct{}), make(chan error, 1)
	go func() {
		_, err := withOperation(g, context.Background(), "slow", true, func(ctx context.Context) (int, error) { close(entered); <-ctx.Done(); return 0, ctx.Err() })
		done <- err
	}()
	<-entered
	status := g.OperationStatus()
	if status.State != "running" || status.ID == "" {
		t.Fatalf("bad status: %+v", status)
	}
	if _, err := withOperation(g, context.Background(), "other", false, func(context.Context) (int, error) { t.Error("concurrent mutation executed"); return 0, nil }); err == nil {
		t.Fatal("concurrent mutation accepted")
	}
	if g.CancelOperation("stale") == nil {
		t.Fatal("accepted stale cancellation")
	}
	if g.OperationStatus().State != "running" {
		t.Fatal("stale cancel affected active operation")
	}
	if err := g.CancelOperation(status.ID); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if !errors.Is(err, context.Canceled) {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("cancel did not finish")
	}
	if g.OperationStatus().State != "canceled" {
		t.Fatal(g.OperationStatus())
	}
}

func TestOperationPanicCleanupAndDeadline(t *testing.T) {
	g := &Git{}
	_, err := withOperation(g, context.Background(), "panic", false, func(context.Context) (int, error) { panic("fixture panic") })
	if err == nil || g.OperationStatus().State != "failed" {
		t.Fatalf("panic not cleaned up: %v", err)
	}
	select {
	case <-g.operation.done:
	default:
		t.Fatal("exit waiter left blocked")
	}
	_, err = withOperation(g, context.Background(), "next", false, func(ctx context.Context) (int, error) {
		d, ok := ctx.Deadline()
		if !ok || time.Until(d) > 5*time.Minute {
			t.Error("missing job deadline")
		}
		return 1, nil
	})
	if err != nil || g.OperationStatus().State != "complete" {
		t.Fatal(err)
	}
	g.exitApproved = true
	if _, err := withOperation(g, context.Background(), "exit", false, func(context.Context) (int, error) { return 1, nil }); err == nil {
		t.Fatal("accepted operation while exiting")
	}
}
