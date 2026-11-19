/* SJF Pitch Chart — iPad UI */
(function () {
  'use strict';
  const E = window.Engine, R = window.ChartRender, Store = window.Store, X = window.Exports;
  const TN = E.PITCH_TYPES;
  const TCOL = { 1: 'var(--fb)', 2: 'var(--cb)', 3: 'var(--sl)', 4: 'var(--ch)', 5: 'var(--ot)', 0: 'var(--unk)' };
  const THEX = { 1: '#C62828', 2: '#1565C0', 3: '#2E7D32', 4: '#E65100', 5: '#6A1B9A', 0: '#616161' };
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const App = {
    screen: 'home', tab: 'chart', game: null, S: null, settings: Store.settings(),
    pend: { type: null, velo: null, loc: null }, redo: [], banner: null,
    sheetSide: null, sheetPage: 0, statsSide: null, setup: null, modal: null, swUpdate: false
  };
  window.__app = App; // for testing

  // ------------------------------------------------------------------ utilities
  let toastTimer = null;
  function toast(msg, btn) {
    const t = $('toast');
    t.innerHTML = '<span>' + esc(msg) + '</span>' + (btn ? '<button class="btn" data-act="toastBtn">' + esc(btn.label) + '</button>' : '');
    t.classList.remove('hidden');
    App.toastFn = btn ? btn.fn : null;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), btn ? 5000 : 2600);
  }
  function seg(name, opts, val, extra) {
    return '<div class="seg" ' + (extra || '') + '>' + opts.map(([v, l, dis]) =>
      '<button data-act="' + name + '" data-v="' + esc(v) + '" class="' + (String(v) === String(val) ? 'on' : '') + '" ' + (dis ? 'disabled' : '') + '>' + l + '</button>').join('') + '</div>';
  }
  const pl = (side, pid) => E.player(App.game, side, pid);
  const unknown = pid => pid == null || String(pid).charAt(0) === '?';
  const pName = (side, pid) => { if (unknown(pid)) return 'Unknown #?'; const p = pl(side, pid); return '#' + p.num + (p.name ? ' ' + p.name : ''); };
  const teamName = side => App.game[side].name;
  function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ------------------------------------------------------------------ modal system
  function openModal(o) {
    App.modal = o;
    renderModal();
    $('modal').classList.remove('hidden');
  }
  function closeModal() { App.modal = null; $('modal').classList.add('hidden'); $('modalSheet').innerHTML = ''; }
  function renderModal() {
    const m = App.modal; if (!m) return;
    const sc = $('modalSheet').scrollTop;
    $('modalSheet').innerHTML = '<div class="mhead"><h2>' + esc(m.title) + '</h2><button class="btn small" data-act="mClose">Cancel</button></div>' +
      '<div class="mbody">' + m.body() + '</div>' + (m.foot ? '<div class="mfoot">' + m.foot() + '</div>' : '');
    $('modalSheet').scrollTop = sc;
    if (m.after) m.after();
  }
  function confirmBox(title, text, okLabel, fn, danger) {
    openModal({
      title, body: () => '<p style="font-size:17px">' + esc(text) + '</p>',
      foot: () => '<button class="btn ' + (danger ? 'danger' : 'primary') + '" data-act="mOk">' + esc(okLabel) + '</button>',
      acts: { mOk: () => { closeModal(); fn(); } }
    });
  }

  // ------------------------------------------------------------------ routing / render
  function go(screen) { App.screen = screen; render(); window.scrollTo(0, 0); }
  function render() {
    const a = $('app');
    if (App.screen === 'home') a.innerHTML = homeHTML();
    else if (App.screen === 'setup') a.innerHTML = setupHTML();
    else if (App.screen === 'game') { a.innerHTML = gameHTML(); afterGame(); }
    else if (App.screen === 'rosters') a.innerHTML = rostersHTML();
    else if (App.screen === 'settings') a.innerHTML = settingsHTML();
    else if (App.screen === 'help') a.innerHTML = helpHTML();
    else if (window.PenUI && PenUI.screens[App.screen]) { a.innerHTML = PenUI.screens[App.screen](); if (PenUI.after) PenUI.after(); }
  }

  // ================================================================== HOME
  function homeHTML() {
    const games = Store.index().slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updated - a.updated);
    const rows = games.map(g => {
      const sc = g.score ? g.away + ' ' + g.score.away + ' @ ' + g.home + ' ' + g.score.home : g.away + ' @ ' + g.home;
      return '<div class="game-row"><div class="grow"><div class="t">' + esc(sc) + '</div><div class="muted">' + esc(R.fmtDate(g.date)) +
        ' · <span class="pill ' + (g.status === 'final' ? '' : 'live') + '">' + (g.status === 'final' ? 'Final' : 'Live · ' + esc(g.inning)) + '</span>' + (g.mode === 'call' ? ' <span class="pill" style="background:#fff7e0;color:#7a5a00">Pitch-calling</span>' : '') + '</div></div>' +
        '<button class="btn primary" data-act="openGame" data-id="' + g.id + '">Open</button>' +
        '<button class="btn small danger" data-act="delGame" data-id="' + g.id + '">Delete</button></div>';
    }).join('');
    return '<div class="topbar"><div class="brand"><img src="' + window.SJF_LOGO + '" alt=""><h1>SJF Pitch Chart</h1></div><div class="grow"></div>' +
      '<button class="btn" data-act="goRosters">Rosters</button><button class="btn" data-act="goSettings">Settings</button><button class="btn" data-act="goHelp">How to use</button></div>' +
      '<div class="page">' +
      (App.swUpdate ? '<div class="banner">A new version of the app is ready. <button class="btn small gold" data-act="reload">Update now</button></div>' : '') +
      (Store.saveError ? '<div class="banner red">Storage is full or blocked — export backups and delete old games.</div>' : '') +
      '<div class="row" style="margin-top:6px"><button class="btn primary" data-act="newGame" style="font-size:19px;min-height:60px;padding:0 26px">+ New game</button>' +
      '<button class="btn gold" data-act="goPens" style="font-size:19px;min-height:60px;padding:0 26px">Bullpens ›</button><div class="grow"></div>' +
      '<button class="btn" data-act="backupAll">Back up everything</button><label class="btn" style="display:inline-flex;align-items:center">Restore…<input type="file" accept=".json,application/json" data-chg="restore" style="display:none"></label></div>' +
      '<div class="games">' + (rows || '<div class="card muted" style="font-size:17px">No games yet. Tap <b>+ New game</b> before first pitch.</div>') + '</div>' +
      '<p class="muted" style="margin-top:20px;font-size:13px">Everything is saved on this iPad after every tap and works with no internet. ' +
      'Storage used: ' + Math.round(Store.usage() / 1024) + ' KB.</p></div>';
  }

  // ================================================================== SETUP
  function blankLineup() { return Array.from({ length: 9 }, () => ({ num: '', name: '', bats: 'R' })); }
  function newSetup() {
    return { mode: 'full', date: today(), opp: '', sjfSide: 'home', innings: 9, lu: { sjf: blankLineup(), opp: blankLineup() }, p: { sjf: { num: '', name: '', throws: 'R' }, opp: { num: '', name: '', throws: 'R' } } };
  }
  function setupHTML() {
    const s = App.setup, st = App.settings;
    const oppKeys = Object.values(Store.opps()).map(o => o.name);
    const call = s.mode === 'call';
    const pRow = (k) => '<div class="grp-lab">Starting pitcher</div><div class="row"><input class="txt num" style="width:70px" inputmode="numeric" placeholder="#" value="' + esc(s.p[k].num) + '" data-bind="p.' + k + '.num" data-lookp="' + k + '">' +
      '<input class="txt grow" style="width:auto" placeholder="Name" value="' + esc(s.p[k].name) + '" data-bind="p.' + k + '.name">' + seg('setThrows', [['R', 'RHP'], ['L', 'LHP']], s.p[k].throws, 'data-k="' + k + '"') + '</div>';
    const lu = (k) => '<table class="lu">' + s.lu[k].map((r, i) =>
      '<tr><td class="n">' + (i + 1) + '</td><td><input class="txt num" inputmode="numeric" placeholder="#" value="' + esc(r.num) + '" data-bind="lu.' + k + '.' + i + '.num" data-look="' + k + '.' + i + '"></td>' +
      '<td><input class="txt" placeholder="Name" value="' + esc(r.name) + '" data-bind="lu.' + k + '.' + i + '.name"></td>' +
      '<td>' + seg('setBats', [['R', 'R'], ['L', 'L'], ['S', 'S']], r.bats, 'data-k="' + k + '" data-i="' + i + '"') + '</td></tr>').join('') + '</table>' + pRow(k);
    return '<div class="topbar"><button class="btn" data-act="goHome">‹ Games</button><h1>New game</h1></div><div class="page">' +
      '<div class="card" style="margin-bottom:14px"><label class="f">Chart type</label>' + seg('setMode', [['full', 'Full Synergy chart'], ['call', 'Pitch-calling chart']], s.mode) +
      '<p class="muted" style="margin:8px 0 0">' + (call ? '<b>Pitch-calling:</b> charts their hitters only — pitch type, result, and where it went (no location or velo). Each hitter’s full breakdown is on screen before every at-bat. Still exports the Synergy chart of ' + esc(st.team) + ' pitching.' : '<b>Full chart:</b> both teams, with location and velo on every pitch.') + '</p></div>' +
      '<div class="card"><div class="row">' +
      '<div><label class="f">Date</label><input class="txt" type="date" value="' + esc(s.date) + '" data-bind="date"></div>' +
      '<div class="grow"><label class="f">Opponent</label><input class="txt" list="opplist" placeholder="e.g. ONU" value="' + esc(s.opp) + '" data-bind="opp" data-chg="oppPicked"><datalist id="opplist">' + oppKeys.map(o => '<option value="' + esc(o) + '">').join('') + '</datalist></div>' +
      '<div><label class="f">' + esc(st.team) + ' is</label>' + seg('setSide', [['home', 'Home'], ['away', 'Away']], s.sjfSide) + '</div>' +
      '<div><label class="f">Innings</label>' + seg('setInn', [[7, '7'], [9, '9']], s.innings) + '</div></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn small" data-act="copyLast">Copy lineups from last game vs this opponent</button><button class="btn small" data-act="fillRoster">Fill ' + esc(st.team) + ' names from roster</button></div></div>' +
      '<div class="setup-grid" style="margin-top:14px"><div class="card"><h2>' + esc(st.team) + (call ? ' pitching' : ' lineup') + '</h2>' + (call ? '<p class="muted">Pitch-calling charts only their hitters, so no ' + esc(st.team) + ' lineup is needed.</p>' + pRow('sjf') : lu('sjf')) + '</div>' +
      '<div class="card"><h2 id="oppHead">' + esc(s.opp || 'Opponent') + ' lineup</h2>' + lu('opp') + '</div></div>' +
      '<p class="muted"><b>Don’t have a lineup yet?</b> Leave any spots (or the starting pitcher) blank and start the game — the app asks for each hitter’s number the first time he comes up. Names fill in automatically from your roster and from past games against the same team. Switch hitters (S) are charted from the side they bat against each pitcher.</p>' +
      '<div class="row" style="margin:10px 0 40px"><div class="grow"></div><button class="btn primary" data-act="startGame" style="font-size:20px;min-height:62px;padding:0 34px">Start game ›</button></div></div>';
  }
  // refresh setup fields in place (a full re-render would drop the iPad keyboard)
  function patchSetup() {
    const s = App.setup; if (!s || App.screen !== 'setup') return;
    document.querySelectorAll('[data-bind]').forEach(inp => {
      if (inp === document.activeElement) return;
      const path = inp.dataset.bind.split('.'); let o = s; for (const k of path) o = o == null ? '' : o[k];
      if (o != null && inp.value !== String(o)) inp.value = o;
    });
    document.querySelectorAll('[data-act="setBats"]').forEach(b => { const p = b.parentNode; b.classList.toggle('on', s.lu[p.dataset.k][+p.dataset.i].bats === b.dataset.v); });
    document.querySelectorAll('[data-act="setThrows"]').forEach(b => { b.classList.toggle('on', s.p[b.parentNode.dataset.k].throws === b.dataset.v); });
  }
  function setupLookup(k, i) {
    const s = App.setup; const r = s.lu[k][i];
    const found = findPlayer(k, r.num);
    if (found) { if (!r.name) r.name = found.name || ''; if (found.bats) r.bats = found.bats; }
  }
  function findPlayer(k, num) {
    if (!num) return null;
    if (k === 'sjf') return Store.roster().find(p => String(p.num) === String(num)) || null;
    const o = Store.opps()[(App.setup.opp || '').trim().toUpperCase()];
    return o ? o.players.find(p => String(p.num) === String(num)) || null : null;
  }
  function startGame() {
    const s = App.setup, st = App.settings;
    const errs = [];
    if (!s.opp.trim()) errs.push('Enter the opponent name.');
    ['sjf', 'opp'].forEach(k => {
      const nums = s.lu[k].map(r => String(r.num).trim());
      const nm = k === 'sjf' ? st.team : (s.opp || 'Opponent');
      const dup = nums.filter((n, i) => n && nums.indexOf(n) !== i);
      if (dup.length) errs.push(nm + ': #' + dup[0] + ' is in the lineup twice.');
    });
    if (errs.length) { toast(errs[0]); return; }
    const sjfSide = s.sjfSide, oppSide = E.other(sjfSide);
    const mk = (k, side) => {
      const pref = side === 'home' ? 'h' : 'a'; const players = {};
      const add = (num, o) => {
        const id = pref + String(num).trim(); const base = findPlayer(k, num) || {};
        players[id] = Object.assign({ id, num: String(num).trim(), name: '', bats: 'R', throws: 'R' }, players[id] || {},
          { name: o.name || base.name || (players[id] && players[id].name) || '', bats: o.bats || base.bats || 'R', throws: o.throws || base.throws || (players[id] && players[id].throws) || 'R', ot: base.ot || '', note: base.note || '' });
        return id;
      };
      // blank spots stay unknown (null) and get filled in as each hitter comes up
      const lineup = (k === 'sjf' && s.mode === 'call') ? Array(9).fill(null) : s.lu[k].map(r => (String(r.num).trim() ? add(r.num, { name: r.name.trim(), bats: r.bats }) : null));
      let pid = '?' + pref; // unknown starting pitcher until someone enters him
      if (String(s.p[k].num).trim()) {
        pid = pref + String(s.p[k].num).trim();
        const pBase = players[pid] ? { name: s.p[k].name.trim() || players[pid].name, bats: players[pid].bats } : { name: s.p[k].name.trim() };
        add(s.p[k].num, Object.assign(pBase, { throws: s.p[k].throws }));
      }
      return { name: k === 'sjf' ? st.team : s.opp.trim(), players, lineup, pitcher: pid };
    };
    const sides = {}; sides[sjfSide] = mk('sjf', sjfSide); sides[oppSide] = mk('opp', oppSide);
    const g = E.newGame({ date: s.date, innings: s.innings, sjfSide, home: sides.home, away: sides.away });
    g.mode = s.mode === 'call' ? 'call' : 'full';
    Store.saveOpp(s.opp, Object.values(sides[oppSide].players).map(p => ({ num: p.num, name: p.name, bats: p.bats, throws: p.throws })));
    Store.save(g);
    openGame(g.id);
  }

  // ================================================================== GAME
  function openGame(id) {
    const g = Store.load(id);
    if (!g) { toast('Could not open that game'); return; }
    App.game = g; App.S = E.replay(g); App.redo = []; App.banner = null; App.tab = 'chart';
    App.pend = { type: null, velo: null, loc: null };
    App.sheetSide = g.mode === 'call' ? g.sjfSide : null; App.statsSide = g.sjfSide; App.sheetPage = 0; App.ourRuns = 0;
    go('game');
    wakeLock();
  }
  let lastCommit = 0;
  function commit(ev, opts) {
    // ignore an accidental double-tap on a result button (with "require pitch type" on, the type reset already blocks it)
    if ((ev.t === 'pitch' && !App.settings.requireType) || ev.t === 'auto') { const now = Date.now(); if (now - lastCommit < 300) return; lastCommit = now; }
    const g = App.game, before = App.S;
    ev.ts = Date.now();
    g.events.push(ev);
    App.redo = [];
    afterChange(before, opts);
  }
  function afterChange(before, opts) {
    const g = App.game;
    App.S = E.replay(g);
    g.status = App.S.final ? 'final' : 'live';
    if (App.S.final && before && !before.final) {
      const os = E.other(g.sjfSide);
      Store.saveOpp(g[os].name, Object.values(g[os].players).map(p => ({ num: p.num, name: p.name, bats: p.bats, throws: p.throws })));
    }
    if (!Store.save(g)) toast('⚠ Could not save — storage full. Export a backup now.');
    App.pend = { type: null, velo: null, loc: null };
    const S = App.S;
    App.banner = null;
    if (before && (before.half !== S.half || before.inning !== S.inning)) {
      const fs = E.fieldingSide(S), bs = E.battingSide(S);
      App.banner = g.mode === 'call'
        ? { cls: '', html: 'Side retired. ' + (S.half === 'top' ? 'Top ' : 'Bottom ') + S.inning + ': <b>' + esc(teamName(bs)) + '</b> batting.' }
        : { cls: '', html: 'Side retired. ' + (S.half === 'top' ? 'Top ' : 'Bottom ') + S.inning + ': <b>' + esc(teamName(bs)) + '</b> batting, <b>' + esc(teamName(fs)) + '</b> pitching (' + esc(pName(fs, S.pitcher[fs])) + ', ' + (S.pitchCount[S.pitcher[fs]] || 0) + ' P)' };
      if (S.inning > g.innings && S.half === 'top' && S.score.home !== S.score.away) App.banner.html += ' &nbsp;<button class="btn small gold" data-act="endGame">End game</button>';
      if (S.inning >= g.innings && S.half === 'bottom' && S.score.home > S.score.away) App.banner.html += ' &nbsp;Home team leads — <button class="btn small gold" data-act="endGame">End game</button>';
    }
    const last = g.events[g.events.length - 1];
    if (last && last.t === 'pitch' && S.lastPA && S.lastPA.pitches.length && S.lastPA.pitches[S.lastPA.pitches.length - 1].evIdx === g.events.length - 1) {
      const pa = S.lastPA, rec = pa.pitches[pa.pitches.length - 1];
      if (pa.result.code === 'K' && !last.d3 && (!rec.bases[0] || rec.outs === 2)) {
        App.banner = { cls: 'red', html: 'Strikeout. If the catcher didn’t hold strike three and the batter reached: <button class="btn small gold" data-act="d3">Dropped 3rd — batter reached</button>' + (App.banner ? '<br>' + App.banner.html : '') };
      }
      if (!opts || !opts.quiet) toast(pName(pa.side, pa.batter) + ': ' + paText(pa));
    }
    if (before && !S.final && S.half === 'bottom' && S.inning >= g.innings && S.score.home > S.score.away && before.score.home <= before.score.away && before.half === 'bottom') {
      App.banner = { cls: '', html: esc(g.home.name) + ' takes the lead in the bottom of the ' + S.inning + (S.inning === 1 ? 'st' : S.inning === 2 ? 'nd' : S.inning === 3 ? 'rd' : 'th') + ' — walk-off? <button class="btn small gold" data-act="endGame">End game</button>' };
    }
    render();
  }
  function paText(pa) {
    if (!pa.result) return pa.endedInning ? 'inning ended' : 'at bat';
    if (pa.result.code === 'K') return (pa.result.looking ? 'Strikeout looking' : 'Strikeout swinging') + (pa.result.d3 ? ' (reached, ' + pa.result.d3 + ')' : '');
    return pa.result.notation || pa.result.code;
  }
  function undo() {
    const g = App.game; if (!g.events.length) { toast('Nothing to undo'); return; }
    const ev = g.events.pop(); App.redo.push(ev);
    afterChange(null, { quiet: true });
    toast('Undid: ' + describe(ev), { label: 'Redo', fn: redo });
  }
  function redo() {
    const ev = App.redo.pop(); if (!ev) return;
    const before = App.S; App.game.events.push(ev); const keep = App.redo.slice(); afterChange(before); App.redo = keep;
  }
  function describe(ev) {
    switch (ev.t) {
      case 'pitch': return TN[ev.type || 0] + ' ' + E.RESULTS[ev.res] + (ev.ip ? ' (' + ev.ip.notation + ')' : '');
      case 'run': return ev.kind;
      case 'pchange': return 'pitching change';
      case 'sub': return 'substitution';
      case 'fix': return 'correction';
      case 'auto': return 'automatic ' + (ev.res === 'B' ? 'ball' : 'strike');
      case 'ibb': return 'intentional walk';
      case 'end': return 'end of game';
      case 'half': return 'end of half-inning';
      default: return ev.t;
    }
  }

  function gameHTML() {
    const g = App.game, S = App.S;
    const outs = [0, 1].map(i => '<i class="' + (S.outs > i ? 'on' : '') + '"></i>').join('');
    const tabs = [['chart', 'Chart'], ['sheet', 'Sheet'], ['stats', 'Stats'], ['lineups', 'Lineups'], ['export', 'Export']];
    let html = '<div class="gbar"><button class="btn" data-act="goHome">‹<span class="lbl"> Games</span></button>' +
      '<div class="sit"><span class="inn">' + (S.final ? 'FINAL' : (S.half === 'top' ? '▲ ' : '▼ ') + S.inning) + '</span>' +
      '<span class="outs">' + outs + '</span><span class="cnt">' + S.balls + '-' + S.strikes + '</span></div>' +
      '<div class="score">' + esc(g.away.name) + ' ' + S.score.away + ' · ' + esc(g.home.name) + ' ' + S.score.home + '</div>' +
      '<div class="tabs">' + tabs.map(([k, l]) => '<button data-act="tab" data-v="' + k + '" class="' + (App.tab === k ? 'on' : '') + '">' + l + '</button>').join('') + '</div>' +
      '<button class="btn" data-act="undo">↶ Undo</button></div>';
    if (App.banner && App.tab === 'chart') html += '<div class="banner ' + App.banner.cls + '">' + App.banner.html + '</div>';
    if (S.warnings.length && App.tab === 'chart') html += '<div class="banner red">Check: ' + esc(S.warnings[S.warnings.length - 1]) + ' — use Undo or Fix.</div>';
    if (App.tab === 'chart') html += (g.mode === 'call' ? callChartHTML() : chartTabHTML());
    else if (App.tab === 'sheet') html += sheetTabHTML();
    else if (App.tab === 'stats') html += statsTabHTML();
    else if (App.tab === 'lineups') html += lineupsTabHTML();
    else if (App.tab === 'export') html += exportTabHTML();
    return html;
  }
  function afterGame() { if (App.tab === 'sheet') drawSheet(); }

  // ------------------------------------------------------------------ chart tab
  function curBatter() {
    const S = App.S, g = App.game, bs = E.battingSide(S), fs = E.fieldingSide(S);
    if (S.cur) return { side: bs, pid: S.cur.batter, slot: S.cur.slot, col: S.cur.col, hand: S.cur.hand };
    const slot = S.nextSlot[bs], pid = S.lineup[bs][slot];
    const col = S.pas.filter(p => p.side === bs && p.slot === slot).length;
    return { side: bs, pid, slot, col, hand: S.pendingHand || E.handFor(g, bs, pid, S.pitcher[fs]) };
  }
  function veloCenter(type) {
    const S = App.S, fs = E.fieldingSide(S), pid = S.pitcher[fs];
    const v = S.allPitches.filter(p => p.pitcher === pid && p.type === type && p.velo).map(p => +p.velo).slice(-8);
    if (v.length) return Math.round(v.reduce((a, b) => a + b, 0) / v.length);
    return +(App.settings.veloDefaults[type] || 80);
  }
  function chartTabHTML() {
    const g = App.game, S = App.S, st = App.settings, P = App.pend;
    const fs = E.fieldingSide(S), b = curBatter();
    const pid = S.pitcher[fs], pp = pl(fs, pid);
    const innP = S.allPitches.filter(p => p.pitcher === pid && p.inning === S.inning && p.half === S.half).length;
    const done = S.pas.filter(p => p.side === b.side && p.slot === b.slot && p.complete).map(p => paText(p)).join(', ');
    const bp = pl(b.side, b.pid);
    const otLab = pp.ot ? pp.ot : 'OT';
    let h = '<div class="chart"><section>';
    h += '<div class="matchup">' +
      (unknown(pid) ? '<button class="mcard" data-act="fillPitcher" data-side="' + fs + '" style="text-align:left;background:#fff7e0;border:2px solid var(--gold)"><div class="lab">Pitching · ' + esc(teamName(fs)) + '</div><div class="who">Who’s pitching? Tap to enter #</div><div class="sub">' + (S.pitchCount[pid] || 0) + ' pitches so far — they’ll be credited to him</div></button>' : '<div class="mcard"><div class="lab">Pitching · ' + esc(teamName(fs)) + '</div><div class="who">' + esc(pName(fs, pid)) + '</div>' +
      '<div class="sub">' + (pp.throws === 'L' ? 'LHP' : 'RHP') + ' · <b>' + (S.pitchCount[pid] || 0) + '</b> pitches · ' + innP + ' this inn.</div>' +
      '<div class="act"><button class="btn" data-act="pchange">Pitching change</button></div></div>') +
      (unknown(b.pid) ? '<button class="mcard" data-act="fillBatter" data-side="' + b.side + '" data-slot="' + b.slot + '" style="text-align:left;background:#fff7e0;border:2px solid var(--gold)"><div class="lab">Batting · ' + esc(teamName(b.side)) + ' · #' + (b.slot + 1) + ' hitter</div><div class="who">Who’s up? Tap to enter #</div><div class="sub">You can chart pitches first and enter him any time</div></button>' :
      '<div class="mcard"><div class="lab">Batting · ' + esc(teamName(b.side)) + ' · #' + (b.slot + 1) + ' hitter · PA ' + (b.col + 1) + '</div><div class="who">' + esc(pName(b.side, b.pid)) + '</div>' +
      '<div class="sub"><span class="hand">' + (b.hand === 'L' ? 'LHH' : 'RHH') + '</span>' + (bp.bats === 'S' ? ' switch' : '') + (done ? ' · ' + esc(done) : '') + '</div>' +
      '<div class="act"><button class="btn" data-act="flipHand">Bats ' + (b.hand === 'L' ? 'R' : 'L') + '?</button><button class="btn" data-act="sub">Sub / PH / PR</button></div></div>') + '</div>';
    h += '<div class="padwrap"><div class="padhint">Tap location · catcher’s view</div>' +
      (P.loc ? '<button class="btn small padclear" data-act="clearLoc">Clear spot</button>' : '') + padSVG(b.hand, S.cur ? S.cur.pitches : [], P.loc, true) + '</div>';
    // sequence chips
    h += '<div class="seq">';
    if (S.cur && (S.cur.pitches.length || S.cur.autos.length || S.cur.events.length)) {
      S.cur.pitches.forEach(p => {
        h += '<button class="chip ' + (p.strike ? 's' : '') + '" data-act="editPitch" data-ev="' + p.evIdx + '"><span class="n">' + p.n + '</span><span style="color:' + TCOL[p.type] + '">' + TN[p.type] + '</span>' + (p.velo ? ' ' + p.velo : '') + ' · ' + shortRes(p.res) + '</button>';
      });
      S.cur.autos.forEach(a => { h += '<span class="chip">Auto ' + (a.res === 'B' ? 'ball' : 'strike') + '</span>'; });
      S.cur.events.forEach(ev => { h += '<span class="chip">' + esc(ev.desc) + '</span>'; });
    } else if (S.lastPA) {
      const pa = S.lastPA;
      h += '<button class="chip lastpa" data-act="openPA" data-id="' + pa.id + '">Last: ' + esc(pName(pa.side, pa.batter)) + ' — ' + esc(paText(pa)) + ' (' + pa.pitches.length + ' P) · tap to review</button>';
    } else h += '<span class="muted">Pitches in this at-bat show here. Tap one to fix it.</span>';
    h += '</div></section>';

    // controls
    h += '<section class="ctrl"><div class="types" id="types">' + [1, 2, 3, 4, 5, 0].map(t =>
      '<button class="tbtn ' + (P.type === t ? 'on' : '') + '" style="--c:' + TCOL[t] + '" data-act="ptype" data-v="' + t + '">' + (t ? t : '?') + '<small>' + (t === 5 ? esc(otLab) : t ? TN[t] : 'missed') + '</small></button>').join('') + '</div>';
    if (st.velo) {
      const c = veloCenter(P.type || 1);
      const qs = [-3, -2, -1, 0, 1, 2, 3].map(d => c + d);
      const custom = P.velo && !qs.includes(P.velo);
      h += '<div class="velo"><div class="vlab">Velo</div>' + qs.map(v => '<button class="vq ' + (P.velo === v ? 'on' : '') + '" data-act="velo" data-v="' + v + '">' + v + '</button>').join('') +
        '<button class="vq ' + (custom ? 'on' : '') + '" data-act="veloPad">' + (custom ? P.velo : '#') + '</button></div>';
    }
    h += '<div class="results">' +
      '<button class="rbtn ball" data-act="res" data-v="B">Ball</button>' +
      '<button class="rbtn cs" data-act="res" data-v="CS">Called<small>strike</small></button>' +
      '<button class="rbtn sw" data-act="res" data-v="SW">Swing &amp; miss</button>' +
      '<button class="rbtn foul" data-act="res" data-v="F">Foul</button>' +
      '<button class="rbtn ip" data-act="res" data-v="IP">In play</button>' +
      '<button class="rbtn hbp" data-act="res" data-v="HBP">HBP</button></div>';
    h += '<div class="results2">' +
      '<button class="btn" data-act="res" data-v="FT">Foul tip</button>' +
      '<button class="btn" data-act="res" data-v="FB">Foul bunt</button>' +
      '<button class="btn" data-act="res" data-v="MB">Missed bunt</button>' +
      '<button class="btn" data-act="auto" data-v="B">Auto ball</button>' +
      '<button class="btn" data-act="auto" data-v="S">Auto strike</button>' +
      '<button class="btn" data-act="ibb">IBB</button></div>';
    h += '<div class="bottomrow"><div class="diamond" data-act="runner">' + diamondSVG() + '</div><div class="evbtns">' +
      '<button class="btn" data-act="runner">Runners: SB · WP · PB · BK · PO…</button>' +
      '<button class="btn" data-act="fix">Fix outs / count / bases</button>' +
      '<button class="btn" data-act="note">Add note</button>' +
      '<button class="btn" data-act="tab" data-v="sheet">View sheet</button></div></div>';
    h += '</section></div>';
    return h;
  }
  // ------------------------------------------------------------------ pitch-calling chart
  function callChartHTML() {
    const g = App.game, S = App.S, P = App.pend;
    const bs = E.battingSide(S), fs = E.fieldingSide(S), all = !!App.scoutAll;
    const opp = E.other(g.sjfSide);
    if (bs === g.sjfSide && !S.final) {
      // our half-inning: nothing to chart; get ready for who's due up
      const due = [0, 1, 2].map(i => (S.nextSlot[opp] + i) % 9);
      return '<div class="chart callgrid"><section class="scoutcol"><div class="card">' +
        '<div class="lab muted" style="font-weight:800;text-transform:uppercase;font-size:12px;letter-spacing:.06em">' + (S.half === 'top' ? 'Top ' : 'Bottom ') + S.inning + '</div>' +
        '<h2 style="margin:4px 0 6px">' + esc(g[g.sjfSide].name) + ' batting — nothing to chart</h2>' +
        '<p class="muted">When they come back up, tap the button. Add our runs this half if you want the score right.</p>' +
        '<div class="row"><span style="font-weight:800">Our runs this half</span><button class="btn small" data-act="ourRuns" data-d="-1">−</button><b style="font-size:26px;min-width:34px;text-align:center">' + (App.ourRuns || 0) + '</b><button class="btn small" data-act="ourRuns" data-d="1">+</button></div>' +
        '<div class="row" style="margin-top:14px"><button class="btn primary" data-act="theirHalf" style="min-height:70px;font-size:20px;flex:1">' + esc(g[opp].name) + ' hitting — ' + (S.half === 'top' ? 'Bottom ' + S.inning : 'Top ' + (S.inning + 1)) + ' ›</button></div>' +
        (S.inning >= g.innings && S.half === 'bottom' ? '<div class="row" style="margin-top:10px"><button class="btn gold" data-act="endGame">End game</button></div>' : '') +
        '</div></section><section class="scoutcol">' +
        due.map((slot, i) => Scout.deckHTML(g, S, opp, S.lineup[opp][slot], slot, all, i === 0 ? 'Leading off' : i === 1 ? 'Then' : 'Then')).join('') +
        '<div class="row" style="margin-top:8px"><div class="seg"><button data-act="scoutAll" data-v="0" class="' + (all ? '' : 'on') + '">Today</button><button data-act="scoutAll" data-v="1" class="' + (all ? 'on' : '') + '">All games</button></div></div>' +
        '</section></div>';
    }
    const b = curBatter();
    const pid = S.pitcher[fs], pp = pl(fs, pid);
    const otLab = pp.ot ? pp.ot : 'OT';
    const deckSlot = (b.slot + 1) % 9;
    let h = '<div class="chart callgrid"><section class="scoutcol">';
    h += Scout.panelHTML(g, S, b.side, b.pid, b.slot, { all, hand: b.hand });
    h += Scout.deckHTML(g, S, b.side, S.lineup[b.side][deckSlot], deckSlot, all, 'On deck');
    h += '</section><section class="ctrl">';
    // compact matchup row
    h += '<div class="matchup">' +
      (unknown(pid) ? '<button class="mcard" data-act="fillPitcher" data-side="' + fs + '" style="text-align:left;background:#fff7e0;border:2px solid var(--gold)"><div class="lab">Pitching</div><div class="who" style="font-size:17px">Who’s pitching? Tap to enter #</div></button>' :
        '<div class="mcard"><div class="lab">Pitching</div><div class="who" style="font-size:18px">' + esc(pName(fs, pid)) + '</div><div class="sub"><b>' + (S.pitchCount[pid] || 0) + '</b> pitches</div><div class="act"><button class="btn" data-act="pchange">Change</button></div></div>') +
      (unknown(b.pid) ? '<button class="mcard" data-act="fillBatter" data-side="' + b.side + '" data-slot="' + b.slot + '" style="text-align:left;background:#fff7e0;border:2px solid var(--gold)"><div class="lab">Batting ' + (b.slot + 1) + E.ordinal(b.slot + 1) + '</div><div class="who" style="font-size:17px">Who’s up? Tap to enter #</div><div class="sub">Chart pitches first if you need to</div></button>' :
        '<div class="mcard"><div class="lab">Batting ' + (b.slot + 1) + E.ordinal(b.slot + 1) + ' · PA ' + (b.col + 1) + '</div><div class="who" style="font-size:18px">' + esc(pName(b.side, b.pid)) + ' <span class="hand">' + (b.hand === 'L' ? 'LHH' : 'RHH') + '</span></div>' +
        '<div class="act"><button class="btn" data-act="flipHand">Bats ' + (b.hand === 'L' ? 'R' : 'L') + '?</button><button class="btn" data-act="sub">Sub</button></div></div>') + '</div>';
    // this at-bat so far
    h += '<div class="seq" style="margin-top:0">';
    if (S.cur && (S.cur.pitches.length || S.cur.autos.length || S.cur.events.length)) {
      S.cur.pitches.forEach(p => { h += '<button class="chip ' + (p.strike ? 's' : '') + '" data-act="editPitch" data-ev="' + p.evIdx + '"><span class="n">' + p.b + '-' + p.s + '</span><span style="color:' + TCOL[p.type] + '">' + TN[p.type] + '</span> · ' + shortRes(p.res) + (p.chase ? ' · <b style="color:var(--red)">chase</b>' : '') + '</button>'; });
      S.cur.autos.forEach(a => { h += '<span class="chip">Auto ' + (a.res === 'B' ? 'ball' : 'strike') + '</span>'; });
      S.cur.events.forEach(ev => { h += '<span class="chip">' + esc(ev.desc) + '</span>'; });
      h += '<span class="chip" style="border-color:var(--ink)"><b>Count ' + S.balls + '-' + S.strikes + '</b></span>';
    } else if (S.lastPA) {
      const pa = S.lastPA;
      h += '<button class="chip lastpa" data-act="openPA" data-id="' + pa.id + '">Last: ' + esc(pName(pa.side, pa.batter)) + ' — ' + esc(paText(pa)) + ' · tap to review</button>';
    } else h += '<span class="muted">This at-bat’s pitches show here. Tap one to fix it.</span>';
    h += '</div>';
    h += '<div class="types" id="types">' + [1, 2, 3, 4, 5, 0].map(t =>
      '<button class="tbtn ' + (P.type === t ? 'on' : '') + '" style="--c:' + TCOL[t] + '" data-act="ptype" data-v="' + t + '">' + (t ? t : '?') + '<small>' + (t === 5 ? esc(otLab) : t ? TN[t] : 'missed') + '</small></button>').join('') + '</div>';
    h += '<button class="ooz ' + (P.ooz ? 'on' : '') + '" data-act="oozToggle">' + (P.ooz ? '✓ OUT OF ZONE — this swing is a chase' : 'Out of zone?  <small>tap before Swing &amp; miss / Foul / In play if he chased</small>') + '</button>';
    h += '<div class="results">' +
      '<button class="rbtn ball" data-act="res" data-v="B">Ball</button>' +
      '<button class="rbtn cs" data-act="res" data-v="CS">Called<small>strike</small></button>' +
      '<button class="rbtn sw" data-act="res" data-v="SW">Swing &amp; miss</button>' +
      '<button class="rbtn foul" data-act="res" data-v="F">Foul</button>' +
      '<button class="rbtn ip" data-act="res" data-v="IP">In play</button>' +
      '<button class="rbtn hbp" data-act="res" data-v="HBP">HBP</button></div>';
    h += '<div class="results2">' +
      '<button class="btn" data-act="res" data-v="FT">Foul tip</button>' +
      '<button class="btn" data-act="res" data-v="FB">Foul bunt</button>' +
      '<button class="btn" data-act="res" data-v="MB">Missed bunt</button>' +
      '<button class="btn" data-act="auto" data-v="B">Auto ball</button>' +
      '<button class="btn" data-act="auto" data-v="S">Auto strike</button>' +
      '<button class="btn" data-act="ibb">IBB</button></div>';
    h += '<div class="bottomrow"><div class="diamond" data-act="runner">' + diamondSVG() + '</div><div class="evbtns">' +
      '<button class="btn" data-act="runner">Runners: SB · WP · PB · BK · PO…</button>' +
      '<button class="btn" data-act="fix">Fix outs / count / bases</button>' +
      '<button class="btn" data-act="note">Add note</button>' +
      '<button class="btn" data-act="tab" data-v="sheet">View sheet</button></div></div>';
    return h + '</section></div>';
  }
  function shortRes(r) { return { B: 'Ball', CS: 'Called', SW: 'Whiff', F: 'Foul', FT: 'Foul tip', FB: 'Foul bunt', MB: 'Miss bunt', IP: 'In play', HBP: 'HBP' }[r] || r; }

  // strike zone pad (catcher's view). Model coords: x,y in zone half-widths/heights; SVG Y = -y*1.3
  const YS = 1.3;
  function padSVG(hand, pitches, pend, main, w) {
    const vb = '-2.25 -3.05 4.5 6.55';
    let s = '<svg ' + (main ? 'id="pad"' : 'class="minipad"') + ' viewBox="' + vb + '" xmlns="http://www.w3.org/2000/svg"' + (w ? ' style="width:' + w + 'px"' : '') + '>';
    s += '<rect x="-2.25" y="-3.05" width="4.5" height="6.55" fill="#fbfbfc"/>';
    // batter's box side
    const bx = hand === 'L' ? 1.55 : -2.2;
    s += '<rect x="' + bx + '" y="-2.6" width="0.65" height="5.2" rx="0.12" fill="' + (hand === 'L' ? '#e8eefc' : '#fde9ec') + '"/>';
    s += '<text x="' + (bx + 0.325) + '" y="0" font-size="0.32" font-weight="800" text-anchor="middle" fill="#333" transform="rotate(-90 ' + (bx + 0.325) + ' 0)">' + (hand === 'L' ? 'LHH' : 'RHH') + '</text>';
    // shadow zone + zone
    s += '<rect x="-1.15" y="' + (-1.15 * YS) + '" width="2.3" height="' + (2.3 * YS) + '" fill="none" stroke="#c9ccd2" stroke-width="0.02" stroke-dasharray="0.06 0.05"/>';
    s += '<rect x="-1" y="' + (-YS) + '" width="2" height="' + (2 * YS) + '" fill="#fff" stroke="#15171a" stroke-width="0.045"/>';
    [-1 / 3, 1 / 3].forEach(t => {
      s += '<line x1="' + t + '" y1="' + (-YS) + '" x2="' + t + '" y2="' + YS + '" stroke="#c9ccd2" stroke-width="0.02"/>';
      s += '<line x1="-1" y1="' + (t * YS) + '" x2="1" y2="' + (t * YS) + '" stroke="#c9ccd2" stroke-width="0.02"/>';
    });
    // plate
    s += '<polygon points="-0.85,2.35 0.85,2.35 0.85,2.55 0,2.85 -0.85,2.55" fill="#fff" stroke="#15171a" stroke-width="0.035"/>';
    s += '<text x="0" y="3.25" font-size="0.22" text-anchor="middle" fill="#888">' + (hand === 'L' ? 'away ←   → in' : 'in ←   → away') + '</text>';
    (pitches || []).forEach(p => {
      if (!p.loc) return;
      const X = p.loc.x, Y = -p.loc.y * YS;
      s += '<circle cx="' + X + '" cy="' + Y + '" r="0.15" fill="' + (p.strike ? THEX[p.type] : '#fff') + '" stroke="' + THEX[p.type] + '" stroke-width="0.04"/>';
      s += '<text x="' + X + '" y="' + (Y + 0.065) + '" font-size="0.18" font-weight="800" text-anchor="middle" fill="' + (p.strike ? '#fff' : THEX[p.type]) + '">' + p.n + '</text>';
    });
    if (pend) {
      const X = pend.x, Y = -pend.y * YS;
      s += '<circle cx="' + X + '" cy="' + Y + '" r="0.19" fill="#F1BE48" stroke="#15171a" stroke-width="0.05"/>';
      s += '<line x1="' + (X - 0.3) + '" y1="' + Y + '" x2="' + (X + 0.3) + '" y2="' + Y + '" stroke="#15171a" stroke-width="0.02"/>';
      s += '<line x1="' + X + '" y1="' + (Y - 0.3) + '" x2="' + X + '" y2="' + (Y + 0.3) + '" stroke="#15171a" stroke-width="0.02"/>';
    }
    return s + '</svg>';
  }
  function padPoint(svg, ev) {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    const x = Math.max(-2.1, Math.min(2.1, p.x)), y = Math.max(-2.3, Math.min(2.3, -p.y / YS));
    return { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 };
  }

  function diamondSVG(bases, labels) {
    const S = App.S, bs = E.battingSide(S);
    bases = bases || S.bases;
    const pos = [[78, 50], [50, 22], [22, 50]];
    let s = '<svg viewBox="0 0 100 92"><polygon points="50,82 78,50 50,22 22,50" fill="none" stroke="#c9ccd2" stroke-width="2"/>';
    s += '<polygon points="46,80 54,80 54,84 50,87 46,84" fill="#15171a"/>';
    pos.forEach(([x, y], i) => {
      const r = bases[i];
      s += '<rect x="' + (x - 11) + '" y="' + (y - 11) + '" width="22" height="22" transform="rotate(45 ' + x + ' ' + y + ')" fill="' + (r ? '#F1BE48' : '#fff') + '" stroke="#15171a" stroke-width="2"/>';
      if (r) s += '<text x="' + x + '" y="' + (y + 5) + '" font-size="13" font-weight="800" text-anchor="middle">' + esc(labels ? labels[i] : (r.pid ? pl(bs, r.pid).num : 'R')) + '</text>';
    });
    return s + '</svg>';
  }

  // ------------------------------------------------------------------ pitch entry
  function needType() {
    const el = $('types'); if (el) { el.querySelectorAll('.tbtn').forEach(b => { b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash'); }); }
    toast('Pick the pitch type first (use ? if you missed it)');
  }
  function guardFinal() { if (App.S.final) { toast('Game is final. Reopen it from the Export tab to keep charting.'); return true; } return false; }
  function onResult(res) {
    if (guardFinal()) return;
    const P = App.pend;
    if (App.settings.requireType && P.type == null) { needType(); return; }
    if (res === 'IP') { openInPlay(); return; }
    const ev = { t: 'pitch', type: P.type || 0, velo: P.velo || null, loc: P.loc || null, res };
    if (P.ooz && E.CHASE_RES.includes(res)) ev.ooz = true;
    commit(ev);
  }

  // ------------------------------------------------------------------ movers (runner destination picker)
  function moversHTML(bases, moves, hasBatter, batterLabel, runnerLabel) {
    const rows = [];
    const opts = (from) => [[0, 'Out'], [1, '1st'], [2, '2nd'], [3, '3rd'], [4, 'Scores']].map(([v, l]) => [v, l, v !== 0 && from !== 'B' && v < from]);
    if (hasBatter) {
      const m = moves.find(x => x.from === 'B');
      rows.push('<div class="mover"><div class="who">Batter ' + esc(batterLabel) + '</div>' + seg('mv', opts('B'), m ? m.to : '', 'data-from="B"') + '</div>');
    }
    [3, 2, 1].forEach(b => {
      if (!bases[b - 1]) return;
      const m = moves.find(x => x.from === b);
      rows.push('<div class="mover"><div class="who">On ' + E.baseName(b) + ': ' + esc(runnerLabel(b)) + '</div>' + seg('mv', opts(b), m ? m.to : b, 'data-from="' + b + '"') + '</div>');
    });
    return rows.join('') || '<div class="muted">No runners on base.</div>';
  }
  function setMove(moves, from, to) {
    from = from === 'B' ? 'B' : +from;
    const m = moves.find(x => x.from === from);
    if (m) m.to = +to; else moves.push({ from, to: +to });
  }
  function runnerLabelFn(bases, side) { return b => { const r = bases[b - 1]; return r && r.pid ? pName(side, r.pid) : 'runner'; }; }
  function outsOnMoves(moves) { return moves.filter(m => m.to === 0).length; }

  // ------------------------------------------------------------------ in-play dialog
  const IP_KINDS = {
    hits: [['1B', 'Single'], ['2B', 'Double'], ['3B', 'Triple'], ['HR', 'Home run']],
    outs: [['GO', 'Ground out'], ['FO', 'Fly out'], ['LO', 'Line out'], ['PO', 'Pop out'], ['SAC', 'Sac bunt'], ['SF', 'Sac fly'], ['DP', 'Double play'], ['TP', 'Triple play']],
    reach: [['E', 'Error'], ['FC', 'Fielder’s choice'], ['CI', 'Catcher’s int.']]
  };
  const KIND_CODE = { GO: 'OUT', FO: 'OUT', LO: 'OUT', PO: 'OUT', CI: 'CI' };
  const KIND_CLS = { GO: 'OUT', FO: 'OUT', LO: 'OUT', PO: 'OUT', CI: 'FORCED' };
  const KIND_BB = { GO: 'GB', FO: 'FB', LO: 'LD', PO: 'PU', SAC: 'BU', SF: 'FB', DP: 'GB', TP: 'LD' };
  function buildNotation(kind, f) {
    const seq = f.join('-');
    switch (kind) {
      case '1B': case '2B': case '3B': case 'HR': return kind + (f.length ? ' (' + f[0] + ')' : '');
      case 'GO': return f.length === 1 ? f[0] + 'U' : (seq || 'GO');
      case 'FO': return 'F' + (f[0] || '');
      case 'LO': return 'L' + (f[0] || '');
      case 'PO': return 'P' + (f[0] || '');
      case 'SAC': return 'SAC' + (seq ? ' ' + seq : '');
      case 'SF': return 'SF' + (f[0] || '');
      case 'DP': return (seq ? seq + ' ' : '') + 'DP';
      case 'TP': return (seq ? seq + ' ' : '') + 'TP';
      case 'E': return 'E' + (f[0] || '');
      case 'FC': return 'FC' + (seq ? ' ' + seq : '');
      case 'CI': return 'CI';
      default: return '?';
    }
  }
  // edit: {evIdx} to re-edit a saved play
  function openInPlay(edit) {
    const S = App.S, g = App.game;
    let bases, outs, side, batterLabel, ev = null;
    if (edit) {
      ev = g.events[edit.evIdx];
      const rec = S.allPitches.find(p => p.evIdx === edit.evIdx);
      bases = rec.bases.map(Boolean); outs = rec.outs; side = rec.side; batterLabel = pName(side, rec.batter);
    } else {
      bases = S.bases; outs = S.outs; side = E.battingSide(S); batterLabel = pName(side, curBatter().pid);
    }
    const lab = edit ? (b => 'runner') : runnerLabelFn(S.bases, side);
    const ip = ev && ev.ip ? ev.ip : null;
    const M = {
      kind: ip ? ip.kind : null, bb: ip ? ip.bb : null, f: ip ? (ip.fielders || []).slice() : [], nota: ip ? ip.notation : '', notaEdited: !!ip && ip.notation !== buildNotation(ip.kind, ip.fielders || []),
      errors: ip ? ip.errors || 0 : 0, spray: ip ? ip.spray : null, moves: ip ? JSON.parse(JSON.stringify(ip.moves || [])) : []
    };
    const setKind = k => {
      M.kind = k; M.bb = KIND_BB[k] || M.bb; if (k === 'E') M.errors = Math.max(1, M.errors);
      M.moves = E.defaultMoves(bases, KIND_CLS[k] || k);
      if (!M.notaEdited) M.nota = buildNotation(k, M.f);
    };
    const err = () => {
      if (!M.kind) return 'Pick what happened';
      const v = E.validateMoves(bases, M.moves, true); if (v) return v;
      if (!M.moves.find(m => m.from === 'B')) return 'Where did the batter end up?';
      if (outs + outsOnMoves(M.moves) > 3) return 'That’s more than 3 outs';
      return '';
    };
    openModal({
      title: edit ? 'Edit play' : 'Ball in play — ' + batterLabel,
      body: () => {
        let h = '<div class="grp-lab">Hits</div><div class="grid-btns">' + IP_KINDS.hits.map(([k, l]) => '<button class="btn ' + (M.kind === k ? 'on' : '') + '" data-act="ipKind" data-v="' + k + '">' + l + '</button>').join('') + '</div>' +
          '<div class="grp-lab">Outs</div><div class="grid-btns">' + IP_KINDS.outs.map(([k, l]) => '<button class="btn ' + (M.kind === k ? 'on' : '') + '" data-act="ipKind" data-v="' + k + '">' + l + '</button>').join('') + '</div>' +
          '<div class="grp-lab">Reached base</div><div class="grid-btns">' + IP_KINDS.reach.map(([k, l]) => '<button class="btn ' + (M.kind === k ? 'on' : '') + '" data-act="ipKind" data-v="' + k + '">' + l + '</button>').join('') + '</div>';
        h += '<div class="field-wrap" style="margin-top:12px"><div class="field"><div class="grp-lab">Fielders in order (tap) · spray (tap grass)</div>' + fieldSVG(M.f, M.spray) +
          '<div class="row" style="margin-top:6px"><button class="btn small" data-act="ipClearF">Clear fielders</button><button class="btn small" data-act="ipClearSpray">Clear spray</button></div></div><div>' +
          '<div class="grp-lab">Scoring</div><input class="txt" id="ipNota" value="' + esc(M.nota) + '" data-chg="ipNota" style="font-size:22px;font-weight:800">' +
          '<div class="grp-lab">Batted ball</div>' + seg('ipBB', [['GB', 'GB'], ['LD', 'LD'], ['FB', 'FB'], ['PU', 'PU'], ['BU', 'Bunt']], M.bb) +
          '<div class="grp-lab">Errors on play</div>' + seg('ipErr', [[0, '0'], [1, '1'], [2, '2'], [3, '3']], M.errors) + '</div></div>';
        h += '<div class="grp-lab">Runners — where did everyone end up? (' + outs + ' out' + (outs === 1 ? '' : 's') + ' before the play)</div>' +
          (M.kind ? moversHTML(bases, M.moves, true, batterLabel, lab) : '<div class="muted">Pick the result first.</div>');
        return h;
      },
      foot: () => { const e = err(); return '<div class="err grow">' + esc(e) + '</div><button class="btn primary" data-act="ipSave" ' + (e ? 'disabled' : '') + '>Save play</button>'; },
      acts: {
        ipKind: el => { setKind(el.dataset.v); renderModal(); },
        ipBB: el => { M.bb = el.dataset.v; renderModal(); },
        ipErr: el => { M.errors = +el.dataset.v; renderModal(); },
        ipClearF: () => { M.f = []; if (!M.notaEdited && M.kind) M.nota = buildNotation(M.kind, M.f); renderModal(); },
        ipClearSpray: () => { M.spray = null; renderModal(); },
        fielder: el => { M.f.push(+el.dataset.v); if (M.kind) { M.notaEdited = false; M.nota = buildNotation(M.kind, M.f); } renderModal(); },
        mv: el => { setMove(M.moves, el.parentNode.dataset.from, el.dataset.v); renderModal(); },
        ipSave: () => {
          if (err()) return;
          const data = { kind: M.kind, code: KIND_CODE[M.kind] || M.kind, cls: KIND_CLS[M.kind] || M.kind, notation: (M.nota || buildNotation(M.kind, M.f)).trim(), bb: M.bb, fielders: M.f, errors: M.errors, spray: M.spray, moves: M.moves };
          closeModal();
          if (edit) { ev.ip = data; afterChange(null, { quiet: true }); toast('Play updated'); }
          else { const P = App.pend; const ev = { t: 'pitch', type: P.type || 0, velo: P.velo || null, loc: P.loc || null, res: 'IP', ip: data }; if (P.ooz) ev.ooz = true; commit(ev); }
        }
      },
      chg: { ipNota: el => { M.nota = el.value; M.notaEdited = true; const f = $('modalSheet').querySelector('.mfoot'); if (f) f.innerHTML = App.modal.foot(); } },
      spray: (pt) => { M.spray = pt; renderModal(); }
    });
  }
  // Field drawn to scale: home at (70,104), K svg-units per foot, x = feet toward 1B side, y = feet toward CF
  const FK = 92 / 380, FHX = 70, FHY = 104;
  const fx = x => FHX + x * FK, fy = y => FHY - y * FK;
  const FPOS = { // normal depth, in feet from home plate
    1: [0, 60.5, 'P'], 2: [0, -12, 'C'], 3: [67.7, 86.7, '1B'], 4: [36.3, 145.5, '2B'], 5: [-67.7, 86.7, '3B'],
    6: [-36.3, 145.5, 'SS'], 7: [-136, 256, 'LF'], 8: [0, 315, 'CF'], 9: [136, 256, 'RF']
  };
  function fieldSVG(f, spray) {
    const pt = (x, y) => fx(x).toFixed(2) + ',' + fy(y).toFixed(2);
    let s = '<svg id="fieldsvg" viewBox="0 0 140 117">';
    // outfield fence: 330 down the lines, 400 to center
    const fence = []; for (let a = -45; a <= 45; a += 3) { const r = a * Math.PI / 180, d = 330 + 70 * Math.cos(2 * r); fence.push(pt(d * Math.sin(r), d * Math.cos(r))); }
    s += '<polygon points="' + pt(0, 0) + ' ' + fence.join(' ') + '" fill="#dcebd6" stroke="#7fa874" stroke-width="0.9"/>';
    const track = []; for (let a = -45; a <= 45; a += 3) { const r = a * Math.PI / 180, d = 330 + 70 * Math.cos(2 * r) - 14; track.push(pt(d * Math.sin(r), d * Math.cos(r))); }
    s += '<polyline points="' + track.join(' ') + '" fill="none" stroke="#c7b48f" stroke-width="2.6" opacity=".6"/>';
    // infield dirt: arc 95 ft from the mound between the foul lines
    const dirt = [pt(0, 0), pt(90.2, 90.2)]; for (let a = 18; a <= 162; a += 6) { const r = a * Math.PI / 180; dirt.push(pt(95 * Math.cos(r), 60.5 + 95 * Math.sin(r))); } dirt.push(pt(-90.2, 90.2));
    s += '<polygon points="' + dirt.join(' ') + '" fill="#e8d6b8" stroke="#c5ab84" stroke-width="0.5"/>';
    s += '<polygon points="' + [pt(0, 12), pt(52, 63.6), pt(0, 115), pt(-52, 63.6)].join(' ') + '" fill="#cfe3c7"/>';
    s += '<line x1="' + fx(0) + '" y1="' + fy(0) + '" x2="' + fx(233) + '" y2="' + fy(233) + '" stroke="#fff" stroke-width="0.6"/><line x1="' + fx(0) + '" y1="' + fy(0) + '" x2="' + fx(-233) + '" y2="' + fy(233) + '" stroke="#fff" stroke-width="0.6"/>';
    s += '<circle cx="' + fx(0) + '" cy="' + fy(60.5) + '" r="' + (9 * FK) + '" fill="#e8d6b8" stroke="#c5ab84" stroke-width="0.4"/>';
    [[63.6, 63.6], [0, 127.3], [-63.6, 63.6]].forEach(([x, y]) => { s += '<rect x="' + (fx(x) - 1.1) + '" y="' + (fy(y) - 1.1) + '" width="2.2" height="2.2" fill="#fff" stroke="#999" stroke-width="0.3" transform="rotate(45 ' + fx(x) + ' ' + fy(y) + ')"/>'; });
    s += '<polygon points="' + [fx(-1.2) + ',' + fy(0.6), fx(1.2) + ',' + fy(0.6), fx(1.2) + ',' + fy(-0.4), fx(0) + ',' + fy(-1.4), fx(-1.2) + ',' + fy(-0.4)].join(' ') + '" fill="#fff" stroke="#555" stroke-width="0.3"/>';
    if (spray && spray.xft != null) s += '<circle cx="' + fx(spray.xft) + '" cy="' + fy(spray.yft) + '" r="2.4" fill="#F1BE48" stroke="#15171a" stroke-width="0.6"/>';
    Object.entries(FPOS).forEach(([n, [x, y, lab]]) => {
      const on = f.indexOf(+n) >= 0, X = fx(x), Y = fy(y);
      s += '<g data-act="fielder" data-v="' + n + '"><circle cx="' + X + '" cy="' + Y + '" r="8.5" fill="transparent"/>' +
        '<circle cx="' + X + '" cy="' + Y + '" r="6" fill="' + (on ? '#9D2235' : '#fff') + '" stroke="#15171a" stroke-width="0.7"/>' +
        '<text x="' + X + '" y="' + (Y + 1.2) + '" font-size="6" font-weight="800" text-anchor="middle" fill="' + (on ? '#fff' : '#15171a') + '">' + n + '</text>' +
        '<text x="' + X + '" y="' + (Y + 4.3) + '" font-size="2.3" font-weight="700" text-anchor="middle" fill="' + (on ? '#fff' : '#555') + '">' + lab + '</text></g>';
    });
    if (f.length) s += '<text x="4" y="9" font-size="5" font-weight="800" fill="#15171a">' + f.join('-') + '</text>';
    return s + '</svg>';
  }

  // ------------------------------------------------------------------ runner events
  const RUN_KINDS = [['SB', 'Stolen base'], ['CS', 'Caught stealing'], ['WP', 'Wild pitch'], ['PB', 'Passed ball'], ['BK', 'Balk'],
    ['PO', 'Picked off'], ['POE', 'Pickoff error'], ['DI', 'Def. indifference'], ['ADV', 'Other advance'], ['OUT', 'Runner out (other)']];
  function openRunner() {
    if (guardFinal()) return;
    const S = App.S, side = E.battingSide(S);
    if (!S.bases.some(Boolean)) { toast('Nobody on base'); return; }
    const M = { kind: null, moves: [], err: 0 };
    const lab = runnerLabelFn(S.bases, side);
    const err = () => {
      if (!M.kind) return 'Pick what happened';
      const v = E.validateMoves(S.bases, M.moves, false); if (v) return v;
      if (!M.moves.some(m => m.to !== m.from)) return 'Nobody moved';
      return '';
    };
    openModal({
      title: 'Runner event',
      body: () => '<div class="grid-btns">' + RUN_KINDS.map(([k, l]) => '<button class="btn ' + (M.kind === k ? 'on' : '') + '" data-act="rk" data-v="' + k + '">' + l + '</button>').join('') + '</div>' +
        '<div class="grp-lab">Runners</div>' + (M.kind ? moversHTML(S.bases, M.moves, false, '', lab) : '<div class="muted">Pick the event.</div>') +
        (M.kind ? '<div class="grp-lab">Errors on play</div>' + seg('rErr', [[0, '0'], [1, '1'], [2, '2']], M.err) : '') +
        '<p class="muted">SB counts each runner who advanced. WP, PB and balk move every runner up one by default — change any that didn’t.</p>',
      foot: () => { const e = err(); return '<div class="err grow">' + esc(e) + '</div><button class="btn primary" data-act="rSave" ' + (e ? 'disabled' : '') + '>Save</button>'; },
      acts: {
        rk: el => { M.kind = el.dataset.v; M.moves = E.defaultMoves(S.bases, ['ADV', 'OUT'].includes(M.kind) ? (M.kind === 'ADV' ? 'ADV1' : 'PO') : M.kind); M.err = M.kind === 'POE' ? 1 : 0; renderModal(); },
        mv: el => { setMove(M.moves, el.parentNode.dataset.from, el.dataset.v); renderModal(); },
        rErr: el => { M.err = +el.dataset.v; renderModal(); },
        rSave: () => { if (err()) return; closeModal(); commit({ t: 'run', kind: M.kind, moves: M.moves, err: M.err }); }
      }
    });
  }

  // dropped third strike: edits the strikeout pitch so the batter is on base
  function openD3() {
    const g = App.game, S = App.S, idx = g.events.length - 1, ev = g.events[idx];
    if (!ev || ev.t !== 'pitch') return;
    const rec = S.allPitches.find(p => p.evIdx === idx); if (!rec) return;
    const bases = rec.bases;
    const M = { how: 'WP', moves: E.defaultMoves(bases, 'D3'), err: 0 };
    const err = () => E.validateMoves(bases, M.moves, true) || (M.moves.find(m => m.from === 'B') ? '' : 'Where did the batter end up?');
    openModal({
      title: 'Dropped third strike',
      body: () => '<p>The strikeout still counts for the pitcher; the batter is not out.</p><div class="grp-lab">How did he reach?</div>' +
        seg('d3how', [['WP', 'Wild pitch'], ['PB', 'Passed ball'], ['E2', 'Error C'], ['E3', 'Error 1B'], ['FC', 'Fielder’s choice']], M.how) +
        '<div class="grp-lab">Runners</div>' + moversHTML(bases, M.moves, true, pName(rec.side, rec.batter), () => 'runner'),
      foot: () => { const e = err(); return '<div class="err grow">' + esc(e) + '</div><button class="btn primary" data-act="d3Save" ' + (e ? 'disabled' : '') + '>Save</button>'; },
      acts: {
        d3how: el => { M.how = el.dataset.v; renderModal(); },
        mv: el => { setMove(M.moves, el.parentNode.dataset.from, el.dataset.v); renderModal(); },
        d3Save: () => {
          if (err()) return;
          ev.d3 = { how: M.how, notation: 'K-' + M.how, moves: M.moves, errors: M.how.startsWith('E') ? 1 : 0 };
          if (M.how === 'WP' || M.how === 'PB') ev.d3fb = M.how;
          closeModal(); afterChange(null, { quiet: true }); toast('Batter reached on dropped third strike');
        }
      }
    });
  }

  // ------------------------------------------------------------------ pitching change / subs
  function openPChange(sideArg) {
    const g = App.game, S = App.S;
    const M = { side: sideArg || E.fieldingSide(S), sel: null, num: '', name: '', throws: 'R' };
    const cands = () => {
      const side = M.side, used = S.pitchersUsed[side];
      const list = [];
      used.forEach(pid => { if (!unknown(pid)) list.push({ pid, label: pName(side, pid), sub: (S.pitchCount[pid] || 0) + ' P · already pitched' }); });
      if (side === g.sjfSide) Store.roster().filter(r => r.pitcher).forEach(r => {
        const id = (side === 'home' ? 'h' : 'a') + r.num; if (!list.find(x => x.pid === id)) list.push({ pid: id, label: '#' + r.num + ' ' + (r.name || ''), sub: (r.throws === 'L' ? 'LHP' : 'RHP'), roster: r });
      });
      Object.values(g[side].players).forEach(p => { if (!list.find(x => x.pid === p.id)) list.push({ pid: p.id, label: '#' + p.num + ' ' + (p.name || ''), sub: 'on roster for this game' }); });
      return list;
    };
    openModal({
      title: 'Pitching change',
      body: () => '<div class="row"><label class="f" style="margin:0">Team</label>' + seg('pcSide', [['home', esc(g.home.name)], ['away', esc(g.away.name)]], M.side) + '<span class="muted">Now on the mound: ' + esc(pName(M.side, S.pitcher[M.side])) + '</span></div>' +
        '<div class="grp-lab">Pick the new pitcher</div><div class="grid-btns">' + cands().filter(c => c.pid !== S.pitcher[M.side]).map(c => '<button class="btn ' + (M.sel === c.pid ? 'on' : '') + '" data-act="pcSel" data-v="' + c.pid + '" style="text-align:left"><div>' + esc(c.label) + '</div><div style="font-size:12px;opacity:.8">' + esc(c.sub) + '</div></button>').join('') + '</div>' +
        '<div class="grp-lab">…or add a new one</div><div class="row"><input class="txt" style="width:80px" inputmode="numeric" placeholder="#" value="' + esc(M.num) + '" data-chg="pcNum"><input class="txt grow" style="width:auto" placeholder="Name" value="' + esc(M.name) + '" data-chg="pcName">' + seg('pcThrows', [['R', 'RHP'], ['L', 'LHP']], M.throws) + '</div>' +
        '<p class="muted">If you change pitchers in the middle of an at-bat, the walk/strikeout is charged by the official scoring rule.</p>',
      foot: () => '<button class="btn primary" data-act="pcSave">Save change</button>',
      acts: {
        pcSide: el => { M.side = el.dataset.v; M.sel = null; renderModal(); },
        pcSel: el => { M.sel = el.dataset.v; M.num = ''; M.name = ''; renderModal(); },
        pcThrows: el => { M.throws = el.dataset.v; renderModal(); },
        pcSave: () => {
          let pid = M.sel;
          if (!pid && M.num.trim()) {
            pid = (M.side === 'home' ? 'h' : 'a') + M.num.trim();
            const ex = g[M.side].players[pid];
            g[M.side].players[pid] = Object.assign({ id: pid, num: M.num.trim(), bats: 'R' }, ex || {}, { name: M.name.trim() || (ex && ex.name) || '', throws: M.throws });
          } else if (pid && !g[M.side].players[pid]) {
            const c = cands().find(x => x.pid === pid); const r = c && c.roster;
            g[M.side].players[pid] = { id: pid, num: r ? String(r.num) : pid.slice(1), name: r ? r.name : '', bats: r ? r.bats || 'R' : 'R', throws: r ? r.throws || 'R' : 'R', ot: r ? r.ot || '' : '', note: r ? r.note || '' : '' };
          }
          if (!pid) { toast('Pick a pitcher or enter a number'); return; }
          if (pid === S.pitcher[M.side]) { toast('He’s already pitching'); return; }
          closeModal(); commit({ t: 'pchange', side: M.side, pid });
        }
      },
      chg: { pcNum: el => { M.num = el.value; M.sel = null; }, pcName: el => { M.name = el.value; } }
    });
  }

  function openSub() {
    const g = App.game, S = App.S;
    const bsNow = E.battingSide(S), b = curBatter();
    const M = { side: bsNow, role: 'PH', slot: b.slot, base: null, sel: null, num: '', name: '', bats: 'R' };
    const occ = () => [1, 2, 3].filter(x => M.side === bsNow && S.bases[x - 1]);
    openModal({
      title: 'Substitution',
      body: () => {
        const side = M.side;
        const inLineup = S.lineup[side];
        const bench = Object.values(g[side].players).filter(p => !inLineup.includes(p.id));
        if (side === g.sjfSide) Store.roster().forEach(r => { const id = (side === 'home' ? 'h' : 'a') + r.num; if (!inLineup.includes(id) && !bench.find(x => x.id === id)) bench.push({ id, num: String(r.num), name: r.name, bats: r.bats, roster: true }); });
        let h = '<div class="row">' + seg('sbSide', [['home', esc(g.home.name)], ['away', esc(g.away.name)]], M.side) + seg('sbRole', [['PH', 'Pinch hitter'], ['PR', 'Pinch runner'], ['DEF', 'Lineup change']], M.role) + '</div>';
        if (M.role === 'PR') {
          const o = occ();
          h += '<div class="grp-lab">Replacing the runner on</div>' + (o.length ? seg('sbBase', o.map(x => [x, E.baseName(x)]), M.base) : '<div class="muted">No runners for this team right now.</div>');
        } else {
          h += '<div class="grp-lab">Lineup spot</div><div class="grid-btns">' + inLineup.map((pid, i) => '<button class="btn ' + (M.slot === i ? 'on' : '') + '" data-act="sbSlot" data-v="' + i + '">' + (i + 1) + '. ' + esc(pName(side, pid)) + '</button>').join('') + '</div>';
        }
        h += '<div class="grp-lab">New player</div><div class="grid-btns">' + bench.map(p => '<button class="btn ' + (M.sel === p.id ? 'on' : '') + '" data-act="sbSel" data-v="' + p.id + '">#' + esc(p.num) + ' ' + esc(p.name || '') + '</button>').join('') + '</div>' +
          '<div class="grp-lab">…or add a new one</div><div class="row"><input class="txt" style="width:80px" inputmode="numeric" placeholder="#" value="' + esc(M.num) + '" data-chg="sbNum"><input class="txt grow" style="width:auto" placeholder="Name" value="' + esc(M.name) + '" data-chg="sbName">' + seg('sbBats', [['R', 'R'], ['L', 'L'], ['S', 'S']], M.bats) + '</div>';
        return h;
      },
      foot: () => '<button class="btn primary" data-act="sbSave">Save</button>',
      acts: {
        sbSide: el => { M.side = el.dataset.v; M.sel = null; renderModal(); },
        sbRole: el => { M.role = el.dataset.v; renderModal(); },
        sbSlot: el => { M.slot = +el.dataset.v; renderModal(); },
        sbBase: el => { M.base = +el.dataset.v; renderModal(); },
        sbSel: el => { M.sel = el.dataset.v; M.num = ''; renderModal(); },
        sbBats: el => { M.bats = el.dataset.v; renderModal(); },
        sbSave: () => {
          const side = M.side; let pid = M.sel;
          if (!pid && M.num.trim()) pid = (side === 'home' ? 'h' : 'a') + M.num.trim();
          if (!pid) { toast('Pick a player or enter a number'); return; }
          if (!g[side].players[pid]) {
            const r = side === g.sjfSide ? Store.roster().find(x => (side === 'home' ? 'h' : 'a') + x.num === pid) : null;
            g[side].players[pid] = { id: pid, num: pid.slice(1), name: M.name.trim() || (r && r.name) || '', bats: M.num ? M.bats : (r && r.bats) || 'R', throws: (r && r.throws) || 'R', ot: (r && r.ot) || '', note: '' };
          } else if (M.num && M.name.trim()) g[side].players[pid].name = M.name.trim();
          let slot = M.slot, base = null;
          if (M.role === 'PR') {
            if (!M.base) { toast('Pick the base'); return; }
            base = M.base; const r = S.bases[base - 1];
            slot = r && r.pid ? S.lineup[side].indexOf(r.pid) : -1; if (slot < 0) slot = null;
          }
          if (slot != null && S.lineup[side][slot] === pid) { toast('He’s already in that spot'); return; }
          closeModal(); commit({ t: 'sub', side, slot, pid, role: M.role, base });
        }
      },
      chg: { sbNum: el => { M.num = el.value; M.sel = null; }, sbName: el => { M.name = el.value; } }
    });
  }

  // ------------------------------------------------------------------ fix dialog
  function openFix() {
    const g = App.game, S = App.S, bs = E.battingSide(S);
    const M = { outs: S.outs, b: S.balls, s: S.strikes, bases: S.bases.map(Boolean), home: S.score.home, away: S.score.away, slot: S.cur ? S.cur.slot : S.nextSlot[bs] };
    openModal({
      title: 'Fix the game state',
      body: () => '<p class="muted">Use this when the chart and the field disagree (missed a pitch, wrong count, missed a run). For a mistake you just made, Undo is easier.</p>' +
        '<div class="row"><div><div class="grp-lab">Outs</div>' + seg('fxOuts', [[0, '0'], [1, '1'], [2, '2']], M.outs) + '</div>' +
        '<div><div class="grp-lab">Balls</div>' + seg('fxB', [[0, '0'], [1, '1'], [2, '2'], [3, '3']], M.b) + '</div>' +
        '<div><div class="grp-lab">Strikes</div>' + seg('fxS', [[0, '0'], [1, '1'], [2, '2']], M.s) + '</div></div>' +
        '<div class="grp-lab">Runners on</div><div class="row">' + [1, 2, 3].map(x => '<button class="btn ' + (M.bases[x - 1] ? 'gold' : '') + '" data-act="fxBase" data-v="' + x + '">' + E.baseName(x) + (M.bases[x - 1] ? ' ✓' : '') + '</button>').join('') + '</div>' +
        '<div class="grp-lab">Score</div><div class="row">' +
        ['away', 'home'].map(sd => '<span style="font-weight:800;min-width:60px">' + esc(g[sd].name) + '</span><button class="btn small" data-act="fxSc" data-v="' + sd + '" data-d="-1">−</button><b style="font-size:22px;min-width:30px;text-align:center">' + M[sd] + '</b><button class="btn small" data-act="fxSc" data-v="' + sd + '" data-d="1">+</button><span style="width:20px"></span>').join('') + '</div>' +
        '<div class="grp-lab">Who’s up for ' + esc(g[bs].name) + '</div><div class="grid-btns">' + S.lineup[bs].map((pid, i) => '<button class="btn ' + (M.slot === i ? 'on' : '') + '" data-act="fxSlot" data-v="' + i + '">' + (i + 1) + '. ' + esc(pName(bs, pid)) + '</button>').join('') + '</div>' +
        '<div class="grp-lab">Inning</div><div class="row"><button class="btn" data-act="fxHalf">End this half-inning now</button></div>',
      foot: () => '<button class="btn primary" data-act="fxSave">Save fix</button>',
      acts: {
        fxOuts: el => { M.outs = +el.dataset.v; renderModal(); },
        fxB: el => { M.b = +el.dataset.v; renderModal(); },
        fxS: el => { M.s = +el.dataset.v; renderModal(); },
        fxBase: el => { const i = +el.dataset.v - 1; M.bases[i] = !M.bases[i]; renderModal(); },
        fxSc: el => { M[el.dataset.v] = Math.max(0, M[el.dataset.v] + +el.dataset.d); renderModal(); },
        fxSlot: el => { M.slot = +el.dataset.v; renderModal(); },
        fxHalf: () => { closeModal(); confirmBox('End half-inning?', 'This records the side as retired right now.', 'End half-inning', () => commit({ t: 'half' })); },
        fxSave: () => {
          const ev = { t: 'fix' }; let any = false;
          if (M.b !== S.balls || M.s !== S.strikes) { ev.count = { b: M.b, s: M.s }; any = true; }
          if (M.bases.some((v, i) => v !== !!S.bases[i])) { ev.bases = M.bases; any = true; }
          if (M.home !== S.score.home || M.away !== S.score.away) { ev.score = { home: M.home, away: M.away }; any = true; }
          if (M.slot !== (S.cur ? S.cur.slot : S.nextSlot[bs])) { ev.batter = { side: bs, slot: M.slot }; any = true; }
          if (M.outs !== S.outs) { ev.outs = M.outs; any = true; }
          closeModal(); if (any) commit(ev); else toast('Nothing changed');
        }
      }
    });
  }

  // ------------------------------------------------------------------ edit a past pitch
  function openEditPitch(evIdx) {
    const g = App.game, S = App.S, ev = g.events[evIdx];
    const rec = S.allPitches.find(p => p.evIdx === evIdx);
    if (!ev || !rec) return;
    const pa = S.paById[rec.paId] || S.cur;
    const endsPA = pa && pa.complete && pa.pitches[pa.pitches.length - 1].evIdx === evIdx;
    const M = { type: ev.type || 0, velo: ev.velo || '', res: ev.res, loc: ev.loc ? Object.assign({}, ev.loc) : null, nota: ev.nota || '', ooz: !!ev.ooz };
    const strikeFam = ['CS', 'SW', 'FT', 'MB'];
    const callMode = g.mode === 'call';
    openModal({
      title: 'Pitch ' + rec.n + ' to ' + pName(rec.side, rec.batter),
      body: () => {
        let h = '<div class="grp-lab">Pitch type</div>' + seg('epType', [1, 2, 3, 4, 5, 0].map(t => [t, t ? t + ' ' + TN[t] : '?']), M.type) +
          (callMode ? '' : '<div class="grp-lab">Velo</div><div class="row"><input class="txt" style="width:110px;font-size:22px" inputmode="numeric" value="' + esc(M.velo) + '" data-chg="epVelo"><span class="muted">leave blank if unknown</span></div>');
        if (strikeFam.includes(ev.res)) h += '<div class="grp-lab">Result</div>' + seg('epRes', strikeFam.map(r => [r, E.RESULTS[r]]), M.res);
        else h += '<div class="grp-lab">Result</div><div><b>' + E.RESULTS[ev.res] + '</b> <span class="muted">(to change a ball/strike/foul, Undo back to it, or use Fix)</span></div>';
        if (callMode) { if (E.CHASE_RES.includes(M.res)) h += '<div class="grp-lab">Out of zone (chase)?</div>' + seg('epOoz', [[1, 'Yes — chased'], [0, 'No']], M.ooz ? 1 : 0); }
        else h += '<div class="grp-lab">Location (tap to move)</div><div style="max-width:300px" id="epPadWrap">' + padSVG(rec.hand, [], M.loc, false) + '</div><button class="btn small" data-act="epClearLoc">No location</button>';
        if (ev.res === 'IP') h += '<div class="grp-lab">Play</div><button class="btn" data-act="epPlay">Edit the play (' + esc(ev.ip ? ev.ip.notation : '') + ')</button>';
        else if (endsPA) h += '<div class="grp-lab">Scoring notation (optional override)</div><input class="txt" placeholder="' + esc(pa.result.notation) + '" value="' + esc(M.nota) + '" data-chg="epNota">';
        return h;
      },
      foot: () => '<button class="btn primary" data-act="epSave">Save</button>',
      after: () => {
        const svg = $('epPadWrap') && $('epPadWrap').querySelector('svg');
        if (svg) svg.addEventListener('pointerdown', e => { M.loc = padPoint(svg, e); renderModal(); });
      },
      acts: {
        epType: el => { M.type = +el.dataset.v; renderModal(); },
        epRes: el => { M.res = el.dataset.v; renderModal(); },
        epOoz: el => { M.ooz = el.dataset.v === '1'; renderModal(); },
        epClearLoc: () => { M.loc = null; renderModal(); },
        epPlay: () => { closeModal(); openInPlay({ evIdx }); },
        epSave: () => {
          ev.type = M.type; ev.velo = M.velo ? +M.velo : null; ev.loc = M.loc;
          if (strikeFam.includes(ev.res) && strikeFam.includes(M.res)) ev.res = M.res;
          if (callMode) { if (M.ooz && E.CHASE_RES.includes(ev.res)) ev.ooz = true; else delete ev.ooz; }
          if (endsPA && ev.res !== 'IP') { if (M.nota.trim()) ev.nota = M.nota.trim(); else delete ev.nota; }
          closeModal(); afterChange(null, { quiet: true }); toast('Pitch updated');
        }
      },
      chg: { epVelo: el => { M.velo = el.value.replace(/[^0-9]/g, ''); }, epNota: el => { M.nota = el.value; } }
    });
  }

  function openPA(paId) {
    const S = App.S, pa = S.paById[paId] || (S.cur && S.cur.id === paId ? S.cur : null);
    if (!pa) return;
    openModal({
      title: pName(pa.side, pa.batter) + ' · ' + (pa.half === 'top' ? 'Top ' : 'Bot ') + pa.inning,
      body: () => {
        let h = '<p><b>' + esc(paText(pa)) + '</b> · pitcher ' + esc(pName(pa.fside, pa.pitcher)) + ' · bats ' + pa.hand + '</p><div class="explist">';
        pa.pitches.forEach(p => {
          h += '<button class="exp" data-act="editPitch" data-ev="' + p.evIdx + '" style="text-align:left"><b style="width:26px">' + p.n + '</b><span style="color:' + TCOL[p.type] + ';font-weight:800;width:40px">' + TN[p.type] + '</span><span style="width:40px">' + (p.velo || '—') + '</span><span class="grow">' + E.RESULTS[p.res] + (p.chase ? ' · chase' : '') + (p.loc ? ' · ' + E.locWords(p.loc, p.hand) : (App.game.mode === 'call' ? '' : ' · no location')) + '</span><span class="muted">' + p.b + '-' + p.s + '</span></button>';
        });
        h += '</div>';
        if (pa.events.length) h += '<p class="muted">Runner events: ' + esc(pa.events.map(e => e.desc).join(', ')) + '</p>';
        if (pa.notes.length) h += '<p class="muted">Notes: ' + esc(pa.notes.join(' · ')) + '</p>';
        return h;
      }
    });
  }

  // fill in an unknown starter (lineup spot or starting pitcher) — changes the game's starting lineup,
  // so every pitch already charted for that spot is credited to him
  function openFill(side, slot) {
    const g = App.game, S = App.S, isP = slot === 'P';
    const pref = side === 'home' ? 'h' : 'a';
    const M = { num: '', name: '', hand: 'R', nameEdited: false };
    const lookup = () => {
      if (!M.num) return null;
      const id = pref + M.num;
      if (g[side].players[id]) return g[side].players[id];
      if (side === g.sjfSide) return Store.roster().find(r => String(r.num) === M.num) || null;
      const o = Store.opps()[(g[side].name || '').trim().toUpperCase()];
      return o ? o.players.find(p => String(p.num) === M.num) || null : null;
    };
    const apply = () => { const f = lookup(); if (f) { if (!M.nameEdited) M.name = f.name || ''; M.hand = isP ? (f.throws || 'R') : (f.bats || 'R'); } else if (!M.nameEdited) { M.name = ''; } };
    const err = () => {
      if (!M.num) return 'Enter his number';
      if (!isP) { const id = pref + M.num; const at = S.lineup[side].indexOf(id); if (at >= 0 && at !== slot) return '#' + M.num + ' is already batting ' + (at + 1) + E.ordinal(at + 1); }
      return '';
    };
    openModal({
      title: isP ? 'Who’s pitching for ' + g[side].name + '?' : g[side].name + ' — #' + (slot + 1) + ' hitter',
      body: () => {
        const f = lookup();
        return '<div class="kdisp">#' + (M.num || '—') + '</div>' + (f && f.name ? '<div style="text-align:center;font-weight:800;margin:-6px 0 8px">' + esc(f.name) + ' (' + (g[side].players[pref + M.num] ? 'already in this game' : side === g.sjfSide ? 'from roster' : 'from earlier games') + ')</div>' : '') +
          '<div class="keypad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'].map(k => '<button class="btn" data-act="fk" data-v="' + k + '">' + k + '</button>').join('') + '</div>' +
          '<div class="row" style="margin-top:14px;justify-content:center"><span class="f" style="font-weight:800">' + (isP ? 'Throws' : 'Bats') + '</span>' + seg('fH', isP ? [['R', 'RHP'], ['L', 'LHP']] : [['R', 'R'], ['L', 'L'], ['S', 'Switch']], M.hand) + '</div>' +
          '<div style="max-width:360px;margin:12px auto 0"><input class="txt" placeholder="Name (optional)" value="' + esc(M.name) + '" data-chg="fName"></div>';
      },
      foot: () => { const e = err(); return '<div class="err grow">' + esc(e) + '</div><button class="btn primary" data-act="fSave" ' + (e ? 'disabled' : '') + '>Save</button>'; },
      acts: {
        fk: el => { const k = el.dataset.v; if (k === 'C') M.num = ''; else if (k === '⌫') M.num = M.num.slice(0, -1); else if (M.num.length < 2) M.num += k; apply(); renderModal(); },
        fH: el => { M.hand = el.dataset.v; renderModal(); },
        fSave: () => {
          if (err()) return;
          const id = pref + M.num; const ex = g[side].players[id] || {}; const f = lookup() || {};
          g[side].players[id] = Object.assign({ id, num: M.num, bats: 'R', throws: 'R', ot: f.ot || '', note: f.note || '' }, ex, { name: M.name.trim() || ex.name || f.name || '' },
            isP ? { throws: M.hand, bats: ex.bats || f.bats || 'R' } : { bats: M.hand, throws: ex.throws || f.throws || 'R' });
          if (isP) g[side].pitcher = id; else g[side].lineup[slot] = id;
          closeModal(); afterChange(null, { quiet: true }); toast((isP ? 'Pitcher ' : 'Batting ' + (slot + 1) + E.ordinal(slot + 1) + ': ') + '#' + M.num + (M.name ? ' ' + M.name : ''));
        }
      },
      chg: { fName: el => { M.name = el.value; M.nameEdited = true; } }
    });
  }

  function openNote() {
    const M = { text: '' };
    openModal({
      title: 'Note on this at-bat',
      body: () => '<input class="txt" placeholder="e.g. mound visit, PitchCom issue, rain delay" data-chg="ntText">',
      foot: () => '<button class="btn primary" data-act="ntSave">Save note</button>',
      acts: { ntSave: () => { if (!M.text.trim()) return; closeModal(); commit({ t: 'note', text: M.text.trim() }, { quiet: true }); } },
      chg: { ntText: el => { M.text = el.value; } }
    });
  }

  function openVeloPad() {
    const M = { v: '' };
    const save = () => { const n = +M.v; if (n >= 40 && n <= 110) { App.pend.velo = n; closeModal(); render(); } else toast('Velo should be 40–110'); };
    openModal({
      title: 'Velo',
      body: () => '<div class="kdisp">' + (M.v || '—') + '</div><div class="keypad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'].map(k => '<button class="btn" data-act="kp" data-v="' + k + '">' + k + '</button>').join('') + '</div>',
      foot: () => '<button class="btn" data-act="kpNone">No velo</button><button class="btn primary" data-act="kpOk">Use</button>',
      acts: {
        kp: el => { const k = el.dataset.v; if (k === 'C') M.v = ''; else if (k === '⌫') M.v = M.v.slice(0, -1); else if (M.v.length < 3) M.v += k; renderModal(); if ((M.v.length === 2 && M.v[0] !== '1') || M.v.length === 3) save(); },
        kpOk: save, kpNone: () => { App.pend.velo = null; closeModal(); render(); }
      }
    });
  }

  // ------------------------------------------------------------------ sheet tab
  function sheetTabHTML() {
    const g = App.game, S = App.S;
    const side = App.sheetSide || E.fieldingSide(S);
    const pages = R.chartPages(S, side);
    if (App.sheetPage >= pages) App.sheetPage = 0;
    return '<div class="sheetwrap"><div class="row" style="margin-bottom:10px">' + (g.mode === 'call' ? '<b>' + esc(g[g.sjfSide].name) + ' pitching</b>' : seg('sheetSide', [['away', esc(g.away.name) + ' pitching'], ['home', esc(g.home.name) + ' pitching']], side)) +
      (pages > 1 ? seg('sheetPage', Array.from({ length: pages }, (_, i) => [i, 'Page ' + (i + 1)]), App.sheetPage) : '') +
      '<span class="muted">Tap any box to review or fix that at-bat. This is exactly what exports for Synergy.</span></div>' +
      '<canvas class="sheetcv" id="sheetcv"></canvas></div>';
  }
  const imgCache = {};
  function drawSheet() {
    const cv = $('sheetcv'); if (!cv) return;
    const side = App.sheetSide || E.fieldingSide(App.S);
    const w = cv.clientWidth, scale = w / R.PAGE.W, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(R.PAGE.H * scale * dpr); cv.style.height = (R.PAGE.H * scale) + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, R.PAGE.W, R.PAGE.H);
    if (!imgCache[window.SJF_LOGO]) { const im = new Image(); im.onload = () => drawSheet(); im.src = window.SJF_LOGO; imgCache[window.SJF_LOGO] = im; }
    R.drawChart(R.canvasPainter(ctx, imgCache), App.S, App.game, side, App.sheetPage, {});
    cv.onclick = e => {
      const r = cv.getBoundingClientRect();
      const pa = R.hitTest(App.S, side, App.sheetPage, (e.clientX - r.left) / scale, (e.clientY - r.top) / scale);
      if (pa) openPA(pa.id);
    };
  }

  // ------------------------------------------------------------------ stats tab
  const pctS = (n, d) => (d ? Math.round(100 * n / d) + '%' : '—');
  function statsTabHTML() {
    const g = App.game, S = App.S, st = App.settings;
    const side = App.statsSide || g.sjfSide;
    const ps = E.pitchingStats(S, g, side), T = ps.team;
    const tile = (k, v, d, ok) => '<div class="tile ' + (ok === true ? 'good' : ok === false ? 'bad' : '') + '"><div class="k">' + k + '</div><div class="v">' + v + '</div><div class="d">' + d + '</div></div>';
    const tg = (t, val, hi) => (t === '' || t == null || val == null ? null : hi ? val >= +t : val <= +t);
    let h = '<div class="page" style="max-width:none"><div class="row" style="margin-bottom:12px">' + seg('statsSide', [['home', esc(g.home.name) + ' pitching'], ['away', esc(g.away.name) + ' pitching']], side) + '<span class="muted">Live — updates every pitch</span></div>';
    h += '<div class="tiles">' +
      tile('0-0 Strikes', pctS(T.fpStrike, T.fp), T.fpStrike + ' of ' + T.fp + ' first pitches', tg(st.tgtFps, T.fp ? 100 * T.fpStrike / T.fp : null, true)) +
      tile('Leadoff outs', T.lo ? T.loOut + '/' + T.lo : '—', pctS(T.loOut, T.lo) + ' of innings', tg(st.tgtLo, T.lo ? 100 * T.loOut / T.lo : null, true)) +
      tile('Spin it to win it', pctS(T.spin, T.pitches), 'CB/SL usage · ' + pctS(T.spinStrike, T.spin) + ' for strikes · ' + pctS(T.spinWhiff, T.spinSwing) + ' whiff') +
      tile('Chase', pctS(T.oozSwing, T.ooz), g.mode === 'call' ? T.oozSwing + ' chases · ' + T.oozWhiff + ' chase whiffs (chases ÷ chases + balls taken)' : T.oozSwing + ' swings on ' + T.ooz + ' located balls out of zone · ' + T.oozWhiff + ' chase whiffs', tg(st.tgtChase, T.ooz ? 100 * T.oozSwing / T.ooz : null, true)) +
      tile('Whiff', pctS(T.whiffs, T.swings), T.whiffs + ' misses on ' + T.swings + ' swings', tg(st.tgtWhiff, T.swings ? 100 * T.whiffs / T.swings : null, true)) +
      tile('Give no room', T.freeBases, 'free bases (std ' + st.fbStd + ') · BB ' + T.bb + ' HBP ' + T.hbp + ' WP ' + T.wp + ' PB ' + T.pb + ' SB ' + T.sb + ' BK ' + T.bk, tg(st.fbStd, T.freeBases, false)) +
      tile('Strikes', pctS(T.strikes, T.pitches), T.pitches + ' pitches · ' + T.k + ' K · ' + T.h + ' H') + '</div>';
    h += '<h3>By pitcher</h3><div class="scroll-x"><table class="st"><tr><th>Pitcher</th><th>IP</th><th>P</th><th>Str%</th><th>BF</th><th>H</th><th>R</th><th>BB</th><th>HBP</th><th>K</th><th>0-0 S</th><th>LO</th><th>Whiff</th><th>Chase</th><th>Free B</th><th>FB velo</th></tr>' +
      ps.lines.map(l => { const fb = E.veloSummary((l.types[1] || {}).velos); return '<tr><td><b>' + esc(pName(side, l.pid)) + '</b></td><td>' + E.ipStr(l.outs) + '</td><td>' + l.pitches + '</td><td>' + pctS(l.strikes, l.pitches) + '</td><td>' + l.bf + '</td><td>' + l.h + '</td><td>' + l.r + '</td><td>' + l.bb + '</td><td>' + l.hbp + '</td><td>' + l.k + '</td><td>' + (l.fp ? l.fpStrike + '/' + l.fp : '—') + '</td><td>' + (l.lo ? l.loOut + '/' + l.lo : '—') + '</td><td>' + pctS(l.whiffs, l.swings) + '</td><td>' + pctS(l.oozSwing, l.ooz) + '</td><td>' + l.freeBases + '</td><td>' + (fb ? fb.avg.toFixed(1) + ' (' + fb.min + '-' + fb.max + ')' : '—') + '</td></tr>'; }).join('') + '</table></div>';
    h += '<h3>Pitch mix</h3><div class="scroll-x"><table class="st"><tr><th>Pitcher</th><th>Pitch</th><th>#</th><th>Use</th><th>Str%</th><th>Whiff</th><th>Avg</th><th>Range</th></tr>';
    ps.lines.forEach(l => {
      const p = pl(side, l.pid);
      [1, 2, 3, 4, 5, 0].filter(t => l.types[t]).forEach((t, i) => {
        const d = l.types[t], v = E.veloSummary(d.velos);
        h += '<tr><td>' + (i ? '' : '<b>' + esc(pName(side, l.pid)) + '</b>') + '</td><td style="text-align:right;color:' + TCOL[t] + ';font-weight:800">' + TN[t] + (t === 5 && p.ot ? ' (' + esc(p.ot) + ')' : '') + '</td><td>' + d.n + '</td><td>' + pctS(d.n, l.pitches) + '</td><td>' + pctS(d.strikes, d.n) + '</td><td>' + pctS(d.whiffs, d.swings) + '</td><td>' + (v ? v.avg.toFixed(1) : '—') + '</td><td>' + (v ? v.min + '-' + v.max : '—') + '</td></tr>';
      });
    });
    h += '</table></div><p class="muted">Chase and zone numbers only count pitches you tapped a location for. Whiff = swinging strikes (incl. foul tips) ÷ full swings; bunts are left out.</p></div>';
    return h;
  }

  // ------------------------------------------------------------------ lineups tab
  function lineupsTabHTML() {
    const g = App.game, S = App.S;
    const col = side => {
      let h = '<div class="card"><h2>' + esc(g[side].name) + (side === g.sjfSide ? '' : '') + ' <span class="muted" style="font-size:14px">(' + side + ')</span></h2><table class="st">';
      S.slotHist[side].forEach((hist, i) => {
        h += '<tr><td><b>' + (i + 1) + '.</b> ' + hist.map((x, j) => unknown(x.pid) ? '<button class="btn small gold" data-act="fillSlot" data-side="' + side + '" data-slot="' + i + '">Enter #</button>' :
          '<button class="btn small ' + (j === hist.length - 1 ? '' : 'ghost') + '" data-act="editPlayer" data-side="' + side + '" data-v="' + x.pid + '">' + (j ? esc(x.role) + ' ' : '') + esc(pName(side, x.pid)) + ' (' + (pl(side, x.pid).bats || 'R') + ')</button>').join(' ') + '</td></tr>';
      });
      h += '</table><h3>Pitchers</h3><table class="st">' + S.pitchersUsed[side].map(pid => unknown(pid) ? '<tr><td><button class="btn small gold" data-act="fillSlot" data-side="' + side + '" data-slot="P">Enter starting pitcher #</button></td><td>' + (S.pitchCount[pid] || 0) + ' P</td></tr>' : '<tr><td><button class="btn small" data-act="editPlayer" data-side="' + side + '" data-v="' + pid + '">' + esc(pName(side, pid)) + ' · ' + (pl(side, pid).throws === 'L' ? 'LHP' : 'RHP') + (pl(side, pid).ot ? ' · OT=' + esc(pl(side, pid).ot) : '') + '</button></td><td>' + (S.pitchCount[pid] || 0) + ' P</td></tr>').join('') + '</table>' +
        '<div class="row" style="margin-top:10px"><button class="btn small" data-act="pchangeSide" data-v="' + side + '">Pitching change</button></div></div>';
      return h;
    };
    return '<div class="page" style="max-width:none"><div class="setup-grid">' + col('away') + col('home') + '</div><p class="muted">Tap a player to fix his name, bats/throws, what his "OT" pitch is (e.g. CT, SPL, SI) and a scouting note — these print on the Synergy sheet.</p></div>';
  }
  function openEditPlayer(side, pid) {
    const g = App.game, p = g[side].players[pid] || { id: pid, num: pid.slice(1) };
    const M = Object.assign({ name: '', bats: 'R', throws: 'R', ot: '', note: '' }, p);
    openModal({
      title: 'Player #' + M.num + ' · ' + g[side].name,
      body: () => '<label class="f">Name</label><input class="txt" value="' + esc(M.name) + '" data-chg="epN">' +
        '<div class="row" style="margin-top:12px"><div><label class="f">Bats</label>' + seg('epB', [['R', 'R'], ['L', 'L'], ['S', 'S']], M.bats) + '</div><div><label class="f">Throws</label>' + seg('epT', [['R', 'R'], ['L', 'L']], M.throws) + '</div></div>' +
        '<div class="row" style="margin-top:12px"><div><label class="f">"5 – OT" pitch is</label><input class="txt" style="width:140px" placeholder="CT, SPL, SI…" value="' + esc(M.ot) + '" data-chg="epOT"></div>' +
        '<div class="grow"><label class="f">Arsenal / scouting note (prints on sheet)</label><input class="txt" placeholder="e.g. 2-seam & 4-seam both = 1" value="' + esc(M.note) + '" data-chg="epNote"></div></div>',
      foot: () => '<button class="btn primary" data-act="plSave">Save</button>',
      acts: {
        epB: el => { M.bats = el.dataset.v; renderModal(); }, epT: el => { M.throws = el.dataset.v; renderModal(); },
        plSave: () => { g[side].players[pid] = Object.assign({}, p, { id: pid, num: M.num, name: M.name.trim(), bats: M.bats, throws: M.throws, ot: M.ot.trim().toUpperCase(), note: M.note.trim() }); closeModal(); afterChange(null, { quiet: true }); }
      },
      chg: { epN: el => { M.name = el.value; }, epOT: el => { M.ot = el.value; }, epNote: el => { M.note = el.value; } }
    });
  }

  // ------------------------------------------------------------------ export tab
  function exportTabHTML() {
    const g = App.game, S = App.S;
    const item = (act, t, d, extra) => '<div class="exp"><div class="grow"><div class="t">' + t + '</div><div class="d">' + d + '</div></div><button class="btn primary" data-act="' + act + '" ' + (extra || '') + '>Export</button></div>';
    return '<div class="page"><h2>Export</h2>' + (S.final ? '' : '<div class="banner" style="margin:0 0 12px">Game still in progress — you can export anytime; tap <b>End game</b> when it’s over.</div>') +
      '<div class="explist">' +
      (g.mode === 'call' ? item('exChart', 'Synergy chart — ' + esc(g[g.sjfSide].name) + ' pitching', 'PDF in the same layout as the paper chart: pitch sequence, swings, results and where each ball went. Upload to Video Express → Pitch Chart Upload.', 'data-v="' + g.sjfSide + '"') :
      item('exChart', 'Synergy chart — ' + esc(g.away.name) + ' pitching', 'PDF in the same layout as the paper chart. Upload to Video Express → Pitch Chart Upload.', 'data-v="away"') +
      item('exChart', 'Synergy chart — ' + esc(g.home.name) + ' pitching', 'PDF in the same layout as the paper chart.', 'data-v="home"')) +
      item('exCSV', 'Pitch-by-pitch CSV', 'Every pitch, both teams: type, velo, location, count, result, runners. Synergy also accepts CSV; opens in Excel / Sheets.') +
      item('exReport', 'Staff report — ' + esc(g[g.sjfSide].name) + ' pitchers', 'One page: pillars (0-0 strikes, leadoff outs, spin, chase/whiff, free bases), pitcher lines and pitch mix.') +
      item('exAll', 'Everything at once', (g.mode === 'call' ? 'Chart PDF' : 'Both chart PDFs') + ' + CSV + staff report.') +
      item('exBackup', 'Game backup (.json)', 'Keeps the full game so it can be restored or moved to another iPad.') +
      '</div><p class="muted">Exports open the iPad share sheet — choose <b>Save to Files</b>, <b>AirDrop</b> (works with no internet) or <b>Mail</b>.</p>' +
      '<div class="row" style="margin-top:18px">' + (S.final ? '<button class="btn" data-act="reopen">Reopen game</button>' : '<button class="btn gold" data-act="endGame">End game (final)</button>') + '</div></div>';
  }
  async function doExport(kind, v) {
    const g = App.game, S = App.S; const files = [];
    try {
      if (kind === 'chart') files.push(X.chartPDF(g, S, v));
      if (kind === 'csv') files.push(X.csv(g, S));
      if (kind === 'report') files.push(X.reportPDF(g, S, App.settings));
      if (kind === 'all') { if (g.mode === 'call') files.push(X.chartPDF(g, S, g.sjfSide)); else files.push(X.chartPDF(g, S, 'away'), X.chartPDF(g, S, 'home')); files.push(X.csv(g, S), X.reportPDF(g, S, App.settings)); }
      if (kind === 'backup') files.push(X.backup(g));
      const r = await X.deliver(files);
      if (r === 'downloaded') toast('Saved ' + files.length + ' file' + (files.length > 1 ? 's' : ''));
    } catch (e) { toast('Export failed: ' + e.message); }
  }

  // ================================================================== ROSTERS
  function rostersHTML() {
    const r = Store.roster(), opps = Store.opps(), st = App.settings;
    const rows = r.map((p, i) => '<tr><td><input class="txt" style="width:70px" inputmode="numeric" value="' + esc(p.num) + '" data-rb="' + i + '.num"></td><td><input class="txt" value="' + esc(p.name) + '" data-rb="' + i + '.name"></td>' +
      '<td>' + seg('rBats', [['R', 'R'], ['L', 'L'], ['S', 'S']], p.bats || 'R', 'data-i="' + i + '"') + '</td><td>' + seg('rThrows', [['R', 'R'], ['L', 'L']], p.throws || 'R', 'data-i="' + i + '"') + '</td>' +
      '<td>' + seg('rP', [[1, 'P'], [0, '—']], p.pitcher ? 1 : 0, 'data-i="' + i + '"') + '</td><td><input class="txt" style="width:80px" placeholder="OT=" value="' + esc(p.ot || '') + '" data-rb="' + i + '.ot"></td>' +
      '<td><button class="btn small danger" data-act="rDel" data-i="' + i + '">✕</button></td></tr>').join('');
    return '<div class="topbar"><button class="btn" data-act="goHome">‹ Games</button><h1>Rosters</h1></div><div class="page">' +
      '<div class="card"><h2>' + esc(st.team) + ' roster</h2><div class="scroll-x" style="border:0"><table class="lu"><tr class="muted"><td>#</td><td>Name</td><td>Bats</td><td>Throws</td><td>Pitcher</td><td>OT pitch</td><td></td></tr>' + rows + '</table></div>' +
      '<div class="row" style="margin-top:10px"><button class="btn" data-act="rAdd">+ Add player</button><button class="btn primary" data-act="rSave">Save roster</button></div>' +
      '<h3>Paste a whole roster</h3><p class="muted">One player per line: <span class="kbd">number name bats throws P</span> — e.g. <span class="kbd">22 Fulton R R P</span> or <span class="kbd">7 Smith L R</span>. Adds/updates by number.</p>' +
      '<textarea class="txt" id="bulk" placeholder="22 Fulton R R P&#10;31 Cutjak R R P&#10;7 Smith L R"></textarea><div class="row" style="margin-top:8px"><button class="btn" data-act="rBulk">Add these</button></div></div>' +
      '<div class="card" style="margin-top:14px"><h2>Opponents</h2><p class="muted">Saved automatically from each game so the next game vs the same team fills itself in.</p>' +
      (Object.keys(opps).length ? Object.entries(opps).map(([k, o]) => '<div class="game-row"><div class="grow"><b>' + esc(o.name) + '</b> <span class="muted">' + o.players.length + ' players</span><div class="muted" style="font-size:13px">' + esc(o.players.map(p => '#' + p.num + ' ' + (p.name || '')).join(', ')) + '</div></div><button class="btn small danger" data-act="oDel" data-v="' + esc(k) + '">Delete</button></div>').join('') : '<div class="muted">None yet.</div>') + '</div></div>';
  }
  App.rosterDraft = null;
  function rosterDraft() { if (!App.rosterDraft) App.rosterDraft = Store.roster().map(p => Object.assign({}, p)); return App.rosterDraft; }

  // ================================================================== SETTINGS / HELP
  function settingsHTML() {
    const s = App.settings;
    return '<div class="topbar"><button class="btn" data-act="goHome">‹ Games</button><h1>Settings</h1></div><div class="page"><div class="card">' +
      '<label class="f">Our team name on the chart</label><input class="txt" style="max-width:240px" value="' + esc(s.team) + '" data-set="team">' +
      '<h3>Pillar standards (leave blank for none)</h3><div class="row">' +
      '<div><label class="f">Free bases / game ≤</label><input class="txt" style="width:120px" inputmode="decimal" value="' + esc(s.fbStd) + '" data-set="fbStd"></div>' +
      '<div><label class="f">0-0 strike % ≥</label><input class="txt" style="width:120px" inputmode="decimal" value="' + esc(s.tgtFps) + '" data-set="tgtFps"></div>' +
      '<div><label class="f">Leadoff out % ≥</label><input class="txt" style="width:120px" inputmode="decimal" value="' + esc(s.tgtLo) + '" data-set="tgtLo"></div>' +
      '<div><label class="f">Whiff % ≥</label><input class="txt" style="width:120px" inputmode="decimal" value="' + esc(s.tgtWhiff) + '" data-set="tgtWhiff"></div>' +
      '<div><label class="f">Chase % ≥</label><input class="txt" style="width:120px" inputmode="decimal" value="' + esc(s.tgtChase) + '" data-set="tgtChase"></div>' +
      '<div><label class="f">Bullpen time to plate ≤ (sec)</label><input class="txt" style="width:120px" inputmode="decimal" value="' + esc(s.ttpStd || '') + '" data-set="ttpStd"></div></div>' +
      '<h3>Charting</h3><div class="row"><span>Require a pitch type on every pitch</span>' + seg('setReq', [[1, 'On'], [0, 'Off']], s.requireType ? 1 : 0) + '</div>' +
      '<div class="row" style="margin-top:8px"><span>Velo buttons</span>' + seg('setVelo', [[1, 'On'], [0, 'Off']], s.velo ? 1 : 0) + '</div>' +
      '<h3>Starting velo buttons for a new pitcher</h3><div class="row">' + [1, 2, 3, 4, 5].map(t => '<div><label class="f">' + TN[t] + '</label><input class="txt" style="width:80px" inputmode="numeric" value="' + esc(s.veloDefaults[t]) + '" data-setv="' + t + '"></div>').join('') + '</div>' +
      '<div class="row" style="margin-top:16px"><button class="btn primary" data-act="saveSettings">Save settings</button></div></div>' +
      '<div class="card" style="margin-top:14px"><h2>Storage</h2><p>Used: ' + Math.round(Store.usage() / 1024) + ' KB. ' + (App.persisted ? 'This iPad has marked the app’s data as permanent.' : 'Tip: always open the app from its Home Screen icon — Safari tabs keep separate data.') + '</p>' +
      '<button class="btn" data-act="recover">Recover games from backup copy</button></div></div>';
  }
  function helpHTML() {
    return '<div class="topbar"><button class="btn" data-act="goHome">‹ Games</button><h1>How to use</h1></div><div class="page help"><div class="card">' +
      '<h2>Every pitch</h2><ol><li>Tap the <b>pitch type</b> (1 FB, 2 CB, 3 SL, 4 CH, 5 OT, ? if you missed it).</li><li>Tap the <b>velo</b> (the row centers on that pitcher’s average for that pitch; # for anything else). Optional.</li><li>Tap the <b>location</b> on the zone (catcher’s view, like the sheet). Optional.</li><li>Tap the <b>result</b>. That saves the pitch and resets for the next one.</li></ol>' +
      '<p>Count, outs, innings, batting order, pitch counts and switching sides all happen automatically. Ball 4 is a walk, strike 3 is a strikeout (backwards K if called), and three outs flips to the other team.</p>' +
      '<h2>Pitch-calling chart</h2><p>At <b>New game</b> pick <b>Pitch-calling chart</b>. It charts only their hitters — pitch type, result, and (on balls in play) the play and where it went; no location or velo. The left side of the screen is the hitter’s breakdown, always open: first-pitch swings, every swing-and-miss with the count, what he did with 2 strikes, what he put in play and where (spray chart), a pitch-by-pitch line for every at-bat, and a preview of the on-deck hitter. <b>All games</b> adds every earlier game we charted against him (same team + number). When we hit, the screen shows who’s due up; tap <b>[Team] hitting ›</b> when they come back up.</p>' +
      '<h2>No lineup yet?</h2><p>Start the game with blank spots (or a blank starting pitcher). When an unknown hitter comes up, his card turns gold — tap it and punch in his number when you see it. Pitches you already charted are credited to him. The Lineups tab shows any spots still blank.</p>' +
      '<h2>Ball in play</h2><p>Pick what happened, tap fielders in order (6 then 3 = 6-3), optionally tap the grass where it went, then check the runners. Default runner moves are filled in — change any that are wrong.</p>' +
      '<h2>Between pitches</h2><p><b>Runners</b> handles SB, CS, WP, PB, balk, pickoffs. <b>Pitching change</b> and <b>Sub / PH / PR</b> are on the cards up top. Switch hitters are set from the pitcher’s arm automatically; “Bats R?/L?” flips it.</p>' +
      '<h2>Mistakes</h2><p><b>Undo</b> steps back one action at a time (Redo appears right after). Tap a pitch chip — or any box on the <b>Sheet</b> — to change its type, velo, location, or called/swinging. <b>Fix</b> sets outs, count, runners, score or who’s up when the chart and the field disagree.</p>' +
      '<h2>After the game</h2><p><b>Export</b> → Synergy chart PDFs (one per pitching staff), CSV and the staff report. Upload the chart PDFs in Synergy Video Express → Pitch Chart Upload before the video.</p>' +
      '<h2>Bullpens</h2><p>Home → <b>Bullpens</b> → <b>+ New bullpen</b>. Pick one pitcher, or two to chart side-by-side mounds (switch with the tabs up top). <b>Pen script</b> walks through gloveside FB, 6 heart-attack, 6 with a runner on 1st (stopwatch on), 3 rounds racing to 2 strikes and a simulated at-bat; <b>Free pen</b> just charts. Each pitch: pitch type (stays selected) → target (the gray boxes from your sheet, or <b>Called spot</b> and tap where the catcher set up) → velo → tap where it landed → <b>Strike</b> or <b>Ball</b>. K% = strikes ÷ pitches; Target = pitches that landed in the target. <b>Pitcher history</b> shows every pen and trends.</p>' +
      '<h2>No internet needed</h2><p>Once installed from the Home Screen, the app runs with no signal. Every tap is saved on the iPad. Use “Back up everything” now and then.</p></div></div>';
  }

  // ================================================================== events
  const acts = {
    toastBtn: () => { $('toast').classList.add('hidden'); if (App.toastFn) App.toastFn(); },
    goHome: () => { App.game = null; go('home'); },
    goRosters: () => { App.rosterDraft = null; go('rosters'); }, goSettings: () => go('settings'), goHelp: () => go('help'),
    reload: () => location.reload(),
    newGame: () => { App.setup = newSetup(); go('setup'); },
    openGame: el => openGame(el.dataset.id),
    delGame: el => { const g = Store.index().find(x => x.id === el.dataset.id); confirmBox('Delete game?', 'Delete ' + (g ? g.away + ' @ ' + g.home + ' (' + R.fmtDate(g.date) + ')' : 'this game') + '? This can’t be undone.', 'Delete', () => { Store.remove(el.dataset.id); render(); }, true); },
    backupAll: () => X.deliver([X.backupAll(Store.allData())]),
    // setup
    setBats: el => { const p = el.parentNode; App.setup.lu[p.dataset.k][+p.dataset.i].bats = el.dataset.v; patchSetup(); },
    setThrows: el => { App.setup.p[el.parentNode.dataset.k].throws = el.dataset.v; patchSetup(); },
    setSide: el => { App.setup.sjfSide = el.dataset.v; render(); },
    setInn: el => { App.setup.innings = +el.dataset.v; render(); },
    copyLast: () => {
      const s = App.setup, key = s.opp.trim().toUpperCase();
      if (!key) { toast('Enter the opponent first'); return; }
      const last = Store.index().filter(x => (x.home || '').toUpperCase() === key || (x.away || '').toUpperCase() === key).sort((a, b) => b.updated - a.updated)[0];
      if (!last) { toast('No earlier game vs ' + s.opp); return; }
      const g = Store.load(last.id); const sj = g.sjfSide, op = E.other(sj);
      ['sjf', 'opp'].forEach(k => { const sd = k === 'sjf' ? sj : op; s.lu[k] = g[sd].lineup.map(pid => { const p = g[sd].players[pid] || {}; return { num: p.num || '', name: p.name || '', bats: p.bats || 'R' }; }); });
      toast('Lineups copied from ' + R.fmtDate(g.date)); render();
    },
    fillRoster: () => { const s = App.setup; s.lu.sjf.forEach((r, i) => setupLookup('sjf', i)); const f = findPlayer('sjf', s.p.sjf.num); if (f && !s.p.sjf.name) { s.p.sjf.name = f.name; s.p.sjf.throws = f.throws || 'R'; } render(); },
    startGame,
    // game
    tab: el => { App.tab = el.dataset.v; render(); },
    undo,
    ptype: el => { const t = +el.dataset.v; App.pend.type = App.pend.type === t ? null : t; if (App.pend.velo && App.pend.type) { /* keep */ } render(); },
    velo: el => { const v = +el.dataset.v; App.pend.velo = App.pend.velo === v ? null : v; render(); },
    veloPad: openVeloPad,
    clearLoc: () => { App.pend.loc = null; render(); },
    res: el => onResult(el.dataset.v),
    auto: el => { if (guardFinal()) return; commit({ t: 'auto', res: el.dataset.v }); },
    ibb: () => { if (guardFinal()) return; confirmBox('Intentional walk', 'Award first base with no pitches?', 'Intentional walk', () => commit({ t: 'ibb' })); },
    runner: openRunner, fix: openFix, note: openNote, sub: openSub,
    pchange: () => openPChange(), pchangeSide: el => openPChange(el.dataset.v),
    flipHand: () => { const b = curBatter(); commit({ t: 'bats', hand: b.hand === 'L' ? 'R' : 'L' }, { quiet: true }); },
    editPitch: el => openEditPitch(+el.dataset.ev),
    fillBatter: el => openFill(el.dataset.side, +el.dataset.slot),
    scoutAll: el => { App.scoutAll = el.dataset.v === '1'; render(); },
    oozToggle: () => { App.pend.ooz = !App.pend.ooz; render(); },
    setMode: el => { App.setup.mode = el.dataset.v; render(); },
    ourRuns: el => { App.ourRuns = Math.max(0, (App.ourRuns || 0) + +el.dataset.d); render(); },
    theirHalf: () => {
      const g = App.game, S = App.S, before = S;
      if (App.ourRuns) { const sc = { home: S.score.home, away: S.score.away }; sc[g.sjfSide] += App.ourRuns; g.events.push({ t: 'fix', score: sc, ts: Date.now() }); }
      g.events.push({ t: 'half', ts: Date.now() });
      App.ourRuns = 0; App.redo = []; afterChange(before, { quiet: true });
    },
    fillPitcher: el => openFill(el.dataset.side, 'P'),
    fillSlot: el => openFill(el.dataset.side, el.dataset.slot === 'P' ? 'P' : +el.dataset.slot),
    openPA: el => openPA(el.dataset.id),
    d3: openD3,
    endGame: () => confirmBox('End game', 'Mark this game final? You can reopen it later.', 'End game', () => commit({ t: 'end' })),
    reopen: () => { const g = App.game; const i = g.events.map(e => e.t).lastIndexOf('end'); if (i >= 0) g.events.splice(i, 1); afterChange(null, { quiet: true }); toast('Game reopened'); },
    sheetSide: el => { App.sheetSide = el.dataset.v; App.sheetPage = 0; render(); },
    sheetPage: el => { App.sheetPage = +el.dataset.v; render(); },
    statsSide: el => { App.statsSide = el.dataset.v; render(); },
    editPlayer: el => openEditPlayer(el.dataset.side, el.dataset.v),
    exChart: el => doExport('chart', el.dataset.v), exCSV: () => doExport('csv'), exReport: () => doExport('report'), exAll: () => doExport('all'), exBackup: () => doExport('backup'),
    // rosters
    rAdd: () => { rosterDraft().push({ num: '', name: '', bats: 'R', throws: 'R', pitcher: false }); render(); },
    rDel: el => { rosterDraft().splice(+el.dataset.i, 1); Store.saveRoster(cleanRoster()); render(); },
    rBats: el => { rosterDraft()[+el.parentNode.dataset.i].bats = el.dataset.v; render(); },
    rThrows: el => { rosterDraft()[+el.parentNode.dataset.i].throws = el.dataset.v; render(); },
    rP: el => { rosterDraft()[+el.parentNode.dataset.i].pitcher = el.dataset.v === '1'; render(); },
    rSave: () => { Store.saveRoster(cleanRoster()); App.rosterDraft = null; toast('Roster saved'); render(); },
    rBulk: () => {
      const d = rosterDraft(); let n = 0;
      ($('bulk').value || '').split(/\n/).forEach(line => {
        const t = line.trim().split(/[\s,\t]+/); if (!t[0] || !/^\d+$/.test(t[0])) return;
        const flags = t.slice(1).filter(x => /^(R|L|S|P)$/i.test(x)).map(x => x.toUpperCase());
        const name = t.slice(1).filter(x => !/^(R|L|S|P)$/i.test(x)).join(' ');
        const hands = flags.filter(x => x !== 'P');
        const rec = { num: t[0], name, bats: hands[0] || 'R', throws: hands[1] === 'L' ? 'L' : 'R', pitcher: flags.includes('P') };
        const ex = d.find(p => String(p.num) === t[0]); if (ex) Object.assign(ex, rec); else d.push(rec); n++;
      });
      Store.saveRoster(cleanRoster()); toast(n + ' players added/updated'); render();
    },
    oDel: el => confirmBox('Delete opponent', 'Forget the saved roster for ' + el.dataset.v + '?', 'Delete', () => { Store.deleteOpp(el.dataset.v); render(); }, true),
    // settings
    setReq: el => { App.settings.requireType = el.dataset.v === '1'; render(); },
    setVelo: el => { App.settings.velo = el.dataset.v === '1'; render(); },
    saveSettings: () => { Store.saveSettings(App.settings); toast('Settings saved'); },
    recover: async () => { const n = await Store.recover(); toast(n ? 'Recovered ' + n + ' item(s)' : 'Nothing missing — all games are here'); render(); },
    mClose: closeModal
  };
  function cleanRoster() { return rosterDraft().filter(p => String(p.num).trim()).map(p => ({ num: String(p.num).trim(), name: (p.name || '').trim(), bats: p.bats || 'R', throws: p.throws || 'R', pitcher: !!p.pitcher, ot: (p.ot || '').trim().toUpperCase(), note: p.note || '' })); }

  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]'); if (!el) return;
    const a = el.dataset.act;
    const inModal = el.closest('#modal');
    if (inModal && App.modal && App.modal.acts && App.modal.acts[a]) { App.modal.acts[a](el, e); return; }
    if (acts[a]) acts[a](el, e);
    else if (window.PenUI && PenUI.acts[a]) PenUI.acts[a](el, e);
  });
  // close modal by tapping backdrop
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

  document.addEventListener('input', e => {
    const el = e.target;
    if (el.dataset.bind && App.setup) {
      const path = el.dataset.bind.split('.'); let o = App.setup;
      for (let i = 0; i < path.length - 1; i++) o = o[path[i]];
      o[path[path.length - 1]] = el.value;
    }
    if (el.dataset.rb) { const [i, k] = el.dataset.rb.split('.'); rosterDraft()[+i][k] = el.value; }
    if (el.dataset.set) { const k = el.dataset.set; App.settings[k] = ['fbStd'].includes(k) ? (el.value === '' ? '' : +el.value) : el.value; }
    if (el.dataset.setv) { App.settings.veloDefaults = Object.assign({}, App.settings.veloDefaults, { [el.dataset.setv]: +el.value || '' }); }
    if (el.dataset.chg && App.modal && App.modal.chg && App.modal.chg[el.dataset.chg]) App.modal.chg[el.dataset.chg](el);
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.look) { const [k, i] = el.dataset.look.split('.'); setupLookup(k, +i); patchSetup(); }
    if (el.dataset.lookp) { const k = el.dataset.lookp; const f = findPlayer(k, App.setup.p[k].num); if (f) { if (!App.setup.p[k].name) App.setup.p[k].name = f.name || ''; App.setup.p[k].throws = f.throws || 'R'; } patchSetup(); }
    if (el.dataset.chg === 'oppPicked') { const h = $('oppHead'); if (h) h.textContent = (App.setup.opp || 'Opponent') + ' lineup'; }
    if (el.dataset.chg === 'restore' && el.files && el.files[0]) restore(el.files[0]);
  });
  // location pad + field (pointerdown for instant response)
  document.addEventListener('pointerdown', e => {
    const pad = e.target.closest('#pad');
    if (pad && App.screen === 'game') { App.pend.loc = padPoint(pad, e); render(); return; }
    const field = e.target.closest('#fieldsvg');
    if (field && !e.target.closest('[data-act]') && App.modal && App.modal.spray) {
      const pt = field.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
      const p = pt.matrixTransform(field.getScreenCTM().inverse());
      App.modal.spray({ xft: Math.round((p.x - FHX) / FK), yft: Math.round((FHY - p.y) / FK) });
    }
  });
  window.addEventListener('resize', () => { if (App.screen === 'game' && App.tab === 'sheet') drawSheet(); });

  async function restore(file) {
    try {
      const data = JSON.parse(await file.text());
      if (data.kind === 'sjf-chart-game') {
        const g = data.game; const exists = Store.load(g.id);
        const doIt = () => { Store.save(g); toast('Game restored'); render(); };
        if (exists) confirmBox('Replace game?', 'This game is already on the iPad. Replace it with the backup?', 'Replace', doIt, true); else doIt();
      } else if (data.kind === 'sjf-chart-backup') {
        let n = 0;
        (data.games || []).forEach(g => { const ex = Store.load(g.id); if (!ex || (g.updated || 0) > (ex.updated || 0)) { Store.save(g); n++; } });
        (data.pens || []).forEach(p => { const ex = Store.loadPen(p.id); if (!ex || (p.updated || 0) > (ex.updated || 0)) { Store.savePen(p); n++; } });
        if (data.roster && data.roster.length && !Store.roster().length) Store.saveRoster(data.roster);
        Object.values(data.opps || {}).forEach(o => Store.saveOpp(o.name, o.players));
        toast('Restored ' + n + ' game(s)/pen(s)'); render();
      } else toast('That file isn’t an SJF chart backup');
    } catch (e) { toast('Could not read that file'); }
  }

  // keep the screen awake while charting
  let wl = null;
  async function wakeLock() { try { if ('wakeLock' in navigator && App.screen === 'game') wl = await navigator.wakeLock.request('screen'); } catch (e) { /* */ } }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wakeLock(); });

  // offline install
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw && nw.addEventListener('statechange', () => { if (nw.state === 'installed' && navigator.serviceWorker.controller) { App.swUpdate = true; if (App.screen === 'home') render(); } });
      });
    }).catch(() => { /* */ });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(p => { App.persisted = p; }).catch(() => { /* */ });
  Store.recover().then(n => { if (n && App.screen === 'home') render(); });

  window.SJF = { App, go, render, toast, openModal, closeModal, renderModal, confirmBox, seg, esc, padPoint, today };
  render();
})();
