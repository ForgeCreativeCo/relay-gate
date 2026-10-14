/* Cover that breaks: the stone pillars in Origin's lobby. Each has four looks, swapped as it takes fire: whole; chipped (bullet scars, the
   edges knocked off); cracked (a big piece gone, dust trickling from the break); and rubble. Gunfire from either side wears them down,
   a blast much faster (combat.js), and broken stays broken for the run. Rubble keeps the pillar's footprint, so the walkable grid never
   changes; only the obstacle's height drops, under the line shots fly along, so you can shoot over rubble but not walk through it.
   A pillar sinks like a wall while it's between you and the camera (cuts.js). Stone knocked off comes from one small pool of chunks,
   which settle and then sink into the floor, so nothing piles up. */
import { B, G, V, R as sr, rand } from './core.js';
import { Geo, gbox, gmesh } from './geo.js';

/* health; how wide the shaft is; how tall a whole pillar stands, and what's left standing once it's cracked, and as rubble */
export const PILLAR = { hp: 480, w: 1.1, h: 3.8, crackedH: 3.2, rubbleH: .9 };
const CHUNKS = 28, SETTLE = 3;   // stone chunks in the pool; seconds one lies still before it sinks away

/* the four looks, each built round (0, 0) on the floor */
function whole(g, H, W) {
  gbox(g, { x: 0, y: .15, z: 0, w: 1.45, h: .3, d: 1.45, uv: .5 }); gbox(g, { x: 0, y: .32, z: 0, w: 1.28, h: .06, d: 1.28, ao: false });
  gbox(g, { x: 0, y: H / 2, z: 0, w: W, h: H - .6, d: W, uv: .4 });
  for (const s of [-1, 1]) for (const k of [-1, 0, 1]) {   // fluting: shallow ribs up each face
    gbox(g, { x: k * .3, y: H / 2, z: s * (W / 2 + .012), w: .07, h: H - 1, d: .025, ao: false, tint: .93 });
    gbox(g, { x: s * (W / 2 + .012), y: H / 2, z: k * .3, w: .025, h: H - 1, d: .07, ao: false, tint: .93 }); }
  gbox(g, { x: 0, y: H - .4, z: 0, w: 1.22, h: .08, d: 1.22, ao: false }); gbox(g, { x: 0, y: H - .15, z: 0, w: 1.45, h: .3, d: 1.45, ao: false });
}
/* a scar where a round went in: a dark pit on one face of a block w across at height y */
function scars(g, n, y0, y1, w) {
  for (let k = 0; k < n; k++) { const f = Math.floor(sr(0, 4)), s = f < 2 ? 1 : -1, along = f % 2 === 0, a = sr(-w / 2 + .12, w / 2 - .12), y = sr(y0, y1), sz = sr(.07, .18);
    gbox(g, { x: along ? a : s * (w / 2 - .005), y, z: along ? s * (w / 2 - .005) : a, w: along ? sz : .03, h: sz * sr(.7, 1.2), d: along ? .03 : sz, ao: false, tint: .42 }); }
}
function chipped(g, H, W) {
  gbox(g, { x: -.08, y: .15, z: 0, w: 1.29, h: .3, d: 1.45, uv: .5 }); gbox(g, { x: .62, y: .15, z: -.18, w: .2, h: .3, d: 1.09, uv: .5 });   // a corner of the plinth gone
  for (let y = .3; y < H - .3; y += .4) { const w = W - sr(.02, .17), d = W - sr(.02, .17); gbox(g, { x: sr(-.03, .03), y: y + .2, z: sr(-.03, .03), w, h: .4, d, uv: .4, ao: y < 1 }); }
  scars(g, 12, .6, H - .5, W - .1);
  gbox(g, { x: -.1, y: H - .15, z: .05, w: 1.25, h: .3, d: 1.35, ao: false }); gbox(g, { x: .55, y: H - .2, z: -.3, w: .3, h: .2, d: .7, ao: false, tint: .8 });   // the capital, a piece off one side
}
function cracked(g, H, W) {
  gbox(g, { x: -.08, y: .15, z: .06, w: 1.29, h: .3, d: 1.33, uv: .5 });
  const top = 2.2; for (let y = .3; y < top; y += .38) { const w = W - sr(.06, .26), d = W - sr(.06, .26); gbox(g, { x: sr(-.05, .05), y: y + .19, z: sr(-.05, .05), w, h: .38, d, uv: .4, ao: y < 1 }); }
  gbox(g, { x: .12, y: top + .06, z: -.05, w: .7, h: .12, d: .8, ao: false, tint: .7, rz: .2 });   // the break, raw inside
  gbox(g, { x: .24, y: top + .55, z: .02, w: .55, h: .9, d: .9, ao: false, rz: .05 }); gbox(g, { x: .3, y: H - .45, z: .05, w: .5, h: .4, d: .75, ao: false, tint: .85 });   // what still holds the top up
  gbox(g, { x: .15, y: H - .15, z: .05, w: 1.1, h: .28, d: 1.2, ao: false, rz: .07 });
  scars(g, 18, .6, top - .1, W - .25);
}
function rubble(g, H, W) {
  gbox(g, { x: -.08, y: .15, z: .06, w: 1.29, h: .3, d: 1.33, uv: .5 }); gbox(g, { x: .05, y: .5, z: 0, w: .95, h: .42, d: .9, uv: .4 });
  gbox(g, { x: .1, y: .74, z: -.05, w: .6, h: .1, d: .5, ao: false, tint: .7, rz: .2 });
  for (let k = 0; k < 8; k++) { const a = sr(0, 6.283), d = sr(.35, .8), w = sr(.25, .6), h = sr(.15, .4);
    gbox(g, { x: Math.cos(a) * d, y: k < 5 ? h / 2 : .3 + h / 2, z: Math.sin(a) * d, w, h, d: sr(.25, .6), ry: sr(0, 3), rx: sr(-.3, .3), rz: sr(-.3, .3), tint: sr(.7, 1) }); }
}
const LOOKS = [whole, chipped, cracked, rubble];
const stageOf = f => f > 2 / 3 ? 0 : f > 1 / 3 ? 1 : f > 0 ? 2 : 3;

/* at: [[x, z], ...]; mat: the stone; cuts: the map's sinking pieces; ob(x, z, hw, hd, h) puts down an obstacle and returns it */
export function makePillars(at, mat, cuts, ob) {
  const S = G.scene, P = PILLAR, hw = P.w / 2;
  const list = at.map(([x, z], i) => {
    const node = new B.TransformNode('pillar' + i, S); node.position.set(x, 0, z);
    const looks = LOOKS.map((make, k) => { const g = Geo(); make(g, P.h, P.w); const m = gmesh(`pillar${i}_${k}`, g, mat, { parent: node }); m.setEnabled(!k); return m; });
    const p = { x, z, node, looks, hp: P.hp, stage: 0, dust: 0, ob: ob(x, z, hw, hw, P.h), cut: cuts.add(node, x - .75, z - .75, x + .75, z + .75, P.h) };
    p.ob.hit = (dmg, from) => hit(p, dmg, from);
    return p;
  });

  /* the chunks: a few shared boxes, so a whole fight's worth of stone draws in one call */
  const src = B.MeshBuilder.CreateBox('stoneChunk', { size: 1 }, S); src.material = mat; src.isPickable = false; src.receiveShadows = true; src.position.y = -60; if (G.sg) G.sg.addShadowCaster(src);
  const chunks = []; let next = 0;
  for (let k = 0; k < CHUNKS; k++) { const m = src.createInstance('stoneChunk' + k); m.isPickable = false; m.setEnabled(false); chunks.push({ m, v: V(0, 0, 0), w: V(0, 0, 0), rest: 0, live: false }); }
  function spill(x, y, z, n, size) {
    for (let k = 0; k < n; k++) { const c = chunks[next]; next = (next + 1) % CHUNKS; const a = rand(0, 6.283), out = rand(1.5, 4.5);
      c.m.position.set(x + Math.cos(a) * .5, y, z + Math.sin(a) * .5); c.m.scaling.set(size * rand(.5, 1), size * rand(.35, .8), size * rand(.5, 1)); c.m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      c.v.set(Math.cos(a) * out, rand(1, 4), Math.sin(a) * out); c.w.set(rand(-8, 8), rand(-8, 8), rand(-8, 8)); c.rest = 0; c.live = true; c.m.setEnabled(true); }
  }

  function setStage(p, st) {
    p.stage = st; p.looks.forEach((m, k) => m.setEnabled(k === st));
    p.ob.h = st === 3 ? P.rubbleH : st === 2 ? P.crackedH : P.h; p.cut.h = st === 3 ? P.rubbleH + .1 : P.h;
  }
  /* a hit: damage off its health, and a new look when it crosses into the next stage */
  function hit(p, dmg, from) {
    if (p.stage === 3) return; p.hp -= dmg; const st = stageOf(p.hp / P.hp); if (st <= p.stage) return;
    setStage(p, st); const y = st === 3 ? 1.2 : rand(1.4, 2.8);
    G.FX.dustAt(V(p.x, y, p.z), st === 3 ? 70 : 30); spill(p.x, y, p.z, st === 3 ? 8 : 4, st === 3 ? .45 : .3);
    G.audio.play(st === 3 ? 'boomBig' : 'boomSmall', { pos: p, gain: st === 3 ? .45 : .3, rate: st === 3 ? 1.4 : .65, hear: 50 });
    if (st === 3) G.shake = Math.max(G.shake, .25);
  }

  return {
    list,
    /* every run starts with the lobby whole */
    reset() { for (const p of list) { p.hp = P.hp; setStage(p, 0); } for (const c of chunks) { c.live = false; c.m.setEnabled(false); } },
    standing: () => list.filter(p => p.stage < 3).length,
    update(dt) {
      /* dust trickles from a cracked pillar */
      for (const p of list) if (p.stage === 2 && (p.dust -= dt) <= 0) { p.dust = rand(.5, 1.2); G.FX.puffAt(V(p.x + rand(-.3, .3), 2.3 + p.node.position.y, p.z + rand(-.3, .3)), 2); }
      /* chunks fall, bounce, lie still a while and sink away */
      for (const c of chunks) { if (!c.live) continue; const m = c.m, half = m.scaling.y / 2;
        if (c.rest > 0) { c.rest += dt; if (c.rest > SETTLE) { m.position.y -= dt * .25; if (m.position.y < -half) { c.live = false; m.setEnabled(false); } } continue; }
        c.v.y -= 20 * dt; m.position.addInPlace(c.v.scale(dt)); m.rotation.addInPlace(c.w.scale(dt));
        if (m.position.y < half) { m.position.y = half; c.v.y = -c.v.y * .25; c.v.x *= .5; c.v.z *= .5; c.w.scaleInPlace(.4);
          if (Math.abs(c.v.y) < 1 && Math.hypot(c.v.x, c.v.z) < .4) { c.rest = .001; m.rotation.x = Math.round(m.rotation.x / Math.PI) * Math.PI; m.rotation.z = Math.round(m.rotation.z / Math.PI) * Math.PI; } } }
    },
  };
}
