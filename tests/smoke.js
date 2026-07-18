/* ============================================================
   DUNGEON SWEEPER — headless engine smoke test
   Run: node tests/smoke.js
   Loads config+engine into a vm sandbox, then:
     1. god-mode full run → must reach victory
     2. invariant-checked random fuzzing across many seeds
   ============================================================ */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = vm.createContext({ console, Math, JSON });
ctx.globalThis = ctx;
for (const f of ['js/config.js', 'js/engine.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx, { filename: f });
}
const { DS, DS_CONFIG: C } = ctx;
const E = DS.Engine;

const SHARD_IDS = ['goo', 'bone', 'zap', 'ink', 'bolt'];
const ING_IDS = ['button', 'spring', 'googly', 'fluff', 'star'];

let failures = 0;
function fail(msg) { failures++; console.error('  ✗ ' + msg); }
function ok(msg) { console.log('  ✓ ' + msg); }
function assert(cond, msg) { if (!cond) fail(msg); return cond; }

/* collect events for behavioural assertions */
const events = [];
DS.Bus.on('*', (type, data) => events.push({ type, data }));

function giveMaterials(s, n) {
  for (const c of SHARD_IDS) s.frags[c] = n;
  for (const k of ING_IDS) s.ing[k] = n;
}

function checkInvariants(where) {
  const s = E.state;
  if (!s) return;
  if (!(s.hp >= 0 && s.hp <= s.maxHp)) fail(`${where}: hp out of range ${s.hp}/${s.maxHp}`);
  if (!(s.energy >= 0 && s.energy <= E.maxEnergy())) fail(`${where}: energy out of range ${s.energy}`);
  for (const c of SHARD_IDS) if (s.frags[c] < 0) fail(`${where}: negative ${c} shards`);
  for (const k of ING_IDS) if (s.ing[k] < 0) fail(`${where}: negative ${k}`);
  if (s.deck.length > C.player.deckCap) fail(`${where}: deck over cap (${s.deck.length})`);
  if (s.board) {
    for (const t of s.board.tiles) {
      if (t.monster) {
        if (t.monster.pwr <= 0) fail(`${where}: alive monster with pwr ${t.monster.pwr}`);
        if (t.revealed && !t.monster.exposed && !t.monster.disguised)
          fail(`${where}: revealed tile hides an unexposed monster (${t.monster.type})`);
        if (t.monster.exposed && !t.revealed) fail(`${where}: exposed monster on unrevealed tile`);
      }
      if (E.numberAt(t) < 0) fail(`${where}: negative number`);
    }
  }
  if (s.phase === 'gameover' && s.hp !== 0) fail(`${where}: gameover with hp ${s.hp}`);
}

/* config sanity: every monster has a shard color, every card a recipe */
console.log('\n[0] config sanity');
{
  for (const [id, def] of Object.entries(C.monsters)) {
    if (!SHARD_IDS.includes(def.frag)) fail(`monster ${id} has bad frag '${def.frag}'`);
    if (!def.sprite) fail(`monster ${id} has no sprite`);
  }
  for (const [id, def] of Object.entries(C.cards)) {
    if (!def.recipe || !def.recipe.shards) fail(`card ${id} has no recipe`);
    if (!def.sprite) fail(`card ${id} has no sprite`);
    for (const c of Object.keys(def.recipe.shards)) if (!SHARD_IDS.includes(c)) fail(`card ${id} recipe uses bad shard '${c}'`);
    for (const k of Object.keys(def.recipe.ing || {})) if (!ING_IDS.includes(k)) fail(`card ${id} recipe uses bad ingredient '${k}'`);
  }
  // every roster monster exists
  for (const f of C.floors) {
    for (const type of Object.keys(f.roster)) if (!C.monsters[type]) fail(`floor '${f.name}' rosters unknown monster '${type}'`);
    if (f.elite && !C.monsters[f.elite]) fail(`floor '${f.name}' has unknown elite`);
    if (f.boss && !C.monsters[f.boss]) fail(`floor '${f.name}' has unknown boss`);
  }
  // all 60 sprites are used somewhere
  const used = new Set();
  for (const def of Object.values(C.monsters)) used.add(def.sprite);
  for (const def of Object.values(C.cards)) used.add(def.sprite);
  ['a02', 'a07', 'a14', 'b08'].forEach(s => used.add(s)); // workshop hen, slot-bot, reaper, player
  let missing = 0;
  for (const sheet of ['a', 'b']) for (let i = 0; i < 30; i++) {
    const id = sheet + String(i).padStart(2, '0');
    if (!used.has(id)) { missing++; fail(`sprite ${id} is unused`); }
  }
  if (!missing) ok('all 60 clay sprites are wired into the game');
  ok('config sanity verified');
}

/* ---------------------------------------------------------
   TEST 1 — god-mode playthrough to victory
   --------------------------------------------------------- */
console.log('\n[1] god-mode full run → victory');
{
  E.newRun({ seed: 12345 });
  const s = E.state;
  let victory = false;

  for (let floor = 1; floor <= C.floors.length + 1 && !victory; floor++) {
    if (s.phase === 'victory') break;
    if (s.phase !== 'playing') { fail(`floor ${floor}: unexpected phase ${s.phase}`); break; }

    // first click somewhere to place the board
    E.clickTile(1, 1);
    assert(s.placed, `floor ${s.floor}: board placed after first click`);
    assert(s.board.tiles.find(t => t.x === 1 && t.y === 1).revealed, 'first click revealed');
    const startTile = s.board.tiles.find(t => t.x === 1 && t.y === 1);
    assert(!startTile.monster, 'first click is always safe');

    // god mode: plenty of hp/energy, murder squad
    s.hp = s.maxHp = 500;
    s.deck = [{ id: 'fireball', tier: 2 }, { id: 'heal', tier: 1 }, { id: 'excavate', tier: 2 }];

    // reveal all non-monster tiles by clicking (webs need energy)
    for (const t of s.board.tiles) {
      s.energy = 9;
      if (!t.revealed && !t.monster && !t.rubble) E.clickTile(t.x, t.y);
    }

    // kill every monster with fireballs (hits hidden ones too)
    let guard = 0;
    while (E.aliveMonsters().length && guard++ < 500) {
      s.energy = 9;
      const mt = E.aliveMonsters()[0];
      const idx = s.deck.findIndex(c => c.id === 'fireball');
      const res = E.playCard(idx, mt.x, mt.y);
      if (!res.ok) { fail(`fireball failed: ${res.why}`); break; }
      if (s.pendingRelicChoice) E.pickRelic(0);
    }
    assert(E.aliveMonsters().length === 0, `floor ${s.floor}: all monsters dead`);

    // pop all bubbles — instant ingredients, no modal
    for (const t of s.board.tiles.filter(x => x.kind === 'bubble' && !x.opened && x.revealed && !x.monster)) {
      const ingBefore = ING_IDS.reduce((sum, k) => sum + s.ing[k], 0);
      E.clickTile(t.x, t.y);
      const ingAfter = ING_IDS.reduce((sum, k) => sum + s.ing[k], 0);
      assert(t.opened, 'bubble popped');
      assert(ingAfter >= ingBefore + C.economy.bubbleIngredients, `bubble grants ingredients (${ingBefore}→${ingAfter})`);
    }
    if (s.pendingRelicChoice) E.pickRelic(0);

    // the Lucky Lift
    const lift = s.board.tiles.find(t => t.kind === 'lift');
    assert(lift, `floor ${s.floor}: lift exists`);
    if (!lift.revealed) { s.energy = 9; E.clickTile(lift.x, lift.y); }
    const res = E.clickTile(lift.x, lift.y);
    assert(res.ok && s.phase === 'floorEnd', `floor ${s.floor}: boarded the lift (phase=${s.phase})`);
    assert(s.lift && s.lift.reels.length === 3, 'reels pre-rolled');
    assert(s.lift.reels.every(sym => C.lift.symbols[sym]), 'reel symbols are valid');

    // you cannot skip the lever
    const early = E.nextFloor();
    assert(early.ok === false && early.why === 'spin', 'descend blocked until the lever is pulled');
    const spin = E.spinLift();
    assert(spin.ok, 'lever pulled');
    assert(E.spinLift().ok === false, 'no double-spins');
    if (s.pendingRelicChoice) E.pickRelic(0); // star jackpot

    // exercise the workshop
    if (s.workshop) {
      giveMaterials(s, 50);
      E.craftOffer(0);
      if (s.pendingCraft) E.cancelCraft();
      E.nap();
      if (s.deck.length > 1) E.recycleCreature(s.deck.length - 1);
    }
    const nf = E.nextFloor();
    if (nf.victory) victory = true;
    checkInvariants(`god floor ${floor}`);
  }
  assert(victory || E.state.phase === 'victory', 'reached VICTORY');
  if (victory || E.state.phase === 'victory') ok('full 8-floor god-run reaches victory');
}

/* ---------------------------------------------------------
   TEST 2 — boss jams the lift
   --------------------------------------------------------- */
console.log('\n[2] boss jams the lift');
{
  E.newRun({ seed: 777 });
  const s = E.state;
  // jump to boss floor 4 by faking a completed floor 3
  s.phase = 'floorEnd';
  s.floor = 3;
  s.workshop = { offers: [], snackUsed: true, napped: true };
  s.lift = { reels: ['heart', 'goo', 'bolt'], spun: true };
  E.nextFloor(); // now floor 4, playing
  E.clickTile(2, 2);
  s.hp = 500; s.maxHp = 500;
  const lift = s.board.tiles.find(t => t.kind === 'lift');
  lift.revealed = true;
  const locked = E.clickTile(lift.x, lift.y);
  assert(locked.locked === true, 'lift jammed while boss alive');
  // kill boss
  s.deck = [{ id: 'fireball', tier: 2 }];
  const bossTile = s.board.tiles.find(t => t.monster && C.monsters[t.monster.type].boss);
  assert(bossTile, 'boss exists on floor 4');
  let guard = 0;
  while (bossTile.monster && guard++ < 20) { s.energy = 9; E.playCard(0, bossTile.x, bossTile.y); if (s.pendingRelicChoice) E.pickRelic(0); }
  assert(!s.board.tiles.some(t => t.monster && C.monsters[t.monster.type].boss), 'boss killed');
  const open = E.clickTile(lift.x, lift.y);
  assert(open.ok === true && s.phase === 'floorEnd', 'lift works after boss death');
  ok('boss gate works');
}

/* ---------------------------------------------------------
   TEST 3 — ambush math + lethal confirm
   --------------------------------------------------------- */
console.log('\n[3] ambush & lethal bump');
{
  E.newRun({ seed: 424242 });
  const s = E.state;
  E.clickTile(3, 3);
  const mt = s.board.tiles.find(t => t.monster && !t.monster.exposed && !t.monster.disguised);
  if (assert(mt, 'found hidden monster')) {
    const pwr = mt.monster.pwr;
    const hpBefore = s.hp;
    E.clickTile(mt.x, mt.y);           // ambush
    assert(s.hp === hpBefore - pwr || s.phase === 'gameover', `ambush costs pwr (${hpBefore}→${s.hp}, pwr ${pwr})`);
    assert(mt.monster && mt.monster.exposed, 'monster exposed after ambush');
    // make the bump lethal
    s.hp = Math.min(s.hp, mt.monster.pwr); s.block = 0;
    const res = E.clickTile(mt.x, mt.y);
    assert(res.needsConfirm === true, 'lethal bump asks for confirmation');
    E.clickTile(mt.x, mt.y, true);
    assert(E.state.phase === 'gameover', 'confirmed lethal bump kills you');
  }
  ok('ambush/bump math verified');
}

/* ---------------------------------------------------------
   TEST 4 — creature behaviours + shard drops
   --------------------------------------------------------- */
console.log('\n[4] creature behaviours');
{
  E.newRun({ seed: 99 });
  const s = E.state;
  E.clickTile(2, 2);
  s.hp = 500; s.maxHp = 500;

  // bow blind-shot a hidden monster: no player damage, monster exposed/damaged
  s.deck = [{ id: 'bow', tier: 2 }, { id: 'torch', tier: 1 }, { id: 'scry', tier: 1 }, { id: 'heal', tier: 1 }];
  const hidden = s.board.tiles.find(t => t.monster && !t.monster.exposed && !t.monster.disguised && t.monster.pwr > 3);
  if (hidden) {
    s.energy = 9;
    const hpBefore = s.hp;
    const pwrBefore = hidden.monster.pwr;
    E.playCard(0, hidden.x, hidden.y);
    assert(s.hp === hpBefore, 'bow blind-shot causes no ambush damage');
    assert(!hidden.monster || hidden.monster.pwr < pwrBefore, 'bow damaged the monster');
    if (hidden.monster) assert(hidden.monster.exposed && hidden.revealed, 'bow exposes survivor');
  }

  // torch: reveals area without damage
  const hiddenEmpty = s.board.tiles.find(t => !t.revealed && !t.monster);
  if (hiddenEmpty) {
    s.energy = 9;
    const hpBefore = s.hp;
    E.playCard(1, hiddenEmpty.x, hiddenEmpty.y);
    assert(s.hp === hpBefore, 'torch never hurts');
    assert(hiddenEmpty.revealed, 'torch revealed target');
  }

  // scry marks truth
  const hidden2 = s.board.tiles.find(t => !t.revealed && t.monster);
  if (hidden2) {
    s.energy = 9;
    E.playCard(2, hidden2.x, hidden2.y);
    assert(hidden2.scry === hidden2.monster.type, 'scry sees the truth');
  }

  // heal caps at max
  s.hp = s.maxHp;
  s.energy = 9;
  E.playCard(3);
  assert(s.hp === s.maxHp, 'heal caps at maxHp');

  // kills drop shards of the monster's color
  const victim = s.board.tiles.find(t => t.monster && t.monster.exposed && !t.monster.disguised)
    || s.board.tiles.find(t => t.monster && !t.monster.disguised);
  if (victim) {
    const type = victim.monster.type;
    const color = C.monsters[type].frag;
    const basePwr = victim.monster.basePwr;
    const before = s.frags[color];
    s.deck = [{ id: 'fireball', tier: 2 }];
    let guard = 0;
    while (victim.monster && guard++ < 10) { s.energy = 9; E.playCard(0, victim.x, victim.y); if (s.pendingRelicChoice) E.pickRelic(0); }
    assert(s.frags[color] >= before + Math.ceil(basePwr / 2), `${type} dropped ${color} shards (${before}→${s.frags[color]})`);
  }
  ok('creature behaviours verified');
}

/* ---------------------------------------------------------
   TEST 4b — the workshop: crafting, upgrading, melting
   --------------------------------------------------------- */
console.log('\n[4b] workshop crafting');
{
  E.newRun({ seed: 808 });
  const s = E.state;
  E.clickTile(2, 2);
  s.hp = 500; s.maxHp = 500;
  for (const t of s.board.tiles) if (t.monster) t.monster = null;
  const lift = s.board.tiles.find(t => t.kind === 'lift');
  lift.revealed = true;
  E.clickTile(lift.x, lift.y);
  assert(s.phase === 'floorEnd' && s.workshop, 'workshop opens at floor end');
  assert(s.workshop.offers.length === 3 && new Set(s.workshop.offers).size === 3, 'three distinct molds offered');

  // no materials → craft refused
  for (const c of SHARD_IDS) s.frags[c] = 0;
  for (const k of ING_IDS) s.ing[k] = 0;
  const broke = E.craftOffer(0);
  assert(broke.ok === false && broke.why === 'materials', 'crafting without materials is refused');

  // with materials → crafted, materials deducted
  const id = s.workshop.offers[0];
  const recipe = C.cards[id].recipe;
  giveMaterials(s, 30);
  s.deck = []; // empty squad: the craft must ADD, the second craft must UPGRADE
  const cr = E.craftOffer(0);
  assert(cr.ok === true, 'craft succeeds with materials');
  assert(s.deck.some(c => c.id === id), 'creature joined the squad');
  for (const [c, n] of Object.entries(recipe.shards)) assert(s.frags[c] === 30 - n, `${c} deducted (${s.frags[c]})`);
  assert(s.workshop.offers[0] === null, 'mold spent after crafting');

  // duplicate crafting upgrades to tier 2
  const w = s.workshop;
  w.offers[1] = id;
  const up = E.craftOffer(1);
  assert(up.ok && up.result && up.result.upgraded, 'duplicate craft upgrades');
  assert(s.deck.find(c => c.id === id).tier === 2, 'tier 2 reached');

  // snack heals for any-mix shards
  s.hp = 5;
  const total = E.totalShards();
  const snack = E.craftSnack();
  assert(snack.ok && s.hp === 5 + C.economy.snackHeal, 'snack heals');
  assert(E.totalShards() === total - C.economy.snackCost, 'snack ate shards');

  // melting refunds shards
  s.deck = [{ id: 'slash', tier: 1 }, { id: 'heal', tier: 1 }];
  const color = E.primaryShard('heal');
  const shBefore = s.frags[color];
  const rc = E.recycleCreature(1);
  assert(rc.ok && s.frags[color] === shBefore + C.economy.recycleRefund, 'melt refunds shards');

  // full squad → pendingCraft flow spends nothing until slot picked
  s.deck = ['slash', 'bow', 'torch', 'heal', 'ward', 'dagger', 'excavate', 'scry'].map(cid => ({ id: cid, tier: 1 }));
  w.offers[2] = 'fireball';
  giveMaterials(s, 40);
  const needs = E.craftOffer(2);
  assert(needs.ok && needs.needsSlot && s.pendingCraft === 'fireball', 'full squad asks for a slot');
  assert(s.frags.ink === 40, 'materials not spent while pending');
  const rep = E.replaceCraft(3);
  assert(rep.ok && s.deck[3].id === 'fireball', 'replacement crafted into slot');
  assert(s.frags.ink === 40 - C.cards.fireball.recipe.shards.ink, 'materials spent on replace');
  ok('workshop verified');
}

/* ---------------------------------------------------------
   TEST 4c — the Lucky Lift pays out
   --------------------------------------------------------- */
console.log('\n[4c] slot machine payouts');
{
  const boardLiftFresh = (seed) => {
    E.newRun({ seed });
    const s = E.state;
    E.clickTile(2, 2);
    s.hp = 500; s.maxHp = 500;
    for (const t of s.board.tiles) if (t.monster) t.monster = null;
    const lift = s.board.tiles.find(t => t.kind === 'lift');
    lift.revealed = true;
    E.clickTile(lift.x, lift.y);
    return s;
  };

  // triple heart heals
  let s = boardLiftFresh(1001);
  s.hp = 400;
  s.lift.reels = ['heart', 'heart', 'heart'];
  let r = E.spinLift();
  assert(r.kind === 'triple' && s.hp === 400 + C.lift.pay.heart.triple.hp, `triple heart heals (+${s.hp - 400})`);

  // battery pair banks energy for the next floor
  s = boardLiftFresh(1002);
  s.lift.reels = ['battery', 'battery', 'goo'];
  r = E.spinLift();
  assert(r.kind === 'pair' && s.energyBank === C.lift.pay.battery.pair.energy, 'battery pair banks energy');
  E.nextFloor();
  assert(s.energy === C.player.startEnergy + C.lift.pay.battery.pair.energy, `banked energy pays out (${s.energy})`);
  assert(s.energyBank === 0, 'bank empties');

  // shard triple pays that color
  s = boardLiftFresh(1003);
  const inkBefore = s.frags.ink;
  s.lift.reels = ['ink', 'ink', 'ink'];
  r = E.spinLift();
  assert(s.frags.ink === inkBefore + C.lift.pay.ink.triple.shard, 'ink triple pays ink shards');

  // star triple = trinket jackpot
  s = boardLiftFresh(1004);
  s.lift.reels = ['star', 'star', 'star'];
  r = E.spinLift();
  assert(r.gains.relic === true, 'star triple offers a trinket');
  assert(s.pendingRelicChoice, 'trinket choice pending');
  const relicsBefore = s.relics.length;
  E.pickRelic(0);
  assert(s.relics.length === relicsBefore + 1, 'trinket claimable during floorEnd');

  // no match still consoles
  s = boardLiftFresh(1005);
  s.lift.reels = ['goo', 'bone', 'star'];
  const totalBefore = E.totalShards();
  r = E.spinLift();
  assert(r.kind === 'none' && E.totalShards() === totalBefore + C.lift.consolationShards, 'consolation shards on no match');

  // REGRESSION: heart payout at full HP reports the ACTUAL heal (0), not the nominal prize
  s = boardLiftFresh(1006);
  s.hp = s.maxHp;
  let healedEvents = 0;
  const hb = DS.Bus.on('healed', () => healedEvents++);
  s.lift.reels = ['heart', 'heart', 'heart'];
  r = E.spinLift();
  DS.Bus.off('healed', hb);
  assert(r.gains.hp === 0, `heart payout at full HP reports 0 heal (got ${r.gains.hp})`);
  assert(healedEvents === 0, 'no phantom +0 heal event at full HP');

  // REGRESSION: star jackpot with every trinket owned pays shards, not a phantom trinket
  s = boardLiftFresh(1007);
  s.relics = Object.keys(C.relics);
  s.lift.reels = ['star', 'star', 'star'];
  const shBefore = E.totalShards();
  r = E.spinLift();
  assert(r.gains.relic === false, 'no phantom trinket when all trinkets owned');
  assert(!s.pendingRelicChoice, 'no dangling relic choice when all owned');
  assert(E.totalShards() > shBefore, 'full-trinket jackpot pays consolation shards instead');

  // REGRESSION: descending is blocked while a jackpot trinket choice is pending
  s = boardLiftFresh(1008);
  s.lift.reels = ['star', 'star', 'star'];
  E.spinLift();
  assert(s.pendingRelicChoice, 'star triple leaves a trinket choice pending');
  const blocked = E.nextFloor();
  assert(blocked.ok === false && blocked.why === 'relic', 'cannot descend until the jackpot trinket is claimed');
  E.pickRelic(0);
  assert(!s.pendingRelicChoice, 'claiming the trinket clears the pending choice');

  ok('slot machine verified');
}

/* ---------------------------------------------------------
   TEST 4d — the lift fanfare fires however the lift surfaces
   --------------------------------------------------------- */
console.log('\n[4d] lift discovery event');
{
  E.newRun({ seed: 4242 });
  const s = E.state;
  E.clickTile(4, 4);
  let liftFound = 0;
  const lf = DS.Bus.on('liftFound', () => liftFound++);
  // reveal the lift indirectly (torch over it) — not a direct click
  const lift = s.board.tiles.find(t => t.kind === 'lift');
  lift.revealed = false;
  s.hp = 500; s.maxHp = 500; s.energy = 9;
  s.deck = [{ id: 'torch', tier: 1 }];
  E.playCard(0, lift.x, lift.y);
  DS.Bus.off('liftFound', lf);
  assert(lift.revealed, 'torch revealed the lift');
  assert(liftFound >= 1, 'liftFound fanfare fires when the lift surfaces indirectly');
  ok('lift discovery verified');
}

/* ---------------------------------------------------------
   TEST 5 — ghosts are invisible to numbers; x-ray specs fix
   --------------------------------------------------------- */
console.log('\n[5] ethereal numbers');
{
  E.newRun({ seed: 31337 });
  const s = E.state;
  E.clickTile(1, 1);
  // hand-place: clear a 3x3 and put a Boolet in the middle
  const t0 = s.board.tiles.find(t => t.x === 5 && t.y === 5);
  for (const t of s.board.tiles) if (Math.abs(t.x - 5) <= 1 && Math.abs(t.y - 5) <= 1) { t.monster = null; t.kind = 'empty'; }
  t0.monster = { type: 'ghost', pwr: 3, basePwr: 3, exposed: false, disguised: false, buffs: 0, webbedDone: false, damagedSinceTick: false };
  const nb = s.board.tiles.find(t => t.x === 4 && t.y === 5);
  const contribution = E.numberAt(nb);
  s.relics.push('ghostglass');
  const withGlass = E.numberAt(nb);
  assert(withGlass === contribution + 3, `ghost hidden from numbers until X-Ray Specs (+${withGlass - contribution})`);
  ok('ethereal rule verified');
}

/* ---------------------------------------------------------
   TEST 5b — review-driven regressions
   --------------------------------------------------------- */
console.log('\n[5b] regression fixes');
{
  // web tear with 0 energy costs 1 HP instead of softlocking
  E.newRun({ seed: 2024 });
  let s = E.state;
  E.clickTile(4, 4);
  const webTile = s.board.tiles.find(t => !t.revealed && !t.monster && t.kind === 'empty');
  webTile.web = true;
  s.energy = 0;
  const hpBefore = s.hp;
  E.clickTile(webTile.x, webTile.y);
  assert(webTile.revealed && !webTile.web, 'webbed tile opens at 0 energy');
  assert(s.hp === hpBefore - 1, `web tear at 0⚡ costs 1 HP (${hpBefore}→${s.hp})`);

  // ammo belt never makes Boombo free
  s.relics.push('quiver');
  const bowCost = E.cardCost({ id: 'bow', tier: 2 });
  assert(bowCost >= 1, `Boombo with Ammo Belt costs min 1 (got ${bowCost})`);

  // workshop never offers mastered creatures
  s.deck = [{ id: 'slash', tier: 2 }, { id: 'heal', tier: 2 }, { id: 'bow', tier: 1 }];
  for (const t of s.board.tiles) if (t.monster) t.monster = null;
  const lt = s.board.tiles.find(t => t.kind === 'lift');
  lt.revealed = true;
  E.clickTile(lt.x, lt.y);
  assert(s.workshop && !s.workshop.offers.some(cid => cid === 'slash' || cid === 'heal'),
    'workshop excludes tier-2 mastered creatures');

  // last fighter is protected from melting
  s.deck = [{ id: 'heal', tier: 1 }, { id: 'bow', tier: 1 }];
  const rm = E.recycleCreature(1);
  assert(rm.ok === false && rm.why === 'lastWeapon', 'cannot melt the last fighter');
  const rmHeal = E.recycleCreature(0);
  assert(rmHeal.ok === true, 'non-fighters can still be melted');

  // spawned monsters clear stale scry marks
  E.newRun({ seed: 777 });
  s = E.state;
  E.clickTile(4, 4);
  s.hp = 500; s.maxHp = 500;
  s.deck = [{ id: 'fireball', tier: 2 }];
  const slimeT = s.board.tiles.find(t => t.monster && t.monster.type === 'slime');
  if (slimeT) {
    for (const t of s.board.tiles) if (!t.revealed && !t.monster && t.kind === 'empty') t.scry = 'empty';
    s.energy = 9;
    E.playCard(0, slimeT.x, slimeT.y);
    const bad = s.board.tiles.filter(t => t.monster && t.scry);
    assert(bad.length === 0, 'no monster hides under a stale "safe" scry mark');
  }

  // flood reveals disguised mimics as bubbles (no free tell)
  E.newRun({ seed: 4242 });
  s = E.state;
  E.clickTile(4, 4);
  const zero = s.board.tiles.find(t => !t.revealed && !t.monster && t.kind === 'empty'
    && E.numberAt(t) === 0 && E.tileAt(t.x + 1, t.y) && !E.tileAt(t.x + 1, t.y).revealed);
  if (zero) {
    const nb = E.tileAt(zero.x + 1, zero.y);
    nb.kind = 'empty'; nb.web = false; nb.rubble = false;
    nb.monster = { type: 'mimic', pwr: 6, basePwr: 6, exposed: false, disguised: true, buffs: 0, webbedDone: false, damagedSinceTick: false };
    E.clickTile(zero.x, zero.y);
    assert(nb.revealed && nb.monster && nb.monster.disguised, 'flood surfaces mimics as innocent bubbles');
  }

  // Wicky tier 2 deals its documented damage
  E.newRun({ seed: 31 });
  s = E.state;
  E.clickTile(4, 4);
  s.hp = 500; s.maxHp = 500;
  s.deck = [{ id: 'torch', tier: 2 }];
  const victim = s.board.tiles.find(t => t.monster && !t.monster.disguised && t.monster.pwr >= 4);
  if (victim) {
    const before = victim.monster.pwr;
    const brittle = !!C.monsters[victim.monster.type].brittle;
    s.energy = 9;
    E.playCard(0, victim.x, victim.y);
    const expected = before - (brittle ? 4 : 2);
    assert(!victim.monster || victim.monster.pwr === expected,
      `Wicky+ singes exposed monsters (pwr ${before}→${victim.monster ? victim.monster.pwr : 'dead'})`);
  }

  // workshop interactions are dead after death / outside floorEnd
  E.newRun({ seed: 55 });
  s = E.state;
  E.clickTile(4, 4);
  const cr = E.craftOffer(0);
  assert(cr.ok === false, 'crafting is refused mid-floor');
  s.phase = 'gameover';
  assert(E.spinLift().ok === false, 'the lever is dead after death');
  assert(E.nextFloor().ok === false, 'no descending from the grave');
  ok('regression fixes verified');
}

/* ---------------------------------------------------------
   TEST 6 — random fuzzing across seeds
   --------------------------------------------------------- */
console.log('\n[6] fuzzing 250 random runs…');
{
  let crashes = 0, deaths = 0, victories = 0, floorSum = 0, maxFloor = 0;
  for (let seed = 1; seed <= 250; seed++) {
    try {
      E.newRun({ seed, merciful: seed % 3 === 0 });
      const s = E.state;
      let actions = 0;
      // deterministic action rng per seed
      let a = seed * 2654435761 >>> 0;
      const frand = () => { a ^= a << 13; a ^= a >>> 17; a ^= a << 5; a >>>= 0; return a / 4294967296; };

      while (s.phase !== 'gameover' && s.phase !== 'victory' && actions++ < 3000) {
        if (s.pendingRelicChoice) { E.pickRelic(Math.floor(frand() * 2)); continue; }
        if (s.phase === 'floorEnd') {
          if (s.pendingCraft) {
            frand() < 0.5 ? E.replaceCraft(Math.floor(frand() * s.deck.length)) : E.cancelCraft();
            continue;
          }
          if (frand() < 0.5) E.craftOffer(Math.floor(frand() * 3));
          if (frand() < 0.3) E.craftSnack();
          if (frand() < 0.3) E.nap();
          if (frand() < 0.15 && s.deck.length > 1) E.recycleCreature(Math.floor(frand() * s.deck.length));
          if (s.lift && !s.lift.spun && frand() < 0.8) E.spinLift();
          E.nextFloor();
          continue;
        }
        const r = frand();
        if (r < 0.72) {
          // random click
          const t = s.board.tiles[Math.floor(frand() * s.board.tiles.length)];
          const res = E.clickTile(t.x, t.y);
          if (res && res.needsConfirm && frand() < 0.25) E.clickTile(t.x, t.y, true);
        } else {
          // random creature at random valid target
          const idx = Math.floor(frand() * s.deck.length);
          if (E.canPlay(idx).ok) {
            const def = C.cards[s.deck[idx].id];
            if (def.target === 'none') E.playCard(idx);
            else {
              const targets = E.validTargets(idx);
              if (targets.length) {
                const t = targets[Math.floor(frand() * targets.length)];
                E.playCard(idx, t.x, t.y);
              }
            }
          }
        }
        if (actions % 50 === 0) checkInvariants(`fuzz seed ${seed} action ${actions}`);
      }
      checkInvariants(`fuzz seed ${seed} end`);
      if (s.phase === 'gameover') deaths++;
      if (s.phase === 'victory') victories++;
      floorSum += s.floor;
      maxFloor = Math.max(maxFloor, s.floor);
    } catch (e) {
      crashes++;
      fail(`seed ${seed} crashed: ${e.stack.split('\n').slice(0, 3).join(' | ')}`);
      if (crashes > 4) break;
    }
  }
  assert(crashes === 0, `no crashes (got ${crashes})`);
  ok(`250 runs: ${deaths} deaths, ${victories} victories, avg floor ${(floorSum / 250).toFixed(2)}, deepest ${maxFloor}`);
}

console.log('\n' + (failures ? `❌ ${failures} FAILURE(S)` : '✅ ALL SMOKE TESTS PASSED'));
process.exit(failures ? 1 : 0);
