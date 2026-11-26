import type { ReactNode } from 'react';
import { keyParts, KeyText } from '../KeyText.js';
import type { HintsView } from './useHints.js';

/** A note in the margin: stays until the next objective, or until asked away. */
export function HintSlip({ hint, place }: {
  readonly hint: HintsView['hint'];
  /** Puts the note where it does not cover the player; runs anew for each note. */
  readonly place: (note: ReactNode, key: string) => ReactNode;
}) {
  return <>
    <p className="frame-accessible" role="status">{hint ? `Hint ${hint.number} of ${hint.total}: ${keyParts(hint.text).map(part => part.text).join('')}` : ''}</p>
    {hint && place(<div className="hint-slip" aria-hidden="true">
      <p className="hint-slip__label">Hint {hint.number} of {hint.total}</p>
      <p><KeyText text={hint.text} /></p>
      <p className="hint-slip__more"><kbd className="keycap">:hint</kbd> {hint.number < hint.total ? 'shows the next one' : 'puts it away'}</p>
    </div>, hint.text)}
  </>;
}
