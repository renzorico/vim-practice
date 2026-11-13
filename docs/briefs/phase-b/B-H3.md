# B-H3: the Lowlands (the next five minutes)
Owns: `apps/game/src/**` (not the old `play/` and `ui/`), `packages/world/content/**`, `packages/story/content/**`, `tools/maps/**` (only the ground rule), `packages/world/src/sim/**` only if a bug blocks you.
Runner: codex. Reviewer: claude-sonnet, then a browser check by the design lead (Opus), then Renzo plays it.
Read `docs/briefs/phase-b/_common.md` first. Builds on the Margin (B-H2), which Renzo approved: "I see the point now, keep going".

## Goal
After the Margin gate, the player walks east into the Lowlands. Two new Vim ideas, each one felt:
1. `w` (and `b`): a field the Unwriter erased to blank. Blank cannot be walked on, but Vim's word motions skip blanks, so `w` leaps from stone to stone. Proven in the simulation: `www...` from the road crosses; `l` bumps.
2. `$`: a long jetty to the Lighthouse with Blots crawling up it. Single steps: 2 hits. `$`: one move, untouched.

## 1. Connected maps
- A world is a list of stages. Clearing `margin` no longer shows the end panel: it shows `margin.end`, then loads `lowlands` (fresh `WorldState` for that stage, same `StoryState`, hearts reset to the stage's hearts). Clearing `lowlands` shows `lowlands.end`, then the "To be continued" panel.
- Each stage's `<stageId>.intro` dialogue shows once, the first time the stage is entered.
- Progress is saved to `localStorage` (key `unsaved.progress.v1`: current stage id and `StoryState`) after every stage change and every story change; every read and write is in try/catch and the game works without it. The title screen shows "Continue" (if a save exists) and "New game". Both are chosen with `j`/`k` and `<CR>`.

## 2. Unwritten ground (tab)
- The world contract now allows `'\t'` as a `ground` tile (see `TileKind` in `packages/world/src/types.ts`). Update the legend rule in `tools/maps/legend-rules.ts` (ground = space or tab) with tests.
- Sprite `blank`: the tile is "erased": a pale paper colour with a faint torn edge where it meets a written tile, so it reads as a hole in the world, not as water. Source view draws a tab as `→`.

## 3. Content: `packages/world/content/lowlands/`
- `lowlands.map.json` is provided (an array of rows; tabs are real tab characters; row 7 is longer than the others: the jetty sticks out into the sea, and cells past a row's end do not exist and draw nothing). Build `lowlands.json` around it and `lowlands.legend.json`:
  - `' '` grass; `'\t'` unwritten ground (ground, NOT walkable); `.` road (barrier, walkable); `=` jetty (barrier, walkable); `T` tree (object, not walkable); `o` stepping stone (object, walkable); `L` Lighthouse door (object, walkable, fixed).
  - Stage `lowlands`, world `lowlands`, start (7, 1), hearts 3, no `allowedCommands` (every learned command works).
  - Clear: reach (7, 55).
  - Entities: `wren` (npc, still, solid) at (6, 11); `gull` (npc, still, solid) at (6, 37); `scribe-note` (prop, sprite `note`, still, solid) at (8, 38).
  - Triggers: `lowlands.edge` (enter, area (6,10)-(8,12), once); `lowlands.talk-wren`, `lowlands.talk-gull`, `lowlands.talk-note` (interact, entity target); `lowlands.far-side` (enter, area (1,27)-(13,38), once); `lowlands.jetty` (enter, (7,39), once).
  - `parTurns`/`solution` from the solver; map linter 0 errors.
- `WorldOptions.learnedCommands` for this stage: `['h','j','k','l','w','b','e','0','$']`.

## 4. Story content (`packages/story/content/`; keep wording exactly; `\n` is a line break)
World `{ id: 'lowlands', order: 1, name: 'Lowlands', stages: ['lowlands'], castle: null, statue: null }`. Quest `lowlands.lighthouse` (main) starts when `margin.warning` completes (its last step's `then` adds `start-quest`).
Quest steps:
1. `meet-wren`: "Find a way across the blank field." completes on flag `lowlands.knows-w`.
2. `cross`: "Leap from stone to stone with w." completes on trigger `lowlands.far-side`.
3. `lighthouse`: "Reach the Lighthouse at the end of the jetty." completes on stage-cleared `lowlands`; then dialogue `lowlands.end`.

Change `margin.end` to:
- system: "You made it past the Blots.\nThe road leads east, into the Lowlands."

Dialogues:
- `lowlands.intro`: system: "East of the Margin, the Lowlands.\nOr what the Unwriter left of them."
- `lowlands.wren` (reaction on `lowlands.edge` AND on `lowlands.talk-wren`, unless `lowlands.knows-w`; then set flag `lowlands.knows-w`):
  - npc Wren: "Wait! Don't step in that. It's blank.\nWhere the Unwriter walks, land goes blank."
  - npc Wren: "You can't walk on blank. But you can\nleap it. w jumps to the next word."
  - npc Wren: "Each stone is a word. w: next stone.\nb: back one. The blank is skipped."
- `lowlands.wren-again` (on `lowlands.talk-wren`, onlyIf `lowlands.knows-w`): npc Wren: "w forward, b back. Stone to stone."
- `lowlands.gull` (on `lowlands.talk-gull`):
  - npc Gull: "The tide's not coming in tonight.\nIt's not going out either."
  - npc Gull: "Maybe it's not the world that's broken.\nMaybe it's just not written yet."
- `lowlands.note` (on `lowlands.talk-note`):
  - scribe: "I left a note for you, whoever you are.\n$ jumps to the end of the line."
  - scribe: "The jetty is one long line. One key.\nAnd 0 jumps back to the start of it."
- `lowlands.jetty` (on `lowlands.jetty`, once; then world effect spawn of two Blots, chase, every 1, damage 1, not solid, at (7, 50) and (7, 53)):
  - system: "Blots crawl up the jetty from the sea.\nThe door is at the end of the line."
- `lowlands.end`: system: "The Lighthouse. Its lamp is dark.\nSomething is moving inside."

The content validator must pass with 0 errors.

## 5. Sprites (same style as B-H2)
Wren (scout: green hood, short bow on her back), Gull (fisherman: yellow oilskin hat, pipe), the note (a pinned paper on a post), stepping stone, jetty plank, Lighthouse door (stone arch with a dark wooden door), blank (see section 2).

## 6. HUD
The footer shows the commands the player has learned so far as key caps (`h j k l`, then `3l` once counts are known, then `w b`, then `$ 0`), derived from story flags, not a fixed string.

## 7. Fixes from the Margin review (Sonnet, PR #39)
1. Key auto-repeat: ignore `event.repeat` for Enter, Space, and any key that restores after death or restarts after the end. Keep repeat for `h j k l` and other motions. Today a held Enter talks to an NPC again and again and skips every line, and a held `l` skips the death panel.
2. The capture-phase `wake` handler in `App.tsx` must not swallow F-keys, Escape or modified keys on the title and death screens (F5 and F12 are blocked today). Only printable keys, Enter and Space wake or restore.
3. `play2/session.ts` `settle`: world effects that arrive while the world is `dead` are held and applied right after `restore`, never dropped silently.
4. `FieldScene.finish()`: skip `syncActors` when no tween is active (it rebuilds every entity image and prompt twice per key today).
Tests: a test through the real `App` key path (both listeners) that Enter advances exactly one dialogue line; held-Enter (repeat events) advances nothing extra; F5 on the death screen is not prevented.

## 8. Tests
- Session: Margin clear leads into Lowlands with the story kept; Wren calls out at the edge once; `w` from the road reaches the far side, `l` bumps into blank; the jetty `$` clears with 3 hearts and single steps lose 2; Continue restores the saved stage and story; New game clears it; storage that throws does not crash.
- Linter: a tab ground tile passes; a tab tile marked `object` fails.

## Done
`npm run typecheck`, `npx vitest run`, `npm run build -w @escape/game` pass. Do not commit. Report in max 12 lines.
