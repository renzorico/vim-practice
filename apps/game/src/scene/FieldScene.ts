import { jettyDeletion, JETTY_SPLASH_FRACTION, type JettyDeletion } from './jettyDeletion.js';
import Phaser from 'phaser';
import { createEngine } from '@escape/engine';
import type { Position } from '@escape/engine';
import type { Area, Legend, Stage, WorldEvent, WorldState } from '@escape/world';
import { unwritingAlpha, unwritingPlan } from './unwrite.js';
import { SPRITES } from './sprites/index.js';
import { rowAnimationStart, animationSteps, PLAYBACK_BUDGET_MS, type AnimationStep } from './animate.js';
import { BACKGROUND, BUFFER_NAME, edgeColor, spriteColor, TILE_SCALE, TILE_SIZE } from './palette.js';
import { blankEdges, tileGrid } from './tiles.js';
import { bufferSize, cameraTarget, fieldZoom } from './camera.js';

export interface FieldFrame {
  readonly state: WorldState;
  readonly events: readonly WorldEvent[];
  readonly legend: Legend;
  readonly stage: Stage;
  readonly showSource: boolean;
  readonly hazards?: readonly Area[];
}

const presentationEngine = createEngine();
const center = (cell: number): number => cell * TILE_SIZE + TILE_SIZE / 2;
const PILE_OFFSET_PX = 3;

const HAZARD_SHADE = 0x1b2a3a;

const LONG_JUMP_ROWS = 6;
const LONG_JUMP_ARC_SCALE = 0.5;

export class FieldScene extends Phaser.Scene {
  private frame: FieldFrame;
  private ready = false;
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
    line: number; variant: number;
  }>();
  private unwriting: { image: Phaser.GameObjects.Image; col: number; columns: number }[] = [];
  private dust: Phaser.GameObjects.Image[] = [];
  private junk: { image: Phaser.GameObjects.Image; splash: Phaser.GameObjects.Image; at: Position }[] = [];
  private deletion: JettyDeletion | null = null;
  private danger: Phaser.GameObjects.Image | undefined;
  private gateMarks: Phaser.GameObjects.Container | undefined;
  private prompts: Phaser.GameObjects.Container | undefined;
  private facing = new Map<string, boolean>();
  private idleFrame = 0;
  private cameraY = 0;
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
    this.time.addEvent({ delay: 500, loop: true, callback: () => {
      if (this.reducedMotion) return;
      this.idleFrame = (this.idleFrame + 1) % 2;
      this.player?.setTexture(this.texture('player', this.idleFrame));
      for (const entity of this.frame.state.entities) {
        this.entities.get(entity.id)?.setTexture(this.texture(this.entitySprite(entity.def.sprite), this.idleFrame));
      }
      this.syncGateMarks();
      for (const cell of this.cells.values()) {
        if ((cell.sprite === 'port-water' || cell.sprite === 'water' || cell.sprite === 'river' || cell.sprite === 'chasm')) cell.tile.setTexture(this.texture(cell.sprite, this.idleFrame));
      }
    } });
    this.tiles = this.add.container(0, 0);
    this.actors = this.add.container(0, 0).setDepth(2);
    this.source = this.add.container(0, 0).setDepth(1);
    this.gateMarks = this.add.container(0, 0).setDepth(1);
    this.prompts = this.add.container(0, 0).setDepth(4);
    this.hazards = this.add.container(0, 0).setDepth(0.5);
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
      this.cells.clear();
      this.previousState = undefined;
      this.previousEvents = undefined;
      this.tweens.killAll();
      this.entities.clear();
    });
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
    if (value) {
      this.idleFrame = 0;
      this.finish();
      for (const cell of this.cells.values()) if ((cell.sprite === 'port-water' || cell.sprite === 'water' || cell.sprite === 'river' || cell.sprite === 'chasm')) cell.tile.setTexture(this.texture(cell.sprite));
    }
  }

  /** Called for every key, including unfinished commands: nothing can queue behind typing. */
  finish(): void {
    if (!this.ready || !this.animating) return;
    this.animating = false;
    this.tweens.killAll();
    this.syncActors();
    this.clearRowEffects();
    this.clearUnwriting();
    this.clearDust();
    this.clearJunk();
  }

  present(frame: FieldFrame): void {
    const sameFrame = this.previousState === frame.state && this.previousEvents === frame.events
      && this.frame.legend === frame.legend && this.frame.stage === frame.stage;
    if (sameFrame) {
      // Presentation options can change without interrupting the active clock.
      if (this.frame.showSource !== frame.showSource) this.setSourceVisible(frame.showSource);
      this.syncHazards(frame);
      this.frame = frame;
      return;
    }
    this.finish();
    const scroll = frame.events.some(event => event.type === 'command'
      && ['<C-d>', '<C-u>'].includes(event.command.id));
    if (this.previousState?.stage !== frame.state.stage) this.scrollOffset = 0;
    else if (scroll) this.scrollOffset = center(this.previousState.engine.cursor.line) - this.cameraY;
    // Jumps and restores (:e!, death) recentre; walking keeps the row the last scroll left.
    else if (!frame.events.some(event => event.type === 'command')
      || frame.events.some(event => event.type === 'command' && ['%', 'G', 'gg', '{', '}'].includes(event.command.id))) this.scrollOffset = 0;
    this.frame = frame;
    if (!this.ready) return;
    for (const event of frame.events) {
      if (event.type === 'player-moved' || event.type === 'entity-moved') {
        const id = event.type === 'player-moved' ? 'player' : event.entity;
        if (event.to.col !== event.from.col) this.facing.set(id, event.to.col < event.from.col);
      }
    }
    this.cameras.main.setBackgroundColor(frame.stage.id === 'lighthouse' ? '#eee5cf' : BACKGROUND);
    this.captureJunk(frame);
    this.captureDust(frame);
    this.captureUnwriting(frame);
    this.syncCells();
    this.syncHazards(frame);
    this.setSourceVisible(frame.showSource);
    this.positionLabel();
    this.syncActors();
    const previous = this.previousState;
    this.previousState = frame.state;
    this.previousEvents = frame.events;
    if (previous?.stage !== frame.state.stage) return;
    const positions = new Map(previous.entities.map(entity => [entity.id, entity.at]));
    for (const event of frame.events) {
      if (event.type === 'entity-moved') positions.set(event.entity, event.to);
      if (event.type === 'entity-removed' && !this.entities.has(event.entity)) {
        const old = previous.entities.find(entity => entity.id === event.entity);
        const at = positions.get(event.entity);
        if (old && at) this.addEntity(old.id, old.def.sprite, at);
      }
    }
    this.play(animationSteps(frame.events, this.reducedMotion, frame.state.pending !== null));
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
        image: this.add.image(center(at.col), center(at.line), this.texture(char === 'c' ? 'crates' : 'nets')).setDepth(3),
        splash: this.add.image(center(at.col), center(at.line) + 5, this.texture('splash')).setDepth(3).setAlpha(0),
      });
    }
  }

  private clearDust(): void {
    for (const image of this.dust) image.destroy();
    this.dust = [];
  }

  private captureDust(frame: FieldFrame): void {
    this.clearDust();
    if (this.deletion || this.reducedMotion || this.previousState?.stage !== frame.state.stage) return;
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
    const target = cameraTarget(bufferSize(this.frame.state.engine.lines), this.scale, cell, zoom, this.scrollOffset);
    this.cameraY = target.y;
    this.cameras.main.centerOn(target.x, target.y);
  }

  private setSourceVisible(visible: boolean): void {
    this.source?.setVisible(visible);
    this.label?.setText(visible ? BUFFER_NAME : '').setVisible(visible);
  }

  private glyphTexture(char: string): string {
    const key = `glyph:${char.charCodeAt(0)}`;
    if (!this.textures.exists(key)) {
      const texture = this.textures.createCanvas(key, TILE_SIZE, TILE_SIZE);
      if (!texture) throw new Error('Could not create source glyph texture');
      const context = texture.context;
      context.font = '12px monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.strokeStyle = '#182523';
      context.lineWidth = 2;
      context.strokeText(char === '\t' ? '→' : char, TILE_SIZE / 2, TILE_SIZE / 2);
      context.fillStyle = '#ffffff';
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
      if (sprite === 'lamp' && this.frame.state.flags['lighthouse.lit']) sprite = 'lamp-lit';
      if (sprite === 'house-wall' && char === 'H' && this.frame.state.engine.lines[line - 1]?.charAt(col) !== 'H') sprite = 'house-roof';
      const variant = sprite === 'blank' ? blankEdges(this.frame.state.engine.lines, line, col)
        : (sprite === 'port-water' || sprite === 'water' || sprite === 'river' || sprite === 'chasm') ? (this.reducedMotion ? 0 : this.idleFrame)
        : (sprite === 'boards' || sprite === 'grass' || sprite === 'dirt' || sprite === 'branch' || sprite === 'moss') ? ((line * 73856093 ^ col * 19349663) >>> 0) % 2 : 0;
      live.add(key);
      const cell = this.cells.get(key);
      if (cell) {
        if (cell.sprite !== sprite || cell.variant !== variant) cell.tile.setTexture(this.texture(sprite, variant));
        if (cell.char !== char) cell.glyph.setTexture(this.glyphTexture(char || ' '));
        cell.glyph.setVisible(char !== '');
        cell.variant = variant;
        cell.sprite = sprite;
        cell.char = char;
      } else {
        const tile = this.add.image(center(col), center(line), this.texture(sprite, variant));
        const glyph = this.add.image(center(col), center(line), this.glyphTexture(char || ' '));
        this.tiles?.add(tile);
        glyph.setVisible(char !== '');
        this.source?.add(glyph);
        this.cells.set(key, { char, sprite, tile, glyph, line, variant });
      }
    }));
    for (const [key, cell] of this.cells) {
      if (live.has(key)) continue;
      cell.tile.destroy();
      cell.glyph.destroy();
      this.cells.delete(key);
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
    return ['glades', 'gates'].includes(this.frame.stage.id) && sprite === 'lamp-lit' ? 'glade-lamp-lit' : sprite;
  }

  private addEntity(id: string, sprite: string, at: Position): void {
    const offset = this.pileOffsets.get(id) ?? 0;
    const image = this.add.image(center(at.col) - offset, center(at.line) - offset, this.texture(this.entitySprite(sprite), this.reducedMotion ? 0 : this.idleFrame)).setFlipX(this.facing.get(id) ?? false);
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

  private syncActors(): void {
    this.syncGateMarks();
    if (!this.player) {
      this.player = this.add.image(0, 0, this.texture('player')).setDepth(1);
      this.actors?.add(this.player);
    }
    this.player.setTexture(this.texture('player', this.reducedMotion ? 0 : this.idleFrame)).setFlipX(this.facing.get('player') ?? false);
    this.player.setPosition(center(this.frame.state.engine.cursor.col), center(this.frame.state.engine.cursor.line))
      .setAlpha(1).clearTint();
    for (const image of this.entities.values()) image.destroy();
    this.entities.clear();
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
    for (const entity of this.frame.state.entities) this.addEntity(entity.id, entity.def.sprite, entity.at);
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
    this.positionCamera();
    this.positionDanger();
  }

  private positionDanger(): void {
    const active = this.frame.state.entities.some(entity => entity.def.kind === 'unwriter');
    if (!active && !this.danger) return;
    this.danger ??= this.add.image(0, 0, this.texture('unwrite-edge')).setScrollFactor(0).setDepth(3);
    const zoom = fieldZoom(this.scale.height, this.frame.stage.windowHeight);
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
  private play(steps: readonly AnimationStep[]): void {
    const duration = Math.max(this.deletion ? PLAYBACK_BUDGET_MS : 0, this.dust.length > 0 ? 60 : 0, this.unwriting.length > 0 ? PLAYBACK_BUDGET_MS : 0, steps.reduce((longest, step) => Math.max(longest, step.end === step.start ? 0 : step.durationMs / (step.end - step.start)), 0));
    if (duration === 0) return;
    const clock = { value: 0 };
    const render = (): void => {
      this.clearRowEffects();
      if (clock.value * duration >= 60) this.clearDust();
      for (const cell of this.unwriting) {
        cell.image.setAlpha(unwritingAlpha(cell.col, cell.columns, clock.value));
      }
      const slide = this.deletion ? Math.max(0, (clock.value - JETTY_SPLASH_FRACTION) / (1 - JETTY_SPLASH_FRACTION)) : clock.value;
      if (this.deletion) {
        const tip = Math.min(1, clock.value / JETTY_SPLASH_FRACTION);
        for (const cell of this.junk) {
          cell.image.setPosition(center(cell.at.col), center(cell.at.line) + tip * 8).setAlpha(1 - tip);
          cell.image.setAngle(tip * 35);
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
      let cameraCell: { line: number; col: number } | undefined;
      for (const step of steps) {
        if (clock.value < step.start) continue;
        const fraction = Math.min(1, (clock.value - step.start) / (step.end - step.start));
        // Sub-frame hints snap on the shared clock rather than scheduling tiny tweens.
        const progress = this.deletion ? slide : step.durationMs < 1000 / 60 ? 1 : fraction;
        if (step.type === 'rows') {
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
          const at = progress < 0.5 ? step.from : step.to;
          target.setPosition(center(at.col), center(at.line)).setAlpha(Math.abs(progress * 2 - 1));
          cameraCell = at;
          continue;
        }
        if (step.type === 'walk' || step.type === 'jump' || step.type === 'scroll') {
          // Follow the ground position, not the arc, so a jump does not bob the whole map.
          cameraCell = {
            line: step.from.line + (step.to.line - step.from.line) * progress,
            col: step.from.col + (step.to.col - step.from.col) * progress,
          };
        }
        if (step.type === 'walk' || step.type === 'jump' || step.type === 'scroll' || step.type === 'entity-move') {
          const arc = !this.deletion && step.type === 'jump' ? Math.sin(Math.PI * progress) * TILE_SIZE * (Math.abs(step.to.line - step.from.line) > LONG_JUMP_ROWS ? LONG_JUMP_ARC_SCALE : 1) : 0;
          const offset = step.type === 'entity-move' ? this.pileOffsets.get(step.entity) ?? 0 : 0;
          target.setPosition(
            center(step.from.col + (step.to.col - step.from.col) * progress) - offset,
            center(step.from.line + (step.to.line - step.from.line) * progress) - arc - offset,
          );
        } else if (step.type === 'entity-remove') target.setAlpha(1 - progress).setScale(1 + progress * 0.4);
        else if (step.type === 'entity-spawn') target.setAlpha(progress);
        else if (step.type === 'hit') {
          if (progress < 1) target.setTintFill(0xffffff);
          else target.clearTint();
        } else if (step.type === 'bump') {
          const cell = this.cells.get(`${step.at.line}:${step.at.col}`);
          if (progress < 1 && this.frame.stage.id === 'jetty') cell?.tile.setTintFill(0xd39b69);
          target.x = center(this.frame.state.engine.cursor.col) + Math.sin(progress * Math.PI * 4) * 2;
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
      onUpdate: render,
      onComplete: () => { this.animating = false; this.clearRowEffects(); this.clearUnwriting(); this.clearDust(); this.clearJunk(); this.syncActors(); },
    });
  }
}
