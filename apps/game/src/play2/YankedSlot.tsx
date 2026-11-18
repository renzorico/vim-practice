import { useState } from 'react';
import type { EngineState, RegisterValue } from '@escape/engine';
import { Portrait } from '../scene/sprites/Portrait.js';

function Cargo({ text }: { readonly text: string }) {
  return text ? <>{[...text].map((char, index) => ['o', 'r', 'n'].includes(char)
    ? <Portrait key={index} sprite={char === 'o' ? 'oil' : char === 'r' ? 'cargo-rope' : 'nets'} />
    : <code key={index}>{char === '\n' ? '↵' : char}</code>)}</> : <span>empty</span>;
}
function RegisterRow({ name, value, expanded }: {
  readonly name: string; readonly value: RegisterValue | undefined; readonly expanded: boolean;
}) {
  const text = value?.text ?? '';
  const signature = `${value?.linewise ?? false}:${text}`;
  const [change, setChange] = useState({ signature, text, old: '', revision: 0 });
  if (change.signature !== signature) {
    setChange({ signature, text, old: change.text, revision: change.revision + 1 });
  }
  return <div className="register-row" aria-label={expanded ? `Register "${name === '"' ? '' : name}: ${text || 'empty'}` : `Yanked: ${text || 'empty'}${value?.linewise ? ' (whole lines)' : ''}`}>
    <span>{expanded ? name === '"' ? '"' : `"${name}` : 'yanked'}</span>
    <span className="yanked-slot__cargo" key={change.revision} data-changed={change.revision > 0}>
      {expanded && name === '"' && change.old && <span className="register-row__old" aria-hidden="true"><Cargo text={change.old} /></span>}
      <span className="register-row__current"><Cargo text={text} /></span>
    </span>
  </div>;
}
/** Show only registers taught here; the engine remains free to accept others. */
export function YankedSlot({ registers, expanded = false }: {
  readonly registers: EngineState['registers']; readonly expanded?: boolean;
}) {
  const names = expanded ? ['"', '0', ...Object.keys(registers).filter(name => /^[a-z]$/.test(name) && registers[name]?.text).sort()] : ['"'];
  return <div className="yanked-slot" data-yank-slot>{names.map(name =>
    <RegisterRow key={name} name={name} value={registers[name]} expanded={expanded} />)}</div>;
}
