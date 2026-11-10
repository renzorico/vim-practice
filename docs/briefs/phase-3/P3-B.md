# P3-B: room generators for the 10 Prologue and Region 1 skills
Owns: `packages/curriculum/src/generators/**`

Implement every export in the "Room generators" section of `phase3.ts`, in `generators/index.ts` (one file per generator is fine).
Skills (catalog): ex.q, ex.q!, mode.insert, ex.wq, motion.hjkl, motion.word, motion.WORD, motion.line, motion.file, motion.count.
Design rules (this is the point of the task; read docs/GAME-DESIGN.md §5 and §7):
1. **The taught skill must be clearly the efficient path.** Make the alternative tedious (e.g. `$`: the target is 25+ columns away, `l` allowed but slow). Difficulty 1 = obvious, 2 = add a distractor or a second step using an earlier skill, 3 = combine with earlier skills.
2. **Clarity:** reach goals only on visible characters; a plain `goalText` ("Put the cursor on the X at the end of line 2."); mark the target with a distinctive glyph when it is a reach goal (X, K, or a word in capitals); 2-3 hints from vague to specific; intro one sentence in the story's world (ATLAS, the Operator, ECHO, GC; see docs/STORY.md tone rules).
3. Buffers 3-8 lines, lines <= 60 chars, words drawn from a small themed vocabulary (machine, power, cable, signal, sector, memory...).
4. Prologue skills (typing text, :q, :q!, :wq): build them with quit/transform goals; their intendedSolution includes typed text.
5. `finalizeRoom(room, solve)`: as specified; inject `solve`, never import the solver.
Tests: for every skill x difficulty x 20 seeds: the room parses with `parseLevel`, `intendedSolution` replays to 'won' through the real runner within `intendedSolution.length`, ids follow the pattern, determinism (same seed = same room), different seeds give different rooms. Use a fake `solve` in finalizeRoom tests.
