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

Unfinished input and repeated snapshots preserve playback. A new finished move carries
its drawn position forward, clamped to one cell behind the previous destination; explicit
stage changes, checkpoint restores, death and reduced motion snap player and camera.
Source visibility can change independently. `FieldView` never finishes playback on keydown.
Cell images and actors are pooled, and transparent glyph textures are cached by character.

Timing and easing live in pure functions in `animate.ts`: walks take 110–420 ms
with quad ease-out and a per-cell bob; world-authored jumps take 175–360 ms with
sine easing and a distance-scaled arc. Long vertical arcs flatten. Three pooled
ghosts show the skipped path; landing squash occupies the final 90 ms of the jump clock. Bumps lean 4 px over
140 ms with a pooled dust puff, retaining stage tints. The camera follows ground
position and leads jumps by up to a quarter of their distance, without shaking.
Edits retain their choreography on a shared 180 ms clock. Actor idle phases are
stable by id on a 600 ms cycle; water and animated tiles share a 900 ms clock.
Reduced motion removes spatial effects and snaps to authoritative state immediately.

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
  lockfile update. Phaser is installed in this worktree. Browser/canvas validation remains manual.

Pure tests: `npx vitest run apps/game/src/scene` (no canvas).
