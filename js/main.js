/* Boot: engine, lighting, the region, the cast, and the frame loop. */
import { B, G, V, C, damp, reduced, dist2 } from './core.js';
import { makeTextures, makeMaterials, LOOK } from './tex.js';
import { makeFx } from './fx.js';
import { makeCombat } from './combat.js';
import { makeDrops, newInventory } from './loot.js';
import { Player, Ally } from './actors.js';
import { makeInput } from './input.js';
import { makeNav } from './nav.js';
import { makeAudio } from './audio.js';
import { makeEnvironment, makeGroundDetail, scatterDebris } from './look.js';
import { makeSave } from './save.js';
import { makeGame, freshProgress } from './game.js';
import { makeUI } from './ui.js';
import { makeIntro } from './intro.js';

const $ = id => document.getElementById(id);
const canvas = $('c'); G.canvas = canvas;
function fail(msg) { const d = document.createElement('div'); d.className = 'fail'; d.textContent = msg; document.body.appendChild(d); $('title').hidden = true; }

/* startup timing marks (visible in the browser's performance tools): boot, textures, world, save, title */
const mark = n => { try { performance.mark('relay-' + n); } catch (e) {} };
(async function boot() {
  mark('boot');
  let engine;
  try { engine = new B.Engine(canvas, true, { stencil: true, antialias: true, powerPreference: 'high-performance' }, true); }
  catch (e) { fail('This browser has WebGL turned off, so the game cannot run here.'); return; }
  const scene = new B.Scene(engine); G.engine = engine; G.scene = scene;
  /* the arena: Dead City, the Relay Station, the Foundry, 1984 or Origin, picked on the title screen or by the address (?region=2 to 5).
     Its look is applied before anything is lit. Inside Claude the address never reaches the page, so with nothing in it the title screen's
     last choice is used, kept in this browser (under the key it had when it chose between the campaign and survival: 'station' still means
     the station, 'foundry' the Foundry, 'y1984' 1984, 'origin' Origin, anything else the city).
     Origin is locked until 1984's big boss has been beaten once (`lock` is the save that says so): a dark slot on the title screen till then. */
  const ARENAS = [{ id: 'city', num: '01', label: 'Dead City', go: 'Play Dead City' }, { id: 'station', num: '02', label: 'Relay Station', go: 'Play the Relay Station' },
    { id: 'foundry', num: '03', label: 'The Foundry', go: 'Play the Foundry' }, { id: 'y1984', num: '04', label: '1984', go: 'Play 1984' },
    { id: 'origin', num: '05', label: 'Origin', go: 'Play Origin', lock: 'relay-gate-survival-1984-v1', why: 'Beat the Infiltrator in 1984 to open this' }];
  const query = new URLSearchParams(location.search), ARENA_KEY = 'relay-gate-mode';
  let kept = ''; try { kept = localStorage.getItem(ARENA_KEY) || ''; } catch (e) {}
  const asked = query.has('region') && ARENAS.find(a => a.num === query.get('region').padStart(2, '0'));
  const HERE = asked || ARENAS.find(a => a.id === kept) || ARENAS[0];
  const REGION = (await import(`./region${+HERE.num}.js`)).SURVIVAL;
  /* switch arena: remember it and load again (through the address when the choice can't be kept, or the address is what chose) */
  const play = (which) => { let ok = false; try { localStorage.setItem(ARENA_KEY, which.id); ok = localStorage.getItem(ARENA_KEY) === which.id; } catch (e) {}
    if (ok && !location.search) location.reload(); else location.search = which.num === '01' ? '' : `?region=${+which.num}`; };
  Object.assign(LOOK, REGION.look || {}); G.R = REGION; document.body.classList.toggle('bright', !!LOOK.bright);
  /* ask for the account save straight away, in parallel with building the region */
  G.save = makeSave(REGION.save); const savedP = G.save.load();
  scene.clearColor = new B.Color4(...C(LOOK.sky).asArray(), 1); scene.fogMode = B.Scene.FOGMODE_EXP2; scene.fogColor = C(LOOK.fog); scene.fogDensity = LOOK.fogD; scene.ambientColor = new B.Color3(0, 0, 0);
  scene.skipPointerMovePicking = true;
  G.machineColor = C(LOOK.machine);

  /* camera: tilted top-down, following the player */
  const cam = G.camera = new B.ArcRotateCamera('cam', -2.25, .9, 30, V(0, 0, -5), scene); cam.minZ = 1; cam.maxZ = 260; G.zoom = 30;
  const fit = () => { const portrait = engine.getRenderWidth() < engine.getRenderHeight(); cam.fovMode = portrait ? B.Camera.FOVMODE_HORIZONTAL_FIXED : B.Camera.FOVMODE_VERTICAL_FIXED; cam.fov = portrait ? .8 : .62; };

  /* lights: sky, sun with shadows, and a small pool of local lights handed to whatever is nearby */
  const hemi = new B.HemisphericLight('hemi', V(0, 1, 0), scene); hemi.diffuse = C(LOOK.hemiSky); hemi.groundColor = C(LOOK.hemiGround); hemi.intensity = LOOK.hemiI;
  const sun = new B.DirectionalLight('sun', V(...LOOK.sunDir).normalize(), scene); sun.diffuse = C(LOOK.sun); sun.specular = C(LOOK.sun); sun.intensity = LOOK.sunI;
  sun.autoUpdateExtends = false; sun.orthoLeft = -34; sun.orthoRight = 34; sun.orthoTop = 34; sun.orthoBottom = -34; sun.shadowMinZ = 1; sun.shadowMaxZ = 170;
  const sg = G.sg = new B.ShadowGenerator(2048, sun); sg.usePercentageCloserFiltering = true; sg.filteringQuality = B.ShadowGenerator.QUALITY_MEDIUM; sg.bias = .002; sg.normalBias = .03; sg.darkness = .3;
  const pool = [0, 1].map(i => { const l = new B.PointLight('local' + i, V(0, -50, 0), scene); l.intensity = 0; l.range = 10; return { l, src: null }; });
  const spot = new B.SpotLight('searchlight', V(0, 0, .7), V(0, -.55, 1), Math.PI / 4.5, 6, scene); spot.range = 30; spot.intensity = 0; spot.diffuse = C(LOOK.machine); let spotOwner = null;
  const boomL = new B.PointLight('boom', V(0, -50, 0), scene); boomL.diffuse = C('#ffb070'); boomL.intensity = 0; boomL.range = 24;
  G.boom = (pos, i) => { boomL.position.copyFrom(pos); boomL.position.y += 1.5; boomL.intensity = Math.max(boomL.intensity, i); };

  /* materials, effects, post-processing */
  mark('engine'); makeEnvironment(scene, LOOK.env);
  const T = makeTextures(scene); const M = G.M = makeMaterials(scene, T);
  G.glow = new B.GlowLayer('glow', scene, { mainTextureSamples: 1, blurKernelSize: 48 }); G.glow.intensity = LOOK.glowI;
  /* only things that actually glow go through the glow pass (it used to redraw every mesh in the scene a second time, as black) */
  const canGlow = G.glow._canRenderMesh.bind(G.glow);
  G.glow._canRenderMesh = (mesh, mat) => { const c = mat.emissiveColor; return canGlow(mesh, mat) && ((c && c.r + c.g + c.b > .01) || !!mat.emissiveTexture); };
  G.FX = makeFx();
  let ssao = null, ssaoOn = false;
  try { if (B.SSAO2RenderingPipeline.IsSupported) { ssao = new B.SSAO2RenderingPipeline('ssao', scene, { ssaoRatio: .5, blurRatio: .5 }, [cam], true); ssao.radius = 1.4; ssao.totalStrength = 1.2; ssao.base = .15; ssao.samples = 12; ssao.maxZ = 110; ssao.minZAspect = .5; ssao.expensiveBlur = false; ssaoOn = true; } } catch (e) { ssao = null; }
  const pipe = new B.DefaultRenderingPipeline('pipe', true, scene, [cam]);
  pipe.fxaaEnabled = true; pipe.bloomKernel = 64; pipe.bloomScale = .5; pipe.bloomWeight = LOOK.bloomW; pipe.bloomThreshold = LOOK.bloomT;
  pipe.grain.animated = true; pipe.grain.intensity = 4; pipe.chromaticAberration.aberrationAmount = 2.5; pipe.chromaticAberration.radialIntensity = .8;   // a hint of lens fringing at the edges, not a smear
  const ip = pipe.imageProcessing; ip.toneMappingEnabled = true; ip.toneMappingType = B.ImageProcessingConfiguration.TONEMAPPING_ACES; ip.exposure = LOOK.exposure; ip.contrast = LOOK.contrast;
  ip.vignetteEnabled = true; ip.vignetteWeight = 1.8; ip.vignetteColor = new B.Color4(0, 0, 0, 0);
  /* grade: warm highlights, so fire and lamplight glow against the ash (a teal shadow tint was tried, but mixed with firelight into green) */
  const curves = new B.ColorCurves(); curves.globalSaturation = LOOK.sat;
  curves.highlightsHue = 35; curves.highlightsDensity = 30; curves.highlightsSaturation = 20;
  ip.colorCurvesEnabled = true; ip.colorCurves = curves;
  /* Resolution governor. High aims for the display's full sharpness (up to 2x on high-density screens), Low for 1x.
     Pixel count is what this scene costs most, so when frames run slow the internal resolution steps down, and it climbs back when there's room. */
  const RES = { max: 1, scale: 99, floor: .6, acc: 0, n: 0, good: 0, hold: 0 };
  const applyRes = () => engine.setHardwareScalingLevel(1 / RES.scale);
  G.res = RES;
  function governRes(ms) {
    if (document.hidden || ms > 250) return;
    RES.acc += ms; RES.n++; if (RES.acc < 1000) return;
    const avg = RES.acc / RES.n; RES.acc = RES.n = 0; RES.hold = Math.max(0, RES.hold - 1);
    if (avg > 22 && RES.scale > RES.floor) { RES.scale = Math.max(RES.floor, RES.scale * (avg > 40 ? .7 : .85)); RES.good = 0; RES.hold = 8; applyRes(); }   // under ~45 fps: fewer pixels
    else if (avg < 17.5 && RES.scale < RES.max) { if (++RES.good >= 3 && !RES.hold) { RES.scale = Math.min(RES.max, RES.scale * 1.1); RES.good = 0; applyRes(); } }
    else RES.good = 0;
  }
  G.setQuality = (q) => {
    const h = q !== 'low'; G.settings.quality = h ? 'high' : 'low';
    RES.max = h ? Math.min(window.devicePixelRatio || 1, 2) : 1; RES.floor = h ? .6 : .5; RES.scale = Math.min(RES.max, Math.max(RES.floor, RES.scale)); RES.hold = 0; applyRes();
    /* FXAA smooths edges; 4x multisampling on top of it cost a fifth of the frame for little visible difference */
    sun.shadowEnabled = h; pipe.bloomEnabled = h; pipe.grainEnabled = h; pipe.chromaticAberrationEnabled = h; pipe.samples = 1; G.glow.blurKernelSize = h ? 48 : 24;
    if (ssao && ssaoOn !== h) { try { const mgr = scene.postProcessRenderPipelineManager; if (h) mgr.attachCamerasToRenderPipeline('ssao', cam); else mgr.detachCamerasFromRenderPipeline('ssao', cam); ssaoOn = h; } catch (e) {} }
    G.FX.weather.emitRate = (h ? 480 : 200) * (reduced ? .4 : 1) * LOOK.weatherK; fit(); if (G.save) G.save.soon();
  };

  /* the arena's map and run, the world and the cast */
  for (const id of ['regionTag', 'titleTag']) $(id).textContent = REGION.tag;
  G.settings = { quality: 'high', controls: 'auto', fps: false, volume: .8, ambience: .6, music: .6, mute: false };
  G.audio = makeAudio(); G.audio.apply(); G.audio.music('title');   // the title's music, as soon as the browser lets sound play
  if (REGION.introMusic) G.audio.preloadMusic([REGION.introMusic]);   // an arena's own intro music is wanted the moment Start is pressed
  /* browsers keep sound off until the first click, tap or key: say so on the title screen until then */
  const hint = $('soundHint'), hintT = setInterval(() => { const on = !G.audio.ctx || G.audio.ctx.state === 'running' || G.started; hint.hidden = on;
    if (!on) hint.textContent = (G.input && G.input.mode === 'touch' ? 'Tap' : 'Click') + ' anywhere for sound'; else clearInterval(hintT); }, 400);
  G.progress = freshProgress(); G.inv = newInventory();
  mark('materials'); G.region = REGION.build(M); mark('region'); G.nav = makeNav(); mark('nav'); makeGroundDetail(scene); mark('ground'); if (!G.decalHints.noDebris) scatterDebris(scene, M); mark('world');   // (1984 hasn't been wrecked yet)
  G.CB = makeCombat(M); G.drops = makeDrops(M);
  G.input = makeInput(canvas); G.UI = makeUI(); G.game = makeGame(); G.intro = makeIntro();
  G.player = new Player(); G.actors.push(G.player); G.player.pos.set(REGION.start.x, 0, REGION.start.z);
  G.ally = new Ally(REGION.start.x - 1.6, REGION.start.z - 1.4); G.actors.push(G.ally);
  G.ally.joined = !REGION.noAlly; if (!G.ally.joined) { G.ally.untargetable = true; G.ally.root.setEnabled(false); }   // Mara is in every run, except where she can't follow you (1984)
  G.setPaused = (p) => { G.paused = p; G.input.release(); if (p) G.audio.silenceHums(); };
  G.input.on(a => {
    const P = G.player;
    if (a === 'dash') P.tryDash(); else if (a === 'stop') P.stop(); else if (a === 'swap') P.swap();
    else if (a === 'interact') G.game.use(G.near); else if (a === 'command') G.ally.toggleMode();
    else if (a === 'build') G.game.build();
    else G.UI.onAction(a);
  });
  G.setQuality('high');
  window.addEventListener('resize', () => { engine.resize(); fit(); G.input.restStick(); });
  /* turned upright mid-run on a phone: pause behind the "turn sideways" screen (the menu stays open when you turn back) */
  const portrait = matchMedia('(orientation: portrait)');
  const upright = () => { if (portrait.matches && G.input.mode === 'touch' && G.started && !G.paused) G.UI.openMenu(); };
  portrait.addEventListener('change', upright);

  /* ---------- the loop ---------- */
  let lightT = 0;
  function step(dt) {
    G.t += dt; G.frame = (G.frame || 0) + 1; const P = G.player, p = P.pos;
    G.input.update(dt);
    P.update(dt, G.input); G.ally.update(dt);
    for (const a of G.actors) if (a !== P && a !== G.ally && !a.dormant) a.update(dt);
    G.CB.update(dt); G.drops.update(dt, p); G.game.update(dt); G.FX.update(dt);
    G.audio.updateHums(G.actors.filter(a => a.kind === 'drone' && a.alive && !a.dormant));
    /* nearest thing you can use */
    G.near = null; let nd = 1e9; for (const it of G.game.interactables()) { const d = dist2(p, it.pos); if (d < it.r && d < nd) { nd = d; G.near = it; } }
    /* clicked on something usable: use it once you arrive */
    if (P.pendingUse && G.near && G.near.label === P.pendingUse) { P.pendingUse = null; P.path = null; P.goal = null; G.game.use(G.near); }
    /* gate */
    const g = G.region.gate, on = g.on; g.discA.rotation.z += dt * (on ? .6 : .12); g.discB.rotation.z -= dt * (on ? .9 : .2);
    const pulse = 1 + Math.sin(G.t * 2.2) * .03; g.discA.scaling.set(pulse, pulse, 1);
    M.gateDisc.alpha = on ? .42 + Math.sin(G.t * 3.1) * .08 : (Math.random() < .04 ? .25 : .08); M.gateNode.emissiveColor.copyFrom(C(LOOK.gate)).scaleInPlace(on ? 1 : .35);
    G.flames.forEach((f, k) => { f.scaling.y = 1 + Math.sin(G.t * 14 + k * 2) * .22; });
    /* hand the pooled lights to the nearest fires, lamps and the gate */
    lightT -= dt;
    if (lightT <= 0) { lightT = .4;
      const near = G.lightSources.map(s => [s, dist2(p, s.pos)]).filter(x => x[1] < 42 && x[0].intensity > .01).sort((a, b) => a[1] - b[1]).slice(0, 2);   // a lamp that's switched off doesn't take a slot
      pool.forEach((pl, i) => { const s = near[i] && near[i][0]; pl.src = s || null; if (s) { pl.l.position.copyFrom(s.pos); pl.l.diffuse.copyFrom(s.color); pl.l.range = s.range; } else pl.l.intensity = 0; });
      let best = null, bd = 35; for (const a of G.actors) if (a.parts && a.alive && !a.dormant && a.partAlive('head')) { const d = dist2(p, a.pos); if (d < bd) { bd = d; best = a; } }
      if (best !== spotOwner) { spotOwner = best; if (best) { spot.parent = best.head; spot.position.set(0, 0, .7); spot.direction.set(0, -.55, 1); } }
    }
    pool.forEach(pl => { const s = pl.src; if (s) pl.l.intensity = s.intensity * (s.flicker ? 1 + Math.sin(G.t * 17) * .15 + Math.sin(G.t * 7.3) * .2 : 1); });
    spot.intensity = spotOwner && spotOwner.alive && spotOwner.partAlive('head') ? 1.2 * (1 + spotOwner.alert * .4) * spotOwner.s : 0;   // kept low enough to stay red under the exposure
    boomL.intensity = Math.max(0, boomL.intensity - dt * 14);
    /* camera */
    cam.radius += (G.zoom - cam.radius) * damp(6, dt);
    B.Vector3.LerpToRef(cam.target, V(p.x, 0, p.z), damp(6, dt), cam.target);
    if (G.shake > 0) { const s = (reduced ? .3 : 1) * G.shake * .35; cam.target.x += (Math.random() * 2 - 1) * s; cam.target.z += (Math.random() * 2 - 1) * s; G.shake = Math.max(0, G.shake - dt * 2.2); }
    sun.position.copyFrom(cam.target).subtractInPlace(sun.direction.scale(70));
    G.FX.weatherAt.set(cam.target.x, 2, cam.target.z);
    G.UI.update(dt);
  }
  G.step = step;
  engine.runRenderLoop(() => { const raw = engine.getDeltaTime(), dt = Math.min(raw / 1000, .05); governRes(raw); if (G.started && !G.paused) step(dt); scene.render(); });
  if (location.hash === '#debug') window.__G = G;

  /* the arenas: one button each, this one pressed; picking another loads it. A locked one is a dark slot until the save it waits on says
     its boss is beaten: this browser's copy of that save is read at once, your account's as soon as it answers. */
  const pick = $('arenaPick'), beaten = st => !!(st && st.progress && st.progress.beatBoss);
  const open = new Set(ARENAS.filter(a => { if (!a.lock || a === HERE) return true; try { return beaten(JSON.parse(localStorage.getItem(a.lock))); } catch (e) { return false; } }));
  const offer = () => { G.otherArenas = ARENAS.filter(a => a !== HERE && open.has(a)).map(a => ({ label: a.go, use: () => play(a) })); };   // the end of a run offers them too
  for (const a of ARENAS) { const b = document.createElement('button'); b.className = 'btn'; b.type = 'button'; b.setAttribute('aria-pressed', String(a === HERE));
    const show = () => { const on = open.has(a); b.disabled = !on; b.classList.toggle('locked', !on); b.textContent = on ? a.label : 'Locked'; b.title = on ? '' : a.why; };
    show(); b.onclick = () => { if (a !== HERE && open.has(a)) play(a); }; pick.append(b);
    if (!open.has(a)) G.save.peek(a.lock).then(st => { if (beaten(st)) { open.add(a); show(); offer(); } }); }
  offer();

  /* ---------- title screen ---------- */
  fit();
  mark('save-start'); let saved = await savedP; mark('save-done');
  const info = $('titleInfo'), cont = $('contBtn');
  const SETTINGS = { quality: 'high', controls: 'auto', fps: false, volume: .8, ambience: .6, music: .6, mute: false };
  const describe = () => { info.textContent = `${[REGION.blurb, REGION.titleNote(saved)].filter(Boolean).join(' ')} Your record saves to ${G.save.where}.`; };
  const showError = (what, e) => { console.error(e); info.textContent = `${what}: ${(e && e.message) || e}. Reload the page to try again.`; };

  /* Set up a fresh run, carrying over what the save keeps (your best run here, and your settings). Safe to run again (a late account save). */
  function prepare(s) {
    G.game.clearAll(); G.drops.clear(); G.CB.clear(); G.FX.clearDebris();
    G.progress = freshProgress(); G.settings = Object.assign({}, SETTINGS);
    if (s) { const p = s.progress || {}; G.progress.best = p.best || 0; G.progress.bestLevel = p.bestLevel || 0; G.progress.seenIntro = !!p.seenIntro; G.progress.seenOutro = !!p.seenOutro; G.progress.seenScene = !!p.seenScene; G.progress.beatBoss = !!p.beatBoss; G.progress.fastest = p.fastest || 0; G.settings = Object.assign({}, SETTINGS, s.settings || {}); }
    G.game.spawnAll(); G.game.applyGate();
    const st = REGION.start; G.player.respawn(st.x, st.z); cam.target.set(st.x, 0, st.z); G.ally.teleportNear(G.player.pos);
    G.setQuality(G.settings.quality); G.audio.apply(); if (G.settings.controls !== 'auto') G.input.setMode(G.settings.controls, true); $('fps').hidden = !G.settings.fps;
    G.UI.objective('Survive');
  }
  /* Prepare, then wait (on the title screen) for every shader the scene needs, so pressing Start doesn't stall on them.
     That compile is slowest right after a restart, when the graphics caches are cold. */
  let prepId = 0;
  async function ready(s) {
    const id = ++prepId; cont.disabled = true; info.textContent = REGION.preparing;
    try { prepare(s); await Promise.race([scene.whenReadyAsync(), new Promise(r => setTimeout(r, 15000))]); }
    catch (e) { if (id === prepId) showError('Couldn\'t set up the run', e); }
    if (id !== prepId) return;   // a newer prepare took over
    if (!info.textContent.startsWith('Couldn')) describe();
    cont.disabled = false; cont.focus();
  }
  await ready(saved);
  window.__booted = true; mark('title');
  /* the account answered after the title screen went ahead with this browser's copy: switch to it if it's newer */
  G.save.onLate = state => { if (G.started || !state) return; if (!saved || (state.savedAt || 0) > (saved.savedAt || 0)) { saved = state; ready(saved); } else describe(); };

  /* Clicks respond at once ("Starting…"); the work runs a moment later so that change is drawn first. Failures are shown, never swallowed. */
  const go = (fn) => {
    if (cont.disabled) return; cont.disabled = true; const label = cont.textContent; cont.textContent = 'Starting…';
    setTimeout(() => { try { fn(); } catch (e) { showError('Couldn\'t start', e); cont.textContent = label; cont.disabled = false; } }, 30);
  };
  cont.onclick = () => go(start);

  function start() {
    G.audio.unlock(); G.audio.startAmbience(); G.audio.preloadMusic(REGION.musicKeys);
    /* phones: go fullscreen and lock to landscape where the browser allows it (Android); elsewhere the "turn sideways" screen covers portrait */
    if (G.input.mode === 'touch') { try { const el = document.documentElement, fs = el.requestFullscreen && el.requestFullscreen({ navigationUI: 'hide' });
      if (fs) fs.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => {}); } catch (e) {} }
    $('title').hidden = true; $('hud').hidden = false; G.input.restStick();
    G.started = true; G.paused = true; G.save.now();
    G.intro.play(REGION.intro, () => { G.setPaused(false); G.UI.showTips(); });   // the arena's intro first, then the run
    if (G.input.mode === 'touch' && matchMedia('(orientation: portrait)').matches) G.UI.openMenu();   // started upright: wait behind the "turn sideways" screen
  }
  /* after the title screen, errors go to the message feed instead of disappearing */
  window.addEventListener('error', e => { if (G.started && G.UI) G.UI.feed('Something went wrong: ' + (e.message || 'unknown error'), '#ff6a5a'); });
})();
