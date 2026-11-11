# B-B: tile renderer
Owns: `apps/game/src/scene/**`, `apps/game/package.json` (to add Phaser only)
Runner: codex. Reviewer: claude-sonnet.
New dependency (approved by Renzo): Phaser 3. Install the current 3.x release and pin the exact version.

Build the Phaser scene that draws a `WorldState` and animates `WorldEvent`s. It takes a `WorldSim` as a parameter; until B-A lands, drive it from a hand-written list of states and events for `FIXTURE_STAGE`.

- `scene/tiles.ts` (pure, tested): `WorldState.engine.lines` + `Legend` to a grid of sprite keys. Ragged rows: cells past a row's end draw nothing.
- `scene/FieldScene.ts`: tile layer rebuilt from state after every step (the contract says events are animation hints only); player and entity sprites; camera follows the player; 16 px tiles scaled by an integer factor.
- `scene/animate.ts` (pure, tested): `WorldEvent[]` to an ordered list of animation steps: walk tween per cell, jump arc for `style: 'jump'`, bump shake, hit flash, entity move, entity removed, rows changed. Total playback for one step must stay under 250 ms so fast typing never queues; a new key finishes the current animation at once.
- Art: no downloads in this task. Generate placeholder textures in code, one flat colour plus a 1 px darker edge per sprite key, from a small palette table in `scene/palette.ts`. The CC0 art pack is a later task.
- Source view: a `showSource` flag draws each tile's character over it in a monospace font, with the buffer name in the corner.
- React keeps key capture (`apps/game/src/input`). Export `<FieldView state events legend stage showSource />` that mounts the Phaser game in a div and cleans it up on unmount. Respect `prefers-reduced-motion`: tweens become instant.
- Do not wire it into `App.tsx`; add `scene/Demo.tsx` reachable at `?demo=field` so it can be seen without the rest of the game.
- Tests: `tiles.ts` and `animate.ts`, at least 20. No tests that need a real canvas.
