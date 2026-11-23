# The Last Page (finale, design draft, Opus, 2026-11-23)

MASTERPLAN 3.4-3.5. The world is a swap file. The Scribe has reopened `folio.txt` and Vim shows E325; the Unwriter is the Scribe's finger over D, tidying up. The Last Page is that dialog, played: six doors O E R D Q A, one per statue (Lowlands O, Quarry E, Twin Gates R, Counterfeiter D, Notary Q, Minotaur A).

## Shape
- F-1 stage `last-page` (world `last-page`, type `field`), after the Scribe's Study ("End of World 6.").
- The page is the dialog text itself, rows of it. The Unwriter (behaviour `unwrite`, already in the contract) deletes one row of the page each time it acts, from the bottom up, along its path. A deleted row under the player displaces and hits (World contract rule 3).
- `u` brings back the rows it takes (entity changes are on the undo stack): the core move, as MASTERPLAN 3.5 says. `<C-r>` lets him take them again: a trap for the curious.
- The way to the doors needs every world: a word to `daw`, a bracket chain to `da(`, cargo to `"ayl`/`p`, a sealed pocket to `/` into and `` `a `` out of, a `<C-v>` column. Short, one moment per world, under the Unwriter's pressure.
- The doors row: `[O] [E] [R] [D] [Q] [A]` as text. Standing on a door and `<CR>` chooses. R asks for `:w` next: the true ending (`"folio.txt" 4096L written`). D: the delete ending (the world folds back to the Margin; restart from the last stage). Q and A: the dialog returns (joke). O and E: locked in v1 ("after v1").

## Open questions (prototype before the brief)
1. Unwrite pacing: every 3 turns, bottom-up, against a route of about 20 turns; does `u` keep up without trivialising it? Measure in the sim (the E-5/F-5 rule: check pressure against what the lesson's commands do: `u` also undoes the player's own last edit, which may be the point).
2. Endings need story/app work: an `ending` effect exists in the story contract (`recover`, `delete`, `quit`); the app needs the ending screens.
3. Save on R: `:w` already exists in the field (rule 5). The true ending fires on `:w` after R.

## Prototype findings (Opus, 2026-11-23)
- `unwrite` deletes a row each act; `u` brings it back, but only when his deletion is the most recent change: the undo stack interleaves his deletions and the player's edits. With the Unwriter every 3 turns the rhythm is: `u` right after he strikes, then two turns of repair, then he strikes again. Undo at the wrong moment undoes the player's own repair (measured: `jjdd` then `u` brought the junk row back).
- Rows with a fixed cell cannot be deleted or moved, so the dialog rows must be all non-fixed; the anchor for the repaired-page text trigger sits on a fixed top row that he never eats.
- A naive layout (doors at the bottom, he eats upward) is solved in two turns by `/R<CR>` and `:w`: the doors must be locked until the page is repaired.
- Decided (Renzo, 2026-11-23): the undo-timing rhythm is the finale. (Was: is the undo-timing rhythm the finale (hard, very Vim, very much the swap-file story), or should the Unwriter only threaten rows the player is not editing (easier, more readable)? Everything else in this draft holds either way.

## Task order
H-1 (the Last Page stage, prototype first) -> H-2 (ending screens and credits) -> polish phase (art, audio, onboarding, a11y: MASTERPLAN phase E).
