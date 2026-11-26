import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
const css = readFileSync(new URL('./notebook.css', import.meta.url), 'utf8');
it('keeps the page within the viewport without scroll containers', () => {
  expect(css).not.toMatch(/overflow(?:-[xy])?\s*:\s*(auto|scroll)/);
  expect(css).toContain('width: min(94vw, 640px)');
  expect(css).toContain('max-height: 94vh');
  expect(css).toContain('clamp(');
  expect(css).toContain('240ms');
  expect(css).toContain('rgb(0 0 0 / 55%)');
});
it('disables both entrance and mistake animation with reduced motion', () => {
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\).*animation: none/s);
});

it('uses readable ink on paper and gold, including lit keys and letter tiles', async () => {
  const { contrastRatio, WORLD_PALETTES } = await import('../../scene/palette.js');
  const ink = Number.parseInt(css.match(/--notebook-ink: #([0-9a-f]+)/)![1]!, 16);
  const paper = Number.parseInt(css.match(/--notebook-paper: #([0-9a-f]+)/)![1]!, 16);
  const gold = Number.parseInt(css.match(/--notebook-gold: #([0-9a-f]+)/)![1]!, 16);
  expect(contrastRatio(ink, paper)).toBeGreaterThanOrEqual(4.5);
  expect(contrastRatio(ink, gold)).toBeGreaterThanOrEqual(4.5);
  // Faint rules composite the rule pigment at 8% onto the paper.
  const ruled = [16, 8, 0].reduce((color, shift) => color | Math.round(
    ((0x51432f >> shift) & 255) * (20 / 255) + ((paper >> shift) & 255) * (235 / 255)) << shift, 0);
  expect(contrastRatio(ink, ruled)).toBeGreaterThanOrEqual(4.5);
  for (const palette of Object.values(WORLD_PALETTES)) expect(contrastRatio(palette.ink, palette.paper)).toBeGreaterThanOrEqual(4.5);
  expect(css).not.toContain('opacity:');
  expect(css).toContain('border: 2px solid var(--notebook-ink)');
  expect(css).toContain('border-bottom-width: 4px');
  expect(css).toContain('23px 24px');
  expect(css).toContain('width: 48px; height: 48px');
});
