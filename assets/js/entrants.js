// Entrants — pick one or two <model × harness> entrants and read their games.
//
// The roster on top, then a boxing ring with two corner spots (left blue,
// right pink). Click an empty spot to arm it, then an entrant to step in; the
// game list below follows:
//   one seat filled   -> every game that entrant played (solo runs included)
//   both seats filled -> every game between the two, in either seating; the
//                        same entrant in both seats means its self-play games
// The corners are interchangeable — only WHO is in the ring matters, not where.
// Clicking an entrant with no spot armed fills the first empty one; clicking
// a taken spot re-arms it; × empties it; the die puts a random pair in.
// The pick lives in the URL (?a=&b=, comboKeys), so a pairing can be shared.
import { loadJSON, loadHarnesses, esc, setActiveNav, renderPager, api, ARCHIVE_RUNS } from './util.js';
import { entrantIcon } from './entrant-icon.js';
import { runRows, isSolo } from './run-row.js';

setActiveNav('entrants.html');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = id => document.getElementById(id);

const [D, H] = await Promise.all([loadJSON(api(ARCHIVE_RUNS)), loadHarnesses()]);
const runs = D.runs;                                   // newest first
const R = runRows(H);

/* ---- the roster: every entrant in the archive, most games first ---- */
const seats = r => isSolo(r) ? [r.teams.team1] : [r.teams.team1, r.teams.team2];
const roster = new Map();                              // comboKey -> {key, ent, games}
for (const r of runs) for (const t of seats(r)){
  const k = H.comboKey(t);
  if (!roster.has(k)) roster.set(k, { key: k, ent: t, games: 0 });
  roster.get(k).games++;
}
const cast = [...roster.values()].sort((a, b) => b.games - a.games || a.key.localeCompare(b.key));
const keysOf = r => seats(r).map(t => H.comboKey(t));
const nameOf = e => H.bareModel(e.ent.model);
const harnessOf = e => H.get(e.ent).fullName;

/* ---- state ---- */
const qs = new URLSearchParams(location.search);
const pick = [qs.get('a'), qs.get('b')].map(k => roster.has(k) ? k : null);
let armed = null;          // index of the seat waiting for an entrant, or null

/* ---- the ring: a spot on the mat per corner, a nameplate below each ---- */
const seatEls = [$('spot0'), $('spot1')];
const plateEls = [$('plate0'), $('plate1')];
const CORNER = ['Blue corner', 'Pink corner'];
function paintSeat(i, { land = false } = {}){
  const el = seatEls[i], k = pick[i], e = k && roster.get(k);
  for (const x of [el, plateEls[i]]){ x.classList.toggle('full', !!e); x.classList.toggle('armed', armed === i); }
  el.setAttribute('aria-pressed', String(armed === i));
  el.setAttribute('aria-label', e ? `${CORNER[i]}: ${nameOf(e)}` : `${CORNER[i]}: empty`);
  el.innerHTML = `${e ? `<span class="sitter${land ? ' land' : ''}">${entrantIcon(H, e.ent, 96)}</span>` : ''}`;
  plateEls[i].innerHTML = `<span class="seat-no">${CORNER[i]}</span>${e
      ? `<b>${esc(nameOf(e))}</b><em>${esc(harnessOf(e))} · ${e.games} matches</em>
         <span class="seat-x" role="button" tabindex="0" data-clear="${i}" aria-label="Clear the ${CORNER[i].toLowerCase()}">×</span>`
      : `<b>${armed === i ? 'Pick an entrant above' : 'Empty'}</b><em>${armed === i ? 'the roster is waiting' : 'click the spot to call someone in'}</em>`}`;
}
const paintSeats = () => { paintSeat(0); paintSeat(1); paintRoster(); };

[...seatEls, ...plateEls].forEach((el, n) => {
  const i = n % 2;
  el.addEventListener('click', e => {
    if (e.target.closest('[data-clear]')) return;
    armed = armed === i ? null : i;
    paintSeats();
  });
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      if (e.target.closest('[data-clear]')) clearSeat(i); else seatEls[i].click();
    }
  });
});
document.addEventListener('click', e => {
  const x = e.target.closest('[data-clear]');
  if (x) clearSeat(+x.dataset.clear);
});

async function clearSeat(i){
  const sitter = seatEls[i].querySelector('.sitter');
  if (sitter && !reduced) await sitter.animate(
    [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-26px) rotate(-8deg)', opacity: 0 }],
    { duration: 260, easing: 'cubic-bezier(.4,0,.8,.2)' }).finished.catch(() => {});
  pick[i] = null;
  if (armed === i) armed = null;
  commit();
}

/* ---- roster ---- */
const rosterEl = $('roster');
function paintRoster(){
  rosterEl.classList.toggle('waiting', armed !== null || pick.includes(null));
  rosterEl.innerHTML = cast.map(e => {
    const at = [0, 1].filter(i => pick[i] === e.key);
    return `<button type="button" class="ent${at.length ? ' seated' : ''}" data-k="${esc(e.key)}"
        title="${esc(nameOf(e))} on ${esc(harnessOf(e))} · ${e.games} matches">
      <span class="ent-ic">${entrantIcon(H, e.ent, 36)}</span>
      <span class="ent-tx"><span class="ent-nm">${esc(nameOf(e))}</span>
        <span class="ent-hn">${esc(harnessOf(e))} · ${e.games}</span></span>
      ${at.map(i => `<i class="ent-at s${i}" aria-label="in the ${CORNER[i].toLowerCase()}"></i>`).join('')}
    </button>`;
  }).join('');
}
rosterEl.addEventListener('click', e => {
  const b = e.target.closest('.ent');
  if (!b) return;
  const i = armed ?? pick.indexOf(null);
  if (i < 0){                                   // both seats full, none armed
    // `translate`, not `transform`: a spot's transform is what centres it on its
    // floor point, and animating that replaced it — both fighters jumped away
    seatEls.forEach(s => s.animate([{ translate: '0' }, { translate: '-4px' },
      { translate: '4px' }, { translate: '0' }], { duration: 260 }));
    $('hint').textContent = 'Both corners are taken. Click a spot to change who stands there.';
    return;
  }
  seat(i, b.dataset.k, b.querySelector('.ent-ic svg'));
});

// the hop: the roster icon flies into the ring in an arc, lands on its spot, settles
async function seat(i, key, fromSvg){
  armed = null;
  const prev = pick[i];
  pick[i] = key;
  $('hint').textContent = '';
  if (reduced || !fromSvg || prev === key){ commit(); return; }
  paintSeat(i);                                       // lay out the spot with its fighter …
  const sitter = seatEls[i].querySelector('.sitter');
  sitter.style.visibility = 'hidden';                 // … hidden until the flyer arrives
  const a = fromSvg.getBoundingClientRect(), b = sitter.getBoundingClientRect();
  const fly = document.createElement('div');
  fly.className = 'flyer';
  fly.innerHTML = entrantIcon(H, roster.get(key).ent, 96);
  Object.assign(fly.style, { left: b.left + 'px', top: b.top + 'px', width: b.width + 'px', height: b.height + 'px' });
  document.body.appendChild(fly);
  const s0 = a.width / b.width, dx = a.left - b.left, dy = a.top - b.top;
  const peak = Math.min(dy, 0) - 70;                 // the arc rises above both ends
  await fly.animate([
    { transform: `translate(${dx}px,${dy}px) scale(${s0})` },
    { transform: `translate(${dx * .45}px,${peak}px) scale(${(s0 + 1) / 2}) rotate(${i ? 8 : -8}deg)`, offset: .55 },
    { transform: 'translate(0,0) scale(1)' },
  ], { duration: 560, easing: 'cubic-bezier(.3,.7,.3,1)' }).finished.catch(() => {});
  fly.remove();
  commit({ land: i });
}

// the die: a random pairing that has actually met — every duel's two entrants,
// in either corner, so the list below is never empty (self-play counts)
const isIdle = k => /^idle@/i.test(k);              // a solo run's placeholder seat, not a competitor
const met = [...new Map(runs.filter(r => !isSolo(r) && !keysOf(r).some(isIdle)).map(r => {
  const [a, b] = keysOf(r);
  return [[a, b].sort().join('|'), [a, b]];
})).values()];
$('dice').addEventListener('click', () => {
  if (!met.length) return;
  let [a, b] = met[Math.floor(Math.random() * met.length)];
  if (Math.random() < .5) [a, b] = [b, a];
  pick[0] = a; pick[1] = b; armed = null;
  commit({ land: 'both' });
});

/* ---- the games ---- */
const PAGE = 20;
let page = 1;
function games(){
  const [a, b] = pick;
  if (!a && !b) return null;
  if (!a || !b){
    const k = a || b;
    return runs.filter(r => keysOf(r).includes(k));
  }
  return runs.filter(r => {
    if (isSolo(r)) return false;
    const [k1, k2] = keysOf(r);
    return (k1 === a && k2 === b) || (k1 === b && k2 === a);
  });
}
// the record, from the seated side's point of view
function record(list){
  const [a, b] = pick, one = !(a && b), me = a || b;
  let w = 0, l = 0, d = 0;
  for (const r of list){
    if (isSolo(r) || r.outcome !== 'succeeded') continue;
    const [k1, k2] = keysOf(r);
    if (r.winner === 'draw'){ d++; continue; }
    const winner = r.winner === 'team1' ? k1 : k2;
    if (!one && a === b) continue;                    // self-play: one side always wins
    if (winner === me) w++; else l++;
  }
  return { w, l, d };
}
function paintGames(scroll = false){
  const list = games(), host = $('games'), head = $('ghead'), pager = $('pager');
  if (!list){
    head.innerHTML = '<span>Matches</span>';
    host.innerHTML = `<div class="g-empty"><b>No one is seated yet.</b>
      Seat one entrant to see every match it played, or two to see their head-to-head.</div>`;
    pager.innerHTML = '';
    return;
  }
  const [a, b] = pick, A = a && roster.get(a), B = b && roster.get(b);
  const rec = record(list);
  let title;
  if (A && B && a === b) title = `${esc(nameOf(A))} against itself · ${list.length} matches`;
  else if (A && B) title = `${esc(nameOf(A))} <i class="vs">vs</i> ${esc(nameOf(B))} · ${list.length} matches
      <span class="g-rec"><b>${rec.w}</b>–<b>${rec.l}</b>${rec.d ? ` · ${rec.d} drawn` : ''}</span>`;
  else title = `${esc(nameOf(A || B))} · ${list.length} matches
      <span class="g-rec"><b>${rec.w}</b> won · <b>${rec.l}</b> lost · <b>${rec.d}</b> drawn</span>`;
  head.innerHTML = `<span>${title}</span>`;
  if (!list.length){
    host.innerHTML = a === b
      ? `<div class="g-empty"><b>${esc(nameOf(A))} has never played itself.</b> Seat someone else in one corner, or roll the die.</div>`
      : `<div class="g-empty"><b>These two have not met yet.</b> Swap one of them out, or roll the die.</div>`;
    pager.innerHTML = '';
    return;
  }
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  page = Math.min(page, pages);
  host.innerHTML = `<div class="runs plate">${list.slice((page - 1) * PAGE, page * PAGE).map(R.row).join('')}</div>`;
  renderPager(pager, page, pages, p => { page = p; paintGames(true); });
  if (scroll) $('ghead').scrollIntoView({ behavior: 'smooth' });
}

function commit({ land = null } = {}){
  const u = new URL(location.href);
  ['a', 'b'].forEach((p, i) => pick[i] ? u.searchParams.set(p, pick[i]) : u.searchParams.delete(p));
  history.replaceState(history.state, '', u);
  page = 1;
  paintSeat(0, { land: land === 0 || land === 'both' });
  paintSeat(1, { land: land === 1 || land === 'both' });
  paintRoster();
  paintGames();
}

$('count').textContent = `${cast.length} entrants · ${runs.length} matches`;
commit();
