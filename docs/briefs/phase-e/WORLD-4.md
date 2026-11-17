# World 4: Copper Port (design, Opus, 2026-11-17)

World 1 taught moving, World 2 changing the world, World 3 jumping to a target. World 4 teaches the grammar: an operator plus a motion (`d`, `y`, `c` with `w`, `$`, `t`, `f`, `}`), putting text back (`p`, `P`), and registers. The port is blockaded and its shelves are empty; the player restocks it by copying cargo.

## Story
The ferry docks at Copper Port. Since the Flicker no ship has come in, and the Harbourmaster keeps the shelves full the only way left: someone is copying cargo, and the copies are fakes. The Counterfeiter turns out to be the port's old clerk, who lost the row that said which crates were real.
Main quest `port.restock`: clear the jetty, restock the warehouse from the stock rows, sort cargo through customs, beat the Counterfeiter at his own game, and fix the Harbourmaster's ledger. Quest chain (MASTERPLAN 3.3): the Lighthouse keeper's letter is the port's manifest.
Twist seed: the yank register `"0` "remembers what you copied even after you delete something": the first hint that copies outlive their source (the swap file).

## Stages
| Stage | Teaches | The moment | Needs |
|---|---|---|---|
| 4-1 The Jetty | `dw`, `dt`, `df`, `d}` (d + World 1-3 motions) | Junk piled on the only walkway. `dw` or `dt.` clears a whole pile in one turn and the boards slide to you; `x` would take one turn per crate. | E-1 solver ops |
| 4-2 The Warehouse | `yl`/`y4l`, `yw`, `p`, `P`, `yy`/`p` | Empty shelves marked `[`. Yank four oil from the stock row, walk to the shelf, `p`. The quartermaster checks each shelf. | E-1 text trigger |
| 4-3 Customs | registers `"a`-`"z`, `"0` | Two cargo kinds, two shelves. Clearing junk with `d` overwrites what you yanked; `"0p` still has it. `"ay` / `"bp` keep cargo apart. | E-1 |
| 4-4 The Counterfeiter (castle) | counts on `p`, `.` | He pastes fakes onto the shelf every few turns; you out-copy him with `4p` and `.`. Statue D. | E-1, maybe a new behaviour |
| 4-5 The Harbourmaster's Ledger (text) | `c` + motion (`cw`, `ct`, `C`), all of World 4 | The Lighthouse letter becomes the port manifest: change words, move lines. | none |

## Rules (Worlds 1-3, plus what the prototype showed)
1. Progression on stage-cleared or flag reactions; clear follows an entity or flag, never an absolute area.
2. Proven by the solver; the new commands must clearly beat old tools.
3. `c` only in text stages: in the field it opens insert mode, and typing would write terrain anywhere. Field stages never take insert mode.
4. Operator landing (measured in the sim on `#.xxxxx..|...#`, cursor on the first junk): after `d{motion}` the cell that slides under the cursor must be walkable, or the command bumps. `dw` and `dt.` work (boards slide in). `dt|` bumps (the bollard slides under you). `d$` bumps 'fixed' (it would delete the bollard). So junk must end on boards, and `t`/`f` targets are the boards' edge, not the wall.
5. `yyp`/`dd` + `p` land on the new row's first non-blank: rows that will be put must start with a walkable cell.
6. Paste shifts the rest of the row right, fixed tiles included. Put fixed tiles only where sliding is harmless, and mark shelves with an anchor entity, never an absolute column.

## Contract (E-1, Opus, on this branch)
`Trigger` gains `{ on: 'text'; anchor: EntityId; text: string }`: fires at turn end when the `text.length` characters right after the anchor entity's cell are exactly `text`. The anchor remaps with edits, so the check follows the shelf.

## Task order
E-1 (text trigger, solver operators and registers) -> E-2 (4-1) -> E-3 (4-2) -> E-4 (4-3) -> E-5 (4-4 castle; design the Counterfeiter's behaviour first) -> E-6 (4-5 text).
