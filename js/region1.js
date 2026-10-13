/* Region 01, Dead City: the map (walkable streets, ruins, props, set pieces, the relay gate) and how it plays as a survival arena:
   two camps of survivors to keep standing, raids marching on them from the gate, and a console that shuts the gate for a while. */
import { B, G, V, MT, R, rnd, C, dist2 } from './core.js';
import { Geo, gbox, gprism, gcyl, gmesh, Buckets } from './geo.js';
import { buildGate } from './gate.js';
import { Actor } from './actors.js';
import { rollLoot } from './loot.js';
import { survival } from './survival.js';

/* Walkable areas, south to north: outpost → Ring Road → Market Square → east street → rail yard → north street → gate plaza. */
export const AREAS = {
  outpost: [-14, -14, 14, 14],
  avenue: [-5, 13, 5, 65],
  square: [-17, 64, 17, 96],
  eastSt: [16, 75, 42, 85],
  yard: [40, 64, 66, 100],
  northSt: [45, 99, 55, 118],
  plaza: [30, 117, 70, 158],
};
export const GATE = { x: 50, z: 152, y: 4.4 };
const BARRIER = [[-.32, 0], [.32, 0], [.32, .1], [.1, .82], [-.1, .82], [-.32, .1]];
function overlapsOpen(x0, z0, x1, z1) { for (const o of G.open) if (x0 < o[2] && x1 > o[0] && z0 < o[3] && z1 > o[1]) return true; return false; }
function distToOpen(x, z) { let best = 1e9; for (const o of G.open) { const dx = Math.max(o[0] - x, 0, x - o[2]), dz = Math.max(o[1] - z, 0, z - o[3]); best = Math.min(best, Math.hypot(dx, dz)); } return best; }
const ob = (x, z, hw, hd, h) => G.obstacles.push({ x, z, hw, hd, h });

export function buildRegion(M) {
  const scene = G.scene;
  G.open = Object.values(AREAS);
  /* what the ground detail pass paints: scorch marks and oil stains (pushed as props go down), faded road paint, skids and puddles */
  const paint = [];
  for (const x of [-4.2, 4.2]) paint.push([x, 14, x, 64, .12, '196,188,160', .2]);          // Ring Road edge lines
  for (const z of [76.2, 83.8]) paint.push([17, z, 41, z, .12, '196,188,160', .18]);           // east street
  for (const x of [45.8, 54.2]) paint.push([x, 100, x, 117, .12, '196,188,160', .18]);         // north street
  for (const [cx, cz, along] of [[0, 15.5, 'x'], [0, 62.5, 'x'], [42.5, 80, 'z']])            // zebra crossings
    for (let k = -3; k <= 3; k++) paint.push(along === 'x' ? [cx + k * 1.1, cz - 1.4, cx + k * 1.1, cz + 1.4, .45, '200,192,170', .13] : [cx - 1.4, cz + k * 1.1, cx + 1.4, cz + k * 1.1, .45, '200,192,170', .13]);
  G.decalHints = { scorch: [], oil: [], bounds: [-20, -18, 72, 162], res: [1024, 2048], paint, skids: { n: 10, x: [-3, 3], z: [16, 60] }, puddles: [[0, -6, 1.4], [-6, 2, 1], [6, 6, 1.2]] };
  const BK = Buckets(40), RUB = [[], [], []], SAND = [];
  const at = (x, z, m) => BK.at(x, z, m);

  /* ---------- ground and street surfaces ---------- */
  const ground = B.MeshBuilder.CreateGround('ground', { width: 320, height: 320 }, scene);
  ground.position.set(25, 0, 60); ground.material = M.ground; ground.receiveShadows = true; ground.isPickable = false; ground.freezeWorldMatrix();
  const streets = [AREAS.avenue, AREAS.eastSt, AREAS.northSt, [-5, 96, 5, 104], [45, 156, 55, 175]];
  const sq = [AREAS.square, AREAS.plaza];
  { const g = Geo(), p = Geo();
    for (const [x0, z0, x1, z1] of streets) gbox(g, { x: (x0 + x1) / 2, y: .02, z: (z0 + z1) / 2, w: x1 - x0, h: .04, d: z1 - z0, uv: 1 / 6, ao: false, noBottom: true });
    for (const [x0, z0, x1, z1] of sq) gbox(p, { x: (x0 + x1) / 2, y: .03, z: (z0 + z1) / 2, w: x1 - x0, h: .06, d: z1 - z0, uv: 1 / 4, ao: false, noBottom: true });
    gmesh('streets', g, M.road, { shadow: false, freeze: true }); gmesh('paving', p, M.pave, { shadow: false, freeze: true }); }
  const lanes = B.MeshBuilder.CreateBox('lane', { width: .2, height: .05, depth: 2 }, scene); lanes.material = M.lane; lanes.isPickable = false; lanes.receiveShadows = true;
  { const L = []; for (let z = 15; z < 64; z += 6) if (rnd() > .2) L.push(B.Matrix.Translation(R(-.1, .1), .05, z));
    for (let x = 18; x < 41; x += 6) if (rnd() > .2) L.push(B.Matrix.RotationY(Math.PI / 2).multiply(B.Matrix.Translation(x, .05, 80)));
    for (let z = 100; z < 117; z += 6) L.push(B.Matrix.Translation(50, .05, z));
    lanes.thinInstanceAdd(L); }
  /* broken kerbs and pavement slabs just outside the streets */
  const kerb = (x0, z0, x1, z1, alongZ) => { const len = alongZ ? z1 - z0 : x1 - x0;
    for (let s = 0; s < len; s += 3) { if (rnd() < .1) continue; const tilt = rnd() < .12 ? R(-.15, .15) : 0;
      const x = alongZ ? x0 : x0 + s + 1.5, z = alongZ ? z0 + s + 1.5 : z0;
      gbox(at(x, z, 'conc'), { x, y: .09, z, w: alongZ ? 1.8 : 2.9, h: .18, d: alongZ ? 2.9 : 1.8, rx: alongZ ? tilt : 0, rz: alongZ ? 0 : tilt, tint: R(.85, 1.05), uv: .33 }); } };
  kerb(-6, 14, -6, 64, true); kerb(6, 14, 6, 64, true); kerb(17, 74, 40, 74, false); kerb(17, 86, 40, 86, false); kerb(44, 100, 44, 117, true); kerb(56, 100, 56, 117, true);

  /* ---------- ruined buildings around every walkable area ---------- */
  const FH = 3.2;
  function rubblePile(x, z, n, spread, y) {
    for (let k = 0; k < n; k++) { const px = x + R(-spread, spread), pz = z + R(-spread, spread), s = R(.25, 1.1);
      RUB[k % 3].push(B.Matrix.Compose(V(s * R(.8, 1.6), s * R(.5, 1), s * R(.8, 1.5)), B.Quaternion.FromEulerAngles(R(-.5, .5), R(0, 3.1), R(-.5, .5)), V(px, (y || 0) + s * .18, pz))); }
  }
  function building(cx, cz, w, d, h) {
    const C = at(cx, cz, 'conc'), CAPG = C, REB = at(cx, cz, 'rust');
    const floors = Math.max(1, Math.round(h / FH)), roofed = rnd() < .28, quad = rnd() < .6 ? Math.floor(rnd() * 4) : -1;
    const inQuad = (x, z) => quad >= 0 && ((quad & 1) ? x > 0 : x < 0) && ((quad & 2) ? z > 0 : z < 0);
    const nx = Math.max(2, Math.round(w / 2.6)), nz = Math.max(2, Math.round(d / 2.6));
    const cols = []; for (let k = 0; k <= nx; k++) { cols.push([-w / 2 + k * w / nx, -d / 2]); cols.push([-w / 2 + k * w / nx, d / 2]); }
    for (let k = 1; k < nz; k++) { cols.push([-w / 2, -d / 2 + k * d / nz]); cols.push([w / 2, -d / 2 + k * d / nz]); }
    const bays = []; for (let k = 0; k < nx; k++) { bays.push([-w / 2 + (k + .5) * w / nx, -d / 2, w / nx, 'x']); bays.push([-w / 2 + (k + .5) * w / nx, d / 2, w / nx, 'x']); }
    for (let k = 0; k < nz; k++) { bays.push([-w / 2, -d / 2 + (k + .5) * d / nz, d / nz, 'z']); bays.push([w / 2, -d / 2 + (k + .5) * d / nz, d / nz, 'z']); }
    const solid = bays.map(() => rnd() < .22), store = rnd() < .5;
    const rebar = (x, y, z, n) => { for (let k = 0; k < n; k++) { const l = R(.5, 1.4); gcyl(REB, { r0: .025, h: l, seg: 4, x: x + R(-.15, .15), y: y + l / 2 - .1, z: z + R(-.15, .15), rx: R(-.5, .5), rz: R(-.5, .5), ao: false }); } };
    for (let f = 0; f < floors; f++) {
      const y0 = f * FH, brk = f === floors - 1 && !roofed;
      if (f > 0) { for (const qx of [-1, 1]) for (const qz of [-1, 1]) { if (brk && inQuad(qx, qz)) continue;
          gbox(C, { x: cx + qx * w / 4, y: y0, z: cz + qz * d / 4, w: w / 2 + .1, h: .3, d: d / 2 + .1, tint: R(.9, 1.05) });
          if (brk && rnd() < .6) rubblePile(cx + qx * w / 4, cz + qz * d / 4, 4, w / 5, y0 + .15); }
        if (brk && quad >= 0 && rnd() < .7) { const qx = (quad & 1) ? 1 : -1, qz = (quad & 2) ? 1 : -1; gbox(C, { x: cx + qx * w / 4, y: y0 - 1.1, z: cz + qz * d / 4, w: w / 2, h: .3, d: d / 2, rx: R(.4, .7) * qz, rz: R(-.3, .3), tint: .9 }); } }
      cols.forEach(([px, pz]) => { if (brk && inQuad(px, pz)) return; const ch = brk ? FH * R(.2, 1) : FH;
        gbox(C, { x: cx + px, y: y0 + ch / 2, z: cz + pz, w: .5, h: ch, d: .5, tint: R(.85, 1) }); if (brk && ch < FH * .9) rebar(cx + px, y0 + ch, cz + pz, 2 + rnd() * 2 | 0); });
      bays.forEach(([px, pz, len, ax], bi) => {
        if (brk && (inQuad(px, pz) || rnd() < .35)) return;
        const L = len - .5, tint = R(.8, 1), W = ax === 'x' ? L : .26, D = ax === 'x' ? .26 : L;
        if (solid[bi] && !(f === 0 && store)) { const hh = brk ? FH * R(.3, 1) : FH; gbox(C, { x: cx + px, y: y0 + hh / 2, z: cz + pz, w: W, h: hh, d: D, tint }); return; }
        if (!(f === 0 && store)) gbox(C, { x: cx + px, y: y0 + .55, z: cz + pz, w: W, h: 1.1, d: D, tint });
        if (!brk || rnd() < .4) gbox(C, { x: cx + px, y: y0 + FH - .35, z: cz + pz, w: W, h: .7, d: D, tint });
      });
    }
    if (roofed) { const y = floors * FH; gbox(C, { x: cx, y, z: cz, w: w + .1, h: .3, d: d + .1 });
      gbox(C, { x: cx, y: y + .5, z: cz - d / 2, w, h: .7, d: .25 }); gbox(C, { x: cx, y: y + .5, z: cz + d / 2, w, h: .7, d: .25 }); gbox(C, { x: cx - w / 2, y: y + .5, z: cz, w: .25, h: .7, d }); gbox(C, { x: cx + w / 2, y: y + .5, z: cz, w: .25, h: .7, d });
      if (rnd() < .6) gbox(C, { x: cx + R(-w / 4, w / 4), y: y + .9, z: cz + R(-d / 4, d / 4), w: 1.6, h: 1.5, d: 1.6, tint: .8 }); }
    rubblePile(cx, cz, 9, Math.max(w, d) / 2 + 2);
    ob(cx, cz, w / 2 + .15, d / 2 + .15, roofed ? floors * FH + 1 : Math.max(FH, (floors - 1) * FH + 1.2));
  }
  for (let gx = -52; gx <= 96; gx += 13) for (let gz = -42; gz <= 176; gz += 13) {
    const cx = gx + R(-1.2, 1.2), cz = gz + R(-1.2, 1.2), w = R(6.5, 10), d = R(6.5, 10);
    if (overlapsOpen(cx - w / 2 - 1.2, cz - d / 2 - 1.2, cx + w / 2 + 1.2, cz + d / 2 + 1.2)) continue;
    const far = distToOpen(cx, cz);
    if (far > 24) continue;
    if (rnd() < .1) { rubblePile(cx, cz, 26, 4.5); continue; }
    building(cx, cz, w, d, R(6, 13) + (far > 12 ? R(2, 6) : 0));
  }

  /* ---------- reusable props ---------- */
  const car = (x, z, ry, burnt) => { const g = at(x, z, 'rust');
    const P = MT(0, 0, 0, 0, ry, 0).multiply(MT(x, 0, z));
    gprism(g, [[-2.1, .32], [2.05, .32], [2.18, .7], [1.9, .86], [-2.05, .92], [-2.16, .62]], -.88, .88, P, { uv: .5 });
    gprism(g, [[-1.5, .86], [1.05, .86], [.45, 1.42], [-1.15, 1.45]], -.8, .8, P, { tint: .45, uv: .5 });
    [[-1, 1.3], [1, 1.3], [-1, -1.35], [1, -1.35]].forEach(([s, zz], k) => { if (burnt && k === 2) return; gcyl(g, { r0: .36, h: .24, seg: 10, M: MT(0, 0, 0, 0, 0, Math.PI / 2).multiply(MT(s * .86, .36, zz)).multiply(P), tint: .4 }); });
    ob(x, z, 1.7, 1.7, 1.5); G.decalHints.oil.push([x, z, 1.6]); if (burnt) G.decalHints.scorch.push([x, z, 3.2]); };
  const bus = (x, z, ry) => { const g = at(x, z, 'rust'), P = MT(0, 0, 0, 0, ry, .05).multiply(MT(x, 0, z));
    gprism(g, [[-5.2, .4], [5.2, .4], [5.3, 2.9], [-5.3, 2.95]], -1.25, 1.25, P, { uv: .4 });
    for (let k = -4; k <= 4; k += 1.6) gbox(g, { M: MT(1.27, 2.1, k).multiply(P), w: .04, h: .8, d: 1.2, tint: .25, ao: false });
    [[-1, 3.6], [1, 3.6], [-1, -3.6], [1, -3.6]].forEach(([s, zz]) => gcyl(g, { r0: .5, h: .3, seg: 10, M: MT(0, 0, 0, 0, 0, Math.PI / 2).multiply(MT(s * 1.15, .5, zz)).multiply(P), tint: .4 }));
    ob(x, z, 1.6 + Math.abs(Math.sin(ry)) * 4, 1.6 + Math.abs(Math.cos(ry)) * 4, 3); G.decalHints.oil.push([x, z, 2.6]); };
  const tank = (x, z, ry) => { const g = at(x, z, 'rust'), M0 = MT(0, 0, 0, 0, ry, .04).multiply(MT(x, 0, z));
    gprism(g, [[-2.7, .35], [2.3, .35], [2.9, .9], [2.5, 1.35], [-2.5, 1.4], [-2.8, 1.0]], -1.45, 1.45, M0, { uv: .4 });
    for (const s of [-1, 1]) { gprism(g, [[-2.9, .55], [-2.55, .08], [2.55, .08], [2.95, .55], [2.65, 1.0], [-2.65, 1.0]], s > 0 ? 1.45 : -2.05, s > 0 ? 2.05 : -1.45, M0, { tint: .55, uv: .6 });
      for (let w = 0; w < 5; w++) gcyl(g, { r0: .36, h: .12, seg: 10, M: MT(0, 0, 0, 0, 0, Math.PI / 2).multiply(MT(s * 2.08, .42, -2 + w)).multiply(M0), tint: .45 }); }
    const tur = MT(0, 0, -.3, 0, .55, 0).multiply(M0);
    gprism(g, [[-1.4, 1.4], [1.2, 1.4], [1.7, 1.75], [1.0, 2.2], [-1.2, 2.25], [-1.6, 1.85]], -1.1, 1.1, tur, { uv: .4 });
    gcyl(g, { r0: .13, r1: .11, h: 4, seg: 8, M: MT(0, 2, 0).multiply(MT(0, 0, 0, Math.PI / 2 + .14, 0, 0)).multiply(MT(0, 1.75, 1.8)).multiply(tur), tint: .85 });
    ob(x, z, 2.8, 3, 2.4); G.decalHints.oil.push([x, z, 2.4]); G.decalHints.scorch.push([x, z, 4]); };
  const barrier = (x, z, ry, tip) => { gprism(at(x, z, 'conc'), BARRIER, -1.2, 1.2, MT(x, tip ? .32 : 0, z, 0, ry + Math.PI / 2, tip ? 1.4 : 0), { tint: R(.85, 1), uv: .4 });
    const c = Math.abs(Math.cos(ry)), s = Math.abs(Math.sin(ry)); ob(x, z, .35 * c + 1.2 * s, 1.2 * c + .35 * s, .9); };
  const pole = (x, z, dir, bend) => { const g = at(x, z, 'rust'), Mb = MT(x, 0, z, bend || 0, 0, (bend || 0) * .4);
    gcyl(g, { r0: .1, r1: .07, h: 6.5, seg: 6, M: MT(0, 3.25, 0).multiply(Mb), ao: false });
    gbox(g, { M: MT(dir * .8, 6.4, 0).multiply(Mb), w: 1.8, h: .12, d: .14, ao: false }); gbox(g, { M: MT(dir * 1.6, 6.3, 0).multiply(Mb), w: .5, h: .16, d: .24, ao: false }); };
  const barrel = (x, z, burning) => { const g = at(x, z, 'rust'); gcyl(g, { r0: .4, h: 1.1, seg: 12, x, y: .55, z, uv: .8 }); for (const yy of [.2, .55, .9]) gcyl(g, { r0: .42, h: .05, seg: 12, x, y: yy, z, tint: .7 }); ob(x, z, .45, .45, 1.1);
    if (burning) { G.decalHints.scorch.push([x, z, 1.6]); G.FX.campfire(V(x, 1.1, z)); G.lightSources.push({ pos: V(x, 1.9, z), color: C('#ff6418'), range: 9, intensity: 1.45, flicker: true }); } };
  const crate = (x, z, ry, s = 1) => { gbox(at(x, z, 'crate'), { x, y: .35 * s, z, w: 1.1 * s, h: .7 * s, d: .8 * s, ry, uv: .6 }); ob(x, z, .6 * s, .6 * s, .7 * s); };
  const sandbags = (x0, z0, x1, z1, rows = 3) => { const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / .72)), a = Math.atan2(x1 - x0, z1 - z0);
    for (let r = 0; r < rows; r++) for (let k = 0; k < n - (r % 2); k++) { const t = (k + .5 + (r % 2) * .5) / n;
      SAND.push(B.Matrix.Compose(V(1, 1, 1), B.Quaternion.FromEulerAngles(R(-.05, .05), a + Math.PI / 2, R(-.05, .05)), V(x0 + (x1 - x0) * t, .1 + r * .19, z0 + (z1 - z0) * t))); }
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2; ob(cx, cz, Math.abs(x1 - x0) / 2 + .4, Math.abs(z1 - z0) / 2 + .4, .55); };
  const tent = (x, z, ry, mat = 'tarp') => { const g = at(x, z, mat), P = MT(0, 0, 0, 0, ry, 0).multiply(MT(x, 0, z));
    gprism(g, [[-1.4, 0], [1.4, 0], [0, 1.9]], -1.6, 1.6, P, { uv: .5 }); const r = at(x, z, 'rust');
    gcyl(r, { r0: .04, h: 2.1, seg: 4, M: MT(0, 1, -1.65).multiply(P), ao: false }); gcyl(r, { r0: .04, h: 2.1, seg: 4, M: MT(0, 1, 1.65).multiply(P), ao: false }); ob(x, z, 1.6, 1.6, 1.9); };
  const campfire = (x, z) => { const g = at(x, z, 'rust');
    for (let k = 0; k < 5; k++) gcyl(g, { r0: .1, h: 1.2, seg: 6, M: MT(0, 0, 0, Math.PI / 2, k * .63, 0).multiply(MT(x, .12, z)), ao: false, tint: .5 });
    for (let k = 0; k < 9; k++) { const a = k / 9 * 6.28; gbox(at(x, z, 'conc'), { x: x + Math.cos(a) * .75, y: .1, z: z + Math.sin(a) * .75, w: .28, h: .2, d: .22, ry: a, tint: .7 }); }
    for (let k = 0; k < 4; k++) { const f = B.MeshBuilder.CreateCylinder('flame', { height: R(.6, 1.1), diameterTop: 0, diameterBottom: R(.25, .45), tessellation: 6 }, scene); f.position.set(x + R(-.2, .2), .45, z + R(-.2, .2)); f.material = M.fire; f.isPickable = false; G.flames.push(f); }
    G.FX.campfire(V(x, .3, z)); G.lightSources.push({ pos: V(x, 1.3, z), color: C('#ff6418'), range: 13, intensity: 1.9, flicker: true }); ob(x, z, .8, .8, .5); G.decalHints.scorch.push([x, z, 1.8]); };
  const block = (x, z, w, d, h) => { gbox(at(x, z, 'conc'), { x, y: h / 2, z, w, h, d, tint: R(.8, 1) }); ob(x, z, w / 2, d / 2, h); };
  G.flames = [];

  /* ---------- Outpost: sandbag ring, tents, campfire ---------- */
  sandbags(-12, -12, 12, -12); sandbags(-12, -12, -12, 12); sandbags(12, -12, 12, 12); sandbags(-12, 12, -4, 12); sandbags(4, 12, 12, 12);
  tent(-7, -6, .3); tent(7.5, -7, -.4, 'tarpB'); tent(-8, 5, 1.4);
  campfire(0, -1.5);
  crate(8, 4, .2); crate(9.2, 4.1, -.1); crate(8.6, 4, .4, .7); barrel(-9.5, 9); barrel(-8.6, 9.8); barrel(9.5, -10);
  { const g = at(-9, -9, 'rust'); gcyl(g, { r0: .08, h: 8, seg: 6, x: -9.5, y: 4, z: -9.5, ao: false }); for (let k = 0; k < 3; k++) gbox(g, { x: -9.5, y: 6.5 + k * .5, z: -9.5, w: .9 - k * .2, h: .05, d: .05, ao: false }); ob(-9.5, -9.5, .2, .2, 8); }
  { const g = Geo(); for (const [x, z] of [[-3, 10.5], [3, 10.5]]) { gcyl(at(x, z, 'rust'), { r0: .06, h: 2.6, seg: 6, x, y: 1.3, z, ao: false }); gcyl(g, { r0: .12, h: .22, seg: 8, x, y: 2.65, z, ao: false }); G.lightSources.push({ pos: V(x, 2.6, z), color: C('#ffcf7a'), range: 8, intensity: 1.2 }); }
    gmesh('outpostLamps', g, M.lamp, { shadow: false }); }
  { const g = at(6, 8, 'wood'); gbox(g, { x: 5.5, y: .8, z: 8, w: 2.4, h: .1, d: 1, ry: .1 }); for (const [dx, dz] of [[-1, -.4], [1, -.4], [-1, .4], [1, .4]]) gbox(g, { x: 5.5 + dx, y: .4, z: 8 + dz, w: .1, h: .8, d: .1 }); ob(5.5, 8, 1.3, .6, .9); }

  /* ---------- Ring Road ---------- */
  car(2.6, 21, .25); car(2.4, 30, 2.9, true); barrier(1.2, 26.5, .2); barrier(3.2, 38.5, -.3, true); tank(-1.2, 44, .15); car(2.9, 51, -.2);
  bus(-3.1, 37, .06); barrier(2.6, 61, .1); barrier(-2.4, 58.5, .3, true);
  for (const z of [18, 34, 50]) { pole(-5.4, z, 1, z === 34 ? .35 : 0); pole(5.4, z + 8, -1, 0); }
  for (let k = 0; k < 40; k++) rubblePile(R(-4, 4), R(15, 63), 1, .5);

  /* ---------- Market Square: fountain, stalls, raider barricade ---------- */
  { const g = at(0, 80, 'conc'), oct = r => [...Array(8)].map((_, k) => { const a = k / 8 * Math.PI * 2 + Math.PI / 8; return [Math.cos(a) * r, Math.sin(a) * r]; });
    const vert = MT(0, 0, 0, 0, 0, Math.PI / 2).multiply(MT(0, 0, 80));
    gprism(g, oct(3.2), 0, .7, vert, { uv: .4 }); gprism(g, oct(.6), .7, 2.6, vert, { uv: .4 }); gprism(g, oct(1.4), 2.6, 2.9, vert, { uv: .4, tint: .9 });
    ob(0, 80, 3, 3, .7); ob(0, 80, .7, .7, 3); }
  for (const x of [-10, -4, 4, 10]) { const g = at(x, 93, 'rust'); gcyl(g, { r0: .05, h: 2.4, seg: 4, x: x - 1.2, y: 1.2, z: 93.5, ao: false }); gcyl(g, { r0: .05, h: 2.4, seg: 4, x: x + 1.2, y: 1.2, z: 93.5, ao: false });
    gbox(at(x, 93, rnd() < .5 ? 'tarp' : 'tarpB'), { x, y: 2.3, z: 93, w: 2.8, h: .04, d: 2, rx: R(-.25, -.1), ao: false }); crate(x + R(-.6, .6), 93.4, R(-.4, .4), .8); }
  barrier(-11.5, 73, 0); barrier(-12, 76.8, .1); barrier(-11.6, 84, -.1); barrier(-11.2, 87.6, 0); sandbags(-12.4, 79, -12.4, 82, 3);
  car(12, 70, 1.2, true); barrel(12.5, 72.8, true); car(-7, 91, .4); block(9, 88, 2.2, 1.2, 1.2); block(-4, 69, 1.6, 1.6, 1);
  for (let k = 0; k < 30; k++) rubblePile(R(-16, 16), R(65, 95), 1, .5);

  /* ---------- East street ---------- */
  car(22, 78, 1.5); barrier(28, 82.5, 1.57); car(35, 81.5, 1.7, true); pole(24, 74.4, 1, 0); pole(36, 85.6, -1, .3);

  /* ---------- Rail yard: tracks, boxcars, an abandoned raider camp ---------- */
  for (const x of [46, 50, 58, 62]) { const g = at(x, 82, 'rust'); gbox(g, { x: x - .6, y: .08, z: 82, w: .12, h: .16, d: 36, ao: false }); gbox(g, { x: x + .6, y: .08, z: 82, w: .12, h: .16, d: 36, ao: false });
    for (let z = 65; z < 100; z += 1.2) gbox(at(x, z, 'wood'), { x, y: .04, z, w: 1.8, h: .08, d: .25, tint: R(.7, 1) }); }
  const boxcar = (x, z, ry, rz) => { const g = at(x, z, 'rust'), P = MT(0, 0, 0, 0, ry, rz || 0).multiply(MT(x, 0, z));
    gbox(g, { M: MT(0, 2.1, 0).multiply(P), w: 3, h: 3, d: 10, uv: .35 }); gbox(g, { M: MT(0, .45, 0).multiply(P), w: 2.4, h: .5, d: 9.6, tint: .5 });
    for (const zz of [-3.4, 3.4]) for (const s of [-1, 1]) gcyl(g, { r0: .42, h: .2, seg: 10, M: MT(0, 0, 0, 0, 0, Math.PI / 2).multiply(MT(s * 1, .42, zz)).multiply(P), tint: .4 });
    ob(x, z, rz ? 2.8 : 1.6 + Math.abs(Math.sin(ry)) * 4.5, 1.6 + Math.abs(Math.cos(ry)) * 4.5, 3.6); };
  boxcar(62, 72, 0); boxcar(62, 86, .02); boxcar(58, 95, .1); boxcar(64.5, 97.5, .3, 1.35);
  campfire(50, 78); tent(45, 83, 1.2, 'tarpB'); tent(54, 83.5, -1.4); sandbags(42, 70, 54, 70, 3); sandbags(42, 70, 42, 74, 3);
  crate(46.8, 72.2, .1); crate(53, 72, -.3); barrel(55, 76); barrel(55.6, 77, true); barrel(41.8, 88);
  { const g = at(46, 71, 'crate'); gbox(g, { x: 46, y: .4, z: 74.2, w: 1.5, h: .7, d: 1, uv: .6 }); gbox(g, { x: 46, y: .8, z: 74.2, w: 1.56, h: .12, d: 1.06, uv: .6, tint: .8 }); ob(46, 74.2, .8, .55, .9); }

  /* ---------- North street ---------- */
  car(47.5, 104, .2, true); barrier(52.8, 109, 0); barrier(47.4, 115, .1, true); pole(44.6, 106, 1, 0); pole(55.4, 112, -1, .4);

  /* ---------- Gate plaza: cover blocks, the relay gate ---------- */
  block(39, 128, 2.6, 1.2, 1.3); block(61, 128, 2.6, 1.2, 1.3); block(43, 140, 1.4, 2.8, 1.5); block(57, 140, 1.4, 2.8, 1.5); block(36, 146, 2, 2, 2.4); block(64, 146, 2, 2, 2.4);
  barrier(46, 123, 0, true); barrier(54, 124, .2);
  for (let k = 0; k < 30; k++) rubblePile(R(31, 69), R(118, 156), 1, .5);
  const gate = buildGate(M, GATE);

  /* ---------- the camps' survivors, what burns when a camp is overrun, and the gate's console ---------- */
  for (const k in CAMPS) buildCamp(M, CAMPS[k]);
  { const g = at(CONSOLE.x, CONSOLE.z, 'rust'); gbox(g, { x: CONSOLE.x, y: .62, z: CONSOLE.z, w: .9, h: 1.25, d: .6, uv: .6 }); gbox(g, { x: CONSOLE.x, y: 1.3, z: CONSOLE.z - .1, w: 1, h: .12, d: .5, rx: -.4, ao: false });
    gcyl(g, { r0: .05, h: 2.2, seg: 5, x: CONSOLE.x + .35, y: 1.1, z: CONSOLE.z + .2, ao: false }); ob(CONSOLE.x, CONSOLE.z, .45, .3, 1.25);
    const lamp = B.MeshBuilder.CreateBox('gateLamp', { width: .5, height: .1, depth: .06 }, scene); lamp.position.set(CONSOLE.x, 1.02, CONSOLE.z - .31); lamp.isPickable = false;
    CONSOLE.mat = new B.StandardMaterial('gateLamp', scene); CONSOLE.mat.disableLighting = true; CONSOLE.mat.emissiveColor = C('#1fe0ff'); lamp.material = CONSOLE.mat; }

  /* ---------- bare trees in the yard and plaza ---------- */
  { const g = Geo(); for (const [x, z] of [[41.5, 96], [65, 66], [32, 120], [68, 120], [32, 154], [68, 154], [-15, 94], [15, 66]]) {
      const h = R(3, 4.8); gcyl(g, { r0: .24, r1: .12, h, seg: 6, x, y: h / 2, z, rz: R(-.1, .1), ao: false, uv: 1 });
      for (let b = 0; b < 3; b++) { const a = R(0, 6.28), bl = R(1, 1.8); gcyl(g, { r0: .08, r1: .03, h: bl, seg: 5, M: MT(0, bl / 2, 0).multiply(MT(x, h * R(.55, .9), z, Math.cos(a) * .9, 0, Math.sin(a) * .9)), ao: false }); }
      ob(x, z, .3, .3, 4); }
    gmesh('trees', g, M.trunk); }

  /* ---------- finish: merge buckets, instance rubble and sandbags ---------- */
  BK.build({ conc: M.conc, rust: M.rust, crate: M.crate, tarp: M.tarp, tarpB: M.tarpB, wood: M.wood });
  RUB.forEach((list, k) => { if (!list.length) return; const r = B.MeshBuilder.CreateIcoSphere('rock' + k, { radius: .5, subdivisions: 1 }, scene);
    const pos = r.getVerticesData('position'), cache = {}; for (let q = 0; q < pos.length; q += 3) { const key = pos[q].toFixed(2) + ',' + pos[q + 1].toFixed(2) + ',' + pos[q + 2].toFixed(2); if (!cache[key]) cache[key] = R(.7, 1.25); const s = cache[key]; pos[q] *= s; pos[q + 1] *= s * .75; pos[q + 2] *= s; }
    r.setVerticesData('position', pos); r.convertToFlatShadedMesh(); r.material = M.rubble; r.receiveShadows = true; r.isPickable = false; r.thinInstanceAdd(list); G.sg.addShadowCaster(r); });
  const sand = B.MeshBuilder.CreateCapsule('sandbag', { radius: .17, height: .75, tessellation: 8, subdivisions: 1 }, scene);
  sand.bakeTransformIntoVertices(B.Matrix.RotationZ(Math.PI / 2).multiply(B.Matrix.Scaling(1, .6, 1))); sand.material = M.sand; sand.receiveShadows = true; sand.isPickable = false; sand.thinInstanceAdd(SAND); G.sg.addShadowCaster(sand);

  return { gate };
}

/* ---------- the camps: survivors round the fire, flames and smoke for when one is overrun ---------- */
/* The rail yard camp is where the survivors start; the outpost, far to the south, is where they fall back to. at: where the camp stands
   (what the machines go for), fire: its campfire, seats: where the survivors sit, burn: what goes up in flames when it's overrun. */
const CAMPS = {
  yard: { id: 'yard', say: 'the rail yard camp', short: 'Rail yard camp', at: { x: 50, z: 81 }, fire: { x: 50, z: 78 }, seats: [[48.6, 76.8], [51.5, 76.9], [51.7, 78.9]], burn: [[45, 83], [54, 83.5], [46, 74.2]] },
  outpost: { id: 'outpost', say: 'the outpost', short: 'Outpost', at: { x: 0, z: 1.5 }, fire: { x: 0, z: -1.5 }, seats: [[-1.5, -.6], [1.4, -2.4], [-.3, -3.1]], burn: [[-7, -6], [7.5, -7], [-8, 5]] },
};
const CONSOLE = { x: 58.6, z: 148.8 };   // the gate's console, beside its east pylon (you stand on its south side)
/* Seconds to the first raid and between them; a camp's health; the survivors' fire healing you (a second) and a camp mending itself
   (a second) while no machine is near; retaking the rail yard camp (seconds, and how far it must be clear of machines); shutting the
   gate (seconds of work, how long it stays shut, how long before it can be shut again, and how much longer groups take meanwhile);
   and how much sooner groups come once both camps are lost. */
const CITY = { raidFirst: 120, raidEvery: 150, campHp: 900, heal: 6, regen: 3, retake: 8, clear: 12, shut: 8, shutFor: 60, cool: 30, shutK: 1.4, lostK: .8 };
const MOUTH = { x: GATE.x, z: GATE.z - 3 };
const C_ORANGE = C('#ff6418');
function buildCamp(M, K) {
  const S = G.scene; K.people = new B.TransformNode('survivors_' + K.id, S);
  const coats = [M.coat, M.tarp, M.uniform], box = (n, w, h, d, x, y, z, mat, p, rx = 0) => { const m = B.MeshBuilder.CreateBox(n, { width: w, height: h, depth: d }, S); m.parent = p; m.position.set(x, y, z); m.rotation.x = rx; m.material = mat; m.isPickable = false; m.receiveShadows = true; G.sg.addShadowCaster(m); return m; };
  K.seats.forEach(([x, z], i) => { const n = new B.TransformNode('survivor', S), coat = coats[i % coats.length]; n.parent = K.people; n.position.set(x, 0, z); n.rotation.y = Math.atan2(K.fire.x - x, K.fire.z - z);   // facing the fire
    box('seat', .5, .34, .42, 0, .17, -.08, M.wood, n);
    box('torso', .42, .56, .26, 0, .76, -.02, coat, n, -.18);
    const head = B.MeshBuilder.CreateSphere('head', { diameter: .25, segments: 8 }, S); head.parent = n; head.position.set(0, 1.17, .06); head.material = M.skin; head.isPickable = false; G.sg.addShadowCaster(head);
    box('hood', .3, .16, .3, 0, 1.27, .02, coat, n, -.2);
    for (const s of [-1, 1]) { box('thigh', .15, .14, .46, s * .11, .4, .17, M.trousers, n); box('shin', .13, .42, .13, s * .11, .2, .4, M.trousers, n); box('arm', .11, .44, .11, s * .25, .66, .18, coat, n, -.95); } });
  /* when it's overrun: flames where the tents were, a light from them, and smoke over it all */
  K.flames = []; for (const [x, z] of K.burn) for (let k = 0; k < 3; k++) { const f = B.MeshBuilder.CreateCylinder('flame', { height: R(1, 1.8), diameterTop: 0, diameterBottom: R(.5, .9), tessellation: 6 }, S); f.position.set(x + R(-.6, .6), .7, z + R(-.6, .6)); f.material = M.fire; f.isPickable = false; f.setEnabled(false); G.flames.push(f); K.flames.push(f); }
  K.lights = K.burn.map(([x, z]) => { const s = { pos: V(x, 1.6, z), color: C_ORANGE, range: 11, intensity: 0, flicker: true }; G.lightSources.push(s); return s; });
  const em = B.MeshBuilder.CreateBox('campSmoke', { size: .1 }, S); em.position.set(K.at.x, 2, K.at.z); em.isVisible = false; em.isPickable = false; K.smoke = G.FX.smokeFrom(em, true);
}
function burning(K, on) { K.flames.forEach(f => f.setEnabled(on)); K.lights.forEach(l => { l.intensity = on ? 1.6 : 0; }); if (on) K.smoke.start(); else K.smoke.stop(); }

/* A camp, as the machines see it: something of yours to attack, with a health bar. It has no model of its own (the tents, the fire and
   the survivors are the map's); when its health runs out it is overrun. */
class Camp extends Actor {
  constructor(K, hp) { super('player', CITY.campHp); this.hp = hp; this.kind = 'camp'; this.name = K.short; this.C = K; this.radius = 3; this.height = 1.2; this.barY = 3.2;
    this.root = new B.TransformNode('camp', G.scene); this.root.position.set(K.at.x, 0, K.at.z); this.home = V(K.at.x, 0, K.at.z);
    this.raidOnly = true; }   // only machines sent on a raid go for it (combat.js); the rest are after you
  hitTargets() { return [{ part: 'body', c: this.pos.add(V(0, 1, 0)), r: 2.8 }]; }
  update() {}
}

/* ---------- the same city as a survival arena: you start in the gate plaza, with the gate stuck open behind you ---------- */
let city = null;
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/* the survivors settle in a camp (with this share of its health), or (where null) they're gone */
function settle(eng, where, k) {
  if (city.camp) { city.camp.alive = false; eng.remove(city.camp); }
  city.where = where; for (const id in CAMPS) CAMPS[id].people.setEnabled(id === where);
  city.camp = where ? eng.add(new Camp(CAMPS[where], Math.round(CITY.campHp * k))) : null;
  city.raid.camp = city.camp;   // a raid on its way follows them
}
/* a camp is overrun: from the rail yard the survivors fall back to the outpost; from the outpost there's nowhere left */
function overrun(eng) {
  const K = CAMPS[city.where]; burning(K, true); G.audio.play('boomBig', { pos: V(K.at.x, 1, K.at.z), gain: .8, hear: 120 });
  if (city.where === 'yard') { city.yardDown = true; settle(eng, 'outpost', 1); eng.say('The rail yard camp is overrun · The survivors are falling back to the outpost', '#ff6a5a'); }
  else { city.outpostDown = true; settle(eng, null, 0); eng.say('The outpost has fallen · Nothing left to draw the machines off', '#ff6a5a'); }
}
function shutGate(run) {
  city.gate.shut = true; city.gate.until = run.time + CITY.shutFor; run.gateShut = true; G.progress.gate = false; G.game.applyGate(); city.tally.shut++;
  CONSOLE.mat.emissiveColor = C('#ff3a24'); G.audio.play('powerOff', { pos: V(GATE.x, 2, GATE.z), gain: 1, rate: .7, len: 2.4, fade: .5, hear: 120 });
  G.UI.feed(`The gate is shut · Nothing comes through it for ${CITY.shutFor} seconds`, '#1fe0ff');
}
/* what the survivors leave you for beating off a raid, on top of scrap */
const rollSupplies = () => rollLoot('walker');
export const SURVIVAL = survival({
  num: '01', name: 'Dead City',
  blurb: 'The gate is stuck open and the machines keep coming. Keep the survivors\' camp standing when raids march on it from the gate, and shut the gate when you can.',
  preparing: 'Preparing the city…', build: buildRegion, gate: GATE, start: { x: 50, z: 130 },
  saveKey: 'relay-gate-survival-v1',
  /* before each run: the gate, its console, the camp (intro.js) */
  intro: [
    { at: [50, 3, 147], r: 24, a: -2.05, b: .82, hold: 3.6, say: 'The gate\'s jammed open. Everything they send comes through there.' },
    { at: [58.6, 1, 148.5], r: 14, a: -2.4, b: .85, move: 1.6, hold: 3.6, say: 'There\'s a console by the east pylon. Hold it long enough and the gate shuts for a while. It\'ll fight you for it.' },
    { at: [50, 1, 80], r: 22, a: -2.1, b: .8, move: 2.6, hold: 4.2, say: 'There are people holed up at the rail yard. When the horn sounds low, a raid\'s going for them. Keep that camp standing.' },
  ],
  /* the city's own music, and the drums while a raid is on (instead of for walkers) */
  music: () => (city && city.raid.on ? 'drums' : 'city'), musicKeys: ['city'], walkerDrums: false,
  /* things to work at: the gate's console while the gate can be shut, and the rail yard camp once it's been overrun and is clear again */
  interactables(L) {
    if (!city) return; const now = city.now;
    if (!city.gate.shut && now >= city.gate.coolUntil) L.push({ pos: V(CONSOLE.x, 0, CONSOLE.z - 1), r: 1.7, hold: CITY.shut, label: 'Shut the gate', use: () => shutGate(city.run) });
    const Y = CAMPS.yard;
    if (city.yardDown && city.where === 'outpost' && !G.actors.some(a => a.alive && a.faction === 'machine' && dist2(a.pos, Y.at) < CITY.clear))
      L.push({ pos: V(Y.at.x, 0, Y.at.z), r: 2.6, hold: CITY.retake, label: 'Retake the rail yard camp',
        use: () => { city.yardDown = false; burning(Y, false); settle(city.eng, 'yard', .7); city.eng.say('The rail yard camp is yours again · The survivors are moving back up', '#1fe0ff'); } });
  },
  begin(eng, run) {
    city = { eng, run, now: 0, where: null, camp: null, yardDown: false, outpostDown: false, raid: { camp: null, on: false, next: CITY.raidFirst, members: [] },
      gate: { shut: false, until: 0, coolUntil: 0, defended: false }, tally: { raids: 0, shut: 0 } };
    for (const id in CAMPS) burning(CAMPS[id], false);
    settle(eng, 'yard', 1); run.gateShut = false; CONSOLE.mat.emissiveColor = C('#1fe0ff'); G.marks = [];
  },
  tick(eng, run, dt) {
    const now = city.now = run.time, raid = city.raid, gate = city.gate, camp = city.camp, P = G.player;
    city.run = run;
    /* the camp: overrun when its health runs out; it mends while no raider is near, and its fire heals you while no machine is */
    if (camp && !camp.alive) overrun(eng);
    else if (camp) { const near = (r, raiders) => G.actors.some(a => a.alive && a.faction === 'machine' && (!raiders || a.raid) && dist2(a.pos, camp.pos) < r);
      if (camp.hp < camp.maxHp && !near(15, true)) camp.hp = Math.min(camp.maxHp, camp.hp + CITY.regen * dt);
      if (P.down <= 0 && P.hp < P.maxHp && dist2(P.pos, camp.C.fire) < 4.5 && !near(10)) P.hp = Math.min(P.maxHp, P.hp + CITY.heal * dt); }
    /* the gate: working at its console brings machines out of it at you; once shut it stays shut for a while */
    const work = G.game.working(), atConsole = work && work.label === 'Shut the gate';
    if (atConsole && !gate.defended) { gate.defended = true; run.send(MOUTH, 3); eng.say('The gate is fighting back', '#ff6a5a'); }
    if (!atConsole) gate.defended = false;
    if (gate.shut && now >= gate.until) { gate.shut = false; run.gateShut = false; gate.coolUntil = now + CITY.cool; G.progress.gate = true; G.game.applyGate(); raid.next = Math.max(raid.next, now + 8);
      CONSOLE.mat.emissiveColor = C('#ffb340'); G.audio.play('powerOn', { pos: V(GATE.x, 2, GATE.z), gain: 1, rate: .8, len: 2, fade: .4, hear: 120 }); eng.say('The gate is open again', '#ff6a5a'); }
    if (!gate.shut && now >= gate.coolUntil) CONSOLE.mat.emissiveColor = C('#1fe0ff');
    run.gapK = (gate.shut ? CITY.shutK : 1) * (city.outpostDown ? CITY.lostK : 1);
    /* raids: out of the gate (never while it's shut) and off towards the camp; beat one off and the survivors leave you supplies */
    if (city.where && !raid.on && !gate.shut && now >= raid.next) {
      raid.on = true; raid.camp = city.camp; raid.next = now + CITY.raidEvery; raid.members = run.send(MOUTH, Math.max(3, run.size() + 1), { raid });
      G.audio.horn(true, .7); eng.say(`A raid is marching on ${CAMPS[city.where].say} from the gate`, '#ff6a5a'); }
    if (raid.on && !raid.members.some(a => a.alive)) { raid.on = false;
      if (city.camp) { const K = city.camp.C; city.tally.raids++; G.drops.scatter(K.fire.x + 2, K.fire.z + 1, [{ scrap: 25 }, ...rollSupplies()]); eng.say('Raid beaten off · The survivors have left you supplies by the fire', '#1fe0ff'); } }
    /* what to head for: the camp while a raid is on, the gate when it's about to open again */
    G.marks = [];
    if (raid.on && city.camp) G.marks.push({ pos: city.camp.pos, label: `${city.camp.C.short} · ${Math.ceil(city.camp.hp / city.camp.maxHp * 100)}%`, color: '#ff6a5a' });
    if (gate.shut && gate.until - now < 10) G.marks.push({ pos: V(GATE.x, 0, GATE.z), h: 4, label: `Gate opens · ${Math.ceil(gate.until - now)}s`, color: '#1fe0ff' });
  },
  /* the line under the clock: the camp, the gate, the next raid */
  status() {
    if (!city) return ''; const now = city.now, g = city.gate, r = city.raid, c = city.camp;
    const camp = c ? `${c.C.short} ${Math.ceil(c.hp / c.maxHp * 100)}%` : 'Survivors lost';
    const gate = g.shut ? `Gate shut ${Math.ceil(g.until - now)}s` : 'Gate open';
    const next = !c ? '' : r.on ? ' · Raid under way' : g.shut ? ' · No raids while it\'s shut' : ` · Raid in ${clock(Math.max(0, r.next - now))}`;
    return `${camp} · ${gate}${next}`;
  },
  stats: () => [[city.tally.raids, city.tally.raids === 1 ? 'Raid beaten off' : 'Raids beaten off'], [city.tally.shut, city.tally.shut === 1 ? 'Gate shut once' : 'Times the gate was shut']],
});
