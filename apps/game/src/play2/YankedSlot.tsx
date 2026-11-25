import { useState } from 'react';
import type { EngineState, RegisterValue } from '@escape/engine';
import { Portrait } from '../scene/sprites/Portrait.js';

const ICONS: Readonly<Record<string, string>> = { o: 'oil-icon', r: 'rope-icon', n: 'nets' };
/** One icon per character, or one and how many once there are more than fit beside each other. */
const SHOWN_APART = 4;
function Cargo({ text }: { readonly text: string }) {
  if (!text) return <span className="yanked-slot__empty">empty</span>;
  return <>{(text.match(/(.)\1*|\n/gsu) ?? []).map((run, index) => {
    const char = run[0] ?? '';
    const icon = ICONS[char];
    if (!icon) return <code key={index}>{run.replaceAll('\n', '↵')}</code>;
    return run.length > SHOWN_APART ? <span className="yanked-slot__many" key={index}><Portrait sprite={icon} />×{run.length}</span>
      : [...run].map((_, at) => <Portrait key={`${index}:${at}`} sprite={icon} />);
  })}</>;
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
