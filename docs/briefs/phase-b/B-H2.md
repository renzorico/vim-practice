# B-H2: the first five minutes
Owns: `apps/game/src/**` (except `apps/game/src/play/**` and `apps/game/src/ui/**`, the old Phase 3 game), `packages/world/src/sim/**` (only for the Blot burst rule), `packages/world/content/margin/**` (new), `packages/story/content/**`.
Runner: codex. Reviewer: claude-sonnet, then a browser check by the design lead (Opus), then Renzo plays it.
Read `docs/briefs/phase-b/_common.md` first.

## Why
Renzo's second playtest of stage 1-1: boring, no characters, "best possible: 2" was false (it counted `4k`, which nothing taught), motion slow, and the point of the game was not visible. This task replaces 1-1 with ONE open map, the Margin, where the player meets people, learns one real Vim idea (counts) and feels why it matters, all within five minutes.

## The rule change (contract already updated on this branch)
`packages/world/src/types.ts` rule 4: a `blot` that deals contact damage bursts (removed, `entity-removed` with cause `hit`). One Blot costs at most one heart. Implement it in `packages/world/src/sim/entities.ts` with tests.

## 1. Speed
- One step's whole animation budget is 90 ms (was 240). A walk is a 60 ms slide; a jump (counted move) is a 90 ms arc; a bump is a 60 ms shake. Enemies move in the same window.
- A new key during playback finishes the current animation at once (already the rule) and is never dropped.
- Test: 20 `keydown` events dispatched synchronously on `window` produce 20 moves in the session (a test around the key-capture hook and the reducer, no canvas).

## 2. Characters and art (drawn in code, no downloads)
- `apps/game/src/scene/sprites/`: 16x16 pixel art defined as string grids plus a palette, turned into Phaser textures at boot. One file per sprite. Each needs a readable silhouette at 3x zoom:
  - Tilde (the player): small child, dark hair, a yellow scarf (`--you` colour), 2 idle frames.
  - Elder: long grey robe, white beard, staff. Mira: apron, red hair, holds a bucket. Pell: old farmer, straw hat. Bram: guard, helmet, spear.
  - Blot: a black ink blob with two white eyes, 2 wobble frames.
  - Tiles: grass (2 variants, chosen by a hash of line and column so it is stable), road, tree, house wall, house roof (top row of an `H` block), well, water (2 frames), gate, Save Stone (glowing rune).
- Entities face the direction they last moved (flip horizontally).
- Idle animation: 2 frames at 2 fps, purely cosmetic, off under `prefers-reduced-motion`.

## 3. Talking to people
- When the player stands 4-adjacent to an entity that has an `interact` trigger, show a small "Enter: talk" prompt above that entity.
- `<CR>` there fires the trigger (the sim already does this) and the story shows the dialogue.
- `DialogueBox` shows the speaker's sprite as a portrait at 4x zoom next to the name.
- The HUD shows the story's objectives (`storyEngine.objectives`), not `stage.goalText`.

## 4. End and death panels
- Remove "The best possible is N" everywhere. Nothing in the game claims a best score until the solver can be limited to taught commands (later task).
- Clear panel: "The road east is open." / "To be continued." / keys typed, hearts left. `<CR>` restarts from the title.
- Death panel: "You were unwritten." plus the hint line `margin.death-hint` below; any key restores the checkpoint.

## 5. Content: the Margin
`packages/world/content/margin/margin.legend.json` and `margin.json`. Map (40 x 13), row by row:

```
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
T    HHHH        T            T        T
T    HHHH    S   T    ~~~~             T
T                T T  ~~~~             T
T                T                 T   T
T         HHH    T                     T
T         HHH    T                     T
T                ......................D
T                T                     T
T  HHH      O    T   T                 T
T  HHH           T               ~~~~  T
T                T         T     ~~~~  T
TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
```
Legend: `' '` grass (ground, walkable); `.` road (barrier class, walkable); `T` tree, `H` house, `O` well (objects, not walkable); `S` Save Stone (object, walkable, fixed); `D` gate (object, walkable, fixed); `~` water (barrier, not walkable).
- Stage id `margin`, world `margin`, type `field`, hearts 3, start (7, 2), `allowedCommands` `['h','j','k','l']` (counts work anyway, as in Vim).
- Clear: reach (7, 39).
- Entities (all `still`, `solid: true`, damage 0, kind `npc`): `elder` at (3, 6), `mira` at (10, 12), `pell` at (8, 8), `bram` at (7, 17) (he stands in the road opening and blocks it).
- Triggers: `margin.talk-elder`, `margin.talk-mira`, `margin.talk-pell`, `margin.talk-bram` (interact, entity target, `once: false`); `margin.road` (enter, area (7,18)-(7,20), once); `margin.stone` (enter, (2,13), once).
- `parTurns` and `solution` from the solver (`finalizeStage`); the map linter must pass with 0 errors.

## 6. Story content (`packages/story/content/margin.json`; keep the wording exactly; `\n` is a line break)
World `{ id: 'margin', order: 0, name: 'The Margin', stages: ['margin'], castle: null, statue: null }`, opening stage `margin`, opening quest `margin.warning`.

Quest `margin.warning` (main), title "The road east":
1. `meet-elder`: "Talk to the Elder. Stand next to him, press Enter." completes on flag `margin.met-elder`.
2. `see-mira`: "Find Mira at the well." completes on flag `margin.knows-counts`.
3. `cross`: "Cross the road to the east gate." completes on stage-cleared `margin`; then dialogue `margin.end`.

Intro (shown once at start, as `<stage>.intro` in B-H1): `margin.intro`
- system: "You wake in the Margin, at the edge of\nthe world. Someone is calling your name."
- elder: "Tilde! Over here!\nWalk with h j k l: left, down, up, right."

Reactions and dialogues:
- `margin.talk-elder`, unless `margin.met-elder`: dialogue `margin.elder`, then set flag `margin.met-elder`:
  - elder: "The Unwriter came again last night.\nThe north field is gone. Row by row."
  - elder: "Someone must warn the Lighthouse.\nThe road east is the only way there."
  - elder: "But the road is crawling with Blots.\nMira at the well knows a trick. Go."
- `margin.talk-elder`, onlyIf `margin.met-elder`: dialogue `margin.elder-again`:
  - elder: "Mira is at the well, south of here."
- `margin.talk-mira`, unless `margin.met-elder`: dialogue `margin.mira-early`:
  - npc Mira: "Morning, Tilde. The Elder was looking\nfor you. Better see him first."
- `margin.talk-mira`, onlyIf `margin.met-elder`, unless `margin.knows-counts`: dialogue `margin.mira`, then set flag `margin.knows-counts` and world effect remove-entity `bram`:
  - npc Mira: "Blots move when you move. Every step\nyou take, they take one too."
  - npc Mira: "So take fewer steps. Don't press l\ntwenty times. Type 20l: one move."
  - npc Mira: "A number before a key repeats it.\n5j, 3h, 20l. Bram will let you pass."
- `margin.talk-mira`, onlyIf `margin.knows-counts`: dialogue `margin.mira-again`:
  - npc Mira: "A number, then the key. 20l.\nThe Blots won't even blink."
- `margin.talk-pell`: dialogue `margin.pell`:
  - npc Pell: "My brother left before the Last Saving.\nWe never said his name again."
  - npc Pell: "Out there, unsaved things just... fade.\nMind the road, child."
- `margin.talk-bram`, unless `margin.knows-counts`: dialogue `margin.bram`:
  - npc Bram: "Road's closed. Blots everywhere.\nOne step at a time, they'd swarm you."
  - npc Bram: "Ask Mira. She crossed it once."
- `margin.road`, once: dialogue `margin.road`, then world effect spawn of five Blots (chase, every 1, damage 1, not solid) at (4,23), (10,26), (4,30), (10,32), (5,36):
  - system: "Ink bubbles up from the fields.\nBlots! Remember Mira: one big move."
- `margin.stone`, once: dialogue `margin.stone`, then world effect heal 1:
  - scribe: "A Save Stone. I left these for you.\nSoon you will learn what they are for."
- `margin.end`:
  - system: "You made it past the Blots.\nThe road east is open."
- `margin.death-hint` (shown on the death panel, not through the story engine):
  - "Mira's trick: a number before l.\n20l crosses the road in one move."

The content validator must pass with 0 errors (pass it the stage's trigger ids and the skill catalog).

## 7. Tests
- Session tests with the real content: the full happy path (`kkkk`-style walk to the Elder, talk, walk to Mira, talk, Bram is gone, `20l` from the road start clears with 3 hearts); single steps along the road lose hearts and each Blot hits at most once; talking to Mira before the Elder does not set `knows-counts`; Bram blocks the road until then; the death hint shows; the 20-keydown test from section 1.
- Pure tests for sprite grids (every row 16 characters, every character in the palette).

## Done
`npm run typecheck`, `npx vitest run`, `npm run build -w @escape/game` pass. The app opens on the title, then the Margin. Do not commit. Report in max 12 lines, with anything in the contracts that got in the way.
