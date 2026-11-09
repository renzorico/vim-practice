# P1-B: motions, search helper, marks
Owns: `packages/engine/src/motions/**`

Implement every export listed under "Motions" in `modules.ts`.

Scope:
1. `h l` (stop at line edges, no wrap), `j k` (keep `desiredCol`, clamp to line length - 1), `0 ^ $` (`$` sets desiredCol to "end of line"; use Number.MAX_SAFE_INTEGER), `gg G` (with count: go to line; without: first/last; land on first non-blank, linewise).
2. Word motions `w b e` (keyword chars = letters, digits, `_`; other non-blank runs are separate words; empty lines count as words for w/b) and `W B E` (WORDs = non-blank runs). Cross lines like Vim. `e` is inclusive.
3. `f F t T` with arg, `;` and `,` using `lastFind` (note Vim's `;` after `t` skips the adjacent match). f/t inclusive. Set `statePatch.lastFind`.
4. `%` jumps between ( ) [ ] { } (searching forward on the line for a bracket if not on one), inclusive. `{ }` paragraph motions (blank-line boundaries), exclusive.
5. `findPattern`: plain substring search (no regex in Phase 1), wraps around the end of the buffer like Vim's wrapscan. `n N` repeat `lastSearch`. `* #` search the word under the cursor (whole-word match) and set `lastSearch`.
6. Marks: `setMark` stores the cursor in `marks[name]` (a-z). `'` is linewise to the first non-blank of the mark's line, `` ` `` is exact and exclusive.
Counts: every motion repeats `count` times where Vim does. Tests: at least 80 cases, include edges (empty lines, end of file, punctuation, counts larger than possible).
