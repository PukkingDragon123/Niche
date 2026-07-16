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

let failures = 0;
function fail(msg) { failures++; console.error('  ✗ ' + msg); }
function ok(msg) { console.log('  ✓ ' + msg); }
function assert(cond, msg) { if (!cond) fail(msg); return cond; }

/* collect events for behavioural assertions */
const events = [];
DS.Bus.on('*', (type, data) => events.push({ type, data }));

function checkInvariants(where) {
  const s = E.state;
  if (!s) return;
  if (!(s.hp >= 0 && s.hp <= s.maxHp)) fail(`${where}: hp out of range ${s.hp}/${s.maxHp}`);
  if (!(s.energy >= 0 && s.energy <= E.maxEnergy())) fail(`${where}: energy out of range ${s.energy}`);
  if (s.gold < 0) fail(`${where}: negative gold`);
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

    // god mode: plenty of hp/energy, murder deck
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
      // resolve any chest modal opened meanwhile (shouldn't happen from cards)
      if (s.pendingChest) E.skipChest();
      if (s.pendingRelicChoice) E.pickRelic(0);
    }
    assert(E.aliveMonsters().length === 0, `floor ${s.floor}: all monsters dead`);

    // open all chests
    for (const t of s.board.tiles.filter(x => x.kind === 'chest' && !x.opened && x.revealed && !x.monster)) {
      E.clickTile(t.x, t.y);
      if (s.pendingChest) {
        const r = E.pickChestCard(0);
        if (r.needsSlot) E.skipChest();
      }
    }
    if (s.pendingRelicChoice) E.pickRelic(0);

    // stairs
    const stairs = s.board.tiles.find(t => t.kind === 'stairs');
    assert(stairs, `floor ${s.floor}: stairs exist`);
    if (!stairs.revealed) { s.energy = 9; E.clickTile(stairs.x, stairs.y); }
    const res = E.clickTile(stairs.x, stairs.y);
    assert(res.ok && s.phase === 'floorEnd', `floor ${s.floor}: descended (phase=${s.phase})`);

    // exercise the shop
    if (s.shop) {
      s.gold += 500;
      E.shopBuy(0);
      E.rest();
      if (s.deck.length > 1) E.shopRemove(s.deck.length - 1);
    }
    const nf = E.nextFloor();
    if (nf.victory) victory = true;
    checkInvariants(`god floor ${floor}`);
  }
  assert(victory || E.state.phase === 'victory', 'reached VICTORY');
  if (victory || E.state.phase === 'victory') ok('full 8-floor god-run reaches victory');
}

/* ---------------------------------------------------------
   TEST 2 — boss seals stairs
   --------------------------------------------------------- */
console.log('\n[2] boss seals the stairs');
{
  E.newRun({ seed: 777 });
  const s = E.state;
  // jump to boss floor 4
  s.floor = 4;
  s.phase = 'playing';
  // rebuild floor via nextFloor trick: use internal setup by faking floorEnd
  s.phase = 'floorEnd';
  s.floor = 3;
  s.shop = { cards: [], healUsed: true, rested: true };
  E.nextFloor(); // now floor 4, playing
  E.clickTile(2, 2);
  s.hp = 500; s.maxHp = 500;
  const stairs = s.board.tiles.find(t => t.kind === 'stairs');
  stairs.revealed = true;
  const locked = E.clickTile(stairs.x, stairs.y);
  assert(locked.locked === true, 'stairs locked while boss alive');
  // kill boss
  s.deck = [{ id: 'fireball', tier: 2 }];
  const bossTile = s.board.tiles.find(t => t.monster && C.monsters[t.monster.type].boss);
  assert(bossTile, 'boss exists on floor 4');
  let guard = 0;
  while (bossTile.monster && guard++ < 20) { s.energy = 9; E.playCard(0, bossTile.x, bossTile.y); if (s.pendingRelicChoice) E.pickRelic(0); }
  assert(!s.board.tiles.some(t => t.monster && C.monsters[t.monster.type].boss), 'boss killed');
  const open = E.clickTile(stairs.x, stairs.y);
  assert(open.ok === true && s.phase === 'floorEnd', 'stairs open after boss death');
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
    const res2 = E.clickTile(mt.x, mt.y, true);
    assert(E.state.phase === 'gameover', 'confirmed lethal bump kills you');
  }
  ok('ambush/bump math verified');
}

/* ---------------------------------------------------------
   TEST 4 — cards: bow blind-shot, torch, scry, chest flow
   --------------------------------------------------------- */
console.log('\n[4] card behaviours');
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

  // chest flow: acquire → duplicate upgrade
  s.deck = [{ id: 'slash', tier: 1 }];
  const chest = s.board.tiles.find(t => t.kind === 'chest');
  if (chest) {
    chest.revealed = true;
    E.clickTile(chest.x, chest.y);
    if (assert(s.pendingChest, 'chest opens an offer')) {
      assert(s.pendingChest.offers.length === 3, 'three cards offered');
      const ids = s.pendingChest.offers.map(o => o.id);
      assert(new Set(ids).size === 3, 'offers are distinct');
      E.pickChestCard(0);
      assert(!s.pendingChest, 'offer resolved');
    }
  }
  ok('card behaviours verified');
}

/* ---------------------------------------------------------
   TEST 5 — ghosts are invisible to numbers; ghostglass fixes
   --------------------------------------------------------- */
console.log('\n[5] ethereal numbers');
{
  E.newRun({ seed: 31337 });
  const s = E.state;
  E.clickTile(1, 1);
  // hand-place: clear a 3x3 and put a ghost in the middle
  const t0 = s.board.tiles.find(t => t.x === 5 && t.y === 5);
  for (const t of s.board.tiles) if (Math.abs(t.x - 5) <= 1 && Math.abs(t.y - 5) <= 1) { t.monster = null; t.kind = 'empty'; }
  t0.monster = { type: 'ghost', pwr: 3, basePwr: 3, exposed: false, disguised: false, buffs: 0, webbedDone: false, damagedSinceTick: false };
  const nb = s.board.tiles.find(t => t.x === 4 && t.y === 5);
  const contribution = E.numberAt(nb);
  // count what non-ghost neighbours contribute
  s.relics.push('ghostglass');
  const withGlass = E.numberAt(nb);
  assert(withGlass === contribution + 3, `ghost hidden from numbers until Ghost Monocle (+${withGlass - contribution})`);
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

  // quiver never makes bow free
  s.relics.push('quiver');
  const bowCost = E.cardCost({ id: 'bow', tier: 2 });
  assert(bowCost >= 1, `bow with quiver costs min 1 (got ${bowCost})`);

  // shop never stocks mastered cards
  s.deck = [{ id: 'slash', tier: 2 }, { id: 'heal', tier: 2 }, { id: 'bow', tier: 1 }];
  for (const t of s.board.tiles) if (t.monster) t.monster = null;
  const st = s.board.tiles.find(t => t.kind === 'stairs');
  st.revealed = true;
  E.clickTile(st.x, st.y);
  assert(s.shop && !s.shop.cards.some(c => c.id === 'slash' || c.id === 'heal'),
    'shop excludes tier-2 mastered cards');

  // last weapon is protected from removal
  s.gold = 999;
  s.deck = [{ id: 'heal', tier: 1 }, { id: 'bow', tier: 1 }];
  const rm = E.shopRemove(1);
  assert(rm.ok === false && rm.why === 'lastWeapon', 'cannot discard the last weapon');
  const rmHeal = E.shopRemove(0);
  assert(rmHeal.ok === true, 'non-weapons can still be discarded');

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

  // flood reveals disguised mimics as chests (no free tell)
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
    assert(nb.revealed && nb.monster && nb.monster.disguised, 'flood surfaces mimics as innocent chests');
  }

  // torch tier 2 deals its documented damage
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
      `torch+ sears exposed monsters (pwr ${before}→${victim.monster ? victim.monster.pwr : 'dead'})`);
  }

  // chest interactions are dead after death
  E.newRun({ seed: 55 });
  s = E.state;
  E.clickTile(4, 4);
  const chestT = s.board.tiles.find(t => t.kind === 'chest');
  if (chestT) {
    chestT.revealed = true;
    E.clickTile(chestT.x, chestT.y);
    if (s.pendingChest) {
      s.phase = 'gameover';
      const r = E.pickChestCard(0);
      assert(r.ok === false, 'chest picks are ignored after death');
      s.phase = 'playing';
      E.skipChest();
    }
  }
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
        if (s.pendingChest) {
          if (s.pendingChest.replaceMode) { frand() < 0.5 ? E.replaceCard(Math.floor(frand() * s.deck.length)) : E.skipChest(); }
          else if (frand() < 0.7) { const r = E.pickChestCard(Math.floor(frand() * 3)); }
          else E.skipChest();
          continue;
        }
        if (s.phase === 'floorEnd') {
          if (frand() < 0.5) E.shopBuy(Math.floor(frand() * 3));
          if (frand() < 0.5) E.rest();
          if (frand() < 0.2 && s.deck.length > 1) E.shopRemove(Math.floor(frand() * s.deck.length));
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
          // random card at random valid target
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
