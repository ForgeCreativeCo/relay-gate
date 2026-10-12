/* Factions, projectiles and damage shared by every actor. */
import { B, G, V, V3, insideObstacle, dist2 } from './core.js';

/* Two sides: the machines, and you, Mara and the machines you build. */
export function hostile(a, b) {
  if (!a || !b || a === b || !a.alive || !b.alive) return false;
  return a.faction !== b.faction;
}
export function nearestHostile(self, range, from) {
  const p = from || self.pos; let best = null, bd = range;
  for (const a of G.actors) { if (!hostile(self, a) || a.untargetable || a.dormant || a.lurk) continue; const d = dist2(p, a.pos); if (d < bd) { bd = d; best = a; } }
  return best;
}

const FLASH = { bolt: '#ff5a40', ally: '#ffd27a', tracer: '#ffc35a' };
const KINDS = {
  tracer: { mat: 'tracer', w: .07, len: 1.3, n: 60 },
  proto: { mat: 'tracer', w: .09, len: 1.4, n: 0 },
  bolt: { mat: 'bolt', w: .15, len: 1, n: 50 },
  ally: { mat: 'allyBolt', w: .07, len: 1.1, n: 20 },
};

export function makeCombat(M) {
  const pools = {};
  for (const k in KINDS) { const K = KINDS[k]; if (!K.n) continue; pools[k] = [];
    for (let i = 0; i < K.n; i++) { const m = B.MeshBuilder.CreateBox('p_' + k, { width: K.w, height: K.w, depth: K.len }, G.scene); m.material = M[K.mat]; m.isPickable = false; m.setEnabled(false); pools[k].push({ m, v: V(0, 0, 0), life: 0 }); } }
  const live = [];
  const CB = {};
  /* Player weapon colour follows the weapon's tier. */
  CB.tierMats = {};
  CB.tierMat = (hex) => { if (!CB.tierMats[hex]) { const m = new B.StandardMaterial('tm' + hex, G.scene); m.disableLighting = true; m.emissiveColor = B.Color3.FromHexString(hex); CB.tierMats[hex] = m; } return CB.tierMats[hex]; };

  CB.fire = (o) => {
    const pool = pools[o.kind] || pools.tracer, p = pool.find(q => q.life <= 0); if (!p) return;
    p.v.copyFrom(o.dir).scaleInPlace(o.speed || 50); p.m.position.copyFrom(o.from); p.m.lookAt(o.from.add(o.dir)); p.m.setEnabled(true);
    p.m.material = o.mat || M[KINDS[o.kind || 'tracer'].mat];
    p.life = o.life || 1.2; p.dmg = o.dmg; p.owner = o.owner; p.src = { faction: o.owner.faction, alive: true }; p.crit = o.crit || 0; p.vsMachine = o.vsMachine || 0;
    if (!live.includes(p)) live.push(p);
    /* muzzle flash, coloured like the round; o.flash sets its size (0 for none) */
    if (o.flash !== 0) G.FX.muzzle(o.from, o.dir, o.mat && o.mat.emissiveColor ? o.mat.emissiveColor.toHexString() : FLASH[o.kind] || '#ffc35a', o.flash || .6);
  };
  CB.update = (dt) => {
    /* gather hit spheres once per frame */
    const targets = [];
    for (const a of G.actors) if (a.alive && !a.untargetable) targets.push([a, a.hitTargets()]);
    for (let i = live.length - 1; i >= 0; i--) {
      const p = live[i]; if (p.life <= 0) { p.m.setEnabled(false); live.splice(i, 1); continue; }
      const step = p.v.scale(dt); let hit = null, wall = null;
      for (let si = 1; si <= 3 && !hit && !wall; si++) {
        const q = p.m.position.add(step.scale(si / 3));
        for (const [a, H] of targets) {
          if (a === p.owner || !hostile(p.src, a)) continue; if (Math.abs(q.x - a.pos.x) > 7 || Math.abs(q.z - a.pos.z) > 7) continue;
          for (const h of H) if (V3.DistanceSquared(q, h.c) < h.r * h.r) { hit = [a, h.part, q]; break; } if (hit) break;
        }
        if (!hit && (q.y < .02 || insideObstacle(q.x, q.z, q.y))) wall = q;
      }
      p.m.position.addInPlace(step); p.life -= dt;
      if (hit) {
        const [a, part, q] = hit; let d = p.dmg, crit = false;
        if (a.faction === 'machine' && p.vsMachine) d *= 1 + p.vsMachine / 100;
        if (p.crit && Math.random() < p.crit / 100) { d *= 1.8; crit = true; }
        const dealt = a.damage(d, part, p.owner, q.clone());
        if (p.owner === G.player && dealt > 0) { G.UI.number(q, Math.round(dealt), crit || (part !== 'core' && part !== 'body')); G.player.onHit(a, dealt); }
        G.FX.impact(q, a.faction === 'machine' ? 'metal' : 'body', p.v.scale(-1)); p.life = 0;
      } else if (wall) { G.FX.impact(wall, wall.y < .1 ? 'ground' : 'hard', p.v.scale(-1)); p.life = 0; }
      if (p.life <= 0) { p.m.setEnabled(false); live.splice(i, 1); }
    }
  };
  CB.clear = () => { for (const p of live) { p.life = 0; p.m.setEnabled(false); } live.length = 0; };
  /* Area damage (missiles, stomps, explosions). */
  CB.blast = (pos, radius, dmg, owner, opts = {}) => {
    for (const a of G.actors) { if (!a.alive || a === owner || !hostile({ faction: owner.faction, alive: true }, a)) continue; const d = dist2(pos, a.pos); if (d > radius + (a.radius || .5)) continue;
      const k = 1 - Math.min(1, d / (radius + .5)) * .5; a.damage(dmg * k, 'core', owner, a.pos.add(V(0, 1, 0)), { knock: opts.knock ? { from: pos, force: opts.knock } : null }); }
  };
  return CB;
}
