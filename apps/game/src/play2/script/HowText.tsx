import { KeyText } from '../KeyText.js';

/** Instructions with keycaps in backticks and text to type in curly quotes. */
export function HowText({ text }: { readonly text: string }) {
  return <>{text.split(/(“[^”]*”)/).map((part, index) => part.startsWith('“')
    ? <code className="typed-text" key={index}>{part.slice(1, -1)}</code> : <KeyText key={index} text={part} />)}</>;
}
