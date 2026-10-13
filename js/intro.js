/* An arena's intro: before each run the camera sweeps over what matters there while Mara says what to do about it over the radio, then
   settles behind you and the run begins. The world holds still meanwhile. The first time you see an arena's intro you watch it through;
   after that any key, click or tap skips it. An arena's shots are in its file (`intro` in SURVIVAL), each:
   { at: [x, y, z] where the camera looks, r: how far back it sits, a / b: its angle round and down (the game's own if left out),
     move: seconds to get there from the last shot, hold: seconds to stay, say: Mara's line while it does,
     who: whose line it is, if not hers ('' for nobody's: a line of narration) }.
   The last shot always returns to you, at the game's own camera. The same thing plays an arena's ending, with opts { watch: true }
   so it can't be skipped, { music: false } so the music is left as it is, and { stay: true } so it ends on its own last shot instead
   of coming back to you. A shot with nothing to say clears the line. */
import { B, G, V, damp } from './core.js';

const $ = id => document.getElementById(id);
const ease = k => k * k * (3 - 2 * k);
const CAM = { a: -2.25, b: .9 };   // the game's camera angles (main.js)

export function makeIntro() {
  let run = null;   // { shots, i, t, from, done, skippable }
  const box = $('intro'), line = $('introLine'), skip = $('introSkip'), who = box.querySelector('.say b');
  /* while it plays nothing else hears a key or a click (the menu can't open over it); once seen, one skips it */
  const onSkip = e => { if (!run) return; e.stopImmediatePropagation(); if (e.type === 'keydown') e.preventDefault(); if (run.skippable) finish(); };
  ['keydown', 'pointerdown'].forEach(ev => window.addEventListener(ev, onSkip, true));
  function finish() {
    if (!run) return; const r = run; run = null; box.hidden = true; document.body.classList.remove('cinema');
    const cam = G.camera, p = G.player.pos; cam.target.set(p.x, 0, p.z); cam.radius = G.zoom; cam.alpha = CAM.a; cam.beta = CAM.b;
    G.progress.seenIntro = true; G.save.soon();
    r.done();
  }
  /* each frame while it plays: ease the camera from the last shot to this one, then hold */
  G.scene.onBeforeRenderObservable.add(() => {
    if (!run) return;
    const dt = Math.min(.05, G.engine.getDeltaTime() / 1000), cam = G.camera; run.t += dt;
    if (G.R.onIntro) G.R.onIntro(dt);   // the arena keeps its walls out of the shot (cuts.js)
    const s = run.shots[run.i], f = run.from, k = s.move ? ease(Math.min(1, run.t / s.move)) : 1;
    const at = s.at, a = s.a == null ? CAM.a : s.a, b = s.b == null ? CAM.b : s.b;
    cam.target.set(f.at[0] + (at[0] - f.at[0]) * k, f.at[1] + (at[1] - f.at[1]) * k, f.at[2] + (at[2] - f.at[2]) * k);
    cam.radius = f.r + (s.r - f.r) * k; cam.alpha = f.a + (a - f.a) * k; cam.beta = f.b + (b - f.b) * k;
    if (run.t >= (s.move || 0) + s.hold) {
      if (run.i === run.shots.length - 1) { finish(); return; }
      run.from = { at: s.at, r: s.r, a, b }; run.i++; run.t = 0; say(run.shots[run.i]);
    }
  });
  function say(s) { who.textContent = !s.say ? '' : s.who == null ? 'Mara' : s.who; line.textContent = s.say || ''; if (s.say) { line.classList.remove('in'); void line.offsetWidth; line.classList.add('in'); } }
  return {
    /* play it, then call done (straight away if the arena has none) */
    play(shots, done, opts = {}) {
      if (!shots || !shots.length) { done(); return; }
      if (opts.music !== false) G.audio.music(G.R.introMusic || 'title');   // the title's music carries it, or the arena's own for it (the run's takes over once it starts)
      const p = G.player.pos, home = { at: [p.x, 0, p.z], r: G.zoom, a: CAM.a, b: CAM.b, move: 2, hold: .6 };
      const all = opts.stay ? shots : [...shots, home], first = all[0];
      run = { shots: all, i: 0, t: 0, done, skippable: !opts.watch && !!G.progress.seenIntro,
        from: { at: first.at, r: first.r, a: first.a == null ? CAM.a : first.a, b: first.b == null ? CAM.b : first.b } };
      skip.hidden = !run.skippable; skip.textContent = G.input.mode === 'touch' ? 'Tap to skip' : 'Press any key to skip';
      box.hidden = false; document.body.classList.add('cinema'); say(first);
    },
    get playing() { return !!run; },
  };
}
