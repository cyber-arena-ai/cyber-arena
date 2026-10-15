// Leaderboard — standings published by CAMPAIGNS.
//
// The midend is a RELAY. It persists nothing about a ranking — it keeps a
// routing table of campaign ids and endpoints, and asks the campaign itself for
// everything else, behind a short-TTL response cache. A cached copy served
// while the campaign is unreachable arrives marked `stale`, and is shown as
// such: a held ranking must never be presented as a current one. A campaign (cyber-arena-deploy/campaign/) is a persistent
// process beside the midend: it pulls the run list, applies its own selection
// and algorithm, and serves the result over loopback. So every field on this
// page is the campaign's own word, read live — including its type. That is the point: a ranking is one campaign's opinion, identified and
// comparable, not an unattributed number handed down by the server.
//
// The table is GENERIC. Each campaign declares its own `columns`, so a new
// campaign with a different algorithm renders here without a frontend change.
import { loadJSON, loadHarnesses, setActiveNav, api, dropdown, scoreDomain, bellSVG } from './util.js';
import { DEFAULT_CAMPAIGN } from './config.js';
import { mountCampaignAnalysis } from './mc-analysis.js';
import { entrantIcon } from './entrant-icon.js';

setActiveNav('leaderboard.html');

const dek = document.getElementById('dek');
const picker = document.getElementById('campaigns');
const head = document.getElementById('lb-head');
const facts = document.getElementById('lb-facts');
const board = document.getElementById('board');
const lead = document.getElementById('lead');
const rows = document.getElementById('rows');
const anaSec = document.getElementById('analysis-sec');
let ana = null, anaFor = '';
const clearBoard = () => { lead.innerHTML = ''; lead.className = 'lead';
                           lead.style.background = ''; rows.innerHTML = '';
                           facts.innerHTML = ''; };

const [list, H] = await Promise.all([
  loadJSON(api('/api/campaigns')).catch(() => ({ campaigns: [] })),
  loadHarnesses(),
]);
const campaigns = list.campaigns || [];

const ago = iso => {
  if(!iso) return 'never';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if(!isFinite(s)) return 'unknown';
  if(s < 90) return 'just now';
  if(s < 5400) return `${Math.round(s / 60)}m ago`;
  if(s < 172800) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

// The same scale for a DURATION rather than an instant. A snapshot's age is
// unbounded — a finished campaign can be months stopped — so raw seconds would
// read as a number nobody parses.
const forS = s => {
  if(!isFinite(s)) return 'a while';
  if(s < 90) return `${Math.round(s)}s`;
  if(s < 5400) return `${Math.round(s / 60)} min`;
  if(s < 172800) return `${Math.round(s / 3600)} hours`;
  return `${Math.round(s / 86400)} days`;
};

if(!campaigns.length){
  head.style.display = 'none';   // no picker to head, and no list under it
  dek.style.display = '';
  dek.innerHTML = `<b>No campaigns registered.</b>`;
  board.innerHTML = `<div class="notice"><span class="tag">empty</span>
    <div>Standings are produced by <b>campaigns</b> — ranking processes that read the
    match archive and publish their results here. None has registered yet, so there is
    nothing to show. This page stays deliberately blank rather than inventing a ranking.</div></div>`;
} else {
  // ?campaign=<id> makes a particular campaign's standings linkable. Otherwise
  // open on DEFAULT_CAMPAIGN (config.js) whenever it is registered — even while
  // its process is briefly away, since the midend then serves its cached or
  // stored table labelled as such, and that is still the leaderboard the site
  // means. Only without it: one that is actually answering, because landing on
  // an offline campaign when a working one exists would read as "broken".
  const want = new URLSearchParams(location.search).get('campaign');
  let current = campaigns.find(c => c.id === want)
             || campaigns.find(c => c.id === DEFAULT_CAMPAIGN)
             || campaigns.find(c => c.online) || campaigns[0];

  // no dek here: the campaign's own meta block and the picker heading the list
  // say it. The element stays for the no-campaigns case, hidden while there is
  // something to show.
  dek.style.display = 'none';

  const paintPicker = () => {
    // A campaign is identified by its ID and nothing else — the midend keeps only
    // the routing, so the id is the one string that always exists, and it is the
    // same string in the ledger, the logs and the URL. A campaign that is not
    // answering is listed and marked, never hidden: a wedged process must not
    // look deregistered.
    dropdown(picker, {
      value: current.id,
      options: campaigns.map(c => ({
        value: c.id,
        label: c.id,
        // Facts about the TABLE, so they hang off having one — `entries` is
        // present for a live, cached OR stored document, and absent only when
        // nothing came back at all. Gating these on `online` (which means
        // "answered just now") blanked the count and the description for
        // precisely the stopped campaigns whose tables are kept on purpose.
        count: c.entries ?? '—',
        title: c.entries != null
          ? [c.campaign_type && `${c.campaign_type} scheduler`, c.description]
              .filter(Boolean).join(' — ')
          : (c.error || 'not responding'),
        // One word: the campaign is not answering. The picker is a chooser, not
        // a status board — how old the copy is belongs on the list it labels,
        // and the facts line says it once a campaign is chosen.
        tag: c.online ? '' : 'offline',
      })),
      onChange: id => {
        current = campaigns.find(c => c.id === id);
        const u = new URL(location);
        u.searchParams.set('campaign', current.id);
        history.replaceState(null, '', u);
        show(current.id);
      },
    });
  };
  paintPicker();
  show(current.id);
}

function esc(s){ return String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

async function show(id){
  board.innerHTML = `<p class="lb-loading">Loading ${esc(id)}…</p>`;
  clearBoard();
  analysis(id);

  // The ranking is fetched live from the campaign process, so "registered but
  // not answering" is a real state with its own 503 — report it as that,
  // naming what the campaign last managed, rather than as a generic failure or
  // (worse) an empty leaderboard that looks like nobody has played.
  let d;
  try {
    const res = await fetch(api(`/api/campaigns/${encodeURIComponent(id)}`));
    const payload = await res.json().catch(() => null);
    if(!res.ok){
      const det = payload?.detail;
      const c = det?.campaign;
      board.innerHTML = `<div class="notice"><span class="tag">offline</span>
        <div><b>${esc(id)}</b> is registered but not responding, and no stored copy
        of its ranking exists yet.
        ${c?.last_seen ? ` Last heard from <b>${esc(ago(c.last_seen))}</b>.` : ''}
        <br><span class="lb-err">${esc(det?.error || `HTTP ${res.status}`)}</span></div></div>`;
      return;
    }
    d = payload;
  } catch {
    board.innerHTML = `<div class="notice"><span class="tag">error</span>
      <div>Could not reach the midend to load <b>${esc(id)}</b>.</div></div>`;
    return;
  }

  const entries = d.entries || [];
  const cols = d.columns || [];

  // A registered campaign that has not published a ranking yet is a real state,
  // not an error — say so instead of rendering an empty table.
  if(!entries.length){
    clearBoard();
    paintFacts(d);
    board.innerHTML = meta(d) + `<div class="notice"><span class="tag">pending</span>
      <div><b>${esc(id)}</b> is registered but has not published a ranking yet.</div></div>`;
    return;
  }

  board.innerHTML = meta(d);
  paintFacts(d);

  // Identity is resolved HERE, from the harness table — the campaign only ever
  // publishes the raw <model x harness> pair.
  const idLine = h => [h.fullName, h.org].filter(Boolean).join(' · ');
  // A posterior campaign publishes a 5–95% interval per entrant. It is drawn as
  // a bell on one shared axis (util.bellSVG) instead of listed as two more
  // numbers, so those two columns are dropped from the stat strip.
  const dom = scoreDomain(entries);
  const BELL = new Set(dom ? ['lo90', 'hi90'] : []);
  const statCells = e => cols.filter(c => !BELL.has(c.key)).map(c =>
    `<div><b>${esc((e.stats || {})[c.key] ?? '—')}</b><span>${esc(c.label || c.key)}</span></div>`
  ).join('');
  const bellCell = (e, opts) => dom ? `<div class="post" title="posterior mean and 5–95% interval">${bellSVG(e, dom, opts)}</div>` : '';

  // --- champion block ---
  const L = entries[0], hL = H.get(L.entrant || {});
  // Sorting puts provisional entrants last, so a provisional leader means NOBODY
  // cleared the match minimum. Crowning them "champion" on one or two games would
  // be exactly the overclaim the ranking is built to avoid — say what it is.
  const stamp = L.provisional
    ? `PROVISIONAL · ${esc(hL.shortName)}`
    : `CHAMPION · ${esc(hL.shortName)}`;
  lead.className = `lead in${L.provisional ? ' prov' : ''}${dom ? ' iv' : ''}`;
  lead.style.background = H.duoCSS(L.entrant || {});   // wears both halves of the combo
  // With an interval the champion takes the SAME trailing columns as every row
  // below it (bell, score, stats), so the axis of the winner's bell lines up
  // with the axes underneath and the eye can compare widths straight down.
  lead.innerHTML = dom ? `
    <div class="big">1</div>
    <div>
      <div class="stamp">${stamp}</div>
      <div class="who">${king(L)}${esc(L.label || L.entrant?.model || '?')}</div>
      <div class="org">${esc(idLine(hL))}</div>
    </div>
    ${bellCell(L, { ink: '#F7F3EC', fill: 'rgba(247,243,236,.3)', mute: 'rgba(247,243,236,.8)' })}
    <div class="score"><b>${esc(L.score_label ?? '')}</b><span>${esc(scoreLabel(d))}</span></div>
    <div class="stats">${statCells(L)}</div>` : `
    <div class="big">1</div>
    <div>
      <div class="stamp">${stamp}</div>
      <div class="who">${king(L)}${esc(L.label || L.entrant?.model || '?')}</div>
      <div class="org">${esc(idLine(hL))}</div>
      <div class="nums">
        <div class="score"><b>${esc(L.score_label ?? '')}</b><span>${esc(scoreLabel(d))}</span></div>
        ${statCells(L)}
      </div>
    </div>`;

  // --- the rest of the field ---
  rows.innerHTML = entries.slice(1).map((e, i) => {
    const t = e.entrant || {}, h = H.get(t);
    return `
    <div class="row${e.provisional ? ' prov' : ''}${dom ? ' iv' : ''}" style="--d:${Math.min(i, 12) * 70}ms">
      <div class="n">${e.rank ?? ''}</div>
      <div class="nm">
        ${entrantIcon(H, t, 0, { inline: true, title: `${t.model || ''} on ${h.fullName}` })}${esc(e.label || t.model || '?')}
        ${e.provisional ? `<i class="prov-tag" title="too few matches to be meaningful — ranked below everyone who cleared the bar">provisional</i>` : ''}
        <em>${esc(idLine(h))}</em>
      </div>
      ${bellCell(e, { fill: H.modelColor(t) + '55' })}
      <div class="elo">${esc(e.score_label ?? '')}</div>
      <div class="stats">${statCells(e)}</div>
    </div>`;
  }).join('');
}

// The leader's badge wears a pixel crown — but only a real champion: a
// provisional leader (nobody cleared the match minimum) is flagged, not crowned.
// Flat gold, one band shade, three paper gems; drawn on the same pixel grid
// spirit as the entrant sprites.
const CROWN = ['#...#...#', '##.###.##', '#########', '#o##o##o#', '=========']
  .map((row, y) => [...row].map((c, x) => c === '.' ? '' :
    `<rect x="${x}" y="${y}" width="1" height="1.06" fill="${c === '#' ? '#F5B700' : c === '=' ? '#C98A00' : '#FFFDF8'}"/>`).join('')).join('');
function king(L){
  const icon = entrantIcon(H, L.entrant || {}, 0, { inline: true });
  if(L.provisional) return icon;
  return `<span class="king">${icon}<svg class="crown" viewBox="0 0 9 5" shape-rendering="crispEdges" aria-label="champion">${CROWN}</svg></span>`;
}

// The score's own name comes from the campaign's algorithm line — it is not
// always a win rate, and labelling every campaign's number "Rate" would be a lie
// the moment one ranks by something else.
function scoreLabel(d){
  const a = String(d.algorithm || '').toLowerCase();
  if(a.includes('win rate')) return 'Win rate';
  if(a.includes('elo')) return 'ELO';
  if(a.includes('points')) return 'Points';
  if(a.includes('posterior') || a.includes('expected')) return 'Expected score';
  return 'Score';
}

// How the ranking was computed. `d.notes` (the campaign's per-filter exclusion
// breakdown) is deliberately not rendered — the header's "N of M runs ranked"
// carries the same point. It remains in the API for anyone who wants the detail.
function meta(d){
  return `<details class="lb-meta">
    <summary>How ${esc(d.id || 'this campaign')} ranks</summary>
    ${d.campaign_type ? `<div class="lb-algo"><span class="tag">type</span><span>${esc(d.campaign_type)}${
      d.description ? ` — ${esc(d.description)}` : ''}</span></div>` : ''}
    <div class="lb-algo"><span class="tag">how</span><span>${esc(d.algorithm || '—')}</span></div>
  </details>`;
}

// What the reader needs in order to trust the list they are looking at: over how
// much of the archive it was computed, and how stale it is. It sits in the
// Standings header, beside the picker, so it reads as a caption on THIS list
// rather than as another fact about the campaign.
function paintFacts(d){
  const s = d.source || {};
  // ONE freshness fact, never two. A stale copy's `ranked_at` is the campaign's
  // own, so printing it beside the staleness reads as a contradiction —
  // "ranked just now · cached 32s ago" — even though both are true. When the
  // copy is not live, its age IS the freshness, so it replaces the line rather
  // than sitting next to it.
  facts.innerHTML = `
    ${s.runs_used != null ? `<span><b>${s.runs_used}</b> of ${s.runs_total} matches ranked</span>` : ''}
    ${d.stale
      ? `<span class="lb-stale" title="${esc(d.stale_reason || 'campaign unreachable')}">cached <b>${forS(d.stale_age_s)} ago</b></span>`
      : `<span>ranked <b>${ago(d.ranked_at)}</b></span>`}`;
}

// A campaign that publishes statistics (GET /api/campaigns/{id}/stats — the
// montecarlo type does) extends the page below its standings with its figures
// (assets/js/mc-analysis.js). Any other campaign: nothing is added. The
// request runs beside the ranking's, and a switch away drops a late answer.
async function analysis(id){
  if(ana){ ana.destroy(); ana = null; }
  anaFor = id;
  anaSec.innerHTML = `<div class="mca-head" hidden>
      <div><h2>Inside <mark>${esc(id)}</mark></h2>
        <p>How this ranking was reached, from the campaign's own statistics.</p>
        <p class="mca-fresh"></p></div>
    </div><div class="mca-host"></div>`;
  const head = anaSec.querySelector('.mca-head'), host = anaSec.querySelector('.mca-host');
  const handle = await mountCampaignAnalysis(host, id, { H, api, fresh: head.querySelector('.mca-fresh') });
  if(anaFor !== id){ handle?.destroy(); return; }
  ana = handle;
  head.hidden = !handle;
}
