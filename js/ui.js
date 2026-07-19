/* ============================================================
   DUNGEON SWEEPER — UI
   All DOM rendering + input. Listens to DS.Bus events emitted
   by the engine and translates them into whimsical, squishy juice.
   ============================================================ */
(function (root) {
'use strict';

const C = root.DS_CONFIG;
const { Engine, Bus, Sprites, FX } = root.DS;
const SFX = () => root.DS.Audio.SFX;

const SHARD_IDS = ['goo', 'bone', 'zap', 'ink', 'bolt'];
const ING_IDS = ['button', 'spring', 'googly', 'fluff', 'star'];

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
let reelTimers = [];       // slot machine animation intervals

/* modals that open on a delay — cancellable if the run ends first */
const pendingTimers = [];
function later(fn, ms) { pendingTimers.push(setTimeout(fn, ms)); }
function cancelPendingModals() {
  pendingTimers.forEach(clearTimeout); pendingTimers.length = 0;
  reelTimers.forEach(clearInterval); reelTimers.length = 0;
}

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

const SHARD_PALETTE = { goo: 'green', bone: 'bone', zap: 'gold', ink: 'magic', bolt: 'cyan' };
function shardPalette(color) { return SHARD_PALETTE[color] || 'blood'; }

function shardChip(color, n) {
  const def = C.shards[color];
  return `<span class="mat mat-${color}" title="${def.name}">${def.emoji}${n != null ? `<b>${n}</b>` : ''}</span>`;
}
function ingChip(kind, n) {
  const def = C.ingredients[kind];
  return `<span class="mat mat-ing" title="${def.name}">${def.emoji}${n != null ? `<b>${n}</b>` : ''}</span>`;
}
function recipeHtml(id) {
  const r = C.cards[id].recipe;
  let out = '';
  for (const [c, n] of Object.entries(r.shards || {})) out += shardChip(c, n);
  for (const [k, n] of Object.entries(r.ing || {})) out += ingChip(k, n);
  return out;
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
    ? `Deepest delve: <b>Floor ${best}</b>${wins ? ` &nbsp;·&nbsp; Dungeons conquered: <b>${wins}</b>` : ''}`
    : 'The warren awaits its first brave catcher…';
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
  const GAP = 5, PAD = 30 + 8; // grid gaps + board padding/border
  const availW = wrap.clientWidth - PAD - GAP * (b.w - 1);
  const availH = wrap.clientHeight - PAD - GAP * (b.h - 1);
  const tw = Math.max(22, Math.min(60, Math.floor(Math.min(availW / b.w, availH / b.h))));
  $('#board').style.setProperty('--tw', tw + 'px');
}

function scryIcon(what, t) {
  if (what === 'empty') return '<span class="scry-ic safe">✓</span>';
  if (what === 'bubble') return `<span class="scry-ic">${Sprites.html('bubble')}</span>`;
  if (what === 'lift') return `<span class="scry-ic">${Sprites.html('lift')}</span>`;
  if (what === 'shards') return `<span class="scry-ic">${Sprites.html('shard_' + ((t && t.shardColor) || 'goo'))}</span>`;
  return `<span class="scry-ic bad">${Sprites.html(what)}</span>`;
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
      html += scryIcon(t.scry, t);
    }
  } else {
    d.classList.add('revealed');
    if (t.rubble) {
      d.classList.add('gunk');
      html += '<span class="gunk-blob">🫠</span>';
    } else if (t.monster) {
      const m = t.monster;
      const def = C.monsters[m.type];
      if (m.disguised) {
        d.classList.add('bubble-tile');
        html += '<span class="bubble-orb"></span>';
        if (t.scry) html += scryIcon(t.scry, t);
      } else {
        d.classList.add('monster-tile');
        if (def.elite) d.classList.add('elite');
        if (def.boss) d.classList.add('boss');
        if (def.ethereal) d.classList.add('ethereal');
        html += Sprites.html(m.type, 'big');
        html += `<span class="pwr-badge ${m.pwr > m.basePwr ? 'buffed' : ''}">${m.pwr}</span>`;
        if (def.elite) html += '<span class="crown">👑</span>';
        if (Engine.isDazed(m)) { d.classList.add('dazed'); html += '<span class="daze-ring"></span><span class="catch-tag">CATCH!</span>'; }
      }
    } else if (t.kind === 'bubble' && !t.opened) {
      d.classList.add('bubble-tile');
      html += '<span class="bubble-orb"></span>';
    } else if (t.kind === 'shards' && !t.collected) {
      d.classList.add('shard-tile');
      html += `<span class="shard-pile mat-${t.shardColor}">${C.shards[t.shardColor].emoji}</span>`;
    } else if (t.kind === 'lift') {
      d.classList.add('lift-tile');
      html += Sprites.html('lift', 'big');
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
      if (t.corpse) {
        html += `<span class="corpse-body">${Sprites.html(t.corpse, 'big')}</span>`;
        if (t.loot) { d.classList.add('lootable'); html += '<span class="loot-glint">✨</span>'; }
      }
      if (t.kind === 'bubble' && t.opened) html += '<span class="corpse-ov popped-ring"></span>';
      if (t.kind === 'shards' && t.collected) html += `<span class="corpse-ov dim-chip">${C.shards[t.shardColor].emoji}</span>`;
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
  // stash
  $('#stash-shards').innerHTML = SHARD_IDS.map(c => shardChip(c, s.frags[c])).join('');
  $('#stash-ing').innerHTML = ING_IDS.map(k => ingChip(k, s.ing[k])).join('');
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

function catchableTotal() {
  return Object.values(C.monsters).filter(m => !m.boss).length;
}

function renderBestiary() {
  const wrap = $('#bestiary');
  wrap.innerHTML = '';
  const cc = $('#caught-count');
  if (cc) cc.innerHTML = `🔔 caught <b>${Engine.caughtSpecies()}</b>/${catchableTotal()}`;
  if (!S().placed) {
    wrap.appendChild(el('div', 'bestiary-hint', 'Poke any tile to begin.<br>Numbers show the TOTAL POWER of monsters in the 8 tiles around them.'));
    return;
  }
  const men = S().menagerie || {};
  for (const row of Engine.bestiary()) {
    const caught = men[row.type] || 0;
    const d = el('div', 'beast' + (row.count === 0 ? ' dead' : '') + (caught ? ' caught' : ''));
    d.innerHTML = `${Sprites.html(row.type)}<span class="b-pwr">${row.def.pwr}</span><span class="b-name">${row.def.name}</span>` +
      (caught ? `<span class="b-caught" title="caught ${caught}">🔔${caught > 1 ? caught : ''}</span>` : `<span class="b-count">×${row.count}</span>`);
    if (row.def.ethereal) d.classList.add('ethereal');
    d.addEventListener('mouseenter', (e) => showTip(
      `<b>${Sprites.html(row.type)} ${row.def.name}</b> — power ${row.def.pwr} · drops ${shardChip(row.def.frag)}` +
      (caught ? ` · <b class="teal">caught ×${caught}</b>` : '') +
      `<br><i>${row.def.desc}</i>` +
      (row.def.boss ? '' : '<br><i class="catch-hint">Weaken it, then click to CATCH.</i>'), e.clientX, e.clientY));
    d.addEventListener('mouseleave', hideTip);
    wrap.appendChild(d);
  }
}

/* ============================================================
   HAND / SQUAD
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
    ${def.exhaust ? `<div class="card-ex">${exhausted ? 'TIRED' : '1×/FLOOR'}</div>` : ''}
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
    else if (chk.why === 'exhausted') toastLocal(`${def.name} is tuckered out for this floor.`, 'warn');
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
    <h2>📖 HOW TO CATCH A DUNGEON</h2>
    <div class="help-grid">
      <p><b>Numbers are SUMS.</b> A revealed tile shows the <i>total power</i> of all monsters in the 8 tiles around it. A "5" might be five Rabbles… or one Gronk.</p>
      <p><b>Poking a hidden monster = AMBUSH.</b> It bops you for its power, then stands there, exposed. Poke an exposed monster to strike it barehanded — but that costs you its power in HP <i>again</i>.</p>
      <p><b>🔔 CATCH them instead!</b> Weaken a monster until it's <b class="teal">DAZED</b> (low power), then click it to <b>catch it bare-handed</b> — no HP cost, bonus shards, and a spot in your Menagerie. Every species you catch is tracked. <i>Gotta catch 'em!</i></p>
      <p><b>Your creatures do the weakening.</b> ${Sprites.html('card_bow')} Boombo snipes a tile you <i>deduced</i> holds a monster — no ambush. ${Sprites.html('card_torch')} Wicky lights up whole areas safely.</p>
      <p><b>⚡ Energy comes from revealing tiles.</b> Every safe tile you uncover charges +1⚡. Risk feeds power.</p>
      <p><b>💀 Destroyed monsters leave a CORPSE</b> — click it to loot shards & ingredients. <b>Caught</b> monsters give even more. Both feed <b>crafting</b>: at the Menagerie between floors, spend ${Sprites.html('shard_goo')}${Sprites.html('shard_ink')} shards + ingredients on new creatures (a duplicate upgrades it!).</p>
      <p><b>👻 Boolets are invisible to numbers</b> and drift around. 🦪 Mimics look exactly like bubbles. 🐱 Napcats move. 🍄 Sporecaps make everything worse. Watch the <b>omen timers</b> and read the <b>bestiary</b>.</p>
      <p><b>🎰 The LUCKY LIFT</b> is the only way down — find it, board it, and PULL THE LEVER. Triple ⭐ pays a trinket! Bosses jam the lift until defeated (and are too big to catch).</p>
      <p><b>Right-click</b> chalks a note on a tile. <b>ESC</b> cancels a creature. Survive all ${C.floors.length} floors.</p>
    </div>
    <button class="btn btn-red" id="btn-close-help">GOT IT</button>
  `, 'modal-help');
  $('#btn-close-help').onclick = () => { closeModal(); };
}

function relicChoiceModal(offers) {
  const box = openModal(`
    <h2>👑 THE HOARD</h2>
    <p class="modal-sub">Claim ONE trinket</p>
    <div class="relic-choice" id="relic-choice"></div>
  `, 'modal-relic');
  const wrap = box.querySelector('#relic-choice');
  offers.forEach((o, i) => {
    const d = el('div', 'relic-offer', `
      <div class="relic-big">${Sprites.html('relic_' + o.id)}</div>
      <div class="relic-name">${o.def.name}</div>
      <div class="relic-desc">${o.def.desc}</div>`);
    d.addEventListener('click', () => {
      Engine.pickRelic(i);
      // a slot-machine jackpot returns to the lift; a mid-floor drop just closes
      if (S().phase === 'floorEnd') liftModal(lastFloorEnd || { floor: S().floor, seal: 0, last: S().floor >= C.floors.length });
      else closeModal();
    });
    wrap.appendChild(d);
  });
}

function lethalModal(t, dmg) {
  const m = t.monster;
  const def = C.monsters[m.type];
  const box = openModal(`
    <h2 class="danger-title">⚠ DANGER ⚠</h2>
    <p class="modal-sub">Charging the <b>${Sprites.html(m.type)} ${def.name}</b> costs <b class="red">${dmg} HP</b> — you have <b>${S().hp}</b>.<br>You will be the one who falls.</p>
    <div class="btn-row">
      <button class="btn" id="btn-flee">FLEE</button>
      <button class="btn btn-red" id="btn-glory">CHARGE ANYWAY</button>
    </div>
  `, 'modal-lethal');
  box.querySelector('#btn-flee').onclick = closeModal;
  box.querySelector('#btn-glory').onclick = () => { closeModal(); Engine.clickTile(t.x, t.y, true); };
}

/* ============================================================
   THE LUCKY LIFT (slot machine + workshop, between floors)
   ============================================================ */
function liftModal(data) {
  const s = S();
  const isLast = data.last;
  const spun = s.lift && s.lift.spun;
  const box = openModal(`
    <h2>${isLast ? '🎪 THE THRONE IS EMPTY' : '🎰 THE LUCKY LIFT'}</h2>
    ${data.seal ? `<p class="modal-sub gold-text">SPOTLESS SWEEP — every monster cleared! +${data.seal} shards</p>` : ''}
    <div class="lift-machine" id="lift-machine">
      <div class="lift-bot">${Sprites.html('slotbot', 'lift-bot-img')}</div>
      <div class="reels" id="reels">
        <div class="reel" id="reel-0"><span>❔</span></div>
        <div class="reel" id="reel-1"><span>❔</span></div>
        <div class="reel" id="reel-2"><span>❔</span></div>
      </div>
      <div class="lift-msg" id="lift-msg">${spun ? '' : 'Pull the lever to power the lift!'}</div>
      <button class="btn btn-big btn-gold ${spun ? 'hidden' : ''}" id="btn-lever">🎰 PULL!</button>
    </div>
    <div class="workshop" id="workshop-box">
      <div class="shop-head">${Sprites.html('workshop')} THE MENAGERIE <span class="shop-note">🔔 ${Engine.caughtSpecies()}/${catchableTotal()} caught · craft creatures from shards</span></div>
      <div class="stash-row" id="ws-stash"></div>
      <div class="shop-cards" id="ws-offers"></div>
      <div class="shop-row">
        <button class="btn btn-sm" id="btn-snack">🍪 Bake a snack +${C.economy.snackHeal} HP — ${C.economy.snackCost} shards (any mix)</button>
        <button class="btn btn-sm" id="btn-recycle">♻️ Melt a creature +${C.economy.recycleRefund} shards</button>
        <button class="btn btn-sm" id="btn-nap">😴 Nap +${C.economy.restHeal} HP (free)</button>
      </div>
    </div>
    <button class="btn btn-big btn-red" id="btn-descend" ${spun ? '' : 'disabled'}>${isLast ? 'RIDE HOME ▲' : 'RIDE DOWN ▼'}</button>
  `, 'modal-floorend');

  if (spun) {
    s.lift.reels.forEach((sym, i) => { $('#reel-' + i).innerHTML = `<span>${C.lift.symbols[sym].emoji}</span>`; });
  } else {
    box.querySelector('#btn-lever').onclick = pullLever;
  }
  renderWorkshop();
  box.querySelector('#btn-descend').onclick = () => {
    const r = Engine.nextFloor();
    if (r.ok) closeModal();
    else if (r.why === 'spin') toastLocal('Pull the lever first — the lift needs luck to move!', 'warn');
  };
}

function pullLever() {
  const res = Engine.spinLift();
  if (!res.ok) return;
  const lever = $('#btn-lever');
  if (lever) lever.classList.add('hidden');
  $('#modal-content').classList.add('spinning'); // freeze the workshop during the theater
  SFX().spin();
  const gen = boardGen;
  // spin the reels, stagger the stops
  const symbols = Object.keys(C.lift.symbols);
  res.reels.forEach((finalSym, i) => {
    const reel = $('#reel-' + i);
    if (!reel) return;
    const iv = setInterval(() => {
      const r = symbols[Math.floor(Math.random() * symbols.length)];
      reel.innerHTML = `<span class="blur">${C.lift.symbols[r].emoji}</span>`;
    }, 70);
    reelTimers.push(iv);
    later(() => {
      clearInterval(iv);
      reel.innerHTML = `<span>${C.lift.symbols[finalSym].emoji}</span>`;
      reel.classList.add('reel-stop');
      SFX().reelStop();
    }, 700 + i * 450);
  });
  later(() => {
    if (gen !== boardGen && S().phase !== 'floorEnd') return;
    showLiftPayout(res);
  }, 700 + 2 * 450 + 250);
}

function showLiftPayout(res) {
  const msg = $('#lift-msg');
  const btn = $('#btn-descend');
  if (btn) btn.disabled = false;
  $('#modal-content').classList.remove('spinning');
  const isLast = !!(lastFloorEnd && lastFloorEnd.last);
  const g = res.gains;
  let text = '';
  if (res.kind === 'triple' && g.relic) {
    text = '⭐⭐⭐ JACKPOT! A TRINKET RISES FROM THE COIN SLOT!';
    SFX().jackpot();
    FX.flash('gold');
    FX.burst(innerWidth / 2, innerHeight / 2, { count: 60, colors: FX.PALETTES.gold, speed: 9, grav: 0.12 });
    // the relicChoice event opens the picker on top of us
  } else if (res.kind !== 'none') {
    const bits = [];
    if (g.hp) bits.push(`+${g.hp} HP`);
    if (g.energy) bits.push(`+${g.energy}⚡ ${isLast ? 'for the road' : 'next floor'}`);
    if (g.shards) bits.push(`+${g.shards.n} ${g.shards.color ? C.shards[g.shards.color].name + ' ' : ''}shards`);
    if (g.ingredients.length) bits.push('+' + g.ingredients.map(k => C.ingredients[k].emoji).join(''));
    text = (res.kind === 'triple' ? '🎉 TRIPLE! ' : '✨ PAIR! ')
      + (bits.length ? bits.join(' · ') : 'but your pockets were already full!');
    SFX().jackpot();
    FX.burst(innerWidth / 2, innerHeight / 3, { count: 26, colors: FX.PALETTES.gold, speed: 6 });
  } else {
    text = `Clunk… no match. Glitchy apologizes with +${res.gains.shards ? res.gains.shards.n + ' ' + C.shards[res.gains.shards.color].name : 'a few'} shards.`;
    SFX().coin();
  }
  if (msg) msg.textContent = text;
  renderWorkshop(); // stash changed
}

function renderWorkshop() {
  const s = S();
  const w = s.workshop;
  if (!w || !$('#ws-offers')) return;
  // stash summary
  $('#ws-stash').innerHTML =
    SHARD_IDS.map(c => shardChip(c, s.frags[c])).join('') +
    '<span class="stash-gap"></span>' +
    ING_IDS.map(k => ingChip(k, s.ing[k])).join('');
  // offers
  const wrap = $('#ws-offers');
  wrap.innerHTML = '';
  w.offers.forEach((id, i) => {
    const holder = el('div', 'shop-item' + (id ? '' : ' sold'));
    if (id) {
      const d = cardEl({ id, tier: 1 }, i, { static: true });
      holder.appendChild(d);
      const owned = s.deck.find(c => c.id === id);
      const afford = Engine.canAfford(C.cards[id].recipe);
      const tag = owned ? '<div class="up-tag">UPGRADES!</div>' : '';
      holder.appendChild(el('div', 'price' + (afford ? '' : ' broke'), `${recipeHtml(id)}${tag}`));
      holder.addEventListener('click', () => {
        const r = Engine.craftOffer(i);
        if (!r.ok && r.why === 'materials') { FX.shake('sm'); toastLocal('Not enough materials! Catch or crush more monsters, pop more bubbles.', 'warn'); }
        else if (r.ok && r.needsSlot) replaceCraftModal(id);
        else if (r.ok) SFX().chest();
        renderWorkshop();
      });
    } else {
      holder.appendChild(el('div', 'crafted-slot', 'CRAFTED'));
    }
    wrap.appendChild(holder);
  });
  const snackBtn = $('#btn-snack');
  const recycleBtn = $('#btn-recycle');
  const napBtn = $('#btn-nap');
  if (snackBtn) {
    snackBtn.disabled = w.snackUsed || Engine.totalShards() < C.economy.snackCost || s.hp >= s.maxHp;
    snackBtn.onclick = () => { Engine.craftSnack(); renderWorkshop(); };
  }
  if (recycleBtn) {
    recycleBtn.disabled = s.deck.length <= 1;
    recycleBtn.onclick = () => recycleModal();
  }
  if (napBtn) {
    napBtn.disabled = w.napped;
    napBtn.textContent = w.napped ? '😴 Napped' : `😴 Nap +${C.economy.restHeal} HP (free)`;
    napBtn.onclick = () => { Engine.nap(); renderWorkshop(); };
  }
}

function reopenLift() {
  liftModal(lastFloorEnd || { floor: S().floor, seal: 0, last: S().floor >= C.floors.length });
}

function replaceCraftModal(incomingId) {
  const inc = C.cards[incomingId];
  const box = openModal(`
    <h2>SQUAD FULL!</h2>
    <p class="modal-sub">Melt a squad member to make room for <b>${Sprites.html('card_' + incomingId)} ${inc.name}</b> — or keep your squad</p>
    <div class="deck-grid" id="deck-grid"></div>
    <button class="btn" id="btn-skip-replace">KEEP MY SQUAD</button>
  `, 'modal-replace');
  const grid = box.querySelector('#deck-grid');
  S().deck.forEach((card, i) => {
    const d = cardEl(card, i, { static: true });
    d.addEventListener('click', () => {
      const r = Engine.replaceCraft(i);
      // lastWeapon keeps this modal open (engine toasts why) so another slot can be picked
      if (r.ok || r.why === 'materials') reopenLift();
    });
    grid.appendChild(d);
  });
  box.querySelector('#btn-skip-replace').onclick = () => { Engine.cancelCraft(); reopenLift(); };
}

function recycleModal() {
  const box = openModal(`
    <h2>♻️ MELT A CREATURE</h2>
    <p class="modal-sub">Melt one down for +${C.economy.recycleRefund} shards of its color</p>
    <div class="deck-grid" id="deck-grid"></div>
    <button class="btn" id="btn-cancel-remove">NEVER MIND</button>
  `, 'modal-replace');
  const grid = box.querySelector('#deck-grid');
  S().deck.forEach((card, i) => {
    const d = cardEl(card, i, { static: true });
    d.addEventListener('click', () => {
      const r = Engine.recycleCreature(i);
      if (r.ok || r.why === 'lastWeapon') reopenLift();
    });
    grid.appendChild(d);
  });
  box.querySelector('#btn-cancel-remove').onclick = reopenLift;
}

function deathModal(data) {
  saveBest();
  openModal(`
    <div class="death-art">${Sprites.html('reaper', 'death-img')}</div>
    <h2 class="danger-title">☠ FELLED ☠</h2>
    <p class="modal-sub">The Pink Reaper collected you — felled by <b>${data.source || 'the dungeon'}</b> on floor ${data.floor}</p>
    <div class="stats-grid">
      <div>Monsters felled <b>${data.stats.kills}</b></div>
      <div>Shards gathered <b>${data.stats.shardsEarned}</b></div>
      <div>Bubbles popped <b>${data.stats.bubbles}</b></div>
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
    <div class="death-art">${Sprites.html('player', 'death-img')}</div>
    <h2 class="gold-text">👑 DUNGEON CONQUERED 👑</h2>
    <p class="modal-sub">The Monster King has fallen. The warren is yours.</p>
    <div class="stats-grid">
      <div>Monsters felled <b>${data.stats.kills}</b></div>
      <div>Shards gathered <b>${data.stats.shardsEarned}</b></div>
      <div>Bubbles popped <b>${data.stats.bubbles}</b></div>
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
  // bubble — any difference is a free mimic detector.
  const looksLikeBubble = t.revealed && !t.opened &&
    ((t.kind === 'bubble' && !t.monster) || (t.monster && t.monster.disguised));
  if (looksLikeBubble) {
    showTip(`${Sprites.html('bubble')} <b>A bubble…</b> or is it? Pop it for ingredients. Boombo can test it from afar.`, e.clientX, e.clientY);
  } else if (t.revealed && t.monster && !t.monster.disguised) {
    const m = t.monster;
    const def = C.monsters[m.type];
    let extra;
    if (Engine.isDazed(m)) extra = '<br><b class="teal">DAZED — click to CATCH it! (no HP cost)</b>';
    else if (def.unbumpable) extra = '<br><b class="red">Immune to bare hands — creatures only!</b>';
    else extra = `<br>Destroy by hand: costs <b class="red">${m.pwr} HP</b>${def.boss ? '' : '<br><i>Weaken it to catch it instead.</i>'}`;
    showTip(`<b>${Sprites.html(m.type)} ${def.name}</b> — power ${m.pwr}${m.pwr !== m.basePwr ? ` (base ${m.basePwr})` : ''}<br><i>${def.desc}</i>${extra}`, e.clientX, e.clientY);
  } else if (t.revealed && t.corpse && t.loot) {
    const lootTxt = t.loot.ing ? `${C.ingredients[t.loot.ing].emoji} ${C.ingredients[t.loot.ing].name}` : `${t.loot.shards}× ${C.shards[t.loot.color].emoji} ${C.shards[t.loot.color].name} shards`;
    showTip(`✨ <b>A fallen ${C.monsters[t.corpse].name}.</b> Click to loot: ${lootTxt}`, e.clientX, e.clientY);
  } else if (!t.revealed && t.web) {
    showTip(`${Sprites.html('web')} <b>Webbed</b> — costs 1⚡ to tear (1 HP if you have no ⚡)`, e.clientX, e.clientY);
  } else if (t.revealed && t.kind === 'shards') {
    showTip(`${C.shards[t.shardColor].emoji} <b>${C.shards[t.shardColor].name} shards</b> — scooped up the moment this tile was uncovered.`, e.clientX, e.clientY);
  } else if (t.revealed && t.kind === 'lift') {
    showTip(`${Sprites.html('lift')} <b>The Lucky Lift.</b> Board it to leave the floor` + (tEl.classList.contains('locked') ? ' — <b class="red">jammed by the boss!</b>' : ' — and spin for prizes.'), e.clientX, e.clientY);
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
    if (cfg.boss) { SFX().boss(); toastLocal(`⚠ ${C.monsters[cfg.boss].name} lives here. The Lucky Lift is jammed!`, 'bad'); }
  });

  Bus.on('boardPlaced', () => { renderBestiary(); renderOmens(); });

  Bus.on('compass', ({ hint }) => {
    const chip = $('#compass-chip');
    chip.classList.remove('hidden');
    chip.innerHTML = `🧭 lift: <b>${hint}</b>`;
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
        if (t.kind === 'shards' && t.collected && t.shardAmt) FX.burstAt(d, { count: 10, colors: FX.PALETTES.gold, speed: 4 });
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
    // death poof: a burst of the monster's shard colour then a settling corpse
    const pal = cause === 'midas' ? FX.PALETTES.gold : (FX.PALETTES[shardPalette(def.frag)] || FX.PALETTES.blood);
    FX.burstAt(d, { count: def.boss ? 64 : 22, colors: pal, speed: def.boss ? 9 : 5.5, grav: 0.28 });
    FX.burstAt(d, { count: def.boss ? 30 : 10, colors: FX.PALETTES.bone, speed: 3, grav: 0.12 });
    updateTile(t);
    if (d) { d.classList.add('death-poof'); setTimeout(() => d.classList.remove('death-poof'), 520); }
    updateAllTiles({ pulse: true });
    renderBestiary();
    renderOmens();
    if (def.boss) { FX.shake('lg'); FX.flash('gold'); banner(def.name.toUpperCase() + ' DEFEATED!', 'banner-boss'); SFX().boss(); }
    else if (def.elite) { FX.flash('gold'); banner('ELITE DEFEATED!', 'banner-boss'); }
  });

  Bus.on('capture', ({ t, def, firstTime }) => {
    const d = tileEl(t);
    updateTile(t);
    if (d) {
      d.classList.add('captured-poof');
      setTimeout(() => d.classList.remove('captured-poof'), 620);
      FX.burstAt(d, { count: 26, colors: FX.PALETTES.cyan, speed: 5, grav: -0.06 });
      FX.burstAt(d, { count: 14, colors: FX.PALETTES.magic, speed: 3, grav: -0.03 });
      FX.floater(d, firstTime ? 'NEW!' : 'CAUGHT!', 'f-catch');
    }
    updateAllTiles({ pulse: true });
    renderBestiary();
    renderOmens();
    if (firstTime) {
      SFX().newCatch();
      FX.flash('magic');
      banner('NEW CATCH! ' + def.name.toUpperCase(), 'banner-catch');
    } else {
      SFX().capture();
      banner('CAUGHT!', 'banner-catch');
    }
  });

  Bus.on('looted', ({ t }) => {
    SFX().loot();
    const d = tileEl(t);
    if (d) FX.burstAt(d, { count: 12, colors: FX.PALETTES.gold, speed: 4, grav: -0.05 });
    updateTile(t);
  });

  Bus.on('shards', ({ color, gained, at }) => {
    if (gained > 0) SFX().coin();
    renderHUD();
    bumpStat('#stash-shards');
    if (at && tileEl(at) && color && gained > 0)
      FX.floater(tileEl(at), `+${gained} ${C.shards[color].emoji}`, 'f-gold');
  });

  Bus.on('ingredients', ({ kind, gained, at }) => {
    if (gained > 0) SFX().coin();
    renderHUD();
    bumpStat('#stash-ing');
    if (at && tileEl(at) && gained > 0)
      FX.floater(tileEl(at), `+${gained} ${C.ingredients[kind].emoji}`, 'f-gold');
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
    toastLocal(`${Sprites.html('card_' + id)} ${def.name} joins your squad!`, 'good');
    renderHand();
  });
  Bus.on('cardUpgraded', ({ id }) => {
    SFX().levelup();
    const def = C.cards[id];
    banner(def.name.toUpperCase() + ' II!', 'banner-level');
    renderHand();
  });
  Bus.on('cardRemoved', () => renderHand());

  Bus.on('bubblePopped', ({ t, got }) => {
    SFX().chest();
    FX.burstAt(tileEl(t), { count: 18, colors: FX.PALETTES.cyan, speed: 5, grav: -0.04 });
    updateTile(t);
  });

  Bus.on('craftNeedsSlot', ({ incoming }) => replaceCraftModal(incoming));

  Bus.on('relicGain', ({ id, def }) => {
    SFX().relic();
    banner(Sprites.html('relic_' + id) + ' ' + def.name.toUpperCase(), 'banner-relic');
    toastLocal(`Trinket claimed: ${def.desc}`, 'good');
    renderHUD();
  });
  // a slot-machine jackpot must let the reels finish their theater first
  Bus.on('relicChoice', ({ offers }) => later(() => { if (S().pendingRelicChoice) relicChoiceModal(offers); },
    S().phase === 'floorEnd' ? 2700 : 500));

  Bus.on('liftFound', ({ t }) => {
    SFX().stairs();
    toastLocal('You found the Lucky Lift!', 'good');
    FX.burstAt(tileEl(t), { count: 14, colors: FX.PALETTES.cyan, speed: 4 });
  });
  Bus.on('liftLocked', () => { FX.shake('sm'); });

  Bus.on('floorComplete', (data) => {
    SFX().stairs();
    lastFloorEnd = data;
    later(() => { if (S().phase === 'floorEnd') liftModal(data); }, 400);
  });

  Bus.on('death', (data) => {
    SFX().death();
    FX.shake('lg');
    FX.flash('blood');
    cancelPendingModals(); // a queued lift/trinket modal must not open over the grave
    clearTargeting();
    // a proper send-off: the whole warren tumbles, dimming to grey
    document.body.classList.add('dead', 'dying');
    FX.burst(innerWidth / 2, innerHeight / 2, { count: 40, colors: FX.PALETTES.blood, speed: 8, grav: 0.3 });
    later(() => FX.burst(innerWidth / 2, innerHeight / 2, { count: 24, colors: FX.PALETTES.bone, speed: 4, grav: 0.15 }), 250);
    later(() => {
      document.body.classList.remove('dead', 'dying');
      if (S().phase === 'gameover') deathModal(data);
    }, 1300);
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
    if (n >= 1 && n <= 8 && S() && S().phase === 'playing'
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
