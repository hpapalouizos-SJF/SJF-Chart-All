/* Exports: Synergy chart PDF (one per pitching team), pitch-by-pitch CSV,
   post-game staff report PDF, JSON backup. Delivered through the iPad share sheet. */
(function (root) {
  'use strict';
  const E = root.Engine, R = root.ChartRender;
  const TN = E.PITCH_TYPES;

  function newDoc(w, h) { return new root.jspdf.jsPDF({ unit: 'pt', format: [w, h], compress: true }); }

  function slug(s) { return String(s || '').trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
  function baseName(game) {
    return game.date + '_' + slug(game.away.name) + '-at-' + slug(game.home.name);
  }

  function chartPDF(game, S, fside) {
    const doc = newDoc(R.PAGE.W, R.PAGE.H);
    const n = R.chartPages(S, fside);
    for (let p = 0; p < n; p++) {
      if (p) doc.addPage([R.PAGE.W, R.PAGE.H]);
      R.drawChart(R.pdfPainter(doc), S, game, fside, p);
    }
    doc.setProperties({ title: game[fside].name + ' pitching chart ' + game.date, creator: 'SJF Pitch Chart' });
    return {
      blob: doc.output('blob'),
      name: baseName(game) + '_' + slug(game[fside].name) + '-pitching_chart.pdf'
    };
  }

  // ------------------------------------------------------------- CSV
  function csvCell(v) {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function csv(game, S) {
    const cols = ['game_date', 'away_team', 'home_team', 'inning', 'half', 'batting_team', 'pitching_team', 'pa_seq',
      'lineup_slot', 'batter_num', 'batter_name', 'batter_hand', 'pitcher_num', 'pitcher_name', 'pitcher_throws',
      'row_type', 'pitch_of_pa', 'pitcher_pitch_count', 'balls_before', 'strikes_before', 'outs_before',
      'runner_1b', 'runner_2b', 'runner_3b', 'pitch_type_code', 'pitch_type', 'velo', 'loc_x', 'loc_y', 'in_zone', 'zone_1_14',
      'location', 'pitch_result', 'swing', 'whiff', 'pa_result', 'notation', 'batted_ball', 'spray_x', 'spray_y', 'runs_on_play',
      'runner_event', 'pa_note'];
    const rows = [cols.join(',')];
    const pas = S.pas.slice(); if (S.cur) pas.push(S.cur);
    pas.forEach((pa, i) => {
      const bt = game[pa.side].name, pt = game[pa.fside].name;
      const b = E.player(game, pa.side, pa.batter);
      const base = (pid) => { const p = E.player(game, pa.fside, pid); return [p.num, p.name, p.throws || 'R']; };
      const common = (pid) => [game.date, game.away.name, game.home.name, pa.inning, pa.half, bt, pt, i + 1, pa.slot + 1, b.num, b.name, pa.hand].concat(base(pid));
      // merge pitches, automatic balls/strikes and runner events in order
      const items = [];
      pa.pitches.forEach((p, k) => items.push({ at: k, ord: 1, p }));
      pa.autos.forEach(a => items.push({ at: a.at - 0.5, ord: 0, a }));
      pa.events.forEach(ev => items.push({ at: ev.at - 0.25, ord: 2, ev }));
      items.sort((x, y) => x.at - y.at || x.ord - y.ord);
      const lastPitchIdx = pa.pitches.length - 1;
      if (!items.length && pa.result) items.push({ at: 0, ord: 3, ibb: true });
      items.forEach(it => {
        let r;
        if (it.p) {
          const p = it.p; const isLast = it.at === lastPitchIdx && pa.complete;
          r = common(p.pitcher).concat(['pitch', p.n, p.pc, p.b, p.s, p.outs, p.bases[0] ? 1 : 0, p.bases[1] ? 1 : 0, p.bases[2] ? 1 : 0,
            p.type, TN[p.type], p.velo || '', p.loc ? p.loc.x.toFixed(3) : '', p.loc ? p.loc.y.toFixed(3) : '',
            p.zone === null ? '' : p.zone ? 1 : 0, E.zoneNumber(p.loc), E.locWords(p.loc, p.hand), E.RESULTS[p.res],
            p.swing ? 1 : 0, p.whiff ? 1 : 0,
            isLast ? pa.result.code + (pa.result.looking ? ' (looking)' : '') : '', isLast ? pa.result.notation : '',
            isLast ? (pa.result.bb || '') : '', isLast && pa.result.spray ? pa.result.spray.x.toFixed(3) : '', isLast && pa.result.spray ? pa.result.spray.y.toFixed(3) : '',
            isLast ? pa.runsOnPlay : '', '', isLast ? pa.notes.join(' | ') : '']);
        } else if (it.a) {
          r = common(pa.pitcher).concat(['automatic', '', '', it.a.b, it.a.s, '', '', '', '', '', '', '', '', '', '', '', '', it.a.res === 'B' ? 'Automatic ball' : 'Automatic strike', '', '', '', '', '', '', '', '', '', '']);
        } else if (it.ev) {
          r = common(pa.pitcher).concat(['runner_event', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', it.ev.desc, '']);
        } else {
          r = common(pa.pitcher).concat(['no_pitch_pa', '', '', '', '', pa.startOuts, '', '', '', '', '', '', '', '', '', '', '', '', '', '', pa.result.code, pa.result.notation, '', '', '', pa.runsOnPlay, '', pa.notes.join(' | ')]);
        }
        rows.push(r.map(csvCell).join(','));
      });
      if (!pa.complete && pa.endedInning) {
        const r = common(pa.pitcher).concat(['pa_incomplete', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 'inning ended during PA', '', '', '', '', '', '']);
        rows.push(r.map(csvCell).join(','));
      }
    });
    return { blob: new Blob(['﻿' + rows.join('\r\n')], { type: 'text/csv' }), name: baseName(game) + '_pitch-by-pitch.csv' };
  }

  // ------------------------------------------------------------- staff report
  const fmtPct = (n, d) => (d ? Math.round((100 * n) / d) + '%' : '—');

  function reportPDF(game, S, settings, fside) {
    fside = fside || game.sjfSide;
    const team = game[fside], opp = game[E.other(fside)];
    const doc = newDoc(612, 792);
    const st = E.pitchingStats(S, game, fside);
    const T = st.team;
    const red = '#9D2235', gold = '#F1BE48';
    const M = 30; let y = 0;

    doc.setFillColor(red); doc.rect(0, 0, 612, 70, 'F');
    doc.setFillColor(gold); doc.rect(0, 70, 612, 4, 'F');
    if (root.SJF_LOGO) { doc.setFillColor('#FFFFFF'); doc.roundedRect(M - 4, 9, 56, 54, 6, 6, 'F'); try { doc.addImage(root.SJF_LOGO, 'PNG', M - 1, 11, 51, 49); } catch (e) { /* */ } }
    doc.setTextColor('#FFFFFF'); doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
    doc.text((team.name || '').toUpperCase() + ' PITCHING REPORT', M + 64, 34);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
    const sc = game.away.name + ' ' + S.score.away + ' @ ' + game.home.name + ' ' + S.score.home;
    doc.text(sc + '   ·   ' + R.fmtDate(game.date) + '   ·   ' + (S.final ? 'Final' : 'In progress (' + (S.half === 'top' ? 'Top ' : 'Bot ') + S.inning + ')'), M + 64, 54);
    y = 96;

    // pillar tiles
    const tiles = [
      { k: '0-0 STRIKES', v: fmtPct(T.fpStrike, T.fp), d: T.fpStrike + ' of ' + T.fp + ' first pitches', tgt: settings.tgtFps, val: T.fp ? 100 * T.fpStrike / T.fp : null, hi: true },
      { k: 'LEADOFF OUTS', v: T.lo ? T.loOut + '/' + T.lo : '—', d: fmtPct(T.loOut, T.lo) + ' of innings', tgt: settings.tgtLo, val: T.lo ? 100 * T.loOut / T.lo : null, hi: true },
      { k: 'SPIN IT TO WIN IT', v: fmtPct(T.spin, T.pitches), d: 'CB/SL usage · ' + fmtPct(T.spinStrike, T.spin) + ' strikes' },
      { k: 'CHASE / WHIFF', v: fmtPct(T.oozSwing, T.ooz) + ' / ' + fmtPct(T.whiffs, T.swings), d: T.oozWhiff + ' chase whiffs · ' + T.whiffs + ' total whiffs' },
      { k: 'GIVE NO ROOM', v: String(T.freeBases), d: 'free bases (standard ' + settings.fbStd + ')', tgt: settings.fbStd, val: T.freeBases, hi: false }
    ];
    const tw = (612 - 2 * M - 4 * 8) / 5;
    tiles.forEach((t, i) => {
      const x = M + i * (tw + 8);
      let col = '#F4F4F6', bord = '#D5D8DD';
      if (t.tgt !== '' && t.tgt != null && t.val != null) {
        const ok = t.hi ? t.val >= +t.tgt : t.val <= +t.tgt;
        col = ok ? '#EEF8F1' : '#FDF1F0'; bord = ok ? '#8CC79E' : '#E9A39C';
      }
      doc.setFillColor(col); doc.setDrawColor(bord); doc.setLineWidth(1); doc.roundedRect(x, y, tw, 64, 6, 6, 'FD');
      doc.setTextColor('#4A4F57'); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text(t.k, x + 8, y + 14);
      doc.setTextColor('#15171A'); doc.setFontSize(19); doc.text(t.v, x + 8, y + 38);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor('#4A4F57');
      doc.text(doc.splitTextToSize(t.d, tw - 14)[0], x + 8, y + 54);
    });
    y += 84;
    const fbBits = ['BB ' + T.bb, 'HBP ' + T.hbp, 'WP ' + T.wp, 'PB ' + T.pb, 'SB ' + T.sb, 'BK ' + T.bk].join('   ');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor('#15171A');
    doc.text('Free bases: ' + fbBits + '      Team: ' + T.pitches + ' pitches · ' + fmtPct(T.strikes, T.pitches) + ' strikes · ' + T.k + ' K · ' + T.h + ' H · ' + T.r + ' R', M, y);
    y += 18;

    // pitcher table
    const cols = [['Pitcher', 118, 'l'], ['IP', 26], ['P', 26], ['Str%', 30], ['BF', 24], ['H', 20], ['R', 20], ['BB', 22], ['HBP', 26], ['K', 20], ['0-0 S', 32], ['LO', 28], ['Whiff', 32], ['Chase', 33], ['FrB', 26], ['FB velo', 48]];
    const head = (yy) => {
      doc.setFillColor('#15171A'); doc.rect(M, yy - 11, 612 - 2 * M, 16, 'F');
      doc.setTextColor('#FFFFFF'); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5);
      let x = M + 4; cols.forEach(([t, w, a]) => { doc.text(t, a === 'l' ? x : x + w - 4, yy, { align: a === 'l' ? 'left' : 'right' }); x += w; });
    };
    head(y); y += 16;
    const rowsData = st.lines.map(l => {
      const p = E.player(game, fside, l.pid);
      const fb = E.veloSummary((l.types[1] || {}).velos);
      return ['#' + p.num + ' ' + (p.name || ''), E.ipStr(l.outs), l.pitches, fmtPct(l.strikes, l.pitches), l.bf, l.h, l.r, l.bb, l.hbp, l.k,
        l.fp ? l.fpStrike + '/' + l.fp : '—', l.lo ? l.loOut + '/' + l.lo : '—', fmtPct(l.whiffs, l.swings), fmtPct(l.oozSwing, l.ooz), l.freeBases, fb ? fb.avg.toFixed(1) + ' (' + fb.max + ')' : '—'];
    });
    rowsData.push(['TEAM', E.ipStr(T.outs), T.pitches, fmtPct(T.strikes, T.pitches), T.bf, T.h, T.r, T.bb, T.hbp, T.k, T.fp ? T.fpStrike + '/' + T.fp : '—', T.lo ? T.loOut + '/' + T.lo : '—', fmtPct(T.whiffs, T.swings), fmtPct(T.oozSwing, T.ooz), T.freeBases, '']);
    rowsData.forEach((r, i) => {
      const last = i === rowsData.length - 1;
      if (i % 2 === 0 && !last) { doc.setFillColor('#F5F5F7'); doc.rect(M, y - 11, 612 - 2 * M, 16, 'F'); }
      if (last) { doc.setDrawColor('#15171A'); doc.setLineWidth(0.8); doc.line(M, y - 11, 612 - M, y - 11); }
      doc.setTextColor('#15171A'); doc.setFont('helvetica', last ? 'bold' : 'normal'); doc.setFontSize(8.2);
      let x = M + 4; cols.forEach(([, w, a], j) => { doc.text(String(r[j]), a === 'l' ? x : x + w - 4, y, { align: a === 'l' ? 'left' : 'right' }); x += w; });
      y += 16;
    });
    y += 10;

    // pitch mix per pitcher
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(red); doc.text('PITCH MIX', M, y); y += 6;
    const colW = (612 - 2 * M - 12) / 2;
    let cx = M, cy = y, colMaxY = y;
    st.lines.forEach((l, idx) => {
      const p = E.player(game, fside, l.pid);
      const types = [1, 2, 3, 4, 5, 0].filter(t => l.types[t]);
      const h = 30 + types.length * 12;
      if (idx % 2 === 0 && idx) { cy = colMaxY + 8; }
      cx = M + (idx % 2) * (colW + 12);
      if (cy + h > 700) return;
      doc.setDrawColor('#D5D8DD'); doc.setLineWidth(0.8); doc.roundedRect(cx, cy + 4, colW, h, 5, 5, 'S');
      doc.setTextColor('#15171A'); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
      doc.text('#' + p.num + ' ' + (p.name || '') + '  ·  ' + l.pitches + ' P', cx + 8, cy + 17);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor('#4A4F57');
      const hx = [cx + 8, cx + 70, cx + 100, cx + 132, cx + 168, cx + 206, cx + colW - 8];
      ['Pitch', '#', 'Use', 'Str%', 'Whiff', 'Avg', 'Range'].forEach((t, i) => doc.text(t, hx[i], cy + 29, { align: i === 0 ? 'left' : 'right' }));
      let yy = cy + 41;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor('#15171A');
      types.forEach(t => {
        const d = l.types[t]; const v = E.veloSummary(d.velos);
        const lab = TN[t] + (t === 5 && p.ot ? ' (' + p.ot + ')' : '');
        [lab, d.n, fmtPct(d.n, l.pitches), fmtPct(d.strikes, d.n), fmtPct(d.whiffs, d.swings), v ? v.avg.toFixed(1) : '—', v ? v.min + '-' + v.max : '—']
          .forEach((tx, i) => doc.text(String(tx), hx[i], yy, { align: i === 0 ? 'left' : 'right' }));
        yy += 12;
      });
      colMaxY = Math.max(colMaxY, cy + 4 + h);
    });
    y = colMaxY + 16;

    // free-base log
    const fbLog = [];
    S.pas.forEach(pa => {
      if (pa.fside !== fside) return;
      if (pa.complete && ['BB', 'IBB', 'HBP'].includes(pa.result.code)) {
        const pp = E.player(game, fside, pa.chargedPitcher);
        fbLog.push('Inn ' + pa.inning + ': ' + (pa.result.code === 'IBB' ? 'IBB' : pa.result.code) + ' (' + (pp.name || '#' + pp.num) + ')');
      }
      pa.events.forEach(ev => { if (['WP', 'PB', 'BK', 'SB'].includes(ev.kind)) { const pp = E.player(game, fside, ev.pitcher || pa.pitcher); fbLog.push('Inn ' + pa.inning + ': ' + ev.kind + ' (' + (pp.name || '#' + pp.num) + ')'); } });
    });
    if (y < 735) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(red); doc.text('FREE BASES LOG', M, y); y += 13;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor('#15171A');
      const txt = fbLog.length ? fbLog.join('   ·   ') : 'None — gave no room.';
      doc.splitTextToSize(txt, 612 - 2 * M).slice(0, Math.max(1, Math.floor((752 - y) / 10))).forEach(line => { doc.text(line, M, y); y += 10; });
    }
    doc.setFontSize(6.5); doc.setTextColor('#6B7078');
    doc.text('0-0 strikes = first pitch of the PA was a strike (called, swinging, foul or in play). Leadoff outs = leadoff batter of the inning retired. Chase = swings at located pitches outside the zone; Whiff = misses / swings. ' +
      'Free bases = BB + HBP + WP + PB + SB + BK. Runs follow the runner (inherited runners are charged to the pitcher who put them on). Opponent: ' + (opp.name || '') + '.', M, 772, { maxWidth: 612 - 2 * M });
    return { blob: doc.output('blob'), name: baseName(game) + '_' + slug(team.name) + '-staff-report.pdf' };
  }

  function backup(game) {
    return { blob: new Blob([JSON.stringify({ kind: 'sjf-chart-game', v: 1, game }, null, 1)], { type: 'application/json' }), name: baseName(game) + '_backup.json' };
  }
  function backupAll(data) {
    return { blob: new Blob([JSON.stringify(data)], { type: 'application/json' }), name: 'SJF-chart-all-data_' + new Date().toISOString().slice(0, 10) + '.json' };
  }

  // ------------------------------------------------------------- deliver
  async function deliver(files) {
    const fl = files.map(f => new File([f.blob], f.name, { type: f.blob.type || 'application/octet-stream' }));
    if (navigator.canShare && navigator.share) {
      try {
        if (navigator.canShare({ files: fl })) { await navigator.share({ files: fl }); return 'shared'; }
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
      }
    }
    // fallback: plain download
    for (const f of files) {
      const url = URL.createObjectURL(f.blob);
      const a = document.createElement('a'); a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
    return 'downloaded';
  }

  root.Exports = { chartPDF, csv, reportPDF, backup, backupAll, deliver, baseName };
})(window);
