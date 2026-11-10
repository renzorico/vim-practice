/**
 * The Phase 3 game: title, world map, rooms (lesson -> practice -> challenge, with the fail flow), skip test.
 * Pure orchestration over the curriculum modules; the solver, storage and clock are injected.
 */
import {
  GENERATORS, SKILLS, canShowSolution, canSkip, finalizeRoom, isOverParLimit, mapCommands, recordResult,
  skillSlug, startLevel, startMap, startSession, stepLevel, stepMap, transition, usedSkills,
} from '@escape/curriculum';
import type {
  Difficulty, Level, LevelRun, MapEvent, MapProgress, MapState, RoomEvent, RoomSession, SaveData, SkillId, SolveFn,
} from '@escape/curriculum';
import type { Key, Position } from '@escape/engine';
import { createStore, type StoreApi } from 'zustand/vanilla';
import { ECHO, LESSONS, WORLD } from './content.js';
import { emptyProgress, type Progress, type ProgressStorage } from './progress.js';

export type Speaker = 'operator' | 'gc' | 'echo';
export interface LogEntry { readonly speaker: Speaker; readonly text: string }

export interface Room {
  readonly skill: SkillId;
  /** The door this room clears when won (null for the skip test). */
  readonly doorId: string | null;
  readonly skipTest: boolean;
  readonly session: RoomSession;
  readonly level: Level;
  readonly run: LevelRun;
  /** Failure count at which the player dismissed the help banner ("Keep trying"). */
  readonly bannerDismissedAt: number;
  /** Practice micro-tasks finished in this room (the challenge starts after PRACTICE_ROUNDS). */
  readonly practiceWins: number;
  /** Hints revealed during practice (the session tracks challenge hints). */
  readonly practiceHints: number;
}

export type Screen = 'title' | 'map' | 'room';

export interface GameState {
  readonly screen: Screen;
  readonly progress: Progress;
  readonly map: MapState;
  readonly log: readonly LogEntry[];
  readonly room: Room | null;
  readonly echoVisits: number;
}

export interface GameActions {
  pressKey(key: Key): void;
  start(): void;
  startSkipTest(): void;
  continueLesson(): void;
  hint(): void;
  showSolution(): void;
  newRoomAfterSolution(): void;
  keepTrying(): void;
  skip(): void;
  leaveRoom(): void;
}

export type Game = GameState & GameActions;

export interface GameDeps {
  readonly solve: SolveFn;
  readonly storage: ProgressStorage;
  readonly now: () => string;
}

/** Skills in the order the player meets their notes on the map (reading order), which is the teaching order. */
export const SKILL_ORDER: readonly SkillId[] = WORLD.entities
  .filter((entity) => entity.kind === 'note' && entity.skill !== undefined)
  .map((entity) => entity.skill ?? '');
const PROLOGUE_SKILLS: readonly SkillId[] = SKILLS.filter((skill) => skill.region === 'prologue').map((skill) => skill.id);
const BOOT_KEY = 'key-boot-sector';
const MAX_LOG = 4;
const PRACTICE: Difficulty = 1;
/** Guided micro-tasks before the challenge (GAME-DESIGN §4: 2-3). */
const PRACTICE_ROUNDS = 2;
/** The skip test gives up and suggests the Prologue after this many failed tries. */
const SKIP_TEST_TRIES = 2;
const SEED_STRIDE = 1000;
const CHALLENGE: Difficulty = 2;
/** Where a player who passed the skip test starts: the first Region 1 note. */
const REGION_ONE_START: Position = { line: 8, col: 2 };

export const doorIdFor = (skill: SkillId): string => `door-${skillSlug(skill)}`;

export function learnedSkills(save: SaveData): ReadonlySet<SkillId> {
  return new Set(Object.values(save.mastery).filter((mastery) => mastery.box >= 1).map((mastery) => mastery.skill));
}

/** Doors the player has finished with: cleared, or skipped (skipped skills come back in review). */
export function resolvedDoors(progress: Progress): ReadonlySet<string> {
  return new Set([...progress.clearedDoors, ...progress.skippedDoors]);
}

/** Catalog prerequisites of a skill that the player has not learned yet. */
export function missingPrerequisites(skill: SkillId, learned: ReadonlySet<SkillId>): SkillId[] {
  const definition = SKILLS.find((candidate) => candidate.id === skill);
  return (definition?.prerequisites ?? []).filter((prerequisite) => !learned.has(prerequisite));
}

export function mapProgressOf(progress: Progress): MapProgress {
  return {
    learned: learnedSkills(progress.save),
    collectedKeys: new Set(progress.collectedKeys),
    clearedDoors: new Set(progress.clearedDoors),
  };
}

/** The next thing to do, in plain words. */
export function objectiveFor(progress: Progress): string {
  const learned = learnedSkills(progress.save);
  const resolved = resolvedDoors(progress);
  const next = SKILL_ORDER.find((skill) => !resolved.has(doorIdFor(skill)));
  if (next === undefined) return 'The Memory Fields are clear. The rest of ATLAS is still dark.';
  const keycap = LESSONS.get(next)?.keycap ?? next;
  if (!learned.has(next)) return `Find the Operator's note (N) about ${keycap} and press Enter on it.`;
  return `Stand on the door (D) for ${keycap} and press Enter to prove you can use it.`;
}

export function failures(session: RoomSession): number {
  return session.attempts + session.failedVariants;
}

export function createGame(deps: GameDeps): StoreApi<Game> {
  const initialProgress = deps.storage.load() ?? emptyProgress();

  const buildLevel = (skill: SkillId, seed: number, difficulty: Difficulty): Level => {
    const generator = GENERATORS[skill];
    if (generator === undefined) throw new Error(`No room generator for ${skill}`);
    return finalizeRoom(generator.generate(seed, difficulty), deps.solve);
  };

  // A lesson leads into practice, so it is served a practice room too.
  const levelFor = (session: RoomSession): Level =>
    buildLevel(session.skill, session.seed, session.phase === 'practice' || session.phase === 'lesson' ? PRACTICE : CHALLENGE);

  const mapFor = (progress: Progress): MapState => startMap(WORLD, mapProgressOf(progress));

  return createStore<Game>((set, get) => {
    const persist = (progress: Progress): void => {
      deps.storage.save(progress);
      set({ progress });
    };

    const say = (speaker: Speaker, text: string): void => {
      set({ log: [...get().log, { speaker, text }].slice(-MAX_LOG) });
    };

    const record = (progress: Progress, room: Room, run: LevelRun, won: boolean): Progress => ({
      ...progress,
      save: recordResult(progress.save, {
        levelId: room.level.id, won, stars: run.stars, keystrokes: run.keystrokes,
        usedSkills: [...usedSkills(run.commandLog)], finishedAt: deps.now(),
      }, [room.level]),
    });

    const openRoom = (skill: SkillId, doorId: string | null, skipTest: boolean): void => {
      const { progress } = get();
      const seed = progress.seedCounter + 1;
      const learned = learnedSkills(progress.save);
      let session = startSession(skill, seed, { skipLesson: skipTest || (doorId !== null && learned.has(skill)) });
      if (skipTest) session = transition(session, { type: 'practice-done' });
      const level = skipTest ? buildLevel(skill, seed, PRACTICE) : levelFor(session);
      persist({ ...progress, seedCounter: seed });
      set({
        screen: 'room',
        room: {
          skill, doorId, skipTest, session, level, run: startLevel(level), bannerDismissedAt: 0, practiceWins: 0, practiceHints: 0,
        },
      });
    };

    /** Applies a session event; serves a fresh room whenever the session moved to a new seed or phase. */
    const applyEvent = (room: Room, event: RoomEvent): Room => {
      const session = transition(room.session, event);
      if (session === room.session) return room;
      const needsNewLevel = session.seed !== room.session.seed
        || (session.phase === 'challenge' && room.session.phase === 'practice');
      const level = needsNewLevel && !room.skipTest ? levelFor(session) : room.level;
      return { ...room, session, level, run: needsNewLevel ? startLevel(level) : room.run };
    };

    const winRoom = (room: Room, run: LevelRun): void => {
      // The skip test grants the Prologue skills once (passSkipTest); recording the run too would count them twice.
      let progress = room.skipTest ? get().progress : record(get().progress, room, run, true);
      if (room.doorId !== null && !progress.clearedDoors.includes(room.doorId)) {
        progress = { ...progress, clearedDoors: [...progress.clearedDoors, room.doorId] };
      }
      if (room.skipTest) progress = passSkipTest(progress);
      persist(progress);
      set({ room: { ...room, run, session: transition(room.session, { type: 'run-ended', run }) } });
    };

    const passSkipTest = (progress: Progress): Progress => {
      const save = PROLOGUE_SKILLS.reduce((current, skill) => recordResult(current, {
        levelId: `skip-${skillSlug(skill)}`, won: true, stars: 1, keystrokes: 0, usedSkills: [skill], finishedAt: deps.now(),
      }, []), progress.save);
      const doors = PROLOGUE_SKILLS.map(doorIdFor).filter((door) => !progress.clearedDoors.includes(door));
      return {
        ...progress,
        save,
        clearedDoors: [...progress.clearedDoors, ...doors],
        collectedKeys: progress.collectedKeys.includes(BOOT_KEY) ? progress.collectedKeys : [...progress.collectedKeys, BOOT_KEY],
      };
    };

    const stepRoom = (key: Key): void => {
      const room = get().room;
      if (room === null) return;
      const phase = room.session.phase;
      if (phase === 'lesson') {
        if (key === '<CR>') get().continueLesson();
        return;
      }
      if (phase === 'won' || phase === 'skipped') {
        if (key === '<CR>') get().leaveRoom();
        return;
      }
      if (phase !== 'practice' && phase !== 'challenge') return;

      const stepped = stepLevel(room.run, key);
      // The runner only fails a quit in rooms without a quit goal. In a "save and quit" room, a wrong quit
      // (e.g. :q! when the goal needs a save) would leave the run stuck: treat any quit that did not win as a failure.
      const run: LevelRun = stepped.status === 'playing' && stepped.state.quitRequested
        ? { ...stepped, status: 'failed', failureReason: 'quit' }
        : stepped;
      if (run.status === 'playing') {
        if (phase === 'challenge' && isOverParLimit(run.keystrokes, room.level.par)) {
          say('operator', 'That was a lot of keys. The room resets: try the move the note taught.');
          const reset = applyEvent(room, { type: 'gave-up' });
          set({ room: { ...reset, run: startLevel(reset.level) } });
          return;
        }
        set({ room: { ...room, run } });
        return;
      }
      if (phase === 'practice') {
        if (run.status === 'won') {
          const practiceWins = room.practiceWins + 1;
          if (practiceWins < PRACTICE_ROUNDS) {
            const level = buildLevel(room.skill, room.session.seed + SEED_STRIDE * practiceWins, PRACTICE);
            say('operator', 'Good. One more, a little different.');
            set({ room: { ...room, level, run: startLevel(level), practiceWins, practiceHints: 0 } });
            return;
          }
          const progress = record(get().progress, room, run, true);
          persist(progress);
          say('operator', `${LESSONS.get(room.skill)?.keycap ?? room.skill} is yours now, on the map too. Now the real room.`);
          set({ room: applyEvent({ ...room, practiceWins }, { type: 'practice-done' }) });
        } else {
          set({ room: { ...room, run: startLevel(room.level) } });
        }
        return;
      }
      if (run.status === 'won') {
        winRoom(room, run);
        return;
      }
      // A failed challenge run (gave up with :q, or a must-use rule) counts one failed attempt; play again.
      const next = applyEvent(room, { type: 'run-ended', run });
      if (room.skipTest && next.session.attempts >= SKIP_TEST_TRIES) {
        say('operator', 'No shame in it. Start from the Boot Sector: the notes there teach exactly this.');
        set({ screen: 'map', room: null, map: mapFor(get().progress) });
        return;
      }
      set({ room: { ...next, run: next.run === room.run ? startLevel(next.level) : next.run } });
    };

    const handleMapEvent = (event: MapEvent): void => {
      const progress = get().progress;
      switch (event.type) {
        case 'open-note': {
          const skill = event.entity.skill;
          if (skill === undefined) return;
          const missing = missingPrerequisites(skill, learnedSkills(progress.save));
          if (missing.length > 0) {
            const names = missing.map((prerequisite) => LESSONS.get(prerequisite)?.keycap ?? prerequisite).join(', ');
            say('operator', `This note builds on ${names}. Read that note first.`);
            return;
          }
          openRoom(skill, doorIdFor(skill), false);
          return;
        }
        case 'open-door':
          if (event.entity.skill !== undefined) openRoom(event.entity.skill, event.entity.id, false);
          return;
        case 'door-locked': {
          const missing = event.missing.map((skill) => LESSONS.get(skill)?.keycap ?? skill).join(', ');
          say('operator', `This door is sealed. You need ${missing} first.`);
          return;
        }
        case 'key-collected': {
          // A key only comes loose once every door of its own sector is resolved.
          const region = WORLD.regions.find((candidate) =>
            event.entity.at.line >= candidate.rows.from && event.entity.at.line <= candidate.rows.to);
          const resolved = resolvedDoors(progress);
          const open = WORLD.entities.filter((entity) => entity.kind === 'door' && region !== undefined
            && entity.at.line >= region.rows.from && entity.at.line <= region.rows.to && !resolved.has(entity.id));
          if (open.length > 0) {
            const fresh = mapFor(progress);
            const cursor = get().map.engine.cursor;
            set({ map: { ...fresh, engine: { ...fresh.engine, cursor, desiredCol: cursor.col } } });
            say('operator', `The key won't budge. ${open.length} door${open.length === 1 ? '' : 's'} in this sector still need${open.length === 1 ? 's' : ''} you.`);
            return;
          }
          persist({ ...progress, collectedKeys: [...progress.collectedKeys, event.entity.id] });
          say('gc', 'Sector access granted. Memory Fields online. Idle processes will be collected.');
          return;
        }
        case 'echo': {
          const visits = get().echoVisits;
          const lines = ECHO.visits[visits] ?? [ECHO.after_all_visits];
          for (const line of lines) say('echo', line);
          set({ echoVisits: visits + 1 });
          return;
        }
        case 'not-learned':
          say('operator', `\`${event.command}\` is not something you know yet. The notes will teach it.`);
          return;
        case 'bump':
        case 'fog':
          return;
      }
    };

    return {
      screen: 'title',
      progress: initialProgress,
      map: mapFor(initialProgress),
      log: [{ speaker: 'operator', text: 'If you are reading this, you are stuck. Good news: so was I.' }],
      room: null,
      echoVisits: 0,

      pressKey(key) {
        const { screen } = get();
        if (screen === 'title') {
          if (key === '<CR>') get().start();
          return;
        }
        if (screen === 'room') {
          stepRoom(key);
          return;
        }
        const { map, progress } = get();
        const result = stepMap(map, key, mapProgressOf(progress));
        set({ map: result.state });
        for (const event of result.events) handleMapEvent(event);
      },

      start() {
        set({ screen: 'map', map: mapFor(get().progress) });
      },

      startSkipTest() {
        openRoom('ex.wq', null, true);
      },

      continueLesson() {
        const room = get().room;
        if (room === null || room.session.phase !== 'lesson') return;
        set({ room: applyEvent(room, { type: 'lesson-done' }) });
      },

      hint() {
        const room = get().room;
        if (room === null || room.skipTest) return;
        if (room.session.phase === 'practice') {
          set({ room: { ...room, practiceHints: Math.min(room.practiceHints + 1, room.level.hints.length) } });
          return;
        }
        set({ room: applyEvent(room, { type: 'hint' }) });
      },

      showSolution() {
        const room = get().room;
        if (room === null || !canShowSolution(room.session)) return;
        set({ room: applyEvent(room, { type: 'show-solution' }) });
      },

      newRoomAfterSolution() {
        const room = get().room;
        if (room === null) return;
        set({ room: applyEvent(room, { type: 'solution-done' }) });
      },

      keepTrying() {
        const room = get().room;
        if (room === null) return;
        set({ room: { ...room, bannerDismissedAt: failures(room.session) } });
      },

      skip() {
        const room = get().room;
        if (room === null || !canSkip(room.session)) return;
        // Mark the room's own skill weak (whatever this run used) and resolve its door so the objective moves on.
        const { progress } = get();
        const save = recordResult(progress.save, {
          levelId: room.level.id, won: false, stars: 0, keystrokes: room.run.keystrokes, usedSkills: [room.skill], finishedAt: deps.now(),
        }, [room.level]);
        const door = room.doorId;
        persist({
          ...progress, save,
          skippedDoors: door === null || progress.skippedDoors.includes(door) ? progress.skippedDoors : [...progress.skippedDoors, door],
        });
        say('gc', 'Room abandoned. Skill marked weak. It will come back.');
        set({ room: applyEvent(room, { type: 'skip' }) });
      },

      leaveRoom() {
        const { room, progress, map: previous } = get();
        // Rebuild the map from progress (newly revealed regions), but keep the player where they were.
        const fresh = mapFor(progress);
        const wonSkipTest = room?.skipTest === true && room.session.phase === 'won';
        const cursor = wonSkipTest ? REGION_ONE_START : previous.engine.cursor;
        const map = { ...fresh, engine: { ...fresh.engine, cursor, desiredCol: cursor.col } };
        if (wonSkipTest) say('operator', 'You already know how to quit, so you know the Boot Sector. Welcome to the Memory Fields.');
        set({ screen: 'map', room: null, map });
      },
    };
  });
}

/** Keys the map accepts, with lock state, for the "Your moves" panel. */
export function movesFor(progress: Progress): { key: string; locked: boolean }[] {
  const allowed = new Set(mapCommands(learnedSkills(progress.save)));
  const all = ['h', 'j', 'k', 'l', 'w', 'b', 'e', 'W', 'B', 'E', '0', '^', '$', 'gg', 'G'];
  return all.map((key) => ({ key, locked: !allowed.has(key) }));
}
