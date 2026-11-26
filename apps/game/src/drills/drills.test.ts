import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEngine } from '@escape/engine';
import { createStoryEngine } from '@escape/story';
import { createWorldSim } from '@escape/world';
import { applySetResult } from '@escape/curriculum';
import { StageClearCard } from '../play2/StageClearCard.js';
import { createSession } from '../play2/session.js';
import { content, legend, stage } from '../play2/content.js';
import { clearedForCopybook, copybookSkills, nextSkill, skillStatus } from './Copybook.js';
import { focusedButton } from './focusedButton.js';
import { keyLabel } from './DrillScreen.js';
import { DRILLS_KEY, EMPTY_DRILLS, nextSeed, readDrills, saveDrills, type DrillProgress } from './store.js';

const NOW = '2026-11-26T10:00:00.000Z';

function memory(initial: string | null = null) {
  let value = initial;
  return {
    getItem: (key: string) => (key === DRILLS_KEY ? value : null),
    setItem: (_key: string, next: string) => { value = next; },
    removeItem: () => { value = null; },
  };
}

describe('drill store', () => {
  it('round-trips progress and starts seeds at 1', () => {
    const store = memory();
    const progress: DrillProgress = { mastery: { 'edit.x': applySetResult(undefined, 'edit.x', true, NOW) }, seeds: { 'edit.x': 4 } };
    saveDrills(() => store, progress);
    expect(readDrills(() => store)).toEqual(progress);
    expect(nextSeed(progress, 'edit.x')).toBe(4);
    expect(nextSeed(progress, 'edit.r')).toBe(1);
  });
  it('treats corrupt or blocked storage as an empty Copybook', () => {
    expect(readDrills(() => memory('{"mastery": 3}'))).toEqual(EMPTY_DRILLS);
    expect(readDrills(() => memory('not json'))).toEqual(EMPTY_DRILLS);
    expect(readDrills(() => { throw new Error('blocked'); })).toEqual(EMPTY_DRILLS);
  });
});

describe('copybookSkills', () => {
  it('lists only skills from cleared stages, in teaching order, and marks the weakest next', () => {
    expect(copybookSkills([])).toEqual([]);
    const strong = applySetResult(applySetResult(undefined, 'motion.hjkl', true, NOW), 'motion.hjkl', true, NOW);
    const progress = { mastery: { 'motion.hjkl': strong }, seeds: {} };
    const skills = copybookSkills(['margin', 'lowlands']);
    expect(skills.map(skill => skill.id)).toEqual(['motion.hjkl', 'motion.count', 'motion.word', 'motion.line']);
    expect(nextSkill(skills, progress, NOW)?.id).toBe('motion.count');
    expect(skillStatus(skills[0]!, progress, NOW)).toBe('');
    expect(skillStatus(skills[1]!, progress, NOW)).toBe('new');
  });
});

describe('clearedForCopybook', () => {
  const ids = ['margin', 'lowlands', 'lighthouse', 'quarry-road', 'cut'];
  const story = createStoryEngine().init(content);
  it('counts stages before the furthest one reached, and stages with a best score, for saves without a cleared list', () => {
    expect(clearedForCopybook(null, ids, [])).toEqual([]);
    const cleared = clearedForCopybook({ stage: 'quarry-road', story, best: { cut: { turns: 4, stars: 2 } } }, ids, []);
    expect([...cleared].sort()).toEqual(['cut', 'lighthouse', 'lowlands', 'margin']);
  });
});

describe('Enter on a focused button', () => {
  it('is left to the button, not the screen shortcut', () => {
    class FakeButton {}
    Object.assign(globalThis, { HTMLButtonElement: FakeButton });
    try {
      expect(focusedButton({ target: new FakeButton() } as unknown as KeyboardEvent)).toBe(true);
      expect(focusedButton({ target: {} } as unknown as KeyboardEvent)).toBe(false);
    } finally { Reflect.deleteProperty(globalThis, 'HTMLButtonElement'); }
  });
});

describe('drill screen', () => {
  it('shows a space as a visible key', () => {
    expect(keyLabel(' ')).toBe('␣');
    expect(keyLabel('<C-r>')).toBe('<C-r>');
  });
});

describe('stage clear card', () => {
  const session = createSession({ sim: createWorldSim(createEngine()), storyEngine: createStoryEngine(), stage, legend, content }).init(false);
  const render = (practise?: { keys: readonly string[]; onPractise: () => void }) => renderToStaticMarkup(createElement(StageClearCard, {
    session, stage, onContinue: () => {}, onReplay: () => {}, ...(practise ? { practise } : {}),
  }));
  it('offers to practise the stage keys', () => {
    const html = render({ keys: ['w', 'b'], onPractise: () => {} });
    expect(html).toContain('practise');
    expect(html).toContain('>w</kbd>');
  });
  it('hides the button for stages with nothing to drill', () => {
    expect(render()).not.toContain('practise');
  });
});
