# Challenge audit, 2026-11-26

Renzo, playing the Lowlands: "extremely easy... a shortcut 5$ to complete it without talking to the other character...
Game must be non-repetitive but somehow represent a challenge... otherwise there is no sense of achievement."

Run after the path rule (PR 117). Tool: `apps/game/src/play2/audit/challengeAudit.test.ts`, one stage per process,
about 150 MB and 1-2 s each:

```bash
AUDIT_STAGE=lowlands AUDIT_OUT=/tmp/audit npx vitest run apps/game/src/play2/audit
```

## Method and limits

- **Shortcut probe.** From each stage's start, in the real session (story, triggers, clear rules): every motion the
  stage allows with every count 1-40, every one-character `/` and `?` where search is allowed; then any one plain
  motion; then a talk. A clear in fewer turns than par is a shortcut. Probes that end in the same state (cursor,
  remembered column, last search and find, text, flags, fired triggers) are explored once. This is how `5$` (Lowlands) and `/.`, `23e`,
  `8Ge` (Gallery) were found. Checked: on the old Gallery map it finds `?y<CR>`, 1 turn against par 6.
- **Not proof.** Routes of three or more moves are not searched. A full solver search over a late stage's whole
  vocabulary needs more than 4.5 GB (tried; it dies). Where a stage's `allowedCommands` is small (the Gallery now),
  the full search fits and is the real proof.
- **Par route.** Reads each stage's stored solution for the keys the stage teaches, and replays it to count the
  conversations it starts (interact triggers that fire; a `<CR>` that submits a search is not one).
- **Text stages** (Ledger, Manifest, Harbour, Contract, Study) are script edits; their par is in keystrokes inside
  the script. Audited separately: see "Text stages" below.

## Results

| Stage | Par | Shortcut | Taught | Par route uses | Talks (route / available) |
|---|---|---|---|---|---|
| Margin | 6 | none | h j k l | j k l | 2 / 4 |
| Lowlands | 4 | none | 0 w b e $ | e $ | 1 / 3 |
| Lighthouse | 7 | none | - | - | 1 / 1 |
| Quarry Road | 3 | none | x r | r | 1 / 5 |
| Cut | 4 | none | dd u C-r | dd u | 1 / 2 |
| Shaft | 3 | none | . | (none) | 1 / 1 |
| Canopy | 7 | none | f t ; , | f t , | 1 / 4 |
| Glades | 4 | none | { } gg G | G | 3 / 3 |
| Gates | 8 | none | % C-d C-u | % | 3 / 4 |
| Jetty | 6 | none | d | d | 1 / 2 |
| Warehouse | 15 | none | y p | y p | 1 / 1 |
| Customs | 16 | none | " | " | 1 / 1 |
| Counter | 12 | none | - | - | 0 / 1 |
| Stacks | 6 | none | iw aw | aw | 1 / 1 |
| Reading | 6 | none | i( a( ib ab | i( a( | 1 / 1 |
| Archive | 8 | none | ip ap | ap | 0 / 0 |
| Notary | 11 | none | i[ a[ i{ a{ iB aB it at | a[ a{ it | 0 / 0 |
| Mouth | 4 | none | / ? n N | ? n | 1 / 1 |
| Gallery | 5 | none | * # | # | 1 / 1 |
| Marked | 4 | none | m ` ' | m ` | 1 / 1 |
| Labyrinth | 5 | none | - | - | 0 / 0 |
| Last Page | 15 | none | - | - | 0 / 0 |
| Ledger, Manifest, Harbour, Contract, Study | script | see Text stages | | | |

**Update 2026-11-27 (World 1 redesign):** Margin par 6 uses `h j k l`; Lowlands par 11 uses `w b e $` and needs Wren;
the Lighthouse par 7 teaches and uses `0`. Checked by `apps/game/src/play2/challenge.test.ts`.

**Update 2026-11-27 (World 2 redesign):** Quarry Road par 10 uses `x r` and needs Ash, the note and the gate; the
Cut par 6 uses `dd u <C-r>` (`<C-r>` is the only one-turn way back); the Shaft par 6 uses `.` (it ties with retyping
`4dd`: a turn each). No shortcut in the probe for any of them. Runs (`w b e 0 $`) now stop at rock on their own row
too; the Gallery's par went 5 to 6 under that rule.

**Update 2026-11-27 (World 3):** the Canopy (par 7) uses `f t ; ,`, the Glades (par 4) `{ } gg G`, the Gates (par 8)
`% <C-d> <C-u>`. No shortcut in the probe. `;`, `{ } gg` and counted scrolls tie another one-turn command.

**Update 2026-11-27 (World 4):** unchanged and passing: Jetty `d`, Warehouse `y p`, Customs `"` on their par routes,
no shortcut in the probe. Counter teaches nothing new.

**Update 2026-11-27 (Worlds 5-6):** every field stage that teaches a key now has it on its par route
(`challenge.test.ts`, 19 stages). Pars changed: Stacks 8, Archive 7, Notary 12, Marked 4 (proven). Text stages are still
not audited.

**Update 2026-11-27 (Marked):** the Marked allows no search or counted `G`, so marks are the only way to the oil and
back; par 7, proven over the stage's whole vocabulary, and no clear without `m`, `` ` `` or `'`. It joins
`challenge.test.ts`.

**Update 2026-11-27 (World 7):** the Last Page is unchanged: its clear needs the repaired page, the R door and `:w`
(own block in `challenge.test.ts`, since `:w` is an Ex command). No shortcut in the probe; par 15 is best-known.

## Text stages, 2026-11-27

Tool: `apps/game/src/play2/audit/textAudit.test.ts` (off in CI; `AUDIT_TEXT=1 AUDIT_OUT=/tmp/audit npx vitest run
apps/game/src/play2/audit/textAudit.test.ts`). It replays each stored route, lists the taught keys it uses, and cuts
every span of 1-8 keys out of it to see whether the script still solves. Codex then golfed each script; every route
below replays through the real engine (`audit/solvedAt.ts`). Best-known, not proven: a key-by-key search cannot reach
a 26-163 key optimum.

| Stage | Par | Best known | Taught | Par route uses | Skips |
|---|---|---|---|---|---|
| Ledger | 38 | 35 | o D i a A Esc | o D Esc | i a A |
| Manifest | 57 | 53 | (none new) | | |
| Harbour | 100 | 92 | c C P yy | c C P yy | |
| Contract | 163 | 151 | i" a" | i" | a" |
| Study | 35 | 26 | v V C-v | C-v | v V |

**Findings, worst first**

1. **Text stages are unscored.** `isScoredStage` is false for `type: 'text'`: the player never sees par or stars,
   so nothing rewards a short edit. This is where "no sense of achievement" is strongest.
2. **Every par is too loose,** by 3 (Ledger) to 12 (Contract) keys. Examples: the Study's first block delete is
   wasted (`8w`, then one `<C-v>7j$c` changes both columns); `ci(` and `ci[` find their brackets without `0f(`.
3. **Taught keys skipped:** the Ledger never needs `i a A` (only `o` and `D`), the Contract never needs `a"`, the
   Study never needs `v` or `V`. The golfed routes skip the same keys.
4. **No shortcut found by cutting spans** except the Contract (161) and the Study (29); the rest of the slack needs
   a different route, not fewer keys of the same one.

Golfed routes (keys joined; a space is a typed space):

- Ledger 35: `jdd$b2xj.j.0llrajdd2w2x4lDjddodoor<Esc>`
- Manifest 53: `fo;xj$i, Shut, Ope<Esc>10er4jddG3wDatoday.<Esc>k$i, on three<Esc>`
- Harbour 92: `7wct,Ream<Esc>GddggP5jddp$bCreal<Esc>kb.}b.5wCthe ferry, today<Esc>yyp3wct,rope boat<Esc>5wCTilde, for Ream<Esc>`
- Contract 151: `2jci"the Librarians<Esc>9j.j.j.3G$bcwReaders<Esc>}jci(unless they want to<Esc>j0ci[until the Scribe returns<Esc>}jdap$citTilde<Esc>}jct Guardian of<Esc>3whC: the Minotaur.<Esc>jdd`
- Study 26: `8w<C-v>7j$cfound<Esc>0<C-v>7jI* <Esc>}j3dd`

**Next:** per stage, as for the field stages: set par to the best known, then reshape the target text so each
taught key is on the shortest route (an append only `A` reaches, a linewise block only `V` cuts cleanly, a quoted
string `a"` removes with its quotes), and decide whether text stages show keys against par.

**Update 2026-11-27 (text stages redesigned):** every text stage's par is now the best route found, and each taught key
is on it. Pars: Ledger 52, Manifest 53, Harbour 90, Contract 154, Study 30, checked by `challenge.test.ts`. New text:
the Ledger's title needs `i` and `A` and a smudged "Kt" needs `a`; the Contract's Clause 2 has an "always" only `da"`
removes in three keys; the Study's final line is split, with a scribble before "Last", so `vjd` mends it. Three Codex
golf rounds: without `A`, `a` or `o` the Ledger takes 53, without `v` the Study 31; no route without `a"`
was found at 154 or less. Ties: the Study's `V` (`Vd`, `dd`), the Contract's `i"` (`cw`), the Ledger's `i` (`I`). Visual mode has no `p`,
so `V` cannot win outright. Text stages are now scored in keys against par (same stars as field stages).

**Update 2026-11-28 (World 3, step 3):** before: 12 scored field stages under par 8, no par route lost a heart. Glades
par 4 to 6 (proven) with a blot only a counted `{` skips and a gate room; Canopy and Gates keep par 7 and 8 but now
have a blot that hits the slower route (single `j`, `Ctrl-d` twice) and not the par route.

## Findings, worst first

1. **Stages are short.** Seven of the 22 field and castle stages clear in 4 turns or fewer (Quarry Road 3, Shaft 3,
   Lowlands, Cut, Glades, Mouth, Marked 4). A key is met and used once or twice; there is no second room where it is
   needed in a new way. This is the "no sense of achievement" Renzo felt.
2. **The best route skips keys the stage teaches.** The Lowlands teaches `w` and its par route never presses it (`5e`
   instead); the Shaft teaches `.` and never needs it; the Glades teaches `{ } gg G` and needs only `G`; the Gates
   needs `%` but not `<C-d> <C-u>`. A player can clear these without the lesson, and an expert never meets it.
3. **Characters are optional.** Quarry Road has 5 people to talk to and the route needs 1; Margin 2 of 4; Canopy 1
   of 4. Optional side characters are fine; but where the story says "talk to X" the clear rule should need it, as the
   Lowlands door now needs the Scribe's note.
4. **Shortcuts:** none left within two moves and a talk, after the path rule. Deeper ones are not ruled out except in
   the Gallery (full search).
5. **Hearts rarely matter** (Renzo's earlier report; not measured here): few stages have enemies on the par route.

## Recommended next steps

For each world, in order:

1. **Every taught key on the par route.** Add a test per stage: the stored par route uses each key the stage
   teaches. Redesign until it holds (a second room that needs `w` and not `e`; a row of blots only `.` clears).
2. **Required story beats in the clear rule**, as in the Lowlands: the door needs the characters the story sends
   you to.
3. **Two or three rooms per stage**, par around 8-15: meet the key, use it in a new layout, then mix it with earlier
   keys under pressure (an enemy on the route, so hearts count).
4. **A small `allowedCommands` per stage**, so the full solver fits in memory and proves par over every key the
   player can press, as the Gallery does now.
