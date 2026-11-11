import { useState } from 'react';
import type { Key } from '@escape/engine';
import { FIXTURE_LEGEND, FIXTURE_STAGE } from '@escape/world';
import type { WorldOptions, WorldSim, WorldStepResult } from '@escape/world';
import { useKeyCapture } from '../input/useKeyCapture.js';
import { FieldView } from './FieldView.js';
import { FIXTURE_FRAMES, FIXTURE_INITIAL_STATE } from './fixtureFrames.js';
import './demo.css';

const OPTIONS: WorldOptions = {
  learnedCommands: ['h', 'j', 'k', 'l', 'w', 'b', 'e', '0', '$', 'f', 'i', ':w'],
  flags: {},
};
const ignoreHint = (): void => {};

/** Inject B-A's simulation when available; the default advances authored presentation samples. */
export function Demo({ sim, options = OPTIONS }: {
  readonly sim?: WorldSim;
  readonly options?: WorldOptions;
}): JSX.Element {
  const [sample, setSample] = useState(0);
  const [source, setSource] = useState(false);
  const [result, setResult] = useState<WorldStepResult>(() => ({
    state: sim ? sim.init(FIXTURE_STAGE, FIXTURE_LEGEND, options) : FIXTURE_INITIAL_STATE,
    events: [],
  }));
  const advance = (key: Key): void => {
    if (sim) {
      setResult(current => sim.step(current.state, key, FIXTURE_STAGE, FIXTURE_LEGEND, options));
    } else {
      const next = (sample + 1) % FIXTURE_FRAMES.length;
      const frame = FIXTURE_FRAMES[next];
      if (frame) { setSample(next); setResult(frame); }
    }
  };
  useKeyCapture({ onKey: advance, onHint: ignoreHint, captureTab: false });
  return <main className="field-demo">
    <header><h1>{FIXTURE_STAGE.title}</h1><p>{FIXTURE_STAGE.goalText}</p></header>
    <div className="field-demo__viewport">
      <FieldView {...result} legend={FIXTURE_LEGEND} stage={FIXTURE_STAGE} showSource={source} />
    </div>
    <footer>
      <p>{sim ? 'Use Vim keys to play.' : `Authored animation sample ${sample + 1}/${FIXTURE_FRAMES.length}. Press a key or select Next sample.`}</p>
      <button type="button" onClick={() => advance('l')}>{sim ? 'Step l' : 'Next sample'}</button>
      <label><input type="checkbox" checked={source} onChange={event => setSource(event.target.checked)} /> Show source</label>
      <span>Turn {result.state.turn} · {result.state.hearts} hearts</span>
    </footer>
  </main>;
}
