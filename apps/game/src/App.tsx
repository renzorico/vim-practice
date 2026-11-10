import { useCallback } from 'react';
import type { Key } from '@escape/engine';
import { canShowSolution, canSkip, visibleLines } from '@escape/curriculum';
import type { Level } from '@escape/curriculum';
import { useKeyCapture } from './input/useKeyCapture.js';
import { LESSONS, WORLD } from './play/content.js';
import { failures, movesFor, objectiveFor, type Game, type Room } from './play/game.js';
import { useGame } from './play/useGame.js';
import { ChallengeRoom } from './ui/ChallengeRoom.js';
import { LessonCard } from './ui/LessonCard.js';
import { MapScreen } from './ui/MapScreen.js';
import { SolutionReplay } from './ui/SolutionReplay.js';
import { TitleScreen } from './ui/TitleScreen.js';
import './ui/tokens.css';
import './ui/ui.css';

const POWER_PER_DOOR = 5;
const SPEAKER_PREFIX = { operator: 'Operator: ', gc: 'GC: ', echo: 'ECHO: ' } as const;

function targetOf(level: Level) {
  const reach = level.goals.find((goal) => goal.type === 'reach');
  return reach?.type === 'reach' ? reach.target : undefined;
}

function targetLinesOf(level: Level) {
  const transform = level.goals.find((goal) => goal.type === 'transform');
  return transform?.type === 'transform' ? transform.targetLines : undefined;
}

function keycapsOf(skills: readonly string[] | undefined): string[] | undefined {
  return skills?.map((skill) => LESSONS.get(skill)?.keycap ?? skill);
}

function RoomView({ room, game }: { room: Room; game: Game }) {
  const lesson = LESSONS.get(room.skill);
  if (lesson === undefined) return <p>Missing lesson for {room.skill}.</p>;
  const { session, level, run } = room;

  if (session.phase === 'lesson') {
    return <div className="ui room-lesson"><LessonCard lesson={lesson} onContinue={game.continueLesson} /></div>;
  }
  if (session.phase === 'solution') {
    return (
      <div className="ui">
        <SolutionReplay startLines={level.startLines} startCursor={level.startCursor} solution={level.solution}
          onNewRoom={game.newRoomAfterSolution} />
      </div>
    );
  }
  if (session.phase === 'won' || session.phase === 'skipped') {
    const won = session.phase === 'won';
    return (
      <div className="ui room-result">
        <h1>{won ? 'Room cleared' : 'Room skipped'}</h1>
        {won && <p>{run.keystrokes} keys, best possible {level.par}. {'*'.repeat(run.stars)}</p>}
        {!won && <p>GC marked {lesson.keycap} as weak. It will come back in a corrupted sector.</p>}
        <button type="button" className="ui-btn ui-btn--primary" onClick={game.leaveRoom}>Back to the map (Enter)</button>
      </div>
    );
  }

  const failed = failures(session);
  const helpAvailable = session.phase === 'challenge' && (canShowSolution(session) || canSkip(session))
    && failed > room.bannerDismissedAt;
  return (
    <ChallengeRoom
      lesson={lesson}
      roomNumber={session.variant + 1}
      title={session.phase === 'practice' ? `Practice: ${level.title}` : level.title}
      goalText={level.goalText ?? level.intro}
      {...(keycapsOf(level.mustUse) === undefined ? {} : { mustUseKeys: keycapsOf(level.mustUse) ?? [] })}
      {...(targetLinesOf(level) === undefined ? {} : { targetLines: targetLinesOf(level) ?? [] })}
      lastError={run.lastError?.message ?? null}
      state={run.state}
      {...(targetOf(level) === undefined ? {} : { target: targetOf(level) })}
      keysUsed={run.keystrokes}
      par={level.par}
      attempts={failed}
      allowedKeys={level.allowedCommands ?? []}
      hint={session.hintsShown > 0 ? level.hints[Math.min(session.hintsShown, level.hints.length) - 1] ?? null : null}
      canShowSolution={helpAvailable && canShowSolution(session)}
      canSkip={helpAvailable && canSkip(session)}
      onHint={game.hint}
      onShowSolution={game.showSolution}
      onKeepTrying={game.keepTrying}
      onSkip={game.skip}
    />
  );
}

export function App() {
  const game = useGame((state) => state);
  const onKey = useCallback((key: Key) => game.pressKey(key), [game]);
  const mode = game.room?.run.state.mode;
  useKeyCapture({ onKey, onHint: game.hint, captureTab: mode === 'insert' || mode === 'command-line' });

  if (game.screen === 'title') return <TitleScreen onStart={game.start} onSkipTest={game.startSkipTest} />;
  if (game.screen === 'room' && game.room !== null) return <RoomView room={game.room} game={game} />;

  const keysTotal = WORLD.entities.filter((entity) => entity.kind === 'key').length;
  const region = WORLD.regions.find((candidate) =>
    game.map.engine.cursor.line >= candidate.rows.from && game.map.engine.cursor.line <= candidate.rows.to);
  return (
    <MapScreen
      location={region?.title ?? 'ATLAS'}
      keysCollected={game.progress.collectedKeys.length}
      keysTotal={keysTotal}
      power={100 - POWER_PER_DOOR * game.progress.clearedDoors.length}
      maxPower={100}
      lines={visibleLines(game.map)}
      cursor={game.map.engine.cursor}
      markers={WORLD.entities.map((entity) => ({ at: entity.at, kind: entity.kind }))}
      objective={objectiveFor(game.progress)}
      moves={movesFor(game.progress)}
      log={game.log.map((line) => ({ speaker: line.speaker, text: `${SPEAKER_PREFIX[line.speaker]}${line.text}` }))}
    />
  );
}
