/* Sound: sample playback through Web Audio. Files live in sfx/; a missing or undecodable file just stays silent.
   A few of 1984's sounds aren't recordings: its payphones, its rain and its boss's music are made here, out of oscillators and noise.
   Gunfire recordings are bursts, cut into single shots at load so each trigger pull plays one shot in time with the game's fire rate. */
import { G } from './core.js';

/* Each bank is one recording and the start time (seconds) of every shot in it. A shot is cut where the next one starts;
   the last shot of a burst keeps its natural decay. */
const BANKS = {
  /* "Dry assault rifle automatic": a 13-round burst, then four single shots */
  player: { url: 'sfx/player-gun.mp3', shots: [0.276, 0.366, 0.451, 0.541, 0.621, 0.712, 0.797, 0.882, 0.972, 1.057, 1.143, 1.233, 1.323, 3.052, 3.398, 4.094, 4.786] },
  /* "Auto gun shots": three long bursts at about 9 rounds a second, plus a few separate shots */
  machine: { url: 'sfx/machine-gun.mp3', shots: [0.014, 0.106, 0.218, 0.328, 0.438, 0.546, 0.654, 0.766, 0.876, 0.986, 1.094, 1.204, 1.318, 1.482, 1.578, 1.69, 1.8, 1.91, 2.046, 2.148, 2.254, 2.364, 2.548, 2.626, 2.694, 3.016, 3.116, 3.224, 3.332, 3.446, 3.552, 3.664, 3.772, 3.88, 3.996, 4.144, 4.242, 4.352, 4.462, 4.572] },
  /* "Gunshot SMG loop": about 16 rounds a second; the clean shots only (where two overlap, both are left out) */
  smg: { url: 'sfx/smg-gun.mp3', shots: [0.025, 0.08, 0.146, 0.207, 0.272, 0.332, 0.397, 0.457, 0.522, 0.582, 0.773, 0.833, 0.898] },
  /* "Cinematic shotgun with reload": the pump racked (0.02 s), then the blast (0.62 s) ringing out to about 2.1 s */
  shotgun: { url: 'sfx/shotgun-shot.mp3', shots: [0.618] },
  /* "Sniper rifle firing shot 1": one shot with a long echo, gone by about 1.8 s */
  marksman: { url: 'sfx/marksman-shot.mp3', shots: [0.046] },
};
/* How each shooter uses its bank: playback rate (pitch), volume, the longest a shot may ring, and (optionally) how long it fades out.
   after: a second slice of the same recording played a moment later (the shotgun's pump). */
const VOICES = {
  rifle: { bank: 'player', rate: 1, gain: .55, len: .16 },
  smg: { bank: 'smg', rate: 1, gain: .7, len: .058 },   // the recording's shots are 60 ms apart, so each is cut short of the next
  shotgun: { bank: 'shotgun', rate: 1, gain: .3, len: 1.4, fade: .5, after: { start: .023, len: .32, gain: .25, delay: .42 } },
  marksman: { bank: 'marksman', rate: 1, gain: .4, len: 1.6, fade: .6 },
  arc: { bank: 'player', rate: 1.2, gain: .5, len: .16 },
  drone: { bank: 'machine', rate: 1.25, gain: .4, len: .14 },
  walker: { bank: 'machine', rate: .9, gain: .6, len: .2 },
  warden: { bank: 'machine', rate: .75, gain: .75, len: .26 },
};
/* One-off sounds: file, and the part of it worth playing (the rest is silence). With several starts, each play picks one. */
const CLIPS = {
  /* "Mech attack": a walker (or the Warden) locking on to you */
  engage: { url: 'sfx/mech-engage.mp3', start: 0, len: 2.9 },
  /* "Power on": layered with engage, the mech powering up its weapons */
  powerOn: { url: 'sfx/power-on.mp3', start: .04, len: 2.48 },
  /* "Power off": a mech dying, winding down into the big explosion (it stays loud to the end, so it's cut and faded under the blast) */
  powerOff: { url: 'sfx/power-off.mp3', start: .04, len: 2.48 },
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
  /* "Mechanical sound design elements, robot 012": layered with a drone's crash explosion (mechanical chatter, then a falling wind-down) */
  droneDeath: { url: 'sfx/drone-death.mp3', start: .2, len: 4.6 },
};
/* Drone hover hum ("Circuits hum 10"): overlapping one-second grains from the body of the recording (it fades in over the first 2 s and out over the last 2),
   crossfaded so it never loops audibly. Only the nearest few drones hum, to keep the voice count down. */
/* sine-shaped grain envelope; two of these overlapping by half sum to constant power */
const GRAIN_CURVE = Float32Array.from({ length: 64 }, (_, i) => Math.sin(Math.PI * i / 63));
const HUM = { url: 'sfx/drone-hum.mp3', from: 2.4, to: 6, grain: 1, every: .5, gain: .25, drones: 3 };
/* Background ambience: two long soundscapes that alternate, each crossfading into the next, under everything else.
   Now and then a horn sounds somewhere far off: filtered, quieter, and from a random side. Where the horn is a signal instead (G.R.hornSignals:
   survival sounds it when a wave arrives) it never sounds at random, and the signal is shorter, clearer and at the main volume, not the ambience's.
   A region can bring its own soundscapes instead (G.R.ambience, in the same shape as `beds`); a single one crossfades into itself.
   A bed can carry its own `gain` (a quiet recording turned up). One marked `accent` isn't a bed: it swells up over them now and then,
   `every` so many seconds (the first after `first`), from a random side. */
const AMBIENCE = {
  beds: [
    { name: 'ambTerror', url: 'sfx/ambience-terror.mp3', from: .5, to: 105 },        // "Terror ambience" (fades out after ~105 s)
    { name: 'ambWaste', url: 'sfx/ambience-wasteland.mp3', from: 0, to: 60 },        // "A post-apocalyptic ambient soundscape"
  ],
  gain: .3, fade: 6,
  horn: { name: 'horn', url: 'sfx/horn.mp3', from: .7, to: 9.4, gain: .5, first: [25, 50], every: [75, 160], signal: .5, signalLen: 4.5 },   // "Apocalyptic horn"
};
/* Music: one track at a time on its own volume, crossfading when the game wants a different one (survival.js decides which: the boss,
   walkers about or a raid on Dead City's camp, the station's blackouts, the city's own; main.js plays the title's). Each loops over [from, to], the part of the
   recording worth hearing (the trailer's silent break and every track's tail are left out); gain evens out how loud they were recorded. */
const MUSIC = {
  title: { name: 'musCue', url: 'sfx/music-scifi-cue.mp3', from: .2, to: 50.5, gain: .45 },      // "Sci-fi music cue", freesound_community
  blackout: { name: 'musCue', url: 'sfx/music-scifi-cue.mp3', from: .2, to: 50.5, gain: .45 },   // the same cue, building through a station blackout
  city: { name: 'musEpic', url: 'sfx/music-epic.mp3', from: 0, to: 185.5, gain: .9 },          // "Epic game music" by Kris Klavenes, freesound_community
  boss: { name: 'musBoss', url: 'sfx/music-boss.mp3', from: .7, to: 33.2, gain: .4 },          // "Total war: epic action cinematic trailer" by audioatlant, before its break
  drums: { name: 'musDrums', url: 'sfx/music-drums.mp3', from: 0, to: 39.3, gain: .3 },     // "Battle warrior fighting drums" by tatamusic
  eighties: { name: 'mus80s', url: 'sfx/music-80s-beat.mp3', from: 14, to: 225, gain: .85 },   // "80s retro beat 001", freesound_community: 1984's music, without its slow way in and its wind-down
  /* the Infiltrator's music isn't a recording: a drum machine, a bass line and an arpeggio played here (synthTrack below) */
  synthBoss: { synth: true, bpm: 128, gain: .55, drive: true },
};
const MUSIC_FADE = 2;
const MAX_VOICES = 24, HEAR = 42;   // simultaneous sounds; distance (m) at which machines fall silent

export function makeAudio() {
  const A = { ctx: null, master: null, buffers: {}, voices: 0 };
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) { A.unlock = A.shot = A.play = A.apply = A.updateHums = A.silenceHums = A.startAmbience = A.horn = A.music = A.ring = A.preloadMusic = () => {}; return A; }
  A.ctx = new AC();
  A.master = A.ctx.createGain(); A.master.connect(A.ctx.destination);
  A.amb = A.ctx.createGain(); A.amb.connect(A.master);   // ambience has its own level under the master volume
  A.mus = A.ctx.createGain(); A.mus.connect(A.master);   // and so does music

  A.load = async (name, url) => {
    try { const res = await fetch(url); if (!res.ok) return; A.buffers[name] = await A.ctx.decodeAudioData(await res.arrayBuffer()); }
    catch (e) { /* stays silent */ }
  };
  /* Browsers start audio suspended until the player interacts with the page. */
  A.unlock = () => { if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {}); };
  ['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, A.unlock, { capture: true, passive: true }));
  /* Volume and mute come from the saved settings. */
  A.apply = () => { const S = G.settings || {}; const v = S.mute ? 0 : (S.volume == null ? .8 : S.volume); A.master.gain.setTargetAtTime(v, A.ctx.currentTime, .02);
    A.amb.gain.setTargetAtTime(S.ambience == null ? .6 : S.ambience, A.ctx.currentTime, .05); A.mus.gain.setTargetAtTime(S.music == null ? .6 : S.music, A.ctx.currentTime, .05); };

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
  function slice(buf, start, len, rate, gain, pan, fadeOut) {
    if (!buf || A.voices >= MAX_VOICES || A.ctx.state !== 'running') return;
    const t = A.ctx.currentTime, src = A.ctx.createBufferSource(), g = A.ctx.createGain();
    src.buffer = buf; src.playbackRate.value = rate;
    const real = len / rate, fade = fadeOut ? Math.min(fadeOut, real * .5) : Math.min(.04, real * .4);
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
    slice(buf, S[k] - .004, len, v.rate * (.97 + Math.random() * .06), v.gain * at.gain * (.9 + Math.random() * .1), at.pan, v.fade);
    const af = v.after; if (af) setTimeout(() => slice(buf, af.start, af.len, 1, af.gain * at.gain, at.pan), af.delay * 1000);
  };

  /* A one-off clip. opts: pos (for distance and pan), hear (how far away it can be heard, default 42 m), rate (pitch), gain, vary (small random pitch),
     len (seconds of the clip to play, if shorter than the clip), fade (fade-out length, default a few hundredths),
     and gap: plays sharing a key (default the clip name) are at least this many seconds apart, so a pack of machines doesn't stack the same sound. */
  const lastPlay = {};
  A.play = (name, opts = {}) => {
    const c = CLIPS[name], buf = A.buffers[name]; if (!c || !buf) return;
    if (opts.gap) { const k = opts.key || name, now = A.ctx.currentTime; if (now - (lastPlay[k] || -1e9) < opts.gap) return; lastPlay[k] = now; }
    const at = place(opts.pos, opts.hear); if (!at) return;
    const start = Array.isArray(c.start) ? c.start[Math.floor(Math.random() * c.start.length)] : c.start, jitter = opts.vary ? .95 + Math.random() * .1 : 1;
    slice(buf, start, Math.min(opts.len || c.len, c.len, buf.duration - start), (opts.rate || 1) * jitter, (opts.gain == null ? 1 : opts.gain) * at.gain, at.pan, opts.fade);
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

  /* ---------- ambience ---------- */
  const rnd = ([a, b]) => a + Math.random() * (b - a);
  const BEDS = (G.R.ambience || AMBIENCE.beds).filter(b => !b.accent && !b.synth), ACCENTS = (G.R.ambience || []).filter(b => b.accent), MADE = (G.R.ambience || []).filter(b => b.synth);
  let ambOn = false, bedAt = 0, bedIdx = Math.floor(Math.random() * BEDS.length), firstBed = true, hornAt = 0, accentAt = 0;
  function playBed(bed, when, offset) {
    const buf = A.buffers[bed.name]; if (!buf) return 0;
    const F = AMBIENCE.fade, dur = Math.min(bed.to, buf.duration) - offset; if (dur < F * 3) return 0;
    const src = A.ctx.createBufferSource(), g = A.ctx.createGain(); src.buffer = buf;
    const v = AMBIENCE.gain * (bed.gain || 1); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(v, when + F); g.gain.setValueAtTime(v, when + dur - F); g.gain.linearRampToValueAtTime(0, when + dur);
    src.connect(g); g.connect(A.amb); src.start(when, offset, dur); src.onended = () => { src.disconnect(); g.disconnect(); };
    return dur;
  }
  /* rate: below 1 for a lower, longer call (Dead City sounds a raid setting out that way) */
  function horn(signal, rate = 1) {
    const H = AMBIENCE.horn, buf = A.buffers[H.name]; if (!buf || A.ctx.state !== 'running') return;
    const t = A.ctx.currentTime, src = A.ctx.createBufferSource(), lp = A.ctx.createBiquadFilter(), g = A.ctx.createGain(), dur = signal ? Math.min(H.signalLen, H.to - H.from) : H.to - H.from;
    lp.type = 'lowpass'; lp.frequency.value = signal ? 3800 : 1400 + Math.random() * 1600;   // far away: the highs are gone
    src.buffer = buf; src.playbackRate.value = (.94 + Math.random() * .1) * rate;
    const v = signal ? H.signal : H.gain * (.7 + Math.random() * .3), tail = signal ? 1.6 : .5; g.gain.setValueAtTime(v, t); g.gain.setValueAtTime(v, t + dur - tail); g.gain.linearRampToValueAtTime(0, t + dur);
    let out = g; if (A.ctx.createStereoPanner) { const p = A.ctx.createStereoPanner(); p.pan.value = (Math.random() < .5 ? -1 : 1) * (signal ? .15 : .3 + Math.random() * .4); g.connect(p); out = p; }
    src.connect(lp); lp.connect(g); out.connect(signal ? A.master : A.amb); src.start(t, H.from, dur);
    src.onended = () => { src.disconnect(); lp.disconnect(); g.disconnect(); if (out !== g) out.disconnect(); };
  }
  /* an accent swelling up over the beds, a little to one side */
  function accent(a) {
    const buf = A.buffers[a.name]; if (!buf) return;
    const t = A.ctx.currentTime, dur = Math.min(a.to, buf.duration) - a.from, v = AMBIENCE.gain * (a.gain || 1), src = A.ctx.createBufferSource(), g = A.ctx.createGain(); src.buffer = buf;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .4); g.gain.setValueAtTime(v, t + dur - 1.5); g.gain.linearRampToValueAtTime(0, t + dur);
    let out = g; if (A.ctx.createStereoPanner) { const p = A.ctx.createStereoPanner(); p.pan.value = (Math.random() * 2 - 1) * .5; g.connect(p); out = p; }
    src.connect(g); out.connect(A.amb); src.start(t, a.from, dur); src.onended = () => { src.disconnect(); g.disconnect(); if (out !== g) out.disconnect(); };
  }
  /* Keeps the beds queued a little ahead and times the horn (and any accents). Runs once a second; does nothing until audio is unlocked. */
  function tickAmbience() {
    if (!ambOn || A.ctx.state !== 'running') return;
    const now = A.ctx.currentTime;
    if (!hornAt) hornAt = now + rnd(AMBIENCE.horn.first);
    if (now >= hornAt) { if (!G.R.noHorn && !G.R.hornSignals) horn(); hornAt = now + rnd(AMBIENCE.horn.every); }   // indoors there's no horn on the wind
    if (ACCENTS.length) { if (!accentAt) accentAt = now + rnd(ACCENTS[0].first); if (now >= accentAt) { const a = ACCENTS[Math.floor(Math.random() * ACCENTS.length)]; accent(a); accentAt = now + rnd(a.every); } }
    if (bedAt > now + 2 || !BEDS.length) return;
    const bed = BEDS[bedIdx]; if (!A.buffers[bed.name]) { bedIdx = (bedIdx + 1) % BEDS.length; return; }
    const when = Math.max(now + .05, bedAt), offset = firstBed ? bed.from + Math.random() * (bed.to - bed.from) * .5 : bed.from;   // start somewhere in the middle the first time
    const dur = playBed(bed, when, offset); firstBed = false;
    bedAt = when + Math.max(1, dur - AMBIENCE.fade); bedIdx = (bedIdx + 1) % BEDS.length;
  }
  setInterval(tickAmbience, 1000);
  /* the long soundscapes (~3-4 MB) are fetched only once the game starts, so they don't compete with loading it; the horn only where it sounds */
  let ambLoaded = false;
  A.startAmbience = () => { ambOn = true; if (!ambLoaded) { ambLoaded = true; for (const b of BEDS.concat(ACCENTS)) A.load(b.name, b.url); for (const b of MADE) if (b.synth === 'rain') rain(b.gain || 1); if (!G.R.noHorn || G.R.hornSignals) A.load(AMBIENCE.horn.name, AMBIENCE.horn.url); } tickAmbience(); };
  A.horn = horn;

  /* ---------- sounds made here instead of played from a file ---------- */
  const noiseBuf = (() => { const n = A.ctx.sampleRate * 2, b = A.ctx.createBuffer(1, n, A.ctx.sampleRate), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; return b; })();
  /* rain on tarmac (noise, with the lows and the hiss taken off) and, under it, the mains hum of neon tubes and television sets */
  function rain(gain) {
    const src = A.ctx.createBufferSource(), hp = A.ctx.createBiquadFilter(), lp = A.ctx.createBiquadFilter(), g = A.ctx.createGain();
    src.buffer = noiseBuf; src.loop = true; hp.type = 'highpass'; hp.frequency.value = 900; lp.type = 'lowpass'; lp.frequency.value = 5200; g.gain.value = .11 * gain;
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(A.amb); src.start();
    for (const [f, v] of [[60, .05], [120, .03], [180, .012]]) { const o = A.ctx.createOscillator(), og = A.ctx.createGain(); o.frequency.value = f; og.gain.value = v * gain; o.connect(og); og.connect(A.amb); o.start(); }
  }
  /* a payphone ringing: two bells struck in turn about twenty times a second, for two seconds. pos, and how far it carries */
  A.ring = (pos, hear = 110) => {
    if (A.ctx.state !== 'running') return; const at = place(pos, hear); if (!at) return;
    const t = A.ctx.currentTime, v = .13 * (.25 + .75 * at.gain), out = A.ctx.createGain(), am = A.ctx.createGain(), trem = A.ctx.createOscillator(), depth = A.ctx.createGain(), nodes = [out, am, trem, depth];
    out.gain.setValueAtTime(0, t); out.gain.linearRampToValueAtTime(v, t + .02); out.gain.setValueAtTime(v, t + 1.9); out.gain.linearRampToValueAtTime(0, t + 2);
    am.gain.value = .5; trem.type = 'square'; trem.frequency.value = 21; depth.gain.value = .5; trem.connect(depth); depth.connect(am.gain); trem.start(t); trem.stop(t + 2.05);
    for (const [f, k] of [[1180, 1], [1420, .8], [2360, .25], [2840, .18]]) { const o = A.ctx.createOscillator(), og = A.ctx.createGain(); o.frequency.value = f; og.gain.value = k; o.connect(og); og.connect(am); o.start(t); o.stop(t + 2.05); nodes.push(o, og); }
    let end = out; if (at.pan && A.ctx.createStereoPanner) { const p = A.ctx.createStereoPanner(); p.pan.value = at.pan; out.connect(p); end = p; nodes.push(p); }
    am.connect(out); end.connect(A.master); setTimeout(() => nodes.forEach(n => n.disconnect()), 2300);
  };
  /* A score played a sixteenth at a time a little ahead of the clock (1984's boss has one): a kick on every beat, a snare on two and four, hats between,
     a bass line that bounces an octave, an arpeggio over it and a pad underneath, round four chords (A minor, F, C, G). T.drive: busier
     and brighter, for the boss. Returns what a recorded track does, so the same code fades it in and out. */
  function synthTrack(key, T, when) {
    const C = A.ctx, g = C.createGain(), step = 60 / T.bpm / 4, hz = n => 440 * Math.pow(2, (n - 69) / 12);
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(T.gain, when + MUSIC_FADE); g.connect(A.mus);
    const bassLP = C.createBiquadFilter(); bassLP.type = 'lowpass'; bassLP.frequency.value = T.drive ? 900 : 620; bassLP.Q.value = 4; bassLP.connect(g);
    const padLP = C.createBiquadFilter(); padLP.type = 'lowpass'; padLP.frequency.value = 1100; padLP.connect(g);
    const env = (t, len, v, a = .005) => { const e = C.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(v, t + a); e.gain.exponentialRampToValueAtTime(.0008, t + len); return e; };
    const tone = (type, f, t, len, v, to, a, detune = 0) => { const o = C.createOscillator(), e = env(t, len, v, a); o.type = type; o.frequency.value = f; o.detune.value = detune; o.connect(e); e.connect(to); o.start(t); o.stop(t + len + .02); o.onended = () => { o.disconnect(); e.disconnect(); }; };
    const hit = (t, len, v, type, f) => { const s = C.createBufferSource(), q = C.createBiquadFilter(), e = env(t, len, v, .002); s.buffer = noiseBuf; q.type = type; q.frequency.value = f; s.connect(q); q.connect(e); e.connect(g); s.start(t, Math.random(), len + .02); s.onended = () => { s.disconnect(); q.disconnect(); e.disconnect(); }; };
    const kick = t => { const o = C.createOscillator(), e = env(t, .26, .9, .003); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + .13); o.connect(e); e.connect(g); o.start(t); o.stop(t + .3); o.onended = () => { o.disconnect(); e.disconnect(); }; };
    const ROOTS = [45, 41, 36, 43], THIRD = [3, 4, 4, 4];   // A2, F2, C2, G2, and whether the chord on each is minor or major
    let n = 0, next = when;
    const timer = setInterval(() => {
      if (C.state !== 'running') return;
      if (next < C.currentTime) next = C.currentTime + .05;   // the tab was in the background: pick up from now
      while (next < C.currentTime + .3) {
        const s = n % 16, bar = (n >> 4) % 4, root = ROOTS[bar], third = THIRD[bar], arp = [0, 7, 12, third + 12, 7, 12, third + 12, 19];
        if (s % 4 === 0 || (T.drive && s === 14)) kick(next);
        if (s % 8 === 4) { hit(next, .17, .34, 'bandpass', 1900); tone('triangle', 190, next, .09, .25, g); }
        if (s % 2 === 0 || T.drive) hit(next, s % 4 === 2 ? .07 : .03, s % 4 === 2 ? .11 : .06, 'highpass', 7500);
        if (s % 2 === 0) tone('sawtooth', hz(root + (s % 4 === 2 ? 12 : 0)), next, step * 1.8, .2, bassLP);
        if (bar % 2 === 1 || T.drive || (n >> 6) % 2 === 1) tone('square', hz(root + 24 + arp[s % 8]), next, step * 1.1, .035, g);
        if (s === 0) for (const [i, d] of [[12, -7], [12 + third, 6], [19, -4]]) tone('sawtooth', hz(root + 12 + i), next, step * 16, .035, padLP, .4, d);
        next += step; n++;
      }
    }, 100);
    return { key, g, endAt: Infinity, src: { stop: () => { clearInterval(timer); setTimeout(() => { g.disconnect(); bassLP.disconnect(); padLP.disconnect(); }, (MUSIC_FADE + .5) * 1000); } } };
  }

  /* ---------- music ---------- */
  let want = null, cur = null;   // cur: { key, src, g, endAt }
  function track(key, when) {
    const T = MUSIC[key]; if (T && T.synth) return synthTrack(key, T, when);
    const buf = T && A.buffers[T.name]; if (!buf) return null;
    const dur = Math.min(T.to, buf.duration) - T.from, src = A.ctx.createBufferSource(), g = A.ctx.createGain(); src.buffer = buf;
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(T.gain, when + MUSIC_FADE); g.gain.setValueAtTime(T.gain, when + dur - MUSIC_FADE); g.gain.linearRampToValueAtTime(0, when + dur);
    src.connect(g); g.connect(A.mus); src.start(when, T.from, dur); src.onended = () => { src.disconnect(); g.disconnect(); };
    return { key, src, g, endAt: when + dur };
  }
  function fadeOut(m) { const t = A.ctx.currentTime; m.g.gain.cancelScheduledValues(t); m.g.gain.setValueAtTime(m.g.gain.value, t); m.g.gain.linearRampToValueAtTime(0, t + MUSIC_FADE); try { m.src.stop(t + MUSIC_FADE + .1); } catch (e) {} }
  /* ask for a track by its key (null for none); it comes in once its file has loaded */
  A.music = (key) => { want = key || null; const T = want && MUSIC[want]; if (T && !T.synth && !A.buffers[T.name] && !T.loading) { T.loading = true; for (const k in MUSIC) if (MUSIC[k].name === T.name) MUSIC[k].loading = true; A.load(T.name, T.url); } };
  A.playing = () => cur && cur.key;   // the track playing now
  /* load ahead the tracks a run might want, so the first boss isn't silent while its file comes down */
  A.preloadMusic = (keys) => { for (const k of keys) { const T = MUSIC[k]; if (T && !T.synth && !A.buffers[T.name] && !T.loading) { for (const j in MUSIC) if (MUSIC[j].name === T.name) MUSIC[j].loading = true; A.load(T.name, T.url); } } };
  setInterval(() => {
    if (A.ctx.state !== 'running') return;
    const now = A.ctx.currentTime;
    if ((cur && cur.key) !== want) { if (cur) fadeOut(cur); cur = want ? track(want, now + .05) : null; return; }   // (if its file isn't in yet, this tries again shortly)
    if (cur && now > cur.endAt - MUSIC_FADE - .3) cur = track(cur.key, cur.endAt - MUSIC_FADE) || cur;              // loop, crossfading into itself
  }, 250);

  for (const k in BANKS) A.load(k, BANKS[k].url);
  for (const k in CLIPS) A.load(k, CLIPS[k].url);
  A.load('hum', HUM.url);
  return A;
}
