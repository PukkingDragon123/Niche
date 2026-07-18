/* ============================================================
   DUNGEON SWEEPER — SPRITES
   Every visual entity is looked up here. The clay-toy PNGs in
   assets/sprites/ are wired up from the config (each monster
   and creature declares its sprite id); if a file is missing
   the emoji placeholder renders instead.
   ============================================================ */
(function (root) {
'use strict';

const C = root.DS_CONFIG;

const MANIFEST = {
  /* board features */
  bubble:  { file: null, emoji: '🫧' },   // drawn in CSS as a shiny orb
  lift:    { file: 'a07.png', emoji: '🎰' }, // Glitchy, the slot-bot lift
  web:     { file: null, emoji: '🕸️' },
  rubble:  { file: null, emoji: '🫠' },   // gunk splat (CSS blob + emoji)
  splat:   { file: null, emoji: '✨' },   // where a monster got squished
  lock:    { file: null, emoji: '⛓️' },
  /* cast photos for special screens */
  player:   { file: 'b08.png', emoji: '🧑‍🚀' }, // you, a small astronaut of the playroom
  workshop: { file: 'a02.png', emoji: '🐔' },  // Clucker, the workshop hen
  slotbot:  { file: 'a07.png', emoji: '🎰' },  // Glitchy again, big size
  reaper:   { file: 'a14.png', emoji: '💀' },  // the Pink Reaper collects you
};

/* monsters + creatures declare their sprite file in the config */
for (const [id, def] of Object.entries(C.monsters)) {
  MANIFEST[id] = { file: def.sprite ? def.sprite + '.png' : null, emoji: def.emoji };
}
for (const [id, def] of Object.entries(C.cards)) {
  MANIFEST['card_' + id] = { file: def.sprite ? def.sprite + '.png' : null, emoji: def.emoji };
}
/* trinkets & materials render as emoji chips (clay buttons) */
for (const [id, def] of Object.entries(C.relics)) {
  MANIFEST['relic_' + id] = { file: null, emoji: def.emoji };
}
for (const [id, def] of Object.entries(C.shards)) {
  MANIFEST['shard_' + id] = { file: null, emoji: def.emoji };
}
for (const [id, def] of Object.entries(C.ingredients)) {
  MANIFEST['ing_' + id] = { file: null, emoji: def.emoji };
}

const BASE = 'assets/sprites/';
const loaded = {};   // id -> 'img' | 'emoji'

/* Probe which sprite files actually exist (async, non-blocking).
   Until (or unless) a PNG loads, the emoji placeholder is shown. */
function preload() {
  if (typeof Image === 'undefined') return;
  for (const [id, def] of Object.entries(MANIFEST)) {
    if (!def.file) { loaded[id] = 'emoji'; continue; }
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
