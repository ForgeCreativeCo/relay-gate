/* Pathfinding for click-to-move and for everything on foot that chases: a walkable grid baked from the open areas and obstacles,
   A* over it, then the path pulled tight. */
import { G } from './core.js';

/* The player's grid, which Mara and the husks share (they are about as wide), plus coarser ones with more room
   around every wall and crate: `wide` for Hunter Walkers, `huge` for the Warden, and `giant` for the Crucible (baked the first time
   something asks for it, since only the Foundry has one). */
export function makeNav() { const nav = bake(.25, .45); nav.wide = bake(.5, 1.3, true); nav.huge = bake(.5, 2, true);
  let giant = null; Object.defineProperty(nav, 'giant', { get: () => giant || (giant = bake(.5, 3.4, true)) }); return nav; }

/* Where to walk right now to get to (tx, tz): straight there while the way is clear, otherwise the next corner of a path, looked up
   again a couple of times a second (each walker on its own beat, so a crowd doesn't all search in the same frame).
   With no way there at all it heads straight for it, as machines did before they could find paths. */
export function chase(self, nav, tx, tz, dt, reach = .5) {
  const p = self.pos;
  self.routeT = (self.routeT == null ? Math.random() * .5 : self.routeT) - dt;
  if (self.routeT <= 0) { const r = nav.path(p.x, p.z, tx, tz); self.route = r && r.length > 1 ? r : null; self.routeT = r ? .5 : 1.5; }
  const r = self.route;
  while (r && r.length > 1 && Math.hypot(r[0].x - p.x, r[0].z - p.z) < reach) r.shift();
  return r && r.length > 1 ? r[0] : { x: tx, z: tz };   // the last point is the goal itself
}

/* CELL: grid size; R: how far a body keeps from walls; erode: see below */
function bake(CELL, R, erode) {
  let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
  for (const o of G.open) { x0 = Math.min(x0, o[0]); z0 = Math.min(z0, o[1]); x1 = Math.max(x1, o[2]); z1 = Math.max(z1, o[3]); }
  const W = Math.ceil((x1 - x0) / CELL) + 1, H = Math.ceil((z1 - z0) / CELL) + 1, N = W * H;
  const walk = new Uint8Array(N);
  const cx = x => Math.floor((x - x0) / CELL), cz = z => Math.floor((z - z0) / CELL);
  const wx = i => x0 + (i % W + .5) * CELL, wz = i => z0 + (Math.floor(i / W) + .5) * CELL;
  const fill = (ax, az, bx, bz, v) => {
    const i0 = Math.max(0, Math.ceil((ax - x0) / CELL - .5)), i1 = Math.min(W - 1, Math.floor((bx - x0) / CELL - .5));
    const j0 = Math.max(0, Math.ceil((az - z0) / CELL - .5)), j1 = Math.min(H - 1, Math.floor((bz - z0) / CELL - .5));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) walk[j * W + i] = v;
  };
  if (!erode) for (const o of G.open) fill(o[0] + R, o[1] + R, o[2] - R, o[3] - R, 1);
  else {
    /* A wide body: shrinking each area on its own would close the joins between them (they overlap by about a metre), so mark all the
       open ground first, then keep only the cells with no edge of it within reach. */
    for (const o of G.open) fill(o[0], o[1], o[2], o[3], 1);
    const all = walk.slice(), k = Math.ceil(R / CELL), near = [];
    for (let dj = -k; dj <= k; dj++) for (let di = -k; di <= k; di++) if ((di * di + dj * dj) * CELL * CELL <= R * R) near.push(di, dj);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { if (!all[j * W + i]) continue;
      for (let n = 0; n < near.length; n += 2) { const ni = i + near[n], nj = j + near[n + 1]; if (ni < 0 || nj < 0 || ni >= W || nj >= H || !all[nj * W + ni]) { walk[j * W + i] = 0; break; } } }
  }
  const ground = walk.slice();   // open ground with room to stand, before anything is put on it
  for (const o of G.obstacles) fill(o.x - o.hw - R, o.z - o.hd - R, o.x + o.hw + R, o.z + o.hd + R, 0);

  const idx = (x, z) => { const i = cx(x), j = cz(z); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };
  const ok = (x, z) => { const k = idx(x, z); return k >= 0 && walk[k] === 1; };
  /* nearest walkable cell to a point, searching outward a few metres */
  function snap(x, z, maxR = 8) {
    if (ok(x, z)) return { x, z };
    const ci = cx(x), cj = cz(z), steps = Math.ceil(maxR / CELL);
    for (let r = 1; r <= steps; r++) {
      let best = -1, bd = 1e9;
      for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= W || j >= H || !walk[j * W + i]) continue;
        const k = j * W + i, d = (wx(k) - x) ** 2 + (wz(k) - z) ** 2; if (d < bd) { bd = d; best = k; }
      }
      if (best >= 0) return { x: wx(best), z: wz(best) };
    }
    return null;
  }
  /* straight walkable line between two points? */
  function line(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / (CELL * .5));
    for (let k = 1; k <= n; k++) { const t = k / n; if (!ok(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  }

  /* A* scratch space, reused between searches */
  const g = new Float32Array(N), from = new Int32Array(N), seen = new Uint32Array(N), closed = new Uint32Array(N); let stamp = 0;
  /* binary heap on typed arrays (stale entries are skipped when popped) */
  const CAP = N * 4, heap = new Int32Array(CAP), hf = new Float32Array(CAP); let hn = 0;
  const push = (k, f) => { if (hn >= CAP) return; let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= f) break; heap[i] = heap[p]; hf[i] = hf[p]; i = p; } heap[i] = k; hf[i] = f; };
  const pop = () => { const top = heap[0], lk = heap[--hn], lf = hf[hn]; let i = 0; for (;;) { const l = 2 * i + 1; if (l >= hn) break; const m = l + 1 < hn && hf[l + 1] < hf[l] ? l + 1 : l; if (hf[m] >= lf) break; heap[i] = heap[m]; hf[i] = hf[m]; i = m; } heap[i] = lk; hf[i] = lf; return top; };
  const DI = [1, -1, 0, 0, 1, 1, -1, -1], DJ = [0, 0, 1, -1, 1, -1, 1, -1], DC = [1, 1, 1, 1, Math.SQRT2, Math.SQRT2, Math.SQRT2, Math.SQRT2];

  /* Returns waypoints from (sx,sz) to near (tx,tz), or null if there is no way there. */
  function path(sx, sz, tx, tz) {
    const t = snap(tx, tz); if (!t) return null;
    const s = ok(sx, sz) ? { x: sx, z: sz } : snap(sx, sz, 3); if (!s) return [t];
    if (line(s.x, s.z, t.x, t.z)) return [t];
    const sk = idx(s.x, s.z), tk = idx(t.x, t.z), ti = tk % W, tj = (tk / W) | 0;
    stamp++; hn = 0;
    /* slightly over-weighted heuristic: a near-shortest path found much faster, and the string-pull below straightens it anyway */
    const h = k => { const dx = Math.abs(k % W - ti), dz = Math.abs(((k / W) | 0) - tj); return 1.3 * (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz)); };
    g[sk] = 0; seen[sk] = stamp; from[sk] = -1; push(sk, h(sk));
    let found = false, iter = 0;
    while (hn && iter++ < 300000) {
      const k = pop(); if (closed[k] === stamp) continue; closed[k] = stamp;
      if (k === tk) { found = true; break; }
      const i = k % W, j = (k / W) | 0;
      for (let d = 0; d < 8; d++) {
        const di = DI[d], dj = DJ[d], c = DC[d], ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nk = nj * W + ni; if (!walk[nk] || closed[nk] === stamp) continue;
        if (di && dj && !walk[j * W + ni] && !walk[nj * W + i]) continue; // no squeezing diagonally between two walls
        const ng = g[k] + c; if (seen[nk] === stamp && ng >= g[nk]) continue;
        seen[nk] = stamp; g[nk] = ng; from[nk] = k; push(nk, ng + h(nk));
      }
    }
    if (!found) return null;
    const cells = []; for (let k = tk; k !== -1; k = from[k]) cells.push(k); cells.reverse();
    /* pull the path tight: skip every waypoint you can see past */
    /* keep only the cells where the path turns, then try to see past them */
    const pts = [];
    for (let n = 1; n < cells.length; n++) { const a = cells[n - 1], b = cells[n], c = cells[n + 1]; if (c === undefined || b - a !== c - b) pts.push({ x: wx(b), z: wz(b) }); }
    if (!pts.length) pts.push(t); pts[pts.length - 1] = t;
    const out = []; let ax = s.x, az = s.z, i = -1;
    while (i < pts.length - 1) { let j = pts.length - 1; while (j > i + 1 && !line(ax, az, pts[j].x, pts[j].z)) j--; out.push(pts[j]); ax = pts[j].x; az = pts[j].z; i = j; }
    if (!out.length) out.push(t);
    return out;
  }
  /* on open ground with room to stand, whatever cover is in the way */
  const open = (x, z) => { const k = idx(x, z); return k >= 0 && ground[k] === 1; };
  return { path, snap, ok, line, open };
}
