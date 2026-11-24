import type { WorldId } from '@escape/world';

export type ScoreId = 'title' | WorldId;
export interface ScoreNote {
  readonly step: number;
  readonly midi: number;
  readonly length: number;
  readonly passing?: true;
}
export interface ScoreVoice {
  readonly wave: 'sine' | 'triangle';
  readonly level: number;
  readonly attackMs: number;
  readonly releaseMs: number;
  /** Holds its level to the note's end (pads, drones) instead of decaying like a pluck. */
  readonly sustain?: boolean;
  readonly notes: readonly ScoreNote[];
}
export interface Score {
  readonly bpm: number;
  readonly steps: number;
  readonly bars: number;
  /** Quarter-note beats, except the two compound-time scores (Margin, Copper Port): dotted quarters. */
  readonly stepsPerBeat: number;
  readonly voices: readonly ScoreVoice[];
  readonly ambience?: { readonly kind: 'knock'; readonly steps: readonly number[]; readonly level: number };
}
export const MODE_PITCH_CLASSES: Readonly<Record<ScoreId, readonly number[]>> = {
  title: [2, 4, 5, 7, 9, 11, 0], margin: [7, 9, 11, 0, 2, 4, 5],
  lowlands: [0, 2, 4, 6, 7, 9, 11], quarry: [9, 0, 2, 4, 7],
  wordwood: [4, 6, 7, 9, 11, 0, 2], 'copper-port': [5, 7, 8, 10, 0, 2, 3],
  library: [10, 0, 2, 4, 5, 7, 9], 'echo-caves': [6, 7, 9, 11, 1, 2, 4],
  'last-page': [2, 4, 5, 7, 9, 11, 0],
};
const SEMITONES: Readonly<Record<string, number>> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** 'f#4' or 'bb3' to a MIDI number. */
export function midiOf(name: string): number {
  const match = /^([a-g])([#b]?)(\d)$/.exec(name);
  if (!match) throw new Error(`Not a note: ${name}`);
  return (SEMITONES[match[1] ?? ''] ?? 0) + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0) + (Number(match[3]) + 1) * 12;
}
/** Bars of one token per step: a note name starts a note, '-' holds it (also over the bar line), '.' rests. */
export function tune(bars: readonly string[], steps: number): readonly ScoreNote[] {
  const notes: { step: number; midi: number; length: number }[] = [];
  let held = false;
  bars.forEach((bar, index) => {
    const tokens = bar.split(' ');
    if (tokens.length !== steps) throw new Error(`Bar ${index + 1} has ${tokens.length} of ${steps} steps: ${bar}`);
    tokens.forEach((token, offset) => {
      const last = notes[notes.length - 1];
      if (token === '-' && held && last) last.length += 1;
      else if (token === '.' || token === '-') held = false;
      else { notes.push({ step: index * steps + offset, midi: midiOf(token), length: 1 }); held = true; }
    });
  });
  return notes;
}
/** Chords held for `bars` bars each; names separated by spaces. */
function chords(list: readonly string[], bars: number, steps: number): readonly ScoreNote[] {
  return list.flatMap((chord, index) => chord.split(' ').map(name => ({
    step: index * bars * steps, midi: midiOf(name), length: bars * steps - 2 })));
}
/** The same eight-step figure over one root per bar; `pattern` reads from root, third note and fifth as 0, 1, 2. */
function figure(list: readonly string[], pattern: string, steps: number): readonly ScoreNote[] {
  return tune(list.map(chord => {
    const names = chord.split(' ');
    return pattern.split(' ').map(token => /^\d$/.test(token) ? names[Number(token)] ?? names[0] ?? 'c4' : token).join(' ');
  }), steps);
}
/** Section A, with its last bars replaced: the same question, another answer. */
const ending = (section: readonly string[], ...last: readonly string[]): readonly string[] =>
  [...section.slice(0, section.length - last.length), ...last];
const pluck = (notes: readonly ScoreNote[], level = 0.22, releaseMs = 420): ScoreVoice =>
  ({ wave: 'triangle', level, attackMs: 10, releaseMs, notes });
const low = (notes: readonly ScoreNote[], level = 0.2): ScoreVoice => ({ wave: 'sine', level, attackMs: 40, releaseMs: 180, notes });
const pad = (notes: readonly ScoreNote[], level = 0.07): ScoreVoice =>
  ({ wave: 'triangle', level, attackMs: 900, releaseMs: 500, sustain: true, notes });
const SILENCE_8 = '. . . . . . . .';

// Title: D dorian. Every phrase climbs and waits; the last one is left unanswered.
const TITLE_A = ['d4 - - a4 - - g4 -', 'f4 - e4 - d4 - - -', 'c4 - - g4 - - f4 -', 'e4 - - - - . . .',
  'd4 - - a4 - - c5 -', 'b4 - a4 - g4 - - -', 'f4 - g4 - a4 - e4 -', 'g4 - - - - . . .'];
const TITLE_B = ['a4 - - - g4 - a4 -', 'c5 - - b4 - - a4 -', 'g4 - - - f4 - g4 -', 'a4 - - - - . . .',
  'f4 - - - e4 - f4 -', 'g4 - - a4 - - f4 -', 'e4 - - - d4 - c4 -', 'd4 - - - - . . .'];
const TITLE_A2 = ending(TITLE_A, 'f4 - g4 - a4 - b4 -', 'c5 - - - - - . .');
const TITLE_HARMONY_A = ['d3 f3 a3', 'd3 f3 a3', 'c3 e3 g3', 'a2 c3 e3', 'd3 f3 a3', 'g2 b2 d3', 'f2 a2 c3', 'c3 e3 g3'];
const TITLE_HARMONY_B = ['f2 a2 c3', 'a2 c3 e3', 'c3 e3 g3', 'f2 a2 c3', 'd3 f3 a3', 'g2 b2 d3', 'a2 c3 e3', 'd3 f3 a3'];
const ARPEGGIO = '0 . 2 . 1 . 2 .';
const title: Score = { bpm: 66, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
  pluck(tune([...TITLE_A, ...TITLE_A2, ...TITLE_B, ...ending(TITLE_A, 'f4 - g4 - - . . .', SILENCE_8)], 8), 0.24, 700),
  { ...pluck(figure([...TITLE_HARMONY_A, ...TITLE_HARMONY_A, ...TITLE_HARMONY_B, ...TITLE_HARMONY_A.slice(0, 7)], ARPEGGIO, 8), 0.1, 500), wave: 'sine' },
] };

// The Margin: G mixolydian in compound time, a round dance for a village that is missing a row.
const MARGIN_A = ['g4 - b4 d5 - b4 c5 - a4 f4 - -', 'g4 - - d4 - - g4 - a4 b4 - -', 'c5 - b4 a4 - g4 a4 - f4 d4 - -', 'g4 - - - - - . . . . . .',
  'g4 - b4 d5 - b4 c5 - a4 f4 - -', 'e4 - g4 c5 - - b4 - a4 g4 - -', 'a4 - - b4 - a4 f4 - - d4 - -', 'g4 - - - - - . . . . . .'];
const MARGIN_B = ['d5 - - b4 - d5 e5 - - d5 - -', 'c5 - - a4 - c5 d5 - - c5 - -', 'b4 - - g4 - b4 c5 - b4 a4 - -', 'd4 - - - - - . . . . . .',
  'f4 - - a4 - c5 d5 - c5 a4 - -', 'g4 - - b4 - d5 e5 - d5 b4 - -', 'c5 - b4 a4 - g4 f4 - e4 d4 - -', 'g4 - - - - - . . . . . .'];
const MARGIN_BASS_A = ['g2 d3', 'g2 d3', 'f2 c3', 'g2 d3', 'g2 d3', 'c3 g3', 'f2 c3', 'g2 d3'];
const MARGIN_BASS_B = ['g2 d3', 'f2 c3', 'g2 d3', 'd3 a3', 'f2 c3', 'g2 d3', 'f2 c3', 'g2 d3'];
const margin: Score = { bpm: 84, steps: 12, stepsPerBeat: 3, bars: 32, voices: [
  pluck(tune([...MARGIN_A, ...ending(MARGIN_A, 'a4 - - b4 - c5 d5 - - b4 - -', 'd5 - - - - - . . . . . .'), ...MARGIN_B, ...ending(MARGIN_A, 'g4 - - - - . . . . . . .')], 12), 0.2, 300),
  low(figure([...MARGIN_BASS_A, ...MARGIN_BASS_A, ...MARGIN_BASS_B, ...MARGIN_BASS_A], '0 - - - . . 1 - - . . .', 12), 0.18),
] };

// Lowlands: C lydian, wide air. Few notes, big leaps, over two-note pads.
const LOW_A = ['c4 - - - - - - -', 'g4 - - - - - f#4 -', 'e4 - - - - - - -', SILENCE_8,
  'd4 - - - - - - -', 'b4 - - - - - a4 -', 'f#4 - - - - - g4 -', '- - - - . . . .'];
const LOW_B = ['e4 - - - b4 - - -', '- - - - a4 - - -', 'd4 - - - a4 - - -', '- - - - g4 - - -',
  'c4 - - - f#4 - - -', '- - - - e4 - d4 -', 'g4 - - - - - - -', '- - . . . . . .'];
const LOW_PADS_A = ['c3 g3', 'e3 b3', 'd3 a3', 'g2 d3'];
const LOW_PADS_B = ['a2 e3', 'd3 a3', 'c3 g3', 'g2 d3'];
const lowlands: Score = { bpm: 72, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
  { ...pluck(tune([...LOW_A, ...ending(LOW_A, 'f#4 - - - a4 - g4 -', 'e4 - - - . . . .'), ...LOW_B, ...ending(LOW_A, 'f#4 - - - - - d4 -', 'c4 - - . . . . .')], 8), 0.18, 900), attackMs: 120 },
  pad(chords([...LOW_PADS_A, ...LOW_PADS_A, ...LOW_PADS_B, ...LOW_PADS_A], 2, 8), 0.08),
] };

// The Quarry: A minor pentatonic, a work song over a steady knock.
const QUARRY_A = ['a3 . c4 d4 . e4 . .', 'd4 . c4 . a3 . . .', 'a3 . c4 d4 . e4 . g4', '- . e4 . d4 . . .',
  'c4 . d4 e4 . g4 . .', 'e4 . d4 . c4 . . .', 'd4 . e4 c4 . a3 . g3', 'a3 - - - . . . .'];
const QUARRY_B = ['e4 . . g4 . a4 . .', 'g4 . e4 . d4 . . .', 'e4 . . g4 . a4 . c5', '- . a4 . g4 . . .',
  'a4 . g4 e4 . d4 . .', 'e4 . d4 c4 . a3 . .', 'c4 . a3 c4 . d4 . e4', 'a3 - - - . . . .'];
const QUARRY_BASS_A = ['a2 e3', 'a2 e3', 'a2 e3', 'd3 a3', 'c3 g3', 'c3 g3', 'd3 a3', 'a2 e3'];
const QUARRY_BASS_B = ['a2 e3', 'g2 d3', 'a2 e3', 'd3 a3', 'd3 a3', 'a2 e3', 'c3 g3', 'a2 e3'];
const quarry: Score = { bpm: 92, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
  pluck(tune([...QUARRY_A, ...ending(QUARRY_A, 'd4 . e4 g4 . a4 . g4', 'e4 - - - . . . .'), ...QUARRY_B, ...QUARRY_A], 8), 0.21, 200),
  low(figure([...QUARRY_BASS_A, ...QUARRY_BASS_A, ...QUARRY_BASS_B, ...QUARRY_BASS_A], '0 - . . 0 . 1 .', 8), 0.2),
], ambience: { kind: 'knock', steps: Array.from({ length: 64 }, (_, index) => index * 4 + 2), level: 0.06 } };

// Wordwood: E aeolian. One voice calls; the other repeats its last three notes.
const CALLS = [
  'e4 . g4 . b4 . a4 .', 'g4 . a4 . f#4 . e4 .', 'b4 . d5 - - c5 a4 .', 'g4 . e4 . f#4 . d4 .',
  'e4 . g4 . b4 . a4 .', 'g4 . a4 . f#4 . e4 .', 'b4 . d5 - - c5 a4 .', 'g4 . f#4 . d4 . e4 .',
  'd5 . e5 . b4 . g4 .', 'a4 . c5 . b4 . f#4 .', 'g4 . b4 - - d5 e5 .', 'c5 . a4 . f#4 . e4 .',
  'e4 . g4 . b4 . a4 .', 'g4 . a4 . f#4 . e4 .', 'a4 . c5 - - b4 g4 .', 'f#4 . g4 . d4 . e4 .'];
const answer = (call: string): string => `. . ${call.split(' ').slice(2).join(' ')}`;
const WOOD_BASS = ['e2', 'd3', 'c3', 'b2', 'e2', 'd3', 'c3', 'e2', 'c3', 'a2', 'g2', 'b2', 'e2', 'd3', 'c3'];
const wordwood: Score = { bpm: 76, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
  pluck(tune(CALLS.flatMap(call => [call, SILENCE_8]), 8), 0.22, 320),
  { ...pluck(tune(CALLS.flatMap(call => [SILENCE_8, answer(call)]), 8), 0.13, 260), wave: 'sine' },
  pad(chords(WOOD_BASS, 2, 8), 0.1),
] };

// Copper Port: F dorian in 6/8, a boat that never quite stops rocking.
const PORT_A = ['f4 - ab4 c5 - ab4', 'bb4 - ab4 g4 - eb4', 'f4 - ab4 c5 - d5', 'c5 - - - - .',
  'eb5 - c5 d5 - bb4', 'c5 - ab4 bb4 - g4', 'ab4 - f4 g4 - eb4', 'f4 - - - - .'];
const PORT_B = ['c5 - - bb4 - ab4', 'bb4 - - g4 - -', 'ab4 - - g4 - f4', 'g4 - - eb4 - -',
  'f4 - ab4 g4 - bb4', 'd5 - - c5 - -', 'eb5 - d5 c5 - bb4', 'c5 - - - - .'];
const PORT_C = ['f4 . f4 ab4 . ab4', 'c5 . c5 bb4 . .', 'eb4 . eb4 g4 . g4', 'bb4 . bb4 ab4 . .',
  'f4 . ab4 d5 . c5', 'bb4 . g4 c5 . .', 'ab4 . g4 f4 . eb4', 'f4 - - - - .'];
const PORT_A2 = ending(PORT_A, 'ab4 - bb4 c5 - d5', 'c5 - - - - .');
const PORT_BASS_A = ['f2 c3', 'eb2 bb2', 'f2 c3', 'c3 g3', 'bb2 f3', 'ab2 eb3', 'eb2 bb2', 'f2 c3'];
const PORT_BASS_B = ['ab2 eb3', 'g2 d3', 'f2 c3', 'eb2 bb2', 'f2 c3', 'bb2 f3', 'eb2 bb2', 'c3 g3'];
const PORT_BASS_C = ['f2 c3', 'f2 c3', 'eb2 bb2', 'eb2 bb2', 'bb2 f3', 'c3 g3', 'eb2 bb2', 'f2 c3'];
const copperPort: Score = { bpm: 100, steps: 6, stepsPerBeat: 3, bars: 64, voices: [
  pluck(tune([...PORT_A, ...PORT_A2, ...PORT_B, ...PORT_A, ...PORT_C, ...PORT_A2, ...PORT_B, ...ending(PORT_A, 'f4 - - . . .')], 6), 0.2, 260),
  low(figure([...PORT_BASS_A, ...PORT_BASS_A, ...PORT_BASS_B, ...PORT_BASS_A, ...PORT_BASS_C, ...PORT_BASS_A, ...PORT_BASS_B, ...PORT_BASS_A], '0 - . 1 - .', 6), 0.18),
] };

// The Library: B flat lydian. Single bells, and more silence than bells.
const BELL_A = ['bb4 - - - . . f5 -', SILENCE_8, 'e5 - - - . . d5 -', SILENCE_8,
  'a4 - - - . . c5 -', 'g4 - - - . . . .', '. . f4 - - - . .', SILENCE_8];
const BELL_B = ['d5 - - - . . . .', 'g5 - - - . . e5 -', SILENCE_8, 'c5 - - - . . . .',
  'f5 - - - . . d5 -', '. . . . a4 - - -', 'bb4 - - - . . . .', SILENCE_8];
const BELLS = tune([...BELL_A, ...ending(BELL_A, 'g4 - - - . . a4 -', '. . bb4 - - - . .', SILENCE_8), ...BELL_B, ...BELL_A], 8);
const library: Score = { bpm: 60, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
  { wave: 'sine', level: 0.2, attackMs: 4, releaseMs: 1600, notes: BELLS },
  // A bell's upper partial: an octave above, quieter and shorter.
  { wave: 'sine', level: 0.035, attackMs: 4, releaseMs: 500, notes: BELLS.map(note => ({ ...note, midi: note.midi + 12, length: 1 })) },
  pad(chords(['bb2 f3', 'c3 g3', 'g2 d3', 'bb2 f3', 'g2 d3', 'c3 g3', 'bb2 f3', 'bb2 f3'], 4, 8), 0.045),
] };

// Echo Caves: F sharp phrygian. One line, its echo three steps behind, and the rock humming.
const CAVE_A = ['f#4 - - - g4 - - -', 'f#4 - - - - - . .', 'd4 - - - e4 - - -', 'c#4 - - - - - . .',
  'a4 - - - g4 - - -', 'f#4 - - - e4 - - -', 'd4 - - - c#4 - - -', SILENCE_8];
const CAVE_B = ['c#5 - - - b4 - - -', 'a4 - - - - - . .', 'b4 - - - a4 - - -', 'g4 - - - - - . .',
  'a4 - - - f#4 - - -', 'g4 - - - e4 - - -', 'f#4 - - - - - . .', SILENCE_8];
const CAVE_LINE = tune([...CAVE_A, ...ending(CAVE_A, 'e4 - - - f#4 - - -', SILENCE_8), ...CAVE_B, ...CAVE_A], 8);
const echoCaves: Score = { bpm: 56, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
  { wave: 'triangle', level: 0.18, attackMs: 80, releaseMs: 650, notes: CAVE_LINE },
  { wave: 'sine', level: 0.07, attackMs: 110, releaseMs: 850, notes: CAVE_LINE.map(note => ({ ...note, step: note.step + 3 })) },
  pad(chords(Array.from({ length: 8 }, () => 'f#2 c#3'), 4, 8), 0.06),
] };

export const SCORES: Readonly<Record<ScoreId, Score>> = {
  title, margin, lowlands, quarry, wordwood, 'copper-port': copperPort, library, 'echo-caves': echoCaves,
  // The Last Page: the title theme alone, at half speed, and this time the question is answered.
  'last-page': { bpm: 33, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
    { wave: 'sine', level: 0.24, attackMs: 30, releaseMs: 900,
      notes: tune([...TITLE_A, ...TITLE_A2, ...TITLE_B, ...ending(TITLE_A, 'f4 - e4 - c4 - - -', 'd4 - - - - . . .')], 8) },
  ] },
};
export const stepSeconds = (score: Score): number => 60 / score.bpm / score.stepsPerBeat;
export const loopSeconds = (score: Score): number => score.bars * score.steps * stepSeconds(score);
