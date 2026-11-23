# World 6: The Echo Caves (design, Opus, 2026-11-23)

Worlds 1-5 taught moving, changing, jumping, the grammar and its objects. World 6 teaches finding: search (`/ ? n N * #`), marks (`m`, `` ` ``, `'`), and selecting what you found (`v V <C-v>`). The caves are dark: you cannot see far, but search does not need to see. The Minotaur is "found by search, never by walking" (MASTERPLAN 3.3).

## Story
Under the Library, the Echo Caves. The contract named the Minotaur as their guardian. The Scribe's study is somewhere in the dark, and every echo in the caves repeats a word of hers. The Quarry road the player reopened in World 2 is the shortcut down (quest chain, MASTERPLAN 3.3).
Main quest `caves.study`: enter the dark, follow the echoes, mark the way, face the Minotaur, and open the Scribe's study. The study is the last stop before the Last Page (finale).

## Stages (draft)
| Stage | Teaches | The moment | Needs |
|---|---|---|---|
| 6-1 The Mouth | `/x<CR>`, `n` | The cave is dark beyond a small radius around you (drawing only: the sim is unchanged). Glowing crystals mark the way; `/` jumps to a crystal you cannot see, `n` to the next. `f` only works on your row; `/` crosses rows. | G-1 |
| 6-2 The Echo Gallery | `*`, `#`, `?`, `N` | Words echo: the same word appears in several chambers. Standing on one, `*` jumps to the next copy, `#` back. Only the right copy opens the way on. | G-1 |
| 6-3 The Marked Way | `ma`, `` `a ``, `'a` | A long errand from a fork: mark the fork, run the errand, `` `a `` back in one jump. Two marks for the Quarry shortcut. | G-1 |
| 6-4 The Minotaur (castle) | search under pressure | A labyrinth; the Minotaur roams (a chaser, World 1). Walking finds dead ends; search jumps over walls (landing checked only). Design first (rule 7 of World 5: check the pressure against what search does: it jumps anywhere, so a chaser cannot corner a player who searches). Statue A. | G-1 |
| 6-5 The Scribe's Study (text) | `v`, `V`, `<C-v>` with `d c y I A`, all of World 6 | The study's index is a table: `<C-v>` edits a column on every row at once. The last door to the Last Page. | G-1 |

## Rules (carried over)
1. Progression on stage-cleared or flag reactions; clear follows an entity, a flag or a text trigger.
2. Proven by the solver where it can reach; otherwise par is a hand route and a replay test, with a cheap bound on the old vocabulary (steps, not wall-clock: BITACORA F-4).
3. `c` and insert only in text stages.
4. Search is a jump: only the landing cell is checked. Darkness is drawing only, never a sim rule.
5. Tile kinds follow the contract (punctuation `barrier`, letters `object`, space and tab `ground`): check before writing a brief (BITACORA F-3).
6. Story order: a trigger's line reactions before the flag reactions that cascade from it (E-3).
7. A pressure mechanic must be checked against what the lesson's commands do to the player (E-5, F-5).

## Task order
G-1 (block visual, search operators, search and marks in the solver) -> G-2 (6-1) -> G-3 (6-2) -> G-4 (6-3) -> G-5 (6-4 castle, design the Minotaur first) -> G-6 (6-5 text). Then the finale (the Last Page).
