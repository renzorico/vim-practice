import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { PORTRAITS } from './index.js';
import { portraitFor, portraitId } from './speakers.js';
import { SPRITES } from '../index.js';

const MAIN = ['elder', 'mira', 'dot', 'scribe', 'ash', 'wren', 'echo', 'lamplighter', 'mason',
  'shut', 'ope', 'tare', 'ream', 'bitt', 'index', 'quire', 'folio', 'notary', 'pilcrow'];
const REST = ['fern', 'clerk', 'semi', 'gull', 'kit', 'bram', 'pell', 'cleat'];

// Captured from the registry before P-7: changes must preserve scene-facing identities/counts.
const ORIGINAL_COUNTS: Readonly<Record<string, number>> = {
  "page-ink": 1,
  "page-paper": 1,
  "page-blank": 1,
  "page-void": 1,
  "page-corner": 1,
  "page-margin": 1,
  "page-door": 1,
  "page-smear": 1,
  "rune-lever-x": 1,
  "rune-lever-x-lit": 1,
  "rune-lever-y": 1,
  "rune-lever-y-lit": 1,
  "rune-lever-z": 1,
  "rune-lever-z-lit": 1,
  "rune-lever": 1,
  "minotaur-lair": 1,
  "hoofprint": 1,
  "minotaur": 1,
  "echo-rune-i": 1,
  "echo-rune-n": 1,
  "echo-rune-k": 1,
  "echo-rune-w": 1,
  "echo-rune-e": 1,
  "echo-rune-l": 1,
  "echo-rune-m": 1,
  "echo-rune-a": 1,
  "echo-rune-p": 1,
  "echo-rune-s": 1,
  "echo-rune-y": 1,
  "cave-floor": 2,
  "cave-rock": 1,
  "crystal-ledge": 1,
  "lamp-oil": 1,
  "mark-flag": 1,
  "crystal-dark": 1,
  "crystal-lit": 1,
  "echo": 1,
  "tag-label": 1,
  "seal-ribbon": 1,
  "vault-floor": 2,
  "vault-wall": 1,
  "notary-desk": 1,
  "clause-quote": 1,
  "clause-text": 1,
  "clause-gap": 1,
  "lock-left": 1,
  "lock-right": 1,
  "seal-left": 1,
  "seal-right": 1,
  "keys": 1,
  "tag-open": 1,
  "tag-close": 1,
  "tag-slash": 1,
  "wax": 1,
  "vault-door": 1,
  "lock-shards": 1,
  "wax-melt": 1,
  "notary": 1,
  "atlas-shelf": 1,
  "bible-shelf": 1,
  "misfiled-shelf": 1,
  "archive-aisle": 1,
  "archive-rail": 1,
  "archive-post": 1,
  "catalogue": 1,
  "filed-stamp": 1,
  "index": 1,
  "reading-floor": 2,
  "reading-wall": 1,
  "reading-post": 1,
  "reading-door": 1,
  "shackle-open-left": 1,
  "shackle-open-right": 1,
  "chain": 1,
  "chain-clatter": 1,
  "folio": 1,
  "gallery": 1,
  "library-wall": 1,
  "shelf-post": 1,
  "shelf-gap": 1,
  "book": 3,
  "library-dust": 1,
  "dust-puff": 1,
  "quire": 1,
  "counter-floor": 2,
  "counter-wall": 1,
  "clerk-desk": 1,
  "crate-row": 1,
  "fake": 2,
  "counterfeiter": 2,
  "customs-floor": 2,
  "customs-wall": 1,
  "customs-post": 1,
  "crate-end": 1,
  "crate-lip": 1,
  "crate": 1,
  "post": 1,
  "tare": 1,
  "warehouse-floor": 2,
  "warehouse-wall": 1,
  "shelf-end": 1,
  "shelf-lip": 1,
  "oil": 1,
  "cargo-rope": 1,
  "shelf-top": 1,
  "shelf-middle": 1,
  "shelf-bottom": 1,
  "counter-end": 1,
  "boards": 2,
  "port-water": 2,
  "pier-post": 1,
  "port-ladder": 1,
  "warehouse": 1,
  "crates": 1,
  "nets": 1,
  "cart": 1,
  "bitt": 1,
  "ream": 1,
  "splash": 1,
  "semi": 1,
  "cleat": 1,
  "gate-glint": 1,
  "heartwood": 1,
  "hollow": 1,
  "gate-open": 1,
  "gate-close": 1,
  "ope": 1,
  "shut": 1,
  "moss": 2,
  "fern-fronds": 1,
  "bramble": 1,
  "clearing": 1,
  "pilcrow": 1,
  "rope": 1,
  "stump": 1,
  "glade-lamp-lit": 1,
  "lamp-out": 1,
  "branch": 2,
  "knot": 1,
  "leaves": 1,
  "air": 1,
  "trunk": 1,
  "ladder": 1,
  "thorns": 1,
  "platform": 1,
  "fern": 1,
  "knothole": 1,
  "lift": 1,
  "wet-sheen": 1,
  "wet-edge": 1,
  "mason": 1,
  "mortar": 1,
  "scaffold": 1,
  "ledge": 1,
  "chasm": 2,
  "dot": 1,
  "dot-cage": 1,
  "dirt": 2,
  "gravel": 1,
  "bedrock": 1,
  "rubble": 1,
  "river": 2,
  "plank": 1,
  "tent": 1,
  "ash": 1,
  "kit": 1,
  "crack": 1,
  "quarry-gate": 1,
  "dust": 1,
  "unknown": 1,
  "unwrite-edge": 1,
  "unwriter": 1,
  "lamplighter": 1,
  "stone-floor": 1,
  "tower-wall": 1,
  "pillar": 1,
  "lamp": 1,
  "lamp-lit": 1,
  "wren": 1,
  "gull": 1,
  "note": 1,
  "stone": 1,
  "jetty": 1,
  "lighthouse-door": 1,
  "blank": 16,
  "player": 2,
  "elder": 1,
  "mira": 1,
  "pell": 1,
  "bram": 1,
  "blot": 2,
  "grass": 2,
  "road": 1,
  "house-wall": 1,
  "house-roof": 1,
  "water": 2,
  "well": 1,
  "gate": 1,
  "save-stone": 1,
  "tree": 1
};

describe('portraits', () => {
  it('has the requested cast and mood counts, without an Unwriter face', () => {
    expect(Object.keys(PORTRAITS).sort()).toEqual([...MAIN, ...REST].sort());
    expect(portraitFor('unwriter')).toBeUndefined();
    expect(portraitId(' THE Foreman Ash ')).toBe('ash');
    expect(portraitId('???')).toBe('dot');
  });
  for (const [id, art] of Object.entries(PORTRAITS)) it(`${id} has complete 32px art and distinct expressions`, () => {
    expect(art.frames).toHaveLength(MAIN.includes(id) ? 3 : 1);
    expect(new Set(art.frames.map(frame => frame.join(''))).size).toBe(art.frames.length);
    for (const frame of art.frames) {
      expect(frame).toHaveLength(32);
      for (const row of frame) {
        expect(row).toHaveLength(32);
        for (const key of row) expect(art.palette[key], `${id}:${key}`).toBeDefined();
      }
    }
  });
  it('covers every speaker in all content, including cutscene beats', () => {
    const folder = new URL('../../../../../../packages/story/content/', import.meta.url);
    function walk(value: unknown): void {
      if (Array.isArray(value)) { value.forEach(walk); return; }
      if (typeof value !== 'object' || value === null) return;
      if ('speaker' in value && typeof value.speaker === 'string' && !['system', 'sign', 'unwriter'].includes(value.speaker)) {
        const speaker = value.speaker === 'npc' && 'name' in value && typeof value.name === 'string' ? value.name : value.speaker;
        expect(portraitFor(speaker), speaker).toBeDefined();
      }
      Object.values(value).forEach(walk);
    }
    for (const file of readdirSync(folder).filter(file => file.endsWith('.json'))) {
      walk(JSON.parse(readFileSync(new URL(file, folder), 'utf8')));
    }
  });
});

it('preserves every field id and size, with directional player and breathing people', () => {
  const counts: Record<string, number> = { ...ORIGINAL_COUNTS, player: 10 };
  for (const id of [...MAIN, ...REST]) if (counts[id] === 1) counts[id] = 2;
  expect(Object.fromEntries(Object.entries(SPRITES).map(([id, art]) => [id, art.frames.length]))).toEqual(counts);
  for (const art of Object.values(SPRITES)) for (const frame of art.frames) {
    expect(frame).toHaveLength(16);
    frame.forEach(row => expect(row).toHaveLength(16));
  }
});

it('gives every speaking field actor a distinct first frame', () => {
  const actors = [...MAIN, ...REST, 'player'].filter(id => SPRITES[id]);
  expect(new Set(actors.map(id => SPRITES[id]?.frames[0]?.join(''))).size).toBe(actors.length);
  const [still, idle] = SPRITES.player!.frames;
  expect(idle).not.toEqual(still);
  expect(idle?.slice(12)).toEqual(still?.slice(12)); // scarf moves; feet stay planted
});
