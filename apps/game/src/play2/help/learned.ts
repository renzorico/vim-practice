import type { StoryState } from '@escape/story';
import { learnedKeycaps } from '../PlayScreen.js';
import { stages } from '../content.js';
import { stageCommands } from '../session.js';
import { HELP_KEYS, referenceKey, type HelpKey } from './keys.js';

export function learnedReference(story: StoryState, stageId: string): { entries: readonly HelpKey[]; newKeys: ReadonlySet<string> } {
  const current = stages.find(item => item.stage.id === stageId)?.stage ?? stages[0]?.stage;
  const keys = new Set<string>();
  const currentIndex = stages.findIndex(item => item.stage.id === stageId);
  const previous = new Set(stages.slice(0, Math.max(0, currentIndex)).flatMap(({ stage }) => stageCommands(stage)));
  for (const skill of story.learnedSkills) if (HELP_KEYS.some(entry => entry.key === skill)) keys.add(skill);
  for (const { stage } of stages) {
    if (stage.id !== stageId && !story.flags[`${stage.id}.intro-seen`] && !story.clearedStages.includes(stage.id)) continue;
    const caps = learnedKeycaps(story.flags, stage.type === 'text', stage.id);
    const commands = stage.type === 'text' ? [...caps, ...stageCommands(stage)] : caps;
    for (const cap of commands) {
      const key = referenceKey(cap);
      keys.add(key);
    }
  }
  // Writing is explicitly taught at the Recover door in the finale.
  if (story.flags['last.recover']) keys.add(':w');
  else keys.delete(':w');
  if (story.flags['quarry.knows-x'] || (current && !['margin', 'lowlands', 'quarry'].includes(current.world))) keys.add(':e!');
  if (stages.some(({ stage }) => stage.type === 'text' && (stage.id === stageId || story.clearedStages.includes(stage.id) || story.flags[`${stage.id}.intro-seen`]))) keys.add(':q');
  const currentCommands = current ? new Set(stageCommands(current)) : new Set<string>();
  const newKeys = new Set([...keys].filter(key => !previous.has(key) && (currentCommands.has(key) || key === ':w' || key === ':e!')));
  return { entries: HELP_KEYS.filter(entry => keys.has(entry.key)), newKeys };
}
