/* SJF Pitch Chart — game engine (pure logic, no DOM).
   The game is stored as an ordered list of events. All state (count, outs,
   runners, innings, plate appearances, stats) is rebuilt by replaying them,
   so undo/edit can never leave the chart in a half-updated state. */
(function (root) {
  'use strict';

  const PITCH_TYPES = { 0: '?', 1: 'FB', 2: 'CB', 3: 'SL', 4: 'CH', 5: 'OT' };
  const RESULTS = {
    B: 'Ball', CS: 'Called strike', SW: 'Swinging strike', F: 'Foul', FT: 'Foul tip (caught)',
    FB: 'Foul bunt', MB: 'Missed bunt', IP: 'In play', HBP: 'Hit by pitch'
  };
  const STRIKE_RES = ['CS', 'SW', 'F', 'FT', 'FB', 'MB', 'IP'];
  const SWING_RES = ['SW', 'F', 'FT', 'IP'];        // full swings (bunts excluded from whiff/chase)
  const CIRCLE_RES = ['SW', 'F', 'FT', 'FB', 'MB', 'IP']; // offered at (circled on the sheet)
  const ZONE_EDGE = 1.15; // ball center within 1.15 half-widths still touches the zone
  const HIT_CODES = ['1B', '2B', '3B', 'HR'];
  const SLOTS = 9;

  function uid() { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5); }
  function other(side) { return side === 'home' ? 'away' : 'home'; }

  function newGame(o) {
    return {
      id: uid(), v: 1, created: Date.now(), updated: Date.now(),
      date: o.date, innings: o.innings || 9, sjfSide: o.sjfSide || 'home',
      home: o.home, away: o.away, // {name, players:{id:{id,num,name,bats,throws,ot,note}}, lineup:[pid*9], pitcher:pid}
      events: [], status: 'live'
    };
  }

  function player(game, side, pid) {
    return (game[side].players && game[side].players[pid]) || { id: pid, num: '?', name: '', bats: 'R', throws: 'R' };
  }
  function pLabel(game, side, pid) {
    const p = player(game, side, pid);
    return '#' + p.num + (p.name ? ' ' + p.name : '');
  }

  function handFor(game, bside, batterId, pitcherId) {
    const b = player(game, bside, batterId);
    const p = player(game, other(bside), pitcherId);
    if (b.bats === 'S') return p.throws === 'L' ? 'R' : 'L';
    return b.bats === 'L' ? 'L' : 'R';
  }

  function inZone(loc) {
    if (!loc) return null;
    return Math.abs(loc.x) <= ZONE_EDGE && Math.abs(loc.y) <= ZONE_EDGE;
  }

  // Default runner movement for each kind of play. Returned as [{from:'B'|1|2|3, to:0..4}]
  // (to: 0 = out, 4 = scored). The charter confirms/edits these before saving.
  function defaultMoves(bases, kind) {
    const occ = [0, 1, 2].filter(i => bases[i]).map(i => i + 1); // occupied base numbers
    const mv = [];
    const adv = (n) => occ.forEach(b => mv.push({ from: b, to: Math.min(4, b + n) }));
    const stay = () => occ.forEach(b => mv.push({ from: b, to: b }));
    const forced = () => {
      const m = [{ from: 'B', to: 1 }];
      if (bases[0]) { m.push({ from: 1, to: 2 }); if (bases[1]) { m.push({ from: 2, to: 3 }); if (bases[2]) m.push({ from: 3, to: 4 }); } }
      occ.forEach(b => { if (!m.find(x => x.from === b)) m.push({ from: b, to: b }); });
      return m;
    };
    switch (kind) {
      case '1B': mv.push({ from: 'B', to: 1 }); adv(1); return mv;
      case '2B': mv.push({ from: 'B', to: 2 }); adv(2); return mv;
      case '3B': mv.push({ from: 'B', to: 3 }); adv(3); return mv;
      case 'HR': mv.push({ from: 'B', to: 4 }); adv(4); return mv;
      case 'OUT': mv.push({ from: 'B', to: 0 }); stay(); return mv;
      case 'SF': mv.push({ from: 'B', to: 0 }); occ.forEach(b => mv.push({ from: b, to: b === 3 ? 4 : b })); return mv;
      case 'SAC': mv.push({ from: 'B', to: 0 }); adv(1); return mv;
      case 'DP': {
        mv.push({ from: 'B', to: 0 });
        const lead = bases[0] ? 1 : occ[0];
        occ.forEach(b => mv.push({ from: b, to: b === lead ? 0 : b }));
        return mv;
      }
      case 'TP': mv.push({ from: 'B', to: 0 }); occ.forEach((b, i) => mv.push({ from: b, to: i < 2 ? 0 : b })); return mv;
      case 'FC': {
        mv.push({ from: 'B', to: 1 });
        // lead forced runner is out; other forced runners move up
        let forcedChain = []; if (bases[0]) { forcedChain.push(1); if (bases[1]) { forcedChain.push(2); if (bases[2]) forcedChain.push(3); } }
        const outB = forcedChain.length ? forcedChain[forcedChain.length - 1] : occ[occ.length - 1];
        occ.forEach(b => mv.push({ from: b, to: b === outB ? 0 : (forcedChain.includes(b) ? b + 1 : b) }));
        return mv;
      }
      case 'E': mv.push({ from: 'B', to: 1 }); adv(1); return mv;
      case 'FORCED': return forced();
      case 'D3': mv.push({ from: 'B', to: 1 }); stay(); return mv;
      case 'WP': case 'PB': case 'BK': case 'ADV1': adv(1); return mv;
      case 'SB': case 'CS': case 'DI': {
        // default stealers: lead runner first, each runner whose next base is (or becomes) open;
        // a steal of home is only defaulted when the runner on 3rd is alone
        const stealers = []; const taken = bases.map(Boolean);
        for (let b = 3; b >= 1; b--) {
          if (!bases[b - 1]) continue;
          if (b === 3 && occ.length > 1) continue;
          const nxt = b + 1;
          if (nxt === 4 || !taken[nxt - 1]) { stealers.push(b); taken[b - 1] = false; if (nxt < 4) taken[nxt - 1] = true; }
        }
        if (kind === 'CS') { const c = stealers[0] || occ[occ.length - 1]; occ.forEach(b => mv.push({ from: b, to: b === c ? 0 : b })); return mv; }
        occ.forEach(b => mv.push({ from: b, to: stealers.includes(b) ? b + 1 : b }));
        return mv;
      }
      case 'PO': { const r = bases[0] ? 1 : occ[occ.length - 1]; occ.forEach(b => mv.push({ from: b, to: b === r ? 0 : b })); return mv; }
      case 'POE': { const r = bases[0] ? 1 : occ[occ.length - 1]; occ.forEach(b => mv.push({ from: b, to: b === r ? Math.min(4, b + 1) : b })); return mv; }
      default: stay(); return mv;
    }
  }

  // Validate a set of moves against current bases. Returns error string or ''.
  function validateMoves(bases, moves, hasBatter) {
    const finals = [];
    for (const m of moves) {
      if (m.from === 'B') { if (!hasBatter) return 'No batter on this play'; }
      else if (!bases[m.from - 1]) return 'No runner on ' + baseName(m.from);
      else if (m.to !== 0 && m.to < m.from) return 'Runner can’t go backwards';
      if (m.to >= 1 && m.to <= 3) {
        if (finals.includes(m.to)) return 'Two runners on ' + baseName(m.to);
        finals.push(m.to);
      }
    }
    // runners not listed stay put
    for (let b = 1; b <= 3; b++) {
      if (bases[b - 1] && !moves.find(m => m.from === b)) { if (finals.includes(b)) return 'Two runners on ' + baseName(b); finals.push(b); }
    }
    // no passing: order runners by start (B=0) and check final order
    const ord = moves.filter(m => m.to !== 0).map(m => ({ s: m.from === 'B' ? 0 : m.from, t: m.to }));
    for (let b = 1; b <= 3; b++) if (bases[b - 1] && !moves.find(m => m.from === b)) ord.push({ s: b, t: b });
    ord.sort((a, b) => a.s - b.s);
    for (let i = 1; i < ord.length; i++) {
      if (ord[i].t !== 4 && ord[i - 1].t !== 4 && ord[i - 1].t >= ord[i].t) return 'A runner can’t pass the runner ahead of him';
      if (ord[i].t !== 4 && ord[i - 1].t === 4) return 'A runner can’t pass the runner ahead of him';
    }
    return '';
  }
  function baseName(b) { return b === 'B' ? 'batter' : ['', '1st', '2nd', '3rd', 'home'][b]; }

  // ---------------------------------------------------------------- replay
  function replay(game) {
    const S = {
      inning: 1, half: 'top', outs: 0, balls: 0, strikes: 0,
      bases: [null, null, null],
      score: { home: 0, away: 0 }, hits: { home: 0, away: 0 }, errs: { home: 0, away: 0 },
      lineScore: { home: [], away: [] },
      lineup: { home: game.home.lineup.slice(), away: game.away.lineup.slice() },
      slotHist: {
        home: game.home.lineup.map(p => [{ pid: p, role: 'START' }]),
        away: game.away.lineup.map(p => [{ pid: p, role: 'START' }])
      },
      nextSlot: { home: 0, away: 0 },
      pitcher: { home: game.home.pitcher, away: game.away.pitcher },
      pitchersUsed: { home: [game.home.pitcher].filter(Boolean), away: [game.away.pitcher].filter(Boolean) },
      pitchCount: {}, outsBy: {}, runsBy: {}, fb: [], runEvents: [],
      pas: [], paById: {}, allPitches: [], cur: null, final: false, warnings: [],
      halves: [{ inning: 1, half: 'top', pas: [], runs: 0 }],
      pendingChange: { home: null, away: null }, pendingHand: null,
      lastEventDesc: ''
    };
    for (let i = 0; i < game.events.length; i++) {
      try { applyEvent(S, game, game.events[i], i); }
      catch (err) { S.warnings.push('Event ' + (i + 1) + ': ' + err.message); }
    }
    return S;
  }

  const bat = S => (S.half === 'top' ? 'away' : 'home');
  const fld = S => (S.half === 'top' ? 'home' : 'away');

  function curHalf(S) { return S.halves[S.halves.length - 1]; }

  function ensurePA(S, game) {
    if (S.cur) return S.cur;
    const side = bat(S), slot = S.nextSlot[side];
    const batter = S.lineup[side][slot];
    const pitcher = S.pitcher[other(side)];
    const col = S.pas.filter(p => p.side === side && p.slot === slot).length;
    const pa = {
      id: 'pa' + S.pas.length + '_' + side, side, fside: other(side), slot, col, batter,
      pitcherStart: pitcher, pitcher, chargedPitcher: pitcher,
      hand: S.pendingHand || handFor(game, side, batter, pitcher),
      inning: S.inning, half: S.half, pitches: [], autos: [], events: [], notes: [],
      result: null, complete: false, startOuts: S.outs,
      startBases: S.bases.map(Boolean), leadoff: curHalf(S).pas.length === 0,
      newPitcher: null, midChange: [], countAtChange: null, reach: 0, scored: false, outOnBases: false,
      innEnd: false, pcAfter: null, batterSubs: []
    };
    S.pendingHand = null;
    if (S.pendingChange[other(side)]) { pa.newPitcher = S.pendingChange[other(side)]; S.pendingChange[other(side)] = null; }
    S.cur = pa;
    return pa;
  }

  function strikeLike(S, game, pa, res, isPitch) {
    S.strikes++;
    if (S.strikes >= 3) {
      const looking = res === 'CS' || res === 'AS';
      const last = isPitch ? pa.pitches[pa.pitches.length - 1] : null;
      const ev = last ? game.events[last.evIdx] : null;
      if (ev && ev.d3) {
        if (ev.d3.how === 'WP' || ev.d3.how === 'PB') {
          const pid = S.pitcher[fld(S)];
          S.fb.push({ kind: ev.d3.how, pitcher: pid, fside: fld(S), inning: S.inning });
          S.runEvents.push({ kind: ev.d3.how, pitcher: pid, fside: fld(S), inning: S.inning, half: S.half, desc: 'K-' + ev.d3.how, moves: [] });
          pa.events.push({ kind: ev.d3.how, at: pa.pitches.length, desc: 'K-' + ev.d3.how + ' (dropped 3rd strike)', d3: true, pitcher: pid });
        }
        endPA(S, game, { code: 'K', looking, notation: ev.d3.notation || 'K', d3: ev.d3.how || 'WP', errors: ev.d3.errors || 0 }, ev.d3.moves || defaultMoves(S.bases, 'D3'));
      } else {
        endPA(S, game, { code: 'K', looking, notation: 'K' }, [{ from: 'B', to: 0 }].concat(stayMoves(S)));
      }
    }
  }
  function stayMoves(S) { return [1, 2, 3].filter(b => S.bases[b - 1]).map(b => ({ from: b, to: b })); }

  function applyEvent(S, game, e, idx) {
    const side = bat(S), fside = fld(S);
    switch (e.t) {
      case 'pitch': {
        const pa = ensurePA(S, game);
        const pid = S.pitcher[fside];
        S.pitchCount[pid] = (S.pitchCount[pid] || 0) + 1;
        const rec = {
          evIdx: idx, n: pa.pitches.length + 1, type: e.type || 0, velo: e.velo || null, loc: e.loc || null,
          res: e.res, b: S.balls, s: S.strikes, outs: S.outs, bases: S.bases.map(Boolean),
          pitcher: pid, pc: S.pitchCount[pid], batter: pa.batter, hand: pa.hand,
          inning: S.inning, half: S.half, side, fside, paId: pa.id,
          strike: STRIKE_RES.includes(e.res), swing: SWING_RES.includes(e.res),
          offered: CIRCLE_RES.includes(e.res), whiff: e.res === 'SW' || e.res === 'FT',
          zone: inZone(e.loc), spray: e.ip && e.ip.spray || null, bb: e.ip && e.ip.bb || null
        };
        pa.pitches.push(rec); S.allPitches.push(rec);
        switch (e.res) {
          case 'B':
            S.balls++;
            if (S.balls >= 4) endPA(S, game, { code: 'BB', notation: 'BB' }, defaultMoves(S.bases, 'FORCED'));
            break;
          case 'CS': case 'SW': case 'FT': case 'MB': case 'FB':
            strikeLike(S, game, pa, e.res, true); break;
          case 'F':
            if (S.strikes < 2) S.strikes++;
            break;
          case 'HBP':
            endPA(S, game, { code: 'HBP', notation: 'HBP' }, defaultMoves(S.bases, 'FORCED'));
            break;
          case 'IP': {
            const ip = e.ip || { code: 'OUT', notation: '?' };
            endPA(S, game, ip, ip.moves || defaultMoves(S.bases, ip.cls || 'OUT'));
            break;
          }
          default: throw new Error('Unknown pitch result ' + e.res);
        }
        // charter's notation override for the play this pitch ended (e.g. "K 2-3", "BB" → "IBB")
        const lp = S.lastPA;
        if (e.nota && lp && lp.pitches.length && lp.pitches[lp.pitches.length - 1].evIdx === idx) lp.result.notation = e.nota;
        S.lastEventDesc = (PITCH_TYPES[rec.type]) + ' ' + RESULTS[e.res];
        break;
      }
      case 'auto': { // pitch-clock / rule violation: count changes, no pitch thrown
        const pa = ensurePA(S, game);
        pa.autos.push({ res: e.res, at: pa.pitches.length, b: S.balls, s: S.strikes });
        if (e.res === 'B') { S.balls++; if (S.balls >= 4) endPA(S, game, { code: 'BB', notation: 'BB' }, defaultMoves(S.bases, 'FORCED')); }
        else strikeLike(S, game, pa, 'AS', false);
        S.lastEventDesc = 'Automatic ' + (e.res === 'B' ? 'ball' : 'strike');
        break;
      }
      case 'ibb': {
        ensurePA(S, game);
        endPA(S, game, { code: 'IBB', notation: 'IBB' }, defaultMoves(S.bases, 'FORCED'));
        S.lastEventDesc = 'Intentional walk';
        break;
      }
      case 'run': { // runner event between/during pitches
        const pa = ensurePA(S, game);
        const pid = S.pitcher[fside];
        const before = S.bases.map(r => r);
        const res = applyMoves(S, game, e.moves || [], null);
        const desc = runDesc(e, before);
        pa.events.push({ kind: e.kind, at: pa.pitches.length, desc, moves: e.moves, evIdx: idx, pitcher: pid });
        S.runEvents.push({ kind: e.kind, pitcher: pid, fside, inning: S.inning, half: S.half, desc, moves: e.moves });
        if (e.err) S.errs[fside] += e.err;
        if (['WP', 'PB', 'BK'].includes(e.kind)) S.fb.push({ kind: e.kind, pitcher: pid, fside, inning: S.inning });
        if (e.kind === 'SB') (e.moves || []).forEach(m => { if (m.to > m.from) S.fb.push({ kind: 'SB', pitcher: pid, fside, inning: S.inning }); });
        S.lastEventDesc = e.kind + (res.runs ? ' (' + res.runs + ' run' + (res.runs > 1 ? 's' : '') + ')' : '');
        checkInningEnd(S);
        break;
      }
      case 'sub': {
        const s = e.side;
        if (e.slot != null) {
          S.lineup[s][e.slot] = e.pid;
          S.slotHist[s][e.slot].push({ pid: e.pid, role: e.role || 'SUB', inning: S.inning });
          if (S.cur && S.cur.side === s && S.cur.slot === e.slot) { S.cur.batterSubs.push(e.pid); S.cur.batter = e.pid; S.cur.hand = handFor(game, s, e.pid, S.cur.pitcher); }
        }
        if (e.base && S.bases[e.base - 1]) S.bases[e.base - 1] = Object.assign({}, S.bases[e.base - 1], { pid: e.pid, pr: true });
        S.lastEventDesc = (e.role || 'Sub') + ' ' + pLabel(game, s, e.pid);
        break;
      }
      case 'pchange': {
        const s = e.side; // fielding team making the change
        S.pitcher[s] = e.pid;
        if (!S.pitchersUsed[s].includes(e.pid)) S.pitchersUsed[s].push(e.pid);
        if (S.cur && S.cur.fside === s) {
          if (S.cur.pitches.length || S.cur.autos.length) {
            if (!S.cur.countAtChange) S.cur.countAtChange = S.balls + '-' + S.strikes;
            S.cur.midChange.push({ pid: e.pid, at: S.cur.pitches.length });
          } else S.cur.newPitcher = e.pid;
          S.cur.pitcher = e.pid;
          S.cur.hand = S.cur.handLocked ? S.cur.hand : handFor(game, S.cur.side, S.cur.batter, e.pid);
        } else S.pendingChange[s] = e.pid;
        S.lastEventDesc = 'Pitching change: ' + pLabel(game, s, e.pid);
        break;
      }
      case 'bats': {
        if (S.cur) { S.cur.hand = e.hand; S.cur.handLocked = true; S.cur.pitches.forEach(p => (p.hand = e.hand)); }
        else S.pendingHand = e.hand;
        S.lastEventDesc = 'Batter hand ' + e.hand;
        break;
      }
      case 'fix': {
        if (e.batter) {
          const s = e.batter.side;
          S.nextSlot[s] = e.batter.slot;
          if (S.cur && S.cur.side === s) {
            const pa = S.cur; pa.slot = e.batter.slot; pa.batter = S.lineup[s][pa.slot];
            pa.col = S.pas.filter(p => p.side === s && p.slot === pa.slot).length;
            if (!pa.handLocked) pa.hand = handFor(game, s, pa.batter, pa.pitcher);
            pa.pitches.forEach(p => { p.batter = pa.batter; p.hand = pa.hand; });
          }
        }
        if (e.count) { S.balls = e.count.b; S.strikes = e.count.s; }
        if (e.bases) {
          const pid = S.pitcher[fside];
          S.bases = e.bases.map((on, i) => (on ? (S.bases[i] || { pid: null, resp: pid, paId: null, side }) : null));
        }
        if (e.score) { S.score.home = e.score.home; S.score.away = e.score.away; }
        if (e.outs != null) { S.outs = e.outs; checkInningEnd(S); }
        S.lastEventDesc = 'Correction';
        break;
      }
      case 'half': { // charter forces end of half-inning
        S.outs = 3; checkInningEnd(S, true);
        S.lastEventDesc = 'End of half-inning';
        break;
      }
      case 'note': { ensurePA(S, game).notes.push(e.text); S.lastEventDesc = 'Note'; break; }
      case 'end': { S.final = true; S.lastEventDesc = 'Game over'; break; }
      default: throw new Error('Unknown event ' + e.t);
    }
  }

  function runDesc(e, before) {
    const names = { SB: 'SB', CS: 'CS', WP: 'WP', PB: 'PB', BK: 'BK', PO: 'PO', POE: 'PO-E', DI: 'DI', ADV: 'ADV', OUT: 'Out' };
    const k = names[e.kind] || e.kind;
    const parts = (e.moves || []).filter(m => m.to !== m.from).map(m => {
      if (m.to === 0) return 'R' + m.from + ' out';
      if (m.to === 4) return 'R' + m.from + ' scores';
      return 'R' + m.from + '→' + m.to;
    });
    return k + (parts.length ? ' ' + parts.join(', ') : '');
  }

  function applyMoves(S, game, moves, batterRunner) {
    const side = bat(S), fside = fld(S);
    const nb = S.bases.slice();
    let runs = 0, outs = 0;
    const movers = [];
    for (const m of moves) {
      let r;
      if (m.from === 'B') r = batterRunner;
      else { r = S.bases[m.from - 1]; nb[m.from - 1] = null; }
      if (!r) { if (m.from !== 'B') S.warnings.push('No runner on ' + baseName(m.from) + ' (inning ' + S.inning + ')'); continue; }
      movers.push({ r, to: m.to, from: m.from });
    }
    for (const { r, to, from } of movers) {
      const pa = r.paId ? S.paById[r.paId] || (S.cur && S.cur.id === r.paId ? S.cur : null) : null;
      if (to === 0) {
        outs++;
        if (pa && from !== 'B') pa.outOnBases = true;
      } else if (to === 4) {
        runs++;
        S.runsBy[r.resp] = (S.runsBy[r.resp] || 0) + 1;
        if (pa) { pa.scored = true; pa.reach = 4; }
      } else {
        if (nb[to - 1]) S.warnings.push('Two runners on ' + baseName(to) + ' (inning ' + S.inning + ')');
        nb[to - 1] = r;
        if (pa) pa.reach = Math.max(pa.reach, to);
      }
    }
    S.bases = nb;
    S.outs += outs;
    const pid = S.pitcher[fside];
    S.outsBy[pid] = (S.outsBy[pid] || 0) + outs;
    S.score[side] += runs;
    curHalf(S).runs += runs;
    return { runs, outs };
  }

  function endPA(S, game, result, moves) {
    const pa = S.cur;
    pa.result = Object.assign({}, result);
    pa.complete = true;
    // scoring rules 9.16(h)/(i): reliever entering ball-heavy count → walk charged to previous pitcher;
    // entering with 2 strikes → strikeout charged to previous pitcher
    pa.chargedPitcher = pa.pitcher;
    if (pa.countAtChange) {
      const [b, s] = pa.countAtChange.split('-').map(Number);
      if (result.code === 'BB' && b > s && b >= 2) pa.chargedPitcher = pa.pitcherStart;
      if (result.code === 'K' && s === 2) pa.chargedPitcher = pa.pitcherStart;
    }
    S.paById[pa.id] = pa;
    const runner = { pid: pa.batter, resp: pa.chargedPitcher, paId: pa.id, side: pa.side };
    if (HIT_CODES.includes(result.code)) S.hits[pa.side]++;
    if (result.errors) S.errs[pa.fside] += result.errors;
    if (['BB', 'IBB', 'HBP'].includes(result.code)) S.fb.push({ kind: result.code === 'IBB' ? 'BB' : result.code, pitcher: pa.chargedPitcher, fside: pa.fside, inning: S.inning, ibb: result.code === 'IBB' });
    const r = applyMoves(S, game, moves, runner);
    pa.runsOnPlay = r.runs;
    pa.batterOut = !!moves.find(m => m.from === 'B' && m.to === 0);
    if (!moves.find(m => m.from === 'B')) pa.batterOut = false;
    pa.moves = moves;
    pa.pcAfter = S.pitchCount[pa.pitcher] || 0;
    pa.outsAfter = S.outs;
    S.pas.push(pa);
    curHalf(S).pas.push(pa);
    S.nextSlot[pa.side] = (pa.slot + 1) % SLOTS;
    S.balls = 0; S.strikes = 0;
    S.cur = null;
    S.lastPA = pa;
    checkInningEnd(S);
  }

  function checkInningEnd(S, forced) {
    if (S.outs < 3 && !forced) return;
    const h = curHalf(S);
    if (S.cur) {
      const pa = S.cur;
      pa.complete = false; pa.endedInning = true;
      pa.pcAfter = S.pitchCount[pa.pitcher] || 0;
      S.paById[pa.id] = pa;
      S.pas.push(pa); h.pas.push(pa);
      S.cur = null; // same batter leads off his team's next inning
    }
    if (h.pas.length) h.pas[h.pas.length - 1].innEnd = true;
    S.lineScore[h.half === 'top' ? 'away' : 'home'][h.inning - 1] = h.runs;
    S.balls = 0; S.strikes = 0; S.outs = 0; S.bases = [null, null, null];
    if (S.half === 'top') S.half = 'bottom'; else { S.half = 'top'; S.inning++; }
    S.halves.push({ inning: S.inning, half: S.half, pas: [], runs: 0 });
  }

  // ------------------------------------------------------------- stats
  function ipStr(outs) { return Math.floor(outs / 3) + '.' + (outs % 3); }
  function pct(n, d) { return d ? Math.round((1000 * n) / d) / 10 : null; }

  function blankLine(pid) {
    return {
      pid, pitches: 0, strikes: 0, balls: 0, bf: 0, outs: 0, h: 0, hr: 0, bb: 0, ibb: 0, hbp: 0, k: 0, r: 0,
      fp: 0, fpStrike: 0, lo: 0, loOut: 0, swings: 0, whiffs: 0, ooz: 0, oozSwing: 0, oozWhiff: 0, located: 0, izone: 0,
      spin: 0, spinStrike: 0, spinSwing: 0, spinWhiff: 0, wp: 0, pb: 0, bk: 0, sb: 0, cs: 0, freeBases: 0,
      types: {}
    };
  }

  // Stats for the pitchers of one fielding side ('home' | 'away')
  function pitchingStats(S, game, fside) {
    const lines = {};
    const L = pid => (lines[pid] = lines[pid] || blankLine(pid));
    S.pitchersUsed[fside].forEach(L);
    for (const p of S.allPitches) {
      if (p.fside !== fside) continue;
      const l = L(p.pitcher);
      l.pitches++;
      if (p.strike) l.strikes++; else l.balls++;
      const t = (l.types[p.type] = l.types[p.type] || { n: 0, strikes: 0, swings: 0, whiffs: 0, velos: [] });
      t.n++; if (p.strike) t.strikes++; if (p.swing) t.swings++; if (p.whiff) t.whiffs++; if (p.velo) t.velos.push(+p.velo);
      if (p.swing) { l.swings++; if (p.whiff) l.whiffs++; }
      if (p.zone !== null) {
        l.located++;
        if (p.zone) l.izone++;
        else { l.ooz++; if (p.swing) { l.oozSwing++; if (p.whiff) l.oozWhiff++; } }
      }
      if (p.type === 2 || p.type === 3) { l.spin++; if (p.strike) l.spinStrike++; if (p.swing) { l.spinSwing++; if (p.whiff) l.spinWhiff++; } }
      if (p.n === 1) { l.fp++; if (p.strike) l.fpStrike++; }
    }
    for (const pa of S.pas) {
      if (pa.fside !== fside || !pa.complete) continue;
      const l = L(pa.chargedPitcher);
      l.bf++;
      const c = pa.result.code;
      if (HIT_CODES.includes(c)) { l.h++; if (c === 'HR') l.hr++; }
      if (c === 'BB') l.bb++;
      if (c === 'IBB') { l.bb++; l.ibb++; }
      if (c === 'HBP') l.hbp++;
      if (c === 'K') l.k++;
      if (pa.leadoff) { l.lo++; if (pa.batterOut) l.loOut++; }
    }
    for (const ev of S.runEvents) {
      if (ev.fside !== fside) continue;
      const l = L(ev.pitcher);
      if (ev.kind === 'WP') l.wp++;
      if (ev.kind === 'PB') l.pb++;
      if (ev.kind === 'BK') l.bk++;
      if (ev.kind === 'SB') (ev.moves || []).forEach(m => { if (m.to > m.from) l.sb++; });
      if (ev.kind === 'CS') (ev.moves || []).forEach(m => { if (m.to === 0) l.cs++; });
    }
    Object.values(lines).forEach(l => {
      l.outs = S.outsBy[l.pid] || 0;
      l.r = S.runsBy[l.pid] || 0;
      l.freeBases = l.bb + l.hbp + l.wp + l.pb + l.bk + l.sb;
    });
    const team = blankLine('TEAM');
    Object.values(lines).forEach(l => {
      for (const k of Object.keys(team)) if (typeof team[k] === 'number') team[k] += l[k];
      for (const [ty, t] of Object.entries(l.types)) {
        const tt = (team.types[ty] = team.types[ty] || { n: 0, strikes: 0, swings: 0, whiffs: 0, velos: [] });
        tt.n += t.n; tt.strikes += t.strikes; tt.swings += t.swings; tt.whiffs += t.whiffs; tt.velos = tt.velos.concat(t.velos);
      }
    });
    const order = S.pitchersUsed[fside].filter(pid => lines[pid]);
    Object.keys(lines).forEach(pid => { if (!order.includes(pid)) order.push(pid); });
    return { lines: order.map(pid => lines[pid]), team };
  }

  function veloSummary(arr) {
    if (!arr || !arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const avg = s.reduce((a, b) => a + b, 0) / s.length;
    return { n: s.length, min: s[0], max: s[s.length - 1], avg: Math.round(avg * 10) / 10 };
  }

  // Pitch counts per pitcher of a side, for the sidebar
  function pitcherSidebar(S, game, fside) {
    return S.pitchersUsed[fside].map(pid => {
      const types = {};
      S.allPitches.filter(p => p.fside === fside && p.pitcher === pid).forEach(p => {
        (types[p.type] = types[p.type] || []).push(p.velo ? +p.velo : null);
      });
      return { pid, count: S.pitchCount[pid] || 0, types };
    });
  }

  // Location → 3x3 zone (1-9, catcher's view, 1 = top-left) or out-of-zone 11-14 (Gameday convention)
  function zoneNumber(loc) {
    if (!loc) return '';
    const { x, y } = loc;
    if (Math.abs(x) <= 1 && Math.abs(y) <= 1) {
      const col = x < -1 / 3 ? 0 : x <= 1 / 3 ? 1 : 2;
      const row = y > 1 / 3 ? 0 : y >= -1 / 3 ? 1 : 2;
      return row * 3 + col + 1;
    }
    if (y >= 0) return x < 0 ? 11 : 12;
    return x < 0 ? 13 : 14;
  }

  // Location described from the hitter's point of view
  function locWords(loc, hand) {
    if (!loc) return '';
    const { x, y } = loc;
    const inside = hand === 'L' ? x > 0 : x < 0; // catcher's view: RHH stands on the left
    const h = Math.abs(x) <= 1 / 3 ? 'middle' : inside ? 'in' : 'away';
    const v = y > 1 / 3 ? 'up' : y < -1 / 3 ? 'down' : 'mid';
    const zone = inZone(loc) ? 'zone' : 'chase';
    return (v === 'mid' && h === 'middle' ? 'heart' : (v === 'mid' ? '' : v + ' ') + h).trim() + ' (' + zone + ')';
  }

  function ordinal(n) { return ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : Math.min(n % 10, 4) % 4] || 'th'; }

  const api = {
    PITCH_TYPES, RESULTS, STRIKE_RES, SWING_RES, CIRCLE_RES, HIT_CODES, SLOTS,
    uid, other, newGame, player, pLabel, ordinal, handFor, inZone, defaultMoves, validateMoves, baseName,
    replay, pitchingStats, veloSummary, pitcherSidebar, ipStr, pct, zoneNumber, locWords,
    battingSide: bat, fieldingSide: fld
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
