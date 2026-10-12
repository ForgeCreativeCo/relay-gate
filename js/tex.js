/* Procedural, tileable textures generated on the device, and the shared material set. */
import { B, C, R, rnd } from './core.js';

function cnv(n) { const c = document.createElement('canvas'); c.width = c.height = n; return c; }
function noise(x, N, cells, alpha, op) {
  const s = cnv(cells * 3), sc = s.getContext('2d'), id = sc.createImageData(cells, cells);
  for (let k = 0; k < cells * cells; k++) { const v = rnd() * 255 | 0; id.data[k * 4] = id.data[k * 4 + 1] = id.data[k * 4 + 2] = v; id.data[k * 4 + 3] = 255; }
  sc.putImageData(id, 0, 0);
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) if (a || b) sc.drawImage(s, 0, 0, cells, cells, a * cells, b * cells, cells, cells);
  x.save(); x.globalAlpha = alpha; x.globalCompositeOperation = op || 'soft-light'; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.drawImage(s, -N, -N, N * 3, N * 3); x.restore();
}
function wrap(x, N, fn) { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) { x.save(); x.translate(dx, dy); fn(); x.restore(); } }
function cracks(x, N, count, col, w) {
  const P = []; for (let k = 0; k < count; k++) { let px = R(0, N), py = R(0, N), a = R(0, 6.28); const pts = [[px, py]]; const n = 8 + rnd() * 16 | 0;
    for (let s = 0; s < n; s++) { a += R(-.6, .6); px += Math.cos(a) * R(5, 13); py += Math.sin(a) * R(5, 13); pts.push([px, py]); } P.push([pts, R(w * .6, w * 1.4)]); }
  wrap(x, N, () => { x.strokeStyle = col; x.lineCap = 'round'; P.forEach(([pts, lw]) => { x.lineWidth = lw; x.beginPath(); pts.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.stroke(); }); });
}
function streaks(x, N, count, rgb, amax) {
  const S = [...Array(count)].map(() => [R(0, N), R(0, N), R(2, 9), R(40, 260), R(.05, amax)]);
  wrap(x, N, () => S.forEach(([px, py, w, h, a]) => { const g = x.createLinearGradient(0, py, 0, py + h); g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); x.fillStyle = g; x.fillRect(px, py, w, h); }));
}
function blotches(x, N, count, rgb, amax, rmax) {
  const S = [...Array(count)].map(() => [R(0, N), R(0, N), R(20, rmax), R(.05, amax)]);
  wrap(x, N, () => S.forEach(([px, py, r, a]) => { const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')'); g.addColorStop(1, 'rgba(' + rgb + ',0)'); x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2); }));
}
function specks(x, N, count, light, dark) { for (let k = 0; k < count; k++) { x.fillStyle = rnd() < .5 ? 'rgba(255,255,255,' + light + ')' : 'rgba(0,0,0,' + dark + ')'; const s = rnd() < .8 ? 1 : 2; x.fillRect(R(0, N), R(0, N), s, s); } }
function normalFrom(src, strength) {
  const N = src.width, d = src.getContext('2d').getImageData(0, 0, N, N).data, o = cnv(N), oc = o.getContext('2d'), id = oc.createImageData(N, N), D = id.data;
  const h = (x, y) => d[((((y + N) % N) * N) + ((x + N) % N)) * 4] / 255;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), k = (y * N + x) * 4;
    D[k] = (-dx / l * .5 + .5) * 255; D[k + 1] = (dy / l * .5 + .5) * 255; D[k + 2] = (1 / l * .5 + .5) * 255; D[k + 3] = 255; }
  oc.putImageData(id, 0, 0); return o;
}

function concreteC() { const N = 512, c = cnv(N), x = c.getContext('2d'); x.fillStyle = '#d2cec7'; x.fillRect(0, 0, N, N);
  noise(x, N, 6, .55); noise(x, N, 24, .45); noise(x, N, 96, .35); noise(x, N, 256, .3, 'overlay');
  blotches(x, N, 18, '60,55,50', .18, 120); streaks(x, N, 46, '40,36,32', .22); cracks(x, N, 14, 'rgba(30,28,26,.55)', 1.4); specks(x, N, 2400, .22, .22);
  x.strokeStyle = 'rgba(30,28,26,.25)'; x.lineWidth = 1.5; for (let k = 0; k <= N; k += 128) { x.beginPath(); x.moveTo(0, k); x.lineTo(N, k); x.stroke(); }
  return c; }
function pavingC() { const N = 512, c = cnv(N), x = c.getContext('2d'); x.fillStyle = '#c4c0b8'; x.fillRect(0, 0, N, N);
  noise(x, N, 8, .45); noise(x, N, 64, .35); noise(x, N, 256, .3, 'overlay');
  for (let r = 0; r < 8; r++) for (let q = 0; q < 8; q++) { x.fillStyle = 'rgba(' + (rnd() < .5 ? '255,255,255' : '0,0,0') + ',' + R(0, .09) + ')'; x.fillRect(q * 64, r * 64, 64, 64); }
  x.strokeStyle = 'rgba(25,24,22,.3)'; x.lineWidth = 2; for (let k = 0; k <= N; k += 64) { x.beginPath(); x.moveTo(0, k); x.lineTo(N, k); x.stroke(); x.beginPath(); x.moveTo(k, 0); x.lineTo(k, N); x.stroke(); }
  cracks(x, N, 10, 'rgba(25,24,22,.5)', 1.2); blotches(x, N, 12, '40,36,32', .2, 100); specks(x, N, 2000, .2, .25);
  return c; }
function asphaltC() { const N = 512, c = cnv(N), x = c.getContext('2d'); x.fillStyle = '#8a8a8a'; x.fillRect(0, 0, N, N);
  noise(x, N, 8, .5); noise(x, N, 64, .4); noise(x, N, 256, .55, 'overlay'); specks(x, N, 7000, .25, .3);
  blotches(x, N, 10, '15,15,15', .3, 140); cracks(x, N, 24, 'rgba(15,15,15,.65)', 2);
  return c; }
function dirtC() { const N = 512, c = cnv(N), x = c.getContext('2d'); x.fillStyle = '#c4bcae'; x.fillRect(0, 0, N, N);
  noise(x, N, 4, .7); noise(x, N, 16, .5); noise(x, N, 64, .4); noise(x, N, 220, .35, 'overlay');
  blotches(x, N, 24, '40,34,28', .22, 110); blotches(x, N, 12, '255,250,240', .12, 90); specks(x, N, 3000, .3, .35);
  return c; }
function metalC() { const N = 512, c = cnv(N), x = c.getContext('2d'); x.fillStyle = '#c4c7cc'; x.fillRect(0, 0, N, N);
  noise(x, N, 8, .3); noise(x, N, 64, .2); noise(x, N, 256, .25, 'overlay');
  const rects = []; (function split(px, py, w, h, dep) { if (dep > 3 || (dep > 1 && rnd() < .3)) { rects.push([px, py, w, h]); return; }
    if (w > h) { const s = w * R(.3, .7); split(px, py, s, h, dep + 1); split(px + s, py, w - s, h, dep + 1); } else { const s = h * R(.3, .7); split(px, py, w, s, dep + 1); split(px, py + s, w, h - s, dep + 1); } })(0, 0, N, N, 0);
  rects.forEach(([px, py, w, h]) => { x.fillStyle = 'rgba(' + (rnd() < .5 ? '255,255,255' : '0,0,0') + ',' + R(0, .06) + ')'; x.fillRect(px, py, w, h);
    x.strokeStyle = 'rgba(18,20,24,.75)'; x.lineWidth = 2.2; x.strokeRect(px + 1, py + 1, w - 2, h - 2);
    x.strokeStyle = 'rgba(255,255,255,.16)'; x.lineWidth = 1; x.strokeRect(px + 3, py + 3, w - 6, h - 6);
    if (rnd() < .6) { x.fillStyle = 'rgba(15,16,18,.6)'; for (let k = 8; k < w - 6; k += 18) { x.fillRect(px + k, py + 6, 2.4, 2.4); x.fillRect(px + k, py + h - 8, 2.4, 2.4); } } });
  x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = .8; for (let k = 0; k < 110; k++) { const a = R(0, N), b = R(0, N), r = R(4, 24), t = R(0, 6.28); x.beginPath(); x.moveTo(a, b); x.lineTo(a + Math.cos(t) * r, b + Math.sin(t) * r); x.stroke(); }
  streaks(x, N, 24, '30,24,18', .2);
  return c; }
function clothC() { const N = 256, c = cnv(N), x = c.getContext('2d'); x.fillStyle = '#cfcabe'; x.fillRect(0, 0, N, N);
  noise(x, N, 16, .4); noise(x, N, 128, .3, 'overlay'); x.fillStyle = 'rgba(0,0,0,.07)'; for (let k = 0; k < N; k += 3) { x.fillRect(0, k, N, 1); x.fillRect(k, 0, 1, N); }
  blotches(x, N, 8, '50,40,30', .18, 60); return c; }

export function makeTextures(scene) {
  const tex = (c, name, mip = true) => { const t = new B.DynamicTexture(name, c, scene, mip); t.update(); t.wrapU = t.wrapV = B.Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = 4; return t; };
  const cc = concreteC(), pc = pavingC(), ac = asphaltC(), dc = dirtC(), mc = metalC(), kc = clothC();
  return {
    conc: tex(cc, 'conc'), concN: tex(normalFrom(cc, 3), 'concN'),
    pave: tex(pc, 'pave'), paveN: tex(normalFrom(pc, 3), 'paveN'),
    asph: tex(ac, 'asph'), asphN: tex(normalFrom(ac, 2.5), 'asphN'),
    dirt: tex(dc, 'dirt'), dirtN: tex(normalFrom(dc, 2), 'dirtN'),
    metal: tex(mc, 'metal'), metalN: tex(normalFrom(mc, 4), 'metalN'),
    cloth: tex(kc, 'cloth'),
  };
}

/* Metal and anything glossy is physically based (roughness and metalness, reflecting the generated sky). Rough, non-metal surfaces
   (ground, concrete, cloth) use the cheaper standard shader: they cover most of the screen and the physically based one cost
   ~25 ms a frame there for no visible difference. Glowing, unlit and additive materials stay simple too. */
export function makeMat(scene, name, hex, o = {}) {
  if (o.metal && !o.unlit && !o.add) {
    const m = new B.PBRMaterial(name, scene);
    m.albedoColor = C(hex).toLinearSpace(); m.metallic = o.metal || 0; m.roughness = o.rough == null ? .9 : o.rough;
    /* direct light is brightened to sit level with the standard-shaded surfaces around it (the two shaders respond differently to the same lights) */
    m.usePhysicalLightFalloff = false; m.maxSimultaneousLights = 8; m.environmentIntensity = o.env == null ? .9 : o.env; m.directIntensity = 1.9;
    if (o.tex) m.albedoTexture = o.tex;
    if (o.bump) { m.bumpTexture = o.bump; m.bumpTexture.level = o.bumpLevel || .7; }
    if (o.emissive) m.emissiveColor = C(o.emissive);
    if (o.alpha != null) { m.alpha = o.alpha; m.backFaceCulling = false; }
    if (o.twoSided) { m.backFaceCulling = false; m.twoSidedLighting = true; }
    return m;
  }
  const m = new B.StandardMaterial(name, scene);
  m.diffuseColor = C(hex); m.specularColor = new B.Color3(.05, .05, .05); m.maxSimultaneousLights = 8;
  if (o.tex) m.diffuseTexture = o.tex;
  if (o.bump) { m.bumpTexture = o.bump; m.bumpTexture.level = o.bumpLevel || .7; }
  if (o.spec) { m.specularColor = new B.Color3(o.spec, o.spec, o.spec); m.specularPower = o.power || 32; }
  if (o.emissive) m.emissiveColor = C(o.emissive);
  if (o.unlit) { m.disableLighting = true; m.emissiveColor = m.emissiveColor || C(hex); }
  if (o.alpha != null) { m.alpha = o.alpha; m.backFaceCulling = false; }
  if (o.add) m.alphaMode = B.Engine.ALPHA_ADD;
  if (o.twoSided) m.backFaceCulling = false;
  return m;
}

/* The Ash & Neon palette, locked in from the look test. */
export const LOOK = {
  sky: '#4a443d', fog: '#4a443d', fogD: .016, hemiSky: '#b0a494', hemiGround: '#2d2824', hemiI: .82,
  sun: '#e6d2b4', sunI: 1.15, sunDir: [-.55, -1, .4], ground: '#7d756b', road: '#5c5852', build: '#a39a8f', rubble: '#8a8178',
  machine: '#ff2a2a', gate: '#1fe0ff', human: '#ffb24a', exposure: 1.5, contrast: 1.3, sat: -22, bloomW: .55, bloomT: .55, glowI: .9,
  weatherK: 1,   // how much ash drifts through the air
  env: null,     // reflection sky colours (look.js makeEnvironment); null keeps the outdoor sky
};
/* A region can override any of these with its own `look` (main.js applies it before the lights and materials are made). */

export function makeMaterials(scene, T) {
  const mat = (n, h, o) => makeMat(scene, n, h, o);
  T.dirt.uScale = T.dirt.vScale = T.dirtN.uScale = T.dirtN.vScale = 50;
  const M = {
    ground: mat('ground', LOOK.ground, { tex: T.dirt, bump: T.dirtN, bumpLevel: .6, rough: .95 }),
    road: mat('road', LOOK.road, { tex: T.asph, bump: T.asphN, bumpLevel: .5, rough: .82 }),
    pave: mat('pave', '#9a948a', { tex: T.pave, bump: T.paveN, bumpLevel: .6, rough: .88 }),
    conc: mat('conc', LOOK.build, { tex: T.conc, bump: T.concN, bumpLevel: .8, rough: .92 }),
    rubble: mat('rubble', LOOK.rubble, { tex: T.conc, bump: T.concN, bumpLevel: 1, rough: .95 }),
    lane: mat('lane', '#9a8442', { tex: T.asph, rough: .75 }),
    rust: mat('rust', '#6a5040', { tex: T.metal, bump: T.metalN, bumpLevel: .6, metal: .35, rough: .7 }),
    trunk: mat('trunk', '#4a4038', { tex: T.cloth, rough: .95 }),
    mech: mat('mech', '#5c616b', { tex: T.metal, bump: T.metalN, bumpLevel: .9, metal: .35, rough: .45, env: 1.5 }),
    mechDark: mat('mechDark', '#363a42', { tex: T.metal, bump: T.metalN, bumpLevel: .9, metal: .35, rough: .5, env: 1.5 }),
    eye: mat('eye', '#000000', { unlit: true, emissive: LOOK.machine }),
    beam: mat('beam', '#000000', { unlit: true, emissive: LOOK.machine, alpha: .07, add: true }),
    charge: mat('charge', '#000000', { unlit: true, emissive: LOOK.machine }),
    bolt: mat('bolt', '#000000', { unlit: true, emissive: LOOK.machine }),
    ring: mat('ring', '#000000', { unlit: true, emissive: LOOK.machine, alpha: .3, add: true }),
    gateFrame: mat('gateFrame', '#555963', { tex: T.metal, bump: T.metalN, metal: .4, rough: .38, env: 1.5 }),
    gateNode: mat('gateNode', '#000000', { unlit: true, emissive: LOOK.gate }),
    gateDisc: mat('gateDisc', '#000000', { unlit: true, emissive: LOOK.gate, alpha: .3, add: true }),
    uniform: mat('uniform', '#59663f', { tex: T.cloth, rough: 1 }), armor: mat('armor', '#4b5136', { tex: T.metal, bump: T.metalN, metal: .2, rough: .6 }),
    medic: mat('medic', '#4d5560', { tex: T.cloth, rough: 1 }), medicArmor: mat('medicArmor', '#7a6a4a', { tex: T.metal, bump: T.metalN, metal: .2, rough: .6 }),
    gun: mat('gun', '#2a2c31', { tex: T.metal, metal: .7, rough: .35 }), skin: mat('skin', '#8a6a52', { rough: .7 }),
    visor: mat('visor', '#000000', { unlit: true, emissive: '#ffb24a' }),
    /* the squad: the player's operator kit (olive, amber) and Mara's medic gear (slate, green) */
    fatigue: mat('fatigue', '#6a7448', { tex: T.cloth, rough: 1 }), carrier: mat('carrier', '#33382a', { tex: T.cloth, rough: 1 }),
    pad: mat('pad', '#363b2c', { tex: T.metal, bump: T.metalN, metal: .2, rough: .6 }), webbing: mat('webbing', '#2f3328', { tex: T.cloth, rough: 1 }),
    radioPack: mat('radioPack', '#535a3c', { tex: T.cloth, rough: 1 }), idStripe: mat('idStripe', '#d08a2a', { tex: T.metal, rough: 1 }),
    boot: mat('boot', '#2a2c31', { tex: T.metal, rough: 1 }), sole: mat('sole', '#151618'), glove: mat('glove', '#26282b', { tex: T.cloth, rough: 1 }),
    coat: mat('coat', '#4a5560', { tex: T.cloth, rough: 1 }), coatPanel: mat('coatPanel', '#4a5560', { tex: T.cloth, twoSided: true }),
    hood: mat('hood', '#363d45', { tex: T.cloth, twoSided: true }), trousers: mat('trousers', '#403d37', { tex: T.cloth, rough: 1 }),
    medScarf: mat('medScarf', '#8a7650', { tex: T.cloth, rough: 1 }), wrap: mat('wrap', '#857c68', { tex: T.cloth, rough: 1 }),
    bone: mat('bone', '#cfc6ae', { tex: T.cloth, rough: 1 }), medRed: mat('medRed', '#9c2f1c'),
    leather: mat('leather', '#4a3626', { tex: T.cloth, rough: 1 }), medBoot: mat('medBoot', '#3a2c22', { tex: T.cloth, rough: 1 }),
    lens: mat('lens', '#000000', { unlit: true, emissive: '#8affa0' }), vial: mat('vial', '#000000', { unlit: true, emissive: '#4fb873' }),
    fire: mat('fire', '#000000', { unlit: true, emissive: '#ff7a1a' }), tarp: mat('tarp', '#6b5a3e', { tex: T.cloth, twoSided: true }),
    tarpB: mat('tarpB', '#4f5a4a', { tex: T.cloth, twoSided: true }),
    sand: mat('sand', '#8c7b5a', { tex: T.cloth, rough: 1 }), crate: mat('crate', '#3a3a44', { tex: T.metal, bump: T.metalN, metal: .15, rough: .6 }),
    wood: mat('wood', '#6a5238', { tex: T.cloth }),
    lamp: mat('lamp', '#000000', { unlit: true, emissive: '#ffcf7a' }),
    tracer: mat('tracer', '#000000', { unlit: true, emissive: '#ffc35a' }),
    allyBolt: mat('allyBolt', '#000000', { unlit: true, emissive: '#ffd27a' }),
    mark: mat('mark', '#000000', { unlit: true, emissive: '#ff2a2a', alpha: .35, add: true }),
  };
  return M;
}
