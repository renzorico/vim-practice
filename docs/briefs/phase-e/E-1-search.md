# E-1 solver measurements

Measured on 2026-11-17 against parent commit `e686334`, with the same command lists,
search limits, and story-aware simulations used by the existing proof tests.
Expansion counts came from the solver's successful return, using temporary logging
that has been removed. The benchmark command was:

```sh
npx vitest run apps/game/src/play2/*finalize.test.ts apps/game/src/play2/shaft.test.ts
```

| Existing proof | Expansions before | Expansions after | Turns before / after |
| --- | ---: | ---: | --- |
| Margin | 764 | 764 | 6 / 6 |
| Lowlands | 7 | 7 | 1 / 1 |
| Lighthouse | 2204 | 2204 | 7 / 7 |
| Shaft, focused `j dd .` | 62 | 62 | 3 / 3 |
| Cut, focused `j l dd u` | 493 | 493 | 4 / 4 |
| Canopy, learned motions | 22628 | 22628 | 7 / 7 |
| Canopy, old motions | 2754 | 2754 | 14 / 14 |
| Glades, learned motions | 6023 | 6023 | 4 / 4 |
| Glades, old motions | 38753 | 38753 | 8 / 8 |
| Gates, focused `%` motions | 4519 | 4519 | 8 / 8 |
| Gates, focused old motions | 4569 | 4569 | 8 / 8 |

The benchmark's 37 tests passed before and after. Elapsed suite time was 37.18 s
before and 37.62 s after (1.012x). The slowest individual proof ratio reported
by Vitest was 1.108x (Cut with `dd`, 1278 ms to 1416 ms). No world gate is needed.
New actions require their learned and allowed command ids; the existing stages'
command lists do not include `d`, `y`, `yy`, `p`, `P`, or `"`.

The pre-existing capped searches still found no route: Shaft full/without `dd`
(1000-expansion limit), Cut full/without `dd` (500), and Cut focused `x` (5000).
They are bounded searches, not optimality proofs. The Quarry finalize test is
replay-only and does not invoke the solver.

| Tiny stage | Best keys | Turns | Expansions |
| --- | --- | ---: | ---: |
| Junk pile | `dw` | 1 | 11 |
| Shelf with four cargo characters | `y4l4lp` | 3 | 301 |
| Delete clobbers unnamed register | `ylldl"0p` | 4 | 2261 |
| Duplicate a row | `yyp` | 2 | 3 |

These optima are asserted in `packages/world/src/solver/operators.test.ts` and
replayed through the real engine and sim. The tiny story adapter sets a clear
flag only when it receives the shelf's `trigger-fired` event. The register stage
uses a fixed source tile: without that constraint the solver correctly finds a
shorter delete-and-put route, which would not exercise yank register zero.

No contract changes or blockers. The text check compares exactly the requested
window after the anchor; trailing characters beyond that window are allowed by
the contract. Schema validation requires a nonempty match and a stage-owned
anchor. The linter warns about deletable anchor tiles.
