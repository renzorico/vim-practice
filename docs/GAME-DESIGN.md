# ESCAPE: game design (Phase 3 redesign, draft for Renzo's review)

Replaces the Phase 2 "list of portals + isolated puzzles" design after the first playtest.
Story: [STORY.md](STORY.md). Visuals: [VISUAL-DESIGN.md](VISUAL-DESIGN.md) ("Ember", chosen 2026-11-10). Process: no code until this doc and the story are approved.

## 1. The pitch in one sentence
You are a stray cursor trapped inside a dying mainframe; you explore it with real Vim motions, and every command you learn is a new way to move, repair and finally escape.

## 2. Design pillars
1. **Playing is practising.** Moving through the world *is* using Vim. No menus to click.
2. **Teach, then test.** Nothing is ever required before the game has shown it.
3. **Never stuck, never shamed.** Clear goals on screen, help that escalates, no penalty while learning.
4. **Old skills stay useful.** The world is built so earlier commands keep paying off (cumulative learning).
5. **Every word serves the story.** No flavour text that is unrelated to the plot.

## 3. The world: an ASCII map you explore with motions

The overworld is a large text map (about 120 x 40 characters) drawn as a real Vim buffer. **The cursor is you.**

```
  #############################################
  #  BOOT SECTOR          :        MEMORY FIELDS
  #                       :   ........  ~~~~~~~~
  #   [N] note    @       :   .  []  .  ~~~~~~~~
  #                       D   ........  ~~ == ~~
  #############################################
```

| Glyph | Meaning | How you interact |
|---|---|---|
| `@` | You (the cursor, highlighted) | Move with any motion you have learned |
| `#` | Wall | Motions cannot end on a wall: the move is cancelled with a soft bump |
| `N` | Operator's note (teaching terminal) | Stand on it, press `<CR>`: a lesson card opens |
| `D` | Door to a challenge room | Stand on it, press `<CR>`: the room loads |
| `K` | Key (reward for a cleared room) | Collected automatically, opens the next sector |
| `~` | Corrupted sector (spaced repetition) | Cleared areas "corrupt" over time and must be repaired with old commands |
| `░` | Unexplored | Revealed as you enter it (fog of war) |

**Motions as abilities.** On the map you may only use commands you have learned. At first you crawl with `hjkl`; after `w` you can hop between landmarks; after `f{char}` you can sprint to an object (`fN` runs to the next note); after `/` you can search the map. Long corridors and wide rooms are built so the newest skill is clearly the efficient way. That is the reward loop: **every lesson makes the world faster to move through.**

**Regions unlock physically.** A new sector's lines appear in the buffer when its door key is earned, so the map literally grows.

## 4. The core loop

```
explore map ─▶ find note (N) ─▶ LESSON ─▶ PRACTICE ─▶ door (D) ─▶ CHALLENGE ─▶ key (K) ─▶ new area
                                                                   │
                                     fail flow (section 6) ◀───────┘
```

1. **Lesson card** (from the Operator, in character): what the command does, *why* you would use it, and an animated replay on a tiny buffer. Example: `$` "moves to the last character of the line".
2. **Practice** (no score, no limit): 2-3 guided micro-tasks with the target cell highlighted and a plain-words goal ("Put the cursor on the X"). The game reacts to each key: "You used `l` 12 times. Try `$`."
3. **Challenge room**: a real puzzle that needs the new skill plus earlier ones. Scored with stars against par.

## 5. Clarity rules (every screen)
- **The goal is always visible in plain words**, plus a marker on the buffer: the target cell glows; a transform goal shows a "TARGET" panel with the differing lines highlighted.
- **Allowed commands are shown** as key caps in the HUD ("You can use: h j k l w $"). A blocked key shows why ("`G` is not unlocked yet").
- **No hidden rules:** if a room requires a skill (`mustUse`), the HUD says so before the first key.
- **Stars never apply to lessons or practice.** In challenges, par is the *optimal* keystroke count, computed by a solver (section 7), and any correct solution earns at least 1 star.

## 6. The help and failure flow (Renzo's rule)

A **failed attempt** = giving up (`:q`, restart) **or** going past 3x par without solving (the room resets with a nudge).

| Failures in this room | What the player gets |
|---|---|
| 1 | Hint 1 offered (vague) |
| 2-3 | Hints 2-3 offered (more specific) |
| **5** | **"Show solution"** button: an explained replay of the optimal solution ("`$` jumps straight to the end; `l` would take 14 keys"). The player then gets a **different room of the same difficulty** (a variant), not a pass. |
| **3 failed variants** | **"Skip room"** appears. Skipping marks the skill as weak: it shows up early in the next corrupted-sector review. |

## 7. Content engine: generators + solver (why variants are possible)
Hand-writing 5+ variants per skill does not scale, and par values written by people or LLMs were wrong (Phase 2 lesson). So:
- **Room generators per skill:** `generate(skill, difficulty, seed) -> Level`. Each generator builds a buffer and a goal from a template (e.g. `$`: a line of random length with the target at its end, distractor punctuation, a second line to make `j` irrelevant).
- **Solver:** a breadth-first search over engine states using only the allowed commands finds the **shortest solution**. That *is* par, and it proves every room is solvable. The same solution feeds the "Show solution" replay.
- **Hand-written rooms** stay for story moments and bosses; they pass through the same solver.
- **LLMs (Ollama, Codex)** write lesson text, notes and room flavour within the story bible. They never decide par or solutions.

## 8. Cumulative learning: corrupted sectors (rechapters)
Each skill has a mastery box (Leitner, already built). As boxes decay, the **Garbage Collector** corrupts sectors you already cleared (`~` on the map). Repairing one is a short mixed room built by the generators from your weakest skills. It's review that lives in the world and the story, not a separate menu.

## 9. What we keep from Phases 1-2
The Vim engine (Neovim-verified), runner, mastery model, level schema and gate, save system, CI, auto-merge, deploy. **Replaced:** the overworld list, the stub-era HUD layout, the CRT style, and the current level content.

## 10. Phase 3 scope (proposal)
1. Approve this doc, STORY.md and the visual mockups (Renzo).
2. Build the map mode (wall collision, notes, doors, fog, keys), the lesson and practice screens, the failure flow, the solver and 6 generators (Region 1 skills plus the Prologue commands).
3. Rewrite the Prologue and Region 1 inside the story.
4. **Gate: Renzo playtests** before Phase 3 counts as done.
