/* Controls: right-click to move, hold left-click to fire (shots lock on to the enemy under or near the cursor).
   On touch: a joystick under the left thumb moves, the fire button fires, and tapping an enemy locks on. */
import { G } from './core.js';

export function makeInput(canvas) {
  const $ = id => document.getElementById(id);
  const I = { pointer: null, mode: matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse', setting: 'auto', listeners: [], clicks: [] };
  const act = (name) => { if (G.paused && !['pack', 'menu', 'close', 'mute'].includes(name)) return; I.listeners.forEach(f => f(name)); };
  I.on = f => I.listeners.push(f);
  I.setMode = (m, manual) => { if (manual) I.setting = m; const next = I.setting === 'auto' ? (m === 'auto' ? I.mode : m) : I.setting; if (next !== I.mode || manual) { I.mode = next; document.body.dataset.mode = I.mode; if (G.UI) G.UI.modeChanged(); } };
  const auto = m => { if (I.setting === 'auto' && m !== I.mode) { I.mode = m; document.body.dataset.mode = m; if (G.UI) G.UI.modeChanged(); } };
  document.body.dataset.mode = I.mode;

  window.addEventListener('pointerdown', e => auto(e.pointerType === 'touch' ? 'touch' : 'mouse'), true);
  window.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' && (Math.abs(e.movementX) + Math.abs(e.movementY)) > 2) auto('mouse'); }, true);
  const KEYMAP = { Space: 'dash', ShiftLeft: 'dash', KeyQ: 'swap', KeyE: 'interact', KeyF: 'interact', KeyI: 'pack', Tab: 'pack', KeyC: 'command', Escape: 'menu', KeyT: 'part', KeyS: 'stop', KeyM: 'mute', KeyB: 'build' };
  window.addEventListener('keydown', e => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    if (!e.repeat && KEYMAP[e.code]) act(KEYMAP[e.code]);
  });

  /* Mouse: right button moves (hold to keep steering), left button fires (and clicking an enemy locks on to it).
     Each press is queued as a command for the player. */
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
  /* Touch: a thumb landing on the left side of the screen grabs a floating joystick there; a tap anywhere else is a targeting tap. */
  const stickEl = $('stick'), knob = $('knob'), STICK_R = 56;
  let stick = null;
  const placeStick = (x, y) => { stickEl.style.transform = `translate(${x}px,${y}px)`; };
  const placeKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px,${dy}px)`; };
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    I.pointer = { x: e.clientX, y: e.clientY };
    if (!stick && e.clientX < innerWidth * .45) { stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 }; placeStick(e.clientX, e.clientY); placeKnob(0, 0); stickEl.classList.add('on'); }
    else I.clicks.push({ x: e.clientX, y: e.clientY, kind: 'tap' });
    try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', e => {
    if (!stick || stick.id !== e.pointerId) return;
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy);
    /* dragging past the rim pulls the stick along behind your thumb */
    if (d > STICK_R) { const k = (d - STICK_R) / d; stick.ox += dx * k; stick.oy += dy * k; dx -= dx * k; dy -= dy * k; placeStick(stick.ox, stick.oy); }
    stick.dx = dx; stick.dy = dy; placeKnob(dx, dy);
  });
  const up = e => { if (held && held.id === e.pointerId) held = null; if (stick && stick.id === e.pointerId) I.restStick(); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('mouseleave', () => { if (!held && !I.fireHeld) I.pointer = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); G.zoom = Math.min(42, Math.max(18, (G.zoom || 30) + e.deltaY * .02)); }, { passive: false });
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  window.addEventListener('blur', () => { held = null; buttons = 0; I.fireHeld = false; I.restStick(); });

  const tap = (id, a) => { const b = $(id); b.addEventListener('pointerdown', e => { e.preventDefault(); act(a); b.classList.add('on'); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, () => b.classList.remove('on'))); b.addEventListener('contextmenu', e => e.preventDefault()); };
  for (const [id, a] of [['dashBtn', 'dash'], ['swapBtn', 'swap'], ['useBtn', 'interact'], ['partBtn', 'part'], ['cmdBtn', 'command']]) tap(id, a);
  /* the fire button: held down, it fires, the same as holding left-click */
  { const b = $('fireBtn'), off = () => { I.fireHeld = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', e => { e.preventDefault(); if (G.paused) return; I.fireHeld = true; b.classList.add('on'); try { b.setPointerCapture(e.pointerId); } catch (_) {} });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => b.addEventListener(ev, off)); b.addEventListener('contextmenu', e => e.preventDefault()); }

  /* Called once a frame: hands over this frame's clicks, a steering point while the right button is held, and the joystick (screen x right, y down, length up to 1). */
  I.update = (dt) => {
    const out = I.frameClicks = I.clicks; I.clicks = [];
    I.steer = null;
    if (held) { held.t += dt; if (held.t > .18) I.steer = { x: held.x, y: held.y }; }
    I.stick = null;
    if (stick) { const m = Math.hypot(stick.dx, stick.dy) / STICK_R; if (m > .15) I.stick = { x: stick.dx / STICK_R, y: stick.dy / STICK_R, m: Math.min(1, m) }; }
    return out;
  };
  I.release = () => { held = null; I.fireHeld = false; I.clicks = []; I.frameClicks = []; I.steer = null; $('fireBtn').classList.remove('on'); I.restStick(); };
  /* the joystick waits, faded, where a left thumb naturally rests */
  I.restStick = () => { stick = null; I.stick = null; stickEl.classList.remove('on'); placeKnob(0, 0); placeStick(Math.max(110, innerWidth * .12), innerHeight - Math.max(110, innerHeight * .26)); };
  return I;
}
