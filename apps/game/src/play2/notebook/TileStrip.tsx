import { useEffect, useRef, useState } from 'react';
import type { EngineState } from '@escape/engine';
import { stages } from '../content.js';
import { SPRITES } from '../../scene/sprites/index.js';
import { WORLD_PALETTES, TILE_SIZE } from '../../scene/palette.js';
import { groundArt, terrainArt, type PixelRect } from '../../scene/terrain/art.js';
import { edgesFor, terrainGroup } from '../../scene/terrain/edges.js';
import type { Lesson } from './lessons.js';

const MAX_ROWS = 3;
const SCALE = 3;
const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;

/** Whole pixels, ground right to both edges, and enough space to follow the cursor. */
export function stripLayout(width: number) {
  const columns = Math.ceil(width / (TILE_SIZE * SCALE));
  return { columns, width: columns * TILE_SIZE * SCALE, tileHeight: TILE_SIZE * SCALE };
}
export function TileStrip({ state, lesson, typed }: {
  readonly state: EngineState; readonly lesson: Lesson; readonly typed: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const measure = (): void => setWidth(node.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const { columns, width: drawnWidth, tileHeight } = stripLayout(width);
  const firstRow = Math.max(0, Math.min(state.cursor.line - 1, state.lines.length - MAX_ROWS));
  const rows = state.lines.slice(firstRow, firstRow + MAX_ROWS);
  const contentWidth = Math.max(1, ...rows.map(row => row.length));
  const leftPad = Math.max(0, Math.floor((columns - contentWidth) / 2));
  const firstCol = Math.max(0, state.cursor.col - columns + 2);
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    const palette = WORLD_PALETTES[lesson.world];
    const legend = stages.find(item => item.stage.id === lesson.stageId)?.legend;
    const ground = legend?.tiles.find(tile => tile.char === lesson.ground);
    ctx.imageSmoothingEnabled = false;
    const sprite = (name: string, x: number, y: number): void => {
      const art = SPRITES[name];
      art?.frames[0]?.forEach((row, py) => [...row].forEach((pixel, px) => {
        const color = art.palette[pixel];
        if (color && color !== 'transparent') { ctx.fillStyle = color; ctx.fillRect(x + px, y + py, 1, 1); }
      }));
    };
    const paint = (art: readonly PixelRect[], x: number, y: number): void => {
      for (const rect of art) {
        ctx.fillStyle = hex(rect.color); ctx.globalAlpha = rect.alpha;
        ctx.fillRect(x + rect.x, y + rect.y, rect.width, rect.height);
      }
      ctx.globalAlpha = 1;
    };
    rows.forEach((row, y) => {
      for (let x = 0; x < columns; x++) {
        const col = x - leftPad + firstCol;
        const char = row[col];
        const px = x * TILE_SIZE; const py = y * TILE_SIZE;
        paint(groundArt(lesson.world, 0), px, py);
        if (ground && terrainGroup(ground) !== 'ground') sprite(ground.sprite, px, py);
        if (lesson.terrain) {
          const tile = row.length === 0 && col === 0 ? legend?.emptyRow : legend?.tiles.find(tile => tile.char === char);
          if (tile && terrainGroup(tile) !== 'ground') sprite(tile.sprite, px, py);
          if (tile && legend) paint(terrainArt(edgesFor(state.lines, { line: y + firstRow, col }, legend), lesson.world, 0, false, 0), px, py);
        } else if (char !== undefined && char !== ' ') {
          ctx.fillStyle = hex(palette.ink); ctx.fillRect(px + 1, py + 2, 14, 13);
          ctx.fillStyle = hex(palette.paper); ctx.font = '11px monospace'; ctx.textAlign = 'center'; ctx.fillText(char, px + 8, py + 12);
        }
        if (typed < (lesson.blotsUntil ?? Infinity) && lesson.blots.some(at => at.line === y + firstRow && at.col === col)) sprite('blot', px, py);
        if (y + firstRow === state.cursor.line && col === state.cursor.col) sprite('player', px, py);
      }
    });
  }, [state, lesson, typed, firstRow, firstCol, columns, leftPad]);
  return <div ref={container} className="notebook__strip" style={{ height: rows.length * tileHeight }}>
    <canvas ref={canvas} width={columns * TILE_SIZE} height={rows.length * TILE_SIZE}
      style={{ left: Math.floor((width - drawnWidth) / 2), width: drawnWidth, height: rows.length * tileHeight }}
      className="notebook__tiles" role="img" aria-label={`Tiles: ${state.lines.join(' / ')}. Tilde at row ${state.cursor.line + 1}, column ${state.cursor.col + 1}.`} />
  </div>;
}
