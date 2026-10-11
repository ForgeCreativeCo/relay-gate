/* The run: encounters, objectives, checkpoints, interactions and the boss. */
import { G, V, dist2, rand } from './core.js';
import { CHECKPOINTS, GATE } from './region1.js';
import { Ally, Raider } from './actors.js';
import { Drone, Walker } from './machines.js';
import { rollLoot, genArmor } from './loot.js';

export const OBJECTIVES = [
  { text: 'Talk to Mara by the campfire', at: () => G.ally.pos },
  { text: 'Head north up the Ring Road', at: () => V(0, 0, 44) },
  { text: 'Survive the Market Square', at: () => V(4, 0, 82) },
  { text: 'Get through the rail yard', at: () => V(50, 0, 98) },
  { text: 'Push north to the relay gate', at: () => V(50, 0, 120) },
  { text: 'Destroy the Warden', at: () => G.game.boss && G.game.boss.alive ? G.game.boss.pos : V(50, 0, 138) },
  { text: 'Step through the relay gate', at: () => V(GATE.x, 0, GATE.z - 2) },
  { text: 'Region cleared · Explore or run it again', at: () => null },
];

export function freshProgress() { return { step: 0, checkpoint: 'outpost', mara: false, raiders: false, stash: false, cleared: {}, gate: false, runs: 0, kills: 0 }; }

export function makeGame() {
  const GM = { encounters: [], boss: null, bossSeen: false };
  const P = () => G.progress;
  const say = (t, c) => G.UI.feed(t, c);
  const add = (a, enc) => { G.actors.push(a); if (enc) { enc.actors.push(a); a.dormant = !enc.live; } return a; };

  /* ---------- encounters ---------- */
  function encounter(id, trigger, build, onClear) {
    if (P().cleared[id]) return;
    const enc = { id, trigger, actors: [], live: false, onClear, cleared: false };
    GM.encounters.push(enc); build(enc);
  }
  GM.spawnAll = () => {
    encounter('drones1', p => p.z > 24, e => { [[-2, 40], [2.5, 45], [0, 50], [3, 36]].forEach(([x, z]) => add(new Drone(x, z), e)); },
      () => { if (P().step === 1) GM.setStep(2); });
    encounter('square', p => p.z > 57, e => {
      add(new Walker(7, 83, { patrolR: 4, leash: 11 }), e);
      [[-14, 75.5, 0], [-14.6, 80.5, 0], [-13.8, 86, 0]].forEach(([x, z]) => add(new Raider(x, z, { leash: 2.2, face: Math.PI / 2, alert: 26 }), e));
    }, () => { say('The square is clear', '#ffb24a'); if (P().step <= 2) GM.setStep(3); });
    encounter('drones2', p => p.x > 13 && p.z > 70, e => { [[28, 80], [32, 77.5], [36, 82]].forEach(([x, z]) => add(new Drone(x, z), e)); });
    encounter('north', p => p.x > 42 && p.z > 95, e => { add(new Walker(50, 108, { patrolR: 3, leash: 8 }), e); [[47.5, 112], [53, 104]].forEach(([x, z]) => add(new Drone(x, z), e)); });
    encounter('warden', p => p.z > 119 && p.x > 28, e => { GM.boss = add(new Walker(50, 138, { boss: true, patrolR: 0, leash: 15 }), e); },
      () => {});
    /* the Rust Dogs live in the rail yard whatever happens */
    GM.rustDogs = [[45, 76.5], [52.5, 75], [49, 81.5], [44, 80]].map(([x, z], i) => add(new Raider(x, z, { leash: 2.5, face: Math.PI * (i % 2 ? .3 : 1.2), heavy: i === 0 })));
  };
  GM.clearAll = () => {
    for (const a of G.actors) { if (a === G.player || a === G.ally) continue; a.root.getChildMeshes().forEach(m => m.dispose()); a.root.dispose(); if (a.smokeWreck) { a.smokeWreck.stop(); a.smokeHead.stop(); a.smokeGuns.stop(); } if (a.ring) a.ring.dispose(); if (a.clearMarks) a.clearMarks(); }
    G.actors = G.actors.filter(a => a === G.player || (a === G.ally && G.ally.joined));
    GM.encounters = []; GM.boss = null; GM.bossSeen = false; G.UI.boss(null);
  };

  /* ---------- objectives and checkpoints ---------- */
  GM.setStep = (n) => { if (n <= P().step) return; P().step = n; G.UI.objective(OBJECTIVES[n].text, true); G.save.soon(); };
  GM.objectiveTarget = () => { const o = OBJECTIVES[P().step]; return o && o.at ? o.at() : null; };
  GM.checkpoint = () => CHECKPOINTS.find(c => c.id === P().checkpoint) || CHECKPOINTS[0];

  /* ---------- interactions ---------- */
  GM.interactables = () => {
    const L = [];
    if (!G.ally.joined) L.push({ pos: G.ally.pos, r: 2.8, label: 'Talk to Mara', use: () => {
      say('Mara: "You\'re the one heading for the gate? Then you\'ll want a medic."', '#ffb24a');
      setTimeout(() => say('Mara: "Machines own everything north of here. Stay close."', '#ffb24a'), 1600);
      G.ally.join(); G.actors.push(G.ally); P().mara = true; GM.setStep(1); } });
    if (!P().stash) L.push({ pos: V(G.region.stash.x, 0, G.region.stash.z), r: 2.2, label: 'Open the Rust Dogs\' stash', use: () => {
      P().stash = true; G.drops.scatter(G.region.stash.x, G.region.stash.z - 1.6, rollLoot('stash'));
      if (GM.rustDogs.some(r => r.alive)) GM.setRaiderHostile('stash'); else say('Nobody left to object', '#9aa0a6'); G.save.soon(); } });
    if (P().gate && P().step >= 6) L.push({ pos: V(GATE.x, 0, GATE.z - 1.5), r: 3, label: 'Step through the relay gate', use: () => GM.finish() });
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
    if (m.kind === 'warden') {
      G.drops.scatter(m.pos.x, m.pos.z - 1, rollLoot('warden'));
      P().cleared.warden = true; P().gate = true; GM.setStep(6); G.UI.boss(null);
      say('The Warden is down · The gate is powering up', '#1fe0ff'); G.save.now();
    }
  };
  GM.onBossPhase = (b, ph) => {
    if (ph === 2) say('The Warden is calling in drones · Watch for missile markers', '#ff6a5a');
    if (ph === 3) say('The Warden is overheating · It\'s faster now', '#ff6a5a');
    const enc = GM.encounters.find(e => e.id === 'warden');
    for (let i = 0; i < 2; i++) { const a = rand(0, 6.28), d = add(new Drone(b.pos.x + Math.cos(a) * 6, b.pos.z + Math.sin(a) * 6), enc); d.dormant = false; d.home.set(50, 0, 136); }
  };

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
    P().step = 7; P().runs = (P().runs || 0) + 1; G.save.now(); G.UI.endCard();
  };
  GM.runAgain = () => {
    const keep = P(); G.progress = { ...freshProgress(), step: 1, mara: true, raiders: false, runs: keep.runs, kills: keep.kills };
    G.raiderHostile = false; GM.clearAll(); G.drops.clear(); G.CB.clear(); GM.spawnAll(); GM.applyGate();
    G.player.respawn(0, -5); G.camera.target.set(0, 0, -5); if (G.ally.joined) G.ally.teleportNear(G.player.pos);
    G.UI.objective(OBJECTIVES[1].text, true); G.save.now();
  };
  GM.applyGate = () => { const g = G.region.gate; g.source.intensity = P().gate ? 1.8 : .45; g.on = P().gate; };

  /* ---------- per frame ---------- */
  GM.update = (dt) => {
    const p = G.player.pos;
    for (const e of GM.encounters) {
      if (!e.live && e.trigger(p)) { e.live = true; e.actors.forEach(a => { a.dormant = false; });
        if (e.id === 'warden') { GM.bossSeen = true; G.UI.boss(GM.boss); say('The Warden guards the gate', '#ff6a5a'); if (P().step < 5) GM.setStep(5); } }
      if (e.live && !e.cleared) {
        const machines = e.actors.filter(a => a.faction === 'machine');
        const done = e.id === 'square' ? machines.filter(a => a.kind === 'walker').every(a => !a.alive) : machines.every(a => !a.alive);
        if (done) { e.cleared = true; P().cleared[e.id] = true; if (e.onClear) e.onClear(); G.save.soon(); }
      }
    }
    for (const c of CHECKPOINTS) {
      const idx = CHECKPOINTS.indexOf(c), cur = CHECKPOINTS.findIndex(q => q.id === P().checkpoint);
      if (idx > cur && dist2(p, c) < 6) { P().checkpoint = c.id; say('Checkpoint · ' + c.name, '#ffb24a'); G.save.soon(); }
    }
    if (P().step === 3 && p.z > 96 && p.x > 43) GM.setStep(4);
    if (P().step === 4 && p.z > 118) GM.setStep(5);
    if (P().step === 1 && p.z > 60) GM.setStep(2);
  };
  return GM;
}
