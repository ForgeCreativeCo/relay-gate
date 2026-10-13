/* Region 03, The Foundry: where the machines are made. One great roofless casting hall: tall walls to the north and east, a low parapet
   on the camera's side so nothing hides you, and the relay gate in the middle of the north wall.
   How it plays: machines come out of five fabricators built into the walls (and the gate). A fabricator can be shot down: it drops scrap,
   the groups come more slowly while it is down, and it starts up again after a while. Two slag channels run the length of the hall from
   the furnaces in the north wall; every so often one pours, and anything standing in it on the ground burns, machines included.
   Menders follow the groups in and weld wrecks back into machines, and the big boss here is the Crucible (crucible.js). */
import { B, G, V, C, R as sr, dist2, rand } from './core.js';
import { Geo, gbox, gcyl, gmesh } from './geo.js';
import { makeMat } from './tex.js';
import { buildGate } from './gate.js';
import { Actor } from './actors.js';
import { cloneMat } from './machines.js';
import { survival } from './survival.js';

/* The hall is one walkable rectangle [x0, z0, x1, z1]; north is +z. */
const HALL = [-36, -26, 36, 26];
const GATE = { x: 0, z: 22.5, y: 4.4 }, MOUTH = { x: 0, z: 18 };
const WALL_H = 7, LOW_H = 1.1;
const ob = (x, z, hw, hd, h) => G.obstacles.push({ x, z, hw, hd, h });

/* The fabricators: where each sits on the inside face of a wall (x, z), which way it faces into the hall (nx, nz), its depth, width and height.
   The two on the camera's side are low, so they don't hide you. */
const FABS = [
  { id: 'nw', say: 'north-west', x: -22, z: 26, nx: 0, nz: -1, d: 4, w: 7, h: 6 },
  { id: 'ne', say: 'north-east', x: 22, z: 26, nx: 0, nz: -1, d: 4, w: 7, h: 6 },
  { id: 'e', say: 'east', x: 36, z: -8, nx: -1, nz: 0, d: 4, w: 7, h: 6 },
  { id: 's', say: 'south', x: 22, z: -26, nx: 0, nz: 1, d: 3, w: 6, h: 3.4, low: true },
  { id: 'w', say: 'west', x: -36, z: 12, nx: 1, nz: 0, d: 3, w: 6, h: 3.4, low: true },
];
for (const F of FABS) { F.cx = F.x + F.nx * (F.d + .75); F.cz = F.z + F.nz * (F.d + .75); F.spawn = { x: F.x + F.nx * (F.d + 2.6), z: F.z + F.nz * (F.d + 2.6) }; }
/* a fabricator's health (toughened with the clock like the machines), seconds until a destroyed one starts up again, and how much longer
   the time between groups gets for each one that is down */
const FAB = { hp: 320, back: 50, ease: .2 };

/* The slag channels, poured from the furnaces in the north wall and draining at the south end. */
const CHANNELS = [{ x: -11, say: 'west' }, { x: 11, say: 'east' }];
const CH_Z = [-22.4, 23.4], CH_W = 2.6;
/* seconds to the first pour, between pours, the warning before one, how long it pours, and the damage a second to anything standing in it */
const SLAG = { first: 35, every: 26, warn: 3, pour: 5, dps: 28 };

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
  die(src) {
    const c = this.core.getAbsolutePosition().clone(), F = this.F;
    G.FX.explode(c, 1); G.FX.debris(c, 6, .6, .8); G.FX.blast(V(c.x, .4, c.z), .8);
    G.audio.play('boomBig', { pos: c, gain: .8, rate: 1.15 }); G.audio.play('powerOff', { pos: c, gain: .7, rate: .8, len: 2, fade: .5 });
    this.core.setEnabled(false); this.smokeWreck.start(); this.meshes.forEach(m => { m.isPickable = false; });
    G.drops.scatter(F.spawn.x, F.spawn.z, [{ scrap: Math.round(rand(15, 25)) }]);
    F.backAt = now + FAB.back;
    G.game.onMachineDown(this, src);
    G.UI.feed(`The ${F.say} fabricator is down · Machines come slower while it's out`, '#1fe0ff');
  }
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
    /* the doorway behind glows while it's running (brighter while it's sending machines out) and flickers dark when it's down */
    const door = up ? .45 + this.busy * .9 : (Math.random() < .03 ? .2 : .03);
    F.glow.emissiveColor.copyFrom(F.glowBase).scaleInPlace(door); F.light.intensity = door * 1.6;
  }
}

/* ---------- the map ---------- */
let channels = [], now = 0;
export function buildRegion(M) {
  const scene = G.scene;
  G.open = [HALL];
  G.flames = [];
  const paint = [];
  for (const c of CHANNELS) for (const s of [-1, 1]) paint.push([c.x + s * 1.75, CH_Z[0], c.x + s * 1.75, CH_Z[1], .14, '220,180,70', .4]);   // hazard lines along the slag
  for (const F of FABS) { const along = F.nz !== 0, hw = F.w / 2 + .4, x = F.x + F.nx * (F.d + 3.2), z = F.z + F.nz * (F.d + 3.2);
    paint.push(along ? [x - hw, z, x + hw, z, .12, '220,180,70', .32] : [x, z - hw, x, z + hw, .12, '220,180,70', .32]); }          // a line in front of each fabricator
  paint.push([-6, 19.5, 6, 19.5, .12, '220,180,70', .3]);                                                                                 // the gate's safety line
  G.decalHints = { paint, skids: [], puddles: [], puddleN: 0,
    scorch: [[-11, 21.5, 2.6], [11, 21.5, 2.6], [0, 19, 2.4], ...FABS.map(F => [F.spawn.x, F.spawn.z, 1.8]), [-11, -21, 1.8], [11, -21, 1.8]],
    oil: [[-26, 0, 1.6], [25, 8, 1.6], [-27, -10, 1.2], [21, -13, 1.2], [5.5, -14, .9]] };

  const S = scene, mat = (n, h, o) => makeMat(S, n, h, o);
  const MAT = {
    floor: mat('fFloor', '#5a554f', { tex: M.crate.albedoTexture, bump: M.crate.bumpTexture, spec: .12, power: 24 }),
    wall: mat('fWall', '#6e6660', { tex: M.conc.diffuseTexture, bump: M.conc.bumpTexture }),
    trim: mat('fTrim', '#3b3936', { tex: M.crate.albedoTexture, bump: M.crate.bumpTexture, spec: .15 }),
    window: mat('fWindow', '#000000', { unlit: true, emissive: '#c8742e' }),
    hot: mat('fHot', '#000000', { unlit: true, emissive: '#9a3a10' }),   // ingots still cooling
  };
  const g = { floor: Geo(), wall: Geo(), trim: Geo(), window: Geo(), hot: Geo(), rust: Geo() };

  /* ---------- the floor, and dark ground outside the parapet ---------- */
  gbox(g.floor, { x: 0, y: -.05, z: 0, w: HALL[2] - HALL[0] + 4, h: .1, d: HALL[3] - HALL[1] + 4, uv: 1 / 3, ao: false, noBottom: true });
  const out = B.MeshBuilder.CreateGround('outside', { width: 260, height: 260 }, S); out.position.set(0, -.08, 0); out.material = mat('fOutside', '#0b0908', { unlit: true }); out.isPickable = false; out.freezeWorldMatrix();

  /* ---------- walls: tall to the north and east, with pilasters, a catwalk, lit windows and pipes; a low parapet to the south and west ---------- */
  gbox(g.wall, { x: 0, y: WALL_H / 2, z: 27, w: 76, h: WALL_H, d: 2, noBottom: true }); ob(0, 27, 38, 1, WALL_H);
  gbox(g.wall, { x: 37, y: WALL_H / 2, z: 0, w: 2, h: WALL_H, d: 56, noBottom: true }); ob(37, 0, 1, 28, WALL_H);
  for (let x = -33; x <= 33; x += 6) { gbox(g.wall, { x, y: WALL_H / 2, z: 25.85, w: .7, h: WALL_H, d: .3, tint: .8, noBottom: true }); gbox(g.window, { x: x + 3, y: 5.9, z: 25.98, w: 3.2, h: .9, d: .04, ao: false }); }
  for (let z = -23; z <= 23; z += 6) { gbox(g.wall, { x: 35.85, y: WALL_H / 2, z, w: .3, h: WALL_H, d: .7, tint: .8, noBottom: true }); if (z < 21) gbox(g.window, { x: 35.98, y: 5.9, z: z + 3, w: .04, h: .9, d: 3.2, ao: false }); }
  gbox(g.trim, { x: 0, y: 4.5, z: 25.4, w: 72, h: .15, d: 1.2, ao: false }); gbox(g.trim, { x: 0, y: 5.4, z: 24.85, w: 72, h: .06, d: .06, ao: false });   // catwalk and its rail
  gbox(g.trim, { x: 35.4, y: 4.5, z: 0, w: 1.2, h: .15, d: 52, ao: false }); gbox(g.trim, { x: 34.85, y: 5.4, z: 0, w: .06, h: .06, d: 52, ao: false });
  for (const [y, r] of [[6.6, .2], [6.95, .14]]) { gcyl(g.rust, { r0: r, h: 72, seg: 8, x: 0, y, z: 25.6, rz: Math.PI / 2, ao: false }); gcyl(g.rust, { r0: r, h: 52, seg: 8, x: 35.6, y, z: 0, rx: Math.PI / 2, ao: false }); }
  gbox(g.trim, { x: 0, y: LOW_H / 2, z: -26.4, w: 73, h: LOW_H, d: .8, noBottom: true }); ob(0, -26.5, 37, .5, LOW_H);
  gbox(g.trim, { x: -36.4, y: LOW_H / 2, z: 0, w: .8, h: LOW_H, d: 53, noBottom: true }); ob(-36.5, 0, .5, 27, LOW_H);
  for (let x = -35; x <= 35; x += 3.5) gcyl(g.rust, { r0: .05, h: .5, seg: 5, x, y: LOW_H + .25, z: -26.4, ao: false });
  for (let z = -25; z <= 25; z += 3.5) gcyl(g.rust, { r0: .05, h: .5, seg: 5, x: -36.4, y: LOW_H + .25, z, ao: false });
  gbox(g.rust, { x: 0, y: LOW_H + .5, z: -26.4, w: 73, h: .06, d: .06, ao: false }); gbox(g.rust, { x: -36.4, y: LOW_H + .5, z: 0, w: .06, h: .06, d: 53, ao: false });
  /* warm lamps high on the walls */
  for (const x of [-30, -16, 16, 30]) G.lightSources.push({ pos: V(x, 5.6, 24.4), color: C('#ffb070'), range: 15, intensity: 1 });
  for (const z of [-20, 0, 16]) G.lightSources.push({ pos: V(34.4, 5.6, z), color: C('#ffb070'), range: 15, intensity: 1 });

  /* ---------- the relay gate, in the middle of the north wall ---------- */
  const gate = buildGate(M, GATE);

  /* ---------- the fabricators' housings: a block in the wall with a glowing doorway (the actor on the front is made each run) ---------- */
  for (const F of FABS) {
    const along = F.nz !== 0, hx = F.x + F.nx * F.d / 2, hz = F.z + F.nz * F.d / 2, W = along ? F.w : F.d, D = along ? F.d : F.w;
    gbox(g.wall, { x: hx, y: F.h / 2, z: hz, w: W, h: F.h, d: D, tint: .75, noBottom: true }); ob(hx, hz, W / 2, D / 2, F.h);
    gbox(g.trim, { x: hx, y: F.h + .1, z: hz, w: W + .3, h: .2, d: D + .3, ao: false });
    const fx = F.x + F.nx * (F.d + .02), fz = F.z + F.nz * (F.d + .02), dw = F.w * .5, dh = F.low ? 1.7 : 2.6;   // the doorway on the front face
    F.glow = makeMat(S, 'fabGlow_' + F.id, '#000000', { unlit: true, emissive: '#ff7a24' }); F.glowBase = F.glow.emissiveColor.clone();
    const gg = Geo(); gbox(gg, { x: fx, y: dh / 2, z: fz, w: along ? dw : .04, h: dh, d: along ? .04 : dw, ao: false }); gmesh('fabDoor_' + F.id, gg, F.glow, { shadow: false, freeze: true });
    for (const s of [-1, 1]) { const ox = along ? s * (dw / 2 + .2) : 0, oz = along ? 0 : s * (dw / 2 + .2);   // the door frame, and hazard posts either side
      gbox(g.trim, { x: fx + ox + F.nx * .15, y: dh / 2, z: fz + oz + F.nz * .15, w: along ? .3 : .3, h: dh + .2, d: along ? .3 : .3, ao: false }); }
    gbox(g.trim, { x: fx + F.nx * .15, y: dh + .15, z: fz + F.nz * .15, w: along ? dw + .7 : .3, h: .3, d: along ? .3 : dw + .7, ao: false });
    F.light = { pos: V(F.spawn.x, 1.6, F.spawn.z), color: C('#ff8a3a'), range: 9, intensity: .7, flicker: true }; G.lightSources.push(F.light);
  }

  /* ---------- the furnaces and the slag channels ---------- */
  channels = CHANNELS.map(c => makeChannel(M, MAT, g, c));

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

/* A slag channel: a furnace in the north wall with a glowing mouth, a stream it pours, curbs either side of a long trough of slag,
   a drain at the south end, and lights that come up as it heats. */
function makeChannel(M, MAT, g, c) {
  const S = G.scene, L = CH_Z[1] - CH_Z[0], mid = (CH_Z[0] + CH_Z[1]) / 2;
  /* the slag: dark crust with veins, lit from within as it heats (the same picture carries both) */
  const tex = new B.DynamicTexture('slagTex_' + c.say, { width: 64, height: 256 }, S, true), ctx = tex.getContext();
  ctx.fillStyle = 'rgb(34,22,16)'; ctx.fillRect(0, 0, 64, 256);
  for (let k = 0; k < 28; k++) { ctx.strokeStyle = `rgba(255,${150 + (k % 5) * 18},70,${(.35 + Math.random() * .6).toFixed(2)})`; ctx.lineWidth = 1 + Math.random() * 3; ctx.beginPath();
    let x = Math.random() * 64; ctx.moveTo(x, -10); for (let y = 0; y <= 266; y += 16) { x += (Math.random() - .5) * 14; ctx.lineTo(x, y); } ctx.stroke(); }
  tex.update(); tex.vScale = L / 5;
  /* the glow is a second copy of the picture: Babylon adds an emissive texture at its own level, so that level is what the heat turns up */
  const glow = new B.DynamicTexture('slagGlow_' + c.say, { width: 64, height: 256 }, S, true); glow.getContext().drawImage(ctx.canvas, 0, 0); glow.update(); glow.vScale = L / 5; glow.level = 0;
  const m = new B.StandardMaterial('slag_' + c.say, S); m.diffuseColor = C('#221813'); m.diffuseTexture = tex; m.emissiveTexture = glow; m.emissiveColor = new B.Color3(0, 0, 0); m.specularColor = new B.Color3(.05, .04, .03); m.maxSimultaneousLights = 8;
  const bed = B.MeshBuilder.CreateGround('slagBed_' + c.say, { width: CH_W, height: L }, S); bed.position.set(c.x, .02, mid); bed.material = m; bed.isPickable = false; bed.receiveShadows = true; bed.freezeWorldMatrix();
  for (const s of [-1, 1]) gbox(g.trim, { x: c.x + s * (CH_W / 2 + .15), y: .11, z: mid, w: .3, h: .22, d: L, ao: false });   // curbs (low enough to step over)
  gbox(g.trim, { x: c.x, y: .03, z: CH_Z[0] - .4, w: CH_W + .6, h: .06, d: .8, ao: false });                               // the drain
  for (let k = -1; k <= 1; k++) gbox(g.rust, { x: c.x + k * .7, y: .07, z: CH_Z[0] - .4, w: .12, h: .04, d: .7, ao: false });
  /* the furnace that feeds it */
  gbox(g.wall, { x: c.x, y: 3.75, z: 24.7, w: 5.5, h: 7.5, d: 2.6, tint: .7, noBottom: true }); ob(c.x, 24.7, 2.75, 1.3, 7.5);
  gbox(g.trim, { x: c.x, y: 1.1, z: 23.1, w: 3.4, h: .3, d: .9, ao: false });   // the spout's lip
  for (const s of [-1, 1]) gcyl(g.rust, { r0: .35, h: 3, seg: 10, x: c.x + s * 1.8, y: 8.6, z: 25.2, ao: false });
  const mouth = makeMat(S, 'furnaceMouth_' + c.say, '#000000', { unlit: true, emissive: '#ff8a2a' }), mg = Geo();
  gbox(mg, { x: c.x, y: 1.9, z: 23.38, w: 2.6, h: 1.3, d: .04, ao: false }); gmesh('furnaceMouth', mg, mouth, { shadow: false, freeze: true });
  const stream = B.MeshBuilder.CreateCylinder('slagStream', { diameterTop: .9, diameterBottom: 1.6, height: 1.3, tessellation: 10 }, S); stream.position.set(c.x, .65, 23); stream.material = m; stream.isPickable = false; stream.setEnabled(false);
  const lights = [16, 0, -16].map(z => { const s = { pos: V(c.x, 1.2, z), color: C('#ff7a2a'), range: 12, intensity: 0, flicker: true }; G.lightSources.push(s); return s; });
  return Object.assign({ mat: m, tex, glow, mouth, mouthBase: mouth.emissiveColor.clone(), stream, lights, heat: 0 }, c);
}
const HEAT = new B.Color3(1, .45, .12);
/* show a channel's heat: 0 is a dull crust, 1 is pouring */
function showHeat(ch, dt) {
  ch.mat.emissiveColor.copyFrom(HEAT).scaleInPlace(ch.heat * .45); ch.glow.level = .16 + ch.heat * 1.05;
  ch.mouth.emissiveColor.copyFrom(ch.mouthBase).scaleInPlace(.3 + ch.heat * .9);
  for (const s of ch.lights) s.intensity = ch.heat * 1.8;
  if (ch.heat > .5) { ch.tex.vOffset += dt * ch.heat * .5; ch.glow.vOffset = ch.tex.vOffset; }   // the slag flows south
}

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
let slag = null;
const scaled = (min) => Math.round(FAB.hp * (1 + .08 * min));   // as tough as a machine arriving at this minute (survival's `tough`)
const pick = (L) => L[Math.floor(Math.random() * L.length)];
export const SURVIVAL = survival({
  num: '03', name: 'The Foundry',
  blurb: 'The machines are built here. Shoot the fabricators down to slow them, keep out of the slag when it pours, and kill the menders before they weld the wrecks back together.',
  preparing: 'Firing up the furnaces…', ambience: AMBIENCE, look: LOOK,
  build: buildRegion, gate: GATE, start: { x: 0, z: -6 },
  saveKey: 'relay-gate-survival-foundry-v1',
  /* the same pressure as the city; menders come with the groups from the first minute; the Crucible instead of the Warden */
  tune: { gate: null, menders: { from: 1, max: 3, chance: .45 }, boss: { big: 'crucible' } },
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
  begin(R) {
    now = 0; for (const F of FABS) R.add(new Fabricator(F, FAB.hp));
    slag = { next: SLAG.first, i: Math.floor(Math.random() * 2), on: null, stage: 'idle', t: 0 };
    for (const ch of channels) { ch.heat = 0; ch.stream.setEnabled(false); showHeat(ch, 0); }
  },
  tick(R, run, dt) {
    now = run.time; const min = run.time / 60;
    /* fabricators: a destroyed one starts up again after a while; each one down slows the groups */
    let down = 0;
    for (const F of FABS) { const a = F.actor; if (!a || a.alive) continue; down++;
      if (now >= F.backAt) { a.restart(scaled(min)); down--; R.say(`The ${F.say} fabricator is running again`, '#ff6a5a'); } }
    run.gapK = 1 + FAB.ease * down;
    /* slag: a warning, then a pour down one channel, alternating */
    if (slag.stage === 'idle' && now >= slag.next) { const ch = slag.on = channels[slag.i++ % channels.length]; slag.stage = 'warn'; slag.t = SLAG.warn;
      R.say(`Slag pour · the ${ch.say} channel · Get out of it`, '#ffb340'); G.audio.play('whir', { pos: V(ch.x, 2, 22), gain: 1, rate: .5, len: 2.4, fade: .4, hear: 90 }); }
    else if (slag.stage === 'warn') { slag.t -= dt; if (slag.t <= 0) { slag.stage = 'pour'; slag.t = SLAG.pour; const ch = slag.on; ch.stream.setEnabled(true);
      G.audio.play('boomSmall', { pos: V(ch.x, 2, 22), gain: 1, rate: .45, hear: 90 }); G.audio.play('powerOn', { pos: V(ch.x, 2, 22), gain: .6, rate: .5, len: 2, fade: .5, hear: 90 }); G.shake = Math.max(G.shake, .25); } }
    else if (slag.stage === 'pour') { slag.t -= dt; const ch = slag.on; burn(ch, dt);
      if (slag.t <= 0) { slag.stage = 'idle'; slag.next = now + SLAG.every; ch.stream.setEnabled(false); } }
    for (const ch of channels) {
      const cur = ch === slag.on, want = cur && slag.stage === 'pour' ? 1 : cur && slag.stage === 'warn' ? .22 + .2 * (.5 + .5 * Math.sin(G.t * 14)) : 0;
      ch.heat += (want - ch.heat) * Math.min(1, dt * (want > ch.heat ? 6 : .45)); showHeat(ch, dt);
    }
  },
  stats: run => [[run.kills.fabricator || 0, (run.kills.fabricator || 0) === 1 ? 'Fabricator shut down' : 'Fabricators shut down'], [run.rebuilt, 'Rebuilt by menders']],
});

/* Everything standing in a pouring channel burns: you, your squad and the machines (a walker's legs, a husk's, the Crucible's treads first).
   Drones and menders fly over it, and Mara knows to keep out of it. */
function burn(ch, dt) {
  const hw = CH_W / 2;
  for (const a of G.actors) {
    if (!a.alive || a.untargetable || a === G.ally || a.kind === 'drone' || a.kind === 'mender' || a.kind === 'fabricator') continue;
    const p = a.pos, r = (a.radius || .5) * .5; if (Math.abs(p.x - ch.x) > hw + r || p.z < CH_Z[0] - r || p.z > CH_Z[1] + r) continue;
    const part = a.parts ? (a.parts.legs ? 'legs' : a.parts.treads ? 'treads' : 'core') : a.kind === 'husk' ? 'legs' : 'core';
    a.damage(SLAG.dps * dt, a.partAlive && a.partAlive(part) ? part : (a.kind === 'husk' ? 'body' : 'core'), null);
  }
  if (Math.random() < dt * 30) G.FX.spark(V(ch.x + rand(-1, 1), .25, rand(CH_Z[0], CH_Z[1])), 3);
  if (Math.random() < dt * 8) G.FX.spark(V(ch.x, 1.4, 23), 8);
  const P = G.player.pos; G.audio.play('whir', { pos: V(ch.x, .5, Math.max(CH_Z[0], Math.min(CH_Z[1], P.z))), gain: .35, rate: .7, len: .6, gap: .5, key: 'slag' });
}
