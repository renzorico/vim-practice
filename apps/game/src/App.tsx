import { SPRITES } from './scene/sprites/index.js';
import { WORLD_PALETTES } from './scene/palette.js';
import { groundArt } from './scene/terrain/art.js';
import { groundVariant, titleRowGone, TITLE_ROW_CLOCK_MS } from './scene/terrain/life.js';
import { bannerBrowserKey, WorldBanner, useWorldBanner } from './scene/WorldBanner.js';
import { HelpOverlay } from './play2/help/HelpOverlay.js';
import { learnedReference } from './play2/help/learned.js';
import { routeHelpCommand } from './play2/help/command.js';
import { useSound } from './audio/hooks.js';
import { SoundButton } from './audio/SoundButton.js';
import { useScriptStamp } from './play2/useScriptStamp.js';
import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { createEngine, type Key } from '@escape/engine';
import { createWorldSim } from '@escape/world';
import { createStoryEngine } from '@escape/story';
import { shouldLeaveToBrowser } from './input/capture.js';
import { useKeyCapture } from './input/useKeyCapture.js';
import { content, legend, stage, stages } from './play2/content.js';
import { createSession, type Session } from './play2/session.js';
import { endingProgress, readProgress, saveProgress, updateProgress, type Progress } from './play2/progress.js';
import { isScoredStage } from './play2/feedback.js';
import { StageSelect } from './play2/StageSelect.js';
import { PlayScreen } from './play2/PlayScreen.js';
import { drillSkillsForStage, type SkillId } from '@escape/curriculum';
import { DrillScreen } from './drills/DrillScreen.js';
import { Copybook, copybookSkills } from './drills/Copybook.js';
import { readDrills, saveDrills, type DrillProgress } from './drills/store.js';
import './ui/tokens.css';
import './story-ui/story-ui.css';
import './play2/play.css';

const storyEngine = createStoryEngine();
const controller = createSession({ sim: createWorldSim(createEngine()), storyEngine, stage, legend, content, stages });

const storage = () => window.localStorage;
const nowIso = (): string => new Date().toISOString();
/** Title menu: Continue (when there is a save), then these, in order, offset by one when Continue shows. */
const MENU = { stages: 0, keys: 1, copybook: 2, newGame: 3, sound: 4 } as const;
interface Practice { readonly skills: readonly SkillId[]; readonly from: 'clear' | 'copybook' }
const scoredStages = stages.filter(({ stage }) => isScoredStage(stage));
const stageIds = stages.map(item => item.stage.id);
type Action = Key | { readonly type: 'new'; readonly best: Progress['best'] } | { readonly type: 'continue'; readonly progress: Progress } | { readonly type: 'stage'; readonly progress: Progress };
function reduce(session: Session, action: Action): Session {
  if (typeof action === 'string') return controller.reduce(session, action);
  if (action.type === 'continue') return controller.resume(action.progress);
  if (action.type === 'stage') {
    const replay = controller.startAt(action.progress.stage, action.progress.story);
    return { ...replay, stageEntry: { ...replay.stageEntry, ...(action.progress.best ? { best: action.progress.best } : {}) } };
  }
  const fresh = controller.init();
  return action.best ? { ...fresh, stageEntry: { ...fresh.stageEntry, best: action.best } } : fresh;
}
export function App() {
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpCommand, setHelpCommand] = useState<string | null>(null);
  // A held q or Esc keeps repeating after the overlay closes; swallow those repeats until the next real press.
  const swallowRepeats = useRef(false);
  const openHelp = useCallback(() => { setHelpCommand(null); setHelpOpen(true); }, []);
  const closeHelp = useCallback(() => { swallowRepeats.current = true; setHelpOpen(false); }, []);
  const [clearedSince, setClearedSince] = useState<readonly string[]>([]);
  const [started, setStarted] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [saved, setSaved] = useState(() => readProgress(storage, stageIds));
  const [choice, setChoice] = useState(saved && saved.story.ending !== 'recover' ? 0 : MENU.newGame);
  const [selecting, setSelecting] = useState(false);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [replayStage, setReplayStage] = useState<string | null>(null);
  const [session, dispatch] = useReducer(reduce, undefined, () => controller.init());
  const [drillProgress, setDrillProgress] = useState(() => readDrills(storage));
  const updateDrills = useCallback((progress: DrillProgress) => { setDrillProgress(progress); saveDrills(storage, progress); }, []);
  const [practice, setPractice] = useState<Practice | null>(null);
  const [copybookOpen, setCopybookOpen] = useState(false);
  const drilling = practice !== null || copybookOpen;
  const stageDrills = drillSkillsForStage(session.world.stage);
  const currentWorld = stages.find(item => item.stage.id === session.world.stage)?.stage.world ?? 'margin';
  const banner = useWorldBanner(currentWorld, started);
  const sound = useSound(session, started);
  const scriptStamp = useScriptStamp(session);
  const ending = !session.clearCard && session.queue[0]?.type === 'ending' ? session.queue[0].ending : null;
  const canContinue = saved !== null && saved.story.ending !== 'recover';
  const menu = Object.fromEntries(Object.entries(MENU).map(([item, index]) => [item, index + (canContinue ? 1 : 0)])) as Record<keyof typeof MENU, number>;
  const terminal = session.world.status === 'cleared' && !session.clearCard && session.queue.length === 0;
  const choose = useCallback((continueGame: boolean) => {
    if (continueGame && saved && canContinue) dispatch({ type: 'continue', progress: saved });
    else {
      dispatch({ type: 'new', best: saved?.best });
      setSaved(null);
      setClearedSince([]);
    }
    setReplayStage(null);
    setShowSource(false);
    setStarted(true);
  }, [saved, canContinue]);
  const openStages = useCallback(() => {
    setSelectedStage(content.openingStage);
    setSelecting(true);
  }, [saved]);
  const backToTitle = useCallback(() => { setSelecting(false); setChoice(canContinue ? 1 : 0); }, [canContinue]);
  const playStage = useCallback((id: string) => {
    const continues = saved?.stage === id && saved.story.ending === null;
    const story = saved?.entries?.[id] ?? (id === content.openingStage ? controller.init().story : undefined);
    if (!continues && !story) return;
    if (continues) dispatch({ type: 'continue', progress: saved });
    else if (story) {
      const progress = { stage: id, story: { ...story, learnedSkills: saved?.story.learnedSkills ?? story.learnedSkills },
        ...(saved?.best ? { best: saved.best } : {}) };
      dispatch({ type: 'stage', progress });
    }
    setReplayStage(saved && !continues ? id : null);
    setSelecting(false); setShowSource(false); setStarted(true);
  }, [saved]);
  const onKey = useCallback((key: Key) => {
    if (!started || helpOpen || banner.visible) return;
    if (scriptStamp) return;
    const active = session.world.script?.engine ?? session.world.engine;
    if (helpCommand !== null || (key === ':' && active.mode === 'normal' && active.pendingKeys.length === 0)) {
      const routed = routeHelpCommand(helpCommand, key);
      setHelpCommand(routed.pending);
      if (routed.open) openHelp();
      else for (const forwarded of routed.forward) dispatch(forwarded);
      return;
    }
    if (session.clearCard && key === 'p' && stageDrills.length > 0) {
      setPractice({ skills: stageDrills.map(skill => skill.id), from: 'clear' }); return;
    }
    if (replayStage && session.clearCard && key === '<CR>') {
      setStarted(false); setSelecting(true); setSelectedStage(replayStage); setReplayStage(null); return;
    }
    if (key === '<Tab>') { setShowSource(true); return; }
    if ((terminal || ending === 'recover') && key === '<CR>') { setStarted(false); setChoice(ending === 'recover' ? MENU.newGame : 0); return; }
    dispatch(key);
  }, [started, terminal, ending, scriptStamp, replayStage, session.clearCard, session.world, helpCommand, helpOpen, openHelp, banner.visible, stageDrills]);
  const replay = useCallback(() => onKey('r'), [onKey]);
  const advance = useCallback(() => onKey('<CR>'), [onKey]);
  useKeyCapture({ onKey, onHint: openHelp, captureTab: true,
    enabled: started && !drilling && !helpOpen && !banner.visible && (session.world.status !== 'dead' || helpCommand !== null) });
  useEffect(() => {
    const wake = (event: KeyboardEvent): void => {
      if (drilling) return; // The drill and Copybook screens own the keyboard.
      if (started && banner.visible && bannerBrowserKey(event)) return;
      if (started && banner.dismiss(event)) {
        swallowRepeats.current = true;
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      if (!event.repeat) swallowRepeats.current = false;
      else if (swallowRepeats.current) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      if (helpOpen || event.isComposing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'F1') { event.preventDefault(); event.stopImmediatePropagation(); openHelp(); return; }
      if (selecting) {
        if (['j', 'k', 'Enter', 'Escape', 'q'].includes(event.key)) {
          const target = event.target instanceof HTMLElement ? event.target : null;
          if (target && shouldLeaveToBrowser(event.key, target, true) && event.key !== 'Escape') return;
          event.preventDefault(); event.stopImmediatePropagation();
          if (event.repeat && event.key === 'Enter') return;
          if (event.key === 'Escape' || event.key === 'q') backToTitle();
          else if (event.key === 'Enter' && selectedStage) playStage(selectedStage);
          else if (event.key === 'j' || event.key === 'k') {
            const reached = stageIds.filter(id => id === content.openingStage || id === saved?.stage || saved?.entries?.[id]);
            const index = Math.max(0, reached.indexOf(selectedStage ?? ''));
            setSelectedStage(reached[Math.max(0, Math.min(reached.length - 1, index + (event.key === 'j' ? 1 : -1)))] ?? null);
          }
        }
        return;
      }
      const target = event.target instanceof HTMLElement ? event.target : null;
      const browserKey = shouldLeaveToBrowser(event.key, target, true);
      const wakeKey = !browserKey && ([...event.key].length === 1 || event.key === 'Enter');
      const blockedRepeat = event.repeat && (event.key === 'Enter' || event.key === ' '
        || session.world.status === 'dead' || terminal);
      if (blockedRepeat && wakeKey) {
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      if ((!started || session.world.status === 'dead') && wakeKey) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!started) {
          if (event.key === 'j') setChoice(value => Math.min(menu.sound, value + 1));
          else if (event.key === 'k') setChoice(value => Math.max(0, value - 1));
          else if (event.key === 'Enter') {
            if (choice === menu.stages) openStages();
            else if (choice === menu.keys) openHelp();
            else if (choice === menu.copybook) setCopybookOpen(true);
            else if (choice === menu.sound) sound.toggle();
            else choose(canContinue && choice === 0);
          }
        } else if (event.key === ':' || helpCommand !== null) onKey(event.key === 'Enter' ? '<CR>' : event.key);
        else dispatch(event.key === 'Enter' ? '<CR>' : event.key);
      } else if (started && event.key === 'Tab' && !browserKey) {
        event.preventDefault(); event.stopImmediatePropagation(); setShowSource(true);
      }
    };
    window.addEventListener('keydown', wake, true);
    return () => window.removeEventListener('keydown', wake, true);
  }, [started, session.world.status, terminal, saved, canContinue, choice, choose, selecting, selectedStage, playStage, backToTitle, openStages, sound.toggle, helpOpen, openHelp, helpCommand, onKey, banner.dismiss, banner.visible, drilling]);
  useEffect(() => {
    if (!started) return;
    const entry = replayStage ? session.stageEntry : endingProgress(session.stageEntry, session.story);
    const progress = updateProgress(saved, entry, replayStage !== null);
    if (saved === progress || (saved?.story === progress.story && saved?.stage === progress.stage && saved?.best === progress.best && saved?.entries === progress.entries)) return;
    saveProgress(storage, progress);
    setSaved(progress);
  }, [started, session, saved, ending, replayStage]);
  useEffect(() => { if (!started) setHelpCommand(null); }, [started]);
  useEffect(() => {
    const cleared = session.story.clearedStages;
    setClearedSince(known => cleared.every(id => known.includes(id)) ? known : [...new Set([...known, ...cleared])]);
  }, [session.story.clearedStages]);
  useEffect(() => {
    if (started && ending === 'delete') { setStarted(false); setChoice(0); }
  }, [started, ending]);
  useEffect(() => {
    const release = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') { event.preventDefault(); setShowSource(false); }
    };
    const blur = (): void => setShowSource(false);
    window.addEventListener('keyup', release);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keyup', release); window.removeEventListener('blur', blur); };
  }, []);
  const helpStory = started ? session.story : saved?.story ?? session.story;
  const reference = helpOpen ? learnedReference(helpStory, started ? session.world.stage : saved?.stage ?? content.openingStage) : null;
  const withHelp = (view: ReactNode): ReactNode => <>
    <div hidden={helpOpen}>{view}</div>
    {reference && <HelpOverlay {...reference} worlds={content.worlds} onClose={closeHelp} />}
  </>;
  const cleared = [...new Set([...clearedSince, ...session.story.clearedStages, ...(saved?.story.clearedStages ?? [])])];
  const drillScreen = practice && <DrillScreen skills={practice.skills} progress={drillProgress} onProgress={updateDrills} now={nowIso}
    exitLabel={practice.from === 'clear' ? 'Back to the stage' : 'Back to the Copybook'}
    onExit={() => { if (practice.from === 'copybook') setCopybookOpen(true); setPractice(null); }} />;
  if (copybookOpen) return <Copybook skills={copybookSkills(cleared, drillProgress, nowIso())} progress={drillProgress} now={nowIso()}
    onPlay={skill => { setCopybookOpen(false); setPractice({ skills: [skill], from: 'copybook' }); }} onBack={() => setCopybookOpen(false)} />;
  if (practice?.from === 'copybook') return drillScreen;
  if (selecting) return withHelp(<StageSelect stages={stages} content={content} progress={saved} selected={selectedStage} onSelect={playStage} onBack={backToTitle} />);
  if (!started) return withHelp(<main className="play-title">
    <TitleScene />
    <div className="play-title__menu">
    <h1>UNSAVED</h1><p>A game that teaches Vim.</p>
    <nav aria-label="Start game" className="play-menu">
      {canContinue && <button aria-current={choice === 0 ? 'true' : undefined} onClick={() => choose(true)}>Continue</button>}
      {saved?.best && scoredStages.some(({ stage }) => saved.best?.[stage.id]) && <p className="play-stars">Stars: {scoredStages.reduce((sum, { stage }) => sum + (saved.best?.[stage.id]?.stars ?? 0), 0)} / {scoredStages.length * 3}</p>}
      <button aria-current={choice === menu.stages ? 'true' : undefined} onClick={openStages}>Stages</button>
      <button aria-current={choice === menu.keys ? 'true' : undefined} onClick={openHelp}>Keys</button>
      <button aria-current={choice === menu.copybook ? 'true' : undefined} onClick={() => setCopybookOpen(true)}>Copybook</button>
      <button aria-current={choice === menu.newGame ? 'true' : undefined} onClick={() => choose(false)}>New game</button>
      <div className="play-menu__sound" data-selected={choice === menu.sound}>
        <SoundButton enabled={sound.enabled} onToggle={sound.toggle} />
      </div>
    </nav>
    <p className="play-menu-hint"><kbd>j</kbd> / <kbd>k</kbd> to choose · <kbd>Enter</kbd> to start</p>
    </div>
  </main>);
  const current = stages.find(item => item.stage.id === session.world.stage);
  if (!current) throw new Error(`Missing stage ${session.world.stage}`);
  // Replays run on the story from before the clear, so remember what this game has cleared since.
  const clearedStages = cleared;
  return withHelp(<>
    {drillScreen}
    {/* While a drill is open the game under it is inert: no focus, no clicks, no native Enter on its buttons. */}
    <div className="play-root" {...(practice ? { inert: '' } : {})}>
    {banner.visible && <WorldBanner world={banner.visible} onDismiss={() => { banner.dismiss(); }} />}
    <PlayScreen clearedStages={clearedStages} helpOpen={helpOpen} soundEnabled={sound.enabled} onToggleSound={sound.toggle} session={session} stage={current.stage} legend={current.legend} content={content}
    onOpenHelp={openHelp} helpCommand={helpCommand} objectives={storyEngine.objectives(session.story, content)} showSource={showSource} scriptStamp={scriptStamp} onAdvance={advance} onReplay={replay}
    practiseKeys={stageDrills.flatMap(skill => skill.keys)} onPractise={() => onKey('p')} /></div></>);
}

const TITLE_WIDTH = 384;
const TITLE_HEIGHT = 240;
/** A small original Margin tableau drawn from the same tile atlas as the field. */
const TITLE_TILE_SIZE = 16;
const TITLE_FIRST_ROW = 4;
const TITLE_ROWS = 15;
const TITLE_COLS = 24;
const TITLE_PAPER_COL = 16;
const TITLE_ROAD_ROW = 10;
const TITLE_SKY_HEIGHT = 38;
const TITLE_TREES = [1, 4, 8, 12];
const TITLE_HOUSE_COLS = [3, 4, 5];
const TITLE_TILDE_COL = 17;
const TITLE_GLYPH_BASELINE = 12;
const TITLE_TREE_ROWS = [5, 13];
const TITLE_ROOF_ROW = 7;
const TITLE_HOUSE_ROW = 8;
const TITLE_WELL = { col: 10, line: 8 };
const TITLE_STONE = { col: 7, line: 11 };
const TITLE_PLAYER = { col: 14, line: 9 };
function TitleScene() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let tick = 0;
    const palette = WORLD_PALETTES.margin;
    const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
    const tile = (sprite: string, col: number, line: number): void => {
      const art = SPRITES[sprite];
      if (!art) return;
      art.frames[0]?.forEach((row, y) => [...row].forEach((pixel, x) => {
        const color = art.palette[pixel];
        if (color && color !== 'transparent') { context.fillStyle = color; context.fillRect(col * TITLE_TILE_SIZE + x, line * TITLE_TILE_SIZE + y, 1, 1); }
      }));
    };
    const draw = (): void => {
      context.clearRect(0, 0, TITLE_WIDTH, TITLE_HEIGHT);
      context.fillStyle = '#d9ad82'; context.fillRect(0, 0, TITLE_WIDTH, TITLE_HEIGHT);
      context.fillStyle = '#edcca2'; context.fillRect(0, 0, TITLE_WIDTH, TITLE_SKY_HEIGHT);
      for (let line = TITLE_FIRST_ROW; line < TITLE_ROWS; line++) for (let col = 0; col < TITLE_COLS; col++) {
        const paper = col >= TITLE_PAPER_COL || (titleRowGone(tick, reduced.matches) && line === TITLE_ROAD_ROW);
        if (paper) { context.fillStyle = hex(palette.paper); context.fillRect(col * TITLE_TILE_SIZE, line * TITLE_TILE_SIZE, TITLE_TILE_SIZE, TITLE_TILE_SIZE); continue; }
        const road = line === TITLE_ROAD_ROW;
        tile(road ? 'road' : 'grass', col, line);
        if (!road) for (const pixel of groundArt('margin', groundVariant(line, col))) {
          context.globalAlpha = pixel.alpha; context.fillStyle = hex(pixel.color);
          context.fillRect(col * TITLE_TILE_SIZE + pixel.x, line * TITLE_TILE_SIZE + pixel.y, pixel.width, pixel.height);
        }
        context.globalAlpha = 1;
      }
      for (let line = TITLE_FIRST_ROW; line < TITLE_ROWS; line++) {
        context.fillStyle = '#687b74'; context.font = '12px monospace';
        context.fillText('~', TITLE_TILDE_COL * TITLE_TILE_SIZE, line * TITLE_TILE_SIZE + TITLE_GLYPH_BASELINE);
      }
      for (const col of TITLE_TREES) for (const line of TITLE_TREE_ROWS) tile('tree', col, line);
      for (const col of TITLE_HOUSE_COLS) { tile('house-roof', col, TITLE_ROOF_ROW); tile('house-wall', col, TITLE_HOUSE_ROW); }
      tile('well', TITLE_WELL.col, TITLE_WELL.line); tile('save-stone', TITLE_STONE.col, TITLE_STONE.line);
      tile('player', TITLE_PLAYER.col, TITLE_PLAYER.line);
    };
    draw();
    const timer = setInterval(() => { if (!reduced.matches) { tick++; draw(); } }, TITLE_ROW_CLOCK_MS);
    const change = (): void => { tick = 0; draw(); };
    reduced.addEventListener('change', change);
    return () => { clearInterval(timer); reduced.removeEventListener('change', change); };
  }, []);
  return <canvas className="title-scene" ref={canvas} width={TITLE_WIDTH} height={TITLE_HEIGHT} aria-hidden="true" />;
}
