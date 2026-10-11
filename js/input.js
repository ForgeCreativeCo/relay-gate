/* Controls: click or tap to move and to pick a target; the gun locks on and fires by itself. Touch and mouse share the scheme, only the buttons differ. */
import { G } from './core.js';

export function makeInput(canvas) {
  const $ = id => document.getElementById(id);
  const I = { pointer: null, mode: matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse', setting: 'auto', listeners: [], clicks: [] };
  const act = (name) => { if (G.paused && !['pack', 'menu', 'close'].includes(name)) return; I.listeners.forEach(f => f(name)); };
  I.on = f => I.listeners.push(f);
  I.setMode = (m, manual) => { if (manual) I.setting = m; const next = I.setting === 'auto' ? (m === 'auto' ? I.mode : m) : I.setting; if (next !== I.mode || manual) { I.mode = next; document.body.dataset.mode = I.mode; if (G.UI) G.UI.modeChanged(); } };
  const auto = m => { if (I.setting === 'auto' && m !== I.mode) { I.mode = m; document.body.dataset.mode = m; if (G.UI) G.UI.modeChanged(); } };
  document.body.dataset.mode = I.mode;

  window.addEventListener('pointerdown', e => auto(e.pointerType === 'touch' ? 'touch' : 'mouse'), true);
  window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && (Math.abs(e.movementX) + Math.abs(e.movementY)) > 2) auto('mouse'); }, true);
  const KEYMAP = { Space: 'dash', ShiftLeft: 'dash', KeyQ: 'swap', KeyE: 'interact', KeyF: 'interact', KeyI: 'pack', Tab: 'pack', KeyC: 'command', Escape: 'menu', KeyT: 'part', KeyS: 'stop' };
  window.addEventListener('keydown', e => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (!e.repeat && KEYMAP[e.code]) act(KEYMAP[e.code]);
  });

  /* Click or tap: queued as a command for the player. Holding the mouse button down on the ground keeps steering toward the cursor. */
  let held = null;
  canvas.addEventListener('pointermove', e => { I.pointer = { x: e.clientX, y: e.clientY }; if (held && held.id === e.pointerId) { held.x = e.clientX; held.y = e.clientY; } });
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    canvas.focus(); I.pointer = { x: e.clientX, y: e.clientY };
    I.clicks.push({ x: e.clientX, y: e.clientY });
    held = { id: e.pointerId, x: e.clientX, y: e.clientY, t: 0 };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const up = e => { if (held && held.id === e.pointerId) held = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('mouseleave', () => { if (!held) I.pointer = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); G.zoom = Math.min(42, Math.max(18, (G.zoom || 30) + e.deltaY * .02)); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', () => { held = null; });

  const tap = (id, a) => { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); act(a); b.classList.add('on'); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, () => b.classList.remove('on'))); b.addEventListener('contextmenu', e => e.preventDefault()); };
  for (const [id, a] of [['dashBtn', 'dash'], ['swapBtn', 'swap'], ['useBtn', 'interact'], ['partBtn', 'part'], ['cmdBtn', 'command']]) tap(id, a);

  /* Called once a frame: hands over this frame's clicks, plus a steering point while the button is held. */
  I.update = (dt) => {
    const out = I.frameClicks = I.clicks; I.clicks = [];
    I.steer = null;
    if (held) { held.t += dt; if (held.t > .18) I.steer = { x: held.x, y: held.y }; }
    return out;
  };
  I.release = () => { held = null; I.clicks = []; I.frameClicks = []; I.steer = null; };
  I.restStick = () => {};
  return I;
}
