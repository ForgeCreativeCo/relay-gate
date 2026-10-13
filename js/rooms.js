/* Rooms: the walls and floors of an indoor map, worked out from its walkable rectangles. The rooms are rasterised onto a grid, every cell
   close to open floor becomes wall, and walls and floors are merged into as few boxes as possible. What a wall or a floor looks like is
   the map's business (the Relay Station's dim with its power; Origin's are white): this only says where they go. */

/* greedy merge of a labelled grid into rectangles: the longest run along a row, then down as many rows as match */
export function greedy(lab, W, H, emit) {
  const used = new Uint8Array(W * H);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const k = j * W + i, L = lab[k]; if (L < 0 || used[k]) continue;
    let w = 1; while (i + w < W && lab[k + w] === L && !used[k + w]) w++;
    let h = 1; grow: while (j + h < H) { for (let q = 0; q < w; q++) { const kk = (j + h) * W + i + q; if (lab[kk] !== L || used[kk]) break grow; } h++; }
    for (let b = 0; b < h; b++) for (let q = 0; q < w; q++) used[(j + b) * W + i + q] = 1;
    emit(i, j, w, h, L);
  }
}

/* rooms: [{ r: [x0, z0, x1, z1], zone }], on a grid of `cell` metres; where two overlap, the one listed first owns the floor. A wall
   cell is one within `thick` cells of open floor. For each merged wall box, wall(zone, sinks, x0, z0, x1, z1, faces) is called: zone is
   that of the floor it borders; sinks says whether that floor lies north or east of it, so that it can come between you and the camera
   (which looks in from the south-west); faces are the stretches of it that look onto open floor, each [x0, z0, x1, z1, normal x, normal z].
   For each floor slab, floor(zone, x, z, w, d) is called with its centre and size: one slab per zone-coloured rectangle, so rooms that
   overlap never stack two floors. */
export function layRooms(rooms, cell, thick, wall, floor) {
  const pad = (thick + 1) * cell;
  let X0 = 1e9, Z0 = 1e9, X1 = -1e9, Z1 = -1e9;
  for (const { r } of rooms) { X0 = Math.min(X0, r[0] - pad); Z0 = Math.min(Z0, r[1] - pad); X1 = Math.max(X1, r[2] + pad); Z1 = Math.max(Z1, r[3] + pad); }
  const W = Math.round((X1 - X0) / cell), H = Math.round((Z1 - Z0) / cell), N = W * H;
  const zoneAt = new Array(N).fill(null);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = X0 + (i + .5) * cell, z = Z0 + (j + .5) * cell, room = rooms.find(({ r }) => x > r[0] && x < r[2] && z > r[1] && z < r[3]);
    if (room) zoneAt[j * W + i] = room.zone;
  }
  const open = (i, j) => i >= 0 && j >= 0 && i < W && j < H && zoneAt[j * W + i] !== null;
  const ring = []; for (let dj = -thick; dj <= thick; dj++) for (let di = -thick; di <= thick; di++) if (di || dj) ring.push([di, dj]);
  ring.sort((a, b) => Math.max(Math.abs(a[0]), Math.abs(a[1])) - Math.max(Math.abs(b[0]), Math.abs(b[1])));
  const keys = [], lab = new Int16Array(N).fill(-1);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    if (open(i, j)) continue;
    const near = ring.find(([di, dj]) => open(i + di, j + dj)); if (!near) continue;
    const zone = zoneAt[(j + near[1]) * W + i + near[0]], sinks = ring.some(([di, dj]) => di >= 0 && dj >= 0 && open(i + di, j + dj));
    const key = (sinks ? 'cut|' : 'solid|') + zone; let L = keys.indexOf(key); if (L < 0) { L = keys.length; keys.push(key); }
    lab[j * W + i] = L;
  }
  greedy(lab, W, H, (i, j, w, h, L) => {
    const [kind, zone] = keys[L].split('|'), x0 = X0 + i * cell, z0 = Z0 + j * cell, x1 = x0 + w * cell, z1 = z0 + h * cell;
    const faces = [];
    const runs = (n, at, emit) => { let s = -1; for (let q = 0; q <= n; q++) { const o = q < n && at(q); if (o && s < 0) s = q; if (!o && s >= 0) { emit(s, q); s = -1; } } };
    runs(w, q => open(i + q, j - 1), (a, b) => faces.push([x0 + a * cell, z0, x0 + b * cell, z0, 0, -1]));
    runs(w, q => open(i + q, j + h), (a, b) => faces.push([x0 + a * cell, z1, x0 + b * cell, z1, 0, 1]));
    runs(h, q => open(i - 1, j + q), (a, b) => faces.push([x0, z0 + a * cell, x0, z0 + b * cell, -1, 0]));
    runs(h, q => open(i + w, j + q), (a, b) => faces.push([x1, z0 + a * cell, x1, z0 + b * cell, 1, 0]));
    wall(zone, kind === 'cut', x0, z0, x1, z1, faces);
  });
  const names = [...new Set(rooms.map(o => o.zone))], flab = new Int16Array(N).fill(-1);
  for (let k = 0; k < N; k++) if (zoneAt[k] !== null) flab[k] = names.indexOf(zoneAt[k]);
  greedy(flab, W, H, (i, j, w, h, L) => floor(names[L], X0 + (i + w / 2) * cell, Z0 + (j + h / 2) * cell, w * cell, h * cell));
}
