# P1-A: modes, insert mode, command line, ex commands
Owns: `packages/engine/src/modes/**`

Implement every export listed under "Modes" in `modules.ts`, in `modes/index.ts` (split into more files under `modes/` if useful).

Scope:
1. `enterInsert` for i a I A o O. `o`/`O` open a line (call `deps.pushUndo` first). Cursor rules as in Vim (`a` on an empty line, `A` at end of line).
2. `handleInsertKey`: printable characters, `<BS>` (joins with previous line at col 0), `<CR>` (splits line), `<Esc>` (normal mode, cursor left by 1 unless col 0). Set `modified: true` on edits. Append each key to `changeInProgress` if it is not null.
3. `enterCommandLine` / `handleCommandLineKey`: typing, `<BS>` (on empty line exits to normal), `<Esc>` cancels, `<CR>` executes.
4. Ex: `:q` (E37 error if modified: "E37: No write since last change (add ! to override)"), `:q!`, `:w` (saved true, modified false), `:wq`, `:x` (writes only if modified, then quits), `:{n}` go to line n (first non-blank). Unknown -> error code 'unknown-command' with Vim's message "E492: Not an editor command: <cmd>".
5. Search `/pattern<CR>` and `?pattern<CR>`: use `deps.findPattern` from the cursor, move there, set `lastSearch`. Not found -> 'pattern-not-found', "E486: Pattern not found: <pattern>". Empty pattern reuses `lastSearch`.
6. `enterVisual` sets `visualAnchor` to the cursor; `exitToNormal` clears it, clears `commandLine`.
Tests: at least 40 cases.
