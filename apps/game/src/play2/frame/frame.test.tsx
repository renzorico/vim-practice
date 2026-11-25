import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createEngine, type Mode } from '@escape/engine';
import { ObjectiveHud } from '../../story-ui/ObjectiveHud.js';
import { StatusLine, MODE_LABELS } from './StatusLine.js';
import { dialogueSide } from './dialogueSide.js';
import { contrastRatio } from '../../scene/palette.js';
import { keyTextLength } from '../KeyText.js';

/** The header's own boxes, in order: what decides its height. */
function headerSkeleton(html: string): readonly string[] {
  return [...html.matchAll(/<(?:aside|div) class="(objective-hud(?:__\w+)?)"/g)].map(match => match[1] ?? '');
}

it.each([0, 1, 3])('keeps both header rows with %i objectives, with and without a guide', count => {
  for (const guide of [null, { kind: 'do' as const, keys: ['5', 'r', '='], standAt: [{ line: 0, col: 0 }] }]) {
    const html = renderToStaticMarkup(createElement(ObjectiveHud, {
      title: 'The Margin', objectives: ['Main quest', 'Side one', 'Side two'].slice(0, count),
      hearts: 3, maxHearts: 3, turn: 0, guide,
    }));
    expect(headerSkeleton(html)).toEqual(['objective-hud', 'objective-hud__row', 'objective-hud__stats', 'objective-hud__strip',
      'objective-hud__main', 'objective-hud__side', 'objective-hud__guide']);
    if (count === 3) {
      expect(html).toContain('>+2</span>');
      expect(html).toContain('<li>Side one</li>');
    }
  }
});

it('keeps every authored objective inside the 96 visible character budget', () => {
  // At 900px: 32px padding + 220px guide + 40px badge/gaps leaves 608px.
  // 11px UI text and raised inline keys have at least 52 characters per line;
  // 96 leaves eight characters of slack over two 17px lines in the 44px strip.
  const folder = new URL('../../../../../packages/story/content/', import.meta.url);
  let checked = 0;
  const visit = (value: unknown, file: string): void => {
    if (Array.isArray(value)) { for (const item of value) visit(item, file); return; }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'objective' && typeof child === 'string') {
        expect(keyTextLength(child), `${file}: ${child}`).toBeLessThanOrEqual(96);
        checked += 1;
      }
      visit(child, file);
    }
  };
  for (const file of readdirSync(folder).filter(name => name.endsWith('.json'))) {
    const data: unknown = JSON.parse(readFileSync(new URL(file, folder), 'utf8'));
    visit(data, file);
  }
  expect(checked).toBeGreaterThan(50);
});

it.each(Object.keys(MODE_LABELS) as Mode[])('labels engine mode %s', mode => {
  const html = renderToStaticMarkup(createElement(StatusLine, {
    engine: { ...createEngine().init(['hello']), mode, commandLine: mode === 'command-line' ? '/hello' : '' },
    learned: ['h', 'j', 'k', 'l', 'w', 'b', 'e', '$'], textStage: true, restartTaught: false, prompt: null,
  }));
  expect(html).toContain(`>${MODE_LABELS[mode]}</span>`);
  expect(html.match(/class="learned-key"/g)).toHaveLength(6);
  expect(html).toContain('>+2</button>');
  expect(html).toContain('aria-label="Learned commands"');
  expect(html).toContain('aria-label="Pending keys"');
  if (mode === 'command-line') expect(html).toContain('aria-label="Command line">/hello</output>');
  else expect(html).toContain('1:1');
});

it.each([':w', '/stone', '?scribe'])('shows command line %s in the left half', commandLine => {
  const html = renderToStaticMarkup(createElement(StatusLine, {
    engine: { ...createEngine().init(['']), mode: 'command-line', commandLine }, learned: [],
    textStage: false, restartTaught: false, prompt: null,
  }));
  expect(html).toContain(`aria-label="Command line">${commandLine}</output>`);
});

it('places dialogue opposite the player using the rendered camera', () => {
  const tall = Array.from({ length: 80 }, () => ' '.repeat(30));
  const view = { width: 900, height: 600 };
  expect(dialogueSide(tall, { line: 0, col: 0 }, view, { map: tall })).toBe('bottom');
  expect(dialogueSide(tall, { line: 79, col: 0 }, view, { map: tall })).toBe('top');
  expect(dialogueSide(['abc'], { line: 0, col: 0 }, view, { map: ['abc'] })).toBe('bottom');
  expect(dialogueSide(['abc', 'abc', 'abc'], { line: 2, col: 0 }, view, { map: ['abc', 'abc', 'abc'] })).toBe('top');
  expect(dialogueSide(tall, { line: 79, col: 0 }, view, { map: tall, windowHeight: 28 })).toBe('top');
});

it('keeps dialogue and desk variants at 7:1 and readable tabs', () => {
  const css = readFileSync(new URL('../../ui/tokens.css', import.meta.url), 'utf8');
  const token = (name: string): number => {
    const hex = css.match(new RegExp(`--${name}: #([a-f0-9]+);`))?.[1];
    if (!hex) throw new Error(`Missing token ${name}`);
    return Number.parseInt(hex, 16);
  };
  for (const paper of ['paper', 'paper-secondary', 'contract-paper', 'contract-sheet']) {
    expect(contrastRatio(token('ink'), token(paper))).toBeGreaterThanOrEqual(7);
    expect(contrastRatio(token('green-ink'), token(paper))).toBeGreaterThanOrEqual(4.5);
  }
  for (const accent of ['tab-blue', 'tab-gold', 'tab-tan', 'tab-green']) {
    expect(contrastRatio(token('ink'), token(accent))).toBeGreaterThanOrEqual(4.5);
  }
  expect(contrastRatio(token('tab-light-ink'), token('tab-slate'))).toBeGreaterThanOrEqual(4.5);
});
