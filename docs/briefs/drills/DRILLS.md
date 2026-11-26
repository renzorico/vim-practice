# Drill mode ("The Copybook"): design spec

Status: **pilot built, 2026-11-26** (Worlds 0-2; Renzo accepted the three defaults in section 9). Written by the design lead (Opus).
Source: Renzo's playtest notes of 2026-11-26. Stages are too short to learn a key, hearts rarely matter, and the game must take a player from zero to proficient.

## 1. Problem

Optimal play through all 27 stages is about 700 keystrokes. Most new keys are used 1-3 times before the next key arrives. That is enough to *see* a key, not to *own* it. Proficiency means three things:

1. **Recall:** the right key comes to mind without the key card.
2. **Choice:** among several keys you know, you pick the efficient one.
3. **Speed:** the key is typed without thinking.

Stages teach recall once. Nothing currently trains choice or speed.

## 2. What drill mode is

A **drill set** is 10 short text-only reps on one key (one skill), done in 1-3 minutes. In the story it is the **Copybook**: the Scribe's practice pages, the exercises they wrote for their brother. Working name; see section 9.

- Text only: the script-panel view (real buffer, real Vim), no tiles, no enemies, no dialogue between reps.
- Each rep is a small buffer (1-6 lines) with one goal shown on screen: a highlighted target cell (reach) or a ghost of the target text (transform).
- A rep ends the moment the goal is met. The next rep loads at once. A counter shows `7 / 10`.
- Pure and deterministic, like everything else: a set is a seed plus a skill. No timers in the logic; the app may *display* elapsed time, never gate on it.

### 2.1 Shape of a set (10 reps)

| Reps | Difficulty | What it trains |
|---|---|---|
| 1-3 | 1, **isolate** | Only the new key (plus `hjkl`) is efficient. Target is obvious. Builds recall. |
| 4-7 | 2, **vary** | Same key with counts, different start positions, longer buffers, real text. |
| 8-10 | 3, **choose** | Interleaved: the target is best reached with the new key *or* an older key. The player must pick. Builds choice. |

Interleaving (reps 8-10) is the most important part for transfer to real Vim and must not be cut.

### 2.2 Scoring

- **Clean rep:** goal met in at most par keystrokes.
- **Done rep:** goal met, over par.
- **Missed rep:** more than 3x par keystrokes (existing `OVER_PAR_FACTOR`), or the Show me button. (Not `<Esc><Esc>`: pressing Esc twice is a common Vim habit and would give up by accident.) The par solution plays back as ghost keys over the buffer, the rep reloads once, then the set moves on.
- After every non-clean rep the strip under the buffer shows `You: llllllll   Par: $`. One line, no text. This is where choice is taught.
- **Set passed:** at least 8 of 10 done and at least 6 of 10 clean.

### 2.3 Mastery

Reuse the existing Leitner model (`packages/curriculum/src/skills`, `Mastery`, boxes 0-5):

- Set passed: box + 1. Set failed: box - 1 (min 0).
- `effectiveBox` already decays with time, so `reviewQueue` already tells us what is going stale. Unwrite storms (masterplan 2.4, not built) become "a mixed drill set built from `reviewQueue`". Drill mode is the engine for them; storms are a follow-up and are not in this spec.

## 3. Where drills appear

1. **After a stage clear.** The clear card gets a primary button `Practise: f t ; ,` and a secondary `Continue`. The set covers the keys that stage introduced, one set per key, played back to back.
2. **The Copybook screen,** opened from stage select and from `:help`. Every learned key with its box (0-5 as filled dots), sorted by weakest first. Pick a key, play a set.
3. **Castle gate (soft).** A castle's door opens only when every key of that world has at least one passed set (box >= 1). The gate says which keys are missing and links to them. Recommended, but this is decision 1 in section 9.

No drill ever blocks the story beyond the castle gate. A player can always choose Continue.

## 4. Key coverage

Every key the game teaches gets a skill id and a generator. Skill ids follow the existing catalog style. The table is the full list (about 48 skills); generators marked **exists** are already in `packages/curriculum/src/generators`.

| World | Skills |
|---|---|
| 0 Margin | `motion.hjkl` (exists) |
| 1 Lowlands | `motion.word` (exists), `motion.line` (exists, covers `0 ^ $`), `motion.count` (exists) |
| 2 Quarry | `edit.x`, `edit.r`, `edit.dd`, `edit.undo` (`u <C-r>`), `edit.dot`; text stage: `mode.insert` (exists, extend to `i a A I o O`), `edit.D` |
| 3 Wordwood | `motion.find` (`f t F T`), `motion.repeat-find` (`; ,`), `motion.file` (exists), `motion.paragraph` (`{ }`), `motion.match` (`%`), `motion.scroll` (`<C-d> <C-u>`) |
| 4 Copper Port | `operator.d` (with any motion), `operator.y`, `edit.put` (`p P`), `register.named` (`"a`), `operator.c`, `edit.C`, `edit.yy` |
| 5 Library | `textobj.word` (`iw aw`), `textobj.paren` (`i( a( ib ab`), `textobj.paragraph` (`ip ap`), `textobj.bracket` (`i[ i{ iB`), `textobj.tag` (`it at`), `textobj.quote` (`i" a" i' a'`) |
| 6 Echo Caves | `search.slash` (`/ ?`), `search.next` (`n N`), `search.star` (`* #`), `mark.set-jump` (`m ' `` ` ``), `visual.char` (`v`), `visual.line` (`V`), `visual.block` (`<C-v>`) |
| Margin / any | `ex.q`, `ex.q!`, `ex.wq` (all exist) |

Rule: a set only uses keys the player has learned in the game (`stageCommands` of the latest cleared stage). Reps 8-10 draw their "older keys" from the same list.

Keys taught **only** in text stages today (`c`, `C`, `o`, `A`, `I`, the quote objects, all of visual mode) are the ones that most need drills. Visual mode currently appears in one stage only.

## 5. Content: what the buffers say

Abstract buffers (`aaaa / xxxx`) are what made The Archive confusing. Drills use real text:

- **Folio text** (about 50%): lines from the game's signs, ledgers, manifests and the Scribe's pages. Keeps the story voice.
- **Real code and config** (about 50%, rising to 70% from World 4): short Python, JavaScript, JSON, Markdown, shell and YAML snippets. This is what players will edit in real Vim, so this is where transfer happens.

The corpus is data (`packages/curriculum/content/corpus/*.json`): one line or small block per entry, tagged with its kind and the features it has (has parentheses, has quotes, has a tag, has blank-line paragraphs, and so on). Generators pick entries by feature, so `textobj.quote` only ever sees lines with quotes.

Ollama drafts corpus entries; a schema check plus a Sonnet review gate them, as today. Generators stay deterministic: the corpus is fixed data and the seed picks from it.

## 6. Architecture

```
packages/curriculum/src/drills/       NEW, pure
  buildDrillSet(skill, seed, learned) -> DrillSet   (10 Levels, difficulty 1-1-1-2-2-2-2-3-3-3)
  startDrill / stepDrill(state, key)  -> DrillState (rep index, per-rep result, set result)
  scoreSet(results) -> { passed, clean, done, missed }
packages/curriculum/src/generators/   EXTEND: one RoomGenerator per new skill
packages/curriculum/content/corpus/   NEW data, schema-checked
apps/game/src/drills/                 NEW: DrillScreen, Copybook screen, clear-card button
```

- A rep is an existing curriculum `Level`, run by the existing runner (`startLevel` / `stepLevel`) on the existing engine. No new Vim behaviour.
- Par comes from `finalizeRoom` with the existing solver. The solver cannot type insert-mode text; for insert and change skills, par falls back to the generator's intended solution, as `finalizeRoom` already does.
- Mastery is saved under a new key, `unsaved.drills.v1`, beside `unsaved.progress.v1`: `{ mastery: Mastery[], lastSeed: Record<SkillId, number> }`, zod-checked like `progress.ts`. Corrupt or missing data means an empty Copybook, never a crash.
- A seed advances by 1 each time a skill's set is played, so a replayed set is new text.

### 6.1 Contract changes (flagged; design lead only)

1. `packages/curriculum/src/catalog.ts`: add the about 38 new skills from section 4. This catalog is frozen, so the change goes in its own PR (DR-0).
2. `RegionId` in `packages/curriculum/src/types.ts`: add the world ids, or decouple skills from regions with a `world` field. Recommended: add `world`, keep `region` for the old content.
3. New `packages/curriculum/src/drills/types.ts` (frozen once merged): `DrillSet`, `DrillState`, `RepResult`, `SetResult`.

No changes to `engine`, `world` or `story` contracts.

## 7. Tasks

| ID | Task | Owner | Reviewer | Time |
|---|---|---|---|---|
| DR-0 | Contracts: catalog skills, `world` field, drills types | Opus | Codex | half a day |
| DR-A | Generators: motions and edits (Worlds 1-3, 15 skills) | Codex | Sonnet | 1 day |
| DR-B | Generators: operators, registers, text objects (Worlds 4-5, 13 skills) | Codex | Sonnet | 1 day |
| DR-C | Generators: search, marks, visual (World 6, 7 skills) | Sonnet | Codex | 1 day |
| DR-D | Drill logic: set builder, scoring, mastery wiring, save | Sonnet | Codex | half a day |
| DR-E | UI: DrillScreen, Copybook, clear-card button, castle gate | Sonnet | Codex | 1 day |
| DR-F | Corpus: 300 entries, about 50 per world | Ollama + Sonnet | Renzo | 1 day, in parallel with DR-A to DR-C |
| DR-G | Playtest: one world end to end with drills | Renzo | | 30 min |

Total: about 5 working days. DR-A, DR-B, DR-C and DR-F can run in parallel after DR-0. Suggested pilot before scaling: build DR-0, DR-D, DR-E plus World 1-2 generators only, playtest, then do the rest.

## 8. Acceptance

1. Every generator: 200 seeds per difficulty replay their intended solution to a win; par is never above the solver's answer when the solver finds one.
2. Every rep at difficulty 3 has a par route that uses an older key in at least 3 of 10 seeds (otherwise it is not training choice).
3. Coverage test: every key in every `*_COMMANDS` list in `apps/game/src/play2/session.ts` maps to a skill with a generator.
4. No rep buffer contains a run of 4 or more identical letters (no abstract `aaaa` rows).
5. Renzo playtest: a set takes 1-3 minutes, and after one World 2 drill set he can use the key in real Neovim without the key card.

## 9. Decisions needed from Renzo

1. **Castle gate:** soft gate as in section 3 (recommended), or drills fully optional?
2. **Name:** "The Copybook", or plain "Practice"?
3. **Corpus mix:** 50% Folio text and 50% real code, rising to 70% code from World 4 (recommended), or code only?

## 10. Pilot: what was built, and where it differs from this spec

Scope: the 14 skills of Worlds 0-2 (`hjkl`, counts, `w b e`, `0 $`, `x`, `r`, `dd`, `u <C-r>`, `.`, `i`, `a`, `A I`, `o`, `D`), the Copybook screen, the clear-card button, saved mastery. No castle gate yet: the pilot has no castle that needs it before World 2's Mason, and Renzo playtests first.

Differences, decided while building:

1. **Drill skills live in `packages/curriculum/src/drills/skills.ts`, not `catalog.ts`.** The frozen catalog has tests that require one Phase 3 generator per skill; adding drill skills there would break them for no gain. Each drill skill also carries its engine allow-list (the keys taught by the end of its stage), which the catalog has no field for. Section 6.1 items 1 and 2 are therefore not needed.
2. **New generators, not the Phase 3 ones.** The old generators use the retired mainframe story and abstract rows. Drill generators share only the seeded RNG. A rep's goal is never hand-written: the generator picks a buffer and the par keys, and the real engine computes the target.
3. **Par.** Motion reps are checked with the solver as they are generated (a few ms) and redrawn while a shorter route exists. Edit reps take up to a second to search, so `drills.test.ts` proves their par on 12 seeds per difficulty instead. Insert reps cannot be searched (the solver does not type text).
4. **Corpus is a typed module** (`drills/corpus.ts`, 24 Folio lines and 24 code lines), checked by a test for the rules in section 5. JSON and Ollama drafting come with the full build.
5. **Interleaving:** two of reps 8-10, at random places, are an earlier skill at difficulty 2, run with that skill's own allow-list.

Files: `packages/curriculum/src/drills/**`, `apps/game/src/drills/**`, plus small changes to `App.tsx` (title menu item, drill overlay) and `StageClearCard.tsx` (`p` practise).

## 11. Pass A: World 3, the Wordwood

Five skills: Find a letter (`f t`), Find again (`; ,`), Paragraphs (`{ }`), File ends (`gg G`), Matching bracket (`%`).

- `<C-d>`/`<C-u>` have no drill yet. Half a screen is 14 lines (window height 28), and the drill page shows the whole buffer, not a window onto it. They need a windowed buffer first.
- `; ,` reps never put the target three finds away: `3fc` would beat `fc;;`, and the solver is right to prefer it. Two finds tie (`fc;` vs `2fc`), and `,` reps need a letter behind the cursor that `b`, `0` and `9h` cannot reach.
- `NG` reps start at least 10 lines below line N, beyond the solver's longest count (`9k`).
- New test: every skill's par uses at least one of its own keys (60 seeds x 3 difficulties), so a solver fallback can never quietly drill a different key.

## 12. Pass B: World 4, Copper Port

Five skills: Delete with a motion (`dw d2w df`), Copy and put (`ye y2e p`), Named registers (`"a "ap`), Change (`cw C`), Copy and move lines (`yy P`).

- Copies start on the space before a word (`ye`, `y2e`), so the put text brings its own space; `yw` then `$p` glued the word to the line end.
- No `y$` rep: `D p .` (cut the tail, put it back, put it again) ties or beats it, and that is good Vim.
- No `yy gg P` rep: `yy <C-u> P` is shorter in any buffer under 15 lines. `yy k P` teaches P instead.
- Named registers and Change are not solver-checked (setup state; typed text), like insert.
- The drill page stacks the target under the buffer: two 46-column sheets do not fit side by side.

## 13. Pass C: World 5, the Library

Five skills: Word objects (`daw ciw d2aw`), Paren objects (`di( ci( da(`), Paragraph objects (`dap d2ap`), Bracket and tag objects (`di[ di{ dit`), Quote objects (`di" ci" da"`). Three HTML lines join the corpus for `it`.

- The cursor always stands inside the object, past its first character and off any bracket or quote, and never inside a nested pair: from the start, `dt)` or `dw` would tie or win.
- `generateRep` now solver-checks every rep of up to 5 keys without setup, not only motions; it caught an old `x` rep (`b j x` beat `10w x`) once the corpus grew.
- The test's "starts solved" check never ran (it read the initial `[false]`); it now checks the goals against the start state, and caught `ci(` reps whose new text equalled the old.
- Typed-text reps (6+ keys) skip the solver: six keys deep over the World 5 allow-list took more than 4 GB.
- `corpusLines` throws when its filter leaves fewer lines than a rep needs; it used to loop forever.

## 14. Pass D: World 6, the Echo Caves

Four skills: Search (`/ ? n`), Search for this word (`* #`), Marks (`m`, `` `a ``, `'a`), Visual selections (`v`, `<C-v>`).

- `` ` ` `` (back to where you jumped from) has no rep: in the engine, `` ` ` `` after `G` lands on the wrong square. Engine bug to fix first.
- `V` has no rep: a count on `dd` or `yy` beats `Vjd` and `Vjy` almost always, so a par built on `V` would be a lie.
- Search reps put the target 10+ lines away with a 3-letter pattern found nowhere else; `/pat<CR>n` reps use a pattern found exactly twice below the cursor. A unique longer pattern can tie or beat the `n` route; typed-text reps are not solver-checked.
- The solver now runs only when (allowed commands)^(par - 1) is at most 10 million (`solverAffordable`), in `generateRep` and in the tests. A 5-key search rep over the World 6 allow-list is about 65 million nodes and gigabytes of memory.
