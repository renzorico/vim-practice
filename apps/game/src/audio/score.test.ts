import { expect, it } from 'vitest';
import { SCORES, MODE_PITCH_CLASSES, cadenceBeatSeconds, loopSeconds, midiOf, stepSeconds, tune, type ScoreId } from './score.js';

const ids = Object.keys(SCORES) as ScoreId[];
it.each(ids)('%s is a long, modal, bounded composition with at most four sounding voices', id => {
  const score = SCORES[id];
  expect(loopSeconds(score)).toBeGreaterThanOrEqual(60);
  expect(score.bars).toBeGreaterThanOrEqual(16);
  let passing = 0;
  const edges: { at: number; change: number }[] = [];
  for (const voice of score.voices) {
    expect(voice.level).toBeLessThanOrEqual(0.3);
    for (const note of voice.notes) {
      expect(note.midi).toBeGreaterThanOrEqual(36);
      expect(note.midi).toBeLessThanOrEqual(96);
      if (!MODE_PITCH_CLASSES[id].includes(note.midi % 12)) { expect(note.passing).toBe(true); passing++; }
      expect(note.step).toBeGreaterThanOrEqual(0);
      expect(note.step + note.length + voice.releaseMs / 1000 / stepSeconds(score)).toBeLessThanOrEqual(score.bars * score.steps);
      expect(note.length).toBeGreaterThan(0);
      edges.push({ at: note.step, change: 1 }, { at: note.step + note.length, change: -1 });
    }
  }
  expect(passing).toBeLessThanOrEqual(2);
  let sounding = 0;
  for (const edge of edges.sort((left, right) => left.at - right.at || left.change - right.change)) {
    sounding += edge.change;
    expect(sounding).toBeLessThanOrEqual(4);
  }
});
it('every lead has distinct eight-note interval sequences, except the title theme and its reprise', () => {
  const seen = new Map<string, ScoreId>();
  const family = (id: ScoreId): string => id === 'last-page' ? 'title' : id;
  for (const id of ids) {
    const notes = SCORES[id].voices[0]!.notes;
    for (let start = 0; start <= notes.length - 8; start++) {
      const sequence = notes.slice(start, start + 8).slice(1).map((note, index) => note.midi - notes[start + index]!.midi).join(',');
      expect(family(seen.get(sequence) ?? id), `${id}: ${sequence}`).toBe(family(id));
      seen.set(sequence, id);
    }
  }
});
it('leads breathe: at least three note lengths or rests, no leap over an octave, nothing shrill', () => {
  for (const id of ids) {
    const lead = SCORES[id].voices[0]!.notes;
    const gaps = new Set(lead.slice(1).map((note, index) => note.step - lead[index]!.step));
    expect(gaps.size, id).toBeGreaterThanOrEqual(3);
    for (let index = 1; index < lead.length; index++) expect(Math.abs(lead[index]!.midi - lead[index - 1]!.midi), id).toBeLessThanOrEqual(12);
    expect(Math.max(...lead.map(note => note.midi)), id).toBeLessThanOrEqual(84);
    // Every section is more than a transposition of the first.
    const quarter = SCORES[id].bars * SCORES[id].steps / 4;
    const shape = (section: number): string => lead.filter(note => Math.floor(note.step / quarter) === section)
      .map((note, index, all) => `${note.step % quarter}:${note.midi - all[0]!.midi}`).join(' ');
    expect(shape(2), id).not.toBe(shape(0));
  }
});
it('the title leaves its final bar open, and the bare half-speed ending answers on D', () => {
  expect(SCORES['last-page'].bpm).toBe(SCORES.title.bpm / 2);
  expect(SCORES['last-page'].voices).toHaveLength(1);
  expect(SCORES['last-page'].voices[0]!.notes.at(-1)?.midi).toBe(62);
  expect(SCORES.title.voices.every(voice => voice.notes.every(note => note.step + note.length <= 31 * SCORES.title.steps))).toBe(true);
});
it('Wordwood answers with the call’s last three pitches; caves contain a quieter delayed copy', () => {
  const [call, reply] = SCORES.wordwood.voices;
  for (let index = 0; index < 16; index++) {
    expect(reply!.notes.slice(index * 3, index * 3 + 3).map(note => note.midi))
      .toEqual(call!.notes.slice(index * 4 + 1, index * 4 + 4).map(note => note.midi));
  }
  const cave = SCORES['echo-caves'].voices;
  expect(cave[1]!.level).toBeLessThan(cave[0]!.level);
  expect(cave[1]!.notes).toEqual(cave[0]!.notes.map(note => ({ ...note, step: note.step + 3 })));
});
it('reads tunes: names, holds over the bar line, rests, and refuses a short bar', () => {
  expect(tune(['c4 - . d4', '- - . f#4'], 4)).toEqual([
    { step: 0, midi: 60, length: 2 }, { step: 3, midi: 62, length: 3 }, { step: 7, midi: 66, length: 1 }]);
  expect(midiOf('bb3')).toBe(58);
  expect(() => tune(['c4 - .'], 4)).toThrow(/3 of 4/);
});

it.each(ids)('%s has a bounded modal cadence rooted on its tonic', id => {
  const score = SCORES[id];
  expect(score.cadence.figure.map(([beat]) => beat)).toEqual([0, 1, 2, 3]);
  expect(Math.max(...score.cadence.figure.map(([beat, , length]) => beat + length)) * cadenceBeatSeconds(score)).toBeLessThanOrEqual(3);
  expect(score.cadence.chordBeats).toBe(6);
  for (const midi of [...score.cadence.figure.map(([, midi]) => midi), ...score.cadence.chord]) {
    expect(midi).toBeGreaterThanOrEqual(36); expect(midi).toBeLessThanOrEqual(96);
    expect(MODE_PITCH_CLASSES[id]).toContain(midi % 12);
  }
  expect(Math.min(...score.cadence.chord) % 12).toBe(MODE_PITCH_CLASSES[id][0]);
});
