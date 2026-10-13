/* HUD, pack, menus and everything drawn over the 3D view. */
import { B, G, V, V3 } from './core.js';
import { TIERS, ARCH, wstats, dps, power, affixText, PACK_SIZE } from './loot.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const CODE = { rifle: 'RFL', smg: 'SMG', shotgun: 'SHG', marksman: 'DMR', arc: 'ARC', helmet: 'HLM', vest: 'VST' };
const codeOf = it => CODE[it.type === 'weapon' ? it.arch : it.slot];
const fmt = n => (Math.round(n * 10) / 10).toString();

export function makeUI() {
  const UI = { touchPart: 'core' };
  const feedEl = $('feed');
  UI.feed = (msg, color) => { const d = el('div', null, msg); if (color) d.style.borderLeftColor = color; feedEl.appendChild(d); while (feedEl.children.length > 5) feedEl.firstChild.remove();
    setTimeout(() => d.classList.add('out'), 3800); setTimeout(() => d.remove(), 4500); };
  UI.objective = (text, flash) => { const o = $('obj'); o.textContent = text; if (flash) { o.classList.remove('flash'); void o.offsetWidth; o.classList.add('flash'); } };
  UI.packDot = on => { $('packDot').hidden = !on; };
  let hurtFx = 0; UI.hurt = () => { hurtFx = 1; };

  /* ---------- projection helper ---------- */
  const tmp = V(0, 0, 0);
  UI.project = (p) => { const s = V3.Project(p, B.Matrix.Identity(), G.scene.getTransformMatrix(), G.camera.viewport.toGlobal(G.engine.getRenderWidth(), G.engine.getRenderHeight())); const k = G.engine.getHardwareScalingLevel();
    return { x: s.x * k, y: s.y * k, ok: s.z > 0 && s.z < 1 }; };
  const place = (e, x, y, ax = '-50%', ay = '-100%') => { e.style.transform = `translate(${x | 0}px,${y | 0}px) translate(${ax},${ay})`; };

  /* ---------- damage numbers ---------- */
  const nums = []; for (let k = 0; k < 20; k++) { const e = el('div', 'dmg'); e.hidden = true; document.body.appendChild(e); nums.push({ e, p: V(0, 0, 0), life: 0 }); }
  UI.number = (p, v, crit) => { const n = nums.find(q => q.life <= 0) || nums[0]; n.p.copyFrom(p); n.p.x += (Math.random() - .5) * .7; n.p.y += .3; n.life = .8; n.e.textContent = v; n.e.className = 'dmg' + (crit === 'heal' ? ' heal' : crit ? ' crit' : ''); };   // crit can also be 'heal', for health you get back

  /* ---------- enemy health: a slim bar just above each enemy (a wider one for walkers) ---------- */
  /* objective markers: an arena puts { pos, label, color } in G.marks (the station's leech, its breaker in a blackout). On screen, a chevron
     over the spot; off it, an arrow at the edge of the screen pointing the way, with how far it is. */
  const marks = []; for (let k = 0; k < 3; k++) { const m = el('div', 'mark'), i = el('i'), s = el('span'); m.append(i, s); m.hidden = true; document.body.append(m); marks.push({ m, i, s }); }
  function drawMarks() {
    const L = (G.started && G.marks) || [], W = innerWidth, H = innerHeight, pad = 48, padX = 90;   // wider at the sides, so the label fits
    marks.forEach((k, n) => { const it = L[n]; if (!it) { k.m.hidden = true; return; } k.m.hidden = false; k.m.style.color = it.color || 'var(--amber)';
      const s = UI.project(it.pos.add ? it.pos.add(V(0, it.h || 2.5, 0)) : V(it.pos.x, it.h || 2.5, it.pos.z)), d = Math.round(Math.hypot(it.pos.x - G.player.pos.x, it.pos.z - G.player.pos.z));
      const on = s.ok && s.x > padX && s.x < W - padX && s.y > pad && s.y < H - pad; k.s.textContent = on ? it.label : `${it.label} · ${d} m`;
      if (on) { k.i.style.transform = ''; place(k.m, s.x, s.y); return; }
      const cx = W / 2, cy = H / 2, dx = (s.ok ? s.x : cx) - cx, dy = (s.ok ? s.y : cy + 1) - cy, f = Math.min((cx - padX) / Math.abs(dx || 1e-6), (cy - pad) / Math.abs(dy || 1e-6));
      k.i.style.transform = `rotate(${Math.atan2(dy, dx) - Math.PI / 2}rad)`; place(k.m, cx + dx * f, cy + dy * f, '-50%', '-50%'); });
  }
  const minis = []; for (let k = 0; k < 12; k++) { const m = el('div', 'mini'); const i = el('i'); m.append(i); m.hidden = true; document.body.append(m); minis.push({ m, i }); }

  /* ---------- boss bar ---------- */
  let boss = null, pipEls = {};
  UI.boss = (b) => { boss = b; $('boss').hidden = !b; if (!b) return; $('bossName').textContent = b.name; const pips = $('bossPips'); pips.textContent = ''; pipEls = {};
    for (const k in b.parts) { const d = el('div', 'pip'); const s = el('span', null, b.parts[k].label); const bar = el('div', 'bar'); const i = el('i'); bar.append(i); d.append(s, bar); pips.append(d); pipEls[k] = { d, i }; } };

  /* ---------- loot labels ---------- */
  const tagFor = (d) => { if (d.tag) return d.tag; const t = el('div', 'tag'); if (d.tierLabel) { const b = el('b', null, d.tierLabel); b.style.color = d.color; t.append(b); } const s = el('span', null, d.label); if (!d.tierLabel) s.style.color = d.color; t.append(s); document.body.append(t); d.tag = t; return t; };

  /* ---------- touch buttons that depend on context ---------- */
  const partOrder = ['head', 'guns', 'cannons', 'missiles', 'mortar', 'hangar', 'legs', 'treads', 'core'];
  /* T, or the touch button: step the lock through a walker's (or a boss's) parts */
  UI.cyclePart = () => { const P = G.player, t = (P.lock && P.lock.actor) || P.target, a = t && t.parts ? t : (boss && boss.alive ? boss : null); if (!a) return;
    const list = partOrder.filter(k => k === 'core' || (a.parts[k] && a.parts[k].hp > 0)), cur = P.lock && P.lock.actor === a && P.lock.part || 'core';
    const next = list[(list.indexOf(cur) + 1) % list.length]; P.lock = { actor: a, part: next === 'core' ? null : next }; };
  UI.modeChanged = () => { G.input.restStick && G.input.restStick(); tips(); };
  let tipsT = 0;
  function tips() { const t = $('tips'); t.style.opacity = 1; tipsT = 14;
    t.textContent = G.input.mode === 'touch' ? 'Left thumb to move · Hold Fire to shoot, it locks on by itself · Tap an enemy to lock on · Dodge to dash · Tap your weapon to swap' : 'Right-click to move · Hold left-click to fire, it locks on by itself · Space dodge · Wheel swap · T target part · I pack' + (G.R.assemble ? ' · B build' : ''); }
  UI.showTips = tips;

  /* ---------- per-frame HUD ---------- */
  let fpsT = 0;
  UI.update = (dt) => {
    const P = G.player;
    $('hpFill').style.transform = `scaleX(${(P.hp / P.maxHp).toFixed(3)})`; $('hpRow').classList.toggle('low', P.hp / P.maxHp < .35);
    $('armorTxt').textContent = `${Math.ceil(P.hp)} / ${P.maxHp}` + (P.armor ? ` · Armour ${P.armor}` : '');
    const A = G.ally; $('allyRow').hidden = !A.joined;
    if (A.joined) { $('allyFill').style.transform = `scaleX(${(A.down > 0 ? 0 : A.hp / A.maxHp).toFixed(3)})`; $('allyTxt').textContent = A.down > 0 ? 'Down · help her up' : P.down > 0 && A.reviveCD <= 0 && G.R.medic ? (A.reviving > 0 ? 'Getting you up' : 'Coming for you')
        : (A.mode === 'hold' ? 'Holding' : 'Following') + (G.R.medic ? (A.reviveCD > 0 ? ` · Revive in ${Math.ceil(A.reviveCD)}s` : ' · Revive ready') : ''); }
    hurtFx = Math.max(0, hurtFx - dt * 2.2); $('hurt').style.opacity = hurtFx.toFixed(3);
    /* weapon */
    const w = P.weapon;
    if (w) { const s = wstats(w); $('wName').textContent = w.name; $('wName').style.color = TIERS[w.tier].color; $('wAmmo').textContent = ''; $('wAmmo').append(String(Math.round(dps(w))), el('small', null, ' dps'));
      const T = P.target, L = P.lock; $('wLock').textContent = T ? (L ? 'Locked · ' : 'Auto · ') + (T.name || (T.kind === 'drone' ? 'Drone' : 'Target')) + (L && L.part && T.parts ? ' · ' + T.parts[L.part].label : '') : 'No target';
      $('wLock').classList.toggle('on', !!T);
      const alt = G.inv.equip[G.inv.active === 'primary' ? 'secondary' : 'primary']; $('wAlt').textContent = alt ? (G.input.mode === 'touch' ? 'Tap to swap · ' : 'Wheel · ') + alt.name : ''; }
    /* touch extras */
    $('cmdBtn').hidden = !A.joined; if (A.joined) $('cmdBtn').textContent = 'Mara: ' + (A.mode === 'hold' ? 'Hold' : 'Follow');
    const multi = (G.assist && G.assist.parts) || (boss && boss.alive); $('partBtn').hidden = !multi; if (multi) { const L = G.player.lock; $('partBtn').textContent = 'Aim: ' + (L && L.part && L.actor.parts ? L.actor.parts[L.part].label : 'Core'); }
    drawMarks();
    /* interaction prompt */
    const it = G.near; $('prompt').hidden = !it; $('useBtn').hidden = !it;
    if (it) { const w = G.game.working(), on = w && w.label === it.label, more = on ? ` · ${Math.floor(w.t / w.hold * 100)}%` : it.hold ? ` · stay ${it.hold}s` : '';   // one that takes a while says so, then how far along it is
      $('prompt').textContent = ''; $('prompt').append(el('kbd', null, 'E'), it.label + more); $('useBtn').textContent = it.label + more; }
    /* numbers */
    for (const n of nums) { if (n.life <= 0) continue; n.life -= dt; n.p.y += dt * 1.6; const s = UI.project(n.p); if (n.life <= 0 || !s.ok) { n.e.hidden = true; continue; }
      n.e.hidden = false; n.e.style.opacity = Math.min(1, n.life * 2.5).toFixed(2); place(n.e, s.x, s.y, '-50%', '-50%'); }
    /* enemy health */
    let mi = 0; const pp = P.pos;
    for (const a of G.actors) {
      if (!a.alive || a.dormant || a === P || a === A || a === boss || mi >= minis.length) continue;
      const d = Math.hypot(a.pos.x - pp.x, a.pos.z - pp.z); if (d > 26) continue;
      /* walkers always show theirs; everything else once it's been hurt */
      if (!a.parts && a.hp >= a.maxHp) continue;
      const m = minis[mi++], s = UI.project(a.pos.add(V(0, a.barY || (a.parts ? 4.9 * a.s : a.kind === 'drone' || a.kind === 'mender' ? .8 : a.kind === 'husk' ? 1.75 : 2.15), 0))); if (!s.ok) { m.m.hidden = true; continue; }
      m.m.hidden = false; m.m.classList.toggle('big', !!a.parts); m.m.classList.toggle('ally', a.faction === 'player');
      m.i.style.transform = `scaleX(${Math.max(0, a.hp / a.maxHp).toFixed(3)})`; place(m.m, s.x, Math.max(s.y, 8));   // kept on screen when the enemy is near the top edge
    }
    for (; mi < minis.length; mi++) minis[mi].m.hidden = true;
    /* boss */
    if (boss) { $('bossFill').style.transform = `scaleX(${Math.max(0, boss.hp / boss.maxHp).toFixed(3)})`; $('bossPhase').textContent = boss.alive ? 'Phase ' + boss.phase : 'Destroyed';
      const cur = P.lock && P.lock.actor === boss ? P.lock.part : (P.hover && P.hover.actor === boss ? P.hover.part : null);
      for (const k in pipEls) { const pt = boss.parts[k]; pipEls[k].i.style.transform = `scaleX(${(pt.hp / pt.max).toFixed(3)})`; pipEls[k].d.classList.toggle('dead', pt.hp <= 0); pipEls[k].d.classList.toggle('on', cur === k && pt.hp > 0); } }
    /* loot labels */
    for (const d of G.drops.list) { const t = tagFor(d), s = UI.project(V(d.x, 1.4, d.z)), near = Math.hypot(d.x - pp.x, d.z - pp.z) < 24; t.hidden = !s.ok || !near; if (s.ok && near) place(t, s.x, s.y); }
    if (tipsT > 0) { tipsT -= dt; if (tipsT <= 0) $('tips').style.opacity = 0; }
    fpsT -= dt; if (fpsT <= 0) { fpsT = .5; const v = G.engine.getFps(); $('fps').textContent = (isFinite(v) ? Math.min(240, Math.round(v)) : '--') + ' fps' + (G.res ? ' · ' + Math.round(G.res.scale * 100) + '% res' : ''); }
  };

  /* ---------- pack ---------- */
  let sel = null; // {from:'pack'|'equip', key}
  const slotNames = { primary: 'Primary', secondary: 'Secondary', helmet: 'Helmet', vest: 'Vest' };
  function statsOf(it) {
    if (!it) return [];
    if (it.type === 'weapon') { const s = wstats(it); return [['Damage', s.dmg * s.pellets, fmt(s.dmg) + (s.pellets > 1 ? ' ×' + s.pellets : '')], ['Fire rate', 1 / s.rate, fmt(1 / s.rate) + '/s'], ['Lock-on range', s.range, Math.round(s.range) + ' m'], ['Damage per second', dps(it), String(Math.round(dps(it)))]]; }
    return [['Armour', it.armor, String(it.armor)]];
  }
  function compareTarget(it) { const E = G.inv.equip; if (it.type === 'weapon') return E[G.inv.active] || E.primary; return E[it.slot]; }
  function better(it) { const c = compareTarget(it); return !c || power(it) > power(c); }
  function renderPack() {
    const E = G.inv.equip, list = $('slotList'); list.textContent = '';
    for (const k of ['primary', 'secondary', 'helmet', 'vest']) {
      const it = E[k], b = el('button', 'slot'); b.type = 'button'; if (sel && sel.from === 'equip' && sel.key === k) b.classList.add('sel');
      const ic = el('div', 'ico', it ? codeOf(it) : '—'); if (it) { ic.style.borderColor = TIERS[it.tier].color; ic.style.color = TIERS[it.tier].color; }
      const tx = el('div'); tx.append(el('div', 'lab', slotNames[k] + (k === G.inv.active ? ' · in hand' : '')), el('div', 'nm', it ? it.name : 'Empty'), el('div', 'pw', it ? (it.type === 'weapon' ? Math.round(dps(it)) + ' dps' : it.armor + ' armour') : ''));
      b.append(ic, tx); b.onclick = () => { sel = it ? { from: 'equip', key: k } : null; renderPack(); }; list.append(b);
    }
    const P = G.player, st = $('statList'); st.textContent = '';
    [['Health', P.maxHp], ['Armour', P.armor + ' (' + Math.round(P.reduce * 100) + '% less damage)'], ['Weapon dps', Math.round(dps(P.weapon))], ['Scrap', G.inv.scrap]].forEach(([k, v]) => st.append(el('dt', null, k), el('dd', null, String(v))));
    $('scrapTxt').textContent = 'Scrap ' + G.inv.scrap; $('packCount').textContent = `Items ${G.inv.items.length} / ${PACK_SIZE}`;
    const worth = G.inv.items.reduce((n, it) => n + it.value, 0); $('scrapAll').hidden = !G.inv.items.length; $('scrapAll').textContent = `Scrap all · +${worth}`; $('scrapConfirm').classList.remove('show');
    const grid = $('itemGrid'); grid.textContent = '';
    for (let i = 0; i < PACK_SIZE; i++) {
      const it = G.inv.items[i], t = el('button', 'tile' + (it ? '' : ' empty')); t.type = 'button';
      if (it) { const col = TIERS[it.tier].color; t.style.borderColor = col; const c = el('div', 't', codeOf(it)); c.style.color = col; t.append(c, el('div', 'p', String(power(it)))); if (better(it)) t.append(el('span', 'up', '▲'));
        if (sel && sel.from === 'pack' && sel.key === it.id) t.classList.add('sel'); t.onclick = () => { sel = { from: 'pack', key: it.id }; renderPack(); }; t.setAttribute('aria-label', it.name); }
      else t.disabled = true;
      grid.append(t);
    }
    renderDetail();
  }
  function renderDetail() {
    const D = $('detail'); D.textContent = '';
    const it = !sel ? null : sel.from === 'equip' ? G.inv.equip[sel.key] : G.inv.items.find(x => x.id === sel.key);
    if (!it) { D.hidden = true; return; } D.hidden = false;
    const T = TIERS[it.tier], tl = el('div', 'dt', T.label + ' · ' + (it.type === 'weapon' ? ARCH[it.arch].label : it.slot === 'helmet' ? 'Helmet' : 'Vest')); tl.style.color = T.color;
    D.append(el('div', 'dn', it.name), tl);
    const cmpWith = sel.from === 'pack' ? compareTarget(it) : null, mine = statsOf(it), theirs = statsOf(cmpWith), grid = el('div', 'cmp');
    mine.forEach(([k, raw, txt], i) => { grid.append(el('span', 'k', k), el('span', 'v', txt)); const o = theirs[i]; let d = '';
      if (o) { const diff = raw - o[1]; if (Math.abs(diff) > .05) { const e = el('span', 'd ' + (diff > 0 ? 'up-t' : 'down-t'), (diff > 0 ? '▲ ' : '▼ ') + fmt(Math.abs(diff))); grid.append(e); return; } }
      grid.append(el('span', 'd', d)); });
    D.append(grid);
    if (it.affixes.length) { const ul = el('ul', 'aff'); it.affixes.forEach(a => ul.append(el('li', null, affixText(it, a)))); D.append(ul); }
    if (cmpWith) D.append(el('p', 'muted', 'Compared with ' + cmpWith.name + '.'));
    const row = el('div', 'row'), btn = (label, cls, fn) => { const b = el('button', 'btn ' + (cls || ''), label); b.type = 'button'; b.onclick = fn; row.append(b); return b; };
    if (sel.from === 'pack') {
      if (it.type === 'weapon') { btn('Equip as primary', 'primary', () => equip(it, 'primary')); btn('Equip as secondary', '', () => equip(it, 'secondary')); }
      else btn('Equip', 'primary', () => equip(it, it.slot));
      btn('Scrap for ' + it.value, 'danger', () => { G.inv.items = G.inv.items.filter(x => x !== it); G.inv.scrap += it.value; sel = null; G.save.soon(); renderPack(); });
    } else {
      const k = sel.key;
      if (k !== 'primary') btn('Unequip', '', () => { if (G.inv.items.length >= PACK_SIZE) { UI.feed('Pack full'); return; } G.inv.items.push(it); G.inv.equip[k] = null; if (G.inv.active === k) G.inv.active = 'primary'; sel = null; afterEquip(); });
      if (it.type === 'weapon' && k !== G.inv.active) btn('Use this weapon', 'primary', () => { G.inv.active = k; afterEquip(); });
    }
    D.append(row);
  }
  function equip(it, slot) {
    const E = G.inv.equip, old = E[slot]; G.inv.items = G.inv.items.filter(x => x !== it);
    if (old) G.inv.items.push(old); E[slot] = it; if (it.type === 'weapon') G.inv.active = slot;
    sel = { from: 'equip', key: slot }; afterEquip(); UI.feed('Equipped ' + it.name, TIERS[it.tier].color);
  }
  function afterEquip() { G.player.recalc(); G.save.soon(); renderPack(); }
  /* Scrap all: everything in the pack (what you have equipped stays), after a check that says what it's worth and if any of it was an upgrade */
  $('scrapAll').onclick = () => {
    const items = G.inv.items, worth = items.reduce((n, it) => n + it.value, 0), ups = items.filter(better).length;
    $('scrapAsk').textContent = `Scrap all ${items.length} item${items.length === 1 ? '' : 's'} for ${worth} scrap?` + (ups ? ` ${ups === 1 ? 'One is' : ups + ' are'} better than what you have on (▲).` : '');
    $('scrapConfirm').classList.add('show');
  };
  $('scrapNo').onclick = () => $('scrapConfirm').classList.remove('show');
  $('scrapYes').onclick = () => {
    const n = G.inv.items.length, worth = G.inv.items.reduce((k, it) => k + it.value, 0); G.inv.items = []; G.inv.scrap += worth; sel = null;
    UI.feed(`Scrapped ${n} item${n === 1 ? '' : 's'} · + Scrap ×${worth}`, '#9aa0a6'); G.save.soon(); renderPack();
  };
  UI.openPack = () => { if (!G.started) return; sel = null; UI.packDot(false); renderPack(); $('pack').hidden = false; G.setPaused(true); };
  UI.closePack = () => { $('pack').hidden = true; G.setPaused(false); };
  $('packBtn').onclick = () => UI.openPack(); $('packClose').onclick = () => UI.closePack();

  /* ---------- menu ---------- */
  const pressed = () => { const S = G.settings; $('qHigh').setAttribute('aria-pressed', S.quality === 'high'); $('qLow').setAttribute('aria-pressed', S.quality === 'low');
    $('fpsTog').setAttribute('aria-pressed', !!S.fps); for (const [id, v] of [['cAuto', 'auto'], ['cTouch', 'touch'], ['cMouse', 'mouse']]) $(id).setAttribute('aria-pressed', G.input.setting === v);
    $('saveInfo').textContent = 'Your best run here saves automatically to ' + G.save.where + '.';
    $('muteBtn').textContent = S.mute ? 'Sound off' : 'Sound on'; $('muteBtn').setAttribute('aria-pressed', !S.mute); $('volRange').value = Math.round((S.volume == null ? .8 : S.volume) * 100); $('ambRange').value = Math.round((S.ambience == null ? .6 : S.ambience) * 100); };
  UI.openMenu = () => { if (!G.started) return; pressed(); $('wipeConfirm').classList.remove('show'); $('menu').hidden = false; G.setPaused(true); };
  UI.closeMenu = () => { $('menu').hidden = true; G.setPaused(false); };
  $('menuBtn').onclick = () => UI.openMenu(); $('resume').onclick = () => UI.closeMenu();
  $('qHigh').onclick = () => { G.setQuality('high'); pressed(); }; $('qLow').onclick = () => { G.setQuality('low'); pressed(); };
  $('muteBtn').onclick = () => { G.settings.mute = !G.settings.mute; G.audio.apply(); G.save.soon(); pressed(); };
  $('volRange').oninput = e => { G.settings.volume = +e.target.value / 100; if (G.settings.mute && G.settings.volume > 0) G.settings.mute = false; G.audio.apply(); pressed(); };
  $('volRange').onchange = () => G.save.soon();
  $('ambRange').oninput = e => { G.settings.ambience = +e.target.value / 100; G.audio.apply(); };
  $('ambRange').onchange = () => G.save.soon();
  $('fpsTog').onclick = () => { G.settings.fps = !G.settings.fps; $('fps').hidden = !G.settings.fps; G.save.soon(); pressed(); };
  $('cAuto').onclick = () => { G.input.setMode('auto', true); G.settings.controls = 'auto'; G.save.soon(); pressed(); };
  $('cTouch').onclick = () => { G.input.setMode('touch', true); G.settings.controls = 'touch'; G.save.soon(); pressed(); };
  $('cMouse').onclick = () => { G.input.setMode('mouse', true); G.settings.controls = 'mouse'; G.save.soon(); pressed(); };
  $('endRun').onclick = () => { UI.closeMenu(); G.game.respawnPlayer(); };   // going down for good: the end card
  $('wipeBtn').onclick = () => $('wipeConfirm').classList.add('show'); $('wipeNo').onclick = () => $('wipeConfirm').classList.remove('show');
  $('wipeYes').onclick = async () => { await G.save.wipe(); location.reload(); };

  /* ---------- scrap and the squad it builds (survival): a meter that is also the Build button ---------- */
  /* s: { label, text, fill (0 to 1), mark (0 to 1: a tick on the bar, if there's anything to mark), ready } */
  UI.build = (s) => { const b = $('buildBtn'); b.hidden = false; b.classList.toggle('ready', !!s.ready); b.disabled = !s.ready;
    $('buildLab').textContent = s.label; $('buildTxt').textContent = s.text; $('buildFill').style.transform = `scaleX(${Math.max(0, Math.min(1, s.fill)).toFixed(3)})`; $('buildMark').hidden = s.mark == null; if (s.mark != null) $('buildMark').style.left = (s.mark * 100).toFixed(1) + '%'; };
  $('buildBtn').onclick = () => G.game.build();

  /* ---------- levelling (survival) ---------- */
  UI.xp = (level, k) => { $('xpRow').hidden = false; $('xpTxt').textContent = level; $('xpFill').style.transform = `scaleX(${Math.max(0, Math.min(1, k)).toFixed(3)})`; };
  /* options: [{ kind: 'gun' | 'you' | 'mara', name, text, have, max, total }], where total is what it comes to with this pick.
     The game waits until one is picked (click, tap, or 1 2 3), then pick(index) is called. note is a warning to show (a boss on its way). */
  const KIND = { gun: 'Weapon', you: 'You', mara: 'Mara' };
  let lvKey = null;
  UI.levelUp = (level, options, pick, note) => {
    $('lvName').textContent = 'Level ' + level; $('lvWarn').hidden = !note; $('lvWarn').textContent = note || '';
    const box = $('lvChoices'), openedAt = performance.now(); box.textContent = '';
    /* a tap or key press already on its way when the cards appear doesn't pick one */
    const done = (i) => { if (performance.now() - openedAt < 350) return; window.removeEventListener('keydown', lvKey); $('levelup').hidden = true; G.setPaused(false); pick(i); };
    options.forEach((o, i) => {
      const b = el('button', 'choice ' + o.kind); b.type = 'button'; b.style.animationDelay = i * 70 + 'ms';
      const top = el('div', 'top'); top.append(el('span', 'cat', KIND[o.kind]), el('span', 'key', String(i + 1)));
      const ft = el('div', 'ft'), row = el('div', 'pips');
      if (o.max) { for (let k = 0; k < o.max; k++) row.append(el('i', k < o.have ? 'on' : k === o.have ? 'next' : '')); row.append(el('span', null, `${o.have + 1} of ${o.max}`)); }
      else row.append(el('span', null, o.have ? 'Taken ×' + o.have : 'New'));
      ft.append(row);
      if (o.have) { const t = el('div', 'tot', 'With this: '); t.append(el('b', null, o.total)); ft.append(t); }
      b.append(top, el('span', 'nm', o.name), el('span', 'tx', o.text), ft); b.onclick = () => done(i); box.append(b);
    });
    lvKey = e => { const i = ['Digit1', 'Digit2', 'Digit3'].indexOf(e.code); if (i >= 0 && i < options.length) done(i); }; window.addEventListener('keydown', lvKey);
    $('levelup').hidden = false; G.setPaused(true);
  };

  /* ---------- end card ---------- */
  /* card: { tag, name, record, isRecord, text, stats: [number, label] pairs, taken: [{ kind, text }], again: the button's label,
     others: [{ label, use }] for more buttons (the other arenas) } */
  UI.endCard = (card) => {
    $('endTag').textContent = card.tag; $('endName').textContent = card.name; $('endText').textContent = card.text;
    const rec = $('endRecord'); rec.hidden = !card.record; rec.textContent = card.record || ''; rec.classList.toggle('new', !!card.isRecord);
    const st = $('endStats'); st.textContent = ''; for (const [v, label] of card.stats) { const d = el('div'); d.append(el('b', null, String(v)), el('span', null, label)); st.append(d); }
    const tk = $('endTaken'), any = !!(card.taken && card.taken.length); $('endTakenHead').hidden = tk.hidden = !any; tk.textContent = '';
    for (const t of card.taken || []) { const s = el('span', t.kind); s.append(el('i'), t.text); tk.append(s); }
    $('again').textContent = card.again; const o = $('otherArenas'); o.textContent = '';
    for (const x of card.others || []) { const b = el('button', 'btn', x.label); b.type = 'button'; b.onclick = x.use; o.append(b); }
    $('end').hidden = false; G.setPaused(true); };
  $('again').onclick = () => { $('end').hidden = true; G.setPaused(false); G.game.runAgain(); };

  /* keyboard shortcuts for screens */
  UI.onAction = (a) => {
    const open = id => !$(id).hidden;
    if (open('levelup') && a !== 'mute') return;   // the pick comes first
    if (a === 'pack') { if (open('pack')) UI.closePack(); else if (!open('menu') && !open('end')) UI.openPack(); }
    if (a === 'menu') { if (open('pack')) UI.closePack(); else if (open('menu')) UI.closeMenu(); else if (!open('end')) UI.openMenu(); }
    if (a === 'part') UI.cyclePart();
    if (a === 'mute') { G.settings.mute = !G.settings.mute; G.audio.apply(); G.save.soon(); UI.feed(G.settings.mute ? 'Sound off · M to turn it back on' : 'Sound on'); if (open('menu')) pressed(); }
  };
  return UI;
}
