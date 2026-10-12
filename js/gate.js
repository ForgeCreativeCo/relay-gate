/* A relay gate: two pylons, a ring, spinning discs, cabled nodes and a light. main.js spins the discs; game.js powers it up and down.
   Built at GATE (x, z, and y for the ring's centre), facing north-south. Returns the parts main.js and game.js drive. */
import { B, G, V, MT, C } from './core.js';
import { Geo, gbox, gprism, gmesh } from './geo.js';

const ob = (x, z, hw, hd, h) => G.obstacles.push({ x, z, hw, hd, h });

export function buildGate(M, GATE) {
  const scene = G.scene, gate = {};
  { const g = Geo(), oct = []; for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8; oct.push([Math.cos(a) * .9, Math.sin(a) * .9]); }
    const oct2 = oct.map(([a, b]) => [a * .75, b * .75]), GX = GATE.x, GZ = GATE.z, GY = GATE.y;
    for (const s of [-1, 1]) { const vert = MT(0, 0, 0, 0, 0, Math.PI / 2).multiply(MT(GX + s * 4.9, 0, GZ));
      gprism(g, oct, 0, 1.4, vert, { uv: .4 }); gprism(g, oct2, 1.4, 8, vert, { uv: .4 }); gprism(g, oct, 8, 8.7, vert, { uv: .4 }); gbox(g, { x: GX + s * 4.9, y: GY, z: GZ, w: 1.8, h: 1.3, d: 1.9, tint: .85 }); }
    gprism(g, [[-1.8, 0], [1.8, 0], [1.4, .6], [-1.4, .6]], GX - 6.6, GX + 6.6, MT(0, 0, GZ), { uv: .4 });
    gprism(g, [[-.8, 8.4], [.8, 8.4], [.6, 9.2], [-.6, 9.2]], GX - 6, GX + 6, MT(0, 0, GZ), { uv: .4 });
    gmesh('gateFrame', g, M.gateFrame);
    ob(GX - 4.9, GZ, 1, 1, 9); ob(GX + 4.9, GZ, 1, 1, 9);
    const ring = B.MeshBuilder.CreateTorus('ring', { diameter: 7.8, thickness: .65, tessellation: 6 }, scene); ring.rotation.x = Math.PI / 2; ring.position.set(GX, GY, GZ); ring.material = M.gateFrame; ring.receiveShadows = true; G.sg.addShadowCaster(ring);
    gate.ring2 = B.MeshBuilder.CreateTorus('ring2', { diameter: 6.9, thickness: .08, tessellation: 6 }, scene); gate.ring2.rotation.set(Math.PI / 2, 0, Math.PI / 6); gate.ring2.position.set(GX, GY, GZ - .05); gate.ring2.material = M.gateNode;
    gate.discA = B.MeshBuilder.CreateDisc('discA', { radius: 3.4, tessellation: 6 }, scene); gate.discA.position.set(GX, GY, GZ); gate.discA.rotation.z = Math.PI / 6; gate.discA.material = M.gateDisc;
    gate.discB = B.MeshBuilder.CreateDisc('discB', { radius: 2.4, tessellation: 6 }, scene); gate.discB.position.set(GX, GY, GZ - .06); gate.discB.material = M.gateDisc;
    const n = Geo(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + Math.PI / 6; gbox(n, { x: GX + Math.cos(a) * 3.92, y: GY + Math.sin(a) * 3.92, z: GZ, w: .5, h: .5, d: .95, rz: a, ao: false }); }
    gate.nodes = gmesh('gateNodes', n, M.gateNode, { shadow: false });
    for (const s of [-1, 1]) for (let c = 0; c < 2; c++) { const a = V(GX + s * 2.4, GY - 2.7 + c * .3, GZ + .3), b = V(GX + s * 4.6, 1.3 + c * .4, GZ - 1.3 - c * .3), path = [];
      for (let k = 0; k <= 12; k++) { const t = k / 12; path.push(V(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * .9, a.z + (b.z - a.z) * t)); }
      const tube = B.MeshBuilder.CreateTube('cable', { path, radius: .07, tessellation: 6 }, scene); tube.material = M.mechDark; tube.isPickable = false; G.sg.addShadowCaster(tube); }
    gate.source = { pos: V(GX, GY, GZ - 1.2), color: C('#1fe0ff'), range: 18, intensity: .5, gate: true }; G.lightSources.push(gate.source);
    [gate.ring2, gate.discA, gate.discB, ring].forEach(m => { m.isPickable = false; });
  }

  return gate;
}
