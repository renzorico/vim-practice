import type { Stage, WorldState } from '@escape/world';
import type { StoryContent, StoryState } from '@escape/story';
import { currentQuest } from '../play2/currentQuest.js';

export interface Mood {
  readonly energy: 0 | 1 | 2 | 3;
  readonly danger: 0 | 1 | 2;
}
export interface MoodInput {
  readonly world: WorldState;
  readonly stage: Stage;
  readonly story: StoryState;
  readonly content: StoryContent;
}
export function moodFor({ world, stage, story, content }: MoodInput): Mood {
  const main = stage.type === 'text' ? null : currentQuest(content, story);
  const done = main ? story.quests[main.quest.id]?.step ?? 0 : 0;
  const total = main?.quest.steps.length ?? 0;
  const energy = !main ? 1 : done === 0 ? 0
    : total >= 3 && done === total - 1 ? 3 : (1 + Math.floor(2 * done / total)) as 1 | 2 | 3;
  if (world.status === 'dead' || world.status === 'cleared') return { energy, danger: 0 };
  if (stage.hearts >= 2 && world.hearts === 1) return { energy, danger: 2 };
  // Contact damage is part of the entity definition, rather than implied by its sprite/kind.
  const distance = Math.min(...world.entities.filter(entity => entity.def.damage > 0 && entity.def.behaviour.type !== 'follow')
    .map(entity => Math.abs(entity.at.line - world.engine.cursor.line) + Math.abs(entity.at.col - world.engine.cursor.col)));
  return { energy, danger: distance <= 2 ? 2 : distance <= 5 ? 1 : 0 };
}
export type Pace = 'still' | 'steady' | 'urgent';
export const TEMPO_FACTOR: Readonly<Record<Pace, number>> = { still: 0.92, steady: 1, urgent: 1.1 };
/** Authored from stage goals: editing/reading breathes; enemies and turn races press on. */
export const STAGE_PACE: Readonly<Record<string, Pace>> = {
  margin: 'still', lowlands: 'still', lighthouse: 'urgent', 'quarry-road': 'urgent', cut: 'urgent', shaft: 'urgent',
  ledger: 'still', canopy: 'urgent', glades: 'urgent', gates: 'urgent', manifest: 'still', jetty: 'steady',
  warehouse: 'steady', customs: 'steady', counter: 'urgent', harbour: 'still', stacks: 'still', reading: 'still',
  archive: 'steady', notary: 'urgent', contract: 'still', mouth: 'still', gallery: 'still', marked: 'steady',
  labyrinth: 'urgent', study: 'still', 'last-page': 'urgent',
};
export function paceFor(stageId: string): Pace { return STAGE_PACE[stageId] ?? 'still'; }
