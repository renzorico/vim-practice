# World 4: Copper Port (design, Opus, 2026-11-17)

World 1 taught moving, World 2 changing the world, World 3 jumping to a target. World 4 teaches the grammar: an operator plus a motion (`d`, `y`, `c` with `w`, `$`, `t`, `f`, `}`), putting text back (`p`, `P`), and registers. The port is blockaded and its shelves are empty; the player restocks it by copying cargo.

## Story
The ferry docks at Copper Port. Since the Flicker no ship has come in, and the Harbourmaster keeps the shelves full the only way left: someone is copying cargo, and the copies are fakes. The Counterfeiter turns out to be the port's old clerk, who lost the row that said which crates were real.
Main quest `port.restock`: clear the jetty, restock the warehouse from the stock rows, sort cargo through customs, beat the Counterfeiter at his own game, and fix the Harbourmaster's ledger. Quest chain (MASTERPLAN 3.3): the Lighthouse keeper's letter is the port's manifest.
Twist seed: the yank register `"0` "remembers what you copied even after you delete something": the first hint that copies outlive their source (the swap file).

## Stages
| Stage | Teaches | The moment | Needs |
|---|---|---|---|
| 4-1 The Jetty | `d` + motion, backwards: `db`, then `.` | Junk dumped on the jetty behind you. The cart needs the boards clear, end to end (a text trigger). The boards are fixed and the junk is not walkable, so `x` and `r` cannot do it: only a delete that stops short of your own board. `db` clears a pile and the boards slide up to you. Forward `dw`/`dt` come in 4-2 and 4-3. | E-1 |
| 4-2 The Warehouse | `y` + motion (`yw`, `y4l`), `p`; the yank holds one thing | Three bare shelves and a tally (one oil rack, one rope rack) that must stay put. `yw f[ p` copies a rack onto the shelf in its row; the middle oil shelf has no rack, so `p` again; the rope yank replaces the oil, so order matters. `P` and `yy` move to 4-4. | E-1 text trigger, E-3 undo exemption |
| 4-3 Customs | registers `"a`-`"z`, `"0` | Crate 1 behind nets on the oil rack's row: `yw`, `db` the nets, and `p` would put nets (it bumps): `"0p`. Crate 2 wants oil then rope, and the rope rack is far: `"byw` carries it. Registers save a round trip (16 vs 20). `P` is left for 4-5. | E-3 |
| 4-4 The Counterfeiter (castle) | counts on `p` (`"a8p`), `.`; World 4 together | The clerk puts a fake after himself every 2 turns (new behaviour `put`); at eight fakes he files his count and the attempt is lost (new effect `hit`). Fill three crates on one row first: 8 oil, 8 rope, 4+4. Par 12; without registers 18 (fuse at 16). Statue D. `P` is not needed anywhere in World 4: it is left for the text stage. | E-5 (contract: `put`, `hit`) |
| 4-5 The Harbourmaster's Ledger (text) | `c` + motion (`cw`, `ct`, `C`), all of World 4 | The Lighthouse letter becomes the port manifest: change words, move lines. | none |

## Rules (Worlds 1-3, plus what the prototype showed)
1. Progression on stage-cleared or flag reactions; clear follows an entity or flag, never an absolute area.
2. Proven by the solver; the new commands must clearly beat old tools.
3. `c` only in text stages: in the field it opens insert mode, and typing would write terrain anywhere. Field stages never take insert mode.
4. Operator landing (measured in the sim on `#.xxxxx..|...#`, cursor on the first junk): after `d{motion}` the cell that slides under the cursor must be walkable, or the command bumps. `dw` and `dt.` work (boards slide in). `dt|` bumps (the bollard slides under you). `d$` bumps 'fixed' (it would delete the bollard). So junk must end on boards, and `t`/`f` targets are the boards' edge, not the wall.
5. `yyp`/`dd` + `p` land on the new row's first non-blank: rows that will be put must start with a walkable cell.
6. Paste shifts the rest of the row right, fixed tiles included. Put fixed tiles only where sliding is harmless, and mark shelves with an anchor entity, never an absolute column.
7. Jumps fly over anything (only the landing cell is checked), so junk is never a wall. A goal that needs an edit is a text trigger on an anchor, and its text includes the next fixed tile so the walkway's length counts: `r` can paint junk into boards but cannot shorten the row (measured on 4-1: `13r.` matched a dots-only text).
8. Put lands the cursor on the last put cell, which must be walkable: rack and shelf lips `]` are not walkable, so a yank that includes one cannot be put (measured on 4-2). Cargo is not fixed (so `u` and `x` fix an overfill); undo and redo are exempt from the fixed rule (E-3), so a put of fixed tiles can be taken back.

## Contract (E-1, Opus, on this branch)
`Trigger` gains `{ on: 'text'; anchor: EntityId; text: string }`: fires at turn end when the `text.length` characters right after the anchor entity's cell are exactly `text`. The anchor remaps with edits, so the check follows the shelf.

## Task order
E-1 (text trigger, solver operators and registers) -> E-2 (4-1) -> E-3 (4-2) -> E-4 (4-3) -> E-5 (4-4 castle; design the Counterfeiter's behaviour first) -> E-6 (4-5 text).
