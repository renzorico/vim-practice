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
   * A command whose result would delete, replace or shift a fixed tile is cancelled as a whole
   * (event 'bump', reason 'fixed'). Stage borders and Save Stones are fixed.
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
  /** Hearts taken when it ends its action on the player's cell or 4-adjacent to it. 0 for NPCs. */
  readonly damage: number;
  /** Blocks the player's movement (NPCs, props). Blots do not block: walking into one is a hit. */
  readonly solid: boolean;
  /** Only exists while this flag is set (or unset, with `spawnUnless`). */
  readonly spawnIf?: FlagId;
  readonly spawnUnless?: FlagId;
}

export interface Entity {
  readonly id: EntityId;
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
 *   - interact: fires when the player presses <CR> in normal mode inside `area`, or 4-adjacent
 *               to the entity `entity`. Costs no turn.
 */
export interface Trigger {
  readonly id: TriggerId;
  readonly on: 'enter' | 'interact';
  readonly area?: Area;
  readonly entity?: EntityId;
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
 * `:q` or `:q!` closes it (`:q` is refused while modified, as in Vim). The script is solved when
 * its goals hold; `effects` are applied to the field at that moment.
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
 */
export type WorldEffect =
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
  /** 'text' = the pure-text stage that ends each world: no entities, one script-like buffer. */
  readonly type: StageType;
  readonly title: string;
  /** The goal in plain words, always on screen: "Reach the Lighthouse door." */
  readonly goalText: string;
  /** The field buffer. Every row has the same length (map linter rule) so rows line up as a grid. */
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
}

/** Everything `:w` stores and death restores. A checkpoint never holds another checkpoint. */
export type Checkpoint = Omit<WorldState, 'checkpoint'>;

export interface WorldState {
  readonly stage: StageId;
  /** The field buffer. Its cursor is the player's position. */
  readonly engine: EngineState;
  readonly script: OpenScript | null;
  readonly entities: readonly Entity[];
  readonly hearts: number;
  /** Turns taken in this attempt. */
  readonly turn: number;
  readonly status: WorldStatus;
  readonly flags: Readonly<Record<FlagId, boolean>>;
  readonly solvedScripts: readonly ScriptId[];
  /** Triggers with `once` that have already fired. */
  readonly firedTriggers: readonly TriggerId[];
  /** State at the last `:w`, or at stage start. Death returns here: unsaved progress is lost. */
  readonly checkpoint: Checkpoint | null;
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
  /** The command was cancelled and cost no turn. */
  | { readonly type: 'bump'; readonly reason: BumpReason; readonly at: Position }
  /** The field buffer changed. `fromLine` and `toLine` are the first and last changed row after the edit. */
  | { readonly type: 'rows-changed'; readonly fromLine: number; readonly toLine: number; readonly by: 'player' | 'effect' | 'entity' }
  | { readonly type: 'entity-moved'; readonly entity: EntityId; readonly from: Position; readonly to: Position }
  | { readonly type: 'entity-removed'; readonly entity: EntityId; readonly cause: 'deleted-tile' | 'effect' }
  | { readonly type: 'player-hit'; readonly by: EntityId | 'tile'; readonly hearts: number }
  | { readonly type: 'player-died' }
  | { readonly type: 'turn-ended'; readonly turn: number }
  | { readonly type: 'trigger-fired'; readonly trigger: TriggerId }
  | { readonly type: 'script-opened'; readonly script: ScriptId }
  | { readonly type: 'script-solved'; readonly script: ScriptId; readonly keys: number }
  | { readonly type: 'script-closed'; readonly script: ScriptId; readonly solved: boolean }
  | { readonly type: 'checkpoint-saved' }
  | { readonly type: 'checkpoint-restored' }
  | { readonly type: 'stage-cleared'; readonly turns: number };

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
 * 1. TURN. A key that completes an engine command on the field ends one turn, whatever the command
 *    was (`5j`, `w`, `dd`, `u`, `:w`). Keys that leave a command pending (`d`, `2`, `:`, `f`) and
 *    keys typed in insert mode end no turn; the insert ends one turn at <Esc>.
 *    A cancelled command (bump, engine error) costs no turn.
 * 2. WALK vs JUMP. `h j k l` (with or without a count) walk: every cell on the way must be walkable
 *    and free of solid entities, or the whole command is cancelled. Every other motion jumps: only
 *    the landing cell is checked. A motion never ends on a non-walkable tile.
 * 3. EDITS. An edit that would delete, replace or shift a `fixed` tile is cancelled. Entities ride
 *    with their tile: after an edit on a row, entities right of the change shift by the length
 *    difference; after a linewise delete or put, entities on lower rows shift by the row difference.
 *    An entity whose tile was deleted is removed (this is how the player fights). The player's
 *    cell follows the engine cursor.
 * 4. ENTITIES. After the player's turn, entities act in the order of Stage.entities, each once if
 *    `turn % every == 0`. Then damage: any entity with damage > 0 on the player's cell or
 *    4-adjacent deals it once. Then tile damage. Hearts at 0: status 'dead'.
 * 5. SAVE. `:w` (also `:wq`, `:x`, `ZZ`) works anywhere, costs a turn and stores a checkpoint.
 *    `restore` returns to it. Quitting the field (`:q`) is the game's "leave stage", decided by the app.
 * 6. UNDO. `u` and `<C-r>` change the buffer exactly as Vim does and cost a turn. They do not
 *    rewind entities, hearts or turns. Buffer changes made by effects and entities are on the undo
 *    stack too.
 * 7. SCRIPTS. While a script is open, keys go to its engine and rule 1 does not apply.
 * 8. CLEAR. Checked at the end of every turn and after every effect. First 'dead', then 'cleared'.
 */
export interface WorldSim {
  init(stage: Stage, legend: Legend, options: WorldOptions): WorldState;
  step(state: WorldState, key: Key, stage: Stage, legend: Legend, options: WorldOptions): WorldStepResult;
  /** Apply effects from the story layer (a quest reward, a cutscene). Costs no turn. */
  apply(state: WorldState, effects: readonly WorldEffect[], stage: Stage, legend: Legend): WorldStepResult;
  /** After death or on request: back to the last checkpoint, with status 'playing'. */
  restore(state: WorldState): WorldStepResult;
}
