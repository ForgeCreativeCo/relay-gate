/* Shared state and small helpers used by every module. */
export const B = window.BABYLON;
export const V3 = B.Vector3;
export const V = (x, y, z) => new V3(x, y, z);
export const C = h => B.Color3.FromHexString(h);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Seeded random for world generation (same city every load), Math.random for combat. */
let seed = 20261010;
export function reseed(s) { seed = s; }
export const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const R = (a, b) => a + rnd() * (b - a);
export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = arr => arr[Math.floor(Math.random() * arr.length)];

export const MT = (x, y, z, rx, ry, rz) => B.Matrix.RotationYawPitchRoll(ry || 0, rx || 0, rz || 0).multiply(B.Matrix.Translation(x || 0, y || 0, z || 0));
export function lerpAngle(a, b, k) { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; }
export function angleTo(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }
export function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

/* The one game-state object. Modules hang their pieces on it. */
export const G = {
  t: 0, paused: true, started: false,
  obstacles: [],      // {x,z,hw,hd,h} axis-aligned blockers
  open: [],           // walkable rectangles [x0,z0,x1,z1]
  actors: [],         // everything that can be shot
  lightSources: [],   // fires and the gate; the nearest borrow the pooled lights
  interactables: [],  // {pos, radius, label, action, enabled()}
  boost: {},          // what this run's level-up choices add (survival): percentages and flat amounts by name, e.g. { dmg: 30, hp: 25 }
  shake: 0,
};

export const boost = k => G.boost[k] || 0;
/* Is this spot walled in (the whole station, or the Foundry's tunnels)? Drones and menders fly over everything in the open, but where it's
   enclosed they keep to the ways through, like anyone on foot. */
export const enclosed = (x, z) => !!(G.R && (G.R.indoor || (G.R.indoorAt && G.R.indoorAt(x, z))));

/* Walkable test: inside any open rectangle (shrunk by margin). */
export function inOpen(x, z, m = .5) {
  for (const o of G.open) if (x > o[0] + m && x < o[2] - m && z > o[1] + m && z < o[3] - m) return true;
  return false;
}
/* The obstacle at a point (below its top, if y is given), or null. thru: look past anything that breaks (o.hit: Origin's pillars) */
export function obstacleAt(x, z, y, thru) {
  for (const o of G.obstacles) { if ((y != null && y > (o.h || 1.2)) || (thru && o.hit)) continue; if (Math.abs(x - o.x) < o.hw && Math.abs(z - o.z) < o.hd) return o; }
  return null;
}
export function insideObstacle(x, z, y, thru) { return !!obstacleAt(x, z, y, thru); }
/* Push a circle out of obstacles, then keep it on walkable ground. */
export function collide(p, r, prevX, prevZ) {
  for (const o of G.obstacles) {
    const cx = clamp(p.x, o.x - o.hw, o.x + o.hw), cz = clamp(p.z, o.z - o.hd, o.z + o.hd);
    const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
    if (d2 < r * r) { const d = Math.sqrt(d2) || .0001; p.x = cx + dx / d * r; p.z = cz + dz / d * r; }
  }
  if (prevX != null && !inOpen(p.x, p.z, r)) {
    if (inOpen(p.x, prevZ, r)) p.z = prevZ; else if (inOpen(prevX, p.z, r)) p.x = prevX; else { p.x = prevX; p.z = prevZ; }
  }
}
/* Line of sight on the ground plane, sampled against obstacle heights. thru: cover that breaks doesn't count (a shot can wear it down) */
export function clearShot(a, b, y = 1.3, thru) {
  const d = Math.hypot(b.x - a.x, b.z - a.z), n = Math.ceil(d / 1.2);
  for (let i = 1; i < n; i++) { const k = i / n; if (insideObstacle(a.x + (b.x - a.x) * k, a.z + (b.z - a.z) * k, y, thru)) return false; }
  return true;
}
