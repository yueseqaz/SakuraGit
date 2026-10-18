import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { demoSnapshot } from './demo';
import { quoteGitArg, syncCommand } from './sync-plan';
import { CommandDetails, SyncSummary } from './SyncSummary';

describe('sync confirmation', () => {
  const plan = {
    ...demoSnapshot,
    branch: 'feature/local',
    upstreamRemote: 'team/origin',
    upstreamBranch: 'release/next',
  };
  it('uses actual configured destination, not a placeholder or a split upstream label', () => {
    expect(syncCommand('push', plan)).toBe(
      'git push --no-force --no-follow-tags --recurse-submodules=no team/origin HEAD:refs/heads/release/next',
    );
    expect(syncCommand('push')).toBe('');
    expect(syncCommand('pull', plan)).toBe(
      'git -c merge.autostash=false pull --ff-only --no-rebase team/origin refs/heads/release/next',
    );
  });
  it('quotes shell-sensitive branch names for the display only', () => {
    expect(quoteGitArg('topic/$HOME')).toBe("'topic/$HOME'");
    expect(quoteGitArg("topic/it's")).toBe("'topic/it'\\''s'");
  });
  it('shows source, target and counts without exposing a template command as the main UI', () => {
    const html = renderToStaticMarkup(createElement(SyncSummary, { action: 'push', plan }));
    expect(html).toContain('feature/local');
    expect(html).toContain('team/origin');
    expect(html).toContain('release/next');
    expect(html).toContain('推送 2 个本地提交');
    expect(html).not.toContain('git push');
    expect(html).not.toContain('upstream-remote');
  });
  it('keeps commands collapsed and explains zero-ahead or behind states', () => {
    const html = renderToStaticMarkup(
      createElement(CommandDetails, { command: syncCommand('push', plan) }),
    );
    expect(html).toContain('<details');
    expect(html).not.toContain(' open');
    const warning = renderToStaticMarkup(
      createElement(SyncSummary, { action: 'push', plan: { ...plan, ahead: 0, behind: 3 } }),
    );
    expect(warning).toContain('请先拉取');
    expect(warning).toContain('没有已知的待推送提交');
  });
});
