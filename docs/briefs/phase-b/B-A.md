# B-A: world simulation
Owns: `packages/world/src/sim/**`
Runner: codex. Reviewer: claude-sonnet.

Implement `createWorldSim(engine: Engine): WorldSim` in `sim/index.ts`, exactly as `WorldSim` and its rules 1-8 are written in `packages/world/src/types.ts`. The rules are the game design: implement them, do not reinterpret them.

- Split by rule, one file each where it helps: `turn.ts` (rule 1, pending and rollback), `movement.ts` (rule 2), `remap.ts` (rule 3, the text-offset mapping, as its own pure function with its own tests), `entities.ts` (rule 4, behaviours), `effects.ts` (batches, checkpoints), `scripts.ts` (rule 7, solve check with goals and `mustUse`).
- Check script goals with `checkGoals` from `@escape/curriculum`; do not write a second goal checker.
- Buffer changes from effects and entities must go on the engine undo stack as `Snapshot`s with a correct `changeSeq`, so `u` restores them and `modified` stays truthful.
- Tests, at least 60, most of them on `FIXTURE_STAGE`:
  - Rule 1: `5j` is one turn and `jjjjj` five; `dw`, `ihello<Esc>` and `:w<CR>` are one each; `vjd` is three; a half-typed `d` spends none; a lone `<Esc>` and a visual `<Esc>` spend none and the visual one keeps its mode change; an engine error restores `pending`.
  - Rule 2: walking into the tree or off the buffer bumps; a jump tests only its landing; ragged rows.
  - Rule 3: `x`, `dd`, `p`, `J`, an inserted newline, `u` after each; an entity on a deleted tile is removed; an entity right of the edit shifts; a fixed tile blocks `dd` and `r` but may shift.
  - Rule 4: the Blot acts on even turns only, deals damage when adjacent whether or not it acted, tie-breaks vertical first; thorns damage; death.
  - Rule 5: checkpoint is stored after enemies act; a lethal save stores nothing; `restore` keeps flags, solved scripts and fired triggers.
  - Rule 7: the sign opens only when adjacent; solving applies `set-rows` and `set-flag` as one batch, emits `flag-set`, stores a checkpoint; a flag-only batch stores none; a solved script reopens read-only with its solved text.
  - Rule 8: `stage-cleared` once; `apply` still works after a clear and does nothing after death.
  - Determinism: the same keys twice give deeply equal states and events.
- Export a helper `playKeys(sim, stage, legend, options, keys)` returning the final state and all events; the solver and CI replay use it.
