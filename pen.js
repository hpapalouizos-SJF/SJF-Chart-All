/* SJF Pitch Chart — Bullpens (Execution Bullpen sheet on the iPad) */
(function () {
  'use strict';
  const E = window.Engine, R = window.ChartRender, Store = window.Store;
  const J = () => window.SJF;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = id => document.getElementById(id);

  const TNAME = { 1: 'FB/SNK', 3: 'SLIDER', 4: 'CHANGEUP', 2: 'CURVEBALL', 5: 'OTHER', 0: 'UNKNOWN' };
  const TS = { 1: 'FB', 2: 'CB', 3: 'SL', 4: 'CH', 5: 'OT', 0: '?' };
  const ORDER = [1, 3, 4, 2, 5];
  const TCOL = { 1: '#C62828', 2: '#1565C0', 3: '#2E7D32', 4: '#E65100', 5: '#6A1B9A', 0: '#616161' };
  // Target boxes measured off the Execution Bullpen sheet, in half-zone units [x1, y1, x2, y2] (y up)
  const BOXES = {
    1: [{ k: 'up', label: 'Up', r: [-1.64, 0.20, 0.36, 1.18] }, { k: 'side', label: 'Side lane', r: [-1.32, -1.02, -0.33, 0.98] }, { k: 'down', label: 'Down', r: [-1.01, -1.17, 0.71, -0.36] }],
    3: [{ k: 'down', label: 'Down', r: [-1.12, -1.38, 0.61, -0.57] }],
    4: [{ k: 'down', label: 'Down', r: [-1.15, -1.18, 1.15, -0.54] }],
    2: [{ k: 'heart', label: 'Heart', r: [-0.49, -0.49, 0.49, 0.49] }, { k: 'down', label: 'Down', r: [-1.10, -1.38, 1.10, -0.40] }],
    5: []
  };
  const HEART = { k: 'heart', label: 'Heart', r: [-0.49, -0.49, 0.49, 0.49] };
  const SPOT_R = 0.45; // a called spot counts as hit within ~4 inches
  const PHASES = [
    { key: 'open', label: 'Gloveside fastball (down preferred)', kind: 'count', n: 1, type: 1, target: { kind: 'box', box: 'side' } },
    { key: 'heart', label: '0-0 heart attack', kind: 'count', n: 6, target: { kind: 'box', box: 'heart' } },
    { key: 'runner', label: 'Fast runner on 1st', kind: 'count', n: 6, ttp: true },
    { key: 'race', label: 'Race to 2 strikes', kind: 'race', rounds: 3 },
    { key: 'ab', label: 'Simulated at-bat', kind: 'ab' }
  ];

  const boxesFor = t => BOXES[t] || [];
  function findBox(type, k) { if (k === 'heart') return boxesFor(type).find(b => b.k === 'heart') || HEART; return boxesFor(type).find(b => b.k === k) || null; }
  function inRect(loc, r, pad) { pad = pad == null ? 0.08 : pad; return loc.x >= r[0] - pad && loc.x <= r[2] + pad && loc.y >= r[1] - pad && loc.y <= r[3] + pad; }
  function evalHit(type, loc, target) {
    if (!loc) return null;
    const t = target || { kind: 'any' };
    if (t.kind === 'spot' && t.spot) return Math.hypot(loc.x - t.spot.x, loc.y - t.spot.y) <= SPOT_R;
    if (t.kind === 'box') { const b = findBox(type, t.box); if (b) return inRect(loc, b.r); }
    const bx = boxesFor(type);
    if (bx.length) return bx.some(b => inRect(loc, b.r));
    return E.inZone(loc);
  }
  function targetLabel(type, t) {
    if (!t || t.kind === 'any') return boxesFor(type).length ? 'Any box' : 'Zone';
    if (t.kind === 'spot') return 'Called spot';
    const b = findBox(type, t.box); return b ? b.label : 'Any box';
  }

  // ------------------------------------------------------------------ derive state from a pen's events
  function derive(pen) {
    const st = { pitches: [], phase: pen.script ? 0 : -1, inPhase: 0, race: { round: 0, b: 0, s: 0, res: [] }, ab: { b: 0, s: 0, res: null, final: '' } };
    const advance = () => { st.phase++; st.inPhase = 0; };
    for (const e of pen.events) {
      if (e.t === 'skip') { if (st.phase >= 0 && st.phase < PHASES.length) advance(); continue; }
      if (e.t !== 'pitch') continue;
      const ph = st.phase >= 0 && st.phase < PHASES.length ? PHASES[st.phase] : null;
      const rec = Object.assign({}, e, { n: st.pitches.length + 1, phase: ph ? ph.key : (pen.script ? 'extra' : null) });
      rec.hit = evalHit(e.type, e.loc, e.target);
      if (ph) {
        if (ph.kind === 'count') { st.inPhase++; rec.phaseN = st.inPhase; if (st.inPhase >= ph.n) advance(); }
        else if (ph.kind === 'race') {
          const r = st.race; rec.round = r.round + 1; rec.count = r.b + '-' + r.s;
          if (e.strike) r.s++; else r.b++;
          if (r.s >= 2 || r.b >= 2) { r.res.push(r.s >= 2 ? 'W' : 'L'); r.round++; r.b = 0; r.s = 0; if (r.round >= ph.rounds) advance(); }
        } else if (ph.kind === 'ab') {
          const a = st.ab; rec.count = a.b + '-' + a.s;
          if (e.strike) a.s = Math.min(3, a.s + 1); else a.b++;
          if (a.s >= 3) { a.res = 'K'; a.final = a.b + '-2'; advance(); } else if (a.b >= 4) { a.res = 'BB'; a.final = '3-' + a.s; advance(); }
        }
      }
      st.pitches.push(rec);
    }
    return st;
  }
  function penStats(pen, st) {
    st = st || derive(pen);
    const by = {}; const tot = { n: 0, k: 0, hit: 0, hitD: 0, ttp: [] };
    st.pitches.forEach(p => {
      const b = (by[p.type] = by[p.type] || { n: 0, k: 0, hit: 0, hitD: 0, velos: [] });
      b.n++; tot.n++; if (p.strike) { b.k++; tot.k++; }
      if (p.hit !== null) { b.hitD++; tot.hitD++; if (p.hit) { b.hit++; tot.hit++; } }
      if (p.velo) b.velos.push(+p.velo);
      if (p.ttp) tot.ttp.push(+p.ttp);
    });
    return { by, tot, st };
  }
  const pct = (n, d) => (d ? Math.round(100 * n / d) + '%' : '—');
  const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

  // ------------------------------------------------------------------ session (in memory; pens saved every pitch)
  const P = { lanes: [], active: 0, viewId: null, histKey: null };
  function lane() { return P.lanes[P.active]; }
  function lanePen(l) { return l ? Store.loadPen(l.id) : null; }
  function newLane(id) { return { id, pend: { type: 1, velo: null, loc: null }, target: { kind: 'any' }, spotMode: false, sw: { t0: null, val: null }, ttpOn: false, lastPhase: null }; }
  function newPen(date, pitcher, script) {
    const pen = { id: E.uid(), kind: 'pen', v: 1, date, created: Date.now(), status: 'live', pitcher, script: !!script, events: [] };
    Store.savePen(pen); return pen;
  }

  // ------------------------------------------------------------------ screens
  function pensHTML() {
    const idx = Store.penIndex().slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.updated - a.updated);
    const live = idx.filter(p => p.status === 'live');
    const byDate = {};
    idx.forEach(p => (byDate[p.date] = byDate[p.date] || []).push(p));
    let h = '<div class="topbar"><button class="btn" data-act="goHome">‹ Games</button><h1>Bullpens</h1><div class="grow"></div>' +
      '<button class="btn" data-act="penHistory">Pitcher history</button><button class="btn" data-act="penCSV">Export all (CSV)</button></div><div class="page">' +
      '<div class="row"><button class="btn primary" data-act="penNew" style="font-size:19px;min-height:60px;padding:0 26px">+ New bullpen</button>' +
      (live.length ? '<button class="btn gold" data-act="penResumeAll">Resume open pens (' + live.length + ')</button>' : '') + '</div>';
    if (!idx.length) h += '<div class="card muted" style="margin-top:12px;font-size:17px">No bullpens yet. Tap <b>+ New bullpen</b>.</div>';
    Object.keys(byDate).sort().reverse().forEach(d => {
      h += '<div class="row" style="margin:18px 0 6px"><h2 style="margin:0">' + esc(R.fmtDate(d)) + '</h2><div class="grow"></div><button class="btn small" data-act="penDayPDF" data-v="' + esc(d) + '">PDF of the day</button></div><div class="games">';
      byDate[d].forEach(p => {
        const pen = Store.loadPen(p.id); const s = pen ? penStats(pen) : null;
        h += '<div class="game-row"><div class="grow"><div class="t">' + esc(p.name || '#' + p.num) + '</div><div class="muted">' + p.n + ' pitches · K% ' + (s ? s.tot.k + '/' + s.tot.n + ' (' + pct(s.tot.k, s.tot.n) + ')' : '') +
          ' · Target ' + (s ? s.tot.hit + '/' + s.tot.hitD + ' (' + pct(s.tot.hit, s.tot.hitD) + ')' : '') + ' · <span class="pill ' + (p.status === 'live' ? 'live' : '') + '">' + (p.status === 'live' ? 'Open' : 'Done') + '</span></div></div>' +
          '<button class="btn primary" data-act="penView" data-id="' + p.id + '">Open</button><button class="btn small danger" data-act="penDel" data-id="' + p.id + '">Delete</button></div>';
      });
      h += '</div>';
    });
    return h + '</div>';
  }

  function sessionHTML() {
    const l = lane(); const pen = lanePen(l);
    if (!pen) return pensHTML();
    const st = derive(pen); const settings = J().App.settings;
    const ph = st.phase >= 0 && st.phase < PHASES.length ? PHASES[st.phase] : null;
    // apply the phase's default type/target when a new phase starts
    const phKey = ph ? ph.key : 'free';
    if (l.lastPhase !== phKey) {
      l.lastPhase = phKey;
      if (ph && ph.type) l.pend.type = ph.type;
      l.target = ph && ph.target ? Object.assign({}, ph.target) : (l.target.kind === 'box' && l.target.box === 'heart' ? { kind: 'any' } : l.target);
      if (ph && ph.ttp) l.ttpOn = true;
    }
    const type = l.pend.type;
    let h = '<div class="gbar"><button class="btn" data-act="goPens">‹<span class="lbl"> Bullpens</span></button>' +
      '<div class="tabs" style="margin-left:0">' + P.lanes.map((x, i) => { const pp = lanePen(x); const n = pp ? pp.events.filter(e => e.t === 'pitch').length : 0; return '<button data-act="penLane" data-v="' + i + '" class="' + (i === P.active ? 'on' : '') + '">' + esc(pp ? (pp.pitcher.name || '#' + pp.pitcher.num) : '?') + ' · ' + n + '</button>'; }).join('') +
      (P.lanes.length < 2 ? '<button data-act="penAddLane">+ Pitcher</button>' : '') + '</div><div class="grow"></div>' +
      '<button class="btn" data-act="penFinish">Finish</button><button class="btn" data-act="penUndo">↶ Undo</button></div>';
    h += '<div class="chart"><section>';
    // script / status card
    h += '<div class="mcard">';
    if (ph) {
      let prog = '';
      if (ph.kind === 'count') prog = (st.inPhase + 1) + ' of ' + ph.n;
      if (ph.kind === 'race') prog = 'Round ' + (st.race.round + 1) + ' of ' + ph.rounds + ' · count ' + st.race.b + '-' + st.race.s + (st.race.res.length ? ' · so far ' + st.race.res.join(' ') : '');
      if (ph.kind === 'ab') prog = 'Count ' + st.ab.b + '-' + st.ab.s;
      h += '<div class="lab">Script · step ' + (st.phase + 1) + ' of ' + PHASES.length + '</div><div class="who">' + esc(ph.label) + '</div><div class="sub">' + esc(prog) + '</div>' +
        '<div class="act"><button class="btn" data-act="penSkip">Skip this step</button></div>';
    } else if (pen.script) {
      h += '<div class="lab">Script done</div><div class="who">Extra pitches</div><div class="sub">Race to 2: ' + (st.race.res.join(' ') || '—') + ' · Sim AB: ' + (st.ab.res ? st.ab.res + ' (' + st.ab.final + ')' : '—') + '</div>';
    } else {
      h += '<div class="lab">Free bullpen</div><div class="who">' + esc(pen.pitcher.name || '#' + pen.pitcher.num) + '</div><div class="sub">' + st.pitches.length + ' pitches · ' + esc(R.fmtDate(pen.date)) + '</div>';
    }
    h += '</div>';
    h += '<div class="padwrap"><div class="padhint">' + (l.spotMode ? '<span style="color:#9D2235">Tap the CALLED spot</span>' : 'Tap where it landed · same view as your sheet') + '</div>' +
      (l.pend.loc ? '<button class="btn small padclear" data-act="penClearLoc">Clear spot</button>' : '') + penPadSVG(type, st.pitches.filter(p => p.type === type), l.pend.loc, l.target, true) + '</div>';
    h += '<div class="seq">' + st.pitches.slice(-10).map(p => '<button class="chip ' + (p.strike ? 's' : '') + '" data-act="penEdit" data-v="' + (p.n - 1) + '"><span class="n">' + p.n + '</span><span style="color:' + TCOL[p.type] + '">' + TS[p.type] + '</span>' + (p.velo ? ' ' + p.velo : '') + ' · ' + (p.strike ? 'K' : 'B') + (p.hit === true ? ' ✓' : p.hit === false ? ' ✗' : '') + (p.ttp ? ' · ' + p.ttp.toFixed(2) + 's' : '') + '</button>').join('') +
      (st.pitches.length ? '' : '<span class="muted">Pitches show here — tap one to fix it.</span>') + '</div>';
    h += '</section><section class="ctrl">';
    h += '<div class="types">' + [1, 3, 4, 2, 5, 0].map(t => '<button class="tbtn ' + (type === t ? 'on' : '') + '" style="--c:' + TCOL[t] + '" data-act="penType" data-v="' + t + '">' + TS[t] + '<small>' + (t === 1 ? 'FB/SNK' : t === 0 ? 'missed' : TNAME[t].toLowerCase()) + '</small></button>').join('') + '</div>';
    // targets
    const tg = [['any', boxesFor(type).length ? 'Any box' : 'Zone']].concat(boxesFor(type).map(b => ['box:' + b.k, b.label]));
    if (!boxesFor(type).find(b => b.k === 'heart')) tg.push(['box:heart', 'Heart']);
    tg.push(['spot', 'Called spot']);
    const curT = l.target.kind === 'box' ? 'box:' + l.target.box : l.target.kind;
    h += '<div class="row" style="gap:6px"><span class="muted" style="font-weight:800;font-size:12px;text-transform:uppercase;width:52px">Target</span>' +
      tg.map(([v, lab]) => '<button class="btn small ' + (curT === v ? 'primary' : '') + '" data-act="penTarget" data-v="' + v + '">' + lab + '</button>').join('') + '</div>';
    if (settings.velo) {
      const c = veloCenter(pen, type);
      const qs = [-3, -2, -1, 0, 1, 2, 3].map(d => c + d);
      const custom = l.pend.velo && !qs.includes(l.pend.velo);
      h += '<div class="velo"><div class="vlab">Velo</div>' + qs.map(v => '<button class="vq ' + (l.pend.velo === v ? 'on' : '') + '" data-act="penVelo" data-v="' + v + '">' + v + '</button>').join('') +
        '<button class="vq ' + (custom ? 'on' : '') + '" data-act="penVeloPad">' + (custom ? l.pend.velo : '#') + '</button></div>';
    }
    const sug = l.pend.loc ? (E.inZone(l.pend.loc) ? 'K' : 'B') : '';
    const preview = l.pend.loc ? evalHit(type, l.pend.loc, l.target) : null;
    h += '<div class="results" style="grid-template-columns:1fr 1fr">' +
      '<button class="rbtn cs" data-act="penSave" data-v="1" style="min-height:96px;font-size:26px;' + (sug === 'B' ? 'opacity:.55' : '') + '">Strike' + (sug === 'K' ? '<small>location says strike</small>' : '<small>&nbsp;</small>') + '</button>' +
      '<button class="rbtn ball" data-act="penSave" data-v="0" style="min-height:96px;font-size:26px;' + (sug === 'K' ? 'opacity:.55' : '') + '">Ball' + (sug === 'B' ? '<small>location says ball</small>' : '<small>&nbsp;</small>') + '</button></div>';
    if (preview !== null) h += '<div class="muted" style="font-weight:700">' + (preview ? '✓ hits the target (' : '✗ misses the target (') + esc(targetLabel(type, l.target)) + ')</div>';
    // stopwatch
    h += '<div class="mcard"><div class="row"><div class="lab grow">Time to plate</div><button class="btn small" data-act="penTTPToggle">' + (l.ttpOn ? 'Hide' : 'Show') + '</button></div>';
    if (l.ttpOn) {
      const running = !!l.sw.t0;
      h += '<div class="row" style="margin-top:8px"><button class="btn ' + (running ? 'danger' : 'gold') + '" data-act="penSW" style="min-height:70px;font-size:22px;flex:1">' + (running ? 'STOP (catch)' : 'START (first move)') + '</button>' +
        '<div id="swDisp" style="font-size:40px;font-weight:900;width:130px;text-align:center;font-variant-numeric:tabular-nums">' + (l.sw.val != null ? l.sw.val.toFixed(2) : running ? '…' : '—') + '</div>' +
        (l.sw.val != null ? '<button class="btn small" data-act="penSWClear">Clear</button>' : '') + '</div>' +
        '<div class="sub" style="margin-top:4px">' + (l.sw.val != null ? 'Saves with the next pitch.' : 'Start on first move, stop when it hits the mitt.') + (settings.ttpStd ? ' Standard ≤ ' + esc(settings.ttpStd) + 's.' : '') + '</div>';
    }
    h += '</div>';
    // summary by type
    const s = penStats(pen, st);
    h += '<div class="scroll-x"><table class="st"><tr><th>Pitch</th><th>#</th><th>K%</th><th>Target</th><th>Velo</th></tr>' +
      ORDER.concat([0]).filter(t => s.by[t]).map(t => { const b = s.by[t]; const a = avg(b.velos); return '<tr><td style="color:' + TCOL[t] + ';font-weight:800">' + TS[t] + '</td><td>' + b.n + '</td><td>' + b.k + '/' + b.n + ' · ' + pct(b.k, b.n) + '</td><td>' + (b.hitD ? b.hit + '/' + b.hitD + ' · ' + pct(b.hit, b.hitD) : '—') + '</td><td>' + (a ? a.toFixed(1) + ' (' + Math.min(...b.velos) + '-' + Math.max(...b.velos) + ')' : '—') + '</td></tr>'; }).join('') +
      '<tr><td><b>All</b></td><td><b>' + s.tot.n + '</b></td><td><b>' + s.tot.k + '/' + s.tot.n + ' · ' + pct(s.tot.k, s.tot.n) + '</b></td><td><b>' + (s.tot.hitD ? s.tot.hit + '/' + s.tot.hitD + ' · ' + pct(s.tot.hit, s.tot.hitD) : '—') + '</b></td><td>' + (s.tot.ttp.length ? 'TTP ' + avg(s.tot.ttp).toFixed(2) : '') + '</td></tr></table></div>';
    h += '</section></div>';
    return h;
  }

  function veloCenter(pen, type) {
    const mine = derive(pen).pitches.filter(p => p.type === type && p.velo).map(p => +p.velo).slice(-8);
    if (mine.length) return Math.round(avg(mine));
    const hist = Store.penIndex().filter(x => x.id !== pen.id && pitcherKey(x) === pitcherKey(pen.pitcher)).sort((a, b) => b.updated - a.updated).slice(0, 3);
    const v = []; hist.forEach(x => { const pp = Store.loadPen(x.id); if (pp) pp.events.forEach(e => { if (e.t === 'pitch' && e.type === type && e.velo) v.push(+e.velo); }); });
    if (v.length) return Math.round(avg(v));
    return +(J().App.settings.veloDefaults[type] || 80);
  }
  function pitcherKey(p) { return (String(p.num || '').trim() || '') + '|' + String(p.name || '').trim().toUpperCase(); }

  // pen pad: square zone like the paper sheet. SVG Y = -y
  function penPadSVG(type, pitches, pend, target, main) {
    let s = '<svg ' + (main ? 'id="penpad"' : 'class="minipad"') + ' viewBox="-2.4 -2.4 4.8 4.65" xmlns="http://www.w3.org/2000/svg">';
    s += '<rect x="-2.4" y="-2.4" width="4.8" height="4.65" fill="#fbfbfc"/>';
    const boxes = boxesFor(type).slice();
    if (target && target.kind === 'box' && target.box === 'heart' && !boxes.find(b => b.k === 'heart')) boxes.push(HEART);
    const sel = target && target.kind === 'box' ? target.box : null;
    boxes.forEach(b => {
      const [x1, y1, x2, y2] = b.r; const on = sel === b.k || (target && target.kind === 'any');
      s += '<rect x="' + x1 + '" y="' + (-y2) + '" width="' + (x2 - x1) + '" height="' + (y2 - y1) + '" rx="0.1" fill="' + (sel === b.k ? 'rgba(241,190,72,.28)' : 'none') + '" stroke="' + (on ? '#6b6f76' : '#c4c7cc') + '" stroke-width="' + (sel === b.k ? 0.05 : 0.03) + '"/>';
    });
    s += '<rect x="-1" y="-1" width="2" height="2" rx="0.18" fill="none" stroke="#15171a" stroke-width="0.06"/>';
    s += '<polygon points="-0.6,1.62 -0.6,1.95 0.6,1.95 0.6,1.62 0,1.48" fill="#fff" stroke="#15171a" stroke-width="0.05"/>';
    if (target && target.kind === 'spot' && target.spot) {
      const X = target.spot.x, Y = -target.spot.y;
      s += '<circle cx="' + X + '" cy="' + Y + '" r="' + SPOT_R + '" fill="rgba(241,190,72,.25)" stroke="#9D2235" stroke-width="0.035" stroke-dasharray="0.08 0.06"/>';
      s += '<line x1="' + (X - 0.15) + '" y1="' + Y + '" x2="' + (X + 0.15) + '" y2="' + Y + '" stroke="#9D2235" stroke-width="0.03"/><line x1="' + X + '" y1="' + (Y - 0.15) + '" x2="' + X + '" y2="' + (Y + 0.15) + '" stroke="#9D2235" stroke-width="0.03"/>';
    }
    (pitches || []).forEach(p => {
      if (!p.loc) return;
      const X = Math.max(-2.3, Math.min(2.3, p.loc.x)), Y = Math.max(-2.3, Math.min(2.15, -p.loc.y));
      const ring = p.hit === true ? '#1b7a3a' : p.hit === false ? '#b3261e' : '#15171a';
      s += '<circle cx="' + X + '" cy="' + Y + '" r="0.15" fill="' + (p.strike ? '#15171a' : '#fff') + '" stroke="' + ring + '" stroke-width="0.05"/>';
      s += '<text x="' + X + '" y="' + (Y + 0.065) + '" font-size="0.17" font-weight="800" text-anchor="middle" fill="' + (p.strike ? '#fff' : '#15171a') + '">' + p.n + '</text>';
    });
    if (pend) {
      const X = pend.x, Y = -pend.y;
      s += '<circle cx="' + X + '" cy="' + Y + '" r="0.19" fill="#F1BE48" stroke="#15171a" stroke-width="0.05"/>';
    }
    return s + '</svg>';
  }
  function padPt(svg, ev) {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse());
    return { x: Math.round(Math.max(-2.3, Math.min(2.3, p.x)) * 1000) / 1000, y: Math.round(Math.max(-2.15, Math.min(2.3, -p.y)) * 1000) / 1000 };
  }

  // ------------------------------------------------------------------ pen sheet (PDF + in-app view share this)
  const PW = 612, PH = 792;
  function drawPenSheet(Pt, pen) {
    const s = penStats(pen); const st = s.st;
    const types = [1, 3, 4, 2].concat(s.by[5] ? [5] : []).concat(s.by[0] ? [0] : []);
    const top = 20, foot = 96, secH = (PH - top - foot) / types.length;
    const u = Math.min(38, secH * 0.22);
    types.forEach((t, i) => {
      const y0 = top + i * secH; const b = s.by[t] || { n: 0, k: 0, hit: 0, hitD: 0, velos: [] };
      Pt.text(TNAME[t], 36, y0 + secH * 0.30, { size: 15, color: '#555555' });
      Pt.text('K%  ' + b.k + ' / ' + b.n + (b.n ? '   (' + pct(b.k, b.n) + ')' : ''), 36, y0 + secH * 0.30 + 26, { size: 13, color: '#333333' });
      Pt.text('Target  ' + b.hit + ' / ' + b.hitD + (b.hitD ? '   (' + pct(b.hit, b.hitD) + ')' : ''), 36, y0 + secH * 0.30 + 46, { size: 11, color: '#333333' });
      const a = avg(b.velos);
      if (a) Pt.text('Velo avg ' + a.toFixed(1) + ' · top ' + Math.max(...b.velos), 36, y0 + secH * 0.30 + 64, { size: 9.5, color: '#555555' });
      // zone
      const cx = 255, cy = y0 + secH * 0.45;
      const X = x => cx + x * u, Y = y => cy - y * u;
      const bx = boxesFor(t).slice(); if (st.pitches.some(p => p.type === t && p.target && p.target.kind === 'box' && p.target.box === 'heart') && !bx.find(q => q.k === 'heart')) bx.push(HEART);
      bx.forEach(q => Pt.rect(X(q.r[0]), Y(q.r[3]), (q.r[2] - q.r[0]) * u, (q.r[3] - q.r[1]) * u, { lw: 1.1, stroke: '#666666' }));
      Pt.rect(X(-1), Y(1), 2 * u, 2 * u, { lw: 2.2 });
      const py = Y(-1.48);
      Pt.poly([[X(-0.6), py + 0.18 * u], [X(0), py], [X(0.6), py + 0.18 * u], [X(0.6), py + 0.5 * u], [X(-0.6), py + 0.5 * u], [X(-0.6), py + 0.18 * u]], { lw: 2 });
      st.pitches.filter(p => p.type === t && p.loc).forEach(p => {
        const px = Math.max(cx - 2.6 * u, Math.min(cx + 2.6 * u, X(p.loc.x))), pyy = Math.max(y0 + 10, Math.min(y0 + secH - 8, Y(p.loc.y)));
        Pt.text(p.n, px, pyy, { size: 9, bold: p.hit === true, align: 'center', base: 'middle', color: p.hit === false ? '#8a8a8a' : '#000000' });
      });
      // velos grid
      const gx = 430, gw = 160, cols = 5, cw = gw / cols;
      const rows = Math.max(5, Math.ceil(b.velos.length / cols));
      const gy = y0 + 8, gh = secH - 16, rh = gh / rows;
      Pt.text('VELOS', gx - 8, y0 + secH / 2 + 4, { size: 12, color: '#555555', align: 'right' });
      for (let r = 0; r <= rows; r++) Pt.line(gx, gy + r * rh, gx + gw, gy + r * rh, 0.5, '#999999');
      for (let c = 0; c <= cols; c++) Pt.line(gx + c * cw, gy, gx + c * cw, gy + gh, 0.5, '#999999');
      const vs = st.pitches.filter(p => p.type === t);
      vs.forEach((p, k) => { const r = Math.floor(k / cols), c = k % cols; Pt.text(p.velo || '—', gx + c * cw + cw / 2, gy + r * rh + rh / 2 + 0.5, { size: Math.min(11, rh * 0.55), align: 'center', base: 'middle' }); });
      Pt.line(24, y0 + secH, PW - 24, y0 + secH, 0.6, '#777777');
    });
    const fy = PH - foot + 26;
    Pt.text('NAME:', 36, fy, { size: 15, color: '#555555' });
    Pt.text(pen.pitcher.name || '#' + pen.pitcher.num, 96, fy, { size: 15, bold: true });
    Pt.text('DATE:', 380, fy, { size: 15, color: '#555555' });
    Pt.text(R.fmtDate(pen.date), 434, fy, { size: 15, bold: true });
    const t = s.tot;
    let line = t.n + ' pitches · K% ' + t.k + '/' + t.n + ' (' + pct(t.k, t.n) + ') · Target ' + t.hit + '/' + t.hitD + ' (' + pct(t.hit, t.hitD) + ')';
    if (t.ttp.length) line += ' · Time to plate avg ' + avg(t.ttp).toFixed(2) + 's, best ' + Math.min(...t.ttp).toFixed(2) + 's (' + t.ttp.length + ')';
    Pt.text(line, 36, fy + 20, { size: 9.5 });
    if (pen.script) {
      const heart = st.pitches.filter(p => p.phase === 'heart'), open = st.pitches.find(p => p.phase === 'open');
      Pt.text('Script — Opener: ' + (open ? (open.hit ? 'hit' : open.hit === false ? 'missed' : (open.strike ? 'strike' : 'ball')) : '—') + ' · Heart attack: ' + heart.filter(p => p.strike).length + '/' + heart.length + ' strikes, ' + heart.filter(p => p.hit).length + ' on the heart · Race to 2: ' + (st.race.res.join(' ') || '—') +
        ' · Sim AB: ' + (st.ab.res ? st.ab.res + ' (' + st.ab.final + ')' : '—'), 36, fy + 36, { size: 9.5 });
    }
    Pt.text('Numbers = pitch # where it landed · bold = hit the target · gray = missed the target · K% = strikes / pitches', 36, fy + 52, { size: 7.5, color: '#666666' });
  }
  function penPDF(pens, name) {
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter', compress: true });
    pens.forEach((pen, i) => { if (i) doc.addPage('letter'); drawPenSheet(R.pdfPainter(doc), pen); });
    return { blob: doc.output('blob'), name };
  }
  const slug = s => String(s || '').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

  function viewHTML() {
    const pen = Store.loadPen(P.viewId); if (!pen) return pensHTML();
    return '<div class="topbar"><button class="btn" data-act="goPens">‹ Bullpens</button><h1>' + esc(pen.pitcher.name || '#' + pen.pitcher.num) + ' · ' + esc(R.fmtDate(pen.date)) + '</h1><div class="grow"></div>' +
      '<button class="btn" data-act="penResume" data-id="' + pen.id + '">' + (pen.status === 'live' ? 'Resume' : 'Reopen & add') + '</button>' +
      '<button class="btn gold" data-act="penPDF" data-id="' + pen.id + '">Export PDF</button></div>' +
      '<div class="sheetwrap" style="max-width:820px;margin:0 auto"><canvas class="sheetcv" id="pencv"></canvas></div>';
  }
  const imgs = {};
  function drawView() {
    const cv = $('pencv'); if (!cv) return; const pen = Store.loadPen(P.viewId); if (!pen) return;
    const w = cv.clientWidth, sc = w / PW, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(PH * sc * dpr); cv.style.height = (PH * sc) + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr * sc, 0, 0, dpr * sc, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, PW, PH);
    drawPenSheet(R.canvasPainter(ctx, imgs), pen);
  }

  // ------------------------------------------------------------------ history
  function historyHTML() {
    const idx = Store.penIndex();
    const keys = {}; idx.forEach(p => { const k = pitcherKey(p); (keys[k] = keys[k] || { name: p.name, num: p.num, pens: [] }).pens.push(p); });
    const list = Object.entries(keys).sort((a, b) => (a[1].name || '').localeCompare(b[1].name || ''));
    if (!P.histKey && list.length) P.histKey = list[0][0];
    let h = '<div class="topbar"><button class="btn" data-act="goPens">‹ Bullpens</button><h1>Pitcher history</h1></div><div class="page" style="max-width:none">';
    if (!list.length) return h + '<div class="card muted">No bullpens yet.</div></div>';
    h += '<div class="grid-btns">' + list.map(([k, v]) => '<button class="btn ' + (P.histKey === k ? 'on' : '') + '" data-act="penHistPick" data-v="' + esc(k) + '" style="' + (P.histKey === k ? 'background:var(--red);color:#fff;border-color:var(--red)' : '') + '">' + esc(v.name || '#' + v.num) + ' <span style="opacity:.7">(' + v.pens.length + ')</span></button>').join('') + '</div>';
    const cur = keys[P.histKey]; if (!cur) return h + '</div>';
    const pens = cur.pens.map(p => Store.loadPen(p.id)).filter(Boolean).sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.created - b.created);
    const rows = pens.map(pen => { const s = penStats(pen); return { pen, s }; });
    const va = (s, t) => { const b = s.by[t]; const a = b ? avg(b.velos) : null; return a ? a.toFixed(1) : ''; };
    // trend charts
    const series = [
      { title: 'FB velo (avg)', vals: rows.map(r => { const b = r.s.by[1]; return b && b.velos.length ? avg(b.velos) : null; }), fmt: v => v.toFixed(1) },
      { title: 'K% (strikes)', vals: rows.map(r => r.s.tot.n ? 100 * r.s.tot.k / r.s.tot.n : null), fmt: v => Math.round(v) + '%' },
      { title: 'Target %', vals: rows.map(r => r.s.tot.hitD ? 100 * r.s.tot.hit / r.s.tot.hitD : null), fmt: v => Math.round(v) + '%' }
    ];
    if (rows.some(r => r.s.tot.ttp.length)) series.push({ title: 'Time to plate (avg s)', vals: rows.map(r => r.s.tot.ttp.length ? avg(r.s.tot.ttp) : null), fmt: v => v.toFixed(2) });
    h += '<div class="tiles" style="margin-top:14px">' + series.map(sr => '<div class="tile"><div class="k">' + sr.title + '</div>' + trendSVG(sr.vals, rows.map(r => R.fmtDate(r.pen.date)), sr.fmt) + '</div>').join('') + '</div>';
    h += '<h3>Every pen</h3><div class="scroll-x"><table class="st"><tr><th>Date</th><th>P</th><th>K%</th><th>Target</th><th>FB K%</th><th>SL K%</th><th>CH K%</th><th>CB K%</th><th>FB</th><th>SL</th><th>CH</th><th>CB</th><th>TTP</th><th></th></tr>' +
      rows.slice().reverse().map(({ pen, s }) => {
        const kp = t => { const b = s.by[t]; return b ? b.k + '/' + b.n : '—'; };
        return '<tr><td>' + esc(R.fmtDate(pen.date)) + '</td><td>' + s.tot.n + '</td><td>' + pct(s.tot.k, s.tot.n) + '</td><td>' + pct(s.tot.hit, s.tot.hitD) + '</td><td>' + kp(1) + '</td><td>' + kp(3) + '</td><td>' + kp(4) + '</td><td>' + kp(2) + '</td><td>' + va(s, 1) + '</td><td>' + va(s, 3) + '</td><td>' + va(s, 4) + '</td><td>' + va(s, 2) + '</td><td>' + (s.tot.ttp.length ? avg(s.tot.ttp).toFixed(2) : '') + '</td><td><button class="btn small" data-act="penView" data-id="' + pen.id + '">Open</button></td></tr>';
      }).join('') + '</table></div>';
    // season totals by pitch
    const agg = {}; rows.forEach(({ s }) => Object.entries(s.by).forEach(([t, b]) => { const a = (agg[t] = agg[t] || { n: 0, k: 0, hit: 0, hitD: 0, velos: [] }); a.n += b.n; a.k += b.k; a.hit += b.hit; a.hitD += b.hitD; a.velos = a.velos.concat(b.velos); }));
    h += '<h3>Season by pitch</h3><div class="scroll-x"><table class="st"><tr><th>Pitch</th><th>#</th><th>K%</th><th>Target</th><th>Velo avg</th><th>Top</th></tr>' +
      ORDER.concat([0]).filter(t => agg[t]).map(t => { const a = agg[t]; const v = avg(a.velos); return '<tr><td style="color:' + TCOL[t] + ';font-weight:800">' + TS[t] + '</td><td>' + a.n + '</td><td>' + a.k + '/' + a.n + ' · ' + pct(a.k, a.n) + '</td><td>' + (a.hitD ? a.hit + '/' + a.hitD + ' · ' + pct(a.hit, a.hitD) : '—') + '</td><td>' + (v ? v.toFixed(1) : '—') + '</td><td>' + (a.velos.length ? Math.max(...a.velos) : '—') + '</td></tr>'; }).join('') + '</table></div></div>';
    return h;
  }
  function trendSVG(vals, labels, fmt) {
    const pts = vals.map((v, i) => [i, v]).filter(p => p[1] != null);
    if (!pts.length) return '<div class="d" style="padding:20px 0">No data yet</div>';
    const W = 260, H = 110, pad = 18;
    const ys = pts.map(p => p[1]); let lo = Math.min(...ys), hi = Math.max(...ys); if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    const n = Math.max(1, vals.length - 1);
    const X = i => pad + (W - 2 * pad) * (vals.length === 1 ? 0.5 : i / n), Y = v => H - pad - (H - 2 * pad) * (v - lo) / (hi - lo);
    let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto">';
    s += '<polyline fill="none" stroke="#9D2235" stroke-width="2.5" points="' + pts.map(p => X(p[0]) + ',' + Y(p[1])).join(' ') + '"/>';
    pts.forEach(p => { s += '<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="3.5" fill="#9D2235"/>'; });
    const last = pts[pts.length - 1];
    s += '<text x="' + Math.min(W - 4, X(last[0]) + 6) + '" y="' + (Y(last[1]) - 6) + '" font-size="12" font-weight="800" text-anchor="end">' + fmt(last[1]) + '</text>';
    s += '<text x="' + pad + '" y="' + (H - 2) + '" font-size="9" fill="#888">' + esc(labels[0] || '') + '</text><text x="' + (W - pad) + '" y="' + (H - 2) + '" font-size="9" fill="#888" text-anchor="end">' + esc(labels[labels.length - 1] || '') + '</text>';
    return s + '</svg>';
  }

  // ------------------------------------------------------------------ modals
  function pickPitcherModal(title, onDone, withMode) {
    const roster = Store.roster().filter(r => r.pitcher);
    const seen = {}; const cands = [];
    roster.forEach(r => { const k = pitcherKey(r); if (!seen[k]) { seen[k] = 1; cands.push({ num: String(r.num), name: r.name || '', throws: r.throws || 'R' }); } });
    Store.penIndex().forEach(p => { const k = pitcherKey(p); if (!seen[k]) { seen[k] = 1; cands.push({ num: p.num || '', name: p.name || '' }); } });
    const M = { sel: null, sel2: null, num: '', name: '', date: J().today(), script: true };
    J().openModal({
      title,
      body: () => (withMode ? '<div class="row"><div><label class="f">Date</label><input class="txt" type="date" value="' + esc(M.date) + '" data-chg="ppDate"></div><div><label class="f">Mode</label>' +
        J().seg('ppMode', [[1, 'Pen script'], [0, 'Free pen']], M.script ? 1 : 0) + '</div></div>' : '') +
        '<div class="grp-lab">Pitcher' + (withMode ? ' (tap a second one to chart two at once)' : '') + '</div><div class="grid-btns">' +
        cands.map((c, i) => '<button class="btn ' + (M.sel === i || M.sel2 === i ? 'on' : '') + '" data-act="ppSel" data-v="' + i + '">' + (c.num ? '#' + esc(c.num) + ' ' : '') + esc(c.name) + '</button>').join('') + '</div>' +
        '<div class="grp-lab">…or someone new</div><div class="row"><input class="txt" style="width:80px" inputmode="numeric" placeholder="#" value="' + esc(M.num) + '" data-chg="ppNum"><input class="txt grow" style="width:auto" placeholder="Name" value="' + esc(M.name) + '" data-chg="ppName"></div>' +
        '<p class="muted">Pen script: gloveside FB → 6 heart-attack → 6 with a runner on 1st (stopwatch on) → 3 rounds racing to 2 strikes → simulated at-bat. Free pen: just chart.</p>',
      foot: () => '<button class="btn primary" data-act="ppGo">Start</button>',
      acts: {
        ppMode: el => { M.script = el.dataset.v === '1'; J().renderModal(); },
        ppSel: el => {
          const i = +el.dataset.v;
          if (M.sel === i) { M.sel = M.sel2; M.sel2 = null; } else if (M.sel2 === i) M.sel2 = null;
          else if (M.sel == null || !withMode) M.sel = i; else M.sel2 = i;
          J().renderModal();
        },
        ppGo: () => {
          const list = [];
          if (M.sel != null) list.push(cands[M.sel]);
          if (M.sel2 != null) list.push(cands[M.sel2]);
          if (M.name.trim() || M.num.trim()) list.push({ num: M.num.trim(), name: M.name.trim(), throws: 'R' });
          if (!list.length) { J().toast('Pick a pitcher'); return; }
          J().closeModal(); onDone(list.slice(0, withMode ? 2 : 1), M);
        }
      },
      chg: { ppNum: el => { M.num = el.value; }, ppName: el => { M.name = el.value; }, ppDate: el => { M.date = el.value; } }
    });
  }

  function editPitchModal(i) {
    const l = lane(); const pen = lanePen(l); const ev = pen.events.filter(e => e.t === 'pitch')[i]; if (!ev) return;
    const M = { type: ev.type, velo: ev.velo || '', strike: ev.strike, loc: ev.loc ? Object.assign({}, ev.loc) : null, ttp: ev.ttp != null ? String(ev.ttp) : '' };
    J().openModal({
      title: 'Pitch ' + (i + 1),
      body: () => '<div class="grp-lab">Pitch</div>' + J().seg('peT', [1, 3, 4, 2, 5, 0].map(t => [t, TS[t]]), M.type) +
        '<div class="grp-lab">Result</div>' + J().seg('peK', [[1, 'Strike'], [0, 'Ball']], M.strike ? 1 : 0) +
        '<div class="row" style="margin-top:10px"><div><label class="f">Velo</label><input class="txt" style="width:100px" inputmode="numeric" value="' + esc(M.velo) + '" data-chg="peV"></div>' +
        '<div><label class="f">Time to plate (s)</label><input class="txt" style="width:110px" inputmode="decimal" value="' + esc(M.ttp) + '" data-chg="peTTP"></div></div>' +
        '<div class="grp-lab">Location (tap to move)</div><div style="max-width:300px" id="pePad">' + penPadSVG(M.type, [], M.loc, ev.target, false) + '</div><button class="btn small" data-act="peNoLoc">No location</button>' +
        '<p class="muted">Target for this pitch: ' + esc(targetLabel(M.type, ev.target)) + '</p>',
      foot: () => '<button class="btn primary" data-act="peSave">Save</button>',
      after: () => { const svg = $('pePad') && $('pePad').querySelector('svg'); if (svg) svg.addEventListener('pointerdown', e => { M.loc = padPt(svg, e); J().renderModal(); }); },
      acts: {
        peT: el => { M.type = +el.dataset.v; J().renderModal(); },
        peK: el => { M.strike = el.dataset.v === '1'; J().renderModal(); },
        peNoLoc: () => { M.loc = null; J().renderModal(); },
        peSave: () => {
          ev.type = M.type; ev.strike = M.strike; ev.velo = M.velo ? +M.velo : null; ev.loc = M.loc; ev.ttp = M.ttp ? Math.round(parseFloat(M.ttp) * 100) / 100 : null;
          Store.savePen(pen); J().closeModal(); J().render(); J().toast('Pitch updated');
        }
      },
      chg: { peV: el => { M.velo = el.value.replace(/[^0-9]/g, ''); }, peTTP: el => { M.ttp = el.value.replace(/[^0-9.]/g, ''); } }
    });
  }

  function veloPad() {
    const M = { v: '' }; const l = lane();
    const save = () => { const n = +M.v; if (n >= 40 && n <= 110) { l.pend.velo = n; J().closeModal(); J().render(); } else J().toast('Velo should be 40–110'); };
    J().openModal({
      title: 'Velo',
      body: () => '<div class="kdisp">' + (M.v || '—') + '</div><div class="keypad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, '⌫'].map(k => '<button class="btn" data-act="kp" data-v="' + k + '">' + k + '</button>').join('') + '</div>',
      foot: () => '<button class="btn" data-act="kpNone">No velo</button><button class="btn primary" data-act="kpOk">Use</button>',
      acts: {
        kp: el => { const k = el.dataset.v; if (k === 'C') M.v = ''; else if (k === '⌫') M.v = M.v.slice(0, -1); else if (M.v.length < 3) M.v += k; J().renderModal(); if ((M.v.length === 2 && M.v[0] !== '1') || M.v.length === 3) save(); },
        kpOk: save, kpNone: () => { l.pend.velo = null; J().closeModal(); J().render(); }
      }
    });
  }

  // ------------------------------------------------------------------ stopwatch display
  let swRAF = null;
  function swTick() {
    const l = lane(); const d = $('swDisp');
    if (!l || !l.sw.t0 || !d) { swRAF = null; return; }
    d.textContent = ((performance.now() - l.sw.t0) / 1000).toFixed(2);
    swRAF = requestAnimationFrame(swTick);
  }

  // ------------------------------------------------------------------ actions
  function openSession(pens) {
    pens.forEach(pen => { if (!P.lanes.find(l => l.id === pen.id)) P.lanes.push(newLane(pen.id)); });
    P.lanes = P.lanes.filter(l => { const p = Store.loadPen(l.id); return p && p.status === 'live'; }).slice(-2);
    P.active = Math.max(0, P.lanes.findIndex(l => l.id === pens[0].id));
    J().go('penSession');
  }
  const acts = {
    goPens: () => J().go('pens'),
    penNew: () => pickPitcherModal('New bullpen', (list, M) => {
      const pens = list.map(c => newPen(M.date, { num: c.num, name: c.name, throws: c.throws || 'R' }, M.script));
      P.lanes = []; openSession(pens);
    }, true),
    penAddLane: () => {
      const cur = lanePen(lane());
      pickPitcherModal('Add a pitcher', list => { openSession([newPen(cur ? cur.date : J().today(), { num: list[0].num, name: list[0].name, throws: 'R' }, cur ? cur.script : true)]); }, false);
    },
    penLane: el => { P.active = +el.dataset.v; J().render(); },
    penResumeAll: () => { const live = Store.penIndex().filter(p => p.status === 'live').sort((a, b) => b.updated - a.updated).slice(0, 2).map(p => Store.loadPen(p.id)).filter(Boolean); P.lanes = []; openSession(live); },
    penResume: el => { const pen = Store.loadPen(el.dataset.id); if (!pen) return; pen.status = 'live'; Store.savePen(pen); openSession([pen]); },
    penView: el => { P.viewId = el.dataset.id; J().go('penView'); },
    penDel: el => J().confirmBox('Delete bullpen?', 'This removes the pen for good.', 'Delete', () => { Store.removePen(el.dataset.id); P.lanes = P.lanes.filter(l => l.id !== el.dataset.id); J().render(); }, true),
    penHistory: () => J().go('penHistory'),
    penHistPick: el => { P.histKey = el.dataset.v; J().render(); },
    penType: el => { const l = lane(); const t = +el.dataset.v; l.pend.type = t; if (l.target.kind === 'box' && !findBox(t, l.target.box)) l.target = { kind: 'any' }; J().render(); },
    penTarget: el => {
      const l = lane(); const v = el.dataset.v;
      if (v === 'any') { l.target = { kind: 'any' }; l.spotMode = false; }
      else if (v === 'spot') { l.target = { kind: 'spot', spot: l.target.kind === 'spot' ? l.target.spot : null }; l.spotMode = true; J().toast('Tap the spot the catcher set up on'); }
      else { l.target = { kind: 'box', box: v.slice(4) }; l.spotMode = false; }
      J().render();
    },
    penVelo: el => { const l = lane(); const v = +el.dataset.v; l.pend.velo = l.pend.velo === v ? null : v; J().render(); },
    penVeloPad: veloPad,
    penClearLoc: () => { lane().pend.loc = null; J().render(); },
    penSave: el => {
      const l = lane(); const pen = lanePen(l); if (!pen) return;
      if (l.pend.type == null) { J().toast('Pick the pitch'); return; }
      if (l.target.kind === 'spot' && !l.target.spot) { J().toast('Tap the called spot first (or pick another target)'); return; }
      if (l.sw.t0) { J().toast('Stop the stopwatch first'); return; }
      const ev = { t: 'pitch', type: l.pend.type, velo: l.pend.velo || null, loc: l.pend.loc || null, strike: el.dataset.v === '1', target: JSON.parse(JSON.stringify(l.target)), ttp: l.sw.val, ts: Date.now() };
      pen.events.push(ev);
      if (!Store.savePen(pen)) J().toast('⚠ Could not save — storage full');
      const st = derive(pen); const last = st.pitches[st.pitches.length - 1];
      l.pend.velo = null; l.pend.loc = null; l.sw.val = null;
      J().toast('#' + last.n + ' ' + TS[last.type] + (last.velo ? ' ' + last.velo : '') + ' · ' + (last.strike ? 'strike' : 'ball') + (last.hit === true ? ' · on target' : last.hit === false ? ' · missed target' : ''));
      J().render();
    },
    penUndo: () => {
      const l = lane(); const pen = lanePen(l); if (!pen || !pen.events.length) { J().toast('Nothing to undo'); return; }
      pen.events.pop(); Store.savePen(pen); l.lastPhase = null; J().toast('Undid last pitch'); J().render();
    },
    penSkip: () => { const l = lane(); const pen = lanePen(l); pen.events.push({ t: 'skip', ts: Date.now() }); Store.savePen(pen); J().render(); },
    penEdit: el => editPitchModal(+el.dataset.v),
    penTTPToggle: () => { const l = lane(); l.ttpOn = !l.ttpOn; J().render(); },
    penSW: () => {
      const l = lane();
      if (!l.sw.t0) { l.sw.t0 = performance.now(); l.sw.val = null; J().render(); if (!swRAF) swRAF = requestAnimationFrame(swTick); }
      else { l.sw.val = Math.round((performance.now() - l.sw.t0) / 10) / 100; l.sw.t0 = null; J().render(); }
    },
    penSWClear: () => { const l = lane(); l.sw.val = null; l.sw.t0 = null; J().render(); },
    penFinish: () => {
      const l = lane(); const pen = lanePen(l); if (!pen) return;
      J().confirmBox('Finish ' + (pen.pitcher.name || 'this pen') + '?', 'Marks the pen done. You can reopen it later.', 'Finish', () => {
        pen.status = 'done'; Store.savePen(pen);
        P.lanes.splice(P.active, 1); P.active = 0;
        if (P.lanes.length) J().render(); else { P.viewId = pen.id; J().go('penView'); }
      });
    },
    penPDF: el => { const pen = Store.loadPen(el.dataset.id); window.Exports.deliver([penPDF([pen], pen.date + '_' + slug(pen.pitcher.name || pen.pitcher.num) + '_bullpen.pdf')]); },
    penDayPDF: el => {
      const pens = Store.penIndex().filter(p => p.date === el.dataset.v).map(p => Store.loadPen(p.id)).filter(Boolean).sort((a, b) => (a.pitcher.name || '').localeCompare(b.pitcher.name || ''));
      window.Exports.deliver([penPDF(pens, el.dataset.v + '_bullpens.pdf')]);
    },
    penCSV: () => {
      const cols = ['date', 'pitcher_num', 'pitcher', 'pen_id', 'mode', 'pitch_no', 'script_step', 'round', 'count_before', 'pitch_type', 'velo', 'strike', 'loc_x', 'loc_y', 'in_zone', 'target', 'hit_target', 'time_to_plate'];
      const rows = [cols.join(',')];
      Store.penIndex().map(p => Store.loadPen(p.id)).filter(Boolean).sort((a, b) => (a.date || '').localeCompare(b.date || '')).forEach(pen => {
        derive(pen).pitches.forEach(p => rows.push([pen.date, pen.pitcher.num, pen.pitcher.name, pen.id, pen.script ? 'script' : 'free', p.n, p.phase || '', p.round || '', p.count || '', TS[p.type], p.velo || '', p.strike ? 1 : 0,
          p.loc ? p.loc.x.toFixed(3) : '', p.loc ? p.loc.y.toFixed(3) : '', p.loc ? (E.inZone(p.loc) ? 1 : 0) : '', targetLabel(p.type, p.target), p.hit === null ? '' : p.hit ? 1 : 0, p.ttp || '']
          .map(v => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')));
      });
      window.Exports.deliver([{ blob: new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv' }), name: 'SJF-bullpens_' + J().today() + '.csv' }]);
    }
  };

  document.addEventListener('pointerdown', e => {
    const pad = e.target.closest('#penpad');
    if (!pad || J().App.screen !== 'penSession') return;
    const l = lane(); const pt = padPt(pad, e);
    if (l.spotMode) { l.target = { kind: 'spot', spot: pt }; l.spotMode = false; }
    else l.pend.loc = pt;
    J().render();
  });
  window.addEventListener('resize', () => { if (J() && J().App.screen === 'penView') drawView(); });

  window.PenUI = {
    screens: { pens: pensHTML, penSession: sessionHTML, penView: viewHTML, penHistory: historyHTML },
    after: () => { const sc = J().App.screen; if (sc === 'penView') drawView(); if (sc === 'penSession' && lane() && lane().sw.t0 && !swRAF) swRAF = requestAnimationFrame(swTick); },
    acts, derive, penStats, evalHit, drawPenSheet, BOXES, P
  };
})();
