import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { CAPTIONS, AUTO_WAIT_MS, CHARACTERS_PER_SECOND, goalLine, WORLDS, WORLD_WHY } from './data.js';
import { CurrentWorld, WorldMap } from './WorldMap.js';
import { WorldBanner, BANNER_DURATION_MS } from '../scene/WorldBanner.js';
import { ObjectiveHud } from '../story-ui/ObjectiveHud.js';

it('keeps the eight captions in exact order and reaches the final prompt within 45 seconds', () => {
  expect(CAPTIONS).toEqual([
    'Once, someone wrote a world.',
    'Every tree, every house, every road:\na letter on a page.',
    'They called it Folio, and wrote\na little more of it every night.',
    'Then one night the sky went black.\nThe writer never came back.',
    'Now something grey walks the land.\nIt deletes it, one row at a time.',
    "You are Tilde. You live on the last row.\nIt's coming your way.",
    "Find the Scribe. Make them save the world\nbefore there's nothing left to save.",
    "You move the way text moves: with keys.\nYou'll learn each one when you need it.",
  ]);
  expect(CAPTIONS.slice(0, -1).reduce((ms, text) => ms + text.length / CHARACTERS_PER_SECOND * 1000 + AUTO_WAIT_MS, 0)).toBeLessThan(45000);
  expect(CAPTIONS.join(' ')).not.toMatch(/\b(file|swap|crash|buffer)\b/i);
});
it.each(WORLDS)('shows visited, current and unknown map places for %s', world => {
  const html = renderToStaticMarkup(createElement(WorldMap, { world }));
  const index = WORLDS.indexOf(world);
  expect(html.match(/data-state="visited"/g) ?? []).toHaveLength(index);
  expect(html.match(/data-state="current"/g)).toHaveLength(1);
  expect(html.match(/data-state="unknown"/g) ?? []).toHaveLength(WORLDS.length - index - 1);
  expect(html).toContain('aria-current="location"');
  const labels = [...html.matchAll(/aria-label="([^"]+)"/g)].map(match => match[1]).join(' ');
  for (const later of WORLDS.slice(index + 1)) {
    const names = { margin: 'The Margin', lowlands: 'Lowlands', quarry: 'The Quarry', wordwood: 'Wordwood', 'copper-port': 'Copper Port', library: 'The Library', 'echo-caves': 'Echo Caves', 'last-page': 'The Last Page' };
    expect(labels).not.toContain(names[later]);
  }
  const banner = renderToStaticMarkup(createElement(WorldBanner, { world, onDismiss: () => {} }));
  expect(banner).toContain(renderToStaticMarkup(createElement('p', null, WORLD_WHY[world])));
  expect(banner).toContain('Folio map'); expect(BANNER_DURATION_MS).toBe(2600);
});
it.each(WORLDS)('keeps the goal visible in the HUD for %s', world => {
  const html = renderToStaticMarkup(createElement(CurrentWorld.Provider, { value: world },
    createElement(ObjectiveHud, { objectives: [], hearts: 3, maxHearts: 3, turn: 0 })));
  expect(html).toContain(goalLine(world));
  if (world === 'last-page' || world === 'margin') expect(html).not.toContain('World ');
  else expect(html).toContain(`World ${WORLDS.indexOf(world)} of 6`);
});
