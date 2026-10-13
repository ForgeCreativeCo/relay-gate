/* The Crucible: the Foundry's boss, a tracked forge the size of a house. It drives on two treads, with a furnace at the back, a turret
   with twin cannons, a slag mortar on top of the furnace and a hangar pod on each side. Each of those is a part you can shoot off.
   It shells you with the cannons, lobs molten slag that burns where it lands, launches drones and menders from its hangar once it is
   hurt, vents its furnace at anything that gets too close, and when it is nearly done it rams. */
import { B, G, V, V3, clamp, damp, lerpAngle, angleTo, dist2, rand } from './core.js';
import { Geo, gbox, gprism, gcyl, gmesh } from './geo.js';
import { Actor } from './actors.js';
import { chase } from './nav.js';
import { cloneMat, announce, pickTarget } from './machines.js';

/* The numbers to tune. Health is before the arena's toughening (survival.js scales it with the clock and with each Crucible you've seen). */
export const CRUCIBLE = {
  hp: 2600, parts: { cannons: 280, mortar: 240, hangar: 220, treads: 340 }, breakCost: 90,
  speed: 2.3, turn: .9, keep: 12,                  // metres a second, radians a second, and how far it likes to stay from you while its cannons work
  burst: [12, 12, 16], shotGap: .09, shotDmg: 9,   // cannon rounds a burst in each phase, seconds between them, damage each
  mortar: { every: [8, 6.5, 5], globs: [3, 4, 6], dmg: 22, r: 2.4, pool: 6, poolDps: 14 },   // seconds between salvos and globs in each by phase; a glob's blast; how long its pool burns, and how hard
  hangar: { every: 20, first: 3, launch: ['drone', 'drone', 'mender'] },
  vent: { r: 6.5, dmg: 28, warn: 1.1, every: 4.5 },
  ram: { every: 9, warn: 1.2, speed: 13, dmg: 40, reach: 24 },
};
const PHASE_SAY = { 2: 'The Crucible is launching drones and menders · Watch for slag landing', 3: 'The Crucible is overheating · It will try to ram you' };
const MULT = { cannons: 1.25, mortar: 1.3, hangar: 1.3, treads: 1, core: .7 };

/* slag: shared glowing materials for the globs, the marks where they will land, and the pools they leave */
const slagMats = () => {
  if (!G.M.slag) { const S = G.scene, m = (n, hex, a) => { const x = new B.StandardMaterial(n, S); x.disableLighting = true; x.emissiveColor = B.Color3.FromHexString(hex); if (a != null) { x.alpha = a; x.alphaMode = B.Engine.ALPHA_ADD; x.disableDepthWrite = true; x.backFaceCulling = false; } return x; };
    G.M.slag = m('slag', '#ff8a28'); G.M.slagMark = m('slagMark', '#ff5a1a', .3); G.M.slagPool = m('slagPool', '#ff6a1e', .75); }
  return G.M;
};
const disc = (r, mat, x, z, y = .09) => { const d = B.MeshBuilder.CreateDisc('slagDisc', { radius: r, tessellation: 28 }, G.scene); d.rotation.x = Math.PI / 2; d.position.set(x, y, z); d.material = mat; d.isPickable = false; return d; };

export class Crucible extends Actor {
  constructor(x, z) {
    super('machine', CRUCIBLE.hp);
    this.kind = 'crucible'; this.boss = true; this.name = 'The Crucible'; this.s = 1.5; this.radius = 4.2; this.height = 3;
    this.parts = {}; for (const [k, hp] of Object.entries(CRUCIBLE.parts)) this.parts[k] = { hp, max: hp, label: k[0].toUpperCase() + k.slice(1) };
    this.home = V(x, 0, z); this.phase = 1; this.flash = 0; this.retarget = 0; this.alert = 0;
    this.atkT = 2.5; this.charge = 0; this.burst = 0; this.burstT = 0; this.mortarT = 4; this.hangarT = 0; this.vent = 0; this.ventCD = 2; this.ramCD = 4; this.ram = null;
    this.globs = []; this.pools = []; this.rumbleT = 0; this.deathT = 0;
    this.phaseSay = ph => PHASE_SAY[ph];
    slagMats(); this.build(x, z);
  }
  build(x, z) {
    const S = G.scene, me = this;
    this.mat = cloneMat(G.M.mech, 'cMat'); this.matD = cloneMat(G.M.mechDark, 'cMatD'); this.eyeMat = cloneMat(G.M.eye, 'cEye');
    this.heatMat = new B.StandardMaterial('cHeat', S); this.heatMat.disableLighting = true; this.heatMat.emissiveColor = B.Color3.FromHexString('#ff7a1a');
    const root = this.root = new B.TransformNode('crucible', S); root.position.set(x, 0, z);
    const hull = this.hull = new B.TransformNode('cHull', S); hull.parent = root;
    const tag = (m, part) => { if (m) { m.metadata = { actor: me, part }; m.isPickable = true; } return m; };
    const node = (n, parent, px, py, pz) => { const t = new B.TransformNode(n, S); t.parent = parent; t.position.set(px, py, pz); return t; };
    /* treads: a long box with round ends, cleats along the top, and an armoured skirt */
    { const g = Geo(), sk = Geo();
      for (const s of [-1, 1]) {
        gbox(g, { x: s * 2.75, y: .95, z: 0, w: 1.3, h: 1.3, d: 7.6, ao: false, uv: .5 });
        for (const zz of [-3.8, 3.8]) gcyl(g, { r0: .65, h: 1.3, seg: 12, x: s * 2.75, y: .95, z: zz, rz: Math.PI / 2, ao: false });
        for (let k = -3.6; k <= 3.61; k += .45) gbox(g, { x: s * 2.75, y: 1.63, z: k, w: 1.36, h: .08, d: .18, ao: false });
        gbox(sk, { x: s * 3.47, y: 1.25, z: 0, w: .12, h: .9, d: 7.2, ao: false, uv: .5 });
        for (const zz of [-2.4, 0, 2.4]) gbox(sk, { x: s * 3.55, y: 1.25, z: zz, w: .08, h: .7, d: .5, ao: false });
      }
      tag(gmesh('cTreads', g, this.matD, { parent: hull }), 'treads'); tag(gmesh('cSkirt', sk, this.mat, { parent: hull }), 'treads'); }
    /* the hull, a dozer blade on the front, the deck, and a sensor strip */
    { const g = Geo(), d = Geo(), e = Geo();
      gprism(g, [[-4.3, .8], [3.6, .8], [4.6, 1.7], [4.0, 2.7], [-4.1, 2.7], [-4.5, 1.6]], -2.1, 2.1, B.Matrix.Identity(), { ao: false, uv: .45 });
      gprism(d, [[4.3, .3], [4.9, .4], [5.25, 1.5], [4.75, 1.62], [4.55, .9]], -3.3, 3.3, B.Matrix.Identity(), { ao: false, uv: .45 });
      gbox(d, { x: 0, y: 2.82, z: 0, w: 4.4, h: .25, d: 8.2, ao: false, uv: .45 });
      gbox(e, { x: 0, y: 2.2, z: 4.32, w: 2.4, h: .14, d: .08, ry: 0, rx: -.6, ao: false });
      tag(gmesh('cBody', g, this.mat, { parent: hull }), 'core'); tag(gmesh('cBlade', d, this.matD, { parent: hull }), 'core'); tag(gmesh('cEyeStrip', e, this.eyeMat, { parent: hull, shadow: false }), 'core'); }
    /* the furnace at the back: grilles that glow with its heat, and two stacks */
    const furnace = this.furnace = node('cFurnace', hull, 0, 2.95, -2.6);
    { const g = Geo(), h = Geo(), st = Geo();
      gbox(g, { x: 0, y: 1.1, z: 0, w: 3.0, h: 2.2, d: 2.6, ao: false, uv: .45 });
      for (let y = .45; y < 1.9; y += .32) { gbox(h, { x: 0, y, z: -1.32, w: 2.3, h: .1, d: .05, ao: false }); for (const s of [-1, 1]) gbox(h, { x: s * 1.51, y, z: 0, w: .05, h: .1, d: 1.9, ao: false }); }
      for (const s of [-1, 1]) { gcyl(st, { r0: .32, r1: .28, h: 2.6, seg: 10, x: s * 1.0, y: 2.6, z: -.6, ao: false }); gcyl(h, { r0: .3, h: .1, seg: 10, x: s * 1.0, y: 3.92, z: -.6, ao: false }); }
      tag(gmesh('cFurnace', g, this.mat, { parent: furnace }), 'core'); tag(gmesh('cStacks', st, this.matD, { parent: furnace }), 'core'); tag(gmesh('cGrille', h, this.heatMat, { parent: furnace, shadow: false }), 'core');
      this.stackTop = B.MeshBuilder.CreateBox('cStackTop', { size: .1 }, S); this.stackTop.parent = furnace; this.stackTop.position.set(0, 4.1, -.6); this.stackTop.isVisible = false; this.stackTop.isPickable = false; }
    /* the slag mortar on top of the furnace */
    const mortar = this.mortar = node('cMortar', furnace, 0, 2.2, .2);
    { const g = Geo(); gcyl(g, { r0: .95, h: .4, seg: 14, y: .2, ao: false });
      const tube = this.mortarTube = node('cMortarTube', mortar, 0, .35, 0); tube.rotation.x = .35;
      const t = Geo(), m = Geo(); gcyl(t, { r0: .62, r1: .72, h: 1.8, seg: 14, y: .9, ao: false }); gcyl(t, { r0: .8, h: .25, seg: 14, y: .5, ao: false }); gcyl(m, { r0: .55, h: .05, seg: 14, y: 1.81, ao: false });
      tag(gmesh('cMortarBase', g, this.matD, { parent: mortar }), 'mortar'); tag(gmesh('cMortarTube', t, this.mat, { parent: tube }), 'mortar'); tag(gmesh('cMortarMouth', m, this.heatMat, { parent: tube, shadow: false }), 'mortar');
      this.muzzle = node('cMuzzle', tube, 0, 2, 0); }
    /* the hangar: a launch pod on each side of the deck, with lit doors */
    this.pods = [-1, 1].map(s => { const pod = node('cPod', hull, s * 2.05, 2.95, -1.2), g = Geo(), l = Geo();
      gbox(g, { x: 0, y: .55, z: 0, w: .9, h: 1.1, d: 2.2, ao: false, uv: .5 }); gbox(g, { x: 0, y: 1.15, z: 0, w: 1, h: .1, d: 2.3, ao: false });
      gbox(l, { x: s * .46, y: .55, z: 0, w: .03, h: .7, d: 1.6, ao: false });
      tag(gmesh('cPod', g, this.matD, { parent: pod }), 'hangar'); tag(gmesh('cPodLight', l, this.eyeMat, { parent: pod, shadow: false }), 'hangar');
      return pod; });
    /* the turret and its twin cannons */
    const turret = this.turret = node('cTurret', hull, 0, 2.95, 1.4);
    { const g = Geo(), e = Geo();
      gprism(g, [[-1.4, 0], [1.3, 0], [1.75, .55], [1.25, 1.2], [-1.3, 1.2], [-1.6, .5]], -1.5, 1.5, B.Matrix.Identity(), { ao: false, uv: .5 });
      gbox(e, { x: 0, y: .78, z: 1.53, w: 1.5, h: .12, d: .05, rx: -.5, ao: false });
      tag(gmesh('cTurret', g, this.mat, { parent: turret }), 'core'); tag(gmesh('cTurretEye', e, this.eyeMat, { parent: turret, shadow: false }), 'core'); }
    this.guns = [-1, 1].map(s => { const gn = node('cGun', turret, s * .75, .5, 1.3), g = Geo();
      gcyl(g, { r0: .3, h: .7, seg: 10, z: .1, rx: Math.PI / 2, ao: false }); gcyl(g, { r0: .17, h: 2.8, seg: 10, z: 1.6, rx: Math.PI / 2, ao: false }); gcyl(g, { r0: .26, h: .4, seg: 10, z: 2.9, rx: Math.PI / 2, ao: false });
      const mesh = tag(gmesh('cGun', g, this.matD, { parent: gn }), 'cannons');
      const ch = B.MeshBuilder.CreateSphere('charge', { diameter: .45, segments: 8 }, S); ch.parent = gn; ch.position.set(0, 0, 3.3); ch.material = G.M.charge; ch.isPickable = false; ch.setEnabled(false);
      return { node: gn, mesh, charge: ch, mid: node('cGunMid', gn, 0, 0, 1.6), tip: node('cGunTip', gn, 0, 0, 3.2) }; });
    /* where the treads can be hit, three along each */
    this.treadPts = []; for (const s of [-1, 1]) for (const zz of [-2.8, 0, 2.8]) this.treadPts.push(node('cTreadPt', hull, s * 2.75, .95, zz));
    this.coreAt = node('cCore', hull, 0, 1.9, 0);
    /* the vent's warning ring, and the lane a ram will take */
    this.ring = B.MeshBuilder.CreateDisc('ventRing', { radius: CRUCIBLE.vent.r, tessellation: 48 }, S); this.ring.rotation.x = Math.PI / 2; this.ring.material = cloneMat(G.M.ring, 'cRing'); this.ring.isPickable = false; this.ring.setEnabled(false); G.glow.addExcludedMesh(this.ring);
    this.lane = B.MeshBuilder.CreateGround('ramLane', { width: 6.6, height: 1 }, S); this.lane.parent = root; this.lane.position.y = .08; this.lane.material = this.laneMat = cloneMat(G.M.mark, 'cLane'); this.lane.isPickable = false; this.lane.setEnabled(false); G.glow.addExcludedMesh(this.lane);
    this.smokeGuns = G.FX.smokeFrom(this.turret.getChildMeshes()[0]); this.smokeHead = G.FX.smokeFrom(this.stackTop); this.smokeWreck = G.FX.smokeFrom(this.stackTop, true);
    this.smokeHead.start();   // the stacks always smoke
  }
  partAlive(k) { return k === 'core' ? this.alive : this.parts[k] && this.parts[k].hp > 0; }
  hitTargets() {
    const L = []; if (!this.alive) return L;
    if (this.partAlive('cannons')) for (const g of this.guns) L.push({ part: 'cannons', c: g.mid.getAbsolutePosition(), r: .9 });
    if (this.partAlive('mortar')) L.push({ part: 'mortar', c: this.mortarTube.getAbsolutePosition().add(V(0, .8, 0)), r: 1.15 });
    if (this.partAlive('hangar')) for (const p of this.pods) L.push({ part: 'hangar', c: p.getAbsolutePosition().add(V(0, .55, 0)), r: 1.05 });
    const tr = this.partAlive('treads') ? 'treads' : 'core'; for (const t of this.treadPts) L.push({ part: tr, c: t.getAbsolutePosition(), r: 1.05 });
    L.push({ part: 'core', c: this.furnace.getAbsolutePosition().add(V(0, 1.1, 0)), r: 1.7 });
    L.push({ part: 'core', c: this.coreAt.getAbsolutePosition(), r: 3 });
    return L;
  }
  takeDamage(d, part, src, point) {
    let dealt = d * (MULT[part] || .7); const pt = this.parts[part];
    if (pt && pt.hp > 0) { pt.hp = Math.max(0, pt.hp - dealt); if (pt.hp <= 0) this.breakPart(part, point || this.coreAt.getAbsolutePosition()); dealt *= .3; }
    this.flash = 1;
    if (point) { const c = this.coreAt.getAbsolutePosition(), dx = c.x - point.x, dz = c.z - point.z, l = Math.hypot(dx, dz) || 1, ry = this.root.rotation.y;
      this.joltX = (dx * Math.cos(ry) - dz * Math.sin(ry)) / l; this.joltZ = (dx * Math.sin(ry) + dz * Math.cos(ry)) / l; this.jolt = Math.min(1, (this.jolt || 0) + .15 + d / 90); }
    return dealt;
  }
  breakPart(part, pos) {
    this.hp -= CRUCIBLE.breakCost; G.FX.explode(pos, .8); G.FX.debris(pos, 6, .8, .8); this.jolt = 1; G.audio.play('whir', { pos, gain: 1, rate: .55 });
    const say = t => G.UI.feed(`Crucible ${t}`, '#ff6a5a');
    if (part === 'cannons') { this.guns.forEach(g => { g.mesh.setEnabled(false); g.charge.setEnabled(false); }); this.charge = this.burst = 0; this.smokeGuns.start(); say('cannons destroyed · It will close in to vent and ram'); }
    if (part === 'mortar') { this.mortar.setEnabled(false); say('mortar destroyed · No more slag from above'); }
    if (part === 'hangar') { this.pods.forEach(p => p.setEnabled(false)); say('hangar destroyed · It can\'t launch machines now'); }
    if (part === 'treads') say('treads broken · It can barely move');
  }
  clearMarks() {
    for (const g of this.globs) { g.mark.dispose(); g.glob.dispose(); } this.globs = [];
    for (const p of this.pools) p.mesh.dispose(); this.pools = [];
  }
  die(src) {
    this.deathT = 0; this.boomAt = 2.6; this.boomed = false; this.killer = src; this.popT = 0;
    this.guns.forEach(g => g.charge.setEnabled(false)); this.ring.setEnabled(false); this.lane.setEnabled(false); this.ram = null; this.clearMarks();
    this.root.getChildMeshes().forEach(m => { m.isPickable = false; }); this.smokeGuns.stop();
    G.audio.play('powerOff', { pos: this.pos, gain: 1, rate: .7, hear: 100, len: 3.6, fade: .6 });
  }
  explodeWreck() {
    this.boomed = true; const c = this.coreAt.getAbsolutePosition();
    G.FX.explode(c, 3); G.FX.blast(V(c.x, .5, c.z), 2); G.FX.debris(c, 22, 1.5, 1.4);
    this.mat.albedoColor.scaleInPlace(.4); this.matD.albedoColor.scaleInPlace(.5); this.heat = 1; this.eyeMat.emissiveColor.set(0, 0, 0);
    G.audio.play('boomBig', { pos: this.pos, gain: 1, rate: .75, hear: 100 }); this.smokeHead.stop(); this.smokeWreck.start();
    G.game.onMachineDown(this, this.killer);
  }
  /* everyone on your side standing on the ground (Mara knows to keep out of the slag; drones fly over it) */
  grounded() { return G.actors.filter(a => a.alive && !a.untargetable && a.faction === 'player' && a !== G.ally && a.kind !== 'drone'); }
  fireShot(g, T) {
    const o = g.tip.getAbsolutePosition(), v = T.vel || { x: 0, z: 0 }, aim = V(T.pos.x + v.x * .3 + rand(-.7, .7), 1.15, T.pos.z + v.z * .3 + rand(-.7, .7));
    G.CB.fire({ from: o, dir: aim.subtract(o).normalize(), speed: 30, dmg: CRUCIBLE.shotDmg, owner: this, kind: 'bolt', life: 1.9, flash: 1.6 }); G.audio.shot('warden', o);
  }
  lob(T) {
    const C = CRUCIBLE.mortar, ph = this.phase - 1, from = this.muzzle.getAbsolutePosition(), targets = G.actors.filter(a => a.alive && !a.untargetable && a.faction === 'player'); if (!targets.length) return;
    for (let i = 0; i < C.globs[ph]; i++) { const t = i === 0 ? T : targets[i % targets.length], v = t.vel || { x: 0, z: 0 }, x = t.pos.x + v.x * .8 + rand(-3, 3), z = t.pos.z + v.z * .8 + rand(-3, 3);
      const glob = B.MeshBuilder.CreateSphere('glob', { diameter: .6, segments: 6 }, G.scene); glob.material = G.M.slag; glob.isPickable = false; glob.position.copyFrom(from);
      const T0 = 1.6 + i * .18; this.globs.push({ mark: disc(C.r, G.M.slagMark, x, z), glob, from: from.clone(), x, z, t: T0, T0 }); }
    this.kick = 1; G.FX.puffAt(from, 14); G.FX.spark(from, 16); G.audio.play('boomSmall', { pos: this.pos, gain: .7, rate: .6 });
  }
  update(dt) {
    const p = this.pos, C = CRUCIBLE;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.mat.emissiveColor.set(this.flash * .09, this.flash * .06, this.flash * .04); this.matD.emissiveColor.set(this.flash * .07, this.flash * .05, this.flash * .03);
    this.updateSlag(dt);
    if (!this.alive) {
      this.deathT += dt; const k = Math.min(1, this.deathT / this.boomAt);
      if (!this.boomed) { this.popT -= dt; if (this.popT <= 0) { this.popT = rand(.2, .4); const c = this.coreAt.getAbsolutePosition().add(V(rand(-2.5, 2.5), rand(0, 2), rand(-3.5, 3.5))); G.FX.explode(c, .5); G.audio.play('boomSmall', { pos: c, gain: .7, vary: true }); }
        if (this.deathT >= this.boomAt) this.explodeWreck(); }
      this.heatMat.emissiveColor.set(1 * (1 - k * .7), .48 * (1 - k * .7), .1 * (1 - k * .7));
      if (this.heat > 0) { this.heat = Math.max(0, this.heat - dt / 10); const h = this.heat * this.heat; this.mat.emissiveColor.set(h * .9, h * .26, h * .05); this.matD.emissiveColor.set(h * .7, h * .18, h * .03); this.heatMat.emissiveColor.set(h * .8, h * .3, h * .05); }
      this.hull.position.y = -k * .35; this.hull.rotation.z = k * .06; this.turret.rotation.x = k * .12;
      return;
    }
    { const f = this.hp / this.maxHp, ph = f < .3 ? 3 : f < .62 ? 2 : 1; if (ph > this.phase) { this.phase = ph; if (ph === 2) this.hangarT = C.hangar.first; G.game.onBossPhase(this, ph); } }
    this.retarget -= dt; if (this.retarget <= 0) { this.retarget = .7; this.target = pickTarget(this, 40); announce(this, .7, [['engage', { gain: 1, rate: .7 }], ['powerOn', { gain: .8, rate: .7 }]]); }
    const T = this.target && this.target.alive && !this.target.untargetable ? this.target : null, dm = T ? dist2(T.pos, p) : 99;
    this.alert += ((T ? 1 : 0) - this.alert) * damp(3, dt);
    const treads = this.partAlive('treads'), gunsUp = this.partAlive('cannons'), nav = G.nav.giant;
    const top = C.speed * (this.phase === 3 ? 1.25 : 1) * (treads ? 1 : .35);
    let moved = 0;
    /* ram: the lane lights up, then it charges down it */
    if (this.ram) { const R = this.ram;
      if (R.warn > 0) { R.warn -= dt; this.lane.material.alpha = .2 + (1 - R.warn / C.ram.warn) * .45; if (R.warn <= 0) G.audio.play('engage', { pos: p, gain: 1, rate: .6 }); }
      else { const step = C.ram.speed * dt, fx = Math.sin(this.root.rotation.y), fz = Math.cos(this.root.rotation.y), ox = p.x, oz = p.z;
        p.x += fx * step; p.z += fz * step; R.go += step; moved = C.ram.speed; G.shake = Math.max(G.shake, .25);
        const blocked = !nav.open(p.x, p.z); if (blocked) { p.x = ox; p.z = oz; }
        const F = { x: p.x + fx * 4.8, z: p.z + fz * 4.8 };
        for (const a of this.grounded().concat(G.ally.alive && !G.ally.untargetable ? [G.ally] : [])) if (!R.hit.has(a) && dist2(a.pos, F) < 3.6 + (a.radius || .5)) { R.hit.add(a); a.damage(C.ram.dmg, 'core', this, a.pos.add(V(0, 1, 0)), { knock: { from: p, force: 3.5 } }); G.FX.impact(a.pos.add(V(0, 1, 0)), 'body', V(fx, 0, fz)); }
        if (R.go >= R.len || blocked) { this.ram = null; this.lane.setEnabled(false); this.ramCD = C.ram.every; G.FX.dustAt(V(F.x, .3, F.z), 80); G.shake = Math.max(G.shake, .6); G.audio.play('boomSmall', { pos: p, gain: .8, rate: .5 }); } }
    }
    else {
      /* driving: turn toward the next corner of the way to you, and roll forward as it comes round */
      let tx = null, tz = null; const want = gunsUp ? C.keep : 3;
      if (T && dm > want && this.vent <= 0) { tx = T.pos.x; tz = T.pos.z; } else if (!T) { tx = this.home.x; tz = this.home.z; }
      if (tx !== null && Math.hypot(tx - p.x, tz - p.z) > 1) {
        const to = chase(this, nav, tx, tz, dt, 2), head = Math.atan2(to.x - p.x, to.z - p.z), ry = this.root.rotation.y, diff = lerpAngle(0, head - ry, 1);
        this.root.rotation.y = ry + clamp(diff, -C.turn * dt, C.turn * dt);
        const go = top * Math.max(0, Math.cos(diff)) ** 2, ox = p.x, oz = p.z; p.x += Math.sin(this.root.rotation.y) * go * dt; p.z += Math.cos(this.root.rotation.y) * go * dt; moved = go;
        if (!nav.open(p.x, p.z) && nav.open(ox, oz)) { p.x = ox; p.z = oz; }
      } else if (T) { const diff = lerpAngle(0, angleTo(p, T.pos) - this.root.rotation.y, 1); this.root.rotation.y += clamp(diff, -C.turn * .6 * dt, C.turn * .6 * dt); }
      /* start a ram: the last phase, treads intact, you in front of it at a fair distance with nothing in the way */
      this.ramCD -= dt;
      if (this.phase === 3 && treads && T && this.ramCD <= 0 && this.vent <= 0 && dm > 7 && dm < C.ram.reach && Math.abs(lerpAngle(0, angleTo(p, T.pos) - this.root.rotation.y, 1)) < .3 && nav.line(p.x, p.z, T.pos.x, T.pos.z)) {
        const len = Math.min(dm + 4, C.ram.reach); this.ram = { warn: C.ram.warn, len, go: 0, hit: new Set() };
        this.lane.setEnabled(true); this.lane.scaling.z = len; this.lane.position.z = 4.8 + len / 2; G.UI.feed('The Crucible is about to ram · Get out of its path', '#ff6a5a'); }
    }
    /* treads: a clank as it rolls, and dust kicked up behind */
    if (moved > .3) { this.rumbleT -= dt; if (this.rumbleT <= 0) { this.rumbleT = 3 / (2 + moved); G.audio.play('step', { pos: p, gain: .6, rate: .5, vary: true }); const ry = this.root.rotation.y; for (const s of [-1, 1]) G.FX.dustAt(V(p.x - Math.sin(ry) * 4 + Math.cos(ry) * s * 2.75, .3, p.z - Math.cos(ry) * 4 - Math.sin(ry) * s * 2.75), 6); } }
    /* turret: swings round to you on its own */
    if (T) this.turret.rotation.y = lerpAngle(this.turret.rotation.y, angleTo(p, T.pos) - this.root.rotation.y, damp(2.2, dt));
    /* cannons: they glow to charge, then a long burst */
    if (gunsUp && T && this.alert > .6 && dm < 30 && this.charge <= 0 && this.burst <= 0) { this.atkT -= dt; if (this.atkT <= 0) this.charge = .8; }
    if (this.charge > 0) { this.charge -= dt; const sc = .4 + (.8 - Math.max(0, this.charge)) * 1.8; this.guns.forEach(g => { g.charge.setEnabled(true); g.charge.scaling.setAll(sc); });
      if (this.charge <= 0) { this.guns.forEach(g => g.charge.setEnabled(false)); this.burst = C.burst[this.phase - 1]; this.burstT = 0; } }
    if (this.burst > 0) { this.burstT -= dt; if (this.burstT <= 0) { if (T && gunsUp) this.fireShot(this.guns[this.burst % 2], T); this.burst--; this.burstT = C.shotGap; if (this.burst === 0) this.atkT = this.phase === 3 ? rand(1, 1.5) : rand(1.6, 2.4); } }
    /* mortar: slag lobbed at you and Mara */
    if (this.partAlive('mortar') && T && this.alert > .6) { this.mortarT -= dt; if (this.mortarT <= 0) { this.mortarT = C.mortar.every[this.phase - 1]; this.lob(T); } }
    this.kick = Math.max(0, (this.kick || 0) - dt * 3); this.mortarTube.rotation.x = .35 - this.kick * .3;   // a kick as it fires
    /* hangar: from the second phase it launches machines */
    if (this.phase >= 2 && this.partAlive('hangar')) { this.hangarT -= dt; if (this.hangarT <= 0) { this.hangarT = C.hangar.every; G.game.reinforce(this, C.hangar.launch); this.podFlash = 1; this.pods.forEach(pd => G.FX.puffAt(pd.getAbsolutePosition().add(V(0, 1.2, 0)), 12)); G.audio.play('powerOn', { pos: p, gain: .7, rate: .8, len: 1.4, fade: .3 }); } }
    this.podFlash = Math.max(0, (this.podFlash || 0) - dt * 1.5);
    /* vent: anything that gets close is blasted with furnace heat, after a ring on the ground warns of it */
    this.ventCD -= dt;
    if (!this.ram && this.vent <= 0 && this.ventCD <= 0 && this.grounded().some(a => dist2(a.pos, p) < C.vent.r - .5)) { this.vent = C.vent.warn; this.ring.setEnabled(true); G.audio.play('whir', { pos: p, gain: .8, rate: .45, len: 1.2, fade: .3 }); }
    if (this.vent > 0) { this.vent -= dt; const k = 1 - Math.max(0, this.vent) / C.vent.warn;
      this.ring.position.set(p.x, .09, p.z); this.ring.scaling.set(.25 + k * .75, .25 + k * .75, 1); this.ring.material.alpha = .12 + k * .45;
      if (this.vent <= 0) { this.ring.setEnabled(false); this.ventCD = C.vent.every; const f = this.furnace.getAbsolutePosition().add(V(0, 2, 0));
        G.FX.explode(f, .9); G.FX.dustAt(V(p.x, .2, p.z), 140); G.shake = Math.max(G.shake, .6); G.audio.play('boomSmall', { pos: p, gain: 1, rate: .55 });
        G.CB.blast(p, C.vent.r, C.vent.dmg, this, { knock: 2.6 }); } }
    /* pose: a jolt when hit hard, the furnace's glow climbing with each phase, the eye brightening as it locks on */
    let jx = 0, jz = 0; if (this.jolt > 0) { jx = this.joltZ * this.jolt * .04; jz = -this.joltX * this.jolt * .04; this.jolt = Math.max(0, this.jolt - dt * 5); }
    this.hull.rotation.x = jx + (this.ram && this.ram.warn <= 0 ? -.03 : 0); this.hull.rotation.z = jz; this.hull.position.y = moved > .3 ? Math.sin(G.t * 23) * .02 : 0;
    const heat = (.55 + this.phase * .15) * (1 + Math.sin(G.t * 7) * .08 + (this.vent > 0 ? 1 - this.vent / C.vent.warn : 0) * .8);
    this.heatMat.emissiveColor.set(Math.min(1, heat), Math.min(1, heat * .55), Math.min(1, heat * .14));
    const k = 1 + this.alert * .7 + this.flash * 1.5 + this.podFlash * 2, mg = G.machineColor;
    this.eyeMat.emissiveColor.set(Math.min(1, mg.r * k + this.flash * .5), Math.min(1, mg.g * k + this.flash * .5), Math.min(1, mg.b * k + this.flash * .5));
  }
  /* globs in flight, and the pools of slag they leave burning */
  updateSlag(dt) {
    const C = CRUCIBLE.mortar;
    for (const g of [...this.globs]) { g.t -= dt; const k = clamp(1 - g.t / g.T0, 0, 1);
      g.glob.position.set(g.from.x + (g.x - g.from.x) * k, g.from.y + (.3 - g.from.y) * k + Math.sin(k * Math.PI) * 7, g.from.z + (g.z - g.from.z) * k);
      g.mark.scaling.set(.4 + k * .6, .4 + k * .6, 1);
      if (g.t <= 0) { const at = V(g.x, .4, g.z); G.FX.explode(at, .6); G.FX.spark(at, 30); G.CB.blast(V(g.x, 0, g.z), C.r, C.dmg, this);
        g.mark.dispose(); g.glob.dispose(); this.globs.splice(this.globs.indexOf(g), 1);
        this.pools.push({ mesh: disc(C.r * .9, G.M.slagPool, g.x, g.z, .07), x: g.x, z: g.z, t: C.pool }); } }
    const on = this.grounded();
    for (const pl of [...this.pools]) { pl.t -= dt; const f = Math.min(1, pl.t / 1.5); pl.mesh.scaling.set(f, f, 1);
      for (const a of on) if (dist2(a.pos, pl) < C.r * .9 * f + (a.radius || .5) * .5) a.damage(C.poolDps * dt, 'core', this, a.pos.add(V(0, .3, 0)));
      if (Math.random() < dt * 4) G.FX.spark(V(pl.x + rand(-1.5, 1.5), .2, pl.z + rand(-1.5, 1.5)), 2);
      if (pl.t <= 0) { pl.mesh.dispose(); this.pools.splice(this.pools.indexOf(pl), 1); } }
  }
}
