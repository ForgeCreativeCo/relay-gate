/* Survival: no route to walk, just machines arriving, sooner and in bigger groups, until you go down or the arena's big boss does.
   A run lasts ten minutes at most: the big boss arrives at eight, and destroying it wins the run (see `finale` below).
   survival(arena) turns a map into what game.js plays. Each map's file says how it plays as an arena (SURVIVAL in region1.js, region2.js
   and region3.js, 1984 in region4.js, Origin in region5.js). The title screen picks between them; ?region=2 to 5 in the address opens the
   station, the Foundry, 1984 or Origin. Origin is won its own way, by wiping its research (region5.js). */
import { G, V, rand, dist2, inOpen, boost, angleTo, enclosed } from './core.js';
import { Drone, Walker, Husk, Mender, MEND } from './machines.js';
import { Crucible } from './crucible.js';
import { Infiltrator } from './infiltrator.js';
import { FirstMachine } from './firstmachine.js';
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
  /* A Hunter Walker arrives with every `walker` levels, `warn` seconds after you pick your upgrade. The arena's big boss (`big`, one of BIGS
     below) is the end of the run, and comes by the clock (`finale`); while it is alive groups take `ease` times as long to come. */
  boss: { walker: 3, warn: 3, wardenTough: .5, ease: 1.6, big: 'warden' },
  /* How a run ends, in seconds on the clock: the big boss arrives at `at`, and destroying it wins the run. At `limit` no more groups
     come: if the boss is still up, the fight goes on with what's already there until one of you is down. `won` is the pause between the
     boss going down and the card. (Not in an arena that is won some other way: Origin.) */
  finale: { at: 480, limit: 600, won: 3 },
  walkerGap: 45,                          // seconds between one walker arriving and the next
  tough: .08,                             // extra health per minute, on everything
  near: [26, 34],                         // how far from you they arrive: past the edge of the view
  gate: [16, 45, .35],                    // with the gate this far from you (nearest, farthest), this share of groups step out of it
  wreck: 15,                              // seconds a wreck lies there before it is cleared away
  /* Scrap builds a squad of your own: `drones` and `husks` together for `cost`, each with `tough` times the health of the ones it was copied
     from. No building again until every one of them is destroyed. */
  build: { cost: 100, drones: 3, husks: 2, tough: 1 },   // tough 1: the same health as the machines they copy (2 made them hard to kill)
  horn: 20,                               // the horn sounds when a group arrives, but not more often than this many seconds
  /* Menders weld wrecks back into machines. An arena that has them says from which minute they come, how many at once, and the chance a group brings one. */
  menders: null,                          // e.g. { from: 1, max: 3, chance: .45 }
  groups: true,                           // false: the arena brings the groups in itself, with run.wave (1984's time gates)
  xp: { drone: 2, husk: 3, mender: 3, walker: 12, warden: 40, crucible: 60, infiltrator: 50, first: 80, fabricator: 10, leech: 8 },   // what each kill is worth (Mara's count too)
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

/* The big bosses: the Warden, the Crucible in the Foundry, the Infiltrator in 1984, or the first machine in Origin. margin: the room it needs, where an arena has no arrive() to place it. */
const BIGS = {
  warden: { name: 'The Warden', short: 'Warden', shorts: 'Wardens', make: (x, z) => new Walker(x, z, { boss: true, patrolR: 0, leash: 1e9 }), margin: 2.4 },
  crucible: { name: 'The Crucible', short: 'Crucible', shorts: 'Crucibles', make: (x, z) => new Crucible(x, z), margin: 4 },
  infiltrator: { name: 'The Infiltrator', short: 'Infiltrator', shorts: 'Infiltrators', make: (x, z) => new Infiltrator(x, z), margin: .6 },
  first: { name: 'The first machine', short: 'First machine', shorts: 'First machines', make: (x, z) => new FirstMachine(x, z), margin: 1.6 },
};

const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/* arena: { num, name, blurb, preparing, build, gate, start, saveKey } and, where it differs from open ground,
   { look, indoor, indoorAt(x, z), noHorn, ambience, tune, arrive(p, kind), begin(R, run), tick(R, run, dt), stats(run), interactables(list) }.
   indoorAt says which parts of an open arena are walled in (the Foundry's tunnels), so drones keep to the ways through there.
   arrive says where a 'ground', 'air', 'walker' or 'boss' (the big boss) machine comes in (null for nowhere just now); without it they arrive off-screen.
   tick runs every frame; run.time is the clock, and run.gapK scales the time between groups (an arena can bring them faster or slower for a while).
   stats gives the end card more [number, label] pairs; run.kills counts what went down, by kind.
   music(run) is the arena's own music track for the moment (audio.js MUSIC; null for none), and musicKeys the tracks to load for it.
   introMusic is the track under its intro, if not the title's. outro(run) gives the shots of its ending, played when its big boss
   goes down and before the card (run.big is the wreck; it can set the scene for them, and onIntro runs through it as it does the intro). The boss's music, and the drums while walkers are about (unless walkerDrums is false), play over it. status(run) is a line for the HUD
   under the clock (the arena's objectives). bossMusic is the track for its big boss, if not the usual one.
   noAlly: Mara isn't in this arena (1984, where she can only reach you by payphone), so nobody heals you or gets you back up, and her
   upgrades aren't offered. onKill(R, machine, run) hears of every machine that goes down. With tune.groups false the arena brings the
   groups in itself: run.wave(c, flags) sends an ordinary one from c (a walker with it when one is due) and returns the husks and drones
   in it, each given `flags`; run.gap() is how long to leave before the next, run.room() how many more machines there is room for, and
   run.sizeAdd makes every group that much bigger; run.closed says the clock has run out and no more should be sent.
   What an arena can take away as a run goes on (Origin, where wiping the research unmakes the machines): run.ban.drone, .husk, .walker or
   .mender stops that kind coming, and run.toughK scales the health of everything that arrives. run.boss(x, z) brings the big boss in
   where and when the arena says, instead of with a level. winnable: the run can be won, with run.win(card); its record is the fastest
   win, not the longest run. */
export function survival(arena) {
  const T = Object.assign({}, TUNE, arena.tune), GATE = arena.gate, START = arena.start;
  T.boss = Object.assign({}, TUNE.boss, arena.tune && arena.tune.boss); const BIG = BIGS[T.boss.big];
  const ramp = ([a, b], m) => a + (b - a) * Math.min(1, m / T.by);
  let RUN = null;
  const need = (level) => Math.round(T.level[0] + T.level[1] * (level - 1) + T.level[2] * (level - 1) ** 2);

  /* the upgrades taken this run, for the end card */
  const taken = () => UPGRADES.filter(u => RUN.taken[u.id]).map(u => ({ kind: u.kind, text: u.name + (RUN.taken[u.id] > 1 ? ' ×' + RUN.taken[u.id] : '') }));
  /* a level: the game waits while you pick one of three upgrades */
  function levelUp(R) {
    RUN.xp -= need(RUN.level); RUN.level++;
    const pool = UPGRADES.filter(u => (!u.max || (RUN.taken[u.id] || 0) < u.max) && !(arena.noAlly && u.kind === 'mara')), picks = [];
    while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    G.audio.play('powerOn', { gain: .4, rate: 1.4, len: 1, fade: .3 });
    /* a boss comes with some levels: the card says so before you pick */
    const L = RUN.level, due = L % T.boss.walker === 0 && !RUN.ban.walker && !RUN.finale ? 'walker' : null, have = u => RUN.taken[u.id] || 0;   // no more walkers once the big boss is on its way
    G.UI.levelUp(L, picks.map(u => ({ kind: u.kind, name: u.name, text: u.tell(1), have: have(u), max: u.max, total: u.tell(have(u) + 1) })), (i) => {
      const u = picks[i]; RUN.taken[u.id] = have(u) + 1;
      for (const k in u.add) G.boost[k] = boost(k) + u.add[k];
      G.player.recalc(); G.ally.recalc(); R.say(`${u.name} · ${u.tell(have(u))}`, '#1fe0ff'); RUN.hudAt = 0;
      if (due) { RUN.due.push(due); RUN.dueAt = G.t + T.boss.warn; R.say(`Level ${L} · A Hunter Walker is coming`, '#ff6a5a'); }
    }, due === 'walker' ? 'A Hunter Walker arrives after this pick.' : '');
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

  /* Your squad: drones in the air and husks on foot, built together. You can build when you have the scrap and the last squad is gone. */
  const squadUp = () => RUN.squad.filter(a => a.alive);
  const canBuild = () => !squadUp().length && G.inv.scrap >= T.build.cost;
  const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
  const makeup = (list) => [plural(list.filter(a => a.kind === 'drone').length, 'drone'), plural(list.filter(a => a.kind === 'husk').length, 'husk')].join(', ');
  function build(R) {
    if (!RUN || RUN.over || G.player.down > 0) return;
    const B = T.build;
    if (!canBuild()) { R.say(squadUp().length ? 'Your squad is still standing · You can build again when it\'s gone' : `Not enough scrap · ${B.cost} builds ${B.drones} drones and ${B.husks} husks`, '#9aa0a6'); return; }
    const p = G.player.pos, k = B.tough * (1 + T.tough * RUN.time / 60), kinds = [...Array(B.drones).fill('drone'), ...Array(B.husks).fill('husk')]; G.inv.scrap -= B.cost;
    kinds.forEach((kind, i) => {
      const a = i / kinds.length * 6.283 + rand(0, 1), c = G.nav.snap(p.x + Math.cos(a) * 2.2, p.z + Math.sin(a) * 2.2, 3) || p;
      const m = kind === 'husk' ? new Husk(c.x, c.z, { ally: true, leash: 16 }) : new Drone(c.x, c.z, { ally: true });
      m.maxHp = m.hp = Math.round(m.hp * k); RUN.squad.push(R.add(m)); RUN.squadGone = false; G.FX.puffAt(V(c.x, 1.2, c.z), 10);
    });
    G.audio.play('powerOn', { pos: p, gain: .5, rate: 1.2, len: 1.4, fade: .3 }); R.say(`Built ${B.drones} drones and ${B.husks} husks · They fight for you until they're destroyed`, '#1fe0ff'); RUN.hudAt = 0; G.save.soon();
  }
  /* the scrap meter: what you have against what a squad costs, or what's left of the squad */
  function meter() {
    const B = T.build, s = G.inv.scrap, up = squadUp(), key = G.input.mode === 'touch' ? '' : ' · B', fill = s / B.cost;
    if (up.length) return { label: 'Squad', text: `${makeup(up)} · ${s} scrap`, fill };
    if (canBuild()) return { label: 'Build', text: `${B.drones} drones + ${B.husks} husks${key}`, fill, ready: true };
    return { label: 'Scrap', text: `${s} / ${B.cost} for a squad`, fill };
  }

  /* a machine joins the run: tougher the longer it has gone on, and tracked so it hunts you and its wreck gets cleared */
  function enlist(R, a) { a.maxHp = a.hp = Math.round(a.hp * (1 + T.tough * RUN.time / 60) * RUN.toughK); RUN.mine.push(R.add(a)); return a; }

  /* The boss a level has earned arrives: through the gate if it is in reach, otherwise wherever there is room for it.
     Only one big boss at a time; with nowhere to put it yet, it is tried again shortly. */
  function milestone(R, p) {
    const what = RUN.due[0], boss = what === 'big'; if (boss && RUN.big && RUN.big.alive) return;
    if (!boss && RUN.ban.walker) { RUN.due.shift(); return; }   // it was earned, but there are no walkers any more
    const gd = GATE ? dist2(p, GATE) : 1e9, mouth = T.gate && !RUN.gateShut && gd > 12 && gd < T.gate[1] ? { x: GATE.x, z: GATE.z - 3 } : null;
    const c = mouth || (arena.arrive ? arena.arrive(p, boss ? 'boss' : 'walker') : spot(p, boss ? BIG.margin : 1.5)); if (!c) return;
    RUN.due.shift();
    const w = boss ? BIG.make(c.x, c.z) : new Walker(c.x, c.z, { patrolR: 0, leash: 1e9 });
    w.root.rotation.y = angleTo(c, p);   // it arrives facing you
    if (boss) { w.maxHp = w.hp = Math.round(w.hp * (1 + T.boss.wardenTough * RUN.bigs++)); RUN.big = w; }
    enlist(R, w); if (boss) G.UI.boss(w);
    G.FX.puffAt(V(c.x, 2, c.z), 20);
    R.say((boss ? BIG.name : 'A Hunter Walker') + (mouth ? ' steps out of the gate' : ' has arrived'), '#ff6a5a');
  }
  const MAKE = { drone: (x, z) => new Drone(x, z), husk: (x, z) => new Husk(x, z, { leash: 1e9 }), mender: (x, z) => new Mender(x, z), walker: (x, z) => new Walker(x, z, { patrolR: 0, leash: 1e9 }) };

  /* One group arrives. Returns false if there was no room (or nowhere) for it, so it can be tried again shortly.
     from: all of it comes in there (an arena's own wave); flags are given to its husks and drones, which are also put in `out`. */
  function group(R, p, m, from, flags, out) {
    const alive = RUN.mine.filter(a => a.alive), room = Math.floor(ramp(T.cap, m)) - alive.length; if (room <= 0) return false;
    let n = Math.min(room, Math.round(ramp(T.size, m)) + (RUN.sizeAdd || 0));
    const gd = GATE ? dist2(p, GATE) : 1e9, mouth = !from && T.gate && !RUN.gateShut && gd > T.gate[0] && gd < T.gate[1] && Math.random() < T.gate[2] ? { x: GATE.x, z: GATE.z - 3 } : null;   // nothing comes through a gate that's been shut
    const at = (kind) => from ? (kind === 'walker' ? (enclosed(from.x, from.z) ? null : G.nav.wide.snap(from.x, from.z, 3)) : from) :   // no walker out of a wave that starts indoors (1984's arcade): it couldn't get out
      mouth || (arena.arrive ? arena.arrive(p, kind) : spot(p, kind === 'air' ? null : kind === 'walker' ? 1.5 : .6));
    const husks = ramp(T.husks, m), add = (a, plain) => { enlist(R, a); if (plain) { if (flags) Object.assign(a, flags); if (out) out.push(a); } return a; };
    const around = (c, r) => { const x = c.x + rand(-r, r), z = c.z + rand(-r, r); return G.nav.snap(x, z, 3) || c; };
    /* a walker, when one is due */
    const maxW = T.walkers.reduce((k, [from, count]) => m >= from ? count : k, 0);
    if (!RUN.ban.walker && maxW > alive.filter(a => a.kind === 'walker').length && G.t >= RUN.walkerAt) {
      const w = at('walker');
      if (w) { add(new Walker(w.x, w.z, { patrolR: 0, leash: 1e9 })); RUN.walkerAt = G.t + T.walkerGap; n -= 3;
        R.say(mouth ? 'A Hunter Walker is coming through the gate' : 'A Hunter Walker is closing in', '#ff6a5a'); }
    }
    /* the rest: husks on foot, drones in the air */
    const ground = at('ground'), air = at('air'); if (!ground && !air) return n < 0;
    const huskOK = ground && !RUN.ban.husk, droneOK = air && !RUN.ban.drone;
    for (let i = 0; i < n; i++) {
      if (huskOK && (!droneOK || Math.random() < husks)) { const c = around(ground, 2.5); add(new Husk(c.x, c.z, { leash: 1e9 }), true); }
      else if (droneOK) { const c = arena.indoor ? around(air, 2) : { x: air.x + rand(-3, 3), z: air.z + rand(-3, 3) }; add(new Drone(c.x, c.z), true); }
    }
    /* a mender, where the arena has them: it follows the group in and puts back together whatever you knock down */
    const md = T.menders, lead = air || ground;
    if (md && lead && !RUN.ban.mender && m >= md.from && alive.filter(a => a.kind === 'mender').length < md.max && Math.random() < md.chance) { const c = around(lead, 2); add(new Mender(c.x, c.z)); }
    if (mouth || (arena.arrive && !from)) for (const c of [ground, air]) if (c) G.FX.puffAt(V(c.x, 2, c.z), 12);
    return true;
  }

  return {
    num: arena.num, name: arena.name, tag: `Survival · ${arena.name}`,
    blurb: arena.blurb,
    titleNote: s => { const p = (s && s.progress) || {}, won = p.fastest ? `Your fastest win: ${clock(p.fastest)}.` : ''; if (arena.winnable) return won;
      return won || (p.best ? `Your best run: ${clock(p.best)}${p.bestLevel ? ', level ' + p.bestLevel : ''}. Not won yet.` : ''); },
    preparing: arena.preparing,
    hornSignals: true,   // the horn means a wave has arrived, so it never sounds at random here (audio.js)
    medic: !arena.noAlly,   // unless Mara gets to you first: here she heals you and gets you back up (actors.js)
    noAlly: !!arena.noAlly,
    musicKeys: [arena.bossMusic || 'boss', ...(arena.walkerDrums !== false ? ['drums'] : []), ...(arena.musicKeys || [])],
    intro: arena.intro, introMusic: arena.introMusic,
    /* each frame of an intro or an ending: what the arena does, and in an ending the boss's wreck keeps cooling though the world has stopped */
    onIntro(dt) { if (arena.onIntro) arena.onIntro(dt); if (RUN && RUN.wreck && !RUN.wreck.alive) RUN.wreck.update(dt); },   // the camera's sweep and Mara's lines before each run, and what the arena does each frame of it (intro.js)
    indoor: arena.indoor, indoorAt: arena.indoorAt, noHorn: arena.noHorn, ambience: arena.ambience, look: arena.look,
    /* each arena keeps its own record: in its own slot in this browser, and in its own document in your account */
    save: { key: arena.saveKey, doc: arena.saveKey },
    build: arena.build,
    start: START,
    fresh: () => { const p = G.progress || {}; return { gate: true, best: p.best || 0, bestLevel: p.bestLevel || 0, seenIntro: !!p.seenIntro, seenOutro: !!p.seenOutro, beatBoss: !!p.beatBoss, fastest: p.fastest || 0 }; },   // your best run outlives the run (and so does having beaten the big boss here, and your fastest win)
    gate: GATE,

    /* a run starts from nothing: the starter rifle, an empty pack, level 1, the clock at zero */
    spawn(R) {
      G.inv = newInventory(); G.boost = {}; G.player.recalc(); G.ally.recalc(); G.ally.healCD = G.ally.reviveCD = 0; G.ally.revives = 0; G.progress.kills = 0;
      RUN = { t0: G.t, last: G.t, time: 0, gapK: 1, nextAt: G.t + T.first, walkerAt: 0, hudAt: 0, mine: [], over: false, level: 1, xp: 0, taken: {}, due: [], dueAt: 0, hornAt: 0, squad: [], big: null, bigs: 0, kills: {}, mendSaidAt: 0, rebuilt: 0, ban: {}, toughK: 1 };
      /* for an arena's own events: send n machines (husks and drones in the usual mix) from c, each given the properties in flags */
      RUN.send = (c, n, flags = {}) => { const m = RUN.time / 60, out = [];
        for (let i = 0; i < n; i++) { const husk = Math.random() < ramp(T.husks, m) + .1, x = c.x + rand(-2.5, 2.5), z = c.z + rand(-2.5, 2.5), at = husk ? G.nav.snap(x, z, 3) || c : { x, z };
          const a = enlist(R, husk ? new Husk(at.x, at.z, { leash: 1e9 }) : new Drone(at.x, at.z)); Object.assign(a, flags); out.push(a); }
        G.FX.puffAt(V(c.x, 2, c.z), 16); return out; };
      RUN.size = () => Math.round(ramp(T.size, RUN.time / 60));   // how big an ordinary group is just now
      /* for an arena that brings its own groups in (tune.groups false) */
      RUN.wave = (c, flags) => { const out = []; group(R, G.player.pos, RUN.time / 60, c, flags, out); return out; };
      RUN.gap = () => ramp(T.gap, RUN.time / 60) * rand(.8, 1.2) * RUN.gapK * (RUN.big && RUN.big.alive ? T.boss.ease : 1);
      RUN.room = () => Math.floor(ramp(T.cap, RUN.time / 60)) - RUN.mine.filter(a => a.alive).length;
      /* the big boss, brought in by the arena */
      RUN.boss = (x, z) => { const w = BIG.make(x, z); RUN.big = w; RUN.bigs++; enlist(R, w); G.UI.boss(w); return w; };
      /* the run is won (an arena that can be): the clock stops, the fastest win is kept, and the card says so. card: what to say on it */
      RUN.win = (card = {}) => { if (RUN.over) return; RUN.over = true; G.audio.music(null);
        const P = G.progress, t = RUN.time, was = P.fastest || 0, record = !was || t < was; if (record) P.fastest = t; G.save.now();
        G.UI.endCard(Object.assign({ tag: `Survival · ${arena.name}`, name: `Done in ${clock(t)}`,
          record: record ? (was ? `New fastest · The one to beat was ${clock(was)}` : 'Your first time through') : `Your fastest is ${clock(was)}`, isRecord: record, text: '',
          stats: [[RUN.level, 'Level reached'], [P.kills, 'Machines down'], ...(arena.stats ? arena.stats(RUN) : [])], taken: taken(), again: 'Run again', others: G.otherArenas }, card)); };
      if (arena.begin) arena.begin(R, RUN);
    },
    interactables(R, progress, L) { if (arena.interactables) arena.interactables(L); },   // things to walk up to and use (the Foundry's kill switches)
    assemble: build,   // B, or the scrap meter: build machines of your own (`build` above is the map's)
    onKill(R, m) {
      if (!RUN || RUN.over) return; RUN.xp += T.xp[m.kind] || 1; RUN.kills[m.kind] = (RUN.kills[m.kind] || 0) + 1;
      if (arena.onKill) arena.onKill(R, m, RUN);
      if (m === RUN.big) { G.UI.boss(null); const loot = rollLoot('warden'); if (m.kind === 'crucible') loot.push({ scrap: 40 }); G.drops.scatter(m.pos.x, m.pos.z - 1, loot); R.say(`${BIG.name} is down`, '#1fe0ff');
        if (RUN.finale) { RUN.wonAt = G.t + T.finale.won; G.player.safe = Math.max(G.player.safe || 0, T.finale.won + 1); } }   // that was the end of the run: the card comes once the wreck has finished going up
    },
    /* the big boss calls for help as it weakens */
    onBossPhase(R, b, ph) {
      if (!RUN || RUN.over) return;
      R.say((b.phaseSay && b.phaseSay(ph)) || (ph === 2 ? 'The Warden is calling in drones and husks · Watch for missile markers' : 'The Warden is overheating · It\'s faster now'), '#ff6a5a');
      const near = (r) => { const x = b.pos.x + rand(-r, r), z = b.pos.z + rand(-r, r); return arena.indoor ? G.nav.snap(x, z, 4) : { x, z }; };
      for (let i = 0; i < 2; i++) { const c = near(6); if (c) enlist(R, new Drone(c.x, c.z)); }
      const c = G.nav.snap(b.pos.x + rand(-5, 5), b.pos.z + rand(-5, 5), 4); if (c) enlist(R, new Husk(c.x, c.z, { leash: 1e9 }));
    },
    /* the Crucible's hangar launches machines beside it */
    reinforce(R, b, kinds) {
      if (!RUN || RUN.over) return;
      kinds.forEach((kind, i) => { const a = b.root.rotation.y + (i % 2 ? 1 : -1) * Math.PI / 2, d = (b.radius || 2) + 1.5, x = b.pos.x + Math.sin(a) * d + rand(-1, 1), z = b.pos.z + Math.cos(a) * d + rand(-1, 1);
        const c = kind === 'drone' || kind === 'mender' ? (arena.indoor ? G.nav.snap(x, z, 4) : { x, z }) : G.nav.snap(x, z, 4); if (c) enlist(R, MAKE[kind](c.x, c.z)); });
    },
    /* A mender has welded a wreck back together: the wreck goes, and the same kind of machine gets up where it lay, on part of its health.
       It is worth XP again, but drops nothing. */
    rebuild(R, mender, w) {
      if (!RUN || RUN.over || w.alive || w.gone || !MAKE[w.kind]) return;
      const x = w.pos.x, z = w.pos.z, face = w.root.rotation.y; R.remove(w); w.gone = true;
      const m = enlist(R, MAKE[w.kind](x, z)); m.hp = Math.round(m.maxHp * MEND.hp); m.rebuilt = true; m.root.rotation.y = face; RUN.rebuilt++;
      G.FX.spark(V(x, 1, z), 30); G.FX.puffAt(V(x, 1, z), 10); G.audio.play('powerOn', { pos: m.pos, gain: .6, rate: 1.1, len: 1.4, fade: .3 });
      if (w.kind === 'walker' || G.t >= RUN.mendSaidAt) { RUN.mendSaidAt = G.t + 12; R.say(`A mender got ${w.kind === 'walker' ? 'a Hunter Walker' : 'a husk'} back up · Shoot menders while they weld`, '#ff6a5a'); }
    },

    update(R, p) {
      if (!RUN) return;
      const dt = Math.min(.05, Math.max(0, G.t - RUN.last)); RUN.last = G.t;
      if (RUN.over) return;
      if (G.player.down <= 0) RUN.time = G.t - RUN.t0;   // the clock stops when you go down
      G.audio.music(RUN.big && RUN.big.alive ? arena.bossMusic || 'boss' : arena.walkerDrums !== false && RUN.mine.some(a => a.alive && a.kind === 'walker') ? 'drums' : arena.music ? arena.music(RUN) : null);
      const m = RUN.time / 60;
      if (arena.tick) arena.tick(R, RUN, dt);
      /* machines hunt you wherever you go (their home is what they return to and patrol); wrecks are cleared after a while */
      for (const a of RUN.mine) {
        if (a.alive) { const h = a.raid && a.raid.camp && a.raid.camp.alive ? a.raid.camp.pos : p; a.home.x = h.x; a.home.z = h.z; }   // a raider heads for the camp it was sent at
        else if (!a.deadAt) a.deadAt = G.t;
        else if (G.t - a.deadAt > T.wreck && !(a.mendBy && a.mendBy.alive)) { R.remove(a); a.gone = true; }   // not while a mender is working on it
      }
      RUN.mine = RUN.mine.filter(a => !a.gone);
      /* your own machines stay with you (and are brought back if you outrun them); their wrecks are cleared the same way */
      for (const a of RUN.squad) {
        if (a.alive) { a.home.x = p.x; a.home.z = p.z; if (dist2(a.pos, p) > 34) { const c = G.nav.snap(p.x + rand(-2, 2), p.z + rand(-2, 2), 4); if (c) { a.pos.x = c.x; a.pos.z = c.z; } } }
        else if (!a.deadAt) a.deadAt = G.t;
        else if (G.t - a.deadAt > T.wreck && !a.gone) { R.remove(a); a.gone = true; }
      }
      if (RUN.squad.length && !RUN.squadGone && !squadUp().length) { RUN.squadGone = true; R.say('Your squad is gone · Scrap can build again', '#9aa0a6'); }   // once, however many went down together
      if (RUN.squad.length && RUN.squad.every(a => a.gone)) RUN.squad = [];
      /* the end of the run: the big boss at eight minutes, no more groups after ten, and the run won when the boss goes down */
      const F = arena.winnable ? null : T.finale;
      if (F && !RUN.finale && RUN.time >= F.at && G.player.down <= 0) { RUN.finale = true; RUN.due = RUN.due.filter(d => d === 'big'); RUN.due.push('big'); RUN.dueAt = G.t + T.boss.warn; RUN.hudAt = 0;
        R.say(`${BIG.name} is coming · Destroy it and the run is won`, '#ff6a5a'); }
      if (F && !RUN.closed && RUN.time >= F.limit) { RUN.closed = true; RUN.hudAt = 0; R.say('Ten minutes · Nothing more is coming · Finish it', '#ffb340'); }
      if (RUN.wonAt && G.t >= RUN.wonAt && G.player.down <= 0) { const n = G.ally.revives || 0;
        const card = { name: `${BIG.name} destroyed in ${clock(RUN.time)}`, text: (n ? `Mara got you back up ${n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times'}. ` : '') + 'Every run starts again from the starter rifle at level 1.' };
        /* the arena's ending first, if it has one: the world stops, the camera leaves you, and the card comes after. It's watched through the
           first time and can be skipped after that; the arena's own music carries on under it (the title's, where it has none) */
        const shots = arena.outro && arena.outro(RUN); RUN.wonAt = 0;
        if (shots) { G.setPaused(true); G.marks = []; G.UI.boss(null); G.CB.clear(); RUN.wreck = RUN.big;   // (no shots left hanging in the air; the wreck goes on cooling: see onIntro below)
          G.intro.play(shots, () => { G.progress.seenOutro = true; RUN.win(card); }, { watch: !G.progress.seenOutro, stay: true, music: !(arena.music && arena.music(RUN)) }); }
        else RUN.win(card);
        return; }
      if (RUN.due.length && G.t >= RUN.dueAt && G.player.down <= 0) { milestone(R, p); RUN.dueAt = G.t + 1; }
      if (T.groups && !RUN.closed && G.t >= RUN.nextAt && G.player.down <= 0) { const came = group(R, p, m);
        if (came && G.t >= RUN.hornAt) { G.audio.horn(true); RUN.hornAt = G.t + T.horn; }
        RUN.nextAt = G.t + (came ? ramp(T.gap, m) * rand(.8, 1.2) * RUN.gapK * (RUN.big && RUN.big.alive ? T.boss.ease : 1) : 1); }
      if (G.t >= RUN.hudAt) { RUN.hudAt = G.t + .25; G.UI.objective(RUN.finale ? `Destroy ${BIG.name} · ${clock(RUN.time)}${RUN.closed ? ' · overtime' : ''}` : F ? `Survive · ${clock(RUN.time)} · ${BIG.name} at ${clock(F.at)}` : `Survive · ${clock(RUN.time)} · ${G.progress.kills} down`); G.UI.status(arena.status ? arena.status(RUN) : ''); G.UI.xp(RUN.level, RUN.xp / need(RUN.level)); G.UI.build(meter()); }
      if (RUN.xp >= need(RUN.level) && G.player.down <= 0) levelUp(R);
    },

    /* going down ends the run */
    onDeath() {
      if (RUN.over) return; RUN.over = true; G.audio.music(null);
      if (arena.winnable) { const f = G.progress.fastest; G.save.now();   // here the record is the fastest win, so a run that ends this way doesn't set one
        G.UI.endCard({ tag: `Survival · ${arena.name}`, name: `You went down at ${clock(RUN.time)}`, record: f ? `Your fastest is ${clock(f)}` : '', text: arena.lost || 'Every run starts again from the starter rifle at level 1.',
          stats: [[RUN.level, 'Level reached'], [G.progress.kills, 'Machines down'], ...(arena.stats ? arena.stats(RUN) : [])], taken: taken(), again: 'Run again', others: G.otherArenas }); return; }
      const P = G.progress, t = RUN.time, was = P.best || 0, wasLevel = P.bestLevel, record = t > was; if (record) { P.best = t; P.bestLevel = RUN.level; } G.save.now();
      const n = G.ally.revives || 0;
      G.UI.endCard({ tag: `Survival · ${arena.name}`, name: `You lasted ${clock(t)}`,
        record: record ? (was ? `New best · The one to beat was ${clock(was)}` : 'New best · Your first run here') : `Best run ${clock(was)}${wasLevel ? ' · Level ' + wasLevel : ''}`, isRecord: record,
        text: (n ? `Mara got you back up ${n === 1 ? 'once' : n === 2 ? 'twice' : n + ' times'}. ` : '') + 'Every run starts again from the starter rifle at level 1.',
        stats: [[RUN.level, 'Level reached'], [P.kills, 'Machines down'], ...[['walker', 'Walker', 'Walkers'], [T.boss.big, BIG.short, BIG.shorts]].map(([k, one, many]) => { const n = RUN.kills[k] || 0; return [n, `${n === 1 ? one : many} destroyed`]; }),
          ...(arena.stats ? arena.stats(RUN) : [])],
        taken: taken(), again: 'Run again', others: G.otherArenas });
    },
  };
}
