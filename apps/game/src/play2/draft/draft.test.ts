import { parseKeys } from '@escape/engine';
import { expect, it } from 'vitest';
import { stages } from '../content.js';
import { draftCommands, draftDone, draftKey, goToCell, openDraft, reachedOtherwise, taskDone } from './draftModel.js';
import { cellOf, DRAFTS } from './drafts.js';

for (const draft of DRAFTS) it(`${draft.stage}: following its instructions finishes it, task by task, with keys the player has`, () => {
  const entry = stages.find(item => item.stage.id === draft.stage);
  expect(entry?.stage.type).not.toBe('text');
  const commands = draftCommands(draft.stage);
  let state = openDraft(draft);
  expect(draftDone(draft, state)).toBe(false);
  for (const task of draft.tasks) {
    expect(taskDone(draft, state, task), `${task.task} is done before it starts`).toBe(false);
    for (const key of parseKeys(task.keys)) {
      state = draftKey(draft, state, key, commands);
      expect(state.error, `${task.task}: ${key}`).toBeNull();
    }
    expect(taskDone(draft, state, task), `${task.task} ${task.keys}\n${state.engine.lines.join('\n')}\n${JSON.stringify(state.engine.cursor)} ${state.since.join(' ')}`).toBe(true);
  }
  expect(state.engine.lines).toEqual(draft.target ?? draft.lines);
  expect(draftDone(draft, state)).toBe(true);
});

it('keeps every draft short, and every cell inside its text', () => {
  expect(new Set(DRAFTS.map(draft => draft.stage)).size).toBe(DRAFTS.length);
  for (const draft of DRAFTS) {
    expect(draft.lines.length).toBeLessThanOrEqual(10);
    for (const line of [...draft.lines, ...draft.target ?? []]) expect(line.length).toBeLessThanOrEqual(48);
    for (const task of draft.tasks) if (task.goal.type === 'reach') {
      const cell = cellOf(draft, task.goal);
      expect(cell.col).toBeLessThan(Math.max(1, (draft.lines[cell.line] ?? '').length));
    }
  }
});

it('counts a cell only when it is reached with the key the task is about', () => {
  const draft = DRAFTS.find(item => item.stage === 'lowlands')!;
  const commands = draftCommands('lowlands');
  const walked = parseKeys('17l').reduce((state, key) => draftKey(draft, state, key, commands), openDraft(draft));
  expect(goToCell(draft, walked)).toEqual({ line: 0, col: 19 });
  const there = parseKeys('19l').reduce((state, key) => draftKey(draft, state, key, commands), openDraft(draft));
  expect(there.reached).toBe(0);
  expect(reachedOtherwise(draft, there)).toBe(true);
});
