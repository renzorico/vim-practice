# Field renderer

Run `npm run dev -w @escape/game`, then open
`http://localhost:5173/src/scene/demo.html?demo=field`.
Press any game key or select **Next sample** to cycle the authored frames.
**Show source** draws buffer characters above the tiles.

`FieldView` accepts `{ state, events, legend, stage, showSource }`. React owns
keys and calls the injected `WorldSim`; the scene never derives game rules.
`Demo` optionally accepts `{ sim, options }` to run a real `WorldSim` instead of
the authored fixtures. Remount it when replacing the simulation instance.
The standalone default samples are illustrations, not a valid playable replay.

Every parent render finishes playback and snaps to the last authoritative state
before accepting another frame. Callers must render after every key, including
partial commands. A repeated state/events pair does not replay animations.
Tiles always rebuild from `state.engine.lines`. Animation hints are budgeted to
240 ms total. Reduced motion is observed live and makes all hints instant.
The canvas uses 16 px generated textures and an integer camera zoom of 3.
Unknown sprite keys use the fallback palette color while retaining distinct keys.

Integration decisions:
- The contract has no buffer filename. Source view uses `.folio.txt.swp` from
  MASTERPLAN until a design-lead contract change supplies per-buffer names.
- Root `/?demo=field` routing needs a dispatcher change to `src/main.tsx`.
  This task cannot modify that file or `App.tsx`. The standalone HTML entry works
  through the Vite dev server; the dispatcher must include it in the production
  build or route the exported `Demo` from the existing entry.
- Phaser is pinned to `3.90.0` in the owned manifest. The dispatcher owns the root
  lockfile update. Installation was blocked by registry DNS in this worktree;
  typecheck and browser validation must be rerun after dependency installation.

Pure tests: `npx vitest run apps/game/src/scene` (32 tests, no canvas).
