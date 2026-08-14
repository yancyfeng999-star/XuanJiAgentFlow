import { describe, expect, it } from 'vitest';

import { buildSupportSummary, redactSupportText } from '../supportSummary';

describe('support redaction', () => {
  it('removes secrets, tokens, home paths, and prompt bodies', () => {
    const raw = [
      'Authorization: Bearer abcdef',
      'sk-supersecretkeyvalue',
      'session_token=abc123',
      'XUANJI_SESSION_TOKEN=xyz',
      '/Users/yancyfeng/secret/file',
      'prompt: do not leak this instruction body',
    ].join('\n');
    const redacted = redactSupportText(raw);
    expect(redacted).not.toContain('abcdef');
    expect(redacted).not.toContain('sk-supersecretkeyvalue');
    expect(redacted).not.toContain('abc123');
    expect(redacted).not.toContain('xyz');
    expect(redacted).not.toContain('/Users/yancyfeng');
    expect(redacted).not.toContain('do not leak this instruction body');
    expect(buildSupportSummary({ log: raw })).toContain('[redacted]');
  });
});
