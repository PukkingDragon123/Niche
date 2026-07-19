# 🔔 DUNGEON SWEEPER

*A whimsical warren of goofy monsters. Weaken them, catch them, collect them all.*

A **Minesweeper roguelike monster-catcher**: the mines are monsters, your
"cards" are a squad of little creatures, and the goal is to **weaken monsters
and CATCH them** into your Menagerie. Destroy them instead and they leave a
lootable corpse. Shards + bubble ingredients craft new creatures; the only way
down is a **slot machine**. Slay the Spire-inspired progression. Pure
HTML/CSS/JS — no build step, no dependencies.

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
  there, exposed. Striking an exposed monster barehanded costs its power in HP
  *again* — so it's the desperate option, not the smart one.
- **🔔 CATCH them instead.** Whittle a monster down until it's **DAZED** (low
  power) — a teal glow and a `CATCH!` tag appear — then click it to catch it
  bare-handed: **no HP cost**, bonus shards, and a permanent spot in your
  **Menagerie** (tracked as *caught n/38*). First catch of a species pays extra.
- **💀 Destroyed monsters leave a corpse.** Click it to loot leftover shards or
  an ingredient. Caught monsters give more — catching is the skilled play.
- **Your creatures do the weakening.** 🤖 **Boombo** snipes a tile you deduced
  holds a monster (no ambush), 🕯️ **Wicky** screams light over whole areas,
  🌱 **Chompo** bites exposed monsters, 🛸 **Zorp** abducts threats,
  💗 **Sproutli** keeps you standing.
- **⚡ Energy comes from revealing tiles.** Every safe reveal charges +1⚡.
  Risk feeds power — hide in a corner and you'll starve.
- **Shards** (5 colors: goo/bone/zap/ink/bolt) from catches, corpses & piles,
  plus **bubble** ingredients (buttons, springs, googly eyes, fluff, star bits),
  fund crafting. At **the Menagerie** between floors you craft them into new
  creatures — a duplicate upgrades to a **II**. Or is that bubble a
  🦪 **Clampearl**…?
- **🎰 The LUCKY LIFT** is the only way to the next floor: board it and PULL
  THE LEVER. Pairs and triples pay HP, energy, shards and ingredients —
  triple ⭐ is a trinket jackpot. Bosses **jam the lift** until defeated (and
  are too big to catch).
- **8 floors**, each a hand-tuned biome from a 40-monster cast, elites on 3 & 6,
  bosses on 4 & 8, trinkets, XP levels, and a **dungeon clock**: 🐱 Napcats
  flap around, 👻 Boolets (who are *invisible to the numbers*) drift,
  🍄 Sporecaps buff everything around them — watch the omen timers.

**Controls:** left-click reveal/catch/loot · click a creature then a target to
play it (ESC cancels) · right-click chalks a note · keys 1–8 select creatures.

## 🗂 Project layout

```
index.html          page shell
css/style.css       all styling (3D tiles, capture/corpse/death VFX)
js/config.js        ⚖️ ALL balance data — monsters, creatures, recipes, capture, floors
js/engine.js        pure game logic (DOM-free, event-driven, testable)
js/ui.js            DOM rendering + input
js/fx.js            particles, shake, floating text
js/shader.js        WebGL pastel-swirl background
js/audio.js         synthesized sound effects (no audio files)
js/sprites.js       sprite manifest (built from config) + emoji fallbacks
assets/sprites/     the 60 monster/creature PNGs (a00–a29, b00–b29)
tests/smoke.js      headless engine test (node tests/smoke.js)
```

## 🖼 Sprites

All 60 sprites live in `assets/sprites/` as `a00.png`–`b29.png` and are wired up
in [`js/config.js`](js/config.js) (each monster/creature declares its
`sprite`). Every single one is used: 40 monsters, 16 squad creatures, plus the
player portrait (`b08`), Clucker the menagerie hen (`a02`), Glitchy the slot-bot
(`a07`) and the Pink Reaper (`a14`). Swap any file to reskin — emoji
placeholders appear for anything missing.

## ⚖️ Tuning

Everything numeric — monster power, creature costs, crafting recipes, capture
daze thresholds, corpse loot odds, slot machine payouts, floor rosters, tick
timers — lives in [`js/config.js`](js/config.js). Crank it.
