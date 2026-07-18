/* ============================================================
   DUNGEON SWEEPER — CONFIG / BALANCE DATA
   Clay-toy edition. Everything tunable lives here: monsters,
   creatures (cards), trinkets, recipes, floors, slot machine.
   ============================================================ */
(function (root) {
'use strict';

const CFG = {

  /* ---------- Player ---------- */
  player: {
    maxHp: 10,
    mercifulMaxHp: 14,
    startEnergy: 3,          // energy at the start of every floor
    maxEnergy: 9,            // energy cap (Battery Pack adds more)
    deckCap: 8,              // max creatures in the squad
    xpBase: 10,              // xp needed for level 2
    xpStep: 6,               // +xp needed per additional level
    levelHpGain: 2,          // max hp per level
    levelHeal: 5,            // hp restored on level up
  },

  /* ---------- Shards (monster fragments) ---------- */
  shards: {
    goo:  { name: 'Goo',  emoji: '🟢', color: '#7fce6b' },
    bone: { name: 'Bone', emoji: '🦴', color: '#efe3c8' },
    zap:  { name: 'Zap',  emoji: '⚡', color: '#ffd166' },
    ink:  { name: 'Ink',  emoji: '🟣', color: '#b58cf0' },
    bolt: { name: 'Bolt', emoji: '🔩', color: '#a8b0ba' },
  },

  /* ---------- Ingredients (found in bubbles) ---------- */
  ingredients: {
    button: { name: 'Button',     emoji: '🔘' },
    spring: { name: 'Spring',     emoji: '➰' },
    googly: { name: 'Googly Eye', emoji: '👁️' },
    fluff:  { name: 'Fluff',      emoji: '☁️' },
    star:   { name: 'Star Bit',   emoji: '⭐' },
  },

  /* ---------- Economy ---------- */
  economy: {
    bubbleIngredients: 2,    // ingredients per popped bubble
    bubbleShardChance: 0.5,  // chance a bubble also holds +2 shards
    sealBonus: 5,            // shards for clearing every monster before riding down
    shardTileMin: 2,         // loose shard piles on the board
    shardTileMax: 4,
    dupMeltShards: 6,        // a 3rd copy of a creature melts into shards
    snackCost: 6,            // any-mix shards for the workshop snack
    snackHeal: 5,
    recycleRefund: 5,        // shards back for melting a squad creature
    restHeal: 4,             // free nap between floors
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
     frag       : shard color it crumbles into (drops ceil(pwr/2) shards)
     ethereal   : contributes 0 to numbers (!!)
     disguise   : looks like a bubble until it strikes or takes damage
     elite/boss : special placement, drops trinkets, immune to Zorp
     unbumpable : cannot be squished by clicking — creatures only
     sprite     : file id in assets/sprites/
  ------------------------------------------------------------------ */
  monsters: {
    /* -- the core cast (mechanical archetypes) -- */
    rat:       { name: 'Rabble',        sprite: 'a01', emoji: '🐀', pwr: 1, frag: 'goo',
                 desc: 'A wobbling pile of pocket-sized pests. Weak, but they are legion.' },
    bat:       { name: 'Napcat',        sprite: 'b22', emoji: '🦇', pwr: 2, frag: 'ink', tick: 'bat',
                 desc: 'RESTLESS — every 10 clicks, sleeping Napcats flap to new tiles. Watch the numbers shimmer.' },
    slime:     { name: 'Gloop Cloud',   sprite: 'b07', emoji: '🫠', pwr: 4, frag: 'goo',
                 desc: 'DRIPPY — if popped by a creature, two Gloopdrops rain into hidden tiles. Squishing it by hand avoids this.' },
    slimeling: { name: 'Gloopdrop',     sprite: 'a15', emoji: '🫧', pwr: 1, frag: 'goo',
                 desc: 'A squeaky little drip of a slain Gloop Cloud.' },
    ghost:     { name: 'Boolet',        sprite: 'b15', emoji: '👻', pwr: 3, frag: 'ink', ethereal: true, tick: 'ghost',
                 desc: 'ETHEREAL — adds NOTHING to adjacent numbers, and drifts every 9 clicks. Pixel, Snorkle or the X-Ray Specs find it.' },
    skeleton:  { name: 'Bonehound',     sprite: 'a06', emoji: '💀', pwr: 4, frag: 'bone', brittle: true,
                 desc: 'BRITTLE — takes DOUBLE damage from creatures.' },
    spider:    { name: 'Widow',         sprite: 'b24', emoji: '🕷️', pwr: 3, frag: 'ink',
                 desc: 'WEBWEAVER — when uncovered, webs nearby hidden tiles. Webbed tiles cost 1⚡ to reveal (1 HP if you have no ⚡).' },
    orc:       { name: 'Gronk',         sprite: 'a27', emoji: '👹', pwr: 5, frag: 'bone',
                 desc: 'Five whole power of clay-fisted bad attitude.' },
    shaman:    { name: 'Sporecap',      sprite: 'a12', emoji: '🍄', pwr: 4, frag: 'goo', tick: 'shaman',
                 desc: 'SPORES — every 12 clicks, puffs +1 power onto every monster around it (even hidden ones). Squish it fast.' },
    mimic:     { name: 'Clampearl',     sprite: 'a05', emoji: '🦪', pwr: 6, frag: 'bone', disguise: true,
                 desc: 'DISGUISE — looks exactly like a bubble and counts 0 in numbers. Poke suspicious bubbles with Boombo first…' },
    ogre:      { name: 'Sabretooth',    sprite: 'a26', emoji: '🐯', pwr: 7, frag: 'bone', elite: true,
                 desc: 'ELITE — a wall of fangs guarding a trinket. Its bulk glows in the numbers around it.' },
    wraith:    { name: 'Grimwisp',      sprite: 'b20', emoji: '🪦', pwr: 6, frag: 'ink', elite: true, ethereal: true,
                 desc: 'ELITE + ETHEREAL — a trinket-hoarding shadow that no number will ever betray.' },
    colossus:  { name: 'The Gunk King', sprite: 'b16', emoji: '👑', pwr: 10, frag: 'goo', boss: true, tick: 'colossus',
                 desc: 'BOSS — TANTRUM: every 14 clicks it splats you for 2 and buries a tile in gunk, unless you wounded it since its last tantrum. The Lucky Lift is jammed while it lives.' },
    heart:     { name: 'The Toybox King', sprite: 'a25', emoji: '🎪', pwr: 13, frag: 'ink', boss: true, unbumpable: true, tick: 'heart',
                 desc: 'FINAL BOSS — ROYAL DECREE: every 10 clicks it summons a Rabble and regrows 1 power. Immune to your bare hands — only creatures can dethrone it. Jams the Lift.' },

    /* -- the extended toybox (stat & flag variants; every sprite fights) -- */
    gulpy:     { name: 'Gulpy',        sprite: 'a00', emoji: '🐟', pwr: 2, frag: 'goo',
                 desc: 'All lips, no manners. Two power of soggy kisses.' },
    peng:      { name: 'Peng',         sprite: 'a22', emoji: '🐧', pwr: 2, frag: 'bone',
                 desc: 'A grumpy little penguin in rain boots. Slaps surprisingly hard.' },
    yolko:     { name: 'Yolko',        sprite: 'a29', emoji: '🥚', pwr: 2, frag: 'bone',
                 desc: 'Hatched wrong. Still salty about it.' },
    slurpo:    { name: 'Slurpo',       sprite: 'a04', emoji: '🐦', pwr: 3, frag: 'ink',
                 desc: 'Slurps worms, secrets and unattended HP.' },
    toejam:    { name: 'Toejam',       sprite: 'b00', emoji: '🦶', pwr: 3, frag: 'zap',
                 desc: 'A pair of haunted feet. Kicks first, asks never.' },
    lickzard:  { name: 'Lickzard',     sprite: 'b03', emoji: '🦎', pwr: 3, frag: 'goo',
                 desc: 'Its tongue is longer than its attention span.' },
    inkling:   { name: 'Inkling',      sprite: 'a16', emoji: '🐙', pwr: 3, frag: 'ink',
                 desc: 'A pocket octopus with a bad beak and worse intentions.' },
    puffpuff:  { name: 'Puffpuff',     sprite: 'a10', emoji: '🐡', pwr: 3, frag: 'bone',
                 desc: 'Mostly air, partly spikes, fully annoyed.' },
    eggward:   { name: 'Eggward',      sprite: 'b12', emoji: '🍳', pwr: 3, frag: 'bone',
                 desc: 'Sir Eggward the Unboiled. Guards his yolk jealously.' },
    eggsack:   { name: 'Eggsack',      sprite: 'b17', emoji: '🥟', pwr: 3, frag: 'bone',
                 desc: 'A cuddle-pile of something you hope never hatches.' },
    croaks:    { name: 'Croaks',       sprite: 'a21', emoji: '🐸', pwr: 4, frag: 'goo', brittle: true,
                 desc: 'BRITTLE — a skull-faced frog, all hollow bones. Creatures hit it DOUBLE.' },
    knucklehead:{ name: 'Knucklehead', sprite: 'b02', emoji: '👊', pwr: 4, frag: 'bone', brittle: true,
                 desc: 'BRITTLE — a fist with a face. Cracks under a creature\'s DOUBLE damage.' },
    grabbles:  { name: 'Grabbles',     sprite: 'a19', emoji: '🐙', pwr: 4, frag: 'ink',
                 desc: 'Eight arms, zero boundaries.' },
    binjamin:  { name: 'Binjamin',     sprite: 'b11', emoji: '🗑️', pwr: 4, frag: 'bolt',
                 desc: 'Lives in the bin. IS the bin. Leaks something dreadful.' },
    beedozer:  { name: 'Beedozer',     sprite: 'b06', emoji: '🐝', pwr: 4, frag: 'zap',
                 desc: 'Half bee, half bulldozer, all business.' },
    corny:     { name: 'Corny',        sprite: 'b19', emoji: '🦄', pwr: 4, frag: 'bone',
                 desc: 'A snow unicorn with a candy-corn horn and a grudge.' },
    smoocher:  { name: 'Smoocher',     sprite: 'b29', emoji: '💋', pwr: 4, frag: 'goo',
                 desc: 'Puckers up before it strikes. The kiss costs 4 HP.' },
    tiredtim:  { name: 'Tired Tim',    sprite: 'a08', emoji: '🪱', pwr: 4, frag: 'bolt',
                 desc: 'Too exhausted to chase you. Bites whoever comes close instead.' },
    boxbite:   { name: 'Boxbite',      sprite: 'b14', emoji: '📦', pwr: 4, frag: 'bone', disguise: true,
                 desc: 'DISGUISE — cardboard camouflage. Looks like a bubble, tastes like regret.' },
    sharkie:   { name: 'Sharkie',      sprite: 'a23', emoji: '🦈', pwr: 5, frag: 'bolt',
                 desc: 'Never removes the floatie. Still the scariest thing in the tub.' },
    prickles:  { name: 'Prickles',     sprite: 'b26', emoji: '🐡', pwr: 5, frag: 'zap',
                 desc: 'A beach ball you deeply regret touching.' },
    lordflush: { name: 'Lord Flush',   sprite: 'b09', emoji: '🐍', pwr: 5, frag: 'ink',
                 desc: 'Emerged from the porcelain throne. Do not ask what it read down there.' },
    cubeo:     { name: 'Cubeo',        sprite: 'b05', emoji: '🎃', pwr: 5, frag: 'zap',
                 desc: 'A block of concentrated Halloween. Glows when it giggles.' },
    chimchim:  { name: 'Chimchim',     sprite: 'a09', emoji: '🏚️', pwr: 5, frag: 'ink', ethereal: true,
                 desc: 'ETHEREAL — a soot spirit in a brick sweater. Counts 0 in numbers. Doesn\'t drift — it\'s comfy.' },
    stumpy:    { name: 'Stumpy',       sprite: 'a17', emoji: '🪵', pwr: 6, frag: 'bolt',
                 desc: 'A cheerful stump with a snowman face. The smile is load-bearing.' },
    sawjaw:    { name: 'Sawjaw',       sprite: 'b21', emoji: '🪚', pwr: 6, frag: 'bolt',
                 desc: 'Part fish, part power tool. All warranty violations.' },
  },

  /* ---------- Boss tick details ---------- */
  bossRules: {
    colossusHit: 2,
    heartRegen: 1,
    heartSpawn: 'rat',
  },

  /* ---------- Creatures (your squad — the "cards") ----------
     cost/vals are [tier1, tier2]. Crafting a duplicate merges into tier 2.
     target: none | exposed | shoot | hidden | area
     recipe: crafting cost — shards {color:n} + ingredients {kind:n}
  ------------------------------------------------------------------ */
  cards: {
    slash:      { name: 'Chompo',   sprite: 'a20', emoji: '⚔️', rarity: 'common',   target: 'exposed',
                  cost: [2, 2], vals: [3, 5],
                  recipe: { shards: { goo: 5, bone: 3 }, ing: { googly: 1 } },
                  desc: 'CHOMP an uncovered monster for {v} damage.' },
    bow:        { name: 'Boombo',   sprite: 'b23', emoji: '🏹', rarity: 'common',   target: 'shoot',
                  cost: [2, 1], vals: [2, 3],
                  recipe: { shards: { bolt: 5, zap: 3 }, ing: { spring: 1 } },
                  desc: 'Shoot ANY tile for {v} — no ambush. A miss reveals the tile. Tests bubbles.' },
    torch:      { name: 'Wicky',    sprite: 'a11', emoji: '🕯️', rarity: 'common',   target: 'area',
                  cost: [3, 2], vals: [0, 2], radius: 1,
                  recipe: { shards: { bone: 4, zap: 4 }, ing: { button: 1 } },
                  desc: 'Scream light into a 3×3 area. Monsters are uncovered without ambushing you.',
                  desc2: 'Scream light into 3×3 without ambushes and SINGE the monsters inside for {v}.' },
    heal:       { name: 'Sproutli', sprite: 'b28', emoji: '💗', rarity: 'common',   target: 'none',
                  cost: [3, 3], vals: [4, 7],
                  recipe: { shards: { goo: 6 }, ing: { fluff: 1 } },
                  desc: 'A leafy hug restores {v} HP.' },
    dagger:     { name: 'Snapjack', sprite: 'b01', emoji: '🗡️', rarity: 'common',   target: 'exposed',
                  cost: [1, 1], vals: [1, 2],
                  recipe: { shards: { bolt: 4, bone: 2 }, ing: { spring: 1 } },
                  desc: 'Springs from its box: a quick {v} damage jab at an uncovered monster.' },
    excavate:   { name: 'Munchy',   sprite: 'b13', emoji: '⛏️', rarity: 'common',   target: 'hidden',
                  cost: [1, 1], vals: [0, 0],
                  recipe: { shards: { bolt: 5, goo: 2 }, ing: { button: 1 } },
                  desc: 'Munchy safely eats one hidden tile open — no ambush.',
                  desc2: 'Munchy eats a tile open — no ambush — and sniffs every tile around it.' },
    ward:       { name: 'Sheldon',  sprite: 'b10', emoji: '🛡️', rarity: 'common',   target: 'none',
                  cost: [2, 2], vals: [3, 5],
                  recipe: { shards: { bone: 5, goo: 3 }, ing: { fluff: 1 } },
                  desc: 'Sheldon lends his shell: gain {v} Block. It soaks damage before HP.' },
    relocate:   { name: 'Zorp',     sprite: 'a28', emoji: '🛸', rarity: 'uncommon', target: 'exposed',
                  cost: [2, 1], vals: [0, 0],
                  recipe: { shards: { ink: 6, zap: 4 }, ing: { googly: 2 } },
                  desc: 'Zorp abducts an uncovered monster and drops it on a random hidden tile, wounds and all.' },
    scry:       { name: 'Pixel',    sprite: 'a03', emoji: '👁️', rarity: 'uncommon', target: 'hidden',
                  cost: [1, 1], vals: [0, 0],
                  recipe: { shards: { zap: 6, ink: 3 }, ing: { googly: 2 } },
                  desc: 'Pixel scans a hidden tile. Sees Boolets & mimics truly.',
                  desc2: 'Pixel scans a hidden tile AND its 4 neighbours. Sees Boolets & mimics truly.' },
    whirlwind:  { name: 'Dizzy',    sprite: 'b18', emoji: '🌪️', rarity: 'uncommon', target: 'none',
                  cost: [3, 3], vals: [2, 3],
                  recipe: { shards: { zap: 7, goo: 4 }, ing: { spring: 2 } },
                  desc: 'Dizzy sprints the whole floor: {v} damage to EVERY uncovered monster.' },
    purify:     { name: 'Snorkle',  sprite: 'b25', emoji: '🤿', rarity: 'uncommon', target: 'area',
                  cost: [2, 2], vals: [3, 4], radius: 1,
                  recipe: { shards: { bone: 6, ink: 5 }, ing: { fluff: 2 } },
                  desc: 'Scrub 3×3: mop webs & gunk, spook the spooks for {v} — even hidden ones.' },
    fireball:   { name: 'Brew',     sprite: 'a24', emoji: '☄️', rarity: 'rare',     target: 'area',
                  cost: [4, 4], vals: [4, 6], radius: 1,
                  recipe: { shards: { ink: 6, zap: 6, bone: 3 }, ing: { star: 1, button: 1 } },
                  desc: 'Brew lobs the whole cauldron: {v} damage to all monsters in 3×3, reveals the ground.' },
    chain:      { name: 'Zappy',    sprite: 'b04', emoji: '⚡', rarity: 'rare',     target: 'exposed',
                  cost: [4, 3], vals: [5, 7], arc: [3, 4],
                  recipe: { shards: { zap: 8, bolt: 5 }, ing: { star: 1, spring: 1 } },
                  desc: 'Static shock for {v}, arcing {a} to all adjacent monsters — even hidden.' },
    midas:      { name: 'Fortune',  sprite: 'a18', emoji: '🐱', rarity: 'rare',     target: 'exposed',
                  cost: [3, 3], vals: [4, 6],
                  recipe: { shards: { bone: 8, zap: 5 }, ing: { star: 1, googly: 1 } },
                  desc: 'The lucky cat pounces: kill an uncovered monster of power ≤{v}. Shards ×3, no XP.' },
    focus:      { name: 'Blinky',   sprite: 'b27', emoji: '💫', rarity: 'rare',     target: 'none',
                  cost: [0, 0], vals: [4, 6], exhaust: true,
                  recipe: { shards: { ink: 7, bone: 4 }, ing: { star: 1, fluff: 1 } },
                  desc: 'Blinky cries you a river of {v}⚡. Once per floor.' },
    divination: { name: 'Specs',    sprite: 'a13', emoji: '🔮', rarity: 'rare',     target: 'none',
                  cost: [2, 1], vals: [0, 0], exhaust: true,
                  recipe: { shards: { bolt: 6, ink: 5 }, ing: { star: 1, googly: 1 } },
                  desc: 'The 3D glasses see all: mark every Boolet, Grimwisp & mimic on the floor. Once per floor.' },
  },

  startDeck: ['slash', 'bow', 'torch', 'heal'],

  rarityWeights: { common: 60, uncommon: 30, rare: 10 },
  rareFloorBonus: 2,   // +N% rare weight per floor

  /* ---------- Trinkets (relics) ---------- */
  relics: {
    lantern:    { name: 'Lava Lamp',    emoji: '🏮', desc: 'Wicky, Snorkle and Brew reach a 5×5 area.' },
    whetstone:  { name: 'Sharp Teeth',  emoji: '🦷', desc: 'Chompo, Snapjack and Dizzy deal +1 damage.' },
    quiver:     { name: 'Ammo Belt',    emoji: '🎯', desc: 'Boombo costs 1 less ⚡ (min 1) and deals +1 damage.' },
    bloodvial:  { name: 'Juice Box',    emoji: '🧃', desc: 'Leveling up fully heals you.' },
    luckycoin:  { name: 'Sticky Mitts', emoji: '🧤', desc: '+1 shard from every kill.' },
    compass:    { name: 'Toy Compass',  emoji: '🧭', desc: 'Whispers which corner of each floor hides the Lucky Lift.' },
    boots:      { name: 'Bubble Wrap',  emoji: '🫧', desc: 'The first ambush each floor deals 3 less damage (min 1).' },
    ghostglass: { name: 'X-Ray Specs',  emoji: '🥽', desc: 'Ethereal monsters COUNT in adjacent numbers.' },
    stormring:  { name: 'Battery Pack', emoji: '🔋', desc: '+3 maximum ⚡.' },
  },

  /* ---------- The Lucky Lift (slot machine between floors) ----------
     Symbols are weighted; payouts by pair/triple. Reels are pre-rolled
     from the run seed the moment the lift is boarded.
  ------------------------------------------------------------------ */
  lift: {
    symbols: {
      heart:   { emoji: '💖', weight: 20 },
      battery: { emoji: '🔋', weight: 16 },
      goo:     { emoji: '🟢', weight: 12 },
      bone:    { emoji: '🦴', weight: 12 },
      zap:     { emoji: '⚡', weight: 11 },
      ink:     { emoji: '🟣', weight: 11 },
      bolt:    { emoji: '🔩', weight: 11 },
      star:    { emoji: '⭐', weight: 7 },
    },
    /* pair / triple payouts */
    pay: {
      heart:   { pair: { hp: 3 },        triple: { hp: 7 } },
      battery: { pair: { energy: 2 },    triple: { energy: 4 } },   // banked for next floor
      goo:     { pair: { shard: 5 },     triple: { shard: 10 } },
      bone:    { pair: { shard: 5 },     triple: { shard: 10 } },
      zap:     { pair: { shard: 5 },     triple: { shard: 10 } },
      ink:     { pair: { shard: 5 },     triple: { shard: 10 } },
      bolt:    { pair: { shard: 5 },     triple: { shard: 10 } },
      star:    { pair: { ingredients: 2 }, triple: { relic: true } }, // JACKPOT
    },
    consolationShards: 2,   // no match: a couple of shards of a rolled color
  },

  /* ---------- Floors ----------
     hue: shader tint. roster: monsters placed. elite/boss occupy one extra tile.
     bubbles: ingredient bubbles. shardTiles: loose shard piles.
  ------------------------------------------------------------------ */
  floors: [
    { name: 'The Toy Bin',         w:  9, h:  8, hue: 145,
      roster: { rat: 5, gulpy: 3, peng: 2, bat: 3, slime: 1 },
      bubbles: 2, shardTiles: 3 },
    { name: 'The Sock Drawer',     w: 10, h:  9, hue: 210,
      roster: { rat: 3, bat: 3, yolko: 2, skeleton: 2, croaks: 1, ghost: 1, slime: 1 },
      bubbles: 2, shardTiles: 3 },
    { name: 'The Sticky Web Nook', w: 11, h:  9, hue: 275,
      roster: { spider: 4, toejam: 2, lickzard: 2, inkling: 2, ghost: 1, bat: 2, slime: 1 },
      elite: 'ogre', bubbles: 3, shardTiles: 3 },
    { name: 'The Gunk Pit',        w: 11, h: 10, hue: 95,
      roster: { skeleton: 4, knucklehead: 3, binjamin: 2, slurpo: 2, ghost: 1 },
      boss: 'colossus', bubbles: 2, shardTiles: 4 },
    { name: 'The Bathtime Abyss',  w: 12, h: 10, hue: 190,
      roster: { sharkie: 2, prickles: 2, puffpuff: 3, slime: 3, eggward: 2, lordflush: 1, mimic: 1 },
      bubbles: 3, shardTiles: 4 },
    { name: 'The Shadow Shelf',    w: 12, h: 11, hue: 250,
      roster: { ghost: 3, chimchim: 2, cubeo: 2, grabbles: 2, tiredtim: 1, shaman: 1, boxbite: 1, bat: 2 },
      elite: 'wraith', bubbles: 3, shardTiles: 4 },
    { name: 'The Big Toybox',      w: 13, h: 11, hue: 35,
      roster: { stumpy: 2, sawjaw: 2, corny: 2, beedozer: 2, smoocher: 2, shaman: 2, mimic: 1, boxbite: 1 },
      bubbles: 4, shardTiles: 6 },
    { name: 'The Playroom Throne', w: 13, h: 12, hue: 325,
      roster: { skeleton: 3, orc: 3, ghost: 3, shaman: 2, slime: 3, eggsack: 2, rat: 2 },
      boss: 'heart', bubbles: 3, shardTiles: 4 },
  ],

  mercifulDensity: 0.85,   // monster count multiplier in Merciful mode

  shamanBuffCap: 3,        // max +pwr a single monster can gain from spores
};

root.DS_CONFIG = CFG;
})(typeof globalThis !== 'undefined' ? globalThis : this);
