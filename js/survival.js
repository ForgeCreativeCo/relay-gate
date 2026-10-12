/* Survival: no route to walk, just machines arriving, sooner and in bigger groups, until you go down.
   survival(arena) turns a map into a region like any other (the same shape, played by game.js). Each map's file says how it plays
   as an arena (SURVIVAL in region1.js and region2.js). Open one with ?mode=survival, adding &region=2 for the station. */
import { G, V, rand, dist2, inOpen, boost } from './core.js';
import { Drone, Walker, Husk } from './machines.js';
import { newInventory, rollLoot } from './loot.js';

/* The pressure curve. Pairs are [at the start, at full pressure]; `by` is the minute full pressure is reached. These are the numbers
   to tune by playing; an arena can replace any of them with its own `tune`. */
const TUNE = {
  first: 4,                               // seconds before the first group
  gap: [9, 4.5],                          // seconds between groups
  size: [2, 6],                           // machines in a group
  cap: [6, 22],                           // machines alive at once
  husks: [.3, .55],                       // how much of a group is husks rather than drones
  by: 9,
  walkers: [[6, 1], [10, 2], [14, 3]],    // from this minute, this many walkers at once can come with the ordinary groups
  /* Bosses arrive with your level: a Hunter Walker every `walker` levels and the Warden every `warden` levels, `warn` seconds after you pick
     your upgrade. Each Warden after the first has `wardenTough` more health again, and while one is alive groups take `ease` times as long to come. */
  boss: { walker: 3, warden: 10, warn: 3, wardenTough: .5, ease: 1.6 },
  walkerGap: 45,                          // seconds between one walker arriving and the next
  tough: .08,                             // extra health per minute, on everything
  near: [26, 34],                         // how far from you they arrive: past the edge of the view
  gate: [16, 45, .35],                    // with the gate this far from you (nearest, farthest), this share of groups step out of it
  wreck: 15,                              // seconds a wreck lies there before it is cleared away
  horn: 20,                               // the horn sounds when a group arrives, but not more often than this many seconds
  xp: { drone: 2, husk: 3, walker: 12, warden: 40 },   // what each kill is worth (Mara's count too)
  level: [8, 6, 1.2],                     // XP for the next level: the first number, plus the second per level so far, plus the third times that count squared
};

/* What a level-up can offer: three of these, picked at random. `add` goes into G.boost, where the weapon, the player and Mara read it.
   kind says whose it is (the card and the end card colour by it); tell(n) is what n picks of it come to. One with a `max` stops being
   offered after that many picks. */
const UPGRADES = [
  { id: 'dmg', kind: 'gun', name: 'Hollow points', add: { dmg: 15 }, tell: n => `+${15 * n}% weapon damage` },
  { id: 'rate', kind: 'gun', name: 'Tuned action', add: { rate: 12 }, tell: n => `+${12 * n}% fire rate` },
  { id: 'crit', kind: 'gun', name: 'Weak-point training', add: { crit: 8 }, max: 6, tell: n => `+${8 * n}% critical hit chance` },
  { id: 'range', kind: 'gun', name: 'Long sight', add: { range: 15 }, max: 3, tell: n => `+${15 * n}% lock-on range` },
  { id: 'leech', kind: 'gun', name: 'Salvage rig', add: { leech: 3 }, tell: n => `Heal ${3 * n} on each kill you make` },
  { id: 'hp', kind: 'you', name: 'Trauma plates', add: { hp: 25 }, tell: n => `+${25 * n} max health` },
  { id: 'regen', kind: 'you', name: 'Field dressing', add: { regen: 40 }, tell: n => `+${40 * n}% health regeneration` },
  { id: 'armor', kind: 'you', name: 'Scrap plating', add: { armor: 8 }, tell: n => `+${8 * n} armour` },
  { id: 'speed', kind: 'you', name: 'Light boots', add: { speed: 8 }, max: 5, tell: n => `+${8 * n}% move speed` },
  { id: 'dodge', kind: 'you', name: 'Quick recovery', add: { dodge: 20 }, max: 4, tell: n => `${20 * n}% faster dodge recovery` },
  { id: 'maraHeal', kind: 'mara', name: 'Field kit', add: { maraHeal: 10 }, tell: n => `Mara's heals give you ${10 * n} more health` },
  { id: 'maraCD', kind: 'mara', name: 'Quick hands', add: { maraCD: 25 }, max: 4, tell: n => `Mara heals and revives ${25 * n}% more often` },
  { id: 'mara', kind: 'mara', name: 'Steady aim', add: { mara: 30 }, tell: n => `Mara deals ${30 * n}% more damage` },
  { id: 'maraHp', kind: 'mara', name: 'Medic\'s vest', add: { maraHp: 40, maraUp: 25 }, max: 4, tell: n => `Mara has ${40 * n} more health and gets back up ${25 * n}% sooner` },
];

const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* arena: { num, name, startName, blurb, preparing, build, gate, start, saveKey } and, where it differs from open ground,
   { look, indoor, noHorn, ambience, tune, arrive(p, kind), begin(R, run), tick(R, run, dt) }.
   arrive says where a 'ground', 'air', 'walker' or 'boss' (the Warden) machine comes in (null for nowhere just now); without it they arrive off-screen.
   tick runs every frame; run.time is the clock, and run.gapK scales the time between groups (an arena can bring them faster for a while). */
export function survival(arena) {
  const T = Object.assign({}, TUNE, arena.tune), GATE = arena.gate, START = arena.start;
  const ramp = ([a, b], m) => a + (b - a) * Math.min(1, m / T.by);
  let RUN = null;
  const need = (level) => Math.round(T.level[0] + T.level[1] * (level - 1) + T.level[2] * (level - 1) ** 2);

  /* a level: the game waits while you pick one of three upgrades */
  function levelUp(R) {
    RUN.xp -= need(RUN.level); RUN.level++;
    const pool = UPGRADES.filter(u => !u.max || (RUN.taken[u.id] || 0) < u.max), picks = [];
    while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    G.audio.play('powerOn', { gain: .4, rate: 1.4, len: 1, fade: .3 });
    /* a boss comes with some levels: the card says so before you pick */
    const L = RUN.level, due = L % T.boss.warden === 0 ? 'warden' : L % T.boss.walker === 0 ? 'walker' : null, have = u => RUN.taken[u.id] || 0;
    G.UI.levelUp(L, picks.map(u => ({ kind: u.kind, name: u.name, text: u.tell(1), have: have(u), max: u.max, total: u.tell(have(u) + 1) })), (i) => {
      const u = picks[i]; RUN.taken[u.id] = have(u) + 1;
      for (const k in u.add) G.boost[k] = boost(k) + u.add[k];
      G.player.recalc(); G.ally.recalc(); R.say(`${u.name} · ${u.tell(have(u))}`, '#1fe0ff'); RUN.hudAt = 0;
      if (due) { RUN.due.push(due); RUN.dueAt = G.t + T.boss.warn; R.say(due === 'warden' ? `Level ${L} · The Warden is coming` : `Level ${L} · A Hunter Walker is coming`, '#ff6a5a'); }
    }, due === 'warden' ? 'The Warden arrives after this pick.' : due === 'walker' ? 'A Hunter Walker arrives after this pick.' : '');
  }

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

  /* a machine joins the run: tougher the longer it has gone on, and tracked so it hunts you and its wreck gets cleared */
  function enlist(R, a) { a.maxHp = a.hp = Math.round(a.hp * (1 + T.tough * RUN.time / 60)); RUN.mine.push(R.add(a)); return a; }

  /* The boss a level has earned arrives: through the gate if it is in reach, otherwise wherever there is room for it.
     Only one Warden at a time; with nowhere to put it yet, it is tried again shortly. */
  function milestone(R, p) {
    const what = RUN.due[0], boss = what === 'warden'; if (boss && RUN.warden && RUN.warden.alive) return;
    const gd = dist2(p, GATE), mouth = T.gate && gd > 12 && gd < T.gate[1] ? { x: GATE.x, z: GATE.z - 3 } : null;
    const c = mouth || (arena.arrive ? arena.arrive(p, boss ? 'boss' : 'walker') : spot(p, boss ? 2.4 : 1.5)); if (!c) return;
    RUN.due.shift();
    const w = new Walker(c.x, c.z, { boss, patrolR: 0, leash: 1e9 });
    if (boss) { w.maxHp = w.hp = Math.round(w.hp * (1 + T.boss.wardenTough * RUN.wardens++)); RUN.warden = w; }
    enlist(R, w); if (boss) G.UI.boss(w);
    G.FX.puffAt(V(c.x, 2, c.z), 20);
    R.say((boss ? 'The Warden' : 'A Hunter Walker') + (mouth ? ' steps out of the gate' : ' has arrived'), '#ff6a5a');
  }

  /* One group arrives. Returns false if there was no room (or nowhere) for it, so it can be tried again shortly. */
  function group(R, p, m) {
    const alive = RUN.mine.filter(a => a.alive), room = Math.floor(ramp(T.cap, m)) - alive.length; if (room <= 0) return false;
    let n = Math.min(room, Math.round(ramp(T.size, m)));
    const gd = dist2(p, GATE), mouth = T.gate && gd > T.gate[0] && gd < T.gate[1] && Math.random() < T.gate[2] ? { x: GATE.x, z: GATE.z - 3 } : null;
    const at = (kind) => mouth || (arena.arrive ? arena.arrive(p, kind) : spot(p, kind === 'air' ? null : kind === 'walker' ? 1.5 : .6));
    const husks = ramp(T.husks, m), add = (a) => enlist(R, a);
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
    titleNote: s => { const p = (s && s.progress) || {}; return p.best ? `Your best run: ${clock(p.best)}${p.bestLevel ? ', level ' + p.bestLevel : ''}.` : ''; },
    clearedText: '',
    preparing: arena.preparing,
    endless: true,   // no checkpoints to continue from: every visit is a new run, and going down ends it
    hornSignals: true,   // the horn means a wave has arrived, so it never sounds at random here (audio.js)
    medic: true,     // unless Mara gets to you first: here she heals you and gets you back up (actors.js)
    indoor: arena.indoor, noHorn: arena.noHorn, ambience: arena.ambience, look: arena.look,
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

    /* a run starts from nothing: the starter rifle, an empty pack, level 1, the clock at zero */
    spawn(R) {
      G.inv = newInventory(); G.boost = {}; G.player.recalc(); G.ally.recalc(); G.ally.healCD = G.ally.reviveCD = 0; G.ally.revives = 0; G.progress.kills = 0;
      RUN = { t0: G.t, last: G.t, time: 0, gapK: 1, nextAt: G.t + T.first, walkerAt: 0, hudAt: 0, mine: [], over: false, level: 1, xp: 0, taken: {}, due: [], dueAt: 0, hornAt: 0, warden: null, wardens: 0, bosses: { walker: 0, warden: 0 } };
      if (arena.begin) arena.begin(R, RUN);
    },
    interactables() {},
    onKill(R, m) {
      if (!RUN || RUN.over) return; RUN.xp += T.xp[m.kind] || 1; if (m.kind in RUN.bosses) RUN.bosses[m.kind]++;
      if (m === RUN.warden) { G.UI.boss(null); G.drops.scatter(m.pos.x, m.pos.z - 1, rollLoot('warden')); R.say('The Warden is down', '#1fe0ff'); }
    },
    /* the Warden calls for help as it weakens */
    onBossPhase(R, b, ph) {
      if (!RUN || RUN.over) return;
      R.say(ph === 2 ? 'The Warden is calling in drones and husks · Watch for missile markers' : 'The Warden is overheating · It\'s faster now', '#ff6a5a');
      const near = (r) => { const x = b.pos.x + rand(-r, r), z = b.pos.z + rand(-r, r); return arena.indoor ? G.nav.snap(x, z, 4) : { x, z }; };
      for (let i = 0; i < 2; i++) { const c = near(6); if (c) enlist(R, new Drone(c.x, c.z)); }
      const c = G.nav.snap(b.pos.x + rand(-5, 5), b.pos.z + rand(-5, 5), 4); if (c) enlist(R, new Husk(c.x, c.z, { leash: 1e9 }));
    },

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
      if (RUN.due.length && G.t >= RUN.dueAt && G.player.down <= 0) { milestone(R, p); RUN.dueAt = G.t + 1; }
      if (G.t >= RUN.nextAt && G.player.down <= 0) { const came = group(R, p, m);
        if (came && G.t >= RUN.hornAt) { G.audio.horn(true); RUN.hornAt = G.t + T.horn; }
        RUN.nextAt = G.t + (came ? ramp(T.gap, m) * rand(.8, 1.2) * RUN.gapK * (RUN.warden && RUN.warden.alive ? T.boss.ease : 1) : 1); }
      if (G.t >= RUN.hudAt) { RUN.hudAt = G.t + .25; G.UI.objective(`Survive · ${clock(RUN.time)} · ${G.progress.kills} down`); G.UI.xp(RUN.level, RUN.xp / need(RUN.level)); }
      if (RUN.xp >= need(RUN.level) && G.player.down <= 0) levelUp(R);
    },

    /* going down ends the run */
    onDeath() {
      if (RUN.over) return; RUN.over = true;
      const P = G.progress, t = RUN.time, was = P.best || 0, wasLevel = P.bestLevel, record = t > was; if (record) { P.best = t; P.bestLevel = RUN.level; } G.save.now();
      const n = G.ally.revives || 0;
      G.UI.endCard({ tag: `Survival · ${arena.name}`, name: `You lasted ${clock(t)}`,
        record: record ? (was ? `New best · The one to beat was ${clock(was)}` : 'New best · Your first run here') : `Best run ${clock(was)}${wasLevel ? ' · Level ' + wasLevel : ''}`, isRecord: record,
        text: (n ? `Mara got you back up ${n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times'}. ` : '') + 'Every run starts again from the starter rifle at level 1.',
        stats: [[RUN.level, 'Level reached'], [P.kills, 'Machines down'], [RUN.bosses.walker, RUN.bosses.walker === 1 ? 'Walker destroyed' : 'Walkers destroyed'], [RUN.bosses.warden, RUN.bosses.warden === 1 ? 'Warden destroyed' : 'Wardens destroyed']],
        taken: UPGRADES.filter(u => RUN.taken[u.id]).map(u => ({ kind: u.kind, text: u.name + (RUN.taken[u.id] > 1 ? ' ×' + RUN.taken[u.id] : '') })),
        again: 'Run again', other: G.otherArena });
    },
  };
}
