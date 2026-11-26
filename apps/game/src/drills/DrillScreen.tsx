import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createEngine, type EngineState, type Key } from '@escape/engine';
import {
  applySetResult, buildDrillSet, continueDrill, drillSkill, giveUpRep, repStartState, scoreSet, startDrill, stepDrill,
  type DrillRep, type DrillState, type RepResult, type SkillId,
} from '@escape/curriculum';
import { Buffer } from '../ui/Buffer.js';
import { useReplay } from '../ui/useReplay.js';
import { useKeyCapture } from '../input/useKeyCapture.js';
import { nextSeed, type DrillProgress } from './store.js';
import { focusedButton } from './focusedButton.js';
import './drills.css';

const engine = createEngine();
const SHOWN_MODES: ReadonlySet<string> = new Set(['insert', 'visual', 'visual-line', 'visual-block']);
const RESULT_MARK: Readonly<Record<RepResult, string>> = { clean: 'clean', done: 'over par', missed: 'missed' };
const MAX_BOX = 5;

/** How a key reads on screen: a space is visible, everything else is Vim notation. */
export function keyLabel(key: Key): string {
  return key === ' ' ? '␣' : key;
}

function solutionFrames(rep: DrillRep): EngineState[] {
  let state = repStartState(rep);
  const frames = [state];
  const options = rep.level.allowedCommands === undefined ? undefined : { allowedCommands: rep.level.allowedCommands };
  for (const key of rep.level.solution) {
    state = engine.step(state, key, options).state;
    frames.push(state);
  }
  return frames;
}

function KeyRow({ keys, label }: { readonly keys: readonly Key[]; readonly label: string }) {
  return <span className="drill-keys" aria-label={`${label}: ${keys.join(' ')}`}>
    {keys.map((key, index) => <kbd className="learned-key" key={index}>{keyLabel(key)}</kbd>)}
  </span>;
}

export function BoxDots({ box }: { readonly box: number }) {
  return <span className="drill-box" aria-label={`Box ${box} of ${MAX_BOX}`}>
    {Array.from({ length: MAX_BOX }, (_, index) => <span key={index} data-filled={index < box} />)}
  </span>;
}

function Target({ rep, engineState }: { readonly rep: DrillRep; readonly engineState: EngineState }) {
  const goal = rep.level.goals[0];
  if (goal?.type !== 'transform') return null;
  return <aside className="script-target" aria-label="Target text">
    <h3>Make it read:</h3>
    <ol>{goal.targetLines.map((line, index) => {
      const matches = engineState.lines[index] === line;
      return <li key={index} data-matched={matches}>
        <span className="script-tick" aria-label={matches ? 'Line matches' : 'Line needs editing'}>
          {matches && <svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>}
        </span><span>{line === '' ? ' ' : line}</span>
      </li>;
    })}</ol>
  </aside>;
}

function Replay({ rep, onContinue }: { readonly rep: DrillRep; readonly onContinue: () => void }) {
  const frames = useMemo(() => solutionFrames(rep), [rep]);
  const { index, playing, reduced, replay } = useReplay(frames.length, frames);
  const frame = frames[index] ?? frames[0];
  if (frame === undefined) return null;
  const goal = rep.level.goals[0];
  return <>
    <p className="script-goal">Watch the par route, then try once more.</p>
    <div className="script-columns">
      <div className="script-editor">
        <Buffer state={frame} {...(goal?.type === 'reach' ? { target: goal.target } : {})} />
        <p className="drill-replay-key">Par route: <KeyRow keys={rep.level.solution} label="Par keys" /> · key {index} of {rep.level.solution.length}</p>
      </div>
      <Target rep={rep} engineState={frame} />
    </div>
    <div className="drill-actions">
      <button onClick={replay} disabled={playing}>{reduced ? 'Next key' : 'Watch again'}</button>
      <button autoFocus onClick={onContinue}><kbd>Enter</kbd> try it</button>
    </div>
  </>;
}

interface DrillScreenProps {
  /** Skills to drill, one set each, in order. */
  readonly skills: readonly SkillId[];
  readonly progress: DrillProgress;
  readonly onProgress: (progress: DrillProgress) => void;
  readonly onExit: () => void;
  /** Where Leave goes: "Back to the stage" or "Back to the Copybook". */
  readonly exitLabel: string;
  /** The app's clock, injected so the drill logic stays pure. */
  readonly now: () => string;
}

export function DrillScreen({ skills, progress, onProgress, onExit, exitLabel, now }: DrillScreenProps) {
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const begin = useCallback((skill: SkillId): DrillState => {
    const seed = nextSeed(progressRef.current, skill);
    const next = { ...progressRef.current, seeds: { ...progressRef.current.seeds, [skill]: seed + 1 } };
    progressRef.current = next;
    onProgress(next);
    return startDrill(buildDrillSet(skill, seed));
  }, [onProgress]);
  const [position, setPosition] = useState(0);
  const [drill, setDrillState] = useState<DrillState | null>(null);
  // The latest drill, read by key handlers; side effects (saving mastery) never run inside a state updater.
  const drillRef = useRef<DrillState | null>(null);
  const setDrill = useCallback((next: DrillState) => { drillRef.current = next; setDrillState(next); }, []);
  const firstSkill = skills[0];
  // StrictMode runs effects twice in development; one opened set must reserve one seed.
  const begunFor = useRef<SkillId | null>(null);
  useEffect(() => {
    if (firstSkill === undefined || begunFor.current === firstSkill) return;
    begunFor.current = firstSkill;
    setDrill(begin(firstSkill));
  }, [firstSkill, begin, setDrill]);

  const finish = useCallback((state: DrillState) => {
    const { passed } = scoreSet(state.results);
    const skill = state.set.skill;
    const mastery = applySetResult(progressRef.current.mastery[skill], skill, passed, now());
    const next = { ...progressRef.current, mastery: { ...progressRef.current.mastery, [skill]: mastery } };
    progressRef.current = next;
    onProgress(next);
  }, [now, onProgress]);

  /** Every change to the drill goes through here, so any path into 'finished' saves mastery exactly once. */
  const transition = useCallback((step: (state: DrillState) => DrillState) => {
    const current = drillRef.current;
    if (current === null) return;
    const next = step(current);
    if (next.phase === 'finished' && current.phase !== 'finished') finish(next);
    setDrill(next);
  }, [finish, setDrill]);
  const onKey = useCallback((key: Key) => transition(state => stepDrill(state, key)), [transition]);
  const giveUp = useCallback(() => transition(giveUpRep), [transition]);
  const retry = useCallback(() => transition(continueDrill), [transition]);
  const again = useCallback(() => { if (drillRef.current) setDrill(begin(drillRef.current.set.skill)); }, [begin, setDrill]);
  // Take focus from whatever was under the drill (the clear card's Continue), so Enter cannot press it.
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => { mainRef.current?.focus(); }, []);
  const nextSkill = skills[position + 1];
  const advance = useCallback(() => {
    if (nextSkill === undefined) { onExit(); return; }
    setPosition(value => value + 1);
    setDrill(begin(nextSkill));
  }, [nextSkill, begin, onExit, setDrill]);

  const playing = drill?.phase === 'playing';
  useKeyCapture({ onKey, onHint: () => {}, captureTab: true, enabled: playing });
  useEffect(() => {
    if (playing) return undefined;
    const listen = (event: KeyboardEvent): void => {
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Escape' || event.key === 'q') { event.preventDefault(); onExit(); }
      else if (event.key === 'Enter') { if (focusedButton(event)) return; event.preventDefault(); if (drill?.phase === 'replay') retry(); else advance(); }
      else if (event.key === 'r' && drill?.phase === 'finished') { event.preventDefault(); again(); }
    };
    window.addEventListener('keydown', listen);
    return () => window.removeEventListener('keydown', listen);
  }, [playing, drill?.phase, onExit, retry, advance, again]);

  if (drill === null) return null;
  const skill = drillSkill(drill.set.skill);
  const rep = drill.set.reps[drill.index];
  if (skill === undefined || rep === undefined) return null;
  const goal = rep.level.goals[0];
  const repSkill = drillSkill(rep.skill);
  const score = scoreSet(drill.results);
  const box = progress.mastery[skill.id]?.box ?? 0;

  return <main ref={mainRef} tabIndex={-1} className="script-panel drill copybook-desk" aria-label={`Copybook: ${skill.name}`}>
    <article className="copybook-page copybook-page--drill">
    <header className="copybook-head drill-heading">
      <div>
        <p className="copybook-kicker">The Copybook</p>
        <h1>{skill.name}</h1>
      </div>
      <span className="copybook-keys copybook-keys--large" aria-label={`Keys: ${skill.keys.join(' ')}`}>
        {skill.keys.map(key => <kbd key={key}>{keyLabel(key)}</kbd>)}
      </span>
      <div className="drill-progress">
        <span>{drill.phase === 'finished' ? 'Set done' : `Rep ${drill.index + 1} of ${drill.set.reps.length}`}</span>
        <ol className="drill-results" aria-label="Reps">
          {drill.set.reps.map((_, index) => {
            const result = drill.results[index];
            return <li key={index} data-result={result ?? (index === drill.index ? 'current' : 'todo')}
              aria-label={result === undefined ? `Rep ${index + 1}` : `Rep ${index + 1}: ${RESULT_MARK[result]}`} />;
          })}
        </ol>
      </div>
    </header>

    {drill.phase === 'finished' ? <section className="drill-summary" role="status">
      <h2>{score.passed ? 'Set passed.' : 'Not yet.'}</h2>
      <p>{score.clean} clean · {score.done} over par · {score.missed} missed. A set passes with 8 done and 6 of them clean.</p>
      <p>Mastery: <BoxDots box={box} /></p>
      <div className="drill-actions">
        <button autoFocus onClick={advance}><kbd>Enter</kbd> {nextSkill === undefined ? 'done' : `next: ${drillSkill(nextSkill)?.name ?? nextSkill}`}</button>
        <button onClick={again}><kbd>r</kbd> another set</button>
        <button onClick={onExit}><kbd>Esc</kbd> {exitLabel}</button>
      </div>
    </section> : drill.phase === 'replay' ? <Replay rep={rep} onContinue={retry} /> : <>
      <p className="script-goal">
        {rep.skill !== skill.id && repSkill && <span className="drill-recall">From before: {repSkill.name}. </span>}
        {rep.level.goalText}
        {drill.retry && <span className="drill-recall"> One more try.</span>}
      </p>
      <div className="script-columns">
        <div className="script-editor">
          <div className="script-buffer-viewport">
            <Buffer state={drill.run.state} {...(goal?.type === 'reach' ? { target: goal.target } : {})} />
          </div>
          <output className="script-mode" aria-label="Vim mode">
            {SHOWN_MODES.has(drill.run.state.mode) ? `-- ${drill.run.state.mode.replaceAll('-', ' ').toUpperCase()} --` : ''}
          </output>
          <p className="drill-count" data-over={drill.keys.length > rep.level.par}>{drill.keys.length} of {rep.level.par} keys</p>
        </div>
        <Target rep={rep} engineState={drill.run.state} />
      </div>
      <div className="drill-actions">
        <button onClick={giveUp}>Show me</button>
        <button onClick={onExit}>{exitLabel}</button>
      </div>
    </>}

    {drill.feedback && drill.phase !== 'replay' && <p className="drill-feedback" aria-live="polite">
      <span>Last rep, you:</span> <KeyRow keys={drill.feedback.keys} label="Your keys" />
      <span>par:</span> <KeyRow keys={drill.feedback.par} label="Par keys" />
    </p>}
    </article>
  </main>;
}
