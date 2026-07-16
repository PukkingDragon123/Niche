/* ============================================================
   DUNGEON SWEEPER — CONFIG / BALANCE DATA
   Everything tunable lives here: monsters, cards, relics,
   floors, economy. Edit freely — the engine reads all of it.
   ============================================================ */
(function (root) {
'use strict';

const CFG = {

  /* ---------- Player ---------- */
  player: {
    maxHp: 10,
    mercifulMaxHp: 14,
    startEnergy: 3,          // energy at the start of every floor
    maxEnergy: 9,            // energy cap (Storm Ring adds more)
    deckCap: 8,              // max cards held
    xpBase: 10,              // xp needed for level 2
    xpStep: 6,               // +xp needed per additional level
    levelHpGain: 2,          // max hp per level
    levelHeal: 5,            // hp restored on level up
  },

  /* ---------- Economy ---------- */
  economy: {
    chestSkipGold: 15,       // gold for skipping a chest reward
    sealBonus: 25,           // clear every monster before descending
    goldTileMin: 7,
    goldTileMax: 14,
    dupSellGold: 25,         // 3rd copy of a card converts to gold
    shopPrices: { common: 35, uncommon: 60, rare: 95 },
    shopHealCost: 25,
    shopHealAmount: 5,
    shopRemoveCost: 40,
    restHeal: 4,             // free rest between floors
  },

  /* ---------- Dungeon clock (ticks happen every N board clicks) ---------- */
  ticks: {
    bat: 10,
    ghost: 9,
    shaman: 12,
    colossus: 14,
    heart: 10,
  },

  /* ---------- Monsters ----------
     pwr        : damage dealt on ambush/bump AND its weight in adjacent numbers
     ethereal   : contributes 0 to numbers (!!)
     disguise   : looks like a chest until it strikes or takes damage
     elite/boss : special placement, drops relics, immune to Relocate
     unbumpable : cannot be killed by clicking — cards only
  ------------------------------------------------------------------ */
  monsters: {
    rat:       { name: 'Rat',           emoji: '🐀', pwr: 1,  desc: 'A humble dungeon rat. Weak, but they are legion.' },
    bat:       { name: 'Cave Bat',      emoji: '🦇', pwr: 2,  tick: 'bat',
                 desc: 'RESTLESS — every 10 clicks, hidden bats flit to new tiles. Watch the numbers shimmer.' },
    slime:     { name: 'Slime',         emoji: '🫠', pwr: 4,
                 desc: 'SPLIT — if slain by a card, two Slimelings ooze into hidden tiles. Squashing it by hand avoids this.' },
    slimeling: { name: 'Slimeling',     emoji: '🫧', pwr: 1,  desc: 'A wobbling remnant of a slain slime.' },
    ghost:     { name: 'Ghost',         emoji: '👻', pwr: 3,  ethereal: true, tick: 'ghost',
                 desc: 'ETHEREAL — adds NOTHING to adjacent numbers, and drifts every 9 clicks. Scry, Purify or the Ghost Monocle find it.' },
    skeleton:  { name: 'Skeleton',      emoji: '💀', pwr: 4,  brittle: true,
                 desc: 'BRITTLE — takes DOUBLE damage from cards.' },
    spider:    { name: 'Tomb Spider',   emoji: '🕷️', pwr: 3,
                 desc: 'WEBWEAVER — when uncovered, webs nearby hidden tiles. Webbed tiles cost 1⚡ to reveal (1 HP if you have no ⚡).' },
    orc:       { name: 'Orc Brute',     emoji: '👹', pwr: 5,  desc: 'Five whole power of bad attitude.' },
    shaman:    { name: 'Gloom Shaman',  emoji: '🧙', pwr: 4,  tick: 'shaman',
                 desc: 'RITUAL — every 12 clicks, gives +1 power to every monster around it (even hidden ones). Kill it fast.' },
    mimic:     { name: 'Mimic',         emoji: '👿', pwr: 6,  disguise: true,
                 desc: 'DISGUISE — looks exactly like a chest and counts 0 in numbers. Poke suspicious chests with an arrow first…' },
    ogre:      { name: 'Ogre Warden',   emoji: '🧌', pwr: 7,  elite: true,
                 desc: 'ELITE — a wall of meat guarding a relic. Its bulk glows in the numbers around it.' },
    wraith:    { name: 'Vault Wraith',  emoji: '🪦', pwr: 6,  elite: true, ethereal: true,
                 desc: 'ELITE + ETHEREAL — a relic-hoarding horror that no number will ever betray.' },
    colossus:  { name: 'Bone Colossus', emoji: '🗿', pwr: 10, boss: true, tick: 'colossus',
                 desc: 'BOSS — RAMPAGE: every 14 clicks it strikes for 2 and buries a tile in rubble, unless you wounded it since its last rampage. The stairs are sealed while it lives.' },
    heart:     { name: 'The Dungeon Heart', emoji: '❤️‍🔥', pwr: 13, boss: true, unbumpable: true, tick: 'heart',
                 desc: 'FINAL BOSS — HEARTBEAT: every 10 clicks it spawns a rat and regrows 1 power. Immune to your bare hands — only cards can pierce it. Seals the stairs.' },
  },

  /* ---------- Boss tick details ---------- */
  bossRules: {
    colossusHit: 2,
    heartRegen: 1,
    heartSpawn: 'rat',
  },

  /* ---------- Cards ----------
     cost/vals are [tier1, tier2]. Duplicates merge into tier 2.
     target: none | exposed | shoot | hidden | area
  ------------------------------------------------------------------ */
  cards: {
    slash:      { name: 'Slash',      emoji: '⚔️', rarity: 'common',   target: 'exposed',
                  cost: [2, 2], vals: [3, 5],
                  desc: 'Deal {v} damage to an uncovered monster.' },
    bow:        { name: 'Bow',        emoji: '🏹', rarity: 'common',   target: 'shoot',
                  cost: [2, 1], vals: [2, 3],
                  desc: 'Shoot ANY tile for {v} — no ambush. A miss reveals the tile. Tests chests.' },
    torch:      { name: 'Torch',      emoji: '🔥', rarity: 'common',   target: 'area',
                  cost: [3, 2], vals: [0, 2], radius: 1,
                  desc: 'Reveal a 3×3 area. Monsters are uncovered without ambushing you.',
                  desc2: 'Reveal a 3×3 area without ambushes and SEAR the monsters inside for {v}.' },
    heal:       { name: 'Heal',       emoji: '💗', rarity: 'common',   target: 'none',
                  cost: [3, 3], vals: [4, 7],
                  desc: 'Restore {v} HP.' },
    dagger:     { name: 'Dagger',     emoji: '🗡️', rarity: 'common',   target: 'exposed',
                  cost: [1, 1], vals: [1, 2],
                  desc: 'A quick jab: {v} damage to an uncovered monster.' },
    excavate:   { name: 'Excavate',   emoji: '⛏️', rarity: 'common',   target: 'hidden',
                  cost: [1, 1], vals: [0, 0],
                  desc: 'Safely dig open one hidden tile — no ambush.',
                  desc2: 'Safely dig open a tile — no ambush — and glimpse every tile around it.' },
    ward:       { name: 'Ward',       emoji: '🛡️', rarity: 'common',   target: 'none',
                  cost: [2, 2], vals: [3, 5],
                  desc: 'Gain {v} Block. It soaks damage before HP.' },
    relocate:   { name: 'Relocate',   emoji: '🌀', rarity: 'uncommon', target: 'exposed',
                  cost: [2, 1], vals: [0, 0],
                  desc: 'Banish an uncovered monster into a random hidden tile, wounds and all.' },
    scry:       { name: 'Scry',       emoji: '👁️', rarity: 'uncommon', target: 'hidden',
                  cost: [1, 1], vals: [0, 0],
                  desc: 'Peek at a hidden tile. Sees ghosts & mimics truly.',
                  desc2: 'Peek at a hidden tile AND its 4 neighbours. Sees ghosts & mimics truly.' },
    whirlwind:  { name: 'Whirlwind',  emoji: '🌪️', rarity: 'uncommon', target: 'none',
                  cost: [3, 3], vals: [2, 3],
                  desc: 'Deal {v} damage to EVERY uncovered monster.' },
    purify:     { name: 'Purify',     emoji: '🕯️', rarity: 'uncommon', target: 'area',
                  cost: [2, 2], vals: [3, 4], radius: 1,
                  desc: 'Cleanse 3×3: burn webs & rubble, sear ghosts for {v} — even hidden.' },
    fireball:   { name: 'Fireball',   emoji: '☄️', rarity: 'rare',     target: 'area',
                  cost: [4, 4], vals: [4, 6], radius: 1,
                  desc: 'Blast 3×3: {v} damage to all monsters inside, reveal the ground.' },
    chain:      { name: 'Chain Lightning', emoji: '⚡', rarity: 'rare', target: 'exposed',
                  cost: [4, 3], vals: [5, 7], arc: [3, 4],
                  desc: 'Strike for {v}, arcing {a} to all adjacent monsters — even hidden.' },
    midas:      { name: 'Midas Touch', emoji: '👑', rarity: 'rare',    target: 'exposed',
                  cost: [3, 3], vals: [4, 6],
                  desc: 'Kill an uncovered monster of power ≤{v}. Gold ×3 power, no XP.' },
    focus:      { name: 'Deep Focus', emoji: '💫', rarity: 'rare',     target: 'none',
                  cost: [0, 0], vals: [4, 6], exhaust: true,
                  desc: 'Gain {v}⚡. Once per floor.' },
    divination: { name: 'Divination', emoji: '🔮', rarity: 'rare',     target: 'none',
                  cost: [2, 1], vals: [0, 0], exhaust: true,
                  desc: 'Mark every Ghost, Wraith & Mimic on the floor. Once per floor.' },
  },

  startDeck: ['slash', 'bow', 'torch', 'heal'],

  rarityWeights: { common: 60, uncommon: 30, rare: 10 },
  rareFloorBonus: 2,   // +N% rare weight per floor

  /* ---------- Relics ---------- */
  relics: {
    lantern:    { name: 'Old Lantern',   emoji: '🏮', desc: 'Torch, Purify and Fireball reach a 5×5 area.' },
    whetstone:  { name: 'Whetstone',     emoji: '🪓', desc: 'Slash, Dagger and Whirlwind deal +1 damage.' },
    quiver:     { name: 'Deep Quiver',   emoji: '🎯', desc: 'Bow costs 1 less ⚡ (min 1) and deals +1 damage.' },
    bloodvial:  { name: 'Blood Vial',    emoji: '🩸', desc: 'Leveling up fully heals you.' },
    luckycoin:  { name: 'Lucky Coin',    emoji: '🍀', desc: '+1 gold from every kill.' },
    compass:    { name: 'Dead Compass',  emoji: '🧭', desc: 'Whispers which corner of each floor hides the stairs.' },
    boots:      { name: 'Iron Boots',    emoji: '🥾', desc: 'The first ambush each floor deals 3 less damage (min 1).' },
    ghostglass: { name: 'Ghost Monocle', emoji: '🧿', desc: 'Ethereal monsters COUNT in adjacent numbers.' },
    stormring:  { name: 'Storm Ring',    emoji: '💍', desc: '+3 maximum ⚡.' },
  },

  /* ---------- Floors ----------
     hue: shader tint. roster: monsters placed. elite/boss occupy one extra tile.
  ------------------------------------------------------------------ */
  floors: [
    { name: 'The Cellars',        w:  9, h:  8, hue: 265,
      roster: { rat: 8, bat: 3, slime: 1 },
      chests: 2, goldTiles: 3 },
    { name: 'The Catacombs',      w: 10, h:  9, hue: 225,
      roster: { rat: 6, bat: 4, slime: 2, skeleton: 2, ghost: 1 },
      chests: 2, goldTiles: 3 },
    { name: 'The Web Gallery',    w: 11, h:  9, hue: 160,
      roster: { rat: 4, bat: 3, spider: 4, slime: 2, skeleton: 2, ghost: 1 },
      elite: 'ogre', chests: 3, goldTiles: 3 },
    { name: 'The Bone Hall',      w: 11, h: 10, hue: 35,
      roster: { bat: 3, skeleton: 6, slime: 2, ghost: 1, orc: 1 },
      boss: 'colossus', chests: 2, goldTiles: 4 },
    { name: 'The Flooded Depths', w: 12, h: 10, hue: 190,
      roster: { rat: 5, slime: 5, spider: 2, ghost: 2, orc: 2, shaman: 1, mimic: 1 },
      chests: 3, goldTiles: 4 },
    { name: 'The Shadow Vault',   w: 12, h: 11, hue: 285,
      roster: { bat: 4, ghost: 3, skeleton: 3, orc: 2, shaman: 1, mimic: 1 },
      elite: 'wraith', chests: 3, goldTiles: 4 },
    { name: 'The Gilded Halls',   w: 13, h: 11, hue: 45,
      roster: { rat: 4, bat: 4, skeleton: 3, orc: 3, shaman: 2, ghost: 2, mimic: 2 },
      chests: 4, goldTiles: 6 },
    { name: 'The Dungeon Heart',  w: 13, h: 12, hue: 355,
      roster: { skeleton: 4, orc: 3, ghost: 3, shaman: 2, slime: 3, mimic: 1 },
      boss: 'heart', chests: 3, goldTiles: 4 },
  ],

  mercifulDensity: 0.85,   // monster count multiplier in Merciful mode

  shamanBuffCap: 3,        // max +pwr a single monster can gain from rituals
};

root.DS_CONFIG = CFG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
