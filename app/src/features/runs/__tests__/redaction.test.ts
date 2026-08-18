import { describe, expect, it } from 'vitest';

import { redactLogText } from '../taskLogRedaction';

describe('log redaction', () => {
  it('redacts bearer tokens, api keys, hashes, session tokens and home paths', () => {
    expect(redactLogText('Authorization: Bearer abc.def.ghi')).toBe('Authorization: [已脱敏]');
    expect(redactLogText('key sk-abc123XYZ_99 here')).toBe('key [已脱敏] here');
    expect(redactLogText(`sha ${'a'.repeat(64)}`)).toBe('sha [已脱敏]');
    expect(redactLogText('XUANJI_SESSION_TOKEN=tok123')).toBe('[已脱敏]');
    expect(redactLogText('/Users/yancyfeng/project/file.md')).toBe('~/project/file.md');
    expect(redactLogText('普通日志内容')).toBe('普通日志内容');
  });
});
