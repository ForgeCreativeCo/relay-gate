/* Saving: your progress and gear follow your account between phone and computer.
   When that isn't available (signed out, a preview), the save stays in this browser. */
import { G } from './core.js';

const LOCAL = 'relay-gate-save-v1';
export function makeSave() {
  const S = { remote: null, ref: null, timer: null, writing: false, again: false, where: 'this browser' };
  const readLocal = () => { try { const t = localStorage.getItem(LOCAL); return t ? JSON.parse(t) : null; } catch (e) { return null; } };
  const writeLocal = (d) => { try { localStorage.setItem(LOCAL, JSON.stringify(d)); } catch (e) {} };

  /* Resolve the account save, waiting at most `ms` so the title screen never hangs. */
  S.load = async (ms = 4000) => {
    let local = readLocal();
    /* One deadline for the whole account lookup: any step that stalls (connecting, asking who you are, reading the save) falls back to this browser. */
    const remote = async () => {
      const use = window.claude && window.claude.use;
      if (!use) return;
      const [db, user] = await Promise.all([use('db'), use('user')]);
      if (!db || !user) return;
      const id = await user.id();
      if (!id) return;
      const ref = db.doc('data/users/' + id + '/save');
      const snap = await ref.get();
      return { ref, state: snap && snap.exists ? snap.data().state || null : null };
    };
    try {
      const got = await Promise.race([remote(), new Promise(r => setTimeout(() => r(null), ms))]);
      if (got) { S.ref = got.ref; S.where = 'your account'; S.remote = got.state; }
    } catch (e) { S.ref = null; }
    const pickNewer = [S.remote, local].filter(Boolean).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0];
    return pickNewer || null;
  };
  const snapshot = () => {
    const strip = it => it && JSON.parse(JSON.stringify(it, (k, v) => k === '_ammo' ? undefined : v));
    const inv = G.inv, eq = inv.equip;
    return { v: 1, savedAt: Date.now(), inv: { items: inv.items.map(strip), equip: { primary: strip(eq.primary), secondary: strip(eq.secondary), helmet: strip(eq.helmet), vest: strip(eq.vest) }, active: inv.active, scrap: inv.scrap },
      progress: { ...G.progress }, settings: { ...G.settings } };
  };
  async function flush() {
    if (!G.started) return;
    const d = snapshot(); writeLocal(d);
    if (!S.ref) return;
    if (S.writing) { S.again = true; return; }
    S.writing = true;
    try { await S.ref.set({ state: d }); } catch (e) { S.ref = null; S.where = 'this browser'; }
    S.writing = false; if (S.again) { S.again = false; flush(); }
  }
  /* Coalesce bursts of changes (looting a pile) into one write. */
  S.soon = () => { clearTimeout(S.timer); S.timer = setTimeout(flush, 1500); };
  S.now = () => { clearTimeout(S.timer); return flush(); };
  S.wipe = async () => { try { localStorage.removeItem(LOCAL); } catch (e) {} if (S.ref) { try { await S.ref.delete(); } catch (e) {} } };
  window.addEventListener('pagehide', () => { if (G.started) writeLocal(snapshot()); });
  return S;
}
