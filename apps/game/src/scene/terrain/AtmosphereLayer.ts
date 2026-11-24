import Phaser from 'phaser';
import type { Position } from '@escape/engine';
import type { FieldFrame } from '../FieldScene.js';
import { fieldZoom } from '../camera.js';
import { darknessAlpha, falloffPattern, FALLOFF_LEVELS } from '../darkness.js';
import { tileAt } from './edges.js';
import { overhangArt } from '../sprites/tall.js';
import type { PixelRect } from './art.js';
import { GLOW_SPRITES, glowStrength, mapContains, mapExtent, meadowFades, overhangVisible, surroundingArt, surroundingFor } from './atmosphere.js';
import { WORLD_PALETTES } from '../palette.js';
import { positionHash } from './life.js';

interface Slot { readonly image: Phaser.GameObjects.Image; at: { line: number; col: number }; active: boolean; coveredAlpha?: number; frames?: readonly [string, string] | undefined }
/** Additive: much more than this bleaches the lamp or stone itself. */
export const GLOW_ALPHA = 0.45;

/** All images and generated art are retained; idle ticks only update glow opacity. */
export class AtmosphereLayer {
  private exterior: Slot[] = [];
  private edges: Slot[] = [];
  private glows: Slot[] = [];
  private darkness: Slot[] = [];
  private tops: Slot[] = [];
  private paper: Slot[] = [];
  private vignette?: Phaser.GameObjects.Image;
  private elapsed = 0;
  private glowAlpha = GLOW_ALPHA;
  private hiddenRows: ReadonlySet<number> = new Set<number>();
  private viewLeft = NaN;
  private viewRight = NaN;
  private viewTop = NaN;
  private viewBottom = NaN;
  private viewWidth = 0;
  private viewHeight = 0;
  private rows?: readonly string[];
  private stage?: FieldFrame['stage'];
  private entities?: FieldFrame['state']['entities'];
  private foamPhase = 0;
  private flags?: FieldFrame['state']['flags'];
  private source?: boolean;
  private sight?: FieldFrame['darkness'];
  private cursor?: Position;
  private extent: readonly string[] = [];
  private meadow: readonly number[] = [];
  private foamFrames = new Map<string, readonly [string, string]>();
  private readonly at = { line: 0, col: 0 };
  private readonly exteriorAt = { line: 0, col: 0 };
  private readonly above = { line: 0, col: 0 };
  private readonly pattern = { level: 0, horizontal: 1, vertical: 1 };

  constructor(private readonly scene: Phaser.Scene, private readonly actors: Phaser.GameObjects.Container) {}

  private texture(key: string, pixels: () => readonly PixelRect[], width = 16, height = 16): string {
    if (!this.scene.textures.exists(key)) {
      const graphics = this.scene.make.graphics({ x: 0, y: 0 });
      for (const pixel of pixels()) graphics.fillStyle(pixel.color, pixel.alpha).fillRect(pixel.x, pixel.y, pixel.width, pixel.height);
      graphics.generateTexture(key, width, height); graphics.destroy();
    }
    return key;
  }

  private place(pool: Slot[], index: number, at: Position, texture: string, depth: number): Phaser.GameObjects.Image {
    let slot = pool[index];
    if (!slot) { slot = { image: this.scene.add.image(0, 0, texture).setDepth(depth), at: { line: at.line, col: at.col }, active: true }; pool.push(slot); }
    slot.at.line = at.line; slot.at.col = at.col; slot.active = true;
    return slot.image.setDepth(depth).setTexture(texture).setPosition(at.col * 16 + 8, at.line * 16 + 8).setVisible(pool === this.exterior || pool === this.darkness || !this.hiddenRows.has(at.line));
  }
  private trim(pool: Slot[], count: number): void {
    for (let index = count; index < pool.length; index++) {
      const slot = pool[index];
      if (slot) { slot.active = false; slot.image.setVisible(false); }
    }
  }

  sync(frame: FieldFrame, x: number, y: number): void {
    const { scene } = this;
    const zoom = fieldZoom(scene.scale.height, frame.stage.windowHeight);
    const width = scene.scale.width / zoom; const height = scene.scale.height / zoom;
    const left = Math.floor((x - width / 2) / 16); const right = Math.ceil((x + width / 2) / 16);
    const top = Math.floor((y - height / 2) / 16); const bottom = Math.ceil((y + height / 2) / 16);
    const changed = this.rows !== frame.state.engine.lines || this.stage !== frame.stage;
    const darknessChanged = this.sight !== frame.darkness;
    if (this.stage !== frame.stage) this.meadow = frame.stage.world === 'lowlands' ? meadowFades(frame.stage.map) : [];
    if (changed) this.extent = mapExtent(frame.stage.map, frame.state.engine.lines, frame.legend.emptyRow !== undefined);
    if (changed || darknessChanged || this.viewLeft !== left || this.viewRight !== right || this.viewTop !== top || this.viewBottom !== bottom
      || this.viewWidth !== width || this.viewHeight !== height) {
      const kind = surroundingFor(frame.stage.world, frame.stage.id);
      let exterior = 0;
      if (!frame.darkness) for (let line = top; line < bottom; line++) for (let col = left; col < right; col++) {
        if (mapContains(this.extent, line, col)) continue;
        const at = this.exteriorAt; at.line = line; at.col = col;
        const index = exterior++;
        const variant = positionHash(at.line, at.col) % 4;
        const fade = kind === 'meadow' ? this.meadow[Math.max(0, Math.min(this.meadow.length - 1, at.col))] ?? 0 : 0;
        const texture = this.texture(`atmosphere:${frame.stage.world}:${kind}:${variant}:${fade}`, () => surroundingArt(kind, frame.stage.world, variant, 0, fade));
        this.place(this.exterior, index, at, texture, -3).setAlpha(1);
        const slot = this.exterior[index];
        if (slot) {
          let frames = this.foamFrames.get(texture);
          if (!frames && kind === 'sea' && variant === 0) {
            frames = [texture, this.texture(`${texture}:foam`, () => surroundingArt(kind, frame.stage.world, variant, 1))];
            this.foamFrames.set(texture, frames);
          }
          slot.frames = frames;
          if (slot.frames) slot.image.setTexture(slot.frames[this.foamPhase === 0 ? 0 : 1]);
        }
      }
      this.trim(this.exterior, exterior);
      this.viewLeft = left; this.viewRight = right; this.viewTop = top; this.viewBottom = bottom;
      this.viewWidth = width; this.viewHeight = height;
      this.syncVignette(frame, zoom);
    }
    const lightingChanged = changed || this.entities !== frame.state.entities || this.flags !== frame.state.flags || this.source !== frame.showSource
      || this.sight !== frame.darkness || Boolean(frame.darkness && (this.cursor?.line !== frame.state.engine.cursor.line || this.cursor?.col !== frame.state.engine.cursor.col));
    if (lightingChanged) this.syncMap(frame);
    this.entities = frame.state.entities;
    this.rows = frame.state.engine.lines; this.stage = frame.stage; this.flags = frame.state.flags;
    this.source = frame.showSource; this.sight = frame.darkness; this.cursor = frame.state.engine.cursor;
  }

  private syncVignette(frame: FieldFrame, zoom: number): void {
    const world = frame.stage.world;
    if (world === 'last-page') { this.vignette?.setVisible(false); return; }
    this.vignette?.setVisible(true);
    const key = this.texture(`vignette:${world}`, () => {
      const pixels: PixelRect[] = [];
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const radius = Math.hypot((x - 31.5) / 44, (y - 31.5) / 44);
        pixels.push({ x, y, width: 1, height: 1, color: 0x11151e,
          alpha: Math.max(0, radius - 0.35) ** 2 * 0.4 });
      }
      return pixels;
    }, 64, 64);
    this.vignette ??= this.scene.add.image(0, 0, key).setScrollFactor(0).setDepth(2.6);
    this.vignette.setTexture(key).setPosition(this.scene.scale.width / 2, this.scene.scale.height / 2)
      .setDisplaySize(this.scene.scale.width / zoom, this.scene.scale.height / zoom);
  }

  private placeTop(frame: FieldFrame, sprite: string, at: Position, index: number): void {
    const { line, col } = at;
    const texture = this.texture(`overhang:${sprite}`, () => overhangArt(sprite), 16, 8);
    this.above.line = line - 1; this.above.col = col;
    const alpha = Math.min(darknessAlpha(at, frame.state.engine.cursor, frame.darkness),
      darknessAlpha(this.above, frame.state.engine.cursor, frame.darkness));
    const newSlot = !this.tops[index];
    const image = this.place(this.tops, index, at, texture, line * 16 + 7)
      .setPosition(col * 16 + 8, line * 16 - 4).setAlpha(alpha)
      .setVisible(alpha > 0 && !this.hiddenRows.has(line) && !this.hiddenRows.has(line - 1));
    const slot = this.tops[index];
    if (slot) slot.coveredAlpha = alpha;
    if (newSlot) this.actors.add(image);
  }

  private syncMap(frame: FieldFrame): void {
    const rows = frame.state.engine.lines;
    let edges = 0; let tops = 0; let darkness = 0; let glows = 0; let paper = 0;
    const liveWidth = Math.max(frame.legend.emptyRow ? 1 : 0, ...rows.map(row => row.length));
    // Gather sources during the map's only pass; emit each bounded halo at its source.
    for (let line = 0; line < this.extent.length; line++) for (let col = 0; col < (this.extent[line]?.length ?? 0); col++) {
      const at = this.at; at.line = line; at.col = col;
      const tile = tileAt(rows, at, frame.legend);
      if (col === (line >= rows.length ? 0 : liveWidth)
        && col < (frame.stage.map[line]?.length ?? 0)) {
        const texture = this.texture(`atmosphere:paper:${frame.stage.world}`, () => [
          { x: 0, y: 0, width: 16, height: 16, color: WORLD_PALETTES[frame.stage.world].paper, alpha: 1 },
        ]);
        const columns = (frame.stage.map[line]?.length ?? 0) - col;
        this.place(this.paper, paper++, at, texture, -2)
          .setDisplaySize(columns * 16, 16).setPosition(col * 16 + columns * 8, line * 16 + 8);
      }
      let sprite = tile?.sprite ?? '';
      if (sprite === 'lamp' && frame.state.flags['lighthouse.lit']) sprite = 'lamp-lit';
      if (sprite === 'crystal-dark' && frame.darkness?.lights.some(light => light.line === line && light.col === col)) sprite = 'crystal-lit';
      if (GLOW_SPRITES.has(sprite) && (sprite !== 'lamp' || frame.stage.id !== 'lighthouse')) glows = this.placeGlow(frame, line, col, glows);
      let mask = 0;
      if (!frame.darkness) {
        if (!mapContains(this.extent, line - 1, col)) mask |= 1;
        if (!mapContains(this.extent, line, col + 1)) mask |= 2;
        if (!mapContains(this.extent, line + 1, col)) mask |= 4;
        if (!mapContains(this.extent, line, col - 1)) mask |= 8;
      }
      if (mask && frame.stage.world !== 'last-page') {
        const texture = this.texture(`atmosphere:outline:${mask}`, () => {
          const pixels: PixelRect[] = [];
          if (mask & 1) pixels.push({ x: 0, y: 0, width: 16, height: 2, color: 0x11151e, alpha: 1 });
          if (mask & 2) pixels.push({ x: 14, y: 0, width: 2, height: 16, color: 0x11151e, alpha: 1 });
          if (mask & 4) pixels.push({ x: 0, y: 14, width: 16, height: 2, color: 0x11151e, alpha: 1 });
          if (mask & 8) pixels.push({ x: 0, y: 0, width: 2, height: 16, color: 0x11151e, alpha: 1 });
          return pixels;
        });
        this.place(this.edges, edges++, at, texture, 0.6).setAlpha(1);
      }
      this.above.line = line - 1; this.above.col = col;
      if (overhangVisible(sprite, tileAt(rows, this.above, frame.legend)?.sprite, frame.showSource)) this.placeTop(frame, sprite, at, tops++);
      if (frame.darkness) {
        falloffPattern(line, col, frame.state.engine.cursor, frame.darkness, this.pattern);
        const { level, horizontal, vertical } = this.pattern;
        const texture = this.texture(`darkness:${level}:${horizontal}:${vertical}`, () => {
          const pixels: PixelRect[] = [];
          for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
            const alpha = level === 0 ? 0 : Math.max(0.01, Math.min(1, level / (FALLOFF_LEVELS - 1)
              - (horizontal * (x - 7.5) + vertical * (y - 7.5)) / 160));
            pixels.push({ x, y, width: 1, height: 1, color: 0, alpha: 1 - alpha });
          }
          return pixels;
        });
        this.place(this.darkness, darkness++, at, texture, 2.4);
      }
    }
    for (const entity of frame.state.entities) {
      const sprite = entity.def.sprite === 'lamp-lit' && (frame.stage.id === 'glades' || frame.stage.id === 'gates') ? 'glade-lamp-lit' : entity.def.sprite;
      if (GLOW_SPRITES.has(sprite)) glows = this.placeGlow(frame, entity.at.line, entity.at.col, glows);
      if (overhangVisible(sprite, undefined, frame.showSource)) this.placeTop(frame, sprite, entity.at, tops++);
    }
    this.trim(this.paper, paper); this.trim(this.edges, edges); this.trim(this.tops, tops); this.trim(this.glows, glows); this.trim(this.darkness, darkness);
    this.actors.sort('depth');
  }

  private placeGlow(frame: FieldFrame, line: number, col: number, index: number): number {
    // One source visits at most 49 cells, independent of map size.
    const at = this.above;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      at.line = line + dy; at.col = col + dx;
      if (Math.hypot(dx, dy) > 3 || !mapContains(frame.state.engine.lines, at.line, at.col, frame.legend.emptyRow !== undefined)
        || darknessAlpha(at, frame.state.engine.cursor, frame.darkness) === 0) continue;
      const texture = this.texture(`glow:${dx}:${dy}`, () => {
        const pixels: PixelRect[] = [];
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const radius = Math.hypot(dx + (x + 0.5) / 16 - 0.5, dy + (y + 0.5) / 16 - 0.5);
          pixels.push({ x, y, width: 1, height: 1, color: 0xffc578, alpha: Math.max(0, 1 - radius / 2.5) ** 2 * 0.22 });
        }
        return pixels;
      });
      this.place(this.glows, index++, at, texture, 1.2).setBlendMode(Phaser.BlendModes.ADD).setAlpha(this.glowAlpha);
    }
    return index;
  }

  setHiddenRows(rows: ReadonlySet<number>): void {
    this.hiddenRows = rows;
    this.hideRows(this.paper); this.hideRows(this.edges); this.hideRows(this.glows);
    for (const slot of this.tops) slot.image.setVisible(slot.active && (slot.coveredAlpha ?? 0) > 0
      && !rows.has(slot.at.line) && !rows.has(slot.at.line - 1));
  }

  private hideRows(pool: readonly Slot[]): void {
    for (const slot of pool) slot.image.setVisible(slot.active && !this.hiddenRows.has(slot.at.line));
  }

  update(delta: number, reducedMotion: boolean): void {
    this.elapsed += reducedMotion ? 0 : delta;
    const phase = reducedMotion ? 0 : Math.floor(this.elapsed / 1800) % 2;
    if (phase !== this.foamPhase) {
      this.foamPhase = phase;
      for (const slot of this.exterior) if (slot.frames && slot.image.visible) slot.image.setTexture(slot.frames[phase === 0 ? 0 : 1]);
    }
    const strength = glowStrength(this.elapsed, reducedMotion);
    this.glowAlpha = GLOW_ALPHA * strength;
    for (const slot of this.glows) if (slot.image.visible) slot.image.setAlpha(this.glowAlpha);
  }
}
