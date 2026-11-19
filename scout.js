/* Hitter breakdown for pitch-calling: everything a hitter has done against us,
   shown before his next at-bat. */
(function () {
  'use strict';
  const E = window.Engine, Store = window.Store;
  const TS = { 1: 'FB', 2: 'CB', 3: 'SL', 4: 'CH', 5: 'OT', 0: '?' };
  const TCOL = { 1: '#C62828', 2: '#1565C0', 3: '#2E7D32', 4: '#E65100', 5: '#6A1B9A', 0: '#616161' };
  const HIT = ['1B', '2B', '3B', 'HR'];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const unknown = pid => pid == null || String(pid).charAt(0) === '?';
  const cache = {}, loaded = {};
  function replayCached(g) {
    const k = g.updated + ':' + g.events.length;
    if (cache[g.id] && cache[g.id].k === k) return cache[g.id].S;
    const S = E.replay(g); cache[g.id] = { k, S }; return S;
  }

  // Every PA this hitter has had against us. side = his team's side in this game.
  function hitterPAs(game, S, side, pid, includeAll) {
    if (unknown(pid)) return [];
    const out = [];
    S.pas.filter(pa => pa.side === side && pa.batter === pid && (pa.complete || pa.pitches.length)).forEach(pa => out.push({ pa, g: game, today: true }));
    if (includeAll) {
      const num = String(E.player(game, side, pid).num), team = String(game[side].name || '').trim().toUpperCase();
      Store.index().forEach(ix => {
        if (ix.id === game.id) return;
        let g2 = loaded[ix.id] && loaded[ix.id].u === ix.updated ? loaded[ix.id].g : null;
        if (!g2) { g2 = Store.load(ix.id); if (!g2) return; loaded[ix.id] = { u: ix.updated, g: g2 }; }
        const sd = ['home', 'away'].find(x => String(g2[x].name || '').trim().toUpperCase() === team && x !== g2.sjfSide);
        if (!sd) return;
        const S2 = replayCached(g2);
        S2.pas.filter(pa => pa.side === sd && !unknown(pa.batter) && String(E.player(g2, sd, pa.batter).num) === num && (pa.complete || pa.pitches.length))
          .forEach(pa => out.push({ pa, g: g2, today: false }));
      });
    }
    // most recent first: today's ABs (latest first), then earlier games by date
    const todays = out.filter(x => x.today).reverse();
    const older = out.filter(x => !x.today).sort((a, b) => (b.g.date || '').localeCompare(a.g.date || '') || (b.pa.inning - a.pa.inning));
    return todays.concat(older);
  }

  function summarize(list) {
    const s = { pa: 0, ab: list.length, fp: 0, fpSwing: 0, fpDetail: [], by: {}, whiffs: [], twoK: { seen: 0, whiff: 0, foul: 0, take: 0, inPlay: 0 }, outPitches: [], bip: [], hits: 0, k: 0, bb: 0 };
    list.forEach(({ pa }) => {
      if (pa.complete) s.pa++;
      const ps = pa.pitches;
      if (ps.length) {
        s.fp++;
        const f = ps[0]; if (f.offered) s.fpSwing++;
        s.fpDetail.push({ type: f.type, res: f.res });
      }
      ps.forEach((p, i) => {
        const b = (s.by[p.type] = s.by[p.type] || { seen: 0, swing: 0, whiff: 0, foul: 0, take: 0, cs: 0, ip: 0, hit: 0 });
        b.seen++;
        if (p.offered) b.swing++;
        if (p.whiff) { b.whiff++; s.whiffs.push({ type: p.type, count: p.b + '-' + p.s }); }
        if (p.res === 'F' || p.res === 'FB') b.foul++;
        if (!p.offered) { b.take++; if (p.res === 'CS') b.cs++; }
        if (p.res === 'IP') { b.ip++; if (pa.result && HIT.includes(pa.result.code)) b.hit++; }
        if (p.s === 2) {
          s.twoK.seen++;
          if (p.whiff) s.twoK.whiff++; else if (p.res === 'F' || p.res === 'FB') s.twoK.foul++; else if (p.res === 'IP') s.twoK.inPlay++; else s.twoK.take++;
        }
        if (i === ps.length - 1 && pa.complete && pa.result) {
          if (pa.result.code === 'K') s.outPitches.push({ type: p.type, looking: pa.result.looking, count: p.b + '-' + p.s });
          if (p.res === 'IP') s.bip.push({ type: p.type, count: p.b + '-' + p.s, res: pa.result });
        }
      });
      if (pa.complete && pa.result) {
        if (HIT.includes(pa.result.code)) s.hits++;
        if (pa.result.code === 'K') s.k++;
        if (['BB', 'IBB', 'HBP'].includes(pa.result.code)) s.bb++;
      }
    });
    return s;
  }

  // ---- display helpers
  const resShort = { B: 'Ball', CS: 'Called', SW: 'Whiff', F: 'Foul', FT: 'Foul tip', FB: 'Foul bunt', MB: 'Miss bunt', IP: 'In play', HBP: 'HBP' };
  function resultText(pa) {
    if (!pa.complete) return pa.endedInning ? 'inning ended during AB' : 'in progress';
    const r = pa.result; if (!r) return '';
    if (r.code === 'K') return r.looking ? 'Strikeout looking' : 'Strikeout swinging';
    const bb = { GB: 'grounder', LD: 'liner', FB: 'fly ball', PU: 'pop up', BU: 'bunt' }[r.bb];
    return (r.notation || r.code) + (bb ? ' · ' + bb : '');
  }
  function chip(p, pa, isLast) {
    const col = TCOL[p.type];
    let cls = 'sc-chip';
    if (p.whiff) cls += ' wh'; else if (p.res === 'IP') cls += ' ip'; else if (p.res === 'CS') cls += ' cs'; else if (p.offered) cls += ' sw';
    let lab = resShort[p.res] || p.res;
    if (p.res === 'IP' && isLast && pa.result) lab = pa.result.notation || 'In play';
    return '<span class="' + cls + '"><span class="ct">' + p.b + '-' + p.s + '</span><b style="color:' + (p.whiff || p.res === 'IP' ? '#fff' : col) + '">' + TS[p.type] + '</b> ' + esc(lab) + '</span>';
  }
  function pct(n, d) { return d ? Math.round(100 * n / d) + '%' : '—'; }

  // mini spray field for his balls in play (same scaled field as the sheet)
  const FPOS_FT = { 1: [0, 60.5], 2: [0, -12], 3: [67.7, 86.7], 4: [36.3, 145.5], 5: [-67.7, 86.7], 6: [-36.3, 145.5], 7: [-136, 256], 8: [0, 315], 9: [136, 256] };
  function spraySVG(list) {
    const K = 92 / 380, HX = 70, HY = 104;
    const X = x => HX + x * K, Y = y => HY - y * K, pt = (x, y) => X(x).toFixed(1) + ',' + Y(y).toFixed(1);
    let s = '<svg viewBox="0 0 140 110" class="sc-spray">';
    const fence = []; for (let a = -45; a <= 45; a += 5) { const r = a * Math.PI / 180, d = 330 + 70 * Math.cos(2 * r); fence.push(pt(d * Math.sin(r), d * Math.cos(r))); }
    s += '<polygon points="' + pt(0, 0) + ' ' + fence.join(' ') + '" fill="#e6f0e2" stroke="#9cbf94" stroke-width="0.8"/>';
    const dirt = [pt(0, 0), pt(90.2, 90.2)]; for (let a = 18; a <= 162; a += 8) { const r = a * Math.PI / 180; dirt.push(pt(95 * Math.cos(r), 60.5 + 95 * Math.sin(r))); } dirt.push(pt(-90.2, 90.2));
    s += '<polygon points="' + dirt.join(' ') + '" fill="#efe2cf" stroke="#d3bf9c" stroke-width="0.4"/>';
    s += '<polygon points="' + [pt(0, 0), pt(63.6, 63.6), pt(0, 127.3), pt(-63.6, 63.6)].join(' ') + '" fill="none" stroke="#fff" stroke-width="0.8"/>';
    let n = 0;
    list.forEach(({ pa, today }) => {
      if (!pa.complete || !pa.result || !pa.result.kind) return;
      const r = pa.result;
      let end = r.spray && r.spray.xft != null ? [r.spray.xft, r.spray.yft] : (r.fielders && r.fielders.length ? FPOS_FT[r.fielders[0]] : null);
      if (!end) return;
      n++;
      const hit = HIT.includes(r.code);
      const col = hit ? '#C62828' : (r.code === 'E' || r.code === 'FC') ? '#E65100' : '#15171a';
      const ex = X(end[0]), ey = Y(end[1]), op = today ? 1 : 0.45;
      if (r.bb === 'FB' || r.bb === 'PU') {
        const mx = (HX + ex) / 2, my = (HY + ey) / 2, len = Math.hypot(ex - HX, ey - HY);
        let nx = (ey - HY) / (len || 1), ny = -(ex - HX) / (len || 1);
        if ((ex < HX && nx < 0) || (ex >= HX && nx > 0)) { nx = -nx; ny = -ny; }
        const k = len * (r.bb === 'PU' ? 0.4 : 0.22);
        s += '<path d="M' + HX + ',' + HY + ' Q' + (mx + nx * k).toFixed(1) + ',' + (my + ny * k).toFixed(1) + ' ' + ex.toFixed(1) + ',' + ey.toFixed(1) + '" fill="none" stroke="' + col + '" stroke-width="1.3" opacity="' + op + '"/>';
      } else {
        s += '<line x1="' + HX + '" y1="' + HY + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '" stroke="' + col + '" stroke-width="1.3" ' + (r.bb === 'GB' || r.bb === 'BU' ? 'stroke-dasharray="2.2 1.8"' : '') + ' opacity="' + op + '"/>';
      }
      s += '<circle cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="2.2" fill="' + col + '" opacity="' + op + '"/>';
    });
    if (!n) s += '<text x="70" y="60" font-size="7" text-anchor="middle" fill="#888">No balls in play yet</text>';
    return s + '</svg>';
  }

  function byTypeTable(s) {
    const types = [1, 3, 2, 4, 5, 0].filter(t => s.by[t]);
    if (!types.length) return '';
    return '<table class="sc-tab"><tr><th></th><th>Seen</th><th>Swing</th><th>Whiff</th><th>Foul</th><th>Took K</th><th>In play</th><th>Hits</th></tr>' +
      types.map(t => { const b = s.by[t]; return '<tr><td style="color:' + TCOL[t] + ';font-weight:900">' + TS[t] + '</td><td>' + b.seen + '</td><td>' + b.swing + '</td><td class="' + (b.whiff ? 'hl' : '') + '">' + b.whiff + '</td><td>' + b.foul + '</td><td>' + b.cs + '</td><td>' + b.ip + '</td><td class="' + (b.hit ? 'hl2' : '') + '">' + b.hit + '</td></tr>'; }).join('') + '</table>';
  }
  function countTypes(arr) { const m = {}; arr.forEach(x => { m[x.type] = (m[x.type] || 0) + 1; }); return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([t, n]) => TS[t] + (n > 1 ? ' ×' + n : '')).join(', '); }

  // ---- big panel for the current hitter
  function panelHTML(game, S, side, pid, slot, opts) {
    const g = game, all = !!opts.all;
    const p = E.player(g, side, pid);
    const listToday = hitterPAs(g, S, side, pid, false);
    const list = all ? hitterPAs(g, S, side, pid, true) : listToday;
    const older = all ? list.length - listToday.length : 0;
    const s = summarize(list);
    let h = '<div class="scout">';
    h += '<div class="sc-head"><div class="grow"><div class="lab">Breakdown · now batting · ' + (slot + 1) + E.ordinal(slot + 1) + '</div><div class="who">' + (unknown(pid) ? 'Unknown hitter' : '#' + esc(p.num) + ' ' + esc(p.name || '')) + ' <span class="hand">' + esc(opts.hand === 'L' ? 'LHH' : 'RHH') + '</span></div></div>' +
      '<div class="seg"><button data-act="scoutAll" data-v="0" class="' + (all ? '' : 'on') + '">Today</button><button data-act="scoutAll" data-v="1" class="' + (all ? 'on' : '') + '">All games' + (all ? ' (' + older + ' earlier)' : '') + '</button></div></div>';
    if (unknown(pid)) return h + '<div class="muted" style="padding:10px 0">Enter his number to see his history.</div></div>';
    if (!list.length) return h + '<div class="sc-empty">First look' + (all ? ' — no earlier at-bats against us' : ' today — tap <b>All games</b> to check earlier games') + '.</div></div>';
    // quick read tiles
    const fpTxt = s.fp ? s.fpSwing + ' of ' + s.fp : '—';
    const fpDetail = s.fpDetail.map(d => TS[d.type] + ' ' + (resShort[d.res] || d.res).toLowerCase()).join(', ');
    h += '<div class="sc-tiles">' +
      '<div class="sc-tile"><div class="k">1st pitch swing</div><div class="v">' + fpTxt + '</div><div class="d">' + esc(fpDetail) + '</div></div>' +
      '<div class="sc-tile ' + (s.whiffs.length ? 'warn' : '') + '"><div class="k">Swing &amp; miss</div><div class="v">' + s.whiffs.length + '</div><div class="d">' + esc(s.whiffs.map(w => TS[w.type] + ' (' + w.count + ')').join(', ') || 'none yet') + '</div></div>' +
      '<div class="sc-tile"><div class="k">With 2 strikes</div><div class="v">' + (s.twoK.seen ? s.twoK.whiff + ' whiff / ' + s.twoK.foul + ' foul' : '—') + '</div><div class="d">' + (s.twoK.seen ? s.twoK.seen + ' pitches · ' + s.twoK.take + ' taken · ' + s.twoK.inPlay + ' in play' : 'never got to 2 strikes') + (s.outPitches.length ? ' · K on ' + esc(countTypes(s.outPitches)) : '') + '</div></div>' +
      '<div class="sc-tile ' + (s.hits ? 'hot' : '') + '"><div class="k">Results</div><div class="v">' + s.hits + ' H · ' + s.k + ' K · ' + s.bb + ' BB</div><div class="d">' + s.pa + ' PA' + (all ? ' (' + listToday.filter(x => x.pa.complete).length + ' today)' : '') + '</div></div></div>';
    // balls in play + spray + by pitch
    h += '<div class="sc-mid"><div class="sc-sp">' + spraySVG(list) + '<div class="sc-leg"><span style="color:#C62828">● hit</span> <span>● out</span> <span style="color:#E65100">● E/FC</span> · curved fly · straight liner · dotted grounder' + (all ? ' · faded = earlier game' : '') + '</div></div>' +
      '<div class="grow">' + byTypeTable(s) +
      (s.bip.length ? '<div class="sc-bip"><b>Put in play:</b> ' + s.bip.map(b => '<span><b style="color:' + TCOL[b.type] + '">' + TS[b.type] + '</b> ' + b.count + ' → ' + esc(b.res.notation || b.res.code) + (b.res.bb ? ' ' + b.res.bb : '') + '</span>').join(' · ') + '</div>' : '') + '</div></div>';
    // every AB pitch by pitch
    h += '<div class="sc-abs">' + list.map(({ pa, g: gg, today }) => {
      const pp = E.player(gg, pa.fside, pa.pitcher);
      const head = (today ? 'Today' : esc(window.ChartRender.fmtDate(gg.date))) + ' · ' + (pa.half === 'top' ? 'T' : 'B') + pa.inning + ' · vs ' + esc(pp.name || ('#' + pp.num)) + ' · <b>' + esc(resultText(pa)) + '</b>';
      return '<div class="sc-ab' + (today ? '' : ' old') + '"><div class="sc-abh">' + head + '</div><div class="sc-seq">' + pa.pitches.map((p, i) => chip(p, pa, i === pa.pitches.length - 1)).join('') + (pa.events.length ? '<span class="sc-ev">' + esc(pa.events.map(e => e.desc).join(', ')) + '</span>' : '') + '</div></div>';
    }).join('') + '</div>';
    return h + '</div>';
  }

  // ---- compact preview for the on-deck hitter
  function deckHTML(game, S, side, pid, slot, all, label) {
    const p = E.player(game, side, pid);
    let h = '<div class="sc-deck"><div class="lab">' + esc(label || 'On deck') + ' · ' + (slot + 1) + E.ordinal(slot + 1) + '</div>';
    if (unknown(pid)) return h + '<div class="who">Unknown hitter</div></div>';
    const list = hitterPAs(game, S, side, pid, all);
    const s = summarize(list);
    h += '<div class="who">#' + esc(p.num) + ' ' + esc(p.name || '') + ' <span class="muted">(' + esc(p.bats || 'R') + ')</span></div>';
    if (!list.length) return h + '<div class="d">First look' + (all ? '' : ' today') + '</div></div>';
    h += '<div class="d"><b>' + esc(list.filter(x => x.pa.complete).map(x => resultText(x.pa).split(' · ')[0]).join(', ')) + '</b></div>' +
      '<div class="d">1st pitch swing ' + s.fpSwing + '/' + s.fp + ' · whiffs: ' + esc(s.whiffs.map(w => TS[w.type]).join(', ') || 'none') + (s.bip.length ? ' · hit: ' + esc(s.bip.map(b => TS[b.type] + '→' + (b.res.notation || b.res.code)).join(', ')) : '') + '</div>';
    const last = list[0];
    if (last) h += '<div class="sc-seq">' + last.pa.pitches.map((pp, i) => chip(pp, last.pa, i === last.pa.pitches.length - 1)).join('') + '</div>';
    return h + '</div>';
  }

  window.Scout = { hitterPAs, summarize, panelHTML, deckHTML, spraySVG };
})();
