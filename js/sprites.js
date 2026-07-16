/* ============================================================
   DUNGEON SWEEPER — SPRITES
   Every visual entity is looked up here. Drop PNG files into
   assets/sprites/ using the filenames below and they are used
   automatically — otherwise the emoji placeholder renders.
   (See assets/sprites/README.md)
   ============================================================ */
(function (root) {
'use strict';

const MANIFEST = {
  /* monsters */
  rat:        { file: 'rat.png',        emoji: '🐀' },
  bat:        { file: 'bat.png',        emoji: '🦇' },
  slime:      { file: 'slime.png',      emoji: '🫠' },
  slimeling:  { file: 'slimeling.png',  emoji: '🫧' },
  ghost:      { file: 'ghost.png',      emoji: '👻' },
  skeleton:   { file: 'skeleton.png',   emoji: '💀' },
  spider:     { file: 'spider.png',     emoji: '🕷️' },
  orc:        { file: 'orc.png',        emoji: '👹' },
  shaman:     { file: 'shaman.png',     emoji: '🧙' },
  mimic:      { file: 'mimic.png',      emoji: '👿' },
  ogre:       { file: 'ogre.png',       emoji: '🧌' },
  wraith:     { file: 'wraith.png',     emoji: '🪦' },
  colossus:   { file: 'colossus.png',   emoji: '🗿' },
  heart:      { file: 'heart.png',      emoji: '❤️‍🔥' },
  /* board features */
  chest:      { file: 'chest.png',      emoji: '🎁' },
  chest_open: { file: 'chest_open.png', emoji: '🎀' },
  gold:       { file: 'gold.png',       emoji: '🪙' },
  stairs:     { file: 'stairs.png',     emoji: '🪜' },
  web:        { file: 'web.png',        emoji: '🕸️' },
  rubble:     { file: 'rubble.png',     emoji: '🪨' },
  corpse:     { file: 'corpse.png',     emoji: '🦴' },
  lock:       { file: 'lock.png',       emoji: '⛓️' },
  /* cards */
  card_slash:      { file: 'card_slash.png',      emoji: '⚔️' },
  card_bow:        { file: 'card_bow.png',        emoji: '🏹' },
  card_torch:      { file: 'card_torch.png',      emoji: '🔥' },
  card_heal:       { file: 'card_heal.png',       emoji: '💗' },
  card_dagger:     { file: 'card_dagger.png',     emoji: '🗡️' },
  card_excavate:   { file: 'card_excavate.png',   emoji: '⛏️' },
  card_ward:       { file: 'card_ward.png',       emoji: '🛡️' },
  card_relocate:   { file: 'card_relocate.png',   emoji: '🌀' },
  card_scry:       { file: 'card_scry.png',       emoji: '👁️' },
  card_whirlwind:  { file: 'card_whirlwind.png',  emoji: '🌪️' },
  card_purify:     { file: 'card_purify.png',     emoji: '🕯️' },
  card_fireball:   { file: 'card_fireball.png',   emoji: '☄️' },
  card_chain:      { file: 'card_chain.png',      emoji: '⚡' },
  card_midas:      { file: 'card_midas.png',      emoji: '👑' },
  card_focus:      { file: 'card_focus.png',      emoji: '💫' },
  card_divination: { file: 'card_divination.png', emoji: '🔮' },
  /* relics */
  relic_lantern:    { file: 'relic_lantern.png',    emoji: '🏮' },
  relic_whetstone:  { file: 'relic_whetstone.png',  emoji: '🪓' },
  relic_quiver:     { file: 'relic_quiver.png',     emoji: '🎯' },
  relic_bloodvial:  { file: 'relic_bloodvial.png',  emoji: '🩸' },
  relic_luckycoin:  { file: 'relic_luckycoin.png',  emoji: '🍀' },
  relic_compass:    { file: 'relic_compass.png',    emoji: '🧭' },
  relic_boots:      { file: 'relic_boots.png',      emoji: '🥾' },
  relic_ghostglass: { file: 'relic_ghostglass.png', emoji: '🧿' },
  relic_stormring:  { file: 'relic_stormring.png',  emoji: '💍' },
};

const BASE = 'assets/sprites/';
const loaded = {};   // id -> 'img' | 'emoji'

/* Probe which sprite files actually exist (async, non-blocking).
   Until (or unless) a PNG loads, the emoji placeholder is shown. */
function preload() {
  if (typeof Image === 'undefined') return;
  for (const [id, def] of Object.entries(MANIFEST)) {
    const img = new Image();
    img.onload = () => {
      loaded[id] = 'img';
      document.querySelectorAll(`[data-sprite="${id}"]`).forEach(el => applyTo(el, id));
    };
    img.onerror = () => { loaded[id] = 'emoji'; };
    img.src = BASE + def.file;
  }
}

/* Build a sprite element (span with emoji, swapped to img if available) */
function el(id, cls) {
  const def = MANIFEST[id] || { emoji: '❓' };
  const span = document.createElement('span');
  span.className = 'sprite ' + (cls || '');
  span.dataset.sprite = id;
  applyTo(span, id);
  return span;
}

function applyTo(node, id) {
  const def = MANIFEST[id] || { emoji: '❓' };
  if (loaded[id] === 'img') {
    node.innerHTML = '';
    const img = document.createElement('img');
    img.src = BASE + def.file;
    img.alt = id;
    img.draggable = false;
    node.appendChild(img);
  } else {
    node.textContent = def.emoji;
  }
}

/* Plain string for contexts where HTML injection is fine */
function html(id, cls) {
  const def = MANIFEST[id] || { emoji: '❓' };
  if (loaded[id] === 'img') return `<span class="sprite ${cls || ''}" data-sprite="${id}"><img src="${BASE}${def.file}" alt="${id}" draggable="false"></span>`;
  return `<span class="sprite ${cls || ''}" data-sprite="${id}">${def.emoji}</span>`;
}

root.DS = root.DS || {};
root.DS.Sprites = { MANIFEST, preload, el, html };

})(typeof globalThis !== 'undefined' ? globalThis : this);
