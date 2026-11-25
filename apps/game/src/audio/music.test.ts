import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createMusic, MUSIC_LEVEL, MUSIC_NODE_CAP } from './music.js';
import { SCORES, loopSeconds, stepSeconds, type ScoreId } from './score.js';

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
  gain = new Param(); frequency = new Param();
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

it.each(Object.keys(SCORES) as ScoreId[])('%s schedules every note exactly once through two full loops', id => {
  const { music, context, sources } = setup();
  const score = SCORES[id];
  music.setScore(id);
  vi.advanceTimersByTime((loopSeconds(score) * 2 - 0.7) * 1000);
  const expected = [...score.voices.flatMap(voice => voice.notes.map(note => note.step)), ...(score.ambience?.steps ?? [])]
    .flatMap(step => [0.03 + step * stepSeconds(score), 0.03 + loopSeconds(score) + step * stepSeconds(score)])
    .sort((left, right) => left - right);
  const actual = sources().map(node => node.start.mock.calls[0]![0]).sort((left, right) => left - right);
  expect(actual).toHaveLength(expected.length);
  actual.forEach((at, index) => expect(at).toBeCloseTo(expected[index]!, 8));
  expect(context.peak).toBeLessThanOrEqual(MUSIC_NODE_CAP);
  if (score.ambience) expect(context.createBuffer).toHaveBeenCalledOnce();
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
  expect(sources().some(node => node.start.mock.calls[0]?.[0] === 1.03)).toBe(true);
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
  expect(resumed[0]).toBeCloseTo(11.03 + (nextStep - SCORES.title.steps) * seconds);
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
      const gains = context.nodes.filter(node => node.gain.linearRampToValueAtTime.mock.calls.some(call =>
        call[0] === 1 || call[0] === MUSIC_LEVEL || call[0] === MUSIC_LEVEL * 0.55));
      for (const node of gains) {
        const scale = node === context.nodes[0] ? MUSIC_LEVEL : 1;
        const value = node.disconnected ? 0 : node.gain.at(now) / scale;
        expect(Math.abs(value - (previous.get(node.gain) ?? 0))).toBeLessThanOrEqual(0.080001);
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

it('filters each knock at 260Hz and releases it over 60ms', () => {
  const { music, context, sources } = setup(); music.setScore('quarry'); vi.advanceTimersByTime(1000);
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
    const { music, context } = setup(); music.setScore('title');
    const gain = context.nodes[3]!.gain;
    const end = 0.03 + 4 * stepSeconds(original);
    expect(gain.at(end)).toBeCloseTo(voice.level * (sustain ? 1 : 0.3));
    expect(gain.at(end + voice.releaseMs / 1000)).toBeCloseTo(0.0001);
  } finally { Object.defineProperty(SCORES, 'title', { value: original }); }
});

it('steals the oldest pluck with a 10ms fade and admits the new note under the cap', () => {
  const original = SCORES.title;
  const pluck = { ...original.voices[0]!, sustain: false, notes: Array.from({ length: 21 }, (_, index) =>
    ({ step: 0, midi: 60 + index, length: 20 })) };
  const pad = { ...pluck, sustain: true, notes: [{ step: 0, midi: 40, length: 20 }] };
  const newcomer = { ...pluck, notes: [{ step: 2, midi: 90, length: 20 }] };
  Object.defineProperty(SCORES, 'title', { value: { ...original, voices: [pluck, pad, newcomer] }, configurable: true });
  try {
    const { music, context, sources } = setup(); music.setScore('title');
    vi.advanceTimersByTime(1100);
    const oldest = sources()[0]!;
    const envelope = context.nodes[3]!;
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
  for (const layer of layers) {
    expect(layer.gain.linearRampToValueAtTime).toHaveBeenLastCalledWith(1, boundary + 0.6);
    expect(layer.gain.at(boundary - 0.01)).toBe(0);
    expect(layer.gain.at(boundary + 0.3)).toBeCloseTo(0.5);
  }
});
it('starts a changed score unresolved and can cadence again on replay', () => {
  const { music, context } = setup(); music.setScore('title'); music.setResolved(true);
  vi.advanceTimersByTime(5000); music.setScore('quarry');
  vi.advanceTimersByTime(2000);
  expect(context.nodes[1]!.frequency.linearRampToValueAtTime).toHaveBeenLastCalledWith(2200, 6);
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
        return destination === context.nodes[2] && node.gain.value === 1;
      });
      for (const layer of layers) {
        const value = layer.gain.at(context.currentTime);
        expect(Math.abs(value - (previous.get(layer) ?? 1))).toBeLessThanOrEqual(0.080001);
        previous.set(layer, value);
      }
    }
  };
  sample(300); music.setResolved(false); sample(100);
  music.setResolved(true); sample(700); music.setResolved(false); sample(4000);
});

it('retains only the quietest voice at half level when a score has no sustain', () => {
  const { music, context } = setup(); music.setScore('title');
  music.setResolved(true); vi.advanceTimersByTime(1000);
  const layers = context.nodes.filter(node => node.connect.mock.calls.at(-1)?.[0] === context.nodes[2]);
  expect(layers.map(layer => layer.gain.at(context.currentTime))).toEqual([0, 0.5, 0]);
});
