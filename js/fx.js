/* Particle effects: weather, fires, sparks, explosions, dust and smoke. */
import { B, G, V } from './core.js';

let dot;
export function ps(name, cap, emitter) {
  if (!dot) {
    dot = new B.DynamicTexture('dot', { width: 64, height: 64 }, G.scene, false);
    const g = dot.getContext(), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.45, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); dot.update(); dot.hasAlpha = true;
  }
  const p = new B.ParticleSystem(name, cap, G.scene); p.particleTexture = dot; p.emitter = emitter; p.colorDead = new B.Color4(0, 0, 0, 0); return p;
}
const C4 = (r, g, b, a) => new B.Color4(r, g, b, a);
function cfg(p, o) {
  if (o.c1) p.color1 = C4(...o.c1); if (o.c2) p.color2 = C4(...o.c2);
  if (o.size) { p.minSize = o.size[0]; p.maxSize = o.size[1]; } if (o.life) { p.minLifeTime = o.life[0]; p.maxLifeTime = o.life[1]; }
  if (o.pow) { p.minEmitPower = o.pow[0]; p.maxEmitPower = o.pow[1]; } if (o.d1) p.direction1 = V(...o.d1); if (o.d2) p.direction2 = V(...o.d2);
  if (o.box) { p.minEmitBox = V(...o.box[0]); p.maxEmitBox = V(...o.box[1]); } if (o.grav) p.gravity = V(...o.grav);
  p.emitRate = o.rate || 0; if (o.add) p.blendMode = B.ParticleSystem.BLENDMODE_ADD;
  return p;
}

export function makeFx() {
  const FX = {};
  FX.weatherAt = V(0, 2, 0);
  FX.weather = cfg(ps('ash', 2500, FX.weatherAt), { c1: [.78, .74, .7, .75], c2: [.52, .5, .47, .55], size: [.06, .16], life: [10, 16], pow: [.4, 1.2], d1: [-.4, -1, -.2], d2: [.4, -1, .3], box: [[-32, 0, -32], [32, 9, 32]], rate: 480 });   // kept well below the camera, or flakes drift past the lens as big blurry discs
  FX.weather.start();
  const burst = (name, cap, o) => { const p = cfg(ps(name, cap, V(0, 0, 0)), o); p.manualEmitCount = 0; p.start(); return p; };
  FX.sparks = burst('sparks', 500, { c1: [1, .95, .7, 1], c2: [1, .7, .3, 1], size: [.05, .12], life: [.2, .5], pow: [3, 7], d1: [-1, .2, -1], d2: [1, 1.4, 1], grav: [0, -14, 0], add: true });
  FX.fire = burst('boomFire', 600, { c1: [1, .75, .3, 1], c2: [1, .4, .08, 1], size: [.5, 1.5], life: [.35, 1.1], pow: [4, 11], d1: [-1, -.2, -1], d2: [1, 1.6, 1], grav: [0, -3, 0], add: true });
  FX.smoke = burst('boomSmoke', 260, { c1: [.18, .17, .16, .7], c2: [.3, .28, .26, .55], size: [1.5, 3.6], life: [2, 4], pow: [1, 3.5], d1: [-1, .3, -1], d2: [1, 1.6, 1] });
  FX.dust = burst('dust', 300, { c1: [.55, .5, .45, .55], c2: [.4, .37, .34, .4], size: [.6, 1.5], life: [.6, 1.4], pow: [3, 7], d1: [-1, .05, -1], d2: [1, .45, 1] });
  FX.puff = burst('puff', 200, { c1: [.9, .9, .9, .5], c2: [.7, .7, .7, .3], size: [.2, .5], life: [.2, .5], pow: [1, 3], d1: [-1, -.2, -1], d2: [1, 1, 1] });
  const emit = (p, pos, n) => { p.emitter = pos.clone ? pos.clone() : V(pos.x, pos.y, pos.z); p.manualEmitCount = (p.manualEmitCount > 0 ? p.manualEmitCount : 0) + n; };
  FX.spark = (pos, n = 10) => emit(FX.sparks, pos, n);
  FX.explode = (pos, size = 1) => { emit(FX.fire, pos, 120 * size | 0); emit(FX.smoke, pos, 40 * size | 0); emit(FX.sparks, pos, 70 * size | 0); G.boom(pos, 5 + 4 * size); G.shake = Math.max(G.shake, .35 * size); };
  FX.dustAt = (pos, n = 60) => emit(FX.dust, pos, n);
  FX.puffAt = (pos, n = 6) => emit(FX.puff, pos, n);
  FX.campfire = (pos) => {
    cfg(ps('fire', 300, pos.clone()), { c1: [1, .62, .18, 1], c2: [1, .32, .06, 1], size: [.25, .6], life: [.3, .75], rate: 70, box: [[-.3, 0, -.3], [.3, .2, .3]], d1: [-.2, 1, -.2], d2: [.2, 1.6, .2], pow: [1, 2], add: true }).start();
    cfg(ps('embers', 120, pos.add(V(0, .3, 0))), { c1: [1, .7, .3, 1], c2: [1, .45, .1, 1], size: [.04, .09], life: [1.4, 3], rate: 12, d1: [-.6, 1, -.6], d2: [.6, 2, .6], pow: [.6, 1.6], add: true }).start();
    cfg(ps('smoke', 80, pos.add(V(0, 1.1, 0))), { c1: [.25, .23, .22, .35], c2: [.35, .33, .3, .25], size: [.8, 1.8], life: [3, 5], rate: 6, d1: [-.2, 1, -.2], d2: [.3, 1.4, .2], pow: [.4, .8] }).start();
  };
  FX.smokeFrom = (emitter, big) => cfg(ps('smk', big ? 220 : 90, emitter), { c1: [.14, .13, .13, .6], c2: [.26, .25, .24, .45], size: big ? [1, 2.6] : [.4, 1.1], life: [1.5, big ? 4.5 : 2.8], d1: [-.3, 1, -.3], d2: [.3, 1.6, .3], pow: [.6, 1.4], rate: big ? 22 : 12 });
  return FX;
}
