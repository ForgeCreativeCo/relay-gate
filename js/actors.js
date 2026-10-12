/* People: the player, Mara (your recruit) and the raiders. The player and Mara have their own models; raiders use humanModel. */
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
  return { root, pel, legs, neck, rifle, meshes, stride: 0, pelY: .94 };
}
function walkAnim(H, speed, dt) {
  H.stride += dt * (speed > .3 ? 11 * Math.min(1.3, speed / 6) : 0); const amp = clamp(speed / 6, 0, 1), k = Math.min(1, dt * 14);
  H.legs.forEach(l => { const s = Math.sin(H.stride + (l.s > 0 ? 0 : Math.PI)); l.hip.rotation.x += ((-s * .65 * amp) - l.hip.rotation.x) * k; l.knee.rotation.x += ((Math.max(0, s) * .9 * amp) - l.knee.rotation.x) * k; });
  H.pel.position.y = H.pelY - Math.abs(Math.sin(H.stride)) * .04 * amp;
}
function fall(H, k) { H.pel.rotation.x = -1.42 * k; H.pel.position.y = H.pelY * (1 - .7 * k); }
function standUp(H) { H.pel.rotation.x = 0; H.pel.position.y = H.pelY; }

/* ---------- the squad: the player (relay operator) and Mara (field medic) ----------
   Same skeleton as humanModel, but the rifle is held in both hands: each frame the arms solve to its grip and foregrip.
   Parts that never move against their joint are merged per material afterwards, so each figure stays around twenty draws. */
const MB = B.MeshBuilder, DOWN = V(0, -1, 0);
const tn = (n, p) => { const t = new B.TransformNode(n, G.scene); if (p) t.parent = p; return t; };
function put(m, mt, p, pos, rot, scl) { m.parent = p; m.material = mt; if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); if (scl) m.scaling.set(...scl); return m; }
const box = (w, h, d) => MB.CreateBox('part', { width: w, height: h, depth: d }, G.scene);
const cap = (r, h, t = 10) => MB.CreateCapsule('part', { radius: r, height: h, tessellation: t, subdivisions: 1 }, G.scene);
const sph = (d, seg = 12, slice) => MB.CreateSphere('part', slice ? { diameter: d, segments: seg, slice } : { diameter: d, segments: seg }, G.scene);
const cyl = (h, dt, db, t = 12, o = {}) => MB.CreateCylinder('part', { height: h, diameterTop: dt, diameterBottom: db, tessellation: t, ...o }, G.scene);
const tor = (d, th, t = 14) => MB.CreateTorus('part', { diameter: d, thickness: th, tessellation: t }, G.scene);
const tube = (pts, r) => MB.CreateTube('part', { path: pts.map(p => V(...p)), radius: r, tessellation: 6, cap: B.Mesh.CAP_ALL }, G.scene);
const ribbon = paths => MB.CreateRibbon('part', { pathArray: paths.map(a => a.map(p => V(...p))), sideOrientation: B.Mesh.DOUBLESIDE }, G.scene);
function fromTo(f, t) { const d = V3.Dot(f, t); if (d < -.9999) return B.Quaternion.RotationAxis(V(1, 0, 0), Math.PI); const c = V3.Cross(f, t), q = new B.Quaternion(c.x, c.y, c.z, 1 + d); q.normalize(); return q; }
/* two-bone arm: the glove lands on T (torso space), the elbow bends toward pole */
function solveArm(arm, T, pole) {
  const S = arm.sh.position, a = arm.a, b = arm.b, v = T.subtract(S), len = v.length(), n = v.scale(1 / len), d = clamp(len, .05, a + b - .002);
  const cosA = (a * a + d * d - b * b) / (2 * a * d), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const p = pole.subtract(n.scale(V3.Dot(pole, n))).normalize(), E = S.add(n.scale(a * cosA)).add(p.scale(a * sinA));
  const q1 = fromTo(DOWN, E.subtract(S).normalize()); arm.sh.rotationQuaternion.copyFrom(q1);
  arm.el.rotationQuaternion.copyFrom(fromTo(DOWN, S.add(n.scale(d)).subtract(E).normalize().applyRotationQuaternion(B.Quaternion.Inverse(q1))));
}
const inSpace = (src, space) => V3.TransformCoordinates(src.getAbsolutePosition(), space.getWorldMatrix().clone().invert());
function squadLegs(pel, o) {
  const legs = [];
  for (const s of [-1, 1]) {
    const hip = tn('hip', pel); hip.position.set(s * .11, 0, 0);
    put(cap(.1, .5), o.legs, hip, [0, -.22, 0]);
    if (o.thighPouch && s > 0) put(box(.07, .15, .13), o.web, hip, [.085, -.2, 0]);
    const knee = tn('knee', hip); knee.position.y = -.45;
    put(cap(.082, .46), o.legs, knee, [0, -.21, 0]);
    if (o.kneePad) put(sph(.15, 10), o.pad, knee, [0, -.01, .07], null, [.95, 1.05, .6]);
    if (o.wraps) for (let k = 0; k < 3; k++) put(tor(.165, .03, 12), o.wrap, knee, [0, -.15 - k * .065, 0], [.12, 0, 0]);
    put(cyl(.12, .17, .175), o.boot, knee, [0, -.36, 0]); put(box(.14, .11, .26), o.boot, knee, [0, -.43, .04]); put(box(.145, .03, .28), G.M.sole, knee, [0, -.48, .04]);
    legs.push({ hip, knee, s });
  }
  return legs;
}
function squadArm(torso, s, o) {
  const a = o.a, b = o.b, sh = tn('shoulder', torso); sh.position.set(s * o.x, o.y, 0); sh.rotationQuaternion = B.Quaternion.Identity();
  put(cap(o.r, a + .08), o.sleeve, sh, [0, -a / 2, 0]);
  const el = tn('elbow', sh); el.position.y = -a; el.rotationQuaternion = B.Quaternion.Identity();
  if (o.elbowPad) put(sph(.1, 8), o.pad, el, null, null, [1, 1, 1.1]);
  put(cap(o.r * .88, b), o.sleeve, el, [0, -b / 2 + .02, 0]);
  if (o.cuff) put(tor(.105, .03, 10), o.wrap, el, [0, -b + .09, 0]);
  put(box(.075, .1, .09), o.glove, el, [0, -b - .005, 0]);
  return { sh, el, a, b };
}
/* a carbine pointing +z, with the two places the hands go */
function carbine(parent, scav) {
  const M = G.M, r = tn('rifle', parent), bl = scav ? .34 : .22;
  put(box(.06, .1, .34), M.gun, r); put(box(.04, .02, .32), M.gun, r, [0, .06, 0]);
  put(box(.066, .078, .26), scav ? M.wood : M.pad, r, [0, -.005, .29]);
  put(cyl(bl, .028, .028, 8), M.gun, r, [0, .01, .42 + bl / 2], [Math.PI / 2, 0, 0]); put(cyl(.06, .04, .04, 8), M.gun, r, [0, .01, .43 + bl], [Math.PI / 2, 0, 0]);
  if (scav) {
    put(box(.045, .09, .06), M.gun, r, [0, -.09, .05], [.25, 0, 0]); put(box(.045, .08, .06), M.gun, r, [0, -.16, .09], [.6, 0, 0]);
    put(box(.05, .12, .26), M.wood, r, [0, -.03, -.29], [-.08, 0, 0]); put(box(.012, .04, .012), M.gun, r, [0, .085, .38]);
  } else {
    put(box(.046, .16, .08), M.pad, r, [0, -.11, .07], [.18, 0, 0]); put(box(.05, .1, .2), M.gun, r, [0, -.01, -.27]); put(box(.056, .13, .03), M.webbing, r, [0, -.02, -.38]);
    put(cyl(.13, .05, .05, 10), M.gun, r, [0, .1, .02], [Math.PI / 2, 0, 0]); put(box(.03, .085, .035), M.gun, r, [0, -.08, .3]);
  }
  put(box(.04, .11, .05), M.gun, r, [0, -.09, -.08], [-.3, 0, 0]);
  const grip = tn('grip', r); grip.position.set(0, -.11, -.08); const fore = tn('fore', r); fore.position.set(0, -.08, .26);
  return { r, grip, fore };
}
function finishSquad(H) {
  const groups = new Map();
  for (const m of H.root.getChildMeshes()) { if (m.metadata && m.metadata.keep) continue; const k = m.parent.uniqueId + '|' + m.material.uniqueId; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const vd = list.map(m => { m.bakeTransformIntoVertices(B.Matrix.Compose(m.scaling, B.Quaternion.RotationYawPitchRoll(m.rotation.y, m.rotation.x, m.rotation.z), m.position)); return B.VertexData.ExtractFromMesh(m); }), out = new B.Mesh('part', G.scene);
    vd[0].merge(vd.slice(1)); vd[0].applyToMesh(out); out.parent = list[0].parent; out.material = list[0].material; list.forEach(m => m.dispose());
  }
  H.meshes = H.root.getChildMeshes();
  H.meshes.forEach(m => { if (!m.material.disableLighting) G.sg.addShadowCaster(m); m.receiveShadows = true; m.isPickable = false; });
  H.pelY = H.pelY || .94; H.pose = H.pose || POSE; H.muzzleY = H.muzzleY || 1.52; H.muzzleF = H.muzzleF || 1.2; H.stride = 0; H.blade = H.pose.ready.blade; H.rx = H.pose.ready.rx; H.rp = H.pose.ready.pos.clone(); H.head = H.pose.ready.head;
  return H;
}
const POSE = { ready: { pos: V(.12, .47, .42), rx: .55, blade: .18, head: .14 }, aim: { pos: V(.1, .6, .46), rx: 0, blade: .42, head: .04 } };
/* legs, rifle carry (low ready, or shouldered while aiming) and the arms that follow it */
function squadAnim(H, speed, dt, aiming) {
  walkAnim(H, speed, dt);
  const amp = clamp(speed / 6, 0, 1), P = aiming ? H.pose.aim : H.pose.ready, k = damp(10, dt), r = H.rifle.r;
  H.blade += (P.blade - H.blade) * k; H.rx += (P.rx - H.rx) * k; H.head += (P.head - H.head) * k; H.rp.addInPlace(P.pos.subtract(H.rp).scaleInPlace(k));
  const bob = Math.sin(H.stride * 2) * .015 * amp + Math.sin(G.t * 1.7) * .004;
  r.position.set(H.rp.x, H.rp.y + bob, H.rp.z); r.rotation.x = H.rx + Math.sin(H.stride) * .03 * amp;
  H.torso.rotation.set(.06 * amp, H.blade, Math.sin(H.stride) * .035 * amp); if (!H.fixedHead) H.neck.rotation.set(H.head, -H.blade * .85, 0);
  [H.root, H.pel, H.torso, r, H.rifle.grip, H.rifle.fore].forEach(n => n.computeWorldMatrix(true));
  solveArm(H.armR, inSpace(H.rifle.grip, H.torso), V(1, -1, -.4)); solveArm(H.armL, inSpace(H.rifle.fore, H.torso), V(-1, -1.3, -.2));
  if (H.extra) H.extra(amp);
}
export function operatorModel() {
  const M = G.M, root = tn('operator'), pel = tn('pelvis', root); pel.position.y = .94; const torso = tn('torso', pel);
  put(cap(.2, .42), M.fatigue, pel, [0, .1, 0], null, [1.05, 1, .8]); put(cyl(.07, .44, .44, 14), M.webbing, pel, [0, .07, 0], null, [1, 1, .78]);
  put(box(.14, .12, .08), M.webbing, pel, [-.15, .02, -.13], [0, .5, 0]);
  /* chest and plate carrier */
  put(cap(.2, .62), M.fatigue, torso, [0, .42, 0], null, [1.08, 1, .78]);
  put(box(.4, .36, .09), M.carrier, torso, [0, .47, .14]); put(box(.3, .07, .09), M.carrier, torso, [0, .67, .14]); put(box(.4, .38, .09), M.carrier, torso, [0, .48, -.14]);
  put(cyl(.16, .46, .48, 14), M.carrier, torso, [0, .37, 0], null, [1, 1, .74]);
  [-.12, 0, .12].forEach(x => { put(box(.1, .14, .07), M.webbing, torso, [x, .39, .21]); put(box(.07, .03, .04), M.gun, torso, [x, .475, .215]); });
  put(box(.07, .12, .06), M.webbing, torso, [-.14, .58, .2]); put(box(.025, .02, .01), M.visor, torso, [-.14, .63, .232]);
  [-.13, .13].forEach(x => put(box(.07, .04, .32), M.carrier, torso, [x, .69, 0]));
  put(tor(.25, .07), M.carrier, torso, [0, .75, 0], null, [1, 1, .9]);
  /* pauldrons: heavy on the left, light on the right */
  put(sph(.29, 14, .5), M.pad, torso, [-.25, .665, 0], [0, 0, .3], [1, .6, 1.15]); put(box(.06, .012, .22), M.idStripe, torso, [-.3, .71, 0], [0, 0, .42]);
  put(sph(.2, 12, .5), M.pad, torso, [.24, .675, 0], [0, 0, -.25], [1, .55, 1.05]);
  /* head: helmet, wraparound visor, crown stripe, ear cups, antenna */
  const neck = tn('neck', torso); neck.position.y = .84;
  put(sph(.26, 10), M.skin, neck); put(box(.17, .1, .1), M.webbing, neck, [0, -.06, .08]);
  put(sph(.35, 14, .55), M.armor, neck, [0, .025, 0], null, [1, .95, 1.08]); put(cyl(.03, .36, .372, 16), M.armor, neck, [0, .015, 0], null, [1, 1, 1.07]);
  [-1, 1].forEach(s => put(cyl(.06, .11, .11), M.gun, neck, [s * .165, -.01, 0], [0, 0, Math.PI / 2]));
  const vis = [], str = [];
  for (let i = 0; i <= 12; i++) { const a = -1.05 + 2.1 * i / 12; vis.push([Math.sin(a) * .184, 0, Math.cos(a) * .198]); }
  for (let i = 0; i <= 14; i++) { const f = .45 + 2.25 * i / 14; str.push([0, .025 + Math.sin(f) * .173, Math.cos(f) * .196]); }
  put(tube(vis, .019), M.visor, neck, null, null, [1, 1.2, 1]); put(tube(str, .016), M.idStripe, neck);
  put(box(.08, .05, .045), M.gun, neck, [0, .12, .16], [-.35, 0, 0]);
  const hant = tn('helmetAntenna', neck); hant.position.set(-.15, .08, -.07); hant.rotation.set(-.25, 0, -.22);
  put(cyl(.3, .006, .012, 6), M.gun, hant, [0, .15, 0]); put(sph(.03, 8), M.visor, hant, [0, .3, 0]);
  /* radio pack: whip antenna and a status light that blinks */
  put(box(.34, .42, .17), M.radioPack, torso, [0, .47, -.28]); put(box(.36, .07, .19), M.carrier, torso, [0, .69, -.28]);
  [-1, 1].forEach(s => put(box(.06, .24, .12), M.webbing, torso, [s * .2, .42, -.28]));
  put(box(.22, .05, .012), M.idStripe, torso, [0, .35, -.372]); put(cyl(.06, .04, .04, 8), M.gun, torso, [.11, .75, -.31]);
  const led = put(box(.05, .028, .012), M.visor, torso, [-.09, .61, -.372]); led.metadata = { keep: true };
  const whip = tn('whip', torso); whip.position.set(.11, .76, -.31); whip.rotation.set(-.14, 0, .04);
  put(cyl(.95, .006, .014, 6), M.gun, whip, [0, .475, 0]); put(sph(.035, 8), M.visor, whip, [0, .95, 0]);
  const legs = squadLegs(pel, { legs: M.fatigue, pad: M.pad, web: M.webbing, boot: M.boot, kneePad: true, thighPouch: true });
  const arm = { sleeve: M.fatigue, pad: M.pad, glove: M.glove, a: .31, b: .31, r: .07, x: .22, y: .63, elbowPad: true };
  const H = { root, pel, torso, neck, legs, armR: squadArm(torso, 1, arm), armL: squadArm(torso, -1, arm), rifle: carbine(pel, false) };
  H.extra = amp => {
    whip.rotation.z = .04 + Math.sin(G.t * 2.1) * .03 + Math.sin(H.stride) * .07 * amp; whip.rotation.x = -.14 - .08 * amp + Math.sin(H.stride * 2) * .03 * amp;
    hant.rotation.z = -.22 + Math.sin(G.t * 2.6 + 1) * .03; led.setEnabled(G.t % 1.4 < .18);
  };
  return finishSquad(H);
}
export function medicModel() {
  const M = G.M, root = tn('medic'), pel = tn('pelvis', root); pel.position.y = .94; const torso = tn('torso', pel);
  put(cap(.19, .4), M.trousers, pel, [0, .1, 0], null, [1, 1, .8]);
  /* split coat: a back panel and two side panels, open at the front so the legs can move */
  const panels = [];
  for (const [ang, w, back] of [[Math.PI, 1.35, true], [-1.78, 1.3, false], [1.78, 1.3, false]]) {
    const pv = tn('coatPanel', pel); pv.position.y = .13; pv.rotation.y = ang;
    const top = [], bot = []; for (let i = 0; i <= 8; i++) { const a = -w / 2 + w * i / 8; top.push([Math.sin(a) * .205, 0, Math.cos(a) * .17]); bot.push([Math.sin(a) * .33, -.6, Math.cos(a) * .3]); }
    put(ribbon([top, bot]), M.coatPanel, pv); panels.push({ pv, back, phase: ang > 0 ? 0 : Math.PI });
  }
  put(cyl(.06, .42, .42, 14), M.leather, pel, [0, .12, 0], null, [1, 1, .8]);
  for (let k = 0; k < 3; k++) put(cyl(.065, .024, .024, 8), M.vial, pel, [-.06 - k * .045, .13, .17]);
  /* satchel on the right hip, with its cross */
  put(box(.08, .15, .19), M.leather, pel, [.25, .02, .02]); put(box(.088, .05, .196), M.leather, pel, [.252, .09, .02]);
  put(box(.004, .085, .085), M.bone, pel, [.293, .015, .02]); put(box(.006, .06, .018), M.medRed, pel, [.296, .015, .02]); put(box(.006, .018, .06), M.medRed, pel, [.296, .015, .02]);
  /* chest, strap, shoulder mantle with the big cross on its back */
  put(cap(.19, .62), M.coat, torso, [0, .42, 0], null, [1.04, 1, .8]);
  put(box(.04, .7, .02), M.leather, torso, [-.02, .42, .162], [0, 0, -.62]); put(box(.04, .7, .02), M.leather, torso, [-.02, .42, -.162], [0, 0, .62]);
  put(cyl(.25, .27, .62, 20, { cap: B.Mesh.NO_CAP, sideOrientation: B.Mesh.DOUBLESIDE }), M.hood, torso, [0, .66, -.01], null, [1, 1, .82]);
  const disc = tn('cross', torso); disc.position.set(0, .668, -.2); disc.rotation.x = -.96;
  put(cyl(.012, .17, .17, 16), M.bone, disc); put(box(.12, .008, .036), M.medRed, disc, [0, .008, 0]); put(box(.036, .008, .12), M.medRed, disc, [0, .008, 0]);
  /* head: hood, green goggles, respirator, scarf */
  const neck = tn('neck', torso); neck.position.y = .84;
  put(sph(.25, 10), M.skin, neck); put(sph(.38, 16, .74), M.hood, neck, [0, .03, -.075], null, [1, 1.1, 1.1]); put(cyl(.13, 0, .1, 8), M.hood, neck, [0, .14, -.265], [-1.1, 0, 0]);
  [-1, 1].forEach(s => { put(cyl(.035, .075, .075), M.gun, neck, [s * .05, .03, .13], [Math.PI / 2, 0, 0]); put(cyl(.006, .058, .058), M.lens, neck, [s * .05, .03, .149], [Math.PI / 2, 0, 0]); });
  put(box(.03, .012, .02), M.gun, neck, [0, .035, .13]); put(box(.085, .075, .07), M.gun, neck, [0, -.055, .13]);
  [-1, 1].forEach(s => { put(cyl(.07, .055, .055, 10), M.gun, neck, [s * .075, -.075, .115], [.3, 0, s * 1.1]); put(cyl(.012, .058, .058, 10), M.medScarf, neck, [s * .105, -.088, .125], [.3, 0, s * 1.1]); });
  put(tor(.27, .085), M.medScarf, neck, [0, -.14, 0]);
  const tail = tn('scarfTail', neck); tail.position.set(.06, -.15, -.13); tail.rotation.set(.25, 0, .1); put(box(.09, .34, .025), M.medScarf, tail, [0, -.17, 0]);
  const legs = squadLegs(pel, { legs: M.trousers, wrap: M.wrap, boot: M.medBoot, wraps: true });
  const arm = { sleeve: M.coat, wrap: M.wrap, glove: M.medBoot, a: .3, b: .31, r: .064, x: .21, y: .62, cuff: true };
  const H = { root, pel, torso, neck, legs, armR: squadArm(torso, 1, arm), armL: squadArm(torso, -1, arm), rifle: carbine(pel, true) };
  H.extra = amp => {
    const st = H.stride;
    for (const p of panels) p.pv.rotation.x = p.back ? -(.06 + .32 * amp + Math.sin(st * 2) * .08 * amp + Math.sin(G.t * 1.3) * .015) : -(.04 + .14 * amp + Math.max(0, Math.sin(st + p.phase)) * .2 * amp);
    tail.rotation.x = .2 + .3 * amp + Math.sin(st * 2) * .08 * amp + Math.sin(G.t * 1.9) * .05; tail.rotation.z = .1 + Math.sin(G.t * 1.1 + st) * .08;
  };
  return finishSquad(H);
}
/* ---------- the player from a model file: models/operator.gltf ----------
   The file is one static mesh with no skeleton, so the skeleton is built here: bones sit on the joints squadAnim drives
   (hips, knees, shoulders, elbows) and each vertex is weighted to the bones nearest it. Joint positions were measured off
   the model once it is standing at game scale (feet at y 0, facing +z). If the file fails to load the player keeps operatorModel(). */
let operatorMesh = null;
const OP_FILE = { file: 'operator.gltf', scale: 1.85, pelY: .66, neck: 1.2, hip: [.2, .66, .14], knee: [.21, .36, .13], ankle: [.22, .06, .08], shoulder: [.33, 1.07, .07], elbow: [.56, .94, .15], hand: [.8, .78, .22] };
const OP_FILE_POSE = { ready: { pos: V(.14, .28, .4), rx: .55, blade: .3, head: 0 }, aim: { pos: V(.12, .4, .34), rx: 0, blade: .55, head: 0 } };
export async function loadOperator() {
  try {
    const r = await B.SceneLoader.ImportMeshAsync('', 'models/', OP_FILE.file, G.scene), m = r.meshes.find(x => x.getTotalVertices() > 0), s = OP_FILE.scale;
    const W = m.computeWorldMatrix(true).clone();
    m.parent = null; m.position.setAll(0); m.rotationQuaternion = null; m.rotation.setAll(0); m.scaling.setAll(1);
    m.bakeTransformIntoVertices(W.multiply(B.Matrix.RotationY(Math.PI / 2)).multiply(B.Matrix.Scaling(s, s, s)));   // the file faces -x once loaded
    m.refreshBoundingInfo(); m.bakeTransformIntoVertices(B.Matrix.Translation(0, -m.getBoundingInfo().minimum.y, 0)); m.refreshBoundingInfo();
    r.meshes.forEach(x => { if (x !== m) x.dispose(); }); r.transformNodes.forEach(x => x.dispose());
    if (m.material) m.material.maxSimultaneousLights = 8;
    m.isPickable = false; m.setEnabled(false); operatorMesh = m;
  } catch (e) { console.warn('models/' + OP_FILE.file + ' did not load, so the player uses the built-in model', e); }
}
const segDist = (q, a, b) => { const ab = b.subtract(a), t = clamp(V3.Dot(q.subtract(a), ab) / ab.lengthSquared(), 0, 1); return V3.Distance(q, a.add(ab.scale(t))); };
export function operatorFileModel() {
  const m = operatorMesh, J = OP_FILE, P = a => V(...a), root = tn('operator'), pel = tn('pelvis', root); pel.position.y = J.pelY;
  const torso = tn('torso', pel), neck = tn('neck', torso); neck.position.y = J.neck - J.pelY;
  const legs = [-1, 1].map(s => { const hip = tn('hip', pel); hip.position.set(s * J.hip[0], 0, J.hip[2]); const knee = tn('knee', hip); knee.position.y = -(J.hip[1] - J.knee[1]); return { hip, knee, s }; });
  const arm = s => {
    const S = P(J.shoulder), E = P(J.elbow), Hd = P(J.hand); [S, E, Hd].forEach(v => { v.x *= s; });
    const sh = tn('shoulder', torso); sh.position.set(S.x, S.y - J.pelY, S.z); sh.rotationQuaternion = fromTo(DOWN, E.subtract(S).normalize());
    const a = V3.Distance(S, E), b = V3.Distance(E, Hd), el = tn('elbow', sh); el.position.y = -a;
    el.rotationQuaternion = fromTo(DOWN, Hd.subtract(E).normalize().applyRotationQuaternion(B.Quaternion.Inverse(sh.rotationQuaternion)));
    return { sh, el, a, b, S, E, Hd, s };
  };
  const armR = arm(1), armL = arm(-1);
  /* the skeleton mirrors the joint nodes; each bone follows its node every frame */
  const skel = new B.Skeleton('operator', 'operator', G.scene), bone = new Map();
  const local = n => B.Matrix.Compose(n.scaling, n.rotationQuaternion || B.Quaternion.RotationYawPitchRoll(n.rotation.y, n.rotation.x, n.rotation.z), n.position);
  for (const n of [pel, torso, neck, ...legs.flatMap(l => [l.hip, l.knee]), armR.sh, armR.el, armL.sh, armL.el]) { const b = new B.Bone(n.name, skel, skel.bones[bone.get(n.parent)] || null, local(n), null, local(n)); b.linkTransformNode(n); bone.set(n, skel.bones.indexOf(b)); }
  /* weights: each vertex goes to the nearest bone segments it is allowed to (legs below the belt, arms out past the shoulders), blended over a few centimetres */
  const segs = [[pel, V(0, .55, .08), V(0, .85, .04), q => q.y > .45 && q.y < .95], [torso, V(0, .85, 0), V(0, J.neck - .05, 0), q => q.y > .7], [neck, V(0, J.neck + .02, .02), V(0, 1.6, 0), q => q.y > J.neck - .1 && Math.abs(q.x) < .3]];
  for (const l of legs) { const s = l.s, h = P(J.hip), k = P(J.knee), a = P(J.ankle); [h, k, a].forEach(v => { v.x *= s; }); segs.push([l.hip, h, k, q => q.y < J.hip[1] + .09 && q.x * s > -.02], [l.knee, k, a, q => q.y < J.knee[1] + .14 && q.x * s > -.02]); }
  for (const A of [armR, armL]) segs.push([A.sh, A.S, A.E, q => q.x * A.s > .24 && q.y > .65 && q.y < 1.3 && q.z > -.04], [A.el, A.E, A.Hd.add(A.Hd.subtract(A.E).scale(.3)), q => q.x * A.s > .4 && q.z > -.04]);
  const pos = m.getVerticesData(B.VertexBuffer.PositionKind), n = pos.length / 3, idx = new Float32Array(n * 4), wt = new Float32Array(n * 4), q = V(0, 0, 0), back = bone.get(torso);
  for (let i = 0; i < n; i++) {
    q.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    const c = q.z < -.04 && q.y > .8 ? [] : segs.filter(sg => sg[3](q)).map(([nd, a, b]) => [bone.get(nd), segDist(q, a, b)]);   // the radio pack and its antenna ride on the back
    if (!c.length) { idx[i * 4] = back; wt[i * 4] = 1; continue; }
    c.sort((u, v) => u[1] - v[1]);
    const top = c.slice(0, 4).map(([b, d]) => [b, Math.exp(-(d - c[0][1]) / .03)]), sum = top.reduce((t, x) => t + x[1], 0);
    top.forEach(([b, w], k) => { idx[i * 4 + k] = b; wt[i * 4 + k] = w / sum; });
  }
  m.setVerticesData(B.VertexBuffer.MatricesIndicesKind, idx, false); m.setVerticesData(B.VertexBuffer.MatricesWeightsKind, wt, false);
  m.skeleton = skel; m.numBoneInfluencers = 4; m.parent = root; m.setEnabled(true); m.receiveShadows = true; m.alwaysSelectAsActiveMesh = true;   // bind-pose bounds don't follow the limbs
  const rifle = carbine(pel, false); rifle.r.scaling.setAll(1.15);
  const H = { root, pel, torso, neck, legs, armR, armL, rifle, pelY: J.pelY, pose: OP_FILE_POSE, fixedHead: true, muzzleY: 1.08, muzzleF: 1.1 };
  finishSquad(H); return H;
}

/* muzzle flash size and camera kick per weapon type */
const FLASH_SIZE = { rifle: .75, smg: .6, shotgun: 1.3, marksman: 1.1, arc: .8 }, RECOIL = { shotgun: .14, marksman: .1 };
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
    this.H = operatorMesh ? operatorFileModel() : operatorModel();
    this.root = this.H.root; this.facing = 0; this.dash = 0; this.dashCD = 0; this.down = 0; this.cool = 0; this.lastMove = { x: 0, z: 1 }; this.vel = { x: 0, z: 0 };
    this.lamp = new B.PointLight('lamp', V(0, 2.3, .3), G.scene); this.lamp.parent = this.root; this.lamp.diffuse = B.Color3.FromHexString('#ffe0c2'); this.lamp.intensity = .6;   // a soft, nearly white pool: a coloured lamp is the only light inside shadows, and tinted them blood-red this.lamp.range = 8;
    this.muzzle = new B.PointLight('muzzle', V(.1, this.H.muzzleY, this.H.muzzleF), G.scene); this.muzzle.parent = this.root; this.muzzle.intensity = 0; this.muzzle.range = 9; this.muzzleT = 0;
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
  respawn(x, z) { this.pos.set(x, 0, z); this.hp = this.maxHp; this.down = 0; this.untargetable = false; this.alive = true; standUp(this.H); this.stop(); }
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

  /* the joystick (screen right / down) as a ground direction: up on the stick is away from the camera */
  stickDir(st) {
    const f = G.camera.getDirection(B.Vector3.Forward()), l = Math.hypot(f.x, f.z) || 1, fx = f.x / l, fz = f.z / l, m = st.m / Math.hypot(st.x, st.y);
    return { x: (fz * st.x - fx * st.y) * m, z: (-fx * st.x - fz * st.y) * m };
  }
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
    /* touch: the joystick moves you, so a tap only targets (on or right beside an enemy); a tap on open ground drops the lock */
    if (c.kind === 'tap') { const e = this.enemyAt(c.x, c.y, true) || this.enemyAt(c.x, c.y); if (e) this.setLock(e.actor, e.part); else this.lock = null; return; }
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
    const p = this.pos, R = this.range, ok = a => a && a.alive && !a.untargetable && !a.dormant && !a.lurk && hostile(this, a) && dist2(p, a.pos) <= R && clearShot(p, a.pos);
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
       Touch: fires while the fire button is held; tapping an enemy locks on; with nothing in range shots go straight ahead. */
    const w = this.weapon, s = w && wstats(w), mouse = I.mode === 'mouse', firing = I.fireHeld;
    const stick = !mouse && I.stick ? this.stickDir(I.stick) : null;
    let T = this.pickTarget(dt), aimPart = null, aimPt = null, ahead = false;
    if (mouse && firing && !this.lock) {
      const hv = this.hover && this.hover.actor;
      if (hv && hostile(this, hv) && !hv.untargetable && dist2(p, hv.pos) <= s.range && clearShot(p, hv.pos)) { T = hv; aimPart = this.hover.part; }
      else if (!T && I.pointer) { const g = this.groundAt(I.pointer.x, I.pointer.y); if (g && Math.hypot(g.x - p.x, g.z - p.z) > 1) aimPt = V(g.x, 1.2, g.z); }
    }
    const inRange = !!(T && s && dist2(p, T.pos) <= s.range && clearShot(p, T.pos));
    if (this.lock && mouse) {   // on touch you steer yourself into range
      if (inRange) { this.path = null; this.goal = null; }
      else { this.repathT -= dt; const c = this.chaseAt; if (this.repathT <= 0 && (!this.path || !c || Math.hypot(c.x - T.pos.x, c.z - T.pos.z) > 1.5)) { this.repathT = .4; this.chaseAt = { x: T.pos.x, z: T.pos.z }; this.moveTo(T.pos.x, T.pos.z, true); this.destMark.setEnabled(false); } }
    }
    if (firing && T && !inRange) aimPt = T.pos.add(V(0, T.parts ? 3 * (T.s || 1) : 1.1, 0));   // out of reach: shoot toward it anyway
    if (firing && !mouse && !T) { aimPt = V(p.x + Math.sin(this.facing) * 10, 1.2, p.z + Math.cos(this.facing) * 10); ahead = true; }
    this.target = T; G.assist = T;

    /* walking: the joystick, or the path */
    const ox = p.x, oz = p.z;
    if (this.dash > 0) { this.dash -= dt; p.x += this.dashDir.x * 24 * dt; p.z += this.dashDir.z * 24 * dt; if (this.dash <= 0 && this.goal) this.moveTo(this.goal.x, this.goal.z, true); }
    else if (stick) { if (this.path) { this.path = null; this.goal = null; this.pendingUse = null; this.destMark.setEnabled(false); } p.x += stick.x * SPEED * dt; p.z += stick.z * SPEED * dt; }
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
    else if (firing && aimPt && !ahead) this.facing = lerpAngle(this.facing, angleTo(p, aimPt), damp(16, dt));
    else if (moving) this.facing = lerpAngle(this.facing, Math.atan2(this.lastMove.x, this.lastMove.z), damp(12, dt));
    this.root.rotation.y = this.facing;

    /* body */
    const stride0 = this.H.stride;
    this.H.pel.rotation.x = this.dash > 0 ? .35 : 0; squadAnim(this.H, this.dash > 0 ? 8 : Math.min(spd, SPEED), dt, inRange || (firing && !!aimPt));
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
        const mf = this.H.muzzleF, from = V(p.x + fw.x * mf + fw.z * .1, this.H.muzzleY, p.z + fw.z * mf - fw.x * .1);
        const hex = s.tech ? '#7fe8ff' : TRACER[w.tier], mat = G.CB.tierMat(hex), life = Math.max(s.life, s.range * 1.15 / s.speed);
        for (let k = 0; k < s.pellets; k++) {
          const dir = h.c.subtract(from), L = dir.length(); dir.addInPlaceFromFloats(rand(-1, 1) * s.spread * L, rand(-.6, .6) * s.spread * L, rand(-1, 1) * s.spread * L); dir.normalize();
          G.CB.fire({ from, dir, speed: s.speed, dmg: s.dmg, owner: this, kind: 'tracer', mat, life, crit: s.crit, vsMachine: s.vsMachine, flash: FLASH_SIZE[w.arch] });
        }
        if (RECOIL[w.arch]) G.shake = Math.max(G.shake, RECOIL[w.arch]);
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
    this.H = medicModel();
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
  teleportNear(p) { this.pos.set(p.x - 1.6, 0, p.z - 1.4); this.down = 0; this.untargetable = false; this.hp = this.maxHp; standUp(this.H); this.mode = 'follow'; }
  update(dt) {
    const P = G.player, p = this.pos;
    if (!this.joined) { this.H.neck.rotation.y = Math.sin(G.t * .6) * .5; return; }
    if (this.down > 0) {
      fall(this.H, 1); this.down -= dt;
      if (dist2(P.pos, p) < 2.4 && P.down <= 0) { this.revive += dt; if (this.revive > 1.8) this.down = 0; } else this.revive = Math.max(0, this.revive - dt);
      if (this.down <= 0) { this.untargetable = false; this.hp = this.maxHp * .5; standUp(this.H); G.UI.feed('Mara is back up', '#ffb24a'); }
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
    squadAnim(this.H, speed, dt, !!T);
    this.cool -= dt;
    if (T && this.cool <= 0 && clearShot(p, T.pos, 1.3)) {
      const H = T.hitTargets(), h = H[Math.floor(Math.random() * H.length)] || { c: T.pos.add(V(0, 1, 0)) };
      const ry = this.root.rotation.y, from = V(p.x + Math.sin(ry) * 1.3 + Math.cos(ry) * .1, 1.52, p.z + Math.cos(ry) * 1.3 - Math.sin(ry) * .1), dir = h.c.subtract(from).normalize();
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
