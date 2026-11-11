import Phaser from 'phaser';
import type { Position } from '@escape/engine';
import type { Legend, Stage, WorldEvent, WorldState } from '@escape/world';
import { animationSteps, type AnimationStep } from './animate.js';
import { BACKGROUND, BUFFER_NAME, edgeColor, spriteColor, TILE_SCALE, TILE_SIZE } from './palette.js';
import { tileGrid } from './tiles.js';

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
  private queue: AnimationStep[] = [];
  private previousState: WorldState | undefined;
  private previousEvents: readonly WorldEvent[] | undefined;

  constructor(frame: FieldFrame, reducedMotion: boolean) {
    super({ key: 'field' });
    this.frame = frame;
    this.reducedMotion = reducedMotion;
  }

  create(): void {
    this.tiles = this.add.container(0, 0);
    this.actors = this.add.container(0, 0).setDepth(1);
    this.source = this.add.container(0, 0).setDepth(2);
    this.label = this.add.text(8, 8, '', {
      fontFamily: 'monospace', fontSize: '14px', color: '#ffe8b2', backgroundColor: BACKGROUND,
    }).setScrollFactor(0).setDepth(3);
    this.cameras.main.setZoom(TILE_SCALE).setRoundPixels(true);
    this.ready = true;
    this.present(this.frame);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.queue = [];
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
    this.queue = [];
    this.tweens.killAll();
    this.syncActors();
    this.tiles?.setAlpha(1);
  }

  present(frame: FieldFrame): void {
    this.finish();
    this.frame = frame;
    if (!this.ready) return;
    this.tiles?.removeAll(true);
    this.source?.removeAll(true);
    const grid = tileGrid(frame.state.engine.lines, frame.legend);
    grid.forEach((row, line) => row.forEach((sprite, col) => {
      this.tiles?.add(this.add.image(center(col), center(line), this.texture(sprite)));
      if (frame.showSource) {
        this.source?.add(this.add.text(center(col), center(line), frame.state.engine.lines[line]?.charAt(col) ?? '', {
          fontFamily: 'monospace', fontSize: '12px', color: '#ffffff', backgroundColor: '#182523',
        }).setOrigin(0.5));
      }
    }));
    this.label?.setText(frame.showSource ? BUFFER_NAME : '').setVisible(frame.showSource);
    // Fixed-scroll text still receives camera zoom: compensate so it stays in the viewport corner.
    this.label?.setScale(1 / TILE_SCALE).setPosition(
      (this.scale.width - this.scale.width / TILE_SCALE) / 2 + 8 / TILE_SCALE,
      (this.scale.height - this.scale.height / TILE_SCALE) / 2 + 8 / TILE_SCALE,
    );
    this.syncActors();
    const previous = this.previousState;
    const sameFrame = previous === frame.state && this.previousEvents === frame.events;
    this.previousState = frame.state;
    this.previousEvents = frame.events;
    if (sameFrame || previous?.stage !== frame.state.stage) return;
    // Removed entities are retained as temporary ghosts solely for their removal animation.
    for (const event of frame.events) {
      if (event.type === 'entity-removed' && !this.entities.has(event.entity)) {
        const old = previous.entities.find(entity => entity.id === event.entity);
        if (old) this.addEntity(old.id, old.def.sprite, old.at);
      }
    }
    this.queue = animationSteps(frame.events, this.reducedMotion);
    this.playNext();
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
      this.cameras.main.startFollow(this.player, true, 1, 1);
    }
    this.player.setPosition(center(this.frame.state.engine.cursor.col), center(this.frame.state.engine.cursor.line))
      .setAlpha(1).clearTint();
    for (const image of this.entities.values()) image.destroy();
    this.entities.clear();
    for (const entity of this.frame.state.entities) this.addEntity(entity.id, entity.def.sprite, entity.at);
  }

  private playNext(): void {
    while (this.queue.length > 0) {
      const step = this.queue.shift();
      if (!step) break;
      const target = 'entity' in step ? this.entities.get(step.entity) : this.player;
      if (!target) continue;
      if (step.durationMs === 0) continue;
      if (step.type === 'walk' || step.type === 'jump' || step.type === 'entity-move') {
        target.setPosition(center(step.from.col), center(step.from.line));
        const progress = { value: 0 };
        this.tweens.add({
          targets: progress, value: 1, duration: step.durationMs,
          onUpdate: () => {
            const arc = step.type === 'jump' ? Math.sin(Math.PI * progress.value) * TILE_SIZE : 0;
            target.setPosition(
              center(step.from.col + (step.to.col - step.from.col) * progress.value),
              center(step.from.line + (step.to.line - step.from.line) * progress.value) - arc,
            );
          }, onComplete: () => this.playNext(),
        });
      } else {
        const startX = target.x;
        if (step.type === 'hit') target.setTintFill(0xffffff);
        if (step.type === 'entity-spawn') target.setAlpha(0);
        if (step.type === 'rows') this.tiles?.setAlpha(0.55);
        const progress = { value: 0 };
        this.tweens.add({
          targets: progress, value: 1, duration: step.durationMs,
          onUpdate: () => {
            if (step.type === 'bump') target.x = startX + Math.sin(progress.value * Math.PI * 4) * 2;
            if (step.type === 'entity-remove') target.setAlpha(1 - progress.value);
            if (step.type === 'entity-spawn') target.setAlpha(progress.value);
          },
          onComplete: () => {
            target.x = startX;
            target.clearTint();
            this.tiles?.setAlpha(1);
            this.playNext();
          },
        });
      }
      return;
    }
    this.syncActors();
  }
}
