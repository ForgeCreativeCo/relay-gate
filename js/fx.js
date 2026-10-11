/* Particle effects: weather, fires, sparks, explosions, dust and smoke. */
import { B, G, V } from './core.js';

let dot;
export function ps(name, cap, emitter) {
  if (!dot) {
    dot = new B.DynamicTexture('dot', { width: 64, height: 64 }, G.scene, false);
    const g = dot.getContext(), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); dot.update(); dot.hasAlpha = true;
  }
  const p = new B.ParticleSystem(name, cap, G.scene); p.particleTexture = dot; p.emitter = emitter; p.colorDead = new B.Color4(0, 0, 0, 0); return p;
}
const C4 = (r, g, b, a) => new B.Color4(r, g, b, a);
function cfg(p, o) {
  if (o.c1) p.color1 = C4(...o.c1); if (o.c2) p.color2 = C4(...o.c2);
  if (o.size) { p.minSize = o.size[0]; p.maxSize = o.size[1]; } if (o.life) { p.minLifeTime = o.life[0]; p.maxLifeTime = o.life[1]; }
  if (o.pow) { p.minEmitPower = o.pow[0]; p.maxEmitPower = o.pow[1]; } if (o.d1) p.direction1 = V(...o.d1); if (o.d2) p.direction2 = V(...o.d2);
  if (o.box) { p.minEmitBox = V(...o.box[0]); p.maxEmitBox = V(...o.box[1]); } if (o.grav) p.gravity = V(...o.grav);
  /* glowing things (fire, sparks, embers) add light; everything else (smoke, dust, ash) is blended normally, or dark smoke would show up as a bright glow */
  p.emitRate = o.rate || 0; p.blendMode = o.add ? B.ParticleSystem.BLENDMODE_ADD : B.ParticleSystem.BLENDMODE_STANDARD;
  return p;
}

export function makeFx() {
  const FX = {};
  FX.weatherAt = V(0, 2, 0);
  FX.weather = cfg(ps('ash', 2500, FX.weatherAt), { c1: [.78, .74, .7, .75], c2: [.52, .5, .47, .55], size: [.06, .16], life: [10, 16], pow: [.4, 1.2], d1: [-.4, -1, -.2], d2: [.4, -1, .3], box: [[-32, 0, -32], [32, 9, 32]], rate: 480 });   // kept well below the camera, or flakes drift past the lens as big blurry discs
  FX.weather.start();
  const burst = (name, cap, o) => { const p = cfg(ps(name, cap, V(0, 0, 0)), o); p.manualEmitCount = 0; p.start(); return p; };
  FX.sparks = burst('sparks', 500, { c1: [1, .95, .7, 1], c2: [1, .7, .3, 1], size: [.05, .12], life: [.2, .5], pow: [3, 7], d1: [-1, .2, -1], d2: [1, 1.4, 1], grav: [0, -14, 0], add: true });
  FX.fire = burst('boomFire', 600, { c1: [1, .75, .3, 1], c2: [1, .4, .08, 1], size: [.5, 1.5], life: [.35, 1.1], pow: [4, 11], d1: [-1, -.2, -1], d2: [1, 1.6, 1], grav: [0, -3, 0], add: true });
  FX.smoke = burst('boomSmoke', 260, { c1: [.34, .32, .3, .5], c2: [.46, .44, .41, .38], size: [1.5, 3.6], life: [2, 4], pow: [1, 3.5], d1: [-1, .3, -1], d2: [1, 1.6, 1] });
  FX.dust = burst('dust', 300, { c1: [.55, .5, .45, .55], c2: [.4, .37, .34, .4], size: [.6, 1.5], life: [.6, 1.4], pow: [3, 7], d1: [-1, .05, -1], d2: [1, .45, 1] });
  FX.puff = burst('puff', 200, { c1: [.9, .9, .9, .5], c2: [.7, .7, .7, .3], size: [.2, .5], life: [.2, .5], pow: [1, 3], d1: [-1, -.2, -1], d2: [1, 1, 1] });
  const emit = (p, pos, n) => { p.emitter = pos.clone ? pos.clone() : V(pos.x, pos.y, pos.z); p.manualEmitCount = (p.manualEmitCount > 0 ? p.manualEmitCount : 0) + n; };
  FX.spark = (pos, n = 10) => emit(FX.sparks, pos, n);
  FX.explode = (pos, size = 1) => { emit(FX.fire, pos, 120 * size | 0); emit(FX.smoke, pos, 40 * size | 0); emit(FX.sparks, pos, 70 * size | 0); G.boom(pos, 5 + 4 * size); G.shake = Math.max(G.shake, .35 * size); };
  FX.dustAt = (pos, n = 60) => emit(FX.dust, pos, n);
  FX.puffAt = (pos, n = 6) => emit(FX.puff, pos, n);
  FX.campfire = (pos) => {
    cfg(ps('fire', 300, pos.clone()), { c1: [1, .62, .18, 1], c2: [1, .32, .06, 1], size: [.25, .6], life: [.3, .75], rate: 70, box: [[-.3, 0, -.3], [.3, .2, .3]], d1: [-.2, 1, -.2], d2: [.2, 1.6, .2], pow: [1, 2], add: true }).start();
    cfg(ps('embers', 120, pos.add(V(0, .3, 0))), { c1: [1, .7, .3, 1], c2: [1, .45, .1, 1], size: [.04, .09], life: [1.4, 3], rate: 12, d1: [-.6, 1, -.6], d2: [.6, 2, .6], pow: [.6, 1.6], add: true }).start();
    cfg(ps('smoke', 80, pos.add(V(0, 1.1, 0))), { c1: [.25, .23, .22, .35], c2: [.35, .33, .3, .25], size: [.8, 1.8], life: [3, 5], rate: 6, d1: [-.2, 1, -.2], d2: [.3, 1.4, .2], pow: [.4, .8] }).start();
  };
  FX.smokeFrom = (emitter, big) => cfg(ps('smk', big ? 220 : 90, emitter), { c1: [.14, .13, .13, .6], c2: [.26, .25, .24, .45], size: big ? [1, 2.6] : [.4, 1.1], life: [1.5, big ? 4.5 : 2.8], d1: [-.3, 1, -.3], d2: [.3, 1.6, .3], pow: [.6, 1.4], rate: big ? 22 : 12 });
  /* ---------- combat visuals ---------- */
  const S = G.scene;
  const canvasTex = (name, n, paint) => { const t = new B.DynamicTexture(name, { width: n, height: n }, S, true); paint(t.getContext(), n); t.update(); t.hasAlpha = true; return t; };
  /* a four-point star with a hot core, for muzzle flashes and blast flashes */
  const starTex = canvasTex('flashStar', 128, (g, n) => { const c = n / 2;
    const core = g.createRadialGradient(c, c, 0, c, c, c); core.addColorStop(0, 'rgba(255,255,255,1)'); core.addColorStop(.18, 'rgba(255,255,255,.85)'); core.addColorStop(.5, 'rgba(255,255,255,.15)'); core.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = core; g.fillRect(0, 0, n, n);
    for (const a of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) { g.save(); g.translate(c, c); g.rotate(a); const long = a % (Math.PI / 2) === 0 ? c : c * .55, gr = g.createLinearGradient(-long, 0, long, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(-long, -n * .02, long * 2, n * .04); g.restore(); } });
  /* a soft ring, for shockwaves */
  const ringTex = canvasTex('shockRing', 128, (g, n) => { const c = n / 2, gr = g.createRadialGradient(c, c, c * .55, c, c, c);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.6, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); });
  /* a ragged dark burn, for scorch marks left by explosions */
  const scorchTex = canvasTex('scorchMark', 128, (g, n) => { const c = n / 2;
    for (let k = 0; k < 14; k++) { const a = Math.random() * 6.28, d = Math.random() * c * .35, r = c * (.35 + Math.random() * .4), x = c + Math.cos(a) * d, y = c + Math.sin(a) * d;
      const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(8,6,5,.5)'); gr.addColorStop(1, 'rgba(8,6,5,0)'); g.fillStyle = gr; g.fillRect(0, 0, n, n); }
    g.strokeStyle = 'rgba(10,8,6,.35)'; for (let k = 0; k < 16; k++) { const a = Math.random() * 6.28; g.lineWidth = 1 + Math.random() * 2; g.beginPath(); g.moveTo(c + Math.cos(a) * c * .3, c + Math.sin(a) * c * .3); g.lineTo(c + Math.cos(a) * c * (.6 + Math.random() * .35), c + Math.sin(a) * c * (.6 + Math.random() * .35)); g.stroke(); } });
  const glowMats = {};
  const glowMat = (hex, tex) => { const k = hex + tex.name; if (!glowMats[k]) { const m = new B.StandardMaterial('fx' + k, S); m.disableLighting = true; m.emissiveTexture = tex; m.opacityTexture = tex; m.emissiveColor = B.Color3.FromHexString(hex); m.alphaMode = B.Engine.ALPHA_ADD; m.backFaceCulling = false; m.disableDepthWrite = true; glowMats[k] = m; } return glowMats[k]; };
  const pool = (n, make) => { const L = []; for (let k = 0; k < n; k++) { const m = make(k); m.isPickable = false; m.setEnabled(false); L.push({ m, t: 0, life: 0 }); } let i = 0; return { L, next: () => { const o = L[i]; i = (i + 1) % n; return o; } }; };

  /* flashes: camera-facing stars that pop for a few hundredths of a second (muzzle flashes, impact flashes, blast flashes) */
  const flashes = pool(40, k => { const p = B.MeshBuilder.CreatePlane('flash' + k, { size: 1 }, S); p.billboardMode = B.Mesh.BILLBOARDMODE_ALL; return p; });
  let flashFrame = -1, flashesThisFrame = 0, lastFlashAt = null;
  FX.flash = (pos, hex, size = 1, life = .05) => {
    if (G.frame === flashFrame) { if (++flashesThisFrame > 6 || (lastFlashAt && Math.abs(lastFlashAt.x - pos.x) + Math.abs(lastFlashAt.z - pos.z) < .3)) return; } else { flashFrame = G.frame; flashesThisFrame = 0; }
    const o = flashes.next(); o.m.material = glowMat(hex, starTex); o.m.position.copyFrom(pos); o.size = size * (.8 + Math.random() * .4); o.m.scaling.setAll(o.size); o.m.rotation.z = Math.random() * 6.28;
    o.t = 0; o.life = life; o.m.setEnabled(true); lastFlashAt = o.m.position;
  };
  /* a muzzle flash: a star just past the barrel plus a small, quick puff of gun smoke */
  FX.muzzle = (from, dir, hex, size = .7) => { FX.flash(V(from.x + dir.x * .25, from.y + dir.y * .25, from.z + dir.z * .25), hex, size, .045); if (size > .9) burstAt(smokeB, from, 3, dir, .3); };

  /* impact bursts: a few small particle systems per kind used round-robin, so several hits in one frame each get their own spot */
  const multi = (name, n, o) => { const L = []; for (let k = 0; k < n; k++) { const p = cfg(ps(name + k, o.cap, V(0, 0, 0)), o); p.manualEmitCount = 0; p.start(); L.push({ p, frame: -1 }); } return L; };
  const burstAt = (set, pos, count, dir, spread = .6) => {
    const e = set.find(s => s.frame !== G.frame) || set[0]; e.frame = G.frame; const p = e.p;
    p.emitter = V(pos.x, pos.y, pos.z);
    const d = dir || V(0, 1, 0); p.direction1 = V(d.x - spread, d.y - spread * .3, d.z - spread); p.direction2 = V(d.x + spread, d.y + spread, d.z + spread);
    p.manualEmitCount = (p.manualEmitCount > 0 ? p.manualEmitCount : 0) + count;
  };
  const metalSparks = multi('hitSpark', 4, { cap: 120, c1: [1, .95, .75, 1], c2: [1, .62, .22, 1], size: [.04, .1], life: [.12, .35], pow: [5, 11], grav: [0, -16, 0], add: true });
  const dustB = multi('hitDust', 4, { cap: 80, c1: [.62, .57, .5, .6], c2: [.45, .42, .38, .45], size: [.3, .75], life: [.35, .8], pow: [1.2, 3] });
  const chipsB = multi('hitChips', 4, { cap: 80, c1: [.3, .28, .25, 1], c2: [.18, .17, .15, 1], size: [.04, .09], life: [.4, .8], pow: [3, 6], grav: [0, -18, 0] });
  const puffB = multi('hitPuff', 3, { cap: 60, c1: [.32, .2, .17, .55], c2: [.2, .14, .12, .4], size: [.25, .5], life: [.25, .5], pow: [.8, 2] });
  const smokeB = multi('gunSmoke', 3, { cap: 60, c1: [.6, .58, .55, .3], c2: [.45, .44, .42, .2], size: [.3, .7], life: [.4, .9], pow: [.4, 1.2] });
  const emberB = multi('blastEmbers', 2, { cap: 220, c1: [1, .7, .3, 1], c2: [1, .45, .12, 1], size: [.05, .14], life: [.8, 2.2], pow: [6, 15], grav: [0, -9, 0], add: true });
  /* what a bullet hitting something looks like. kind: metal (machines), body (people), hard (walls, cover), ground */
  FX.impact = (pos, kind, back) => {
    const b = back ? back.clone().normalize() : V(0, 1, 0);
    if (kind === 'metal') { burstAt(metalSparks, pos, 9, V(b.x, b.y + .4, b.z), .9); FX.flash(pos, '#ffd9a0', .55, .04); }
    else if (kind === 'body') burstAt(puffB, pos, 6, V(b.x * .5, .3, b.z * .5), .5);
    else { burstAt(dustB, pos, 4, V(b.x * .6, .7, b.z * .6), .5); burstAt(chipsB, pos, 5, V(b.x, .9, b.z), .8); if (Math.random() < .5) burstAt(metalSparks, pos, 2, V(b.x, .5, b.z), .8); }
  };

  /* shockwave rings that sweep out along the ground from an explosion */
  const rings = pool(8, k => { const d = B.MeshBuilder.CreateGround('shock' + k, { width: 1, height: 1 }, S); d.material = glowMat('#ffb070', ringTex); return d; });
  /* scorch marks: dark burns left on the ground; the oldest is reused once there are too many */
  const scorchMat = new B.StandardMaterial('scorchMat', S); scorchMat.diffuseTexture = scorchTex; scorchMat.useAlphaFromDiffuseTexture = true; scorchMat.diffuseColor = new B.Color3(1, 1, 1); scorchMat.specularColor = new B.Color3(0, 0, 0); scorchMat.zOffset = -3; scorchMat.disableDepthWrite = true;
  const scorches = pool(24, k => { const d = B.MeshBuilder.CreateGround('burn' + k, { width: 1, height: 1 }, S); d.material = scorchMat; d.receiveShadows = true; return d; });
  FX.blast = (pos, size = 1) => {
    FX.flash(V(pos.x, pos.y + .5, pos.z), '#ffe0b0', 3.5 * size, .12);
    const r = rings.next(); r.m.position.set(pos.x, .12, pos.z); r.t = 0; r.life = .45; r.size = 7 * size; r.m.scaling.setAll(.1); r.m.setEnabled(true);
    const s = scorches.next(); s.m.position.set(pos.x, .08, pos.z); s.m.rotation.y = Math.random() * 6.28; s.m.scaling.setAll(2.6 * size * (.85 + Math.random() * .3)); s.m.setEnabled(true);
    burstAt(emberB, V(pos.x, pos.y + .3, pos.z), 40 * size | 0, V(0, 1, 0), 1);
  };

  /* wreck debris: chunks of armour that tumble, bounce and settle. Instances of a few shared boxes, so they draw in a handful of calls. */
  const chunkSrc = [G.M.mech, G.M.mechDark, G.M.rust].map((mat, k) => { const b = B.MeshBuilder.CreateBox('chunk' + k, { size: 1 }, S); b.material = mat; b.isPickable = false; b.receiveShadows = true; b.position.y = -60; G.sg.addShadowCaster(b); return b; });   // the source boxes stay enabled (instances draw through them), parked underground
  const chunks = [], MAX_CHUNKS = 90;
  FX.debris = (pos, count, size = 1, power = 1) => {
    for (let k = 0; k < count; k++) {
      let c = chunks.length >= MAX_CHUNKS ? chunks.shift() : null;
      if (!c) { c = { m: chunkSrc[k % chunkSrc.length].createInstance('wreckChunk'), v: V(0, 0, 0), w: V(0, 0, 0) }; c.m.isPickable = false; }
      const a = Math.random() * 6.28, out = (3 + Math.random() * 6) * power;
      c.m.position.set(pos.x + Math.cos(a) * .4 * size, pos.y, pos.z + Math.sin(a) * .4 * size);
      c.m.scaling.set(size * (.25 + Math.random() * .55), size * (.12 + Math.random() * .3), size * (.2 + Math.random() * .5));
      c.m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      c.v.set(Math.cos(a) * out, (5 + Math.random() * 7) * power, Math.sin(a) * out); c.w.set((Math.random() - .5) * 14, (Math.random() - .5) * 14, (Math.random() - .5) * 14);
      c.rest = false; c.m.setEnabled(true); chunks.push(c);
    }
  };
  FX.clearDebris = () => { for (const c of chunks) c.m.setEnabled(false); for (const s of scorches.L) s.m.setEnabled(false); };

  /* advance flashes, rings and debris; called once per game frame */
  FX.update = (dt) => {
    for (const o of flashes.L) { if (!o.m.isEnabled()) continue; o.t += dt; const k = o.t / o.life; if (k >= 1) { o.m.setEnabled(false); continue; } o.m.scaling.setAll(o.size * (1 + k * .4)); o.m.visibility = 1 - k * k; }
    for (const o of rings.L) { if (!o.m.isEnabled()) continue; o.t += dt; const k = o.t / o.life; if (k >= 1) { o.m.setEnabled(false); continue; } const e = 1 - (1 - k) * (1 - k); o.m.scaling.setAll(.2 + o.size * e); o.m.visibility = (1 - k) * .45; }
    for (const c of chunks) { if (c.rest) continue; const m = c.m, half = m.scaling.y / 2;
      c.v.y -= 22 * dt; m.position.addInPlace(c.v.scale(dt)); m.rotation.addInPlace(c.w.scale(dt));
      if (m.position.y < half) { m.position.y = half; c.v.y = -c.v.y * .3; c.v.x *= .55; c.v.z *= .55; c.w.scaleInPlace(.5);
        if (Math.abs(c.v.y) < 1.2 && Math.hypot(c.v.x, c.v.z) < .5) { c.rest = true; m.rotation.x = Math.round(m.rotation.x / Math.PI) * Math.PI; m.rotation.z = Math.round(m.rotation.z / Math.PI) * Math.PI; } } }
  };
  return FX;
}
