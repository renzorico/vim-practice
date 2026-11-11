import Phaser from 'phaser';
import type { Position } from '@escape/engine';
import type { Legend, Stage, WorldEvent, WorldState } from '@escape/world';
import { animationSteps, type AnimationStep } from './animate.js';
import { BACKGROUND, BUFFER_NAME, edgeColor, spriteColor, TILE_SCALE, TILE_SIZE } from './palette.js';
import { tileGrid } from './tiles.js';
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
  private reducedMotion: boolean;
  private tiles: Phaser.GameObjects.Container | undefined;
  private actors: Phaser.GameObjects.Container | undefined;
  private source: Phaser.GameObjects.Container | undefined;
  private label: Phaser.GameObjects.Text | undefined;
  private player: Phaser.GameObjects.Image | undefined;
  private entities = new Map<string, Phaser.GameObjects.Image>();
  private cells = new Map<string, {
    char: string; sprite: string; tile: Phaser.GameObjects.Image; glyph: Phaser.GameObjects.Image;
    line: number;
  }>();
  private previousState: WorldState | undefined;
  private previousEvents: readonly WorldEvent[] | undefined;

  constructor(frame: FieldFrame, reducedMotion: boolean) {
    super({ key: 'field' });
    this.frame = frame;
    this.reducedMotion = reducedMotion;
  }

  create(): void {
    this.tiles = this.add.container(0, 0);
    this.actors = this.add.container(0, 0).setDepth(2);
    this.source = this.add.container(0, 0).setDepth(1);
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
      this.cells.clear();
      this.previousState = undefined;
      this.previousEvents = undefined;
      this.tweens.killAll();
      this.entities.clear();
    });
  }

  setReducedMotion(value: boolean): void {
    this.reducedMotion = value;
    if (value) this.finish();
  }

  /** Called for every key, including unfinished commands: nothing can queue behind typing. */
  finish(): void {
    if (!this.ready) return;
    this.tweens.killAll();
    this.syncActors();
    this.clearRowEffects();
  }

  present(frame: FieldFrame): void {
    const sameFrame = this.previousState === frame.state && this.previousEvents === frame.events;
    if (sameFrame) {
      // Presentation options can change without interrupting the active clock.
      if (this.frame.showSource !== frame.showSource) this.setSourceVisible(frame.showSource);
      this.frame = frame;
      return;
    }
    this.finish();
    this.frame = frame;
    if (!this.ready) return;
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

  private positionLabel(): void {
    this.label?.setScale(1 / TILE_SCALE).setPosition(
      (this.scale.width - this.scale.width / TILE_SCALE) / 2 + 8 / TILE_SCALE,
      (this.scale.height - this.scale.height / TILE_SCALE) / 2 + 8 / TILE_SCALE,
    );
  }

  private resizeView(): void {
    this.positionLabel();
    this.positionCamera();
  }

  private positionCamera(): void {
    if (!this.player) return;
    const target = cameraTarget(bufferSize(this.frame.state.engine.lines), this.scale, {
      col: this.player.x / TILE_SIZE - 0.5,
      line: this.player.y / TILE_SIZE - 0.5,
    }, TILE_SCALE);
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
      context.strokeText(char, TILE_SIZE / 2, TILE_SIZE / 2);
      context.fillStyle = '#ffffff';
      context.fillText(char, TILE_SIZE / 2, TILE_SIZE / 2);
      texture.refresh();
    }
    return key;
  }

  private syncCells(): void {
    const live = new Set<string>();
    tileGrid(this.frame.state.engine.lines, this.frame.legend).forEach((row, line) => row.forEach((sprite, col) => {
      const key = `${line}:${col}`;
      const char = this.frame.state.engine.lines[line]?.charAt(col) ?? ' ';
      live.add(key);
      const cell = this.cells.get(key);
      if (cell) {
        if (cell.sprite !== sprite) cell.tile.setTexture(this.texture(sprite));
        if (cell.char !== char) cell.glyph.setTexture(this.glyphTexture(char));
        cell.sprite = sprite;
        cell.char = char;
      } else {
        const tile = this.add.image(center(col), center(line), this.texture(sprite));
        const glyph = this.add.image(center(col), center(line), this.glyphTexture(char));
        this.tiles?.add(tile);
        this.source?.add(glyph);
        this.cells.set(key, { char, sprite, tile, glyph, line });
      }
    }));
    for (const [key, cell] of this.cells) {
      if (live.has(key)) continue;
      cell.tile.destroy();
      cell.glyph.destroy();
      this.cells.delete(key);
    }
  }

  private texture(sprite: string): string {
    const key = `field:${sprite}`;
    if (!this.textures.exists(key)) {
      const graphics = this.make.graphics({ x: 0, y: 0 });
      const color = spriteColor(sprite);
      graphics.fillStyle(edgeColor(color)).fillRect(0, 0, TILE_SIZE, TILE_SIZE);
      graphics.fillStyle(color).fillRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
      graphics.generateTexture(key, TILE_SIZE, TILE_SIZE);
      graphics.destroy();
    }
    return key;
  }

  private addEntity(id: string, sprite: string, at: Position): void {
    const image = this.add.image(center(at.col), center(at.line), this.texture(sprite));
    this.actors?.add(image);
    this.entities.set(id, image);
  }

  private syncActors(): void {
    if (!this.player) {
      this.player = this.add.image(0, 0, this.texture('player')).setDepth(1);
      this.actors?.add(this.player);
    }
    this.player.setPosition(center(this.frame.state.engine.cursor.col), center(this.frame.state.engine.cursor.line))
      .setAlpha(1).clearTint();
    for (const image of this.entities.values()) image.destroy();
    this.entities.clear();
    for (const entity of this.frame.state.entities) this.addEntity(entity.id, entity.def.sprite, entity.at);
    this.positionCamera();
  }

  private clearRowEffects(): void {
    for (const cell of this.cells.values()) cell.tile.clearTint();
  }

  /** One shared clock avoids a frame of scheduling overhead for every hint. */
  private play(steps: readonly AnimationStep[]): void {
    const duration = steps.reduce((sum, step) => sum + step.durationMs, 0);
    if (duration === 0) { this.syncActors(); return; }
    const clock = { value: 0 };
    const render = (): void => {
      this.clearRowEffects();
      for (const step of steps) {
        if (clock.value < step.start) continue;
        const fraction = Math.min(1, (clock.value - step.start) / (step.end - step.start));
        // Sub-frame hints snap on the shared clock rather than scheduling tiny tweens.
        const progress = step.durationMs < 1000 / 60 ? 1 : fraction;
        if (step.type === 'rows') {
          if (fraction < 1) {
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
    this.tweens.add({
      targets: clock, value: 1, duration,
      onUpdate: render,
      onComplete: () => { this.clearRowEffects(); this.syncActors(); },
    });
  }
}
