import Phaser from 'phaser';
import type { Position } from '@escape/engine';
import type { Legend, Stage, WorldEvent, WorldState } from '@escape/world';
import { unwritingAlpha, unwritingPlan } from './unwrite.js';
import { SPRITES } from './sprites/index.js';
import { animationSteps, PLAYBACK_BUDGET_MS, type AnimationStep } from './animate.js';
import { BACKGROUND, BUFFER_NAME, edgeColor, spriteColor, TILE_SCALE, TILE_SIZE } from './palette.js';
import { blankEdges, tileGrid } from './tiles.js';
import { bufferSize, cameraTarget } from './camera.js';

export interface FieldFrame {
  readonly state: WorldState;
  readonly events: readonly WorldEvent[];
  readonly legend: Legend;
  readonly stage: Stage;
  readonly showSource: boolean;
}

const center = (cell: number): number => cell * TILE_SIZE + TILE_SIZE / 2;

export class FieldScene extends Phaser.Scene {
  private frame: FieldFrame;
  private ready = false;
  private animating = false;
  private reducedMotion: boolean;
  private tiles: Phaser.GameObjects.Container | undefined;
  private actors: Phaser.GameObjects.Container | undefined;
  private source: Phaser.GameObjects.Container | undefined;
  private label: Phaser.GameObjects.Text | undefined;
  private player: Phaser.GameObjects.Image | undefined;
  private entities = new Map<string, Phaser.GameObjects.Image>();
  private cells = new Map<string, {
    char: string; sprite: string; tile: Phaser.GameObjects.Image; glyph: Phaser.GameObjects.Image;
    line: number; variant: number;
  }>();
  private unwriting: { image: Phaser.GameObjects.Image; col: number; columns: number }[] = [];
  private dust: Phaser.GameObjects.Image[] = [];
  private danger: Phaser.GameObjects.Image | undefined;
  private prompts: Phaser.GameObjects.Container | undefined;
  private facing = new Map<string, boolean>();
  private idleFrame = 0;
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
        this.entities.get(entity.id)?.setTexture(this.texture(entity.def.sprite, this.idleFrame));
      }
      for (const cell of this.cells.values()) {
        if ((cell.sprite === 'water' || cell.sprite === 'river')) cell.tile.setTexture(this.texture(cell.sprite, this.idleFrame));
      }
    } });
    this.tiles = this.add.container(0, 0);
    this.actors = this.add.container(0, 0).setDepth(2);
    this.source = this.add.container(0, 0).setDepth(1);
    this.prompts = this.add.container(0, 0).setDepth(4);
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
      for (const cell of this.cells.values()) if ((cell.sprite === 'water' || cell.sprite === 'river')) cell.tile.setTexture(this.texture(cell.sprite));
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
  }

  present(frame: FieldFrame): void {
    const sameFrame = this.previousState === frame.state && this.previousEvents === frame.events
      && this.frame.legend === frame.legend && this.frame.stage === frame.stage;
    if (sameFrame) {
      // Presentation options can change without interrupting the active clock.
      if (this.frame.showSource !== frame.showSource) this.setSourceVisible(frame.showSource);
      this.frame = frame;
      return;
    }
    this.finish();
    this.frame = frame;
    if (!this.ready) return;
    for (const event of frame.events) {
      if (event.type === 'player-moved' || event.type === 'entity-moved') {
        const id = event.type === 'player-moved' ? 'player' : event.entity;
        if (event.to.col !== event.from.col) this.facing.set(id, event.to.col < event.from.col);
      }
    }
    this.cameras.main.setBackgroundColor(frame.stage.id === 'lighthouse' ? '#eee5cf' : BACKGROUND);
    this.captureDust(frame);
    this.captureUnwriting(frame);
    this.syncCells();
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

  private clearDust(): void {
    for (const image of this.dust) image.destroy();
    this.dust = [];
  }

  private captureDust(frame: FieldFrame): void {
    this.clearDust();
    if (this.reducedMotion || this.previousState?.stage !== frame.state.stage) return;
    if (!frame.events.some(event => event.type === 'rows-changed' && event.by === 'player')) return;
    // Exact engine edits identify even replacements/deletions inside equal tile runs.
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
    this.label?.setScale(1 / TILE_SCALE).setPosition(
      (this.scale.width - this.scale.width / TILE_SCALE) / 2 + 8 / TILE_SCALE,
      (this.scale.height - this.scale.height / TILE_SCALE) / 2 + 8 / TILE_SCALE,
    );
  }

  private resizeView(): void {
    this.positionLabel();
    this.positionCamera();
    this.positionDanger();
  }

  private positionCamera(): void {
    if (!this.player) return;
    const target = cameraTarget(bufferSize(this.frame.state.engine.lines), this.scale,
      this.frame.state.engine.cursor, TILE_SCALE);
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
        : (sprite === 'water' || sprite === 'river') ? (this.reducedMotion ? 0 : this.idleFrame)
        : (sprite === 'grass' || sprite === 'dirt') ? ((line * 73856093 ^ col * 19349663) >>> 0) % 2 : 0;
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

  private addEntity(id: string, sprite: string, at: Position): void {
    const image = this.add.image(center(at.col), center(at.line), this.texture(sprite, this.reducedMotion ? 0 : this.idleFrame)).setFlipX(this.facing.get(id) ?? false);
    this.actors?.add(image);
    this.entities.set(id, image);
  }

  private syncActors(): void {
    if (!this.player) {
      this.player = this.add.image(0, 0, this.texture('player')).setDepth(1);
      this.actors?.add(this.player);
    }
    this.player.setTexture(this.texture('player', this.reducedMotion ? 0 : this.idleFrame)).setFlipX(this.facing.get('player') ?? false);
    this.player.setPosition(center(this.frame.state.engine.cursor.col), center(this.frame.state.engine.cursor.line))
      .setAlpha(1).clearTint();
    for (const image of this.entities.values()) image.destroy();
    this.entities.clear();
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
        this.prompts?.add(this.add.text(center(entity.at.col), center(entity.at.line) - 13, entity.def.sprite === 'quarry-gate' ? 'Enter: go south' : 'Enter: talk', {
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
    this.danger.setVisible(active).setDisplaySize(this.scale.width / TILE_SCALE, 32 / TILE_SCALE)
      .setPosition(this.scale.width / 2, (this.scale.height + this.scale.height / TILE_SCALE) / 2 - 16 / TILE_SCALE);
  }

  private clearRowEffects(): void {
    for (const cell of this.cells.values()) cell.tile.clearTint();
  }

  /** One shared clock avoids a frame of scheduling overhead for every hint. */
  private play(steps: readonly AnimationStep[]): void {
    const duration = Math.max(this.dust.length > 0 ? 60 : 0, this.unwriting.length > 0 ? PLAYBACK_BUDGET_MS : 0, steps.reduce((longest, step) => Math.max(longest, step.end === step.start ? 0 : step.durationMs / (step.end - step.start)), 0));
    if (duration === 0) return;
    const clock = { value: 0 };
    const render = (): void => {
      this.clearRowEffects();
      if (clock.value * duration >= 60) this.clearDust();
      for (const cell of this.unwriting) {
        cell.image.setAlpha(unwritingAlpha(cell.col, cell.columns, clock.value));
      }
      for (const step of steps) {
        if (clock.value < step.start) continue;
        const fraction = Math.min(1, (clock.value - step.start) / (step.end - step.start));
        // Sub-frame hints snap on the shared clock rather than scheduling tiny tweens.
        const progress = step.durationMs < 1000 / 60 ? 1 : fraction;
        if (step.type === 'rows') {
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
        if (step.type === 'walk' || step.type === 'jump' || step.type === 'entity-move') {
          const arc = step.type === 'jump' ? Math.sin(Math.PI * progress) * TILE_SIZE : 0;
          target.setPosition(
            center(step.from.col + (step.to.col - step.from.col) * progress),
            center(step.from.line + (step.to.line - step.from.line) * progress) - arc,
          );
        } else if (step.type === 'entity-remove') target.setAlpha(1 - progress);
        else if (step.type === 'entity-spawn') target.setAlpha(progress);
        else if (step.type === 'hit') {
          if (progress < 1) target.setTintFill(0xffffff);
          else target.clearTint();
        } else if (step.type === 'bump') {
          target.x = center(this.frame.state.engine.cursor.col) + Math.sin(progress * Math.PI * 4) * 2;
        }
      }
      this.positionCamera();
    };
    this.animating = true;
    this.tweens.add({
      targets: clock, value: 1, duration,
      onUpdate: render,
      onComplete: () => { this.animating = false; this.clearRowEffects(); this.clearUnwriting(); this.clearDust(); this.syncActors(); },
    });
  }
}
