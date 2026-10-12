/* Survival: no route to walk, just machines arriving, sooner and in bigger groups, until you go down.
   survival(arena) turns a map into a region like any other (the same shape, played by game.js). Each map's file says how it plays
   as an arena (SURVIVAL in region1.js and region2.js). Open one with ?mode=survival, adding &region=2 for the station. */
import { G, V, rand, dist2, inOpen } from './core.js';
import { Drone, Walker, Husk } from './machines.js';
import { newInventory } from './loot.js';

/* The pressure curve. Pairs are [at the start, at full pressure]; `by` is the minute full pressure is reached. These are the numbers
   to tune by playing; an arena can replace any of them with its own `tune`. */
const TUNE = {
  first: 4,                               // seconds before the first group
  gap: [9, 4.5],                          // seconds between groups
  size: [2, 6],                           // machines in a group
  cap: [6, 22],                           // machines alive at once
  husks: [.3, .55],                       // how much of a group is husks rather than drones
  by: 9,
  walkers: [[2.5, 1], [6, 2], [10, 3]],   // from this minute, this many walkers at once
  walkerGap: 45,                          // seconds between one walker arriving and the next
  tough: .08,                             // extra health per minute, on everything
  near: [26, 34],                         // how far from you they arrive: past the edge of the view
  gate: [16, 45, .35],                    // with the gate this far from you (nearest, farthest), this share of groups step out of it
  wreck: 15,                              // seconds a wreck lies there before it is cleared away
};

const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* arena: { num, name, startName, blurb, preparing, build, gate, start, saveKey } and, where it differs from open ground,
   { look, indoor, noHorn, tune, arrive(p, kind), begin(R, run), tick(R, run, dt) }.
   arrive says where a 'ground', 'air' or 'walker' machine comes in (null for nowhere just now); without it they arrive off-screen.
   tick runs every frame; run.time is the clock, and run.gapK scales the time between groups (an arena can bring them faster for a while). */
export function survival(arena) {
  const T = Object.assign({}, TUNE, arena.tune), GATE = arena.gate, START = arena.start;
  const ramp = ([a, b], m) => a + (b - a) * Math.min(1, m / T.by);
  let RUN = null;

  /* Somewhere to arrive, past the edge of the view. Drones fly in over the ruins from anywhere (no margin given). Ground machines
     look for a spot with a clear walk to you first, and settle for any open ground. */
  function spot(p, margin) {
    let any = null;
    for (let k = 0; k < 40; k++) {
      const a = rand(0, 6.283), d = rand(...T.near), x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (margin == null) return { x, z };
      if (!inOpen(x, z, margin) || !G.nav.ok(x, z)) continue;
      if (G.nav.line(x, z, p.x, p.z)) return { x, z };
      any = any || { x, z };
    }
    return any;
  }

  /* One group arrives. Returns false if there was no room (or nowhere) for it, so it can be tried again shortly. */
  function group(R, p, m) {
    const alive = RUN.mine.filter(a => a.alive), room = Math.floor(ramp(T.cap, m)) - alive.length; if (room <= 0) return false;
    let n = Math.min(room, Math.round(ramp(T.size, m)));
    const gd = dist2(p, GATE), mouth = T.gate && gd > T.gate[0] && gd < T.gate[1] && Math.random() < T.gate[2] ? { x: GATE.x, z: GATE.z - 3 } : null;
    const at = (kind) => mouth || (arena.arrive ? arena.arrive(p, kind) : spot(p, kind === 'air' ? null : kind === 'walker' ? 1.5 : .6));
    const tough = 1 + T.tough * m, husks = ramp(T.husks, m);
    const add = (a) => { a.maxHp = a.hp = Math.round(a.hp * tough); RUN.mine.push(R.add(a)); };
    const around = (c, r) => { const x = c.x + rand(-r, r), z = c.z + rand(-r, r); return G.nav.snap(x, z, 3) || c; };
    /* a walker, when one is due */
    const maxW = T.walkers.reduce((k, [from, count]) => m >= from ? count : k, 0);
    if (maxW > alive.filter(a => a.kind === 'walker').length && G.t >= RUN.walkerAt) {
      const w = at('walker');
      if (w) { add(new Walker(w.x, w.z, { patrolR: 0, leash: 1e9 })); RUN.walkerAt = G.t + T.walkerGap; n -= 3;
        R.say(mouth ? 'A Hunter Walker is coming through the gate' : 'A Hunter Walker is closing in', '#ff6a5a'); }
    }
    /* the rest: husks on foot, drones in the air */
    const ground = at('ground'), air = at('air'); if (!ground && !air) return n < 0;
    for (let i = 0; i < n; i++) {
      if (ground && (!air || Math.random() < husks)) { const c = around(ground, 2.5); add(new Husk(c.x, c.z, { leash: 1e9 })); }
      else { const c = arena.indoor ? around(air, 2) : { x: air.x + rand(-3, 3), z: air.z + rand(-3, 3) }; add(new Drone(c.x, c.z)); }
    }
    if (mouth || arena.arrive) for (const c of [ground, air]) if (c) G.FX.puffAt(V(c.x, 2, c.z), 12);
    return true;
  }

  return {
    num: arena.num, name: arena.name, tag: `Survival · ${arena.name}`,
    blurb: arena.blurb,
    titleNote: s => { const b = s && s.progress && s.progress.best; return b ? `Your best run: ${clock(b)}.` : ''; },
    clearedText: '',
    preparing: arena.preparing,
    endless: true,   // no checkpoints to continue from: every visit is a new run, and going down ends it
    indoor: arena.indoor, noHorn: arena.noHorn, look: arena.look,
    /* its own slot in this browser, so a run never touches your campaign save */
    save: { key: arena.saveKey, localOnly: true },
    build: arena.build,
    start: START,
    allyWait: { x: START.x - 1.6, z: START.z - 1.4, face: 0 },
    fresh: () => ({ mara: true, gate: true, best: (G.progress && G.progress.best) || 0 }),   // Mara is in every run; your best time outlives the run
    gate: GATE,
    checkpoints: [{ id: 'start', name: arena.startName, x: START.x, z: START.z }],
    objectives: [{ id: 'survive', text: 'Survive', at: () => null }],
    rerunFrom: 'survive',

    /* a run starts from nothing: the starter rifle, an empty pack, the clock at zero */
    spawn(R) {
      G.inv = newInventory(); G.player.recalc(); G.progress.kills = 0;
      RUN = { t0: G.t, last: G.t, time: 0, gapK: 1, nextAt: G.t + T.first, walkerAt: 0, hudAt: 0, mine: [], over: false };
      if (arena.begin) arena.begin(R, RUN);
    },
    interactables() {},
    onBossPhase() {},

    update(R, p) {
      if (!RUN) return;
      const dt = Math.min(.05, Math.max(0, G.t - RUN.last)); RUN.last = G.t;
      if (RUN.over) return;
      if (G.player.down <= 0) RUN.time = G.t - RUN.t0;   // the clock stops when you go down
      const m = RUN.time / 60;
      if (arena.tick) arena.tick(R, RUN, dt);
      /* machines hunt you wherever you go (their home is what they return to and patrol); wrecks are cleared after a while */
      for (const a of RUN.mine) {
        if (a.alive) { a.home.x = p.x; a.home.z = p.z; }
        else if (!a.deadAt) a.deadAt = G.t;
        else if (G.t - a.deadAt > T.wreck) { R.remove(a); a.gone = true; }
      }
      RUN.mine = RUN.mine.filter(a => !a.gone);
      if (G.t >= RUN.nextAt && G.player.down <= 0) RUN.nextAt = G.t + (group(R, p, m) ? ramp(T.gap, m) * rand(.8, 1.2) * RUN.gapK : 1);
      if (G.t >= RUN.hudAt) { RUN.hudAt = G.t + .25; G.UI.objective(`Survive · ${clock(RUN.time)} · ${G.progress.kills} down`); }
    },

    /* going down ends the run */
    onDeath() {
      if (RUN.over) return; RUN.over = true;
      const P = G.progress, t = RUN.time, was = P.best || 0; if (t > was) P.best = t; G.save.now();
      G.UI.endCard({ tag: 'Survival', name: `You lasted ${clock(t)}`,
        text: t > was && was ? `A new best: the one to beat was ${clock(was)}.` : 'The machines keep coming through the gate. Every run starts again from the starter rifle.',
        stats: [[clock(t), 'Time survived'], [P.kills, 'Machines down'], [clock(P.best), 'Best run']], again: 'Run again' });
    },
  };
}
