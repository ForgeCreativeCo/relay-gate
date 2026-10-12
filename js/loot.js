/* Items: generated weapons and armour, the pack, and loot lying in the world. */
import { B, G, V, rand, pick, dist2, boost } from './core.js';

export const TIERS = {
  scrap: { key: 'scrap', label: 'Scrap', color: '#9aa0a6', mult: 1, affixes: 0, rank: 0 },
  military: { key: 'military', label: 'Military', color: '#5fd16a', mult: 1.2, affixes: 1, rank: 1 },
  proto: { key: 'proto', label: 'Prototype', color: '#b47bff', mult: 1.45, affixes: 2, rank: 2 },
  machine: { key: 'machine', label: 'Machine-forged', color: '#ffc94a', mult: 1.75, affixes: 3, rank: 3 },
};
export const ARCH = {
  /* No reloading: each fire rate already includes what reloading used to cost, so damage per second is unchanged. range is how far the gun locks on. */
  rifle: { label: 'Rifle', models: ['M4', 'AR-9', 'Kestrel', 'Stag'], dmg: 9, rate: .164, spread: .035, pellets: 1, speed: 58, life: .6, range: 20 },
  smg: { label: 'SMG', models: ['Vex', 'K7', 'Hornet'], dmg: 6, rate: .105, spread: .07, pellets: 1, speed: 55, life: .5, range: 16 },
  shotgun: { label: 'Shotgun', models: ['Breacher', 'M870', 'Mule'], dmg: 7.5, rate: .99, spread: .16, pellets: 7, speed: 48, life: .32, range: 11 },
  marksman: { label: 'Marksman', models: ['Longwatch', 'SR-25', 'Heron'], dmg: 34, rate: .65, spread: .008, pellets: 1, speed: 85, life: .8, range: 26 },
  arc: { label: 'Arc Carbine', models: ['Arc', 'Ion', 'Relay'], dmg: 11, rate: .19, spread: .03, pellets: 1, speed: 64, life: .6, range: 20, tech: true },
};
const W_AFFIX = [
  { k: 'vsMachine', min: 10, max: 35, text: v => `+${v}% damage to machines` },
  { k: 'crit', min: 4, max: 14, text: v => `${v}% critical hit chance` },
  { k: 'dmgPct', min: 5, max: 15, text: v => `+${v}% damage` },
  { k: 'rangePct', min: 10, max: 30, text: v => `+${v}% lock-on range` },
  { k: 'rate', min: 5, max: 16, text: v => `+${v}% fire rate` },
  { k: 'leech', min: 3, max: 10, text: v => `Heal ${v} on each kill` },
];
const A_AFFIX = [
  { k: 'maxHp', min: 8, max: 30, text: v => `+${v} max health` },
  { k: 'regen', min: 15, max: 45, text: v => `+${v}% health regeneration` },
  { k: 'dodge', min: 10, max: 30, text: v => `${v}% faster dodge recovery` },
  { k: 'armorPct', min: 10, max: 25, text: v => `+${v}% armour` },
];
const ARMOR = { helmet: { label: 'Helmet', names: ['Patrol Helmet', 'Riot Helmet', 'Recon Hood', 'Sensor Visor'], base: 6 }, vest: { label: 'Vest', names: ['Plate Carrier', 'Ballistic Vest', 'Rig Harness', 'Ceramic Vest'], base: 10 } };
const ri = (a, b) => Math.round(rand(a, b));
let uid = 1;
const newId = () => 'i' + Date.now().toString(36) + (uid++);

function rollAffixes(list, n) { const pool = [...list], out = []; for (let i = 0; i < n && pool.length; i++) { const a = pool.splice(Math.floor(Math.random() * pool.length), 1)[0]; out.push({ k: a.k, v: ri(a.min, a.max) }); } return out; }
export function affixText(it, a) { const L = it.type === 'weapon' ? W_AFFIX : A_AFFIX; const d = L.find(x => x.k === a.k); return d ? d.text(a.v) : ''; }

export function genWeapon(tier, arch) {
  arch = arch || pick(Object.keys(ARCH)); const A = ARCH[arch], T = TIERS[tier];
  const q = rand(.92, 1.08) * T.mult;
  const it = { id: newId(), type: 'weapon', slot: 'weapon', arch, tier, model: pick(A.models), dmg: +(A.dmg * q).toFixed(1), affixes: rollAffixes(W_AFFIX, T.affixes + (tier !== 'scrap' && Math.random() < .3 ? 1 : 0)) };
  it.name = `${it.model} ${A.label}`;
  it.value = Math.round((4 + T.rank * 10) * rand(.8, 1.2));
  return it;
}
export function genArmor(tier, slot) {
  slot = slot || pick(['helmet', 'vest']); const A = ARMOR[slot], T = TIERS[tier];
  const it = { id: newId(), type: 'armor', slot, tier, name: pick(A.names), armor: Math.round(A.base * T.mult * rand(.9, 1.1)), affixes: rollAffixes(A_AFFIX, T.affixes) };
  it.value = Math.round((3 + T.rank * 9) * rand(.8, 1.2));
  return it;
}
/* Weapon stats with affixes and this run's upgrades applied; this is what the gun actually uses. */
export function wstats(it) {
  const A = ARCH[it.arch], f = k => (it.affixes.find(a => a.k === k) || {}).v || 0, up = k => 1 + boost(k) / 100;
  return { dmg: +(it.dmg * (1 + f('dmgPct') / 100) * up('dmg')).toFixed(1), rate: A.rate / (1 + f('rate') / 100) / up('rate'), spread: A.spread, pellets: A.pellets, range: A.range * (1 + f('rangePct') / 100) * up('range'),
    speed: A.speed, life: A.life, crit: f('crit') + boost('crit'), vsMachine: f('vsMachine'), leech: f('leech') + boost('leech'), tech: !!A.tech };
}
export function dps(it) { const s = wstats(it); return s.dmg * s.pellets / s.rate * (1 + s.crit / 100 * .8); }
export function power(it) { return it.type === 'weapon' ? Math.round(dps(it)) : it.armor; }

/* What each enemy can drop. */
export function rollLoot(src) {
  const out = [], tierRoll = (w) => { let r = Math.random() * w.reduce((a, b) => a + b[1], 0); for (const [t, p] of w) { if ((r -= p) <= 0) return t; } return w[0][0]; };
  const item = (w) => { const t = tierRoll(w); return Math.random() < .68 ? genWeapon(t) : genArmor(t); };
  if (src === 'drone') { if (Math.random() < .22) out.push(item([['scrap', 70], ['military', 28], ['proto', 2]])); out.push({ scrap: ri(1, 3) }); }
  if (src === 'husk') { if (Math.random() < .28) out.push(item([['scrap', 60], ['military', 36], ['proto', 4]])); out.push({ scrap: ri(1, 4) }); }
  if (src === 'walker') { out.push(item([['military', 60], ['proto', 34], ['machine', 6]])); if (Math.random() < .5) out.push(item([['scrap', 40], ['military', 50], ['proto', 10]])); out.push({ scrap: ri(5, 9) }); }
  if (src === 'warden') { out.push(genWeapon('machine')); out.push(genArmor(Math.random() < .6 ? 'proto' : 'machine')); out.push(item([['proto', 70], ['machine', 30]])); out.push({ scrap: ri(20, 30) }); }
  return out;
}

/* ---------- the pack ---------- */
export const PACK_SIZE = 24;
export function newInventory() {
  const start = genWeapon('scrap', 'rifle'); start.model = 'M4'; start.name = 'M4 Rifle'; start.affixes = [];
  return { items: [], equip: { primary: start, secondary: null, helmet: null, vest: null }, active: 'primary', scrap: 0 };
}

/* ---------- loot in the world ---------- */
export function makeDrops(M) {
  const D = { list: [] };
  const beamMats = {}, gemMats = {};
  const matFor = (hex) => { if (!beamMats[hex]) { const b = new B.StandardMaterial('db' + hex, G.scene); b.disableLighting = true; b.emissiveColor = B.Color3.FromHexString(hex); b.alpha = .15; b.alphaMode = B.Engine.ALPHA_ADD; b.backFaceCulling = false; beamMats[hex] = b;
      const m = new B.StandardMaterial('dg' + hex, G.scene); m.disableLighting = true; m.emissiveColor = B.Color3.FromHexString(hex); gemMats[hex] = m; } return [beamMats[hex], gemMats[hex]]; };
  D.spawn = (x, z, entry) => {
    const isScrap = entry.scrap != null, hex = isScrap ? '#9aa0a6' : TIERS[entry.tier].color, [bm, gm] = matFor(hex);
    const gem = isScrap ? B.MeshBuilder.CreateBox('scrapDrop', { width: .32, height: .2, depth: .26 }, G.scene) : B.MeshBuilder.CreateIcoSphere('drop', { radius: .24, subdivisions: 1, flat: true }, G.scene);
    gem.material = gm; gem.position.set(x, .5, z); gem.isPickable = false;
    let beam = null;
    if (!isScrap) { beam = B.MeshBuilder.CreateCylinder('dropBeam', { height: 9, diameterTop: .15, diameterBottom: .55, tessellation: 10, cap: B.Mesh.NO_CAP }, G.scene); beam.position.set(x, 4.5, z); beam.material = bm; beam.isPickable = false; G.glow.addExcludedMesh(beam); }
    const d = { x, z, entry, gem, beam, t: rand(0, 6), label: isScrap ? `Scrap ×${entry.scrap}` : entry.name, tierLabel: isScrap ? '' : TIERS[entry.tier].label, color: hex, tag: null };
    D.list.push(d); return d;
  };
  D.scatter = (x, z, entries) => entries.forEach((e, i) => { const a = i / entries.length * Math.PI * 2 + rand(0, 1), r = rand(1.2, 2.6); D.spawn(x + Math.cos(a) * r, z + Math.sin(a) * r, e); });
  D.remove = (d) => { d.gem.dispose(); if (d.beam) d.beam.dispose(); if (d.tag) d.tag.remove(); D.list.splice(D.list.indexOf(d), 1); };
  D.update = (dt, p) => {
    for (const d of [...D.list]) {
      d.t += dt; d.gem.rotation.y += dt * 2; d.gem.position.y = .5 + Math.sin(d.t * 3) * .1;
      if (dist2(p, d) < 1.5 && G.player.alive) {
        const e = d.entry;
        if (e.scrap != null) { G.inv.scrap += e.scrap; G.UI.feed(`+ Scrap ×${e.scrap}`, '#9aa0a6'); D.remove(d); G.save.soon(); continue; }
        if (G.inv.items.length >= PACK_SIZE) { if (!d.fullWarn) { G.UI.feed('Pack full · Scrap something to make room', '#ff6a5a'); d.fullWarn = true; } continue; }
        G.inv.items.push(e); G.UI.feed(`+ ${e.name} · ${TIERS[e.tier].label}`, TIERS[e.tier].color); D.remove(d); G.UI.packDot(true); G.save.soon();
      } else if (d.fullWarn && dist2(p, d) > 3) d.fullWarn = false;
    }
  };
  D.clear = () => { for (const d of [...D.list]) D.remove(d); };
  return D;
}
