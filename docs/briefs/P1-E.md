# P1-E: golden case inputs for motions and operators
Owns: `tools/golden/cases/**`

Write case INPUTS only (no `expect`; a script fills those from real Neovim later).
Format, one JSON array per file: `{ "name": string, "lines": string[], "cursor": [line, col], "keys": string }`, 0-based, keys in Vim notation (`<Esc>`, `<CR>`, `<C-r>`).

Files:
1. `motions.json`: 80 cases. h j k l w b e W B E 0 ^ $ gg G f F t T ; , % { }, with counts.
2. `operators.json`: 60 cases. d c y with motions, dd yy cc, x X r p P D C Y J u <C-r>, registers ("a, "A, "_, "0, "1).
3. `modes.json`: 25 cases. i a I A o O with typed text and <Esc>, <BS>, <CR> inside insert, :q :q! :w :wq :x, /pattern<CR>, n N.
Focus on edges: empty lines, line end, file end, punctuation inside words, tabs, multiple spaces, counts bigger than the text.
Names must say what is tested ("dw at end of line keeps newline"). Validate each file is valid JSON with `node -e`.
Commit when done. No other files.
