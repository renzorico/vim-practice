import { useEffect, useRef, useState } from 'react';
import type { HelpKey } from '../help/keys.js';
import { routeHelpCommand } from '../help/command.js';
import { Portrait } from '../../scene/sprites/Portrait.js';
import { useDialogueSound } from '../../audio/hooks.js';
import { exampleFrames, expectedKey, openPage, pressKey, skipWatching, watchStep } from './pageModel.js';
import { newDeadKeyMemory, readKey, resolveDeadKey } from '../../input/keyReader.js';
import type { KeyEventLike } from '../../input/keys.js';
import { PAGE_GUARD_MS, routeKey, type Routed } from './routing.js';
import { markKeysSeen } from './seen.js';
import { holdRepeats } from './keyHold.js';
import { TileStrip } from './TileStrip.js';
import { lessonFor, notebookLessons, type Lesson } from './lessons.js';
import './notebook.css';

export const EXAMPLE_KEY_MS = 400;
export interface NotebookProps {
  readonly entries: readonly HelpKey[];
  readonly onDismiss: () => void;
  readonly suspended?: boolean;
  readonly onOpenHelp?: (() => void) | undefined;
}
export function Notebook({ entries, ...props }: NotebookProps) {
  const [index, setIndex] = useState(0);
  const lessons = notebookLessons(entries);
  const entry = lessons[index];
  if (!entry) return null;
  return <NotebookPage key={entry.key} {...props} entry={entry} index={index} total={lessons.length}
    onNext={() => { if (index + 1 < lessons.length) setIndex(index + 1); else props.onDismiss(); }}
    onSkip={() => { markKeysSeen(lessons.flatMap(item => item.keycaps)); props.onDismiss(); }} />;
}
export function NotebookPage({ entry: helpEntry, index, total, suspended = false, onNext, onSkip, onOpenHelp }: {
  readonly entry: HelpKey; readonly index: number; readonly total: number; readonly suspended?: boolean;
  readonly onNext: () => void; readonly onSkip: () => void; readonly onOpenHelp?: (() => void) | undefined;
}) {
  const entry = lessonFor(helpEntry);
  const [reduced, setReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true);
  const [page, setPage] = useState(() => openPage(entry, reduced));
  const [openedAt] = useState(Date.now);
  const pendingHelp = useRef<string | null>(null);
  const deadKey = useRef(newDeadKeyMemory());
  const dialog = useRef<HTMLElement>(null);
  useDialogueSound('scribe', 0, reduced);
  useEffect(() => { markKeysSeen(entry.keycaps); }, [entry.key]);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const change = (): void => { setReduced(media?.matches ?? true); if (media?.matches) setPage(skipWatching); };
    media?.addEventListener('change', change);
    return () => media?.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (suspended || page.phase !== 'watch') return;
    const timer = window.setInterval(() => setPage(watchStep), EXAMPLE_KEY_MS);
    return () => window.clearInterval(timer);
  }, [suspended, page.phase]);
  const latest = useRef({ page, onNext, onSkip, onOpenHelp, suspended });
  latest.current = { page, onNext, onSkip, onOpenHelp, suspended };
  useEffect(() => {
    const handle = (event: KeyboardEvent): void => {
      if (latest.current.suspended) return;
      if (event.isComposing) { event.stopImmediatePropagation(); return; }
      const reading = readKey(event, deadKey.current);
      if (reading.type !== 'key') {
        event.stopImmediatePropagation();
        event.preventDefault();
        if (reading.type === 'dead' && !event.repeat) void resolveDeadKey(event).then(character => {
          if (character && !latest.current.suspended) act({ key: character, ctrlKey: false, metaKey: false, altKey: false }, false, false);
        });
        return;
      }
      const onButton = (event.target as { readonly tagName?: string } | null)?.tagName === 'BUTTON';
      const routed = act(reading.event, event.repeat, onButton);
      if (routed.stop) event.stopImmediatePropagation();
      if (routed.preventDefault) event.preventDefault();
    };
    const act = (typed: KeyEventLike, repeat: boolean, onButton: boolean): Routed => {
      const current = latest.current;
      const routed = routeKey({ ...typed, repeat, onButton }, current.page, Date.now() - openedAt >= PAGE_GUARD_MS);
      const action = routed.action;
      // :help can temporarily cover a page. An example's own ':' still belongs to its engine.
      if (pendingHelp.current !== null || (action.type === 'demo' && action.key === ':' && expectedKey(current.page) !== ':')) {
        if (repeat || !routed.stop) return routed;
        const key = action.type === 'demo' ? action.key : typed.key === 'Enter' ? '<CR>' : typed.key === 'Escape' ? '<Esc>' : typed.key;
        const help = routeHelpCommand(pendingHelp.current, key);
        pendingHelp.current = help.pending;
        if (help.open) current.onOpenHelp?.();
        return routed;
      }
      if (action.type === 'demo') setPage(previous => pressKey(previous, action.key));
      if (action.type === 'continue' || action.type === 'skip') {
        holdRepeats();
        if (action.type === 'continue') current.onNext(); else current.onSkip();
      }
      return routed;
    };
    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  }, [openedAt]);
  useEffect(() => { if (!suspended) dialog.current?.focus(); }, [suspended]);
  const frames = exampleFrames(entry);
  const shown = page.phase === 'watch' ? frames[Math.min(page.watched, frames.length - 1)] ?? page.engine : page.engine;
  const typed = page.phase === 'watch' ? page.watched : page.typed;
  const guarded = (action: () => void): void => { if (Date.now() - openedAt >= PAGE_GUARD_MS) { holdRepeats(); action(); } };
  return <div className="notebook-shade" hidden={suspended}>
    <section ref={dialog} tabIndex={-1} className="notebook" role="dialog" aria-modal="true" aria-labelledby="notebook-title">
      <header className="notebook__header"><h2 id="notebook-title">From the Scribe's notebook</h2><Portrait sprite="scribe" /></header>
      <div className="notebook__lesson"><LessonKeycaps lesson={entry} typed={typed} /><div><p className="notebook__instruction">{entry.instruction}</p><p className="notebook__description">{entry.description}</p></div></div>
      <TileStrip state={shown} lesson={entry} typed={typed} />
      <div className="notebook__typed" aria-label="Example keys">{entry.example.keys.map((key, at) => <kbd key={at} data-typed={at < typed}>{key}</kbd>)}</div>
      <p className="notebook__prompt" aria-live="polite"><span key={page.misses} className={page.expected ? 'notebook__prompt--miss' : undefined}>
        {page.phase === 'watch' ? 'Watch Tilde try it.' : page.phase === 'done' ? <><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m2 8 4 4 8-9" /></svg> That's it.</>
          : <>{page.expected ? 'Try again: press ' : 'Your turn: press '}<kbd>{expectedKey(page)}</kbd>.</>}
      </span></p>
      <footer className="notebook__footer">
        {total > 1 && <span className="notebook__dots" aria-label={`Page ${index + 1} of ${total}`}>{Array.from({ length: total }, (_, dot) => <i key={dot} data-current={dot === index} />)}</span>}
        <button data-complete={page.phase === 'done'} type="button" onClick={() => guarded(onNext)}><kbd>Enter</kbd>: {page.phase === 'done' ? 'on you go' : 'skip practice'}</button>
        {(index + 1 < total || page.phase !== 'done') && <button type="button" onClick={() => guarded(onSkip)}><kbd>Esc</kbd>: {index + 1 < total ? 'skip the rest' : 'skip'}</button>}
      </footer>
    </section>
  </div>;
}

function LessonKeycaps({ lesson, typed }: { readonly lesson: Lesson; readonly typed: number }) {
  const used = lesson.example.keys.slice(0, typed).join('');
  return <div className="notebook__keycaps" data-grouped={lesson.keycaps.length > 1}>
    {lesson.keycaps.map(key => <kbd className="notebook__key" key={key} data-long={key.length > 2}
      data-used={used.includes(key)}>{key}</kbd>)}
  </div>;
}
