/* Machines: scout drones, Hunter Walkers and the Warden, the gate boss. */
import { B, G, V, V3, MT, clamp, damp, lerpAngle, angleTo, dist2, rand, clearShot, inOpen } from './core.js';
import { Geo, gbox, gprism, gcyl, gmesh } from './geo.js';
import { Actor } from './actors.js';
import { nearestHostile } from './combat.js';
import { rollLoot } from './loot.js';

/* Per-machine material copies (so each can flash when hit). They must share the original's textures: cloned DynamicTextures come out blank and never report ready, which leaves the material uncompiled and the machine invisible. */
const TEX_SLOTS = ['albedoTexture', 'metallicTexture', 'diffuseTexture', 'bumpTexture', 'specularTexture', 'emissiveTexture', 'ambientTexture', 'opacityTexture', 'reflectionTexture', 'lightmapTexture'];
const cloneMat = (m, n) => { const c = m.clone(n); for (const k of TEX_SLOTS) if (m[k] && c[k] !== m[k]) { const t = c[k]; c[k] = m[k]; if (t) t.dispose(); } c.maxSimultaneousLights = 8; return c; };
/* A machine locking on to you or Mara announces it once per engagement; it re-arms after it has lost you for a few seconds. */
function announce(self, dt, sounds) {
  const onUs = self.target && self.target.faction === 'player';
  if (onUs && !self.engaged) { self.engaged = true; for (const [sound, opts] of sounds) G.audio.play(sound, Object.assign({ pos: self.pos }, opts)); }
  if (onUs) self.lostT = 0; else if (self.engaged && (self.lostT = (self.lostT || 0) + dt) > 6) self.engaged = false;
}
function pickTarget(self, range) {
  const a = self.lastAttacker;
  if (a && a.alive && !a.untargetable && a.faction !== 'machine' && dist2(a.pos, self.pos) < range * 1.4 && G.t - self.lastHurt < 6) return a;
  return nearestHostile(self, range);
}

/* ---------- scout drone ---------- */
export class Drone extends Actor {
  constructor(x, z, opts = {}) {
    super('machine', 30); this.kind = 'drone'; this.radius = .7;
    const S = G.scene; this.root = new B.TransformNode('drone', S); this.root.position.set(x, 3.2, z);
    this.home = V(x, 0, z); this.alt = rand(2.8, 3.8); this.orbitA = rand(0, 6.28); this.orbitDir = Math.random() < .5 ? 1 : -1; this.cool = rand(1, 2); this.retarget = 0; this.fallV = 0;
    this.mat = cloneMat(G.M.mech, 'droneMat');
    const body = B.MeshBuilder.CreateIcoSphere('dBody', { radius: .42, subdivisions: 1, flat: true }, S); body.scaling.y = .6; body.parent = this.root; body.material = this.mat;
    const shroud = B.MeshBuilder.CreateTorus('dRing', { diameter: 1.3, thickness: .12, tessellation: 12 }, S); shroud.parent = this.root; shroud.material = G.M.mechDark;
    this.rotors = [-1, 1].map(s => { const r = B.MeshBuilder.CreateBox('rotor', { width: .9, height: .02, depth: .08 }, S); r.parent = this.root; r.position.set(s * .65, .12, 0); r.material = G.M.gun; return r; });
    [-1, 1].forEach(s => { const arm = B.MeshBuilder.CreateBox('arm', { width: .5, height: .06, depth: .1 }, S); arm.parent = this.root; arm.position.set(s * .4, .05, 0); arm.material = G.M.mechDark; });
    const eye = B.MeshBuilder.CreateBox('dEye', { width: .26, height: .07, depth: .05 }, S); eye.parent = this.root; eye.position.set(0, 0, .4); eye.material = G.M.eye;
    const gun = B.MeshBuilder.CreateCylinder('dGun', { diameter: .08, height: .5, tessellation: 6 }, S); gun.parent = this.root; gun.rotation.x = Math.PI / 2; gun.position.set(0, -.18, .3); gun.material = G.M.gun;
    this.meshes = this.root.getChildMeshes();
    this.meshes.forEach(m => { m.metadata = { actor: this, part: 'core' }; m.isPickable = true; m.receiveShadows = true; G.sg.addShadowCaster(m); });
    this.flash = 0;
  }
  hitTargets() { return [{ part: 'core', c: this.pos.clone(), r: .85 }]; }
  takeDamage(d) { this.flash = 1; return d; }
  die(src) { this.meshes.forEach(m => { m.isPickable = false; }); this.dying = true; G.game.onMachineDown(this, src); }
  update(dt) {
    const p = this.pos;
    this.rotors.forEach((r, i) => { r.rotation.y += dt * (this.dying ? 8 : 40) * (i ? 1 : -1); });
    this.flash = Math.max(0, this.flash - dt * 6); this.mat.emissiveColor.set(this.flash * .4, this.flash * .4, this.flash * .4);
    if (!this.alive) {
      if (this.dying) { this.fallV += 14 * dt; p.y -= this.fallV * dt; this.root.rotation.z += dt * 6; this.root.rotation.x += dt * 3;
        if (p.y <= .3) { this.dying = false; G.FX.explode(V(p.x, .6, p.z), .45); G.audio.play('boomSmall', { pos: p, gain: .7, vary: true }); G.audio.play('droneDeath', { pos: p, gain: .5, vary: true, fade: .4 }); this.root.setEnabled(false); if (this.lastKiller === undefined) G.drops.scatter(p.x, p.z, rollLoot('drone')); } }
      return;
    }
    this.retarget -= dt; if (this.retarget <= 0) { this.retarget = .7; this.target = pickTarget(this, 20); announce(this, .7, [['whir', { gain: .6, rate: 1.1, gap: 1.5, key: 'droneAlert' }]]); }
    const T = this.target && this.target.alive && !this.target.untargetable ? this.target : null;
    let gx, gz;
    if (T) { this.orbitA += dt * .55 * this.orbitDir; const R0 = 8.5; gx = T.pos.x + Math.cos(this.orbitA) * R0; gz = T.pos.z + Math.sin(this.orbitA) * R0; if (Math.random() < dt * .15) this.orbitDir *= -1; }
    else { this.orbitA += dt * .35; gx = this.home.x + Math.cos(this.orbitA) * 4; gz = this.home.z + Math.sin(this.orbitA) * 4; }
    const hx = gx - this.home.x, hz = gz - this.home.z, hd = Math.hypot(hx, hz); if (hd > 20) { gx = this.home.x + hx / hd * 20; gz = this.home.z + hz / hd * 20; }
    const dx = gx - p.x, dz = gz - p.z, d = Math.hypot(dx, dz), sp = Math.min(d * 2, 7);
    if (d > .1) { p.x += dx / d * sp * dt; p.z += dz / d * sp * dt; }
    p.y += (this.alt + Math.sin(G.t * 2 + this.orbitA) * .25 - p.y) * damp(3, dt);
    const face = T ? angleTo(p, T.pos) : Math.atan2(dx, dz);
    this.root.rotation.y = lerpAngle(this.root.rotation.y, face, damp(6, dt)); this.root.rotation.z = -clamp(dx * .05, -.3, .3);
    this.cool -= dt;
    if (T && this.cool <= 0 && dist2(T.pos, p) < 16) {
      this.cool = rand(1.2, 1.9);
      const from = p.add(V(Math.sin(this.root.rotation.y) * .6, -.2, Math.cos(this.root.rotation.y) * .6)), tgt = T.pos.add(V((T.vel ? T.vel.x : 0) * .3 + rand(-.6, .6), 1.15, (T.vel ? T.vel.z : 0) * .3 + rand(-.6, .6)));
      G.CB.fire({ from, dir: tgt.subtract(from).normalize(), speed: 30, dmg: 5, owner: this, kind: 'bolt', life: 1.4 }); G.audio.shot('drone', p);
    }
  }
}

/* ---------- walkers ---------- */
export class Walker extends Actor {
  constructor(x, z, opts = {}) {
    const boss = !!opts.boss; super('machine', boss ? 1100 : 320);
    this.kind = boss ? 'warden' : 'walker'; this.boss = boss; this.name = boss ? 'The Warden' : 'Hunter Walker'; this.s = boss ? 1.65 : 1; this.radius = 2 * this.s;
    this.parts = boss ? { head: { hp: 110, max: 110, label: 'Sensor' }, guns: { hp: 180, max: 180, label: 'Guns' }, missiles: { hp: 160, max: 160, label: 'Missiles' }, legs: { hp: 220, max: 220, label: 'Legs' } }
      : { head: { hp: 60, max: 60, label: 'Sensor' }, guns: { hp: 90, max: 90, label: 'Guns' }, legs: { hp: 120, max: 120, label: 'Legs' } };
    this.home = V(x, 0, z); this.patrolR = opts.patrolR == null ? 6 : opts.patrolR; this.leash = opts.leash || 14; this.ang = rand(0, 6.28);
    this.alert = 0; this.walkPh = 0; this.blind = 0; this.atkT = 2; this.charge = 0; this.burst = 0; this.burstT = 0; this.stomp = 0; this.stompCD = 0; this.deathT = 0; this.retarget = 0;
    this.missileT = 5; this.marks = []; this.phase = 1; this.spawned = 0; this.flash = 0;
    this.build(x, z);
  }
  build(x, z) {
    const S = G.scene, me = this;
    this.mat = cloneMat(G.M.mech, 'wMat'); this.matD = cloneMat(G.M.mechDark, 'wMatD'); this.eyeMat = cloneMat(G.M.eye, 'wEye'); this.beamMat = cloneMat(G.M.beam, 'wBeam'); this.chargeMat = G.M.charge;
    const root = this.root = new B.TransformNode(this.kind, S); root.position.set(x, 0, z); root.scaling.setAll(this.s);
    const body = this.body = new B.TransformNode('mBody', S); body.parent = root; body.position.y = 3.4;
    const tag = (m, part) => { m.metadata = { actor: me, part }; m.isPickable = true; return m; };
    this.guns = [];
    { const g = Geo(), gd = Geo();
      gprism(g, [[-1.4, -.45], [1.0, -.6], [1.55, -.1], [1.25, .45], [-.6, .65], [-1.5, .2]], -1.1, 1.1, MT(), { ao: false, uv: .6 });
      gprism(gd, [[-1.1, .55], [.9, .4], [.7, .85], [-.9, .95]], -.75, .75, MT(), { ao: false, uv: .6 });
      for (let k = 0; k < 5; k++) gbox(gd, { M: MT(0, .35 + k * .13, -1.45), w: 1.5 - k * .15, h: .08, d: .5, ao: false });
      for (const s of [-1, 1]) {
        gprism(g, [[-.9, -.4], [.7, -.45], [.95, .05], [.6, .4], [-.8, .45]], s > 0 ? 1.1 : -1.5, s > 0 ? 1.5 : -1.1, MT(0, -.05, 0), { ao: false, uv: .6 });
        gcyl(g, { r0: .04, h: 1.2, seg: 5, x: s * .5, y: 1.3, z: -.9, rx: -.25, ao: false });
        for (const zz of [-1, 1]) gcyl(gd, { r0: .32, h: .5, seg: 10, M: MT(0, 0, 0, 0, 0, Math.PI / 2).multiply(MT(s * 1.25, -.25, zz)), ao: false });
        const ga = new B.TransformNode('gunPod', S); ga.parent = body; ga.position.set(s * 1.75, .05, .1);
        const gg = Geo(); gbox(gg, { x: 0, y: 0, z: 0, w: .55, h: .6, d: 1.3, ao: false });
        gcyl(gg, { r0: .09, h: 1.3, seg: 8, M: MT(0, 0, 0, Math.PI / 2, 0, 0).multiply(MT(-s * .07, .1, 1.15)), ao: false });
        gcyl(gg, { r0: .09, h: 1.3, seg: 8, M: MT(0, 0, 0, Math.PI / 2, 0, 0).multiply(MT(s * .09, -.13, 1.15)), ao: false });
        gcyl(gg, { r0: .15, h: .25, seg: 8, M: MT(0, 0, 0, Math.PI / 2, 0, 0).multiply(MT(s * .01, -.01, 1.8)), ao: false });
        const gm = tag(gmesh('gunPod', gg, this.matD, { parent: ga }), 'guns');
        const ch = B.MeshBuilder.CreateSphere('charge', { diameter: .32, segments: 8 }, S); ch.parent = ga; ch.position.set(0, 0, 2); ch.material = this.chargeMat; ch.isPickable = false; ch.setEnabled(false);
        this.guns.push({ node: ga, mesh: gm, charge: ch });
      }
      gcyl(gd, { r0: .3, r1: .25, h: .5, seg: 8, M: MT(0, 0, 0, Math.PI / 2 - .3, 0, 0).multiply(MT(0, .15, 1.35)), ao: false });
      this.hull = tag(gmesh('hull', g, this.mat, { parent: body }), 'core'); tag(gmesh('hullD', gd, this.matD, { parent: body }), 'core'); }
    if (this.boss) {
      const pod = this.pod = new B.TransformNode('pod', S); pod.parent = body; pod.position.set(0, 1.25, -.7);
      const g = Geo(); gbox(g, { x: 0, y: 0, z: 0, w: 1.6, h: .7, d: 1.1, ao: false });
      const gl = Geo(); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) gcyl(gl, { r0: .13, h: .08, seg: 8, M: MT(0, 0, 0, Math.PI / 2 - .5, 0, 0).multiply(MT(-.5 + i * .5, .1 + j * .25, .58)), ao: false });
      this.podMesh = tag(gmesh('pod', g, this.matD, { parent: pod }), 'missiles'); this.podLights = gmesh('podL', gl, this.eyeMat, { parent: pod, shadow: false }); tag(this.podLights, 'missiles');
      const a = Geo(); for (const s of [-1, 1]) gprism(a, [[-.9, .6], [.9, .5], [.7, 1.05], [-.8, 1.1]], s * 1.15 - .2, s * 1.15 + .2, MT(), { ao: false }); tag(gmesh('crest', a, this.mat, { parent: body }), 'core');
    }
    const head = this.head = new B.TransformNode('head', S); head.parent = body; head.position.set(0, .25, 1.75);
    { const g = Geo(); gprism(g, [[-.5, -.32], [.45, -.3], [.75, 0], [.45, .3], [-.5, .36]], -.5, .5, MT(), { ao: false, uv: .8 });
      gbox(g, { x: 0, y: .42, z: -.15, w: .6, h: .12, d: .5, ao: false }); gcyl(g, { r0: .03, h: .9, seg: 4, x: .32, y: .75, z: -.3, rx: -.3, ao: false });
      this.headMesh = tag(gmesh('head', g, this.mat, { parent: head }), 'head');
      const e = Geo(); gprism(e, [[.6, -.06], [.76, -.02], [.76, .06], [.6, .1]], -.36, .36, MT(), { ao: false }); this.eye = tag(gmesh('eye', e, this.eyeMat, { parent: head, shadow: false }), 'head'); }
    const beam = this.beam = B.MeshBuilder.CreateCylinder('beam', { height: 12, diameterTop: .35, diameterBottom: 6, tessellation: 20, cap: B.Mesh.NO_CAP }, S);
    beam.position.y = -6; beam.bakeCurrentTransformIntoVertices(); beam.parent = head; beam.position.set(0, 0, .7); beam.rotation.x = -Math.atan2(1, .55); beam.material = this.beamMat; beam.isPickable = false; G.glow.addExcludedMesh(beam);
    this.legs = [];
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(([sx, sz], i) => {
      const hip = new B.TransformNode('hip', S); hip.parent = root; hip.position.set(sx * 1.55, 3.1, sz * 1.0); hip.rotation.z = sx * .18;
      const knee = new B.TransformNode('knee', S); knee.parent = hip; knee.position.set(0, -1.6, .25);
      const ankle = new B.TransformNode('ankle', S); ankle.parent = knee; ankle.position.set(0, -1.55, -.15);
      const a = Geo(), b = Geo(), c = Geo();
      gprism(a, [[-.3, -1.6], [.3, -1.55], [.35, .15], [0, .3], [-.32, .1]], -.22, .22, MT(), { ao: false, uv: .7 });
      gcyl(a, { r0: .07, h: 1.1, seg: 6, x: sx * -.3, y: -.9, z: .32, rx: .1, ao: false });
      gprism(b, [[-.22, 0], [.22, .05], [.2, -1.5], [-.18, -1.55]], -.17, .17, MT(), { ao: false, uv: .7 });
      gcyl(b, { r0: .24, h: .5, seg: 10, M: MT(0, 0, 0, 0, 0, Math.PI / 2), ao: false });
      gcyl(c, { r0: .17, h: .42, seg: 8, M: MT(0, 0, 0, 0, 0, Math.PI / 2), ao: false });
      for (const ty of [-.45, 0, .45]) gprism(c, [[0, -.18], [.55, -.22], [.6, -.12], [.05, 0]], -.07, .07, MT(0, 0, 0, 0, ty, 0), { ao: false });
      gprism(c, [[-.38, -.2], [0, -.22], [0, -.05], [-.32, -.08]], -.08, .08, MT(), { ao: false });
      [gmesh('thigh', a, this.mat, { parent: hip }), gmesh('shin', b, this.matD, { parent: knee }), gmesh('foot', c, this.mat, { parent: ankle })].forEach(m => tag(m, 'legs'));
      this.legs.push({ hip, knee, ankle, sx, ph: i === 0 || i === 3 ? 0 : Math.PI });
    });
    this.ring = B.MeshBuilder.CreateDisc('stompRing', { radius: 3.9, tessellation: 40 }, S); this.ring.rotation.x = Math.PI / 2; this.ring.material = cloneMat(G.M.ring, 'ringM'); this.ring.isPickable = false; this.ring.setEnabled(false); G.glow.addExcludedMesh(this.ring);
    this.smokeHead = G.FX.smokeFrom(this.headMesh); this.smokeGuns = G.FX.smokeFrom(this.hull); this.smokeWreck = G.FX.smokeFrom(this.hull, true);
  }
  partAlive(k) { return k === 'core' ? this.alive : this.parts[k] && this.parts[k].hp > 0; }
  hitTargets() {
    const L = [], s = this.s; if (!this.alive) return L;
    if (this.partAlive('head')) L.push({ part: 'head', c: this.head.getAbsolutePosition(), r: .8 * s });
    if (this.partAlive('guns')) this.guns.forEach(g => L.push({ part: 'guns', c: g.node.getAbsolutePosition(), r: .75 * s }));
    if (this.boss && this.partAlive('missiles')) L.push({ part: 'missiles', c: this.pod.getAbsolutePosition(), r: .8 * s });
    this.legs.forEach(l => L.push({ part: this.partAlive('legs') ? 'legs' : 'core', c: l.knee.getAbsolutePosition(), r: .6 * s }));
    L.push({ part: 'core', c: this.body.getAbsolutePosition(), r: 1.8 * s }); return L;
  }
  takeDamage(d, part, src, point) {
    const mult = { head: 1.6, guns: 1.25, missiles: 1.3, legs: 1, core: .7 }[part] || .7; let dealt = d * mult;
    const pt = this.parts[part];
    if (pt && pt.hp > 0) { pt.hp = Math.max(0, pt.hp - dealt); if (pt.hp <= 0) this.breakPart(part, point || this.body.getAbsolutePosition()); dealt *= .3; }
    this.flash = 1; return dealt;
  }
  breakPart(part, pos) {
    this.hp -= this.boss ? 60 : 35; G.FX.explode(pos, .5); G.audio.play('whir', { pos, gain: this.boss ? 1 : .85, rate: this.boss ? .62 : .72 });
    const say = (t) => G.UI.feed(`${this.boss ? 'Warden' : 'Walker'} ${t}`, '#ff6a5a');
    if (part === 'head') { this.eye.setEnabled(false); this.beam.setEnabled(false); this.blind = 4; this.smokeHead.start(); say('sensor destroyed · Blind for a moment'); }
    if (part === 'guns') { this.guns.forEach(g => { g.mesh.setEnabled(false); g.charge.setEnabled(false); }); this.charge = this.burst = 0; this.smokeGuns.start(); say('guns destroyed · It will try to stomp'); }
    if (part === 'missiles') { this.pod.setEnabled(false); this.clearMarks(); say('missile pod destroyed'); }
    if (part === 'legs') say('legs crippled · It can barely move');
  }
  clearMarks() { this.marks.forEach(m => m.mesh.dispose()); this.marks = []; }
  die(src) {
    this.deathT = 0; this.guns.forEach(g => g.charge.setEnabled(false)); this.ring.setEnabled(false); this.eye.setEnabled(false); this.beam.setEnabled(false); this.clearMarks();
    this.root.getChildMeshes().forEach(m => { m.isPickable = false; });
    this.smokeHead.stop(); this.smokeGuns.stop();
    /* It powers down and slumps first; the explosion lands as it hits the ground, with the power-off fading out underneath. */
    const rate = this.boss ? .85 : 1; this.boomAt = this.boss ? 1.9 : 1.35; this.boomed = false; this.killer = src;
    G.audio.play('powerOff', { pos: this.pos, gain: this.boss ? .9 : .7, rate, hear: this.boss ? 90 : 60, len: (this.boomAt + .5) * rate, fade: .5 });
  }
  explodeWreck() {
    this.boomed = true;
    G.FX.explode(this.body.getAbsolutePosition(), this.boss ? 2.4 : 1.5); G.audio.play('boomBig', { pos: this.pos, gain: this.boss ? 1 : .8, rate: this.boss ? .85 : 1, hear: this.boss ? 90 : 60 });
    this.smokeWreck.start();
    G.game.onMachineDown(this, this.killer);
  }
  fireBolt(g, T) {
    const o = V3.TransformCoordinates(V(0, 0, 2), g.node.getWorldMatrix()), spread = this.partAlive('head') ? .6 : 1.8, v = T.vel || { x: 0, z: 0 };
    const aim = V(T.pos.x + v.x * .3 + rand(-spread, spread), 1.15, T.pos.z + v.z * .3 + rand(-spread, spread));
    G.CB.fire({ from: o, dir: aim.subtract(o).normalize(), speed: this.boss ? 28 : 26, dmg: this.boss ? 9 : 7, owner: this, kind: 'bolt', life: 1.8 }); G.audio.shot(this.boss ? 'warden' : 'walker', o);
  }
  update(dt) {
    const s = this.s, p = this.pos;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.mat.emissiveColor.set(this.flash * .28, this.flash * .28, this.flash * .28); this.matD.emissiveColor.set(this.flash * .2, this.flash * .2, this.flash * .2);
    if (!this.alive) {
      this.deathT += dt; const k = Math.min(1, this.deathT / this.boomAt), e = k * k;
      if (!this.boomed && this.deathT >= this.boomAt) this.explodeWreck();
      this.body.position.y = 3.4 - e * 1.85; this.body.rotation.x = e * .2; this.body.rotation.z = e * .3;
      this.legs.forEach(l => { l.hip.rotation.z = l.sx * (.18 + e * .85); l.hip.rotation.x = -.3; l.knee.rotation.x = .75 + e * .5; });
      return;
    }
    this.blind = Math.max(0, this.blind - dt); this.stompCD -= dt;
    if (this.boss) { const f = this.hp / this.maxHp, ph = f < .3 ? 3 : f < .62 ? 2 : 1; if (ph > this.phase) { this.phase = ph; G.game.onBossPhase(this, ph); } }
    const sense = this.boss ? 34 : (this.partAlive('head') ? 17 : 9);
    this.retarget -= dt; if (this.retarget <= 0) { this.retarget = .7; this.target = this.blind > 0 ? null : pickTarget(this, sense); announce(this, .7, [['engage', { gain: this.boss ? 1 : .75, rate: this.boss ? .85 : 1 }], ['powerOn', { gain: this.boss ? .8 : .6, rate: this.boss ? .85 : 1 }]]); }
    const T = this.target && this.target.alive && !this.target.untargetable ? this.target : null;
    this.alert += ((T ? 1 : 0) - this.alert) * damp(3, dt);
    const legMul = this.partAlive('legs') ? (this.phase === 3 ? 1.25 : 1) : .35, gunsUp = this.partAlive('guns');
    let tx = null, tz = null, face = null, moved = false;
    const dm = T ? dist2(T.pos, p) : 99;
    if (this.blind > 0) face = this.root.rotation.y + dt * 1.4;
    else if (!T || this.alert < .5) { if (this.patrolR > 0) { this.ang += dt * .9 / Math.max(3, this.patrolR) * legMul; tx = this.home.x + Math.cos(this.ang) * this.patrolR; tz = this.home.z + Math.sin(this.ang) * this.patrolR; } else { tx = this.home.x; tz = this.home.z; } }
    else { face = angleTo(p, T.pos); const want = gunsUp ? (clearShot(p, T.pos, 2) ? 15 : 4) : 2.6 * s; if (dm > want && this.stomp <= 0) { tx = T.pos.x; tz = T.pos.z; } }
    if (tx !== null) { const ddx = tx - p.x, ddz = tz - p.z, dd = Math.hypot(ddx, ddz);
      if (dd > .1) { const sp = Math.min(dd, (this.alert < .5 ? 1.4 : 2.6) * legMul * dt * (this.boss ? 1.15 : 1)); const ox = p.x, oz = p.z; p.x += ddx / dd * sp; p.z += ddz / dd * sp;
        if (!inOpen(p.x, p.z, 1.2 * s)) { p.x = ox; p.z = oz; } if (face === null) face = Math.atan2(ddx, ddz); moved = true; } }
    { const ox = p.x - this.home.x, oz = p.z - this.home.z, od = Math.hypot(ox, oz); if (od > this.leash) { p.x = this.home.x + ox / od * this.leash; p.z = this.home.z + oz / od * this.leash; } }
    if (face !== null) this.root.rotation.y = lerpAngle(this.root.rotation.y, face, damp(2.5, dt));
    const ph0 = this.walkPh; this.walkPh += dt * (moved ? 3.4 * legMul / Math.sqrt(s) : .6);
    /* a foot lands each time the gait passes a quarter-turn (the two leg pairs alternate) */
    if (moved && Math.floor((this.walkPh - Math.PI / 2) / Math.PI) > Math.floor((ph0 - Math.PI / 2) / Math.PI)) G.audio.play('step', { pos: p, gain: this.boss ? .8 : .5, rate: this.boss ? .8 : 1, vary: true });
    /* guns: glow to charge, then a burst */
    const burstN = this.boss ? (this.phase === 3 ? 10 : 8) : 5;
    if (gunsUp && T && this.alert > .6 && this.blind <= 0 && dm < (this.boss ? 26 : 22) && this.charge <= 0 && this.burst <= 0) { this.atkT -= dt; if (this.atkT <= 0) this.charge = .75; }
    if (this.charge > 0) { this.charge -= dt; const sc = .4 + (.75 - Math.max(0, this.charge)) * 1.8; this.guns.forEach(g => { g.charge.setEnabled(true); g.charge.scaling.setAll(sc); });
      if (this.charge <= 0) { this.guns.forEach(g => g.charge.setEnabled(false)); this.burst = burstN; this.burstT = 0; } }
    if (this.burst > 0) { this.burstT -= dt; if (this.burstT <= 0) { if (T) this.fireBolt(this.guns[this.burst % 2], T); this.burst--; this.burstT = this.boss ? .11 : .13; if (this.burst === 0) this.atkT = this.boss ? (this.phase === 3 ? rand(.9, 1.4) : rand(1.3, 2)) : rand(1.5, 2.3); } }
    /* stomp: telegraphed by a ring on the ground */
    let lift = 0;
    if ((!gunsUp || this.boss) && T && this.blind <= 0 && this.stomp <= 0 && this.stompCD <= 0 && dm < 3.4 * s) { this.stomp = .9; this.ring.setEnabled(true); }
    if (this.stomp > 0) { this.stomp -= dt; const k = 1 - Math.max(0, this.stomp) / .9;
      this.ring.position.set(p.x, .08, p.z); this.ring.scaling.set((.3 + k * .7) * s, (.3 + k * .7) * s, 1); this.ring.material.alpha = .12 + k * .4;
      lift = (k < .8 ? Math.sin(k / .8 * Math.PI * .5) : (1 - k) / .2) * .7;
      if (this.stomp <= 0) { this.ring.setEnabled(false); this.stompCD = this.boss ? 3 : 2.4; G.FX.dustAt(V(p.x, .2, p.z), 110); G.shake = Math.max(G.shake, .55);
        G.CB.blast(p, 3.9 * s, this.boss ? 30 : 22, this, { knock: 2.2 }); } }
    /* Warden: missile barrage */
    if (this.boss && this.partAlive('missiles') && this.phase >= 2) {
      this.missileT -= dt;
      if (this.missileT <= 0 && T) { this.missileT = this.phase === 3 ? 4.5 : 6.5;
        const targets = G.actors.filter(a => a.alive && !a.untargetable && a.faction === 'player'); const n = this.phase === 3 ? 7 : 5;
        for (let i = 0; i < n; i++) { const t = targets[i % targets.length], v = t.vel || { x: 0, z: 0 }, x = t.pos.x + v.x * .8 + rand(-3.5, 3.5), z = t.pos.z + v.z * .8 + rand(-3.5, 3.5);
          const m = B.MeshBuilder.CreateDisc('mark', { radius: 2.4, tessellation: 28 }, G.scene); m.rotation.x = Math.PI / 2; m.position.set(x, .09, z); m.material = G.M.mark; m.isPickable = false; G.glow.addExcludedMesh(m);
          this.marks.push({ mesh: m, t: 1.3 + i * .12, x, z }); }
        G.FX.puffAt(this.pod.getAbsolutePosition(), 20); }
      for (const mk of [...this.marks]) { mk.t -= dt; const k = clamp(1 - mk.t / 1.3, 0, 1); mk.mesh.scaling.set(.4 + k * .6, .4 + k * .6, 1);
        if (mk.t <= 0) { G.FX.explode(V(mk.x, .5, mk.z), .6); G.CB.blast(V(mk.x, 0, mk.z), 2.4, 24, this); mk.mesh.dispose(); this.marks.splice(this.marks.indexOf(mk), 1); } }
    }
    /* pose */
    const crip = !this.partAlive('legs');
    this.legs.forEach((l, i) => { const sn = Math.sin(this.walkPh + l.ph), c = Math.cos(this.walkPh + l.ph); l.hip.rotation.x = -.3 + sn * .28; l.knee.rotation.x = .75 + Math.max(0, -c) * .35 + (crip && i === 1 ? .55 : 0); l.ankle.rotation.x = -.45 - sn * .2; l.hip.rotation.z = l.sx * .18; });
    this.body.position.y = 3.4 + Math.sin(this.walkPh * 2) * .06 + lift - (crip ? .35 : 0); this.body.rotation.z = Math.sin(this.walkPh) * .02 + (crip ? .12 : 0); this.body.rotation.x = 0;
    const headUp = this.partAlive('head');
    this.head.rotation.x = headUp ? this.alert * .12 : .45; this.head.rotation.y = headUp ? Math.sin(G.t * .6) * .25 * (1 - this.alert) : Math.sin(G.t * 9) * .08;
    const k = 1 + this.alert * .7 + this.flash * 1.5, mg = G.machineColor;
    this.eyeMat.emissiveColor.set(Math.min(1, mg.r * k + this.flash * .5), Math.min(1, mg.g * k + this.flash * .5), Math.min(1, mg.b * k + this.flash * .5));
    this.beamMat.alpha = .06 + this.alert * .04;
  }
}
