import type { RegisterValue } from '@escape/engine';
import { Portrait } from '../scene/sprites/Portrait.js';

/** The unnamed register is exactly what a plain p puts, including deletes. */
export function YankedSlot({ value, turn }: { readonly value: RegisterValue | undefined; readonly turn: number }) {
  const text = value?.text ?? '';
  return <div className="yanked-slot" data-yank-slot aria-label={`Yanked: ${text || 'empty'}${value?.linewise ? ' (whole lines)' : ''}`}>
    <span>yanked</span>
    <span className="yanked-slot__cargo" key={turn}>
      {text ? [...text].map((char, index) => char === 'o' || char === 'r'
        ? <Portrait key={index} sprite={char === 'o' ? 'oil' : 'cargo-rope'} />
        : <code key={index}>{char === '\n' ? '↵' : char}</code>) : <span>empty</span>}
    </span>
  </div>;
}
