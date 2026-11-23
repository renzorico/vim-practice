import { useEffect, useState } from 'react';
import { Portrait } from '../scene/sprites/Portrait.js';
import { speakerAccent } from '../scene/sprites/portraits/speakers.js';
import type { Line } from '@escape/story';
import { speakerName } from './advance';
import { moodFor } from './mood.js';
import { useSequence } from './useSequence';

interface DialogueBoxProps {
  /** The lines to show. null or empty means closed: nothing renders and no key is captured. */
  readonly lines: readonly Line[] | null;
  /** When supplied, the session owns progression and keyboard capture. */
  readonly activeIndex?: number;
  readonly dialogueId?: string;
  /** Called once per sequence, or once per advance in session-owned mode. */
  readonly onFinish: () => void;
}

const CHARACTERS_PER_SECOND = 60;
const REVEAL_INTERVAL_MS = 1000 / CHARACTERS_PER_SECOND;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Cosmetic timer only: it never captures a key or calls the session. */
function RevealedText({ text }: { readonly text: string }) {
  const [shown, setShown] = useState(0);
  const [reduced, setReduced] = useState(() =>
    typeof window === 'undefined' || !window.matchMedia || window.matchMedia(REDUCED_MOTION_QUERY).matches);
  useEffect(() => {
    const preference = window.matchMedia?.(REDUCED_MOTION_QUERY);
    if (!preference) return;
    const changed = () => setReduced(preference.matches);
    changed();
    preference.addEventListener('change', changed);
    return () => preference.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    if (reduced) return;
    const started = Date.now();
    const timer = window.setInterval(() => {
      const count = Math.floor((Date.now() - started) * CHARACTERS_PER_SECOND / 1000);
      setShown(Math.min(text.length, count));
      if (count >= text.length) window.clearInterval(timer);
    }, REVEAL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [text, reduced]);
  const visible = reduced ? text.length : shown;
  return <>
    <span className="dialogue__accessible" aria-live="polite" aria-atomic="true">{text}</span>
    <span aria-hidden="true">{text.slice(0, visible)}<span className="dialogue__unrevealed">{text.slice(visible)}</span></span>
  </>;
}

export function DialogueBox(props: DialogueBoxProps) {
  if (props.activeIndex !== undefined) {
    const line = props.lines?.[props.activeIndex];
    return <DialogueLine key={`${props.dialogueId ?? ''}:${props.activeIndex}:${line?.text ?? ''}`}
      line={line} mood={moodForLine(line, props.dialogueId, props.activeIndex)} onAdvance={props.onFinish} />;
  }
  return <SequenceDialogueBox {...props} />;
}

function moodForLine(line: Line | undefined, dialogueId: string | undefined, index: number) {
  return line === undefined ? 'neutral' : moodFor(line, dialogueId, index);
}

function SequenceDialogueBox({ lines, onFinish, dialogueId }: DialogueBoxProps) {
  const { item } = useSequence(lines, onFinish);
  const line = item === null ? undefined : lines?.[item];
  return <DialogueLine key={`${dialogueId ?? ''}:${item}:${line?.text ?? ''}`} line={line}
    mood={moodForLine(line, dialogueId, item ?? 0)} />;
}

function DialogueLine({ line, mood, onAdvance }: {
  readonly line: Line | undefined;
  readonly mood: ReturnType<typeof moodFor>;
  readonly onAdvance?: () => void;
}) {
  if (line === undefined) return null;
  const name = speakerName(line);
  const speaker = line.speaker === 'npc' ? line.name ?? '' : line.speaker;
  return (
    <div className={`dialogue dialogue--${line.speaker}`} role="dialog" aria-label={name || 'Message'}>
      <Portrait sprite={speaker} mood={mood} />
      {name !== '' && <div className="dialogue__name" style={{ color: speakerAccent(speaker) }}>{name}</div>}
      <p className="dialogue__text"><RevealedText text={line.text} /></p>
      {onAdvance ? <button type="button" className="dialogue__hint" onClick={onAdvance}>
        <kbd className="keycap">Enter</kbd> to go on
      </button> : <div className="dialogue__hint"><kbd className="keycap">Enter</kbd> to go on</div>}
    </div>
  );
}
