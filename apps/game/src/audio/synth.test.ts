import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createSynth, MASTER_VOLUME, speakerPitch } from './synth.js';
import type { CueKind } from './cues.js';
class Param {
  value = 0;
  setValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
}
class Node {
  gain = new Param(); frequency = new Param();
  connect = vi.fn(); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
  onended: (() => void) | null = null;
  type = ''; buffer: unknown;
}
class FakeContext {
  static instances: FakeContext[] = [];
  state = 'running'; currentTime = 10; sampleRate = 100;
  destination = new Node();
  nodes: Node[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  constructor() { FakeContext.instances.push(this); }
  createGain = () => this.node();
  createOscillator = () => this.node();
  createBufferSource = () => this.node();
  createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(100) }));
  private node(): Node { const node = new Node(); this.nodes.push(node); return node; }
}
beforeEach(() => { FakeContext.instances = []; vi.stubGlobal('AudioContext', FakeContext); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it('creates one context on unlock, schedules by offset and disconnects nodes when ended', () => {
  const synth = createSynth();
  synth.play([{ kind: 'jump', offsetMs: 0 }]);
  expect(FakeContext.instances).toHaveLength(0);
  synth.unlock(); synth.unlock();
  expect(FakeContext.instances).toHaveLength(1);
  const context = FakeContext.instances[0]!;
  expect(context.nodes[0]?.gain.value).toBe(MASTER_VOLUME);
  synth.play([{ kind: 'jump', offsetMs: 120, distance: 4 }]);
  const oscillator = context.nodes.find(node => node.start.mock.calls.length > 0)!;
  expect(oscillator.start).toHaveBeenCalledWith(10.12);
  oscillator.onended?.();
  expect(context.nodes.slice(1).every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
});
it('muting creates nothing and cancels already scheduled notes', () => {
  const synth = createSynth(); synth.setEnabled(false); synth.unlock();
  synth.play([{ kind: 'hit', offsetMs: 0 }]);
  expect(FakeContext.instances).toHaveLength(0);
  synth.setEnabled(true); synth.unlock(); synth.play([{ kind: 'clear', offsetMs: 0 }]);
  const context = FakeContext.instances[0]!;
  synth.setEnabled(false);
  expect(context.nodes.slice(1).every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
  const count = context.nodes.length;
  synth.play([{ kind: 'step', offsetMs: 0 }]);
  expect(context.nodes).toHaveLength(count);
});
it('synthesizes every recipe, caches noise, and supports cancellation', () => {
  const synth = createSynth(); synth.unlock();
  const kinds: CueKind[] = ['step', 'jump', 'land', 'bump', 'fixed', 'delete', 'put', 'undo', 'redo', 'hit', 'death', 'clear', 'trigger', 'lever', 'search-miss', 'voice', 'paper', 'star'];
  const cancel = synth.play(kinds.map(kind => ({ kind, offsetMs: 0 })));
  const context = FakeContext.instances[0]!;
  expect(context.createBuffer).toHaveBeenCalledTimes(1);
  cancel(); cancel();
  expect(context.nodes.slice(1).every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
});
it('handles missing or throwing Web Audio and resumes suspended contexts', async () => {
  vi.stubGlobal('AudioContext', undefined);
  const missing = createSynth();
  expect(() => { missing.unlock(); missing.play([{ kind: 'hit', offsetMs: 0 }]); }).not.toThrow();
  const broken = createSynth(() => { throw new Error('unavailable'); });
  expect(() => broken.unlock()).not.toThrow();
  vi.stubGlobal('AudioContext', FakeContext);
  const synth = createSynth(); synth.unlock();
  const context = FakeContext.instances[0]!;
  context.state = 'suspended'; synth.unlock();
  expect(context.resume).toHaveBeenCalledOnce();
  context.resume.mockRejectedValueOnce(new Error('blocked'));
  context.state = 'suspended';
  synth.unlock();
  await Promise.resolve();
});
it('uses stable speaker pitches', () => {
  expect(speakerPitch('elder')).toBe(speakerPitch('elder'));
  expect(speakerPitch('elder')).not.toBe(speakerPitch('dot'));
});
it('disconnects partial allocations when node creation fails and tolerates cleanup failures', () => {
  const synth = createSynth(); synth.unlock();
  const context = FakeContext.instances[0]!;
  vi.spyOn(context, 'createOscillator').mockImplementationOnce(() => { throw new Error('device lost'); });
  expect(() => synth.play([{ kind: 'hit', offsetMs: 0 }])).not.toThrow();
  expect(context.nodes[1]?.disconnect).toHaveBeenCalledOnce();
  const second = createSynth(); second.unlock();
  const next = FakeContext.instances[1]!;
  second.play([{ kind: 'hit', offsetMs: 0 }]);
  for (const node of next.nodes) {
    node.stop.mockImplementation(() => { throw new Error('already stopped'); });
    node.disconnect.mockImplementation(() => { throw new Error('device lost'); });
  }
  expect(() => second.setEnabled(false)).not.toThrow();
});

function suspendedSynth() {
  const context = new FakeContext();
  context.state = 'suspended';
  let resolveResume: () => void = () => {};
  context.resume.mockImplementation(() => new Promise<void>(resolve => {
    resolveResume = () => { context.state = 'running'; resolve(); };
  }));
  const synth = createSynth(() => context as unknown as AudioContext);
  synth.unlock();
  return { synth, context, resume: () => resolveResume() };
}
it('plays only the latest fresh batch when async resume completes', async () => {
  vi.useFakeTimers();
  const { synth, context, resume } = suspendedSynth();
  const cancelOld = synth.play([{ kind: 'jump', offsetMs: 0 }]);
  synth.play([{ kind: 'land', offsetMs: 0 }]);
  cancelOld();
  expect(context.nodes).toHaveLength(1);
  vi.advanceTimersByTime(299);
  resume(); await Promise.resolve();
  expect(context.nodes).toHaveLength(3);
  expect(context.nodes[2]?.frequency.setValueAtTime).toHaveBeenCalledWith(160, 10);
});
it('drops batches at 300 ms and cancels pending or resumed cues', async () => {
  vi.useFakeTimers();
  const stale = suspendedSynth();
  stale.synth.play([{ kind: 'hit', offsetMs: 0 }]);
  vi.advanceTimersByTime(300); stale.resume(); await Promise.resolve();
  expect(stale.context.nodes).toHaveLength(1);
  for (const action of ['cancel', 'stop', 'mute'] as const) {
    const { synth, context, resume } = suspendedSynth();
    const cancel = synth.play([{ kind: 'hit', offsetMs: 0 }]);
    if (action === 'cancel') cancel();
    else if (action === 'stop') synth.stop();
    else synth.setEnabled(false);
    resume(); await Promise.resolve();
    expect(context.nodes).toHaveLength(1);
  }
  const fresh = suspendedSynth();
  const cancel = fresh.synth.play([{ kind: 'hit', offsetMs: 0 }]);
  fresh.resume(); await Promise.resolve(); cancel();
  expect(fresh.context.nodes.slice(1).every(node => node.disconnect.mock.calls.length === 1)).toBe(true);
});
it('accepts a legacy resume returning undefined without disabling future cues', async () => {
  const context = new FakeContext();
  context.state = 'suspended';
  vi.spyOn(context, 'resume').mockImplementation(() => {
    context.state = 'running';
    return undefined as unknown as Promise<void>;
  });
  const synth = createSynth(() => context as unknown as AudioContext);
  synth.unlock(); await Promise.resolve();
  synth.play([{ kind: 'hit', offsetMs: 0 }]);
  expect(context.nodes).toHaveLength(3);
});
it('recovers after resume rejection and skips a failed cue without losing the batch', async () => {
  const context = new FakeContext();
  context.state = 'suspended';
  context.resume.mockRejectedValueOnce(new Error('blocked'));
  const synth = createSynth(() => context as unknown as AudioContext);
  synth.unlock(); await Promise.resolve(); await Promise.resolve();
  synth.unlock(); await Promise.resolve();
  vi.spyOn(context, 'createOscillator').mockImplementationOnce(() => { throw new Error('device lost'); });
  synth.play([{ kind: 'hit', offsetMs: 0 }, { kind: 'land', offsetMs: 0 }]);
  expect(context.nodes[1]?.disconnect).toHaveBeenCalledOnce();
  expect(context.nodes[3]?.start).toHaveBeenCalledOnce();
  synth.play([{ kind: 'jump', offsetMs: 0 }]);
  expect(context.nodes[5]?.start).toHaveBeenCalledOnce();
});

it('shares only its already-unlocked context and master, with no extra allocations', () => {
  const synth = createSynth();
  expect(synth.audio()).toBeNull();
  expect(FakeContext.instances).toHaveLength(0);
  synth.unlock();
  const context = FakeContext.instances[0]!;
  expect(synth.audio()).toEqual({ context, master: context.nodes[0] });
  expect(context.nodes).toHaveLength(1);
  synth.setEnabled(false); expect(synth.audio()).toBeNull();
});
