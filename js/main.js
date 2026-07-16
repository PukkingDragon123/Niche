/* ============================================================
   DUNGEON SWEEPER — BOOT
   ============================================================ */
(function (root) {
'use strict';

function boot() {
  const DS = root.DS;
  DS.Audio.init();
  DS.Sprites.preload();
  DS.Shader.init(document.getElementById('bg'));
  DS.FX.init(document.getElementById('fx'));
  DS.UI.init();

  // wake the audio context on the first user gesture
  const wake = () => { DS.Audio.ensure(); document.removeEventListener('pointerdown', wake); };
  document.addEventListener('pointerdown', wake);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})(typeof globalThis !== 'undefined' ? globalThis : this);
