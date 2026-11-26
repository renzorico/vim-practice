import { useContext } from 'react';
import { SoundModeContext } from './settings.js';

export function SoundButton({ enabled, onToggle, compact = false, selected = false }: {
  readonly enabled: boolean;
  readonly onToggle: () => void;
  readonly compact?: boolean;
  /** The title menu's j/k choice is on this button. */
  readonly selected?: boolean;
}) {
  const setting = useContext(SoundModeContext);
  const mode = enabled ? setting : 'off';
  return <button type="button" data-sound-toggle aria-label={`Sound: ${mode}`}
    aria-current={selected ? 'true' : undefined} onMouseDown={event => event.preventDefault()} onClick={onToggle}>
    {compact ? <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
      <path d="M3 7h4l4-4v14l-4-4H3Z" />
      {mode === 'on' ? <path d="M13 7q3 3 0 6m3-9q6 6 0 12" />
        : mode === 'effects only' ? <path d="M13 8q2 2 0 4" /> : <path d="m14 7 4 6m0-6-4 6" />}
    </svg> : `Sound: ${mode}`}
  </button>;
}
