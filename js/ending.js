/* The ending: after Origin is won, Dead City mends itself. Origin leaves its win card in this browser (ENDING_KEY) and loads the page
   again; main.js sees the card, builds Dead City with its pieces kept apart (G.ending, region1.js) and hands over to runEnding.
   What plays: the city as you know it, ash falling and fires burning, the gate alight. The gate goes dark. Then a correction rolls out from
   it, a ring of light along the ground, and as it passes everything goes back to how it was before there were machines: each ruin grows
   whole again, floor by floor; the rubble, the wrecks and the barricades are gone; fires go out; the trees come into leaf; and the ash and
   the brown haze clear into a blue sky. The camera follows the ring down to the outpost and rises over a whole city. Then the card.
   Watched through the first time, skippable after (remembered in this browser). The numbers are in END at the top. */
import { B, G, V, C, rand, clamp } from './core.js';
import { Geo, gbox, gmesh } from './geo.js';
import { makeMat, LOOK } from './tex.js';
import { GATE } from './region1.js';

export const ENDING_KEY = 'relay-gate-ending';   // where Origin leaves its win card for the ending (sessionStorage, else localStorage)
const SEEN_KEY = 'relay-gate-ending-seen';

/* The ring's speed (metres a second) and when it sets off; how long a building takes to grow whole, and a wreck to go; when the gate goes
   dark. Then what the city looks like at the end (`to`), against the city's own look (tex.js LOOK) at the start. */
const END = { speed: 7.5, start: 4.6, grow: 1.9, clear: .9, gateDark: 2.4,
  to: { sky: '#a9cbe6', fogD: .0032, hemiSky: '#e8f0fa', hemiGround: '#6b6a5c', hemiI: 1.05, sun: '#fff3dc', sunI: 1.45, exposure: 1.2, contrast: 1.12, sat: 8, ground: '#7f8c63' } };
const FH = 3.2;   // a floor's height, as in region1.js

/* the camera, following the ring down from the gate to the outpost, and then up over the city (intro.js shots; who '' is narration) */
const SHOTS = [
  { at: [GATE.x, 3, GATE.z - 4], r: 26, a: -2.05, b: .82, hold: 4.6, who: '', say: 'Dead City, the way you left it.' },
  { at: [GATE.x, 2, GATE.z - 16], r: 70, a: -2.15, b: .8, move: 3, hold: 2.4, who: '', say: 'The gate goes dark. Then the city starts to put itself back.' },
  { at: [50, 2, 104], r: 88, a: -2.3, b: .78, move: 4, hold: 1.4, who: '', say: '' },
  { at: [10, 2, 80], r: 90, a: -2.4, b: .76, move: 4.4, hold: 1.2, who: '', say: 'Street by street, it was never any other way.' },
  { at: [0, 2, 40], r: 88, a: -2.2, b: .76, move: 4.4, hold: 1, who: '', say: '' },
  { at: [0, 2, 8], r: 74, a: -2.25, b: .8, move: 4, hold: 2, who: '', say: '' },
  { at: [22, 6, 70], r: 170, a: -2.3, b: .62, move: 6, hold: 7, who: '', say: 'Nobody here has heard of a relay gate. Somewhere across town, a young woman is starting her first week at a new job.' },
];

const ease = k => k * k * (3 - 2 * k), out = k => 1 - (1 - k) ** 3;
const seen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch (e) { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch (e) {} };

/* a building as it was before: the ruin's footprint, columns and bays, every floor complete, glass in the windows, a roof and parapet */
function whole(b, gF, gG) {
  const { cx, cz, w, d, floors } = b, H = floors * FH, nx = b.nx, nz = b.nz;
  const cols = []; for (let k = 0; k <= nx; k++) { cols.push([-w / 2 + k * w / nx, -d / 2]); cols.push([-w / 2 + k * w / nx, d / 2]); }
  for (let k = 1; k < nz; k++) { cols.push([-w / 2, -d / 2 + k * d / nz]); cols.push([w / 2, -d / 2 + k * d / nz]); }
  for (const [px, pz] of cols) gbox(gF, { x: cx + px, y: H / 2, z: cz + pz, w: .5, h: H, d: .5, tint: .97 });
  for (let f = 0; f < floors; f++) { const y0 = f * FH;
    if (f > 0) gbox(gF, { x: cx, y: y0, z: cz, w: w + .14, h: .3, d: d + .14, tint: .9, ao: false });
    b.bays.forEach(([px, pz, len, ax], bi) => { const L = len - .5, X = cx + px, Z = cz + pz, W = ax === 'x' ? L : .26, D = ax === 'x' ? .26 : L, gw = ax === 'x' ? L : .12, gd = ax === 'x' ? .12 : L;
      if (f === 0 && b.store) { gbox(gG, { x: X, y: 1.35, z: Z, w: gw, h: 2.5, d: gd, ao: false }); gbox(gF, { x: X, y: 2.95, z: Z, w: W, h: .5, d: D, tint: .78, ao: false }); return; }
      if (b.solid[bi]) { gbox(gF, { x: X, y: y0 + FH / 2, z: Z, w: W, h: FH, d: D }); return; }
      gbox(gF, { x: X, y: y0 + .45, z: Z, w: W, h: .9, d: D }); gbox(gG, { x: X, y: y0 + 1.7, z: Z, w: gw, h: 1.6, d: gd, ao: false }); gbox(gF, { x: X, y: y0 + 2.9, z: Z, w: W, h: .6, d: D, ao: false }); }); }
  gbox(gF, { x: cx, y: H, z: cz, w: w + .2, h: .3, d: d + .2, ao: false });
  for (const [x, z, ww, dd] of [[cx, cz - d / 2, w + .2, .25], [cx, cz + d / 2, w + .2, .25], [cx - w / 2, cz, .25, d + .2], [cx + w / 2, cz, .25, d + .2]]) gbox(gF, { x, y: H + .45, z, w: ww, h: .6, d: dd, ao: false, tint: .92 });
  gbox(gF, { x: cx + rand(-w / 5, w / 5), y: H + .75, z: cz + rand(-d / 5, d / 5), w: 1.8, h: 1.2, d: 1.6, tint: .85 });   // the stair head on the roof
  return H;
}

/* card: Origin's win card. opts: back() returns to Origin, city() opens Dead City to play */
export function runEnding(card, opts) {
  const S = G.scene, E = G.ending, $ = id => document.getElementById(id), cam = G.camera, ground = S.getMeshByName('ground');
  const D = (x, z) => Math.hypot(x - GATE.x, z - GATE.z), when = (x, z, j = .5) => END.start + D(x, z) / END.speed + rand(0, j);
  G.player.root.setEnabled(false); G.ally.root.setEnabled(false);

  /* ---------- what changes, and when the ring reaches it ---------- */
  const items = [];
  /* the buildings: each ruin, and its whole twin hidden flat on the ground until the ring comes */
  const facades = ['#d8d1c3', '#c9b3a0', '#b9c0c6', '#d1c7b2'].map((hex, i) => makeMat(S, 'facade' + i, hex, { tex: G.M.conc.diffuseTexture, spec: .06 }));
  const glass = makeMat(S, 'windows', '#27343e', { spec: .9, power: 90 });
  E.buildings.forEach((b, i) => {
    const gF = Geo(), gG = Geo(), H = whole(b, gF, gG), piv = V(b.cx, 0, b.cz);
    const parts = [gmesh('whole' + i, gF, facades[i % facades.length]), gmesh('wholeGlass' + i, gG, glass)].filter(Boolean);
    parts.forEach(m => { m.setPivotPoint(piv); m.scaling.y = .01; m.setEnabled(false); });
    b.ruin.forEach(m => m.setPivotPoint(piv));
    items.push({ at: when(b.cx, b.cz), dur: END.grow, x: b.cx, z: b.cz,
      start() { parts.forEach(m => m.setEnabled(true)); G.FX.flash(V(b.cx, 1.5, b.cz), '#cfe8ff', 4, .15); G.FX.puffAt(V(b.cx, 1, b.cz), 14); },
      step(k) { const e = out(k); parts.forEach(m => { m.scaling.y = Math.max(.01, e); }); b.ruin.forEach(m => { m.position.y = -k * 3; }); },
      end() { parts.forEach(m => { m.scaling.y = 1; }); b.ruin.forEach(m => m.setEnabled(false)); G.FX.flash(V(b.cx, H + .8, b.cz), '#ffffff', 2.5, .12); } });
  });
  /* the wreckage, in ten-metre chunks: it shrinks away where it lies */
  for (const m of E.wreck) { const k = m.name.slice(6).split('|')[0].split(',').map(Number), x = (k[0] + .5) * 10, z = (k[1] + .5) * 10; m.unfreezeWorldMatrix(); m.setPivotPoint(V(x, 0, z));
    items.push({ at: when(x, z), dur: END.clear, start() { G.FX.puffAt(V(x, .8, z), 8); }, step(k) { const s = 1 - ease(k); m.scaling.set(s, s, s); }, end() { m.setEnabled(false); } }); }
  /* fires go out; the survivors at the camps are simply not there any more */
  for (const f of E.fires) items.push({ at: when(f.x, f.z, .2), dur: .5, start() { f.sys.forEach(p => p.stop()); f.flames.forEach(m => m.setEnabled(false)); f.light.intensity = 0; G.FX.puffAt(V(f.x, 1, f.z), 6); }, step() {}, end() {} });
  for (const K of E.camps) items.push({ at: when(K.at.x, K.at.z, 0), dur: .1, start() { K.people.setEnabled(false); }, step() {}, end() {} });
  /* the trees come into leaf */
  const leaf = makeMat(S, 'leaves', '#56733f', { spec: .02 });
  for (const t of E.trees) { const c = B.MeshBuilder.CreateIcoSphere('canopy', { radius: 1.9, subdivisions: 1, flat: true }, S); c.material = leaf; c.position.set(t.x, t.h + .4, t.z); c.scaling.set(.01, .01, .01); c.isPickable = false; G.sg.addShadowCaster(c); c.receiveShadows = true;
    items.push({ at: when(t.x, t.z), dur: 1.4, start() {}, step(k) { const s = out(k); c.scaling.set(s, s * .8, s); }, end() { c.scaling.set(1, .8, 1); } }); }
  /* rubble, sandbags and the litter on the ground: every piece shrinks away on its own as the ring passes it */
  const thin = ['rock0', 'rock1', 'rock2', 'sandbag', 'paper', 'scrap', 'chips', 'glassShard'].map(n => S.getMeshByName(n)).filter(m => m && m.thinInstanceCount).map(mesh => {
    const base = mesh.thinInstanceGetWorldMatrices().map(m => m.clone()), at = base.map(m => when(m.m[12], m.m[14], .8));
    return { mesh, base, at, done: new Uint8Array(base.length) }; });
  const zero = B.Matrix.Scaling(0, 0, 0), tmp = new B.Matrix();
  /* the ring: a band of light along the ground at the edge of what's been put right */
  const ringTex = new B.DynamicTexture('mendRing', { width: 256, height: 256 }, S, true); { const c = ringTex.getContext(), gr = c.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.9, 'rgba(255,255,255,0)'); gr.addColorStop(.965, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 256, 256); ringTex.update(); ringTex.hasAlpha = true; }
  const ringMat = new B.StandardMaterial('mendRing', S); ringMat.disableLighting = true; ringMat.emissiveColor = C('#d6ecff'); ringMat.emissiveTexture = ringTex; ringMat.opacityTexture = ringTex; ringMat.alphaMode = B.Engine.ALPHA_ADD; ringMat.disableDepthWrite = true;
  const ring = B.MeshBuilder.CreateGround('mendRing', { width: 2, height: 2 }, S); ring.material = ringMat; ring.position.set(GATE.x, .14, GATE.z); ring.isPickable = false; ring.setEnabled(false);
  const farthest = Math.max(...items.map(it => it.at), ...thin.flatMap(t => [...t.at])) + 1;

  /* ---------- the sky: the city's own look at the start, the clear one at the end ---------- */
  const F = LOOK, T = END.to, L = G.look, lerpC = (a, b, k) => B.Color3.Lerp(C(a), C(b), k);
  const decals = S.getMeshByName('groundDetail'), weather0 = G.FX.weather.emitRate;
  function sky(p) {
    const k = ease(clamp(p, 0, 1)), s = lerpC(F.sky, T.sky, k);
    S.clearColor.set(s.r, s.g, s.b, 1); S.fogColor = s; S.fogDensity = F.fogD + (T.fogD - F.fogD) * ease(clamp(p * 3, 0, 1));   // the haze lifts first, or the wide shots would be lost in it
    L.hemi.diffuse = lerpC(F.hemiSky, T.hemiSky, k); L.hemi.groundColor = lerpC(F.hemiGround, T.hemiGround, k); L.hemi.intensity = F.hemiI + (T.hemiI - F.hemiI) * k;
    L.sun.diffuse = lerpC(F.sun, T.sun, k); L.sun.intensity = F.sunI + (T.sunI - F.sunI) * k;
    L.ip.exposure = F.exposure + (T.exposure - F.exposure) * k; L.ip.contrast = F.contrast + (T.contrast - F.contrast) * k; L.curves.globalSaturation = F.sat + (T.sat - F.sat) * k;
    G.M.ground.diffuseColor = lerpC(F.ground, T.ground, k); if (decals) decals.visibility = 1 - k;
    G.FX.weather.emitRate = weather0 * Math.max(0, 1 - p * 4);   // the ash stops early; what's in the air settles
  }

  /* ---------- each frame of it ---------- */
  let t = 0, gateOff = false, over = false;
  function gateDark() { gateOff = true; const g = G.region.gate; for (const m of [g.discA, g.discB, g.ring2]) m.setEnabled(false); g.source.intensity = 0; G.M.gateNode.emissiveColor = C('#000000');
    G.audio.play('powerOff', { pos: GATE, gain: 1, rate: .6, len: 2.6, fade: .6, hear: 400 }); G.FX.spark(V(GATE.x, GATE.y, GATE.z), 40); }
  function update(dt) {
    if (over) return; t += dt;
    if (!gateOff && t >= END.gateDark) gateDark();
    const front = Math.max(0, (t - END.start) * END.speed); ring.setEnabled(t > END.start && t < farthest); if (front > 0) ring.scaling.set(front, 1, front);
    ringMat.alpha = clamp(1.4 - front / 200, 0, 1);
    sky((t - END.start) / (farthest - END.start));
    for (const it of items) { if (it.done || t < it.at) continue; if (!it.started) { it.started = true; it.start(); } const k = (t - it.at) / it.dur; if (k >= 1) { it.done = true; it.end(); } else it.step(k); }
    for (const th of thin) { let dirty = false; for (let i = 0; i < th.base.length; i++) { if (th.done[i] || t < th.at[i]) continue; const k = (t - th.at[i]) / .6; dirty = true;
        if (k >= 1) { th.done[i] = 1; th.mesh.thinInstanceSetMatrixAt(i, zero, false); } else { const s = 1 - ease(k); B.Matrix.ScalingToRef(s, s, s, tmp); th.mesh.thinInstanceSetMatrixAt(i, tmp.multiply(th.base[i]), false); } }
      if (dirty) th.mesh.thinInstanceBufferUpdated('matrix'); }
    /* the sun's shadows and the drifting ash follow the camera, as they follow you in a run */
    const c = cam.target; L.sun.position.copyFrom(c).subtractInPlace(L.sun.direction.scale(70)); G.FX.weatherAt.set(c.x, 2, c.z);
  }
  /* skipped, or played out: everything as it ends up */
  function settle() { if (!gateOff) gateDark(); t = 1e6; update(0); over = true; ring.setEnabled(false); sky(1); }

  /* ---------- the card at the very end: your time in Origin, and where to go from here ---------- */
  function finish() {
    settle(); markSeen();
    setTimeout(() => { G.UI.endCard(Object.assign({}, card, { again: 'Back to Origin', others: [{ label: 'Play Dead City', use: opts.city }] })); $('again').onclick = opts.back; }, 900);
  }

  /* ---------- before it starts: a moment on a black screen, so the browser lets the music play ---------- */
  const veil = document.createElement('div'); veil.style.cssText = 'position:fixed;inset:0;background:#000;z-index:4;transition:opacity 1.6s ease;pointer-events:none'; document.body.append(veil);
  $('titleTag').textContent = 'Origin'; $('titleInfo').textContent = `${card.name || 'Erased'}. There's one more thing to see.`;
  document.querySelector('.arenas').hidden = true; $('installBtn').hidden = true;
  const go = $('contBtn'); go.textContent = 'Continue'; go.disabled = true;
  Promise.race([S.whenReadyAsync(), new Promise(r => setTimeout(r, 15000))]).then(() => { go.disabled = false; go.focus(); });
  G.audio.music(null);
  G.R.onIntro = update;   // intro.js runs this every frame of the shots
  go.onclick = () => {
    G.audio.unlock(); $('title').hidden = true; veil.style.opacity = '0'; setTimeout(() => veil.remove(), 1800);
    G.progress.seenIntro = seen();   // skippable once it has been seen through
    G.intro.play(SHOTS, finish, { watch: !seen(), stay: true, keep: true });
  };
}
