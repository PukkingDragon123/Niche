/* ============================================================
   DUNGEON SWEEPER — UI
   All DOM rendering + input. Listens to DS.Bus events emitted
   by the engine and translates them into juice.
   ============================================================ */
(function (root) {
'use strict';

const C = root.DS_CONFIG;
const { Engine, Bus, Sprites, FX } = root.DS;
const SFX = () => root.DS.Audio.SFX;

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (html != null) d.innerHTML = html;
  return d;
};

let tileEls = [];          // index -> element
let selectedCard = -1;     // deck index in targeting mode
let hoverArea = [];        // tiles highlighted for area preview
let lastHover = null;      // last hovered tile {x,y} (for keyboard card selection)
let lastNumbers = {};      // tile index -> last rendered number (for pulse)
let boardGen = 0;          // bumped every buildBoard — stale timers check it
let lastFloorEnd = null;   // cached floorComplete payload for modal reopens

/* modals that open on a delay — cancellable if the run ends first */
const pendingTimers = [];
function later(fn, ms) { pendingTimers.push(setTimeout(fn, ms)); }
function cancelPendingModals() { pendingTimers.forEach(clearTimeout); pendingTimers.length = 0; }

/* ============================================================
   HELPERS
   ============================================================ */
function S() { return Engine.state; }
function tileEl(t) { return tileEls[t.y * S().board.w + t.x]; }

function numClass(n) {
  if (n <= 2) return 'c1';
  if (n <= 4) return 'c2';
  if (n <= 7) return 'c3';
  if (n <= 11) return 'c4';
  return 'c5';
}

function cardDesc(card) {
  const def = C.cards[card.id];
  let d = (card.tier > 1 && def.desc2) ? def.desc2 : def.desc;
  d = d.replace('{v}', Engine.cardVal(card));
  if (def.arc) d = d.replace('{a}', def.arc[card.tier - 1]);
  return d;
}

/* ============================================================
   SCREENS
   ============================================================ */
function showScreen(id) {
  ['menu', 'play'].forEach(s => $('#' + s).classList.toggle('hidden', s !== id));
}

function renderMenu() {
  let best = 0, wins = 0;
  try {
    best = +localStorage.getItem('ds_best') || 0;
    wins = +localStorage.getItem('ds_wins') || 0;
  } catch (e) {}
  $('#menu-stats').innerHTML = best
    ? `Deepest delve: <b>Floor ${best}</b>${wins ? ` &nbsp;·&nbsp; Dungeons cleared: <b>${wins}</b>` : ''}`
    : 'The dungeon awaits its first fool…';
}

/* ============================================================
   BOARD
   ============================================================ */
function buildBoard() {
  boardGen++;
  const b = S().board;
  const board = $('#board');
  board.innerHTML = '';
  board.style.setProperty('--bw', b.w);
  board.style.setProperty('--bh', b.h);
  tileEls = [];
  lastNumbers = {};
  for (const t of b.tiles) {
    const d = el('div', 'tile hidden-tile');
    d.dataset.x = t.x; d.dataset.y = t.y;
    const face = el('div', 'tile-face');
    d.appendChild(face);
    d.addEventListener('animationend', (e) => {
      if (e.animationName === 'pop-in') d.classList.remove('pop-in');
      if (e.animationName === 'monster-in') d.classList.remove('monster-in');
      if (e.animationName === 'num-pulse') d.classList.remove('num-pulse');
    });
    board.appendChild(d);
    tileEls.push(d);
  }
  sizeBoard();
  clearTargeting();
}

function sizeBoard() {
  if (!S() || !S().board) return;
  const wrap = $('#board-wrap');
  const b = S().board;
  const GAP = 4, PAD = 28 + 6; // grid gaps + board padding/border
  const availW = wrap.clientWidth - PAD - GAP * (b.w - 1);
  const availH = wrap.clientHeight - PAD - GAP * (b.h - 1);
  const tw = Math.max(22, Math.min(60, Math.floor(Math.min(availW / b.w, availH / b.h))));
  $('#board').style.setProperty('--tw', tw + 'px');
}

function updateTile(t, opts) {
  const d = tileEl(t);
  if (!d) return;
  const face = d.querySelector('.tile-face');
  const idx = t.y * S().board.w + t.x;

  // keep one-shot entrance animations alive through re-renders
  const transient = ['pop-in', 'monster-in'].filter(c => d.classList.contains(c));
  d.className = 'tile' + (transient.length ? ' ' + transient.join(' ') : '');
  let html = '';

  if (!t.revealed) {
    d.classList.add('hidden-tile');
    if (t.web) { d.classList.add('webbed'); html += Sprites.html('web', 'web-ov'); }
    if (t.mark === 1) html += '<span class="mark">☠</span>';
    if (t.mark === 2) html += '<span class="mark q">?</span>';
    if (t.scry) {
      d.classList.add('scryed');
      const what = t.scry;
      if (what === 'empty') html += '<span class="scry-ic safe">✓</span>';
      else if (what === 'chest' || what === 'gold' || what === 'stairs') html += `<span class="scry-ic">${Sprites.html(what)}</span>`;
      else html += `<span class="scry-ic bad">${Sprites.html(what)}</span>`;
    }
  } else {
    d.classList.add('revealed');
    if (t.rubble) {
      d.classList.add('rubble');
      html += Sprites.html('rubble');
    } else if (t.monster) {
      const m = t.monster;
      const def = C.monsters[m.type];
      if (m.disguised) {
        d.classList.add('chest-tile');
        html += Sprites.html('chest', 'big');
        if (t.scry) html += `<span class="scry-ic bad">${Sprites.html(t.scry)}</span>`;
      } else {
        d.classList.add('monster-tile');
        if (def.elite) d.classList.add('elite');
        if (def.boss) d.classList.add('boss');
        if (def.ethereal) d.classList.add('ethereal');
        html += Sprites.html(m.type, 'big');
        html += `<span class="pwr-badge ${m.pwr > m.basePwr ? 'buffed' : ''}">${m.pwr}</span>`;
        if (def.elite) html += '<span class="crown">👑</span>';
      }
    } else if (t.kind === 'chest' && !t.opened) {
      d.classList.add('chest-tile');
      html += Sprites.html('chest', 'big');
    } else if (t.kind === 'gold' && !t.collected) {
      html += Sprites.html('gold', 'big');
    } else if (t.kind === 'stairs') {
      d.classList.add('stairs-tile');
      html += Sprites.html('stairs', 'big');
      const f = C.floors[S().floor - 1];
      if (f.boss && S().board.tiles.some(x => x.monster && C.monsters[x.monster.type].boss)) {
        html += `<span class="lock-ov">${Sprites.html('lock')}</span>`;
        d.classList.add('locked');
      }
    } else {
      const n = Engine.numberAt(t);
      const prev = lastNumbers[idx];
      lastNumbers[idx] = n;
      if (n > 0) {
        html += `<span class="num ${numClass(n)}">${n}</span>`;
        if (prev != null && prev !== n && opts && opts.pulse) d.classList.add('num-pulse');
      }
      if (t.corpse) html += `<span class="corpse-ov">${Sprites.html('corpse')}</span>`;
      if (t.kind === 'chest' && t.opened) html += `<span class="corpse-ov">${Sprites.html('chest_open')}</span>`;
      if (t.kind === 'gold' && t.collected) html += `<span class="corpse-ov">${Sprites.html('gold')}</span>`;
    }
  }
  face.innerHTML = html;
}

function updateAllTiles(opts) {
  if (!S() || !S().board) return;
  for (const t of S().board.tiles) updateTile(t, opts);
  if (selectedCard >= 0) paintTargets();
}

/* ============================================================
   HUD
   ============================================================ */
function renderHUD() {
  const s = S();
  if (!s) return;
  // hp
  const pct = Math.max(0, s.hp / s.maxHp * 100);
  $('#hp-fill').style.width = pct + '%';
  setTimeout(() => { $('#hp-ghost').style.width = pct + '%'; }, 350);
  $('#hp-text').textContent = `${s.hp}/${s.maxHp}`;
  $('#hp-bar').classList.toggle('danger', s.hp / s.maxHp <= 0.3);
  $('#block-chip').classList.toggle('hidden', s.block <= 0);
  $('#block-chip').textContent = '🛡️' + s.block;
  // energy
  const max = Engine.maxEnergy();
  const pips = $('#energy-pips');
  pips.innerHTML = '';
  for (let i = 0; i < max; i++) pips.appendChild(el('span', 'pip' + (i < s.energy ? ' full' : '')));
  $('#energy-text').textContent = `${s.energy}/${max}`;
  // gold
  $('#gold-text').textContent = s.gold;
  // xp
  $('#level-text').textContent = 'LV ' + s.level;
  $('#xp-fill').style.width = Math.min(100, s.xp / Engine.xpNeeded() * 100) + '%';
  $('#xp-text').textContent = `${s.xp}/${Engine.xpNeeded()}`;
  renderRelics();
}

function bumpStat(id) {
  const n = $(id);
  if (!n) return;
  n.classList.remove('stat-bump');
  void n.offsetWidth;
  n.classList.add('stat-bump');
}

function renderRelics() {
  const row = $('#relics');
  row.innerHTML = '';
  for (const id of S().relics) {
    const def = C.relics[id];
    const d = el('div', 'relic', Sprites.html('relic_' + id));
    d.addEventListener('mouseenter', (e) => showTip(`<b>${Sprites.html('relic_' + id)} ${def.name}</b><br>${def.desc}`, e.clientX, e.clientY));
    d.addEventListener('mouseleave', hideTip);
    row.appendChild(d);
  }
}

function renderFloorPlate() {
  const s = S();
  const f = C.floors[s.floor - 1];
  $('#floor-name').innerHTML = `<span class="floor-no">FLOOR ${s.floor}</span> ${f.name.toUpperCase()}`;
}

function renderOmens() {
  const wrap = $('#omens');
  wrap.innerHTML = '';
  if (!S().placed) return;
  for (const o of Engine.omens()) {
    const def = C.monsters[o.type];
    const chip = el('div', 'omen' + (o.inClicks <= 2 ? ' soon' : ''),
      `${Sprites.html(o.type)}<b>${o.inClicks}</b>`);
    chip.addEventListener('mouseenter', (e) => showTip(`<b>${def.name}</b> acts in <b>${o.inClicks}</b> click${o.inClicks > 1 ? 's' : ''}<br><i>${def.desc}</i>`, e.clientX, e.clientY));
    chip.addEventListener('mouseleave', hideTip);
    wrap.appendChild(chip);
  }
}

function renderBestiary() {
  const wrap = $('#bestiary');
  wrap.innerHTML = '';
  if (!S().placed) {
    wrap.appendChild(el('div', 'bestiary-hint', 'Click any tile to begin.<br>Numbers show the TOTAL POWER of monsters in the 8 tiles around them.'));
    return;
  }
  for (const row of Engine.bestiary()) {
    const d = el('div', 'beast' + (row.count === 0 ? ' dead' : ''));
    d.innerHTML = `${Sprites.html(row.type)}<span class="b-pwr">${row.def.pwr}</span><span class="b-name">${row.def.name}</span><span class="b-count">×${row.count}</span>`;
    if (row.def.ethereal) d.classList.add('ethereal');
    d.addEventListener('mouseenter', (e) => showTip(
      `<b>${Sprites.html(row.type)} ${row.def.name}</b> — power ${row.def.pwr}<br><i>${row.def.desc}</i>`, e.clientX, e.clientY));
    d.addEventListener('mouseleave', hideTip);
    wrap.appendChild(d);
  }
}

/* ============================================================
   HAND / CARDS
   ============================================================ */
function cardEl(card, idx, opts) {
  opts = opts || {};
  const def = C.cards[card.id];
  const d = el('div', `card rarity-${def.rarity}`);
  d.dataset.idx = idx;
  const cost = Engine.cardCost(card);
  const exhausted = def.exhaust && S().exhausted[card.id];
  const afford = S().energy >= cost && !exhausted;
  if (!opts.static && !afford) d.classList.add('cant');
  if (idx === selectedCard && !opts.static) d.classList.add('selected');
  d.innerHTML = `
    <div class="card-cost">${cost}<span class="bolt">⚡</span></div>
    ${card.tier > 1 ? '<div class="card-tier">II</div>' : ''}
    <div class="card-art">${Sprites.html('card_' + card.id)}</div>
    <div class="card-name">${def.name.toUpperCase()}${card.tier > 1 ? '+' : ''}</div>
    <div class="card-desc">${cardDesc(card)}</div>
    ${def.exhaust ? `<div class="card-ex">${exhausted ? 'SPENT' : '1×/FLOOR'}</div>` : ''}
    <div class="card-shine"></div>`;
  return d;
}

function renderHand() {
  const hand = $('#hand');
  hand.innerHTML = '';
  const deck = S().deck;
  const n = deck.length;
  deck.forEach((card, i) => {
    const d = cardEl(card, i);
    const mid = (n - 1) / 2;
    const off = i - mid;
    d.style.setProperty('--rot', (off * 3) + 'deg');
    d.style.setProperty('--ty', Math.min(20, off * off * 3) + 'px');
    d.style.zIndex = i + 1;
    d.addEventListener('click', () => onCardClick(i));
    d.addEventListener('mouseenter', () => SFX().cardHover());
    d.addEventListener('contextmenu', (e) => { e.preventDefault(); if (selectedCard >= 0) clearTargeting(); });
    hand.appendChild(d);
  });
}

function onCardClick(idx) {
  const s = S();
  if (s.phase !== 'playing') return;
  if (selectedCard === idx) { clearTargeting(); return; }
  const chk = Engine.canPlay(idx);
  if (!chk.ok) {
    const card = s.deck[idx];
    const def = C.cards[card.id];
    if (chk.why === 'energy') { toastLocal(`Need ${Engine.cardCost(card)}⚡ — reveal tiles to charge up!`, 'warn'); FX.shake('sm'); }
    else if (chk.why === 'exhausted') toastLocal(`${def.name} is spent for this floor.`, 'warn');
    return;
  }
  const def = C.cards[s.deck[idx].id];
  if (def.target === 'none') {
    Engine.playCard(idx);
    clearTargeting();
    return;
  }
  selectedCard = idx;
  document.body.classList.add('targeting');
  renderHand();
  paintTargets();
}

function paintTargets() {
  if (selectedCard < 0) return;
  const def = C.cards[S().deck[selectedCard].id];
  if (def.target === 'area') {
    // every tile is a valid center — outlining all of them is noise;
    // the hover preview (area-glow) carries the information instead
    for (const d of tileEls) { d.classList.remove('valid', 'invalid'); d.classList.add('area-mode'); }
    if (lastHover) {
      const t = Engine.tileAt(lastHover.x, lastHover.y);
      if (t) applyAreaHint(t);
    }
    return;
  }
  const valid = new Set(Engine.validTargets(selectedCard));
  for (const t of S().board.tiles) {
    const d = tileEl(t);
    d.classList.remove('area-mode');
    d.classList.toggle('valid', valid.has(t));
    d.classList.toggle('invalid', !valid.has(t));
  }
}

function clearTargeting() {
  selectedCard = -1;
  document.body.classList.remove('targeting');
  clearAreaHint();
  if (tileEls.length) for (const d of tileEls) d.classList.remove('valid', 'invalid', 'area-mode');
  renderHand();
}

function clearAreaHint() {
  for (const t of hoverArea) { const d = tileEl(t); if (d) d.classList.remove('area-glow'); }
  hoverArea = [];
}

function areaRadiusFor(cardIdx) {
  const card = S().deck[cardIdx];
  const def = C.cards[card.id];
  return (def.radius || 1) + (Engine.hasRelic('lantern') ? 1 : 0);
}

/* ============================================================
   TOOLTIP & TOASTS
   ============================================================ */
function showTip(html, x, y) {
  const tip = $('#tooltip');
  tip.innerHTML = html;
  tip.classList.remove('hidden');
  const pad = 14;
  requestAnimationFrame(() => {
    const r = tip.getBoundingClientRect();
    let tx = x + pad, ty = y + pad;
    if (tx + r.width > innerWidth - 8) tx = x - r.width - pad;
    if (ty + r.height > innerHeight - 8) ty = y - r.height - pad;
    tip.style.left = Math.max(4, tx) + 'px';
    tip.style.top = Math.max(4, ty) + 'px';
  });
}
function hideTip() { $('#tooltip').classList.add('hidden'); }

function toastLocal(msg, kind) {
  const t = el('div', 'toast toast-' + (kind || 'info'), msg);
  $('#toasts').appendChild(t);
  setTimeout(() => t.classList.add('out'), 2600);
  setTimeout(() => t.remove(), 3100);
  const all = $('#toasts').children;
  while (all.length > 4) all[0].remove();
}

function banner(text, cls) {
  const b = el('div', 'banner ' + (cls || ''), text);
  document.body.appendChild(b);
  setTimeout(() => b.classList.add('out'), 1600);
  setTimeout(() => b.remove(), 2300);
}

/* ============================================================
   MODALS
   ============================================================ */
function openModal(html, cls) {
  const m = $('#modal');
  m.classList.remove('hidden');
  const box = $('#modal-content');
  box.className = 'modal-box ' + (cls || '');
  box.innerHTML = html;
  return box;
}
function closeModal() { $('#modal').classList.add('hidden'); }

function helpModal() {
  openModal(`
    <h2>📜 HOW TO SWEEP A DUNGEON</h2>
    <div class="help-grid">
      <p><b>Numbers are SUMS.</b> A revealed tile shows the <i>total power</i> of all monsters in the 8 tiles around it. A "5" might be five rats… or one orc.</p>
      <p><b>Clicking a hidden monster = AMBUSH.</b> It bites you for its power, then stands there, exposed. Click an exposed monster to slay it barehanded — for its power in HP <i>again</i>.</p>
      <p><b>Cards kill for free.</b> Instead of flags, you have a belt of cards. ${Sprites.html('card_bow')} Bow can snipe a tile you <i>deduced</i> holds a monster — no ambush. ${Sprites.html('card_torch')} Torch uncovers areas safely.</p>
      <p><b>⚡ Energy comes from revealing tiles.</b> Every safe tile you uncover charges +1⚡. Risk feeds power.</p>
      <p><b>👻 Ghosts are invisible to numbers</b> and drift around. 👿 Mimics look exactly like chests. 🦇 Bats move. 🧙 Shamans make everything worse. Watch the <b>omen timers</b> and read the <b>bestiary</b>.</p>
      <p><b>🎁 Chests</b> hold new cards (duplicates upgrade!). ${Sprites.html('gold')} buys from the shop between floors. ${Sprites.html('stairs')} descends — bosses seal them.</p>
      <p><b>Right-click</b> chalks a note on a tile. <b>ESC</b> cancels a card. Survive all ${C.floors.length} floors.</p>
    </div>
    <button class="btn btn-red" id="btn-close-help">GOT IT</button>
  `, 'modal-help');
  $('#btn-close-help').onclick = () => { closeModal(); };
}

function chestModal(offers) {
  const box = openModal(`
    <h2>✨ TREASURE! ✨</h2>
    <p class="modal-sub">Choose one card to add to your belt</p>
    <div class="booster" id="booster"></div>
    <button class="btn" id="btn-skip-chest">LEAVE IT (+${C.economy.chestSkipGold}g)</button>
  `, 'modal-chest');
  const wrap = box.querySelector('#booster');
  offers.forEach((o, i) => {
    const card = { id: o.id, tier: 1 };
    const holder = el('div', 'flip-holder');
    holder.style.setProperty('--d', (i * 0.18) + 's');
    const inner = el('div', 'flip-inner');
    inner.appendChild(el('div', 'card card-back flip-back', '<div class="back-gem">◆</div>'));
    const front = cardEl(card, i, { static: true });
    front.classList.add('flip-front');
    const owned = S().deck.find(c => c.id === o.id);
    if (owned) front.appendChild(el('div', 'owned-tag', owned.tier === 1 ? 'UPGRADES!' : `+${C.economy.dupSellGold}g`));
    inner.appendChild(front);
    holder.appendChild(inner);
    holder.addEventListener('click', () => {
      const res = Engine.pickChestCard(i);
      if (res.needsSlot) return; // deckFull event opens replace modal
      closeModal();
    });
    wrap.appendChild(holder);
  });
  box.querySelector('#btn-skip-chest').onclick = () => { Engine.skipChest(); closeModal(); };
}

function replaceModal(incomingId) {
  const inc = C.cards[incomingId];
  const box = openModal(`
    <h2>BELT FULL!</h2>
    <p class="modal-sub">Replace a card with <b>${Sprites.html('card_' + incomingId)} ${inc.name}</b> — or leave it (+${C.economy.chestSkipGold}g)</p>
    <div class="deck-grid" id="deck-grid"></div>
    <button class="btn" id="btn-skip-replace">KEEP MY DECK</button>
  `, 'modal-replace');
  const grid = box.querySelector('#deck-grid');
  S().deck.forEach((card, i) => {
    const d = cardEl(card, i, { static: true });
    d.addEventListener('click', () => { Engine.replaceCard(i); closeModal(); });
    grid.appendChild(d);
  });
  box.querySelector('#btn-skip-replace').onclick = () => { Engine.skipChest(); closeModal(); };
}

function relicChoiceModal(offers) {
  const box = openModal(`
    <h2>👑 THE BOSS'S HOARD</h2>
    <p class="modal-sub">Claim ONE relic</p>
    <div class="relic-choice" id="relic-choice"></div>
  `, 'modal-relic');
  const wrap = box.querySelector('#relic-choice');
  offers.forEach((o, i) => {
    const d = el('div', 'relic-offer', `
      <div class="relic-big">${Sprites.html('relic_' + o.id)}</div>
      <div class="relic-name">${o.def.name}</div>
      <div class="relic-desc">${o.def.desc}</div>`);
    d.addEventListener('click', () => { Engine.pickRelic(i); closeModal(); });
    wrap.appendChild(d);
  });
}

function lethalModal(t, dmg) {
  const m = t.monster;
  const def = C.monsters[m.type];
  const box = openModal(`
    <h2 class="danger-title">⚠ DEATH WARNING ⚠</h2>
    <p class="modal-sub">Charging the <b>${Sprites.html(m.type)} ${def.name}</b> costs <b class="red">${dmg} HP</b> — you have <b>${S().hp}</b>.<br>This will be your end.</p>
    <div class="btn-row">
      <button class="btn" id="btn-flee">FLEE</button>
      <button class="btn btn-red" id="btn-glory">DIE GLORIOUSLY</button>
    </div>
  `, 'modal-lethal');
  box.querySelector('#btn-flee').onclick = closeModal;
  box.querySelector('#btn-glory').onclick = () => { closeModal(); Engine.clickTile(t.x, t.y, true); };
}

function floorEndModal(data) {
  const s = S();
  const isLast = data.last;
  const shop = s.shop;
  const box = openModal(`
    <h2>${isLast ? '💓 THE HEART LIES STILL' : '🏆 FLOOR ' + data.floor + ' CLEARED'}</h2>
    ${data.seal ? `<p class="modal-sub gold-text">DUNGEON SEALED — every monster slain! +${data.seal}g</p>` : ''}
    <div class="shop" id="shop-box">
      <div class="shop-head">🛒 THE RAT PEDDLER <span class="shop-gold">${Sprites.html('gold')} <b id="shop-gold-n">${s.gold}</b></span></div>
      <div class="shop-cards" id="shop-cards"></div>
      <div class="shop-row">
        <button class="btn btn-sm" id="btn-shop-heal">🩹 Patch up +${C.economy.shopHealAmount} HP — ${C.economy.shopHealCost}g</button>
        <button class="btn btn-sm" id="btn-shop-remove">🗑 Discard a card — ${C.economy.shopRemoveCost}g</button>
        <button class="btn btn-sm" id="btn-rest">🔥 Rest +${C.economy.restHeal} HP (free)</button>
      </div>
    </div>
    <button class="btn btn-big btn-red" id="btn-descend">${isLast ? 'CLAIM VICTORY' : 'DESCEND ▼'}</button>
  `, 'modal-floorend');
  renderShop();
  box.querySelector('#btn-descend').onclick = () => { closeModal(); Engine.nextFloor(); };
}

function renderShop() {
  const s = S();
  const shop = s.shop;
  if (!shop || !$('#shop-cards')) return;
  const wrap = $('#shop-cards');
  wrap.innerHTML = '';
  const goldN = $('#shop-gold-n');
  if (goldN) goldN.textContent = s.gold;
  shop.cards.forEach((item, i) => {
    const holder = el('div', 'shop-item' + (item.sold ? ' sold' : ''));
    const d = cardEl({ id: item.id, tier: 1 }, i, { static: true });
    holder.appendChild(d);
    const owned = s.deck.find(c => c.id === item.id);
    const tag = owned ? (owned.tier === 1 ? ' (upgrade!)' : '') : '';
    holder.appendChild(el('div', 'price' + (s.gold < item.price ? ' broke' : ''), item.sold ? 'SOLD' : `${item.price}g${tag}`));
    if (!item.sold) holder.addEventListener('click', () => {
      const r = Engine.shopBuy(i);
      if (!r.ok && !r.full) { FX.shake('sm'); toastLocal('Not enough gold!', 'warn'); }
      renderShop();
    });
    wrap.appendChild(holder);
  });
  const healBtn = $('#btn-shop-heal');
  const remBtn = $('#btn-shop-remove');
  const restBtn = $('#btn-rest');
  if (healBtn) {
    healBtn.disabled = shop.healUsed || s.gold < C.economy.shopHealCost || s.hp >= s.maxHp;
    healBtn.onclick = () => { Engine.shopHeal(); renderShop(); };
  }
  if (remBtn) {
    remBtn.disabled = s.gold < C.economy.shopRemoveCost || s.deck.length <= 1;
    remBtn.onclick = () => removeCardModal();
  }
  if (restBtn) {
    restBtn.disabled = shop.rested;
    restBtn.textContent = shop.rested ? '🔥 Rested' : `🔥 Rest +${C.economy.restHeal} HP (free)`;
    restBtn.onclick = () => { Engine.rest(); renderShop(); };
  }
}

function removeCardModal() {
  const box = openModal(`
    <h2>🗑 DISCARD A CARD</h2>
    <p class="modal-sub">Pay ${C.economy.shopRemoveCost}g to unclutter your belt</p>
    <div class="deck-grid" id="deck-grid"></div>
    <button class="btn" id="btn-cancel-remove">NEVER MIND</button>
  `, 'modal-replace');
  const reopen = () => floorEndModal(lastFloorEnd || { floor: S().floor, seal: 0, last: S().floor >= C.floors.length });
  const grid = box.querySelector('#deck-grid');
  S().deck.forEach((card, i) => {
    const d = cardEl(card, i, { static: true });
    d.addEventListener('click', () => {
      const r = Engine.shopRemove(i);
      if (r.ok || r.why === 'lastWeapon') reopen();
    });
    grid.appendChild(d);
  });
  box.querySelector('#btn-cancel-remove').onclick = reopen;
}

function deathModal(data) {
  saveBest();
  openModal(`
    <h2 class="danger-title">☠ SLAIN ☠</h2>
    <p class="modal-sub">Felled by <b>${data.source || 'the dungeon'}</b> on floor ${data.floor}</p>
    <div class="stats-grid">
      <div>Monsters slain <b>${data.stats.kills}</b></div>
      <div>Gold amassed <b>${data.stats.goldEarned}</b></div>
      <div>Chests looted <b>${data.stats.chests}</b></div>
      <div>Level reached <b>${data.level}</b></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-big btn-red" id="btn-again">DELVE AGAIN</button>
      <button class="btn" id="btn-to-menu">MENU</button>
    </div>
  `, 'modal-death');
  $('#btn-again').onclick = () => { closeModal(); startRun(); };
  $('#btn-to-menu').onclick = () => { closeModal(); Engine.toMenu(); };
}

function victoryModal(data) {
  saveBest(true);
  openModal(`
    <h2 class="gold-text">👑 DUNGEON CLEARED 👑</h2>
    <p class="modal-sub">The Heart is silent. The halls are yours.</p>
    <div class="stats-grid">
      <div>Monsters slain <b>${data.stats.kills}</b></div>
      <div>Gold amassed <b>${data.stats.goldEarned}</b></div>
      <div>Chests looted <b>${data.stats.chests}</b></div>
      <div>Final level <b>${data.level}</b></div>
    </div>
    <div class="btn-row">
      <button class="btn btn-big btn-red" id="btn-again">NEW DELVE</button>
      <button class="btn" id="btn-to-menu">MENU</button>
    </div>
  `, 'modal-victory');
  $('#btn-again').onclick = () => { closeModal(); startRun(); };
  $('#btn-to-menu').onclick = () => { closeModal(); Engine.toMenu(); };
}

function saveBest(won) {
  try {
    const best = +localStorage.getItem('ds_best') || 0;
    if (S().floor > best) localStorage.setItem('ds_best', S().floor);
    if (won) localStorage.setItem('ds_wins', (+localStorage.getItem('ds_wins') || 0) + 1);
  } catch (e) {}
}

/* ============================================================
   INPUT WIRING
   ============================================================ */
function onBoardClick(e) {
  const tEl = e.target.closest('.tile');
  if (!tEl) return;
  const x = +tEl.dataset.x, y = +tEl.dataset.y;
  root.DS.Audio.ensure();

  if (selectedCard >= 0) {
    const res = Engine.playCard(selectedCard, x, y);
    if (res.ok) clearTargeting();
    else if (res.why === 'target') { FX.shake('sm'); }
    return;
  }
  const res = Engine.clickTile(x, y);
  if (res && res.needsConfirm) {
    SFX().lethal();
    lethalModal(Engine.tileAt(x, y), res.dmg);
  }
}

function onBoardContext(e) {
  e.preventDefault();
  if (selectedCard >= 0) { clearTargeting(); return; }
  const tEl = e.target.closest('.tile');
  if (!tEl) return;
  Engine.markTile(+tEl.dataset.x, +tEl.dataset.y);
  SFX().click();
}

function onBoardMove(e) {
  const tEl = e.target.closest('.tile');
  clearAreaHint();
  lastHover = tEl ? { x: +tEl.dataset.x, y: +tEl.dataset.y } : null;
  if (!tEl || selectedCard < 0) return;
  const card = S().deck[selectedCard];
  if (!card) return;
  const def = C.cards[card.id];
  if (def.target !== 'area') return;
  const t = Engine.tileAt(+tEl.dataset.x, +tEl.dataset.y);
  if (!t) return;
  applyAreaHint(t);
}

function applyAreaHint(t) {
  hoverArea = Engine.areaTiles(t, areaRadiusFor(selectedCard));
  for (const a of hoverArea) { const d = tileEl(a); if (d) d.classList.add('area-glow'); }
}

/* hover tooltips for board monsters */
function onBoardHover(e) {
  const tEl = e.target.closest('.tile');
  if (!tEl) { hideTip(); return; }
  const t = Engine.tileAt(+tEl.dataset.x, +tEl.dataset.y);
  if (!t) return;
  // NOTE: a revealed disguised mimic MUST get the exact same tooltip as a real
  // chest — any difference is a free mimic detector.
  const looksLikeChest = t.revealed && !t.opened &&
    ((t.kind === 'chest' && !t.monster) || (t.monster && t.monster.disguised));
  if (looksLikeChest) {
    showTip(`${Sprites.html('chest')} <b>A chest…</b> or is it? Click to open. Arrows can test it from afar.`, e.clientX, e.clientY);
  } else if (t.revealed && t.monster && !t.monster.disguised) {
    const def = C.monsters[t.monster.type];
    const extra = def.unbumpable ? '<br><b class="red">Immune to bare hands — cards only!</b>'
      : `<br>Slay by hand: costs <b class="red">${t.monster.pwr} HP</b>`;
    showTip(`<b>${Sprites.html(t.monster.type)} ${def.name}</b> — power ${t.monster.pwr}${t.monster.pwr !== t.monster.basePwr ? ` (base ${t.monster.basePwr})` : ''}<br><i>${def.desc}</i>${extra}`, e.clientX, e.clientY);
  } else if (!t.revealed && t.web) {
    showTip(`${Sprites.html('web')} <b>Webbed</b> — costs 1⚡ to tear (1 HP if you have no ⚡)`, e.clientX, e.clientY);
  } else if (t.revealed && t.kind === 'stairs') {
    showTip(`${Sprites.html('stairs')} <b>The stairs down.</b> Click to descend` + (tEl.classList.contains('locked') ? ' — <b class="red">sealed by the boss!</b>' : '.'), e.clientX, e.clientY);
  } else hideTip();
}

function startRun() {
  root.DS.Audio.ensure();
  const merciful = $('#btn-merciful').classList.contains('on');
  Engine.newRun({ merciful });
}

/* ============================================================
   BUS → JUICE
   ============================================================ */
function wireEvents() {

  Bus.on('runStart', () => {
    cancelPendingModals();
    showScreen('play');
    closeModal();
  });

  Bus.on('menu', () => {
    cancelPendingModals();
    closeModal();
    clearTargeting();
    document.body.classList.remove('dead');
    showScreen('menu');
    renderMenu();
  });

  Bus.on('floorStart', ({ floor, cfg }) => {
    root.DS.Shader.setHue(cfg.hue);
    buildBoard();
    renderFloorPlate();
    renderHUD();
    renderHand();
    renderBestiary();
    renderOmens();
    updateAllTiles();
    $('#compass-chip').classList.add('hidden');
    banner(`FLOOR ${floor} — ${cfg.name.toUpperCase()}`, 'banner-floor');
    if (cfg.boss) { SFX().boss(); toastLocal(`⚠ ${C.monsters[cfg.boss].name} dwells here. The stairs are sealed!`, 'bad'); }
  });

  Bus.on('boardPlaced', () => { renderBestiary(); renderOmens(); });

  Bus.on('compass', ({ hint }) => {
    const chip = $('#compass-chip');
    chip.classList.remove('hidden');
    chip.innerHTML = `🧭 stairs: <b>${hint}</b>`;
  });

  Bus.on('reveal', ({ batch, manual }) => {
    const gen = boardGen; // stale timers must not paint a rebuilt board
    batch.forEach((entry, i) => {
      const t = entry.t;
      setTimeout(() => {
        if (gen !== boardGen) return;
        const d = tileEl(t);
        updateTile(t);
        d.classList.add('pop-in');
        if (manual) SFX().cascade(Math.min(i, 14));
        if (entry.energyGained > 0 && i < 8) FX.floater(d, '+1⚡', 'f-energy');
        if (t.kind === 'gold' && t.collected && t.goldAmt) FX.burstAt(d, { count: 10, colors: FX.PALETTES.gold, speed: 4 });
      }, i * 36);
    });
    if (manual && batch.length >= 6) setTimeout(() => { if (gen === boardGen) FX.flash('energy'); }, batch.length * 18);
    setTimeout(() => { if (gen !== boardGen) return; updateAllTiles({ pulse: true }); renderHUD(); }, batch.length * 36 + 40);
  });

  Bus.on('expose', ({ t }) => {
    updateTile(t);
    const d = tileEl(t);
    d.classList.add('monster-in');
    renderBestiary();
  });

  Bus.on('ambush', ({ t, monster, dmg }) => {
    SFX().hurt();
    FX.shake('lg');
    FX.flash('blood');
    root.DS.Shader.kick(0.5);
    updateTile(t);
    tileEl(t).classList.add('monster-in');
    FX.floater(tileEl(t), '-' + dmg, 'f-dmg');
    FX.burstAt(tileEl(t), { count: 14, colors: FX.PALETTES.blood, speed: 6 });
    renderBestiary();
    renderHUD();
  });

  Bus.on('bump', ({ t, dmg }) => {
    SFX().bump();
    FX.shake('sm');
    FX.flash('blood');
    FX.floater(tileEl(t), '-' + dmg, 'f-dmg');
    renderHUD();
  });

  Bus.on('playerHurt', () => { renderHUD(); bumpStat('#hp-bar'); });

  Bus.on('blocked', ({ soaked }) => {
    FX.floater($('#hp-bar'), `🛡️ -${soaked}`, 'f-block');
    renderHUD();
  });

  Bus.on('monsterHit', ({ t, dmg, killed }) => {
    if (!killed) {
      updateTile(t);
      const d = tileEl(t);
      d.classList.add('hit-flash');
      setTimeout(() => d.classList.remove('hit-flash'), 220);
      FX.floater(d, '-' + dmg, 'f-hit');
      updateAllTiles({ pulse: true });
    } else {
      FX.floater(tileEl(t), '-' + dmg, 'f-hit');
    }
  });

  Bus.on('kill', ({ t, type, def, cause }) => {
    SFX().kill();
    const d = tileEl(t);
    FX.burstAt(d, { count: def.boss ? 60 : 20, colors: cause === 'midas' ? FX.PALETTES.gold : FX.PALETTES.blood, speed: def.boss ? 9 : 5 });
    updateTile(t);
    updateAllTiles({ pulse: true });
    renderBestiary();
    renderOmens();
    if (def.boss) { FX.shake('lg'); FX.flash('gold'); banner(def.name.toUpperCase() + ' DESTROYED!', 'banner-boss'); SFX().boss(); }
    else if (def.elite) { FX.flash('gold'); banner('ELITE SLAIN!', 'banner-boss'); }
  });

  Bus.on('gold', ({ gained, at }) => {
    if (gained > 0) SFX().coin();
    renderHUD();
    bumpStat('#gold-stat');
    if (at && tileEl(at)) FX.floater(tileEl(at), (gained > 0 ? '+' : '') + gained + 'g', 'f-gold');
  });

  Bus.on('xp', ({ gained, at }) => {
    renderHUD();
    if (at && tileEl(at)) setTimeout(() => FX.floater(tileEl(at), '+' + gained + 'xp', 'f-xp'), 150);
  });

  Bus.on('levelup', ({ level }) => {
    SFX().levelup();
    banner('⬆ LEVEL ' + level + ' ⬆', 'banner-level');
    FX.burst(innerWidth / 2, innerHeight / 2, { count: 40, colors: FX.PALETTES.magic, speed: 8, grav: 0.15 });
    renderHUD();
  });

  Bus.on('energy', () => { renderHUD(); renderHand(); });

  Bus.on('healed', ({ amount }) => {
    SFX().heal();
    FX.floater($('#hp-bar'), '+' + amount, 'f-heal');
    FX.burstAt($('#hp-bar'), { count: 10, colors: FX.PALETTES.green, speed: 3, grav: -0.05 });
    renderHUD();
  });

  Bus.on('warded', () => { renderHUD(); FX.floater($('#hp-bar'), '🛡️', 'f-block'); });

  Bus.on('webbed', ({ tiles }) => { SFX().web(); tiles.forEach(t => updateTile(t)); });
  Bus.on('webTorn', ({ t }) => { SFX().web(); updateTile(t); });

  Bus.on('numbersChanged', () => { updateAllTiles({ pulse: true }); });

  Bus.on('batsMoved', () => { SFX().omen(); FX.flash('magic'); });
  Bus.on('ghostsDrift', () => { SFX().omen(); });
  Bus.on('ritual', () => { SFX().buff(); FX.flash('magic'); root.DS.Shader.kick(0.4); });

  Bus.on('rubble', ({ t }) => { updateTile(t); FX.burstAt(tileEl(t), { count: 12, colors: FX.PALETTES.bone, speed: 4 }); });
  Bus.on('rubbleCleared', ({ t }) => updateTile(t));

  Bus.on('bossRage', ({ type }) => {
    SFX().boss();
    FX.shake('lg');
    FX.flash(type === 'heart' ? 'magic' : 'blood');
    root.DS.Shader.kick(0.7);
    renderBestiary();
    renderOmens();
  });

  Bus.on('bossDead', () => { updateAllTiles(); });

  Bus.on('split', () => { renderBestiary(); renderOmens(); });

  Bus.on('mimic', ({ t }) => { SFX().boss(); FX.shake('lg'); });

  Bus.on('clock', () => renderOmens());

  Bus.on('mark', ({ t }) => updateTile(t));

  Bus.on('scryed', ({ t }) => {
    SFX().card();
    updateTile(t);
    if (tileEl(t)) FX.burstAt(tileEl(t), { count: 6, colors: FX.PALETTES.magic, speed: 2.5, grav: -0.02 });
  });

  Bus.on('arrowMiss', ({ t }) => { SFX().arrow(); FX.burstAt(tileEl(t), { count: 6, colors: FX.PALETTES.bone, speed: 3 }); });

  Bus.on('torchLit', ({ t }) => {
    SFX().fireball();
    FX.burstAt(tileEl(t), { count: 22, colors: FX.PALETTES.fire, speed: 5, grav: -0.08 });
  });

  Bus.on('fireballHit', ({ t }) => {
    SFX().fireball();
    FX.shake('lg');
    FX.flash('fire');
    FX.burstAt(tileEl(t), { count: 44, colors: FX.PALETTES.fire, speed: 8 });
    root.DS.Shader.kick(0.6);
  });

  Bus.on('chainHit', ({ t }) => { SFX().zap(); FX.burstAt(tileEl(t), { count: 20, colors: ['#ffe066', '#fff3a0', '#3fd8ff'], speed: 7, shape: 'spark' }); });

  Bus.on('whirl', () => { SFX().zap(); FX.shake('sm'); });

  Bus.on('midasHit', ({ t }) => { FX.burstAt(tileEl(t), { count: 26, colors: FX.PALETTES.gold, speed: 6 }); });

  Bus.on('relocated', ({ from }) => { SFX().card(); updateTile(from); FX.burstAt(tileEl(from), { count: 12, colors: FX.PALETTES.magic, speed: 4 }); });

  Bus.on('purified', ({ t }) => { SFX().heal(); FX.burstAt(tileEl(t), { count: 16, colors: ['#fff3d6', '#ffe9a8', '#b07ffa'], speed: 4, grav: -0.06 }); });

  Bus.on('cardPlayed', () => { SFX().card(); renderHUD(); renderHand(); });
  Bus.on('handChanged', () => renderHand());

  Bus.on('cardGained', ({ id }) => {
    const def = C.cards[id];
    toastLocal(`${Sprites.html('card_' + id)} ${def.name} joins your belt!`, 'good');
    renderHand();
  });
  Bus.on('cardUpgraded', ({ id }) => {
    SFX().levelup();
    const def = C.cards[id];
    banner(def.name.toUpperCase() + ' II!', 'banner-level');
    renderHand();
  });
  Bus.on('cardRemoved', () => renderHand());

  Bus.on('chestOpened', ({ t, offers }) => {
    SFX().chest();
    FX.burstAt(tileEl(t), { count: 24, colors: FX.PALETTES.gold, speed: 6, grav: -0.05 });
    updateTile(t);
    later(() => { if (S().pendingChest) chestModal(offers); }, 350);
  });
  Bus.on('deckFull', ({ incoming }) => replaceModal(incoming));

  Bus.on('relicGain', ({ id, def }) => {
    SFX().relic();
    banner(Sprites.html('relic_' + id) + ' ' + def.name.toUpperCase(), 'banner-relic');
    toastLocal(`Relic claimed: ${def.desc}`, 'good');
    renderHUD();
  });
  Bus.on('relicChoice', ({ offers }) => later(() => { if (S().pendingRelicChoice) relicChoiceModal(offers); }, 500));

  Bus.on('stairsFound', ({ t }) => {
    SFX().stairs();
    toastLocal('You found the stairs down!', 'good');
    FX.burstAt(tileEl(t), { count: 14, colors: FX.PALETTES.cyan, speed: 4 });
  });
  Bus.on('stairsLocked', () => { FX.shake('sm'); });

  Bus.on('floorComplete', (data) => {
    SFX().stairs();
    lastFloorEnd = data;
    later(() => { if (S().phase === 'floorEnd') floorEndModal(data); }, 400);
  });

  Bus.on('death', (data) => {
    SFX().death();
    FX.shake('lg');
    FX.flash('blood');
    cancelPendingModals(); // a queued chest/relic modal must not open over the grave
    clearTargeting();
    document.body.classList.add('dead');
    later(() => {
      document.body.classList.remove('dead');
      if (S().phase === 'gameover') deathModal(data);
    }, 900);
  });

  Bus.on('victory', (data) => {
    SFX().victory();
    FX.flash('gold');
    const rain = setInterval(() => FX.burst(Math.random() * innerWidth, -10, { count: 8, colors: FX.PALETTES.gold, speed: 3, grav: 0.12, life: 2.5 }), 180);
    setTimeout(() => clearInterval(rain), 3600);
    later(() => { if (S().phase === 'victory') victoryModal(data); }, 800);
  });

  Bus.on('toast', ({ msg, kind }) => toastLocal(msg, kind));

  Bus.on('lethalWarn', () => {});
}

/* ============================================================
   INIT
   ============================================================ */
function init() {
  wireEvents();

  $('#board').addEventListener('click', onBoardClick);
  $('#board').addEventListener('contextmenu', onBoardContext);
  $('#board').addEventListener('mousemove', (e) => { onBoardMove(e); onBoardHover(e); });
  $('#board').addEventListener('mouseleave', () => { clearAreaHint(); hideTip(); lastHover = null; });

  $('#btn-start').addEventListener('click', () => { startRun(); });
  $('#btn-merciful').addEventListener('click', (e) => {
    const b = e.currentTarget;
    b.classList.toggle('on');
    b.innerHTML = b.classList.contains('on') ? '🕊 MERCIFUL' : '☠ CURSED';
  });
  $('#btn-help').addEventListener('click', helpModal);
  $('#btn-help-2').addEventListener('click', helpModal);
  $('#btn-mute').addEventListener('click', (e) => {
    const A = root.DS.Audio;
    A.setMuted(!A.muted);
    e.currentTarget.textContent = A.muted ? '🔇' : '🔊';
  });
  $('#btn-abandon').addEventListener('click', () => {
    if (confirm('Abandon this delve and return to the menu?')) Engine.toMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (selectedCard >= 0) clearTargeting();
      else if (!$('#modal').classList.contains('hidden') && $('#modal-content').classList.contains('modal-help')) closeModal();
    }
    const n = parseInt(e.key);
    if (n >= 1 && n <= 8 && S() && S().phase === 'playing' && !S().pendingChest
        && $('#modal').classList.contains('hidden')) {
      if (S().deck[n - 1]) onCardClick(n - 1);
    }
  });

  root.addEventListener('resize', sizeBoard);

  $('#btn-mute').textContent = root.DS.Audio.muted ? '🔇' : '🔊';
  renderMenu();
  showScreen('menu');

  // first visit → open the rulebook once
  try {
    if (!localStorage.getItem('ds_seen_help')) {
      localStorage.setItem('ds_seen_help', '1');
      helpModal();
    }
  } catch (e) {}
}

root.DS.UI = { init, helpModal };

})(typeof globalThis !== 'undefined' ? globalThis : this);
