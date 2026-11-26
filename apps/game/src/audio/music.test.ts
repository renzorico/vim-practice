import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMusic, MUSIC_LEVEL, MUSIC_NODE_CAP } from './music.js';
import { SCORES, arrangement, humanise, loopSeconds, stepSeconds, type ScoreId } from './score.js';

type Automation = { kind: 'set' | 'linear' | 'exponential'; value: number; time: number };
class Param {
  // Deliberately stale, like implementations that expose only the last intrinsic value.
  value = 0;
  private events: Automation[] = [];
  at(time: number): number {
    let previous = { value: this.value, time: 0 };
    for (const event of this.events) {
      if (event.time > time) {
        if (event.kind === 'set') return previous.value;
        const fraction = Math.max(0, (time - previous.time) / (event.time - previous.time));
        return event.kind === 'linear' ? previous.value + (event.value - previous.value) * fraction
          : previous.value * (event.value / previous.value) ** fraction;
      }
      previous = event;
    }
    return previous.value;
  }
  private add(kind: Automation['kind'], value: number, time: number): void {
    this.events.push({ kind, value, time });
    this.events.sort((a, b) => a.time - b.time);
  }
  setValueAtTime = vi.fn((value: number, time: number) => this.add('set', value, time));
  linearRampToValueAtTime = vi.fn((value: number, time: number) => this.add('linear', value, time));
  exponentialRampToValueAtTime = vi.fn((value: number, time: number) => this.add('exponential', value, time));
  cancelScheduledValues = vi.fn((time: number) => { this.events = this.events.filter(event => event.time < time); });
  cancelAndHoldAtTime = vi.fn((time: number) => {
    const value = this.at(time);
    const next = this.events.find(event => event.time > time);
    this.cancelScheduledValues(time);
    // A hold preserves the curve leading to the cancellation time.
    this.add(next?.kind === 'linear' || next?.kind === 'exponential' ? next.kind : 'set', value, time);
  });
}

class Node {
  gain = new Param(); frequency = new Param(); pan = new Param(); delayTime = new Param();
  type = ''; buffer: unknown;
  disconnected = false;
  connect = vi.fn();
  disconnect = vi.fn(() => { this.disconnected = true; });
  start = vi.fn<(at: number) => void>();
  stop = vi.fn<(at?: number) => void>();
  onended: (() => void) | null = null;
}
class ClockContext {
  state = 'running'; sampleRate = 100;
  nodes: Node[] = [];
  peak = 0;
  get currentTime() { return Date.now() / 1000; }
  createGain = () => this.node();
  createBiquadFilter = () => this.node();
  createOscillator = () => this.node();
  createBufferSource = () => this.node();
  createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(10) }));
  private node(): Node {
    const node = new Node(); this.nodes.push(node);
    this.peak = Math.max(this.peak, this.nodes.filter(node => !node.disconnected).length);
    return node;
  }
}
const players: ReturnType<typeof createMusic>[] = [];
function setup() {
  const context = new ClockContext();
  const master = new Node();
  const output = vi.fn<() => { context: AudioContext; master: GainNode } | null>(() => ({ context: context as unknown as AudioContext, master: master as unknown as GainNode }));
  const music = createMusic(output); players.push(music);
  const sources = () => context.nodes.filter(node => node.start.mock.calls.length > 0);
  return { music, context, master, output, sources };
}
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); });
afterEach(() => { players.splice(0).forEach(player => player.dispose()); vi.useRealTimers(); });

it.each(Object.keys(SCORES) as ScoreId[])('%s schedules every eligible note exactly once through two full loops', id => {
  const { music, context, sources } = setup();
  const score = SCORES[id];
  music.setScore(id);
  vi.advanceTimersByTime((loopSeconds(score) * 2 - 0.7) * 1000);
  const expected = [0, 1].flatMap(loop => score.voices.filter(voice => voice.part !== 'drum')
    .flatMap(voice => voice.notes.filter(note => !note.melodyRestOnly || arrangement(score, Math.floor(note.step / score.steps), loop, { energy: 1, danger: 0 }).melody === 0)
      .map(note => 0.03 + loop * loopSeconds(score) + note.step * stepSeconds(score) + humanise(score, loop, note.step).offset))
    .concat((score.ambience?.steps ?? []).map(step => 0.03 + loop * loopSeconds(score) + step * stepSeconds(score) + humanise(score, loop, step).offset)))
    .sort((left, right) => left - right);
  const actual = sources().map(node => node.start.mock.calls[0]![0]).sort((left, right) => left - right);
  expect(actual).toHaveLength(expected.length);
  actual.forEach((at, index) => expect(at).toBeCloseTo(expected[index]!, 8));
  expect(context.peak).toBeLessThanOrEqual(MUSIC_NODE_CAP);
  expect(context.createBuffer).toHaveBeenCalledTimes(score.ambience ? 1 : 0);
});
it('uses one filtered bus, no-op same score, and a 1.5s crossfade from bar one', () => {
  const { music, context, master, sources } = setup();
  music.setScore('title');
  const [bus, filter, title] = context.nodes;
  expect(bus!.connect).toHaveBeenCalledWith(filter);
  expect(filter!.connect).toHaveBeenCalledWith(master);
  expect(filter!.frequency.value).toBe(2200);
  expect(bus!.gain.linearRampToValueAtTime).toHaveBeenCalledWith(MUSIC_LEVEL, 0.3);
  const count = context.nodes.length;
  music.setScore('title'); expect(context.nodes).toHaveLength(count);
  vi.advanceTimersByTime(1000);
  music.setScore('margin');
  expect(title!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 2.5);
  const margin = context.nodes.find(node => node.gain.linearRampToValueAtTime.mock.calls.some(call => call[0] === 1 && call[1] === 2.5));
  expect(margin).toBeDefined();
  expect(sources().some(node => Math.abs((node.start.mock.calls[0]?.[0] ?? 0) - 1.03) <= 0.009)).toBe(true);
  vi.advanceTimersByTime(1600);
  expect(title!.disconnect).toHaveBeenCalledOnce();
});
it('ducks to 55%, restores over 800ms, and scales text stages to 60%', () => {
  const { music, context } = setup(); music.setScore('title');
  const bus = context.nodes[0]!;
  music.duck(true);
  expect(bus.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(MUSIC_LEVEL * 0.55, 0.3);
  const count = bus.gain.linearRampToValueAtTime.mock.calls.length;
  music.duck(true); expect(bus.gain.linearRampToValueAtTime).toHaveBeenCalledTimes(count);
  music.duck(false);
  expect(bus.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(MUSIC_LEVEL, 0.8);
  music.setLevel(0.6);
  expect(bus.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(MUSIC_LEVEL * 0.6, 0.3);
});
it('fades hidden tabs, schedules nothing hidden, resumes at the next bar without duplicates', () => {
  const { music, context, sources } = setup(); music.setScore('title');
  vi.advanceTimersByTime(1000); music.setHidden(true);
  expect(context.nodes[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 1.3);
  const count = sources().length;
  vi.advanceTimersByTime(10000); expect(sources()).toHaveLength(count);
  expect(sources().every(node => node.disconnected)).toBe(true);
  const firstNew = sources().length;
  music.setHidden(false);
  const seconds = stepSeconds(SCORES.title);
  // Resume with the first authored event at or after the next bar.
  vi.advanceTimersByTime(7000);
  const resumed = sources().slice(firstNew).map(node => node.start.mock.calls[0]![0]);
  const nextStep = Math.min(...SCORES.title.voices.flatMap(voice => voice.notes.map(note => note.step)).filter(step => step >= SCORES.title.steps));
  // Within the nine milliseconds of humanising.
  expect(Math.abs(resumed[0]! - 11.03 - (nextStep - SCORES.title.steps) * seconds)).toBeLessThanOrEqual(0.0091);
  const all = sources().map(node => `${node.frequency.setValueAtTime.mock.calls[0]?.[0]}:${node.start.mock.calls[0]?.[0]}`);
  expect(new Set(all).size).toBe(all.length);
});
it('cuts death over 200ms and restarts at bar one on retry', () => {
  const { music, context, sources } = setup(); music.setScore('quarry');
  const track = context.nodes[2]!;
  music.setScore(null, 0.2);
  expect(track.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 0.2);
  vi.advanceTimersByTime(400); expect(track.disconnected).toBe(true);
  const count = sources().length;
  music.setScore('quarry');
  expect(sources().slice(count).length).toBeGreaterThan(0);
  for (const node of sources().slice(count)) expect(node.start.mock.calls[0]?.[0]).toBeCloseTo(0.43);
});
it('bounds all live nodes during rapid crossfades and disposes everything, including its timer', () => {
  const { music, context } = setup();
  const ids = Object.keys(SCORES) as ScoreId[];
  for (let index = 0; index < 100; index++) music.setScore(ids[index % ids.length]!);
  expect(context.peak).toBeLessThanOrEqual(MUSIC_NODE_CAP);
  music.dispose(); music.dispose();
  expect(context.nodes.every(node => node.disconnected)).toBe(true);
  expect(context.nodes.every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  music.setScore('title'); music.duck(true); music.setHidden(true);
});
it('waits for the synth unlock and remains silent while effects-only or fully muted', () => {
  const { music, context, output, sources } = setup();
  output.mockReturnValueOnce(null);
  music.setScore('title'); expect(context.nodes).toHaveLength(0);
  vi.advanceTimersByTime(200); expect(sources().length).toBeGreaterThan(0);
  music.setEnabled(false); vi.advanceTimersByTime(400);
  const count = context.nodes.length;
  vi.advanceTimersByTime(5000); expect(context.nodes).toHaveLength(count);
  music.setEnabled(true); expect(context.nodes.length).toBeGreaterThan(count);
});
it('cleans partial allocations on errors and ignores missing or throwing audio devices', () => {
  const missing = createMusic(() => null); players.push(missing);
  expect(() => { missing.setScore('title'); vi.advanceTimersByTime(1000); }).not.toThrow();
  missing.dispose();
  const { music, context } = setup();
  context.createOscillator = () => { throw new Error('device lost'); };
  expect(() => music.setScore('title')).not.toThrow();
  expect(context.nodes.every(node => node.disconnected)).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  const broken = createMusic(() => { throw new Error('denied'); });
  expect(() => broken.setScore('title')).not.toThrow();
  expect(vi.getTimerCount()).toBe(0);
});

it('keeps a newly-selected score alive when the score changes during a short hidden interval', () => {
  const { music, sources } = setup(); music.setScore('title');
  vi.advanceTimersByTime(1000); music.setHidden(true);
  music.setScore('lowlands');
  vi.advanceTimersByTime(100); music.setHidden(false);
  const newSources = sources().filter(node => (node.start.mock.calls[0]?.[0] ?? 0) > 1.1);
  expect(newSources.length).toBeGreaterThan(0);
  vi.advanceTimersByTime(500);
  expect(newSources.every(node => !node.disconnected)).toBe(true);
});

it.each([true, false])('anchors interrupted fades with hold support=%s and stays below 8%% per 10ms', hold => {
  const { music, context } = setup();
  if (!hold) {
    const create = context.createGain;
    context.createGain = () => {
      const node = create();
      Object.defineProperty(node.gain, 'cancelAndHoldAtTime', { value: undefined });
      return node;
    };
  }
  music.setScore('title');
  const previous = new Map<Param, number>();
  const sample = (milliseconds: number): void => {
    for (let elapsed = 0; elapsed < milliseconds; elapsed += 10) {
      vi.advanceTimersByTime(10);
      const now = context.currentTime;
      // Bus and track gains are the fades; note envelopes have their own authored attacks.
      const gains = context.nodes.filter(node => node.connect.mock.calls.some(([destination]) =>
        destination === context.nodes[0] || destination === context.nodes[1]));
      for (const node of gains) {
        const scale = node === context.nodes[0] ? MUSIC_LEVEL : 1;
        const value = node.disconnected ? 0 : node.gain.at(now) / scale;
        expect(Math.abs(value - (previous.get(node.gain) ?? node.gain.at(now - 0.01) / scale))).toBeLessThanOrEqual(0.080001);
        previous.set(node.gain, value);
      }
    }
  };
  sample(100); music.duck(true); sample(100); music.duck(false); sample(100);
  music.setScore('margin'); sample(100); music.setHidden(true); sample(100);
  music.setHidden(false); sample(200); music.setHidden(true); sample(500);
  music.setHidden(false); sample(2000);
  music.setScore(null, 0.2); sample(300);
});

it('keeps the same sounding notes on a return during the hide fade', () => {
  const { music, context, sources } = setup(); music.setScore('lowlands');
  vi.advanceTimersByTime(2000);
  const sounding = sources().filter(node => !node.disconnected);
  const stops = sounding.map(node => node.stop.mock.calls.length);
  music.setHidden(true); vi.advanceTimersByTime(100); music.setHidden(false);
  sounding.forEach((node, index) => expect(node.stop).toHaveBeenCalledTimes(stops[index]!));
  expect(context.nodes[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(MUSIC_LEVEL, 2.7);
});

it('resumes a fully hidden track from zero with a 600ms fade', () => {
  const { music, context } = setup(); music.setScore('title');
  vi.advanceTimersByTime(1000); music.setHidden(true); vi.advanceTimersByTime(400);
  music.setHidden(false);
  expect(context.nodes[0]!.gain.setValueAtTime).toHaveBeenLastCalledWith(0, 1.4);
  expect(context.nodes[0]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(MUSIC_LEVEL, 2);
});

it('retries the same score after a transient device throw', () => {
  const { music, context, sources } = setup();
  const create = context.createOscillator;
  context.createOscillator = vi.fn().mockImplementationOnce(() => { throw new Error('transient'); }).mockImplementation(create);
  music.setScore('title');
  expect(context.nodes.every(node => node.disconnected)).toBe(true);
  vi.advanceTimersByTime(2000); expect(sources()).toHaveLength(0);
  music.setScore('title'); expect(sources().length).toBeGreaterThan(0);
});

it('allows only three device failures in a rolling minute and then waits for a new request', () => {
  const output = vi.fn(() => { throw new Error('device lost'); });
  const music = createMusic(output); players.push(music);
  for (let index = 0; index < 10; index++) music.setScore('title');
  expect(output).toHaveBeenCalledTimes(3);
  vi.advanceTimersByTime(60_001); expect(output).toHaveBeenCalledTimes(3);
  music.setScore('title'); expect(output).toHaveBeenCalledTimes(4);
});

it('keeps the last score sounding within two seconds of rapid score changes', () => {
  const { music, context, sources } = setup();
  const ids = Object.keys(SCORES) as ScoreId[];
  for (let index = 0; index < 100; index++) music.setScore(ids[index % ids.length]!);
  music.setScore('lowlands'); vi.advanceTimersByTime(2000);
  const frequencies = SCORES.lowlands.voices.flatMap(voice => voice.notes.filter(note => note.step === 0)
    .map(note => 440 * 2 ** ((note.midi - 69) / 12)));
  expect(sources().some(node => !node.disconnected && frequencies.includes(node.frequency.setValueAtTime.mock.calls[0]?.[0] ?? -1))).toBe(true);
  expect(context.peak).toBeLessThanOrEqual(MUSIC_NODE_CAP);
});

it('plays the drum part brighter than the mason\'s knock', () => {
  const { music, sources } = setup(); music.setMood({ energy: 3, danger: 0 }); music.setScore('margin', 1.5, 'urgent'); vi.advanceTimersByTime(1000);
  const brush = sources().find(node => node.buffer !== undefined)!;
  expect((brush.connect.mock.calls[0]![0] as Node).frequency.setValueAtTime.mock.calls[0]![0]).toBe(1100);
});
it('filters each knock at 260Hz and releases it over 60ms', () => {
  const { music, context, sources } = setup(); music.setMood({ energy: 1, danger: 0 }); music.setScore('quarry'); vi.advanceTimersByTime(1000);
  const knock = sources().find(node => node.buffer !== undefined)!;
  const filter = knock.connect.mock.calls[0]![0] as Node;
  const envelope = filter.connect.mock.calls[0]![0] as Node;
  expect(filter.type).toBe('lowpass');
  expect(filter.frequency.setValueAtTime.mock.calls[0]![0]).toBe(260);
  const decayEnd = envelope.gain.exponentialRampToValueAtTime.mock.calls.at(-1)![1];
  const attackEnd = envelope.gain.linearRampToValueAtTime.mock.calls[0]![1];
  expect(decayEnd - attackEnd).toBeCloseTo(0.0615);
  expect(context.peak).toBeLessThanOrEqual(MUSIC_NODE_CAP);
});

it.each([true, false])('holds pads and decays plucks before release (sustain=%s)', sustain => {
  const original = SCORES.title;
  const voice = { ...original.voices[0]!, sustain, notes: [{ step: 0, midi: 60, length: 4 }] };
  Object.defineProperty(SCORES, 'title', { value: { ...original, voices: [voice] }, configurable: true });
  try {
    const { music, sources } = setup(); music.setScore('title');
    const source = sources()[0]!;
    const gain = (source.connect.mock.calls[0]![0] as Node).gain;
    const end = source.start.mock.calls[0]![0] + 4 * stepSeconds(original);
    expect(gain.at(end)).toBeCloseTo(Math.min(0.24, voice.level * humanise(original, 0, 0).level) * (sustain ? 1 : 0.3));
    expect(gain.at(end + voice.releaseMs / 1000)).toBeCloseTo(0.0001);
  } finally { Object.defineProperty(SCORES, 'title', { value: original }); }
});

it('steals the oldest pluck with a 10ms fade and admits the new note under the cap', () => {
  const original = SCORES.title;
  const pluck = { ...original.voices[0]!, sustain: false, notes: Array.from({ length: Math.floor(MUSIC_NODE_CAP / 2) }, (_, index) =>
    ({ step: 0, midi: 60 + index, length: 20 })) };
  const pad = { ...pluck, sustain: true, notes: [{ step: 0, midi: 40, length: 20 }] };
  const newcomer = { ...pluck, notes: [{ step: 2, midi: 90, length: 20 }] };
  Object.defineProperty(SCORES, 'title', { value: { ...original, voices: [pad, pluck, newcomer] }, configurable: true });
  try {
    const { music, context, sources } = setup(); music.setScore('title');
    vi.advanceTimersByTime(1100);
    const oldest = sources().find(node => node.frequency.setValueAtTime.mock.calls[0]?.[0] === 440 * 2 ** ((60 - 69) / 12))!;
    const envelope = oldest.connect.mock.calls[0]![0] as Node;
    const fade = envelope.gain.linearRampToValueAtTime.mock.calls.at(-1)!;
    const anchor = envelope.gain.setValueAtTime.mock.calls.at(-1)!;
    expect(fade[0]).toBe(0); expect(fade[1] - anchor[1]).toBeCloseTo(0.01);
    expect(oldest.disconnected).toBe(true);
    expect(sources().some(node => !node.disconnected && node.frequency.setValueAtTime.mock.calls[0]?.[0] === 440 * 2 ** ((90 - 69) / 12))).toBe(true);
    expect(sources().find(node => node.frequency.setValueAtTime.mock.calls[0]?.[0] === 440 * 2 ** ((40 - 69) / 12))?.disconnected).toBe(false);
    expect(context.peak).toBeLessThanOrEqual(MUSIC_NODE_CAP);
  } finally { Object.defineProperty(SCORES, 'title', { value: original }); }
});

function cadenceSources(context: ClockContext): Node[] {
  // Cadence envelopes bypass the duck bus and connect to their own filtered gain.
  const filter = context.nodes[1];
  return context.nodes.filter(node => {
    if (!node.start.mock.calls.length) return false;
    const envelope = node.connect.mock.calls[0]?.[0] as Node | undefined;
    const gain = envelope?.connect.mock.calls[0]?.[0] as Node | undefined;
    return gain?.connect.mock.calls[0]?.[0] === filter && gain !== context.nodes[0];
  });
}
it('plays one cadence per clear on the next beat, outside the duck bus', () => {
  const { music, context } = setup(); music.setScore('margin');
  vi.advanceTimersByTime(400); music.setResolved(true); music.setResolved(true); music.duck(true);
  vi.advanceTimersByTime(12000);
  const cadence = cadenceSources(context);
  expect(cadence).toHaveLength(12);
  const beat = 60 / SCORES.margin.bpm;
  expect(cadence[0]!.start.mock.calls[0]![0]).toBeCloseTo(0.03 + beat);
  const gain = (cadence[0]!.connect.mock.calls[0]![0] as Node).connect.mock.calls[0]![0] as Node;
  expect(gain.gain.value).toBe(MUSIC_LEVEL);
  expect(context.nodes[1]!.frequency.linearRampToValueAtTime).toHaveBeenCalledWith(3400, 1.03 + beat);
  music.setResolved(true); vi.advanceTimersByTime(10000);
  expect(cadenceSources(context)).toHaveLength(12);
  expect(context.peak).toBeLessThanOrEqual(MUSIC_NODE_CAP);
});
it('silences plucks and bass while resolved and restores their gain at a bar', () => {
  const { music, context, sources } = setup(); music.setScore('lowlands');
  vi.advanceTimersByTime(700); music.setResolved(true);
  vi.advanceTimersByTime(5000);
  const layers = context.nodes.filter(node => node.gain.linearRampToValueAtTime.mock.calls.some(([value, at]) =>
    value === 0 && at > 0.7 && at < 2));
  expect(layers.length).toBeGreaterThan(0);
  for (const layer of layers) expect(layer.gain.at(context.currentTime)).toBe(0);
  const count = sources().length;
  vi.advanceTimersByTime(6000);
  // Any newly scheduled bed sources are sustained voices, never the melody/bass.
  const padFrequencies = SCORES.lowlands.voices.filter(voice => voice.sustain)
    .flatMap(voice => voice.notes.map(note => 440 * 2 ** ((note.midi - 69) / 12)));
  for (const node of sources().slice(count)) expect(padFrequencies).toContain(node.frequency.setValueAtTime.mock.calls[0]![0]);
  music.setResolved(false);
  const bar = stepSeconds(SCORES.lowlands) * SCORES.lowlands.steps;
  const boundary = 0.03 + Math.ceil((context.currentTime - 0.03) / bar) * bar;
  vi.advanceTimersByTime((boundary - context.currentTime + 0.7) * 1000);
  // Each part comes back to what the arrangement gives it there, not all of them to full.
  const bars = Math.round((boundary - 0.03) / bar);
  const mix = arrangement(SCORES.lowlands, bars % SCORES.lowlands.bars, Math.floor(bars / SCORES.lowlands.bars), { energy: 1, danger: 0 });
  const parts = SCORES.lowlands.voices.filter(voice => !voice.sustain).map(voice => mix[voice.part]);
  expect(layers.map(layer => layer.gain.linearRampToValueAtTime.mock.calls.at(-1))).toEqual(parts.map(part => [part, boundary + 0.6]));
  for (const layer of layers) expect(layer.gain.at(boundary - 0.01)).toBe(0);
});
it('starts a changed score unresolved and can cadence again on replay', () => {
  const { music, context } = setup(); music.setScore('title'); music.setResolved(true);
  vi.advanceTimersByTime(5000); music.setScore('quarry');
  vi.advanceTimersByTime(2000);
  expect(context.nodes[1]!.frequency.linearRampToValueAtTime.mock.calls.at(-1)?.[0]).toBe(2200);
  const count = cadenceSources(context).length;
  music.setResolved(true); vi.advanceTimersByTime(10000);
  expect(cadenceSources(context).length - count).toBe(12);
  music.setResolved(false); vi.advanceTimersByTime(5000);
  music.setResolved(true); vi.advanceTimersByTime(10000);
  expect(cadenceSources(context).length - count).toBe(24);
  expect(context.peak).toBeLessThanOrEqual(MUSIC_NODE_CAP);
});
it.each(['hidden', 'disabled', 'missing', 'disposed'] as const)('does not play a late cadence when resolved while %s', state => {
  const { music, context, output } = setup();
  if (state === 'missing') output.mockReturnValue(null);
  music.setScore('library');
  if (state === 'hidden') music.setHidden(true);
  if (state === 'disabled') music.setEnabled(false);
  if (state === 'disposed') music.dispose();
  music.setResolved(true); vi.advanceTimersByTime(1000);
  if (state === 'hidden') music.setHidden(false);
  if (state === 'disabled') music.setEnabled(true);
  if (state === 'missing') output.mockReturnValue({ context: context as unknown as AudioContext, master: new Node() as unknown as GainNode });
  vi.advanceTimersByTime(10000);
  expect(cadenceSources(context)).toHaveLength(0);
  expect(context.peak).toBeLessThanOrEqual(MUSIC_NODE_CAP);
});
it.each(Object.keys(SCORES) as ScoreId[])('%s reserves cadence nodes under the cap', id => {
  const { music, context } = setup(); music.setScore(id);
  vi.advanceTimersByTime(1000); music.setResolved(true); vi.advanceTimersByTime(20000);
  expect(cadenceSources(context)).toHaveLength(12);
  expect(context.peak).toBeLessThanOrEqual(MUSIC_NODE_CAP);
  music.dispose(); expect(context.nodes.every(node => node.disconnected)).toBe(true);
});

it.each([true, false])('keeps interrupted resolved fades within 8%% per 10ms (hold=%s)', hold => {
  const { music, context } = setup();
  if (!hold) {
    const create = context.createGain;
    context.createGain = () => {
      const node = create();
      Object.defineProperty(node.gain, 'cancelAndHoldAtTime', { value: undefined });
      return node;
    };
  }
  music.setScore('margin'); vi.advanceTimersByTime(1000);
  music.setResolved(true);
  const previous = new Map<Node, number>();
  const sample = (ms: number): void => {
    for (let elapsed = 0; elapsed < ms; elapsed += 10) {
      vi.advanceTimersByTime(10);
      const layers = context.nodes.filter(node => {
        const destination = node.connect.mock.calls.at(-1)?.[0] as Node | undefined;
        return destination === context.nodes[2] && node.gain.value === 0;
      });
      for (const layer of layers) {
        const value = layer.gain.at(context.currentTime);
        expect(Math.abs(value - (previous.get(layer) ?? layer.gain.at(context.currentTime - 0.01)))).toBeLessThanOrEqual(0.080001);
        previous.set(layer, value);
      }
    }
  };
  sample(300); music.setResolved(false); sample(100);
  music.setResolved(true); sample(700); music.setResolved(false); sample(4000);
});

it('retains only the quietest voice at half level when a score has no sustain', () => {
  const original = SCORES.title;
  Object.defineProperty(SCORES, 'title', { value: { ...original, voices: original.voices.slice(0, 2) }, configurable: true });
  try {
    const { music, context } = setup(); music.setScore('title');
    music.setResolved(true); vi.advanceTimersByTime(1000);
    const layers = context.nodes.filter(node => node.connect.mock.calls.at(-1)?.[0] === context.nodes[2]);
    expect(layers.map(layer => layer.gain.at(context.currentTime))).toEqual([0, 0.5]);
  } finally { Object.defineProperty(SCORES, 'title', { value: original }); }
});

it.each(['hidden', 'disabled', 'missing', 'suspended', 'failed', 'disposed'] as const)('reports no cadence when %s', state => {
  const { music, context, output } = setup();
  if (state === 'missing') output.mockReturnValue(null);
  if (state === 'suspended') context.state = 'suspended';
  if (state === 'failed') context.createOscillator = () => { throw new Error('device'); };
  music.setScore('margin');
  if (state === 'hidden') music.setHidden(true);
  if (state === 'disabled') music.setEnabled(false);
  if (state === 'disposed') music.dispose();
  expect(music.setResolved(true)).toBe(false);
});

it('reports an immediate scheduling failure and does not cadence after recovery', () => {
  const { music, context } = setup(); music.setScore('margin');
  const create = context.createGain;
  context.createGain = () => { throw new Error('device'); };
  expect(music.setResolved(true)).toBe(false);
  context.createGain = create; music.setScore('margin'); vi.advanceTimersByTime(5000);
  expect(cadenceSources(context)).toHaveLength(0);
});

it.each([500, 2100])('preserves a delayed-start cadence only for a recent request (%sms)', delay => {
  const { music, context } = setup();
  // Occupy track buses with crossfades so the final track must wait for slots.
  const ids = Object.keys(SCORES) as ScoreId[];
  for (let index = 0; index < 100; index++) music.setScore(ids[index % ids.length]!);
  music.setScore('margin');
  expect(music.setResolved(true)).toBe(true);
  // Move the audio clock without running the timer: the pending start is genuinely late.
  vi.setSystemTime(delay); music.tick(); vi.advanceTimersByTime(12000);
  expect(cadenceSources(context).length).toBe(delay < 2000 ? 12 : 0);
  expect(context.peak).toBeLessThanOrEqual(MUSIC_NODE_CAP);
});

it('anchors late resolution ramps and all figure offsets to the current clock', () => {
  const { music, context } = setup(); music.setScore('margin');
  vi.setSystemTime(100); expect(music.setResolved(true)).toBe(true);
  expect(cadenceSources(context)).toHaveLength(0);
  vi.setSystemTime(2000); music.tick();
  const filter = context.nodes[1]!;
  expect(filter.frequency.setValueAtTime.mock.calls.at(-1)?.[1]).toBe(2);
  expect(filter.frequency.linearRampToValueAtTime).toHaveBeenLastCalledWith(3400, 3);
  vi.advanceTimersByTime(10000);
  const starts = cadenceSources(context).map(node => node.start.mock.calls[0]![0]);
  const beat = 60 / SCORES.margin.bpm;
  expect(starts[0]).toBe(2);
  expect(new Set(starts).size).toBeGreaterThan(1);
  expect(starts).toContain(2 + beat);
});

it('un-resolving removes queued cadence notes and fades sounding cadence over 200ms', () => {
  const { music, context } = setup(); music.setScore('margin');
  music.setResolved(true); vi.advanceTimersByTime(100);
  const cadence = cadenceSources(context); expect(cadence.length).toBeGreaterThan(0);
  const gain = (cadence[0]!.connect.mock.calls[0]![0] as Node).connect.mock.calls[0]![0] as Node;
  music.setResolved(false);
  expect(gain.gain.linearRampToValueAtTime.mock.calls.at(-1)?.[0]).toBe(0);
  expect(gain.gain.linearRampToValueAtTime.mock.calls.at(-1)?.[1]).toBeCloseTo(0.3);
  music.duck(true); // Other mix updates must not re-enable the cancelled cadence bus.
  vi.advanceTimersByTime(5000);
  expect(gain.gain.at(context.currentTime)).toBe(0);
  expect(cadenceSources(context)).toHaveLength(cadence.length);
  music.setResolved(true); vi.advanceTimersByTime(5000);
  expect(gain.gain.at(context.currentTime)).toBe(MUSIC_LEVEL);
  expect(cadenceSources(context).length).toBeGreaterThan(cadence.length);
});

it('restores resolved layers without a cadence when explicitly requested', () => {
  const { music, context } = setup(); music.setScore('margin');
  expect(music.setResolved(true, { cadence: false })).toBe(false);
  vi.advanceTimersByTime(5000);
  expect(cadenceSources(context)).toHaveLength(0);
  expect(context.nodes[1]!.frequency.at(context.currentTime)).toBe(3400);
});

it('keeps score notes running during a blocked cadence group and gives it up after 1s', () => {
  const original = SCORES.title;
  const figure: [number, number, number][] = Array.from({ length: 30 }, () => [0, 100, 1]);
  Object.defineProperty(SCORES, 'title', { value: { ...original,
    voices: [{ ...original.voices[0]!, sustain: true,
      notes: [{ step: 0, midi: 60, length: 0.1 }, { step: 2, midi: 62, length: 0.1 }] }],
    cadence: { ...original.cadence, figure } }, configurable: true });
  try {
    const { music, context, sources } = setup(); music.setScore('title');
    const before = sources().length; expect(music.setResolved(true)).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(sources().length).toBeGreaterThan(before);
    figure.splice(1); vi.advanceTimersByTime(5000);
    expect(cadenceSources(context)).toHaveLength(0);
    expect(context.peak).toBeLessThanOrEqual(MUSIC_NODE_CAP);
  } finally { Object.defineProperty(SCORES, 'title', { value: original }); }
});

it('does not skip a muted layer note after a pending un-resolve boundary', () => {
  const original = SCORES.title;
  const voices = [
    { ...original.voices[0]!, sustain: false, notes: [
      { step: 0, midi: 60, length: 0.1 }, { step: original.steps, midi: 90, length: 0.1 },
    ] },
    { ...original.voices[0]!, sustain: true, notes: [] },
  ];
  Object.defineProperty(SCORES, 'title', { value: { ...original, voices }, configurable: true });
  try {
    const { music, sources } = setup(); music.setScore('title');
    music.setResolved(true, { cadence: false }); vi.advanceTimersByTime(1000);
    // Force the un-resolve to wait for layer slots, while its score cursor keeps moving.
    voices.push(...Array.from({ length: MUSIC_NODE_CAP }, () => ({ ...voices[1]!, notes: [] })));
    music.setResolved(false);
    const boundary = 0.03 + original.steps * stepSeconds(original);
    vi.setSystemTime((boundary - 0.5) * 1000); music.tick();
    const frequency = 440 * 2 ** ((90 - 69) / 12);
    expect(sources().some(node => node.frequency.setValueAtTime.mock.calls[0]?.[0] === frequency
      && Math.abs((node.start.mock.calls[0]?.[0] ?? 0) - boundary) <= 0.009)).toBe(true);
  } finally { Object.defineProperty(SCORES, 'title', { value: original }); }
});

it('fades danger immediately and waits two continuous seconds before easing it', () => {
  const { music, context, sources } = setup(); music.setScore('title');
  vi.advanceTimersByTime(1000);
  const filter = context.nodes[1]!;
  music.setMood({ energy: 2, danger: 1 });
  expect(filter.frequency.linearRampToValueAtTime).toHaveBeenLastCalledWith(1400, 1.25);
  vi.advanceTimersByTime(500); music.setMood({ energy: 2, danger: 2 });
  expect(filter.frequency.linearRampToValueAtTime).toHaveBeenLastCalledWith(1000, 1.75);
  // The heartbeat adds a low tonic pair, rather than a shrill warning tone.
  const root = 440 * 2 ** ((SCORES.title.cadence.chord[0]! - 69) / 12);
  vi.advanceTimersByTime(500);
  expect(sources().some(source => source.frequency.setValueAtTime.mock.calls[0]?.[0] === root)).toBe(true);
  music.setMood({ energy: 2, danger: 0 });
  vi.advanceTimersByTime(1000); music.setMood({ energy: 2, danger: 0 });
  vi.advanceTimersByTime(999); expect(filter.frequency.at(context.currentTime)).toBe(1000);
  // Danger comes fast and leaves slowly.
  vi.advanceTimersByTime(301); expect(filter.frequency.at(context.currentTime)).toBeLessThan(1600);
  vi.advanceTimersByTime(1000); expect(filter.frequency.at(context.currentTime)).toBe(2200);
});
it('takes three seconds to become idle and restores visitors only at a phrase boundary', () => {
  const { music, context } = setup(); music.setMood({ energy: 2, danger: 0 }); music.setScore('title');
  const layers = context.nodes.filter(node => node.connect.mock.calls.at(-1)?.[0] === context.nodes[2]);
  const melody = layers[0]!, counter = layers[3]!;
  vi.advanceTimersByTime(20000);
  expect(melody.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 23);
  expect(counter.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 23);
  vi.advanceTimersByTime(4000); music.activity();
  expect(melody.gain.at(context.currentTime)).toBe(0);
  const boundary = 0.03 + 8 * SCORES.title.steps * stepSeconds(SCORES.title);
  vi.advanceTimersByTime((boundary - context.currentTime - 0.1) * 1000);
  expect(melody.gain.at(context.currentTime)).toBe(0);
  vi.advanceTimersByTime(1400);
  expect(melody.gain.at(context.currentTime)).toBeCloseTo(0.8);
  expect(counter.gain.at(context.currentTime)).toBeCloseTo(0.7);
});
it('opens a stage quietly with its tune, and answers a step of the quest at the next bar', () => {
  const { music, context } = setup(); music.setMood({ energy: 0, danger: 0 }); music.setScore('title');
  const layers = context.nodes.filter(node => node.connect.mock.calls.at(-1)?.[0] === context.nodes[2]);
  const at = (part: string) => layers[SCORES.title.voices.findIndex(voice => voice.part === part)]!.gain.at(context.currentTime);
  vi.advanceTimersByTime(2000);
  expect(at('bed')).toBeCloseTo(0.75);
  expect(at('melody')).toBeCloseTo(0.8 * 0.75);
  expect(at('counter')).toBe(0);
  music.setMood({ energy: 3, danger: 0 });
  expect(at('counter')).toBe(0);
  const bar = SCORES.title.steps * stepSeconds(SCORES.title);
  vi.advanceTimersByTime((bar + 1.3) * 1000);
  expect(at('bed')).toBe(1);
  expect(at('counter')).toBeCloseTo(0.7);
  expect(at("pulse")).toBeCloseTo(0.85);
});
it('does not rest outside a stage', () => {
  const { music, context } = setup(); music.setMood({ energy: 1, danger: 0 }, false); music.setScore('title');
  const melody = context.nodes.find(node => node.connect.mock.calls.at(-1)?.[0] === context.nodes[2])!;
  vi.advanceTimersByTime(21000);
  expect(melody.gain.linearRampToValueAtTime.mock.calls.some(([value, end]) => value === 0 && end === 23)).toBe(false);
});
it('keeps an ordered heartbeat, one pair a beat in danger 2 and every other beat in danger 1', () => {
  for (const [danger, every] of [[1, 2], [2, 1]] as const) {
    const { music, sources } = setup(); music.setScore('title'); music.setMood({ energy: 1, danger });
    vi.advanceTimersByTime(10000);
    const root = 440 * 2 ** ((SCORES.title.cadence.chord[0]! - 69) / 12);
    const beat = stepSeconds(SCORES.title) * SCORES.title.stepsPerBeat;
    const starts = sources().filter(node => node.frequency.setValueAtTime.mock.calls[0]?.[0] === root
      && Math.abs(node.stop.mock.calls[0]![0]! - node.start.mock.calls[0]![0] - 0.33) < 0.001).map(node => node.start.mock.calls[0]![0]);
    const pairs = starts.filter((_, index) => index % 2 === 0);
    expect(pairs.length).toBeGreaterThan(10 / beat / every - 3);
    for (let index = 1; index < pairs.length; index++) expect(pairs[index]! - pairs[index - 1]!).toBeCloseTo(beat * every, 1);
    music.dispose(); vi.setSystemTime(0);
  }
});
it('crossfades a new pace and continues uninterrupted when another stage shares it', () => {
  const { music, context, sources } = setup();
  music.setScore('quarry', 1.5, 'still');
  const count = context.nodes.length;
  music.setScore('quarry', 1.5, 'still'); expect(context.nodes).toHaveLength(count);
  vi.advanceTimersByTime(2000);
  const before = sources().length;
  music.setScore('quarry', 1.5, 'urgent');
  expect(context.nodes[2]!.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(0, 3.5);
  vi.advanceTimersByTime(1200);
  const expectedStep = SCORES.quarry.voices[0]!.notes[1]!.step;
  const urgent = { ...SCORES.quarry, bpm: SCORES.quarry.bpm * 1.1 };
  const expected = 2.03 + expectedStep * stepSeconds(urgent) + humanise(urgent, 0, expectedStep).offset;
  expect(sources().slice(before).some(node => Math.abs(node.start.mock.calls[0]![0] - expected) < 0.00001)).toBe(true);
});
it.each(['still', 'steady', 'urgent'] as const)('plays the %s drum pattern', pace => {
  const { music, sources } = setup(); music.setMood({ energy: 3, danger: 0 }); music.setScore('margin', 1.5, pace);
  vi.advanceTimersByTime(11000);
  const knocks = sources().filter(source => source.buffer !== undefined);
  if (pace === 'still') expect(knocks).toHaveLength(0);
  else {
    expect(knocks.length).toBeGreaterThan(0);
    if (pace === 'steady') expect(knocks.length).toBeLessThan(6);
    if (pace === 'urgent') expect(knocks.length).toBeGreaterThan(20);
  }
});
it.each(Object.keys(SCORES) as ScoreId[])('%s shares one stereo room and stays bounded with spatial audio and cadence', id => {
  const { music, context } = setup();
  const spatial = Object.assign(context, {
    createConvolver: vi.fn(context.createGain), createDelay: vi.fn(context.createGain), createStereoPanner: vi.fn(context.createGain),
  });
  const channels: Float32Array[][] = [];
  context.createBuffer.mockImplementation((_count?: number, length?: number) => {
    const buffer = [new Float32Array(length ?? 10), new Float32Array(length ?? 10)]; channels.push(buffer);
    return { getChannelData: (channel = 0) => buffer[channel]! };
  });
  music.setScore(id);
  const room = spatial.createConvolver.mock.results[0]!.value;
  const delay = spatial.createDelay.mock.results[0]!.value;
  expect(spatial.createConvolver).toHaveBeenCalledOnce();
  expect(context.createBuffer).toHaveBeenCalledWith(2, 190, 100);
  expect(channels[0]![0]).not.toEqual(channels[0]![1]);
  expect(Math.abs(channels[0]![0]!.at(-1)!)).toBeLessThan(0.01);
  expect(delay.delayTime.value).toBe(0.018); expect(delay.connect).toHaveBeenCalledWith(room);
  expect(spatial.createStereoPanner.mock.results.map(result => result.value.pan.value)).toEqual(
    [...SCORES[id].voices.map(voice => ({ melody: -0.12, counter: 0.3, pulse: 0, bed: 0, drum: 0.2 })[voice.part]), ...(SCORES[id].ambience ? [0.2] : [])]);
  vi.advanceTimersByTime(1000); music.setResolved(true); vi.advanceTimersByTime(12000);
  expect(cadenceSources(context)).toHaveLength(12);
  expect(context.peak).toBeLessThanOrEqual(MUSIC_NODE_CAP);
  music.dispose(); expect(context.nodes.every(node => node.disconnected)).toBe(true);
});
it('restores an idle visitor when a key arrives inside the phrase lookahead window', () => {
  const { music, context } = setup(); music.setMood({ energy: 1, danger: 0 }); music.setScore('title');
  const melody = context.nodes.find(node => node.connect.mock.calls.at(-1)?.[0] === context.nodes[2])!;
  const boundary = 0.03 + 8 * SCORES.title.steps * stepSeconds(SCORES.title);
  vi.advanceTimersByTime((boundary - 0.2) * 1000);
  expect(melody.gain.at(context.currentTime)).toBe(0);
  music.activity();
  expect(melody.gain.at(context.currentTime)).toBe(0);
  vi.advanceTimersByTime(1500);
  expect(melody.gain.at(context.currentTime)).toBeCloseTo(0.8);
});
