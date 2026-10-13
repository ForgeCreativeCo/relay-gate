/* The premium pass: a generated reflection environment, a hand-painted (by code) layer of ground grime and puddles,
   and scattered small debris. Everything is generated on the device; there are no image files. */
import { B, G, V, R, rnd, inOpen, insideObstacle } from './core.js';

/* ---------- environment: a small sky cube that metal, glass and puddles reflect ---------- */
/* opts (a region's LOOK.env) can swap the colours, and turn the sun's and the gate's glow down (k = 0 to 1) */
export function makeEnvironment(scene, opts) {
  const N = 64, faces = [];
  const mix = (a, b, t) => a + (b - a) * t, clamp01 = v => Math.max(0, Math.min(1, v));
  const E = Object.assign({ zenith: [78, 74, 72], horizon: [176, 156, 130], ground: [44, 40, 36], sun: 1, gate: 1 }, opts);
  const zenith = E.zenith, horizon = E.horizon, ground = E.ground;
  const sun = (() => { const d = [.55, 1, -.4], l = Math.hypot(...d); return d.map(v => v / l); })();   // opposite the light's direction
  const gate = (() => { const d = [0, .12, 1], l = Math.hypot(...d); return d.map(v => v / l); })();   // the relay gate, north
  const color = (x, y, z) => {
    let c;
    if (y >= 0) { const t = Math.pow(clamp01(y), .55); c = [0, 1, 2].map(i => mix(horizon[i], zenith[i], t)); }
    else { const t = clamp01(-y * 3); c = [0, 1, 2].map(i => mix(horizon[i] * .55, ground[i], t)); }
    const s = Math.max(0, x * sun[0] + y * sun[1] + z * sun[2]); const sg = (Math.pow(s, 24) * 160 + Math.pow(s, 4) * 40) * E.sun;          // warm glow where the light comes from
    const g = Math.max(0, x * gate[0] + y * gate[1] + z * gate[2]); const gg = Math.pow(g, 30) * 90 * E.gate;                                  // a cyan cast toward the gate
    return [c[0] + sg * 1 + gg * .1, c[1] + sg * .85 + gg * .85, c[2] + sg * .6 + gg];
  };
  /* face order +X, -X, +Y, -Y, +Z, -Z */
  const dir = [(u, v) => [1, -v, -u], (u, v) => [-1, -v, u], (u, v) => [u, 1, v], (u, v) => [u, -1, -v], (u, v) => [u, -v, 1], (u, v) => [-u, -v, -1]];
  for (let f = 0; f < 6; f++) {
    const d = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = (i + .5) / N * 2 - 1, v = (j + .5) / N * 2 - 1, [x, y, z] = dir[f](u, v), l = Math.hypot(x, y, z), c = color(x / l, y / l, z / l), k = (j * N + i) * 4;
      d[k] = Math.min(255, c[0]); d[k + 1] = Math.min(255, c[1]); d[k + 2] = Math.min(255, c[2]); d[k + 3] = 255;
    }
    faces.push(d);
  }
  const env = new B.RawCubeTexture(scene, faces, N, B.Constants.TEXTUREFORMAT_RGBA, B.Constants.TEXTURETYPE_UNSIGNED_BYTE, true, false, B.Texture.TRILINEAR_SAMPLINGMODE);
  env.gammaSpace = true;
  scene.environmentTexture = env;
  return env;
}

/* ---------- ground detail: one overlay across the playable area ---------- */
/* Painted onto two canvases: colour + alpha (grime, scorch, oil, cracks, paint, puddles) and roughness (puddles and oil are glossy).
   What's region-specific comes from G.decalHints: scorch, oil, paint lines, skids, puddles (and what colour standing water is: pale
   under a daylight sky, dark at night), and the area and resolution to cover. With `clean` there's no grime, staining or cracking at
   all, only what the region asks for by name (a lab that is swept every night). */
export function makeGroundDetail(scene) {
  const H = G.decalHints;
  let [X0, Z0, X1, Z1] = H.bounds || [1e9, 1e9, -1e9, -1e9];
  if (!H.bounds) for (const o of G.open) { X0 = Math.min(X0, o[0] - 3); Z0 = Math.min(Z0, o[1] - 3); X1 = Math.max(X1, o[2] + 3); Z1 = Math.max(Z1, o[3] + 3); }
  const W = X1 - X0, D = Z1 - Z0, k0 = Math.min(16, 2048 / Math.max(W, D));
  const [PX, PZ] = H.res || [Math.round(W * k0), Math.round(D * k0)], sx = PX / W, sz = PZ / D;
  const mk = () => { const c = document.createElement('canvas'); c.width = PX; c.height = PZ; return c; };
  const colC = mk(), rufC = mk(), col = colC.getContext('2d'), ruf = rufC.getContext('2d');
  ruf.fillStyle = 'rgb(0,235,0)'; ruf.fillRect(0, 0, PX, PZ);   // green = roughness: matte everywhere by default
  /* world (x, z) to canvas pixels; canvas y runs north to south so the texture isn't mirrored */
  const px = x => (x - X0) * sx, pz = z => (Z1 - z) * sz, pr = r => r * sx;
  const inside = (x, z, m = 0) => inOpen(x, z, m);
  const randIn = (m = .5) => { for (let k = 0; k < 60; k++) { const x = R(X0, X1), z = R(Z0, Z1); if (inside(x, z, m) && !insideObstacle(x, z)) return [x, z]; } return null; };
  const blob = (ctx, x, z, r, rgba0, rgba1 = 'rgba(0,0,0,0)') => { const g = ctx.createRadialGradient(px(x), pz(z), 0, px(x), pz(z), pr(r)); g.addColorStop(0, rgba0); g.addColorStop(1, rgba1); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px(x), pz(z), pr(r), 0, 6.283); ctx.fill(); };
  /* irregular shape: a cluster of overlapping soft circles */
  const splat = (ctx, x, z, r, rgba, n = 7, soft = .45) => { for (let k = 0; k < n; k++) { const a = R(0, 6.28), d = R(0, r * .55), rr = r * R(.35, .7);
    const g = ctx.createRadialGradient(px(x + Math.cos(a) * d), pz(z + Math.sin(a) * d), pr(rr) * (1 - soft), px(x + Math.cos(a) * d), pz(z + Math.sin(a) * d), pr(rr));
    g.addColorStop(0, rgba); g.addColorStop(1, rgba.replace(/[\d.]+\)$/, '0)')); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px(x + Math.cos(a) * d), pz(z + Math.sin(a) * d), pr(rr), 0, 6.283); ctx.fill(); } };

  /* 1. soot and grime gathering along the edges of every street and square, where walls and rubble are */
  for (const [x0, z0, x1, z1] of H.clean ? [] : G.open) {
    const per = 2 * ((x1 - x0) + (z1 - z0)), n = Math.round(per / 2.2);
    for (let k = 0; k < n; k++) { let t = rnd() * per, x, z;
      if (t < x1 - x0) { x = x0 + t; z = z0; } else if ((t -= x1 - x0) < z1 - z0) { x = x1; z = z0 + t; } else if ((t -= z1 - z0) < x1 - x0) { x = x1 - t; z = z1; } else { t -= x1 - x0; x = x0; z = z1 - t; }
      const ix = x === x0 ? 1 : x === x1 ? -1 : 0, iz = z === z0 ? 1 : z === z1 ? -1 : 0;
      splat(col, x + ix * R(0, 1.5), z + iz * R(0, 1.5), R(1.5, 3.6), `rgba(22,18,14,${R(.22, .4).toFixed(2)})`, 4, .7); }
  }
  /* 2. big faint stains everywhere, to break up the tiling of the ground textures */
  for (let k = 0; k < (H.clean ? 0 : 170); k++) { const p = randIn(0); if (!p) continue; splat(col, p[0], p[1], R(1.5, 4.5), rnd() < .65 ? `rgba(30,25,20,${R(.03, .07).toFixed(2)})` : `rgba(130,120,104,${R(.03, .07).toFixed(2)})`, 5, .85); }
  /* 3. scorch marks under burnt cars, fires, and blast spots from old fighting */
  const scorch = (x, z, r) => { splat(col, x, z, r * .8, 'rgba(12,10,8,.5)', 9, .6); splat(col, x, z, r * 1.5, 'rgba(20,16,12,.2)', 7, .85);
    for (let k = 0; k < 7; k++) { const a = R(0, 6.28), l = r * R(.9, 1.6); col.strokeStyle = `rgba(14,11,9,${R(.08, .16).toFixed(2)})`; col.lineWidth = pr(R(.05, .14)); col.beginPath(); col.moveTo(px(x + Math.cos(a) * r * .5), pz(z + Math.sin(a) * r * .5)); col.lineTo(px(x + Math.cos(a) * l), pz(z + Math.sin(a) * l)); col.stroke(); } };
  for (const [x, z, r] of G.decalHints.scorch) scorch(x, z, r);
  for (let k = 0; k < (H.clean ? 0 : 6); k++) { const p = randIn(2); if (p) scorch(p[0], p[1], R(.9, 1.8)); }
  /* 4. oil under and around vehicles: dark, a little glossy */
  const oil = (x, z, r) => { splat(col, x, z, r, 'rgba(6,6,8,.45)', 6, .4); splat(ruf, x, z, r, 'rgba(0,165,0,.8)', 6, .4); };   // only slightly glossy: shinier oil caught lamplight like blood
  for (const [x, z, r] of G.decalHints.oil) { oil(x + R(-.6, .6), z + R(-.6, .6), r * R(.6, .9)); if (rnd() < .6) oil(x + R(-2, 2), z + R(-2, 2), R(.4, .9)); }
  /* 5. long cracks across the open ground */
  const crack = (x, z, len) => { let a = R(0, 6.28), cx = x, cz = z; col.lineCap = 'round';
    for (let s = 0; s < len; s++) { const nx = cx + Math.cos(a) * R(.4, 1), nz = cz + Math.sin(a) * R(.4, 1); a += R(-.5, .5);
      col.strokeStyle = 'rgba(14,12,10,.4)'; col.lineWidth = pr(R(.03, .08)); col.beginPath(); col.moveTo(px(cx), pz(cz)); col.lineTo(px(nx), pz(nz)); col.stroke();
      if (rnd() < .12) crack(nx, nz, len * .3 | 0); cx = nx; cz = nz; } };
  for (let k = 0; k < (H.clean ? 0 : 70); k++) { const p = randIn(0); if (p) crack(p[0], p[1], 6 + rnd() * 18 | 0); }
  /* 6. faded road paint: edge lines and crossings on the streets, worn through in places */
  /* a painted line, worn: stretches fade in and out and some are gone entirely */
  const paint = (x0, z0, x1, z1, w, rgb, a) => { const L = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(L / 1.2); col.lineCap = 'butt'; col.lineWidth = pr(w);
    for (let k = 0; k < n; k++) { if (rnd() < .25) continue; const t0 = k / n, t1 = Math.min(1, (k + R(.6, 1)) / n);
      col.strokeStyle = `rgba(${rgb},${(a * R(.35, 1)).toFixed(2)})`; col.beginPath(); col.moveTo(px(x0 + (x1 - x0) * t0), pz(z0 + (z1 - z0) * t0)); col.lineTo(px(x0 + (x1 - x0) * t1), pz(z0 + (z1 - z0) * t1)); col.stroke(); } };
  for (const [x0, z0, x1, z1, w, rgb, a] of H.paint || []) paint(x0, z0, x1, z1, w, rgb, a);
  /* tyre skids on the streets */
  const sk = H.skids || { n: 0 };
  for (let k = 0; k < sk.n; k++) { const z = R(sk.z[0], sk.z[1]), x = R(sk.x[0], sk.x[1]), a = R(-.3, .3), l = R(4, 9); for (const off of [-.8, .8]) { col.strokeStyle = 'rgba(10,9,8,.22)'; col.lineWidth = pr(.22);
    col.beginPath(); col.moveTo(px(x + off), pz(z)); col.quadraticCurveTo(px(x + off + Math.sin(a) * l * .5), pz(z + l * .5), px(x + off + Math.sin(a) * l), pz(z + l)); col.stroke(); } }
  /* 7. puddles: darker (wet) and very smooth so they reflect the sky, fires and the gate */
  /* a damp, darker rim, then standing water. Real water barely reflects at this camera angle, so puddles are given a partly
     mirror-like finish (blue channel = metalness) to read clearly as wet: they pick up the sky, the fires and the gate. */
  /* the same seed paints colour and finish so the mirror-smooth part never spills past the water's edge */
  const puddle = (x, z, r) => { splat(col, x, z, r * 1.3, 'rgba(20,18,16,.14)', 6, .9);
    const blobs = [...Array(7)].map(() => [R(0, 6.28), R(0, r * .5), r * R(.35, .65)]);
    for (const [a, d, rr] of blobs) { const cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
      for (const [ctx, fill, edge] of [[col, H.puddleCol || 'rgba(150,156,162,.45)', .1], [ruf, 'rgba(0,14,95,1)', .06]]) { const g = ctx.createRadialGradient(px(cx), pz(cz), pr(rr) * (1 - edge), px(cx), pz(cz), pr(rr));
        g.addColorStop(0, fill); g.addColorStop(1, fill.replace(/[\d.]+\)$/, '0)')); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px(cx), pz(cz), pr(rr), 0, 6.283); ctx.fill(); } } };
  const puddleSpots = (H.puddles || []).slice();
  for (let k = 0; k < (H.puddleN == null ? 30 : H.puddleN); k++) { const p = randIn(1.2); if (p) puddleSpots.push([p[0], p[1], R(.5, 1.6)]); }
  for (const [x, z, r] of puddleSpots) { if (G.decalHints.scorch.some(([sx2, sz2, sr]) => Math.hypot(sx2 - x, sz2 - z) < sr + r + 1)) continue; puddle(x, z, r); }

  /* the overlay itself */
  const tex = (c, name, gamma) => { const t = new B.DynamicTexture(name, c, scene, true); t.update(); t.wrapU = t.wrapV = B.Texture.CLAMP_ADDRESSMODE; t.anisotropicFilteringLevel = 8; t.gammaSpace = gamma; return t; };
  const m = new B.PBRMaterial('groundDetail', scene);
  m.albedoTexture = tex(colC, 'grime', true); m.albedoTexture.hasAlpha = true; m.useAlphaFromAlbedoTexture = true;
  m.metallicTexture = tex(rufC, 'grimeRough', false); m.useRoughnessFromMetallicTextureGreen = true; m.useMetallnessFromMetallicTextureBlue = true; m.useAmbientOcclusionFromMetallicTextureRed = false;
  m.metallic = 1; m.roughness = 1;   // scaled by the texture channels
  m.transparencyMode = B.PBRMaterial.PBRMATERIAL_ALPHABLEND; m.useSpecularOverAlpha = false; m.useRadianceOverAlpha = false;
  m.usePhysicalLightFalloff = false; m.maxSimultaneousLights = 4; m.environmentIntensity = 3; m.zOffset = -2;
  const plane = B.MeshBuilder.CreateGround('groundDetail', { width: W, height: D }, scene);
  plane.position.set((X0 + X1) / 2, .07, (Z0 + Z1) / 2); plane.material = m; plane.receiveShadows = true; plane.isPickable = false; plane.freezeWorldMatrix();
  return plane;
}

/* ---------- debris: paper, scrap, glass and brick chips, a few hundred each, one draw call per kind ---------- */
export function scatterDebris(scene, M) {
  const make = (name, mesh, mat, count, opts) => {
    const list = [];
    for (let k = 0; k < count * 4 && list.length < count; k++) {
      const o = G.open[Math.floor(rnd() * G.open.length)], edge = rnd() < opts.edge;
      let x = R(o[0], o[2]), z = R(o[1], o[3]);
      if (edge) { const s = Math.floor(rnd() * 4), d = R(.2, 2.2); if (s === 0) x = o[0] + d; else if (s === 1) x = o[2] - d; else if (s === 2) z = o[1] + d; else z = o[3] - d; }
      if (!inOpen(x, z, .1) || insideObstacle(x, z)) continue;
      const s = R(opts.s[0], opts.s[1]);
      list.push(B.Matrix.Compose(V(s * R(.7, 1.3), s, s * R(.7, 1.3)), B.Quaternion.FromEulerAngles(R(-opts.tilt, opts.tilt), R(0, 6.28), R(-opts.tilt, opts.tilt)), V(x, .075 + opts.y * s, z)));
    }
    mesh.material = mat; mesh.isPickable = false; mesh.receiveShadows = true; mesh.thinInstanceAdd(list); mesh.freezeWorldMatrix(); mesh.alwaysSelectAsActiveMesh = true;
    return mesh;
  };
  const glass = new B.PBRMaterial('glass', scene); glass.albedoColor = B.Color3.FromHexString('#1c2a2a').toLinearSpace(); glass.metallic = 0; glass.roughness = .06; glass.environmentIntensity = 1.6; glass.usePhysicalLightFalloff = false; glass.maxSimultaneousLights = 4;
  const paper = new B.PBRMaterial('paper', scene); paper.albedoColor = B.Color3.FromHexString('#7a7262').toLinearSpace(); paper.metallic = 0; paper.roughness = .95; paper.usePhysicalLightFalloff = false; paper.maxSimultaneousLights = 4;
  paper.backFaceCulling = false;
  make('paper', B.MeshBuilder.CreateBox('paper', { width: .22, height: .004, depth: .3 }, scene), paper, 200, { s: [.6, 1.4], tilt: .12, y: .01, edge: .5 });
  make('scrap', B.MeshBuilder.CreateBox('scrap', { width: .3, height: .03, depth: .18 }, scene), M.rust, 260, { s: [.5, 1.5], tilt: .35, y: .02, edge: .7 });
  make('chips', B.MeshBuilder.CreateBox('chips', { width: .16, height: .09, depth: .12 }, scene), M.rubble, 520, { s: [.5, 1.5], tilt: .6, y: .04, edge: .85 });
  make('glass', B.MeshBuilder.CreateBox('glassShard', { width: .1, height: .006, depth: .07 }, scene), glass, 360, { s: [.6, 1.8], tilt: .2, y: .005, edge: .8 });
}
