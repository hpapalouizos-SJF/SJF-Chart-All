/* Local persistence. Everything lives on the iPad (localStorage, mirrored to IndexedDB).
   Each game is saved after every tap. */
(function (root) {
  'use strict';
  const P = 'sjfc.';
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { localStorage.setItem(P + k, JSON.stringify(v)); },
    del(k) { try { localStorage.removeItem(P + k); } catch (e) { /* */ } }
  };

  // IndexedDB mirror — a second copy in case localStorage is ever cleared or full
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res) => {
      try {
        const r = indexedDB.open('sjf-chart', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
      } catch (e) { res(null); }
    });
    return dbp;
  }
  async function idbPut(k, v) { const d = await db(); if (!d) return; try { d.transaction('kv', 'readwrite').objectStore('kv').put(v, k); } catch (e) { /* */ } }
  async function idbGet(k) { const d = await db(); if (!d) return null; return new Promise(res => { try { const q = d.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); } }); }
  async function idbDel(k) { const d = await db(); if (!d) return; try { d.transaction('kv', 'readwrite').objectStore('kv').delete(k); } catch (e) { /* */ } }
  async function idbKeys() { const d = await db(); if (!d) return []; return new Promise(res => { try { const q = d.transaction('kv').objectStore('kv').getAllKeys(); q.onsuccess = () => res(q.result || []); q.onerror = () => res([]); } catch (e) { res([]); } }); }

  const DEFAULT_SETTINGS = {
    team: 'SJF', fbStd: 5.5, tgtFps: '', tgtLo: '', tgtWhiff: '', tgtChase: '',
    requireType: true, velo: true, ttpStd: '',
    veloDefaults: { 1: 86, 2: 72, 3: 78, 4: 77, 5: 82 }
  };

  const Store = {
    saveError: null,
    index() { return ls.get('index', []); },
    load(id) { return ls.get('game.' + id, null); },
    save(game) {
      game.updated = Date.now();
      const idx = this.index().filter(g => g.id !== game.id);
      let S = null; try { S = root.Engine.replay(game); } catch (e) { /* */ }
      idx.push({
        id: game.id, date: game.date, home: game.home.name, away: game.away.name, sjfSide: game.sjfSide,
        score: S ? S.score : null, status: game.status, updated: game.updated,
        inning: S ? (S.half === 'top' ? 'Top ' : 'Bot ') + S.inning : ''
      });
      this.saveError = null;
      try { ls.set('game.' + game.id, game); ls.set('index', idx); }
      catch (e) { this.saveError = e; }
      idbPut('game.' + game.id, JSON.parse(JSON.stringify(game)));
      idbPut('index', idx);
      return !this.saveError;
    },
    remove(id) {
      ls.del('game.' + id); ls.set('index', this.index().filter(g => g.id !== id));
      idbDel('game.' + id); idbPut('index', this.index());
    },
    // if localStorage was wiped but IndexedDB still has games, bring them back
    async recover() {
      const keys = await idbKeys();
      let restored = 0;
      for (const k of keys) {
        if (String(k).startsWith('pen.')) {
          const id = String(k).slice(4);
          if (!ls.get('pen.' + id, null)) { const p = await idbGet(k); if (p) { this.savePen(p); restored++; } }
          continue;
        }
        if (!String(k).startsWith('game.')) continue;
        const id = String(k).slice(5);
        if (!ls.get('game.' + id, null)) { const g = await idbGet(k); if (g) { this.save(g); restored++; } }
      }
      for (const k of ['roster', 'opps', 'settings']) {
        if (ls.get(k, null) == null) { const v = await idbGet(k); if (v != null) { ls.set(k, v); restored++; } }
      }
      return restored;
    },
    // ---- bullpens (one record per pitcher per pen)
    penIndex() { return ls.get('penindex', []); },
    loadPen(id) { return ls.get('pen.' + id, null); },
    savePen(pen) {
      pen.updated = Date.now();
      const idx = this.penIndex().filter(p => p.id !== pen.id);
      const pitches = (pen.events || []).filter(e => e.t === 'pitch');
      idx.push({ id: pen.id, date: pen.date, name: pen.pitcher.name, num: pen.pitcher.num, n: pitches.length,
        k: pitches.filter(p => p.strike).length, status: pen.status, updated: pen.updated });
      this.saveError = null;
      try { ls.set('pen.' + pen.id, pen); ls.set('penindex', idx); } catch (e) { this.saveError = e; }
      idbPut('pen.' + pen.id, JSON.parse(JSON.stringify(pen))); idbPut('penindex', idx);
      return !this.saveError;
    },
    removePen(id) { ls.del('pen.' + id); ls.set('penindex', this.penIndex().filter(p => p.id !== id)); idbDel('pen.' + id); idbPut('penindex', this.penIndex()); },
    roster() { return ls.get('roster', []); },
    saveRoster(r) { ls.set('roster', r); idbPut('roster', r); },
    opps() { return ls.get('opps', {}); },
    saveOpp(name, players) {
      if (!name) return;
      const o = this.opps(); const key = name.trim().toUpperCase();
      const prev = (o[key] && o[key].players) || [];
      const byNum = {}; prev.forEach(p => (byNum[p.num] = p)); players.forEach(p => (byNum[p.num] = Object.assign({}, byNum[p.num] || {}, p)));
      o[key] = { name: name.trim(), players: Object.values(byNum).sort((a, b) => (+a.num || 0) - (+b.num || 0)), updated: Date.now() };
      ls.set('opps', o); idbPut('opps', o);
    },
    deleteOpp(key) { const o = this.opps(); delete o[key]; ls.set('opps', o); idbPut('opps', o); },
    settings() { return Object.assign({}, DEFAULT_SETTINGS, ls.get('settings', {})); },
    saveSettings(s) { ls.set('settings', s); idbPut('settings', s); },
    usage() {
      let n = 0; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith(P)) n += (localStorage.getItem(k) || '').length; } } catch (e) { /* */ }
      return n * 2; // bytes (UTF-16)
    },
    allData() { return { kind: 'sjf-chart-backup', v: 1, at: new Date().toISOString(), roster: this.roster(), opps: this.opps(), settings: this.settings(), games: this.index().map(g => this.load(g.id)).filter(Boolean), pens: this.penIndex().map(p => this.loadPen(p.id)).filter(Boolean) }; }
  };
  root.Store = Store;
})(window);
