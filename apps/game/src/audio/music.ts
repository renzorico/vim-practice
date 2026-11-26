import { SCORES, arrangement, humanise, cadenceBeatSeconds, stepSeconds, type Score, type ScoreId, type ScoreNote, type ScoreVoice } from './score.js';
import { TEMPO_FACTOR, type Mood, type Pace } from './mood.js';
import { synth } from './synth.js';

/** Measured in the browser: at 0.30 the title peaked at -34 dBFS, under the footsteps by 10 dB; this sits just below them. */
export const MUSIC_LEVEL = 0.65;
/**
 * One track keeps about 24 nodes standing (a layer, a panner and a reverb send per voice), two do during a
 * crossfade, and a full phrase with the cadence needs some 40 more. At 48 the new stage began without its layers.
 */
export const MUSIC_NODE_CAP = 112;
const IDLE_MS = 20_000;
const IDLE_FADE = 3;
const MIX_FADE = 1.2;
const DANGER_FADE = 0.25;
const DANGER_HOLD_MS = 2000;
/** A root below this is not heard on a small speaker. */
const HEARTBEAT_LOWEST = 45;
const HEARTBEAT_GAP = 0.18;
/** At the start of a stage the place is still quiet (about -2.5 dB). */
const QUIET_START = 0.75;
/** Lifted while it carries the room by itself; at 2 the room after a stage was louder than the stage. */
const RESOLVED_PAD = 1.4;
const TICK_MS = 50;
const LOOK_AHEAD = 0.6;
const FADE_SECONDS = 1.5;
const START_DELAY = 0.03;
const HIDE_FADE = 0.3;
const RESUME_FADE = 0.6;
const STEAL_FADE = 0.01;
const PRESSURE_FADE = 0.15;
const KNOCK_DECAY = 0.06;
const KNOCK_HZ = 260;
/** A brush, not a thump: below this a small speaker plays nothing. */
const DRUM_HZ = 1100;
const ENVELOPE_FLOOR = 0.0001;
const FAILURE_WINDOW_MS = 60_000;
const MAX_FAILURES = 3;
const CADENCE_START_MAX_AGE_MS = 2000;
const CADENCE_RETRY_SECONDS = 1;
const CADENCE_CANCEL_SECONDS = 0.2;
interface AudioOutput { readonly context: AudioContext; readonly master: GainNode }
interface EventNote extends ScoreNote { readonly voice: ScoreVoice | null; readonly tick?: 'knock' }
interface Track {
  readonly score: Score;
  readonly pace: Pace;
  readonly extras: AudioNode[];
  readonly wet: GainNode;
  phrase: number;
  idle: boolean;
  readonly gain: GainNode;
  readonly events: readonly EventNote[];
  readonly layers: Map<ScoreVoice | null, GainNode>;
  cadenceGain: GainNode | null;
  cadence: { at: number; event: EventNote }[];
  cadenceBlockedAt: number | null;
  origin: number;
  cursor: number;
  waiting: boolean;
  retireAt: number | null;
}
interface LiveNote {
  readonly track: Track;
  readonly at: number;
  readonly plucked: boolean;
  readonly voice: ScoreVoice | null;
  readonly envelope: () => GainNode | null;
  readonly cadence: boolean;
  readonly nodes: number;
  end: number;
  fading: boolean;
  readonly fade: () => void;
  readonly cancel: () => void;
}
interface Ramp { readonly from: number; readonly to: number; readonly start: number; readonly end: number }

/** One timer per player; injected output reads the synth's already-unlocked context. */
export function createMusic(output: () => AudioOutput | null = () => synth.audio()) {
  let audio: AudioOutput | null = null;
  let bus: GainNode | null = null;
  let filter: BiquadFilterNode | null = null;
  let noise: AudioBuffer | null = null;
  let desired: ScoreId | null = null;
  let pace: Pace = 'steady';
  let mood: Mood = { energy: 1, danger: 0 };
  let requestedDanger: Mood['danger'] = 0;
  let dangerBelowAt: number | null = null;
  let lastKey = Date.now();
  let reverb: ConvolverNode | null = null;
  let preDelay: DelayNode | null = null;
  let heartbeatStep = -1;
  let canRest = false;
  let current: Track | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let enabled = true;
  let hidden = false;
  let disposed = false;
  let ducked = false;
  let level = 1;
  let resolved = false;
  let transition: { value: boolean; at: number; cadence: boolean; requestedAt: number; blockedAt: number | null } | null = null;
  let resumeBar = 0;
  let silenceAt: number | null = null;
  let failed = false;
  const failures: number[] = [];
  const ramps = new WeakMap<AudioParam, Ramp>();
  const tracks = new Set<Track>();
  const live = new Set<LiveNote>();
  const disconnect = (node: AudioNode | null): void => { try { node?.disconnect(); } catch { /* Device lost. */ } };
  function ramp(param: AudioParam, value: number, seconds: number, at?: number): void {
    if (!audio) return;
    const now = at ?? audio.context.currentTime;
    const running = ramps.get(param);
    const progress = running && now < running.end
      ? Math.max(0, (now - running.start) / (running.end - running.start)) : 1;
    const currentValue = running ? running.from + (running.to - running.from) * progress : param.value;
    if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
    else param.cancelScheduledValues(now);
    param.setValueAtTime(currentValue, now);
    param.linearRampToValueAtTime(value, now + seconds);
    ramps.set(param, { from: currentValue, to: value, start: now, end: now + seconds });
  }
  function remove(track: Track): void {
    for (const note of [...live]) if (note.track === track) note.cancel();
    disconnect(track.gain); disconnect(track.cadenceGain); disconnect(track.wet);
    for (const node of track.extras) disconnect(node);
    for (const layer of track.layers.values()) disconnect(layer);
    tracks.delete(track);
  }
  function reset(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
    for (const track of [...tracks]) remove(track);
    disconnect(bus); disconnect(filter); disconnect(reverb); disconnect(preDelay);
    reverb = null; preDelay = null;
    bus = null; filter = null; current = null; audio = null; noise = null; silenceAt = null;
  }
  function dispose(): void { disposed = true; reset(); }
  function safely(action: () => void): void {
    if (disposed) return;
    try { action(); } catch {
      failures.push(Date.now());
      failed = true;
      if (transition) transition.cadence = false;
      reset();
    }
  }
  function updateLevel(seconds: number): void {
    if (hidden && silenceAt !== null && audio) seconds = Math.max(0, Math.min(seconds, silenceAt - audio.context.currentTime));
    for (const track of tracks) if (track.cadenceGain && track.retireAt === null && resolved)
      ramp(track.cadenceGain.gain, enabled && !hidden ? MUSIC_LEVEL * level : 0, seconds);
    if (bus) ramp(bus.gain, enabled && !hidden ? MUSIC_LEVEL * level * (ducked ? 0.55 : 1) : 0, seconds);
  }
  function initialise(): boolean {
    if (audio) return audio.context.state === 'running';
    audio = output();
    if (!audio || audio.context.state !== 'running') { audio = null; return false; }
    bus = audio.context.createGain(); bus.gain.value = 0;
    filter = audio.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2200;
    bus.connect(filter); filter.connect(audio.master);
    const context = audio.context;
    if (typeof context.createConvolver === 'function' && typeof context.createDelay === 'function') {
      reverb = context.createConvolver();
      preDelay = context.createDelay(); preDelay.delayTime.value = 0.018;
      const impulse = context.createBuffer(2, Math.ceil(context.sampleRate * 1.9), context.sampleRate);
      let seed = 73471;
      for (let channel = 0; channel < 2; channel++) {
        const samples = impulse.getChannelData(channel);
        let smooth = 0;
        for (let index = 0; index < samples.length; index++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
          smooth += 0.22 * (seed / 2147483648 - 1 - smooth);
          samples[index] = smooth * Math.exp(-5 * index / samples.length);
        }
      }
      reverb.buffer = impulse; preDelay.connect(reverb); reverb.connect(bus);
    }
    updateLevel(0.3);
    return true;
  }
  function nodeCount(): number { return 2 + Number(reverb !== null) + Number(preDelay !== null) + [...tracks].reduce((sum, track) => sum + 2 + track.extras.length + track.layers.size + Number(track.cadenceGain !== null), 0) + [...live].reduce((sum, note) => sum + note.nodes, 0); }
  function reserve(count: number): boolean {
    if (nodeCount() + count <= MUSIC_NODE_CAP) return true;
    // Plucks give up their slots first. Keep the fading nodes counted until their stop time.
    const candidates = [...live].filter(note => !note.fading).sort((a, b) =>
      Number(b.plucked) - Number(a.plucked) || a.at - b.at);
    let freed = [...live].filter(note => note.fading).reduce((sum, note) => sum + note.nodes, 0);
    for (const note of candidates) {
      if (nodeCount() + count - freed <= MUSIC_NODE_CAP) break;
      note.fade(); freed += note.nodes;
    }
    // Rapid score changes also fill the cap with track buses. Retire those through a fade.
    if (nodeCount() + count - freed > MUSIC_NODE_CAP && audio) {
      for (const track of tracks) if (track !== current && track.retireAt !== null && track.retireAt > audio.context.currentTime + PRESSURE_FADE) {
        ramp(track.gain.gain, 0, PRESSURE_FADE);
        track.retireAt = Math.min(track.retireAt, audio.context.currentTime + PRESSURE_FADE);
      }
    }
    return false;
  }
  function start(): void {
    if (!audio || !bus || !desired || !enabled || hidden || audio.context.state !== 'running') return;
    const voiceCount = SCORES[desired].voices.length + 1;
    if (!reserve(2 + voiceCount * layerNodes())) return;
    const score = { ...SCORES[desired], bpm: SCORES[desired].bpm * TEMPO_FACTOR[pace] };
    const gain = audio.context.createGain();
    // Register ownership before connecting, so even a failed connection is disposed.
    const track: Track = { score, pace, wet: audio.context.createGain(), extras: [], phrase: -1, idle: false, gain, layers: new Map(), cadenceGain: null, cadence: [], cadenceBlockedAt: null, origin: audio.context.currentTime + START_DELAY,
      cursor: 0, waiting: false, retireAt: null, events: [
        ...score.voices.flatMap(voice => voice.notes.map(note => ({ ...note, voice }))),
        ...(score.ambience?.steps.map(step => ({ step, midi: 36, length: 0.12, voice: null })) ?? []),
      ].sort((left, right) => left.step - right.step) };
    tracks.add(track); current = track;
    gain.gain.value = 0; gain.connect(bus);
    track.wet.gain.value = 0; if (preDelay) track.wet.connect(preDelay);
    const mix = arrangement(score, 0, 0, mood, pace);
    for (const voice of voicesOf(track)) createLayer(track, voice, partGain(track, voice, mix));
    gain.gain.setValueAtTime(0, audio.context.currentTime);
    ramp(gain.gain, 1, FADE_SECONDS); ramp(track.wet.gain, 1, FADE_SECONDS);
    if (resolved) transition = { value: true, at: audio.context.currentTime,
      cadence: transition?.cadence === true && Date.now() - transition.requestedAt < CADENCE_START_MAX_AGE_MS,
      requestedAt: transition?.requestedAt ?? Date.now(), blockedAt: null };
  }
  function schedule(track: Track, event: EventNote, at: number, cadence = false, loop = 0): boolean {
    if (!cadence && event.melodyRestOnly && arrangement(track.score, Math.floor(event.step / track.score.steps), loop, mood, track.pace).melody > 0) return true;
    const variation = humanise(track.score, loop, event.step);
    if (!cadence && audio) at = Math.max(audio.context.currentTime, at + variation.offset);
    const isKnock = event.tick === 'knock' || (event.voice && 'tick' in event.voice && event.voice.tick === 'knock');
    const voice = isKnock ? null : event.voice;
    const layer = track.layers.get(event.voice);
    const mix = layer ? ramps.get(layer.gain) : undefined;
    const audibleAgain = transition?.value === false ? transition.at : Infinity;
    if (!cadence && resolved && mix?.to === 0 && at >= mix.end && at < audibleAgain) return true;
    if (!audio || !reserve(voice ? 2 : 3)) return false;
    const { context } = audio;
    let envelope: GainNode | null = null;
    let knockFilter: BiquadFilterNode | null = null;
    let source: OscillatorNode | AudioBufferSourceNode | null = null;
    let cleaned = false;
    const duration = voice ? event.length * stepSeconds(track.score) : 0.003;
    const release = voice ? voice.releaseMs / 1000 : KNOCK_DECAY;
    const offbeat = event.voice?.part === 'drum' && event.step % track.score.stepsPerBeat !== 0;
    const peak = Math.min(0.24, (event.voice?.level ?? track.score.ambience?.level ?? 0) * (cadence ? 1 : variation.level) * (!cadence && event.voice?.part === 'melody' && loop % 4 === 1 ? 0.85 : 1) * (offbeat ? 0.45 : 1));
    const attack = Math.min(duration / 2, (voice?.attackMs ?? 3) / 1000);
    const sustain = voice?.sustain === true;
    const tail = sustain ? peak : peak * 0.3;
    const valueAt = (time: number): number => {
      if (time <= at) return 0;
      if (time < at + attack) return peak * (time - at) / attack;
      if (time < at + duration) return sustain ? peak : peak * 0.3 ** ((time - at - attack) / (duration - attack));
      return tail * (ENVELOPE_FLOOR / tail) ** Math.min(1, (time - at - duration) / release);
    };
    const end = at + duration + release;
    const clean = (): void => {
      if (cleaned) return;
      cleaned = true;
      live.delete(entry); disconnect(source); disconnect(envelope); disconnect(knockFilter);
    };
    const entry: LiveNote = { track, at, end, voice: event.voice, envelope: () => envelope, cadence, plucked: !sustain, nodes: voice ? 2 : 3, fading: false,
      fade: () => {
        if (!audio || !envelope) return;
        const now = audio.context.currentTime;
        entry.fading = true; entry.end = now + STEAL_FADE;
        const param = envelope.gain;
        param.cancelScheduledValues(now);
        param.setValueAtTime(valueAt(now), now);
        param.linearRampToValueAtTime(0, entry.end);
        source?.stop(entry.end);
      }, cancel: () => {
      try { source?.stop(); } catch { /* Already ended. */ }
      clean();
    } };
    live.add(entry);
    try {
      envelope = context.createGain();
      envelope.connect(cadence ? track.cadenceGain ?? track.gain : track.layers.get(event.voice) ?? track.gain);
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(peak, at + attack);
      if (sustain) envelope.gain.setValueAtTime(peak, at + duration);
      else envelope.gain.exponentialRampToValueAtTime(tail, at + duration);
      envelope.gain.exponentialRampToValueAtTime(ENVELOPE_FLOOR, end);
      if (voice) {
        const oscillator = context.createOscillator(); source = oscillator;
        oscillator.type = !cadence && voice.part === 'melody' && loop % 4 === 1 ? track.score.voices.find(part => part.part === 'counter')?.wave ?? 'sine' : voice.wave;
        oscillator.frequency.setValueAtTime(440 * 2 ** ((event.midi - 69) / 12), at);
      } else {
        if (!noise) {
          noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.1), context.sampleRate);
          const samples = noise.getChannelData(0);
          let seed = 12345;
          for (let index = 0; index < samples.length; index++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; samples[index] = seed / 2147483648 - 1; }
        }
        const knock = context.createBufferSource(); source = knock; knock.buffer = noise;
        knockFilter = context.createBiquadFilter(); knockFilter.type = 'lowpass';
        knockFilter.frequency.setValueAtTime(event.voice ? DRUM_HZ : KNOCK_HZ, at);
        knock.connect(knockFilter); knockFilter.connect(envelope);
      }
      source.onended = clean;
      if (voice) source.connect(envelope);
      source.start(at); source.stop(end);
      return true;
    } catch (error) { entry.cancel(); throw error; }
  }
  const voicesOf = (track: Track): readonly (ScoreVoice | null)[] => track.score.ambience ? [...track.score.voices, null] : track.score.voices;
  const layerNodes = (): number => 1 + Number(typeof audio?.context.createStereoPanner === 'function') + Number(preDelay !== null);
  function partGain(track: Track, voice: ScoreVoice | null, mix: ReturnType<typeof arrangement>): number {
    const part = voice?.part ?? 'drum';
    const level = voice ? mix[part] : mood.danger ? 0 : 1;
    return (track.idle && (part === 'melody' || part === 'counter') ? 0 : level) * (mood.energy === 0 && !mood.danger ? QUIET_START : 1);
  }
  function createLayer(track: Track, voice: ScoreVoice | null, gain: number): void {
    if (!audio) return;
    const context = audio.context;
    const layer = context.createGain();
    track.layers.set(voice, layer); layer.gain.value = gain;
    let dry: AudioNode = layer;
    if (typeof context.createStereoPanner === 'function') {
      const pan = context.createStereoPanner(); track.extras.push(pan);
      pan.pan.value = { melody: -0.12, counter: 0.3, pulse: 0, bed: 0, drum: 0.2 }[voice?.part ?? 'drum'];
      layer.connect(pan); dry = pan;
    }
    dry.connect(track.gain);
    if (preDelay) {
      const send = context.createGain(); track.extras.push(send);
      send.gain.value = { bed: 0.35, melody: 0.28, counter: 0.35, pulse: 0.1, drum: 0.15 }[voice?.part ?? 'drum'];
      dry.connect(send); send.connect(track.wet);
    }
  }
  /** `at` in the future schedules the change; without it the change starts now and the coming phrase is asked again. */
  function applyArrangement(track: Track, bar: number, loop: number, seconds = MIX_FADE, at?: number): void {
    if (!audio || resolved || transition) return;
    const mix = arrangement(track.score, bar, loop, mood, track.pace);
    for (const [voice, layer] of track.layers) {
      if (!(track.idle && (voice?.part === 'melody' || voice?.part === 'counter'))) ramp(layer.gain, partGain(track, voice, mix), seconds, at);
    }
    if (filter) ramp(filter.frequency, mix.filter, seconds, at);
  }
  const barNow = (track: Track, now: number): number =>
    Math.max(0, (now - track.origin) / stepSeconds(track.score) / track.score.steps);
  function applyNow(track: Track, now: number, seconds: number): void {
    const bar = Math.floor(barNow(track, now));
    track.phrase = Math.floor(bar / 8);
    applyArrangement(track, bar % track.score.bars, Math.floor(bar / track.score.bars), seconds);
  }
  function applyResolution(track: Track, change: NonNullable<typeof transition>): boolean {
    if (!audio || !filter) return false;
    const at = Math.max(change.at, audio.context.currentTime);
    if (!reserve(Number(change.cadence && !track.cadenceGain))) return false;
    const bar = Math.floor(barNow(track, at));
    const mix = arrangement(track.score, bar % track.score.bars, Math.floor(bar / track.score.bars), mood, track.pace);
    const quietest = track.score.voices.reduce<ScoreVoice | null>((best, voice) =>
      !best || voice.level < best.level ? voice : best, null);
    const hasPad = track.score.voices.some(voice => voice.sustain);
    for (const [voice, layer] of track.layers) {
      const target = !change.value ? partGain(track, voice, mix) : voice?.sustain ? RESOLVED_PAD : !hasPad && voice === quietest ? 0.5 : 0;
      ramp(layer.gain, target, change.value ? 0.3 : 0.6, at);
    }
    ramp(filter.frequency, change.value ? 3400 : mix.filter, 1, at);
    if (change.cadence) {
      if (!track.cadenceGain) {
        track.cadenceGain = audio.context.createGain();
        track.cadenceGain.gain.value = MUSIC_LEVEL * level;
        track.cadenceGain.connect(filter);
      }
      ramp(track.cadenceGain.gain, MUSIC_LEVEL * level, 0.02, at);
      track.cadenceBlockedAt = null;
      const beat = cadenceBeatSeconds(track.score);
      const seconds = stepSeconds(track.score);
      const bell: ScoreVoice = { part: 'melody', wave: 'sine', level: 0.17, attackMs: 6, releaseMs: 900, notes: [] };
      const pad: ScoreVoice = { part: 'bed', wave: 'triangle', level: 0.06, attackMs: 60, releaseMs: 1500, sustain: true, notes: [] };
      track.cadence = track.score.cadence.figure.flatMap(([offset, midi, length]) => [
        { at: at + offset * beat, event: { step: 0, midi, length: length * beat / seconds, voice: bell } },
        { at: at + offset * beat, event: { step: 0, midi: midi + 12, length: length * beat / seconds,
          voice: { ...bell, level: 0.04 } } },
      ]);
      track.cadence.push(...track.score.cadence.chord.map(midi => ({ at: at + 4 * beat,
        event: { step: 0, midi, length: track.score.cadence.chordBeats * 60 / track.score.bpm / seconds, voice: pad } })));
    }
    return true;
  }
  function tick(): void {
    safely(() => {
      if (failed) return;
      if (enabled && !hidden && desired) initialise();
      if (!audio) return;
      const now = audio.context.currentTime;
      if (silenceAt !== null && now >= silenceAt) {
        for (const note of [...live]) note.cancel();
        silenceAt = null;
      }
      for (const note of [...live]) if (note.end <= now) note.cancel();
      for (const track of [...tracks]) if (track.retireAt !== null && track.retireAt <= now) remove(track);
      if (enabled && !hidden && desired && !current) start();
      if (!current || hidden || !enabled || audio.context.state !== 'running') return;
      const track = current;
      if (requestedDanger < mood.danger && dangerBelowAt !== null && Date.now() - dangerBelowAt >= DANGER_HOLD_MS) {
        mood = { ...mood, danger: requestedDanger }; dangerBelowAt = null;
        applyNow(track, now, MIX_FADE);
      }
      if (canRest && !track.idle && !resolved && !transition && Date.now() - lastKey >= IDLE_MS) {
        track.idle = true;
        for (const [voice, layer] of track.layers) if (voice?.part === 'melody' || voice?.part === 'counter') ramp(layer.gain, 0, IDLE_FADE);
      }
      if (transition && transition.at < now + LOOK_AHEAD) {
        if (transition.blockedAt !== null && now - transition.blockedAt >= CADENCE_RETRY_SECONDS)
          transition.cadence = false;
        if (applyResolution(track, transition)) transition = null;
        else {
          transition.blockedAt ??= now;
        }
      }
      if (track.cadenceBlockedAt !== null && now - track.cadenceBlockedAt >= CADENCE_RETRY_SECONDS)
        track.cadence = [];
      while (track.cadence.length && track.cadence[0]!.at < now + LOOK_AHEAD) {
        const at = track.cadence[0]!.at;
        const group = track.cadence.filter(note => note.at === at);
        if (!reserve(group.length * 2)) {
          track.cadenceBlockedAt ??= now;
          break;
        }
        track.cadenceBlockedAt = null;
        for (const note of group) schedule(track, note.event, Math.max(now, note.at), true);
        track.cadence.splice(0, group.length);
      }
      const totalSteps = track.score.steps * track.score.bars;
      const seconds = stepSeconds(track.score);
      if (mood.danger && !resolved) {
        const beat = seconds * track.score.stepsPerBeat;
        const root = track.score.cadence.chord[0] ?? 48;
        const midi = root < HEARTBEAT_LOWEST ? root + 12 : root;
        for (let index = Math.max(heartbeatStep + 1, Math.ceil((now - track.origin) / beat)); track.origin + index * beat < now + LOOK_AHEAD; index++) {
          heartbeatStep = index;
          if (mood.danger === 1 && index % 2 !== 0) continue;
          const voice: ScoreVoice = { part: 'pulse', wave: 'triangle', level: 0.24, attackMs: 25, releaseMs: 180, notes: [] };
          const event: EventNote = { step: index * track.score.stepsPerBeat, midi, length: 0.15 / seconds, voice };
          schedule(track, event, track.origin + index * beat, true);
          schedule(track, { ...event, voice: { ...voice, level: 0.16 } }, track.origin + index * beat + HEARTBEAT_GAP, true);
        }
      }
      // Cursor is an absolute event index, so no note is scheduled twice across loop boundaries.
      while (track.events.length > 0) {
        const event = track.events[track.cursor % track.events.length]!;
        const loop = Math.floor(track.cursor / track.events.length);
        const at = track.origin + (loop * totalSteps + event.step) * seconds;
        if (at >= now + LOOK_AHEAD) break;
        const phrase = Math.floor((loop * totalSteps + event.step) / (track.score.steps * 8));
        if (phrase !== track.phrase) {
          track.phrase = phrase;
          if (Date.now() - lastKey < IDLE_MS) track.idle = false;
          const boundary = track.origin + phrase * track.score.steps * 8 * seconds;
          applyArrangement(track, Math.floor(event.step / track.score.steps), loop, MIX_FADE, Math.max(now, boundary));
        }
        if (at >= now || track.waiting) {
          if (event.voice?.part === 'drum' && (arrangement(track.score, Math.floor(event.step / track.score.steps), loop, mood, track.pace).drum === 0
            || track.pace === 'steady' && event.step % (track.score.steps * 2) !== track.score.stepsPerBeat)) { track.cursor++; continue; }
          if (!schedule(track, event, Math.max(now, at), false, loop)) { track.waiting = true; break; }
          track.waiting = false;
        }
        track.cursor++;
      }
    });
  }
  function retire(seconds: number): void {
    if (current && audio) {
      ramp(current.gain.gain, 0, seconds); ramp(current.wet.gain, 0, seconds);
      if (current.cadenceGain) ramp(current.cadenceGain.gain, 0, seconds);
      current.cadence = [];
      current.retireAt = audio.context.currentTime + seconds;
      current = null;
    }
  }
  return {
    activity(): void {
      safely(() => {
        lastKey = Date.now();
        if (!audio || !current?.idle) return;
        const phraseSeconds = current.score.steps * 8 * stepSeconds(current.score);
        const phrase = Math.ceil(Math.max(0, audio.context.currentTime - current.origin) / phraseSeconds);
        // Lookahead may already have scheduled this boundary while the visitor was resting.
        if (phrase === current.phrase) {
          current.idle = false;
          const absoluteBar = phrase * 8;
          applyArrangement(current, absoluteBar % current.score.bars, Math.floor(absoluteBar / current.score.bars),
            MIX_FADE, current.origin + phrase * phraseSeconds);
        }
      });
    },
    /** `resting`: the player may stop to think here, and then the melody does too. */
    setMood(value: Mood, resting = true): void {
      safely(() => {
        const rising = value.danger > mood.danger;
        const step = value.energy !== mood.energy;
        canRest = resting;
        if (value.danger < mood.danger) {
          if (dangerBelowAt === null || value.danger !== requestedDanger) dangerBelowAt = Date.now();
        } else dangerBelowAt = null;
        requestedDanger = value.danger;
        mood = { energy: value.energy, danger: rising ? value.danger : mood.danger };
        if (!current || !audio) return;
        if (rising) applyNow(current, audio.context.currentTime, DANGER_FADE);
        else if (step) {
          // A step of the quest is heard at the next bar, not at the next phrase: it answers what the player did.
          const bar = Math.ceil(barNow(current, audio.context.currentTime));
          applyArrangement(current, bar % current.score.bars, Math.floor(bar / current.score.bars), MIX_FADE,
            current.origin + bar * current.score.steps * stepSeconds(current.score));
        }
      });
    },
    setScore(id: ScoreId | null, fadeSeconds = FADE_SECONDS, nextPace: Pace = 'steady'): void {
      safely(() => {
        if (failed) {
          while (failures.length && failures[0]! <= Date.now() - FAILURE_WINDOW_MS) failures.shift();
          if (failures.length >= MAX_FAILURES) return;
          failed = false;
        } else if (desired === id && pace === nextPace && (current || id === null)) return;
        if (desired !== id) { resolved = false; transition = null; if (filter) ramp(filter.frequency, 2200, 1); }
        desired = id; pace = nextPace; heartbeatStep = -1; retire(fadeSeconds);
        if (timer === null) timer = setInterval(tick, TICK_MS);
        tick();
      });
    },
    setResolved(value: boolean, options: { readonly cadence?: boolean } = {}): boolean {
      let scheduled = false;
      safely(() => {
        if (resolved === value) return;
        resolved = value;
        const now = audio?.context.currentTime ?? 0;
        if (!value) for (const track of tracks) {
          track.cadence = [];
          track.cadenceBlockedAt = null;
          if (track.cadenceGain) ramp(track.cadenceGain.gain, 0, CADENCE_CANCEL_SECONDS);
        }
        const unit = current ? stepSeconds(current.score) * (value ? current.score.stepsPerBeat : current.score.steps) : 0;
        const at = current && unit ? current.origin + Math.ceil(Math.max(0, now - current.origin) / unit) * unit : now;
        scheduled = value && options.cadence !== false && !failed && !hidden && enabled && desired !== null
          && !!audio && audio.context.state === 'running';
        transition = { value, at: hidden || !enabled ? now : at, cadence: scheduled,
          requestedAt: Date.now(), blockedAt: null };
        tick();
      });
      return scheduled && !failed && !disposed;
    },
    setEnabled(value: boolean): void {
      safely(() => {
        if (enabled === value) return;
        enabled = value;
        if (!value) { retire(0.2); updateLevel(0.2); }
        else { updateLevel(0.3); tick(); }
      });
    },
    duck(on: boolean): void { safely(() => { if (ducked !== on) { ducked = on; updateLevel(on ? 0.3 : 0.8); } }); },
    setLevel(value: number): void { safely(() => { if (level !== value) { level = value; updateLevel(0.3); } }); },
    setHidden(value: boolean): void {
      safely(() => {
        if (hidden === value) return;
        hidden = value;
        if (value) {
          if (transition) transition = { ...transition, cadence: false };
          for (const track of tracks) track.cadence = [];
        }
        const now = audio?.context.currentTime ?? 0;
        const resumeEarly = !value && silenceAt !== null && now < silenceAt;
        if (!value && !resumeEarly) {
          for (const note of [...live]) note.cancel(); // The hide fade has reached zero.
        }
        if (current && audio) {
          const track = current;
          const seconds = stepSeconds(track.score);
          if (value) {
            resumeBar = Math.ceil(Math.max(0, now - track.origin) / seconds / track.score.steps);
          } else if (!resumeEarly) {
            track.origin = now + START_DELAY - resumeBar * track.score.steps * seconds;
            const step = resumeBar * track.score.steps;
            const loop = Math.floor(step / (track.score.bars * track.score.steps));
            const index = track.events.findIndex(event => event.step >= step % (track.score.bars * track.score.steps));
            track.cursor = loop * track.events.length + (index < 0 ? track.events.length : index);
            track.waiting = false;
          }
        }
        silenceAt = value ? now + HIDE_FADE : null;
        updateLevel(value ? HIDE_FADE : RESUME_FADE); tick();
      });
    },
    tick, dispose,
  };
}
