import { outlineArt } from './terrain/outline.js';
import { edgesFor, tileAt } from './terrain/edges.js';
import { groundArt, terrainArt, shadowArt, type PixelRect } from './terrain/art.js';
import { decorationAt, groundVariant, particleCount, particleX, particleY, shadowScale, PARTICLE_CAP } from './terrain/life.js';
import { WORLD_PALETTES } from './palette.js';
import { rangePreview } from '../play2/showcmd.js';
import type { LandingMarker } from '../play2/feedback.js';
import { darknessAlpha, darknessFor, stageLights, DARK_STAGES, type Darkness } from './darkness.js';
import { archiveRows, archiveRowPose, type ArchiveRows } from './archiveRows.js';
import { counterStamp, type CounterStamp } from './counterStamp.js';
import { warehouseTransfer, type WarehouseTransfer } from './warehouseTransfer.js';
import { jettyDeletion, JETTY_SPLASH_FRACTION, type JettyDeletion } from './jettyDeletion.js';
import Phaser from 'phaser';
import { createEngine } from '@escape/engine';
import type { Position } from '@escape/engine';
import type { Area, Legend, Stage, WorldEvent, WorldId, WorldState } from '@escape/world';
import { unwritingAlpha, unwritingPlan } from './unwrite.js';
import { SPRITES } from './sprites/index.js';
import {
  rowAnimationStart, animationSteps, PLAYBACK_BUDGET_MS, LANDING_DURATION_MS,
  actorIdleFrame, bumpDirection, bumpLean, carryPosition, cellsBetween, walkDuration,
  jumpHeight, motionProgress, walkBob, type AnimationStep,
} from './animate.js';
import { BACKGROUND, BUFFER_NAME, edgeColor, spriteColor, TILE_SCALE, TILE_SIZE } from './palette.js';
import { blankEdges, tileGrid } from './tiles.js';
import { bufferSize, cameraTarget, fieldZoom } from './camera.js';

export interface FieldFrame {
  readonly state: WorldState;
  readonly events: readonly WorldEvent[];
  readonly legend: Legend;
  readonly stage: Stage;
  readonly showSource: boolean;
  readonly darkness?: Darkness;
  readonly registerTarget?: { readonly x: number; readonly y: number };
  readonly hazards?: readonly Area[];
  readonly markers?: readonly LandingMarker[];
  readonly objectiveTarget?: Position | null;
  readonly hideCursor?: boolean;
  readonly hideObjective?: boolean;
  readonly standAt?: readonly Position[];
}

const presentationEngine = createEngine();
const NO_CELLS: readonly Position[] = [];
const center = (cell: number): number => cell * TILE_SIZE + TILE_SIZE / 2;
const PILE_OFFSET_PX = 3;
const GUIDANCE_PERIOD_MS = 1000;
const CURSOR_ON_MS = 600;
const ARROW_OUTLINE = 0x20252b;
const OBJECTIVE_BOB_PX = 2;
// Match the field art: scarf gold, canopy sky, port copper, library gilt, cave crystal, page ink.
const WORLD_ACCENTS: Readonly<Record<WorldId, number>> = {
  margin: 0xfabd2f, lowlands: 0xfabd2f, quarry: 0xfabd2f, wordwood: 0x91bbc1,
  'copper-port': 0xd39b69, library: 0xd3ae58, 'echo-caves': 0xac79e5, 'last-page': 0x292c2a,
};

const HAZARD_SHADE = 0x1b2a3a;

const DUST_DURATION_MS = 60;
const TRAIL_ALPHAS = [0.35, 0.25, 0.15] as const;

export class FieldScene extends Phaser.Scene {
  private frame: FieldFrame;
  private terrainImages: { image: Phaser.GameObjects.Image; frames: readonly [string, string]; animated: boolean; at: Position }[] = [];
  private underImages: { image: Phaser.GameObjects.Image; at: Position }[] = [];
  private terrainRows: readonly string[] | undefined;
  private terrainLegend: Legend | undefined;
  private terrainWorld: WorldId | undefined;
  private outlineImages: Phaser.GameObjects.Image[] = [];
  private outlineKeys = new Map<string, string>();
  private shadowImages: Phaser.GameObjects.Image[] = [];
  private ambientImages: Phaser.GameObjects.Image[] = [];
  private ambientElapsed = 0;
  private ambientWidth = 1;
  private ambientHeight = 1;
  private ready = false;
  private pulsing = new Set<Phaser.GameObjects.Image>();
  private animating = false;
  private reducedMotion: boolean;
  private tiles: Phaser.GameObjects.Container | undefined;
  private hazards: Phaser.GameObjects.Container | undefined;
  private actors: Phaser.GameObjects.Container | undefined;
  private source: Phaser.GameObjects.Container | undefined;
  private label: Phaser.GameObjects.Text | undefined;
  private player: Phaser.GameObjects.Image | undefined;
  private entities = new Map<string, Phaser.GameObjects.Image>();
  private pileOffsets = new Map<string, number>();
  private cells = new Map<string, {
    char: string; sprite: string; tile: Phaser.GameObjects.Image; glyph: Phaser.GameObjects.Image;
    line: number; variant: number; glyphKey: string;
  }>();
  private unwriting: { image: Phaser.GameObjects.Image; col: number; columns: number }[] = [];
  private dust: Phaser.GameObjects.Image[] = [];
  private junk: { image: Phaser.GameObjects.Image; splash: Phaser.GameObjects.Image; at: Position }[] = [];
  private archiveFold: ArchiveRows | null = null;
  private foldedRows: { image: Phaser.GameObjects.Image }[] = [];
  private transfer: WarehouseTransfer | null = null;
  private stamp: CounterStamp | null = null;
  private cargo: { image: Phaser.GameObjects.Image; at: Position }[] = [];
  private decorations: Phaser.GameObjects.Container | undefined;
  private markFlags: Phaser.GameObjects.Container | undefined;
  private decoratedStage: string | null = null;
  private deletion: JettyDeletion | null = null;
  private danger: Phaser.GameObjects.Image | undefined;
  private gateMarks: Phaser.GameObjects.Container | undefined;
  private shownMarkers: readonly { key: string; line: number; col: number; alpha: number }[] = [];
  private landingLabels: Phaser.GameObjects.Container | undefined;
  private prompts: Phaser.GameObjects.Container | undefined;
  private facing = new Map<string, boolean>();
  private idleFrame = 0;
  private idleElapsed = 0;
  private actorFrames = new Map<string, number>();
  private trail: Phaser.GameObjects.Image[] = [];
  private bumpDust: Phaser.GameObjects.Image | undefined;
  private cameraY = 0;
  private cameraX = 0;
  private cursorElapsed = 0;
  private guidanceElapsed = 0;
  private guidanceTextures = new Map<WorldId, Map<string, string>>();
  private cursorTexture: string | undefined;
  private cursorMark: Phaser.GameObjects.Image | undefined;
  private standMarks: Phaser.GameObjects.Image[] = [];
  private rangeMarks: Phaser.GameObjects.Image[] = [];
  private objectiveArrow: Phaser.GameObjects.Image | undefined;
  private groundPosition: Position | undefined;
  private scrollOffset = 0;
  private previousState: WorldState | undefined;
  private previousEvents: readonly WorldEvent[] | undefined;

  constructor(frame: FieldFrame, reducedMotion: boolean) {
    super({ key: 'field' });
    this.frame = frame;
    this.reducedMotion = reducedMotion;
  }

  create(): void {
    for (const [name, art] of Object.entries(SPRITES)) art.frames.forEach((_, frame) => this.texture(name, frame));
    this.time.addEvent({ delay: 900, loop: true, callback: () => {
      if (this.reducedMotion) return;
      this.idleFrame = (this.idleFrame + 1) % 2;
      this.syncGateMarks();
      for (const overlay of this.terrainImages) if (overlay.animated) overlay.image.setTexture(overlay.frames[this.idleFrame === 0 ? 0 : 1]);
      for (const cell of this.cells.values()) {
        if ((cell.sprite === 'port-water' || cell.sprite === 'water' || cell.sprite === 'river' || cell.sprite === 'chasm' || cell.sprite === 'fake')) cell.tile.setTexture(this.texture(cell.sprite, this.idleFrame));
      }
    } });
    this.tiles = this.add.container(0, 0);
    this.actors = this.add.container(0, 0).setDepth(2);
    this.source = this.add.container(0, 0).setDepth(1);
    this.gateMarks = this.add.container(0, 0).setDepth(1);
    this.landingLabels = this.add.container(0, 0).setDepth(3);
    this.prompts = this.add.container(0, 0).setDepth(4);
    this.hazards = this.add.container(0, 0).setDepth(0.5);
    this.decorations = this.add.container(0, 0).setDepth(0.8);
    this.markFlags = this.add.container(0, 0).setDepth(2.5);
    this.label = this.add.text(8, 8, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffe8b2', backgroundColor: BACKGROUND,
    }).setScrollFactor(0).setDepth(3);
    this.cameras.main.setZoom(TILE_SCALE).setRoundPixels(true);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.resizeView, this);
    this.ready = true;
    this.present(this.frame);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.scale.off(Phaser.Scale.Events.RESIZE, this.resizeView, this);
      this.clearUnwriting();
      this.clearDust();
      this.clearJunk();
      this.clearTransfer();
      this.clearStamp();
      this.clearArchiveRows();
      this.cells.clear();
      this.terrainImages = [];
      this.underImages = [];
      this.shadowImages = [];
      this.outlineImages = [];
      this.outlineKeys.clear();
      this.ambientImages = [];
      this.terrainRows = undefined;
      this.previousState = undefined;
      this.previousEvents = undefined;
      this.tweens.killAll();
      this.entities.clear();
      this.trail = [];
      this.bumpDust = undefined;
      this.actorFrames.clear();
    });
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
    for (const overlay of this.terrainImages) if (overlay.animated) overlay.image.setTexture(overlay.frames[0]);
    this.updateAmbient(0);
    this.cursorElapsed = 0;
    this.syncGuidance();
    if (value) {
      this.idleFrame = 0;
      this.finish();
      this.actorFrames.clear();
      if (this.ready) this.syncActors();
      for (const cell of this.cells.values()) if ((cell.sprite === 'port-water' || cell.sprite === 'water' || cell.sprite === 'river' || cell.sprite === 'chasm' || cell.sprite === 'fake')) cell.tile.setTexture(this.texture(cell.sprite));
    }
  }

  /** Each actor owns a stable phase; tile animation uses its separate, slower clock. */
  override update(_time: number, delta: number): void {
    this.updateAmbient(delta);
    this.syncActorShadows();
    this.guidanceElapsed += delta;
    if (!this.reducedMotion) this.cursorElapsed = (this.cursorElapsed + delta) % GUIDANCE_PERIOD_MS;
    if (this.reducedMotion) { this.syncGuidance(); return; }
    this.idleElapsed += delta;
    const apply = (id: string, sprite: string, image: Phaser.GameObjects.Image | undefined): void => {
      const frame = actorIdleFrame(id, this.idleElapsed);
      if (this.actorFrames.get(id) === frame) return;
      image?.setTexture(this.texture(sprite, frame));
      this.actorFrames.set(id, frame);
    };
    apply('player', 'player', this.player);
    for (const entity of this.frame.state.entities) apply(entity.id, this.entitySprite(entity.def.sprite), this.entities.get(entity.id));
    this.syncGuidance();
  }

  /** Explicit discontinuities (restores, stage changes and reduced motion) snap everything. */
  finish(): void {
    if (!this.ready || (!this.animating && this.pulsing.size === 0)) return;
    this.stopPlayback();
    this.syncActors();
  }

  private stopPlayback(): void {
    this.animating = false;
    this.tweens.killAll();
    for (const tile of this.pulsing) tile.setScale(1);
    this.pulsing.clear();
    for (const ghost of this.trail) ghost.setVisible(false);
    this.bumpDust?.setVisible(false);
    this.player?.setScale(1).setAlpha(1).clearTint();
    this.clearRowEffects();
    this.clearUnwriting();
    this.clearDust();
    this.clearJunk();
    this.clearTransfer();
    this.clearStamp();
    this.clearArchiveRows();
  }

  present(frame: FieldFrame): void {
    const sameFrame = this.previousState === frame.state && this.previousEvents === frame.events
      && this.frame.legend === frame.legend && this.frame.stage === frame.stage;
    if (sameFrame) {
      // Presentation options can change without interrupting the active clock.
      if (this.frame.showSource !== frame.showSource) this.setSourceVisible(frame.showSource);
      this.syncHazards(frame);
      this.frame = frame;
      this.syncLandingMarkers();
      this.syncGuidance();
      this.syncTerrainLight();
      return;
    }
    const discontinuity = this.previousState?.stage !== frame.state.stage || this.frame.stage !== frame.stage
      || this.reducedMotion || frame.events.some(event => event.type === 'checkpoint-restored' || event.type === 'player-died');
    const unfinished = frame.state.pending !== null && !frame.events.some(event =>
      event.type === 'command' || event.type === 'bump' || event.type === 'player-moved');
    const visualEvent = frame.events.some(event => ['player-moved', 'bump', 'rows-changed',
      'entity-moved', 'entity-spawned', 'entity-removed', 'player-hit'].includes(event.type));
    if (!discontinuity && this.animating && (unfinished || !visualEvent)) {
      const sourceChanged = this.frame.showSource !== frame.showSource;
      this.frame = frame;
      this.previousState = frame.state;
      this.previousEvents = frame.events;
      if (frame.events.some(event => event.type === 'rows-changed')) { this.syncCells(); this.syncTerrain(); }
      if (sourceChanged) this.setSourceVisible(frame.showSource);
      this.syncHazards(frame);
      this.syncLandingMarkers();
      this.syncGuidance();
      return;
    }
    // Carry ground only: the old jump arc/bob must not become the next path's baseline.
    const previousCursor = this.previousState?.engine.cursor;
    const carried = !discontinuity && this.animating && this.groundPosition && previousCursor
      ? carryPosition(this.groundPosition, previousCursor) : undefined;
    if (discontinuity) this.finish();
    else if (this.animating || this.pulsing.size > 0) this.stopPlayback();
    const scroll = frame.events.some(event => event.type === 'command'
      && ['<C-d>', '<C-u>'].includes(event.command.id));
    if (this.previousState?.stage !== frame.state.stage) this.scrollOffset = 0;
    else if (scroll) this.scrollOffset = center(this.previousState.engine.cursor.line) - this.cameraY;
    // Jumps and restores (:e!, death) recentre; walking keeps the row the last scroll left.
    else if (!frame.events.some(event => event.type === 'command')
      || frame.events.some(event => event.type === 'command' && ['%', 'G', 'gg', '{', '}', '/', '?', 'n', 'N', '*', '#', '`', "'"].includes(event.command.id))) this.scrollOffset = 0;
    if (this.previousState?.stage !== frame.state.stage || frame.events.some(event => event.type === 'player-moved')
      || this.previousState?.engine.cursor.line !== frame.state.engine.cursor.line
      || this.previousState?.engine.cursor.col !== frame.state.engine.cursor.col) this.cursorElapsed = 0;
    this.frame = frame;
    if (!this.ready) return;
    for (const event of frame.events) {
      if (event.type === 'player-moved' || event.type === 'entity-moved') {
        const id = event.type === 'player-moved' ? 'player' : event.entity;
        if (event.to.col !== event.from.col) this.facing.set(id, event.to.col < event.from.col);
      }
    }
    this.cameras.main.setBackgroundColor(frame.darkness ? '#000000' : frame.stage.id === 'last-page' ? '#f6efd4' : frame.stage.id === 'lighthouse' ? '#eee5cf' : BACKGROUND);
    this.stamp = this.reducedMotion ? null : counterStamp(this.previousState, frame.state, frame.events);
    this.captureTransfer(frame);
    this.captureJunk(frame);
    this.captureDust(frame);
    this.captureUnwriting(frame);
    this.captureArchiveRows(frame);
    this.syncCells();
    this.syncTerrain();
    this.syncWarehouseDecorations();
    this.syncHazards(frame);
    this.setSourceVisible(frame.showSource);
    this.positionLabel();
    this.syncActors(carried);
    const previous = this.previousState;
    this.previousState = frame.state;
    this.previousEvents = frame.events;
    if (discontinuity || previous?.stage !== frame.state.stage) return;
    const positions = new Map(previous.entities.map(entity => [entity.id, entity.at]));
    for (const event of frame.events) {
      if (event.type === 'entity-moved') positions.set(event.entity, event.to);
      if (event.type === 'entity-removed' && !this.entities.has(event.entity)) {
        const old = previous.entities.find(entity => entity.id === event.entity);
        const at = positions.get(event.entity);
        if (old && at) this.addEntity(old.id, old.def.sprite, at);
      }
    }
    this.play(animationSteps(frame.events, this.reducedMotion, frame.state.pending !== null), carried);
    if (!this.reducedMotion && frame.darkness) for (const crystal of stageLights(frame.stage)) {
      if (!frame.state.flags[crystal.flag] || previous.flags[crystal.flag]) continue;
      const tile = this.cells.get(`${crystal.at.line}:${crystal.at.col}`)?.tile;
      if (tile) {
        this.pulsing.add(tile);
        this.tweens.add({ targets: tile, scaleX: 1.2, scaleY: 1.2, duration: 75, yoyo: true,
          onComplete: () => { tile.setScale(1); this.pulsing.delete(tile); } });
      }
    }
  }

  /** Pixel shapes follow the drawn sprite, including interrupted movement and jump arcs. */
  private guidanceTexture(shape: string): string {
    const world = this.frame.stage.world;
    let textures = this.guidanceTextures.get(world);
    if (!textures) {
      textures = new Map<string, string>();
      this.guidanceTextures.set(world, textures);
    }
    const cached = textures.get(shape);
    if (cached) return cached;
    const color = WORLD_ACCENTS[world];
    const key = `guidance:${shape}:${color}`;
    if (!this.textures.exists(key)) {
      const graphics = this.make.graphics({ x: 0, y: 0 });
      graphics.fillStyle(color);
      if (shape === 'stand' || shape === 'stand-ready') {
        for (let pixel = 1; pixel < TILE_SIZE - 1; pixel++) {
          if (shape === 'stand' && pixel % 4 >= 2) continue;
          graphics.fillRect(pixel, 1, 1, 1); graphics.fillRect(pixel, TILE_SIZE - 2, 1, 1);
          graphics.fillRect(1, pixel, 1, 1); graphics.fillRect(TILE_SIZE - 2, pixel, 1, 1);
        }
      } else if (shape === 'range') graphics.fillRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
      else if (shape === 'insert') graphics.fillRect(0, 0, 2, TILE_SIZE);
      else if (shape === 'operator-pending') graphics.fillRect(1, TILE_SIZE - 2, TILE_SIZE - 2, 1);
      else if (shape === 'arrow') {
        // A filled down-pointing triangle with a dark outline, so it reads on grass, roofs and paper.
        graphics.fillStyle(ARROW_OUTLINE);
        for (let row = 0; row < 7; row++) graphics.fillRect(1 + row, 4 + row, TILE_SIZE - 2 - row * 2, 1);
        graphics.fillStyle(color);
        for (let row = 0; row < 5; row++) graphics.fillRect(3 + row, 5 + row, TILE_SIZE - 6 - row * 2, 1);
      } else {
        graphics.fillRect(1, 1, TILE_SIZE - 2, 1);
        graphics.fillRect(1, TILE_SIZE - 2, TILE_SIZE - 2, 1);
        graphics.fillRect(1, 1, 1, TILE_SIZE - 2);
        graphics.fillRect(TILE_SIZE - 2, 1, 1, TILE_SIZE - 2);
      }
      graphics.generateTexture(key, TILE_SIZE, TILE_SIZE);
      graphics.destroy();
    }
    textures.set(shape, key);
    return key;
  }

  private syncGuidance(): void {
    if (!this.ready || !this.player) return;
    const { stage, state } = this.frame;
    const mode = state.engine.mode;
    const texture = this.guidanceTexture(mode);
    if (!this.cursorMark) this.cursorMark = this.add.image(0, 0, texture).setDepth(1.9);
    else if (this.cursorTexture !== texture) this.cursorMark.setTexture(texture);
    this.cursorTexture = texture;
    this.cursorMark.setPosition(this.player.x, this.player.y)
      .setVisible(state.status === 'playing' && stage.type !== 'text' && !this.frame.hideCursor
        && (this.reducedMotion || this.cursorElapsed < CURSOR_ON_MS));
    this.syncInstructionMarks();
    const target = this.frame.objectiveTarget;
    const visible = target && stage.type !== 'text' && !this.frame.hideObjective
      && !this.frame.darkness && !darknessFor(stage, state.flags);
    if (!visible) { this.objectiveArrow?.setVisible(false); return; }
    this.objectiveArrow ??= this.add.image(0, 0, this.guidanceTexture('arrow')).setDepth(4);
    const zoom = fieldZoom(this.scale.height, stage.windowHeight);
    const halfWidth = this.scale.width / zoom / 2;
    const halfHeight = this.scale.height / zoom / 2;
    const inset = TILE_SIZE / 2;
    const targetX = center(target.col);
    const targetY = center(target.line);
    const offscreen = Math.abs(targetX - this.cameraX) > halfWidth - inset
      || Math.abs(targetY - this.cameraY) > halfHeight - inset;
    const x = Math.max(this.cameraX - halfWidth + inset, Math.min(this.cameraX + halfWidth - inset, targetX));
    const bob = this.reducedMotion ? 0 : Math.sin(this.guidanceElapsed * Math.PI * 2 / GUIDANCE_PERIOD_MS) * OBJECTIVE_BOB_PX;
    const y = Math.max(this.cameraY - halfHeight + inset,
      Math.min(this.cameraY + halfHeight - inset, targetY - TILE_SIZE + bob));
    this.objectiveArrow.setVisible(true).setPosition(x, y)
      .setAngle(offscreen ? Math.atan2(targetY - y, targetX - x) * 180 / Math.PI - 90 : 0);
  }

  private syncInstructionMarks(): void {
    const { stage, state } = this.frame;
    const visible = stage.type !== 'text' && state.status === 'playing' && !this.frame.hideObjective
      && !this.frame.darkness && !darknessFor(stage, state.flags);
    const cells = visible ? this.frame.standAt ?? NO_CELLS : NO_CELLS;
    while (this.standMarks.length > cells.length) this.standMarks.pop()?.destroy();
    cells.forEach((at, index) => {
      const ready = at.line === state.engine.cursor.line && at.col === state.engine.cursor.col;
      const mark = this.standMarks[index] ?? this.add.image(0, 0, this.guidanceTexture('stand')).setDepth(0.8);
      this.standMarks[index] = mark;
      mark.setTexture(this.guidanceTexture(ready ? 'stand-ready' : 'stand'))
        .setPosition(center(at.col), center(at.line))
        .setAlpha(ready || this.reducedMotion ? 1 : 0.65 + 0.35 * Math.cos(this.guidanceElapsed * Math.PI * 2 / GUIDANCE_PERIOD_MS));
    });
    const preview = visible ? rangePreview(state.engine) : null;
    const range = preview?.cells ?? NO_CELLS;
    while (this.rangeMarks.length > range.length) this.rangeMarks.pop()?.destroy();
    range.forEach((at, index) => {
      const mark = this.rangeMarks[index] ?? this.add.image(0, 0, this.guidanceTexture('range')).setDepth(0.9);
      this.rangeMarks[index] = mark;
      mark.setPosition(center(at.col), center(at.line)).setAlpha(0.4).clearTint();
      if (preview?.invalid) mark.setTintFill(0xe06464);
    });
  }

  private syncWarehouseDecorations(): void {
    // Rebuilt only when the stage changes: present() runs every frame.
    if (this.decoratedStage === this.frame.stage.id) return;
    this.decoratedStage = this.frame.stage.id;
    this.decorations?.removeAll(true);
    if (this.frame.stage.id === 'archive') {
      this.decorations?.add(this.add.image(center(1), center(0), this.texture('index')));
      this.decorations?.add(this.add.image(center(2), center(0), this.texture('filed-stamp')));
      this.decorations?.add(this.add.text(center(2), center(0) - 6, 'FILED', {
        fontFamily: 'monospace', fontSize: '4px', color: '#752f39', backgroundColor: '#e1d1a6',
      }).setOrigin(0.5, 1));
      return;
    }
    if (this.frame.stage.id === 'customs') {
      this.decorations?.add(this.add.image(center(18), center(4), this.texture('counter-end')));
      return;
    }
    if (this.frame.stage.id !== 'warehouse') return;
    // The remote counter is visible before the shelf extends the field to Ream.
    this.decorations?.add(this.add.image(center(13), center(4), this.texture('counter-end')));
    for (const line of [1, 5]) this.decorations?.add(this.add.text(center(1), center(line) - 7, 'TALLY', {
      fontFamily: 'monospace', fontSize: '5px', color: '#18292b', backgroundColor: '#d39b69',
    }).setOrigin(0.5, 1));
  }

  private clearArchiveRows(): void {
    if (!this.archiveFold && this.foldedRows.length === 0) return;
    for (const cell of this.foldedRows) cell.image.destroy();
    this.foldedRows = [];
    this.archiveFold = null;
    for (const cell of this.cells.values()) {
      cell.tile.setScale(1);
      cell.glyph.setScale(1);
    }
  }

  private captureArchiveRows(frame: FieldFrame): void {
    this.archiveFold = this.reducedMotion ? null : archiveRows(this.previousState, frame.state, frame.events);
    const fold = this.archiveFold;
    if (fold?.type !== 'delete') return;
    for (const [key, cell] of this.cells) {
      if (cell.line < fold.fromLine || cell.line >= fold.fromLine + fold.count) continue;
      const col = Number(key.split(':')[1]);
      const image = this.add.image(center(col), center(cell.line), this.texture(cell.sprite, cell.variant)).setDepth(1);
      this.foldedRows.push({ image });
    }
  }

  private clearStamp(): void {
    if (!this.stamp) return;
    for (const cell of this.cells.values()) {
      if (cell.line === this.stamp.line) { cell.tile.setAlpha(1); cell.glyph.setAlpha(1); }
    }
    if (this.frame.stage.id === 'notary') this.entities.get(this.stamp.entity)?.setAngle(0);
    this.stamp = null;
  }

  private clearTransfer(): void {
    // Only undo what a transfer did, so other stages' alpha effects are left alone.
    const active = this.transfer !== null || this.cargo.length > 0;
    for (const cell of this.cargo) cell.image.destroy();
    this.cargo = [];
    this.transfer = null;
    if (active) for (const cell of this.cells.values()) { cell.tile.setAlpha(1); cell.glyph.setAlpha(1); }
  }

  private captureTransfer(frame: FieldFrame): void {
    this.clearTransfer();
    if (this.reducedMotion) return;
    this.transfer = warehouseTransfer(this.previousState, frame.state, frame.events);
    if (this.transfer?.type !== 'yank') return;
    for (const cell of this.transfer.cells) {
      const sprite = frame.legend.tiles.find(tile => tile.char === cell.char)?.sprite;
      if (!sprite) continue;
      this.cargo.push({ at: cell.at, image: this.add.image(center(cell.at.col), center(cell.at.line),
        this.texture(sprite === 'rope' ? 'cargo-rope' : sprite)).setDepth(5) });
    }
  }

  private clearJunk(): void {
    for (const cell of this.junk) { cell.image.destroy(); cell.splash.destroy(); }
    this.junk = [];
    this.deletion = null;
  }

  private captureJunk(frame: FieldFrame): void {
    this.clearJunk();
    if (this.reducedMotion || this.previousState?.stage !== frame.state.stage) return;
    this.deletion = jettyDeletion(frame.state, frame.events);
    if (!this.deletion) return;
    for (const [offset, char] of [...this.deletion.junk].entries()) {
      const at = { line: this.deletion.line, col: this.deletion.col + offset };
      this.junk.push({ at,
        image: this.add.image(center(at.col), center(at.line), this.texture(frame.stage.id === 'notary' ? frame.legend.tiles.find(tile => tile.char === char)?.sprite ?? 'unknown' : frame.stage.id === 'reading' ? char === 'c' ? 'chain' : char === '(' ? 'shackle-open-left' : 'shackle-open-right' : frame.stage.id === 'stacks' ? char === 'd' ? 'library-dust' : 'shelf-gap' : char === 'c' ? 'crates' : 'nets')).setDepth(3),
        splash: this.add.image(center(at.col), center(at.line) + 5, this.texture(frame.stage.id === 'notary' ? /^w+$/.test(this.deletion.junk) ? 'wax-melt' : 'lock-shards' : frame.stage.id === 'reading' ? 'chain-clatter' : frame.stage.id === 'stacks' ? 'dust-puff' : 'splash')).setDepth(3).setAlpha(0),
      });
    }
  }

  private clearDust(): void {
    for (const image of this.dust) image.destroy();
    this.dust = [];
  }

  private captureDust(frame: FieldFrame): void {
    this.clearDust();
    if (this.deletion || this.reducedMotion || frame.state.pending !== null
      || this.previousState?.stage !== frame.state.stage) return;
    // A rejected put can land beyond the unchanged ragged row. Mark that
    // attempted cell too, rather than losing its wall feedback off the field.
    if (['warehouse', 'customs', 'counter'].includes(frame.stage.id)) {
      for (const event of frame.events) {
        if (event.type !== 'bump' || this.cells.has(`${event.at.line}:${event.at.col}`)) continue;
        this.dust.push(this.add.image(center(event.at.col), center(event.at.line), this.texture(frame.stage.id === 'counter' ? 'counter-wall' : frame.stage.id === 'customs' ? 'customs-wall' : 'warehouse-wall'))
          .setDepth(3).setTintFill(0xd39b69));
      }
    }
    const blink = animationSteps(frame.events).find(step => step.type === 'blink');
    if (blink?.type === 'blink') {
      for (const at of [blink.from, blink.to]) this.dust.push(
        this.add.image(center(at.col), center(at.line), this.texture('gate-glint')).setDepth(3));
    }
    if (!frame.events.some(event => event.type === 'rows-changed' && event.by === 'player')) return;
    // Exact engine edits identify even replacements/deletions inside equal tile runs.
    if (frame.events.some(event => event.type === 'command' && event.command.kind === 'undo')) return;
    const snapshot = frame.state.engine.undoStack.at(-1);
    if (!snapshot) return;
    let text = snapshot.lines.join('\n');
    for (const edit of snapshot.edits) {
      for (let offset = 0; offset < edit.removed; offset += 1) {
        if (text[edit.start + offset] === '\n') continue;
        const prefix = text.slice(0, edit.start + offset).split('\n');
        const line = prefix.length - 1;
        const col = prefix.at(-1)?.length ?? 0;
        this.dust.push(this.add.image(center(col), center(line), this.texture('dust')).setDepth(3));
      }
      text = text.slice(0, edit.start) + edit.inserted + text.slice(edit.start + edit.removed);
    }
  }

  private clearUnwriting(): void {
    for (const cell of this.unwriting) cell.image.destroy();
    this.unwriting = [];
  }

  private captureUnwriting(frame: FieldFrame): void {
    this.clearUnwriting();
    if (this.previousState?.stage !== frame.state.stage) return;
    for (const row of unwritingPlan(frame.events, this.reducedMotion)) {
      if (row.durationMs === 0) continue;
      const columns = this.previousState.engine.lines[row.line]?.length ?? 0;
      for (let col = 0; col < columns; col += 1) {
        const cell = this.cells.get(`${row.line}:${col}`);
        if (!cell) continue;
        const image = this.add.image(center(col), center(row.line), this.texture(cell.sprite, cell.variant)).setDepth(1);
        this.unwriting.push({ image, col, columns });
      }
    }
  }

  private positionLabel(): void {
    const zoom = fieldZoom(this.scale.height, this.frame.stage.windowHeight);
    this.label?.setScale(1 / zoom).setPosition(
      (this.scale.width - this.scale.width / zoom) / 2 + 8 / zoom,
      (this.scale.height - this.scale.height / zoom) / 2 + 8 / zoom,
    );
  }

  private resizeView(): void {
    this.positionLabel();
    this.positionCamera();
    this.positionDanger();
  }

  /**
   * Centre on the player's ground cell. During playback that cell is fractional, on the same
   * clock as the sprite, so the map scrolls with the player instead of jumping ahead of it.
   */
  private positionCamera(cell: { readonly line: number; readonly col: number } = this.frame.state.engine.cursor): void {
    if (!this.player) return;
    const zoom = fieldZoom(this.scale.height, this.frame.stage.windowHeight);
    this.cameras.main.setZoom(zoom);
    // A castle keeps its keeper in view when the player and the keeper fit on one screen.
    const keeper = this.frame.stage.type === 'castle'
      ? this.frame.state.entities.find(entity => entity.def.kind === 'keeper')?.at : undefined;
    const target = cameraTarget(bufferSize(this.frame.state.engine.lines), this.scale, cell, zoom, this.scrollOffset, keeper);
    this.cameraY = target.y;
    this.cameraX = target.x;
    this.cameras.main.centerOn(target.x, target.y);
    this.syncGuidance();
  }

  private setSourceVisible(visible: boolean): void {
    this.source?.setVisible(visible || this.frame.stage.id === 'last-page');
    this.label?.setText(visible ? BUFFER_NAME : '').setVisible(visible);
  }

  private glyphTexture(char: string, door = false): string {
    const paper = this.frame.stage.id === 'last-page';
    const key = `glyph:${paper ? (door ? 'door:' : 'ink:') : ''}${char.charCodeAt(0)}`;
    if (!this.textures.exists(key)) {
      const texture = this.textures.createCanvas(key, TILE_SIZE, TILE_SIZE);
      if (!texture) throw new Error('Could not create source glyph texture');
      const context = texture.context;
      context.font = door ? 'bold 14px monospace' : '12px monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.strokeStyle = '#182523';
      context.lineWidth = 2;
      if (!paper) context.strokeText(char === '\t' ? '→' : char, TILE_SIZE / 2, TILE_SIZE / 2);
      context.fillStyle = paper ? '#292c2a' : '#ffffff';
      context.fillText(char === '\t' ? '→' : char, TILE_SIZE / 2, TILE_SIZE / 2);
      texture.refresh();
    }
    return key;
  }

  private syncCells(): void {
    const live = new Set<string>();
    tileGrid(this.frame.state.engine.lines, this.frame.legend).forEach((row, line) => row.forEach((sprite, col) => {
      const key = `${line}:${col}`;
      const char = this.frame.state.engine.lines[line]?.charAt(col) ?? '';
      const page = this.frame.stage.id === 'last-page';
      const door = page && this.frame.state.flags['last.whole'] === true
        && this.frame.stage.triggers.some(trigger => trigger.on === 'enter'
          && trigger.area.from.line === line && trigger.area.from.col === col);
      if (door) sprite = 'page-door';
      const glyphChar = page && line === 0 && !this.frame.showSource ? ' ' : char || ' ';
      if (sprite === 'crystal-dark' && stageLights(this.frame.stage).some(crystal => crystal.at.line === line && crystal.at.col === col && this.frame.state.flags[crystal.flag])) sprite = 'crystal-lit';
      if (sprite.startsWith('rune-lever-') && stageLights(this.frame.stage).some(lever => lever.at.line === line && lever.at.col === col && this.frame.state.flags[lever.flag])) sprite += '-lit';
      if (sprite === 'lamp' && this.frame.state.flags['lighthouse.lit']) sprite = 'lamp-lit';
      if (sprite === 'house-wall' && char === 'H' && this.frame.state.engine.lines[line - 1]?.charAt(col) !== 'H') sprite = 'house-roof';
      const variant = sprite === 'blank' ? blankEdges(this.frame.state.engine.lines, line, col)
        : (sprite === 'port-water' || sprite === 'water' || sprite === 'river' || sprite === 'chasm' || sprite === 'fake') ? (this.reducedMotion ? 0 : this.idleFrame)
        : sprite === 'book' ? ((line * 73856093 ^ col * 19349663) >>> 0) % 3
        : (sprite === 'cave-floor' || sprite === 'boards' || sprite === 'grass' || sprite === 'dirt' || sprite === 'branch' || sprite === 'moss' || sprite === 'warehouse-floor' || sprite === 'customs-floor' || sprite === 'counter-floor' || sprite === 'vault-floor') ? ((line * 73856093 ^ col * 19349663) >>> 0) % 2 : 0;
      live.add(key);
      const cell = this.cells.get(key);
      if (cell) {
        if (cell.sprite !== sprite || cell.variant !== variant) cell.tile.setTexture(this.texture(sprite, variant));
        // Only swap the glyph when its character or door state changed: this runs per cell per render.
        const glyphKey = `${glyphChar}:${door ? 1 : 0}`;
        if (cell.glyphKey !== glyphKey) { cell.glyph.setTexture(this.glyphTexture(glyphChar, door)); cell.glyphKey = glyphKey; }
        cell.glyph.setVisible(char !== '');
        cell.variant = variant;
        cell.sprite = sprite;
        cell.char = char;
      } else {
        const tile = this.add.image(center(col), center(line), this.texture(sprite, variant));
        const glyph = this.add.image(center(col), center(line), this.glyphTexture(glyphChar, door));
        this.tiles?.add(tile);
        glyph.setVisible(char !== '');
        this.source?.add(glyph);
        this.cells.set(key, { char, sprite, tile, glyph, line, variant, glyphKey: `${glyphChar}:${door ? 1 : 0}` });
      }
    }));
    for (const [key, cell] of this.cells) {
      if (live.has(key)) continue;
      cell.tile.destroy();
      cell.glyph.destroy();
      this.cells.delete(key);
    }
  }

  /** Cached pixel textures and reusable image slots; only buffer/legend/world changes rebuild edges. */
  private pixelTexture(key: string, pixels: () => readonly PixelRect[]): string {
    if (!this.textures.exists(key)) {
      const graphics = this.make.graphics({ x: 0, y: 0 });
      for (const pixel of pixels()) graphics.fillStyle(pixel.color, pixel.alpha).fillRect(pixel.x, pixel.y, pixel.width, pixel.height);
      graphics.generateTexture(key, TILE_SIZE, TILE_SIZE);
      graphics.destroy();
    }
    return key;
  }

  private syncTerrain(): void {
    const { state, legend, stage } = this.frame;
    if (this.terrainRows === state.engine.lines && this.terrainLegend === legend && this.terrainWorld === stage.world) {
      this.syncTerrainLight(); return;
    }

    this.terrainRows = state.engine.lines; this.terrainLegend = legend; this.terrainWorld = stage.world;
    let index = 0;
    let under = 0;
    const width = Math.max(legend.emptyRow === undefined ? 0 : 1, bufferSize(state.engine.lines).width);
    this.ambientWidth = width * TILE_SIZE;
    this.ambientHeight = state.engine.lines.length * TILE_SIZE;
    for (let line = 0; line < state.engine.lines.length; line++) for (let col = 0; col < width; col++) {
      const at = { line, col };
      const edges = edgesFor(state.engine.lines, at, legend);
      const variant = groundVariant(line, col);
      const decorated = decorationAt(tileAt(state.engine.lines, at, legend), line, col);
      const base = `terrain:${edges.group === 'object' ? tileAt(state.engine.lines, at, legend)?.sprite : ''}:${stage.world}:${edges.group}:${edges.mask}:${edges.shore}:${Number(edges.cast)}:${Number(edges.posts)}:${variant}:${Number(decorated)}`;
      const frames: readonly [string, string] = [
        this.pixelTexture(`${base}:0`, () => [...terrainArt(edges, stage.world, variant, decorated, 0), ...(edges.group === 'object' ? outlineArt(SPRITES[tileAt(state.engine.lines, at, legend)?.sprite ?? ''], WORLD_PALETTES[stage.world].ink) : [])]),
        this.pixelTexture(`${base}:1`, () => [...terrainArt(edges, stage.world, variant, decorated, 1), ...(edges.group === 'object' ? outlineArt(SPRITES[tileAt(state.engine.lines, at, legend)?.sprite ?? ''], WORLD_PALETTES[stage.world].ink) : [])]),
      ];
      let slot = this.terrainImages[index];
      const animated = edges.group === 'water';
      if (edges.group === 'object') this.placeUnder(under++, at, variant);
      if (!slot) {
        slot = { image: this.add.image(0, 0, frames[0]).setDepth(0.3), frames, animated, at };
        this.terrainImages.push(slot);
      }
      slot.frames = frames; slot.animated = animated; slot.at = at;
      slot.image.setPosition(center(col), center(line)).setTexture(frames[this.reducedMotion || this.idleFrame === 0 ? 0 : 1]).setVisible(true);
      index++;
    }
    for (; index < this.terrainImages.length; index++) this.terrainImages[index]?.image.setVisible(false);
    for (; under < this.underImages.length; under++) this.underImages[under]?.image.setVisible(false);
    const particleTexture = this.ambientTexture();
    for (const image of this.ambientImages) image.setTexture(particleTexture);
    this.updateAmbient(0);
    this.syncTerrainLight();
  }

  /** Ground shows through a sprite's transparent pixels instead of the camera background. */
  private placeUnder(index: number, at: Position, variant: number): void {
    const world = this.frame.stage.world;
    const texture = this.pixelTexture(`terrain:under:${world}:${variant}`, () => groundArt(world, variant));
    let slot = this.underImages[index];
    if (!slot) {
      slot = { image: this.add.image(0, 0, texture).setDepth(-1), at };
      this.underImages.push(slot);
    }
    slot.at = at;
    slot.image.setTexture(texture).setPosition(center(at.col), center(at.line)).setVisible(true);
  }

  private syncTerrainLight(): void {
    for (const slot of this.underImages) slot.image.setAlpha(darknessAlpha(slot.at, this.frame.state.engine.cursor, this.frame.darkness));
    for (const slot of this.terrainImages) slot.image.setAlpha(darknessAlpha(slot.at, this.frame.state.engine.cursor, this.frame.darkness));
  }

  private actorShadow(index: number, actor: Phaser.GameObjects.Image, groundX: number, groundY: number): void {
    let shadow = this.shadowImages[index];
    if (!shadow) {
      const texture = this.pixelTexture('terrain:actor-shadow', shadowArt);
      shadow = this.add.image(0, 0, texture).setDepth(1.1);
      this.shadowImages.push(shadow);
    }
    shadow.setPosition(groundX, groundY).setScale(shadowScale(groundY - actor.y))
      .setAlpha(actor.alpha).setVisible(actor.visible);
  }

  private syncActorOutline(index: number, actor: Phaser.GameObjects.Image, id: string): void {
    const texture = this.outlineKeys.get(id);
    if (!texture) return;
    let image = this.outlineImages[index];
    if (!image) { image = this.add.image(0, 0, texture).setDepth(1.8); this.outlineImages.push(image); }
    image.setTexture(texture).setPosition(actor.x, actor.y).setAlpha(actor.alpha).setVisible(actor.visible)
      .setFlipX(actor.flipX).setScale(actor.scaleX, actor.scaleY);
  }

  private prepareOutline(id: string, sprite: string): void {
    const world = this.frame.stage.world;
    const key = this.pixelTexture(`terrain:outline:${world}:${sprite}`, () => outlineArt(SPRITES[sprite], WORLD_PALETTES[world].ink));
    this.outlineKeys.set(id, key);
  }

  private syncActorShadows(): void {
    let index = 0;
    if (this.player) {
      const ground = this.groundPosition ?? this.frame.state.engine.cursor;
      this.syncActorOutline(index, this.player, 'player');
      this.actorShadow(index++, this.player, center(ground.col), center(ground.line));
    }
    for (const [id, actor] of this.entities) {
      this.syncActorOutline(index, actor, id);
      this.actorShadow(index++, actor, actor.x, actor.y);
    }
    for (let unused = index; unused < this.outlineImages.length; unused++) this.outlineImages[unused]?.setVisible(false);
    for (; index < this.shadowImages.length; index++) this.shadowImages[index]?.setVisible(false);
  }

  private ambientTexture(): string {
    const world = this.frame.stage.world;
    const key = `terrain:particle:${world}`;
    this.pixelTexture(key, () => {
      const color = WORLD_PALETTES[world].accent;
      if (world === 'lowlands') return [{ x: 1, y: 7, width: 12, height: 1, color, alpha: 0.08 }];
      if (world === 'copper-port') return [{ x: 5, y: 8, width: 3, height: 1, color: 0x10141d, alpha: 0.35 }, { x: 8, y: 9, width: 3, height: 1, color: 0x10141d, alpha: 0.35 }];
      if (world === 'library') return [{ x: 7, y: 6, width: 2, height: 3, color, alpha: 0.2 }, { x: 9, y: 8, width: 1, height: 1, color, alpha: 0.2 }];
      return [{ x: 7, y: 7, width: world === 'wordwood' ? 3 : 1, height: 1, color, alpha: 0.3 }];
    });
    return key;
  }

  private updateAmbient(delta: number): void {
    const count = particleCount(this.reducedMotion, Boolean(this.frame.darkness || DARK_STAGES[this.frame.stage.id]), this.frame.stage.world);
    if (count > 0) this.ambientElapsed += delta;
    for (let index = 0; index < PARTICLE_CAP; index++) {
      let image = this.ambientImages[index];
      if (!image && index < count) {
        const key = this.ambientTexture();
        image = this.add.image(0, 0, key).setDepth(2.2);
        this.ambientImages.push(image);
      }
      if (!image) continue;
      image.setVisible(index < count);
      if (index < count) image.setPosition(particleX(index, this.ambientElapsed, this.ambientWidth), particleY(index, this.ambientElapsed, this.ambientHeight));
    }
  }

  private syncHazards(frame: FieldFrame): void {
    this.hazards?.removeAll(true);
    for (const area of frame.hazards ?? []) {
      for (let line = Math.max(0, area.from.line); line <= Math.min(area.to.line, frame.state.engine.lines.length - 1); line += 1) {
        const row = frame.state.engine.lines[line] ?? '';
        for (let col = Math.max(0, area.from.col); col <= Math.min(area.to.col, row.length - 1); col += 1) {
          const tile = frame.legend.tiles.find(tile => tile.char === row[col]) ?? frame.legend.fallback;
          if (!tile.walkable) continue;
          // Darken, then sheen: the danger zone must read at a glance (Opus playthrough: 0.28 sheen alone was invisible).
          this.hazards?.add(this.add.rectangle(center(col), center(line), TILE_SIZE, TILE_SIZE, HAZARD_SHADE, 0.38));
          this.hazards?.add(this.add.image(center(col), center(line), this.texture('wet-sheen')).setAlpha(0.6));
          if (line === area.from.line) {
            this.hazards?.add(this.add.image(center(col), center(line), this.texture('wet-edge')));
          }
        }
      }
    }
  }

  private texture(sprite: string, frame = 0): string {
    const art = SPRITES[sprite];
    const pixels = art?.frames[frame % art.frames.length];
    const variant = pixels ? frame % (art?.frames.length ?? 1) : 0;
    const key = `field:${sprite}${variant === 0 ? '' : `:${variant}`}`;
    if (!this.textures.exists(key)) {
      const graphics = this.make.graphics({ x: 0, y: 0 });
      if (art && pixels) {
        pixels.forEach((row, y) => [...row].forEach((pixel, x) => {
          const color = art.palette[pixel];
          if (color && color !== 'transparent') graphics.fillStyle(Number.parseInt(color.slice(1), 16)).fillRect(x, y, 1, 1);
        }));
      } else {
        const color = spriteColor(sprite);
        graphics.fillStyle(edgeColor(color)).fillRect(0, 0, TILE_SIZE, TILE_SIZE);
        graphics.fillStyle(color).fillRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
      }
      graphics.generateTexture(key, TILE_SIZE, TILE_SIZE);
      graphics.destroy();
    }
    return key;
  }

  private entitySprite(sprite: string): string {
    if (this.frame.stage.id === 'stacks' && sprite === 'shelf-end') return 'shelf-post';
    return ['glades', 'gates'].includes(this.frame.stage.id) && sprite === 'lamp-lit' ? 'glade-lamp-lit' : sprite;
  }

  private addEntity(id: string, sprite: string, at: Position): void {
    if (sprite === 'minotaur' || (this.frame.stage.id === 'last-page' && (id === 'unwriter' || id === 'margin'))) return;
    const offset = this.pileOffsets.get(id) ?? 0;
    const image = this.add.image(center(at.col) - offset, center(at.line) - offset, this.texture(this.entitySprite(sprite), this.reducedMotion ? 0 : (this.actorFrames.get(id) ?? 0))).setFlipX(this.facing.get(id) ?? false);
    this.actors?.add(image);
    this.entities.set(id, image);
  }

  private syncGateMarks(): void {
    this.gateMarks?.removeAll(true);
    if (this.frame.stage.id !== 'gates') return;
    const engine = this.frame.state.engine;
    const char = engine.lines[engine.cursor.line]?.[engine.cursor.col];
    // Ask the engine for the partner; presentation never parses bracket nesting.
    const partner = char === '(' || char === ')'
      ? presentationEngine.step({ ...engine, pendingKeys: [] }, '%').state.cursor : undefined;
    for (const [key, cell] of this.cells) {
      if (cell.char !== '(' && cell.char !== ')') continue;
      const column = Number(key.split(':')[1]);
      const outer = cell.line === 0 || cell.line === engine.lines.length - 1 && column === 3;
      const pulse = partner?.line === cell.line && partner.col === column;
      if (outer || pulse) this.gateMarks?.add(this.add.image(center(column), center(cell.line), this.texture('gate-glint'))
        .setAlpha(pulse ? (this.reducedMotion ? 0.6 : this.idleFrame ? 0.85 : 0.35) : 0.2));
    }
  }

  private syncLandingMarkers(): void {
    const markers = this.frame.state.pending ? [] : (this.frame.markers ?? []).map(marker => ({
      key: marker.key, line: marker.at.line, col: marker.at.col,
      alpha: darknessAlpha(marker.at, this.frame.state.engine.cursor, this.frame.darkness),
    })).filter(marker => marker.alpha > 0);
    if (markers.length === this.shownMarkers.length && markers.every((marker, index) => {
      const previous = this.shownMarkers[index];
      return previous && marker.key === previous.key && marker.line === previous.line
        && marker.col === previous.col && marker.alpha === previous.alpha;
    })) return;
    this.shownMarkers = markers;
    this.landingLabels?.removeAll(true);
    for (const marker of markers) {
      const alpha = marker.alpha;
      this.landingLabels?.add(this.add.text(center(marker.col), center(marker.line) - 5, marker.key, {
        fontFamily: 'monospace', fontSize: '7px', color: '#ffe8b2', backgroundColor: BACKGROUND,
        padding: { x: 2, y: 1 },
      }).setOrigin(0.5, 1).setAlpha(0.7 * alpha));
    }
  }

  private syncActors(at: Position = this.frame.state.engine.cursor): void {
    this.syncGateMarks();
    this.syncLandingMarkers();
    this.markFlags?.removeAll(true);
    for (const at of Object.values(this.frame.state.engine.marks)) {
      this.markFlags?.add(this.add.image(center(at.col), center(at.line) - 6, this.texture('mark-flag'))
        .setAlpha(darknessAlpha(at, this.frame.state.engine.cursor, this.frame.darkness)));
    }
    if (!this.player) {
      this.player = this.add.image(0, 0, this.texture('player')).setDepth(1);
      this.actors?.add(this.player);
    }
    this.player.setTexture(this.texture('player', this.reducedMotion ? 0 : (this.actorFrames.get('player') ?? 0))).setFlipX(this.facing.get('player') ?? false);
    this.player.setPosition(center(at.col), center(at.line))
      .setAlpha(1).clearTint();
    for (const [id, image] of this.entities) {
      if (!this.frame.state.entities.some(entity => entity.id === id)) {
        image.destroy();
        this.entities.delete(id);
        this.actorFrames.delete(id);
      }
    }
    const piles = new Map<string, number>();
    // Keep removed actors' offsets until their burst has finished.
    for (const entity of this.frame.state.entities) {
      const cell = `${entity.at.line}:${entity.at.col}`;
      const index = piles.get(cell) ?? 0;
      this.pileOffsets.set(entity.id, index * PILE_OFFSET_PX);
      piles.set(cell, index + 1);
    }
    for (const id of this.pileOffsets.keys()) {
      if (!this.frame.state.entities.some(entity => entity.id === id)
        && !this.frame.events.some(event => event.type === 'entity-removed' && event.entity === id)) this.pileOffsets.delete(id);
    }
    for (const entity of this.frame.state.entities) {
      const image = this.entities.get(entity.id);
      if (!image) this.addEntity(entity.id, entity.def.sprite, entity.at);
      else {
        const offset = this.pileOffsets.get(entity.id) ?? 0;
        image.setPosition(center(entity.at.col) - offset, center(entity.at.line) - offset)
          .setScale(1).setAngle(0).setAlpha(1).clearTint()
          .setTexture(this.texture(this.entitySprite(entity.def.sprite), this.reducedMotion ? 0 : (this.actorFrames.get(entity.id) ?? 0)))
          .setFlipX(this.facing.get(entity.id) ?? false);
      }
    }
    this.prompts?.removeAll(true);
    for (const entity of this.frame.state.entities) {
      const at = this.frame.state.engine.cursor;
      const canTalk = this.frame.stage.triggers.some(trigger => trigger.on === 'interact'
        && trigger.target.type === 'entity' && trigger.target.entity === entity.id
        && (!trigger.once || !this.frame.state.firedTriggers.includes(trigger.id))
        && (trigger.onlyIf === undefined || this.frame.state.flags[trigger.onlyIf] === true)
        && (trigger.unless === undefined || this.frame.state.flags[trigger.unless] !== true));
      if (canTalk && Math.abs(at.line - entity.at.line) + Math.abs(at.col - entity.at.col) === 1) {
        this.prompts?.add(this.add.text(center(entity.at.col), center(entity.at.line) - 13, entity.def.sprite === 'quarry-gate' ? 'Enter: go south' : entity.def.sprite === 'lift' ? 'Enter: take lift' : 'Enter: talk', {
          fontFamily: 'monospace', fontSize: '7px', color: '#f6efd4', backgroundColor: '#20252b', padding: { x: 2, y: 1 },
        }).setOrigin(0.5, 1));
      }
    }
    this.prepareOutline('player', 'player');
    for (const entity of this.frame.state.entities) this.prepareOutline(entity.id, this.entitySprite(entity.def.sprite));
    this.groundPosition = at;
    this.positionCamera(at);
    this.positionDanger();
    this.syncDarkness();
    this.syncTerrainLight();
    this.syncActorShadows();
  }

  private syncDarkness(): void {
    if (!this.frame.darkness) return;
    for (const [key, cell] of this.cells) {
      const at = { line: cell.line, col: Number(key.split(':')[1]) };
      const alpha = darknessAlpha(at, this.frame.state.engine.cursor, this.frame.darkness);
      cell.tile.setAlpha(alpha);
      cell.glyph.setAlpha(alpha);
    }
    for (const entity of this.frame.state.entities) {
      const alpha = darknessAlpha(entity.at, this.frame.state.engine.cursor, this.frame.darkness);
      this.entities.get(entity.id)?.setAlpha(alpha * (entity.def.sprite === 'echo' ? 0.55 : 1));
    }
  }

  private positionDanger(): void {
    const page = this.frame.stage.id === 'last-page';
    const active = this.frame.state.entities.some(entity => entity.def.kind === 'unwriter')
      && (!page || this.frame.events.some(event => event.type === 'rows-changed' && event.by === 'entity' && event.lineDelta < 0));
    if (!active && !this.danger) return;
    this.danger ??= this.add.image(0, 0, this.texture('unwrite-edge')).setScrollFactor(0).setDepth(3);
    const zoom = fieldZoom(this.scale.height, this.frame.stage.windowHeight);
    this.danger.setTexture(this.texture(page ? 'page-smear' : 'unwrite-edge'));
    this.danger.setVisible(active).setDisplaySize(this.scale.width / zoom, 32 / zoom)
      .setPosition(this.scale.width / 2, (this.scale.height + this.scale.height / zoom) / 2 - 16 / zoom);
  }

  private clearRowEffects(): void {
    for (const [key, cell] of this.cells) {
      const col = Number(key.split(':')[1]);
      cell.tile.clearTint().setPosition(center(col), center(cell.line));
      cell.glyph.setPosition(center(col), center(cell.line));
    }
  }

  /** One shared clock avoids a frame of scheduling overhead for every hint. */
  private play(inputSteps: readonly AnimationStep[], carried?: Position): void {
    // Bumps and edits also inherit any unfinished glide to the authoritative cursor.
    const steps = [...inputSteps];
    if (carried && !steps.some(step => ['walk', 'jump', 'blink', 'scroll'].includes(step.type))) {
      const durationMs = Math.max(...steps.map(step => step.durationMs),
        steps.length ? 0 : walkDuration(cellsBetween(carried, this.frame.state.engine.cursor)));
      steps.unshift({ type: 'walk', from: carried, to: this.frame.state.engine.cursor,
        durationMs, start: 0, end: 1 });
    }
    const duration = Math.max(this.archiveFold ? PLAYBACK_BUDGET_MS : 0, this.transfer || this.stamp ? PLAYBACK_BUDGET_MS : 0, this.deletion ? PLAYBACK_BUDGET_MS : 0, this.dust.length > 0 ? DUST_DURATION_MS : 0, this.unwriting.length > 0 ? PLAYBACK_BUDGET_MS : 0, steps.reduce((longest, step) => Math.max(longest, step.end === step.start ? 0 : step.durationMs / (step.end - step.start)), 0));
    if (duration === 0) return;
    const jump = steps.find(step => step.type === 'jump');
    if (jump && this.trail.length === 0) {
      for (const _alpha of TRAIL_ALPHAS) {
        const ghost = this.add.image(0, 0, this.texture('player')).setVisible(false);
        this.actors?.addAt(ghost, 0);
        this.trail.push(ghost);
      }
    }
    if (steps.some(step => step.type === 'bump') && !this.bumpDust) {
      this.bumpDust = this.add.image(0, 0, this.texture('dust-puff')).setVisible(false).setDisplaySize(3, 3);
      this.actors?.add(this.bumpDust);
    }
    const clock = { value: 0 };
    const render = (): void => {
      this.clearRowEffects();
      if (clock.value * duration >= DUST_DURATION_MS) this.clearDust();
      for (const cell of this.unwriting) {
        cell.image.setAlpha(unwritingAlpha(cell.col, cell.columns, clock.value));
      }
      const slide = this.deletion ? Math.max(0, (clock.value - JETTY_SPLASH_FRACTION) / (1 - JETTY_SPLASH_FRACTION)) : clock.value;
      if (this.deletion) {
        const tip = Math.min(1, clock.value / JETTY_SPLASH_FRACTION);
        for (const cell of this.junk) {
          const dust = this.frame.stage.id === 'stacks';
          cell.image.setPosition(center(cell.at.col), center(cell.at.line) + tip * (dust ? -4 : 8)).setAlpha(1 - tip);
          // Wax is what melts; keys and ribbon shatter. Read the deleted text, not a map row.
          const wax = this.frame.stage.id === 'notary' && /^w+$/.test(this.deletion.junk);
          cell.image.setAngle(dust || wax ? 0 : tip * (this.frame.stage.id === 'notary' && cell.at.col % 2 === 0 ? -35 : 35));
          if (wax) cell.image.setScale(1 + tip * 0.3, 1 - tip * 0.8);
          if (dust) cell.splash.setScale(1 + tip * 0.5);
          cell.splash.setAlpha(Math.sin(tip * Math.PI));
        }
        for (const [key, cell] of this.cells) {
          const col = Number(key.split(':')[1]);
          if (cell.line !== this.deletion.line || col < this.deletion.col) continue;
          const x = center(col + this.deletion.junk.length * (1 - slide));
          cell.tile.setPosition(x, center(cell.line));
          cell.glyph.setPosition(x, center(cell.line));
        }
      }
      if (this.transfer?.type === 'yank') {
        const target = this.frame.registerTarget;
        const destination = target ? this.cameras.main.getWorldPoint(target.x, target.y) : undefined;
        for (const cell of this.cargo) {
          const progress = Math.max(0, (clock.value - 0.35) / 0.65);
          cell.image.setTintFill(0xffe8b2).setAlpha(1 - progress);
          if (destination) cell.image.setPosition(
            center(cell.at.col) + (destination.x - center(cell.at.col)) * progress,
            center(cell.at.line) + (destination.y - center(cell.at.line)) * progress);
        }
      } else if (this.transfer?.type === 'put') {
        const { line, col: start, length } = this.transfer;
        for (const [key, cell] of this.cells) {
          const col = Number(key.split(':')[1]);
          if (cell.line !== line || col < start) continue;
          if (col < start + length) {
            const alpha = Math.min(1, Math.max(0, clock.value * length - (col - start)));
            cell.tile.setAlpha(alpha);
            cell.glyph.setAlpha(alpha);
          }
          else {
            const x = center(col - length * (1 - clock.value));
            cell.tile.setPosition(x, center(line));
            cell.glyph.setPosition(x, center(line));
          }
        }
      }
      if (this.stamp) {
        const { line, col: start, length, entity } = this.stamp;
        const progress = 1 - Math.pow(1 - clock.value, 3);
        for (const [key, cell] of this.cells) {
          const col = Number(key.split(':')[1]);
          if (cell.line !== line || col < start) continue;
          const x = center(col < start + length ? start - 1 : col - length) + progress * TILE_SIZE * (col < start + length ? col - start + 1 : length);
          cell.tile.setPosition(x, center(line));
          cell.glyph.setPosition(x, center(line));
          if (col < start + length) { cell.tile.setAlpha(progress); cell.glyph.setAlpha(progress); }
        }
        const actor = this.entities.get(entity);
        actor?.setPosition(center(start - 1), center(line) + Math.sin(clock.value * Math.PI) * 3);
        if (this.frame.stage.id === 'notary') actor?.setAngle(Math.sin(clock.value * Math.PI * 2) * 9);
      }
      if (this.archiveFold) {
        for (const cell of this.foldedRows) {
          const scale = 1 - Math.min(1, clock.value / 0.45);
          cell.image.setScale(1, scale).setAlpha(scale);
        }
        for (const cell of this.cells.values()) {
          const pose = archiveRowPose(this.archiveFold, cell.line, clock.value);
          cell.tile.setPosition(cell.tile.x, center(pose.line)).setScale(1, pose.scale);
          cell.glyph.setPosition(cell.glyph.x, center(pose.line)).setScale(1, pose.scale);
        }
      }
      let cameraCell: { line: number; col: number } | undefined;
      for (const step of steps) {
        if (clock.value < step.start) continue;
        const elapsed = clock.value * duration - step.start * (step.durationMs / (step.end - step.start));
        const fraction = Math.min(1, elapsed / step.durationMs);
        const landingJump = step.type === 'jump' && !this.transfer && !this.deletion && !this.stamp && !this.archiveFold;
        const flightDuration = landingJump ? step.durationMs - LANDING_DURATION_MS : step.durationMs;
        const motionFraction = landingJump ? Math.min(1, elapsed / flightDuration) : fraction;
        // Sub-frame hints snap on the shared clock rather than scheduling tiny tweens.
        const progress = this.deletion ? slide : step.durationMs < 1000 / 60 ? 1
          : step.type === 'walk' || step.type === 'jump' || step.type === 'scroll' || step.type === 'blink' || step.type === 'entity-move'
            ? motionProgress(step.type, motionFraction) : fraction;
        if (step.type === 'rows') {
          if (this.archiveFold) continue;
          if (step.lineDelta > 0 || step.lineDelta !== 0 && this.frame.events.some(event => event.type === 'rows-changed' && event.by === 'player')) {
            const rows = steps.filter(hint => hint.type === 'rows');
            for (const cell of this.cells.values()) {
              const source = rowAnimationStart(cell.line, rows);
              const y = center(source + (cell.line - source) * fraction);
              cell.tile.setPosition(cell.tile.x, y);
              cell.glyph.setPosition(cell.glyph.x, y);
            }
            continue;
          }
          if (this.unwriting.length > 0 && step.lineDelta < 0) continue;
          if (fraction < 1 && !this.frame.events.some(event => event.type === 'rows-changed' && event.by === 'player')) {
            for (const cell of this.cells.values()) {
              if (cell.line >= step.fromLine && cell.line <= step.toLine) cell.tile.setTintFill(0xffffff);
            }
          }
          continue;
        }
        const target = 'entity' in step ? this.entities.get(step.entity) : this.player;
        if (!target) continue;
        if (step.type === 'blink') {
          const at = progress < 0.5 ? carried ?? step.from : step.to;
          target.setPosition(center(at.col), center(at.line)).setAlpha(Math.abs(progress * 2 - 1));
          cameraCell = at;
          this.groundPosition = at;
          continue;
        }
        if (step.type === 'walk' || step.type === 'jump' || step.type === 'scroll') {
          // Follow the ground position, not the arc, so a jump does not bob the whole map.
          const groundFrom = carried ?? step.from;
          const lead = step.type === 'jump' ? 0.25 * Math.sin(Math.PI * progress) : 0;
          this.groundPosition = {
            line: groundFrom.line + (step.to.line - groundFrom.line) * progress,
            col: groundFrom.col + (step.to.col - groundFrom.col) * progress,
          };
          cameraCell = {
            line: groundFrom.line + (step.to.line - groundFrom.line) * Math.min(1, progress + lead),
            col: groundFrom.col + (step.to.col - groundFrom.col) * Math.min(1, progress + lead),
          };
        }
        if (step.type === 'walk' || step.type === 'jump' || step.type === 'scroll' || step.type === 'entity-move') {
          const drawnFrom = step.type === 'entity-move' ? step.from : carried ?? step.from;
          const arc = !this.transfer && !this.deletion && step.type === 'jump' ? Math.sin(Math.PI * progress) * jumpHeight(step.from, step.to) : 0;
          const bob = !this.transfer && !this.deletion && !this.stamp && !this.archiveFold && (step.type === 'walk' || step.type === 'entity-move') ? walkBob(cellsBetween(step.from, step.to) * progress) : 0;
          const offset = step.type === 'entity-move' ? this.pileOffsets.get(step.entity) ?? 0 : 0;
          target.setPosition(
            center(drawnFrom.col + (step.to.col - drawnFrom.col) * progress) - offset,
            center(drawnFrom.line + (step.to.line - drawnFrom.line) * progress) - arc - bob - offset,
          );
          this.syncActorShadows();
          if (landingJump) {
            const landing = Math.max(0, Math.min(1, (elapsed - flightDuration) / LANDING_DURATION_MS));
            const squash = elapsed >= flightDuration ? (1 - landing) ** 2 : 0;
            const scaleY = 1 - 0.2 * squash;
            target.setScale(1 + 0.15 * squash, scaleY);
            // Images are centre-origin: offset the centre to keep the feet planted.
            target.setPosition(target.x, target.y + TILE_SIZE / 2 * (1 - scaleY));
          }
          if (step.type === 'jump') this.trail.forEach((ghost, index) => {
            const trailProgress = Math.max(0, progress - (index + 1) * 0.12);
            ghost.setVisible(progress > 0 && fraction < 1)
              .setTexture(this.texture('player', (this.actorFrames.get('player') ?? 0)))
              .setFlipX(this.facing.get('player') ?? false)
              .setTint(this.player?.tintTopLeft ?? 0xffffff)
              .setAlpha((TRAIL_ALPHAS[index] ?? 0) * (1 - fraction))
              .setPosition(center(drawnFrom.col + (step.to.col - drawnFrom.col) * trailProgress),
                center(drawnFrom.line + (step.to.line - drawnFrom.line) * trailProgress)
                  - Math.sin(Math.PI * trailProgress) * jumpHeight(step.from, step.to));
          });
        } else if (step.type === 'entity-remove') target.setAlpha(1 - progress).setScale(1 + progress * 0.4);
        else if (step.type === 'entity-spawn') target.setAlpha(progress);
        else if (step.type === 'hit') {
          if (progress < 1) target.setTintFill(0xffffff);
          else target.clearTint();
        } else if (step.type === 'bump') {
          const cell = this.cells.get(`${step.at.line}:${step.at.col}`);
          if (progress < 1 && ['jetty', 'warehouse', 'customs', 'counter'].includes(this.frame.stage.id)) cell?.tile.setTintFill(0xd39b69);
          const cursor = this.frame.state.engine.cursor;
          const direction = bumpDirection(cursor, step.at);
          const lean = bumpLean(progress);
          const ground = this.groundPosition ?? cursor;
          target.setPosition(center(ground.col) + direction.col * lean, center(ground.line) + direction.line * lean);
          cameraCell = ground;
          this.bumpDust?.setVisible(progress > 0 && progress < 1)
            .setAlpha(Math.sin(Math.PI * progress))
            .setPosition(center(step.at.col) - direction.col * TILE_SIZE / 2,
              center(step.at.line) - direction.line * TILE_SIZE / 2);
        }
      }
      this.positionCamera(cameraCell);
    };
    this.animating = true;
    // Draw the first frame now, so nothing shows at its destination before the tween's first update.
    clock.value = 0;
    render();
    this.tweens.add({
      targets: clock, value: 1, duration,
      ease: 'Linear', onUpdate: render,
      onComplete: () => {
        this.clearRowEffects(); this.clearUnwriting(); this.clearDust(); this.clearJunk();
        this.clearTransfer(); this.clearStamp(); this.clearArchiveRows(); this.syncActors();
        for (const ghost of this.trail) ghost.setVisible(false);
        this.bumpDust?.setVisible(false);
        this.player?.setScale(1);
        this.animating = false;
      },
    });
  }
}
