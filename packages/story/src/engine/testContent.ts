/** Small StoryContent around FIXTURE_STAGE, shared by the engine and schema tests. Not shipped. */
import type { StoryContent } from '../types';

export const BRIDGE_FLAG = 'fixture.bridge-mended';

export const FIXTURE_CONTENT: StoryContent = {
  worlds: [
    { id: 'lowlands', order: 1, name: 'The Lowlands', stages: ['fixture-1', 'fixture-2'], castle: 'fixture-2', statue: 'O' },
  ],
  quests: [
    {
      id: 'river-crossing',
      world: 'lowlands',
      title: 'Cross the river',
      kind: 'main',
      steps: [
        {
          id: 'read-sign',
          objective: 'Read the sign by the river.',
          completeWhen: { type: 'trigger', trigger: 'read-sign' },
          then: [{ type: 'dialogue', dialogue: 'd-sign' }],
        },
        {
          id: 'mend-bridge',
          objective: 'Mend the bridge.',
          completeWhen: { type: 'flag', flag: BRIDGE_FLAG, value: true },
          then: [{ type: 'dialogue', dialogue: 'd-bridge' }],
        },
        {
          id: 'clear-stage',
          objective: 'Reach the door.',
          completeWhen: { type: 'stage-cleared', stage: 'fixture-1' },
          then: [
            { type: 'unlock-stage', stage: 'fixture-2' },
            { type: 'light-statue', letter: 'O' },
          ],
        },
      ],
    },
    {
      id: 'side-stones',
      world: 'lowlands',
      title: 'Count the stones',
      kind: 'side',
      steps: [
        {
          id: 'learn-w',
          objective: 'Learn to hop with w.',
          completeWhen: { type: 'skill-learned', skill: 'motion.w' },
          then: [],
        },
      ],
    },
  ],
  reactions: [
    {
      id: 'save-stone-bark',
      when: { type: 'trigger', trigger: 'at-save-stone' },
      once: true,
      then: [{ type: 'dialogue', dialogue: 'd-save' }],
    },
  ],
  dialogues: [
    { id: 'd-sign', lines: [{ speaker: 'sign', text: 'The bridge is brokn.' }], then: [{ type: 'teach', skill: 'motion.f' }] },
    { id: 'd-bridge', lines: [{ speaker: 'dot', text: 'You mended it!' }], then: [{ type: 'start-quest', quest: 'side-stones' }] },
    { id: 'd-save', lines: [{ speaker: 'npc', name: 'The Lamplighter', text: 'Rest here. Type :w to save.' }], then: [] },
  ],
  cutscenes: [
    {
      id: 'c-intro',
      beats: [
        { type: 'title', text: 'The Scribe is in another buffer.' },
        { type: 'terminal', lines: ['E325: ATTENTION', 'Found a swap file by the name ".story.swp"'] },
      ],
      then: [{ type: 'set-flag', flag: 'intro.seen', value: true }],
    },
  ],
  openingQuests: ['river-crossing'],
  openingStage: 'fixture-1',
};
