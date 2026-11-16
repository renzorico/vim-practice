# World 3: Wordwood (design, Opus, 2026-11-16)

World 1 taught moving; World 2 taught changing the world. World 3 teaches jumping to a target: find a character (`f t ; ,`), a paragraph (`{ }`), the top or bottom (`gg G`), a matching bracket (`%`), half a screen (`<C-d> <C-u>`). Every one of these motions tests only its landing cell, so the stages are built from gaps the player cannot walk across.

## Story
The Mason, cured, points west: the Scribe took the canopy road through the Wordwood, a forest grown from words, toward the ferry. The Wordwood's people live in the branches; the ground is a long way down. The Unwriter has cut the rope bridges, so the canopy is a broken line of branches with open air between them.

Main quest `wordwood.ferry`: cross the canopy, get down through the glades, open the Twin Gates, reach the ferry (World 4's port is across the water).
Dot rides in Tilde's hood in this world (it cannot follow across air). It speaks in dialogue only.

Twist seeds: a knothole shows the same wood as saplings, no canopy at all (the file on disk). The Twin Gates were one gate once, before a crash split it (E325 hint, kept vague).

## Stages
| Stage | Teaches | The moment | Needs |
|---|---|---|---|
| 3-1 The Canopy Road | `f t ; ,` | Branches with open air between. `fH` lands on the ladder across every gap; `,` runs the last find backwards on the next tier; `t@` stops one short of the thorns. | nothing new (D-1) |
| 3-2 The Glades | `{ }`, `gg G` | Thickets (paragraphs) separated by clearings (empty rows). `}` drops you clearing to clearing; `G` to the forest floor, `gg` back up to the lookout. | D-2 contract: empty rows |
| 3-3 The Twin Gates (castle) | `%`, `<C-d> <C-u>` | A tall tree-castle. Gates `(` and `)` are linked: `%` on one lands on its match, however far. Nested gates, so the player must pick the right one. `<C-d>` drops half a screen down the trunk while Blots climb. Cure the Twins; statue R. | D-2 contract: scroll |
| 3-4 The Ferry Manifest (text) | all of World 3 on text | Fix the ferry's manifest with `f t ; , % { }` plus World 2's edits. | none |

## Rules (World 1 and 2 lessons, still in force)
1. Progression hangs on stage-cleared or flag reactions, never on a lesson step.
2. The clear follows an entity or a flag, never an absolute area (edits move text).
3. Every stage is proven by the solver, with and without the new commands. The new commands must at least halve the old-tools route; old tools may still clear it (Vim freedom).
4. Word classes matter for landing-only motions: open air (`_`, keyword class) never touches leaves (`v`, keyword); every gap edge is punctuation (`=` or `*`), so `w`/`e` land on air and bump instead of leaping a gap.
5. Field stages never accept insert mode. Insert commands are for text stages only.
6. Ladders, trunks, thorns and the platform are fixed, but a fixed tile can still slide sideways when the player deletes branch cells to its left. Overcounting `x` can misalign a ladder; `:e!` (from World 2) is the retry.

## 3-1 proof (sim, motions only; edits checked by hand)
- With `f t ; ,`: par 7, `fH 2j , 2j t@ 2j fD`, 3 hearts. Without: 13 turns (`4e 6e 9e 2j 5b 6b 7b 2j 4l 2w 2j 5e 9e`).
- `$` bumps on every tier (rows end in trunk); `0` bumps (column 0 is trunk); `<CR>` motion bumps (the next row starts with trunk).
- `dd` bumps on every row (each row holds fixed trunk, so deleting it is cancelled). `x` next to a gap slides air under you and bumps.

## Contract work for 3-2 and 3-3 (D-2, Opus, before those briefs)
1. Empty rows. Today a cursor on an empty line is off the map (`blocked` returns 'edge'), so `{ }` always bump. Proposed: `Legend.emptyRow?: TileDef`. When set, the single position (line, 0) of an empty row is that tile (a clearing). Rendering draws it across the row's width.
2. `<C-d>`/`<C-u>`: the engine does not have them. Proposed: `EngineOptions.scroll?: number` (Vim's 'scroll', default 0 = half of `windowHeight`), plus `windowHeight` for `H M L` later. Golden tests set `:set scroll=N` in Neovim. The game passes the stage's view height.

## Task order
D-1 (3-1, now) -> D-2 (contract: empty rows, scroll) -> D-3 (3-2) -> D-4 (3-3 castle) -> D-5 (3-4 text). One stage per task, Codex builds, Sonnet reviews, Opus browser-checks, Renzo plays.
