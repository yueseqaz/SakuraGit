package gitrepo

import "context"

type progressContext struct {
	network bool
	report  func(string, int, string)
}
type progressKey struct{}

func WithProgress(ctx context.Context, network bool, report func(string, int, string)) context.Context {
	return context.WithValue(ctx, progressKey{}, progressContext{network, report})
}
func reportProgress(ctx context.Context, line string) {
	if p, ok := ctx.Value(progressKey{}).(progressContext); ok && p.report != nil {
		if phase, percent, known := parseCloneProgress(line); known {
			p.report(phase, percent, line)
		}
	}
}
