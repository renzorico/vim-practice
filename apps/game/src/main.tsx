import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

/** Letters drawn on a canvas are drawn once: both faces must be there first. A slow network may not hold the game back. */
const FACES = ["15px 'Jersey 15'", "18px Folio", "48px 'JetBrains Mono'", "bold 48px 'JetBrains Mono'"] as const;
const FONT_WAIT_MS = 1500;
const fontsReady = Promise.race([
  Promise.allSettled(FACES.map(face => document.fonts.load(face))),
  new Promise(resolve => { setTimeout(resolve, FONT_WAIT_MS); }),
]);

const root = createRoot(container);
void fontsReady.then(() => root.render(
  <StrictMode>
    <App />
  </StrictMode>,
));
