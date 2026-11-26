import { useEffect, useRef, useState } from 'react';
import { usePrologue } from './usePrologue.js';
import { WorldMap } from './WorldMap.js';
import { CAPTIONS } from './data.js';
import { drawPrologue, HEIGHT, WIDTH } from './art.js';
import './prologue.css';

export function Prologue({ onComplete, soundEnabled }: { readonly onComplete: () => void; readonly soundEnabled: boolean }) {
  const state = usePrologue(onComplete, soundEnabled);
  return <PrologueScene {...state} onNext={state.next} onSkip={onComplete} />;
}

export function PrologueScene({ beat, elapsed, shown, reduced, onNext, onSkip }: {
  readonly beat: number; readonly elapsed: number; readonly shown: number; readonly reduced: boolean;
  readonly onNext: () => void; readonly onSkip: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const resize = (): void => setScale(Math.max(1, Math.min(Math.floor(1120 / WIDTH),
      Math.floor((window.innerWidth - (window.innerWidth <= 480 ? 16 : 32)) / WIDTH), Math.floor(window.innerHeight * 0.58 / HEIGHT))));
    resize(); window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (context) drawPrologue(context, beat, elapsed, reduced);
  }, [beat, elapsed, reduced]);
  const caption = CAPTIONS[beat] ?? CAPTIONS[0];
  return <main className="prologue" aria-label="The story of Folio">
    <button className="prologue__skip" onClick={onSkip}>Esc skip</button>
    <div className="prologue__stage">{beat === 6 ? <div className="prologue__goal"><h1>YOUR GOAL</h1><WorldMap world="margin" goal /></div> : <canvas ref={canvas} width={WIDTH} height={HEIGHT} style={{ width: WIDTH * scale, height: HEIGHT * scale }}
      aria-label={`Scene ${beat + 1} of 8: ${caption.replace('\n', ' ')}`} role="img" />}</div>
    <p className="prologue__caption" aria-live="polite" aria-atomic="true"><span className="prologue__accessible">{caption}</span><span aria-hidden="true">{caption.slice(0, shown)}</span></p>
    <div className="prologue__footer">
      <p>{beat === 7 ? "It's real Vim. What you learn here works there." : `${beat + 1} / 8`}</p>
      <button onClick={onNext}>{beat === 7 ? 'Enter: wake up' : shown < caption.length ? 'Enter: reveal' : 'Enter: next'}</button>
    </div>
  </main>;
}
