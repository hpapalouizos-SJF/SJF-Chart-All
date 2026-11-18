/* Draws the Synergy-style pitch chart. Same drawing code feeds the in-app
   Sheet view (canvas) and the exported PDF (jsPDF), so what you see is what Synergy gets. */
(function (root) {
  'use strict';
  const E = root.Engine;

  // ----- painters
  function pdfPainter(doc) {
    const setStroke = c => doc.setDrawColor(c || '#000000');
    const setFill = c => doc.setFillColor(c || '#000000');
    return {
      line(x1, y1, x2, y2, lw = 0.5, color = '#000000') { doc.setLineWidth(lw); setStroke(color); doc.line(x1, y1, x2, y2); },
      rect(x, y, w, h, o = {}) {
        doc.setLineWidth(o.lw || 0.5); setStroke(o.stroke || '#000000');
        if (o.fill) setFill(o.fill);
        doc.rect(x, y, w, h, o.fill ? (o.stroke === null ? 'F' : 'FD') : 'S');
      },
      circle(cx, cy, r, o = {}) {
        doc.setLineWidth(o.lw || 0.5); setStroke(o.stroke || '#000000');
        if (o.fill) setFill(o.fill);
        doc.circle(cx, cy, r, o.fill ? (o.stroke === null ? 'F' : 'FD') : 'S');
      },
      poly(pts, o = {}) {
        doc.setLineWidth(o.lw || 0.5); setStroke(o.stroke || '#000000');
        for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
      },
      text(str, x, y, o = {}) {
        doc.setFont('helvetica', o.bold ? 'bold' : (o.italic ? 'italic' : 'normal'));
        doc.setFontSize(o.size || 8); doc.setTextColor(o.color || '#000000');
        doc.text(String(str), x, y, { align: o.align || 'left', baseline: o.base || 'alphabetic' });
      },
      textWidth(str, size, bold) { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); return doc.getTextWidth(String(str)); },
      image(src, x, y, w, h) { try { doc.addImage(src, 'PNG', x, y, w, h); } catch (e) { /* ignore */ } }
    };
  }

  function canvasPainter(ctx, images) {
    const font = (o) => (o.bold ? 'bold ' : o.italic ? 'italic ' : '') + (o.size || 8) + 'px Helvetica, Arial, sans-serif';
    return {
      line(x1, y1, x2, y2, lw = 0.5, color = '#000') { ctx.beginPath(); ctx.lineWidth = lw; ctx.strokeStyle = color; ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); },
      rect(x, y, w, h, o = {}) {
        if (o.fill) { ctx.fillStyle = o.fill; ctx.fillRect(x, y, w, h); }
        if (o.stroke !== null) { ctx.lineWidth = o.lw || 0.5; ctx.strokeStyle = o.stroke || '#000'; ctx.strokeRect(x, y, w, h); }
      },
      circle(cx, cy, r, o = {}) {
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        if (o.fill) { ctx.fillStyle = o.fill; ctx.fill(); }
        if (o.stroke !== null) { ctx.lineWidth = o.lw || 0.5; ctx.strokeStyle = o.stroke || '#000'; ctx.stroke(); }
      },
      poly(pts, o = {}) {
        ctx.beginPath(); ctx.lineWidth = o.lw || 0.5; ctx.strokeStyle = o.stroke || '#000';
        pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      },
      text(str, x, y, o = {}) {
        ctx.font = font(o); ctx.fillStyle = o.color || '#000';
        ctx.textAlign = o.align === 'center' ? 'center' : o.align === 'right' ? 'right' : 'left';
        ctx.textBaseline = o.base === 'middle' ? 'middle' : o.base === 'top' ? 'top' : 'alphabetic';
        ctx.fillText(String(str), x, y);
      },
      textWidth(str, size, bold) { ctx.font = font({ size, bold }); return ctx.measureText(String(str)).width; },
      image(src, x, y, w, h) { const im = images && images[src]; if (im && im.complete) ctx.drawImage(im, x, y, w, h); }
    };
  }

  // ----- layout (points, legal portrait 612 x 1008)
  const PAGE = { W: 612, H: 1008, M: 16 };
  const L = (function () {
    const M = PAGE.M, top = 126, bottom = PAGE.H - M - 12;
    const nameW = 62, sideW = 92;
    const x0 = M, cellsX = M + nameW, sideX = PAGE.W - M - sideW;
    const cellsW = sideX - 4 - cellsX;
    return { M, top, bottom, nameW, sideW, x0, cellsX, sideX, cellsW, cols: 5, rowH: (bottom - top) / 9, cellW: cellsW / 5, gridRowH: 10 };
  })();

  function cellRect(slot, colOnPage) {
    return { x: L.cellsX + colOnPage * L.cellW, y: L.top + slot * L.rowH, w: L.cellW, h: L.rowH };
  }

  function fit(P, str, size, maxW, bold) {
    str = String(str || '');
    if (P.textWidth(str, size, bold) <= maxW) return str;
    while (str.length > 1 && P.textWidth(str + '…', size, bold) > maxW) str = str.slice(0, -1);
    return str + '…';
  }

  function drawK(P, x, yBase, h, looking, lw) {
    // hand-drawn K so the backwards (looking) K renders identically in PDF and canvas
    const w = h * 0.62, top = yBase - h;
    const sx = looking ? x + w : x, dir = looking ? -1 : 1;
    P.line(sx, top, sx, yBase, lw);
    P.line(sx + dir * w, top, sx + dir * w * 0.08, top + h * 0.55, lw);
    P.line(sx + dir * w * 0.3, top + h * 0.38, sx + dir * w, yBase, lw);
    return w;
  }

  // pages needed for a pitching side
  function chartPages(S, fside) {
    const bside = E.other(fside);
    const maxCol = S.pas.filter(p => p.side === bside).reduce((m, p) => Math.max(m, p.col), -1);
    const curCol = S.cur && S.cur.side === bside ? S.cur.col : -1;
    return Math.max(1, Math.ceil((Math.max(maxCol, curCol) + 1) / L.cols));
  }

  function drawChart(P, S, game, fside, page, opts) {
    opts = opts || {};
    const bside = E.other(fside);
    const team = game[fside], opp = game[bside];
    const W = PAGE.W, M = L.M;
    const red = '#9D2235';

    // ---------- header
    if (root.SJF_LOGO) P.image(root.SJF_LOGO, M, M, 78, 75);
    let kx = 100;
    P.text('PITCH', kx, M + 10, { size: 7, bold: true }); P.line(kx, M + 12, kx + 40, M + 12, 0.6);
    ['1 - FB', '2 - CB', '3 - SL', '4 - CH', '5 - OT'].forEach((t, i) => P.text(t, kx + 6, M + 22 + i * 10.5, { size: 6.5 }));
    // zone code keys (as printed on the Synergy sheet)
    const key = (bx, labels, title, titleLeft) => {
      P.rect(bx, M + 6, 46, 58, { lw: 0.6 });
      labels.forEach(([t, ax, ay]) => P.text(t, bx + ax, M + 6 + ay, { size: 5.5, align: 'center' }));
      P.text(title, titleLeft ? bx - 4 : bx + 50, M + 37, { size: 7, bold: true, align: titleLeft ? 'right' : 'left' });
    };
    key(178, [['1', 3, 7], ['2', 3, 31], ['0', 23, 31], ['5', 43, 31], ['3', 3, 55], ['OL', 23, 55], ['4', 43, 55]], 'RHH', true);
    key(250, [['1', 43, 7], ['5', 3, 31], ['0', 23, 31], ['2', 43, 31], ['4', 3, 55], ['OL', 23, 55], ['3', 43, 55]], 'LHH', false);

    const tx = 330;
    P.text((team.name || '').toUpperCase() + ' PITCHING', tx, M + 12, { size: 12, bold: true, color: red });
    P.text('vs ' + (opp.name || '') + ' hitters', tx, M + 22, { size: 7 });
    P.text('DATE:', tx, M + 38, { size: 8, bold: true });
    P.text(fmtDate(game.date), tx + 30, M + 38, { size: 9 }); P.line(tx + 28, M + 40, tx + 150, M + 40, 0.5);
    P.text('V', tx, M + 56, { size: 10, bold: true }); P.text(game.away.name || '', tx + 14, M + 55, { size: 9 }); P.line(tx + 12, M + 57, tx + 150, M + 57, 0.5);
    P.text('H', tx, M + 72, { size: 10, bold: true }); P.text(game.home.name || '', tx + 14, M + 71, { size: 9 }); P.line(tx + 12, M + 73, tx + 150, M + 73, 0.5);

    // R H E
    const rx = 500, ry = M + 4, cw = 24, ch = 14;
    ['R', 'H', 'E'].forEach((t, i) => P.text(t, rx + 16 + i * cw + cw / 2, ry + 8, { size: 7, bold: true, align: 'center' }));
    [['V', 'away'], ['H', 'home']].forEach(([lab, sd], r) => {
      const yy = ry + 12 + r * ch;
      P.text(lab, rx + 6, yy + 10, { size: 7, bold: true, align: 'center' });
      [S.score[sd], S.hits[sd], S.errs[sd]].forEach((v, i) => {
        P.rect(rx + 16 + i * cw, yy, cw, ch, { lw: 0.6 });
        P.text(v, rx + 16 + i * cw + cw / 2, yy + 10, { size: 8, align: 'center' });
      });
    });
    const status = S.final ? 'FINAL' : 'In progress — ' + (S.half === 'top' ? 'Top ' : 'Bot ') + S.inning;
    P.text(status, rx + 16 + 1.5 * cw, ry + 52, { size: 6, align: 'center', color: '#444' });

    // legend
    const lgY = L.top - 8;
    P.text('Pitch # (1-5) in B or S row · circled = swing/bunt · filled = swing & miss · A = automatic ball/strike · V row = velo · dots = location (catcher view, # = pitch of AB, filled = strike) · bottom-right = pitcher pitch count · heavy line = end of inning',
      L.x0, lgY, { size: 4.9, color: '#333' });

    // ---------- grid frame
    const rowsY = L.top, gridW = L.nameW + L.cellsW;
    P.rect(L.x0, rowsY, gridW, L.rowH * 9, { lw: 1.2 });

    const colBase = page * L.cols;
    const pasBySlot = {};
    const all = S.pas.filter(p => p.side === bside);
    if (S.cur && S.cur.side === bside) all.push(S.cur);
    all.forEach(p => { (pasBySlot[p.slot] = pasBySlot[p.slot] || []).push(p); });

    for (let slot = 0; slot < 9; slot++) {
      const y = rowsY + slot * L.rowH;
      P.line(L.x0, y, L.x0 + gridW, y, 1.0);
      drawNameCell(P, S, game, bside, slot, L.x0, y, L.nameW, L.rowH);
      for (let c = 0; c < L.cols; c++) {
        const r = cellRect(slot, c);
        const pa = (pasBySlot[slot] || []).find(p => p.col === colBase + c);
        drawCell(P, S, game, pa, r, opts);
      }
    }
    // vertical separators
    P.line(L.cellsX, rowsY, L.cellsX, rowsY + 9 * L.rowH, 1.0);
    for (let c = 1; c < L.cols; c++) P.line(L.cellsX + c * L.cellW, rowsY, L.cellsX + c * L.cellW, rowsY + 9 * L.rowH, 1.0);
    // inning-end heavy lines drawn last so they sit on top
    for (let slot = 0; slot < 9; slot++) for (let c = 0; c < L.cols; c++) {
      const pa = (pasBySlot[slot] || []).find(p => p.col === colBase + c);
      if (pa && pa.innEnd) { const r = cellRect(slot, c); P.line(r.x, r.y + r.h, r.x + r.w, r.y + r.h, 2.6); }
    }
    // column headers (PA #)
    for (let c = 0; c < L.cols; c++) P.text('PA ' + (colBase + c + 1), L.cellsX + c * L.cellW + L.cellW / 2, rowsY - 1.5, { size: 4.6, align: 'center', color: '#777' });

    drawSidebar(P, S, game, fside, L.sideX, rowsY, L.sideW, 9 * L.rowH);

    const pages = chartPages(S, fside);
    P.text('SJF Pitch Chart · ' + (team.name || '') + ' pitchers vs ' + (opp.name || '') + ' hitters · ' + fmtDate(game.date) +
      (pages > 1 ? ' · page ' + (page + 1) + ' of ' + pages : ''), L.x0, PAGE.H - M + 2, { size: 5.5, color: '#555' });
  }

  function drawNameCell(P, S, game, bside, slot, x, y, w, h) {
    P.rect(x, y, 11, 9, { lw: 0.5 });
    P.text(slot + 1, x + 5.5, y + 7, { size: 6, bold: true, align: 'center' });
    const hist = S.slotHist[bside][slot] || [];
    const start = E.player(game, bside, hist[0] && hist[0].pid);
    P.text(start.num, x + w / 2 - 3, y + 34, { size: 19, bold: true, align: 'center' });
    P.text(fit(P, (start.name || '') + ' (' + (start.bats || 'R') + ')', 6, w - 6), x + 3, y + 45, { size: 6 });
    let yy = y + 55;
    hist.slice(1).forEach(hh => {
      if (yy > y + h - 4) return;
      const p = E.player(game, bside, hh.pid);
      P.text(fit(P, (hh.role === 'START' ? '' : hh.role + ' ') + '#' + p.num + ' ' + (p.name || '') + ' (' + (p.bats || 'R') + ')', 5.4, w - 5), x + 3, yy, { size: 5.4, color: '#222' });
      yy += 7.5;
    });
    // B S V labels at the right edge, like the paper sheet
    ['B', 'S', 'V'].forEach((t, i) => P.text(t, x + w - 2.5, y + 7.6 + i * L.gridRowH, { size: 5.6, align: 'right' }));
  }

  function drawCell(P, S, game, pa, r, opts) {
    const { x, y, w, h } = r;
    const gh = L.gridRowH, gy = y, lowY = y + 3 * gh, yb = y + h;
    const entries = [];
    if (pa) {
      let ai = 0;
      pa.pitches.forEach((p, i) => {
        while (ai < pa.autos.length && pa.autos[ai].at <= i) entries.push({ auto: pa.autos[ai++] });
        entries.push({ p });
      });
      while (ai < pa.autos.length) entries.push({ auto: pa.autos[ai++] });
    }
    const nc = Math.max(7, entries.length);
    const cw = w / nc;
    // grid
    for (let i = 1; i <= 3; i++) P.line(x, gy + i * gh, x + w, gy + i * gh, i === 3 ? 0.6 : 0.35, '#555555');
    for (let i = 1; i < nc; i++) P.line(x + i * cw, gy, x + i * cw, gy + 3 * gh, 0.3, '#888888');

    // zone box (always drawn, like the blank sheet)
    const zw = 22, zh = 27, zx = x + w - 27, zy = lowY + 31;
    P.rect(zx - zw / 2, zy - zh / 2, zw, zh, { lw: 0.8 });
    // field arc + mini diamond
    const R = 46; const arc = [];
    for (let a = 0; a <= 90; a += 6) arc.push([x + R * Math.cos(a * Math.PI / 180), yb - R * Math.sin(a * Math.PI / 180)]);
    P.poly(arc, { lw: 0.7 });
    const d = 14, hx = x + 5, hy = yb - 5;
    const pts = [[hx, hy], [hx + d, hy], [hx + d, hy - d], [hx, hy - d], [hx, hy]];
    P.rect(x, yb - 9, 9, 9, { lw: 0.4, stroke: '#777777' });
    if (!pa) return;

    const fsz = Math.min(7.2, cw * 0.95);
    entries.forEach((en, i) => {
      const cx = x + i * cw + cw / 2;
      if (en.auto) {
        const row = en.auto.res === 'B' ? 0 : 1;
        P.text('A', cx, gy + row * gh + gh / 2 + 0.3, { size: fsz * 0.9, bold: true, align: 'center', base: 'middle', color: '#555555' });
        return;
      }
      const p = en.p;
      const row = p.strike ? 1 : 0;
      const ty = p.type ? String(p.type) : '?';
      const cy = gy + row * gh + gh / 2;
      if (p.offered) {
        const rr = Math.min(4.3, cw * 0.46);
        if (p.whiff) { P.circle(cx, cy, rr, { fill: '#000000', lw: 0.5 }); P.text(ty, cx, cy + 0.3, { size: fsz, bold: true, align: 'center', base: 'middle', color: '#FFFFFF' }); }
        else { P.circle(cx, cy, rr, { lw: 0.6 }); P.text(ty, cx, cy + 0.3, { size: fsz, align: 'center', base: 'middle' }); }
      } else P.text(ty, cx, cy + 0.3, { size: fsz, align: 'center', base: 'middle' });
      if (p.velo) P.text(p.velo, cx, gy + 2 * gh + gh / 2 + 0.3, { size: Math.min(5.6, cw * 0.62), align: 'center', base: 'middle' });
    });

    // location dots
    pa.pitches.forEach(p => {
      if (!p.loc) return;
      const lx = Math.max(-2, Math.min(2, p.loc.x)), ly = Math.max(-2.05, Math.min(2.05, p.loc.y));
      const px = Math.min(x + w - 3, zx + lx * zw / 2), py = Math.max(lowY + 3, Math.min(yb - 3, zy - ly * zh / 2));
      if (p.strike) { P.circle(px, py, 2.9, { fill: '#000000', lw: 0.3 }); P.text(p.n, px, py + 0.2, { size: 3.6, bold: true, align: 'center', base: 'middle', color: '#FFFFFF' }); }
      else { P.circle(px, py, 2.9, { fill: '#FFFFFF', lw: 0.45 }); P.text(p.n, px, py + 0.2, { size: 3.6, align: 'center', base: 'middle' }); }
    });

    // inning + pitcher change
    let ly = lowY + 6;
    P.text('Inn ' + pa.inning + (pa.leadoff ? ' · leadoff' : ''), x + 2, ly, { size: 4.6, color: '#666666' });
    const changes = [];
    if (pa.newPitcher) changes.push(pa.newPitcher);
    (pa.midChange || []).forEach(c => changes.push(c.pid));
    changes.forEach(pid => {
      ly += 6.2;
      const pl = E.player(game, pa.fside, pid);
      P.text(fit(P, 'P: ' + (pl.name || '#' + pl.num), 5.6, w - 50, true), x + 2, ly, { size: 5.6, bold: true, color: '#9D2235' });
    });

    // result
    const ny = lowY + 30;
    if (pa.complete && pa.result) {
      const res = pa.result;
      if (res.code === 'K') {
        const kw = drawK(P, x + 5, ny, 10, res.looking, 1.1);
        const extra = (res.notation || 'K').replace(/^K/, '');
        if (extra) P.text(fit(P, extra, 7, w - 52), x + 7 + kw, ny, { size: 7, bold: true });
      } else {
        const t = res.notation || res.code;
        const size = t.length > 6 ? 7.5 : t.length > 4 ? 9 : 10.5;
        P.text(fit(P, t, size, w - 30, true), x + 4, ny, { size, bold: true });
      }
    } else if (pa.endedInning) {
      P.text('(inning ended)', x + 3, ny - 2, { size: 5.2, italic: true, color: '#444444' });
    } else if (!pa.complete) {
      P.text('at bat…', x + 3, ny - 2, { size: 5.2, italic: true, color: '#9D2235' });
    }
    // runner events during this PA
    if (pa.events && pa.events.filter(ev => !ev.d3).length) {
      const codes = pa.events.filter(ev => !ev.d3).map(ev => ({ POE: 'PO-E', ADV: 'ADV', OUT: 'RO' }[ev.kind] || ev.kind));
      P.text(fit(P, codes.join(' · '), 5.2, w - 50, true), x + 3, ny + 8, { size: 5.2, bold: true, color: '#333333' });
    }
    // bases reached
    if (pa.reach) {
      for (let i = 0; i < Math.min(4, pa.reach); i++) P.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1.6);
      if (pa.scored) P.rect(x, yb - 9, 9, 9, { fill: '#000000', lw: 0.4 });
    }
    if (pa.outOnBases) P.text('x', hx + d + 2, hy - d + 2, { size: 6, bold: true });
    // pitcher's running pitch count
    const pc = pa.complete || pa.endedInning ? pa.pcAfter : S.pitchCount[pa.pitcher];
    if (pc != null) {
      const t = String(pc), tw = P.textWidth(t, 6.4, true) + 3;
      P.rect(x + w - tw - 0.6, yb - 8.6, tw, 8, { fill: '#FFFFFF', stroke: null });
      P.text(t, x + w - 2, yb - 2.2, { size: 6.4, bold: true, align: 'right' });
    }
    if (opts.highlight && opts.highlight === pa.id) P.rect(x + 1, y + 1, w - 2, h - 2, { lw: 2, stroke: '#F1BE48' });
  }

  function drawSidebar(P, S, game, fside, x, y, w, h) {
    P.rect(x, y, w, h, { lw: 1.0 });
    P.text('PITCHERS', x + w / 2, y + 12, { size: 8, bold: true, align: 'center' });
    P.line(x + 6, y + 15, x + w - 6, y + 15, 0.5);
    let yy = y + 27;
    const names = { 1: 'FB', 2: 'CB', 3: 'SL', 4: 'CH', 5: 'OT', 0: '?' };
    E.pitcherSidebar(S, game, fside).forEach(ps => {
      if (yy > y + h - 20) return;
      const pl = E.player(game, fside, ps.pid);
      P.text(fit(P, '#' + pl.num + ' ' + (pl.name || ''), 7.6, w - 8, true), x + 4, yy, { size: 7.6, bold: true });
      yy += 9;
      P.text((pl.throws === 'L' ? 'LHP' : 'RHP') + ' · ' + ps.count + ' pitches', x + 4, yy, { size: 6, color: '#333333' });
      yy += 9;
      [1, 2, 3, 4, 5, 0].forEach(t => {
        const arr = ps.types[t]; if (!arr) return;
        const v = arr.filter(Boolean);
        let lab = names[t];
        if (t === 5 && pl.ot) lab = 'OT (' + pl.ot + ')';
        const range = v.length ? (Math.min(...v) === Math.max(...v) ? '' + Math.min(...v) : Math.min(...v) + '-' + Math.max(...v)) : '';
        P.text(lab, x + 6, yy, { size: 7.2 });
        P.text(range || '—', x + w - 22, yy, { size: 7.2, align: 'right' });
        P.text('×' + arr.length, x + w - 4, yy, { size: 5.2, align: 'right', color: '#666666' });
        yy += 9;
      });
      if (pl.note) { P.text(fit(P, pl.note, 5.6, w - 8), x + 4, yy, { size: 5.6, italic: true, color: '#333333' }); yy += 8; }
      P.line(x + 6, yy - 3, x + w - 6, yy - 3, 0.3, '#999999');
      yy += 7;
    });
  }

  function fmtDate(iso) {
    if (!iso) return '';
    const [Y, Mo, D] = iso.split('-');
    return Number(Mo) + '/' + Number(D) + '/' + Y;
  }

  // locate a PA by point on the sheet (for tapping on the canvas)
  function hitTest(S, fside, page, px, py) {
    if (px < L.cellsX || px > L.cellsX + L.cellsW || py < L.top || py > L.top + 9 * L.rowH) return null;
    const slot = Math.floor((py - L.top) / L.rowH), c = Math.floor((px - L.cellsX) / L.cellW);
    const col = page * L.cols + c, bside = E.other(fside);
    return S.pas.find(p => p.side === bside && p.slot === slot && p.col === col) || (S.cur && S.cur.side === bside && S.cur.slot === slot && S.cur.col === col ? S.cur : null);
  }

  root.ChartRender = { PAGE, L, pdfPainter, canvasPainter, drawChart, chartPages, hitTest, fmtDate, drawK };
})(typeof window !== 'undefined' ? window : globalThis);
