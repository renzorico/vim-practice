import { useEffect, useRef, useState } from 'react';
import type { StoryContent } from '@escape/story';
import { keyLabel } from '../keyLabel.js';
import type { HelpKey } from './keys.js';

const SCROLL_STEP = 120;

interface HelpOverlayProps {
  readonly entries: readonly HelpKey[];
  readonly newKeys: ReadonlySet<string>;
  readonly worlds: StoryContent['worlds'];
  readonly onClose: () => void;
}
export function HelpOverlay({ entries, newKeys, worlds, onClose }: HelpOverlayProps) {
  const panel = useRef<HTMLElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [filtering, setFiltering] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    const previous = document.activeElement;
    panel.current?.focus();
    return () => {
      // Never hand focus back to a button: the browser would give it Enter and Space, and Enter would reopen help.
      if (!(previous instanceof HTMLElement)) return;
      if (previous.tagName === 'BUTTON') previous.blur();
      else if (previous.isConnected) previous.focus();
    };
  }, []);
  useEffect(() => { if (filtering) input.current?.focus(); }, [filtering]);
  useEffect(() => {
    const handle = (event: KeyboardEvent): void => {
      if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.repeat && (event.key === 'Escape' || event.key === 'q')) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopImmediatePropagation();
        if (filtering || query) { setQuery(''); setFiltering(false); panel.current?.focus(); }
        else onClose();
      } else if (!filtering && ['q', '/', 'j', 'k'].includes(event.key)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (event.key === 'q') onClose();
        else if (event.key === '/') setFiltering(true);
        else panel.current?.scrollBy({ top: event.key === 'j' ? SCROLL_STEP : -SCROLL_STEP });
      } else if (event.key === 'Tab') {
        const controls = panel.current?.querySelectorAll<HTMLElement>('button, input');
        if (!controls?.length) return;
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', handle, true);
    return () => window.removeEventListener('keydown', handle, true);
  }, [filtering, query, onClose]);
  const visible = entries.filter(entry => `${entry.key} ${keyLabel(entry.key)} ${entry.description}`.toLowerCase().includes(query.toLowerCase()));
  return <section ref={panel} tabIndex={-1} className="help-reference" role="dialog" aria-modal="true" aria-label="Keys">
    <header className="help-reference__header"><h1>Keys</h1><button onClick={onClose}>Close <kbd>Esc</kbd></button></header>
    <p><kbd>j</kbd> / <kbd>k</kbd> scroll · <kbd>/</kbd> filter · <kbd>q</kbd> close</p>
    <label>Filter keys<input ref={input} type="search" value={query} placeholder="A key or what it does"
      onFocus={() => setFiltering(true)} onChange={event => setQuery(event.target.value)}
      onKeyDown={event => { if (event.key === 'Enter') { setFiltering(false); panel.current?.focus(); } }} /></label>
    <p className="help-reference__hint">[x] shows the cursor. Examples may span lines. Some keys need a target or a move.</p>
    {[...worlds].sort((a, b) => b.order - a.order).map(world => {
      const group = visible.filter(entry => entry.world === world.id);
      return group.length > 0 && <section key={world.id} aria-label={world.name}><h2>{world.name}</h2><dl>
        {group.map(entry => <div className="help-reference__entry" key={entry.key}>
          <dt><kbd>{keyLabel(entry.key)}</kbd>{newKeys.has(entry.key) && <span className="help-reference__new">new</span>}</dt>
          <dd><p>{entry.description}</p><p className="help-reference__typed">Try <kbd>{entry.example.keys.map(keyLabel).join(' ')}</kbd>{entry.example.setup.length > 0 && <> after <kbd>{entry.example.setup.map(keyLabel).join(' ')}</kbd></>}</p>
            {entry.example.initial && <p className="help-reference__typed">Prepare from <code>{entry.example.initial}</code>, then type <kbd>{entry.example.setup.map(keyLabel).join(' ')}</kbd>.</p>}
            <div className="help-reference__example"><pre aria-label="Before">{entry.example.before}</pre><span>→</span><pre aria-label="After">{entry.example.after}</pre></div></dd>
        </div>)}
      </dl></section>;
    })}
    {visible.length === 0 && <p role="status">No learned keys match. Press Esc to clear the filter.</p>}
  </section>;
}
