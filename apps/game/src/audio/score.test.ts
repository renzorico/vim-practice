import { expect, it } from 'vitest';
import { SCORES, arrangement, humanise, MODE_PITCH_CLASSES, cadenceBeatSeconds, loopSeconds, midiOf, stepSeconds, tune, type ScoreId } from './score.js';

const ids = Object.keys(SCORES) as ScoreId[];
it.each(ids)('%s is a long, modal, bounded composition with at most four sounding pitched voices', id => {
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
      if (voice.part !== 'drum' && !note.melodyRestOnly) edges.push({ at: note.step, change: 1 }, { at: note.step + note.length, change: -1 });
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
  expect(SCORES['last-page'].voices.filter(voice => voice.part === 'melody')).toHaveLength(1);
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

it.each(ids)('%s has five parts, a warm lead and four distinct loops lasting at least three minutes', id => {
  const score = SCORES[id];
  expect(new Set(score.voices.map(voice => voice.part))).toEqual(new Set(['bed', 'pulse', 'melody', 'counter', 'drum']));
  for (const voice of score.voices) {
    expect(voice.level).toBeLessThanOrEqual(0.24);
    expect(voice.notes.length).toBeGreaterThan(0);
    if (voice.part === 'melody') {
      expect(Math.max(...voice.notes.map(note => note.midi))).toBeLessThanOrEqual(76);
      expect(voice.attackMs).toBeGreaterThanOrEqual(16);
    }
    if (voice.part === 'pulse') expect(voice.attackMs).toBeGreaterThanOrEqual(25);
    if (voice.part === 'counter') for (const note of voice.notes) {
      if (!note.melodyRestOnly) expect(score.voices[0]!.notes.some(lead => lead.step < note.step + note.length && lead.step + lead.length > note.step)).toBe(false);
      const preceding = score.voices[0]!.notes.filter(lead => lead.step <= note.step).at(-1)!;
      expect(preceding.midi - note.midi).toBeGreaterThanOrEqual(3);
    }
  }
  for (const energy of [0, 1, 2, 3] as const) {
    const variants = Array.from({ length: 4 }, (_, loop) => JSON.stringify(Array.from({ length: score.bars / 8 }, (_, phrase) =>
      arrangement(score, phrase * 8, loop, { energy, danger: 0 }))));
    expect(new Set(variants).size).toBe(4);
  }
  // Fastest pace is the shortest possible repeat period.
  expect(loopSeconds(score) * 4 / 1.1).toBeGreaterThanOrEqual(180);
});
it('makes melody a visitor, lets counter carry rests, and gives danger priority', () => {
  const score = SCORES.title;
  expect([0, 8, 16, 24].map(bar => arrangement(score, bar, 0, { energy: 0, danger: 0 }).melody)).toEqual([0.8, 0, 0.8, 0]);
  for (const energy of [0, 1, 2, 3] as const) {
    const mix = arrangement(score, 16, 0, { energy, danger: 0 });
    expect(mix.bed).toBe(1);
    expect(mix.pulse).toBe([0.35, 0.5, 0.7, 0.85][energy]);
    if (energy === 2) expect(mix.counter).toBe(0.9);
    expect(mix.drum).toBe([0, 0, 0.5, 0.8][energy]);
    expect(arrangement(score, 16, 0, { energy, danger: 0 }, 'still').drum).toBe(0);
    expect(arrangement(score, 16, 0, { energy, danger: 0 }, 'urgent').drum).toBeGreaterThan(0.3);
    for (const danger of [1, 2] as const) {
      const dangerMix = arrangement(score, 0, 0, { energy, danger });
      const calm = arrangement(score, 0, 0, { energy, danger: 0 });
      for (const part of ['melody', 'counter'] as const) expect(dangerMix[part]).toBe(danger === 1 ? calm[part] * 0.3 : 0);
      expect(dangerMix.drum).toBe(0);
      expect(dangerMix.filter).toBe(danger === 1 ? 1400 : 1000);
      expect(dangerMix.heartbeat).toBe(danger);
    }
  }
});
it('humanises deterministically within nine milliseconds and fifteen percent', () => {
  for (const score of Object.values(SCORES)) for (let step = 0; step < score.steps * score.bars; step++) {
    const value = humanise(score, 0, step);
    expect(value).toEqual(humanise(score, 0, step));
    expect(value.level).toBeGreaterThanOrEqual(0.85); expect(value.level).toBeLessThanOrEqual(1.15);
    expect(Math.abs(value.offset)).toBeLessThanOrEqual(0.009);
    expect(value).not.toEqual(humanise(score, 1, step));
  }
});
it.each(ids)('%s keeps the arranged counter in melody gaps and never exceeds four pitched notes', id => {
  const score = SCORES[id];
  for (const energy of [0, 1, 2, 3] as const) for (let loop = 0; loop < 4; loop++) {
    const edges: { at: number; change: number }[] = [];
    for (const voice of score.voices) for (const note of voice.notes) {
      const mix = arrangement(score, Math.floor(note.step / score.steps), loop, { energy, danger: 0 });
      if (voice.part === 'drum' || mix[voice.part] === 0 || note.melodyRestOnly && mix.melody > 0) continue;
      if (voice.part === 'counter' && note.melodyRestOnly) expect(mix.melody).toBe(0);
      edges.push({ at: note.step, change: 1 }, { at: note.step + note.length, change: -1 });
    }
    let sounding = 0;
    for (const edge of edges.sort((left, right) => left.at - right.at || left.change - right.change)) {
      sounding += edge.change; expect(sounding).toBeLessThanOrEqual(4);
    }
  }
});
