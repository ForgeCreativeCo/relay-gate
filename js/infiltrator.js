/* The Infiltrator: 1984's boss, and the only machine built to pass for a person, at a distance and in the dark: a tall frame under a long
   coat, with half a face. It doesn't rush you. It walks, always knowing where you are, and it fits through any door you do. When it has a
   clear line it stops and fires a scatter of bolts from the gun in its right arm; let it get close and it swings. Shoot the arm off and it
   can only close in; shoot its legs out and it limps. Hurt enough, it drops to a knee, the coat burns away, and it gets up faster. */
import { B, G, V, clamp, damp, lerpAngle, angleTo, dist2, rand, clearShot, collide } from './core.js';
import { Actor } from './actors.js';
import { nearestHostile } from './combat.js';
import { chase } from './nav.js';
import { cloneMat, announce } from './machines.js';

/* The numbers to tune. Health is before the arena's toughening (survival.js scales it with the clock and with each one you've seen). */
export const INFILTRATOR = {
  hp: 1500, parts: { arm: 200, legs: 240 }, breakCost: 70,
  speed: [3.1, 3.9, 4.6], far: 28, farK: 1.8,   // metres a second in each phase; more than `far` metres from you it strides `farK` times as fast
  shot: { every: [3, 2.5, 1.9], warn: .7, pellets: [6, 7, 8], dmg: 6, spread: .09, reach: 20, min: 4 },   // seconds between blasts by phase, the pause before one, bolts in it, damage each
  slam: { reach: 2.4, warn: .5, dmg: 26, knock: 3.2, every: 1.5 },
  kneel: 2.6,                                   // seconds on one knee between phases: it takes more damage while it's down
};
const PHASE_SAY = { 2: 'The Infiltrator is down on one knee · It won\'t stay there', 3: 'The Infiltrator is coming apart · It\'s faster now' };
const MULT = { arm: 1.2, legs: 1, core: .85 };

export class Infiltrator extends Actor {
  constructor(x, z) {
    super('machine', INFILTRATOR.hp); const I = INFILTRATOR;
    this.kind = 'infiltrator'; this.boss = true; this.name = 'The Infiltrator'; this.s = .45; this.radius = .55; this.height = 1.5;
    this.parts = { arm: { hp: I.parts.arm, max: I.parts.arm, label: 'Gun arm' }, legs: { hp: I.parts.legs, max: I.parts.legs, label: 'Legs' } };
    this.home = V(x, 0, z); this.phase = 1; this.flash = 0; this.stride = 0; this.shotCD = 2; this.slamCD = 0; this.aim = 0; this.swing = 0; this.swung = 0; this.kneel = 0; this.deathT = 0;
    this.phaseSay = ph => PHASE_SAY[ph];
    this.build(x, z);
  }
  build(x, z) {
    const S = G.scene, me = this, MB = B.MeshBuilder;
    this.mat = cloneMat(G.M.mech, 'iMat'); this.matD = cloneMat(G.M.mechDark, 'iMatD'); this.eyeMat = cloneMat(G.M.eye, 'iEye');
    const cloth = (n, hex) => { const m = new B.StandardMaterial(n, S); m.diffuseColor = B.Color3.FromHexString(hex); m.specularColor = new B.Color3(.04, .04, .05); m.maxSimultaneousLights = 8; return m; };
    /* the coat, its lapels and belt a shade lighter so the cut of it shows from above, and a face dull enough that the eye beside it is the bright thing */
    const coat = this.coatMat = cloth('iCoat', '#1b1a20'), trim = this.matL = cloth('iCoatTrim', '#3a3742'), face = this.faceMat = cloth('iFace', '#5e4a3c');
    const cone = (top, bottom, h) => MB.CreateCylinder('iPart', { diameterTop: top, diameterBottom: bottom, height: h, tessellation: 10, cap: B.Mesh.NO_CAP, sideOrientation: B.Mesh.DOUBLESIDE }, S);
    const root = this.root = new B.TransformNode('infiltrator', S); root.position.set(x, 0, z); root.scaling.setAll(1.15);
    const node = (n, p, px, py, pz) => { const t = new B.TransformNode(n, S); t.parent = p; t.position.set(px, py, pz); return t; };
    const add = (m, mat, p, part, pos, rot) => { m.parent = p; m.material = mat; if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); m.metadata = { actor: me, part: part || 'core' }; return m; };
    const box = (w, h, d) => MB.CreateBox('iPart', { width: w, height: h, depth: d }, S), limb = (r, h) => MB.CreateCapsule('iPart', { radius: r, height: h, tessellation: 8, subdivisions: 1 }, S);
    /* what it wears to pass for a person: a long coat with the collar up, trousers, half a face. All of it burns away when it gets back up */
    this.skin = []; const wear = (m, mat, p, part, pos, rot) => { this.skin.push(add(m, mat, p, part, pos, rot)); return m; };
    const pel = this.pel = node('iPel', root, 0, 1, 0), spine = this.spine = node('iSpine', pel, 0, 0, 0);
    add(box(.34, .16, .2), this.matD, pel);
    add(limb(.17, .62), this.mat, spine, 'core', [0, .4, 0]).scaling.set(1.25, 1, .78);
    add(box(.4, .1, .2), this.matD, spine, 'core', [0, .68, 0]);
    for (let k = 0; k < 4; k++) add(box(.3, .025, .23), this.matD, spine, 'core', [0, .26 + k * .09, 0]);   // ribs
    /* the coat's body: broad at the shoulders, taken in at the waist; lapels crossing the chest, and a belt */
    wear(cone(.66, .46, .64), coat, spine, 'core', [0, .42, 0]).scaling.z = .62; wear(box(.6, .06, .3), coat, spine, 'core', [0, .74, -.01]);
    for (const s of [-1, 1]) { wear(MB.CreateSphere('iPart', { diameter: .24, segments: 6 }, S), coat, spine, 'core', [s * .3, .68, 0]).scaling.set(1.1, .8, 1.25); wear(box(.07, .36, .02), trim, spine, 'core', [s * .07, .52, .192], [0, 0, s * .32]); }
    wear(cone(.48, .48, .06), trim, spine, 'core', [0, .11, 0]).scaling.z = .64;
    const neck = this.neck = node('iNeck', spine, 0, .78, .02);
    add(box(.19, .23, .22), this.mat, neck, 'core', [0, .13, .01]); add(box(.2, .07, .16), this.matD, neck, 'core', [0, .01, .04]);
    for (const s of [-1, 1]) add(box(.05, .035, .03), this.eyeMat, neck, 'core', [s * .05, .16, .125]);
    wear(box(.095, .19, .02), face, neck, 'core', [-.05, .125, .137]);                                       // the half of its face that's left
    wear(cone(.36, .26, .16), coat, neck, 'core', [0, .02, -.02]).scaling.z = .85;                            // the collar, turned up
    wear(box(.23, .07, .25), coat, neck, 'core', [0, .275, -.01]); wear(box(.21, .02, .13), coat, neck, 'core', [0, .247, .17], [.12, 0, 0]);   // a flat cap, and its peak
    wear(cone(.46, .84, .82), coat, pel, 'core', [0, -.37, -.02]).scaling.z = .66;                            // the skirt of the coat, flaring to the knee
    wear(box(.02, .8, .02), trim, pel, 'core', [0, -.37, .2], [-.11, 0, 0]);                                  // where it closes at the front
    this.arms = []; this.legs = [];
    for (const s of [-1, 1]) {
      const part = s > 0 ? 'arm' : 'core', sh = node('iSh', spine, s * .31, .66, 0), el = node('iEl', sh, 0, -.36, 0);
      add(limb(.055, .42), this.mat, sh, part, [0, -.17, 0]); add(limb(.05, .4), this.matD, el, part, [0, -.17, 0]); wear(limb(.088, s > 0 ? .4 : .44), coat, sh, part, [0, s > 0 ? -.15 : -.17, 0]);
      /* the gun: a heavy barrel where the forearm ends, a collar round it, and a muzzle that glows with its eyes (brighter as it takes aim) */
      if (s > 0) { add(MB.CreateCylinder('iGun', { diameter: .15, height: .52, tessellation: 8 }, S), G.M.gun, el, part, [0, -.45, 0]); add(MB.CreateCylinder('iGunRing', { diameter: .2, height: .07, tessellation: 8 }, S), this.matD, el, part, [0, -.62, 0]);
        add(box(.18, .14, .18), this.matD, el, part, [0, -.22, 0]); add(MB.CreateCylinder('iGunGlow', { diameter: .1, height: .03, tessellation: 8 }, S), this.eyeMat, el, part, [0, -.72, 0]); this.muzzle = node('iMuzzle', el, 0, -.74, 0); this.elR = el; }
      else for (const k of [-1, 0, 1]) add(box(.025, .18, .035), G.M.gun, el, part, [k * .04, -.44, .02]);
      this.arms.push({ sh, el, s });
      const hip = node('iHip', pel, s * .11, -.02, 0), knee = node('iKnee', hip, 0, -.46, 0);
      add(limb(.07, .5), this.mat, hip, 'legs', [0, -.22, 0]); add(limb(.06, .5), this.matD, knee, 'legs', [0, -.22, 0]); add(box(.11, .07, .27), G.M.gun, knee, 'legs', [0, -.48, .06]);
      wear(limb(.095, .52), coat, hip, 'legs', [0, -.22, 0]); wear(limb(.085, .5), coat, knee, 'legs', [0, -.2, 0]);
      this.legs.push({ hip, knee, s });
    }
    this.meshes = root.getChildMeshes();
    this.meshes.forEach(m => { m.isPickable = true; m.receiveShadows = true; if (m.material !== this.eyeMat) G.sg.addShadowCaster(m); });
  }
  partAlive(k) { return k === 'core' ? this.alive : !!(this.parts[k] && this.parts[k].hp > 0); }
  hitTargets() {
    if (!this.alive) return [];
    const L = [{ part: 'core', c: this.spine.getAbsolutePosition().add(V(0, .5, 0)), r: .6 }];
    if (this.partAlive('arm')) L.push({ part: 'arm', c: this.elR.getAbsolutePosition(), r: .34 });
    for (const l of this.legs) L.push({ part: this.partAlive('legs') ? 'legs' : 'core', c: l.knee.getAbsolutePosition(), r: .3 });
    return L;
  }
  takeDamage(d, part, src, point) {
    let dealt = d * (MULT[part] || .85) * (this.kneel > 0 ? 1.4 : 1); const pt = this.parts[part];
    if (pt && pt.hp > 0) { pt.hp = Math.max(0, pt.hp - dealt); if (pt.hp <= 0) this.breakPart(part, point || this.spine.getAbsolutePosition()); dealt *= .3; }
    this.flash = 1; return dealt;
  }
  breakPart(part, pos) {
    this.hp -= INFILTRATOR.breakCost; G.FX.explode(pos, .35); G.FX.debris(pos, 3, .3, .6); G.audio.play('whir', { pos, gain: .8, rate: .9 });
    if (part === 'arm') { this.arms[1].el.setEnabled(false); this.aim = 0; G.UI.feed('Infiltrator gun arm destroyed · It can only close in now', '#ff6a5a'); }
    if (part === 'legs') G.UI.feed('Infiltrator legs crippled · It limps', '#ff6a5a');
  }
  die(src) {
    this.deathT = 0; this.boomed = false; this.killer = src; this.aim = this.swing = this.kneel = 0;
    this.meshes.forEach(m => { m.isPickable = false; });
    G.audio.play('powerOff', { pos: this.pos, gain: .9, rate: 1.1, hear: 90, len: 2.6, fade: .6 });
  }
  /* a scatter of bolts from the arm, aimed a little ahead of you */
  fire(T) {
    const I = INFILTRATOR.shot, ph = this.phase - 1; this.shotCD = I.every[ph];
    if (!T || !T.alive || T.untargetable || !this.partAlive('arm')) return;
    const o = this.muzzle.getAbsolutePosition().clone(), v = T.vel || { x: 0, z: 0 }, base = V(T.pos.x + v.x * .22, 1.15, T.pos.z + v.z * .22).subtract(o).normalize();
    for (let k = 0; k < I.pellets[ph]; k++) { const d = V(base.x + rand(-1, 1) * I.spread, base.y + rand(-.4, .4) * I.spread, base.z + rand(-1, 1) * I.spread).normalize();
      G.CB.fire({ from: o, dir: d, speed: 34, dmg: I.dmg, owner: this, kind: 'bolt', life: 1, flash: k ? 0 : 1.3 }); }
    G.audio.shot('warden', o);
  }
  /* both arms down on whatever is in front of it */
  slam() {
    const I = INFILTRATOR.slam, ry = this.root.rotation.y, c = V(this.pos.x + Math.sin(ry) * 1.3, 0, this.pos.z + Math.cos(ry) * 1.3); this.slamCD = I.every; this.swung = .3;
    G.CB.blast(c, 2, I.dmg, this, { knock: I.knock }); G.FX.dustAt(V(c.x, .2, c.z), 50); G.shake = Math.max(G.shake, .4); G.audio.play('step', { pos: this.pos, gain: .8, rate: 1.2 });
  }
  update(dt) {
    const I = INFILTRATOR, p = this.pos;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.mat.emissiveColor.set(this.flash * .1, this.flash * .07, this.flash * .05); this.matD.emissiveColor.set(this.flash * .08, this.flash * .05, this.flash * .04);
    if (!this.alive) {
      this.deathT += dt; const k = Math.min(1, this.deathT / 1.1), e = k * k; this.pel.rotation.x = e * 1.45; this.pel.position.y = 1 - e * .82; this.spine.rotation.x = 0;
      const dim = Math.max(0, 1 - this.deathT / 1.6) * (Math.random() < .2 ? .2 : 1), mg = G.machineColor; this.eyeMat.emissiveColor.set(mg.r * dim, mg.g * dim, mg.b * dim);   // the eyes are the last thing to go out
      if (!this.boomed && this.deathT >= 1.6) { this.boomed = true; const c = this.spine.getAbsolutePosition(); G.FX.spark(c, 50); G.FX.puffAt(c, 14); G.game.onMachineDown(this, this.killer); }
      return;
    }
    { const f = this.hp / this.maxHp, ph = f < .3 ? 3 : f < .62 ? 2 : 1;
      if (ph > this.phase) { this.phase = ph; this.kneel = I.kneel; this.aim = this.swing = 0;
        if (this.skin[0].isEnabled()) { const c = this.spine.getAbsolutePosition().add(V(0, .4, 0)); this.skin.forEach(m => m.setEnabled(false)); G.FX.explode(c, .5); G.FX.puffAt(c, 20); }
        G.game.onBossPhase(this, ph); } }
    /* it hunts you; with you down, whatever of yours is nearest */
    const P = G.player, T = this.target = P.alive && !P.untargetable ? P : nearestHostile(this, 30), dm = T ? dist2(T.pos, p) : 99;
    announce(this, dt, [['engage', { gain: .8, rate: 1.3 }]]);
    const arm = this.partAlive('arm'), legs = this.partAlive('legs'); let mv = 0;
    if (this.kneel > 0) this.kneel -= dt;
    else if (this.aim > 0) { this.aim -= dt; if (this.aim <= 0) this.fire(T); }
    else if (this.swing > 0) { this.swing -= dt; if (this.swing <= 0) this.slam(); }
    else if (T) {
      this.shotCD -= dt; this.slamCD -= dt;
      if (dm < I.slam.reach && this.slamCD <= 0) { this.swing = I.slam.warn; G.audio.play('whir', { pos: p, gain: .5, rate: 1.5, len: .5, fade: .2 }); }
      else if (arm && this.shotCD <= 0 && dm > I.shot.min && dm < I.shot.reach && clearShot(p, T.pos, 1.3)) { this.aim = I.shot.warn; G.audio.play('whir', { pos: p, gain: .6, rate: 1.9, len: .7, fade: .2 }); }
      else if (dm > 1.5) mv = I.speed[this.phase - 1] * (legs ? 1 : .55) * (arm ? 1 : 1.15) * (dm > I.far ? I.farK : 1);
    }
    let face = T ? angleTo(p, T.pos) : this.root.rotation.y;
    if (mv > 0) { const to = chase(this, G.nav, T.pos.x, T.pos.z, dt), dx = to.x - p.x, dz = to.z - p.z, dl = Math.hypot(dx, dz) || 1, ox = p.x, oz = p.z;
      p.x += dx / dl * mv * dt; p.z += dz / dl * mv * dt; collide(p, .5, ox, oz); face = Math.atan2(dx, dz); }
    this.root.rotation.y = lerpAngle(this.root.rotation.y, face, damp(mv > 0 ? 6 : 9, dt));
    /* pose: a steady walk; the gun arm comes up to fire, both go up to swing, and it sinks to a knee between phases */
    const s0 = this.stride; this.stride += dt * mv * 1.45; const sn = Math.sin(this.stride), amp = clamp(mv / 3.5, 0, 1), k = damp(12, dt), to = (o, key, v) => { o.rotation[key] += (v - o.rotation[key]) * k; };
    if (mv > 0 && Math.floor(this.stride / Math.PI) > Math.floor(s0 / Math.PI)) G.audio.play('step', { pos: p, gain: .35, rate: 1.5, len: .5, vary: true, hear: 60 });
    const down = this.kneel > 0 ? 1 : 0; this.swung = Math.max(0, this.swung - dt);
    this.pel.position.y += ((down ? .62 : 1 - Math.abs(Math.cos(this.stride)) * .03 * amp) - this.pel.position.y) * k; to(this.pel, 'x', 0);
    to(this.spine, 'x', down ? .7 : this.swing > 0 ? -.2 : this.swung > 0 ? .6 : .08 + amp * .08); to(this.neck, 'x', down ? .5 : -.05);
    this.legs.forEach((l, i) => { const w = l.s > 0 ? sn : -sn, limp = !legs && i === 0 ? .5 : 0; to(l.hip, 'x', down ? (i ? -1.4 : .1) : -w * .5 * amp); to(l.knee, 'x', down ? (i ? 1.5 : 1.3) : Math.max(0, w) * .8 * amp + limp); });
    this.arms.forEach(a => { const gun = a.s > 0, w = a.s > 0 ? -sn : sn;
      to(a.sh, 'x', down ? .2 : this.swing > 0 ? -2.7 : this.swung > 0 ? -.7 : gun && this.aim > 0 ? -1.5 : -w * .35 * amp); to(a.el, 'x', down ? -.3 : this.swing > 0 || (gun && this.aim > 0) ? 0 : -.25); });
    const glow = 1 + this.flash + (this.aim > 0 ? 1.6 * (1 - this.aim / I.shot.warn) : 0) + (this.swing > 0 ? 1 : 0), mg = G.machineColor;
    this.eyeMat.emissiveColor.set(Math.min(1, mg.r * glow), Math.min(1, mg.g * glow + (glow - 1) * .2), Math.min(1, mg.b * glow + (glow - 1) * .2));
  }
}
