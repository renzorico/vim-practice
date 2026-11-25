import { expect, it } from 'vitest';
import { FIRST_HINT_KEYS, scriptHint, UNFINISHED } from './scriptHints.js';
import { stages } from './content.js';

const scripts = stages.flatMap(item => item.stage.scripts);

it('every script with hints says when each of them is finished', () => {
  expect(scripts.length).toBeGreaterThan(0);
  for (const script of scripts) {
    const target = script.goals.find(goal => goal.type === 'transform');
    if (!target) throw new Error(`${script.id} has no target text`);
    const checks = UNFINISHED[script.id] ?? [];
    expect(checks, script.id).toHaveLength(script.hints.length);
    checks.forEach((unfinished, index) => {
      expect(unfinished(script.startLines.join('\n')), `${script.id} ${index} at the start`).toBe(true);
      expect(unfinished(target.targetLines.join('\n')), `${script.id} ${index} at the end`).toBe(false);
    });
  }
});

it('waits, then names the first unfinished part, and moves on once it is done', () => {
  const harbour = scripts.find(script => script.id === 'harbour.book')!;
  expect(scriptHint(harbour, harbour.startLines, FIRST_HINT_KEYS - 1)).toBeUndefined();
  expect(scriptHint(harbour, harbour.startLines, FIRST_HINT_KEYS)).toBe(harbour.hints[0]);
  const named = harbour.startLines.map(line => line.replace('the clerk', 'Ream'));
  expect(scriptHint(harbour, named, FIRST_HINT_KEYS)).toBe(harbour.hints[1]);
});
