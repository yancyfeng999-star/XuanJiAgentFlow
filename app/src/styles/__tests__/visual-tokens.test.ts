import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const stylesDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function readCss(name: string): string {
  return readFileSync(join(stylesDir, name), 'utf8');
}

function productCss(): string {
  return [
    readCss('tokens.css'),
    readCss('globals.css'),
    readFileSync(join(stylesDir, '../app/AppShell.css'), 'utf8'),
  ].join('\n');
}

describe('visual token contract', () => {
  it('defines system sans, SF Mono, and the Codex density type scale', () => {
    expect(existsSync(join(stylesDir, 'tokens.css'))).toBe(true);
    const tokens = readCss('tokens.css');
    expect(tokens).toMatch(/--font-sans:[^;]*-apple-system/);
    expect(tokens).toMatch(/--font-sans:[^;]*PingFang SC/);
    expect(tokens).toMatch(/--font-mono:[^;]*SF Mono|SFMono-Regular/);
    expect(tokens).toMatch(/--text-body:\s*13px/);
    expect(tokens).toMatch(/--text-control:\s*13px/);
    expect(tokens).toMatch(/--text-secondary:\s*12px/);
    expect(tokens).toMatch(/--text-meta:\s*11px/);
    expect(tokens).toContain(':root[data-theme="light"]');
    expect(tokens).toContain(':root[data-theme="dark"]');
    expect(tokens).toMatch(/--header-height:\s*52px/);
    expect(tokens).toMatch(/--readiness-strip-height:\s*40px/);
    expect(tokens).toMatch(/--button-disabled-bg:/);
    expect(tokens).toMatch(/--button-disabled-text:/);
  });

  it('does not force global antialiased smoothing or a custom WebKit scrollbar', () => {
    const css = productCss();
    expect(css).not.toMatch(/-webkit-font-smoothing:\s*antialiased/);
    expect(css).not.toMatch(/::-webkit-scrollbar\s*\{/);
  });

  it('does not restore a three-column grid at max-width 1000px', () => {
    const css = readFileSync(join(stylesDir, '../app/AppShell.css'), 'utf8');
    expect(css).not.toMatch(/@media\s*\(max-width:\s*1000px\)[^{]*\{[^}]*grid-template-columns:\s*190px/);
  });

  it('does not use Songti SC or 9/10px for necessary product text', () => {
    const css = productCss();
    expect(css).not.toMatch(/Songti SC/);
    expect(css).not.toMatch(/font-size:\s*9px/);
    expect(css).not.toMatch(/font-size:\s*10px/);
    expect(css).not.toMatch(/--font-display:[^;]*Songti/);
  });
});
