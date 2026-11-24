export interface KeyPart { readonly text: string; readonly keycap: boolean }
/** Paired single backticks, or Markdown's double delimiter for a literal backtick. */
export function keyParts(text: string): readonly KeyPart[] {
  const parts: KeyPart[] = [];
  const pattern = /``([^]*?)``|`([^`\n]+)`/g;
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > end) parts.push({ text: text.slice(end, index), keycap: false });
    parts.push({ text: match[1]?.trim() ?? match[2] ?? '', keycap: true });
    end = index + match[0].length;
  }
  if (end < text.length) parts.push({ text: text.slice(end), keycap: false });
  return parts;
}
export const keyTextLength = (text: string): number => keyParts(text).reduce((length, part) => length + part.text.length, 0);
export function KeyText({ text, visible = Infinity }: { readonly text: string; readonly visible?: number }) {
  if (visible === Infinity && !keyParts(text).some(part => part.keycap)) return <>{text}</>;
  let offset = 0;
  return <>{keyParts(text).map((part, index) => {
    const start = offset;
    offset += part.text.length;
    const shown = part.keycap ? visible >= offset : visible > start;
    return part.keycap ? <kbd className="keycap" key={index} style={shown ? undefined : { visibility: 'hidden' }}>{part.text}</kbd>
      : <span key={index}>{part.text.slice(0, Math.max(0, visible - start))}<span className="dialogue__unrevealed">{part.text.slice(Math.max(0, visible - start))}</span></span>;
  })}</>;
}
