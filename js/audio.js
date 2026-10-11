/* Sound: sample playback through Web Audio. Files live in sfx/; a missing or undecodable file just stays silent.
   Gunfire recordings are bursts, cut into single shots at load so each trigger pull plays one shot in time with the game's fire rate. */
import { G } from './core.js';

/* Each bank is one recording and the start time (seconds) of every shot in it. A shot is cut where the next one starts;
   the last shot of a burst keeps its natural decay. */
const BANKS = {
  /* "Dry assault rifle automatic": a 13-round burst, then four single shots */
  player: { url: 'sfx/player-gun.mp3', shots: [0.276, 0.366, 0.451, 0.541, 0.621, 0.712, 0.797, 0.882, 0.972, 1.057, 1.143, 1.233, 1.323, 3.052, 3.398, 4.094, 4.786] },
  /* "Auto gun shots": three long bursts at about 9 rounds a second, plus a few separate shots */
  machine: { url: 'sfx/machine-gun.mp3', shots: [0.014, 0.106, 0.218, 0.328, 0.438, 0.546, 0.654, 0.766, 0.876, 0.986, 1.094, 1.204, 1.318, 1.482, 1.578, 1.69, 1.8, 1.91, 2.046, 2.148, 2.254, 2.364, 2.548, 2.626, 2.694, 3.016, 3.116, 3.224, 3.332, 3.446, 3.552, 3.664, 3.772, 3.88, 3.996, 4.144, 4.242, 4.352, 4.462, 4.572] },
};
/* How each shooter uses its bank: playback rate (pitch), volume, and the longest a shot may ring. */
const VOICES = {
  rifle: { bank: 'player', rate: 1, gain: .55, len: .16 },
  smg: { bank: 'player', rate: 1.12, gain: .45, len: .12 },
  shotgun: { bank: 'player', rate: .72, gain: .8, len: .3 },
  marksman: { bank: 'player', rate: .82, gain: .75, len: .28 },
  arc: { bank: 'player', rate: 1.2, gain: .5, len: .16 },
  drone: { bank: 'machine', rate: 1.25, gain: .4, len: .14 },
  walker: { bank: 'machine', rate: .9, gain: .6, len: .2 },
  warden: { bank: 'machine', rate: .75, gain: .75, len: .26 },
};
/* One-off sounds: file, and the part of it worth playing (the rest is silence). With several starts, each play picks one. */
const CLIPS = {
  /* "Mech attack": a walker (or the Warden) locking on to you */
  engage: { url: 'sfx/mech-engage.mp3', start: 0, len: 2.9 },
  /* "Rusty mech stomp": three stomps; each start sits a moment before the impact so the thud lands with the foot */
  step: { url: 'sfx/mech-step.mp3', start: [0.67, 2.445, 3.905], len: .9 },
  /* "Mech master": a whirring machine sound that fades out over ~3 s. Played whole for a drone spotting you and (deeper) for a mech losing a part. */
  whir: { url: 'sfx/mech-hum.mp3', start: 0, len: 3.4 },
  /* "Step": two footsteps, used alternately for the player */
  pstep: { url: 'sfx/player-step.mp3', start: [0.03, 0.62], len: .22 },
  /* "Loud explosion": a walker or the Warden going down */
  boomBig: { url: 'sfx/explosion-big.mp3', start: 0, len: 2.9 },
  /* "Small explosion": a drone hitting the ground */
  boomSmall: { url: 'sfx/explosion-small.mp3', start: .03, len: 1 },
};
/* Drone hover hum ("Circuits hum 10"): overlapping one-second grains from the body of the recording (it fades in over the first 2 s and out over the last 2),
   crossfaded so it never loops audibly. Only the nearest few drones hum, to keep the voice count down. */
/* sine-shaped grain envelope; two of these overlapping by half sum to constant power */
const GRAIN_CURVE = Float32Array.from({ length: 64 }, (_, i) => Math.sin(Math.PI * i / 63));
const HUM = { url: 'sfx/drone-hum.mp3', from: 2.4, to: 6, grain: 1, every: .5, gain: .25, drones: 3 };
const MAX_VOICES = 24, HEAR = 42;   // simultaneous sounds; distance (m) at which machines fall silent

export function makeAudio() {
  const A = { ctx: null, master: null, buffers: {}, voices: 0 };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { A.unlock = A.shot = A.play = A.apply = A.updateHums = A.silenceHums = () => {}; return A; }
  A.ctx = new AC();
  A.master = A.ctx.createGain(); A.master.connect(A.ctx.destination);

  A.load = async (name, url) => {
    try { const res = await fetch(url); if (!res.ok) return; A.buffers[name] = await A.ctx.decodeAudioData(await res.arrayBuffer()); }
    catch (e) { /* stays silent */ }
  };
  /* Browsers start audio suspended until the player interacts with the page. */
  A.unlock = () => { if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {}); };
  ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, A.unlock, { capture: true, passive: true }));
  /* Volume and mute come from the saved settings. */
  A.apply = () => { const S = G.settings || {}; const v = S.mute ? 0 : (S.volume == null ? .8 : S.volume); A.master.gain.setTargetAtTime(v, A.ctx.currentTime, .02); };

  /* Where a sound sits relative to the listener (the camera's focus): quieter with distance, panned by left/right on screen. */
  function place(pos, hear = HEAR) {
    const cam = G.camera; if (!pos || !cam) return { gain: 1, pan: 0 };
    const t = cam.target, dx = pos.x - t.x, dz = pos.z - t.z, d = Math.hypot(dx, dz);
    if (d >= hear) return null;
    const fx = t.x - cam.position.x, fz = t.z - cam.position.z, fl = Math.hypot(fx, fz) || 1;
    const right = (dx * fz - dz * fx) / fl;   // screen-right component
    return { gain: Math.pow(1 - d / hear, 1.6), pan: Math.max(-.8, Math.min(.8, right / 18)) };
  }

  /* Play part of a buffer with a quick fade-out so cuts never click. */
  function slice(buf, start, len, rate, gain, pan) {
    if (!buf || A.voices >= MAX_VOICES || A.ctx.state !== 'running') return;
    const t = A.ctx.currentTime, src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate;
    const real = len / rate, fade = Math.min(.04, real * .4);
    g.gain.setValueAtTime(gain, t); g.gain.setValueAtTime(gain, t + real - fade); g.gain.linearRampToValueAtTime(0, t + real);
    let out = g;
    if (pan && A.ctx.createStereoPanner) { const p = A.ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    src.connect(g); out.connect(A.master);
    src.start(t, Math.max(0, start), len + .01); A.voices++;
    src.onended = () => { A.voices--; src.disconnect(); g.disconnect(); if (out !== g) out.disconnect(); };
  }

  const lastShot = {};
  /* One gunshot. who: a weapon archetype for the player, or drone / walker / warden. pos: where it came from (omit for the player). */
  A.shot = (who, pos) => {
    const v = VOICES[who] || VOICES.rifle, bank = BANKS[v.bank], buf = A.buffers[v.bank]; if (!buf) return;
    const at = place(pos); if (!at) return;
    const S = bank.shots; let k = Math.floor(Math.random() * S.length); if (k === lastShot[v.bank]) k = (k + 1) % S.length; lastShot[v.bank] = k;
    const gap = S[k + 1] ? S[k + 1] - S[k] : 1, len = Math.min(v.len, gap < .2 ? gap - .004 : v.len);
    slice(buf, S[k] - .004, len, v.rate * (.97 + Math.random() * .06), v.gain * at.gain * (.9 + Math.random() * .1), at.pan);
  };

  /* A one-off clip. opts: pos (for distance and pan), hear (how far away it can be heard, default 42 m), rate (pitch), gain, vary (small random pitch),
     and gap: plays sharing a key (default the clip name) are at least this many seconds apart, so a pack of machines doesn't stack the same sound. */
  const lastPlay = {};
  A.play = (name, opts = {}) => {
    const c = CLIPS[name], buf = A.buffers[name]; if (!c || !buf) return;
    if (opts.gap) { const k = opts.key || name, now = A.ctx.currentTime; if (now - (lastPlay[k] || -1e9) < opts.gap) return; lastPlay[k] = now; }
    const at = place(opts.pos, opts.hear); if (!at) return;
    const start = Array.isArray(c.start) ? c.start[Math.floor(Math.random() * c.start.length)] : c.start, jitter = opts.vary ? .95 + Math.random() * .1 : 1;
    slice(buf, start, Math.min(c.len, buf.duration - start), (opts.rate || 1) * jitter, (opts.gain == null ? 1 : opts.gain) * at.gain, at.pan);
  };

  /* Hover hums, one per drone in earshot. Called every game frame with the drones that could be humming. */
  const hums = new Map();
  A.updateHums = (drones) => {
    const buf = A.buffers.hum; if (!buf || A.ctx.state !== 'running') return;
    const now = A.ctx.currentTime, near = [];
    for (const d of drones) { const at = place(d.pos); if (at) near.push([d, at]); }
    near.sort((a, b) => b[1].gain - a[1].gain); near.length = Math.min(near.length, HUM.drones);
    const keep = new Set(near.map(n => n[0]));
    for (const [d, h] of hums) if (!keep.has(d)) { h.out.gain.setTargetAtTime(0, now, .08); setTimeout(() => { h.out.disconnect(); h.pan.disconnect(); }, 600); hums.delete(d); }
    for (const [d, at] of near) {
      let h = hums.get(d);
      if (!h) { const out = A.ctx.createGain(), pan = A.ctx.createStereoPanner ? A.ctx.createStereoPanner() : A.ctx.createGain(); out.gain.value = 0; out.connect(pan); pan.connect(A.master); h = { out, pan, next: now, rate: .95 + Math.random() * .15 }; hums.set(d, h); }
      h.out.gain.setTargetAtTime(HUM.gain * at.gain, now, .1); if (h.pan.pan) h.pan.pan.setTargetAtTime(at.pan, now, .1);
      if (h.next < now) h.next = now;
      while (h.next < now + .3) {   // keep grains scheduled a little ahead
        const src = A.ctx.createBufferSource(), g = A.ctx.createGain(), t = h.next, len = HUM.grain / h.rate;
        src.buffer = buf; src.playbackRate.value = h.rate;
        g.gain.setValueCurveAtTime(GRAIN_CURVE, t, len);   // equal-power: overlapping grains add up to a steady level
        src.connect(g); g.connect(h.out); src.start(t, HUM.from + Math.random() * (HUM.to - HUM.from - HUM.grain), HUM.grain);
        src.onended = () => { src.disconnect(); g.disconnect(); };
        h.next += HUM.every / h.rate;
      }
    }
  };
  /* Pausing (menus) stops the hums; they pick up again on the next game frame. */
  A.silenceHums = () => { for (const [, h] of hums) { h.out.gain.setTargetAtTime(0, A.ctx.currentTime, .05); h.next = 0; } };

  for (const k in BANKS) A.load(k, BANKS[k].url);
  for (const k in CLIPS) A.load(k, CLIPS[k].url);
  A.load('hum', HUM.url);
  return A;
}
