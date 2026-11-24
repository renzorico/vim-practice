import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import type { Beat } from '@escape/story';
import { content, legend, stage, stages } from './content.js';
import { CutsceneView } from './CutsceneView.js';

const render = (beat: Beat | undefined): string => renderToStaticMarkup(createElement(CutsceneView, { beat, stage, legend, onAdvance: () => {} }));
it('names who speaks, in the dialogue box', () => {
  const html = render({ type: 'line', line: { speaker: 'npc', name: 'The Mason', text: 'It stood.' } });
  expect(html).toContain('class="dialogue__name"'); expect(html).toContain('The Mason');
  expect(html).toContain('dialogue__portrait');
});
it('carves titles, prints terminals, gives the end of a world its own page, and shows nothing without a beat', () => {
  expect(render({ type: 'title', text: 'The Scribe is in another buffer.' })).toContain('story-scene__carving');
  expect(render({ type: 'title', text: 'The lamp is lit.' })).toContain('story-scene__caption');
  expect(render({ type: 'terminal', lines: ['E325: ATTENTION'] })).toContain('story-scene__terminal');
  expect(render({ type: 'line', line: { speaker: 'system', text: 'End of World 3.' } })).toContain('story-scene__chapter');
  expect(render(undefined)).toBe('');
});
it('renders every authored beat with one way to go on', () => {
  expect(stages.length).toBeGreaterThan(20);
  for (const cutscene of content.cutscenes) for (const beat of cutscene.beats) {
    expect(render(beat).match(/aria-label="Enter to go on"/g), cutscene.id).toHaveLength(1);
  }
});
