/* Geometry builder: boxes, prisms and cylinders with metre-scale UVs and baked ground occlusion,
   collected into one mesh per material so a whole block of ruins is a single draw call. */
import { B, G, V, V3, MT, R } from './core.js';

const FLIP = (() => { const n = []; B.VertexData.ComputeNormals([0, 0, 0, 1, 0, 0, 0, 0, 1], [0, 1, 2], n); return n[1] < 0 ? 1 : -1; })();
const TC = V3.TransformCoordinates, TN = V3.TransformNormal;

export function Geo() { return { p: [], n: [], u: [], c: [], i: [] }; }
function shade(y, tint, tag, ao) { let k = tint; if (ao) k *= .5 + .5 * Math.min(1, Math.max(0, y / 1.5)); if (tag === 'bottom') k *= .45; else if (tag === 'top') k *= 1.04; return k; }
const tagOf = n => n.y > .7 ? 'top' : n.y < -.7 ? 'bottom' : 'side';

export function face(g, pts, nrm, uvs, cols) {
  const b = g.p.length / 3;
  for (let k = 0; k < pts.length; k++) { const q = pts[k]; g.p.push(q.x, q.y, q.z); g.n.push(nrm.x, nrm.y, nrm.z); g.u.push(uvs[k][0], uvs[k][1]); const s = cols[k]; g.c.push(s, s, s, 1); }
  const cr = V3.Cross(pts[1].subtract(pts[0]), pts[2].subtract(pts[0]));
  const ok = V3.Dot(cr, nrm) * FLIP > 0;
  for (let k = 1; k < pts.length - 1; k++) { if (ok) g.i.push(b, b + k, b + k + 1); else g.i.push(b, b + k + 1, b + k); }
}
const FACES = [[[1, 0, 0], [0, 0, 1], [0, 1, 0]], [[-1, 0, 0], [0, 0, -1], [0, 1, 0]], [[0, 0, 1], [-1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]], [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, -1]]];
export function gbox(g, o) {
  const M = o.M || MT(o.x, o.y, o.z, o.rx, o.ry, o.rz);
  const h = [o.w / 2, o.h / 2, o.d / 2], us = o.uv || .25, ou = R(0, 8), ov = R(0, 8), tint = o.tint == null ? 1 : o.tint, ao = o.ao !== false;
  const ext = a => Math.abs(a[0]) * h[0] + Math.abs(a[1]) * h[1] + Math.abs(a[2]) * h[2];
  for (const [n, u, v] of FACES) {
    if (o.noBottom && n[1] < 0) continue;
    const hn = ext(n), hu = ext(u), hv = ext(v), pts = [], uvs = [];
    for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pts.push(TC(V(n[0] * hn + u[0] * hu * su + v[0] * hv * sv, n[1] * hn + u[1] * hu * su + v[1] * hv * sv, n[2] * hn + u[2] * hu * su + v[2] * hv * sv), M));
      uvs.push([(su * hu + ou) * us, (sv * hv + ov) * us]);
    }
    const wn = TN(V(n[0], n[1], n[2]), M).normalize(), tag = tagOf(wn);
    face(g, pts, wn, uvs, pts.map(p => shade(p.y, tint, tag, ao)));
  }
}
export function gprism(g, prof, x0, x1, M, o = {}) {
  const us = o.uv || .5, tint = o.tint == null ? 1 : o.tint, ao = o.ao !== false, L = prof.length;
  let cz = 0, cy = 0; prof.forEach(([z, y]) => { cz += z / L; cy += y / L; });
  for (const [x, s] of [[x0, -1], [x1, 1]]) { const pts = prof.map(([z, y]) => TC(V(x, y, z), M)); const n = TN(V(s, 0, 0), M).normalize(); const tag = tagOf(n); face(g, pts, n, prof.map(([z, y]) => [z * us, y * us]), pts.map(p => shade(p.y, tint, tag, ao))); }
  let acc = 0;
  for (let k = 0; k < L; k++) {
    const a = prof[k], b = prof[(k + 1) % L], dz = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dz, dy);
    let nz = dy / len, ny = -dz / len; if (nz * ((a[0] + b[0]) / 2 - cz) + ny * ((a[1] + b[1]) / 2 - cy) < 0) { nz = -nz; ny = -ny; }
    const pts = [V(x0, a[1], a[0]), V(x1, a[1], a[0]), V(x1, b[1], b[0]), V(x0, b[1], b[0])].map(p => TC(p, M));
    const n = TN(V(0, ny, nz), M).normalize(), tag = tagOf(n);
    face(g, pts, n, [[x0 * us, acc * us], [x1 * us, acc * us], [x1 * us, (acc + len) * us], [x0 * us, (acc + len) * us]], pts.map(p => shade(p.y, tint, tag, ao))); acc += len;
  }
}
export function gcyl(g, o) {
  const M = o.M || MT(o.x, o.y, o.z, o.rx, o.ry, o.rz), seg = o.seg || 8, r0 = o.r0, r1 = o.r1 == null ? o.r0 : o.r1, h = o.h, us = o.uv || .5, tint = o.tint == null ? 1 : o.tint, ao = o.ao !== false;
  const circ = Math.PI * 2 * Math.max(r0, r1);
  for (let k = 0; k < seg; k++) {
    const a0 = k / seg * Math.PI * 2, a1 = (k + 1) / seg * Math.PI * 2, am = (a0 + a1) / 2;
    const pts = [V(Math.cos(a0) * r0, -h / 2, Math.sin(a0) * r0), V(Math.cos(a1) * r0, -h / 2, Math.sin(a1) * r0), V(Math.cos(a1) * r1, h / 2, Math.sin(a1) * r1), V(Math.cos(a0) * r1, h / 2, Math.sin(a0) * r1)].map(p => TC(p, M));
    const n = TN(V(Math.cos(am), (r0 - r1) / h, Math.sin(am)), M).normalize();
    face(g, pts, n, [[k / seg * circ * us, 0], [(k + 1) / seg * circ * us, 0], [(k + 1) / seg * circ * us, h * us], [k / seg * circ * us, h * us]], pts.map(p => shade(p.y, tint, 'side', ao)));
  }
  if (o.cap !== false) for (const [r, y, s] of [[r1, h / 2, 1], [r0, -h / 2, -1]]) { if (r <= 0) continue;
    const ring = []; for (let k = 0; k < seg; k++) { const a = k / seg * Math.PI * 2; ring.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const pts = ring.map(([a, b]) => TC(V(a, y, b), M)), n = TN(V(0, s, 0), M).normalize();
    face(g, pts, n, ring.map(([a, b]) => [a * us, b * us]), pts.map(p => shade(p.y, tint, tagOf(n), ao))); }
}
export function gmesh(name, g, material, opt = {}) {
  if (!g.i.length) return null;
  const m = new B.Mesh(name, G.scene), vd = new B.VertexData();
  vd.positions = g.p; vd.normals = g.n; vd.uvs = g.u; vd.colors = g.c; vd.indices = g.i; vd.applyToMesh(m);
  m.material = material; m.receiveShadows = true; m.isPickable = !!opt.pickable;
  if (opt.parent) m.parent = opt.parent;
  if (opt.shadow !== false && G.sg) G.sg.addShadowCaster(m);
  if (opt.freeze) m.freezeWorldMatrix();
  return m;
}

/* Spatial buckets: geometry is split into ~40 m tiles so the camera can skip whole blocks it cannot see. */
export function Buckets(size = 40) {
  const map = new Map();
  return {
    at(x, z, mat) { const k = Math.floor(x / size) + ',' + Math.floor(z / size) + '|' + mat; if (!map.has(k)) map.set(k, Geo()); return map.get(k); },
    build(mats, opt = {}) { const out = []; for (const [k, g] of map) { const m = gmesh('chunk:' + k, g, mats[k.split('|')[1]], opt); if (m) { m.freezeWorldMatrix(); out.push(m); } } return out; },
  };
}
