// mc-v1 analysis — the campaign's own statistics, drawn in the site's print.
//
// The numbers come from the campaign process (GET /api/campaigns/{id}/stats,
// relayed by the midend exactly as the ranking is), so this module computes
// nothing a reader could disagree with: it only rescales and draws. The figure
// set follows the paper's mc-v1 figures (submission/arxiv/figures: standings,
// attack/defense, profiles, progress, coverage, facets), restyled.
//
// Identity follows the site's rule: an entrant is coloured by its MODEL's
// vendor (loadHarnesses().modelColor). Two entrants of one vendor share a hue,
// so they are told apart by marker shape and dash — and by the entrant rail:
// hover or tap any entrant, anywhere, and every figure follows it.
//
// The speed figure reads a second, midend-computed document (GET /api/runs/speed);
// without it the figure says so and the rest draws as before.
//
//   renderMcAnalysis(host, { stats, H, speed })  -> { destroy() }
import { esc } from './util.js';
import { entrantIcon } from './entrant-icon.js';

const AXIS_SHORT = { A: 'access control', X: 'input and execution', F: 'files and resources',
                     C: 'cryptography and randomness', R: 'parsing', S: 'protocol and state' };
const SHAPES = ['circle', 'square', 'diamond', 'triangle'];
const pct = (a, b) => b ? 100 * a / b : 0;
const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1);
const sum = a => a.reduce((x, y) => x + y, 0);

/* ---- tiny scale + tick helpers ---------------------------------------- */
const lin = (d0, d1, r0, r1) => v => r0 + (v - d0) / ((d1 - d0) || 1) * (r1 - r0);
function niceTicks(lo, hi, n = 5){
  const span = hi - lo || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const out = [];
  for(let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(6));
  return out;
}
function marker(shape, x, y, r, fill, extra = ''){
  const ring = `stroke="var(--paper2)" stroke-width="2"`;
  if(shape === 'square') return `<rect x="${x - r * .9}" y="${y - r * .9}" width="${r * 1.8}" height="${r * 1.8}" fill="${fill}" ${ring} ${extra}/>`;
  if(shape === 'diamond') return `<path d="M${x} ${y - r * 1.2}L${x + r * 1.2} ${y}L${x} ${y + r * 1.2}L${x - r * 1.2} ${y}Z" fill="${fill}" ${ring} ${extra}/>`;
  if(shape === 'triangle') return `<path d="M${x} ${y - r * 1.2}L${x + r * 1.1} ${y + r * .8}L${x - r * 1.1} ${y + r * .8}Z" fill="${fill}" ${ring} ${extra}/>`;
  return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${ring} ${extra}/>`;
}

export function renderMcAnalysis(host, { stats, H, speed = null }){
  const S = stats;
  /* ---- the cast, in ranking order ------------------------------------- */
  const meta = Object.fromEntries((S.entrants || []).map(e => [e.id, e]));
  const order = (S.ranking || []).map(r => r.id).filter(id => meta[id] && !meta[id].disabled);
  const rankOf = Object.fromEntries(order.map((id, i) => [id, i + 1]));
  const rk = Object.fromEntries((S.ranking || []).map(r => [r.id, r]));
  const ent = id => ({ model: meta[id]?.model || id, harness: meta[id]?.harness || '' });
  const color = Object.fromEntries(order.map(id => [id, H.modelColor(ent(id))]));
  // the n-th entrant of a hue gets the n-th marker shape and, past the first, a dashed line
  const seen = {}, shape = {}, dashed = {};
  order.forEach(id => { const c = color[id]; const k = seen[c] = (seen[c] ?? -1) + 1;
    shape[id] = SHAPES[k % SHAPES.length]; dashed[id] = k > 0; });
  const ID = id => esc(id);

  /* ---- shell ------------------------------------------------------------ */
  const caps = S.caps || {};
  const ob = caps.open_batch;
  // the campaign's challenge set (caps.challenges); games_challenge alone lists only
  // those with a valid game, which undercounts a challenge nobody has finished yet
  const chal = caps.challenges ?? Object.keys(S.games_challenge || {}).length;
  host.classList.add('mca');
  host.innerHTML = `
    <div class="mca-tiles plate">
      ${tile(caps.valid_now, caps.valid_budget, 'valid matches', 'of the budget')}
      ${tile(caps.committed_batches, null, ob ? `batches · ${esc(ob.id)} open` : 'batches committed')}
      ${tile(caps.total_subs, caps.submission_ceiling, 'matches submitted', 'of the ceiling', 'p')}
      ${tile(order.length, null, 'entrants ranked')}
      ${tile(chal, null, 'challenges')}
    </div>
    <div class="mca-rail" role="toolbar" aria-label="Follow one entrant through every figure">
      <div class="hint" title="Hover or tap an entrant to follow it through every figure; tap again to let go">Follow</div>
      <div class="mca-chips">${order.map(id => `
        <button class="mca-chip" data-e="${ID(id)}" type="button">
          <span class="rk">${rankOf[id]}</span>${entrantIcon(H, ent(id), 0, { inline: true })}${ID(id)}
        </button>`).join('')}</div>
    </div>
    <div class="figs"></div>`;
  const figs = host.querySelector('.figs');

  function tile(v, of, label, ofLabel = '', cls = ''){
    const meter = of ? `<div class="meter"><i class="${cls}" data-w="${Math.min(100, pct(v, of)).toFixed(1)}"></i></div>` : '';
    return `<div><b>${v ?? '—'}${of ? ` <small>/ ${of}</small>` : ''}</b><span>${label}${of ? ` ${ofLabel}` : ''}</span>${meter}</div>`;
  }
  requestAnimationFrame(() => host.querySelectorAll('.meter i').forEach(i => { i.style.width = i.dataset.w + '%'; }));

  /* ---- the figure frames ------------------------------------------------ */
  const FIGS = [
    ['standings', 'Who is ahead, and by how much',
      'Expected score against every opponent on every challenge, 0–100, with its 5–95% interval. Right: the general attack and defense abilities behind it, relative to the field.'],
    ['progress', 'How the ranking settled, batch by batch',
      'Each entrant’s expected score after every committed batch, refit from the prior on all matches so far. Shaded: the uniform pilot. After it, batches are chosen by expected information gain, with a 25% uniform share.'],
    ['profiles', 'Where each entrant is strong',
      'How attack and defense shift with the kind of weakness a challenge holds, relative to the entrant’s own general ability. The dotted ring is zero.'],
    ['facets', 'Attack, defense and uptime, measured directly',
      'Share of rounds in which the entrant captured the opponent’s flag or kept its own, and share of health probes its service passed. Raw counts, no model.'],
    ['speed', 'How fast the first capture and the first restart land',
      'Seconds from the round’s start to the entrant’s first accepted capture and its first completed service restart. A restart marks a defense attempt, not a working fix. Ink: share of rounds in each span; tick: median; bar: middle half; number: share of rounds in which it happened.'],
    ['coverage', 'What was played',
      'Left: valid matches per entrant in each batch. Right: its record against every other entrant. The number is the valid matches between them; the ink is the row’s share of points (a win 1, a draw ½). Columns follow rank.'],
  ];
  figs.innerHTML = FIGS.map(([k, t, p], i) => `
    <figure class="fig plate" id="fig-${k}">
      <header><div><h3><span class="no">${String(i + 1).padStart(2, '0')}</span>${t}</h3><p>${p}</p></div><div class="ctl"></div></header>
      <div class="body"></div>
      <details><summary>Show the numbers</summary><div class="tbl"></div></details>
    </figure>`).join('');
  const fig = k => figs.querySelector(`#fig-${k}`);
  const table = (k, head, rows) => {
    fig(k).querySelector('.tbl').innerHTML = `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  };

  /* ---- the tooltip ------------------------------------------------------ */
  const tip = document.createElement('div');
  tip.className = 'mca-tip';
  document.body.appendChild(tip);
  const showTip = (e, html) => {
    tip.innerHTML = html; tip.classList.add('on');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 16, y = e.clientY + 14;
    if(x + w > innerWidth - 8) x = e.clientX - w - 16;
    if(y + h > innerHeight - 8) y = e.clientY - h - 14;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  const hideTip = () => tip.classList.remove('on');
  const tipRow = (id, val, me) => `<div class="r${me ? ' me' : ''}"><i style="border-color:${color[id]}${dashed[id] ? ';border-top-style:dashed' : ''}"></i><b>${val}</b><span>${ID(id)}</span></div>`;

  /* ---- linked focus ------------------------------------------------------
     One injected rule dims every mark that is not the focused entrant's. Cheap
     at any mark count, and every figure follows without knowing about it. */
  const style = document.createElement('style');
  document.head.appendChild(style);
  let pinned = null, hovered = null;
  const applyFocus = () => {
    const id = hovered || pinned;
    host.classList.toggle('focusing', !!id);
    host.querySelectorAll('.mca-chip').forEach(c => {
      c.classList.toggle('on', c.dataset.e === id);
      c.classList.toggle('pin', c.dataset.e === pinned);
    });
    style.textContent = id ? `.mca.focusing svg [data-e]:not([data-e="${CSS.escape(id)}"]){opacity:.12}
      .mca.focusing .radar[data-e]:not([data-e="${CSS.escape(id)}"]){opacity:.3}
      .mca.focusing svg [data-e="${CSS.escape(id)}"] .lbl{font-weight:800}` : '';
  };
  const onOver = e => { const t = e.target.closest('[data-e]'); if(t && host.contains(t)){ hovered = t.dataset.e; applyFocus(); } };
  const onOut = e => { const t = e.target.closest('[data-e]'); if(t && !t.contains(e.relatedTarget)){ hovered = null; applyFocus(); } };
  const onClick = e => {
    const t = e.target.closest('[data-e]');
    if(!t || !host.contains(t)) return;
    pinned = pinned === t.dataset.e ? null : t.dataset.e;
    hovered = null; applyFocus();
  };
  host.addEventListener('pointerover', onOver);
  host.addEventListener('pointerout', onOut);
  host.addEventListener('click', onClick);

  /* =========================================================================
     01 standings (dot + interval) | attack × defense
     ========================================================================= */
  function drawStandings(W){
    const two = W > 700, w = two ? (W - 26) / 2 : W;
    const rowH = 26, top = 8, padL = 150, padR = 46, h = top + order.length * rowH + 30;
    const lo = Math.floor(Math.min(...order.map(id => rk[id].lo)) - 1), hi = Math.ceil(Math.max(...order.map(id => rk[id].hi)) + 1);
    const x = lin(lo, hi, padL, w - padR);
    const ticks = niceTicks(lo, hi, 5);
    let a = `<svg width="${w}" height="${h}" role="img" aria-label="Expected score with 5–95% interval per entrant">
      <g class="ax">${ticks.map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="${top}" y2="${h - 26}"/><text x="${x(t)}" y="${h - 10}" text-anchor="middle">${t}</text>`).join('')}</g>`;
    order.forEach((id, i) => {
      const y = top + i * rowH + rowH / 2, r = rk[id];
      a += `<g data-e="${ID(id)}" class="row" data-tip="st">
        <rect class="row-hl" x="0" y="${y - rowH / 2}" width="${w}" height="${rowH}" opacity="0"/>
        <text x="0" y="${y + 4}" class="mono lbl" font-size="11.5">${rankOf[id]}. ${ID(id)}</text>
        <line x1="${x(r.lo)}" x2="${x(r.hi)}" y1="${y}" y2="${y}" stroke="${color[id]}" stroke-width="3" stroke-linecap="round"/>
        ${marker(shape[id], x(r.score), y, 5.5, color[id])}
        <text x="${w - 2}" y="${y + 4}" text-anchor="end" class="mono" font-size="11.5" font-weight="700">${fmt1(r.score)}</text>
        <rect class="hit" x="0" y="${y - rowH / 2}" width="${w}" height="${rowH}"/></g>`;
    });
    a += `<text x="${(padL + w - padR) / 2}" y="${h + 6}" text-anchor="middle" class="ax-cap" font-size="0"></text></svg>`;

    // abilities scatter
    const ab = S.abilities || {};
    const pts = order.filter(id => ab[id]).map(id => ({ id, ax: ab[id].attack, dy: ab[id].defense }));
    const hS = two ? h : Math.min(360, w * .8), pad = { l: 38, r: 14, t: 10, b: 32 };
    const ex = Math.max(...pts.map(p => Math.abs(p.ax))) * 1.18 || 1, ey = Math.max(...pts.map(p => Math.abs(p.dy))) * 1.18 || 1;
    const sx = lin(-ex, ex, pad.l, w - pad.r), sy = lin(-ey, ey, hS - pad.b, pad.t);
    const r = pearson(pts.map(p => p.ax), pts.map(p => p.dy));
    let b = `<svg width="${w}" height="${hS}" role="img" aria-label="Attack ability against defense ability">
      <g class="ax">${niceTicks(-ex, ex, 4).map(t => `<line x1="${sx(t)}" x2="${sx(t)}" y1="${pad.t}" y2="${hS - pad.b}"/><text x="${sx(t)}" y="${hS - pad.b + 14}" text-anchor="middle">${t}</text>`).join('')}
      ${niceTicks(-ey, ey, 4).map(t => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${sy(t)}" y2="${sy(t)}"/><text x="${pad.l - 6}" y="${sy(t) + 3}" text-anchor="end">${t}</text>`).join('')}
      <line class="base" x1="${sx(0)}" x2="${sx(0)}" y1="${pad.t}" y2="${hS - pad.b}" style="stroke-width:1.5"/>
      <line class="base" x1="${pad.l}" x2="${w - pad.r}" y1="${sy(0)}" y2="${sy(0)}" style="stroke-width:1.5"/>
      <text class="lab" x="${w - pad.r}" y="${hS - 4}" text-anchor="end">attack ability →</text>
      <text class="lab" x="${pad.l + 4}" y="${pad.t + 10}">↑ defense ability</text></g>
      <text x="${w - pad.r - 4}" y="${pad.t + 12}" text-anchor="end" class="mono" font-size="11" fill="#7a7468">r = ${r.toFixed(2)}</text>`;
    // labels: greedy placement, skip when it would collide
    const boxes = [];
    const fits = bx => !boxes.some(o => bx.x < o.x + o.w && bx.x + bx.w > o.x && bx.y < o.y + o.h && bx.y + bx.h > o.y)
      && bx.x > pad.l && bx.x + bx.w < w - pad.r + 10;
    pts.forEach(p => boxes.push({ x: sx(p.ax) - 6, y: sy(p.dy) - 6, w: 12, h: 12 }));
    pts.forEach(p => {
      const X = sx(p.ax), Y = sy(p.dy), tw = p.id.length * 6.4 + 4;
      const opts = [[9, 4, 'start'], [-9, 4, 'end'], [0, -10, 'middle'], [0, 17, 'middle']];
      let lab = '';
      for(const [dx, dy, anc] of opts){
        const bx = { x: anc === 'start' ? X + dx : anc === 'end' ? X + dx - tw : X - tw / 2, y: Y + dy - 10, w: tw, h: 12 };
        if(fits(bx)){ boxes.push(bx); lab = `<text x="${X + dx}" y="${Y + dy}" text-anchor="${anc}" class="mono lbl" font-size="10.5" fill="#4a4a4a">${ID(p.id)}</text>`; break; }
      }
      b += `<g data-e="${ID(p.id)}" data-tip="ab">${marker(shape[p.id], X, Y, 6, color[p.id])}${lab}<circle class="hit" cx="${X}" cy="${Y}" r="13"/></g>`;
    });
    b += '</svg>';
    const body = fig('standings').querySelector('.body');
    body.innerHTML = `<div class="duo2"><div><div class="panel-t">Expected score · 5–95%</div>${a}</div><div><div class="panel-t">General abilities</div>${b}</div></div>`;
    table('standings', ['Entrant', 'Score', '5%', '95%', 'Matches', 'Attack', 'Defense'],
      order.map(id => [`${rankOf[id]}. ${ID(id)}`, fmt1(rk[id].score), fmt1(rk[id].lo), fmt1(rk[id].hi), rk[id].games ?? '',
        ab[id] ? ab[id].attack.toFixed(2) : '', ab[id] ? ab[id].defense.toFixed(2) : '']));
  }

  /* =========================================================================
     02 progress — score after each committed batch, x = valid games
     ========================================================================= */
  function drawProgress(W){
    const T = S.trajectory || [];
    if(!T.length){ fig('progress').querySelector('.body').innerHTML = '<p class="mca-empty">No committed batch yet.</p>'; return; }
    // an entrant's line starts at the first batch in which it had played
    const played = {}, start = {};
    (S.drafting || []).forEach((d, bi) => order.forEach(id => {
      played[id] = (played[id] || 0) + ((d.counts || {})[id] || 0);
      if(played[id] > 0 && start[id] == null) start[id] = bi;
    }));
    const labW = W > 640 ? 150 : 0, pad = { l: 34, r: labW + 12, t: 12, b: 30 }, h = Math.min(420, Math.max(300, W * .42));
    const xs = T.map(t => t.valid_games);
    const all = T.flatMap(t => t.entries.filter(e => order.includes(e.id)).map(e => e.score));
    const y0 = Math.floor((Math.min(...all) - 1) / 5) * 5, y1 = Math.ceil((Math.max(...all) + 1) / 5) * 5;
    const x = lin(0, Math.max(...xs), pad.l, W - pad.r), y = lin(y0, y1, h - pad.b, pad.t);
    const pilotEnd = T.reduce((m, t, i) => String(t.mode || '').startsWith('pilot') ? i : m, -1);
    let s = `<svg width="${W}" height="${h}" role="img" aria-label="Score per entrant after each batch">
      ${pilotEnd >= 0 ? `<rect class="pilot" x="${pad.l}" y="${pad.t}" width="${x(T[pilotEnd].valid_games) - pad.l}" height="${h - pad.t - pad.b}"/>
        <text x="${pad.l + 6}" y="${pad.t + 13}" class="mono" font-size="10" fill="#8a857c">pilot</text>` : ''}
      <g class="ax">${niceTicks(y0, y1, 5).map(t => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${y(t)}" y2="${y(t)}"/><text x="${pad.l - 6}" y="${y(t) + 3}" text-anchor="end">${t}</text>`).join('')}
      ${niceTicks(0, Math.max(...xs), 6).map(t => `<text x="${x(t)}" y="${h - pad.b + 15}" text-anchor="middle">${t}</text>`).join('')}
      <line class="base" x1="${pad.l}" x2="${W - pad.r}" y1="${h - pad.b}" y2="${h - pad.b}"/>
      <text class="lab" x="${W - pad.r}" y="${h - 2}" text-anchor="end">valid matches →</text></g>`;
    const ends = [];
    [...order].reverse().forEach(id => {
      const p = T.map((t, i) => [i, t.entries.find(e => e.id === id)]).filter(([i, e]) => e && i >= (start[id] ?? 0));
      if(!p.length) return;
      const d = p.map(([i, e], k) => `${k ? 'L' : 'M'}${x(T[i].valid_games).toFixed(1)} ${y(e.score).toFixed(1)}`).join('');
      const [li, le] = p[p.length - 1];
      ends.push({ id, y: y(le.score), x: x(T[li].valid_games) });
      s += `<g data-e="${ID(id)}"><path class="ln" d="${d}" stroke="${color[id]}"${dashed[id] ? ' stroke-dasharray="6 4"' : ''}/>
        <path class="ln" d="${d}" stroke="transparent" stroke-width="12" style="cursor:pointer"/>
        ${marker(shape[id], x(T[li].valid_games), y(le.score), 4, color[id])}</g>`;
    });
    // end labels, pushed apart so none overlap, with a short leader
    if(labW){
      ends.sort((a, b) => a.y - b.y);
      const gap = 13.5;
      ends.forEach((e, i) => { e.ly = i ? Math.max(e.y, ends[i - 1].ly + gap) : e.y; });
      const over = (ends.at(-1)?.ly || 0) - (h - pad.b);
      if(over > 0) ends.forEach(e => { e.ly -= over; });
      ends.forEach(e => {
        const lx = W - pad.r + 10;
        s += `<g data-e="${ID(e.id)}" style="cursor:pointer"><path d="M${e.x + 5} ${e.y}L${lx - 3} ${e.ly}" stroke="${color[e.id]}" stroke-width="1" fill="none" opacity=".6"/>
          <text x="${lx}" y="${e.ly + 3.5}" class="mono lbl" font-size="10.5" fill="#3a3a3a">${ID(e.id)}</text></g>`;
      });
    }
    s += `<line class="xh" id="xh" x1="0" x2="0" y1="${pad.t}" y2="${h - pad.b}"/>
      <rect class="hit" id="xhit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${h - pad.t - pad.b}" style="fill:transparent;cursor:crosshair"/></svg>`;
    const body = fig('progress').querySelector('.body');
    body.innerHTML = s;
    // the crosshair finds the batch; one readout lists every entrant there
    const svg = body.querySelector('svg'), xh = svg.querySelector('#xh'), hit = svg.querySelector('#xhit');
    hit.addEventListener('pointermove', e => {
      const bx = e.clientX - svg.getBoundingClientRect().left;
      let bi = 0; xs.forEach((v, i) => { if(Math.abs(x(v) - bx) < Math.abs(x(xs[bi]) - bx)) bi = i; });
      xh.setAttribute('x1', x(xs[bi])); xh.setAttribute('x2', x(xs[bi])); xh.style.opacity = .5;
      const t = T[bi];
      const rows = t.entries.filter(en => order.includes(en.id) && bi >= (start[en.id] ?? 0)).sort((a, b) => b.score - a.score);
      const me = hovered || pinned;
      showTip(e, `<h5>${esc(t.batch)} · ${t.valid_games} valid matches · ${esc(t.mode || '')}</h5>${rows.map(en => tipRow(en.id, fmt1(en.score), en.id === me)).join('')}`);
    });
    hit.addEventListener('pointerleave', () => { xh.style.opacity = 0; hideTip(); });
    table('progress', ['Batch', 'Mode', 'Valid matches', ...order.map(ID)],
      T.map((t, i) => [esc(t.batch), esc(t.mode || ''), t.valid_games, ...order.map(id => {
        const en = t.entries.find(e => e.id === id); return en && i >= (start[id] ?? 0) ? fmt1(en.score) : '';
      })]));
  }

  /* =========================================================================
     04 facets — capture / kept / uptime, all rounds or one
     ========================================================================= */
  let round = -1;
  function drawFacets(W){
    const F = S.facets || {};
    const sel = a => round < 0 ? sum(a || []) : (a || [])[round] || 0;
    const rows = order.filter(id => F[id]).map(id => {
      const f = F[id];
      return { id, att: pct(sel(f.att_caps), sel(f.rounds)), def: pct(sel(f.def_kept), sel(f.rounds)),
               svc: pct(sel(f.svc_passed), sel(f.svc_probes)), n: sel(f.rounds) };
    });
    const cols = [['att', 'Attack: flag captured', 'var(--att)'], ['def', 'Defense: flag kept', 'var(--def)'], ['svc', 'Service: probes passed', 'var(--svc)']];
    const narrow = W < 640, labW = 128, rowH = 22;
    const cw = narrow ? W - labW : (W - labW - 24) / 3;
    const panel = ([k, title, c], withLabels) => {
      const w = cw + (withLabels ? labW : 0), x0 = withLabels ? labW : 0, x = lin(0, 100, x0, w - 34);
      let s = `<svg width="${w}" height="${rows.length * rowH + 26}" role="img" aria-label="${title}">
        <g class="ax">${[0, 50, 100].map(t => `<line x1="${x(t)}" x2="${x(t)}" y1="0" y2="${rows.length * rowH}"/><text x="${x(t)}" y="${rows.length * rowH + 14}" text-anchor="middle">${t}%</text>`).join('')}</g>`;
      rows.forEach((r, i) => {
        const y = i * rowH;
        s += `<g data-e="${ID(r.id)}" data-tip="fc">
          ${withLabels ? `<text x="0" y="${y + 15}" class="mono lbl" font-size="11">${ID(r.id)}</text>` : ''}
          <rect x="${x0}" y="${y + 5}" width="${Math.max(2, x(r[k]) - x0)}" height="${rowH - 10}" fill="${c}" rx="0"/>
          <text x="${x(r[k]) + 5}" y="${y + 15}" class="mono" font-size="10.5" fill="#4a4a4a">${Math.round(r[k])}</text>
          <rect class="hit" x="0" y="${y}" width="${w}" height="${rowH}"/></g>`;
      });
      return `<div><div class="panel-t" style="${withLabels ? `padding-left:${labW}px` : ''}">${title}</div>${s}</svg></div>`;
    };
    const body = fig('facets').querySelector('.body');
    body.innerHTML = narrow
      ? cols.map(c => panel(c, true)).join('')
      : `<div style="display:flex;gap:12px">${cols.map((c, i) => panel(c, i === 0)).join('')}</div>`;
    body._rows = Object.fromEntries(rows.map(r => [r.id, r]));
    table('facets', ['Entrant', 'Rounds', 'Captured %', 'Kept %', 'Probes passed %'],
      rows.map(r => [ID(r.id), r.n, fmt1(r.att), fmt1(r.def), fmt1(r.svc)]));
  }
  fig('facets').querySelector('.ctl').innerHTML = `<div class="seg" role="group" aria-label="Rounds">
    ${['All rounds', 'Round 1', 'Round 2', 'Round 3'].map((l, i) => `<button type="button" data-r="${i - 1}"${i === 0 ? ' class="on"' : ''}>${l}</button>`).join('')}</div>`;
  fig('facets').querySelector('.seg').addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    round = +b.dataset.r;
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    drawFacets(width()); applyFocus();
  });

  /* =========================================================================
     03 profiles — six-axis radar per entrant, attack and defense
     ========================================================================= */
  function drawProfiles(){
    const P = S.profile || {};
    const axes = P.axes || [], idx = Object.fromEntries((P.entrants || []).map((id, i) => [id, i]));
    const ai = (P.order || []).indexOf('attack'), di = (P.order || []).indexOf('defense');
    const vals = (P.mean || []).flat(2).map(Math.abs);
    const M = Math.max(.5, ...vals) * 1.05;
    const R = 54, c = 66, rr = v => R * (.5 + .5 * v / M);
    const pt = (k, v) => { const a = -Math.PI / 2 + k * 2 * Math.PI / axes.length; return [c + rr(v) * Math.cos(a), c + rr(v) * Math.sin(a)]; };
    const poly = arr => arr.map((v, k) => pt(k, v).map(n => n.toFixed(1)).join(',')).join(' ');
    const ring = v => axes.map((_, k) => pt(k, v).map(n => n.toFixed(1)).join(',')).join(' ');
    const body = fig('profiles').querySelector('.body');
    body.innerHTML = `<div class="lgd"><span style="color:var(--r-att)"><i class="sw" style="background:var(--r-att);opacity:.35"></i>attack profile</span>
      <span style="color:var(--r-def)"><i class="dash"></i>defense profile</span></div>
      <div class="radars">${order.filter(id => idx[id] != null).map(id => {
        const a = ai >= 0 ? P.mean[ai][idx[id]] : null, d = di >= 0 ? P.mean[di][idx[id]] : null;
        return `<div class="radar" data-e="${ID(id)}" data-tip="pf">
          <div class="rt">${entrantIcon(H, ent(id), 0, { inline: true })}${rankOf[id]}. ${ID(id)}</div>
          <svg width="${2 * c}" height="${2 * c}" viewBox="0 0 ${2 * c} ${2 * c}" style="margin:0 auto" aria-label="${ID(id)} profile">
            <polygon points="${ring(M)}" fill="none" stroke="#e1d9c8"/>
            <polygon points="${ring(0)}" fill="none" stroke="#8a857c" stroke-width="1.5" stroke-dasharray="1 3" stroke-linecap="round"/>
            ${axes.map((x, k) => { const [X, Y] = pt(k, M * 1.22); const [x2, y2] = pt(k, M);
              return `<line x1="${c}" y1="${c}" x2="${x2}" y2="${y2}" stroke="#e1d9c8"/><text x="${X}" y="${Y + 3.5}" text-anchor="middle" class="mono" font-size="9.5" fill="#8a857c">${esc(x)}</text>`; }).join('')}
            ${a ? `<polygon points="${poly(a)}" fill="var(--r-att)" fill-opacity=".2" stroke="var(--r-att)" stroke-width="2" stroke-linejoin="round"/>` : ''}
            ${d ? `<polygon points="${poly(d)}" fill="none" stroke="var(--r-def)" stroke-width="2" stroke-dasharray="5 3" stroke-linejoin="round"/>` : ''}
          </svg></div>`;
      }).join('')}</div>
      <div class="axkey">${axes.map(x => `<span><b>${esc(x)}</b>${esc(AXIS_SHORT[x] || (P.axis_names || {})[x] || x)}</span>`).join('')}</div>`;
    body._prof = { idx, ai, di, axes };
    table('profiles', ['Entrant', ...axes.map(x => `att ${esc(x)}`), ...axes.map(x => `def ${esc(x)}`)],
      order.filter(id => idx[id] != null).map(id => [ID(id),
        ...(ai >= 0 ? P.mean[ai][idx[id]] : []).map(v => v.toFixed(2)), ...(di >= 0 ? P.mean[di][idx[id]] : []).map(v => v.toFixed(2))]));
  }

  /* =========================================================================
     06 coverage — games per entrant per batch | pair records
     ========================================================================= */
  function drawCoverage(W){
    const D = S.drafting || [], P = S.pairs || {}, n = order.length;
    // ONE drawing, so the two halves share their rows by construction: the label
    // column, the batch grid, a total, a gap, then the pair grid on the same cell.
    const labW = 150, totW = 34, gap = 30, top = 32;
    const cell = Math.max(12, Math.min(22, Math.floor((W - labW - totW - gap) / (D.length + n))));
    const xA = labW, xT = xA + D.length * cell, xB = xT + totW + gap;
    const Wd = xB + n * cell, Hd = top + n * cell + 20;
    const max = Math.max(1, ...D.flatMap(d => order.map(id => (d.counts || {})[id] || 0)));
    const EMPTY = '#efe9dc';
    // the one ink ramp both halves use: t in 0..1 -> fill, and the number's colour on it
    const ink = t => `rgba(26,26,26,${(.12 + .78 * t).toFixed(2)})`;
    const num = (x, y, v, t) => cell >= 15 ? `<text x="${x + (cell - 2) / 2}" y="${y + cell * .62}" text-anchor="middle" fill="${t > .45 ? 'var(--paper)' : 'var(--ink)'}">${v}</text>` : '';
    let pilotEnd = -1; D.forEach((d, i) => { if(String(d.mode || '').startsWith('pilot')) pilotEnd = i; });
    let g = `<svg width="${Wd}" height="${Hd}" role="img" aria-label="Valid games per batch and the record of every pairing, one row per entrant">
      <g class="ax"><text class="lab" x="${xA}" y="9">valid matches · batch</text><text class="lab" x="${xB}" y="9">record · against</text></g>`;
    if(pilotEnd >= 0) g += `<rect x="${xA}" y="15" width="${cell * (pilotEnd + 1) - 2}" height="10" fill="#e1d9c8"/><text x="${xA + 3}" y="23.5" class="mono" font-size="8.5" fill="#6f6657">pilot</text>`;
    g += `<rect x="${xA + cell * (pilotEnd + 1)}" y="15" width="${cell * (D.length - pilotEnd - 1) - 2}" height="10" fill="var(--ink)"/><text x="${xA + cell * (pilotEnd + 1) + 3}" y="23.5" class="mono" font-size="8.5" fill="var(--paper)">information gain · 25% uniform</text>`;
    order.forEach((ri, r) => {
      const y = top + r * cell;
      let tot = 0;
      g += `<g data-e="${ID(ri)}"><text x="14" y="${y + cell * .68}" text-anchor="end" class="mono" font-size="10.5" fill="#9a9282">${r + 1}</text><text x="20" y="${y + cell * .68}" class="mono lbl" font-size="10.5">${ID(ri)}</text>`;
      D.forEach((d, c) => {
        const v = (d.counts || {})[ri] || 0; tot += v;
        const x = xA + c * cell, t = v / max;
        g += `<g class="cell" data-tip="cv" data-b="${c}"><rect x="${x}" y="${y}" width="${cell - 2}" height="${cell - 2}" fill="${v ? ink(t) : EMPTY}"/>${v ? num(x, y, v, t) : ''}</g>`;
      });
      g += `<text x="${xT + 6}" y="${y + cell * .68}" class="mono" font-size="10.5" fill="#7a7468">${tot}</text>`;
      order.forEach((ci, c) => {
        const x = xB + c * cell;
        const p = r === c ? null : P[[ri, ci].sort().join('|')];
        if(!p || !p.games){ g += `<rect x="${x}" y="${y}" width="${cell - 2}" height="${cell - 2}" fill="${EMPTY}"/>`; return; }
        const t = (((p.wins || {})[ri] || 0) + p.draws / 2) / p.games;
        g += `<g class="cell" data-tip="pr" data-r="${ID(ri)}" data-c="${ID(ci)}"><rect x="${x}" y="${y}" width="${cell - 2}" height="${cell - 2}" fill="${t ? ink(t) : EMPTY}"/>${num(x, y, p.games, t)}</g>`;
      });
      g += '</g>';
    });
    // bottom axes, one baseline: batch numbers under the left grid, ranks under the right
    const by = top + n * cell + 13;
    g += `<g class="ax">${D.map((d, c) => (c % (cell < 15 ? 3 : 1) === 0 || c === D.length - 1) ? `<text x="${xA + c * cell + (cell - 2) / 2}" y="${by}" text-anchor="middle" style="font-size:9px">${c + 1}</text>` : '').join('')}
      ${order.map((_, c) => `<text x="${xB + c * cell + (cell - 2) / 2}" y="${by}" text-anchor="middle" style="font-size:9px">${c + 1}</text>`).join('')}</g></svg>`;
    const body = fig('coverage').querySelector('.body');
    body.innerHTML = `<div style="overflow-x:auto">${g}</div>`;
    table('coverage', ['Pair', 'Planned', 'Valid matches', 'Wins', 'Draws'],
      Object.entries(P).filter(([k]) => k.split('|').every(id => order.includes(id)))
        .sort((a, b) => b[1].games - a[1].games)
        .map(([k, p]) => [esc(k.replace('|', ' vs ')), p.planned, p.games,
          esc(Object.entries(p.wins || {}).map(([id, w]) => `${id} ${w}`).join(', ')), p.draws]));
  }

  /* =========================================================================
     05 speed — first capture | first patch, a doubling time scale per row
     (GET /api/runs/speed: per-round histograms + quartiles, never the points)
     ========================================================================= */
  let spRound = 0;               // round 1 by default, as the paper reports it
  const SP = speed?.entrants || {};
  const spOf = id => SP[`${ent(id).model}@${ent(id).harness}`];
  const spSel = (k, e) => {
    const h = e[k].h, nb = h[0].length;
    const counts = spRound < 0 ? Array.from({ length: nb }, (_, b) => sum(h.map(r => r[b]))) : h[spRound];
    const rounds = spRound < 0 ? e.games * h.length : e.games;
    return { counts, rounds, hit: sum(counts), q: e[k].q[spRound + 1] };
  };
  const fmtSec = s => s < 120 ? `${s} s` : `${fmt1(s / 60)} min`;
  function drawSpeed(W){
    const body = fig('speed').querySelector('.body');
    if(!speed){ body.innerHTML = '<p class="mca-empty">Timing is not available from this midend.</p>'; return; }
    const edges = speed.edges, nb = edges.length;
    const rows = order.filter(spOf);
    const narrow = W < 640, labW = 128, numW = 40, rowH = 24;
    const pw = narrow ? W : (W - 24) / 2;
    // a moment's x: linear inside the first span, logarithmic in the doubling ones;
    // the last span is open, drawn as one more doubling and clamped at its end
    const panel = ([k, title, c], withLabels) => {
      const w = pw, x0 = withLabels ? labW : 0, cw = (w - x0 - numW) / nb;
      const xs = s => {
        let b = 0; while(b + 1 < nb && s >= edges[b + 1]) b++;
        const lo = edges[b], hi = b + 1 < nb ? edges[b + 1] : lo * 2;
        const f = b === 0 ? s / (hi || 1) : Math.log(s / lo) / Math.log(hi / lo);
        return x0 + (b + Math.min(1, Math.max(0, f))) * cw;
      };
      const sel = Object.fromEntries(rows.map(id => [id, spSel(k, spOf(id))]));
      const max = Math.max(1e-9, ...rows.flatMap(id => sel[id].counts.map(n => n / (sel[id].rounds || 1))));
      const H0 = rows.length * rowH;
      let s = `<svg width="${w}" height="${H0 + 30}" role="img" aria-label="${title}">
        <g class="ax">${edges.map((t, b) => `<line x1="${x0 + b * cw}" x2="${x0 + b * cw}" y1="0" y2="${H0}"/><text x="${x0 + b * cw}" y="${H0 + 14}" text-anchor="middle">${t}</text>`).join('')}
          <text class="lab" x="${x0 + nb * cw}" y="${H0 + 28}" text-anchor="end">seconds into the round →</text></g>`;
      rows.forEach((id, i) => {
        const y = i * rowH, v = sel[id], q = v.q;
        s += `<g data-e="${ID(id)}" data-tip="sp" data-k="${k}">
          <rect class="hit" x="0" y="${y}" width="${w}" height="${rowH}"/>
          ${withLabels ? `<text x="0" y="${y + 15}" class="mono lbl" font-size="11">${ID(id)}</text>` : ''}
          ${v.counts.map((n, b) => `<rect data-sb="${b}" x="${x0 + b * cw + 1}" y="${y + 4}" width="${cw - 2}" height="${rowH - 12}"
            fill="${n ? c : '#efe9dc'}"${n ? ` fill-opacity="${(.15 + .85 * n / (v.rounds || 1) / max).toFixed(2)}"` : ''}/>`).join('')}
          ${q ? `<line x1="${xs(q[0])}" x2="${xs(q[2])}" y1="${y + rowH - 4}" y2="${y + rowH - 4}" stroke="var(--ink)" stroke-width="2"/>
            <rect x="${xs(q[1]) - 1.5}" y="${y + 2}" width="3" height="${rowH - 4}" fill="var(--ink)" stroke="var(--paper2)" stroke-width="1"/>` : ''}
          <text x="${w - 2}" y="${y + 15}" text-anchor="end" class="mono" font-size="10.5" fill="#4a4a4a">${Math.round(pct(v.hit, v.rounds))}%</text></g>`;
      });
      return `<div><div class="panel-t" style="${withLabels ? `padding-left:${labW}px` : ''}">${title}</div>${s}</svg></div>`;
    };
    const cols = [['capture', 'First capture', 'var(--att)'], ['patch', 'First restart', 'var(--def)']];
    body.innerHTML = narrow
      ? cols.map(c => panel(c, true)).join('')
      : `<div style="display:flex;gap:24px">${cols.map((c, i) => panel(c, i === 0)).join('')}</div>`;
    const cell = v => v.q ? [fmtSec(v.q[1]), `${fmtSec(v.q[0])}–${fmtSec(v.q[2])}`] : ['—', '—'];
    table('speed', ['Entrant', 'Rounds', 'Captured in %', 'Median', 'Middle half', 'Restarted in %', 'Median', 'Middle half'],
      rows.map(id => { const a = spSel('capture', spOf(id)), p = spSel('patch', spOf(id));
        return [ID(id), a.rounds, fmt1(pct(a.hit, a.rounds)), ...cell(a), fmt1(pct(p.hit, p.rounds)), ...cell(p)]; }));
  }
  fig('speed').querySelector('.ctl').innerHTML = `<div class="seg" role="group" aria-label="Rounds">
    ${['All rounds', 'Round 1', 'Round 2', 'Round 3'].map((l, i) => `<button type="button" data-r="${i - 1}"${i - 1 === spRound ? ' class="on"' : ''}>${l}</button>`).join('')}</div>`;
  fig('speed').querySelector('.seg').addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    spRound = +b.dataset.r;
    b.parentElement.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    drawSpeed(width()); applyFocus();
  });

  /* ---- tooltips for marks (one delegated listener) ---------------------- */
  const onMove = e => {
    const t = e.target.closest('[data-tip]');
    if(!t || !host.contains(t)){ if(!e.target.closest('#xhit')) hideTip(); return; }
    const id = t.dataset.e, k = t.dataset.tip;
    if(k === 'st'){ const r = rk[id]; showTip(e, `<h5>${rankOf[id]}. ${ID(id)}</h5><p><b>${fmt1(r.score)}</b> expected score<br>5–95%: <b>${fmt1(r.lo)}–${fmt1(r.hi)}</b><br><b>${r.games ?? '—'}</b> valid matches</p>`); }
    else if(k === 'ab'){ const a = S.abilities[id]; showTip(e, `<h5>${ID(id)}</h5><p>attack <b>${a.attack >= 0 ? '+' : ''}${a.attack.toFixed(2)}</b><br>defense <b>${a.defense >= 0 ? '+' : ''}${a.defense.toFixed(2)}</b></p>`); }
    else if(k === 'fc'){ const r = fig('facets').querySelector('.body')._rows[id]; showTip(e, `<h5>${ID(id)} · ${round < 0 ? 'all rounds' : `round ${round + 1}`}</h5><p>captured <b>${fmt1(r.att)}%</b><br>kept <b>${fmt1(r.def)}%</b><br>probes passed <b>${fmt1(r.svc)}%</b><br>over <b>${r.n}</b> rounds</p>`); }
    else if(k === 'pf'){ const pr = fig('profiles').querySelector('.body')._prof, P = S.profile, i = pr.idx[id];
      showTip(e, `<h5>${ID(id)}</h5><p>${pr.axes.map((x, j) => `${esc(x)} <b>${pr.ai >= 0 ? fmtS(P.mean[pr.ai][i][j]) : ''}</b> / <b>${pr.di >= 0 ? fmtS(P.mean[pr.di][i][j]) : ''}</b>`).join('<br>')}</p><p style="margin-top:4px;font-size:11px;color:#8a857c">attack / defense</p>`); }
    else if(k === 'cv'){ const d = S.drafting[+t.dataset.b]; const row = t.closest('[data-e]').dataset.e;
      showTip(e, `<h5>${esc(d.batch)} · ${esc(d.mode || '')}</h5><p><b>${(d.counts || {})[row] || 0}</b> valid matches for ${ID(row)}</p>`); }
    else if(k === 'pr'){ const ri = t.dataset.r, ci = t.dataset.c, p = S.pairs[[ri, ci].sort().join('|')];
      showTip(e, `<h5>${ID(ri)} vs ${ID(ci)}</h5><p><b>${(p.wins || {})[ri] || 0}</b> – <b>${(p.wins || {})[ci] || 0}</b>, <b>${p.draws}</b> drawn<br>${p.games} valid of ${p.planned} planned</p>`); }
    else if(k === 'sp'){ const kind = t.dataset.k, v = spSel(kind, spOf(id)), c = e.target.closest('[data-sb]');
      const b = c ? +c.dataset.sb : -1, ed = speed.edges, span = b < 0 ? '' : b + 1 < ed.length ? `${ed[b]}–${ed[b + 1]} s` : `${ed[b]} s or later`;
      showTip(e, `<h5>${ID(id)} · first ${kind === 'patch' ? 'restart' : kind} · ${spRound < 0 ? 'all rounds' : `round ${spRound + 1}`}</h5><p>in <b>${v.hit}</b> of <b>${v.rounds}</b> rounds (<b>${fmt1(pct(v.hit, v.rounds))}%</b>)`
        + (v.q ? `<br>median <b>${fmtSec(v.q[1])}</b><br>middle half <b>${fmtSec(v.q[0])}–${fmtSec(v.q[2])}</b>` : '')
        + (b >= 0 ? `<br><b>${v.counts[b]}</b> rounds at ${span}` : '') + '</p>'); }
  };
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', hideTip);

  /* ---- render at the width we have; re-render on resize ----------------- */
  const width = () => Math.max(280, figs.querySelector('.fig .body').clientWidth - 40);
  const draw = () => { const W = width(); drawStandings(W); drawProgress(W); drawFacets(W); drawProfiles(); drawCoverage(W); drawSpeed(W); applyFocus(); };
  draw();
  let lastW = innerWidth, rz;
  const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { if(innerWidth !== lastW){ lastW = innerWidth; draw(); } }, 160); };
  addEventListener('resize', onResize);

  return { destroy(){ removeEventListener('resize', onResize); tip.remove(); style.remove(); host.innerHTML = ''; host.classList.remove('mca', 'focusing'); } };
}

function pearson(a, b){
  const n = a.length; if(n < 3) return 0;
  const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let s = 0, sa = 0, sb = 0;
  for(let i = 0; i < n; i++){ s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; }
  return s / Math.sqrt(sa * sb || 1);
}
const fmtS = v => `${v >= 0 ? '+' : ''}${v.toFixed(2)}`;

/* ---- fetching + mounting, for the leaderboard ----
   Resolves to the renderer handle, or null when the campaign publishes no
   stats (404) — the caller then shows nothing. A held copy served while the
   campaign is away arrives `stale`, and the freshness line says so. */
export async function mountCampaignAnalysis(host, id, { H, api, fresh } = {}){
  // in parallel, and optional: a midend without /api/runs/speed still draws the rest
  const speed = fetch(api(`/api/runs/speed?campaign=${encodeURIComponent(id)}`))
    .then(r => r.ok ? r.json() : null).catch(() => null);
  let res;
  try { res = await fetch(api(`/api/campaigns/${encodeURIComponent(id)}/stats`)); }
  catch { host.innerHTML = `<p class="mca-empty">Could not reach the midend for ${esc(id)}’s statistics.</p>`; return null; }
  if(res.status === 404){ host.innerHTML = ''; return null; }
  const doc = await res.json().catch(() => null);
  if(!res.ok || !doc || !doc.ranking){
    host.innerHTML = `<p class="mca-empty">${esc(id)} has not published its statistics yet — a cold start refits every batch and takes a minute or two.</p>`;
    return null;
  }
  if(fresh) fresh.innerHTML = freshness(doc);
  return renderMcAnalysis(host, { stats: doc, H, speed: await speed });
}

function ago(iso){
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if(!isFinite(s)) return 'unknown';
  if(s < 90) return 'just now';
  if(s < 5400) return `${Math.round(s / 60)} min ago`;
  if(s < 172800) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
}
function freshness(d){
  const c = d.caps || {};
  return `${c.committed_batches ?? '?'} committed batches · computed <b>${d.computed_at ? ago(d.computed_at) : '—'}</b>`
    + (d.stale ? ` · <span class="stale">held copy, campaign unreachable${d.from_snapshot ? ' (stored)' : ''}</span>` : '')
    + (d.method ? ` · method <b>${esc(d.method)}</b>` : '');
}
