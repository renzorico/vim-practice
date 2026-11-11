# B-H1: make stage 1-1 playable in the browser
Owns: `apps/game/src/App.tsx`, `apps/game/src/main.tsx`, `apps/game/src/play2/**` (new), `apps/game/src/story-ui/**` (small changes only), `packages/story/content/**` (new), `apps/game/src/scene/**` (only the three backlog fixes listed below), `apps/game/vite.config.ts` if needed.
Runner: codex. Reviewer: claude-sonnet, then a browser check by the design lead.
Read `docs/briefs/phase-b/_common.md` first. The rule "do not edit files you do not own" applies to everything outside the list above; you MAY replace `App.tsx` wholesale.

## Goal
Open the app, press a key, and play stage 1-1 "The Road Out" from start to clear, with the story lines below. This is the first playable version of masterplan v2; it replaces the Phase 3 ASCII game as what the app shows. Leave the old Phase 3 code (`apps/game/src/play`, `apps/game/src/ui`) on disk but unmounted; reuse its key capture (`apps/game/src/input`) and colour tokens.

## What to build
1. `play2/session.ts` (pure, tested): one reducer that owns `{ world: WorldState, story: StoryState, queue: Presentation[], lastEvents }` and wires the two engines exactly as their contracts say:
   - a key goes to `sim.step`; its events go to `story.onEvents`; the resulting `StoryEffect`s are split: `world` effects and every `set-flag` not caused by a `flag-set` event go back through ONE `sim.apply` call (whose events are fed to `story.onEvents` again, bounded loop); `dialogue`, `cutscene`, `teach` and `ending` go onto the presentation queue;
   - while the queue is not empty, keys do not reach the world; `<CR>` or `<Space>` advances the presentation, and finishing a dialogue applies its `then` through `story.apply`;
   - on death: a "You were unwritten" panel; any key calls `sim.restore`;
   - on clear: a result panel with turns taken, hearts left, and the stage's `parTurns` ("You took 17 turns. The best possible is 2."), then `<CR>` restarts the stage (there is no second stage yet).
2. `play2/PlayScreen.tsx`: `FieldView` filling the screen, `ObjectiveHud` (stage `goalText`, hearts, turns), `DialogueBox`, the result and death panels, a pending-keys readout (shows `4` while the player is typing `4k`), and Source view toggled by holding `<Tab>` (prevent the browser's focus change).
3. `play2/content.ts`: loads `packages/world/content/lowlands/1-1.json` and `lowlands.legend.json` through `parseStage` / `parseLegend`, and the story content below through `contentSchema`. Fail loudly at startup with the validation messages if anything is invalid.
4. `packages/story/content/slice.json`: the `StoryContent` below, as data.
5. A title screen: the word UNSAVED, one line "A game that teaches Vim.", "Press any key". No menu.
6. `WorldOptions.learnedCommands` for this build: `['h','j','k','l']`. The stage's `allowedCommands` already limits the field.
7. The three renderer leftovers from the B-B review (see `docs/TASKS.md` backlog): the camera must follow the player's CELL, not the sprite's animated position; hit flash and bump shake must stay visible when a step has many hints (give `hit` and `bump` a minimum share of the clock); `FieldView` must not collapse in a parent without a definite height and its identical-frame check must include the legend.

## Story content for 1-1 (write it as data; keep the wording exactly)
World: `{ id: 'lowlands', order: 1, name: 'Lowlands', stages: ['1-1'], castle: null, statue: null }`. Opening stage `1-1`, opening quest `lowlands.warning`.
- Quest `lowlands.warning` (main, world lowlands), title "The Elder's warning":
  - step `leave`: objective "Reach the gate at the end of the road." completes on stage-cleared `1-1`; then dialogue `1-1.cleared`.
- Dialogue `1-1.intro` (shown when the stage starts; add an `enter` trigger on the start cell to the stage JSON? NO: do not edit the stage. Instead the session shows the dialogue named `<stageId>.intro` once when a stage is first entered, if it exists):
  - elder: "The rows are vanishing, Tilde.\nTake the road. Warn the Lighthouse."
  - elder: "`h` `j` `k` `l`. Left, down, up, right.\nOne key, one step."
- Reaction on trigger `1-1.blot-near`, once, dialogue `1-1.blot`:
  - sign: "A Blot. It moves only when you move.\nIt hurts only if you share its tile."
- Reaction on trigger `1-1.save-stone`, once, dialogue `1-1.stone`, then world effect heal 1:
  - scribe: "A Save Stone. I left these for you.\nSoon you will learn what they are for."
- Dialogue `1-1.cleared`:
  - dot? no, Dot is not met yet. system: "The gate opens. Beyond it, more road."
A `\n` in these lines is a real line break. All lines already fit 2 rows of 48 characters; the content validator must pass with zero errors (pass it the stage's trigger ids and the skill catalog ids where it asks for known ids).

## Tests
- `play2/session.test.ts`, at least 25, with the real sim and story engine and the real content: intro dialogue blocks keys until dismissed; walking the route `kkkk` + 13 `l` clears with the result panel data (17 turns, par 2); stepping onto the Save Stone heals after a hit and shows its line once; the Blot line shows once; death then any key restores the checkpoint; flags set by story reach the world and the other way round; determinism (same keys, same session).
- No canvas tests.

## Done
`npm run typecheck`, `npx vitest run` and `npm run build -w @escape/game` pass. Do not commit. Report in max 12 lines, including the built bundle size and anything in the two engine contracts that made the wiring awkward.
