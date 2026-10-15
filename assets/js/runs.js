// Runs directory — all matches this season (competitor-agnostic)
import { loadJSON, loadHarnesses, esc, setActiveNav, renderPager, api, dropdown, ARCHIVE_RUNS } from './util.js';
import { runRows, isSolo } from './run-row.js';

setActiveNav('runs.html');

// The API returns every run by default; the page pages client-side over the
// whole list, so D.count and the rendered rows always agree.
// ARCHIVE_RUNS is the corpus policy — see config.js.
const [D, H] = await Promise.all([loadJSON(api(ARCHIVE_RUNS)), loadHarnesses()]);
D.updated = D.updated || new Date().toISOString().slice(0, 10);
const runs = D.runs;  // already newest-first from the API

// Head-to-head stats run over duels only (isSolo: run-row.js) — counted with
// solo in, a lone agent that failed to capture reads as a "draw" (14 of 45 did).
const duels = runs.filter(r => !isSolo(r));
const solos = runs.filter(isSolo);

const decisive = duels.filter(r => r.winner !== 'draw').length;
const draws = duels.filter(r => r.winner === 'draw').length;
// distinct entrants are <model × harness> combos, not bare models — the same
// model under two harnesses is two entrants. A solo run contributes its one
// real agent; the idle seat is not an entrant.
const entrants = [...new Map(
  runs.flatMap(r => isSolo(r) ? [r.teams.team1] : [r.teams.team1, r.teams.team2])
      .map(t => [H.comboKey(t), t])
).values()];

// Decisive/Draws are duel-only, so the tiles do not sum to the match total —
// the dek names the solo remainder that accounts for the difference.
const soloNote = solos.length ? ` · ${solos.length} solo ${solos.length === 1 ? 'run' : 'runs'}` : '';
// dek adapts: if the whole season is one matchup, name it; otherwise stay generic
document.getElementById('dek').innerHTML = entrants.length === 2
  ? `<b>${D.count} matches</b> · ${H.comboLabel(entrants[0])} vs ${H.comboLabel(entrants[1])}${soloNote}.`
  : `<b>${D.count} matches</b> · ${entrants.length} model × harness entrants${soloNote}.`;

document.getElementById('summary').innerHTML = `
  <div><b>${D.count}</b><span>Matches</span></div>
  <div class="acc-b"><b>${decisive}</b><span>Decisive</span></div>
  <div class="acc-p"><b>${draws}</b><span>Draws</span></div>
  <div><b>${entrants.length}</b><span>Entrants</span></div>`;

const { row: runRow, STATES, durText } = runRows(H);

function renderList(list){
  document.getElementById('runs').innerHTML = list.map(runRow).join('');
}

/* ---- paging over the (filtered) archive ---- */
const PAGE = 20;
let shown = runs, page = 1;
function draw(scroll = false){
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  page = Math.min(page, pages);
  renderList(shown.slice((page - 1) * PAGE, page * PAGE));
  renderPager(document.getElementById('pager'), page, pages, p => { page = p; draw(true); });
  if(scroll) document.querySelector('.sech').scrollIntoView({ behavior: 'smooth' });
}
draw();

// Tick the live rows. The DOM is re-queried each second rather than the
// elements cached, because paging and filtering re-render the whole list.
// Nothing runs when no match is live — the query simply finds nothing.
const byId = new Map(runs.map(r => [r.id, r]));
setInterval(() => {
  document.querySelectorAll('#runs .rdur[data-run]').forEach(el => {
    const r = byId.get(el.dataset.run);
    if (r) el.textContent = durText(r);
  });
}, 1000);

const HIT = Object.fromEntries(STATES.map(s => [s.key, s.hit]));

// Both filters live in the URL, so a filtered archive is linkable and survives
// a reload — the same contract ?campaign= already gives the leaderboard.
// Restored BEFORE the first paint so the page never renders one selection and
// then jumps to another.
//
// An unknown value falls back to the default and is not written back: a
// campaign can be pruned from the archive while someone still holds its link,
// and a stale ?campaign= must degrade to "all" rather than silently showing an
// empty list, or pin a param naming nothing.
const params = new URLSearchParams(location.search);
const wantState = params.get('state');
const wantCampaign = params.get('campaign');

// The two filters compose: status is one of the run's axes, campaign is who
// commissioned it. A run submitted by hand has no campaign at all.
let fState = STATES.some(s => s.key === wantState) ? wantState : 'all';
let fCampaign = 'all';   // validated below, once the campaign list is known

const inState    = r => HIT[fState](r);
const inCampaign = r => fCampaign === 'all'
  || (fCampaign === 'none' ? !r.campaign : r.campaign?.id === fCampaign);

// The chip SET is fixed at load, from the whole archive — only the NUMBERS move
// when a campaign is picked. Re-deriving which chips exist per campaign would
// reflow the row on every switch, and could strand the current selection by
// deleting the chip that carries it.
document.getElementById('filt').innerHTML = STATES
  .filter(s => s.key === 'all' || runs.some(HIT[s.key]))   // only tags that exist
  .map(s => `<button data-s="${s.key}" class="${s.key} ${s.key === fState ? 'on' : ''}">${s.label} <b></b></button>`)
  .join('');

// The two controls are FACETS of each other: each one's counts are taken over
// the runs the OTHER admits, never its own. Counting a chip against its own
// selection would read 0 on every chip except the one just picked, and the
// campaign dropdown would keep claiming archive-wide totals while a chip is on.
let cpick = null;                    // the campaign dropdown, once it exists
function paintCounts(){
  const byCampaign = runs.filter(inCampaign);
  for(const b of document.querySelectorAll('#filt button')){
    const n = byCampaign.filter(HIT[b.dataset.s]).length;
    b.querySelector('b').textContent = n;
    // nothing behind it under this campaign: the chip stays put and stays
    // clickable, but reads as empty instead of implying rows are there
    b.classList.toggle('zero', n === 0);
  }
  if(!cpick) return;
  const byState = runs.filter(inState);
  cpick.setCounts(Object.fromEntries([
    ['all', byState.length],
    ['none', byState.filter(r => !r.campaign).length],
    ...[...campaigns.keys()].map(id =>
      [id, byState.filter(r => r.campaign?.id === id).length]),
  ]));
}

// `all` is the default on both axes, so it is omitted rather than spelled out —
// the unfiltered page keeps a clean URL, and a copied link carries only what was
// actually chosen.
function syncURL(){
  const u = new URL(location);
  for(const [k, v] of [['state', fState], ['campaign', fCampaign]])
    v === 'all' ? u.searchParams.delete(k) : u.searchParams.set(k, v);
  // replaceState, not pushState: filtering is not navigation, and each keystroke
  // of a chip should not cost the reader a Back press to escape the page.
  history.replaceState(null, '', u);
}

function applyFilters(){
  shown = runs.filter(r => inState(r) && inCampaign(r));
  page = 1;
  paintCounts();          // the other control's numbers move with this one
  syncURL();
  draw();
}

document.querySelectorAll('#filt button').forEach(b => b.onclick = () => {
  document.querySelectorAll('#filt button').forEach(x => x.classList.remove('on'));
  b.classList.add('on');
  fState = b.dataset.s;
  applyFilters();
});

// Campaign filter — the same dropdown the leaderboard uses. Only rendered when
// a campaign actually commissioned something in this archive, so a deploy that
// runs none never sees the control.
const campaigns = new Map();
for(const r of runs) if(r.campaign?.id) campaigns.set(r.campaign.id, r.campaign);
const chost = document.getElementById('cfilt');
if(chost && campaigns.size){
  const n = id => runs.filter(r => r.campaign?.id === id).length;
  const hand = runs.filter(r => !r.campaign).length;
  // Only now is the campaign list known, so this is where ?campaign= can be
  // validated. `none` (ad-hoc) is a real selection, not a missing one.
  if(wantCampaign && (campaigns.has(wantCampaign) || (wantCampaign === 'none' && hand)))
    fCampaign = wantCampaign;

  cpick = dropdown(chost, {
    label: 'campaign',
    value: fCampaign,
    options: [{ value: 'all', label: 'all campaigns', count: runs.length }]
      .concat([...campaigns.values()].map(c =>
        ({ value: c.id, label: c.id, count: n(c.id), tag: c.type || '' })))
      // runs submitted by hand belong to no campaign — worth selecting for on a
      // page where most rows may now carry one
      .concat(hand ? [{ value: 'none', label: 'ad-hoc', tag: 'no campaign', count: hand }] : []),
    onChange: v => { fCampaign = v; applyFilters(); },
  });
}

// A restored filter has to reach the list — the first draw() above ran on the
// unfiltered set. When nothing was restored there is nothing to re-draw, but the
// URL may still carry a param that failed validation (a pruned campaign, a
// hand-edited state), so sync it away rather than leave it naming nothing.
if(fState !== 'all' || fCampaign !== 'all') applyFilters();
else { paintCounts(); syncURL(); }
