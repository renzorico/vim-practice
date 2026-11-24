import { expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { KeyText, keyParts, keyTextLength } from './KeyText.js';
vi.mock('../audio/hooks.js', () => ({ useDialogueSound: () => {} }));
import { DialogueBox } from '../story-ui/DialogueBox.js';
it('renders backtick commands as atomic keycaps', () => {
  expect(keyParts('Press `4x` now.')).toEqual([{ text: 'Press ', keycap: false }, { text: '4x', keycap: true }, { text: ' now.', keycap: false }]);
  const html = renderToStaticMarkup(<KeyText text="Press `4x` now." />);
  expect(html).toContain('<kbd class="keycap">4x</kbd>');
  expect(html).not.toContain('`');
  expect(keyTextLength('Press `4x` now.')).toBe(13);
  const partial = renderToStaticMarkup(<KeyText text="Press `4x` now." visible={7} />);
  expect(partial).toContain('visibility:hidden">4x</kbd>');
  expect(renderToStaticMarkup(<KeyText text="Press `4x` now." visible={8} />)).toContain('<kbd class="keycap">4x</kbd>');
});
it('supports a literal backtick and preserves unmatched delimiters and plain text', () => {
  expect(keyParts('Press `` ` `` now.')[1]).toEqual({ text: '`', keycap: true });
  expect(renderToStaticMarkup(<KeyText text="Use ` for marks" />)).toBe('Use ` for marks');
  expect(renderToStaticMarkup(<KeyText text="Plain text." />)).toBe('Plain text.');
});
it('labels dialogue instructions only when a keycap is present', () => {
  const render = (text: string) => renderToStaticMarkup(<DialogueBox lines={[{ speaker: 'system', text }]} activeIndex={0} onFinish={() => {}} />);
  expect(render('Press `4x` now.')).toContain('Try this');
  expect(render('Press x now.')).not.toContain('Try this');
});
