# B-H4: the Lighthouse, World 1's boss (the Unwriter's first appearance)
Owns: `apps/game/src/**` (not the old `play/` and `ui/`), `packages/world/content/**`, `packages/story/content/**`.
Runner: codex. Reviewer: claude-sonnet, then a browser check by the design lead (Opus), then Renzo plays it.
Read `docs/briefs/phase-b/_common.md` first. Builds on the Lowlands (B-H3, merged).

## Goal
A Mario-castle moment for World 1, built only from commands already taught (`h j k l`, counts, `w b`, `0 $`). Inside the Lighthouse, the Unwriter appears at the top of the tower and starts erasing it from the bottom, one row every turn. The player climbs; fewer, bigger Vim moves outrun the erasure. At the top, the Lamplighter, the first keeper, and the first clue: "The Scribe is in another buffer."
Proven in the simulation (design lead): from the hall exit, a learner using counts and `w` clears in about 19-21 turns with 3 hearts; single steps get caught near the top and die.

## 1. Stage `lighthouse`
- `packages/world/content/lighthouse/lighthouse.map.json` is provided (22 rows x 21 columns; tabs are real tabs). Build `lighthouse.json` and `lighthouse.legend.json` around it, then delete the `.map.json` (the map lives in the stage file, like the others).
- Legend: `' '` stone floor (ground, walkable); `'\t'` unwritten ground (ground, not walkable, sprite `blank`); `W` wall (object, not walkable); `P` pillar (object, not walkable); `o` stepping stone (object, walkable); `A` the lamp (object, not walkable, fixed).
- Stage `lighthouse`, world `lowlands`, type `castle`, start (21, 10), hearts 3. Clear: flag `lighthouse.lit`.
- Entities: `lamplighter` (keeper, sprite `lamplighter`, still, solid, damage 0) at (2, 10).
- Triggers: `lighthouse.climb` (enter, area (12,1)-(12,1), once); `lighthouse.talk-lamplighter` (interact, entity `lamplighter`).
- `parTurns`/`solution` from the solver (it may find a shortcut; fine). Map linter 0 errors.
- Clearing `lowlands` now leads into `lighthouse` (after `lowlands.end`); clearing `lighthouse` shows the ending cutscene, then the "To be continued" panel.

## 2. The erasure
- On `lighthouse.climb` (once): dialogue `lighthouse.climb`, then world effect spawn of the Unwriter: `{ id: 'unwriter', kind: 'unwriter', sprite: 'unwriter', at: (1, 18), behaviour: { type: 'unwrite', path: lines 21, 20, ..., 0 (col 0) }, every: 1, damage: 0, solid: true }`.
- Each turn it deletes the bottom row (contract rule 3: a player on a deleted row is displaced to the nearest free cell and loses a heart). Use the existing simulation; do not add rules.
- Renderer: a deleted row should not just vanish: play a short "unwriting" effect on the row (it dissolves into the paper colour of the `blank` tile, left to right, within the 90 ms budget), and darken the screen edge at the bottom so the danger reads at a glance.
- Death hint for this stage: "Fewer, bigger moves: counts, w and 0.\nOutclimb the Unwriter."

## 3. Story content (keep wording exactly; `\n` is a line break)
World `lowlands` gets `castle: 'lighthouse'`, `stages: ['lowlands', 'lighthouse']`, `statue: 'R'`.
Quest `lowlands.lighthouse` gets a third step: `lamp` "Climb the Lighthouse. Find who weeps at the top." completes on flag `lighthouse.lit`. (Progression still hangs on stage-cleared reactions, never on quest steps.)
- `lighthouse.intro`: system: "Inside, the stairs climb into the dark.\nAt the top, someone is weeping."
- `lighthouse.climb`: system: "Above you, a hooded shape. Below you,\nthe floor begins to vanish. Climb!"
- Reaction on `lighthouse.talk-lamplighter`, unless `lighthouse.lit`: dialogue `lighthouse.lamplighter`, then set flag `lighthouse.lit` and world effect remove-entity `unwriter`:
  - npc The Lamplighter: "Who's there? He took a row of my light.\nI can't see the words to light it."
  - npc The Lamplighter: "Tilde? Then read them to me. Quick!\nThere. There... it catches."
- Reaction on stage-cleared `lighthouse`: cutscene `lighthouse.end`, then `light-statue` R, then (as before) the "To be continued" panel:
  - title: "The lamp is lit. The Unwriter is gone."
  - line, npc The Lamplighter: "The Scribe came here three nights ago.\nWrote something on my wall. Look."
  - title: "The Scribe is in another buffer."
  - line, npc The Lamplighter: "Means nothing to me. Maybe to you.\nThe road goes on, past the sea."
  - line, system: "End of World 1."
The content validator must pass with 0 errors.

## 4. Sprites (same style)
The Unwriter (tall hooded figure, no face, a long quill like a scythe, dark violet), the Lamplighter (old keeper, grey coat, unlit lantern), stone floor, wall, pillar, the lamp (big lantern on a stand; lit variant after `lighthouse.lit`, warm yellow glow).

## 5. Tests
- Session: Lowlands clear leads to the Lighthouse; the climb trigger spawns the Unwriter once; a learner route (counts and `w`) clears with 3 hearts; single steps die; Continue restarts the Lighthouse from its entry (no Unwriter until the trigger again); the cutscene shows once and lights statue R; the solver's shortest route still clears.
- Pure test for the unwriting effect plan (row index, duration within budget).

## Done
`npm run typecheck`, `npx vitest run`, `npm run build -w @escape/game` pass. Do not commit. Report in max 12 lines.
