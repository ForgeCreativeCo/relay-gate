/* The run engine: plays whatever arena it is given (G.R, made by survival.js from a map): machines joining and leaving the run,
   kills, the Warden's phases, going down, and starting a fresh run. This file knows no map. */
import { B, G } from './core.js';
import { rollLoot } from './loot.js';

/* a fresh run's progress; the arena decides what carries over from the last one (your best time) */
export function freshProgress() { return Object.assign({ kills: 0 }, G.R.fresh && G.R.fresh()); }

export function makeGame() {
  const GM = {}, REG = G.R;
  const say = (t, c) => G.UI.feed(t, c);
  const add = (a) => { G.actors.push(a); return a; };
  /* Take an actor's model out of the scene, with the materials and smoke that were its own (their textures are shared, so those stay).
     A light riding on it (the searchlight on a walker's head) is let go first, or it would be disposed along with the model. */
  function discard(a) {
    for (const n of a.root.getDescendants()) if (n instanceof B.Light) n.parent = null;
    a.root.getChildMeshes().forEach(m => m.dispose()); a.root.dispose();
    for (const k of ['smokeWreck', 'smokeHead', 'smokeGuns']) if (a[k]) { a[k].stop(); a[k].dispose(false); }
    if (a.ring) { a.ring.material.dispose(); a.ring.dispose(); } if (a.clearMarks) a.clearMarks();
    for (const k of ['mat', 'matD', 'matL', 'eyeMat', 'beamMat', 'heatMat', 'laneMat']) if (a[k]) a[k].dispose();
  }
  /* what an arena's script gets to work with */
  const R = {
    add, say,
    remove: (a) => { discard(a); G.actors = G.actors.filter(x => x !== a); },   // an endless run clears its wrecks as it goes
  };
  GM.spawnAll = () => REG.spawn(R);
  GM.clearAll = () => {
    for (const a of G.actors) if (a !== G.player && a !== G.ally) discard(a);
    G.actors = G.actors.filter(a => a === G.player || a === G.ally);
    G.UI.boss(null);
  };

  /* things you can walk up to and use: an arena can offer some (none do yet) */
  GM.interactables = () => { const L = []; if (REG.interactables) REG.interactables(R, G.progress, L); return L; };

  /* ---------- kills ---------- */
  GM.onMachineDown = (m) => {
    G.progress.kills++; if (REG.onKill) REG.onKill(R, m);
    if (m.kind === 'walker' && !m.rebuilt) G.drops.scatter(m.pos.x, m.pos.z, rollLoot('walker'));   // a walker a mender put back together has nothing left worth salvaging
  };
  GM.build = () => { if (REG.assemble && G.started && !G.paused) REG.assemble(R); };   // spend scrap on machines of your own
  GM.onBossPhase = (b, ph) => REG.onBossPhase(R, b, ph);
  GM.rebuild = (mender, wreck) => { if (REG.rebuild) REG.rebuild(R, mender, wreck); };   // a mender has welded a wreck back together
  GM.reinforce = (boss, kinds) => { if (REG.reinforce) REG.reinforce(R, boss, kinds); };   // a boss launches machines of its own (the Crucible's hangar)

  /* ---------- going down: unless Mara gets to you, that's the end of the run ---------- */
  GM.onPlayerDown = () => {};
  GM.respawnPlayer = () => REG.onDeath(R);

  /* ---------- a fresh run in the same arena ---------- */
  GM.runAgain = () => {
    G.progress = freshProgress(); GM.clearAll(); G.drops.clear(); G.CB.clear(); G.FX.clearDebris(); GM.spawnAll(); GM.applyGate();
    const s = REG.start; G.player.respawn(s.x, s.z); G.camera.target.set(s.x, 0, s.z); G.ally.teleportNear(G.player.pos); G.save.now();
  };
  GM.applyGate = () => { const g = G.region.gate, on = !!G.progress.gate; g.source.intensity = on ? 1.8 : .45; g.on = on; };

  /* ---------- per frame ---------- */
  GM.update = () => REG.update(R, G.player.pos);
  return GM;
}
