import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { createStoryEngine } from '@escape/story';
import { StageSelect } from './StageSelect.js';
import { content, stages } from './content.js';

it('groups stages in story order, disables missing entries and renders scored and unscored results', () => {
  const story = createStoryEngine().init(content);
  const html = renderToStaticMarkup(createElement(StageSelect, { stages, content,
    progress: { stage: 'lowlands', story, entries: { margin: story, lowlands: story },
      best: { lowlands: { turns: 3, stars: 2 }, ledger: { turns: 1, stars: 3 } } },
    selected: 'lowlands', onSelect: () => {}, onBack: () => {} }));
  const rows = html.match(/<li>.*?<\/li>/g) ?? [];
  expect(rows).toHaveLength(stages.length);
  expect(rows[0]).not.toContain('disabled');
  expect(rows[0]).toContain('>-</span>');
  expect(rows[1]).not.toContain('disabled');
  expect(rows[1]).toContain('2 / 3 stars');
  expect(rows[1]).toContain('aria-current="true"');
  expect(rows.slice(2).every(row => row.includes('disabled'))).toBe(true);
  expect(rows[2]).toContain('>-</span>');
  expect(html).not.toContain('0 / 3 stars');
  const ledger = rows[stages.findIndex(item => item.stage.id === 'ledger')];
  expect(ledger).toContain('>-</span>');
  const headings = content.worlds.slice().sort((a, b) => a.order - b.order).map(world => html.indexOf(`id="world-${world.id}"`));
  expect(headings).toEqual(headings.slice().sort((a, b) => a - b));
});

it('always offers the Margin with old saves and without a save', () => {
  const story = createStoryEngine().init(content);
  for (const progress of [null, { stage: 'lowlands', story }]) {
    const html = renderToStaticMarkup(createElement(StageSelect, { stages, content, progress,
      selected: 'margin', onSelect: () => {}, onBack: () => {} }));
    const margin = html.match(/<li>.*?<\/li>/)?.[0];
    expect(margin).toBeDefined();
    expect(margin).not.toContain('disabled');
    expect(margin).not.toContain('Locked');
  }
});

it('previews only a reached stage', () => {
  const story = createStoryEngine().init(content);
  const render = (selected: string): string => renderToStaticMarkup(createElement(StageSelect, { stages, content,
    progress: { stage: 'lowlands', story, entries: { margin: story, lowlands: story } }, selected, onSelect: () => {}, onBack: () => {} }));
  expect(render('lowlands')).toContain('class="stage-picture"');
  expect(render('quarry-road')).not.toContain('stage-select__preview');
});
