/* Region 05, Origin: the research lab where what was found in 1984 was taken apart, a few years on. White corridors, beige terminals with
   green screens, a raised floor in the mainframe hall, a clean room, and in the central lab the find itself, opened up on a rig under
   lights. Nothing here has been built yet: it is being worked out, on whiteboards and benches, by a young researcher called Mara.
   The walls are generated round the rooms (rooms.js) and the ones on the camera's side sink while you're behind them (cuts.js).
   How it plays: like survival, but it can be won. Six terminals hold the research. Wiping one (stand at it) takes something out of the
   future for good: a kind of machine stops coming, or the first machine loses one of the things it can do. So the lab gets weaker as you
   go, the reverse of everywhere else. It fights back: every wipe wakes the nearest prototypes on their benches and drops the security
   shutters for a while. After a few wipes the find gets up off its rig (firstmachine.js). Wipe every terminal and kill it, and the run is
   won; the score is your time. Mara isn't here either, but she can talk to you: the find is a relay, and it never stopped listening. */
import { B, G, V, C, R as sr, dist2, rand, damp, pick } from './core.js';
import { Geo, gbox, gcyl, gmesh } from './geo.js';
import { makeMat } from './tex.js';
import { makeNav } from './nav.js';
import { makeCuts } from './cuts.js';
import { layRooms } from './rooms.js';
import { cloneMat, Husk } from './machines.js';
import { survival } from './survival.js';

/* The company whose lab this is. A placeholder: it hasn't been named yet, and whatever it ends up as shouldn't be a real firm's name. */
const COMPANY = 'HALVORSEN LABS';

/* Walkable rectangles [x0, z0, x1, z1] on a half-metre grid, and the floor each has; north is +z. The rooms first (where two overlap, the
   one listed first owns the floor), then the doorways between them, each overlapping both sides by a metre. */
const ROOMS = {
  lobby: { r: [-8, -30, 8, -19], zone: 'tile' }, south: { r: [-34, -17, 38, -13], zone: 'tile' }, lab: { r: [-12, -5, 12, 14], zone: 'tile' },
  offices: { r: [-34, -9, -16, 9], zone: 'carpet' }, hall: { r: [16, -9, 38, 12], zone: 'raised' }, clean: { r: [-10, 18, 10, 30], zone: 'clean' },
  linkLobby: { r: [-2, -20, 2, -16], zone: 'tile' }, linkLab: { r: [-2, -14, 2, -4], zone: 'tile' }, linkOff: { r: [-27, -14, -23, -8], zone: 'tile' },
  linkHall: { r: [25, -14, 29, -8], zone: 'tile' }, offLab: { r: [-17, -1, -11, 3], zone: 'tile' }, labHall: { r: [11, 1, 17, 5], zone: 'tile' }, labClean: { r: [-2, 13, 2, 19], zone: 'tile' },
};
const START = { x: 0, z: -25 }, RIG = { x: 0, z: 5.5 };
const CELL = .5, THICK = 2, WALL_H = 3.8;
const ob = (x, z, hw, hd, h) => { const o = { x, z, hw, hd, h }; G.obstacles.push(o); return o; };

/* The terminals: what each holds, where it stands (against a north wall, its screen facing you), what wiping it takes out of the future,
   and what Mara has to say about it. `ban`: a kind of machine that stops coming; `can`: something the first machine can no longer do. */
const TERMINALS = [
  { id: 'flight', name: 'flight control', x: -30, z: 8.55, ban: 'drone', can: 'launch', gone: 'Drones stop coming', mara: 'Mara: "Flight control. I was proud of that one."' },
  { id: 'frame', name: 'frame assembly', x: -21, z: 8.55, ban: 'husk', can: 'lunge', gone: 'Husks stop coming', mara: 'Mara: "I drew that frame on a napkin in the canteen. Burn it."' },
  { id: 'chassis', name: 'heavy chassis', x: 22, z: 11.55, ban: 'walker', can: 'stomp', gone: 'Hunter Walkers stop coming', mara: 'Mara: "The walker was my idea. Nobody even asked me for it."' },
  { id: 'ordnance', name: 'ordnance', x: 33, z: 11.55, can: 'missiles', gone: 'There will never be missiles', mara: 'Mara: "They told me the missiles were for defence. I believed them."' },
  { id: 'repair', name: 'repair routines', x: 6, z: 29.55, ban: 'mender', can: 'regen', gone: 'Menders stop coming, and nothing mends itself', mara: 'Mara: "I taught them to fix each other so I could go home on time."' },
  { id: 'core', name: 'core logic', x: -8, z: 13.55, can: 'whole', tough: .65, gone: 'Everything that comes is weaker', mara: 'Mara: "That one is how they think. It\'s how I thought. Wipe it."' },
];
/* Seconds at a terminal to wipe it; how many wipes before the find gets up, and the warning it gives; how many prototypes each wipe
   wakes; how many shutters come down, and for how long. */
const LAB = { wipe: 6, wakeAt: 3, wakeWarn: 5, stir: 2, shutters: 2, lockdown: 18 };
/* security shutters, in four of the doorways: where, how wide, and which way you walk through ('x' or 'z') */
const SHUTTERS = [{ x: -14, z: 1, w: 4, axis: 'x' }, { x: 14, z: 3, w: 4, axis: 'x' }, { x: 0, z: -9, w: 4, axis: 'z' }, { x: 0, z: 16, w: 4, axis: 'z' }];
/* where machines arrive: in a flash, as in 1984 (the future sending what it still can, to guard where it began) */
const ENTRIES = [[-6, -28], [6, -28], [-32, -15], [36, -15], [-32, 6], [-32, -7], [36, 10], [36, -7], [18, 10], [-8, 28], [8, 27], [-10, 12], [5, -3.5]].map(([x, z]) => ({ x, z }));
/* where the prototypes lie: beside their benches in the clean room, and here and there in the lab and the hall; which way each faces */
const PROTOS = [[-7, 24.6, Math.PI], [-2.5, 24.6, Math.PI], [2.5, 24.6, Math.PI], [7, 21, 0], [-7, 21, 0], [-10, 2, Math.PI / 2], [10, 11, -Math.PI / 2], [36, 2, -Math.PI / 2], [-33, 0, Math.PI / 2]];
/* first-aid cabinets, on north and east walls: each gives back `heal` of your health, and refills after `every` seconds */
const MEDS = [{ x: 6, z: -19, nx: 0, nz: -1 }, { x: 12, z: 9, nx: -1, nz: 0 }, { x: 38, z: 2, nx: -1, nz: 0 }, { x: -16, z: -6, nx: -1, nz: 0 }];
const MED = { heal: .45, every: 75 };
/* the dictaphones she left about, and what's on each */
const TAPES = [
  { x: -18.6, z: -6.6, say: 'A dictaphone, "M." on the label: "Day 40. The actuators are years past anything we make. I can copy them. I think I can copy all of it."' },
  { x: 9.6, z: -2.6, say: 'Her voice, younger: "It isn\'t a prototype. Things this finished have a factory behind them. So where is the factory?"' },
  { x: -5, z: 22.6, say: 'Her voice again: "The first frame stood up today. They want a dozen by spring. I said it has no off switch. Nobody wrote that down."' },
];

/* ---------- the map ---------- */
const cuts = makeCuts();
let prop = null, rigLight = null, shutters = [], now = 0;
/* a flat panel with something drawn on it (a sign, a whiteboard, a badge), w by h metres, facing south; dim: how far under full brightness it sits */
function panel(name, w, h, px, draw, glow = .25) {
  const S = G.scene, t = new B.DynamicTexture(name, { width: px, height: Math.round(px * h / w) }, S, true), c = t.getContext(); draw(c, px, Math.round(px * h / w)); t.update();
  const m = new B.StandardMaterial(name + 'M', S); m.diffuseTexture = t; m.emissiveTexture = t; t.level = 1 - glow; m.diffuseColor = new B.Color3(0, 0, 0); m.specularColor = new B.Color3(0, 0, 0); m.disableLighting = true;   // lit by itself, a little under full, so it sits in the room without going grey in a shadow
  const p = B.MeshBuilder.CreatePlane(name, { width: w, height: h }, S); p.material = m; p.isPickable = false; return p;
}
/* marker-pen sketches of things that don't exist yet: what goes on the whiteboards */
const SKETCH = {
  husk(c) { c.beginPath(); c.arc(60, 46, 12, 0, 6.283); c.moveTo(60, 58); c.lineTo(48, 110); c.moveTo(56, 70); c.lineTo(20, 104); c.lineTo(10, 130); c.moveTo(58, 72); c.lineTo(92, 100); c.lineTo(104, 128); c.moveTo(48, 110); c.lineTo(34, 150); c.lineTo(40, 186); c.moveTo(48, 110); c.lineTo(66, 148); c.lineTo(58, 186); c.stroke();
    for (const [x, y] of [[10, 130], [104, 128]]) for (const d of [-6, 0, 6]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + d, y + 16); c.stroke(); } },
  drone(c) { c.beginPath(); c.ellipse(70, 60, 30, 14, 0, 0, 6.283); c.moveTo(20, 50); c.lineTo(50, 54); c.moveTo(90, 54); c.lineTo(120, 50); c.moveTo(6, 46); c.lineTo(36, 46); c.moveTo(104, 46); c.lineTo(134, 46); c.moveTo(70, 74); c.lineTo(70, 92); c.stroke(); },
  walker(c) { c.strokeRect(50, 40, 110, 46); c.strokeRect(160, 52, 30, 22); c.beginPath(); for (const x of [62, 92, 122, 150]) { c.moveTo(x, 86); c.lineTo(x - 12, 130); c.lineTo(x - 2, 176); c.lineTo(x + 14, 176); } c.moveTo(60, 40); c.lineTo(48, 20); c.moveTo(190, 62); c.lineTo(214, 60); c.stroke(); },
  crucible(c) { c.strokeRect(30, 110, 190, 34); c.beginPath(); for (let x = 46; x < 220; x += 28) c.arc(x, 127, 10, 0, 6.283); c.stroke(); c.strokeRect(50, 66, 150, 44); c.strokeRect(120, 40, 60, 26); c.beginPath(); c.moveTo(180, 52); c.lineTo(236, 46); c.moveTo(66, 66); c.lineTo(66, 24); c.lineTo(84, 24); c.lineTo(84, 66); c.stroke(); },
};
function whiteboard(name, parts, notes) {
  return panel(name, 4.2, 2.1, 512, (c, W, H) => { c.fillStyle = '#eef0ee'; c.fillRect(0, 0, W, H); c.strokeStyle = '#8a8f96'; c.lineWidth = 8; c.strokeRect(0, 0, W, H); c.lineWidth = 2.2; c.lineCap = 'round';
    parts.forEach(([what, x, y, col], i) => { c.save(); c.translate(x, y); c.strokeStyle = col; SKETCH[what](c); c.restore(); });
    c.font = 'italic 17px "Segoe Script", "Bradley Hand", "Comic Sans MS", cursive'; notes.forEach(([text, x, y, col]) => { c.fillStyle = col; c.save(); c.translate(x, y); c.rotate(-.04); c.fillText(text, 0, 0); c.restore(); }); }, .3);
}

export function buildRegion(M) {
  const S = G.scene;
  G.open = Object.values(ROOMS).map(o => o.r); G.flames = [];
  G.decalHints = { scorch: [], oil: [], puddles: [], puddleN: 0, noDebris: true, clean: true, paint: [
    [-10.5, 1.5, 10.5, 1.5, .1, '214,176,60', .5], [-10.5, 9.5, 10.5, 9.5, .1, '214,176,60', .5], [-3.6, 1.5, -3.6, 9.5, .1, '214,176,60', .5], [3.6, 1.5, 3.6, 9.5, .1, '214,176,60', .5],   // the box round the rig
    [-33, -15, 37, -15, .08, '47,95,158', .35] ] };                                                                                                                                           // the corridor's guide line
  const mat = (n, h, o) => makeMat(S, n, h, o), conc = { tex: M.conc.diffuseTexture, bump: M.conc.bumpTexture }, lit = (n, hex) => mat(n, '#000000', { unlit: true, emissive: hex });
  const MAT = {
    wall: mat('oWall', '#d6d4cd', conc), trim: mat('oTrim', '#b6b0a2', { tex: M.crate.albedoTexture, spec: .1 }), blue: mat('oBlue', '#2f5f9e'),
    tile: mat('oTile', '#b9bbc0', { tex: M.pave.diffuseTexture, bump: M.pave.bumpTexture, spec: .25, power: 48 }), carpet: mat('oCarpet', '#7c8674', { tex: M.trunk.diffuseTexture }),
    raised: mat('oRaised', '#9a9da4', { tex: M.crate.albedoTexture, bump: M.crate.bumpTexture, spec: .2 }), clean: mat('oClean', '#c6d0d6', { tex: M.pave.diffuseTexture, spec: .35, power: 64 }),
    beige: mat('oBeige', '#d2c5a4', { spec: .12 }), dark: mat('oDark', '#2b2c30', { tex: M.crate.albedoTexture, spec: .15 }), hazard: mat('oHazard', '#c9a13a'), steel: mat('oSteel', '#aeb4bc', { metal: .8, rough: .35, env: 1.4 }),
    strip: lit('oStrip', '#f4f8ff'), green: lit('oGreen', '#39ff7a'), amber: lit('oAmber', '#ffb040'), red: lit('oRed', '#ff3a30'), led: lit('oLed', '#58f0c8'),
  };
  const UNLIT = ['strip', 'green', 'amber', 'red', 'led'], g = {}; for (const k in MAT) g[k] = Geo();
  /* black under everything, so a sunk wall is simply gone */
  const under = B.MeshBuilder.CreateGround('underfloor', { width: 300, height: 300 }, S); under.position.set(0, -.08, 0); under.material = mat('oUnder', '#08090a', { unlit: true }); under.isPickable = false; under.freezeWorldMatrix();

  /* ---------- walls and floors: white walls with a beige skirting, a blue line at hand height and a strip of light near the top ---------- */
  layRooms(Object.values(ROOMS), CELL, THICK, (zone, sinks, x0, z0, x1, z1, faces) => {
    const gg = sinks ? { wall: Geo(), trim: Geo(), blue: Geo(), strip: Geo() } : g, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    gbox(gg.wall, { x: cx, y: WALL_H / 2, z: cz, w: x1 - x0, h: WALL_H, d: z1 - z0, tint: sr(.95, 1), uv: .2, noBottom: true }); gbox(gg.trim, { x: cx, y: WALL_H + .02, z: cz, w: x1 - x0 + .02, h: .04, d: z1 - z0 + .02, ao: false, noBottom: true });
    for (const [fx0, fz0, fx1, fz1, nx, nz] of faces) { const along = nz !== 0, len = along ? fx1 - fx0 : fz1 - fz0, mx = (fx0 + fx1) / 2, mz = (fz0 + fz1) / 2;
      const slab = (g2, y, h, t) => gbox(g2, { x: mx + nx * t / 2, y, z: mz + nz * t / 2, w: along ? len : t, h, d: along ? t : len, ao: false });
      slab(gg.trim, .12, .24, .05); slab(gg.blue, 1.15, .07, .03); slab(gg.strip, 3.2, .09, .05); }
    ob(cx, cz, (x1 - x0) / 2, (z1 - z0) / 2, WALL_H);
    if (!sinks) return;
    const node = new B.TransformNode('wallCut', S); for (const k in gg) gmesh('wallCut_' + k, gg[k], MAT[k], { parent: node, shadow: k !== 'strip' }); cuts.add(node, x0, z0, x1, z1, WALL_H);
  }, (zone, x, z, w, d) => gbox(g[zone], { x, y: -.05, z, w, h: .1, d, uv: zone === 'raised' ? .5 : zone === 'carpet' ? .5 : 1 / 3, ao: false, noBottom: true }));
  /* ceiling lights, as lamps for whatever is under them */
  for (const [x, z] of [[0, -25], [-20, -15], [18, -15], [-25, 0], [0, 5], [27, 2], [0, 24], [-8, 9], [8, 0]]) G.lightSources.push({ pos: V(x, 3.4, z), color: C('#f2f6ff'), range: 15, intensity: 1 });

  /* ---------- furniture ---------- */
  const desk = (x, z, w = 1.8, d = .9) => { gbox(g.beige, { x, y: .74, z, w, h: .06, d, ao: false }); for (const s of [-1, 1]) gbox(g.trim, { x: x + s * (w / 2 - .06), y: .37, z, w: .06, h: .74, d: d - .1 }); gbox(g.trim, { x, y: .45, z: z + d / 2 - .04, w: w - .1, h: .5, d: .04, ao: false }); ob(x, z, w / 2, d / 2, .8); };
  /* a terminal on a desk: a beige box with a green screen, facing south, and its keyboard */
  const crt = (x, z, y = .77, screen = g.green) => { gbox(g.beige, { x, y: y + .24, z, w: .5, h: .44, d: .46 }); gbox(g.dark, { x, y: y + .26, z: z - .235, w: .4, h: .3, d: .02, ao: false }); gbox(screen, { x, y: y + .26, z: z - .25, w: .34, h: .24, d: .01, ao: false }); gbox(g.beige, { x, y: y + .02, z: z - .5, w: .46, h: .04, d: .18, ao: false }); };
  const plant = (x, z) => { gcyl(g.trim, { r0: .22, r1: .28, h: .5, seg: 8, x, y: .25, z }); gcyl(mat0('oLeaf', '#3f6a44'), { r0: .5, r1: .05, h: 1.1, seg: 6, x, y: 1.05, z, ao: false }); ob(x, z, .28, .28, 1.4); };
  const extra = {}, mat0 = (n, hex) => { if (!extra[n]) extra[n] = { m: mat(n, hex), g: Geo() }; return extra[n].g; };
  const cabinet = (x, z, reels) => { gbox(g.beige, { x, y: 1.05, z, w: .9, h: 2.1, d: .8, uv: .4, tint: sr(.92, 1.05), noBottom: true }); gbox(g.dark, { x, y: 1.35, z: z - .405, w: .74, h: 1.2, d: .02, ao: false });
    if (reels) for (const y of [1.65, 1.1]) gcyl(g.steel, { r0: .2, h: .04, seg: 12, x, y, z: z - .43, rx: Math.PI / 2, ao: false });
    else for (let y = .9; y < 1.9; y += .2) if (sr(0, 1) < .6) gbox(sr(0, 1) < .8 ? g.led : g.amber, { x: x + sr(-.25, .25), y, z: z - .42, w: .1, h: .05, d: .02, ao: false }); };

  /* the lobby: a reception desk with a telephone on it, the company's name on the wall, plants */
  desk(0, -22, 4.4, 1.1); gbox(g.dark, { x: 1.4, y: .82, z: -22.1, w: .3, h: .1, d: .24, ao: false }); gbox(g.dark, { x: 1.4, y: .9, z: -22.1, w: .34, h: .05, d: .09, ao: false });
  plant(-7.2, -19.9); plant(7.2, -29.2); plant(-7.2, -29.2);
  { const p = panel('logo', 5.4, 1, 512, (c, W, H) => { c.fillStyle = '#e9e7e1'; c.fillRect(0, 0, W, H); c.fillStyle = '#2f5f9e'; c.fillRect(14, H / 2 - 22, 44, 44); c.fillStyle = '#e9e7e1'; c.fillRect(26, H / 2 - 10, 20, 20);
      c.fillStyle = '#23344e'; c.textBaseline = 'middle'; c.font = '700 44px Georgia, "Times New Roman", serif'; c.fillText(COMPANY, 76, H / 2 + 2); }, .1); p.position.set(-5, 2.5, -19.04); }
  /* the corridor: benches, and her badge, pinned up by the offices' door */
  for (const x of [-12, 12, 33]) { gbox(g.trim, { x, y: .25, z: -13.5, w: 2, h: .5, d: .6 }); ob(x, -13.5, 1, .3, .5); } plant(-33, -13.6); plant(37, -13.6);
  { const p = panel('badge', .7, .95, 256, (c, W, H) => { c.fillStyle = '#f2efe6'; c.fillRect(0, 0, W, H); c.fillStyle = '#2f5f9e'; c.fillRect(0, 0, W, 54); c.fillStyle = '#f2efe6'; c.font = '700 22px Georgia, serif'; c.fillText(COMPANY, 12, 36);
      c.fillStyle = '#9aa7b4'; c.fillRect(22, 74, 110, 136); c.fillStyle = '#5a646e'; c.beginPath(); c.arc(77, 122, 26, 0, 6.283); c.fill(); c.fillRect(42, 152, 70, 58);            // the photograph: nobody you'd know yet
      c.fillStyle = '#23344e'; c.font = '700 34px Georgia, serif'; c.fillText('MARA', 22, 258); c.font = '18px Georgia, serif'; c.fillText('Research · Level 4', 22, 290); c.fillText('Reverse engineering', 22, 316); }, .25); p.position.set(-21.6, 1.6, -13.04); }
  /* the offices: two rows of desks with terminals on them; hers is the one with the lamp; whiteboards on the far wall */
  for (const z of [3, -2]) for (const x of [-30.5, -26, -21.5]) { desk(x, z); crt(x - .3, z + .1); }
  desk(-19, -6.4, 2, 1); crt(-19.5, -6.3); gcyl(g.dark, { r0: .04, h: .5, seg: 6, x: -18.4, y: 1.02, z: -6.2, ao: false }); gbox(g.amber, { x: -18.4, y: 1.28, z: -6.3, w: .26, h: .06, d: .2, ao: false }); G.lightSources.push({ pos: V(-18.6, 1.6, -6.8), color: C('#ffc070'), range: 7, intensity: 1.1 });
  { const b = whiteboard('boardA', [['husk', 30, 14, '#1d3f8a'], ['drone', 190, 20, '#1d3f8a'], ['husk', 360, 14, '#a02a22']], [['frame v3: lighter', 150, 150, '#1d3f8a'], ['no off switch?', 356, 226, '#a02a22'], ['flies without a pilot', 172, 122, '#22262c'], ['M.', 470, 240, '#1d3f8a']]); b.position.set(-25.5, 2, 8.96); }
  /* the central lab: the rig, with the find on it under lights, benches along the walls, and a whiteboard of what it will become */
  { gbox(g.steel, { x: RIG.x, y: .85, z: RIG.z, w: 3.6, h: .1, d: 2, ao: false }); for (const sx of [-1, 1]) for (const sz of [-1, 1]) gcyl(g.steel, { r0: .07, h: .85, seg: 6, x: RIG.x + sx * 1.6, y: .42, z: RIG.z + sz * .8, ao: false }); ob(RIG.x, RIG.z, 1.8, 1, .95);
    for (const sx of [-1, 1]) gcyl(g.steel, { r0: .06, h: 3.3, seg: 6, x: RIG.x + sx * 2.1, y: 1.65, z: RIG.z + 1.2, ao: false }); gbox(g.steel, { x: RIG.x, y: 3.25, z: RIG.z + .6, w: 4.4, h: .1, d: 1.4, ao: false }); gbox(g.strip, { x: RIG.x, y: 3.18, z: RIG.z + .4, w: 3.6, h: .05, d: .7, ao: false });
    rigLight = { pos: V(RIG.x, 2.8, RIG.z), color: C('#fff6e0'), range: 12, intensity: 1.5 }; G.lightSources.push(rigLight);
    /* the find, as they left it: on its back with its plating off, arms folded, its core showing. It's a prop until it gets up */
    const n = prop = new B.TransformNode('theFind', S), a = Geo(), d = Geo(), h = Geo();
    gbox(a, { x: -.2, y: 1.2, z: 0, w: 2.1, h: .5, d: 1.1, ao: false, uv: .6 }); gbox(d, { x: .1, y: 1.42, z: 0, w: 1.4, h: .1, d: .9, ao: false }); gbox(a, { x: 1.35, y: 1.22, z: 0, w: .6, h: .4, d: .6, ao: false }); gcyl(h, { r0: .22, h: .3, seg: 10, x: -.1, y: 1.5, z: 0, ao: false });
    for (const sz of [-1, 1]) { gbox(d, { x: -.9, y: 1.1, z: sz * .75, w: .9, h: .2, d: .24, rz: .15, ao: false }); gbox(d, { x: .5, y: 1.1, z: sz * .7, w: 1, h: .14, d: .14, ao: false }); }
    gmesh('findA', a, M.mech, { parent: n }); gmesh('findD', d, M.mechDark, { parent: n }); gmesh('findH', h, MAT.amber, { parent: n, shadow: false }); n.position.set(RIG.x, -.2, RIG.z);
    for (const [x, z] of [[-10.8, 7], [-10.8, 10.5]]) { gbox(g.steel, { x, y: .86, z, w: 1.4, h: .08, d: 2.6, ao: false }); gbox(g.trim, { x, y: .42, z, w: 1.2, h: .84, d: 2.4 }); ob(x, z, .7, 1.3, .9); gbox(g.dark, { x, y: 1.05, z: z + .4, w: .5, h: .3, d: .5 }); gbox(g.green, { x: x + .26, y: 1.06, z: z + .4, w: .01, h: .2, d: .34, ao: false }); }
    desk(9.4, -2.6, 2.4, 1); crt(9, -2.5);
    const b = whiteboard('boardB', [['walker', 20, 30, '#1d3f8a'], ['crucible', 252, 40, '#a02a22']], [['walks on four', 60, 232, '#1d3f8a'], ['a forge that moves?? ask about budget', 244, 226, '#22262c'], ['all from ONE unit', 300, 30, '#a02a22']]); b.position.set(6, 2, 13.96); }
  /* the mainframe hall: cabinets in two rows, tape drives along the back wall, cable runs under the raised floor showing at its edge */
  for (const z of [7, -3.5]) { for (let x = 19; x < 31; x += .95) cabinet(x, z, false); ob(24.7, z, 6.2, .42, 2.1); }
  for (let x = 25; x < 31; x += .95) cabinet(x, 11.5, true); ob(27.6, 11.5, 3.1, .42, 2.1);
  for (const z of [-8.6, -8.3]) gcyl(g.dark, { r0: .07, h: 20, seg: 6, x: 27, y: .08, z, rz: Math.PI / 2, ao: false }); gcyl(g.amber, { r0: .05, h: 20, seg: 6, x: 27, y: .06, z: -8.05, rz: Math.PI / 2, ao: false, tint: .5 });
  /* the clean room: steel benches with half-built frames on them */
  for (const x of [-7, -2.5, 2.5]) { gbox(g.steel, { x, y: .86, z: 26.2, w: 3, h: .08, d: 1.4, ao: false }); gbox(g.trim, { x, y: .42, z: 26.2, w: 2.8, h: .84, d: 1.2 }); ob(x, 26.2, 1.5, .7, .9);
    gcyl(g.dark, { r0: .15, r1: .12, h: .6, seg: 6, x: x - .5, y: 1.05, z: 26.2, rz: Math.PI / 2, ao: false }); gbox(g.dark, { x: x + .1, y: 1, z: 26.2, w: .2, h: .16, d: .22, ao: false }); for (const s of [-1, 1]) gcyl(g.dark, { r0: .035, h: .7, seg: 4, x: x + .5, y: .95, z: 26.2 + s * .2, rz: Math.PI / 2, ao: false }); }
  gbox(g.steel, { x: -5, y: .86, z: 22.4, w: 2.4, h: .08, d: 1, ao: false }); gbox(g.trim, { x: -5, y: .42, z: 22.4, w: 2.2, h: .84, d: .8 }); ob(-5, 22.4, 1.2, .5, .9);
  /* the dictaphones: a small recorder wherever one was left, with a light on it */
  for (const t of TAPES) { gbox(g.dark, { x: t.x, y: .92, z: t.z, w: .26, h: .08, d: .16, ao: false }); gbox(g.amber, { x: t.x + .08, y: .97, z: t.z, w: .05, h: .02, d: .05, ao: false }); t.pos = V(t.x, 0, t.z - 1.1); }

  /* ---------- the terminals that hold the research: a console against the wall, its screen green until it's wiped ---------- */
  for (const t of TERMINALS) { t.mat = lit('term_' + t.id, '#39ff7a'); t.pos = V(t.x, 0, t.z - 1.3);
    gbox(g.beige, { x: t.x, y: .5, z: t.z, w: 1.5, h: 1, d: .8, uv: .5 }); gbox(g.beige, { x: t.x, y: 1.42, z: t.z + .1, w: 1.1, h: .84, d: .6 }); gbox(g.dark, { x: t.x, y: 1.44, z: t.z - .205, w: .9, h: .64, d: .02, ao: false });
    gbox(g.beige, { x: t.x, y: 1.03, z: t.z - .22, w: .9, h: .05, d: .3, rx: .12, ao: false }); gbox(g.blue, { x: t.x, y: .86, z: t.z - .405, w: 1.3, h: .08, d: .02, ao: false }); ob(t.x, t.z, .75, .4, 1.85);
    const s = Geo(); gbox(s, { x: t.x, y: 1.44, z: t.z - .22, w: .8, h: .54, d: .01, ao: false }); gmesh('termScreen_' + t.id, s, t.mat, { shadow: false, freeze: true });
    t.light = { pos: V(t.x, 1.6, t.z - 1), color: C('#39ff7a'), range: 6, intensity: .8 }; G.lightSources.push(t.light); }
  /* ---------- first-aid cabinets ---------- */
  for (const m of MEDS) { const along = m.nz !== 0; m.mat = lit('med_' + MEDS.indexOf(m), '#5aff70'); m.pos = V(m.x + m.nx * 1.1, 0, m.z + m.nz * 1.1);
    gbox(g.wall, { x: m.x + m.nx * .12, y: 1.5, z: m.z + m.nz * .12, w: along ? .7 : .24, h: .8, d: along ? .24 : .7, ao: false }); gbox(g.red, { x: m.x + m.nx * .25, y: 1.5, z: m.z + m.nz * .25, w: along ? .34 : .02, h: .1, d: along ? .02 : .34, ao: false }); gbox(g.red, { x: m.x + m.nx * .25, y: 1.5, z: m.z + m.nz * .25, w: along ? .1 : .02, h: .34, d: along ? .02 : .1, ao: false });
    const s = Geo(); gbox(s, { x: m.x + m.nx * .25, y: 1.98, z: m.z + m.nz * .25, w: along ? .5 : .02, h: .06, d: along ? .02 : .5, ao: false }); gmesh('medLamp', s, m.mat, { shadow: false, freeze: true }); }
  /* ---------- security shutters: a slab that drops into a doorway. Each sinks like a wall when it's between you and the camera ---------- */
  shutters = SHUTTERS.map((s, i) => { const node = new B.TransformNode('shutter' + i, S), x = s.axis === 'x', hw = x ? .25 : s.w / 2 + .1, hd = x ? s.w / 2 + .1 : .25, sg = Geo(), sr2 = Geo();
    gbox(sg, { x: 0, y: (WALL_H - .3) / 2, z: 0, w: hw * 2, h: WALL_H - .3, d: hd * 2, uv: .5, ao: false }); for (const y of [.5, 1.9]) gbox(sr2, { x: 0, y, z: 0, w: hw * 2 + .04, h: .12, d: hd * 2 + .04, ao: false });
    const slab = new B.TransformNode('shutterSlab' + i, S); slab.parent = node; gmesh('shutter' + i, sg, MAT.dark, { parent: slab }); gmesh('shutterStripe' + i, sr2, MAT.hazard, { parent: slab, shadow: false });
    node.position.set(s.x, 0, s.z); cuts.add(node, s.x - hw, s.z - hd, s.x + hw, s.z + hd, WALL_H); slab.scaling.y = .001;
    return { s, slab, ob: { x: s.x, z: s.z, hw, hd, h: WALL_H }, down: false, k: 0, until: 0 }; });

  for (const k in g) gmesh('o_' + k, g[k], MAT[k], { freeze: true, shadow: !UNLIT.includes(k) && !['tile', 'carpet', 'raised', 'clean'].includes(k) });
  for (const n in extra) gmesh('o_' + n, extra[n].g, extra[n].m, { freeze: true });
  /* no relay gate here either: what the engine expects of one is stood in for */
  return { gate: { discA: new B.TransformNode('noGateA', S), discB: new B.TransformNode('noGateB', S), source: { intensity: 0 } } };
}
/* a shutter comes down or goes up: the doorway shuts or opens, and the walkable grid is baked again */
function setShutter(sh, down) {
  if (sh.down === down) return; sh.down = down;
  const i = G.obstacles.indexOf(sh.ob); if (down && i < 0) G.obstacles.push(sh.ob); else if (!down && i >= 0) G.obstacles.splice(i, 1);
  if (G.nav) G.nav = makeNav();
  G.audio.play('powerOn', { pos: sh.s, gain: .4, rate: down ? .8 : 1.3, len: 1, fade: .3 });
}

/* ---------- how Origin looks and sounds: bright, flat and clean, the opposite of everywhere else ---------- */
const LOOK = {
  sky: '#08090a', fog: '#0d0e10', fogD: .006, hemiSky: '#eef1f6', hemiGround: '#84878e', hemiI: .9,
  sun: '#fbfaf4', sunI: .6, sunDir: [-.3, -1, .25], exposure: 1.15, contrast: 1.2, sat: -6, bloomW: .45, bloomT: .7, glowI: .8,
  weatherK: .04,   // barely a mote of dust
  bright: true,
  env: { zenith: [150, 154, 160], horizon: [210, 212, 214], ground: [90, 92, 96], sun: .15, gate: 0 },
};
const AMBIENCE = [{ name: 'ambStation', url: 'sfx/ambience-station.mp3', from: 0, to: 101, gain: .6 }];   // the station's unease, quieter: the same people will build that too

/* ---------- Origin as an arena ---------- */
let lab = null;
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const scaled = (hp, min) => Math.round(hp * (1 + .08 * min));
const flashAt = c => { G.FX.flash(V(c.x, 1.4, c.z), '#bfe0ff', 3, .12); G.FX.spark(V(c.x, 1.4, c.z), 30); G.audio.play('boomSmall', { pos: c, gain: .5, rate: 1.1, hear: 60 }); };
/* what the wiped terminals have taken from the first machine */
function strip(boss) { for (const t of TERMINALS) if (t.wiped && t.can) boss.can[t.can] = false; }
/* a terminal is wiped: its part of the future is gone, and the lab answers */
function wipe(R, run, t) {
  t.wiped = true; lab.wiped++; t.mat.emissiveColor = C('#ff3a30').scale(.5); t.light.intensity = 0;
  if (t.ban) run.ban[t.ban] = true; if (t.tough) run.toughK = t.tough; if (lab.boss) strip(lab.boss);
  G.audio.play('powerOff', { pos: t.pos, gain: .8, rate: 1.2, len: 1.6, fade: .4 }); G.FX.spark(V(t.x, 1.4, t.z - .3), 30); run.hudAt = 0;
  R.say(`${t.name[0].toUpperCase() + t.name.slice(1)} wiped · ${t.gone}`, '#1fe0ff'); R.say(t.mara, '#ffb24a');
  /* the nearest prototypes get up off their benches, and the shutters come down */
  const P = G.player.pos; lab.protos.filter(h => h.alive && h.state === 'slumped').sort((a, b) => dist2(a.pos, P) - dist2(b.pos, P)).slice(0, LAB.stir).forEach(h => h.wake());
  const L = shutters.filter(s => !s.down); for (let k = 0; k < LAB.shutters && L.length; k++) { const s = L.splice(Math.floor(Math.random() * L.length), 1)[0]; setShutter(s, true); s.until = now + LAB.lockdown; }
  if (lab.wiped < TERMINALS.length) R.say(`Security lockdown · The shutters are down for ${LAB.lockdown} seconds`, '#ff6a5a');
  if (lab.wiped === LAB.wakeAt) { lab.wakeAt = now + LAB.wakeWarn; R.say('Something on the rig is moving', '#ff6a5a'); G.audio.play('engage', { pos: RIG, gain: .9, rate: .7, hear: 120 }); }
}
/* the ending: the camera leaves you; she says what she can; a telephone rings in the lobby */
const OUTRO = [
  { at: [RIG.x, 1, RIG.z - 2], r: 13, a: -2.3, b: .8, hold: 6, say: 'That was all of it. I can feel it going. The city, the gate. I don\'t think I\'m going to remem—' },
  { at: [0, 2, 2], r: 46, a: -2.2, b: .6, move: 3, hold: 3.5, who: '', say: 'The radio goes quiet.' },
  { at: [1.4, 1, -22], r: 10, a: -2.2, b: .9, move: 3.2, hold: 4.5, who: '', say: 'Then, in the lobby, a telephone rings.' },
  { at: [1.4, 1, -22], r: 7, a: -2.1, b: .95, move: 1.5, hold: 6.5, who: 'A voice you almost know', say: '"Hello? … No. Nobody by that name works here. I only started on Monday."' },
  { at: [0, 6, 0], r: 60, a: -2.25, b: .35, move: 4, hold: 5.5, who: '', say: 'She never takes it apart. In the city the sky is clear, and the gate is dark.' },
];
function ending(run) {
  lab.over = true; G.setPaused(true); G.audio.music(null); G.marks = [];
  for (const ms of [12600, 15600]) setTimeout(() => { if (G.intro.playing) G.audio.ring(V(1.4, 0, -22), 400); }, ms);
  G.intro.play(OUTRO, () => run.win({ name: `You erased it in ${clock(run.time)}`,
    text: 'The research is gone and the first machine with it. Nothing you fought to get here was ever built. Nobody called Mara ever talked you through it.' }), { watch: !G.progress.fastest, music: false });
}
export const SURVIVAL = survival({
  num: '05', name: 'Origin',
  blurb: 'Where it started: the lab that took the first machine apart. Wipe all six terminals, and every one takes something out of the future. Then kill what\'s on the rig. This run can be won.',
  preparing: 'Finding where it began…', indoor: true, noHorn: true, ambience: AMBIENCE, look: LOOK,
  build: buildRegion, start: START,
  saveKey: 'relay-gate-survival-origin-v1',
  noAlly: true, winnable: true,
  lost: 'The research is still there. Every run starts again from the starter rifle at level 1.',
  onIntro: dt => cuts.update(dt),
  /* before each run: the lobby, the find, her desk, a terminal, the rig again (intro.js). This is where it comes out */
  intro: [
    { at: [-2, 2, -21], r: 16, a: -2.1, b: .85, hold: 4.4, say: 'I can reach you here. What they found is a relay, and it never stopped listening. I know this building.' },
    { at: [RIG.x, 1.2, RIG.z], r: 17, a: -2.3, b: .8, move: 2.6, hold: 4.4, say: 'That\'s it, on the rig. What came through in 1984. A few years on a table and everything else was copied from it.' },
    { at: [-21, 1, -4], r: 15, a: -2.35, b: .85, move: 2.6, hold: 4.6, say: 'That\'s my desk. That\'s my handwriting on the board. I was the one who took it apart.' },
    { at: [-25.5, 1.4, 7], r: 13, a: -2.0, b: .95, move: 2, hold: 4.6, say: 'Six terminals hold what I worked out. Wipe every one. Each thing you erase is a thing they never learn to build.' },
    { at: [RIG.x, 1.2, RIG.z], r: 12, a: -2.5, b: .9, move: 2.6, hold: 4.2, say: 'It will get up when it understands what you\'re doing. Kill it. Then there\'s nothing left of me to find.' },
  ],
  music: () => 'blackout', musicKeys: ['blackout'],
  /* a small place: fewer machines at once, walkers early (while there still are walkers), menders, and a boss the lab brings in itself */
  tune: { size: [2, 5], cap: [5, 16], walkers: [[4, 1], [9, 2]], gate: null, menders: { from: 1.5, max: 2, chance: .35 }, boss: { warden: 1e9, big: 'first' } },
  arrive(p, kind) {
    const nav = kind === 'walker' || kind === 'boss' ? G.nav.wide : G.nav, L = ENTRIES.map(e => nav.snap(e.x, e.z, 2)).filter(s => s && dist2(p, s) > 12); if (!L.length) return null;
    const c = pick(L); flashAt(c); return c;
  },
  /* things to use: the terminals not yet wiped (stand at one), the first-aid cabinets, and her dictaphones */
  interactables(L) {
    if (!lab || lab.over) return;
    for (const t of TERMINALS) if (!t.wiped) L.push({ pos: t.pos, r: 1.7, hold: LAB.wipe, label: `Wipe ${t.name} · user: MARA`, use: () => wipe(lab.eng, lab.run, t) });
    for (const m of MEDS) if (now >= m.readyAt) L.push({ pos: m.pos, r: 1.6, label: 'Use the first-aid cabinet', use: () => { const P = G.player, n = Math.min(P.maxHp - P.hp, Math.round(P.maxHp * MED.heal)); if (n < 1) { G.UI.feed('You don\'t need it yet'); return; }
      P.hp += n; m.readyAt = now + MED.every; G.UI.number(P.pos.add(V(0, 2, 0)), '+' + n, 'heal'); G.audio.play('powerOn', { pos: m.pos, gain: .25, rate: 1.9, len: .5, fade: .2 }); } });
    for (const t of TAPES) L.push({ pos: t.pos, r: 1.4, label: 'Play the dictaphone', use: () => { lab.tapes.add(t); G.UI.feed(t.say, '#ffb24a'); } });
  },
  begin(R, run) {
    now = 0; lab = { eng: R, run, wiped: 0, boss: null, wakeAt: 0, over: false, bossSaid: false, protos: [], tapes: new Set() };
    for (const t of TERMINALS) { t.wiped = false; t.mat.emissiveColor = C('#39ff7a'); t.light.intensity = .8; }
    for (const m of MEDS) m.readyAt = 0;
    for (const s of shutters) { if (s.down) setShutter(s, false); s.k = 0; s.slab.scaling.y = .001; s.until = 0; }
    prop.setEnabled(true); rigLight.intensity = 1.5; G.marks = [];
    /* the prototypes: husks, paler and not as strong, lying where they were being built */
    for (const [x, z, face] of PROTOS) { const h = new Husk(x, z, { slumped: true, face, leash: 1e9, wakeR: 4 }); h.name = 'Prototype'; h.maxHp = h.hp = Math.round(h.hp * .7);
      for (const m of [h.mat, h.matL]) if (m.albedoColor) m.albedoColor = B.Color3.Lerp(m.albedoColor, C('#d8d2c0').toLinearSpace(), .55); lab.protos.push(R.add(h)); }
  },
  tick(R, run, dt) {
    now = run.time; lab.run = run; const min = now / 60, P = G.player;
    cuts.update(dt);
    /* shutters: down for a while after each wipe, then up again */
    for (const s of shutters) { if (s.down && now >= s.until) setShutter(s, false); s.k += ((s.down ? 1 : 0) - s.k) * damp(5, dt); s.slab.scaling.y = Math.max(.001, s.k); }
    /* a woken prototype joins the run, like the husks in the Foundry's tunnels */
    for (const h of lab.protos) if (h.state !== 'slumped' && !h.joined) { h.joined = true; h.maxHp = h.hp = scaled(h.hp, min); run.mine.push(h); }
    /* the terminals' screens scroll; a first-aid cabinet's lamp is green when it's ready */
    for (const t of TERMINALS) if (!t.wiped) { const w = G.game.working(), on = w && w.label.startsWith(`Wipe ${t.name}`), k = on ? (Math.random() < .5 ? .3 : 1) : .8 + .2 * Math.sin(G.t * 3 + t.x); t.mat.emissiveColor.set(on ? k : .22 * k, k, on ? .3 * k : .48 * k); }
    for (const m of MEDS) m.mat.emissiveColor.set(now >= m.readyAt ? .35 : .5, now >= m.readyAt ? 1 : .12, now >= m.readyAt ? .44 : .08);
    /* the find gets up: a few wipes in, after a warning. It comes without whatever has already been wiped */
    if (lab.wakeAt && !lab.boss) { rigLight.intensity = Math.random() < .3 ? .2 : 1.5; if (Math.random() < dt * 12) G.FX.spark(V(RIG.x + rand(-1.5, 1.5), 1.4, RIG.z + rand(-.8, .8)), 4);
      if (now >= lab.wakeAt && P.down <= 0) { const c = G.nav.wide.snap(RIG.x, RIG.z - 2.6, 4) || { x: RIG.x, z: RIG.z - 2.6 }; prop.setEnabled(false); rigLight.intensity = 1.5; G.FX.explode(V(RIG.x, 1.3, RIG.z), .7); G.FX.debris(V(RIG.x, 1.3, RIG.z), 6, .5, .8);
        lab.boss = run.boss(c.x, c.z); strip(lab.boss); R.say('The first machine is up · It has everything you haven\'t wiped yet', '#ff6a5a'); } }
    const dead = lab.boss && !lab.boss.alive && lab.boss.boomed, left = TERMINALS.length - lab.wiped;
    if (dead && left && !lab.bossSaid) { lab.bossSaid = true; R.say(`${left} terminal${left === 1 ? '' : 's'} still to wipe · It isn't over while the research is here`, '#1fe0ff'); }
    if (dead && !left && P.down <= 0 && !lab.over) { lab.endAt = lab.endAt || G.t + 2.2; if (G.t >= lab.endAt) ending(run); }
    /* what to head for: the nearest terminal that's left */
    G.marks = []; const t = TERMINALS.filter(q => !q.wiped).sort((a, b) => dist2(a.pos, P.pos) - dist2(b.pos, P.pos))[0];
    if (t) G.marks.push({ pos: t.pos, h: 2.6, label: `Terminal · ${t.name}`, color: '#39ff7a' });
  },
  status() { if (!lab) return ''; const b = lab.boss; return `Terminals wiped ${lab.wiped} / ${TERMINALS.length} · ${!b ? (lab.wakeAt ? 'The find is waking' : 'The find is on its rig') : b.alive ? 'The first machine is up' : 'The first machine is down'}`; },
  stats: () => [[`${lab.wiped} / ${TERMINALS.length}`, 'Terminals wiped'], [lab.boss && !lab.boss.alive ? 'Destroyed' : lab.boss ? 'Awake' : 'On its rig', 'The first machine'], [lab.tapes.size, lab.tapes.size === 1 ? 'Dictaphone played' : 'Dictaphones played']],
});
