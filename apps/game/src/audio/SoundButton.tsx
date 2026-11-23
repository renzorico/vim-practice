export function SoundButton({ enabled, onToggle, compact = false }: {
  readonly enabled: boolean;
  readonly onToggle: () => void;
  readonly compact?: boolean;
}) {
  return <button type="button" data-sound-toggle aria-label={`Sound: ${enabled ? 'on' : 'off'}`}
    aria-pressed={enabled} onMouseDown={event => event.preventDefault()} onClick={onToggle}>
    {compact ? <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor">
      <path d="M3 7h4l4-4v14l-4-4H3Z" />
      {enabled ? <path d="M14 6q5 4 0 8" /> : <path d="m14 7 4 6m0-6-4 6" />}
    </svg> : `Sound: ${enabled ? 'on' : 'off'}`}
  </button>;
}
