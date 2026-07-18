# 🧸 DUNGEON SWEEPER

*A squishy clay toybox full of teeth. The numbers lie in wait.*

A **Minesweeper roguelike** in a goofy claymation art-toy world: the mines are
monsters, your "cards" are a squad of clay creatures, dead monsters crumble
into **shards** you craft into new creatures, and the only way down is a
**slot machine**. Slay the Spire-inspired progression. Pure HTML/CSS/JS —
no build step, no dependencies.

## ▶️ Play

Open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## 🎮 How it plays

- **Numbers are SUMS, not counts.** A revealed tile shows the *total power* of
  all monsters in the 8 tiles around it. A "5" might be five Rabbles — or one
  Gronk. Cross-reference the **bestiary** to deduce what's hiding where.
- **Poking a hidden monster = ambush.** It bops you for its power and stands
  there, exposed. Poking an exposed monster squishes it barehanded — for its
  power in HP *again*. HP is a resource; spend it wisely.
- **Your creatures fight for free.** Instead of flagging, you *act* on your
  deductions: 🤖 **Boombo** snipes a tile you believe holds a monster (no
  ambush), 🕯️ **Wicky** screams light over whole areas, 🌱 **Chompo** bites
  exposed monsters, 🛸 **Zorp** abducts threats back into the dark,
  💗 **Sproutli** keeps you standing.
- **⚡ Energy comes from revealing tiles.** Every safe reveal charges +1⚡.
  Risk feeds power — hide in a corner and you'll starve.
- **Squished monsters crumble into SHARDS** (5 colors: goo/bone/zap/ink/bolt)
  and **bubbles** pop into crafting ingredients (buttons, springs, googly
  eyes, fluff, star bits). At **Clucker's Workshop** between floors you craft
  them into new creatures — crafting a duplicate upgrades it to a **II**.
  Or is that bubble a 🦪 **Clampearl**…?
- **🎰 The LUCKY LIFT** is the only way to the next floor: board it and PULL
  THE LEVER. Pairs and triples pay out HP, energy, shards and ingredients —
  triple ⭐ is a trinket jackpot. Bosses **jam the lift** until squished.
- **8 floors**, each a hand-tuned toybox biome from a 40-monster clay cast,
  elites on 3 & 6, bosses on 4 & 8, trinkets, XP levels, and a **dungeon
  clock**: 🐱 Napcats flap around, 👻 Boolets (who are *invisible to the
  numbers*) drift, 🍄 Sporecaps buff everything around them — watch the omen
  timers.

**Controls:** left-click reveal/fight/pop · click a creature then a target to
play it (ESC cancels) · right-click chalks a note · keys 1–8 select creatures.

## 🗂 Project layout

```
index.html          page shell
css/style.css       all styling (clay-toy squish lives here)
js/config.js        ⚖️ ALL balance data — monsters, creatures, recipes, floors
js/engine.js        pure game logic (DOM-free, event-driven, testable)
js/ui.js            DOM rendering + input
js/fx.js            particles, shake, floating text
js/shader.js        WebGL pastel-swirl background
js/audio.js         synthesized sound effects (no audio files)
js/sprites.js       sprite manifest (built from config) + emoji fallbacks
assets/sprites/     the 60 clay-toy PNGs (a00–a29, b00–b29)
tests/smoke.js      headless engine test (node tests/smoke.js)
```

## 🖼 Sprites

All 60 clay-toy sprites live in `assets/sprites/` as `a00.png`–`b29.png` and
are wired up in [`js/config.js`](js/config.js) (each monster/creature declares
its `sprite`). Every single one is used: 40 monsters, 16 squad creatures, plus
the player portrait (`b08`), Clucker the workshop hen (`a02`), Glitchy the
slot-bot (`a07`) and the Pink Reaper (`a14`). Swap any file to reskin — emoji
placeholders appear for anything missing.

## ⚖️ Tuning

Everything numeric — monster power, creature costs, crafting recipes, slot
machine odds and payouts, floor rosters, tick timers — lives in
[`js/config.js`](js/config.js). Crank it.
