/* The first machine: Origin's boss, and what was found in 1984. It lies opened up on a rig in the central lab until enough of the research
   has been wiped; then it gets up. It is the oldest machine there is, and every one you've fought was copied from some part of it, so it
   fights with all of them: a drone's bolts in a scatter, a husk's lunge, a walker's stomp, the Warden's missiles, the Crucible's hangar,
   and a mender's welding to keep itself going. What it can do is in `can`: Origin switches one off with each terminal you wipe, because
   a thing nobody ever worked out how to build is a thing it never had. */
import { B, G, V, clamp, damp, lerpAngle, angleTo, dist2, rand, clearShot, collide } from './core.js';
import { Geo, gbox, gprism, gcyl, gmesh } from './geo.js';
import { Actor } from './actors.js';
import { nearestHostile } from './combat.js';
import { chase } from './nav.js';
import { cloneMat, announce } from './machines.js';

/* The numbers to tune. Health is before the arena's toughening (survival.js scales it with the clock). */
export const FIRST = {
  hp: 2400, speed: 3.3, keep: 3, regen: 12, regenAfter: 4,   // metres a second, how close it likes to get; health a second it welds back, once it's been left alone that long
  gap: [2.8, 1.7],                                           // seconds between attacks, at full health and nearly dead
  scatter: { warn: .6, pellets: 7, dmg: 6, spread: .1, reach: 22 },
  stomp: { reach: 4.2, r: 4.6, warn: .9, dmg: 24, knock: 2.4 },
  missiles: { n: 5, warn: 1.3, r: 2.3, dmg: 22 },
  lunge: { reach: [5, 13], warn: .45, speed: 17, len: .55, dmg: 20, knock: 2 },
  launch: { every: 16, first: 6, kinds: ['drone', 'drone'] },
  weak: 1.35,                                                // how much harder it is hit once its core logic has been wiped
};

export class FirstMachine extends Actor {
  constructor(x, z) {
    super('machine', FIRST.hp);
    this.kind = 'first'; this.boss = true; this.name = 'The first machine'; this.s = .5; this.radius = 1.3; this.height = 1.6; this.parts = {};
    this.can = { stomp: true, missiles: true, lunge: true, launch: true, regen: true, whole: true };
    this.home = V(x, 0, z); this.phase = 1; this.flash = 0; this.walkPh = 0; this.atkT = 2.5; this.act = null; this.marks = []; this.launchT = FIRST.launch.first; this.deathT = 0;
    this.build(x, z);
  }
  build(x, z) {
    const S = G.scene, me = this;
    this.mat = cloneMat(G.M.mech, 'fmMat'); this.matD = cloneMat(G.M.mechDark, 'fmMatD'); this.eyeMat = cloneMat(G.M.eye, 'fmEye');
    this.heatMat = new B.StandardMaterial('fmHeat', S); this.heatMat.disableLighting = true; this.heatMat.emissiveColor = B.Color3.FromHexString('#ff8a2a');
    const root = this.root = new B.TransformNode('firstMachine', S); root.position.set(x, 0, z);
    const body = this.body = new B.TransformNode('fmBody', S); body.parent = root; body.position.y = 1.55;
    const tag = m => { if (m) { m.metadata = { actor: me, part: 'core' }; m.isPickable = true; } return m; };
    /* the hull: plating on one side only, the other left open where they took it apart, its core showing */
    { const g = Geo(), d = Geo(), h = Geo(), e = Geo();
      gprism(g, [[-1.1, -.4], [.9, -.5], [1.25, -.05], [1, .42], [-.6, .55], [-1.2, .15]], -.75, .1, B.Matrix.Identity(), { ao: false, uv: .6 });
      gprism(d, [[-1, -.34], [.8, -.42], [1.05, 0], [.85, .34], [-.55, .44]], .1, .7, B.Matrix.Identity(), { ao: false, uv: .6 });
      for (let k = 0; k < 4; k++) gbox(d, { x: .74, y: -.3 + k * .2, z: -.7 + k * .3, w: .06, h: .04, d: .9, rx: .2, ao: false });                // ribs across the open side
      gcyl(h, { r0: .26, h: .5, seg: 10, x: .42, y: .02, z: -.1, rz: Math.PI / 2, ao: false });                                                  // the core
      gbox(d, { x: 0, y: .62, z: -.75, w: 1.1, h: .4, d: .7, ao: false }); for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) gcyl(e, { r0: .09, h: .06, seg: 8, x: -.34 + i * .34, y: .56 + j * .2, z: -.39, rx: Math.PI / 2, ao: false });   // the rack on its back
      gprism(g, [[-.38, -.26], [.36, -.24], [.6, 0], [.36, .26], [-.38, .3]], -.38, .38, B.Matrix.Translation(0, .15, 1.45), { ao: false, uv: .8 });   // the head
      gbox(e, { x: 0, y: .17, z: 2.06, w: .5, h: .08, d: .04, ao: false });
      tag(gmesh('fmHull', g, this.mat, { parent: body })); tag(gmesh('fmHullD', d, this.matD, { parent: body })); tag(gmesh('fmCore', h, this.heatMat, { parent: body, shadow: false })); tag(gmesh('fmEye', e, this.eyeMat, { parent: body, shadow: false })); }
    /* two arms that end in blades, and four legs */
    this.arms = [-1, 1].map(s => { const sh = new B.TransformNode('fmArm', S); sh.parent = body; sh.position.set(s * .85, -.1, .9); const g = Geo();
      gbox(g, { x: 0, y: -.35, z: .1, w: .16, h: .8, d: .18, ao: false }); gprism(g, [[0, -.7], [.9, -1.05], [.95, -.95], [.12, -.55]], -.03, .03, B.Matrix.Identity(), { ao: false });
      tag(gmesh('fmArm', g, this.matD, { parent: sh })); return { sh, s }; });
    this.legs = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map(([sx, sz], i) => { const hip = new B.TransformNode('fmHip', S); hip.parent = root; hip.position.set(sx * .95, 1.45, sz * .7); hip.rotation.z = sx * .25;
      const knee = new B.TransformNode('fmKnee', S); knee.parent = hip; knee.position.set(0, -.75, .15); const a = Geo(), b = Geo();
      gbox(a, { x: 0, y: -.36, z: .07, w: .24, h: .85, d: .3, ao: false, uv: .7 }); gbox(b, { x: 0, y: -.36, z: -.05, w: .17, h: .8, d: .2, ao: false, uv: .7 }); gbox(b, { x: 0, y: -.74, z: .08, w: .3, h: .1, d: .46, ao: false });
      tag(gmesh('fmThigh', a, this.mat, { parent: hip })); tag(gmesh('fmShin', b, this.matD, { parent: knee })); return { hip, knee, sx, ph: i === 0 || i === 3 ? 0 : Math.PI }; });
    this.ring = B.MeshBuilder.CreateDisc('fmRing', { radius: FIRST.stomp.r, tessellation: 44 }, S); this.ring.rotation.x = Math.PI / 2; this.ring.material = cloneMat(G.M.ring, 'fmRingM'); this.ring.isPickable = false; this.ring.setEnabled(false); G.glow.addExcludedMesh(this.ring);
    this.meshes = root.getChildMeshes(); this.meshes.forEach(m => { m.receiveShadows = true; });
    this.smokeWreck = G.FX.smokeFrom(this.meshes[0], true);
  }
  partAlive(k) { return k === 'core' && this.alive; }
  hitTargets() { if (!this.alive) return []; const c = this.body.getAbsolutePosition(), ry = this.root.rotation.y;
    return [{ part: 'core', c: c.clone(), r: 1.25 }, { part: 'core', c: c.add(V(Math.sin(ry) * 1.45, .15, Math.cos(ry) * 1.45)), r: .6 }]; }
  takeDamage(d) { this.flash = 1; return d * (this.can.whole ? 1 : FIRST.weak); }
  clearMarks() { this.marks.forEach(m => m.mesh.dispose()); this.marks = []; }
  die(src) { this.deathT = 0; this.boomed = false; this.killer = src; this.act = null; this.ring.setEnabled(false); this.clearMarks(); this.meshes.forEach(m => { m.isPickable = false; });
    G.audio.play('powerOff', { pos: this.pos, gain: 1, rate: .75, hear: 100, len: 3, fade: .6 }); }
  update(dt) {
    const F = FIRST, p = this.pos;
    this.flash = Math.max(0, this.flash - dt * 5); this.mat.emissiveColor.set(this.flash * .09, this.flash * .06, this.flash * .04); this.matD.emissiveColor.set(this.flash * .07, this.flash * .05, this.flash * .03);
    /* missiles already in the air land whatever becomes of it */
    for (const mk of [...this.marks]) { mk.t -= dt; const k = clamp(1 - mk.t / F.missiles.warn, 0, 1); mk.mesh.scaling.set(.4 + k * .6, .4 + k * .6, 1);
      if (mk.t <= 0) { G.FX.explode(V(mk.x, .5, mk.z), .6); G.FX.blast(V(mk.x, .3, mk.z), .6); G.CB.blast(V(mk.x, 0, mk.z), F.missiles.r, F.missiles.dmg, this); mk.mesh.dispose(); this.marks.splice(this.marks.indexOf(mk), 1); } }
    if (!this.alive) {
      this.deathT += dt; const k = Math.min(1, this.deathT / 1.8), e = k * k; this.body.position.y = 1.55 - e * 1; this.body.rotation.z = e * .35; this.legs.forEach(l => { l.hip.rotation.z = l.sx * (.25 + e * .9); });
      this.heatMat.emissiveColor.set(1 - e, .5 * (1 - e), .15 * (1 - e)); this.eyeMat.emissiveColor.scaleInPlace(Math.max(0, 1 - dt * 2));
      if (!this.boomed && this.deathT >= 1.8) { this.boomed = true; const c = this.body.getAbsolutePosition(); G.FX.explode(c, 1.6); G.FX.blast(V(c.x, .4, c.z), 1.1); G.FX.debris(c, 12, .8, 1); G.audio.play('boomBig', { pos: p, gain: 1, rate: .9, hear: 100 }); this.smokeWreck.start(); G.game.onMachineDown(this, this.killer); }
      return;
    }
    { const f = this.hp / this.maxHp; this.phase = f < .35 ? 3 : f < .7 ? 2 : 1; }
    if (this.can.regen && this.hp < this.maxHp && G.t - this.lastHurt > F.regenAfter) { this.hp = Math.min(this.maxHp, this.hp + F.regen * dt); if (Math.random() < dt * 8) G.FX.spark(this.body.getAbsolutePosition().add(V(rand(-.8, .8), rand(-.3, .5), rand(-.8, .8))), 3); }
    const P = G.player, T = this.target = P.alive && !P.untargetable ? P : nearestHostile(this, 40), dm = T ? dist2(T.pos, p) : 99;
    announce(this, dt, [['engage', { gain: 1, rate: .8 }], ['powerOn', { gain: .7, rate: .8 }]]);
    const nav = G.nav.wide, A = this.act; let moved = 0, face = T ? angleTo(p, T.pos) : this.root.rotation.y, turn = 5;
    if (this.can.launch && T) { this.launchT -= dt; if (this.launchT <= 0) { this.launchT = F.launch.every; G.game.reinforce(this, F.launch.kinds); G.FX.puffAt(this.body.getAbsolutePosition().add(V(0, .8, 0)), 14); G.audio.play('powerOn', { pos: p, gain: .6, rate: .9, len: 1.2, fade: .3 }); } }
    if (A) { A.t -= dt;
      if (A.kind === 'scatter' && A.t <= 0) { this.act = null; if (T) { const ry = this.root.rotation.y, o = this.body.getAbsolutePosition().add(V(Math.sin(ry) * 2.1, .15, Math.cos(ry) * 2.1)), v = T.vel || { x: 0, z: 0 }, base = V(T.pos.x + v.x * .22, 1.15, T.pos.z + v.z * .22).subtract(o).normalize(), C = F.scatter;
        for (let k = 0; k < C.pellets; k++) G.CB.fire({ from: o, dir: V(base.x + rand(-1, 1) * C.spread, base.y + rand(-.4, .4) * C.spread, base.z + rand(-1, 1) * C.spread).normalize(), speed: 32, dmg: C.dmg, owner: this, kind: 'bolt', life: 1.1, flash: k ? 0 : 1.4 }); G.audio.shot('warden', o); } }
      else if (A.kind === 'stomp') { const k = 1 - Math.max(0, A.t) / F.stomp.warn; this.ring.position.set(p.x, .08, p.z); this.ring.scaling.set(.3 + k * .7, .3 + k * .7, 1); this.ring.material.alpha = .12 + k * .4; this.lift = Math.sin(Math.min(1, k / .85) * Math.PI * .5) * .6;
        if (A.t <= 0) { this.act = null; this.lift = 0; this.ring.setEnabled(false); G.FX.dustAt(V(p.x, .2, p.z), 110); G.shake = Math.max(G.shake, .55); G.CB.blast(p, F.stomp.r, F.stomp.dmg, this, { knock: F.stomp.knock }); G.audio.play('step', { pos: p, gain: .9, rate: .7 }); } }
      else if (A.kind === 'lunge') { const C = F.lunge;
        if (A.t > C.len) turn = 8;   // rearing back, still turning to follow you
        else { face = A.dir; turn = 30; const ox = p.x, oz = p.z; p.x += Math.sin(A.dir) * C.speed * dt; p.z += Math.cos(A.dir) * C.speed * dt; moved = C.speed; collide(p, 1, ox, oz);
          for (const a of G.actors) if (a.alive && !a.untargetable && a.faction === 'player' && !a.raidOnly && !A.hit.has(a) && dist2(a.pos, p) < 2.3 + (a.radius || .5)) { A.hit.add(a); a.damage(C.dmg, 'body', this, a.pos.add(V(0, 1, 0)), { knock: { from: p, force: C.knock } }); G.FX.impact(a.pos.add(V(0, 1, 0)), a.kind ? 'metal' : 'body', V(-Math.sin(A.dir), 0, -Math.cos(A.dir))); }
          if (A.t <= 0) this.act = null; }
        if (A.t > C.len && T) A.dir = angleTo(p, T.pos); }
    } else if (T) {
      /* walking: round the benches to you, and stopping a few metres short */
      if (dm > F.keep) { const to = chase(this, nav, T.pos.x, T.pos.z, dt, 1), dx = to.x - p.x, dz = to.z - p.z, dl = Math.hypot(dx, dz) || 1, sp = F.speed * (this.phase === 3 ? 1.2 : 1), ox = p.x, oz = p.z;
        p.x += dx / dl * sp * dt; p.z += dz / dl * sp * dt; collide(p, 1, ox, oz); moved = sp; if (dm > 6) face = Math.atan2(dx, dz); }
      /* the next attack: a stomp if you're under it, otherwise whichever of the others it still has */
      this.atkT -= dt;
      if (this.atkT <= 0) { const see = clearShot(p, T.pos, 1.3), L = [];
        if (this.can.stomp && dm < F.stomp.reach) L.push('stomp', 'stomp');
        if (see && dm < F.scatter.reach && dm > 3) L.push('scatter');
        if (this.can.lunge && see && dm > F.lunge.reach[0] && dm < F.lunge.reach[1]) L.push('lunge');
        if (this.can.missiles && this.marks.length === 0) L.push('missiles');
        const kind = L[Math.floor(Math.random() * L.length)]; this.atkT = F.gap[1] + (F.gap[0] - F.gap[1]) * this.hp / this.maxHp;
        if (kind === 'scatter') { this.act = { kind, t: F.scatter.warn }; G.audio.play('whir', { pos: p, gain: .6, rate: 1.7, len: .6, fade: .2 }); }
        if (kind === 'stomp') { this.act = { kind, t: F.stomp.warn }; this.ring.setEnabled(true); }
        if (kind === 'lunge') { this.act = { kind, t: F.lunge.warn + F.lunge.len, dir: face, hit: new Set() }; G.audio.play('whir', { pos: p, gain: .7, rate: 1.4, len: .5, fade: .2 }); }
        if (kind === 'missiles') { const targets = G.actors.filter(a => a.alive && !a.untargetable && a.faction === 'player' && !a.raidOnly);
          for (let i = 0; i < F.missiles.n && targets.length; i++) { const t = targets[i % targets.length], v = t.vel || { x: 0, z: 0 }, mx = t.pos.x + v.x * .8 + rand(-3, 3), mz = t.pos.z + v.z * .8 + rand(-3, 3);
            const m = B.MeshBuilder.CreateDisc('mark', { radius: F.missiles.r, tessellation: 28 }, G.scene); m.rotation.x = Math.PI / 2; m.position.set(mx, .09, mz); m.material = G.M.mark; m.isPickable = false; G.glow.addExcludedMesh(m);
            this.marks.push({ mesh: m, t: F.missiles.warn + i * .12, x: mx, z: mz }); }
          G.FX.puffAt(this.body.getAbsolutePosition().add(V(0, .9, 0)), 18); G.audio.play('boomSmall', { pos: p, gain: .6, rate: 1.3 }); } }
    }
    this.root.rotation.y = lerpAngle(this.root.rotation.y, face, damp(turn, dt));
    /* pose: four legs that never quite agree, the body lifting to stomp and dropping its head to lunge */
    const ph0 = this.walkPh; this.walkPh += dt * (moved > 0 ? 2.4 + moved * .5 : .5);
    if (moved > 0 && Math.floor(this.walkPh / Math.PI) > Math.floor(ph0 / Math.PI)) G.audio.play('step', { pos: p, gain: .5, rate: 1.2, vary: true, hear: 60 });
    this.legs.forEach(l => { const sn = Math.sin(this.walkPh + l.ph); l.hip.rotation.x = sn * .32; l.knee.rotation.x = .25 + Math.max(0, -Math.cos(this.walkPh + l.ph)) * .4; l.hip.rotation.z = l.sx * .25; });
    const rear = A && A.kind === 'lunge' && A.t > FIRST.lunge.len, dash = A && A.kind === 'lunge' && !rear;
    this.body.position.y += (1.55 + (this.lift || 0) + Math.sin(this.walkPh * 2) * .04 - this.body.position.y) * damp(14, dt); this.body.rotation.x += ((rear ? -.3 : dash ? .25 : 0) - this.body.rotation.x) * damp(12, dt);
    this.arms.forEach((a, i) => { a.sh.rotation.x += ((rear ? -1.6 : dash ? .5 : Math.sin(G.t * 1.7 + i * 2) * .12) - a.sh.rotation.x) * damp(14, dt); a.sh.setEnabled(this.can.lunge); });
    const heat = (.6 + this.phase * .13) * (1 + Math.sin(G.t * 6) * .1) * (this.can.whole ? 1 : .6 + Math.random() * .4);
    this.heatMat.emissiveColor.set(Math.min(1, heat), Math.min(1, heat * .52), Math.min(1, heat * .14));
    const glow = 1 + this.flash + (A ? 1 : 0), mg = G.machineColor; this.eyeMat.emissiveColor.set(Math.min(1, mg.r * glow), Math.min(1, mg.g * glow), Math.min(1, mg.b * glow));
  }
}
