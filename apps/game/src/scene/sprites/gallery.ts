import type { PixelSprite } from './sprite.js';

const LETTERS: Readonly<Record<string, readonly string[]>> = {
  "i": [
    "010",
    "000",
    "110",
    "010",
    "010",
    "010",
    "111"
  ],
  "n": [
    "000",
    "000",
    "110",
    "101",
    "101",
    "101",
    "101"
  ],
  "k": [
    "100",
    "100",
    "101",
    "110",
    "100",
    "110",
    "101"
  ],
  "w": [
    "00000",
    "00000",
    "10001",
    "10001",
    "10101",
    "10101",
    "01010"
  ],
  "e": [
    "000",
    "000",
    "010",
    "101",
    "111",
    "100",
    "011"
  ],
  "l": [
    "110",
    "010",
    "010",
    "010",
    "010",
    "010",
    "111"
  ],
  "m": [
    "00000",
    "00000",
    "11010",
    "10101",
    "10101",
    "10101",
    "10101"
  ],
  "a": [
    "000",
    "000",
    "110",
    "001",
    "011",
    "101",
    "111"
  ],
  "p": [
    "000",
    "000",
    "110",
    "101",
    "110",
    "100",
    "100"
  ],
  "s": [
    "000",
    "000",
    "011",
    "100",
    "010",
    "001",
    "110"
  ],
  "y": [
    "000",
    "000",
    "101",
    "101",
    "011",
    "001",
    "110"
  ]
};

/** Recessed violet strokes, with a lit lower edge, cut into the cave stone. */
export const ECHO_RUNES: Readonly<Record<string, PixelSprite>> = Object.fromEntries(
  Object.entries(LETTERS).map(([letter, strokes]) => {
    const left = Math.floor((16 - (strokes[0]?.length ?? 3)) / 2);
    const carved = (x: number, y: number): boolean => strokes[y - 4]?.[x - left] === '1';
    return [`echo-rune-${letter}`, {
      palette: { d: '#171522', s: '#292637', k: '#0b0a12', v: '#ac79e5' },
      frames: [Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) =>
        carved(x, y) ? 'k' : carved(x, y - 1) ? 'v' : y === 2 || x === 1 ? 's' : 'd').join(''))],
    }];
  }),
);
