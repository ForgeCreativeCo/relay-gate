/* The run engine: encounters, objectives, checkpoints, interactions, the boss and finishing a region.
   What happens where comes from the current region (G.R, e.g. REGION in region1.js); this file knows no map. */
import { G, V, dist2 } from './core.js';
import { rollLoot } from './loot.js';

/* a region can start some of these differently (Region 02 opens with Mara already in the squad) */
export function freshProgress() { return Object.assign({ step: 0, checkpoint: G.R.checkpoints[0].id, mara: false, raiders: false, cleared: {}, gate: false, runs: 0, kills: 0 }, G.R.fresh && G.R.fresh()); }

export function makeGame() {
  const GM = { encounters: [], boss: null, bossSeen: false };
  const P = () => G.progress, REG = G.R, OBJ = REG.objectives;
  const say = (t, c) => G.UI.feed(t, c);
  const stepOf = (id) => OBJ.findIndex(o => o.id === id);
  const add = (a, enc) => { G.actors.push(a); if (enc) { enc.actors.push(a); a.dormant = !enc.live; } return a; };

  /* ---------- encounters ---------- */
  /* opts: when(playerPos) wakes it, spawn(enc) fills it, done(enc) says it's cleared (default: all its machines down), onClear() */
  function encounter(id, opts) {
    if (P().cleared[id]) return null;
    const enc = { id, when: opts.when, done: opts.done, onClear: opts.onClear, boss: !!opts.boss, actors: [], live: false, cleared: false };
    GM.encounters.push(enc); const a = opts.spawn(enc); if (enc.boss) GM.boss = a; return enc;
  }
  /* what a region's script gets to work with */
  const R = {
    encounter, add, say,
    boss: (id, opts) => encounter(id, Object.assign({}, opts, { boss: true })),
    step: (id) => GM.setStep(stepOf(id)),
    atStep: (id) => P().step === stepOf(id),
  };
  GM.spawnAll = () => REG.spawn(R);
  GM.clearAll = () => {
    for (const a of G.actors) { if (a === G.player || a === G.ally) continue; a.root.getChildMeshes().forEach(m => m.dispose()); a.root.dispose(); if (a.smokeWreck) { a.smokeWreck.stop(); a.smokeHead.stop(); a.smokeGuns.stop(); } if (a.ring) a.ring.dispose(); if (a.clearMarks) a.clearMarks(); }
    G.actors = G.actors.filter(a => a === G.player || (a === G.ally && G.ally.joined));
    GM.encounters = []; GM.boss = null; GM.bossSeen = false; G.UI.boss(null);
  };

  /* ---------- objectives and checkpoints ---------- */
  GM.objective = () => OBJ[P().step] || OBJ[0];
  GM.setStep = (n) => { if (n < 0 || n <= P().step) return; P().step = n; G.UI.objective(OBJ[n].text, true); G.save.soon(); };
  GM.objectiveTarget = () => { const o = OBJ[P().step]; return o && o.at ? o.at() : null; };
  GM.checkpoint = () => REG.checkpoints.find(c => c.id === P().checkpoint) || REG.checkpoints[0];

  /* ---------- interactions ---------- */
  GM.interactables = () => {
    const L = [];
    REG.interactables(R, P(), L);
    const g = REG.gate;
    if (P().gate && stepOf('gate') >= 0 && P().step >= stepOf('gate')) L.push({ pos: V(g.x, 0, g.z - 1.5), r: 3, label: 'Step through the relay gate', use: () => GM.finish() });
    return L;
  };
  GM.setRaiderHostile = (why) => {
    if (G.raiderHostile) return; G.raiderHostile = true; P().raiders = true;
    say(why === 'stash' ? 'The Rust Dogs saw that · Raiders are hostile now' : 'You opened fire on raiders · They\'re hostile now', '#ff6a5a'); G.save.soon();
  };

  /* ---------- kills ---------- */
  GM.onMachineDown = (m, src) => {
    P().kills++;
    if (m.kind === 'walker') G.drops.scatter(m.pos.x, m.pos.z, rollLoot('walker'));
    if (m === GM.boss) {
      const enc = GM.encounters.find(e => e.boss);
      G.drops.scatter(m.pos.x, m.pos.z - 1, rollLoot('warden'));
      if (enc) { enc.cleared = true; P().cleared[enc.id] = true; }
      P().gate = true; GM.setStep(stepOf('gate')); G.UI.boss(null);
      say(`${m.name} is down · The gate is powering up`, '#1fe0ff'); G.save.now();
    }
  };
  GM.onBossPhase = (b, ph) => REG.onBossPhase(R, b, ph, GM.encounters.find(e => e.boss));

  /* ---------- death and respawn ---------- */
  GM.onPlayerDown = () => {};
  GM.respawnPlayer = () => {
    const c = GM.checkpoint(); G.player.respawn(c.x, c.z); G.camera.target.set(c.x, 0, c.z);
    if (G.ally.joined) G.ally.teleportNear(G.player.pos);
    G.player.focus = null; for (const a of G.actors) if (a.target === G.player || a.target === G.ally) a.target = null;
    say('Back at ' + c.name, '#ffb24a');
  };

  /* ---------- finishing the region ---------- */
  GM.finish = () => {
    P().step = stepOf('done'); P().runs = (P().runs || 0) + 1; G.save.now(); G.UI.endCard();
  };
  GM.runAgain = () => {
    const keep = P(), s = REG.start; G.progress = { ...freshProgress(), step: stepOf(REG.rerunFrom), mara: true, raiders: false, runs: keep.runs, kills: keep.kills };
    G.raiderHostile = false; GM.clearAll(); G.drops.clear(); G.CB.clear(); G.FX.clearDebris(); GM.spawnAll(); GM.applyGate();
    G.player.respawn(s.x, s.z); G.camera.target.set(s.x, 0, s.z); if (G.ally.joined) G.ally.teleportNear(G.player.pos);
    G.UI.objective(GM.objective().text, true); G.save.now();
  };
  GM.applyGate = () => { const g = G.region.gate; g.source.intensity = P().gate ? 1.8 : .45; g.on = P().gate; };

  /* ---------- per frame ---------- */
  GM.update = (dt) => {
    const p = G.player.pos;
    for (const e of GM.encounters) {
      if (!e.live && e.when(p)) { e.live = true; e.actors.forEach(a => { a.dormant = false; });
        if (e.boss) { GM.bossSeen = true; G.UI.boss(GM.boss); say(`${GM.boss.name} guards the gate`, '#ff6a5a'); R.step('boss'); } }
      if (e.live && !e.cleared && !e.boss) {
        const done = e.done ? e.done(e) : e.actors.filter(a => a.faction === 'machine').every(a => !a.alive);
        if (done) { e.cleared = true; P().cleared[e.id] = true; if (e.onClear) e.onClear(); G.save.soon(); }
      }
    }
    const cps = REG.checkpoints, cur = cps.findIndex(q => q.id === P().checkpoint);
    cps.forEach((c, idx) => { if (idx > cur && dist2(p, c) < 6) { P().checkpoint = c.id; say('Checkpoint · ' + c.name, '#ffb24a'); G.save.soon(); } });
    REG.update(R, p);
  };
  return GM;
}
