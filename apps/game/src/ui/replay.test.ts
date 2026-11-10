import { describe, expect, it } from 'vitest';
import { describeStep, initialFrameIndex, replayFrames, REPLAY_INTERVAL_MS } from './replay.js';

describe('replayFrames', () => {
  it('has a start frame plus one frame per key, using the real engine', () => {
    const frames = replayFrames(['hello world'], { line: 0, col: 0 }, ['w', '$']);
    expect(frames).toHaveLength(3);
    expect(frames[0]?.state.cursor).toEqual({ line: 0, col: 0 });
    expect(frames[1]?.state.cursor).toEqual({ line: 0, col: 6 });
    expect(frames[2]?.state.cursor).toEqual({ line: 0, col: 10 });
  });

  it('is deterministic', () => {
    const run = () => replayFrames(['a b c'], { line: 0, col: 0 }, ['w', 'w']).map((frame) => frame.state.cursor);
    expect(run()).toEqual(run());
  });

  it('records commands and edits', () => {
    const frames = replayFrames(['one two'], { line: 0, col: 0 }, ['d', 'w']);
    expect(frames[1]?.commands).toEqual([]);
    expect(frames[2]?.commands[0]?.id).toBe('d');
    expect(frames[2]?.state.lines).toEqual(['two']);
  });
});

describe('describeStep', () => {
  it('explains each kind of step', () => {
    const frames = replayFrames(['one two'], { line: 0, col: 0 }, ['d', 'w']);
    expect(describeStep(frames[0]!)).toBe('Start.');
    expect(describeStep(frames[1]!)).toContain('waiting');
    expect(describeStep(frames[2]!)).toBe('dw changes text.');
  });
});

describe('timing', () => {
  it('runs at 4 keys per second', () => {
    expect(REPLAY_INTERVAL_MS).toBe(250);
  });

  it('shows the end state under reduced motion', () => {
    expect(initialFrameIndex(true, 5)).toBe(4);
    expect(initialFrameIndex(false, 5)).toBe(0);
    expect(initialFrameIndex(true, 0)).toBe(0);
  });
});
