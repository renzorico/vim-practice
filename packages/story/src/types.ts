/**
 * Story contract (masterplan v2, Phase B). FROZEN once merged (same rule as world/types.ts).
 *
 * The story layer is data plus one pure reducer. It listens to world events and answers with
 * effects: show a dialogue, advance a quest, teach a command, unlock a stage. It never touches the
 * DOM and never reads the clock, so a whole playthrough can be replayed in CI from keys alone.
 *
 * Content (dialogue, quests, cutscenes) is JSON checked against these types. Fable writes the
 * quests and key lines; Ollama drafts bulk lines; nothing ships without the dialogue linter.
 */
import type { SkillId } from '@escape/curriculum';
import type { FlagId, ScriptId, StageId, TriggerId, WorldEffect, WorldEvent, WorldId } from '@escape/world';

export type DialogueId = string;
export type QuestId = string;
export type CutsceneId = string;

/** The cast (MASTERPLAN 3.2). Keepers and villagers use 'npc' with a display name on the line. */
export type Speaker = 'scribe' | 'dot' | 'elder' | 'unwriter' | 'npc' | 'sign' | 'system';

/**
 * One dialogue box. Tone rules are enforced by the dialogue linter:
 * at most 2 lines of 48 characters, no mockery of failure, commands written as `keys`.
 */
export interface Line {
  readonly speaker: Speaker;
  /** Shown name for 'npc': "The Lamplighter". */
  readonly name?: string;
  readonly text: string;
}

export interface Dialogue {
  readonly id: DialogueId;
  readonly lines: readonly Line[];
  /** Applied when the last line is dismissed. */
  readonly then: readonly StoryEffect[];
}

/** What the story reacts to. Each maps to one WorldEvent or to story state. */
export type StoryCondition =
  | { readonly type: 'trigger'; readonly trigger: TriggerId }
  | { readonly type: 'stage-cleared'; readonly stage: StageId }
  | { readonly type: 'script-solved'; readonly script: ScriptId }
  | { readonly type: 'flag'; readonly flag: FlagId; readonly value: boolean }
  | { readonly type: 'skill-learned'; readonly skill: SkillId };

export type StoryEffect =
  | { readonly type: 'dialogue'; readonly dialogue: DialogueId }
  | { readonly type: 'cutscene'; readonly cutscene: CutsceneId }
  | { readonly type: 'set-flag'; readonly flag: FlagId; readonly value: boolean }
  /** Opens the lesson card and practice for a skill (teach, then test). */
  | { readonly type: 'teach'; readonly skill: SkillId }
  | { readonly type: 'start-quest'; readonly quest: QuestId }
  | { readonly type: 'unlock-stage'; readonly stage: StageId }
  /** Lights one of the six castle statues (MASTERPLAN 3.4). */
  | { readonly type: 'light-statue'; readonly letter: StatueLetter }
  | { readonly type: 'world'; readonly effects: readonly WorldEffect[] }
  | { readonly type: 'ending'; readonly ending: Ending };

export interface QuestStep {
  readonly id: string;
  /** The objective in plain words for the HUD: "Bring the warning to the Lighthouse." */
  readonly objective: string;
  readonly completeWhen: StoryCondition;
  readonly then: readonly StoryEffect[];
}

export interface Quest {
  readonly id: QuestId;
  readonly world: WorldId;
  readonly title: string;
  /** 'main' quests gate the castle. 'side' quests give secrets and never block progress. */
  readonly kind: 'main' | 'side';
  readonly steps: readonly QuestStep[];
}

/** A reaction that is not part of a quest: an NPC bark, a sign, a seeded twist hint. */
export interface Reaction {
  readonly id: string;
  readonly when: StoryCondition;
  readonly onlyIf?: FlagId;
  readonly unless?: FlagId;
  readonly once: boolean;
  readonly then: readonly StoryEffect[];
}

export type Beat =
  | { readonly type: 'line'; readonly line: Line }
  /** Full-screen text: "The Scribe is in another buffer." */
  | { readonly type: 'title'; readonly text: string }
  /** A still image key from the art atlas. */
  | { readonly type: 'image'; readonly image: string }
  /** Raw terminal text, used for the E325 dialog. */
  | { readonly type: 'terminal'; readonly lines: readonly string[] };

export interface Cutscene {
  readonly id: CutsceneId;
  readonly beats: readonly Beat[];
  readonly then: readonly StoryEffect[];
}

/** The six letters of Vim's swap-file prompt. One statue per castle. */
export type StatueLetter = 'O' | 'E' | 'R' | 'D' | 'Q' | 'A';

/** v1 ships 'recover' and 'delete'. 'quit' is the joke loop. */
export type Ending = 'recover' | 'delete' | 'quit';

export interface WorldDef {
  readonly id: WorldId;
  /** 0 = the Margin, 1-6 = the worlds, 7 = the Last Page. */
  readonly order: number;
  readonly name: string;
  readonly stages: readonly StageId[];
  /** The stage that ends the world. null for the Margin. */
  readonly castle: StageId | null;
  readonly statue: StatueLetter | null;
}

/** Everything authored for the story, loaded as one bundle. */
export interface StoryContent {
  readonly worlds: readonly WorldDef[];
  readonly quests: readonly Quest[];
  readonly reactions: readonly Reaction[];
  readonly dialogues: readonly Dialogue[];
  readonly cutscenes: readonly Cutscene[];
  /** Quests started on a new game. */
  readonly openingQuests: readonly QuestId[];
  readonly openingStage: StageId;
}

export interface QuestProgress {
  /** Index of the current step. Equal to steps.length when done. */
  readonly step: number;
  readonly done: boolean;
}

/** The part of a save file the story owns. Plain JSON. */
export interface StoryState {
  readonly flags: Readonly<Record<FlagId, boolean>>;
  readonly quests: Readonly<Record<QuestId, QuestProgress>>;
  readonly unlockedStages: readonly StageId[];
  readonly clearedStages: readonly StageId[];
  readonly firedReactions: readonly string[];
  readonly statues: readonly StatueLetter[];
  readonly ending: Ending | null;
}

export interface StoryStepResult {
  readonly state: StoryState;
  /**
   * Effects the app must present, in order: dialogue, cutscene, teach, world, ending.
   * State-only effects (set-flag, start-quest, unlock-stage, light-statue) are already applied to `state`
   * and are still listed, so the UI can announce them.
   */
  readonly effects: readonly StoryEffect[];
}

/** The reducer (implemented in task B-C). */
export interface StoryEngine {
  init(content: StoryContent): StoryState;
  /** Feed the events of one world step. Advances quests, fires reactions. */
  onEvents(state: StoryState, events: readonly WorldEvent[], content: StoryContent): StoryStepResult;
  /** Apply effects that come from a dismissed dialogue or cutscene (`then`), or a learned skill. */
  apply(state: StoryState, effects: readonly StoryEffect[], content: StoryContent): StoryStepResult;
  /** The current objective of every active quest, main first, for the HUD. */
  objectives(state: StoryState, content: StoryContent): readonly string[];
}
