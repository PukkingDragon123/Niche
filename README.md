# 💀 DUNGEON SWEEPER

*The numbers lie in wait. The cards keep you alive.*

A **Minesweeper roguelike** where the mines are monsters, the flags are attack
cards, and the dungeon fights back. Balatro-inspired visuals, Slay the
Spire-inspired progression. Pure HTML/CSS/JS — no build step, no dependencies.

## ▶️ Play

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## 🎮 How it plays

- **Numbers are SUMS, not counts.** A revealed tile shows the *total power* of
  all monsters in the 8 tiles around it. A "5" might be five rats — or one orc.
  Cross-reference the **bestiary** to deduce what's hiding where.
- **Clicking a hidden monster = ambush.** It hits you for its power and stands
  there, exposed. Clicking an exposed monster slays it barehanded — for its
  power in HP *again*. HP is a resource; spend it wisely.
- **Cards kill for free.** Instead of flagging, you *act* on your deductions:
  🏹 **Bow** snipes a tile you believe holds a monster (no ambush), 🔥 **Torch**
  safely uncovers areas, ⚔️ **Slash** butchers exposed monsters, 🌀 **Relocate**
  banishes threats back into the dark, 💗 **Heal** keeps you standing.
- **⚡ Energy comes from revealing tiles.** Every safe reveal charges +1⚡.
  Risk feeds power — hide in a corner and you'll starve.
- **Chests open Balatro-style booster packs**: pick 1 of 3 cards. Duplicates
  merge into upgraded **II** versions. Or is that chest a 👿 **Mimic**…?
- **8 floors**, each a hand-tuned biome with its own roster, elites on 3 & 6,
  bosses on 4 & 8 (they **seal the stairs**), a shop + rest stop between floors,
  relics, XP levels, and a **dungeon clock**: 🦇 bats relocate, 👻 ghosts (who
  are *invisible to the numbers*) drift, 🧙 shamans buff everything around them
  — watch the omen timers.

**Controls:** left-click reveal/fight/open · click a card then a target to play
it (ESC cancels) · right-click chalks a note · keys 1–8 select cards.

## 🗂 Project layout

```
index.html          page shell
css/style.css       all styling (Balatro-y juice lives here)
js/config.js        ⚖️ ALL balance data — monsters, cards, relics, floors
js/engine.js        pure game logic (DOM-free, event-driven, testable)
js/ui.js            DOM rendering + input
js/fx.js            particles, shake, floating text
js/shader.js        WebGL swirling background
js/audio.js         synthesized sound effects (no audio files)
js/sprites.js       sprite manifest + emoji fallbacks
assets/sprites/     ← drop your PNG art here (see its README)
tests/smoke.js      headless engine test (node tests/smoke.js)
```

## 🖼 Adding your own sprites

Drop PNGs into `assets/sprites/` with the names listed in
[`assets/sprites/README.md`](assets/sprites/README.md). Emoji placeholders are
used for anything missing — swap art at any pace, zero code edits.

## ⚖️ Tuning

Everything numeric — monster power, card costs, floor rosters, tick timers,
shop prices — lives in [`js/config.js`](js/config.js). Crank it.
