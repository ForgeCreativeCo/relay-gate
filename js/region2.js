/* Region 02, The Relay Station: indoors. The map (rooms, corridors, doors, power) and how it plays as a survival arena.
   Walls are generated around the walkable rectangles. The ones on the camera's side sink into the floor while you're behind them,
   so a room never hides who's in it. Each room belongs to a power zone that can be dark, flickering or lit.
   The rooms: the gate room, a service corridor with two alcoves, the cooling hall, and the freight bay that runs south of all three. */
import { B, G, V, C, R, damp, dist2 } from './core.js';
import { Geo, gbox, gcyl, gmesh } from './geo.js';
import { makeMat } from './tex.js';
import { makeNav } from './nav.js';
import { buildGate } from './gate.js';
import { survival } from './survival.js';

/* Walkable rectangles [x0, z0, x1, z1] (on a half-metre grid) and the power zone each belongs to. North is +z.
   Where two connect they overlap by at least a metre: each one is shrunk by your body's width when deciding where you can stand,
   so two that only touch leave a seam nobody can cross. Where they overlap, the room listed first owns the floor. */
const ROOMS = {
  gateRoom: { r: [-9, -8, 9, 10], zone: 'gate' },
  hall: { r: [30, -12, 54, 14], zone: 'hall' },
  corridor: { r: [8, -1.5, 31, 1.5], zone: 'corridor' },
  alcoveN: { r: [14, .5, 17.5, 5], zone: 'corridor' },
  alcoveS: { r: [21, -5, 24.5, -.5], zone: 'corridor' },
  /* the freight bay: a second way from the gate room to the hall, wide enough for a walker */
  bay: { r: [-6, -32, 44, -13], zone: 'bay' },
  linkS: { r: [-3, -14, 3, -7], zone: 'bay' },         // gate room to the bay
  linkE: { r: [37.5, -14, 43.5, -11], zone: 'bay' },   // the bay to the cooling hall
};
const GATE = { x: 0, z: 8.4, y: 4.4 };
const CONSOLE = { x: 27.2, z: .5 };      // the hall door's lock panel
const BREAKER = { x: 52.6, z: 12.4 };    // the cooling hall's power
const CELL = .5, THICK = 2, WALL_H = 4, CUT_H = .7;
const ob = (x, z, hw, hd, h) => { const o = { x, z, hw, hd, h }; G.obstacles.push(o); return o; };

/* ---------- power zones: the materials of a zone's walls, floor and lights dim and brighten together ---------- */
const zones = {};
function makeZone(M, name, o = {}) {
  const S = G.scene;
  const z = { name, k: 1, target: 1, flicker: !!o.flicker, lamps: [], emergency: [],
    wall: makeMat(S, 'wall_' + name, '#80858e', { tex: M.conc.diffuseTexture, bump: M.conc.bumpTexture }),
    floor: makeMat(S, 'floor_' + name, '#62666e', { tex: M.crate.albedoTexture, bump: M.crate.bumpTexture, spec: .12, power: 24 }),
    trim: makeMat(S, 'trim_' + name, '#3a3e46', { tex: M.crate.albedoTexture, bump: M.crate.bumpTexture, spec: .15 }),
    strip: makeMat(S, 'strip_' + name, '#000000', { unlit: true, emissive: '#cfeaff' }),
    led: makeMat(S, 'led_' + name, '#000000', { unlit: true, emissive: '#58f0c8' }),
    alarm: makeMat(S, 'alarm_' + name, '#000000', { unlit: true, emissive: '#ff3a24' }),
    g: { wall: Geo(), floor: Geo(), trim: Geo(), strip: Geo(), led: Geo(), alarm: Geo() } };
  z.base = { wall: z.wall.diffuseColor.clone(), floor: z.floor.diffuseColor.clone(), trim: z.trim.diffuseColor.clone(),
    strip: z.strip.emissiveColor.clone(), led: z.led.emissiveColor.clone(), alarm: z.alarm.emissiveColor.clone() };
  zones[name] = z; return z;
}
/* k = 0 (dark: emergency lights only) to 1 (lit); flick briefly dims the light fittings without darkening the walls */
function applyPower(z, flick = 1) {
  const k = z.k, d = .3 + .7 * k, e = k * flick;
  z.wall.diffuseColor.copyFrom(z.base.wall).scaleInPlace(d); z.floor.diffuseColor.copyFrom(z.base.floor).scaleInPlace(d); z.trim.diffuseColor.copyFrom(z.base.trim).scaleInPlace(d);
  z.strip.emissiveColor.copyFrom(z.base.strip).scaleInPlace(e); z.led.emissiveColor.copyFrom(z.base.led).scaleInPlace(e);
  z.alarm.emissiveColor.copyFrom(z.base.alarm).scaleInPlace(1 - k);
  for (const s of z.lamps) s.intensity = s.base * e;
  for (const s of z.emergency) s.intensity = s.base * (1 - k);
}
function setPower(name, k, instant) { const z = zones[name]; z.target = k; if (instant) { z.k = k; applyPower(z); } }

/* ---------- pieces that sink while they stand between you and the camera ---------- */
const cuts = [];   // { x0, z0, x1, z1, node, k }
function cutPiece(node, x0, z0, x1, z1) { const c = { x0, z0, x1, z1, node, k: 0 }; cuts.push(c); return c; }
function updateCuts(dt) {
  const p = G.player.pos, a = G.camera.alpha, cx = Math.cos(a), cz = Math.sin(a), px = -cz, pz = cx;   // toward the camera along the ground, and across
  for (const c of cuts) {
    let want = 0;
    if (p.x > c.x0 - 10 && p.x < c.x1 + 10 && p.z > c.z0 - 10 && p.z < c.z1 + 10)
      look: for (const off of [-1.4, 0, 1.4]) for (let d = .3; d <= 7; d += .5) {
        const x = p.x + px * off + cx * d, z = p.z + pz * off + cz * d;
        if (x > c.x0 - .2 && x < c.x1 + .2 && z > c.z0 - .2 && z < c.z1 + .2) { want = 1; break look; }
      }
    c.k += (want - c.k) * damp(want ? 9 : 3, dt);
    c.node.position.y = -c.k * (WALL_H - CUT_H);
  }
}

/* greedy merge of a labelled grid into rectangles: the longest run along a row, then down as many rows as match */
function greedy(lab, W, H, emit) {
  const used = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, L = lab[k]; if (L < 0 || used[k]) continue;
    let w = 1; while (i + w < W && lab[k + w] === L && !used[k + w]) w++;
    let h = 1; grow: while (j + h < H) { for (let q = 0; q < w; q++) { const kk = (j + h) * W + i + q; if (lab[kk] !== L || used[kk]) break grow; } h++; }
    for (let b = 0; b < h; b++) for (let q = 0; q < w; q++) used[(j + b) * W + i + q] = 1;
    emit(i, j, w, h, L);
  }
}

/* ---------- floors and walls: rasterise the rooms and the space around them, then merge into as few boxes as possible ---------- */
function buildWalls() {
  const rooms = Object.values(ROOMS), pad = (THICK + 1) * CELL;
  let X0 = 1e9, Z0 = 1e9, X1 = -1e9, Z1 = -1e9;
  for (const { r } of rooms) { X0 = Math.min(X0, r[0] - pad); Z0 = Math.min(Z0, r[1] - pad); X1 = Math.max(X1, r[2] + pad); Z1 = Math.max(Z1, r[3] + pad); }
  const W = Math.round((X1 - X0) / CELL), H = Math.round((Z1 - Z0) / CELL), N = W * H;
  const zoneAt = new Array(N).fill(null);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = X0 + (i + .5) * CELL, z = Z0 + (j + .5) * CELL, room = rooms.find(({ r }) => x > r[0] && x < r[2] && z > r[1] && z < r[3]);
    if (room) zoneAt[j * W + i] = room.zone;
  }
  const open = (i, j) => i >= 0 && j >= 0 && i < W && j < H && zoneAt[j * W + i] !== null;
  /* a wall cell is within THICK cells of open floor. It can sink if the floor it borders lies north or east of it (the camera is south-west). */
  const ring = []; for (let dj = -THICK; dj <= THICK; dj++) for (let di = -THICK; di <= THICK; di++) if (di || dj) ring.push([di, dj]);
  ring.sort((a, b) => Math.max(Math.abs(a[0]), Math.abs(a[1])) - Math.max(Math.abs(b[0]), Math.abs(b[1])));
  const keys = [], lab = new Int16Array(N).fill(-1);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (open(i, j)) continue;
    const near = ring.find(([di, dj]) => open(i + di, j + dj)); if (!near) continue;
    const zone = zoneAt[(j + near[1]) * W + i + near[0]], sinks = ring.some(([di, dj]) => di >= 0 && dj >= 0 && open(i + di, j + dj));
    const key = (sinks ? 'cut|' : 'solid|') + zone; let L = keys.indexOf(key); if (L < 0) { L = keys.length; keys.push(key); }
    lab[j * W + i] = L;
  }
  greedy(lab, W, H, (i, j, w, h, L) => {
    const [kind, zone] = keys[L].split('|'), x0 = X0 + i * CELL, z0 = Z0 + j * CELL, x1 = x0 + w * CELL, z1 = z0 + h * CELL;
    /* the faces that look onto open floor, as runs: [x0, z0, x1, z1, normal x, normal z] */
    const faces = [];
    const runs = (n, at, emit) => { let s = -1; for (let q = 0; q <= n; q++) { const o = q < n && at(q); if (o && s < 0) s = q; if (!o && s >= 0) { emit(s, q); s = -1; } } };
    runs(w, q => open(i + q, j - 1), (a, b) => faces.push([x0 + a * CELL, z0, x0 + b * CELL, z0, 0, -1]));
    runs(w, q => open(i + q, j + h), (a, b) => faces.push([x0 + a * CELL, z1, x0 + b * CELL, z1, 0, 1]));
    runs(h, q => open(i - 1, j + q), (a, b) => faces.push([x0, z0 + a * CELL, x0, z0 + b * CELL, -1, 0]));
    runs(h, q => open(i + w, j + q), (a, b) => faces.push([x1, z0 + a * CELL, x1, z0 + b * CELL, 1, 0]));
    wallBox(zones[zone], kind === 'cut', x0, z0, x1, z1, faces);
  });
  /* floors: one slab per zone-coloured rectangle, so overlapping rooms never stack two floors */
  const names = Object.keys(zones), flab = new Int16Array(N).fill(-1);
  for (let k = 0; k < N; k++) if (zoneAt[k] !== null) flab[k] = names.indexOf(zoneAt[k]);
  greedy(flab, W, H, (i, j, w, h, L) => gbox(zones[names[L]].g.floor, { x: X0 + (i + w / 2) * CELL, y: -.05, z: Z0 + (j + h / 2) * CELL, w: w * CELL, h: .1, d: h * CELL, uv: 1 / 3, ao: false, noBottom: true }));
}
/* one merged wall box, with a skirting board, a light strip and pilasters along each face that looks into a room */
function wallBox(z, sinks, x0, z0, x1, z1, faces) {
  const g = sinks ? { wall: Geo(), trim: Geo(), strip: Geo() } : z.g, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  gbox(g.wall, { x: cx, y: WALL_H / 2, z: cz, w: x1 - x0, h: WALL_H, d: z1 - z0, tint: R(.88, 1), noBottom: true });
  gbox(g.trim, { x: cx, y: WALL_H + .02, z: cz, w: x1 - x0 + .02, h: .04, d: z1 - z0 + .02, ao: false, noBottom: true });
  for (const [fx0, fz0, fx1, fz1, nx, nz] of faces) {
    const along = nz !== 0, len = along ? fx1 - fx0 : fz1 - fz0, mx = (fx0 + fx1) / 2, mz = (fz0 + fz1) / 2;
    const slab = (g2, y, h, t, o = {}) => gbox(g2, Object.assign({ x: mx + nx * t / 2, y, z: mz + nz * t / 2, w: along ? len : t, h, d: along ? t : len, ao: false }, o));
    slab(g.trim, .16, .32, .06); slab(g.strip, 3.05, .08, .05);
    for (let a = 1.4; a < len - .8; a += 3.5) {
      const px = along ? fx0 + a : fx0, pz = along ? fz0 : fz0 + a;
      gbox(g.wall, { x: px + nx * .09, y: WALL_H / 2, z: pz + nz * .09, w: along ? .5 : .18, h: WALL_H - .02, d: along ? .18 : .5, tint: .82, noBottom: true });
    }
  }
  ob(cx, cz, (x1 - x0) / 2, (z1 - z0) / 2, WALL_H);
  if (!sinks) return;
  const node = new B.TransformNode('wallCut', G.scene);
  gmesh('wallCut', g.wall, z.wall, { parent: node }); gmesh('wallCutTrim', g.trim, z.trim, { parent: node }); gmesh('wallCutStrip', g.strip, z.strip, { parent: node, shadow: false });
  cutPiece(node, x0, z0, x1, z1);
}

/* ---------- doors: two panels that slide into the wall. axis is the way you walk through ('x' or 'z'). ---------- */
const doors = {};
function door(M, id, x, z, axis, w, zone) {
  const S = G.scene, root = new B.TransformNode('door_' + id, S); root.position.set(x, 0, z); if (axis === 'x') root.rotation.y = Math.PI / 2;
  const status = makeMat(S, 'doorStatus_' + id, '#000000', { unlit: true, emissive: '#ff3a24' }), trim = zones[zone].trim;
  const box = (name, wd, h, d, px, py, pz, mat, parent = root) => { const m = B.MeshBuilder.CreateBox(name, { width: wd, height: h, depth: d }, S); m.position.set(px, py, pz); m.parent = parent; m.material = mat; m.isPickable = false; m.receiveShadows = true; if (mat !== status) G.sg.addShadowCaster(m); return m; };
  const panels = [-1, 1].map(s => { const p = box('doorPanel', w / 2, 3.3, .2, s * w / 4, 1.65, 0, M.mechDark); box('doorStripe', w / 2 - .25, .09, .24, 0, .2, 0, status, p); return p; });
  for (const s of [-1, 1]) box('doorJamb', .36, WALL_H + .06, 1.12, s * (w / 2 + .18), (WALL_H + .06) / 2, 0, trim);
  box('doorLintel', w, WALL_H - 3.3, 1.06, 0, (WALL_H + 3.3) / 2, 0, trim);
  const hw = axis === 'x' ? .6 : w / 2 + .4, hd = axis === 'x' ? w / 2 + .4 : .6;
  const d = { id, root, panels, status, w, open: false, t: 0, ob: { x, z, hw: axis === 'x' ? .3 : w / 2 + .1, hd: axis === 'x' ? w / 2 + .1 : .3, h: WALL_H } };
  G.obstacles.push(d.ob);
  cutPiece(root, x - hw, z - hd, x + hw, z + hd);
  doors[id] = d; return d;
}
function setDoor(id, open, instant) {
  const d = doors[id]; if (d.open === open) { if (instant) d.t = open ? 1 : 0; return; }
  d.open = open; if (instant) d.t = open ? 1 : 0;
  const i = G.obstacles.indexOf(d.ob); if (open && i >= 0) G.obstacles.splice(i, 1); else if (!open && i < 0) G.obstacles.push(d.ob);
  d.status.emissiveColor = C(open ? '#1fe0ff' : '#ff3a24');
  if (G.nav) G.nav = makeNav();   // the walkable grid is baked; rebake it with the doorway open or shut
  if (!instant) G.audio.play('powerOn', { pos: d.root.position, gain: .35, rate: open ? 1.3 : .9, len: 1, fade: .3 });
}
function updateDoors(dt) {
  for (const d of Object.values(doors)) { d.t += ((d.open ? 1 : 0) - d.t) * damp(4, dt);
    /* a narrow door's panels slide into the wall beside it; a blast door is wider than the wall is thick, so its panels fold up against the jambs instead */
    d.panels.forEach((p, k) => { const s = k ? 1 : -1;
      if (d.w > 4) { const f = 1 - d.t * .9; p.scaling.x = f; p.position.x = s * (d.w / 2 - d.w / 4 * f); }
      else p.position.x = s * (d.w / 4 + d.t * (d.w / 2 - .1)); }); }
}

export function buildRegion(M) {
  const scene = G.scene;
  G.open = Object.values(ROOMS).map(o => o.r);
  G.flames = [];
  G.decalHints = { scorch: [], oil: [], puddles: [], puddleN: 5, paint: [
    [-6, 5.9, 6, 5.9, .12, '220,180,70', .3],                                               // the gate pad's safety line
    [9.5, -1.15, 29, -1.15, .08, '220,180,70', .25], [9.5, 1.15, 29, 1.15, .08, '220,180,70', .25],   // corridor walkway
    [40, -5, 48, -5, .1, '200,192,170', .2], [40, 7, 48, 7, .1, '200,192,170', .2], [40, -5, 40, 7, .1, '200,192,170', .2], [48, -5, 48, 7, .1, '200,192,170', .2],   // the hall's service bay
    [-4, -16, 42, -16, .12, '220,180,70', .28], [-4, -23, 42, -23, .1, '200,192,170', .2], [-4, -29.5, 42, -29.5, .12, '220,180,70', .28],   // the freight bay's lanes
    [-3, -8.2, 3, -8.2, .12, '220,180,70', .3], [37.5, -11.2, 43.5, -11.2, .12, '220,180,70', .3],                                              // the blast doors' thresholds
  ] };
  ['gate', 'corridor', 'hall', 'bay'].forEach(n => makeZone(M, n, { flicker: n === 'corridor' }));

  /* ---------- a black floor under everything so sunk walls vanish (the rooms' floors are laid with the walls) ---------- */
  const under = B.MeshBuilder.CreateGround('underfloor', { width: 400, height: 400 }, scene);
  under.position.set(20, -.08, 0); under.material = makeMat(scene, 'underfloor', '#050506', { unlit: true }); under.isPickable = false; under.freezeWorldMatrix();

  buildWalls();

  /* ---------- lamps on the far walls, and red emergency lights for when a zone is dark ---------- */
  const lamp = (zone, x, z, nx, nz, o = {}) => { const Z = zones[zone], along = nz !== 0;
    gbox(Z.g.trim, { x: x + nx * .12, y: 3.45, z: z + nz * .12, w: along ? 1.1 : .24, h: .28, d: along ? .24 : 1.1, ao: false });
    gbox(Z.g.strip, { x: x + nx * .25, y: 3.38, z: z + nz * .25, w: along ? .9 : .04, h: .1, d: along ? .04 : .9, ao: false });
    const s = { pos: V(x + nx * 1.2, 3, z + nz * 1.2), color: C(o.color || '#d6ecff'), range: o.range || 13, intensity: 1.15, base: 1.15, flicker: Z.flicker }; Z.lamps.push(s); G.lightSources.push(s); };
  const alarm = (zone, x, z, nx, nz) => { const Z = zones[zone];
    gcyl(Z.g.alarm, { r0: .16, h: .22, seg: 8, x: x + nx * .14, y: 3.5, z: z + nz * .14, rx: nz ? Math.PI / 2 : 0, rz: nx ? Math.PI / 2 : 0, ao: false });
    const s = { pos: V(x + nx * 1, 3.2, z + nz * 1), color: C('#ff3018'), range: 11, intensity: 1.3, base: 1.3, flicker: true }; Z.emergency.push(s); G.lightSources.push(s); };
  lamp('gate', -6.5, 10, 0, -1); lamp('gate', 6.5, 10, 0, -1); lamp('gate', 9, -5, -1, 0);
  lamp('corridor', 12, 1.5, 0, -1); lamp('corridor', 20.5, 1.5, 0, -1); lamp('corridor', 27, 1.5, 0, -1);
  for (const x of [35, 43, 51]) lamp('hall', x, 14, 0, -1);
  lamp('hall', 54, -6, -1, 0); lamp('hall', 54, 5, -1, 0);
  alarm('hall', 32, 14, 0, -1); alarm('hall', 54, -11, -1, 0); alarm('hall', 47, 14, 0, -1);
  for (const x of [-4.6, 8, 20, 31]) lamp('bay', x, -13, 0, -1);
  lamp('bay', 44, -20, -1, 0); lamp('bay', 44, -28, -1, 0);
  alarm('bay', 14, -13, 0, -1); alarm('bay', 26, -13, 0, -1); alarm('bay', 44, -24, -1, 0);
  alarm('gate', 9, 3, -1, 0); alarm('gate', -8.2, 10, 0, -1); alarm('corridor', 18.8, 1.5, 0, -1); alarm('corridor', 25, 1.5, 0, -1);   // every zone can go dark when the power fails

  /* ---------- the gate room: the gate you came through, cable runs, kit left by whoever was here before ---------- */
  const gate = buildGate(M, GATE);
  for (const s of [-1, 1]) { const a = V(GATE.x + s * 4.9, 1.2, GATE.z), b = V(GATE.x + s * 8.6, 3.6, 9.7), path = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10; path.push(V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * .7, a.z + (b.z - a.z) * t)); }
    const tube = B.MeshBuilder.CreateTube('cable', { path, radius: .12, tessellation: 6 }, scene); tube.material = M.mechDark; tube.isPickable = false; G.sg.addShadowCaster(tube); }
  const crate = (x, z, ry, s = 1, zone = 'gate') => { gbox(zones[zone].g.trim, { x, y: .35 * s, z, w: 1.1 * s, h: .7 * s, d: .8 * s, ry, uv: .6 }); ob(x, z, .6 * s, .6 * s, .7 * s); };
  crate(-7.2, -6, .1); crate(-6, -6.3, -.2); crate(-7, -4.9, .3, .7); crate(7, -6.4, .15);

  /* ---------- the corridor: pipes along the far wall, the door controls ---------- */
  { const g = Geo(); for (const [y, r] of [[3.75, .14], [3.45, .1]]) gcyl(g, { r0: r, h: 21, seg: 8, x: 19.5, y, z: 1.3, rz: Math.PI / 2, ao: false });
    gmesh('pipes', g, M.rust, { freeze: true }); }
  gbox(zones.corridor.g.trim, { x: CONSOLE.x, y: .7, z: 1.25, w: 1.1, h: 1.4, d: .5, ao: false }); ob(CONSOLE.x, 1.25, .55, .25, 1.4);
  gbox(zones.corridor.g.led, { x: CONSOLE.x, y: 1.25, z: .99, w: .8, h: .3, d: .02, ao: false });

  /* ---------- the cooling hall: rows of server cabinets, coolant tanks, the breaker ---------- */
  const H = zones.hall;
  /* a row of cabinets: one per 0.8 m, each with a lit status bar along the top and a column of drive lights on both faces */
  const cabinets = (x0, x1, z) => {
    for (let x = x0; x < x1 - .1; x += .8) gbox(H.g.wall, { x: x + .4, y: 1.2, z, w: .76, h: 2.4, d: 1.2, uv: .4, tint: R(.55, .7), noBottom: true });
    for (const s of [-1, 1]) { gbox(H.g.strip, { x: (x0 + x1) / 2, y: 2.18, z: z + s * .61, w: x1 - x0 - .2, h: .05, d: .02, ao: false });
      for (let x = x0 + .4; x < x1; x += .8) for (let y = .5; y < 1.95; y += .22) if (R(0, 1) < .55) gbox(H.g.led, { x: x + R(-.2, .2), y, z: z + s * .61, w: .14, h: .06, d: .02, ao: false }); }
    ob((x0 + x1) / 2, z, (x1 - x0) / 2, .6, 2.4); };
  cabinets(33, 41, 10.5); cabinets(44, 51, 10.5); cabinets(33, 36.2, -9.5); cabinets(44, 51, -9.5);   // the south row leaves room for the blast door from the freight bay cabinets(33, 37, 4); cabinets(33, 37, -2);
  const tank = (x, z) => { gcyl(H.g.trim, { r0: 1.1, h: 3.2, seg: 14, x, y: 1.6, z, uv: .5 }); for (const y of [.5, 1.6, 2.7]) gcyl(H.g.wall, { r0: 1.16, h: .12, seg: 14, x, y, z, ao: false }); ob(x, z, 1.05, 1.05, 3.2); };
  tank(51, 1); tank(51, -4.5);
  gbox(H.g.trim, { x: BREAKER.x, y: 1.3, z: 13.6, w: 1.4, h: 2.2, d: .5, ao: false }); gbox(H.g.alarm, { x: BREAKER.x, y: 1.9, z: 13.33, w: .9, h: .14, d: .04, ao: false }); ob(BREAKER.x, 13.6, .7, .25, 2.2);

  /* ---------- the freight bay: containers in two rows with lanes between them, pillars, crates along the walls ---------- */
  { const Y = zones.bay;
    const container = (x, z) => { const t = R(.6, 1);
      gbox(Y.g.trim, { x, y: 1.3, z, w: 6, h: 2.6, d: 2.4, uv: .5, tint: t, noBottom: true });
      for (let k = -2.6; k <= 2.61; k += .65) for (const s of [-1, 1]) gbox(Y.g.trim, { x: x + k, y: 1.3, z: z + s * 1.22, w: .16, h: 2.4, d: .06, tint: t * .8, ao: false });   // corrugation
      for (const s of [-1, 1]) gbox(Y.g.wall, { x: x + s * 3, y: 1.3, z, w: .1, h: 2.64, d: 2.44, tint: .6, ao: false });                                               // end frames
      ob(x, z, 3.05, 1.25, 2.6); };
    container(10, -19.5); container(24, -19.5); container(5, -26.5); container(17, -26.5); container(31, -26.5);
    for (const [x, z] of [[14, -23], [27.5, -23]]) { gbox(Y.g.wall, { x, y: WALL_H / 2, z, w: 1.2, h: WALL_H, d: 1.2, tint: .85, noBottom: true }); gbox(Y.g.trim, { x, y: .2, z, w: 1.4, h: .4, d: 1.4, ao: false }); ob(x, z, .6, .6, WALL_H); }
    crate(-4.8, -30.6, .1, 1, 'bay'); crate(-4.9, -29.2, -.15, 1, 'bay'); crate(-3.5, -30.8, .3, .7, 'bay'); crate(42.6, -30.7, .2, 1, 'bay'); crate(41.2, -30.9, -.1, 1, 'bay'); crate(42.8, -29.3, .1, .7, 'bay');
    crate(34.5, -14.1, .05, 1, 'bay'); crate(-5, -14.2, .2, 1, 'bay'); }

  /* ---------- doors: both ends of the corridor, and the freight bay's two blast doors. All stand open; a power failure seals a pair ---------- */
  door(M, 'west', 9.5, 0, 'x', 3, 'corridor');
  door(M, 'hall', 29.5, 0, 'x', 3, 'corridor');
  door(M, 'south', 0, -10.5, 'z', 6, 'bay');
  door(M, 'east', 40.5, -12.5, 'z', 6, 'bay');

  /* ---------- finish: one mesh per zone per material ---------- */
  for (const Z of Object.values(zones)) for (const [part, g] of Object.entries(Z.g))
    gmesh(part + '_' + Z.name, g, Z[part], { freeze: true, shadow: part === 'wall' || part === 'trim' });
  applyPower(zones.gate); applyPower(zones.corridor); applyPower(zones.bay);
  return { gate };
}

/* ---------- how the station looks and sounds: dark, cold light, a little dust, and an uneasy drone ---------- */
const LOOK = {
  sky: '#06080a', fog: '#06080a', fogD: .01, hemiSky: '#8e9aac', hemiGround: '#1c1e22', hemiI: .5,
  sun: '#dde8f6', sunI: .75, sunDir: [-.3, -1, .25], exposure: 1.45, contrast: 1.3, sat: -14, bloomW: .6, bloomT: .5, glowI: 1,
  weatherK: .12,   // a little dust in the air instead of ash
  env: { zenith: [26, 30, 36], horizon: [62, 70, 80], ground: [12, 13, 16], sun: .1, gate: .7 },
};
const AMBIENCE = [{ name: 'ambStation', url: 'sfx/ambience-station.mp3', from: 0, to: 101 }];   // "Drone, unsettling feeling", the whole recording (101 s)

/* the station's own moving parts, whatever is being played in it: sinking walls, doors, and power fading in and out */
function runStation(dt) {
  updateCuts(dt); updateDoors(dt);
  for (const Z of Object.values(zones)) {
    if (Z.k !== Z.target) { Z.k += Math.sign(Z.target - Z.k) * Math.min(Math.abs(Z.target - Z.k), dt * .5); applyPower(Z, Math.random() < .3 ? .2 : 1); }   // power comes back in stutters
    else if (Z.flicker && Z.k > 0) applyPower(Z, Math.random() < .04 ? .25 : 1);
  }
}

/* ---------- the station as a survival arena ---------- */
/* Every door stands open, so the rooms make a loop: gate room, corridor, cooling hall, freight bay. Machines come in through the gate,
   out of the vents in the corridor's alcoves, and from the edges of the hall and the bay. Every so often the power fails: emergency
   lights only, the blast doors seal one end of the station off from the rest, and machines come faster until it is back. */
const ENTRIES = [{ x: GATE.x, z: GATE.z - 3 }, { x: 15.75, z: 4 }, { x: 22.75, z: -4 }, { x: 52.5, z: 9 }, { x: 52.5, z: -10.8 }, { x: 31.5, z: 12.6 }, { x: 31.6, z: -11 },
  { x: -4.5, z: -24 }, { x: 20, z: -31 }, { x: 42.5, z: -28 }, { x: 28, z: -14.4 }];
/* what a power failure seals: the two doors into the cooling hall, or the two out of the gate room */
const SEALS = [{ doors: ['hall', 'east'], say: 'the cooling hall' }, { doors: ['west', 'south'], say: 'the gate room' }];
const DARK = { first: 50, every: 65, lasts: 22, rush: .6 };   // seconds to the first power failure, between failures, and how long one lasts; while it's dark the time between groups is multiplied by rush
let dark = null;
export const SURVIVAL = survival({
  num: '02', name: 'The Relay Station',
  blurb: 'The station\'s gate is stuck open, there are husks in the vents, and the power keeps failing. Last as long as you can.',
  preparing: 'Powering up the station…', indoor: true, noHorn: true, ambience: AMBIENCE, look: LOOK,
  build: buildRegion, gate: GATE, start: { x: 0, z: 1 },
  saveKey: 'relay-gate-survival-station-v1',
  /* a smaller space than the city: fewer machines at once */
  tune: { size: [2, 5], cap: [5, 18], walkers: [[7, 1], [11, 2]], gate: null },
  /* an entry out of your reach, picked at random; a walker or the Warden needs one with room for it (not the corridor's vents) */
  arrive(p, kind) {
    if (kind === 'walker' || kind === 'boss') { const nav = kind === 'boss' ? G.nav.huge : G.nav.wide, fit = ENTRIES.map(e => nav.snap(e.x, e.z, 2)).filter(s => s && dist2(p, s) > 14); return fit.length ? fit[Math.floor(Math.random() * fit.length)] : null; }
    const far = ENTRIES.filter(e => dist2(p, e) > 12), e = far.length ? far[Math.floor(Math.random() * far.length)] : ENTRIES.slice().sort((a, b) => dist2(p, b) - dist2(p, a))[0];
    return G.nav.snap(e.x, e.z, 3) || e;
  },
  begin() {
    for (const id in doors) setDoor(id, true, true);
    for (const n in zones) setPower(n, 1, true);
    dark = { on: false, at: DARK.first, seal: null };
  },
  tick(R, run, dt) {
    runStation(dt);
    if (run.time < dark.at) return;
    dark.on = !dark.on; dark.at = run.time + (dark.on ? DARK.lasts : DARK.every);
    for (const n in zones) setPower(n, dark.on ? 0 : 1);
    run.gapK = dark.on ? DARK.rush : 1;
    if (dark.on) { dark.seal = SEALS[Math.floor(Math.random() * SEALS.length)]; for (const id of dark.seal.doors) setDoor(id, false);
      run.nextAt = Math.min(run.nextAt, G.t + 2); G.audio.play('powerOff', { pos: G.player.pos, gain: .6, rate: .8, len: 2, fade: .5 }); R.say(`Power failure · Blast doors have sealed ${dark.seal.say}`, '#ff6a5a'); }
    else { for (const id of dark.seal.doors) setDoor(id, true);
      G.audio.play('powerOn', { pos: G.player.pos, gain: .5, len: 1.6, fade: .4 }); R.say('Power restored · The doors are opening', '#1fe0ff'); }
  },
});
