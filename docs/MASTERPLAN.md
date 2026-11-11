# UNSAVED (working title, was ESCAPE): masterplan v2

Status: **draft for Renzo's approval, 2026-11-11.** Written by Fable. No code until sections 1-5 are approved.
On approval this replaces `PLAN.md`, `STORY.md`, `GAME-DESIGN.md` and `VISUAL-DESIGN.md` (they move to `docs/archive/`).

Priorities, in order (Renzo): **1 playability, 2 Vim learning, 3 story, 4 visuals.** When two goals conflict, the lower number wins.

## 1. What changes and what stays

| | Before (Phase 3) | Now |
|---|---|---|
| World | ASCII map in a text buffer | 2D top-down tile world with a character, NPCs, enemies |
| Structure | Notes + isolated challenge rooms | 6 worlds of connected stages, quests, a boss castle per world |
| Story | Cursor escapes a mainframe | A full arc with a playable twist (section 3) |
| Pressure | Stars against par | The world moves when you do (section 2.1) |
| Planning | Claude Opus | Fable |

**Kept, unchanged:** the Vim engine (verified against Neovim), the solver, the mastery model, the fail flow, saves, CI, the dispatcher, cross-vendor review. The tile world is still a real Vim buffer underneath, so nothing in `packages/engine` is thrown away. This is a new renderer and a new game layer, not a rewrite.

**Known reference:** Vim Adventures already is "a 2D game that teaches Vim". We do not copy it. Our differences are the turn rule (2.1), a world that is a real buffer you edit (2.2), and the story.

## 2. Game design

### 2.1 The core rule: one command = one turn
You play **Tilde**, seen from above on a tile grid. Nothing moves until you finish a Vim command. Then every enemy takes one step.

- `jjjjj` is five turns. `5j` is one. `w` crosses a gap in one turn that `l` crosses in four.
- So efficient Vim is not a score you are nagged about. It is how you outrun things, and you feel it in the first minute.
- It is deterministic: no timers, no reflexes. The engine stays pure, the solver can still prove every stage is beatable, and replays still work in CI.

This rule is the game. Everything else serves it.

### 2.2 The world is a buffer
Each stage is a text buffer drawn as tiles. Each character is one tile; the tile's class (ground, object, barrier) decides what Vim calls a "word". Every key does exactly what real Vim does to that buffer:

| Vim | In the world |
|---|---|
| `h j k l`, counts | Walk; `5j` is a dash |
| `w b e` | Leap between objects (stepping stones, islands, rooftops) |
| `0 ^ $`, `gg G` | Run to the end of a row; ride a lift to the top or bottom |
| `f t ; ,` | Grapple to a marked tile in your row |
| `x`, `r` | Break the tile you stand on (the row slides toward you); transmute a tile |
| `dd`, `p`, `yy` | Collapse a whole row (the land below shifts up); put it back; duplicate a row to make a bridge |
| `i a o` + `<Esc>` | Build: place tiles, pushing the row along |
| `u`, `<C-r>` | Undo and redo your last change to the world, exactly as Vim does. Enemies and hearts are not rewound. |
| `.` | **Dot**, your companion, repeats your last change |
| `m`, `'` | Drop a beacon, warp back to it |
| `/ ? n N * #` | Sonar: ping a thing by name and jump to it |
| `:w` | Checkpoint, anywhere, for one turn. Die and you return to your last `:w`. Unsaved progress is lost. **Save Stones** heal you and are where the game teaches saving. |

**Script layer.** Vim is a text editor, and operators and text objects cannot be taught honestly on tiles alone. So the world is full of things made of real text: signs, contracts, spell scrolls, machine instructions, letters. Interacting opens the text on a parchment panel, you edit it with real Vim, and the world changes to match. Fix a broken spell with `ci"` and the bridge it describes rebuilds in front of you. Roughly 60% of play is on the field, 40% in scripts, rising in later worlds.

**Source view.** Hold a key to see the raw buffer behind the tiles. It helps skills transfer to real Vim, and it quietly tells the player the world is a file (section 3).

### 2.3 Why people keep playing
1. **Abilities, not lessons.** Each command is a power-up that opens places you already walked past (a ledge that needs `f`, a vault that needs `ci(`).
2. **Short stages:** 2-4 minutes, always one clear goal on screen.
3. **A cliffhanger per castle** (section 3).
4. **Secrets:** hidden glyphs on routes only an efficient command reaches.
5. **Optional mastery:** the solver's best keystroke count is shown after a clear, never before. No stars gate progress.

### 2.4 Learning rules (carried over, non-negotiable)
- Teach, then practise, then test. Nothing is required before the game has shown it.
- Fail flow as designed: hints at 1-3 failures, explained solution at 5, a different stage of the same difficulty, skip after 3 failed variants.
- Review lives in the story: **Unwrite storms** hit cleared stages and rebuild them from your weakest skills (the existing Leitner model).
- Each world ends with one pure-text stage, so the skill is proven outside the tile world too.
- Full Vim fidelity. If real Vim would do it, we do it. Golden tests stay.

## 3. Story bible

### 3.1 Premise
The land of **Folio** was written into being by the **Scribe**, who vanished one night in the **Great Flicker**, when the sky went black for an instant. Since then the **Unwriter**, a hooded figure, has been walking the land deleting it one row at a time. Tilde, a child from the Margin (the edge of the world, where the empty `~` rows begin), sets out to find the Scribe and make them **save** the world before nothing is left.

### 3.2 Cast
| Who | Role | Voice |
|---|---|---|
| **Tilde** | Player. Silent, stubborn. | n/a |
| **Dot** | Small companion found in World 2. Repeats your last change (`.`). Sometimes repeats things you never did. | One or two words, a beat late |
| **The Scribe** | The missing author. Left the Save Stones and the teaching notes. | Warm, precise, a little guilty |
| **The Unwriter** | Deletes rows. Flees every castle. | Never speaks until the finale |
| **The Elder** | Margin village. Keeps the Festival of the Last Saving. | Slow, ceremonial |
| **Blots** | Common enemies: ink that moves one tile per turn. | n/a |
| Castle keepers | One per world, each corrupted by a missing row. Cured, not killed. | One distinct voice each |

### 3.3 Structure (the Mario skeleton, none of its content)
Worlds numbered 1-1 to 6-5. Stage 5 of each world is a castle. In every castle the Scribe has just left, and one line is carved on the wall: **"The Scribe is in another buffer."** One of six statues lights up: O, E, R, D, Q, A.

| World | Place | New commands | Main quest | Castle keeper |
|---|---|---|---|---|
| 0 | **The Margin** | `<Esc>`, `i`, `:w`, `:q` | Sign the village ledger; light your first Save Stone | none |
| 1 | **Lowlands** | `hjkl`, counts, `w b e`, `0 ^ $` | Carry the Elder's warning to the Lighthouse while Blots follow | The Lamplighter (a chase you win with `w` and `$`) |
| 2 | **The Quarry** | `x r`, `i a o A I`, `dd D`, `u <C-r>`, `.` | Reopen the collapsed road; rescue Dot | The Mason (walls you `dd` faster than he builds) |
| 3 | **Wordwood** | `f t ; ,`, `gg G`, `{ }`, `%`, `<C-d> <C-u>` | Cross the canopy to the ferry | The Twin Gates `(` `)` (matched with `%`) |
| 4 | **Copper Port** | `d c y` + motion, `p P`, registers | Restock a blockaded port by copying cargo | The Counterfeiter (out-duplicate him) |
| 5 | **The Library** | `iw aw i" a( ip it`, `ci"`, `dap` | Rewrite the contracts that bind the librarians | The Notary (beaten by editing his own clauses) |
| 6 | **Echo Caves** | `/ ? n N * #`, marks, `v V <C-v>` | Find the Scribe's study in the dark | The Minotaur (found by search, never by walking) |
| F | **The Last Page** | everything, plus a first `:s` | Section 3.5 | The Unwriter |

Quests chain: the Lighthouse keeper's letter is the port's manifest in World 4; the Quarry road you reopen is the shortcut in World 6; the contract you rewrite in World 5 names the Minotaur.

### 3.4 The twist
**The world is a swap file, and so are you.**

The Great Flicker was a crash. The Scribe was editing `folio.txt` and had not saved in a long time. The file on disk holds only the Margin as it was at the Last Saving. Everything since, every world, every person Tilde met, Dot, and Tilde, exists only in `.folio.txt.swp`.

The Scribe has come back and reopened the file. Vim is showing them the real message every Vim user dreads:

```
E325: ATTENTION
Found a swap file by the name ".folio.txt.swp"
[O]pen Read-Only, (E)dit anyway, (R)ecover, (D)elete it, (Q)uit, (A)bort:
```

The Scribe thinks the swap file is junk from a crash. Their finger is over **D**. The Unwriter is that finger. It is not evil. It is tidying up.

**Seeded from the first minute, never stated:**
- The Margin is the only place the Unwriter never touches (it is saved).
- People say "unsaved" the way we say "cursed". The Elder's festival celebrates the Last Saving.
- Through cracks in the world you see an older, emptier Folio (the file on disk).
- Six statues, six letters, one lit per castle.
- Dot sometimes says "attention".
- Source view shows the buffer's name in the corner. It starts with a dot and ends in `.swp`.
- Dying sends you back to your last `:w`. The game has been teaching the twist as a rule.

### 3.5 The ending is played, not watched
The Last Page is the dialog itself: six doors marked O E R D Q A. The Unwriter deletes the page under you while you repair it with every skill in the game; `u` brings back the rows it takes. Then you choose a door.

| Door | What happens |
|---|---|
| **R**ecover, then `:w` | True ending. Folio is written to disk. The swap file, and Tilde with it, is no longer needed: Tilde is not erased, Tilde is *written*. Last screen: `"folio.txt" 4096L written`. |
| **D**elete | The world folds back to the Margin. The Elder is alone at the festival. Restart from the last stage. |
| **Q** / **A** | Nothing is decided. The dialog returns. A joke ending for people who know Vim. |
| O, E | Secret endings, after v1. |

v1 ships R and D. The lesson under the story is real and useful: what a swap file is, what E325 means, and why you save.

### 3.6 Tone
1. The Scribe teaches the *why*: "You could press `l` forty times. Or `$` once."
2. Humour comes from the situation, never from random jokes.
3. The game never mocks a failed attempt.
4. Dialogue: max 2 short lines per box. Notes: max 3 sentences plus an example.

## 4. Tech

```
packages/engine      KEEP, frozen. Pure Vim engine.
packages/world       NEW, pure. World = buffers + tile legend + entities + triggers.
                     stepWorld(world, key) -> { world, events }. Enemies move once per finished command.
packages/story       NEW, data + pure logic. Quests, dialogue, cutscenes (schema-checked), quest state machine.
packages/curriculum  KEEP. Skills, mastery, solver (extended to count turns and enemies).
apps/game            Phaser scene draws events from packages/world. React stays for menus, dialogue, HUD, script panel.
tools/               map linter, solver gate, dialogue linter, Ollama drafter.
```

- **Maps are text files plus a legend.** Cheap for LLMs to draft, easy to diff and review, and they *are* the buffer.
- **New dependency (flagged): Phaser 3**, for tilemaps, camera, tweens and audio. Alternative: hand-written Canvas, which costs about a week more and gives nothing a player sees.
- **Art (flagged): CC0 pixel-art packs (Kenney) as placeholders**, 16 px tiles. A custom art pass comes last, as the priorities say.
- Rule 2 in `AGENTS.md` holds: `engine`, `world` and `story` logic are pure. Only `apps/game` touches the DOM, time or sound.

## 5. Who does what

| Role | Model | Does |
|---|---|---|
| **Design lead** | **Fable** | This plan, story bible, world and boss design, hand-made key stages, contracts, briefs, final review per world |
| **Dispatcher** | Claude Sonnet | Runs `dispatch.sh`, keeps `TASKS.md`, merges green PRs, writes BITACORA |
| **Main builder** | **Codex (GPT)** | `packages/world`, renderer, solver extension, tools |
| **Second builder + reviewer** | Claude Sonnet | Quest and dialogue system, UI, game feel; reviews every Codex PR. Codex reviews every Sonnet PR. |
| **Tests** | Claude Haiku | Edge cases, golden cases, linters |
| **Bulk content** | **Ollama `qwen3:14b`** | NPC lines, sign and scroll text, practice corpora, hint wording, stage variants as text maps |
| **Duplicate and tone check** | Ollama `nomic-embed-text` | Flags near-duplicate or off-bible lines before review |
| **Playtest gate** | Renzo | Plays every world. Nothing is done until he has. |

Ollama's limits are known (Phase 2 pilot: 2 of 6 drafts valid). It never plans and never sets difficulty. A script gives it one tightly scoped item at a time; the schema, solver and a Sonnet review gate everything it writes.

## 6. Phases

| Phase | Goal | Time (part-time) | Gate |
|---|---|---|---|
| **A Design lock** | Renzo approves sections 1-5; Fable freezes `world` and `story` contracts | 1-2 days | Approval |
| **B Vertical slice** | The Margin + stages 1-1 to 1-3 + the Lamplighter castle, placeholder art, sound, saves | 1 week | **Renzo plays 15 minutes and wants more.** If not, redesign before any content. |
| **C Systems** | Quests, script panel, world map, fail flow, Unwrite storms, Source view | 1 week | Slice replays in CI; deep audit |
| **D Worlds 2-6** | One world per pass: Fable designs, Codex and Sonnet build, Ollama fills, Renzo plays | 5 weeks | Playtest per world |
| **E Finale and polish** | The Last Page, both endings, art pass, audio, onboarding, a11y | 2 weeks | Deep audit + full playthrough |

Total: about 10 weeks part-time. Phase B is the only one that matters right now.

### Phase B tasks
| ID | Task | Owner | Reviewer |
|---|---|---|---|
| B-0 | `packages/world` and `packages/story` type contracts | Fable | Codex |
| B-A | `stepWorld`: turn rule, entities, collisions, hearts, `:w` checkpoints | Codex | Sonnet |
| B-B | Phaser scene: buffer + legend to tilemap, camera, movement tweens | Codex | Sonnet |
| B-C | Dialogue and quest state machine, dialogue box, HUD | Sonnet | Codex |
| B-D | Solver counts turns and enemy moves | Codex | Sonnet |
| B-E | Map and dialogue linters, edge-case tests | Haiku | Codex |
| B-F | Stage maps and scripts for the slice | Fable (hand-made) | Renzo |
| B-G | NPC lines, signs, hint wording for the slice | Ollama | Sonnet |
| B-H | Integration, deploy to a preview URL | Codex | Sonnet, then Fable |

## 7. Risks
1. **The turn rule may feel slow.** It is untested. Phase B exists to find out in a week, not in ten.
2. **Tile "words" may confuse.** If `w` on tiles feels arbitrary, objects get visible outlines, and Source view carries the explanation.
3. **Row-shifting edits are hard to design for.** Field editing starts small in World 2 (`x`, `dd`, `u` only); the script layer carries the rest.
4. **Scope.** 33 stages and 7 bosses. Macros, `:g`, windows and the O/E endings are out of v1.
5. **Art.** Placeholder packs look generic. Accepted until Phase E, by priority order.

## 8. Decisions needed from Renzo
1. Story and twist (section 3): approve, or say what to change.
2. Title: **UNSAVED** or keep **ESCAPE**.
3. Phaser 3 as a new dependency.
4. CC0 placeholder art until Phase E.
