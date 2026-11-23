import type { Cue } from './cues.js';

export const MASTER_VOLUME = 0.35;
const PENDING_CUE_MAX_AGE_MS = 300;
const SILENCE = 0.0001;
type ContextFactory = () => AudioContext | null;
const browserContext: ContextFactory = () => typeof AudioContext === 'undefined' ? null : new AudioContext();
interface Note { readonly hz: number; readonly endHz?: number; readonly ms: number; readonly at?: number; readonly noise?: boolean; readonly level?: number }
const note = (hz: number, ms = 90, endHz = hz): Note => ({ hz, ms, endHz });
function recipe(cue: Cue): readonly Note[] {
  switch (cue.kind) {
    case 'step': return (cue.pulsesMs ?? [0]).map((at, index) => ({ ...note(index === 4 ? 100 : 160, 35, 65), at, level: 0.18 }));
    case 'jump': return [note(220, 130, 330 + Math.min(cue.distance ?? 1, 20) * 24)];
    case 'land': return [note(160, 55, 70)];
    case 'bump': return [note(90, 60, 50)];
    case 'fixed': return [note(60, 110, 45)];
    case 'delete': return [{ ...note(180, cue.row ? 210 : 85, 40), noise: true }];
    case 'put': return [note(240, 75, 460)];
    case 'undo': return [{ ...note(180, 180, 800), noise: true }];
    case 'redo': return [{ ...note(800, 180, 180), noise: true }];
    case 'hit': return [note(880, 170, 95)];
    case 'death': return [note(330, 650, 35)];
    case 'clear': return [262, 330, 392, 523].map((hz, index) => ({ ...note(hz, 170), at: index * 140 }));
    case 'trigger': case 'lever': return [note(660, 180, 990)];
    case 'search-miss': return [note(330, 85), { ...note(220, 100), at: 110 }];
    case 'voice': return [{ ...note(cue.pitch ?? 360, 28, (cue.pitch ?? 360) * 0.8), level: 0.08 }];
    case 'paper': return [{ ...note(900, 140, 180), noise: true, level: 0.12 }];
    case 'star': return [note(cue.pitch ?? 660, 180, (cue.pitch ?? 660) * 1.5)];
  }
}
export function speakerPitch(speaker: string): number {
  let hash = 0;
  for (const character of speaker) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return 280 + hash % 240;
}

/** One context, created only inside an input gesture. Scheduling uses the audio clock, never frames. */
export function createSynth(factory: ContextFactory = browserContext) {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let noise: AudioBuffer | null = null;
  let enabled = true;
  let unavailable = false;
  let resuming = false;
  let pending: { readonly cues: readonly Cue[]; readonly createdAt: number; cancel?: () => void } | null = null;
  const active = new Set<() => void>();
  function stop(): void { pending = null; for (const cancel of [...active]) cancel(); }
  function flushPending(): void {
    const batch = pending;
    pending = null;
    if (batch && Date.now() - batch.createdAt < PENDING_CUE_MAX_AGE_MS) batch.cancel = play(batch.cues);
  }
  function unlock(): void {
    if (!enabled || unavailable) return;
    if (!context) {
      try { context = factory(); } catch { unavailable = true; return; }
      if (!context) { unavailable = true; return; }
    }
    try {
      if (!master) {
        master = context.createGain();
        master.gain.value = MASTER_VOLUME;
        master.connect(context.destination);
      }
      if (context.state === 'running') flushPending();
      else if (!resuming) {
        resuming = true;
        void Promise.resolve(context.resume()).then(() => {
          resuming = false;
          if (context?.state === 'running') flushPending();
        }).catch(() => { resuming = false; });
      }
    } catch { resuming = false; }
  }
  function play(cues: readonly Cue[]): () => void {
    const cancellations: (() => void)[] = [];
    if (!enabled || !context || !master || unavailable) return () => {};
    if (context.state !== 'running') {
      const batch: NonNullable<typeof pending> = { cues, createdAt: Date.now() };
      pending = batch;
      return () => { if (pending === batch) pending = null; batch.cancel?.(); };
    }
    const clock = context.currentTime;
    for (const cue of cues) for (const sound of recipe(cue)) {
      const at = clock + (cue.offsetMs + (sound.at ?? 0)) / 1000;
      const end = at + sound.ms / 1000;
      let envelope: GainNode | null = null;
      let oscillator: OscillatorNode | null = null;
      // A cached noise buffer supplies crunch, swish and paper texture.
      let source: AudioBufferSourceNode | null = null;
      let cleaned = false;
      const clean = (): void => {
        if (cleaned) return;
        cleaned = true;
        active.delete(cancel);
        for (const node of [oscillator, source, envelope]) {
          try { node?.disconnect(); } catch { /* An unavailable audio device must not interrupt play. */ }
        }
      };
      const cancel = (): void => {
        for (const node of [oscillator, source]) {
          try { node?.stop(); } catch { /* Already stopped or not started. */ }
        }
        clean();
      };
      active.add(cancel); cancellations.push(cancel);
      try {
        envelope = context.createGain();
        oscillator = context.createOscillator();
        oscillator.onended = clean;
        oscillator.type = cue.kind === 'hit' || cue.kind === 'fixed' ? 'square' : 'triangle';
        oscillator.frequency.setValueAtTime(sound.hz, at);
        oscillator.frequency.exponentialRampToValueAtTime(sound.endHz ?? sound.hz, end);
        envelope.gain.setValueAtTime(SILENCE, at);
        envelope.gain.exponentialRampToValueAtTime(sound.level ?? 0.3, at + 0.005);
        envelope.gain.exponentialRampToValueAtTime(SILENCE, end);
        envelope.connect(master);
        oscillator.connect(envelope);
        if (sound.noise) {
          if (!noise) {
            noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
            const samples = noise.getChannelData(0);
            for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
          }
          source = context.createBufferSource(); source.buffer = noise;
          source.connect(envelope); source.start(at); source.stop(end);
        }
        oscillator.start(at); oscillator.stop(end);
      } catch { cancel(); }
    }
    return () => { for (const cancel of cancellations) cancel(); };
  }
  return { unlock, play, stop,
    setEnabled(value: boolean): void { enabled = value; if (!value) stop(); },
  };
}
export const synth = createSynth();
