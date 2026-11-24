import { SCORES, stepSeconds, type Score, type ScoreId, type ScoreVoice } from './score.js';
import { synth } from './synth.js';

/** Measured in the browser: at 0.30 the title peaked at -34 dBFS, under the footsteps by 10 dB; this sits just below them. */
export const MUSIC_LEVEL = 0.65;
export const MUSIC_NODE_CAP = 24;
const TICK_MS = 50;
const LOOK_AHEAD = 0.6;
const FADE_SECONDS = 1.5;
const START_DELAY = 0.03;
const HIDE_FADE = 0.3;
const RESUME_FADE = 0.6;
const STEAL_FADE = 0.01;
const PRESSURE_FADE = 0.15;
const KNOCK_DECAY = 0.06;
const ENVELOPE_FLOOR = 0.0001;
const FAILURE_WINDOW_MS = 60_000;
const MAX_FAILURES = 3;
interface AudioOutput { readonly context: AudioContext; readonly master: GainNode }
interface EventNote { readonly step: number; readonly midi: number; readonly length: number; readonly voice: ScoreVoice | null; readonly tick?: 'knock' }
interface Track {
  readonly score: Score;
  readonly gain: GainNode;
  readonly events: readonly EventNote[];
  origin: number;
  cursor: number;
  waiting: boolean;
  retireAt: number | null;
}
interface LiveNote {
  readonly track: Track;
  readonly at: number;
  readonly plucked: boolean;
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
  let current: Track | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let enabled = true;
  let hidden = false;
  let disposed = false;
  let ducked = false;
  let level = 1;
  let resumeBar = 0;
  let silenceAt: number | null = null;
  let failed = false;
  const failures: number[] = [];
  const ramps = new WeakMap<AudioParam, Ramp>();
  const tracks = new Set<Track>();
  const live = new Set<LiveNote>();
  const disconnect = (node: AudioNode | null): void => { try { node?.disconnect(); } catch { /* Device lost. */ } };
  function ramp(param: AudioParam, value: number, seconds: number): void {
    if (!audio) return;
    const now = audio.context.currentTime;
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
    disconnect(track.gain); tracks.delete(track);
  }
  function reset(): void {
    if (timer !== null) clearInterval(timer);
    timer = null;
    for (const track of [...tracks]) remove(track);
    disconnect(bus); disconnect(filter);
    bus = null; filter = null; current = null; audio = null; noise = null; silenceAt = null;
  }
  function dispose(): void { disposed = true; reset(); }
  function safely(action: () => void): void {
    if (disposed) return;
    try { action(); } catch {
      failures.push(Date.now());
      failed = true;
      reset();
    }
  }
  function updateLevel(seconds: number): void {
    if (hidden && silenceAt !== null && audio) seconds = Math.max(0, Math.min(seconds, silenceAt - audio.context.currentTime));
    if (bus) ramp(bus.gain, enabled && !hidden ? MUSIC_LEVEL * level * (ducked ? 0.55 : 1) : 0, seconds);
  }
  function initialise(): boolean {
    if (audio) return audio.context.state === 'running';
    audio = output();
    if (!audio) return false;
    bus = audio.context.createGain(); bus.gain.value = 0;
    filter = audio.context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 2200;
    bus.connect(filter); filter.connect(audio.master);
    updateLevel(0.3);
    return true;
  }
  function nodeCount(): number { return 2 + tracks.size + [...live].reduce((sum, note) => sum + note.nodes, 0); }
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
    if (!audio || !bus || !desired || !enabled || hidden || audio.context.state !== 'running' || !reserve(4)) return;
    const score = SCORES[desired];
    const gain = audio.context.createGain();
    // Register ownership before connecting, so even a failed connection is disposed.
    const track: Track = { score, gain, origin: audio.context.currentTime + START_DELAY,
      cursor: 0, waiting: false, retireAt: null, events: [
        ...score.voices.flatMap(voice => voice.notes.map(note => ({ ...note, voice }))),
        ...(score.ambience?.steps.map(step => ({ step, midi: 36, length: 0.12, voice: null })) ?? []),
      ].sort((left, right) => left.step - right.step) };
    tracks.add(track); current = track;
    gain.gain.value = 0; gain.connect(bus);
    gain.gain.setValueAtTime(0, audio.context.currentTime);
    ramp(gain.gain, 1, FADE_SECONDS);
  }
  function schedule(track: Track, event: EventNote, at: number): boolean {
    const isKnock = event.tick === 'knock' || (event.voice && 'tick' in event.voice && event.voice.tick === 'knock');
    const voice = isKnock ? null : event.voice;
    if (!audio || !reserve(voice ? 2 : 3)) return false;
    const { context } = audio;
    let envelope: GainNode | null = null;
    let knockFilter: BiquadFilterNode | null = null;
    let source: OscillatorNode | AudioBufferSourceNode | null = null;
    let cleaned = false;
    const duration = voice ? event.length * stepSeconds(track.score) : 0.003;
    const release = voice ? voice.releaseMs / 1000 : KNOCK_DECAY;
    const peak = event.voice?.level ?? track.score.ambience?.level ?? 0;
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
    const entry: LiveNote = { track, at, end, plucked: !sustain, nodes: voice ? 2 : 3, fading: false,
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
      envelope = context.createGain(); envelope.connect(track.gain);
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(peak, at + attack);
      if (sustain) envelope.gain.setValueAtTime(peak, at + duration);
      else envelope.gain.exponentialRampToValueAtTime(tail, at + duration);
      envelope.gain.exponentialRampToValueAtTime(ENVELOPE_FLOOR, end);
      if (voice) {
        const oscillator = context.createOscillator(); source = oscillator;
        oscillator.type = voice.wave;
        oscillator.frequency.setValueAtTime(440 * 2 ** ((event.midi - 69) / 12), at);
      } else {
        if (!noise) {
          noise = context.createBuffer(1, Math.ceil(context.sampleRate * 0.1), context.sampleRate);
          const samples = noise.getChannelData(0);
          for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
        }
        const knock = context.createBufferSource(); source = knock; knock.buffer = noise;
        knockFilter = context.createBiquadFilter(); knockFilter.type = 'lowpass';
        knockFilter.frequency.setValueAtTime(260, at);
        knock.connect(knockFilter); knockFilter.connect(envelope);
      }
      source.onended = clean;
      if (voice) source.connect(envelope);
      source.start(at); source.stop(end);
      return true;
    } catch (error) { entry.cancel(); throw error; }
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
      const totalSteps = track.score.steps * track.score.bars;
      const seconds = stepSeconds(track.score);
      // Cursor is an absolute event index, so no note is scheduled twice across loop boundaries.
      while (track.events.length > 0) {
        const event = track.events[track.cursor % track.events.length]!;
        const loop = Math.floor(track.cursor / track.events.length);
        const at = track.origin + (loop * totalSteps + event.step) * seconds;
        if (at >= now + LOOK_AHEAD) break;
        if (at >= now || track.waiting) {
          if (!schedule(track, event, Math.max(now, at))) { track.waiting = true; break; }
          track.waiting = false;
        }
        track.cursor++;
      }
    });
  }
  function retire(seconds: number): void {
    if (current && audio) {
      ramp(current.gain.gain, 0, seconds);
      current.retireAt = audio.context.currentTime + seconds;
      current = null;
    }
  }
  return {
    setScore(id: ScoreId | null, fadeSeconds = FADE_SECONDS): void {
      safely(() => {
        if (failed) {
          while (failures.length && failures[0]! <= Date.now() - FAILURE_WINDOW_MS) failures.shift();
          if (failures.length >= MAX_FAILURES) return;
          failed = false;
        } else if (desired === id && (current || id === null)) return;
        desired = id; retire(fadeSeconds);
        if (timer === null) timer = setInterval(tick, TICK_MS);
        tick();
      });
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
