# P2-C: app shell, CRT buffer renderer, key capture, HUD
Owns: `apps/game/**` (its own `package.json` as an npm workspace named `@escape/game`)

Build a Vite + React + Zustand app. New deps (approved): react, react-dom, vite, @vitejs/plugin-react, zustand, plus @types/react and @types/react-dom. Pin exact versions that are at least 2 weeks old.
1. `src/store/stub.ts`: a stub `GameStore` (contracts.ts) with one hard-coded demo level that uses the real engine (`createEngine`), so the UI is playable now. P2-F replaces it later; keep UI components store-agnostic (props or a selector hook).
2. `src/input/keys.ts`: browser `KeyboardEvent` to Vim notation (`<Esc>`, `<CR>`, `<BS>`, `<Tab>`, `<C-r>`, `<C-d>`, `<C-u>`, `<C-v>`, plain characters incl. shift). preventDefault for keys we handle (including Ctrl-r) but never for Cmd/Meta shortcuts. Unit-test this mapping.
3. `src/components/Buffer.tsx`: renders EngineState lines with line numbers, block cursor in normal/visual, bar cursor in insert, visual and visual-line selection highlight, command line at the bottom in command-line mode. Tabs rendered as spaces to width 8.
4. HUD: mode indicator, pending keys, keystroke counter vs par, goal checklist, hint reveal (one hint per press of `?` is NOT allowed since `?` is search: use a visible button and the F1 key), last error message.
5. Retro CRT style, CSS only: phosphor green on near-black, subtle scanlines and glow, monospace font from Google Fonts (e.g. "VT323" or "IBM Plex Mono"), respects `prefers-reduced-motion`. No horizontal scroll at 1024px width. Colors as CSS variables.
6. Screens: title, overworld (renders the overworld buffer from the store), level, result (stars, keystrokes vs par, retry/continue). Routing by `store.screen`.
Add `"dev"` and `"build"` scripts in `apps/game/package.json`. `npm run build -w @escape/game` must succeed. Component logic tests with Vitest (no browser needed for the key mapping and pure helpers).
