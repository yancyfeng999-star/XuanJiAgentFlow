export function redactSupportText(input: string): string {
  return input
    .replace(/Authorization:\s*Bearer\s+\S+/gi, 'Authorization: Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[redacted-key]')
    .replace(/session_token=[^&\s]+/gi, 'session_token=[redacted]')
    .replace(/XUANJI_SESSION_TOKEN=\S+/g, 'XUANJI_SESSION_TOKEN=[redacted]')
    .replace(/\/Users\/[^/\s]+/g, '~')
    .replace(/\/home\/[^/\s]+/g, '~')
    .replace(/(prompt|instruction)\s*[:=]\s*.+/gi, '$1=[redacted]');
}

export function buildSupportSummary(parts: Record<string, string>): string {
  return Object.entries(parts)
    .map(([key, value]) => `${key}: ${redactSupportText(value)}`)
    .join('\n');
}
