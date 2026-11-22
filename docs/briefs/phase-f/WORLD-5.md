# World 5: The Library (design, Opus, 2026-11-22)

World 4 taught the grammar: operator + motion. World 5 teaches the other half of the grammar: operator + text object. A motion says "from here to there"; a text object says "this thing", wherever the cursor is inside it: `diw`, `da(`, `ci"`, `dap`, `dit`. The Library is chained shut by contracts, and every clause is a thing you can name.

## Story
Past the harbour, a library with its doors chained. Every chain is a contract: the librarians signed away the shelves, the reading room, the archive, one clause at a time, to the Notary, who has kept the place "in order" since the Flicker by making sure nothing can be changed. The player frees the Library by editing the contracts clause by clause.
Main quest `library.unbind`: clear the stacks, open the reading room, sort the archive, out-edit the Notary, and rewrite the founding contract. Quest chain (MASTERPLAN 3.3): the contract you rewrite names the Minotaur (World 6).
Twist seed: a clause in the founding contract is in the Scribe's hand: "In case of loss, recover."

## Stages (draft)
| Stage | Teaches | The moment | Needs |
|---|---|---|---|
| 5-1 The Stacks | `diw`, `daw`; then `.` | Dust (junk words) lies between rows of books. `dw` from the middle of a pile leaves half of it; `diw` takes the whole word wherever you stand on it; `daw` takes the space too, so the row closes up to the right length (text trigger, rule 7 of World 4). | F-1 |
| 5-2 The Reading Room | `di(`, `da(`, `i[`/`a[`, `i{`/`a{` | Chains are bracket pairs `(...)` across the floor. `%` (World 3) finds the partner; `da(` removes the chain and its locks in one go from anywhere inside. Nested chains: `d2a(`. | F-1 |
| 5-3 The Archive | `dap`, `yap` + `p`, `ip` | Paragraphs are blocks of rows between blank rows (World 3's `{ }`). A wrong block sits in the middle of the archive: `dap` lifts it whole, `p` puts it in its place (rows, so World 4 rule 5 applies: rows that will be put start walkable). | F-1 |
| 5-4 The Notary (castle) | all World 5 objects under pressure | Design first (as 4-4). Idea: the Notary re-signs a clause every few turns (a `put` of a quoted clause, World 4's behaviour); you delete his clauses with `da"` faster than he signs them, while opening the way. Statue Q. | F-1, maybe a new behaviour |
| 5-5 The Founding Contract (text) | `ci"`, `ci(`, `cit`, `cap`; all of World 5 | The contract is text in quotes, parentheses and tags. `ci"` rewrites a clause without touching its quotes; `cit` the content of a tag; `dap` strikes a paragraph. Names the Minotaur. | F-1 |

## Rules (carried over, plus what World 4 showed)
1. Progression on stage-cleared or flag reactions; clear follows an entity or flag.
2. Proven by the solver where it can reach; otherwise par is a hand route and a replay test, with a cheap bound on the old vocabulary (measure steps, not expansions).
3. `c` only in text stages. Field stages use `d`/`y` with objects.
4. Text objects do not care where in the object the cursor is: design moments where the cursor lands in the middle of the thing (after a jump), so a motion would only get part of it.
5. Goals that need an edit are text triggers that pin length with the next fixed tile (World 4 rule 7).
6. Story order: list a trigger's line reactions before the flag reactions that cascade from it (E-3).
7. A pressure mechanic must be checked against what the lesson's own commands do to the player (E-5).

## Task order
F-1 (text objects in engine and solver) -> F-2 (5-1) -> F-3 (5-2) -> F-4 (5-3) -> F-5 (5-4 castle, design the Notary first) -> F-6 (5-5 text).
