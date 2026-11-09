# P1-C: operators, simple edits, registers, undo
Owns: `packages/engine/src/operators/**`

Implement every export listed under "Operators" in `modules.ts`.

Scope:
1. `operators.d/c/y` over a `Range`. Charwise vs linewise exactly like Vim (e.g. `dj` deletes 2 lines; `d` on a charwise multi-line range joins). Cursor after each op as in Vim. `c` linewise keeps an empty line (with no autoindent) and enters insert. `d` and `c` call `pushUndo` first and set `modified: true`.
2. `writeRegister` with Vim's rules (unnamed, "0, "1-"9 shift, "-, uppercase append, "_ black hole).
3. Simple commands: `x X` (count, stay within line), `r{c}` (count; fails if count exceeds the rest of the line), `p P` (charwise after/before cursor; linewise below/above; count repeats; cursor position like Vim), `D C Y` (`Y` = `yy`, linewise), `J` (join with one space, remove leading whitespace of the next line, count), `u` and `<C-r>` (with `undoStack`/`redoStack`; 'nothing-to-undo' error when empty, message "Already at oldest change" / "Already at newest change").
4. `pushUndo`: push `{ lines, cursor }` to undoStack and clear redoStack.
`dd`, `yy`, `cc` are not here: engine.ts turns them into a linewise Range and calls the operator.
Tests: at least 60 cases.
