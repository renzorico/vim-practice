import type { WorldId } from '@escape/world';
import type { Mood, Pace } from './mood.js';

export type ScoreId = 'title' | WorldId;
export interface ScoreNote {
  readonly step: number;
  readonly midi: number;
  readonly length: number;
  readonly passing?: true;
  /** Half-note answers reserved for phrases where the melody is resting. */
  readonly melodyRestOnly?: true;
}
export type Part = 'bed' | 'pulse' | 'melody' | 'counter' | 'drum';
export interface ScoreVoice {
  readonly part: Part;
  readonly tick?: 'knock';
  readonly wave: 'sine' | 'triangle';
  readonly level: number;
  readonly attackMs: number;
  readonly releaseMs: number;
  /** Holds its level to the note's end (pads, drones) instead of decaying like a pluck. */
  readonly sustain?: boolean;
  readonly notes: readonly ScoreNote[];
}
export interface Score {
  readonly cadence: {
    readonly figure: readonly (readonly [beat: number, midi: number, lengthInBeats: number])[];
    readonly chord: readonly number[];
    readonly chordBeats: number;
  };
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
  ({ part: 'melody', wave: 'triangle', level, attackMs: 16, releaseMs, notes });
const low = (notes: readonly ScoreNote[], level = 0.2): ScoreVoice => ({ part: 'pulse', wave: 'sine', level, attackMs: 40, releaseMs: 180, notes });
const pad = (notes: readonly ScoreNote[], level = 0.07): ScoreVoice =>
  ({ part: 'bed', wave: 'triangle', level, attackMs: 900, releaseMs: 500, sustain: true, notes });
const cadence = (figure: readonly number[], chord: readonly number[]): Score['cadence'] => ({
  figure: figure.map((midi, beat) => [beat, midi, 1] as const), chord, chordBeats: 6,
});
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
const title: Score = { cadence: cadence([69, 72, 71, 72], [50, 57, 62, 69]), bpm: 66, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
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
const margin: Score = { cadence: cadence([74, 72, 71, 69], [55, 62, 67, 71]), bpm: 84, steps: 12, stepsPerBeat: 3, bars: 32, voices: [
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
const lowlands: Score = { cadence: cadence([79, 78, 76, 74], [48, 55, 67, 76]), bpm: 72, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
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
const quarry: Score = { cadence: cadence([72, 74, 76, 79], [45, 57, 64, 69]), bpm: 92, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
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
const wordwood: Score = { cadence: cadence([71, 74, 72, 71], [52, 59, 64, 67]), bpm: 76, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
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
const copperPort: Score = { cadence: cadence([72, 75, 74, 72], [53, 60, 65, 68]), bpm: 100, steps: 6, stepsPerBeat: 3, bars: 64, voices: [
  pluck(tune([...PORT_A, ...PORT_A2, ...PORT_B, ...PORT_A, ...PORT_C, ...PORT_A2, ...PORT_B, ...ending(PORT_A, 'f4 - - . . .')], 6), 0.2, 260),
  low(figure([...PORT_BASS_A, ...PORT_BASS_A, ...PORT_BASS_B, ...PORT_BASS_A, ...PORT_BASS_C, ...PORT_BASS_A, ...PORT_BASS_B, ...PORT_BASS_A], '0 - . 1 - .', 6), 0.18),
] };

// The Library: B flat lydian. Single bells, and more silence than bells.
const BELL_A = ['bb4 - - - . . f5 -', SILENCE_8, 'e5 - - - . . d5 -', SILENCE_8,
  'a4 - - - . . c5 -', 'g4 - - - . . . .', '. . f4 - - - . .', SILENCE_8];
const BELL_B = ['d5 - - - . . . .', 'g5 - - - . . e5 -', SILENCE_8, 'c5 - - - . . . .',
  'f5 - - - . . d5 -', '. . . . a4 - - -', 'bb4 - - - . . . .', SILENCE_8];
const BELLS = tune([...BELL_A, ...ending(BELL_A, 'g4 - - - . . a4 -', '. . bb4 - - - . .', SILENCE_8), ...BELL_B, ...BELL_A], 8);
const library: Score = { cadence: cadence([77, 76, 74, 72], [46, 58, 65, 74]), bpm: 60, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
  { part: 'melody', wave: 'sine', level: 0.2, attackMs: 4, releaseMs: 1600, notes: BELLS },
  // A bell's upper partial: an octave above, quieter and shorter.
  { part: 'melody', wave: 'sine', level: 0.035, attackMs: 4, releaseMs: 500, notes: BELLS.map(note => ({ ...note, midi: note.midi + 12, length: 1 })) },
  pad(chords(['bb2 f3', 'c3 g3', 'g2 d3', 'bb2 f3', 'g2 d3', 'c3 g3', 'bb2 f3', 'bb2 f3'], 4, 8), 0.045),
] };

// Echo Caves: F sharp phrygian. One line, its echo three steps behind, and the rock humming.
const CAVE_A = ['f#4 - - - g4 - - -', 'f#4 - - - - - . .', 'd4 - - - e4 - - -', 'c#4 - - - - - . .',
  'a4 - - - g4 - - -', 'f#4 - - - e4 - - -', 'd4 - - - c#4 - - -', SILENCE_8];
const CAVE_B = ['c#5 - - - b4 - - -', 'a4 - - - - - . .', 'b4 - - - a4 - - -', 'g4 - - - - - . .',
  'a4 - - - f#4 - - -', 'g4 - - - e4 - - -', 'f#4 - - - - - . .', SILENCE_8];
const CAVE_LINE = tune([...CAVE_A, ...ending(CAVE_A, 'e4 - - - f#4 - - -', SILENCE_8), ...CAVE_B, ...CAVE_A], 8);
const echoCaves: Score = { cadence: cadence([73, 71, 69, 67], [54, 61, 66, 73]), bpm: 56, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
  { part: 'melody', wave: 'triangle', level: 0.18, attackMs: 80, releaseMs: 650, notes: CAVE_LINE },
  { part: 'melody', wave: 'sine', level: 0.07, attackMs: 110, releaseMs: 850, notes: CAVE_LINE.map(note => ({ ...note, step: note.step + 3 })) },
  pad(chords(Array.from({ length: 8 }, () => 'f#2 c#3'), 4, 8), 0.06),
] };

const COMPOSITIONS: Readonly<Record<ScoreId, Score>> = {
  title, margin, lowlands, quarry, wordwood, 'copper-port': copperPort, library, 'echo-caves': echoCaves,
  // The Last Page: the title theme alone, at half speed, and this time the question is answered.
  'last-page': { cadence: cadence([69, 72, 74, 76], [50, 57, 62, 69]), bpm: 33, steps: 8, stepsPerBeat: 2, bars: 32, voices: [
    { part: 'melody', wave: 'sine', level: 0.24, attackMs: 30, releaseMs: 900,
      notes: tune([...TITLE_A, ...TITLE_A2, ...TITLE_B, ...ending(TITLE_A, 'f4 - e4 - c4 - - -', 'd4 - - - - . . .')], 8) },
  ] },
};
export const stepSeconds = (score: Score): number => 60 / score.bpm / score.stepsPerBeat;
export const loopSeconds = (score: Score): number => score.bars * score.steps * stepSeconds(score);

/** Keep the entire four-note gesture within three seconds, including the final decay beat. */
export const cadenceBeatSeconds = (score: Score): number => Math.min(0.75, 60 / score.bpm * (score.bpm <= 60 ? 0.5 : 1));

/** Preserve the authored tunes and harmony; add space-filling parts within the same mode. */
function orchestrate(id: ScoreId, score: Score): Score {
  const melodicEcho = id === 'wordwood' || id === 'echo-caves' || id === 'library';
  const voices: ScoreVoice[] = score.voices.map((voice, index) => {
    const part: Part = voice.sustain ? 'bed' : index === 0 || melodicEcho ? 'melody' : 'pulse';
    const top = Math.max(...voice.notes.map(note => note.midi));
    const down = part === 'melody' ? Math.max(0, Math.ceil((top - 76) / 12)) * 12 : 0;
    return { ...voice, part, attackMs: Math.max(part === 'melody' ? 16 : 25, voice.attackMs),
      notes: voice.notes.map(note => ({ ...note, midi: note.midi - down })),
    };
  });
  const end = (score.bars - (id === 'title' ? 1 : 0)) * score.steps;
  const harmony = score.voices[1]?.notes ?? score.voices[0]!.notes;
  if (!voices.some(voice => voice.part === 'bed')) {
    const notes: ScoreNote[] = [];
    const releaseSteps = Math.max(2, Math.ceil(0.5 / stepSeconds(score)));
    for (let step = 0; step < end; step += score.steps * 2) {
      const source = harmony.filter(note => note.step <= step).at(-1) ?? harmony[0]!;
      const root = 36 + source.midi % 12;
      const fifth = root + 7;
      for (const midi of [root, ...(MODE_PITCH_CLASSES[id].includes(fifth % 12) ? [fifth] : [])])
        notes.push({ step, midi, length: Math.min(score.steps * 2 - releaseSteps, end - step - releaseSteps) });
    }
    voices.push(pad(notes, 0.085));
  }
  const melody = voices[0]!.notes;
  const counter: ScoreNote[] = [];
  for (let step = score.steps / 2; step < end - score.steps; step += score.steps) {
    const length = score.steps / 2;
    if (melody.some(note => note.step < step + length && note.step + note.length > step)) continue;
    const near = melody.filter(note => note.step <= step).at(-1) ?? melody[0]!;
    // A modal third or sixth below the neighbouring melody, always below its register.
    const midi = [near.midi - 4, near.midi - 3, near.midi - 9, near.midi - 8, near.midi - 7]
      .find(pitch => pitch >= 36 && MODE_PITCH_CLASSES[id].includes(pitch % 12)) ?? 36 + MODE_PITCH_CLASSES[id][0]!;
    counter.push({ step, midi, length });
  }
  // Busy tunes have no half-note holes. Give their silent arranged phrases a slow answer too.
  for (let step = 0; step < end - score.steps; step += score.steps * 2) {
    const near = melody.filter(note => note.step <= step).at(-1) ?? melody[0]!;
    const midi = [near.midi - 4, near.midi - 3, near.midi - 9, near.midi - 8, near.midi - 7]
      .find(pitch => pitch >= 36 && MODE_PITCH_CLASSES[id].includes(pitch % 12)) ?? 36 + MODE_PITCH_CLASSES[id][0]!;
    counter.push({ step, midi, length: score.steps / 2, melodyRestOnly: true });
  }
  voices.push({ ...pluck(counter.sort((left, right) => left.step - right.step), 0.17, 500), part: 'counter', wave: 'sine', attackMs: 60 });
  if (!voices.some(voice => voice.part === 'pulse')) {
    const notes: ScoreNote[] = [];
    for (let step = 0; step < end - score.steps; step += score.stepsPerBeat * 2) {
      // Keep the original four-pitch ceiling, even beneath the layered bells and echoes.
      const sounding = voices.flatMap(voice => voice.notes).filter(note => !note.melodyRestOnly && note.step < step + 1 && note.step + note.length > step).length;
      if (sounding >= 4) continue;
      const root = harmony.filter(note => note.step <= step).at(-1) ?? harmony[0]!;
      notes.push({ step, midi: 36 + root.midi % 12, length: 1 });
    }
    voices.push({ ...low(notes, 0.1), part: 'pulse' });
  }
  voices.push({ part: 'drum', wave: 'sine', tick: 'knock', level: 0.2, attackMs: 4, releaseMs: 60,
    notes: Array.from({ length: Math.floor((end - 1) / score.stepsPerBeat * 2) }, (_, index) => ({
      step: index * score.stepsPerBeat / 2, midi: score.cadence.chord[0]!, length: 0.12,
    })) });
  return { ...score, voices };
}
export const SCORES: Readonly<Record<ScoreId, Score>> = Object.fromEntries(
  (Object.entries(COMPOSITIONS) as [ScoreId, Score][]).map(([id, score]) => [id, orchestrate(id, score)]),
) as Record<ScoreId, Score>;

/** A duel or a race is felt from the first bar; a puzzle earns its drum. */
const DRUMS: Readonly<Record<Pace, readonly [number, number, number, number]>> = { still: [0, 0, 0, 0], steady: [0, 0, 0.5, 0.8], urgent: [0.4, 0.55, 0.7, 0.85] };
/** Measured: with one pulse level for all, a finished step was not heard (under 1 dB apart). */
const PULSE = [0.35, 0.5, 0.7, 0.85] as const;
export type Arrangement = Readonly<Record<Part, number>> & { readonly filter: number; readonly heartbeat: 0 | 1 | 2; readonly softMelody: boolean };
/** Absolute phrase index makes both melody visits and four full-loop variants replayable. */
export function arrangement(score: Score, bar: number, loop: number, mood: Mood, pace: Pace = 'steady'): Arrangement {
  const phrase = Math.floor((loop * score.bars + bar) / 8);
  const variant = loop % 4;
  // A stage opens with its tune, so it has a name; after that the tune comes and goes.
  const melodyOn = mood.energy === 0 ? (phrase + Number(variant === 2)) % 2 === 0 : mood.energy === 3 ? phrase % 4 !== 3 : phrase % 3 !== 2;
  const melody = melodyOn && !(variant === 3 && bar < 16) ? 0.8 : 0;
  const counter = mood.energy >= 2 ? melody ? 0.7 : 0.9 : 0;
  const pulse = Math.max(PULSE[mood.energy], pace === 'urgent' ? 0.6 : 0);
  const { danger } = mood;
  return { bed: 1, pulse: danger === 2 ? 0 : variant === 2 && bar < 8 ? 0 : danger ? pulse * 0.5 : pulse,
    melody: danger === 2 ? 0 : danger === 1 ? melody * 0.3 : melody,
    counter: danger === 2 ? 0 : danger === 1 ? counter * 0.3 : counter,
    drum: danger ? 0 : DRUMS[pace][mood.energy], filter: danger === 2 ? 1000 : danger === 1 ? 1400 : 2200,
    heartbeat: danger, softMelody: variant === 1 };
}

/** Stable per-event timing/level variation, independent of scheduler order or device. */
export function humanise(score: Score, loop: number, step: number): { readonly level: number; readonly offset: number } {
  let hash = 2166136261;
  for (const char of `${score.voices[0]?.notes[0]?.midi}:${score.bpm}:${score.steps}:${loop}:${step}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return { level: 0.85 + (hash >>> 0) / 4294967295 * 0.3, offset: ((hash >>> 8) % 1801 - 900) / 100000 };
}
