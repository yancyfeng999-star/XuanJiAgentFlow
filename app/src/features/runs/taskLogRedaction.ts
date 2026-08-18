export const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/-]+/gi,
  /\bsk-[A-Za-z0-9_-]{8,}/g,
  /\b[0-9a-f]{64}\b/g,
  /XUANJI_SESSION_TOKEN=\S+/g,
  /\/Users\/[^/\s]+/g,
];

export function redactLogText(line: string): string {
  let redacted = line;
  for (const pattern of SECRET_PATTERNS) {
    redacted = redacted.replace(pattern, (match) =>
      match.startsWith('/Users/') ? '~' : '[已脱敏]',
    );
  }
  return redacted;
}

export function logText(event: Record<string, unknown>, index: number): string {
  if (typeof event.message === 'string') return event.message;
  if (typeof event.text === 'string') return event.text;
  if (typeof event.line === 'string') return event.line;
  try {
    return JSON.stringify(event);
  } catch {
    return `log-${index}`;
  }
}
