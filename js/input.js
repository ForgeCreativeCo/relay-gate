/* Controls: right-click to move, hold left-click to fire (shots lock on to the enemy under or near the cursor). On touch, tap to move or to lock on, and the gun fires by itself. */
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

  /* Mouse: right button moves (hold to keep steering), left button fires (and clicking an enemy locks on to it).
     Touch: a tap on an enemy locks on, a tap on the ground moves, and holding keeps steering. Each press is queued as a command for the player. */
  let held = null; I.fireHeld = false;
  /* Mouse buttons are read from the pointer events' button mask: Babylon cancels pointerdown, which suppresses mousedown/mouseup,
     and a second button pressed while one is down only shows up as a change in the mask. */
  let buttons = 0;
  const mouseButtons = e => {
    const now = e.buttons & 3, pressed = now & ~buttons, released = buttons & ~now; buttons = now;
    if (pressed) { canvas.focus(); I.pointer = { x: e.clientX, y: e.clientY }; }
    if (pressed & 1) { I.fireHeld = true; I.clicks.push({ x: e.clientX, y: e.clientY, kind: 'fire' }); }
    if (pressed & 2) { I.clicks.push({ x: e.clientX, y: e.clientY, kind: 'move' }); held = { id: 'mouse', x: e.clientX, y: e.clientY, t: 0 }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} }
    if (released & 1) I.fireHeld = false;
    if ((released & 2) && held && held.id === 'mouse') held = null;
  };
  canvas.addEventListener('pointermove', e => {
    I.pointer = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'mouse') mouseButtons(e);
    if (held && (held.id === e.pointerId || (held.id === 'mouse' && e.pointerType === 'mouse'))) { held.x = e.clientX; held.y = e.clientY; }
  });
  canvas.addEventListener('pointerdown', e => { if (e.pointerType === 'mouse') mouseButtons(e); });
  window.addEventListener('pointerup', e => { if (e.pointerType === 'mouse') mouseButtons(e); });
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    I.pointer = { x: e.clientX, y: e.clientY };
    I.clicks.push({ x: e.clientX, y: e.clientY, kind: 'tap' });
    held = { id: e.pointerId, x: e.clientX, y: e.clientY, t: 0 };
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  const up = e => { if (held && held.id === e.pointerId) held = null; };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('mouseleave', () => { if (!held && !I.fireHeld) I.pointer = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); G.zoom = Math.min(42, Math.max(18, (G.zoom || 30) + e.deltaY * .02)); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', () => { held = null; buttons = 0; I.fireHeld = false; });

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
  I.release = () => { held = null; I.fireHeld = false; I.clicks = []; I.frameClicks = []; I.steer = null; };
  I.restStick = () => {};
  return I;
}
