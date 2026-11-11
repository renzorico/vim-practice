# B-C: story engine, dialogue box, HUD
Owns: `packages/story/src/engine/**`, `packages/story/src/schema.ts`, `apps/game/src/story-ui/**`
Runner: claude-sonnet. Reviewer: codex.

1. `engine/index.ts`: `createStoryEngine(): StoryEngine`, exactly as in `packages/story/src/types.ts`. Pure.
   - `onEvents`: advance each active quest's current step when its `completeWhen` matches; fire `reactions` (respect `once`, `onlyIf`, `unless`); apply state-only effects to the state and still list them; expand nothing else. A step's `then` may complete the next step in the same call (bounded loop, no recursion without a limit).
   - Flags: `flag-set` events update `StoryState.flags`; `flag` conditions are re-checked after every change.
   - `learn`, `apply`, `objectives` as documented. Main quests come first in `objectives`.
2. `schema.ts`: zod schemas for `StoryContent` that match the types exactly, plus `validateContent(content)` returning a list of plain-words errors: unknown dialogue, quest, stage, cutscene or skill ids; a quest step that can never complete; dialogue lines over 2 lines of 48 characters.
3. `apps/game/src/story-ui/`: `DialogueBox` (one line at a time, `<CR>` or `<Space>` advances, speaker name, never steals keys while closed), `ObjectiveHud` (current objectives, hearts, turn count), `Cutscene` (plays `Beat`s; the `terminal` beat renders raw monospace text). Plain React and CSS, no new dependency. Reuse the colour tokens in `apps/game/src/ui/tokens.css`.
- Write a small fixture `StoryContent` in your tests: one main quest of three steps around `FIXTURE_STAGE` (read the sign, mend the bridge via flag `fixture.bridge-mended`, clear the stage), one side reaction, one cutscene.
- Tests: at least 40 for the engine and schema; component tests only for pure helpers.
