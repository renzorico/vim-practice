/**
 * World contract (masterplan v2, Phase B). FROZEN once merged: only the design lead edits it,
 * with a BITACORA entry, because every builder depends on these types.
 *
 * The world layer turns the Vim engine into a turn-based tile game:
 *   - A stage's map IS a Vim buffer. One character = one tile.
 *   - One finished Vim command = one turn. Then every entity acts once.
 *
 * Like the engine, this layer is pure: no DOM, no timers, no randomness. The same stage and the
 * same keys always give the same result, so the solver can prove a stage and CI can replay it.
 */
import type { CommandRecord, EngineError, EngineState, Key, Position } from '@escape/engine';
import type { Goal, SkillId } from '@escape/curriculum';

// ---------------------------------------------------------------------------------------------
// Ids
// ---------------------------------------------------------------------------------------------

/** 'margin' is World 0, 'last-page' is the finale. Order is fixed by the story (MASTERPLAN 3.3). */
export type WorldId = 'margin' | 'lowlands' | 'quarry' | 'wordwood' | 'copper-port' | 'library' | 'echo-caves' | 'last-page';

/** World-stage, Mario style: '0-1', '1-3', '6-5'. Stage 5 of worlds 1-6 is the castle. Finale stages are 'F-1'... */
export type StageId = string;
export type EntityId = string;
export type TriggerId = string;
export type ScriptId = string;
/** Named story fact, e.g. 'quarry.road-open'. Owned by packages/story; the world only reads and stores it. */
export type FlagId = string;

// ---------------------------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------------------------

/**
 * What one buffer character means in the world.
 *
 * IMPORTANT: Vim decides word boundaries from the character itself, and the legend cannot change that.
 * So legends follow one convention, and the map linter enforces it:
 *   - ground:  ' ' (space) only. Whitespace to Vim.
 *   - object:  letters, digits, '_'. Keyword characters: `w b e` hop between runs of them.
 *   - barrier: punctuation. A separate word class to Vim.
 */
export type TileKind = 'ground' | 'object' | 'barrier';

export interface TileDef {
  readonly char: string;
  readonly kind: TileKind;
  /** Sprite key in the tileset atlas. The renderer owns the atlas; the world never loads art. */
  readonly sprite: string;
  /** Can the player or an entity stand here? */
  readonly walkable: boolean;
  /**
   * A command whose result would delete or replace a fixed tile is cancelled as a whole
   * (event 'bump', reason 'fixed'). A fixed tile may still be shifted along its row or moved up
   * or down by an edit elsewhere. Save Stones and quest objects are fixed. Maps have no border
   * tiles: the edge of the world is the edge of the buffer (see rule 2).
   */
  readonly fixed: boolean;
  /** Standing here at the end of a turn costs this many hearts (spikes, ink pools). Default 0. */
  readonly damage?: number;
  /** Plain-words name for the HUD and screen readers: "stepping stone". */
  readonly label: string;
}

/** One legend per world, so a world has one look and one vocabulary of tiles. */
export interface Legend {
  readonly id: string;
  readonly tiles: readonly TileDef[];
  /** Used for a character the legend does not list. The map linter rejects such maps; this is a runtime safety net. */
  readonly fallback: TileDef;
}

// ---------------------------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------------------------

export type EntityKind = 'blot' | 'npc' | 'keeper' | 'dot' | 'unwriter' | 'prop';

/**
 * How an entity acts on its turn. Every rule is deterministic.
 *   - still:  never moves.
 *   - chase:  one step toward the player by Manhattan distance. Tie: vertical step first.
 *             If that cell is not walkable or is taken, try the other axis, else stay.
 *   - patrol: next waypoint in `path`, looping. Blocked: wait.
 *   - follow: like chase, but stops when adjacent and never deals damage (Dot).
 *   - unwrite: deletes the buffer row at `path[n]`'s line each time it acts (the Unwriter, finale).
 */
export type Behaviour =
  | { readonly type: 'still' }
  | { readonly type: 'chase' }
  | { readonly type: 'patrol'; readonly path: readonly Position[] }
  | { readonly type: 'follow' }
  | { readonly type: 'unwrite'; readonly path: readonly Position[] };

export interface EntitySpawn {
  readonly id: EntityId;
  readonly kind: EntityKind;
  readonly sprite: string;
  readonly at: Position;
  readonly behaviour: Behaviour;
  /** Acts every N turns. 1 = every turn. A slow enemy (2) is the gentlest way to teach the turn rule. */
  readonly every: number;
  /** Hearts taken at the end of every turn it is on the player's cell or 4-adjacent to it, whether or not it acted that turn. 0 for NPCs. */
  readonly damage: number;
  /** Blocks the player's movement (NPCs, props). Blots do not block: walking into one is a hit. */
  readonly solid: boolean;
  /** Only exists while this flag is set (or unset, with `spawnUnless`). */
  readonly spawnIf?: FlagId;
  readonly spawnUnless?: FlagId;
}

/**
 * A live entity. It carries its full definition, so entities spawned at runtime by an effect
 * survive the next step. Entities act in the order of WorldState.entities: stage entities first,
 * in Stage.entities order, then runtime spawns in the order they were spawned.
 */
export interface Entity {
  readonly id: EntityId;
  readonly def: EntitySpawn;
  readonly at: Position;
  /** Index into a patrol or unwrite path. 0 for other behaviours. */
  readonly pathIndex: number;
}

// ---------------------------------------------------------------------------------------------
// Triggers and scripts
// ---------------------------------------------------------------------------------------------

/** An inclusive rectangle of cells. A single cell has from == to. */
export interface Area {
  readonly from: Position;
  readonly to: Position;
}

/**
 * A place that reports something to the story layer. The world does not know what a quest is:
 * it fires the trigger and packages/story decides what follows.
 *   - enter:    fires when a turn ends with the player inside `area`.
 *   - interact: fires when the player presses <CR> in normal mode within reach of `target`.
 *               Costs no turn. Where no interact trigger is in reach, <CR> is Vim's own motion.
 *               If several are in reach, the first in Stage.triggers order fires.
 */
export type InteractTarget =
  | { readonly type: 'area'; readonly area: Area }
  /** 4-adjacent to this entity. A removed entity's triggers never fire. */
  | { readonly type: 'entity'; readonly entity: EntityId };

export type Trigger = TriggerBase &
  ({ readonly on: 'enter'; readonly area: Area } | { readonly on: 'interact'; readonly target: InteractTarget });

export interface TriggerBase {
  readonly id: TriggerId;
  /** Fire at most once per stage attempt. */
  readonly once: boolean;
  readonly onlyIf?: FlagId;
  readonly unless?: FlagId;
  /** Opens this script directly, without a round trip through the story layer. */
  readonly opensScript?: ScriptId;
}

/**
 * The script layer: an in-world text (sign, contract, spell) edited with real Vim.
 * While a script is open the field is paused: script keys cost no turns and entities do not act.
 * `:q` or `:q!` closes it (`:q` is refused while modified, as in Vim). The script is solved when,
 * after a completed command, all its goals hold and every `mustUse` skill appears in
 * OpenScript.commands. `effects` are applied to the field at that moment, as one batch.
 * Reopening a solved script shows the text it was solved with (WorldState.solvedScripts) and can change nothing.
 */
export interface Script {
  readonly id: ScriptId;
  /** Shown on the parchment panel: "The bridge spell". */
  readonly title: string;
  /** The goal in plain words. Always visible (clarity rule). */
  readonly goalText: string;
  readonly startLines: readonly string[];
  readonly startCursor: Position;
  /** Reuses the curriculum goals: transform, collect, reach, quit. All must hold. */
  readonly goals: readonly Goal[];
  readonly allowedCommands?: readonly string[];
  readonly mustUse?: readonly SkillId[];
  /** Best keystroke count, proven by the solver. Never set by hand or by an LLM. */
  readonly par: number;
  readonly solution: readonly Key[];
  readonly hints: readonly string[];
  readonly effects: readonly WorldEffect[];
}

/**
 * A change made to the world from outside the player's keys: by a solved script, an entity or the story.
 * Buffer effects are pushed onto the engine undo stack as snapshots, so `u` restores them
 * (this is how the player brings back rows the Unwriter takes).
 *
 * Effects are applied in batches (one solved script, one `apply` call). A batch is atomic: all of
 * it is applied, entities are remapped (rule 3), and only then are death and clear checked.
 * A batch that contains anything other than 'set-flag' then stores a checkpoint (rule 5), so a
 * rebuilt bridge or a quest reward cannot be lost by dying. A batch of only 'set-flag' effects
 * stores none: syncing a story flag must never work as a free save.
 */
export type WorldEffect =
  /** Emits 'flag-set', which is how packages/story (the owner of flags) hears about it. */
  | { readonly type: 'set-flag'; readonly flag: FlagId; readonly value: boolean }
  /** Replace whole rows of the field, e.g. a rebuilt bridge. Row count must stay the same. */
  | { readonly type: 'set-rows'; readonly fromLine: number; readonly lines: readonly string[] }
  | { readonly type: 'delete-row'; readonly line: number }
  | { readonly type: 'spawn'; readonly entity: EntitySpawn }
  | { readonly type: 'remove-entity'; readonly entity: EntityId }
  | { readonly type: 'heal'; readonly hearts: number }
  | { readonly type: 'move-player'; readonly to: Position };

// ---------------------------------------------------------------------------------------------
// Stage (static data, authored as a text map plus this record)
// ---------------------------------------------------------------------------------------------

/** All conditions of a stage must hold at the end of a turn for it to be cleared. */
export type ClearCondition =
  | { readonly type: 'reach'; readonly area: Area }
  | { readonly type: 'flag'; readonly flag: FlagId }
  | { readonly type: 'script-solved'; readonly script: ScriptId }
  | { readonly type: 'no-entities'; readonly kind: EntityKind }
  /** The field buffer must have been written (`:w`) after its last change. */
  | { readonly type: 'saved' };

export type StageType = 'field' | 'castle' | 'text';

export interface Stage {
  readonly id: StageId;
  readonly world: WorldId;
  /**
   * 'text' = the pure-text stage that ends each world. It has no entities, `autoScript` is
   * required, and `clear` is exactly one 'script-solved' condition for that script.
   */
  readonly type: StageType;
  /** Opened by `init`. Closing it unsolved leaves the stage. Required for 'text', absent otherwise. */
  readonly autoScript?: ScriptId;
  readonly title: string;
  /** The goal in plain words, always on screen: "Reach the Lighthouse door." */
  readonly goalText: string;
  /**
   * The field buffer. Rows may differ in length and edits make them ragged: a cell past the end
   * of its row does not exist. The map linter requires at least one row and no empty rows.
   */
  readonly map: readonly string[];
  readonly legend: string;
  readonly start: Position;
  readonly hearts: number;
  readonly entities: readonly EntitySpawn[];
  readonly triggers: readonly Trigger[];
  readonly scripts: readonly Script[];
  readonly clear: readonly ClearCondition[];
  readonly teaches: readonly SkillId[];
  readonly requires: readonly SkillId[];
  /** Commands the field accepts. Omit to allow everything the player has learned. */
  readonly allowedCommands?: readonly string[];
  /** Fewest turns to clear, proven by the solver. Shown only after a clear. Never gates progress. */
  readonly parTurns: number;
  /** Known-good keys. CI replays them: the stage must clear with the player alive. */
  readonly solution: readonly Key[];
  readonly hints: readonly string[];
}

// ---------------------------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------------------------

export type WorldStatus = 'playing' | 'dead' | 'cleared';

export interface OpenScript {
  readonly id: ScriptId;
  readonly engine: EngineState;
  readonly keys: number;
  /** Every command completed in this script since it was opened. `mustUse` is checked against it. */
  readonly commands: readonly CommandRecord[];
}

/**
 * The field as it was before the first key of the command now in progress (rule 1).
 * If the finished command breaks rule 2 or 3, the world goes back to this and no turn is spent.
 */
export interface PendingCommand {
  readonly engine: EngineState;
  readonly entities: readonly Entity[];
  /** Commands the engine has emitted since the first key. */
  readonly commands: readonly CommandRecord[];
}

/**
 * What `:w` stores and death restores: the field, the entities, hearts and the turn count.
 * Flags, solved scripts and fired triggers are NOT in it. They only ever move forward within an
 * attempt, because the story layer has already reacted to them and story progress never rewinds.
 */
export interface Checkpoint {
  readonly engine: EngineState;
  readonly entities: readonly Entity[];
  readonly hearts: number;
  readonly turn: number;
}

export interface WorldState {
  readonly stage: StageId;
  /** The field buffer. Its cursor is the player's position. */
  readonly engine: EngineState;
  readonly script: OpenScript | null;
  /** Non-null while a field command is half-typed or an insert or command line is open (rule 1). */
  readonly pending: PendingCommand | null;
  readonly entities: readonly Entity[];
  readonly hearts: number;
  /** Turns taken in this attempt. */
  readonly turn: number;
  readonly status: WorldStatus;
  readonly flags: Readonly<Record<FlagId, boolean>>;
  /** Each solved script with its buffer at the moment it was solved, so it can be shown again. */
  readonly solvedScripts: Readonly<Record<ScriptId, readonly string[]>>;
  /** Triggers with `once` that have already fired. */
  readonly firedTriggers: readonly TriggerId[];
  /** State at the last `:w` or checkpointing effect batch; set by `init` to the stage start. Death returns here. */
  readonly checkpoint: Checkpoint;
}

// ---------------------------------------------------------------------------------------------
// Events (what the renderer animates and the story layer listens to)
// ---------------------------------------------------------------------------------------------

export type BumpReason = 'wall' | 'solid-entity' | 'fixed' | 'edge';

export type WorldEvent =
  /** A Vim command finished on the field or in a script. Mastery and skills read these. */
  | { readonly type: 'command'; readonly command: CommandRecord; readonly in: 'field' | 'script' }
  | { readonly type: 'engine-error'; readonly error: EngineError }
  | { readonly type: 'player-moved'; readonly from: Position; readonly to: Position; readonly style: 'walk' | 'jump' }
  /** The command was cancelled, the field went back to how it was before its first key, and no turn was spent. */
  | { readonly type: 'bump'; readonly reason: BumpReason; readonly at: Position }
  /**
   * The field buffer changed. A hint for animation only: `fromLine`..`toLine` are the rows that
   * differ, in pre-edit numbering, and `lineDelta` is the change in row count. The renderer always
   * rebuilds tiles from WorldState.engine.lines after a step; events only say what to animate.
   * During an open insert these are emitted per key and are provisional until the command commits.
   */
  | { readonly type: 'rows-changed'; readonly fromLine: number; readonly toLine: number; readonly lineDelta: number; readonly by: 'player' | 'effect' | 'entity' }
  | { readonly type: 'entity-moved'; readonly entity: EntityId; readonly from: Position; readonly to: Position }
  | { readonly type: 'entity-spawned'; readonly entity: EntityId; readonly at: Position }
  | { readonly type: 'entity-removed'; readonly entity: EntityId; readonly cause: 'deleted-tile' | 'effect' }
  | { readonly type: 'flag-set'; readonly flag: FlagId; readonly value: boolean }
  | { readonly type: 'player-hit'; readonly by: EntityId | 'tile'; readonly hearts: number }
  | { readonly type: 'player-died' }
  | { readonly type: 'turn-ended'; readonly turn: number }
  | { readonly type: 'trigger-fired'; readonly trigger: TriggerId }
  | { readonly type: 'script-opened'; readonly script: ScriptId }
  | { readonly type: 'script-solved'; readonly script: ScriptId; readonly keys: number }
  | { readonly type: 'script-closed'; readonly script: ScriptId; readonly solved: boolean }
  | { readonly type: 'checkpoint-saved' }
  | { readonly type: 'checkpoint-restored' }
  | { readonly type: 'stage-cleared'; readonly stage: StageId; readonly turns: number };

export interface WorldStepResult {
  readonly state: WorldState;
  /** In the order they happened. The renderer plays them back in this order. */
  readonly events: readonly WorldEvent[];
}

// ---------------------------------------------------------------------------------------------
// The simulation (implemented in task B-A)
// ---------------------------------------------------------------------------------------------

export interface WorldOptions {
  /** Skills the player has learned. With Stage.allowedCommands, this limits the field's commands. */
  readonly learnedCommands: readonly string[];
  /** Story flags at stage entry. */
  readonly flags: Readonly<Record<FlagId, boolean>>;
}

/**
 * The rules `step` must follow. They are the game design, so they live in the contract.
 *
 * 1. TURN. The field is AT REST when the engine is in normal mode or a visual mode, with no
 *    pendingKeys and no changeInProgress. A field command starts at the first key typed while at
 *    rest (the world stores `pending`) and is COMPLETE at the first key after which the field is
 *    at rest again and the engine has emitted at least one CommandRecord since the start.
 *    So `5j`, `dw`, `ihello<Esc>` and `:w<CR>` are one command each, and `vjd` is three (`v`, `j`,
 *    `d`): moving a selection gives enemies their turns like any other move. A complete command
 *    is then checked (rules 2, 3): if it passes it is committed and one turn ends; if not, the
 *    world returns to `pending` (event 'bump') and no turn is spent. A key that returns to rest
 *    with no CommandRecord (an engine error, a lone <Esc>) also restores `pending`, no turn spent.
 * 2. WALK vs JUMP. A cell exists if its row exists and its column is inside that row. The player
 *    may only end a command on an existing, walkable cell with no solid entity (else bump: 'edge',
 *    'wall' or 'solid-entity'). `h j k l` (with or without a count) walk: every cell on the way
 *    must pass the same test. Every other motion jumps: only the landing cell is tested. The same
 *    landing test applies after an edit, an undo or a redo, wherever the engine leaves the cursor.
 * 3. BUFFER CHANGES. A command that deletes or replaces a `fixed` tile is cancelled. After ANY
 *    change to the field buffer, whatever caused it (edit, undo, redo, effect, entity), entities
 *    are remapped by one rule that also covers split and joined rows. Join the old lines with
 *    '\n' into one text, and the new lines likewise. Take the longest common prefix of the two
 *    texts, then the longest common suffix of what remains: what lies between is the changed
 *    span (old span, new span). For each entity, by its offset in the old text:
 *      a. before the span: the offset is kept;
 *      b. after the span: the offset shifts by (new span length - old span length);
 *      c. inside the span: the offset is kept if it is still inside the new span, else the entity
 *         is removed.
 *    Turn the offset back into a line and column of the new text. An entity that lands on a
 *    '\n', or on a cell that is not walkable, is removed. Fixed tiles are tracked by the same
 *    mapping: one that falls under (c)-removal, or whose character differs afterwards, was
 *    deleted or replaced. Removal by remapping is how the player fights (cause 'deleted-tile').
 *    Undo never brings an entity back. The player's cell is always the engine cursor.
 * 4. ENTITIES. When a turn ends: `turn` goes up by one (the first turn is 1). Entities act in
 *    WorldState.entities order, each once if `turn % every == 0`. Then every entity with
 *    damage > 0 on the player's cell or 4-adjacent deals it once, whether or not it acted. Then
 *    tile damage. Hearts at 0: status 'dead'.
 * 5. SAVE. `:w` (also `:wq`, `:x`, `ZZ`) works anywhere and costs a turn. The checkpoint is stored
 *    at the very end of that turn, after rule 4, and only if the status is still 'playing': a save
 *    that kills you saves nothing. `restore` returns to the checkpoint. The engine's quitRequested
 *    (`:q`, `:wq`, ...) is left set for the app, which treats it as "leave stage".
 * 6. UNDO. `u` and `<C-r>` change the buffer exactly as Vim does and cost a turn. They do not
 *    bring back hearts, turns or removed entities; living entities are remapped by rule 3.
 *    Buffer changes made by effects and entities are on the undo stack too.
 * 7. SCRIPTS. While a script is open, keys go to its engine and rules 1-6 do not apply.
 * 8. END. Death and clear are checked at the end of every turn and after every effect batch,
 *    death first. 'stage-cleared' is emitted once. Once 'dead', `step` and `apply` change nothing
 *    and emit nothing until `restore` or a new `init`. Once 'cleared', `step` changes nothing, but
 *    `apply` still works, so the story's answer to the clear (rewards, flags) is not lost.
 */
export interface WorldSim {
  init(stage: Stage, legend: Legend, options: WorldOptions): WorldState;
  step(state: WorldState, key: Key, stage: Stage, legend: Legend, options: WorldOptions): WorldStepResult;
  /**
   * Apply effects from the story layer (a quest reward, a cutscene). Costs no turn.
   * The app sends everything one StoryStepResult asks of the world in ONE call, so it is one batch.
   */
  apply(state: WorldState, effects: readonly WorldEffect[], stage: Stage, legend: Legend): WorldStepResult;
  /** After death or on request: back to the last checkpoint, with status 'playing'. Flags, solved scripts and fired triggers are kept. */
  restore(state: WorldState): WorldStepResult;
}
