import { useEffect, useRef, useState } from 'react';
import type { HelpKey } from './help/keys.js';

export const EXAMPLE_KEY_MS = 400;
const KEYS_PER_CARD = 3;
const RESULT_HOLD_TICKS = 4;
/** A player tapping Enter through the last dialogue line must not dismiss the card unseen. */
export const CARD_GUARD_MS = 300;

/** Brackets in reference examples identify the cursor; they are not buffer text. */
function ExampleRow({ row }: { readonly row: string }) {
  const match = /\[([^\n]?)\]/.exec(row);
  const start = match?.index ?? -1;
  const end = start + (match?.[0].length ?? 0) - 1;
  return <pre className="key-card__row">{start < 0 || end < 0 ? row : <>
    {row.slice(0, start)}<mark>{row.slice(start + 1, end) || ' '}</mark>{row.slice(end + 1)}
  </>}</pre>;
}

function KeyExample({ entry }: { readonly entry: HelpKey }) {
  const [tick, setTick] = useState(0);
  const [reduced, setReduced] = useState(() => typeof window === 'undefined'
    || !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const keys = entry.example.keys;
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!media) return;
    const changed = () => setReduced(media.matches);
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => setTick(value => (value + 1) % (keys.length + RESULT_HOLD_TICKS + 1)), EXAMPLE_KEY_MS);
    return () => window.clearInterval(timer);
  }, [keys, reduced]);
  const complete = reduced || tick > keys.length;
  return <div className="key-card__example" aria-label={`Before: ${entry.example.before}. After: ${entry.example.after}.`}>
    <div aria-hidden="true">
      <ExampleRow row={reduced ? entry.example.before : complete ? entry.example.after : entry.example.before} />
      <div className="key-card__typed">{keys.slice(0, reduced ? keys.length : Math.min(tick, keys.length)).map((key, index) => <kbd key={index}>{key}</kbd>)}</div>
      {reduced && <ExampleRow row={entry.example.after} />}
    </div>
  </div>;
}

/** Captures the whole overlay's input before App's listener, without a session action. */
export function KeyCard({ entries, onDismiss, suspended = false }: {
  readonly entries: readonly HelpKey[];
  readonly onDismiss: () => void;
  /** True while `:help` covers the card and owns the keyboard. */
  readonly suspended?: boolean;
}) {
  const [page, setPage] = useState(0);
  const [openedAt] = useState(() => Date.now());
  const pages = Math.ceil(entries.length / KEYS_PER_CARD);
  const advance = () => {
    if (page + 1 < pages) setPage(page + 1);
    else onDismiss();
  };
  // A ref keeps the listener (and its order among other capture listeners) stable across renders.
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  useEffect(() => {
    if (suspended) return;
    const handle = (event: KeyboardEvent) => {
      // F1 opens help, the rest (reload, dev tools) belongs to the browser; the game ignores them all.
      if (event.metaKey || /^F\d+$/.test(event.key)) return;
      // No Vim key may reach the game behind the card, but browser shortcuts still work.
      event.stopImmediatePropagation();
      if (event.ctrlKey || event.altKey) return;
      event.preventDefault();
      const ready = Date.now() - openedAt >= CARD_GUARD_MS;
      if (ready && !event.repeat && (event.key === 'Enter' || event.key === 'Escape')) advanceRef.current();
    };
    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  }, [suspended, openedAt]);
  if (!entries.length) return null;
  return <section className="play-panel key-card" role="dialog" aria-modal="true" aria-labelledby="key-card-title">
    <h2 id="key-card-title">Your new keys{pages > 1 ? ` · ${page + 1} of ${pages}` : ''}</h2>
    {entries.slice(page * KEYS_PER_CARD, (page + 1) * KEYS_PER_CARD).map(entry => <article className="key-card__entry" key={entry.key}>
      <kbd className="key-card__key">{entry.key}</kbd>
      <p>{entry.description}</p>
      <KeyExample entry={entry} />
    </article>)}
    <button autoFocus onClick={advance}><kbd>Enter</kbd> {page + 1 < pages ? 'next keys' : 'play'}</button>
    <span className="key-card__hint"><kbd>Esc</kbd> also continues</span>
  </section>;
}
