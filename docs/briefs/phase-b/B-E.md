# B-E: map and content linters
Owns: `packages/world/src/schema.ts`, `tools/maps/**`
Runner: claude-haiku with `ROLE=game-builder`. Reviewer: codex.

1. `packages/world/src/schema.ts`: zod schemas for `Legend`, `Stage` and everything inside them, matching `types.ts` exactly (a type-level test must fail to compile if they drift).
2. `tools/maps/lint.ts`: `lintStage(stage, legend): LintIssue[]` with plain-words messages. Rules:
   - at least one row, no empty rows; every map character is in the legend;
   - legend convention: `ground` is only the space character, `object` characters are letters, digits or `_`, `barrier` characters are punctuation; no duplicate characters;
   - start cell, every entity cell and every patrol waypoint exists and is walkable; ids are unique;
   - every trigger area is inside the map; every `opensScript`, `autoScript`, clear condition and trigger entity refers to something that exists;
   - a `text` stage has `autoScript`, no entities and exactly one `script-solved` clear condition; other stages have no `autoScript`;
   - `set-rows` effects keep rows in range;
   - `parTurns` is above 0 and `solution` is not empty (report as a warning for a stage whose id starts with `fixture`).
3. `tools/maps/cli.ts`: `npx tsx tools/maps/cli.ts <dir>` lints every stage JSON in a folder against its legend JSON and exits non-zero on any error. Do not add it to CI config; report the command so the dispatcher can.
- Tests, at least 30: `FIXTURE_STAGE` passes with only the placeholder warning; one broken stage per rule.
