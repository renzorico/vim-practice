import { useEffect, useMemo, useRef, useState } from 'react';
import type { Key } from '@escape/engine';
import { mapKeyEvent } from '../../input/keys.js';
import { newDeadKeyMemory, readKey, resolveDeadKey } from '../../input/keyReader.js';
import { holdRepeats } from '../notebook/keyHold.js';
import { PAGE_GUARD_MS } from '../notebook/routing.js';
import { Sheet } from '../script/Sheet.js';
import { draftCommands, draftDone, draftKey, goToCell, openDraft, reachedOtherwise, taskDone } from './draftModel.js';
import type { Draft } from './drafts.js';
import { markPractised } from './practised.js';

interface DraftSheetProps {
  readonly draft: Draft;
  /** The key reference is open above this sheet. */
  readonly suspended: boolean;
  readonly onClose: () => void;
  readonly onOpenHelp: () => void;
}

/**
 * The stage's keys on real text, between its clear card and the next stage. Nothing here reaches the
 * session: it has its own buffer, and skipping or finishing it changes no turn and no story.
 */
export function DraftSheet({ draft, suspended, onClose, onOpenHelp }: DraftSheetProps) {
  const commands = useMemo(() => draftCommands(draft.stage), [draft.stage]);
  const [state, setState] = useState(() => openDraft(draft));
  const [leaving, setLeaving] = useState(false);
  // Keys can come faster than renders: the refs hold what the last key left behind.
  const now = useRef({ state, leaving });
  const deadKey = useRef(newDeadKeyMemory());
  const openedAt = useRef(Date.now());
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // The clear card's button keeps the focus otherwise, and Enter would press it unseen.
    if (!suspended) dialog.current?.focus();
  }, [suspended]);
  const done = draftDone(draft, state);
  const leave = (): void => { holdRepeats(); onClose(); };
  const askToLeave = (asked: boolean): void => { now.current = { ...now.current, leaving: asked }; setLeaving(asked); };
  const press = (key: Key): void => {
    const last = now.current.state;
    if (draftDone(draft, last)) { if (key === '<CR>') leave(); return; }
    const resting = last.engine.mode === 'normal' && last.engine.pendingKeys.length === 0;
    // Esc does nothing to a resting Vim, so here it is the way out: once to ask, once more to go.
    if (key === '<Esc>' && resting) {
      if (now.current.leaving) leave(); else askToLeave(true);
      return;
    }
    askToLeave(false);
    const next = draftKey(draft, last, key, commands);
    now.current = { state: next, leaving: false };
    setState(next);
    if (draftDone(draft, next)) markPractised(draft.stage);
  };
  const latest = useRef({ press, suspended });
  latest.current = { press, suspended };
  useEffect(() => {
    let open = true;
    const handle = (event: KeyboardEvent): void => {
      if (latest.current.suspended || event.metaKey) return;
      if (event.key === 'F1') { event.preventDefault(); event.stopImmediatePropagation(); onOpenHelp(); return; }
      const onButton = event.target instanceof HTMLElement && event.target.tagName === 'BUTTON' && dialog.current?.contains(event.target);
      // Tab would walk out of the sheet; its button has a key of its own.
      if (event.key === 'Tab') { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (event.isComposing || onButton && (event.key === 'Enter' || event.key === ' ')) { event.stopImmediatePropagation(); return; }
      const reading = readKey(event, deadKey.current);
      event.stopImmediatePropagation();
      if (reading.type !== 'key') {
        event.preventDefault();
        if (reading.type === 'dead' && !event.repeat) void resolveDeadKey(event).then(character => {
          if (character && open && !latest.current.suspended) latest.current.press(character);
        });
        return;
      }
      const mapped = mapKeyEvent(reading.event);
      if (mapped.preventDefault) event.preventDefault();
      if (mapped.key === null || event.repeat && (mapped.key === '<CR>' || mapped.key === '<Esc>')) return;
      // The Enter that closed the clear card must not land here.
      if (mapped.key === '<CR>' && Date.now() - openedAt.current < PAGE_GUARD_MS) return;
      latest.current.press(mapped.key);
    };
    window.addEventListener('keydown', handle, true);
    return () => { open = false; window.removeEventListener('keydown', handle, true); };
  }, [onOpenHelp]);
  const goTo = done ? undefined : goToCell(draft, state);
  const again = (): void => {
    const fresh = openDraft(draft);
    now.current = { state: fresh, leaving: false };
    setState(fresh); setLeaving(false); dialog.current?.focus();
  };
  return <div ref={dialog} tabIndex={-1} className="draft-sheet" role="dialog" aria-modal="true" aria-label={`On paper: ${draft.title}`} hidden={suspended}>
    <Sheet id={`draft.${draft.stage}`} title={draft.title} tasks={draft.tasks.map(task => ({ task: task.task, how: task.how, done: taskDone(draft, state, task) }))}
      engine={state.engine} {...(draft.target ? { target: { name: 'text', lines: draft.target } } : {})} {...(goTo ? { goTo } : {})}
      {...(done ? { finished: <>On paper too. Press <kbd>Enter</kbd> to go on.</> } : {})}
      aside={<p className="draft-sheet__aside"><span>On paper: the same keys, on real text.</span>
        {done ? <button type="button" onClick={leave}><kbd>Enter</kbd> go on</button>
          : <span className="draft-sheet__buttons"><button type="button" onClick={again}>Start again</button>
            <button type="button" onClick={leave}><kbd>Esc</kbd> {leaving ? 'again to skip' : 'skip'}</button></span>}</p>}>
      <p className="draft-sheet__note" role="status">{state.error ?? (reachedOtherwise(draft, state) ? 'You are there. Now get there with the key above: step away and try again.' : '')}</p>
    </Sheet>
  </div>;
}
