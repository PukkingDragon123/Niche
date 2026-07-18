/* ============================================================
   DUNGEON SWEEPER — ENGINE
   Pure game logic. No DOM access — communicates via DS.Bus
   events so the UI/FX/audio layers can react. Testable in Node.
   ============================================================ */
(function (root) {
'use strict';

const C = root.DS_CONFIG;

/* ---------- tiny event bus ---------- */
const Bus = {
  handlers: {},
  on(type, fn) { (this.handlers[type] = this.handlers[type] || []).push(fn); return fn; },
  off(type, fn) { const h = this.handlers[type]; if (h) { const i = h.indexOf(fn); if (i >= 0) h.splice(i, 1); } },
  emit(type, data) {
    (this.handlers[type] || []).slice().forEach(fn => fn(data));
    (this.handlers['*'] || []).slice().forEach(fn => fn(type, data));
  },
  clear() { this.handlers = {}; },
};

/* ---------- seedable rng ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let rng = mulberry32(0xC0FFEE);
const rand = () => rng();
const randInt = (n) => Math.floor(rng() * n);
const pick = (arr) => arr[randInt(arr.length)];
const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

const SHARD_IDS = ['goo', 'bone', 'zap', 'ink', 'bolt'];
const ING_IDS = ['button', 'spring', 'googly', 'fluff', 'star'];

/* ---------- state ---------- */
let S = null;

function freshState() {
  return {
    phase: 'menu',            // menu | playing | floorEnd | gameover | victory
    merciful: false,
    seed: 0,
    floor: 0,                 // 1-based
    hp: 0, maxHp: 0, block: 0,
    energy: 0,
    energyBank: 0,            // ⚡ won at the slot machine, paid out next floor
    xp: 0, level: 1,
    frags: { goo: 0, bone: 0, zap: 0, ink: 0, bolt: 0 },   // monster shards
    ing: { button: 0, spring: 0, googly: 0, fluff: 0, star: 0 }, // bubble ingredients
    deck: [],                 // [{id, tier}]
    relics: [],
    board: null,              // {w,h,tiles[]}
    placed: false,            // monsters placed after first click
    clicks: 0,                // dungeon clock (this floor)
    bootsUsed: false,
    exhausted: {},            // cardId -> true (this floor)
    pendingRelicChoice: null, // {offers:[relicId]}
    pendingCraft: null,       // creature id awaiting a squad slot (workshop)
    workshop: null,           // {offers:[id], snackUsed, napped}
    lift: null,               // {reels:[sym], spun:false} — the slot machine
    stats: { kills: 0, shardsEarned: 0, clicksTotal: 0, ambushes: 0, bubbles: 0 },
    bossTile: null,
  };
}

/* ---------- helpers ---------- */
const floorCfg = () => C.floors[S.floor - 1];
const tiles = () => S.board.tiles;
const tileAt = (x, y) => (x < 0 || y < 0 || x >= S.board.w || y >= S.board.h) ? null : S.board.tiles[y * S.board.w + x];

function neighbors(t, radius = 1) {
  const out = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const n = tileAt(t.x + dx, t.y + dy);
      if (n) out.push(n);
    }
  return out;
}
function areaTiles(t, radius) {
  const out = [];
  for (let dy = -radius; dy <= radius; dy++)
    for (let dx = -radius; dx <= radius; dx++) {
      const n = tileAt(t.x + dx, t.y + dy);
      if (n) out.push(n);
    }
  return out;
}

function hasRelic(id) { return S.relics.includes(id); }
function maxEnergy() { return C.player.maxEnergy + (hasRelic('stormring') ? 3 : 0); }
function areaRadius(def) { return (def.radius || 1) + (hasRelic('lantern') ? 1 : 0); }

function monsterContribution(m) {
  if (!m) return 0;
  if (m.disguised) return 0;                                // mimics pretending to be furniture
  const type = C.monsters[m.type];
  if (type.ethereal && !hasRelic('ghostglass')) return 0;   // spooks leave no trace
  return m.pwr;
}

function numberAt(t) {
  let sum = 0;
  for (const n of neighbors(t)) sum += monsterContribution(n.monster);
  return sum;
}

/* a revealed tile shows a number when it's plain ground (or spent loot) */
function showsNumber(t) {
  if (!t.revealed || t.monster || t.rubble) return false;
  if (t.kind === 'empty') return true;
  if (t.kind === 'shards' && t.collected) return true;
  if (t.kind === 'bubble' && t.opened) return true;
  return false; // the lift, unpopped bubbles & uncollected shards show icons
}

function aliveMonsters() { return tiles().filter(t => t.monster); }
function aliveCountByType() {
  const map = {};
  for (const t of tiles()) if (t.monster) map[t.monster.type] = (map[t.monster.type] || 0) + 1;
  return map;
}
function hiddenCandidates() {
  return tiles().filter(t => !t.revealed && !t.monster && t.kind === 'empty' && !t.rubble);
}

function gainEnergy(n) {
  const before = S.energy;
  S.energy = Math.min(maxEnergy(), S.energy + n);
  if (S.energy !== before) Bus.emit('energy', { energy: S.energy, gained: S.energy - before });
  return S.energy - before;
}
function spendEnergy(n) {
  S.energy = Math.max(0, S.energy - n);
  Bus.emit('energy', { energy: S.energy, spent: n });
}

/* ---------- the clay economy ---------- */
function gainShards(color, n, at) {
  if (!SHARD_IDS.includes(color) || n <= 0) return;
  S.frags[color] += n;
  S.stats.shardsEarned += n;
  Bus.emit('shards', { color, gained: n, total: S.frags[color], at });
}
function totalShards() { return SHARD_IDS.reduce((s, c) => s + S.frags[c], 0); }
function spendAnyShards(n) {
  // snack money: eat from the biggest piles first
  let left = n;
  while (left > 0) {
    const biggest = SHARD_IDS.reduce((a, b) => (S.frags[a] >= S.frags[b] ? a : b));
    if (S.frags[biggest] <= 0) break;
    S.frags[biggest]--; left--;
  }
  Bus.emit('shards', { color: null, gained: -(n - left), at: null });
  return left === 0;
}
function gainIngredient(kind, n, at) {
  if (!ING_IDS.includes(kind) || n <= 0) return;
  S.ing[kind] += n;
  Bus.emit('ingredients', { kind, gained: n, total: S.ing[kind], at });
}
function canAfford(recipe) {
  for (const [c, n] of Object.entries(recipe.shards || {})) if (S.frags[c] < n) return false;
  for (const [k, n] of Object.entries(recipe.ing || {})) if (S.ing[k] < n) return false;
  return true;
}
function payRecipe(recipe) {
  for (const [c, n] of Object.entries(recipe.shards || {})) S.frags[c] -= n;
  for (const [k, n] of Object.entries(recipe.ing || {})) S.ing[k] -= n;
  Bus.emit('shards', { color: null, gained: 0, at: null }); // nudge the HUD
}
function primaryShard(cardId) {
  const r = C.cards[cardId].recipe;
  const entries = Object.entries(r.shards || {});
  if (!entries.length) return 'goo';
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0][0];
}

function gainXp(n, at) {
  S.xp += n;
  Bus.emit('xp', { xp: S.xp, gained: n, at });
  let need = xpNeeded();
  while (S.xp >= need) {
    S.xp -= need;
    S.level++;
    S.maxHp += C.player.levelHpGain;
    const heal = hasRelic('bloodvial') ? S.maxHp : Math.min(S.maxHp, S.hp + C.player.levelHeal);
    S.hp = hasRelic('bloodvial') ? S.maxHp : heal;
    Bus.emit('levelup', { level: S.level, maxHp: S.maxHp, hp: S.hp });
    need = xpNeeded();
  }
}
function xpNeeded() { return C.player.xpBase + C.player.xpStep * (S.level - 1); }

function hurtPlayer(amount, source) {
  let dmg = amount;
  if (S.block > 0) {
    const soaked = Math.min(S.block, dmg);
    S.block -= soaked; dmg -= soaked;
    Bus.emit('blocked', { soaked, blockLeft: S.block });
  }
  if (dmg > 0) {
    S.hp -= dmg;
    Bus.emit('playerHurt', { dmg, hp: S.hp, source });
    if (S.hp <= 0) { S.hp = 0; die(source); return true; }
  }
  return false;
}

function die(source) {
  S.phase = 'gameover';
  Bus.emit('death', { source, stats: S.stats, floor: S.floor, level: S.level });
}

function toast(msg, kind) { Bus.emit('toast', { msg, kind: kind || 'info' }); }

/* ============================================================
   FLOOR SETUP
   ============================================================ */
function setupFloor() {
  const f = floorCfg();
  const board = { w: f.w, h: f.h, tiles: [] };
  for (let y = 0; y < f.h; y++)
    for (let x = 0; x < f.w; x++)
      board.tiles.push({
        x, y, kind: 'empty', monster: null,
        revealed: false, opened: false, collected: false,
        web: false, rubble: false, mark: 0, scry: null, corpse: null,
      });
  S.board = board;
  S.placed = false;
  S.clicks = 0;
  S.energy = Math.min(maxEnergy(), C.player.startEnergy + (S.merciful ? 1 : 0) + S.energyBank);
  if (S.energyBank) toast(`🔋 The Lift's battery pays out +${S.energyBank}⚡!`, 'good');
  S.energyBank = 0;
  S.exhausted = {};
  S.bootsUsed = false;
  S.bossTile = null;
  S.block = 0;
  S.lift = null;
  Bus.emit('floorStart', { floor: S.floor, cfg: f });
}

function placeBoard(sx, sy) {
  const f = floorCfg();
  const protect = new Set();
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const t = tileAt(sx + dx, sy + dy);
      if (t) protect.add(t);
    }

  let free = shuffle(tiles().filter(t => !protect.has(t)));
  const take = () => free.pop();

  // the Lucky Lift — prefer far from the starting click
  free.sort((a, b) => (Math.hypot(a.x - sx, a.y - sy)) - (Math.hypot(b.x - sx, b.y - sy)));
  const farHalf = free.slice(Math.floor(free.length / 2));
  const lift = farHalf[randInt(farHalf.length)];
  lift.kind = 'lift';
  free = shuffle(free.filter(t => t !== lift));

  for (let i = 0; i < f.bubbles; i++) { const t = take(); if (t) t.kind = 'bubble'; }
  for (let i = 0; i < f.shardTiles; i++) {
    const t = take();
    if (t) {
      t.kind = 'shards';
      t.shardColor = pick(SHARD_IDS);
      t.shardAmt = C.economy.shardTileMin + randInt(C.economy.shardTileMax - C.economy.shardTileMin + 1);
    }
  }

  const density = S.merciful ? C.mercifulDensity : 1;
  const spawnList = [];
  for (const [type, count] of Object.entries(f.roster)) {
    const n = Math.max(1, Math.round(count * density));
    for (let i = 0; i < n; i++) spawnList.push(type);
  }
  if (f.elite) spawnList.push(f.elite);
  if (f.boss) spawnList.push(f.boss);

  for (const type of shuffle(spawnList)) {
    const t = take();
    if (!t) break;
    spawnMonster(t, type);
    if (C.monsters[type].boss) S.bossTile = t;
  }

  S.placed = true;
  Bus.emit('boardPlaced', { bestiary: bestiary() });

  if (hasRelic('compass')) {
    const ew = lift.x < S.board.w / 2 ? 'WEST' : 'EAST';
    const ns = lift.y < S.board.h / 2 ? 'NORTH' : 'SOUTH';
    Bus.emit('compass', { hint: ns + '-' + ew });
  }
}

function spawnMonster(t, type) {
  const def = C.monsters[type];
  t.scry = null; // whatever was peeked here is no longer true
  t.monster = {
    type, pwr: def.pwr, basePwr: def.pwr,
    exposed: false, disguised: !!def.disguise,
    buffs: 0, webbedDone: false,
    damagedSinceTick: false,
  };
  return t.monster;
}

function bestiary() {
  const counts = aliveCountByType();
  const seen = Object.keys(floorCfg().roster).slice();
  if (floorCfg().elite) seen.push(floorCfg().elite);
  if (floorCfg().boss) seen.push(floorCfg().boss);
  for (const k of Object.keys(counts)) if (!seen.includes(k)) seen.push(k);
  return seen.map(type => ({ type, count: counts[type] || 0, def: C.monsters[type] }));
}

/* ============================================================
   REVEALING
   ============================================================ */
function revealFlood(start, opts) {
  const gain = opts && opts.energy;
  const batch = [];
  const queue = [start];
  const seen = new Set([start]);
  while (queue.length) {
    const t = queue.shift();
    if (t.revealed || t.rubble) continue;
    if (t.monster) {
      // disguised mimics surface as innocent "bubbles" just like the real thing
      if (t.monster.disguised) {
        t.revealed = true;
        t.web = false; t.mark = 0; // scry marks stay — they see the truth
        batch.push({ t, energyGained: gain ? gainEnergy(1) : 0 });
      }
      continue; // never expand through a monster
    }
    t.revealed = true;
    t.web = false;
    t.scry = null; t.mark = 0;
    let energyGained = 0;
    if (t.kind === 'shards' && !t.collected) {
      t.collected = true;
      gainShards(t.shardColor || 'goo', t.shardAmt || 2, t);
    }
    if (gain) energyGained = gainEnergy(1);
    batch.push({ t, energyGained });
    // expand through open ground with zero threat
    const expandable = (t.kind === 'empty') ||
      (t.kind === 'shards' && t.collected) ||
      (t.kind === 'bubble' && t.opened);
    if (expandable && numberAt(t) === 0) {
      for (const n of neighbors(t)) {
        if (!n.revealed && (!n.monster || n.monster.disguised) && !n.web && !n.rubble && !seen.has(n)) {
          seen.add(n); queue.push(n);
        }
      }
    }
  }
  if (batch.length) Bus.emit('reveal', { batch, manual: !!gain });
  return batch;
}

function exposeQuiet(t) {
  // uncover a monster without triggering its attack
  const m = t.monster;
  if (!m || m.exposed) return;
  m.exposed = true;
  t.revealed = true;
  t.scry = null; t.mark = 0;
  Bus.emit('expose', { t, monster: m });
  afterExposure(t);
  Bus.emit('numbersChanged', {});
}

function afterExposure(t) {
  const m = t.monster;
  if (!m) return;
  m.disguised = false;
  if (m.type === 'spider' && !m.webbedDone) {
    m.webbedDone = true;
    const webbed = [];
    for (const n of neighbors(t)) {
      if (!n.revealed && !n.monster && Math.abs(n.x - t.x) + Math.abs(n.y - t.y) === 1) {
        n.web = true; webbed.push(n);
      }
    }
    if (webbed.length) { Bus.emit('webbed', { tiles: webbed, spider: t }); toast('The Widow spins her sticky web!', 'bad'); }
  }
}

function ambush(t) {
  const m = t.monster;
  m.exposed = true;
  t.revealed = true;
  t.scry = null; t.mark = 0;
  m.disguised = false;
  S.stats.ambushes++;
  let dmg = m.pwr;
  if (hasRelic('boots') && !S.bootsUsed) {
    S.bootsUsed = true;
    dmg = Math.max(1, dmg - 3);
    toast('🫧 Bubble Wrap softens the blow!', 'good');
  }
  Bus.emit('ambush', { t, monster: m, dmg });
  afterExposure(t);
  const died = hurtPlayer(dmg, C.monsters[m.type].name);
  Bus.emit('numbersChanged', {});
  return died;
}

/* ============================================================
   KILLING & DAMAGE
   ============================================================ */
function killMonster(t, cause) {
  const m = t.monster;
  const def = C.monsters[m.type];
  t.monster = null;
  t.corpse = m.type;
  t.revealed = true;
  S.stats.kills++;

  if (cause !== 'midas') gainXp(m.basePwr, t);
  let shards = Math.ceil(m.basePwr / 2) + (hasRelic('luckycoin') ? 1 : 0);
  if (cause === 'midas') shards = m.basePwr * 3 + (hasRelic('luckycoin') ? 1 : 0);
  gainShards(def.frag || 'goo', shards, t);

  Bus.emit('kill', { t, type: m.type, def, cause });

  if (m.type === 'slime' && cause === 'card') {
    const spots = shuffle(hiddenCandidates()).slice(0, 2);
    for (const s of spots) spawnMonster(s, 'slimeling');
    if (spots.length) {
      toast(`The Gloop Cloud bursts! ${spots.length} Gloopdrop${spots.length > 1 ? 's' : ''} rain into the dark…`, 'bad');
      Bus.emit('split', { count: spots.length });
    }
  }

  if (def.elite) dropRelic(t, 1);
  if (def.boss) {
    dropRelic(t, 2);
    toast(`${def.name} is squished! The Lucky Lift whirrs back to life.`, 'good');
    Bus.emit('bossDead', { type: m.type });
  }

  Bus.emit('numbersChanged', {});
  Bus.emit('bestiary', { bestiary: bestiary() });
}

function dropRelic(t, count) {
  const unowned = Object.keys(C.relics).filter(r => !S.relics.includes(r));
  if (!unowned.length) { gainShards(pick(SHARD_IDS), 10, t); return; }
  const offers = shuffle(unowned).slice(0, count);
  if (offers.length === 1) {
    S.relics.push(offers[0]);
    Bus.emit('relicGain', { id: offers[0], def: C.relics[offers[0]] });
  } else {
    S.pendingRelicChoice = { offers };
    Bus.emit('relicChoice', { offers: offers.map(id => ({ id, def: C.relics[id] })) });
  }
}

function pickRelic(i) {
  // trinkets drop mid-floor (elites/bosses) AND at the slot machine (floorEnd)
  if (!S.pendingRelicChoice || (S.phase !== 'playing' && S.phase !== 'floorEnd')) return;
  const id = S.pendingRelicChoice.offers[i];
  if (!id) return;
  S.relics.push(id);
  S.pendingRelicChoice = null;
  Bus.emit('relicGain', { id, def: C.relics[id] });
}

function damageMonster(t, dmg, cause) {
  const m = t.monster;
  if (!m) return { killed: false, dmg: 0 };
  const def = C.monsters[m.type];
  let final = dmg;
  if (def.brittle) final *= 2;
  const wasHidden = !m.exposed;
  m.pwr -= final;
  m.damagedSinceTick = true;
  if (m.pwr <= 0) {
    if (wasHidden) { m.exposed = true; t.revealed = true; m.disguised = false; }
    Bus.emit('monsterHit', { t, dmg: final, killed: true });
    killMonster(t, cause || 'card');
    return { killed: true, dmg: final };
  }
  Bus.emit('monsterHit', { t, dmg: final, killed: false });
  if (wasHidden) exposeQuiet(t); else Bus.emit('numbersChanged', {});
  return { killed: false, dmg: final };
}

/* ============================================================
   THE DUNGEON CLOCK (ability ticks)
   ============================================================ */
function tickClock() {
  S.clicks++;
  S.stats.clicksTotal++;
  const T = C.ticks;

  if (S.clicks % T.bat === 0) {
    const bats = tiles().filter(t => t.monster && t.monster.type === 'bat' && !t.monster.exposed);
    if (bats.length) {
      let moved = 0;
      for (const t of bats) moved += moveMonster(t) ? 1 : 0;
      if (moved) { toast('🐱 The Napcats flap to new perches…', 'warn'); Bus.emit('batsMoved', { count: moved }); Bus.emit('numbersChanged', {}); }
    }
  }
  if (S.clicks % T.ghost === 0) {
    const ghosts = tiles().filter(t => t.monster && t.monster.type === 'ghost' && !t.monster.exposed);
    if (ghosts.length) {
      let moved = 0;
      for (const t of ghosts) moved += moveMonster(t) ? 1 : 0;
      if (moved) {
        toast('👻 A cold little draft giggles through the halls…', 'warn');
        Bus.emit('ghostsDrift', { count: moved });
        Bus.emit('numbersChanged', {}); // scry marks expired + X-Ray Specs numbers
      }
    }
  }
  if (S.clicks % T.shaman === 0) {
    const shamans = tiles().filter(t => t.monster && t.monster.type === 'shaman');
    let buffed = 0;
    for (const st of shamans) {
      for (const n of neighbors(st)) {
        const m = n.monster;
        if (m && m !== st.monster && m.buffs < C.shamanBuffCap) {
          m.pwr++; m.buffs++; buffed++;
        }
      }
    }
    if (buffed) {
      toast(`🍄 Sporecap puffs! ${buffed} monster${buffed > 1 ? 's' : ''} swell${buffed > 1 ? '' : 's'} with spores!`, 'bad');
      Bus.emit('ritual', { buffed });
      Bus.emit('numbersChanged', {});
    }
  }
  if (S.clicks % T.colossus === 0 && S.bossTile && S.bossTile.monster && S.bossTile.monster.type === 'colossus') {
    const m = S.bossTile.monster;
    if (m.damagedSinceTick) {
      m.damagedSinceTick = false;
      toast('👑 You staggered the Gunk King — his tantrum fizzles!', 'good');
    } else {
      const spots = tiles().filter(t => t.revealed && !t.monster && !t.rubble && t.kind === 'empty' && !(t.x === S.bossTile.x && t.y === S.bossTile.y));
      if (spots.length) { const s = pick(spots); s.rubble = true; Bus.emit('rubble', { t: s }); }
      Bus.emit('bossRage', { type: 'colossus' });
      toast('👑 THE GUNK KING THROWS A TANTRUM! Gunk splatters everywhere!', 'bad');
      hurtPlayer(C.bossRules.colossusHit, 'The Gunk King');
      Bus.emit('numbersChanged', {});
    }
  }
  if (S.clicks % T.heart === 0 && S.bossTile && S.bossTile.monster && S.bossTile.monster.type === 'heart') {
    const m = S.bossTile.monster;
    const spot = shuffle(hiddenCandidates())[0];
    if (spot) spawnMonster(spot, C.bossRules.heartSpawn);
    if (m.pwr < m.basePwr + m.buffs) m.pwr += C.bossRules.heartRegen;
    toast('🎪 The Toybox King decrees… something scurries in the dark.', 'bad');
    Bus.emit('bossRage', { type: 'heart' });
    Bus.emit('numbersChanged', {});
    Bus.emit('bestiary', { bestiary: bestiary() });
  }
  Bus.emit('clock', { clicks: S.clicks, omens: omens() });
}

function moveMonster(t) {
  const spots = hiddenCandidates();
  if (!spots.length) return false;
  const dest = pick(spots);
  dest.monster = t.monster;
  t.monster = null;
  t.scry = null; dest.scry = null;
  return true;
}

function omens() {
  const counts = aliveCountByType();
  const out = [];
  const add = (type, tick, hidden) => {
    if (!counts[type]) return;
    if (hidden) {
      const anyHidden = tiles().some(t => t.monster && t.monster.type === type && !t.monster.exposed);
      if (!anyHidden) return;
    }
    out.push({ type, inClicks: tick - (S.clicks % tick), emoji: C.monsters[type].emoji });
  };
  add('bat', C.ticks.bat, true);
  add('ghost', C.ticks.ghost, true);
  add('shaman', C.ticks.shaman, false);
  add('colossus', C.ticks.colossus, false);
  add('heart', C.ticks.heart, false);
  return out;
}

/* ============================================================
   CLICKS
   ============================================================ */
function clickTile(x, y, confirmed) {
  if (S.phase !== 'playing' || S.pendingRelicChoice) return { ok: false };
  const t = tileAt(x, y);
  if (!t) return { ok: false };

  if (!S.placed) placeBoard(x, y);

  if (t.rubble) { toast('Buried in gunk. Snorkle or Brew can mop it up.', 'warn'); return { ok: false }; }

  /* ----- hidden tile ----- */
  if (!t.revealed) {
    if (t.web) {
      if (S.energy >= 1) spendEnergy(1);
      else {
        // drained? the webs take their toll in blood instead — never a softlock
        toast('No ⚡ left — the webs sting your hands as you tear through! (-1 HP)', 'bad');
        const died = hurtPlayer(1, 'the sticky webs');
        if (died) return { ok: true };
      }
      t.web = false;
      Bus.emit('webTorn', { t });
    }
    if (t.monster && !t.monster.disguised) {
      const died = ambush(t);
      if (!died) tickClock();
      return { ok: true, ambush: true };
    }
    if (t.monster && t.monster.disguised) {
      // a mimic pretending to be a bubble — reveals "as" a bubble (scry marks persist: they saw the truth)
      t.revealed = true; t.mark = 0;
      const gained = gainEnergy(1);
      Bus.emit('reveal', { batch: [{ t, energyGained: gained }], manual: true });
      tickClock();
      return { ok: true };
    }
    revealFlood(t, { energy: true });
    tickClock();
    if (t.kind === 'lift') Bus.emit('liftFound', { t });
    return { ok: true };
  }

  /* ----- revealed tile ----- */
  if (t.monster && t.monster.disguised) {
    // popping the "bubble"… surprise!
    toast('THE BUBBLE HAS TEETH! It’s a MIMIC!', 'bad');
    Bus.emit('mimic', { t });
    const died = ambush(t);
    if (!died) tickClock();
    return { ok: true, mimic: true };
  }

  if (t.monster && t.monster.exposed) return bump(t, confirmed);

  if (t.kind === 'bubble' && !t.opened) { popBubble(t); tickClock(); return { ok: true, bubble: true }; }

  if (t.kind === 'lift') return boardLift(t);

  return { ok: false };
}

function bump(t, confirmed) {
  const m = t.monster;
  const def = C.monsters[m.type];
  if (def.unbumpable) {
    toast('Your hands bounce off its royal squish — only CREATURES can dethrone it!', 'warn');
    return { ok: false, unbumpable: true };
  }
  const effective = Math.max(0, m.pwr - S.block);
  if (effective >= S.hp && !confirmed) {
    Bus.emit('lethalWarn', { t, dmg: m.pwr });
    return { ok: false, needsConfirm: true, dmg: m.pwr };
  }
  Bus.emit('bump', { t, monster: m, dmg: m.pwr });
  const died = hurtPlayer(m.pwr, def.name + ' (you charged in)');
  if (!died) {
    killMonster(t, 'bump');
    tickClock();
  }
  return { ok: true, bumped: true };
}

/* right-click chalk notes */
function markTile(x, y) {
  const t = tileAt(x, y);
  if (!t || t.revealed || S.phase !== 'playing') return;
  t.mark = (t.mark + 1) % 3; // 0 none, 1 skull, 2 question
  Bus.emit('mark', { t });
}

/* ============================================================
   BUBBLES (ingredients live inside)
   ============================================================ */
function popBubble(t) {
  t.opened = true;
  S.stats.bubbles++;
  const got = [];
  for (let i = 0; i < C.economy.bubbleIngredients; i++) {
    const kind = pick(ING_IDS);
    gainIngredient(kind, 1, t);
    got.push({ ing: kind });
  }
  if (rand() < C.economy.bubbleShardChance) {
    const color = pick(SHARD_IDS);
    gainShards(color, 2, t);
    got.push({ shard: color, n: 2 });
  }
  Bus.emit('bubblePopped', { t, got });
}

/* ============================================================
   CRAFTING / SQUAD
   ============================================================ */
function rollCardId(excluded) {
  const rare = C.rarityWeights.rare + C.rareFloorBonus * S.floor;
  const weights = { common: C.rarityWeights.common, uncommon: C.rarityWeights.uncommon, rare };
  const pool = Object.entries(C.cards).filter(([id]) => !(excluded || []).includes(id));
  const total = pool.reduce((s, [, d]) => s + weights[d.rarity], 0);
  let r = rand() * total;
  for (const [id, d] of pool) {
    r -= weights[d.rarity];
    if (r <= 0) return id;
  }
  return pool[pool.length - 1][0];
}

function deckIndexOf(id) { return S.deck.findIndex(c => c.id === id); }

/* creatures that can actually hurt the Toybox King — never lose the last one */
const WEAPON_IDS = ['slash', 'dagger', 'bow', 'whirlwind', 'fireball', 'chain'];
function weaponCount() { return S.deck.filter(c => WEAPON_IDS.includes(c.id)).length; }

function acquireCard(id) {
  const existing = deckIndexOf(id);
  if (existing >= 0) {
    const card = S.deck[existing];
    if (card.tier === 1) {
      card.tier = 2;
      Bus.emit('cardUpgraded', { id, index: existing });
      return { upgraded: true };
    }
    gainShards(primaryShard(id), C.economy.dupMeltShards, null);
    toast(`Already mastered — melted into ${C.economy.dupMeltShards} shards.`, 'info');
    return { sold: true };
  }
  if (S.deck.length >= C.player.deckCap) return { needsSlot: true };
  S.deck.push({ id, tier: 1 });
  Bus.emit('cardGained', { id, index: S.deck.length - 1 });
  return { added: true };
}

/* ============================================================
   PLAYING CREATURES
   ============================================================ */
function scryTile(t, force) {
  if (!t) return;
  if (t.revealed && !(t.monster && t.monster.disguised)) return; // nothing hidden here
  if (t.scry && !force) return;
  let what = 'empty';
  if (t.monster) what = t.monster.type;
  else if (t.kind !== 'empty') what = t.kind;
  t.scry = what;
  Bus.emit('scryed', { t, what });
}

function cardCost(card) {
  const def = C.cards[card.id];
  let cost = def.cost[card.tier - 1];
  // min 1: a free repeatable creature would let you ignore the dungeon clock forever
  if (card.id === 'bow' && hasRelic('quiver')) cost = Math.max(1, cost - 1);
  return cost;
}
function cardVal(card) {
  const def = C.cards[card.id];
  let v = def.vals[card.tier - 1];
  if (['slash', 'dagger', 'whirlwind'].includes(card.id) && hasRelic('whetstone')) v += 1;
  if (card.id === 'bow' && hasRelic('quiver')) v += 1;
  return v;
}

function canPlay(deckIdx) {
  const card = S.deck[deckIdx];
  if (!card) return { ok: false, why: 'no card' };
  const def = C.cards[card.id];
  if (S.phase !== 'playing' || S.pendingRelicChoice) return { ok: false, why: 'busy' };
  if (def.exhaust && S.exhausted[card.id]) return { ok: false, why: 'exhausted' };
  if (S.energy < cardCost(card)) return { ok: false, why: 'energy' };
  if (!S.placed) return { ok: false, why: 'unplaced' };
  return { ok: true };
}

function validTarget(deckIdx, t) {
  const card = S.deck[deckIdx];
  if (!card || !t) return false;
  const def = C.cards[card.id];
  switch (def.target) {
    case 'none': return true;
    case 'exposed':
      if (!(t.monster && t.monster.exposed && !t.monster.disguised)) return false;
      if (card.id === 'relocate' && (C.monsters[t.monster.type].boss || C.monsters[t.monster.type].elite)) return false;
      if (card.id === 'relocate' && !hiddenCandidates().length) return false; // nowhere to abduct to
      if (card.id === 'midas' && t.monster.pwr > cardVal(card)) return false;
      return true;
    case 'shoot':
      if (t.rubble) return false;
      if (!t.revealed) return true;                                    // blind shot
      if (t.monster && t.monster.exposed) return true;                 // finish it
      if (t.monster && t.monster.disguised) return true;               // hidden mimic "bubble"
      if (t.kind === 'bubble' && !t.opened) return true;               // test a bubble
      return false;
    case 'hidden': return !t.revealed && !t.rubble;
    case 'area': return true;
    default: return false;
  }
}

function validTargets(deckIdx) {
  const card = S.deck[deckIdx];
  if (!card) return [];
  const def = C.cards[card.id];
  if (def.target === 'none') return [];
  return tiles().filter(t => validTarget(deckIdx, t));
}

function playCard(deckIdx, tx, ty) {
  const chk = canPlay(deckIdx);
  if (!chk.ok) return chk;
  const card = S.deck[deckIdx];
  const def = C.cards[card.id];
  let t = null;
  if (def.target !== 'none') {
    t = tileAt(tx, ty);
    if (!validTarget(deckIdx, t)) return { ok: false, why: 'target' };
  }

  spendEnergy(cardCost(card));
  if (def.exhaust) S.exhausted[card.id] = true;
  const v = cardVal(card);
  Bus.emit('cardPlayed', { id: card.id, tier: card.tier, t });

  switch (card.id) {
    case 'slash':
    case 'dagger':
      damageMonster(t, v, 'card');
      break;

    case 'bow': {
      if (!t.revealed && !t.monster) {
        toast('Boombo’s shot bonks on clay — the tile was empty.', 'info');
        Bus.emit('arrowMiss', { t });
        revealFlood(t, { energy: false });
      } else if (t.monster) {
        if (t.monster.disguised) toast('The "bubble" SHRIEKS — a MIMIC!', 'bad');
        damageMonster(t, v, 'card');
      } else if (t.kind === 'bubble' && !t.opened) {
        toast('Boing. Just an honest, wobbly bubble.', 'info');
        Bus.emit('arrowMiss', { t });
      }
      break;
    }

    case 'torch': {
      const r = areaRadius(def);
      const area = areaTiles(t, r);
      for (const a of area) {
        if (a.monster && !a.monster.exposed && !a.monster.disguised) exposeQuiet(a);
        else if (a.monster && a.monster.disguised && !a.revealed) { a.revealed = true; Bus.emit('reveal', { batch: [{ t: a, energyGained: 0 }], manual: false }); }
        else if (!a.monster && !a.revealed && !a.rubble) { if (a.web) { a.web = false; Bus.emit('webTorn', { t: a }); } revealFlood(a, { energy: false }); }
        if (card.tier === 2 && a.monster && a.monster.exposed) damageMonster(a, v, 'card');
      }
      Bus.emit('torchLit', { t, radius: r });
      break;
    }

    case 'heal':
      S.hp = Math.min(S.maxHp, S.hp + v);
      Bus.emit('healed', { amount: v, hp: S.hp });
      break;

    case 'excavate':
      if (t.web) { t.web = false; Bus.emit('webTorn', { t }); }
      if (t.monster) {
        if (t.monster.disguised) { t.revealed = true; Bus.emit('reveal', { batch: [{ t, energyGained: 0 }], manual: false }); }
        else exposeQuiet(t);
      } else revealFlood(t, { energy: false });
      if (card.tier === 2) for (const n of neighbors(t)) scryTile(n);
      break;

    case 'ward':
      S.block += v;
      Bus.emit('warded', { block: S.block });
      break;

    case 'relocate': {
      const m = t.monster;
      const moved = moveMonster(t);
      if (moved) {
        m.exposed = false;
        if (C.monsters[m.type].disguise) m.disguised = true;
        t.revealed = true;
        toast('Zorp beams the monster back into the dark…', 'good');
        Bus.emit('relocated', { from: t });
        Bus.emit('numbersChanged', {});
      } else toast('Nowhere left to beam it to!', 'warn');
      break;
    }

    case 'scry': {
      scryTile(t, true);
      if (card.tier === 2)
        for (const n of neighbors(t))
          if (Math.abs(n.x - t.x) + Math.abs(n.y - t.y) === 1) scryTile(n);
      break;
    }

    case 'whirlwind': {
      const targetsNow = tiles().filter(x => x.monster && x.monster.exposed && !x.monster.disguised);
      for (const x of targetsNow) damageMonster(x, v, 'card');
      Bus.emit('whirl', { count: targetsNow.length });
      break;
    }

    case 'purify': {
      const r = areaRadius(def);
      const area = areaTiles(t, r);
      let cleansed = 0;
      for (const a of area) {
        if (a.web) { a.web = false; cleansed++; Bus.emit('webTorn', { t: a }); }
        if (a.rubble) { a.rubble = false; cleansed++; Bus.emit('rubbleCleared', { t: a }); }
        if (a.monster && C.monsters[a.monster.type].ethereal) damageMonster(a, v, 'card');
      }
      Bus.emit('purified', { t, radius: r, cleansed });
      break;
    }

    case 'fireball': {
      const r = areaRadius(def);
      const area = areaTiles(t, r);
      for (const a of area) {
        if (a.rubble) { a.rubble = false; Bus.emit('rubbleCleared', { t: a }); }
        if (a.web) { a.web = false; Bus.emit('webTorn', { t: a }); }
        if (a.monster) damageMonster(a, v, 'card');
        else if (!a.revealed) revealFlood(a, { energy: false });
      }
      Bus.emit('fireballHit', { t, radius: r });
      break;
    }

    case 'chain': {
      const arcDmg = def.arc[card.tier - 1];
      const around = neighbors(t).filter(n => n.monster);
      damageMonster(t, v, 'card');
      for (const n of around) if (n.monster) damageMonster(n, arcDmg, 'card');
      Bus.emit('chainHit', { t, arcs: around.length });
      break;
    }

    case 'midas':
      damageMonster(t, 9999, 'midas');
      Bus.emit('midasHit', { t });
      break;

    case 'focus':
      gainEnergy(v);
      break;

    case 'divination': {
      let found = 0;
      for (const x of tiles()) {
        if (x.monster && !x.monster.exposed) {
          const d = C.monsters[x.monster.type];
          if (d.ethereal || d.disguise) { x.scry = x.monster.type; found++; Bus.emit('scryed', { t: x, what: x.monster.type }); }
        }
      }
      toast(found ? `The 3D glasses reveal ${found} lurking sneak${found > 1 ? 's' : ''}!` : 'The glasses show nothing… the floor holds no tricksters.', found ? 'good' : 'info');
      break;
    }
  }

  Bus.emit('handChanged', {});
  return { ok: true };
}

/* ============================================================
   THE LUCKY LIFT / FLOOR END / WORKSHOP
   ============================================================ */
function boardLift(t) {
  const f = floorCfg();
  if (f.boss) {
    const bossAlive = tiles().some(x => x.monster && C.monsters[x.monster.type].boss);
    if (bossAlive) {
      toast('⛓️ The Lucky Lift is JAMMED while the boss lives!', 'warn');
      Bus.emit('liftLocked', {});
      return { ok: false, locked: true };
    }
  }
  let seal = 0;
  if (aliveMonsters().length === 0) {
    seal = C.economy.sealBonus;
    gainShards(pick(SHARD_IDS), seal, t);
  }
  S.phase = 'floorEnd';
  buildWorkshop();
  rollLift();
  Bus.emit('floorComplete', { floor: S.floor, seal, last: S.floor >= C.floors.length, stats: S.stats });
  return { ok: true, boarded: true };
}

function rollLiftSymbol() {
  const entries = Object.entries(C.lift.symbols);
  const total = entries.reduce((s, [, d]) => s + d.weight, 0);
  let r = rand() * total;
  for (const [id, d] of entries) {
    r -= d.weight;
    if (r <= 0) return id;
  }
  return entries[entries.length - 1][0];
}

function rollLift() {
  // pre-rolled from the run seed — the lever is theater (the best kind)
  S.lift = { reels: [rollLiftSymbol(), rollLiftSymbol(), rollLiftSymbol()], spun: false };
}

function spinLift() {
  if (!S.lift || S.lift.spun || S.phase !== 'floorEnd') return { ok: false };
  S.lift.spun = true;
  const reels = S.lift.reels;
  const counts = {};
  for (const s of reels) counts[s] = (counts[s] || 0) + 1;
  let symbol = null, kind = 'none';
  for (const [s, n] of Object.entries(counts)) {
    if (n >= 3) { symbol = s; kind = 'triple'; break; }
    if (n >= 2) { symbol = s; kind = 'pair'; }
  }
  const gains = { hp: 0, energy: 0, shards: null, ingredients: [], relic: false };
  if (kind === 'none') {
    const color = pick(SHARD_IDS);
    gainShards(color, C.lift.consolationShards, null);
    gains.shards = { color, n: C.lift.consolationShards };
  } else {
    const pay = C.lift.pay[symbol][kind];
    if (pay.hp) {
      const healed = Math.min(S.maxHp - S.hp, pay.hp);
      S.hp += healed;
      gains.hp = pay.hp;
      Bus.emit('healed', { amount: healed, hp: S.hp });
    }
    if (pay.energy) { S.energyBank += pay.energy; gains.energy = pay.energy; }
    if (pay.shard) { gainShards(symbol, pay.shard, null); gains.shards = { color: symbol, n: pay.shard }; }
    if (pay.ingredients) {
      for (let i = 0; i < pay.ingredients; i++) {
        const k = pick(ING_IDS);
        gainIngredient(k, 1, null);
        gains.ingredients.push(k);
      }
    }
    if (pay.relic) { gains.relic = true; dropRelic(null, 2); }
  }
  Bus.emit('liftSpun', { reels, kind, symbol, gains });
  return { ok: true, reels, kind, symbol, gains };
}

function buildWorkshop() {
  const offers = [];
  // never offer creatures the player has already mastered (tier 2)
  const excluded = S.deck.filter(c => c.tier >= 2).map(c => c.id);
  for (let i = 0; i < 3; i++) {
    const id = rollCardId(excluded.concat(offers));
    offers.push(id);
  }
  S.workshop = { offers, snackUsed: false, napped: false };
  S.pendingCraft = null;
}

function craftOffer(i) {
  const w = S.workshop;
  if (!w || S.phase !== 'floorEnd') return { ok: false };
  const id = w.offers[i];
  if (!id) return { ok: false };
  const recipe = C.cards[id].recipe;
  if (!canAfford(recipe)) return { ok: false, why: 'materials' };
  // deck full? materials are only spent once a slot is chosen
  if (deckIndexOf(id) < 0 && S.deck.length >= C.player.deckCap) {
    S.pendingCraft = id;
    Bus.emit('craftNeedsSlot', { incoming: id });
    return { ok: true, needsSlot: true };
  }
  payRecipe(recipe);
  const res = acquireCard(id);
  w.offers[i] = null; // crafted (or melted) — the mold is spent
  Bus.emit('workshopChanged', {});
  return { ok: true, result: res };
}

function replaceCraft(deckIdx) {
  if (!S.pendingCraft || S.phase !== 'floorEnd') return { ok: false };
  const incoming = S.pendingCraft;
  if (deckIdx < 0 || deckIdx >= S.deck.length) return { ok: false };
  const removed = S.deck[deckIdx].id;
  if (!WEAPON_IDS.includes(incoming) && WEAPON_IDS.includes(removed) && weaponCount() <= 1) {
    toast('That is your last fighter — the dungeon would become unwinnable!', 'warn');
    return { ok: false, why: 'lastWeapon' };
  }
  payRecipe(C.cards[incoming].recipe);
  S.deck[deckIdx] = { id: incoming, tier: 1 };
  const w = S.workshop;
  if (w) { const oi = w.offers.indexOf(incoming); if (oi >= 0) w.offers[oi] = null; }
  S.pendingCraft = null;
  Bus.emit('cardGained', { id: incoming, index: deckIdx, replaced: removed });
  Bus.emit('workshopChanged', {});
  return { ok: true };
}

function cancelCraft() { S.pendingCraft = null; }

function craftSnack() {
  const w = S.workshop;
  if (!w || w.snackUsed || S.phase !== 'floorEnd') return { ok: false };
  if (S.hp >= S.maxHp || totalShards() < C.economy.snackCost) return { ok: false };
  spendAnyShards(C.economy.snackCost);
  w.snackUsed = true;
  S.hp = Math.min(S.maxHp, S.hp + C.economy.snackHeal);
  Bus.emit('healed', { amount: C.economy.snackHeal, hp: S.hp });
  Bus.emit('workshopChanged', {});
  return { ok: true };
}

function recycleCreature(deckIdx) {
  if (!S.workshop || S.phase !== 'floorEnd' || S.deck.length <= 1) return { ok: false };
  if (deckIdx < 0 || deckIdx >= S.deck.length) return { ok: false };
  const card = S.deck[deckIdx];
  if (WEAPON_IDS.includes(card.id) && weaponCount() <= 1) {
    toast('That is your last fighter — the Toybox King would be unbeatable!', 'warn');
    return { ok: false, why: 'lastWeapon' };
  }
  const removed = S.deck.splice(deckIdx, 1)[0];
  gainShards(primaryShard(removed.id), C.economy.recycleRefund, null);
  Bus.emit('cardRemoved', { id: removed.id });
  Bus.emit('workshopChanged', {});
  Bus.emit('handChanged', {});
  return { ok: true };
}

function nap() {
  const w = S.workshop;
  if (!w || w.napped || S.phase !== 'floorEnd') return { ok: false };
  w.napped = true;
  S.hp = Math.min(S.maxHp, S.hp + C.economy.restHeal);
  Bus.emit('healed', { amount: C.economy.restHeal, hp: S.hp });
  Bus.emit('workshopChanged', {});
  return { ok: true };
}

function nextFloor() {
  if (S.phase !== 'floorEnd') return { ok: false };
  if (S.lift && !S.lift.spun) return { ok: false, why: 'spin' }; // the lever is not optional
  if (S.floor >= C.floors.length) {
    S.phase = 'victory';
    Bus.emit('victory', { stats: S.stats, level: S.level });
    return { ok: true, victory: true };
  }
  S.floor++;
  S.phase = 'playing';
  setupFloor();
  return { ok: true };
}

/* ============================================================
   RUN LIFECYCLE
   ============================================================ */
function newRun(opts) {
  opts = opts || {};
  S = freshState();
  S.seed = opts.seed != null ? opts.seed : Math.floor(Math.random() * 0xFFFFFFFF);
  rng = mulberry32(S.seed);
  S.merciful = !!opts.merciful;
  S.maxHp = S.merciful ? C.player.mercifulMaxHp : C.player.maxHp;
  S.hp = S.maxHp;
  S.deck = C.startDeck.map(id => ({ id, tier: 1 }));
  S.floor = 1;
  S.phase = 'playing';
  Bus.emit('runStart', { merciful: S.merciful, seed: S.seed });
  setupFloor();
  return S;
}

function toMenu() { S.phase = 'menu'; Bus.emit('menu', {}); }

/* ---------- public api ---------- */
root.DS = root.DS || {};
root.DS.Bus = Bus;
root.DS.Engine = {
  newRun, toMenu, clickTile, markTile,
  playCard, canPlay, validTargets, validTarget, cardCost, cardVal,
  pickRelic, spinLift,
  craftOffer, replaceCraft, cancelCraft, craftSnack, recycleCreature, nap, nextFloor,
  canAfford, totalShards, primaryShard,
  numberAt, showsNumber, bestiary, omens, tileAt, areaTiles, hasRelic,
  aliveMonsters, xpNeeded, maxEnergy,
  get state() { return S; },
};

})(typeof globalThis !== 'undefined' ? globalThis : this);
