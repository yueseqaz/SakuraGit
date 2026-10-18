import { expect, it } from 'vitest';
import { describeGitError, redactGitError } from './ErrorDetails';
it.each([
  ['Permission denied (publickey).', 'ssh'],
  ['fatal: Authentication failed', 'authentication'],
  ['HTTP 403 Forbidden', 'permission'],
  ['SSL certificate problem', 'tls'],
  ['Host key verification failed', 'host-key'],
  ['Could not resolve host', 'dns'],
  ['Connection timed out', 'timeout'],
  ['fatal: not possible to fast-forward', 'diverged'],
  ['index.lock exists', 'locked'],
  ['context canceled', 'canceled'],
  ['gpg failed to sign', 'signing'],
  ['dubious ownership', 'ownership'],
  ['pre-push hook declined', 'hook'],
  ['No space left on device', 'disk'],
])('classifies %s with actionable guidance', (message, code) => {
  const info = describeGitError(new Error(message));
  expect(info.code).toBe(code);
  expect(info.hint.length).toBeGreaterThan(10);
});
it('redacts URL credentials, HTTP authorization and tokens before display', () => {
  const credential = ['fake', 'credential'].join('-');
  const result = redactGitError(
    `https://user:${credential}@git.invalid/repo?access_token=secretquery Authorization: Bearer secretheader PRIVATE-TOKEN: secretprivate`,
  );
  for (const value of [credential, 'secretquery', 'secretheader', 'secretprivate'])
    expect(result).not.toContain(value);
  expect(result).toContain('git.invalid/repo');
});
it('bounds raw server output and preserves useful tail', () => {
  const raw = describeGitError('x'.repeat(20000) + ' failed').raw;
  expect(raw.length).toBeLessThanOrEqual(16000);
  expect(raw.endsWith(' failed')).toBe(true);
});
