# ESCAPE: visual design ("Ember")

Chosen by Renzo on 2026-11-10 from 3 mockups (Ember, Dusk, Moss): https://claude.ai/artifact/Mez6my1ekfde4HgTkmtWNB
Builders use these tokens as CSS variables in `apps/game/src/styles.css`; no other colours or fonts without an update here.

## Principles
1. **Warm and calm:** low-saturation warm dark, no glow, no scanlines. Easy on the eyes for long sessions.
2. **One focus per screen:** the buffer or map is the hero; panels support it.
3. **Meaning before decoration:** colour always carries meaning (you, goal, door, key, danger), the same meaning everywhere.

## Colour tokens

| Token | Hex | Use |
|---|---|---|
| `--bg` | `#1d2021` | Page background |
| `--surface` | `#282828` | Buffer, map and card panels |
| `--surface-raised` | `#3c3836` | Keycaps, buttons |
| `--line` | `#32302f` | Dividers |
| `--line-strong` | `#504945` | Panel borders, keycap shadow, dashed (locked) keys |
| `--text` | `#ebdbb2` | Body text, buffer text |
| `--text-soft` | `#d5c4a1` | Secondary text, quotes |
| `--text-muted` | `#a89984` | Labels, captions (meets 4.5:1 on `--bg`) |
| `--text-faint` | `#665c54` | Line numbers, walls (decorative only) |
| `--you` | `#fabd2f` | The cursor/player, the brand wordmark, the newly taught key |
| `--goal` | `#b8bb26` | Targets, keys collected, success |
| `--door` | `#fe8019` | Doors, power meter, warnings |
| `--friend` | `#83a598` | ECHO, informative highlights |
| `--danger` | `#d3869b` | GC messages, corrupted sectors |

Colour is never the only signal: the target is also outlined, locked keys are also dashed, and GC lines are also in capitals.

## Type
| Role | Font | Size |
|---|---|---|
| UI text | IBM Plex Sans 400/500/600 | 14-20px |
| Buffer, map, keys, wordmark | JetBrains Mono 400/600 | 15-17px buffer, 28px lesson key |
| Section labels | IBM Plex Sans 600, 12px, uppercase, +0.12em tracking | |

## Layout (1280 x 800 reference, scales down to 1024 wide)
- **Header:** wordmark + location left; keys and power right.
- **Map screen:** the map panel fills the left; a 340px side panel holds Objective, Your moves (keycaps), Log (Operator + GC).
- **Challenge room:** a 420px lesson column on the left (new move keycap, one-line definition, Operator quote, before/after example, its opposite); the right side holds Goal (plain words), keys used vs best possible, attempts, the buffer with a marked target, allowed keys, and Hint and Show-solution buttons.

## Components
- **Keycap:** `--surface-raised`, 3px `--line-strong` bottom border, mono font. Locked: transparent with a dashed border, `--text-faint`. Newly taught: text in `--you`.
- **Target marker:** a 2px `--goal` outline around the target cell.
- **Cursor:** `--you` background, `--bg` text.
- **Fail-flow banner:** after 5 attempts, a raised panel offers "Show solution" (primary) and "Keep trying".
- **Motion:** none by default; replays animate key by key at about 4 keys per second, and they respect `prefers-reduced-motion`.
