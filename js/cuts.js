/* Pieces that sink into the floor while they stand between you and the camera, so a wall never hides who's behind it.
   The camera looks in from the south-west: a piece sinks when it lies within a few metres of you in that direction (a little either
   side too), and rises again once you're past. Shared by the Relay Station and the Foundry's tunnels. */
import { G, damp } from './core.js';

export const CUT_H = .7;   // what's left standing of a sunk piece

export function makeCuts() {
  const list = [];   // { x0, z0, x1, z1, node, h, k }
  return {
    /* node: what sinks (it stands at y 0); the rectangle it covers on the ground; how tall it is */
    add(node, x0, z0, x1, z1, h) { const c = { x0, z0, x1, z1, node, h, k: 0 }; list.push(c); return c; },
    update(dt) {
      const p = G.player.pos, a = G.camera.alpha, cx = Math.cos(a), cz = Math.sin(a), px = -cz, pz = cx;   // toward the camera along the ground, and across
      for (const c of list) {
        let want = 0;
        if (p.x > c.x0 - 10 && p.x < c.x1 + 10 && p.z > c.z0 - 10 && p.z < c.z1 + 10)
          look: for (const off of [-1.4, 0, 1.4]) for (let d = .3; d <= 7; d += .5) {
            const x = p.x + px * off + cx * d, z = p.z + pz * off + cz * d;
            if (x > c.x0 - .2 && x < c.x1 + .2 && z > c.z0 - .2 && z < c.z1 + .2) { want = 1; break look; }
          }
        c.k += (want - c.k) * damp(want ? 9 : 3, dt);
        c.node.position.y = -c.k * (c.h - CUT_H);
      }
    },
  };
}
