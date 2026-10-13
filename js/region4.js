/* Region 04, 1984: where the machines are sent. A strip mall at night, in the rain: an arcade, a video store and a TV shop along the north
   side of a parking lot, a diner beyond them, a gas station to the east and a road along the south. It's the only arena that hasn't been
   wrecked yet. Everything tall stands to the north and east, where it never comes between you and the camera (which looks in from the
   south-west); the arcade is the one building you can go into, and its front and side walls sink while you're inside (cuts.js).
   How it plays: nothing walks in from the edge of the view. The machines come through time gates, balls of lightning that open around
   town and take a few seconds to charge: get to one and collapse it before it opens and nothing steps out. Some of what does come
   through goes for the shops instead of you; every blow on a shop door wakes the town a little more, and once it's awake the groups come
   bigger and sooner for the rest of the run. Mara isn't here: the radio doesn't carry across time, so the only way she can reach you is a
   payphone. When one rings, answering it gets you patched up or supplied. The big boss is the Infiltrator (infiltrator.js). */
import { B, G, V, C, MT, R as sr, dist2, rand, damp, pick } from './core.js';
import { Geo, gbox, gprism, gcyl, gmesh } from './geo.js';
import { makeMat } from './tex.js';
import { Actor } from './actors.js';
import { makeCuts } from './cuts.js';
import { rollLoot } from './loot.js';
import { survival } from './survival.js';

/* Walkable rectangles [x0, z0, x1, z1]; north is +z. The lot and the road, the alley west of the arcade, the arcade's floor, and its two
   doorways (each overlaps the ground on both sides by a metre; both are too narrow for a walker). */
const OUT = [-50, -34, 50, 20], ALLEY = [-50, 19, -40, 33], ARC = [-39, 21, -23, 31];
const DOOR_S = [-32.2, 19, -29.8, 22], DOOR_W = [-41, 25.8, -38, 28.2];
const START = { x: -4, z: -18 };
const WALL_H = 4.2, SHOP_H = 4.6;
const ob = (x, z, hw, hd, h) => G.obstacles.push({ x, z, hw, hd, h });
const inside = (r, x, z) => x > r[0] && x < r[2] && z > r[1] && z < r[3];
const NEON = { M: '#ff38c8', C: '#2ff0ff', A: '#ffb040', R: '#ff3a30' };

/* The shops the machines go for: where each stands along the front (x0 to x1), what its sign says and in which neon, and the spot on the
   pavement outside its door (`at`) that a break-in heads for. The gas station's shop is on the east side, facing west. */
const SHOPS = [
  { id: 'video', say: 'the video store', short: 'Video', x0: -22, x1: -6, sign: 'VIDEO', neon: 'C', wall: 'brick', at: { x: -14, z: 19 } },
  { id: 'tv', say: 'the TV shop', short: 'TV shop', x0: -6, x1: 10, sign: 'TV · RADIO', neon: 'A', wall: 'stucco', at: { x: 2, z: 19 } },
  { id: 'diner', say: 'the diner', short: 'Diner', x0: 18, x1: 42, sign: 'DINER', neon: 'M', at: { x: 30, z: 19 } },
  { id: 'gas', say: 'the gas station', short: 'Gas', sign: 'GAS', neon: 'R', at: { x: 49, z: -12 } },
];
/* where a time gate can open */
const SPOTS = [
  { x: -31, z: 6, say: 'in front of the arcade' }, { x: -14, z: 6, say: 'outside the video store' }, { x: 3, z: 5, say: 'outside the TV shop' },
  { x: 30, z: 8, say: 'by the diner' }, { x: 39.5, z: -2, say: 'at the gas pumps' }, { x: 30, z: -29.5, say: 'on the road, to the east' },
  { x: -30, z: -29.5, say: 'on the road, to the west' }, { x: 0, z: -30, say: 'on the road' }, { x: -41, z: -16, say: 'at the west end of the lot' },
  { x: -10, z: -17, say: 'in the lot' }, { x: 20, z: -18, say: 'at the east end of the lot' }, { x: -45, z: 27, say: 'in the alley' }, { x: -27, z: 28.6, say: 'inside the arcade' },
];
const PHONES = [
  { x: -20.6, z: 18.8, say: 'outside the video store' }, { x: 11.2, z: 18.8, say: 'by the TV shop' }, { x: 43.4, z: 18.8, say: 'by the diner' },
  { x: 48.8, z: -22.6, say: 'at the gas station' }, { x: 6, z: -24.3, say: 'by the road' }, { x: -48.6, z: -6, say: 'at the west end of the lot' },
];
/* Time gates: seconds one takes to charge (at the start of a run, and at full pressure, nine minutes in), how near and how far from you
   one opens, how long you stand in it to collapse it, the share of the group's XP that collapsing it is worth, the chance that what
   comes through one goes for the nearest shop instead of you, and how many can be open at once. */
const RIFT = { charge: [10, 6], near: 16, far: 48, hold: 1.5, xp: .6, raid: .4, max: 3, first: 5 };
/* Panic: how much each point of damage to a shop door adds (out of 100), how long after the last blow the town starts to settle and
   how fast (a second), and, once it's full and the town is awake, how much sooner the groups come and how many more machines in each. */
const PANIC = { perHit: .07, calm: 10, settle: .8, awakeK: .75, awakeAdd: 1 };
/* Payphones: seconds to the first call and between calls, how long one rings, how often its bell sounds, and what answering does:
   under `below` of your health Mara talks you to a first-aid kit (`heal` of your maximum), otherwise to supplies. */
const RING = { first: 35, every: 50, lasts: 22, bell: 3, below: .7, heal: .5, scrap: 25 };
const CALLS = {
  heal: ['Mara: "You sound terrible. There\'s a first-aid tin on top of the phone. It\'s always been there."', 'Mara: "Look under the shelf. Tape, dressings. Use them."'],
  supply: ['Mara: "Behind the booth, under the loose slab. Don\'t ask how I know it\'s there."', 'Mara: "I used to know this town. Check the newspaper box."', 'Mara: "Someone left a bag by that phone. Take it. They won\'t miss it."'],
};

/* ---------- the map ---------- */
const cuts = makeCuts();
let rifts = [], signs = [], crt = null, wins = [], canopy = [], screens = [], now = 0;
/* a sign in neon tubing: its letters drawn in outline, glowing, on a plane w by h metres that faces south (turn it for anything else) */
function neonSign(text, hex, w, h) {
  const S = G.scene, PX = 512, PY = Math.max(64, Math.round(512 * h / w)), t = new B.DynamicTexture('sign_' + text, { width: PX, height: PY }, S, true), c = t.getContext();
  c.clearRect(0, 0, PX, PY); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  let size = PY * .74; const font = () => { c.font = `italic 900 ${size}px "Arial Black", Impact, sans-serif`; }; font();
  const m = c.measureText(text).width; if (m > PX * .9) { size *= PX * .9 / m; font(); }
  for (const [blur, lw, col] of [[28, 10, hex], [12, 6, hex], [0, 2.2, '#ffffff']]) { c.shadowColor = hex; c.shadowBlur = blur; c.strokeStyle = col; c.lineWidth = lw; c.strokeText(text, PX / 2, PY / 2 + size * .04); }
  t.update(); t.hasAlpha = true;
  const mat = new B.StandardMaterial('signM_' + text, S); mat.disableLighting = true; mat.emissiveTexture = t; mat.opacityTexture = t; mat.backFaceCulling = false;
  const p = B.MeshBuilder.CreatePlane('sign_' + text, { width: w, height: h }, S); p.material = mat; p.isPickable = false; signs.push(t);
  return p;
}

export function buildRegion(M) {
  const S = G.scene;
  G.open = [OUT, ALLEY, ARC, DOOR_S, DOOR_W]; G.flames = [];
  const paint = [], oil = [];
  G.decalHints = { paint, oil, scorch: [[START.x, START.z, 2.4]], puddles: [[-4, -14, 1.6], [10, 4, 1.4], [-24, 2, 1.8], [33, -22, 1.5]], puddleN: 45, puddleCol: 'rgba(34,30,62,.55)', noDebris: true };

  const mat = (n, h, o) => makeMat(S, n, h, o), conc = { tex: M.conc.diffuseTexture, bump: M.conc.bumpTexture }, lit = (n, hex) => mat(n, '#000000', { unlit: true, emissive: hex });
  const MAT = {
    asphalt: mat('asphalt84', '#4c4c5a', { tex: M.road.diffuseTexture, bump: M.road.bumpTexture, spec: .32, power: 40 }),
    walk: mat('walk84', '#77767e', { tex: M.pave.diffuseTexture, bump: M.pave.bumpTexture }),
    brick: mat('brick84', '#845a4c', conc), stucco: mat('stucco84', '#9a958a', conc), dark: mat('dark84', '#2e2d35', conc),
    house: mat('house84', '#5d5a68', conc), roof: mat('roof84', '#27252d', conc),
    trim: mat('trim84', '#202026', { tex: M.crate.albedoTexture, bump: M.crate.bumpTexture, spec: .15 }),
    carpet: mat('carpet84', '#3c2658', { tex: M.trunk.diffuseTexture }),
    chrome: mat('chrome84', '#aab2bd', { metal: .9, rough: .25, env: 1.6 }), glass: mat('glass84', '#0b1018', { metal: .6, rough: .12, env: 2.2 }),
    paintA: mat('paintA', '#6e1f24', { metal: .5, rough: .32, env: 1.4 }), paintB: mat('paintB', '#1f5a66', { metal: .5, rough: .32, env: 1.4 }), paintC: mat('paintC', '#b8a988', { metal: .5, rough: .36, env: 1.4 }),
    paintD: mat('paintD', '#5a3d28', { metal: .5, rough: .34, env: 1.4 }), paintE: mat('paintE', '#232c4a', { metal: .5, rough: .3, env: 1.4 }),
    neonM: lit('neonM', NEON.M), neonC: lit('neonC', NEON.C), neonA: lit('neonA', NEON.A), neonR: lit('neonR', NEON.R),
    sodium: lit('sodium84', '#ffb060'), white: lit('white84', '#fff2dc'), tail: lit('tail84', '#4a0808'), crt: lit('crt84', '#9fc4ff'),
    scr0: lit('scr0', '#39f0a0'), scr1: lit('scr1', '#ff58d0'), scr2: lit('scr2', '#58b8ff'),
    win0: lit('win0', '#ffd08a'), win1: lit('win1', '#ffd08a'), win2: lit('win2', '#ffe2b0'),
  };
  const UNLIT = ['neonM', 'neonC', 'neonA', 'neonR', 'sodium', 'white', 'tail', 'crt', 'scr0', 'scr1', 'scr2', 'win0', 'win1', 'win2'];
  const g = {}; for (const k in MAT) g[k] = Geo();
  crt = MAT.crt; crt.base = crt.emissiveColor.clone(); screens = [MAT.scr0, MAT.scr1, MAT.scr2].map(m => ({ m, base: m.emissiveColor.clone() }));
  wins = [MAT.win0, MAT.win1, MAT.win2].map(m => ({ m, base: m.emissiveColor.clone() }));
  /* a piece that sinks while it stands between you and the camera: its own meshes (the same materials) under its own node */
  const sinking = (x0, z0, x1, z1, h, draw) => { const node = new B.TransformNode('sinks', S), gg = {}; for (const k in MAT) gg[k] = Geo(); draw(gg, node);
    for (const k in gg) gmesh('sinks_' + k, gg[k], MAT[k], { parent: node, shadow: !UNLIT.includes(k) }); cuts.add(node, x0, z0, x1, z1, h); return node; };
  const wall = (gg, key, x0, z0, x1, z1, h, tint = 1) => { gbox(gg[key], { x: (x0 + x1) / 2, y: h / 2, z: (z0 + z1) / 2, w: x1 - x0, h, d: z1 - z0, uv: .3, tint, noBottom: true }); ob((x0 + x1) / 2, (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, h); };

  /* pools of light on the wet ground, under the streetlights and in front of the neon: a soft disc, added to whatever is under it */
  const dot = new B.DynamicTexture('pool84', { width: 128, height: 128 }, S, true);
  { const c = dot.getContext(), gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.5, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); dot.update(); dot.hasAlpha = true; }
  const pools = {}, pool = (x, z, rx, rz, hex, a = .3) => { const k = hex + a;
    if (!pools[k]) { const m = pools[k] = new B.StandardMaterial('pool' + k, S); m.disableLighting = true; m.emissiveColor = C(hex); m.opacityTexture = dot; m.alpha = a; m.alphaMode = B.Engine.ALPHA_ADD; m.disableDepthWrite = true; m.zOffset = -3; }
    const d = B.MeshBuilder.CreateGround('pool', { width: rx * 2, height: rz * 2 }, S); d.position.set(x, .1, z); d.material = pools[k]; d.isPickable = false; G.glow.addExcludedMesh(d); d.freezeWorldMatrix(); };

  /* ---------- ground: wet tarmac, the pavement along the shop fronts, the arcade's carpet, and darkness past the edges ---------- */
  gbox(g.asphalt, { x: 4, y: -.05, z: -1, w: 116, h: .1, d: 72, uv: 1 / 5, ao: false, noBottom: true });
  gbox(g.walk, { x: 2, y: -.02, z: 18, w: 84, h: .1, d: 4, uv: .25, ao: false, noBottom: true }); gbox(g.walk, { x: 49, y: -.02, z: -12, w: 2.4, h: .1, d: 20, uv: .25, ao: false, noBottom: true });
  gbox(g.carpet, { x: (ARC[0] + ARC[2]) / 2, y: -.015, z: 25.75, w: 17, h: .1, d: 11.5, uv: .5, ao: false, noBottom: true });
  const out = B.MeshBuilder.CreateGround('outside', { width: 320, height: 320 }, S); out.position.set(0, -.08, 0); out.material = mat('out84', '#05040a', { unlit: true }); out.isPickable = false; out.freezeWorldMatrix();
  /* painted lines: the road's double yellow and its edge, and the parking stalls */
  for (const z of [-29.7, -29.3]) paint.push([-49, z, 49, z, .12, '214,176,60', .5]); paint.push([-49, -25.2, 49, -25.2, .12, '225,225,215', .4]);
  /* a low hedge along the west side and a guard rail across the road: nothing on the camera's side stands taller than your waist */
  gbox(g.dark, { x: -50.9, y: .45, z: -3, w: 1.2, h: .9, d: 44, uv: .4, tint: .7 });
  gbox(g.chrome, { x: 0, y: .55, z: -34.7, w: 100, h: .28, d: .08, ao: false }); for (let x = -48; x <= 48; x += 4) gbox(g.trim, { x, y: .3, z: -34.75, w: .12, h: .6, d: .12, ao: false });

  /* ---------- cars: long, low and square, in five colours. `nose`: which way it points (0 is north) ---------- */
  const PAINTS = ['paintA', 'paintB', 'paintC', 'paintD', 'paintE']; let cars = 0;
  const car = (x, z, nose) => { const k = cars++, body = g[PAINTS[k % 5]], P = MT(0, 0, 0, 0, nose, 0).multiply(MT(x, 0, z)), wagon = k % 3 === 0, back = wagon ? -2.0 : -1.3;
    gprism(body, [[-2.3, .36], [2.25, .36], [2.32, .74], [2.1, .92], [-2.2, .96], [-2.34, .7]], -.92, .92, P, { uv: .5 });
    gprism(g.glass, [[back - .15, .95], [1.0, .93], [.5, 1.42], [back + .25, 1.44]], -.84, .84, P, { uv: .5, ao: false });
    gprism(body, [[back + .25, 1.43], [.5, 1.41], [.5, 1.48], [back + .25, 1.5]], -.86, .86, P, { uv: .5, ao: false });
    for (const zz of [-2.36, 2.34]) gbox(g.chrome, { M: MT(0, .46, zz).multiply(P), w: 1.86, h: .16, d: .12, ao: false });
    for (const s of [-1, 1]) { gbox(g.tail, { M: MT(s * .68, .74, -2.37).multiply(P), w: .36, h: .14, d: .05, ao: false });
      for (const zz of [1.45, -1.45]) gcyl(g.trim, { r0: .34, h: .22, seg: 10, M: MT(0, 0, 0, 0, 0, Math.PI / 2).multiply(MT(s * .88, .34, zz)).multiply(P), ao: false }); }
    const c = Math.abs(Math.cos(nose)), s = Math.abs(Math.sin(nose)); ob(x, z, .95 * c + 2.35 * s, 2.35 * c + .95 * s, 1.45); oil.push([x, z, 1.3]); };
  /* the row along the shop fronts (leaving the way to every door clear), and a double row down the middle of the lot */
  for (let x = -37.5; x <= 43; x += 3.1) { paint.push([x - 1.55, 9.9, x - 1.55, 15.8, .1, '225,225,215', .45]);
    if (SHOPS.every(s => Math.abs(s.at.x - x) > 2.6) && Math.abs(x + 31) > 2.6 && sr(0, 1) < .45) car(x, 12.7, sr(-.04, .04) + (sr(0, 1) < .8 ? 0 : Math.PI)); }
  paint.push([-36.6, -6.4, 22.4, -6.4, .1, '225,225,215', .45]);
  for (let x = -35; x <= 21; x += 3.1) { paint.push([x - 1.55, -11.7, x - 1.55, -1.1, .1, '225,225,215', .45]);
    if (sr(0, 1) < .5) car(x, -3.75, Math.PI + sr(-.04, .04)); if (sr(0, 1) < .5) car(x, -9.05, sr(-.04, .04)); }
  car(-22, -26.6, Math.PI / 2 + .02); car(36, -26.5, -Math.PI / 2);   // two parked on the road

  /* ---------- streetlights: sodium orange, each with its pool on the ground ---------- */
  const lamp = (x, z, dir) => { gcyl(g.trim, { r0: .09, r1: .06, h: 7, seg: 6, x, y: 3.5, z, ao: false }); gbox(g.trim, { x: x + dir * .9, y: 6.95, z, w: 1.9, h: .1, d: .12, ao: false });
    gbox(g.sodium, { x: x + dir * 1.7, y: 6.86, z, w: .7, h: .1, d: .3, ao: false }); ob(x, z, .15, .15, 7);
    pool(x + dir * 1.7, z, 9, 9, '#ff9a3c', .3); G.lightSources.push({ pos: V(x + dir * 1.7, 5.5, z), color: C('#ffa646'), range: 18, intensity: 1.3 }); };
  lamp(-38.3, -6.4, 1); lamp(-8.6, -6.4, 1); lamp(23.9, -6.4, -1); lamp(-44, -24.7, 1); lamp(-14, -24.7, 1); lamp(16, -24.7, 1); lamp(46, -24.7, -1);

  /* ---------- the shops along the north side: a brick or stucco box, a dark window, a fascia with the sign on it, neon round the window.
     Each has an alarm lamp over the door that shows red while something is at it ---------- */
  const alarm = (s, x, y, z, w, d) => { s.alarm = lit('alarm_' + s.id, '#ff2a20'); s.alarmBase = s.alarm.emissiveColor.clone(); const a = Geo(); gbox(a, { x, y, z, w, h: .16, d, ao: false }); gmesh('alarm_' + s.id, a, s.alarm, { shadow: false, freeze: true });
    s.light = { pos: V(s.at.x, 2.6, s.at.z), color: C('#ff3020'), range: 10, intensity: 0, flicker: true }; G.lightSources.push(s.light); };
  for (const s of SHOPS.slice(0, 2)) { const cx = (s.x0 + s.x1) / 2, w = s.x1 - s.x0, n = g['neon' + s.neon];
    wall(g, s.wall, s.x0, 20, s.x1, 32, SHOP_H, sr(.9, 1.05)); gbox(g.trim, { x: cx, y: SHOP_H + .12, z: 26, w: w + .3, h: .24, d: 12.3, ao: false });
    gbox(g.dark, { x: cx, y: 3.55, z: 19.86, w: w - .4, h: 1.3, d: .3, ao: false });                                               // the fascia
    gbox(g.glass, { x: cx, y: 1.55, z: 19.95, w: w - 1.4, h: 2.3, d: .1, ao: false }); gbox(g.trim, { x: cx, y: .2, z: 19.88, w: w - 1, h: .4, d: .24, ao: false });
    for (let k = 0; k <= 5; k++) gbox(g.trim, { x: s.x0 + .7 + (w - 1.4) * k / 5, y: 1.55, z: 19.9, w: .12, h: 2.4, d: .16, ao: false });   // mullions
    gbox(g.chrome, { x: s.at.x, y: 1.2, z: 19.86, w: 1.5, h: 2.4, d: .08, ao: false }); gbox(g.glass, { x: s.at.x, y: 1.25, z: 19.82, w: 1.2, h: 2.1, d: .06, ao: false });   // the door
    for (const y of [.42, 2.74]) gbox(n, { x: cx, y, z: 19.84, w: w - 1.5, h: .06, d: .06, ao: false }); for (const x of [s.x0 + .75, s.x1 - .75]) gbox(n, { x, y: 1.58, z: 19.84, w: .06, h: 2.3, d: .06, ao: false });
    const sign = neonSign(s.sign, NEON[s.neon], Math.min(w - 3, 11), 1.15); sign.position.set(cx, 3.55, 19.68);
    alarm(s, s.at.x, 2.55, 19.8, .9, .1); pool(cx, 16.5, w * .55, 5, NEON[s.neon], .22); G.lightSources.push({ pos: V(cx, 2.8, 17.8), color: C(NEON[s.neon]), range: 13, intensity: 1.1 }); }
  /* the video store's posters, and the TV shop's window full of sets left on */
  for (let k = 0; k < 5; k++) gbox(g[['scr1', 'scr2', 'scr0'][k % 3]], { x: -20.3 + k * 2.75 + (k > 1 ? 1.2 : 0), y: 1.5, z: 19.89, w: .8, h: 1.15, d: .03, ao: false, tint: .5 });
  for (let k = 0; k < 9; k++) { const x = -4.6 + k * 1.52 + (k > 3 ? 1.3 : 0), y = k % 2 ? 1.75 : 1.05; if (x > 9) continue; gbox(g.trim, { x, y, z: 19.82, w: .95, h: .78, d: .2, ao: false }); gbox(g.crt, { x, y: y + .02, z: 19.71, w: .7, h: .54, d: .03, ao: false }); }

  /* ---------- the diner: chrome and cream, long windows, tubes along the roofline and a sign standing on the roof ---------- */
  { const s = SHOPS[2], cx = 30, w = 24;
    wall(g, 'stucco', s.x0, 20, s.x1, 30, 3.7, 1.05); gbox(g.chrome, { x: cx, y: 3.82, z: 25, w: w + .5, h: .26, d: 10.5, ao: false });
    gbox(g.chrome, { x: cx, y: .75, z: 19.9, w: w - .2, h: .5, d: .2, ao: false }); gbox(g.glass, { x: cx, y: 2.05, z: 19.94, w: w - 1.6, h: 1.5, d: .1, ao: false });
    for (let k = 0; k <= 8; k++) gbox(g.chrome, { x: s.x0 + .8 + (w - 1.6) * k / 8, y: 2.05, z: 19.9, w: .1, h: 1.6, d: .14, ao: false });
    gbox(g.chrome, { x: s.at.x, y: 1.2, z: 19.84, w: 1.5, h: 2.4, d: .1, ao: false }); gbox(g.glass, { x: s.at.x, y: 1.25, z: 19.8, w: 1.2, h: 2.1, d: .06, ao: false });
    gbox(g.neonM, { x: cx, y: 3.62, z: 19.82, w: w, h: .07, d: .07, ao: false }); gbox(g.neonC, { x: cx, y: 3.42, z: 19.82, w: w, h: .07, d: .07, ao: false }); gbox(g.neonM, { x: cx, y: 1.1, z: 19.78, w: w - .4, h: .05, d: .05, ao: false });
    for (const x of [26, 34]) gcyl(g.trim, { r0: .07, h: 1.5, seg: 6, x, y: 4.6, z: 21, ao: false });
    const sign = neonSign(s.sign, NEON.M, 9, 2); sign.position.set(cx, 5.15, 20.9);
    alarm(s, s.at.x, 2.55, 19.76, .9, .1); pool(cx, 16.5, 13, 5, NEON.M, .2); G.lightSources.push({ pos: V(cx, 2.8, 17.8), color: C(NEON.M), range: 14, intensity: 1.1 }); }
  /* between the TV shop and the diner: a fenced yard with a dumpster in it */
  wall(g, 'dark', 10, 21.5, 18, 22, 2.2, .8); gbox(g.trim, { x: 14, y: .75, z: 26, w: 2.4, h: 1.5, d: 1.5, uv: .5 });

  /* ---------- the gas station: a shop on the east side, and a canopy over two pump islands. The canopy fades when you walk in behind it ---------- */
  { const s = SHOPS[3];
    wall(g, 'stucco', 50, -20, 60, -4, 3.9); gbox(g.trim, { x: 55, y: 4.02, z: -12, w: 10.3, h: .24, d: 16.3, ao: false }); gbox(g.neonR, { x: 49.84, y: 3.45, z: -12, w: .07, h: .07, d: 15.4, ao: false });
    gbox(g.glass, { x: 49.95, y: 1.6, z: -12, w: .1, h: 2.2, d: 13, ao: false }); for (let k = 0; k <= 5; k++) gbox(g.trim, { x: 49.9, y: 1.6, z: -18.5 + 13 * k / 5, w: .16, h: 2.3, d: .12, ao: false });
    gbox(g.chrome, { x: 49.86, y: 1.2, z: s.at.z, w: .08, h: 2.4, d: 1.5, ao: false });
    const sign = neonSign(s.sign, NEON.R, 4.6, 1.5); sign.position.set(49.7, 5, -12); sign.rotation.y = Math.PI / 2; for (const z of [-13.8, -10.2]) gcyl(g.trim, { r0: .07, h: 1.3, seg: 6, x: 50.4, y: 4.6, z, ao: false });
    alarm(s, 49.8, 2.55, s.at.z, .1, .9); pool(46.5, -12, 4, 8, '#fff0d8', .16);
    const cn = new B.TransformNode('canopy', S), cg = { stucco: Geo(), neonR: Geo(), white: Geo() };
    gbox(cg.stucco, { x: 39, y: 4.95, z: -12, w: 10, h: .5, d: 10, ao: false }); for (const [dx, dz, w, d] of [[0, -5.03, 10, .06], [0, 5.03, 10, .06], [-5.03, 0, .06, 10], [5.03, 0, .06, 10]]) gbox(cg.neonR, { x: 39 + dx, y: 4.95, z: -12 + dz, w, h: .16, d, ao: false });
    for (const x of [36.5, 41.5]) gbox(cg.white, { x, y: 4.68, z: -12, w: .5, h: .05, d: 7, ao: false });
    canopy = Object.keys(cg).map(k => gmesh('canopy_' + k, cg[k], MAT[k], { parent: cn, shadow: k === 'stucco' }));
    for (const x of [36.5, 41.5]) { gbox(g.walk, { x, y: .1, z: -12, w: 1.3, h: .2, d: 6.4, ao: false });
      for (const z of [-14.4, -9.6]) { gcyl(g.trim, { r0: .14, h: 4.7, seg: 8, x, y: 2.35, z, ao: false }); ob(x, z, .2, .2, 4.7); }
      for (const z of [-13, -11]) { gbox(g.stucco, { x, y: 1.1, z, w: .8, h: 1.8, d: .55, uv: .5, tint: 1.1 }); gbox(g.white, { x: x - .41, y: 1.5, z, w: .02, h: .5, d: .4, ao: false }); gbox(g.neonR, { x, y: 2.06, z, w: .84, h: .12, d: .6, ao: false }); ob(x, z, .45, .32, 2); } }
    pool(39, -12, 8, 8, '#fff0d8', .22); G.lightSources.push({ pos: V(39, 4, -12), color: C('#fff0d8'), range: 16, intensity: 1.3 }); }

  /* ---------- the houses behind the shops: their windows are dark while the town sleeps, and come on as it wakes ---------- */
  for (let k = 0; k < 7; k++) { const x = -48 + k * 16.5 + sr(-1.2, 1.2), z = 47 + sr(-2.5, 2.5), w = sr(10, 12.5), d = 8, h = sr(6, 7.2);
    gbox(g.house, { x, y: h / 2, z, w, h, d, uv: .3, tint: sr(.75, 1.1), noBottom: true });
    gprism(g.roof, [[-d / 2 - .5, h], [d / 2 + .5, h], [0, h + 2.4]], x - w / 2 - .3, x + w / 2 + .3, MT(0, 0, z), { uv: .4 });
    for (const y of [h - 4.4, h - 1.6]) for (let i = 0; i < 4; i++) gbox(sr(0, 1) < .8 ? g['win' + (k + i) % 3] : g.glass, { x: x - w / 2 + (i + .5) * w / 4, y, z: z - d / 2 - .04, w: 1.2, h: 1.3, d: .06, ao: false }); }
  for (let k = 0; k < 3; k++) { const z = -26 + k * 17, h = 6.4; gbox(g.house, { x: 72, y: h / 2, z, w: 8, h, d: 12, uv: .3, tint: sr(.75, 1.05), noBottom: true });
    for (const y of [1.9, 4.6]) for (let i = 0; i < 3; i++) gbox(g['win' + (k + i) % 3], { x: 67.96, y, z: z - 4 + i * 4, w: .06, h: 1.3, d: 1.2, ao: false }); }

  /* ---------- the arcade: the one building you can go into. Its back and east walls stand; its front and its west wall sink while
     you're inside. Rows of cabinets to get behind, lit by their own screens ---------- */
  { const [x0, z0, x1, z1] = ARC;
    wall(g, 'dark', -40, 31, -22, 32, WALL_H); wall(g, 'dark', -23, 20, -22, 31, WALL_H);
    for (const y of [3.3, 3.5]) gbox(y > 3.4 ? g.neonC : g.neonM, { x: -31, y, z: 30.97, w: 15.6, h: .06, d: .06, ao: false });
    /* the front: brick either side of the door, dark glass, a tube round each window, and the sign over the door (it sinks with the wall) */
    sinking(-40, 20, -22, 21, WALL_H, (gg, node) => {
      for (const [a, b] of [[-40, DOOR_S[0]], [DOOR_S[2], -22]]) { gbox(gg.brick, { x: (a + b) / 2, y: WALL_H / 2, z: 20.5, w: b - a, h: WALL_H, d: 1, uv: .3, noBottom: true });
        gbox(gg.glass, { x: (a + b) / 2, y: 1.6, z: 19.97, w: b - a - 1.6, h: 2, d: .06, ao: false }); for (const y of [.52, 2.68]) gbox(gg.neonM, { x: (a + b) / 2, y, z: 19.92, w: b - a - 1.5, h: .06, d: .06, ao: false }); }
      gbox(gg.brick, { x: -31, y: (WALL_H + 2.9) / 2, z: 20.5, w: 2.4, h: WALL_H - 2.9, d: 1, uv: .3, noBottom: true }); gbox(gg.trim, { x: -31, y: WALL_H + .1, z: 20.5, w: 18.2, h: .2, d: 1.2, ao: false });
      for (const x of [DOOR_S[0], DOOR_S[2]]) gbox(gg.neonC, { x, y: 1.45, z: 19.94, w: .07, h: 2.9, d: .07, ao: false }); gbox(gg.neonC, { x: -31, y: 2.9, z: 19.94, w: 2.47, h: .07, d: .07, ao: false });
      const sign = neonSign('ARCADE', NEON.M, 8, 1.2); sign.parent = node; sign.position.set(-31, 3.62, 19.9); });
    ob(-36.1, 20.5, 3.9, .5, WALL_H); ob(-25.9, 20.5, 3.9, .5, WALL_H);
    sinking(-40, 21, -39, 32, WALL_H, gg => {
      for (const [a, b] of [[21, DOOR_W[1]], [DOOR_W[3], 32]]) gbox(gg.dark, { x: -39.5, y: WALL_H / 2, z: (a + b) / 2, w: 1, h: WALL_H, d: b - a, uv: .3, noBottom: true });
      gbox(gg.dark, { x: -39.5, y: (WALL_H + 2.9) / 2, z: 27, w: 1, h: WALL_H - 2.9, d: 2.4, uv: .3, noBottom: true }); gbox(gg.trim, { x: -39.5, y: WALL_H + .1, z: 26.5, w: 1.2, h: .2, d: 11.2, ao: false }); });
    ob(-39.5, 23.4, .5, 2.4, WALL_H); ob(-39.5, 30.1, .5, 1.9, WALL_H);
    pool(-31, 16.5, 10, 5, NEON.M, .24); G.lightSources.push({ pos: V(-31, 2.8, 17.8), color: C(NEON.M), range: 13, intensity: 1.1 });
    /* a cabinet: its screen and its marquee face south, toward the camera (`back`: one facing the other way, with nothing to show) */
    let n = 0; const cab = (x, z, back) => { const k = n++; gbox(g.trim, { x, y: .95, z, w: .8, h: 1.9, d: .8, uv: .6, tint: sr(.8, 1.3) }); if (back) return;
      gbox(g['scr' + k % 3], { x, y: 1.32, z: z - .41, w: .56, h: .46, d: .03, ao: false }); gbox(g[k % 2 ? 'neonM' : 'neonC'], { x, y: 1.77, z: z - .41, w: .68, h: .13, d: .03, ao: false }); gbox(g.dark, { x, y: .98, z: z - .5, w: .72, h: .08, d: .24, ao: false }); };
    const row = (xa, xb, z, both) => { for (let x = xa + .45; x < xb; x += .9) { cab(x, both ? z - .4 : z); if (both) cab(x, z + .4, true); } ob((xa + xb) / 2, z, (xb - xa) / 2, both ? .8 : .42, 1.9); };
    row(-38.6, -23.2, 30.5); row(-36.6, -33, 24.4, true); row(-29, -25.4, 24.4, true); row(-34.2, -28.8, 27.8, true);
    gbox(g.trim, { x: -24.8, y: .55, z: 22, w: 2.6, h: 1.1, d: 1, uv: .5 }); gbox(g.neonC, { x: -24.8, y: 1.12, z: 21.48, w: 2.5, h: .05, d: .05, ao: false }); ob(-24.8, 22, 1.3, .5, 1.1);   // the change counter
    G.lightSources.push({ pos: V(-35, 3, 26.5), color: C(NEON.M), range: 11, intensity: 1.2 }, { pos: V(-27, 3, 27), color: C(NEON.C), range: 11, intensity: 1.2 });
    /* the alley beside it: a fence across the far end, bins */
    gbox(g.chrome, { x: -45, y: 1.1, z: 33.3, w: 10, h: 2.2, d: .06, ao: false, tint: .5 }); gbox(g.trim, { x: -48.2, y: .7, z: 31.4, w: 2.2, h: 1.4, d: 1.4, uv: .5 }); ob(-48.2, 31.4, 1.1, .7, 1.4);
    for (const [x, z] of [[-41.2, 21.6], [-41.4, 30.6]]) { gcyl(g.chrome, { r0: .32, h: .9, seg: 10, x, y: .45, z, tint: .6 }); ob(x, z, .32, .32, .9); } }

  /* ---------- payphones: a post, a hooded box, and a lamp over it that flashes while it rings ---------- */
  for (const p of PHONES) { gcyl(g.trim, { r0: .07, h: 1.3, seg: 6, x: p.x, y: .65, z: p.z, ao: false }); gbox(g.chrome, { x: p.x, y: 1.6, z: p.z, w: .7, h: .95, d: .5, uv: .6 }); gbox(g.trim, { x: p.x, y: 1.55, z: p.z - .2, w: .4, h: .55, d: .16, ao: false }); ob(p.x, p.z, .35, .28, 2.1);
    p.pos = V(p.x, 0, p.z); p.mat = lit('phone_' + PHONES.indexOf(p), '#bfe9ff'); p.base = p.mat.emissiveColor.clone();
    const a = Geo(); gbox(a, { x: p.x, y: 2.14, z: p.z, w: .74, h: .14, d: .54, ao: false }); gmesh('phoneLamp', a, p.mat, { shadow: false, freeze: true });
    p.light = { pos: V(p.x, 2.4, p.z), color: C('#bfe9ff'), range: 9, intensity: 0 }; G.lightSources.push(p.light); }

  /* ---------- rain instead of ash: short bright streaks, falling fast ---------- */
  { const w = G.FX.weather; w.color1 = new B.Color4(.62, .7, .95, .5); w.color2 = new B.Color4(.5, .56, .85, .32); w.minSize = .028; w.maxSize = .05; w.minScaleY = 12; w.maxScaleY = 20;
    w.minLifeTime = .45; w.maxLifeTime = .7; w.minEmitPower = 17; w.maxEmitPower = 22; w.direction1 = V(-.12, -1, -.05); w.direction2 = V(-.05, -1, .02); w.minEmitBox = V(-30, 8, -30); w.maxEmitBox = V(30, 13, 30); }

  /* ---------- finish: one mesh per material, and the time gates ---------- */
  for (const k in g) gmesh('y84_' + k, g[k], MAT[k], { freeze: true, shadow: !UNLIT.includes(k) && k !== 'asphalt' && k !== 'walk' && k !== 'carpet' });
  rifts = [...Array(RIFT.max)].map((_, k) => makeRift(k));
  /* There's no relay gate here: you came through a time gate, and it closed behind you. What the engine expects of one is stood in for. */
  return { gate: { discA: new B.TransformNode('noGateA', S), discB: new B.TransformNode('noGateB', S), source: { intensity: 0 } } };
}

/* ---------- a time gate: a scorched ring, a ball of light that grows as it charges, and lightning off it ---------- */
const UP = V(0, 1, 0);
function makeRift(k) {
  const S = G.scene, root = new B.TransformNode('rift' + k, S);
  if (!G.M.riftCore) { const m = (n, hex, a) => { const x = new B.StandardMaterial(n, S); x.disableLighting = true; x.emissiveColor = C(hex); if (a != null) { x.alpha = a; x.alphaMode = B.Engine.ALPHA_ADD; x.disableDepthWrite = true; x.backFaceCulling = false; } return x; };
    G.M.riftCore = m('riftCore', '#eaf6ff'); G.M.riftBall = m('riftBall', '#7fbcff', .42); G.M.riftFloor = m('riftFloor', '#5aa0ff', .22); }
  const put = (m, mat, y) => { m.parent = root; m.material = mat; m.position.y = y; m.isPickable = false; return m; };
  const ball = put(B.MeshBuilder.CreateSphere('riftBall', { diameter: 1, segments: 12 }, S), G.M.riftBall, 1.5), core = put(B.MeshBuilder.CreateSphere('riftCore', { diameter: 1, segments: 8 }, S), G.M.riftCore, 1.5);
  const ring = put(B.MeshBuilder.CreateTorus('riftRing', { diameter: 4.4, thickness: .08, tessellation: 40 }, S), G.M.riftCore, .1);
  const floor = put(B.MeshBuilder.CreateDisc('riftFloor', { radius: 2.2, tessellation: 40 }, S), G.M.riftFloor, .09); floor.rotation.x = Math.PI / 2; G.glow.addExcludedMesh(floor);
  const arcs = [...Array(6)].map(() => { const a = put(B.MeshBuilder.CreateCylinder('riftArc', { diameter: .05, height: 1, tessellation: 4 }, S), G.M.riftCore, 1.5); a.rotationQuaternion = B.Quaternion.Identity(); return a; });
  const light = { pos: V(0, 2, 0), color: C('#9fd0ff'), range: 17, intensity: 0, flicker: true }; G.lightSources.push(light);
  root.setEnabled(false);
  return { k, root, ball, core, ring, arcs, light, on: false, t: 0, T0: 1, spot: null, shop: null, arcT: 0 };
}
/* lightning: each arc is thrown from the ball's centre in a new direction a few times a second, some of them down to the ring */
function strike(r, size) {
  for (const a of r.arcs) { const down = Math.random() < .4, th = rand(0, 6.283), y = down ? rand(-1, -.5) : rand(-.3, 1), l = Math.sqrt(Math.max(0, 1 - Math.min(1, y * y))), d = V(Math.cos(th) * l, y, Math.sin(th) * l).normalize();
    const len = down ? 1.5 / Math.max(.3, -d.y) : size * rand(.6, 1.5); a.position.set(d.x * len / 2, 1.5 + d.y * len / 2, d.z * len / 2); a.scaling.set(1, len, 1);
    const c = B.Vector3.Cross(UP, d), q = a.rotationQuaternion; q.set(c.x, c.y, c.z, 1 + B.Vector3.Dot(UP, d)); q.normalize(); a.setEnabled(Math.random() < .75); }
}
const shut = r => { r.on = false; r.root.setEnabled(false); r.light.intensity = 0; };
/* the flash of something arriving through time */
function arrival(c, size = 1) {
  G.FX.blast(V(c.x, .3, c.z), size); G.FX.spark(V(c.x, 1.5, c.z), 60 * size | 0); G.boom(V(c.x, 1.5, c.z), 9); G.shake = Math.max(G.shake, .3 * size);
  G.audio.play('boomSmall', { pos: c, gain: .9, rate: .7, hear: 80 }); G.audio.play('powerOff', { pos: c, gain: .5, rate: 2, len: .9, fade: .3, hear: 80 });
}

/* ---------- how 1984 looks and sounds: night, rain, sodium light and neon ---------- */
const LOOK = {
  sky: '#06050c', fog: '#0b0916', fogD: .0095, hemiSky: '#9088d0', hemiGround: '#241e32', hemiI: 1.1,
  sun: '#a9baf4', sunI: .85, sunDir: [-.35, -1, .3], exposure: 1.55, contrast: 1.3, sat: 14, bloomW: .75, bloomT: .45, glowI: 1.15,
  weatherK: 2.5,   // rain: far more of it than there is ash anywhere else, and each drop gone in half a second
  env: { zenith: [10, 10, 26], horizon: [58, 30, 80], ground: [10, 9, 16], sun: .12, gate: 0 },
};
/* rain, running all the time under the music: the steady first half of "Gentle rain 07" (it thins out after that), turned up, since it's a quiet recording */
const AMBIENCE = [{ name: 'ambRain', url: 'sfx/ambience-rain.mp3', from: 0, to: 45, gain: 2.5, layer: true }];

/* ---------- a shop, as the machines see it: something of yours to attack. It has no model (the building is the map's) and it can't be
   destroyed: what a blow on its door costs you is the town's sleep ---------- */
class Storefront extends Actor {
  constructor(s) { super('player', 1e6); this.kind = 'storefront'; this.name = s.short; this.S = s; this.radius = .7; this.height = 1.1;
    this.root = new B.TransformNode('storefront', G.scene); this.root.position.set(s.at.x, 0, s.at.z); this.home = V(s.at.x, 0, s.at.z);
    this.raidOnly = true; }   // only machines sent to break in go for it (combat.js); the rest are after you
  hitTargets() { return [{ part: 'body', c: this.pos.add(V(0, 1.1, 0)), r: 1.2 }]; }
  takeDamage(d) { if (town && !town.awake) town.panic = Math.min(100, town.panic + d * PANIC.perHit); if (town) town.hitAt = now; this.S.hitAt = now; return 0; }
  update() {}
}

/* ---------- 1984 as a survival arena ---------- */
let town = null, tally = null;
const lerp = (a, b, k) => a + (b - a) * Math.max(0, Math.min(1, k));
/* a time gate opens: somewhere you can get to but aren't standing, and not where the last one was */
function openRift(R, run, r) {
  const P = G.player.pos, free = SPOTS.filter(s => s !== town.lastSpot && !rifts.some(q => q.on && q.spot === s)), d = s => dist2(P, s);
  const first = !town.opened, L = [free.filter(s => d(s) > RIFT.near && d(s) < (first ? 24 : RIFT.far)), free.filter(s => d(s) > 10), free].find(l => l.length), spot = pick(L);
  const at = G.nav.snap(spot.x, spot.z, 3) || spot;
  r.on = true; r.spot = town.lastSpot = spot; r.at = at; r.T0 = r.t = lerp(RIFT.charge[0], RIFT.charge[1], run.time / 540) + (first ? 3 : 0); r.root.position.set(at.x, 0, at.z); r.root.setEnabled(true); r.light.pos.set(at.x, 2, at.z);
  /* some of what comes through goes for the nearest shop, while the town is still asleep */
  r.shop = !town.awake && town.opened > 1 && Math.random() < RIFT.raid ? SHOPS.slice().sort((a, b) => dist2(a.at, at) - dist2(b.at, at))[0] : null;
  G.audio.play('powerOn', { pos: at, gain: .6, rate: 1.7, len: 1.2, fade: .3, hear: 90 });
  if (town.opened++ < 3) R.say(`A time gate is opening ${spot.say} · Get to it before it finishes charging`, '#9fd0ff');
}
function collapse(R, run, r) {
  const c = r.at; shut(r); tally.shut++; run.xp += Math.max(2, Math.round(run.size() * 2.5 * RIFT.xp)); run.hudAt = 0;
  G.FX.puffAt(V(c.x, 1.5, c.z), 24); G.FX.spark(V(c.x, 1.5, c.z), 40); G.drops.scatter(c.x, c.z, [{ scrap: 5 }]);
  G.audio.play('powerOff', { pos: c, gain: .7, rate: 1.8, len: 1, fade: .3 }); R.say('Time gate collapsed · Nothing came through', '#1fe0ff');
}
/* a time gate finishes charging: a group steps out of it, and heads for you or for a shop */
function arrive(R, run, r) {
  const c = r.at, s = r.shop; shut(r); arrival(c, 1.1);
  const came = run.wave(c, s ? { raid: { camp: s.actor } } : null);
  if (s && came.length) { s.raiders = (s.raiders || []).filter(a => a.alive).concat(came); R.say(`Machines are heading for ${s.say} · Keep them off the door`, '#ff6a5a'); }
}
/* what happens whether or not a run is on (the intro too): walls sinking, the canopy fading when you're behind it, neon buzzing,
   screens flickering, and the town's windows coming on with its panic */
let buzz = null, buzzT = 0;
function ambient(dt) {
  cuts.update(dt);
  const p = G.intro && G.intro.playing ? G.camera.target : G.player.pos, hide = p.x > 36 && p.x < 49 && p.z > -14.5 && p.z < -1.5;
  for (const m of canopy) if (m) m.visibility += ((hide ? .12 : 1) - m.visibility) * damp(8, dt);
  buzzT -= dt; if (buzzT <= 0) { if (buzz) buzz.level = 1; buzz = Math.random() < .5 ? pick(signs) : null; buzzT = buzz ? rand(.05, .5) : rand(.5, 4); }
  if (buzz) buzz.level = Math.random() < .5 ? .25 : 1;
  crt.emissiveColor.copyFrom(crt.base).scaleInPlace(.7 + .3 * Math.sin(G.t * 9) * Math.sin(G.t * 23.7));
  screens.forEach((s, i) => s.m.emissiveColor.copyFrom(s.base).scaleInPlace(.75 + .25 * Math.sin(G.t * (5 + i * 2.3) + i)));
  /* in the ending the town wakes, and the payphone by the road rings twice */
  if (town && town.outro) { const t0 = town.outroT, t = town.outroT += dt, p = PHONES[4], ringing = t > 12 && t < 18, on = ringing && G.t % .5 < .25;
    for (const at of [12.3, 15.2]) if (t0 < at && t >= at) G.audio.ring(p.pos, 400);
    p.mat.emissiveColor.copyFrom(p.base).scaleInPlace(on ? 1 : ringing ? .2 : .5); }
  const k = town ? (town.awake || town.outro ? 1 : town.panic / 100) : 0;
  wins.forEach((w, i) => w.m.emissiveColor.copyFrom(w.base).scaleInPlace(Math.max(0, Math.min(1, k * 3 - i * .85)) * (.85 + .15 * Math.sin(G.t * 2 + i * 2))));
}
export const SURVIVAL = survival({
  num: '04', name: '1984',
  blurb: 'Where the machines are sent. They come through time gates: collapse one before it finishes charging and nothing steps out. Keep them off the shops, so the town stays asleep, and answer the payphones. It\'s the only way Mara can reach you.',
  preparing: 'Winding back the clock…', ambience: AMBIENCE, look: LOOK, noHorn: true,
  build: buildRegion, start: START,
  saveKey: 'relay-gate-survival-1984-v1',
  noAlly: true,   // the radio doesn't carry across time: Mara is on the far end of a payphone
  onIntro: dt => ambient(dt),
  /* when the Infiltrator goes down: its wreck, the town waking round it, and a payphone. It is what gets found here, and taken to Origin */
  outro(run) { const w = run.big.pos; town.outro = true; town.outroT = 0; rifts.forEach(shut);
    return [
      { at: [w.x, .6, w.z], r: 9, a: -2.3, b: 1, hold: 3.6 },
      { at: [0, 3, 24], r: 54, a: -2.2, b: .78, move: 3.2, hold: 5.2, who: '', say: 'By morning there are men in grey suits in the parking lot, and a van with no markings.' },
      { at: [6, 1.2, -24], r: 12, a: -2.3, b: .95, move: 3, hold: 3, who: '', say: 'A payphone rings.' },
      { at: [6, 1.2, -24], r: 9, a: -2.25, b: 1, move: 1.2, hold: 5.5, say: 'They took it. I know where. I know exactly where.' },
    ]; },
  /* before each run: the payphone by the road, the strip, a time gate's spot, the shops (intro.js) */
  intro: [
    { at: [6, 1.2, -24], r: 13, a: -2.3, b: .95, hold: 4.2, say: 'It\'s me. The radio won\'t carry that far back, so I\'m using what they have. When a phone rings, pick it up.' },
    { at: [-8, 1, 6], r: 44, a: -2.2, b: .78, move: 2.6, hold: 4.2, say: '1984. This is where they send them. Something of theirs gets found here, and everything we\'ve fought is built from it.' },
    { at: [-14, 1, 4], r: 20, a: -2.4, b: .8, move: 2.2, hold: 4, say: 'They come through in a ball of lightning. Get to it while it\'s still charging and nothing steps out.' },
    { at: [30, 2, 16], r: 22, a: -2.15, b: .78, move: 2.6, hold: 4.2, say: 'People live here. Keep the machines off the buildings. If the town wakes up, they\'ll send more.' },
  ],
  /* its own music, and another track for the Infiltrator; no drums for walkers, the music carries on */
  music: () => 'eighties', musicKeys: ['eighties'], bossMusic: 'infiltrator', walkerDrums: false,
  /* the same pressure as the city, but every group comes through a time gate that the map opens */
  tune: { gate: null, groups: false, walkers: [[7, 1], [11, 2], [15, 3]], boss: { big: 'infiltrator' } },
  indoorAt: (x, z) => x > -40 && x < -22 && z > 20 && z < 32,   // the arcade: drones use its doors
  /* a walker or the Infiltrator that a level has earned arrives the way everything does here, in a flash, somewhere away from you */
  arrive(p, kind) {
    /* a walker never in the arcade: there's room for it to stand in there, but both doors are too narrow for it to leave by */
    const nav = kind === 'walker' ? G.nav.wide : G.nav, L = SPOTS.filter(s => kind !== 'walker' || !SURVIVAL.indoorAt(s.x, s.z)).map(s => nav.snap(s.x, s.z, 2)).filter(s => s && dist2(p, s) > 18); if (!L.length) return null;
    const c = pick(L); arrival(c, 1.3); return c;
  },
  /* the first Infiltrator you bring down opens Origin, on the title screen */
  onKill(R, m) { if (m.kind === 'infiltrator' && !G.progress.beatBoss) { G.progress.beatBoss = true; G.save.now(); R.say('Origin is open · Pick it on the title screen', '#1fe0ff'); } },
  /* things to use: a time gate while it's charging (stand in it), and a payphone while it rings */
  interactables(L) {
    if (!town) return;
    for (const r of rifts) if (r.on) L.push({ pos: V(r.at.x, 0, r.at.z), r: 2.3, hold: RIFT.hold, label: `Collapse the time gate ${r.spot.say}`, use: () => collapse(town.eng, town.run, r) });
    const p = town.phone.ringing; if (p) L.push({ pos: p.pos, r: 1.8, label: 'Answer the payphone', use: () => answer(town.eng, p) });
  },
  begin(R, run) {
    now = 0; rifts.forEach(shut);
    town = { eng: R, run, panic: 0, peak: 0, awake: false, hitAt: -99, nextAt: RIFT.first, opened: 0, lastSpot: null, phone: { ringing: null, until: 0, next: RING.first, bellAt: 0, last: null } };
    tally = { shut: 0, calls: 0 };
    for (const s of SHOPS) { s.actor = R.add(new Storefront(s)); s.raiders = []; s.hitAt = -99; }
    for (const p of PHONES) { p.light.intensity = 0; p.mat.emissiveColor.copyFrom(p.base).scaleInPlace(.18); }
    run.gapK = 1; run.sizeAdd = 0; G.marks = [];
  },
  tick(R, run, dt) {
    now = run.time; town.run = run; const P = G.player, ph = town.phone;
    ambient(dt);
    /* time gates: one opens when the next group is due, if there's room for it; each charges, crackling, and then delivers */
    if (now >= town.nextAt && P.down <= 0 && !run.closed) { const r = rifts.find(q => !q.on); if (r && run.room() > 0) { openRift(R, run, r); town.nextAt = now + run.gap(); } else town.nextAt = now + 1; }
    for (const r of rifts) { if (!r.on) continue; r.t -= dt; const k = 1 - Math.max(0, r.t) / r.T0, size = .5 + k * 2.4;
      r.ball.scaling.setAll(size * (1 + Math.sin(G.t * 31) * .05)); r.core.scaling.setAll(.2 + k * .5 + Math.random() * .15); r.ring.scaling.setAll(.9 + Math.sin(G.t * 9) * .04);
      r.arcT -= dt; if (r.arcT <= 0) { r.arcT = .07 - k * .03; strike(r, size); }
      r.light.intensity = .7 + k * 2.2;
      if (Math.random() < dt * (4 + k * 14)) G.FX.spark(V(r.at.x + rand(-1.6, 1.6), rand(.2, 2.6), r.at.z + rand(-1.6, 1.6)), 2);
      G.audio.play('whir', { pos: r.at, gain: .25 + k * .4, rate: 2 + k * 1.2, len: .35, fade: .1, gap: .3, key: 'rift' + r.k, hear: 60 });
      if (r.t <= 0) arrive(R, run, r); }
    /* the town: panic settles once the shops have been left alone a while; full, it stays full */
    if (!town.awake) {
      if (town.panic >= 100) { town.awake = true; run.gapK = PANIC.awakeK; run.sizeAdd = PANIC.awakeAdd; G.audio.play('engage', { gain: .7, rate: .8 });
        R.say('The town is awake · They know they\'ve been seen, and they\'re sending more', '#ff6a5a'); }
      else if (now - town.hitAt > PANIC.calm) town.panic = Math.max(0, town.panic - PANIC.settle * dt);
    }
    town.peak = Math.max(town.peak, town.panic);
    for (const s of SHOPS) { const hit = now - s.hitAt < 1.2, k = hit ? .5 + .5 * Math.sin(G.t * 16) : 0; s.alarm.emissiveColor.copyFrom(s.alarmBase).scaleInPlace(k); s.light.intensity = k * 1.4; s.raiders = s.raiders.filter(a => a.alive); }
    /* payphones: one rings every so often, somewhere you have to go to */
    if (ph.ringing) { const p = ph.ringing, on = G.t % .5 < .25;
      p.mat.emissiveColor.copyFrom(p.base).scaleInPlace(on ? 1 : .2); p.light.intensity = on ? 1.3 : .3;
      if (now >= ph.bellAt) { ph.bellAt = now + RING.bell; G.audio.ring(p.pos); }
      if (now >= ph.until) { hangUp(); R.say('The payphone stopped ringing', '#9aa0a6'); } }
    else if (now >= ph.next) { const far = PHONES.filter(p => p !== ph.last && dist2(P.pos, p) > 14), p = ph.ringing = ph.last = pick(far.length ? far : PHONES);
      ph.until = now + RING.lasts; ph.bellAt = now; R.say(`A payphone is ringing ${p.say} · It can only be Mara`, '#ffb24a'); }
    /* what to head for: the phone, a shop that's being broken into, and the time gates that are nearest to opening */
    G.marks = [];
    if (ph.ringing) G.marks.push({ pos: ph.ringing.pos, h: 2.6, label: `Payphone · ${Math.ceil(ph.until - now)}s`, color: '#ffb24a' });
    const hot = SHOPS.filter(s => s.raiders.length || now - s.hitAt < 2).sort((a, b) => b.hitAt - a.hitAt)[0];
    if (hot && !town.awake) G.marks.push({ pos: V(hot.at.x, 0, hot.at.z), h: 3, label: `${hot.short} · ${now - hot.hitAt < 2 ? 'attacked' : 'break-in'}`, color: '#ff6a5a' });
    for (const r of rifts.filter(q => q.on).sort((a, b) => a.t - b.t)) if (G.marks.length < 3) G.marks.push({ pos: V(r.at.x, 0, r.at.z), h: 3.4, label: `Time gate · ${Math.ceil(r.t)}s`, color: '#9fd0ff' });
  },
  /* the line under the clock: the town, and the gates you've collapsed */
  status() {
    if (!town) return ''; const n = Math.round(town.panic);
    return `${town.awake ? 'The town is awake' : n < 1 ? 'The town is asleep' : `The town is stirring · ${n}%`} · Gates collapsed ${tally.shut}`;
  },
  stats: () => [[tally.shut, tally.shut === 1 ? 'Time gate collapsed' : 'Time gates collapsed'], [tally.calls, tally.calls === 1 ? 'Call answered' : 'Calls answered'], [town.awake ? 'Awake' : Math.round(town.peak) + '%', town.awake ? 'The town' : 'Highest panic']],
});
function hangUp() { const ph = town.phone, p = ph.ringing; if (!p) return; ph.ringing = null; ph.next = now + RING.every; p.light.intensity = 0; p.mat.emissiveColor.copyFrom(p.base).scaleInPlace(.18); }
/* you picked up: hurt, she talks you to a first-aid kit; otherwise to supplies */
function answer(R, p) {
  const P = G.player, hurt = P.hp < P.maxHp * RING.below; hangUp(); tally.calls++;
  R.say(pick(CALLS[hurt ? 'heal' : 'supply']), '#ffb24a'); G.audio.play('powerOn', { pos: p.pos, gain: .3, rate: 1.9, len: .5, fade: .2 });
  if (hurt) { const n = Math.min(P.maxHp - P.hp, Math.round(P.maxHp * RING.heal)); P.hp += n; G.UI.number(P.pos.add(V(0, 2, 0)), '+' + n, 'heal'); }
  else G.drops.scatter(p.x, p.z - 1.2, [{ scrap: RING.scrap }, ...rollLoot('walker')]);
}
