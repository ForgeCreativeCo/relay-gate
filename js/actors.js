/* People: the player, Mara (your recruit) and the raiders. */
import { B, G, V, V3, MT, clamp, damp, lerpAngle, angleTo, dist2, collide, clearShot, rand, inOpen } from './core.js';
import { Geo, gbox, gcyl, gmesh } from './geo.js';
import { nearestHostile, hostile } from './combat.js';
import { wstats, TIERS, rollLoot } from './loot.js';

/* ---------- shared base ---------- */
export class Actor {
  constructor(faction, maxHp) { this.faction = faction; this.maxHp = maxHp; this.hp = maxHp; this.alive = true; this.radius = .5; this.height = 1.25; this.lastHurt = -99; }
  get pos() { return this.root.position; }
  hitTargets() { return [{ part: 'body', c: this.pos.add(V(0, this.height, 0)), r: .55 }]; }
  damage(d, part, src, point, opt) {
    if (!this.alive) return 0;
    if (this.dormant) this.dormant = false;
    const dealt = this.takeDamage ? this.takeDamage(d, part, src, point, opt) : d;
    this.hp -= dealt; this.lastHurt = G.t; this.lastAttacker = src;
    if (this.hp <= 0) { this.hp = 0; this.alive = false; this.die(src); if (src === G.player) G.player.onKill(this); }
    return dealt;
  }
  die() {}
}

/* ---------- the human model ---------- */
function limb(parent, r, len, material) { const m = B.MeshBuilder.CreateCapsule('limb', { radius: r, height: len, tessellation: 8, subdivisions: 1 }, G.scene); m.parent = parent; m.position.y = -len / 2 + r; m.material = material; return m; }
export function humanModel(o) {
  const S = G.scene, root = new B.TransformNode('human', S), pel = new B.TransformNode('pelvis', S); pel.parent = root; pel.position.y = .94;
  const add = (m, mat, p) => { m.parent = p || pel; m.material = mat; return m; };
  add(B.MeshBuilder.CreateCapsule('torso', { radius: .21, height: .72, tessellation: 10 }, S), o.cloth).position.y = .38;
  const chest = add(B.MeshBuilder.CreateCapsule('chest', { radius: .25, height: .56, tessellation: 10 }, S), o.armor); chest.position.set(0, .44, .02); chest.scaling.set(1.12, 1, .78);
  const belt = add(B.MeshBuilder.CreateCylinder('belt', { diameter: .44, height: .08, tessellation: 12 }, S), G.M.gun); belt.position.y = .1; belt.scaling.z = .8;
  [-.12, .12].forEach(x => { add(B.MeshBuilder.CreateBox('pouch', { width: .1, height: .12, depth: .07 }, S), o.cloth).position.set(x, .32, .22); });
  if (o.cross) { const c1 = add(B.MeshBuilder.CreateBox('cross', { width: .16, height: .05, depth: .02 }, S), G.M.visor); c1.position.set(0, .55, .22); const c2 = add(B.MeshBuilder.CreateBox('cross', { width: .05, height: .16, depth: .02 }, S), G.M.visor); c2.position.set(0, .55, .22); }
  const neck = new B.TransformNode('neck', S); neck.parent = pel; neck.position.y = .84;
  add(B.MeshBuilder.CreateSphere('head', { diameter: .28, segments: 10 }, S), G.M.skin, neck);
  if (o.helmet) add(B.MeshBuilder.CreateSphere('helmet', { diameter: .36, segments: 10, slice: .55 }, S), o.armor, neck).position.y = .02;
  else { add(B.MeshBuilder.CreateSphere('hood', { diameter: .36, segments: 10, slice: .65 }, S), o.cloth, neck).position.set(0, 0, -.02);
    add(B.MeshBuilder.CreateTorus('scarf', { diameter: .3, thickness: .1, tessellation: 12 }, S), o.scarf || G.M.scarf, neck).position.y = -.14; }
  add(B.MeshBuilder.CreateBox('visor', { width: .22, height: .05, depth: .05 }, S), o.visor, neck).position.set(0, .01, .14);
  const pack = add(B.MeshBuilder.CreateCapsule('pack', { radius: .15, height: .48, tessellation: 8 }, S), o.cloth); pack.position.set(0, .45, -.27); pack.scaling.x = 1.5;
  const roll = add(B.MeshBuilder.CreateCylinder('roll', { diameter: .16, height: .46, tessellation: 8 }, S), o.armor); roll.position.set(0, .74, -.27); roll.rotation.z = Math.PI / 2;
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = new B.TransformNode('hip', S); hip.parent = pel; hip.position.set(s * .11, 0, 0);
    limb(hip, .085, .5, o.cloth); const knee = new B.TransformNode('knee', S); knee.parent = hip; knee.position.y = -.46;
    limb(knee, .075, .48, o.cloth); add(B.MeshBuilder.CreateBox('boot', { width: .14, height: .12, depth: .27 }, S), G.M.gun, knee).position.set(0, -.48, .05);
    legs.push({ hip, knee, s });
    const sh = new B.TransformNode('shoulder', S); sh.parent = pel; sh.position.set(s * .28, .66, 0);
    add(B.MeshBuilder.CreateSphere('pad', { diameter: .17, segments: 8 }, S), o.armor, sh);
    sh.rotation.set(o.rifle ? -.9 + (s > 0 ? 0 : -.25) : -.15, 0, s * (o.rifle ? .25 : .12));
    limb(sh, .065, .36, o.cloth); const el = new B.TransformNode('elbow', S); el.parent = sh; el.position.y = -.32; el.rotation.x = o.rifle ? -.7 : -.2; limb(el, .058, .34, o.cloth);
  }
  let rifle = null;
  if (o.rifle) { rifle = new B.TransformNode('rifle', S); rifle.parent = pel; rifle.position.set(.08, .4, .4);
    const g = Geo(); gbox(g, { x: 0, y: 0, z: 0, w: .07, h: .11, d: .52, ao: false }); gcyl(g, { r0: .022, h: .42, seg: 6, M: MT(0, 0, 0, Math.PI / 2, 0, 0).multiply(MT(0, .02, .46)), ao: false });
    gbox(g, { x: 0, y: -.12, z: .06, w: .05, h: .16, d: .07, rx: .25, ao: false }); gbox(g, { x: 0, y: -.03, z: -.34, w: .06, h: .12, d: .2, ao: false });
    gcyl(g, { r0: .03, h: .18, seg: 6, M: MT(0, 0, 0, Math.PI / 2, 0, 0).multiply(MT(0, .1, .02)), ao: false });
    gmesh('rifle', g, G.M.gun, { parent: rifle }); }
  const meshes = root.getChildMeshes();
  meshes.forEach(m => { if (m.material !== o.visor) G.sg.addShadowCaster(m); m.receiveShadows = true; m.isPickable = false; });
  return { root, pel, legs, neck, rifle, meshes, stride: 0 };
}
function walkAnim(H, speed, dt) {
  H.stride += dt * (speed > .3 ? 11 * Math.min(1.3, speed / 6) : 0); const amp = clamp(speed / 6, 0, 1), k = Math.min(1, dt * 14);
  H.legs.forEach(l => { const s = Math.sin(H.stride + (l.s > 0 ? 0 : Math.PI)); l.hip.rotation.x += ((-s * .65 * amp) - l.hip.rotation.x) * k; l.knee.rotation.x += ((Math.max(0, s) * .9 * amp) - l.knee.rotation.x) * k; });
  H.pel.position.y = .94 - Math.abs(Math.sin(H.stride)) * .04 * amp;
}
function fall(H, k) { H.pel.rotation.x = -1.42 * k; H.pel.position.y = .94 - .66 * k; }
const TRACER = { scrap: '#ffc35a', military: '#ffc35a', proto: '#c58bff', machine: '#ffd84a' };

/* ---------- the player ---------- */
/* Click the ground to walk there; click an enemy (or one of its parts) to lock on. The gun fires by itself at the locked target, or at the nearest threat in range. */
const SPEED = 7;
function ringMesh(name, hex, alpha) {
  const m = B.MeshBuilder.CreateTorus(name, { diameter: 1, thickness: .05, tessellation: 40 }, G.scene);
  const mat = new B.StandardMaterial(name + 'M', G.scene); mat.disableLighting = true; mat.emissiveColor = B.Color3.FromHexString(hex); mat.alpha = alpha; mat.alphaMode = B.Engine.ALPHA_ADD;
  m.material = mat; m.isPickable = false; m.setEnabled(false); return m;
}
export class Player extends Actor {
  constructor() {
    super('player', 100);
    this.H = humanModel({ cloth: G.M.uniform, armor: G.M.armor, visor: G.M.visor, helmet: true, rifle: true });
    this.root = this.H.root; this.facing = 0; this.dash = 0; this.dashCD = 0; this.down = 0; this.cool = 0; this.lastMove = { x: 0, z: 1 }; this.vel = { x: 0, z: 0 };
    this.lamp = new B.PointLight('lamp', V(0, 2.3, .3), G.scene); this.lamp.parent = this.root; this.lamp.diffuse = B.Color3.FromHexString('#ff9440'); this.lamp.intensity = .95;   // warm, and kept below the point where its yellow clips toward olive on the ground this.lamp.range = 8;
    this.muzzle = new B.PointLight('muzzle', V(.1, 1.4, 1.3), G.scene); this.muzzle.parent = this.root; this.muzzle.intensity = 0; this.muzzle.range = 9; this.muzzleT = 0;
    this.focus = null; this.hover = null;
    this.path = null; this.goal = null; this.lock = null; this.auto = null; this.target = null; this.pendingUse = null; this.steering = false;
    this.repathT = 0; this.scanT = 0; this.steerT = 0; this.stuckT = 0;
    this.destMark = ringMesh('destMark', '#ffb340', .9); this.destT = 0;
    this.lockMark = ringMesh('lockMark', '#ff4a3d', .9);
    this.recalc();
  }
  get weapon() { return G.inv.equip[G.inv.active] || G.inv.equip.primary; }
  get range() { const w = this.weapon; return w ? wstats(w).range : 18; }
  recalc() {
    const E = G.inv.equip, aff = k => [E.helmet, E.vest].reduce((s, it) => s + (it ? (it.affixes.find(a => a.k === k) || {}).v || 0 : 0), 0);
    const prev = this.maxHp; this.maxHp = 100 + aff('maxHp'); this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - prev));
    this.armor = Math.round(((E.helmet ? E.helmet.armor : 0) + (E.vest ? E.vest.armor : 0)) * (1 + aff('armorPct') / 100));
    this.reduce = this.armor / (this.armor + 50); this.regen = 12 * (1 + aff('regen') / 100); this.dodgeCD = 1 / (1 + aff('dodge') / 100);
  }
  takeDamage(d) { if (this.dash > 0 || this.down > 0 || G.paused) return 0; G.UI.hurt(); G.shake = Math.max(G.shake, .22); return d * (1 - this.reduce); }
  damage(d, part, src, point, opt) {
    if (!this.alive || this.down > 0) return 0;
    const dealt = this.takeDamage(d); if (!dealt) return 0; this.hp -= dealt; this.lastHurt = G.t;
    if (opt && opt.knock) { const k = opt.knock, dx = this.pos.x - k.from.x, dz = this.pos.z - k.from.z, dd = Math.hypot(dx, dz) || 1, px = this.pos.x, pz = this.pos.z; this.pos.x += dx / dd * k.force; this.pos.z += dz / dd * k.force; collide(this.pos, .5, px, pz); }
    if (this.hp <= 0) { this.hp = 0; this.down = 3; this.untargetable = true; this.stop(); G.UI.feed('You went down', '#ff6a5a'); G.game.onPlayerDown(); }
    return dealt;
  }
  onHit(target) { if (target.faction !== 'raider' || hostile(this, target)) this.focus = target; }
  onKill(target) { const w = this.weapon, s = w && wstats(w); if (s && s.leech) this.hp = Math.min(this.maxHp, this.hp + s.leech); }
  respawn(x, z) { this.pos.set(x, 0, z); this.hp = this.maxHp; this.down = 0; this.untargetable = false; this.alive = true; this.H.pel.rotation.x = 0; this.H.pel.position.y = .94; this.stop(); }
  tryDash() {
    if (this.dashCD > 0 || this.down > 0) return;
    /* dodge toward the cursor with a mouse, otherwise the way you're walking (or facing) */
    let d = null; const I = G.input;
    if (I.mode === 'mouse' && I.pointer) { const g = this.groundAt(I.pointer.x, I.pointer.y); if (g) { const dx = g.x - this.pos.x, dz = g.z - this.pos.z, l = Math.hypot(dx, dz); if (l > .3) d = { x: dx / l, z: dz / l }; } }
    this.dash = .2; this.dashCD = this.dodgeCD; this.dashDir = d || { ...this.lastMove }; this.repathT = 0;
    G.FX.dustAt(V(this.pos.x, .2, this.pos.z), 22);
  }
  swap() { const E = G.inv.equip; if (!E.secondary) { G.UI.feed('No second weapon equipped'); return; } G.inv.active = G.inv.active === 'primary' ? 'secondary' : 'primary'; this.cool = .25; G.UI.feed('Switched to ' + this.weapon.name); G.save.soon(); }
  stop() { this.path = null; this.goal = null; this.lock = null; this.pendingUse = null; this.steering = false; this.destMark.setEnabled(false); }

  /* ---------- turning clicks into orders ---------- */
  groundAt(x, y) {
    const ray = G.scene.createPickingRay(x, y, B.Matrix.Identity(), G.camera); if (ray.direction.y > -.01) return null;
    const k = -ray.origin.y / ray.direction.y; return { x: ray.origin.x + ray.direction.x * k, z: ray.origin.z + ray.direction.z * k };
  }
  actorAt(x, y) {
    const pk = G.scene.pick(x, y, m => !!(m.metadata && m.metadata.actor && m.metadata.actor.alive && m.isEnabled() && m.metadata.actor !== this));
    return pk && pk.hit ? pk.pickedMesh.metadata : null;
  }
  moveTo(x, z, quiet) {
    const path = G.nav.path(this.pos.x, this.pos.z, x, z);
    if (!path) { if (!quiet) G.UI.feed('Can\'t get there'); return false; }
    this.path = path; this.goal = path[path.length - 1]; this.stuckT = 0;
    if (!quiet || this.destT <= 0) { this.destMark.position.set(this.goal.x, .06, this.goal.z); this.destMark.setEnabled(true); this.destT = .7; }
    return true;
  }
  /* the enemy under the cursor, or (unless strict) a hostile one standing right next to where it points */
  enemyAt(x, y, strict) {
    const hit = this.actorAt(x, y); if (hit && !hit.actor.untargetable && hit.actor.faction !== 'player') return hit;
    if (strict) return null;
    const g = this.groundAt(x, y); if (!g) return null;
    let best = null, bd = 2;
    for (const a of G.actors) { if (!a.alive || a.untargetable || !hostile(this, a)) continue; const d = Math.hypot(a.pos.x - g.x, a.pos.z - g.z) - (a.radius || .5); if (d < bd) { bd = d; best = a; } }
    return best ? { actor: best, part: null } : null;
  }
  setLock(a, part) {
    this.lock = { actor: a, part: a.parts && part && part !== 'core' && a.partAlive(part) ? part : null };
    this.path = null; this.goal = null; this.pendingUse = null; this.steering = false; this.repathT = 0; this.destMark.setEnabled(false);
  }
  /* fire: left click (locks on to an enemy, walks into range if needed); move: right click; tap: touch, which does both */
  command(c) {
    if (this.down > 0) return;
    if (c.kind === 'fire') return;   // left button only fires (while held); targets are picked automatically
    if (c.kind === 'tap') { const e = this.enemyAt(c.x, c.y, true); if (e) { this.setLock(e.actor, e.part); return; } }
    const g = this.groundAt(c.x, c.y); if (!g) return;
    this.lock = null; this.steering = true; this.pendingUse = null;
    /* clicked next to something you can use: walk over and use it */
    for (const it of G.game.interactables()) if (Math.hypot(it.pos.x - g.x, it.pos.z - g.z) < Math.max(1.8, it.r * .8)) { this.pendingUse = it.label; this.steering = false; this.moveTo(it.pos.x, it.pos.z); return; }
    this.moveTo(g.x, g.z);
  }
  /* the locked target, or failing that the nearest threat you can actually shoot */
  lockedActor() {
    const L = this.lock;
    if (L && (!L.actor.alive || L.actor.untargetable)) this.lock = null;
    if (L && L.part && !L.actor.partAlive(L.part)) L.part = null;
    return this.lock ? this.lock.actor : null;
  }
  pickTarget(dt) {
    if (this.lockedActor()) { this.auto = null; return this.lock.actor; }
    const p = this.pos, R = this.range, ok = a => a && a.alive && !a.untargetable && !a.dormant && hostile(this, a) && dist2(p, a.pos) <= R && clearShot(p, a.pos);
    this.scanT -= dt;
    if (this.scanT <= 0 || !ok(this.auto)) {
      this.scanT = .2; let best = ok(this.auto) ? this.auto : null, bd = best ? dist2(p, best.pos) - 2 : 1e9;   // stick with the current target unless something is clearly closer
      for (const a of G.actors) { if (a === best || !ok(a)) continue; const d = dist2(p, a.pos) - (a === this.focus ? 2 : 0); if (d < bd) { bd = d; best = a; } }
      this.auto = best;
    }
    return this.auto;
  }

  update(dt, I) {
    const p = this.pos;
    if (this.down > 0) { this.down -= dt; fall(this.H, Math.min(1, (3 - this.down) * 3)); this.lockMark.setEnabled(false); if (this.down <= 0) G.game.respawnPlayer(); return; }

    /* orders */
    for (const c of I.frameClicks || []) this.command(c);
    if (I.steer && this.steering) { this.steerT -= dt; if (this.steerT <= 0) { this.steerT = .15; const g = this.groundAt(I.steer.x, I.steer.y); if (g) this.moveTo(g.x, g.z, true); } }
    if (I.mode === 'mouse' && I.pointer) { this.hover = this.actorAt(I.pointer.x, I.pointer.y); G.canvas.style.cursor = this.hover && this.hover.actor.faction !== 'player' ? 'crosshair' : 'pointer'; } else this.hover = null;

    /* target: picked automatically (the nearest threat in range with a clear shot, sticking with it while it lasts).
       Mouse: fires only while left is held; a threat under the cursor gets priority (and the part you point at), and with nothing in range shots go toward the cursor.
       Touch: fires by itself; tapping an enemy locks on and walks you into range. */
    const w = this.weapon, s = w && wstats(w), mouse = I.mode === 'mouse', firing = !mouse || I.fireHeld;
    let T = this.pickTarget(dt), aimPart = null, aimPt = null;
    if (mouse && firing && !this.lock) {
      const hv = this.hover && this.hover.actor;
      if (hv && hostile(this, hv) && !hv.untargetable && dist2(p, hv.pos) <= s.range && clearShot(p, hv.pos)) { T = hv; aimPart = this.hover.part; }
      else if (!T && I.pointer) { const g = this.groundAt(I.pointer.x, I.pointer.y); if (g && Math.hypot(g.x - p.x, g.z - p.z) > 1) aimPt = V(g.x, 1.2, g.z); }
    }
    const inRange = !!(T && s && dist2(p, T.pos) <= s.range && clearShot(p, T.pos));
    if (this.lock) {
      if (inRange) { this.path = null; this.goal = null; }
      else { this.repathT -= dt; const c = this.chaseAt; if (this.repathT <= 0 && (!this.path || !c || Math.hypot(c.x - T.pos.x, c.z - T.pos.z) > 1.5)) { this.repathT = .4; this.chaseAt = { x: T.pos.x, z: T.pos.z }; this.moveTo(T.pos.x, T.pos.z, true); this.destMark.setEnabled(false); } }
    }
    if (firing && T && !inRange) aimPt = T.pos.add(V(0, T.parts ? 3 * (T.s || 1) : 1.1, 0));   // out of reach: shoot toward it anyway
    this.target = T; G.assist = T;

    /* walking the path */
    const ox = p.x, oz = p.z;
    if (this.dash > 0) { this.dash -= dt; p.x += this.dashDir.x * 24 * dt; p.z += this.dashDir.z * 24 * dt; if (this.dash <= 0 && this.goal) this.moveTo(this.goal.x, this.goal.z, true); }
    else if (this.path && this.path.length) {
      let wp = this.path[0], dx = wp.x - p.x, dz = wp.z - p.z, d = Math.hypot(dx, dz);
      while (d < .25 && this.path.length > 1) { this.path.shift(); wp = this.path[0]; dx = wp.x - p.x; dz = wp.z - p.z; d = Math.hypot(dx, dz); }
      if (d < .25) { this.path = null; this.goal = null; }
      else { const step = Math.min(d, SPEED * dt); p.x += dx / d * step; p.z += dz / d * step; }
    }
    this.dashCD -= dt; collide(p, .5, ox, oz);
    const moved = Math.hypot(p.x - ox, p.z - oz);
    this.vel.x = (p.x - ox) / Math.max(dt, 1e-3); this.vel.z = (p.z - oz) / Math.max(dt, 1e-3);
    /* bumped off course by something: find the way again */
    if (this.path && this.dash <= 0) { if (moved < SPEED * dt * .3) { this.stuckT += dt; if (this.stuckT > .35 && this.goal) { const g = this.goal; if (!this.moveTo(g.x, g.z, true)) this.stop(); } } else this.stuckT = 0; }
    const spd = moved / Math.max(dt, 1e-3), moving = spd > .5;
    if (moving) this.lastMove = { x: (p.x - ox) / moved, z: (p.z - oz) / moved }; else this.lastMove = { x: Math.sin(this.facing), z: Math.cos(this.facing) };

    /* facing: at the target while it's in reach, else where you're going */
    if (inRange) this.facing = lerpAngle(this.facing, angleTo(p, T.pos), damp(16, dt));
    else if (firing && aimPt) this.facing = lerpAngle(this.facing, angleTo(p, aimPt), damp(16, dt));
    else if (moving) this.facing = lerpAngle(this.facing, Math.atan2(this.lastMove.x, this.lastMove.z), damp(12, dt));
    this.root.rotation.y = this.facing;

    /* body */
    const stride0 = this.H.stride;
    walkAnim(this.H, this.dash > 0 ? 8 : Math.min(spd, SPEED), dt); this.H.pel.rotation.x = this.dash > 0 ? .35 : 0;
    /* a foot lands each time the stride passes a half-turn */
    if (Math.floor(this.H.stride / Math.PI) > Math.floor(stride0 / Math.PI)) G.audio.play('pstep', { gain: .35, vary: true });
    if (G.t - this.lastHurt > 4 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + this.regen * dt);

    /* weapon: no ammo, no reloading. Fires while left is held (always on touch) at the target, or at the cursor */
    this.cool -= dt;
    const at = !firing ? null : inRange ? T.pos : aimPt;
    if (at && this.cool <= 0 && Math.abs(lerpAngle(0, angleTo(p, at) - this.facing, 1)) < .5) {
      this.cool = s.rate;
      let h = null;
      if (inRange) { const H = T.hitTargets(), want = (this.lock && this.lock.part) || aimPart;
        /* legs: the nearest one, aimed just under the knee so shots pass beneath the body's hit zone */
        if (want === 'legs') { const legs = H.filter(q => q.part === 'legs').sort((u, v) => dist2(p, u.c) - dist2(p, v.c)); if (legs[0]) h = { c: legs[0].c.add(V(0, -.35 * (T.s || 1), 0)) }; }
        h = h || (want && H.find(q => q.part === want)) || H.find(q => q.part === 'core' || q.part === 'body') || H[0]; }
      else h = { c: aimPt };
      if (h) {
        const fw = { x: Math.sin(this.facing), z: Math.cos(this.facing) };
        const from = V(p.x + fw.x * 1.25 + fw.z * .08, 1.36, p.z + fw.z * 1.25 - fw.x * .08);
        const hex = s.tech ? '#7fe8ff' : TRACER[w.tier], mat = G.CB.tierMat(hex), life = Math.max(s.life, s.range * 1.15 / s.speed);
        for (let k = 0; k < s.pellets; k++) {
          const dir = h.c.subtract(from), L = dir.length(); dir.addInPlaceFromFloats(rand(-1, 1) * s.spread * L, rand(-.6, .6) * s.spread * L, rand(-1, 1) * s.spread * L); dir.normalize();
          G.CB.fire({ from, dir, speed: s.speed, dmg: s.dmg, owner: this, kind: 'tracer', mat, life, crit: s.crit, vsMachine: s.vsMachine });
        }
        this.muzzle.diffuse = B.Color3.FromHexString(hex); this.muzzle.intensity = 3; this.muzzleT = .05; G.audio.shot(w.arch);
      }
    }
    if (this.muzzleT > 0) { this.muzzleT -= dt; if (this.muzzleT <= 0) this.muzzle.intensity = 0; }

    /* markers: where you're walking to, and what you're locked on to */
    if (this.destT > 0) { this.destT -= dt; const k = Math.max(0, this.destT / .7); this.destMark.scaling.setAll(.6 + (1 - k) * .9); this.destMark.material.alpha = .9 * k; if (this.destT <= 0) this.destMark.setEnabled(false); }
    const lm = this.lockMark;
    if (T) { const r = T.parts ? 3.4 * (T.s || 1) : T.kind === 'drone' ? 1.5 : 1.3; lm.setEnabled(true); lm.position.set(T.pos.x, .07, T.pos.z); lm.scaling.setAll(r * (1 + Math.sin(G.t * 6) * .04)); lm.material.alpha = this.lock ? .95 : .45; }
    else lm.setEnabled(false);
  }
}

/* ---------- Mara, the recruit ---------- */
export class Ally extends Actor {
  constructor(x, z) {
    super('player', 140); this.name = 'Mara';
    this.H = humanModel({ cloth: G.M.medic, armor: G.M.medicArmor, visor: G.M.visor, helmet: false, scarf: G.M.medicArmor, rifle: true, cross: true });
    this.root = this.H.root; this.root.position.set(x, 0, z); this.root.rotation.y = Math.PI * .8;
    this.joined = false; this.mode = 'follow'; this.down = 0; this.revive = 0; this.cool = 0; this.burst = 0; this.target = null; this.hold = null; this.retarget = 0;
    this.H.meshes.forEach(m => { m.metadata = { npc: this }; });
  }
  hitTargets() { return this.down > 0 ? [] : super.hitTargets(); }
  damage(d, part, src, point) {
    if (!this.joined || this.down > 0) return 0; const dealt = d * .8; this.hp -= dealt; this.lastHurt = G.t;
    if (this.hp <= 0) { this.hp = 0; this.down = 18; this.untargetable = true; this.revive = 0; G.UI.feed('Mara is down · Stand next to her to help her up', '#ff6a5a'); }
    return dealt;
  }
  join() { this.joined = true; this.hp = this.maxHp; G.UI.feed('Mara joined your squad', '#ffb24a'); }
  toggleMode() { if (!this.joined || this.down > 0) return; this.mode = this.mode === 'follow' ? 'hold' : 'follow'; this.hold = this.pos.clone(); G.UI.feed(this.mode === 'follow' ? 'Mara: "Right behind you."' : 'Mara: "Holding here."'); }
  teleportNear(p) { this.pos.set(p.x - 1.6, 0, p.z - 1.4); this.down = 0; this.untargetable = false; this.hp = this.maxHp; this.H.pel.rotation.x = 0; this.H.pel.position.y = .94; this.mode = 'follow'; }
  update(dt) {
    const P = G.player, p = this.pos;
    if (!this.joined) { this.H.neck.rotation.y = Math.sin(G.t * .6) * .5; return; }
    if (this.down > 0) {
      fall(this.H, 1); this.down -= dt;
      if (dist2(P.pos, p) < 2.4 && P.down <= 0) { this.revive += dt; if (this.revive > 1.8) this.down = 0; } else this.revive = Math.max(0, this.revive - dt);
      if (this.down <= 0) { this.untargetable = false; this.hp = this.maxHp * .5; this.H.pel.rotation.x = 0; this.H.pel.position.y = .94; G.UI.feed('Mara is back up', '#ffb24a'); }
      return;
    }
    if (G.t - this.lastHurt > 5 && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 8 * dt);
    /* where to stand */
    let goal;
    if (this.mode === 'hold' && this.hold) goal = this.hold;
    else { const bx = -P.lastMove.x, bz = -P.lastMove.z; goal = V(P.pos.x + bx * 2.2 + bz * 1.4, 0, P.pos.z + bz * 2.2 - bx * 1.4); if (!inOpen(goal.x, goal.z, .6)) goal = V(P.pos.x + bx * 1.6, 0, P.pos.z + bz * 1.6); }
    const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz), far = dist2(P.pos, p);
    if (far > 30 && this.mode === 'follow') this.teleportNear(P.pos);
    let speed = 0;
    if (d > .8) { speed = Math.min(d * 3, far > 8 ? 8.5 : 6.5); const ox = p.x, oz = p.z; p.x += dx / d * speed * dt; p.z += dz / d * speed * dt; collide(p, .45, ox, oz); }
    /* who to shoot */
    this.retarget -= dt;
    if (this.retarget <= 0) { this.retarget = .5;
      const f = P.focus && P.focus.alive && hostile(this, P.focus) && dist2(P.focus.pos, p) < 22 ? P.focus : null;
      this.target = f || nearestHostile(this, 18); }
    const T = this.target && this.target.alive ? this.target : null;
    if (T) this.root.rotation.y = lerpAngle(this.root.rotation.y, angleTo(p, T.pos), damp(8, dt));
    else if (speed > .5) this.root.rotation.y = lerpAngle(this.root.rotation.y, Math.atan2(dx, dz), damp(10, dt));
    walkAnim(this.H, speed, dt);
    this.cool -= dt;
    if (T && this.cool <= 0 && clearShot(p, T.pos, 1.3)) {
      const H = T.hitTargets(), h = H[Math.floor(Math.random() * H.length)] || { c: T.pos.add(V(0, 1, 0)) };
      const from = V(p.x + Math.sin(this.root.rotation.y) * 1.1, 1.35, p.z + Math.cos(this.root.rotation.y) * 1.1), dir = h.c.subtract(from).normalize();
      dir.addInPlaceFromFloats(rand(-.05, .05), rand(-.03, .03), rand(-.05, .05)); dir.normalize();
      G.CB.fire({ from, dir, speed: 55, dmg: 5, owner: this, kind: 'ally', life: .7 });
      this.burst++; this.cool = this.burst % 4 === 0 ? rand(.7, 1.1) : .14;
    }
  }
}

/* ---------- raiders ---------- */
export class Raider extends Actor {
  constructor(x, z, opts = {}) {
    super('raider', 70);
    this.H = humanModel({ cloth: G.M.raider, armor: opts.heavy ? G.M.scarf : G.M.raider, visor: G.M.goggle, helmet: false, rifle: true });
    this.root = this.H.root; this.root.position.set(x, 0, z); this.home = V(x, 0, z); this.goal = this.home.clone(); this.leash = opts.leash || 5;
    this.root.rotation.y = opts.face || 0; this.cool = rand(.5, 1.5); this.burst = 0; this.move = 0; this.dead = 0; this.retarget = 0;
    this.H.meshes.forEach(m => { m.metadata = { actor: this, part: 'body' }; m.isPickable = true; });
    this.alertR = opts.alert || 20;
  }
  takeDamage(d, part, src) {
    if (src && src.faction === 'player' && !G.raiderHostile) G.game.setRaiderHostile('shot');
    return d;
  }
  die(src) {
    this.dead = .01; this.H.meshes.forEach(m => { m.isPickable = false; });
    if (src && src.faction === 'player') G.drops.scatter(this.pos.x, this.pos.z, rollLoot('raider'));
  }
  update(dt) {
    if (!this.alive) { if (this.dead < 1) { this.dead = Math.min(1, this.dead + dt * 2.5); fall(this.H, this.dead); } return; }
    const p = this.pos;
    this.retarget -= dt; if (this.retarget <= 0) { this.retarget = .6; this.target = nearestHostile(this, this.alertR); }
    const T = this.target && this.target.alive && !this.target.untargetable ? this.target : null;
    this.move -= dt;
    if (T && this.move <= 0) { this.move = rand(1.5, 3); for (let k = 0; k < 6; k++) { const g = V(this.home.x + rand(-this.leash, this.leash), 0, this.home.z + rand(-this.leash, this.leash)); if (inOpen(g.x, g.z, .8)) { this.goal = g; break; } } }
    if (!T) this.goal = this.home;
    const dx = this.goal.x - p.x, dz = this.goal.z - p.z, d = Math.hypot(dx, dz); let speed = 0;
    if (d > .4) { speed = Math.min(4.5, d * 3); const ox = p.x, oz = p.z; p.x += dx / d * speed * dt; p.z += dz / d * speed * dt; collide(p, .45, ox, oz); }
    if (T) this.root.rotation.y = lerpAngle(this.root.rotation.y, angleTo(p, T.pos), damp(7, dt));
    else if (speed > .5) this.root.rotation.y = lerpAngle(this.root.rotation.y, Math.atan2(dx, dz), damp(8, dt));
    walkAnim(this.H, speed, dt);
    this.cool -= dt;
    if (T && this.cool <= 0) {
      if (!clearShot(p, T.pos, 1.3)) { this.cool = .4; return; }
      const H = T.hitTargets(), h = H.find(q => q.part === 'core' || q.part === 'body') || H[0];
      const from = V(p.x + Math.sin(this.root.rotation.y) * 1.1, 1.35, p.z + Math.cos(this.root.rotation.y) * 1.1), dir = h.c.subtract(from).normalize(), sp = T.faction === 'machine' ? .04 : .09;
      dir.addInPlaceFromFloats(rand(-sp, sp), rand(-sp / 2, sp / 2), rand(-sp, sp)); dir.normalize();
      G.CB.fire({ from, dir, speed: 42, dmg: T.faction === 'machine' ? 6 : 5, owner: this, kind: 'raider', life: .9 });
      this.burst++; this.cool = this.burst % 3 === 0 ? rand(1.2, 2.2) : .16;
    }
  }
}
