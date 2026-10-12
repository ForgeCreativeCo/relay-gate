/* Region 01, Dead City: the map (walkable streets, ruins, props, set pieces) and the run through it (objectives, encounters, story beats). */
import { B, G, V, MT, R, rnd, C, rand } from './core.js';
import { Geo, gbox, gprism, gcyl, gmesh, Buckets } from './geo.js';
import { Raider } from './actors.js';
import { Drone, Walker, Husk } from './machines.js';
import { rollLoot } from './loot.js';

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
const STASH = { x: 46, z: 74.2 };   // the Rust Dogs' loot crate
export const CHECKPOINTS = [
  { id: 'outpost', name: 'Outpost', x: 0, z: -5 },
  { id: 'square', name: 'Ring Road', x: 0, z: 62 },
  { id: 'yard', name: 'Rail yard', x: 38, z: 80 },
  { id: 'gate', name: 'Gate approach', x: 50, z: 114 },
];

const BARRIER = [[-.32, 0], [.32, 0], [.32, .1], [.1, .82], [-.1, .82], [-.32, .1]];
function overlapsOpen(x0, z0, x1, z1) { for (const o of G.open) if (x0 < o[2] && x1 > o[0] && z0 < o[3] && z1 > o[1]) return true; return false; }
function distToOpen(x, z) { let best = 1e9; for (const o of G.open) { const dx = Math.max(o[0] - x, 0, x - o[2]), dz = Math.max(o[1] - z, 0, z - o[3]); best = Math.min(best, Math.hypot(dx, dz)); } return best; }
const ob = (x, z, hw, hd, h) => G.obstacles.push({ x, z, hw, hd, h });

export function buildRegion(M) {
  const scene = G.scene;
  G.open = Object.values(AREAS);
  /* where the ground detail pass should put scorch marks and oil stains */
  G.decalHints = { scorch: [], oil: [] };
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

  /* ---------- Rail yard: tracks, boxcars, the Rust Dogs camp ---------- */
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
  const gate = {};
  { const g = Geo(), oct = []; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; oct.push([Math.cos(a) * .9, Math.sin(a) * .9]); }
    const oct2 = oct.map(([a, b]) => [a * .75, b * .75]), GX = GATE.x, GZ = GATE.z, GY = GATE.y;
    for (const s of [-1, 1]) { const vert = MT(0, 0, 0, 0, 0, Math.PI / 2).multiply(MT(GX + s * 4.9, 0, GZ));
      gprism(g, oct, 0, 1.4, vert, { uv: .4 }); gprism(g, oct2, 1.4, 8, vert, { uv: .4 }); gprism(g, oct, 8, 8.7, vert, { uv: .4 }); gbox(g, { x: GX + s * 4.9, y: GY, z: GZ, w: 1.8, h: 1.3, d: 1.9, tint: .85 }); }
    gprism(g, [[-1.8, 0], [1.8, 0], [1.4, .6], [-1.4, .6]], GX - 6.6, GX + 6.6, MT(0, 0, GZ), { uv: .4 });
    gprism(g, [[-.8, 8.4], [.8, 8.4], [.6, 9.2], [-.6, 9.2]], GX - 6, GX + 6, MT(0, 0, GZ), { uv: .4 });
    gmesh('gateFrame', g, M.gateFrame);
    ob(GX - 4.9, GZ, 1, 1, 9); ob(GX + 4.9, GZ, 1, 1, 9);
    const ring = B.MeshBuilder.CreateTorus('ring', { diameter: 7.8, thickness: .65, tessellation: 6 }, scene); ring.rotation.x = Math.PI / 2; ring.position.set(GX, GY, GZ); ring.material = M.gateFrame; ring.receiveShadows = true; G.sg.addShadowCaster(ring);
    gate.ring2 = B.MeshBuilder.CreateTorus('ring2', { diameter: 6.9, thickness: .08, tessellation: 6 }, scene); gate.ring2.rotation.set(Math.PI / 2, 0, Math.PI / 6); gate.ring2.position.set(GX, GY, GZ - .05); gate.ring2.material = M.gateNode;
    gate.discA = B.MeshBuilder.CreateDisc('discA', { radius: 3.4, tessellation: 6 }, scene); gate.discA.position.set(GX, GY, GZ); gate.discA.rotation.z = Math.PI / 6; gate.discA.material = M.gateDisc;
    gate.discB = B.MeshBuilder.CreateDisc('discB', { radius: 2.4, tessellation: 6 }, scene); gate.discB.position.set(GX, GY, GZ - .06); gate.discB.material = M.gateDisc;
    const n = Geo(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; gbox(n, { x: GX + Math.cos(a) * 3.92, y: GY + Math.sin(a) * 3.92, z: GZ, w: .5, h: .5, d: .95, rz: a, ao: false }); }
    gate.nodes = gmesh('gateNodes', n, M.gateNode, { shadow: false });
    for (const s of [-1, 1]) for (let c = 0; c < 2; c++) { const a = V(GX + s * 2.4, GY - 2.7 + c * .3, GZ + .3), b = V(GX + s * 4.6, 1.3 + c * .4, GZ - 1.3 - c * .3), path = [];
      for (let k = 0; k <= 12; k++) { const t = k / 12; path.push(V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * .9, a.z + (b.z - a.z) * t)); }
      const tube = B.MeshBuilder.CreateTube('cable', { path, radius: .07, tessellation: 6 }, scene); tube.material = M.mechDark; tube.isPickable = false; G.sg.addShadowCaster(tube); }
    gate.source = { pos: V(GX, GY, GZ - 1.2), color: C('#1fe0ff'), range: 18, intensity: .5, gate: true }; G.lightSources.push(gate.source);
    [gate.ring2, gate.discA, gate.discB, ring].forEach(m => { m.isPickable = false; });
  }

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

/* ---------- the run: objectives, encounters and story beats ---------- */
/* Everything the game needs to know to play this region. game.js runs it; a new region is a new file exporting the same shape. */
let rustDogs = [];
export const REGION = {
  num: '01', name: 'Dead City',
  blurb: 'A machine-held city, a relay gate, and whatever you can salvage on the way.',
  clearedText: 'The relay gate hums open. Region 02 is next on the build list. Until then, the city is yours: keep exploring, or run it again with the gear you\'ve earned.',
  preparing: 'Preparing the city…',
  build: buildRegion,
  start: { x: 0, z: -5 },
  allyWait: { x: 5.2, z: 1.8, face: Math.PI * .8 },   // Mara by the campfire, waiting to be talked to
  gate: GATE,
  checkpoints: CHECKPOINTS,
  /* ids let the game and this file move between steps by name; saves store the index */
  objectives: [
    { id: 'mara', text: 'Talk to Mara by the campfire', at: () => G.ally.pos },
    { id: 'road', text: 'Head north up the Ring Road', at: () => V(0, 0, 44) },
    { id: 'square', text: 'Survive the Market Square', at: () => V(4, 0, 82) },
    { id: 'yard', text: 'Get through the rail yard', at: () => V(50, 0, 98) },
    { id: 'north', text: 'Push north to the relay gate', at: () => V(50, 0, 120) },
    { id: 'boss', text: 'Destroy the Warden', at: () => G.game.boss && G.game.boss.alive ? G.game.boss.pos : V(50, 0, 138) },
    { id: 'gate', text: 'Step through the relay gate', at: () => V(GATE.x, 0, GATE.z - 2) },
    { id: 'done', text: 'Region cleared · Explore or run it again', at: () => null },
  ],
  rerunFrom: 'road',   // running it again skips meeting Mara

  /* R: encounter(id, opts), boss(id, opts), add(actor, enc), step(id), atStep(id), say(text, colour) */
  spawn(R) {
    R.encounter('drones1', { when: p => p.z > 24, spawn: e => [[-2, 40], [2.5, 45], [0, 50], [3, 36]].forEach(([x, z]) => R.add(new Drone(x, z), e)),
      onClear: () => { if (R.atStep('road')) R.step('square'); } });
    /* husks slumped against the walls, waiting for someone to walk past */
    R.encounter('husks1', { when: p => p.z > 16, spawn: e => [[-4.3, 28, Math.PI / 2], [4.3, 47, -Math.PI / 2]].forEach(([x, z, face]) => R.add(new Husk(x, z, { slumped: true, face }), e)) });
    R.encounter('square', { when: p => p.z > 57,
      spawn: e => { R.add(new Walker(7, 83, { patrolR: 4, leash: 11 }), e); [[-14, 75.5], [-14.6, 80.5], [-13.8, 86]].forEach(([x, z]) => R.add(new Raider(x, z, { leash: 2.2, face: Math.PI / 2, alert: 26 }), e)); },
      done: e => e.actors.filter(a => a.kind === 'walker').every(a => !a.alive),   // the raiders can stay
      onClear: () => { R.say('The square is clear', '#ffb24a'); R.step('yard'); } });
    R.encounter('drones2', { when: p => p.x > 13 && p.z > 70, spawn: e => [[28, 80], [32, 77.5], [36, 82]].forEach(([x, z]) => R.add(new Drone(x, z), e)) });
    R.encounter('husks2', { when: p => p.x > 13 && p.z > 70, spawn: e => [[24, 84.3, Math.PI], [26, 84.3, Math.PI], [33, 75.7, 0]].forEach(([x, z, face]) => R.add(new Husk(x, z, { slumped: true, face }), e)) });
    R.encounter('north', { when: p => p.x > 42 && p.z > 95, spawn: e => { R.add(new Walker(50, 108, { patrolR: 3, leash: 8 }), e); [[47.5, 112], [53, 104]].forEach(([x, z]) => R.add(new Drone(x, z), e)); } });
    R.boss('warden', { when: p => p.z > 119 && p.x > 28, spawn: e => R.add(new Walker(50, 138, { boss: true, patrolR: 0, leash: 15 }), e) });
    /* the Rust Dogs live in the rail yard whatever happens */
    rustDogs = [[45, 76.5], [52.5, 75], [49, 81.5], [44, 80]].map(([x, z], i) => R.add(new Raider(x, z, { leash: 2.5, face: Math.PI * (i % 2 ? .3 : 1.2), heavy: i === 0 })));
  },

  interactables(R, P, L) {
    if (!G.ally.joined) L.push({ pos: G.ally.pos, r: 2.8, label: 'Talk to Mara', use: () => {
      R.say('Mara: "You\'re the one heading for the gate? Then you\'ll want a medic."', '#ffb24a');
      setTimeout(() => R.say('Mara: "Machines own everything north of here. Stay close."', '#ffb24a'), 1600);
      G.ally.join(); G.actors.push(G.ally); P.mara = true; R.step('road'); } });
    const st = STASH;
    if (!P.stash) L.push({ pos: V(st.x, 0, st.z), r: 2.2, label: 'Open the Rust Dogs\' stash', use: () => {
      P.stash = true; G.drops.scatter(st.x, st.z - 1.6, rollLoot('stash'));
      if (rustDogs.some(r => r.alive)) G.game.setRaiderHostile('stash'); else R.say('Nobody left to object', '#9aa0a6'); G.save.soon(); } });
  },

  onBossPhase(R, b, ph, enc) {
    if (ph === 2) R.say('The Warden is calling in drones and husks · Watch for missile markers', '#ff6a5a');
    if (ph === 3) R.say('The Warden is overheating · It\'s faster now', '#ff6a5a');
    for (let i = 0; i < 2; i++) { const a = rand(0, 6.28), d = R.add(new Drone(b.pos.x + Math.cos(a) * 6, b.pos.z + Math.sin(a) * 6), enc); d.dormant = false; d.home.set(50, 0, 136); }
    /* and a husk scrambles in from the ruins behind you */
    const h = R.add(new Husk(rand(36, 64), 120, { leash: 40 }), enc); h.dormant = false; h.home.set(50, 0, 136);
  },

  /* objectives that move on as you walk */
  update(R, p) {
    if (R.atStep('road') && p.z > 60) R.step('square');
    if (R.atStep('yard') && p.z > 96 && p.x > 43) R.step('north');
    if (R.atStep('north') && p.z > 118) R.step('boss');
  },
};
