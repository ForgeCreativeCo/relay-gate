/* Saving: your progress and gear follow your account between phone and computer.
   When that isn't available (signed out, a preview), the save stays in this browser. */
import { G } from './core.js';

/* opts.key: a different slot in this browser; opts.localOnly: never touch the account save (a region still being built uses both,
   so testing it can't overwrite your Dead City progress) */
export function makeSave(opts = {}) {
  const LOCAL = opts.key || 'relay-gate-save-v1';
  const S = { remote: null, ref: null, timer: null, writing: false, again: false, where: 'this browser' };
  const readLocal = () => { try { const t = localStorage.getItem(LOCAL); return t ? JSON.parse(t) : null; } catch (e) { return null; } };
  const writeLocal = (d) => { try { localStorage.setItem(LOCAL, JSON.stringify(d)); } catch (e) {} };

  /* Resolve the save to continue from. The account lookup gets `ms` before the title screen goes ahead with the copy in this browser;
     if the account answers later (common right after a restart, while Claude re-establishes your session), onLate(state) is called
     with the account save so the title screen can switch to it. */
  S.onLate = null;
  S.load = async (ms = 4000) => {
    const local = readLocal();
    const remote = async () => {
      const C = window.claude; if (opts.localOnly || !C || typeof C.use !== 'function') return null;
      const [db, user] = await Promise.all([C.use('db'), C.use('user')]);   // called on window.claude, never detached
      if (!db || !user) return null;
      const id = await user.id();
      if (!id) return null;
      const ref = db.doc('data/users/' + id + '/save');
      const snap = await ref.get();
      return { ref, state: snap && snap.exists ? (snap.data() || {}).state || null : null };
    };
    const adopt = got => { S.ref = got.ref; S.where = 'your account'; S.remote = got.state; };
    const pending = remote().catch(() => null);
    const got = await Promise.race([pending, new Promise(r => setTimeout(() => r('late'), ms))]);
    if (got === 'late') pending.then(g => { if (!g) return; adopt(g); if (S.onLate) S.onLate(g.state); });
    else if (got) adopt(got);
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
