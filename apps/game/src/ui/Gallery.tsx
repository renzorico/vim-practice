import type { Lesson } from '@escape/curriculum';
import { createEngine } from '@escape/engine';
import { findChar } from './targetCell.js';
import { ChallengeRoom } from './ChallengeRoom.js';
import { LessonCard } from './LessonCard.js';
import { MapScreen } from './MapScreen.js';
import { SolutionReplay } from './SolutionReplay.js';
import { TitleScreen } from './TitleScreen.js';
import './tokens.css';
import './ui.css';

/** Renders every screen with sample props, for checking in a browser. Not part of the game. */

const SAMPLE_LESSON: Lesson = {
  skill: 'motion.line',
  keycap: '$',
  definition: 'Jumps to the last character of the line.',
  quote: 'Every line has an end. Learn to fly to it.',
  example: { lines: ['the quick brown fox'], cursor: { line: 0, col: 0 }, keys: ['$', '0', '$'] },
  opposite: '0 jumps to the start.',
};

const MAP_LINES = [
  '#############################',
  '#  BOOT SECTOR   :  ░░░░░░░ #',
  '#   N      @   D  :  ░░░░░░░ #',
  '#     K   E       ~~~~~~~    #',
  '#############################',
];

const ROOM_LINES = ['the quick brown fox', 'jumps over the lazy dogX'];
const ROOM_TARGET = findChar(ROOM_LINES, 'X');
const noop = (): void => undefined;
const roomState = createEngine().init(ROOM_LINES, { line: 0, col: 4 });

export function Gallery() {
  return (
    <>
      <TitleScreen onStart={noop} onSkipTest={noop} />
      <MapScreen
        location="Boot Sector"
        keysCollected={1}
        keysTotal={5}
        power={62}
        maxPower={100}
        lines={MAP_LINES}
        cursor={{ line: 2, col: 11 }}
        markers={[
          { at: { line: 2, col: 4 }, kind: 'note' },
          { at: { line: 2, col: 15 }, kind: 'door' },
          { at: { line: 3, col: 6 }, kind: 'key' },
          { at: { line: 3, col: 10 }, kind: 'echo' },
        ]}
        objective="Find the door and open it."
        moves={[
          { key: 'h', locked: false },
          { key: 'j', locked: false },
          { key: 'k', locked: false },
          { key: 'l', locked: false },
          { key: 'w', locked: true },
          { key: '$', locked: true },
        ]}
        log={[
          { speaker: 'operator', text: 'Operator: the door is east of you.' },
          { speaker: 'gc', text: 'Garbage collector: sector 4 corrupted.' },
        ]}
      />
      <div className="ui">
        <LessonCard lesson={SAMPLE_LESSON} onContinue={noop} />
      </div>
      <ChallengeRoom
        lesson={SAMPLE_LESSON}
        roomNumber={3}
        title="The Long Line"
        goalText="Put the cursor on the x at the end of line 2."
        state={roomState}
        {...(ROOM_TARGET === null ? {} : { target: ROOM_TARGET })}
        keysUsed={7}
        par={3}
        attempts={5}
        allowedKeys={['h', 'j', 'k', 'l', '$', '0']}
        hint="Try a jump that goes to the end of the line."
        canShowSolution
        canSkip
        onHint={noop}
        onShowSolution={noop}
        onKeepTrying={noop}
        onSkip={noop}
      />
      <SolutionReplay startLines={ROOM_LINES} startCursor={{ line: 0, col: 4 }} solution={['j', '$']} onNewRoom={noop} />
    </>
  );
}
