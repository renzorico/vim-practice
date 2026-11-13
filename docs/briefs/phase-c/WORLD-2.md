# World 2: the Quarry (design, Opus, 2026-11-13)

World 1 taught moving. World 2 teaches changing the world itself: the player edits the field. Every mechanic below was run in the current sim before it was written down (`3x`, `5r=`, `dd` then `u`, `3dd` then `.`, `A` over the void). Depends on C-1 (exact edit ranges), because all of them happen inside runs of equal tiles.

## Story
The Lamplighter, cured, says the Scribe went south, into the Quarry, but the Quarry road has collapsed. The Quarry is where Folio's stone is cut: rows of rock, rubble, gravel ledges, a river. The Unwriter has been here too, and something stranger: the Mason, the Quarry's keeper, has started building walls everywhere and cannot say why (his missing row is the one that said what the walls were for).

Main quest `quarry.road`: reopen the road south and find out what the Mason is walling in. Side thread: Dot, a small ink-dot creature caged by the Mason, freed in 2-2, then a companion for the rest of the game. Dot speaks one or two words, a beat late, and once says "attention" (twist seed, E325).

Twist seeds in this world: a crack in a quarry wall shows the same wall, emptier (the file on disk); the Mason's ledger lists "Last Saving" as the last day he was paid.

## Stages
| Stage | Teaches | The moment | Characters |
|---|---|---|---|
| 2-1 The Quarry Road | `x`, `3x`, `r`, `5r=` | Rubble blocks the road: `3x` eats it and the row closes up. The river: `5r=` lays five planks in one turn while Blots wait on the far bank. | Foreman Ash (dust, goggles), Kit (young stonecutter), Scribe note |
| 2-2 The Cut | `dd`, `u` | A row of Blots between you and Dot's cage. `dd` wipes the row, and the bridge with it. `u` brings the bridge back, never the Blots. | Dot (caged, then free), Scribe note |
| 2-3 The Mason's Shaft (castle) | `3dd`, `.` | A shaft of terraces: ledge, wall, wall, ledge... `3dd` drops one terrace; `.` repeats it. The Mason adds a terrace at the bottom every 2 turns. Reach him: he wakes. Statue E lights. | The Mason, Dot |
| 2-4 The Quarry Ledger (text) | `i a o A I`, `D`, `<C-r>` | Pure text: rewrite the Mason's ledger so the road crew is paid. Proves World 2's skills outside the tiles. | Mason (voice only) |

## Rules each stage must respect (learned in World 1)
1. Progression hangs on stage-cleared reactions, never on a lesson step.
2. Triggers and gates are regions sized for the longest move the player can make.
3. Every stage is proven by the solver, and checked for skips (`$`, `5$`, `G`, counts).
4. Save only at stage entry.
5. Edit landing: after an edit the cursor's cell must be walkable or the command bumps. Design every editable row so the cell the cursor lands on is walkable (`x`: the next cell; `dd`: the first non-blank of the row that moves up).

## New contract piece (lands with 2-3, Opus)
Entity behaviour `build`: every `every` turns, insert `rows` directly above the entity's own row. The new rows are an entity buffer change, remapped by exact edits (rule 3). Needed for the Mason.

## Task order
C-1 (engine edits) -> C-2 (2-1) -> C-3 (2-2, Dot) -> C-4 (2-3 castle, `build`) -> C-5 (2-4 text). One stage per task, each reviewed by Sonnet, browser-checked by Opus, then played by Renzo. Ollama drafts NPC flavour lines for each stage; Opus picks and edits.

## Ollama drafts kept for 2-1 (qwen3:14b, picked by Opus)
- Ash: "Stone doesn't forget what it's been." / "The crew stands. The wall stands."
- Kit: "I heard the wall whisper once." / "What if we're already gone?" (twist seed)
- Crack in the wall: "The wall was taller once.\nNo one walks this road now."

## 2-3 design decision (Opus, 2026-11-13, paused for the motion fix)
A counted `j` lands on the same cell `dd` does, so walls alone can never force `dd`. Use what only `dd` does: it moves the world, not you. The player stays on row 3 while rows below rise. The shaft below row 3 is the Mason's: a repeatable enter trigger over rows 4..end throws anyone who climbs down back to the start (move-player), so jumping never reaches him. The Mason builds one mortar row directly above himself every turn (new behaviour `build` with a finite `rows` list, so the shaft can never grow past the trap area). Single `dd` gains nothing on him; `3dd` gains two rows a turn; `.` repeats it (Dot teaches `.`). His row holds fixed scaffold, so overshooting bumps. Reach him when his row is directly below yours, talk: cured, statue E, clue.
