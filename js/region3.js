/* Region 03, The Foundry: where the machines are made. One great roofless casting hall, with tall walls to the north and east, a low parapet
   on the camera's side, and the relay gate in the middle of the north wall; and two tight spaces off it. Behind the north wall runs the
   assembly line, a narrow service tunnel along the backs of the furnaces and the two northern fabricators; behind the south wall, the slag
   drains, a cramped culvert the channels empty into. Walls between you and the camera sink while you're in them (cuts.js).
   How it plays: machines come out of five fabricators built into the walls (and the gate). A fabricator can be shot down: it drops scrap,
   the groups come more slowly while it is down, and it starts up again after a while. From behind, in the tunnels, a kill switch shuts one
   down for longer. Two slag channels run the length of the hall from the furnaces in the north wall; every so often one pours, then floods
   its half of the drains, and anything standing in it on the ground burns, machines included. Husks lie slumped in the tunnels and wake
   as you pass; walkers and the Crucible are too big to follow you in. Menders follow the groups in and weld wrecks back into machines,
   and the big boss here is the Crucible (crucible.js). */
import { B, G, V, C, R as sr, dist2, rand } from './core.js';
import { Geo, gbox, gcyl, gmesh } from './geo.js';
import { makeMat } from './tex.js';
import { buildGate } from './gate.js';
import { Actor } from './actors.js';
import { cloneMat, Husk } from './machines.js';
import { makeCuts } from './cuts.js';
import { survival } from './survival.js';

/* Walkable rectangles [x0, z0, x1, z1]; north is +z. The hall, the two tight spaces, and the doorways between (each doorway overlaps
   the floor on both sides by a metre, so there's no seam to get stuck on). Everything outside the hall is walled in. */
const HALL = [-36, -26, 36, 26];
const LINE = [-31.5, 28, 31.5, 32];      // the assembly line: a conveyor takes its north side, leaving a walkway under 3 m across
const DRAIN = [-22, -31, 29, -27.5];     // the slag drains
const DOORS = [[-31.5, 25, -28.5, 29], [28.5, 25, 31.5, 29],                                // into the assembly line, at both ends
  [-21.5, -28.5, -18.5, -25], [-1.5, -28.5, 1.5, -25], [26, -28.5, 29, -25]];                // into the drains: west, middle and east
const GATE = { x: 0, z: 22.5, y: 4.4 }, MOUTH = { x: 0, z: 18 };
const WALL_H = 7, LOW_H = 1.1, NOOK_H = 3.4;   // the hall's walls, its parapet, and the tight spaces' walls
const ob = (x, z, hw, hd, h) => G.obstacles.push({ x, z, hw, hd, h });
const inside = (r, x, z, m = 0) => x > r[0] - m && x < r[2] + m && z > r[1] - m && z < r[3] + m;

/* The fabricators: where each sits on the inside face of a wall (x, z), which way it faces into the hall (nx, nz), its depth, width and height.
   The two on the camera's side are low. `back` is where its kill switch stands, in the tunnel behind it. */
const FABS = [
  { id: 'nw', say: 'north-west', x: -22, z: 26, nx: 0, nz: -1, d: 4, w: 7, h: 6, back: { x: -22, z: 28.45 } },
  { id: 'ne', say: 'north-east', x: 22, z: 26, nx: 0, nz: -1, d: 4, w: 7, h: 6, back: { x: 22, z: 28.45 } },
  { id: 'e', say: 'east', x: 36, z: -8, nx: -1, nz: 0, d: 4, w: 7, h: 6 },
  { id: 's', say: 'south', x: 22, z: -26, nx: 0, nz: 1, d: 3, w: 6, h: 3.4, low: true, back: { x: 22, z: -30.65 } },
  { id: 'w', say: 'west', x: -36, z: 12, nx: 1, nz: 0, d: 3, w: 6, h: 3.4, low: true },
];
for (const F of FABS) { F.cx = F.x + F.nx * (F.d + .75); F.cz = F.z + F.nz * (F.d + .75); F.spawn = { x: F.x + F.nx * (F.d + 2.6), z: F.z + F.nz * (F.d + 2.6) }; }
/* A fabricator's health (toughened with the clock like the machines), seconds until a destroyed one starts up again (or one shut down
   with its kill switch), and how much longer the time between groups gets for each one that is down. */
const FAB = { hp: 320, back: 50, switched: 100, ease: .2 };

/* The slag channels, poured from the furnaces in the north wall, each draining into its half of the culvert (west or east of the middle doorway). */
const CHANNELS = [{ x: -11, say: 'west', drain: [DRAIN[0], DRAIN[1], -1.5, DRAIN[3]] }, { x: 11, say: 'east', drain: [1.5, DRAIN[1], DRAIN[2], DRAIN[3]] }];
const CH_Z = [-22.4, 23.4], CH_W = 2.6;
/* Seconds to the first pour, between pours, the warning before one, how long it pours, the damage a second to anything standing in it,
   and how long after the channel its drain floods. */
const SLAG = { first: 35, every: 26, warn: 3, pour: 5, dps: 28, drainLag: 2 };
/* Where husks lie slumped in the tunnels (and which way they face), how many at most, and how often a fresh one is put down out of sight. */
const LURK = { spots: [[-25.5, 30.2, Math.PI], [-14, 30.2, Math.PI], [-3, 30.2, Math.PI], [9, 30.2, Math.PI], [16.5, 30.2, Math.PI], [26, 30.2, Math.PI],
  [-16, -30.4, 0], [-6, -30.4, 0], [5, -30.4, 0], [14, -28.1, Math.PI]], max: 4, every: 40 };

/* ---------- the fabricator: the part you can shoot, a glowing core in a cage on a boom, with two assembly arms ---------- */
class Fabricator extends Actor {
  constructor(F, hp) {
    super('machine', hp); this.kind = 'fabricator'; this.name = 'Fabricator'; this.F = F; F.actor = this;
    this.lurk = true;   // never picked by auto-aim (or by Mara, unless you shoot it first): you choose when to go for one
    this.radius = 1.2; this.height = 3; this.flash = 0; this.busy = 0;
    const S = G.scene, H = this.H = F.low ? 2.3 : 3.6; this.barY = H + 1.6;
    const root = this.root = new B.TransformNode('fabricator', S); root.position.set(F.cx, 0, F.cz); root.rotation.y = Math.atan2(F.nx, F.nz);
    this.home = V(F.cx, 0, F.cz);
    this.mat = cloneMat(G.M.mech, 'fabMat'); this.matD = cloneMat(G.M.mechDark, 'fabMatD');
    this.heatMat = new B.StandardMaterial('fabHeat', S); this.heatMat.disableLighting = true; this.heatMat.emissiveColor = C('#ff8a2a');
    const tag = m => { m.metadata = { actor: this, part: 'core' }; m.isPickable = true; return m; };
    const g = Geo(), d = Geo();
    gbox(g, { x: 0, y: H, z: -.95, w: .55, h: .55, d: 1.5, ao: false });                                    // the boom back to the housing
    for (const y of [H - .8, H + .8]) gcyl(d, { r0: .95, h: .12, seg: 14, y, ao: false });
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; gbox(d, { x: Math.cos(a) * .92, y: H, z: Math.sin(a) * .92, w: .1, h: 1.6, d: .1, ao: false }); }
    tag(gmesh('fabBoom', g, this.mat, { parent: root })); tag(gmesh('fabCage', d, this.matD, { parent: root }));
    this.core = tag(B.MeshBuilder.CreateIcoSphere('fabCore', { radius: .58, subdivisions: 1, flat: true }, S)); this.core.parent = root; this.core.position.y = H; this.core.material = this.heatMat;
    this.arms = [-1, 1].map(s => { const n = new B.TransformNode('fabArm', S); n.parent = root; n.position.set(s * 1.5, H - .5, -.6);
      const a = Geo(); gbox(a, { x: 0, y: 0, z: .7, w: .22, h: .22, d: 1.4, ao: false }); gbox(a, { x: 0, y: -.15, z: 1.45, w: .12, h: .4, d: .12, ao: false }); tag(gmesh('fabArm', a, this.matD, { parent: n }));
      return { n, s }; });
    this.meshes = root.getChildMeshes();
    this.smokeWreck = G.FX.smokeFrom(this.core);
  }
  hitTargets() { return [{ part: 'core', c: this.core.getAbsolutePosition(), r: 1.05 }]; }
  takeDamage(d) { this.flash = 1; return d; }
  /* shot down (switched: shut down from behind with its kill switch, which keeps it down for longer) */
  die(src, switched) {
    const c = this.core.getAbsolutePosition().clone(), F = this.F;
    if (switched) { G.FX.spark(c, 40); G.FX.puffAt(c, 14); G.audio.play('powerOff', { pos: c, gain: .9, rate: .7, len: 2.4, fade: .6 }); }
    else { G.FX.explode(c, 1); G.FX.debris(c, 6, .6, .8); G.FX.blast(V(c.x, .4, c.z), .8);
      G.audio.play('boomBig', { pos: c, gain: .8, rate: 1.15 }); G.audio.play('powerOff', { pos: c, gain: .7, rate: .8, len: 2, fade: .5 }); }
    this.core.setEnabled(false); this.smokeWreck.start(); this.meshes.forEach(m => { m.isPickable = false; });
    G.drops.scatter(F.spawn.x, F.spawn.z, [{ scrap: Math.round(rand(15, 25)) }]);
    F.backAt = now + (switched ? FAB.switched : FAB.back);
    G.game.onMachineDown(this, src);
    G.UI.feed(switched ? `The ${F.say} fabricator is shut down · It stays off for ${FAB.switched} seconds` : `The ${F.say} fabricator is down · Machines come slower while it's out`, '#1fe0ff');
  }
  shutDown() { if (!this.alive) return; this.hp = 0; this.alive = false; this.die(G.player, true); }
  restart(hp) {
    this.alive = true; this.maxHp = this.hp = hp; this.core.setEnabled(true); this.smokeWreck.stop(); this.meshes.forEach(m => { m.isPickable = true; }); this.flash = 1;
    G.audio.play('powerOn', { pos: this.core.getAbsolutePosition(), gain: .7, rate: .8, len: 1.8, fade: .4 });
  }
  update(dt) {
    const F = this.F, up = this.alive;
    this.flash = Math.max(0, this.flash - dt * 5); this.busy = Math.max(0, this.busy - dt * .7);
    this.mat.emissiveColor.set(this.flash * .12, this.flash * .08, this.flash * .05);
    const k = up ? (.75 + this.busy * .5 + Math.sin(G.t * 3 + F.cx) * .1 + this.flash * .6) : 0;
    this.heatMat.emissiveColor.set(Math.min(1, k), Math.min(1, k * .5), Math.min(1, k * .15));
    this.core.rotation.y += dt * (.6 + this.busy * 3);
    this.arms.forEach(({ n, s }, i) => { n.rotation.y = up ? -s * (.35 + Math.sin(G.t * (1.4 + this.busy * 5) + i * 2) * .3) : -s * .1; n.rotation.x = up ? Math.sin(G.t * (1.1 + this.busy * 4) + i) * .2 : .55; });
    /* the doorway behind glows while it's running (brighter while it's sending machines out) and flickers dark when it's down;
       its kill switch shows green while there's something to shut down */
    const door = up ? .45 + this.busy * .9 : (Math.random() < .03 ? .2 : .03);
    F.glow.emissiveColor.copyFrom(F.glowBase).scaleInPlace(door); F.light.intensity = door * 1.6;
    if (F.switchMat) F.switchMat.emissiveColor.copyFrom(up ? SWITCH_ON : SWITCH_OFF).scaleInPlace(up ? .8 + Math.sin(G.t * 4) * .2 : 1);
  }
}
const SWITCH_ON = new B.Color3(.35, 1, .45), SWITCH_OFF = new B.Color3(.35, .05, .03);

/* ---------- the map ---------- */
let channels = [], now = 0;
const cuts = makeCuts();
export function buildRegion(M) {
  const scene = G.scene;
  G.open = [HALL, LINE, DRAIN, ...DOORS];
  G.flames = [];
  const paint = [];
  for (const c of CHANNELS) for (const s of [-1, 1]) paint.push([c.x + s * 1.75, CH_Z[0], c.x + s * 1.75, CH_Z[1], .14, '220,180,70', .4]);   // hazard lines along the slag
  for (const F of FABS) { const along = F.nz !== 0, hw = F.w / 2 + .4, x = F.x + F.nx * (F.d + 3.2), z = F.z + F.nz * (F.d + 3.2);
    paint.push(along ? [x - hw, z, x + hw, z, .12, '220,180,70', .32] : [x, z - hw, x, z + hw, .12, '220,180,70', .32]); }          // a line in front of each fabricator
  paint.push([-6, 19.5, 6, 19.5, .12, '220,180,70', .3]);                                                                                 // the gate's safety line
  for (const d of DOORS) { const z = d[1] > 0 ? 25.2 : -25.2; paint.push([d[0] + .2, z, d[2] - .2, z, .14, '220,180,70', .45]); }          // the doorways' thresholds
  paint.push([LINE[0] + .5, 30.7, LINE[2] - .5, 30.7, .1, '220,180,70', .3]);                                                             // the assembly line's walkway edge
  G.decalHints = { paint, skids: [], puddles: [], puddleN: 0,
    scorch: [[-11, 21.5, 2.6], [11, 21.5, 2.6], [0, 19, 2.4], ...FABS.map(F => [F.spawn.x, F.spawn.z, 1.8]), [-11, -21, 1.8], [11, -21, 1.8], [-11, -29, 1.6], [11, -29, 1.6]],
    oil: [[-26, 0, 1.6], [25, 8, 1.6], [-27, -10, 1.2], [21, -13, 1.2], [5.5, -14, .9], [-8, 29.5, 1], [18, 29.4, .8]] };

  const S = scene, mat = (n, h, o) => makeMat(S, n, h, o);
  const MAT = {
    floor: mat('fFloor', '#5a554f', { tex: M.crate.albedoTexture, bump: M.crate.bumpTexture, spec: .12, power: 24 }),
    wall: mat('fWall', '#6e6660', { tex: M.conc.diffuseTexture, bump: M.conc.bumpTexture }),
    trim: mat('fTrim', '#3b3936', { tex: M.crate.albedoTexture, bump: M.crate.bumpTexture, spec: .15 }),
    window: mat('fWindow', '#000000', { unlit: true, emissive: '#c8742e' }),
    hot: mat('fHot', '#000000', { unlit: true, emissive: '#9a3a10' }),   // ingots still cooling
    rust: M.rust,
  };
  const g = { floor: Geo(), wall: Geo(), trim: Geo(), window: Geo(), hot: Geo(), rust: Geo() };
  /* A piece that sinks while it stands between you and the camera: drawn into its own geometry (the same materials), under its own node.
     It stays solid however far it has sunk. */
  const sinking = (x0, z0, x1, z1, h, draw) => {
    const node = new B.TransformNode('sinks', S), gg = { wall: Geo(), trim: Geo(), window: Geo(), hot: Geo(), rust: Geo() }; draw(gg);
    for (const k in gg) gmesh('sinks_' + k, gg[k], MAT[k], { parent: node, shadow: k === 'wall' || k === 'trim' || k === 'rust' });
    cuts.add(node, x0, z0, x1, z1, h); return node;
  };
  /* a plain stretch of wall, cut into lengths of about 6 m so only the part in the way sinks; extra(gg, a, b) adds detail along each length */
  const wallRun = (x0, z0, x1, z1, h, sinks, extra) => {
    const alongX = x1 - x0 >= z1 - z0, L = alongX ? x1 - x0 : z1 - z0, n = sinks ? Math.max(1, Math.round(L / 6)) : 1;
    for (let i = 0; i < n; i++) {
      const a = (alongX ? x0 : z0) + L * i / n, b = (alongX ? x0 : z0) + L * (i + 1) / n, r = alongX ? [a, z0, b, z1] : [x0, a, x1, b];
      const draw = gg => { gbox(gg.wall, { x: (r[0] + r[2]) / 2, y: h / 2, z: (r[1] + r[3]) / 2, w: r[2] - r[0], h, d: r[3] - r[1], noBottom: true });
        gbox(gg.trim, { x: (r[0] + r[2]) / 2, y: h + .05, z: (r[1] + r[3]) / 2, w: r[2] - r[0] + .04, h: .1, d: r[3] - r[1] + .04, ao: false }); if (extra) extra(gg, a, b); };
      if (sinks) sinking(...r, h, draw); else draw(g);
      ob((r[0] + r[2]) / 2, (r[1] + r[3]) / 2, (r[2] - r[0]) / 2, (r[3] - r[1]) / 2, h);
    }
  };

  /* ---------- floors, and dark ground outside ---------- */
  gbox(g.floor, { x: 0, y: -.05, z: 0, w: HALL[2] - HALL[0] + 4, h: .1, d: HALL[3] - HALL[1] + 4, uv: 1 / 3, ao: false, noBottom: true });
  for (const r of [LINE, DRAIN, ...DOORS]) gbox(g.floor, { x: (r[0] + r[2]) / 2, y: -.049, z: (r[1] + r[3]) / 2, w: r[2] - r[0], h: .1, d: r[3] - r[1], uv: 1 / 3, ao: false, noBottom: true, tint: .8 });
  const out = B.MeshBuilder.CreateGround('outside', { width: 260, height: 260 }, S); out.position.set(0, -.08, 0); out.material = mat('fOutside', '#0b0908', { unlit: true }); out.isPickable = false; out.freezeWorldMatrix();

  /* ---------- the north wall: tall, with pilasters, a catwalk, lit windows and pipes on the hall side. It sinks in lengths while you're in
     the assembly line behind it, and has a doorway into the line at each end ---------- */
  const northDetail = (gg, a, b) => {
    for (let x = -33; x <= 33; x += 6) if (x >= a && x < b) gbox(gg.wall, { x, y: WALL_H / 2, z: 25.85, w: .7, h: WALL_H, d: .3, tint: .8, noBottom: true });
    for (let x = -30; x <= 30; x += 6) if (x - 1.6 >= a && x + 1.6 <= b) gbox(gg.window, { x, y: 5.9, z: 25.98, w: 3.2, h: .9, d: .04, ao: false });
    gbox(gg.trim, { x: (a + b) / 2, y: 4.5, z: 25.4, w: b - a, h: .15, d: 1.2, ao: false }); gbox(gg.trim, { x: (a + b) / 2, y: 5.4, z: 24.85, w: b - a, h: .06, d: .06, ao: false });   // catwalk and its rail
    for (const [y, r] of [[6.6, .2], [6.95, .14]]) gcyl(gg.rust, { r0: r, h: b - a, seg: 8, x: (a + b) / 2, y, z: 25.6, rz: Math.PI / 2, ao: false });
    gbox(gg.trim, { x: (a + b) / 2, y: .16, z: 28.03, w: b - a, h: .32, d: .06, ao: false });                                                                          // skirting on the tunnel side
  };
  wallRun(-38, 26, LINE[0], 28, WALL_H, true, northDetail); wallRun(-28.5, 26, 28.5, 28, WALL_H, true, northDetail); wallRun(LINE[2], 26, 38, 28, WALL_H, true, northDetail);
  for (const d of DOORS.slice(0, 2)) sinking(d[0], 26, d[2], 28, WALL_H, gg => {   // the doorways into the line: a lintel over each, and a frame
    gbox(gg.wall, { x: (d[0] + d[2]) / 2, y: (WALL_H + 3.2) / 2, z: 27, w: d[2] - d[0], h: WALL_H - 3.2, d: 2, noBottom: true }); northDetail(gg, d[0], d[2]);
    for (const s of [d[0], d[2]]) gbox(gg.trim, { x: s, y: 1.6, z: 25.9, w: .35, h: 3.2, d: .3, ao: false }); gbox(gg.trim, { x: (d[0] + d[2]) / 2, y: 3.3, z: 25.9, w: d[2] - d[0] + .35, h: .25, d: .3, ao: false }); });
  /* the east wall, which never stands between you and the camera */
  gbox(g.wall, { x: 37, y: WALL_H / 2, z: 0, w: 2, h: WALL_H, d: 56, noBottom: true }); ob(37, 0, 1, 28, WALL_H);
  for (let z = -23; z <= 23; z += 6) { gbox(g.wall, { x: 35.85, y: WALL_H / 2, z, w: .3, h: WALL_H, d: .7, tint: .8, noBottom: true }); if (z < 21) gbox(g.window, { x: 35.98, y: 5.9, z: z + 3, w: .04, h: .9, d: 3.2, ao: false }); }
  gbox(g.trim, { x: 35.4, y: 4.5, z: 0, w: 1.2, h: .15, d: 52, ao: false }); gbox(g.trim, { x: 34.85, y: 5.4, z: 0, w: .06, h: .06, d: 52, ao: false });
  for (const [y, r] of [[6.6, .2], [6.95, .14]]) gcyl(g.rust, { r0: r, h: 52, seg: 8, x: 35.6, y, z: 0, rx: Math.PI / 2, ao: false });
  /* the low parapet to the west, and to the south either side of the drains */
  const parapet = (x0, z0, x1, z1) => { const alongX = x1 - x0 > z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, L = alongX ? x1 - x0 : z1 - z0;
    gbox(g.trim, { x: cx, y: LOW_H / 2, z: cz, w: x1 - x0, h: LOW_H, d: z1 - z0, noBottom: true }); ob(cx, cz, (x1 - x0) / 2, (z1 - z0) / 2, LOW_H);
    for (let t = .6; t < L; t += 3.5) gcyl(g.rust, { r0: .05, h: .5, seg: 5, x: alongX ? x0 + t : cx, y: LOW_H + .25, z: alongX ? cz : z0 + t, ao: false });
    gbox(g.rust, { x: cx, y: LOW_H + .5, z: cz, w: alongX ? L : .06, h: .06, d: alongX ? .06 : L, ao: false }); };
  parapet(-36.8, -26.8, -23.5, -26); parapet(30.5, -26.8, 36.8, -26); parapet(-36.8, -26.8, -36, 26.5);
  /* warm lamps high on the walls */
  for (const x of [-30, -16, 16, 30]) G.lightSources.push({ pos: V(x, 5.6, 24.4), color: C('#ffb070'), range: 15, intensity: 1 });
  for (const z of [-20, 0, 16]) G.lightSources.push({ pos: V(34.4, 5.6, z), color: C('#ffb070'), range: 15, intensity: 1 });

  /* ---------- the relay gate, in the middle of the north wall ---------- */
  const gate = buildGate(M, GATE);

  /* ---------- the fabricators' housings: a block in the wall with a glowing doorway (the actor on the front is made each run). They sink
     when they stand between you and the camera, like the walls ---------- */
  for (const F of FABS) {
    const along = F.nz !== 0, hx = F.x + F.nx * F.d / 2, hz = F.z + F.nz * F.d / 2, W = along ? F.w : F.d, D = along ? F.d : F.w;
    const fx = F.x + F.nx * (F.d + .02), fz = F.z + F.nz * (F.d + .02), dw = F.w * .5, dh = F.low ? 1.7 : 2.6;   // the doorway on the front face
    F.glow = makeMat(S, 'fabGlow_' + F.id, '#000000', { unlit: true, emissive: '#ff7a24' }); F.glowBase = F.glow.emissiveColor.clone();
    const node = sinking(hx - W / 2, hz - D / 2, hx + W / 2, hz + D / 2, F.h, gg => {
      gbox(gg.wall, { x: hx, y: F.h / 2, z: hz, w: W, h: F.h, d: D, tint: .75, noBottom: true });
      gbox(gg.trim, { x: hx, y: F.h + .1, z: hz, w: W + .3, h: .2, d: D + .3, ao: false });
      for (const s of [-1, 1]) { const ox = along ? s * (dw / 2 + .2) : 0, oz = along ? 0 : s * (dw / 2 + .2);   // the door frame either side, and over it
        gbox(gg.trim, { x: fx + ox + F.nx * .15, y: dh / 2, z: fz + oz + F.nz * .15, w: .3, h: dh + .2, d: .3, ao: false }); }
      gbox(gg.trim, { x: fx + F.nx * .15, y: dh + .15, z: fz + F.nz * .15, w: along ? dw + .7 : .3, h: .3, d: along ? .3 : dw + .7, ao: false }); });
    const gd = Geo(); gbox(gd, { x: fx, y: dh / 2, z: fz, w: along ? dw : .04, h: dh, d: along ? .04 : dw, ao: false }); gmesh('fabDoor_' + F.id, gd, F.glow, { shadow: false, parent: node });
    ob(hx, hz, W / 2, D / 2, F.h);
    F.light = { pos: V(F.spawn.x, 1.6, F.spawn.z), color: C('#ff8a3a'), range: 9, intensity: .7, flicker: true }; G.lightSources.push(F.light);
    /* the kill switch behind it, where there's a tunnel: a console with a lamp that shows green while the fabricator is running */
    if (F.back) { const b = F.back, face = 1;   // you stand on its north side, out in the walkway
      F.switchMat = makeMat(S, 'fabSwitch_' + F.id, '#000000', { unlit: true, emissive: '#5aff70' });
      gbox(g.trim, { x: b.x, y: .6, z: b.z, w: 1.1, h: 1.2, d: .5, ao: false }); gbox(g.rust, { x: b.x - .35, y: 1.6, z: b.z - face * .1, w: .12, h: .9, d: .12, ao: false });
      const sg = Geo(); gbox(sg, { x: b.x + .15, y: 1.05, z: b.z + face * .26, w: .55, h: .25, d: .03, ao: false }); gmesh('fabSwitch_' + F.id, sg, F.switchMat, { shadow: false, freeze: true });
      ob(b.x, b.z, .55, .25, 1.2);
      F.switchAt = V(b.x, 0, b.z + face * 1); }
  }

  /* ---------- the furnaces and the slag channels; the furnaces sink too ---------- */
  channels = CHANNELS.map(c => makeChannel(M, MAT, g, sinking, c));

  /* ---------- the assembly line: a conveyor of half-built husks along the north side, frames hanging over it on racks, crates and
     consoles narrowing the walkway, red work lights; the far wall stands, the west end wall sinks ---------- */
  { const [x0, z0, x1, z1] = LINE;
    gbox(g.wall, { x: 0, y: 2.25, z: 32.75, w: 66, h: 4.5, d: 1.5, noBottom: true, tint: .7 }); ob(0, 32.75, 33, .75, 4.5);
    gbox(g.wall, { x: 32.25, y: 2.25, z: 30, w: 1.5, h: 4.5, d: 4, noBottom: true, tint: .7 }); ob(32.25, 30, .75, 2, 4.5);
    wallRun(-33, 28, x0, 32, NOOK_H, true);
    for (const [y, r] of [[3.6, .16], [3.95, .11]]) gcyl(g.rust, { r0: r, h: 63, seg: 8, x: 0, y, z: 31.9, rz: Math.PI / 2, ao: false });   // pipes along the far wall
    /* the conveyor, carrying half-built husks */
    gbox(g.trim, { x: 0, y: .45, z: 31.4, w: x1 - x0 - 1, h: .5, d: 1.2, uv: .5 }); gbox(g.rust, { x: 0, y: .73, z: 31.4, w: x1 - x0 - 1, h: .06, d: .95, ao: false }); ob(0, 31.4, (x1 - x0 - 1) / 2, .6, .9);
    for (let x = x0 + 1.5; x < x1 - 1; x += sr(2.2, 3.4)) { const ry = sr(-.3, .3);
      gbox(g.trim, { x, y: .95, z: 31.4, w: .34, h: .4, d: .22, ry, ao: false, tint: .6 }); gbox(g.trim, { x: x + .05, y: 1.22, z: 31.4, w: .16, h: .14, d: .22, ry, ao: false, tint: .6 }); }
    /* frames hanging on racks over it */
    for (let x = x0 + 3; x < x1 - 2; x += 4) { gbox(g.rust, { x, y: 3.1, z: 31.4, w: .1, h: .1, d: 1.4, ao: false }); gcyl(g.rust, { r0: .03, h: .7, seg: 4, x, y: 2.7, z: 31.4, ao: false });
      gcyl(g.trim, { r0: .16, r1: .12, h: .65, seg: 6, x, y: 2.05, z: 31.4, ao: false, tint: .5 }); gbox(g.trim, { x, y: 2.48, z: 31.45, w: .17, h: .16, d: .24, ao: false, tint: .5 });
      for (const s of [-1, 1]) gcyl(g.trim, { r0: .035, h: .8, seg: 4, x: x + s * .22, y: 1.75, z: 31.4, rz: s * .15, ao: false, tint: .5 }); }
    /* crates and a tool cart pinching the walkway */
    for (const [x, w] of [[-9, 1.6], [5, 1.2], [-28, 1.4], [27, 1.3]]) { gbox(g.trim, { x, y: .45, z: 28.6, w, h: .9, d: 1.1, tint: sr(.7, 1), uv: .6 }); ob(x, 28.6, w / 2, .55, .9); }
    for (const x of [-24, -12, 0, 12, 24]) G.lightSources.push({ pos: V(x, 2.8, 29.4), color: C('#ff5a3a'), range: 8, intensity: .9 });
    for (const x of [-24, -12, 0, 12, 24]) gbox(g.hot, { x, y: 3.5, z: 32, w: .5, h: .14, d: .1, ao: false }); }

  /* ---------- the slag drains: a culvert behind the south wall, its walls sinking (all of them can stand between you and the camera),
     pipes along it, junction boxes that squeeze it narrower, and a dull orange glow ---------- */
  { const [x0, z0, x1, z1] = DRAIN;
    const southDetail = (gg, a, b) => { for (const [y, r] of [[2.3, .17], [2.7, .12]]) gcyl(gg.rust, { r0: r, h: b - a, seg: 8, x: (a + b) / 2, y, z: z0 + .25, rz: Math.PI / 2, ao: false }); };
    wallRun(-23.5, -27.5, -21.5, -26, NOOK_H, true); wallRun(-18.5, -27.5, -1.5, -26, NOOK_H, true); wallRun(1.5, -27.5, 26, -26, NOOK_H, true); wallRun(29, -27.5, 30.5, -26, NOOK_H, true);
    wallRun(-23.5, -32.5, 30.5, z0, NOOK_H, true, southDetail);
    wallRun(-23.5, z0, x0, z1, NOOK_H, true); wallRun(x1, z0, 30.5, z1, NOOK_H, true);
    for (const [x, z, w, d] of [[-12.5, -30.4, 2, 1.2], [7.5, -28.1, 1.8, 1.2], [17, -30.4, 1.6, 1.2]]) { gbox(g.trim, { x, y: .8, z, w, h: 1.6, d, uv: .5 }); gbox(g.rust, { x, y: 1.75, z, w: w * .6, h: .3, d: d * .6, ao: false }); ob(x, z, w / 2, d / 2, 1.6); }
    for (const x of [-16, -4, 8, 20]) G.lightSources.push({ pos: V(x, 2.4, -29.3), color: C('#ff7a3a'), range: 7, intensity: .7, flicker: true }); }

  /* ---------- machinery and cover. Nothing out on the floor stands much taller than a person: the camera looks in from the south-west,
     so anything tall would hide whoever is behind it (the tall things are all along the north and east walls) ---------- */
  const press = (x, z) => { gbox(g.trim, { x, y: .5, z, w: 3.2, h: 1, d: 3.2, uv: .5 }); for (const s of [-1, 1]) gbox(g.wall, { x: x + s * 1.3, y: 1.9, z, w: .5, h: 1.8, d: 1.2, tint: .7 });
    gbox(g.wall, { x, y: 2.8, z, w: 3.2, h: .5, d: 1.6, tint: .8 }); gbox(g.rust, { x, y: 1.75, z, w: 1.8, h: .6, d: 1.4 }); ob(x, z, 1.6, 1.6, 3.05); };
  const conveyor = (x0, x1, z) => { const cx = (x0 + x1) / 2, L = x1 - x0;
    gbox(g.trim, { x: cx, y: .45, z, w: L, h: .5, d: 1.4, uv: .5 }); gbox(g.rust, { x: cx, y: .74, z, w: L, h: .06, d: 1.1, ao: false });
    for (let x = x0 + .4; x < x1; x += 1.6) for (const s of [-1, 1]) gbox(g.trim, { x, y: .1, z: z + s * .55, w: .15, h: .2, d: .15, ao: false });
    for (let x = x0 + 1; x < x1 - .5; x += sr(1.6, 2.6)) gbox(g.hot, { x, y: .86, z: z + sr(-.2, .2), w: .9, h: .18, d: .45, ry: sr(-.15, .15), ao: false });   // ingots riding it, still hot
    ob(cx, z, L / 2, .7, .9); };
  const ingots = (x, z, ry = 0) => { for (let k = 0; k < 3; k++) for (let j = 0; j < 4 - k; j++) gbox(g.trim, { x: x + (j - (3 - k) / 2) * .58, y: .13 + k * .26, z, w: .5, h: .24, d: 1.3, ry, tint: sr(.8, 1.1) }); ob(x, z, 1.2, .7, .8); };
  const barrel = (x, z) => { gcyl(g.rust, { r0: .32, h: .9, seg: 10, x, y: .45, z }); ob(x, z, .32, .32, .9); };
  press(-26, 0); press(25, 8);
  conveyor(-34, -20, -10); conveyor(15, 27, -13);
  ingots(-5.5, 4); ingots(5.5, -14); ingots(20, -4); ingots(-31, 19); ingots(-31, -20); ingots(16.5, 13); ingots(-17, -4);
  gbox(g.trim, { x: 0, y: .35, z: 12, w: 4, h: .7, d: 2, uv: .5 }); for (let k = -1; k <= 1; k++) gbox(g.hot, { x: k * 1.2, y: .72, z: 12, w: .9, h: .04, d: 1.4, ao: false }); ob(0, 12, 2, 1, .7);   // casting moulds
  barrel(29, 20); barrel(29.8, 20.6); barrel(-33, -24); barrel(33, -23.5); barrel(-15, 22);

  /* ---------- finish: one mesh per material ---------- */
  gmesh('fFloor', g.floor, MAT.floor, { freeze: true, shadow: false }); gmesh('fWall', g.wall, MAT.wall, { freeze: true }); gmesh('fTrim', g.trim, MAT.trim, { freeze: true });
  gmesh('fWindow', g.window, MAT.window, { freeze: true, shadow: false }); gmesh('fHot', g.hot, MAT.hot, { freeze: true, shadow: false }); gmesh('fRust', g.rust, M.rust, { freeze: true });
  return { gate };
}

/* A strip of slag on the floor (x0..x1, z0..z1), flowing along its length: dark crust with veins, lit from within as it heats, with lights
   along it that come up with the heat. */
function slagStrip(name, [x0, z0, x1, z1], lightsAt) {
  const S = G.scene, alongX = x1 - x0 > z1 - z0, L = alongX ? x1 - x0 : z1 - z0, W = alongX ? z1 - z0 : x1 - x0;
  const tex = new B.DynamicTexture('slagTex_' + name, { width: 64, height: 256 }, S, true), ctx = tex.getContext();
  ctx.fillStyle = 'rgb(34,22,16)'; ctx.fillRect(0, 0, 64, 256);
  for (let k = 0; k < 28; k++) { ctx.strokeStyle = `rgba(255,${150 + (k % 5) * 18},70,${(.35 + Math.random() * .6).toFixed(2)})`; ctx.lineWidth = 1 + Math.random() * 3; ctx.beginPath();
    let x = Math.random() * 64; ctx.moveTo(x, -10); for (let y = 0; y <= 266; y += 16) { x += (Math.random() - .5) * 14; ctx.lineTo(x, y); } ctx.stroke(); }
  tex.update(); tex.vScale = L / 5;
  /* the glow is a second copy of the picture: Babylon adds an emissive texture at its own level, so that level is what the heat turns up */
  const glow = new B.DynamicTexture('slagGlow_' + name, { width: 64, height: 256 }, S, true); glow.getContext().drawImage(ctx.canvas, 0, 0); glow.update(); glow.vScale = L / 5; glow.level = 0;
  const m = new B.StandardMaterial('slag_' + name, S); m.diffuseColor = C('#221813'); m.diffuseTexture = tex; m.emissiveTexture = glow; m.emissiveColor = new B.Color3(0, 0, 0); m.specularColor = new B.Color3(.05, .04, .03); m.maxSimultaneousLights = 8;
  const bed = B.MeshBuilder.CreateGround('slagBed_' + name, { width: W, height: L }, S); bed.position.set((x0 + x1) / 2, .02, (z0 + z1) / 2); if (alongX) bed.rotation.y = -Math.PI / 2;
  bed.material = m; bed.isPickable = false; bed.receiveShadows = true; bed.freezeWorldMatrix();
  const lights = lightsAt.map(([x, z]) => { const s = { pos: V(x, 1.2, z), color: C('#ff7a2a'), range: 12, intensity: 0, flicker: true }; G.lightSources.push(s); return s; });
  return { name, rect: [x0, z0, x1, z1], mat: m, tex, glow, lights, heat: 0 };
}
/* A slag channel: a furnace in the north wall with a glowing mouth, a stream it pours, curbs either side of a long trough of slag,
   a grate at the south end, and the half of the drains it empties into, with an outlet pouring into it when it floods. */
function makeChannel(M, MAT, g, sinking, c) {
  const S = G.scene, L = CH_Z[1] - CH_Z[0], mid = (CH_Z[0] + CH_Z[1]) / 2;
  const ch = Object.assign(slagStrip(c.say, [c.x - CH_W / 2, CH_Z[0], c.x + CH_W / 2, CH_Z[1]], [[c.x, 16], [c.x, 0], [c.x, -16]]), c);
  for (const s of [-1, 1]) gbox(g.trim, { x: c.x + s * (CH_W / 2 + .15), y: .11, z: mid, w: .3, h: .22, d: L, ao: false });   // curbs (low enough to step over)
  gbox(g.trim, { x: c.x, y: .03, z: CH_Z[0] - .4, w: CH_W + .6, h: .06, d: .8, ao: false });                               // the grate
  for (let k = -1; k <= 1; k++) gbox(g.rust, { x: c.x + k * .7, y: .07, z: CH_Z[0] - .4, w: .12, h: .04, d: .7, ao: false });
  /* the furnace that feeds it */
  ch.mouth = makeMat(S, 'furnaceMouth_' + c.say, '#000000', { unlit: true, emissive: '#ff8a2a' }); ch.mouthBase = ch.mouth.emissiveColor.clone();
  const node = sinking(c.x - 2.75, 23.4, c.x + 2.75, 26, 10.2, gg => {   // 10.2: down far enough to take the stacks with it
    gbox(gg.wall, { x: c.x, y: 3.75, z: 24.7, w: 5.5, h: 7.5, d: 2.6, tint: .7, noBottom: true });
    gbox(gg.trim, { x: c.x, y: 1.1, z: 23.1, w: 3.4, h: .3, d: .9, ao: false });   // the spout's lip
    for (const s of [-1, 1]) gcyl(gg.rust, { r0: .35, h: 3, seg: 10, x: c.x + s * 1.8, y: 8.6, z: 25.2, ao: false }); });
  ob(c.x, 24.7, 2.75, 1.3, 7.5);
  const mg = Geo(); gbox(mg, { x: c.x, y: 1.9, z: 23.38, w: 2.6, h: 1.3, d: .04, ao: false }); gmesh('furnaceMouth', mg, ch.mouth, { shadow: false, parent: node });
  ch.stream = B.MeshBuilder.CreateCylinder('slagStream', { diameterTop: .9, diameterBottom: 1.6, height: 1.3, tessellation: 10 }, S); ch.stream.position.set(c.x, .65, 23); ch.stream.material = ch.mat; ch.stream.isPickable = false; ch.stream.setEnabled(false);
  /* its half of the drains: the slag, an outlet in the wall over it, and the stream from the outlet when it floods */
  const d = c.drain; ch.drain = slagStrip(c.say + 'Drain', d, [[(d[0] + d[2]) / 2 - 6, -29.3], [(d[0] + d[2]) / 2 + 6, -29.3]]);
  gcyl(g.rust, { r0: .45, h: .8, seg: 12, x: c.x, y: 1.5, z: -27.6, rx: Math.PI / 2, ao: false }); gcyl(g.trim, { r0: .55, h: .15, seg: 12, x: c.x, y: 1.5, z: -27.95, rx: Math.PI / 2, ao: false });
  ch.drain.stream = B.MeshBuilder.CreateCylinder('drainStream', { diameterTop: .6, diameterBottom: 1.1, height: 1.4, tessellation: 10 }, S); ch.drain.stream.position.set(c.x, .7, -28.3); ch.drain.stream.material = ch.drain.mat; ch.drain.stream.isPickable = false; ch.drain.stream.setEnabled(false);
  return ch;
}
const HEAT = new B.Color3(1, .45, .12);
/* show a strip's heat: 0 is a dull crust, 1 is pouring */
function showHeat(s, dt) {
  s.mat.emissiveColor.copyFrom(HEAT).scaleInPlace(s.heat * .45); s.glow.level = .16 + s.heat * 1.05;
  if (s.mouth) s.mouth.emissiveColor.copyFrom(s.mouthBase).scaleInPlace(.3 + s.heat * .9);
  for (const l of s.lights) l.intensity = s.heat * 1.8;
  if (s.heat > .5) { s.tex.vOffset += dt * s.heat * .5; s.glow.vOffset = s.tex.vOffset; }   // the slag flows along
}
/* ease a strip's heat toward what it should be: a pulse while warning, full while pouring, cooling slowly */
function heatTo(s, want, dt) { s.heat += (want - s.heat) * Math.min(1, dt * (want > s.heat ? 6 : .45)); showHeat(s, dt); }
const WARN = () => .22 + .2 * (.5 + .5 * Math.sin(G.t * 14));

/* ---------- how the Foundry looks and sounds: dark, warm firelight, soot in the air ---------- */
const LOOK = {
  sky: '#0d0907', fog: '#120c08', fogD: .011, hemiSky: '#a08a74', hemiGround: '#201610', hemiI: .55,
  sun: '#ffcf9a', sunI: .8, sunDir: [-.35, -1, .3], exposure: 1.45, contrast: 1.3, sat: -10, bloomW: .65, bloomT: .5, glowI: 1.05,
  weatherK: .35,   // soot drifting in the air
  env: { zenith: [30, 22, 18], horizon: [96, 62, 40], ground: [16, 12, 10], sun: .2, gate: .6 },
};
/* "Metalurgists at the foundry": the first 3 min 40 s (the rest of the recording is near silence), turned up, since it was recorded quietly.
   Over it, now and then, the "Carbon foundry" stinger swells up. */
const AMBIENCE = [{ name: 'ambFoundry', url: 'sfx/ambience-foundry.mp3', from: 0, to: 220, gain: 9 },
  { name: 'ambFoundryStinger', url: 'sfx/ambience-foundry-stinger.mp3', from: .3, to: 15.4, gain: .9, accent: true, first: [30, 60], every: [70, 140] }];

/* ---------- the Foundry as a survival arena ---------- */
let slag = null, lurkers = [], lurkAt = 0;
const scaled = (hp, min) => Math.round(hp * (1 + .08 * min));   // as tough as a machine arriving at this minute (survival's `tough`)
const pick = (L) => L[Math.floor(Math.random() * L.length)];
/* a husk slumped in a tunnel, at a spot nobody else is using and you can't see (or one of them, at the start) */
function lurk(R, min, anywhere) {
  const P = G.player.pos, free = LURK.spots.filter(([x, z]) => !lurkers.some(h => h.alive && dist2(h.home, { x, z }) < 2) && (anywhere || dist2(P, { x, z }) > 14)); if (!free.length) return;
  const [x, z, face] = pick(free), h = new Husk(x, z, { slumped: true, face, leash: 18, wakeR: 4.5 }); h.maxHp = h.hp = scaled(h.hp, min);
  lurkers.push(R.add(h));
}
export const SURVIVAL = survival({
  num: '03', name: 'The Foundry',
  blurb: 'The machines are built here. Shoot the fabricators down to slow them, or shut them off from the tunnels behind, keep out of the slag when it pours, and kill the menders before they weld the wrecks back together.',
  preparing: 'Firing up the furnaces…', ambience: AMBIENCE, look: LOOK,
  build: buildRegion, gate: GATE, start: { x: 0, z: -6 },
  saveKey: 'relay-gate-survival-foundry-v1',
  /* the same pressure as the city; menders come with the groups from the first minute; the Crucible instead of the Warden */
  tune: { gate: null, menders: { from: 1, max: 3, chance: .45 }, boss: { big: 'crucible' } },
  indoorAt: (x, z) => z > HALL[3] || z < HALL[1],   // everything beyond the hall's north and south walls is tunnel
  /* Out of a running fabricator or the gate, away from you. A walker needs room (the gate, or one of the big fabricators), and the Crucible
     comes through the gate (or, failing that, wherever there's room for it). */
  arrive(p, kind) {
    const live = FABS.filter(F => F.actor && F.actor.alive), from = [{ x: MOUTH.x, z: MOUTH.z, F: null }, ...live.map(F => ({ x: F.spawn.x, z: F.spawn.z, F }))];
    const use = e => { if (e.F) e.F.actor.busy = 1.2; return e; };
    if (kind === 'boss') { const n = G.nav.giant; return n.snap(MOUTH.x, MOUTH.z, 8) || n.snap(0, 0, 12); }
    if (kind === 'walker') { const fit = from.filter(e => !(e.F && e.F.low)).map(e => { const s = G.nav.wide.snap(e.x, e.z, 3); return s && { x: s.x, z: s.z, F: e.F }; }).filter(s => s && dist2(p, s) > 14);
      return fit.length ? use(pick(fit)) : null; }
    const far = from.filter(e => dist2(p, e) > 12), e = use(far.length ? pick(far) : from.slice().sort((a, b) => dist2(p, b) - dist2(p, a))[0]);
    return G.nav.snap(e.x, e.z, 3) || e;
  },
  /* the kill switches, while the fabricator in front of each is running */
  interactables(L) {
    for (const F of FABS) if (F.switchAt && F.actor && F.actor.alive) L.push({ pos: F.switchAt, r: 1.6, label: `Shut down the ${F.say} fabricator`, use: () => F.actor.shutDown() });
  },
  begin(R) {
    now = 0; for (const F of FABS) R.add(new Fabricator(F, FAB.hp));
    slag = { next: SLAG.first, i: Math.floor(Math.random() * 2), on: null, stage: 'idle', t: 0, drainAt: 1e9, drainEnd: 0, drain: null };
    for (const ch of channels) { ch.heat = ch.drain.heat = 0; ch.stream.setEnabled(false); ch.drain.stream.setEnabled(false); showHeat(ch, 0); showHeat(ch.drain, 0); }
    lurkers = []; lurkAt = LURK.every; for (let k = 0; k < 3; k++) lurk(R, 0, true);
  },
  tick(R, run, dt) {
    now = run.time; const min = run.time / 60;
    cuts.update(dt);
    /* fabricators: a destroyed one starts up again after a while; each one down slows the groups */
    let down = 0;
    for (const F of FABS) { const a = F.actor; if (!a || a.alive) continue; down++;
      if (now >= F.backAt) { a.restart(scaled(FAB.hp, min)); down--; R.say(`The ${F.say} fabricator is running again`, '#ff6a5a'); } }
    run.gapK = 1 + FAB.ease * down;
    /* slag: a warning, then a pour down one channel (alternating), and a moment later its half of the drains floods */
    if (slag.stage === 'idle' && now >= slag.next) { const ch = slag.on = channels[slag.i++ % channels.length]; slag.stage = 'warn'; slag.t = SLAG.warn;
      R.say(`Slag pour · the ${ch.say} channel, then the ${ch.say} drains · Get out of them`, '#ffb340'); G.audio.play('whir', { pos: V(ch.x, 2, 22), gain: 1, rate: .5, len: 2.4, fade: .4, hear: 90 }); }
    else if (slag.stage === 'warn') { slag.t -= dt; if (slag.t <= 0) { slag.stage = 'pour'; slag.t = SLAG.pour; const ch = slag.on; ch.stream.setEnabled(true);
      slag.drain = ch.drain; slag.drainAt = now + SLAG.drainLag; slag.drainEnd = slag.drainAt + SLAG.pour;
      G.audio.play('boomSmall', { pos: V(ch.x, 2, 22), gain: 1, rate: .45, hear: 90 }); G.audio.play('powerOn', { pos: V(ch.x, 2, 22), gain: .6, rate: .5, len: 2, fade: .5, hear: 90 }); G.shake = Math.max(G.shake, .25); } }
    else if (slag.stage === 'pour') { slag.t -= dt; burn(slag.on, dt); if (slag.t <= 0) { slag.stage = 'idle'; slag.next = now + SLAG.every; slag.on.stream.setEnabled(false); } }
    const D = slag.drain, flooding = D && now >= slag.drainAt && now < slag.drainEnd;
    if (D) { D.stream.setEnabled(flooding); if (flooding) burn(D, dt); if (now >= slag.drainEnd) slag.drain = null; }
    for (const ch of channels) {
      const cur = ch === slag.on;
      heatTo(ch, cur && slag.stage === 'pour' ? 1 : cur && slag.stage === 'warn' ? WARN() : 0, dt);
      heatTo(ch.drain, ch.drain === D ? (flooding ? 1 : now < slag.drainAt ? WARN() : 0) : cur && slag.stage === 'warn' ? WARN() * .6 : 0, dt);
    }
    /* the tunnels' husks: a woken one joins the run (it hunts you wherever you go, and its wreck is cleared); a fresh one is put down now and then */
    for (const h of lurkers) if (h.state !== 'slumped' && !h.joined) { h.joined = true; h.leash = 1e9; run.mine.push(h); }
    lurkers = lurkers.filter(h => h.alive && !h.joined);
    if (now >= lurkAt) { lurkAt = now + LURK.every; if (lurkers.length < LURK.max) lurk(R, min); }
  },
  stats: run => [[run.kills.fabricator || 0, (run.kills.fabricator || 0) === 1 ? 'Fabricator shut down' : 'Fabricators shut down'], [run.rebuilt, 'Rebuilt by menders']],
});

/* Everything standing in pouring slag burns: you, your squad and the machines (a walker's legs, a husk's, the Crucible's treads first).
   Drones and menders fly over it, and Mara knows to keep out of it. */
function burn(s, dt) {
  const [x0, z0, x1, z1] = s.rect;
  for (const a of G.actors) {
    if (!a.alive || a.untargetable || a === G.ally || a.kind === 'drone' || a.kind === 'mender' || a.kind === 'fabricator') continue;
    if (!inside(s.rect, a.pos.x, a.pos.z, (a.radius || .5) * .5)) continue;
    const part = a.parts ? (a.parts.legs ? 'legs' : a.parts.treads ? 'treads' : 'core') : a.kind === 'husk' ? 'legs' : 'core';
    a.damage(SLAG.dps * dt, a.partAlive && a.partAlive(part) ? part : (a.kind === 'husk' ? 'body' : 'core'), null);
  }
  const alongX = x1 - x0 > z1 - z0;
  if (Math.random() < dt * 30) G.FX.spark(V(alongX ? rand(x0, x1) : (x0 + x1) / 2 + rand(-1, 1), .25, alongX ? (z0 + z1) / 2 + rand(-1, 1) : rand(z0, z1)), 3);
  const P = G.player.pos; G.audio.play('whir', { pos: V(Math.max(x0, Math.min(x1, P.x)), .5, Math.max(z0, Math.min(z1, P.z))), gain: .35, rate: .7, len: .6, gap: .5, key: 'slag' + s.name });
}
