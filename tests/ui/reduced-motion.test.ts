/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// Read the CSS as text (Vitest's CSS pipeline would hand back an empty module).
const theme = readFileSync('src/ui/theme.css', 'utf8');
const cell = readFileSync('src/ui/Cell.module.css', 'utf8');

describe('prefers-reduced-motion (SPEC 6.6)', () => {
  it('the global stylesheet disables animations, transitions and smooth scrolling', () => {
    const block = theme.slice(theme.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/animation-duration:\s*0\.001ms\s*!important/);
    expect(block).toMatch(/transition-duration:\s*0\.001ms\s*!important/);
    expect(block).toMatch(/scroll-behavior:\s*auto/);
  });

  it('the refusal shake becomes a static outline', () => {
    expect(cell).toMatch(/prefers-reduced-motion: reduce\)\s*{\s*\.shake\s*{\s*animation:\s*none/);
  });
});
