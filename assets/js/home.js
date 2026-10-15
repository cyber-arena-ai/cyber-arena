/* CyberArena — homepage behaviour. Classic script, end of <body>.
   1. chapters: depth of field (focus 0..1 per chapter), the dot pager, the scroll cue
   2. hero: the plates register, the robots swing in, lean, spar and take clicks
   3. the arena replay and the round clock, each running only while in focus
   4. (the institutions belt is assets/js/belt.js, shared with About)
   prefers-reduced-motion: no intro, no sway/punch/spar, no depth of field, no
   belt; the replay and round clock show their final frame. */
(function(){
const $ = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============================================================
   1. CHAPTERS — focus is the share of the screen a chapter fills
   ============================================================
   Centre distance would blur the top of a chapter taller than the screen
   while you read it; the visible fraction cannot: a chapter that covers the
   screen is in focus however tall it is. */
const chapters = [...document.querySelectorAll('.ch')];
const focus = new Map();
const dots = $('dots');
dots.innerHTML = chapters.map(c =>
  `<a href="#${c.id}" aria-label="${c.dataset.name}"><span>${c.dataset.name}</span></a>`).join('');
const dotEls = [...dots.children];
const cue = document.querySelector('.scrollcue');
const navH = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 60;

function paintFocus(){
  const top = navH(), vh = innerHeight - top;
  let best = 0, bestF = -1;
  chapters.forEach((c, i) => {
    const r = c.getBoundingClientRect();
    const seen = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, top));
    const frac = seen / Math.min(r.height, vh);
    // ease: anything past 85% visible is fully sharp; under 25% fully receded
    const t = clamp((frac - .25) / .6, 0, 1);
    const f = t * t * (3 - 2 * t);
    if (f > bestF){ bestF = f; best = i; }
    // skip a chapter whose focus has not visibly changed: no style write, no restyle
    if (Math.abs(f - (focus.get(c) ?? -1)) < .004) return;
    focus.set(c, f);
    c.classList.toggle('out', f < .35);
    if (reduced) return;
    const inner = c.querySelector('.ch-in');
    if (!inner) return;
    // opacity and scale only — both composited; the blur is the .out class
    inner.style.opacity = f > .995 ? '' : (.2 + .8 * f).toFixed(3);
    inner.style.transform = f > .995 ? '' : `scale(${(.96 + .04 * f).toFixed(4)})`;
  });
  dotEls.forEach((d, i) => d.classList.toggle('on', i === best));
  if (cue) cue.classList.toggle('hide', scrollY > 40);
}
let fq = 0;
const queue = () => { if (!fq) fq = requestAnimationFrame(() => { fq = 0; paintFocus(); }); };
addEventListener('scroll', queue, { passive: true });
addEventListener('resize', queue);
paintFocus();
const focused = id => (focus.get($(id)) ?? 0) > .55;

/* ============================================================
   2. HERO — plates register, robots swing in, lean, spar
   ============================================================ */
const poster = $('poster');
const heroBlue = $('heroBlue'), heroPink = $('heroPink');

// A prerendered page (chrome.js prerenders on hover) must not play its intro
// while nobody is looking: wait for the reader to arrive.
const arrived = document.prerendering
  ? new Promise(r => document.addEventListener('prerenderingchange', r, { once: true }))
  : Promise.resolve();

if (!reduced){
  const EASE = 'cubic-bezier(.2,.8,.2,1)';
  const swing = (el, sx) => el.animate([
    { transform: `translate(${sx * 60}vw, 30vh) scale(.5) rotate(${sx * 12}deg)`, opacity: 0 },
    { transform: `translate(${sx * 24}vw, -10vh) scale(.84) rotate(${-sx * 5}deg)`, opacity: 1, offset: .55 },
    { transform: `translate(${sx * 3}vw, 3vh) scale(1.05) rotate(${sx * 2}deg)`, opacity: 1, offset: .82 },
    { transform: 'none', opacity: 1 },
  ], { duration: 1200, easing: EASE, fill: 'backwards' });

  heroBlue.style.visibility = heroPink.style.visibility = 'hidden';
  // never swing in blank: hold until both idle sprites are decoded. The intro
  // plays only at the very top — a reload restored mid-page skips it.
  const sprites = Promise.all([heroBlue, heroPink].map(el =>
    el.querySelector('img[data-f="idle"]').decode().catch(() => {})));
  Promise.all([sprites, arrived, sleep(60)]).then(() => {
    heroBlue.style.visibility = heroPink.style.visibility = '';
    // once per visit to the site: coming back to Home from another page is not an arrival
    let first = true;
    try { first = !sessionStorage.getItem('ca-intro'); sessionStorage.setItem('ca-intro', '1'); } catch {}
    if (scrollY < 40 && first){
      poster.classList.add('intro');
      swing(heroBlue, -1); swing(heroPink, +1);
    }
  });
}

const F = {
  blue: { el: $('fBlue'), dir: +1, busy: false, last: '' },
  pink: { el: $('fPink'), dir: -1, busy: false, last: '' },
};
// per-frame position/scale, hand-calibrated for a 340px-wide fighter, then
// scaled to whatever width the hero gives them today
const CAL = {
  blue: { idle:{x:0,y:0,s:1}, windup:{x:-9,y:43,s:1.1},  punch:{x:21,y:75,s:1.24},  cross:{x:27,y:12,s:1.07},
          upper:{x:3,y:12,s:1.2},  duck:{x:-8,y:38,s:1.06}, slip:{x:0,y:104,s:1.21} },
  pink: { idle:{x:0,y:0,s:1}, windup:{x:-3,y:24,s:1.06}, punch:{x:-12,y:83,s:1.27}, cross:{x:-60,y:37,s:1.18},
          upper:{x:-5,y:49,s:1.22}, duck:{x:9,y:12,s:1.07}, slip:{x:-16,y:59,s:1.17} },
};
let K = 1;
function calibrate(){
  K = (heroBlue.getBoundingClientRect().width || 340) / 340;
  for (const t of ['blue', 'pink'])
    F[t].el.querySelectorAll('img').forEach(i => {
      const v = CAL[t][i.dataset.f];
      if (v) i.style.transform = `translate(${v.x * K}px,${v.y * K}px) scale(${v.s})`;
    });
}
calibrate();
addEventListener('resize', calibrate);
const setFrame = (f, name) =>
  f.el.querySelectorAll('img').forEach(i => i.classList.toggle('on', i.dataset.f === name));

async function tween(el, frames, dur, ease){
  const a = el.animate(frames.map(t => ({ transform: t })), { duration: dur, easing: ease });
  await a.finished.catch(() => {});
  el.style.transform = frames[frames.length - 1];
  a.cancel();
}
const OUT = 'cubic-bezier(.2,.9,.25,1)', IN = 'cubic-bezier(.35,0,.25,1)';
const px = v => `${(v * K).toFixed(1)}px`;
const MOVES = {
  jab: { async run(f, d){
    setFrame(f, 'windup'); await tween(f.el, ['translate(0,0)', `translate(${px(-16 * d)},${px(4)})`], 200, IN); await sleep(90);
    setFrame(f, 'punch');  await tween(f.el, [`translate(${px(-16 * d)},${px(4)})`, `translate(${px(56 * d)},0)`], 150, OUT); await sleep(200);
    setFrame(f, 'idle');   await tween(f.el, [`translate(${px(56 * d)},0)`, 'translate(0,0)'], 300, IN); }},
  cross: { async run(f, d){
    setFrame(f, 'windup'); await tween(f.el, ['translate(0,0)', `translate(${px(-24 * d)},${px(6)})`], 260, IN); await sleep(120);
    setFrame(f, 'cross');  await tween(f.el, [`translate(${px(-24 * d)},${px(6)})`, `translate(${px(74 * d)},0)`], 170, OUT); await sleep(260);
    setFrame(f, 'idle');   await tween(f.el, [`translate(${px(74 * d)},0)`, 'translate(0,0)'], 340, IN); }},
  upper: { async run(f, d){
    const rise = d < 0 ? -38 : -16;
    setFrame(f, 'duck');  await tween(f.el, ['translate(0,0)', `translate(${px(6 * d)},${px(14)})`], 240, IN); await sleep(100);
    setFrame(f, 'upper'); await tween(f.el, [`translate(${px(6 * d)},${px(14)})`, `translate(${px(30 * d)},${px(rise)})`], 160, OUT); await sleep(240);
    setFrame(f, 'idle');  await tween(f.el, [`translate(${px(30 * d)},${px(rise)})`, 'translate(0,0)'], 320, IN); }},
  // the other one's answer to a punch: slip it
  slip: { async run(f, d){
    setFrame(f, 'slip'); await tween(f.el, ['translate(0,0)', `translate(${px(-18 * d)},${px(10)})`], 180, OUT); await sleep(260);
    setFrame(f, 'idle'); await tween(f.el, [`translate(${px(-18 * d)},${px(10)})`, 'translate(0,0)'], 300, IN); }},
};
const PUNCHES = ['jab', 'cross', 'upper'];
async function play(name, key){
  const f = F[name];
  if (f.busy) return;
  f.busy = true; f.last = key;
  try { await MOVES[key].run(f, f.dir); } finally { f.busy = false; }
}
function exchange(name){
  const f = F[name];
  if (f.busy) return;
  const pool = PUNCHES.filter(k => k !== f.last);
  play(name, pool[Math.floor(Math.random() * pool.length)]);
  // the opponent slips about half the punches, a beat later
  const other = name === 'blue' ? 'pink' : 'blue';
  if (Math.random() < .5) setTimeout(() => play(other, 'slip'), 140);
}

if (!reduced){
  for (const name of ['blue', 'pink']){
    F[name].el.addEventListener('click', () => exchange(name));
    F[name].el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); exchange(name); } });
  }
  // idle sway on the inner .bob (never clashes with punches on .fighter)
  const swayLoop = async name => {
    const b = F[name].el.querySelector('.bob');
    const key = (x, y, r) => `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg)`;
    let cur = { x: 0, y: 0, r: 0 };
    const rnd = (a, c) => a + Math.random() * (c - a);
    await arrived;
    await sleep(1300 + Math.random() * 1200);          // let the swing-in settle first
    for (;;){
      if (!focused('top')){ await sleep(400); continue; }   // nobody is watching
      const nxt = { x: rnd(-14, 14) * K, y: rnd(0, 14) * K, r: rnd(-2.2, 2.2) };
      await tween(b, [
        key(cur.x, cur.y, cur.r),
        key(cur.x * 2 / 3 + nxt.x / 3, rnd(0, 14) * K, cur.r * 2 / 3 + nxt.r / 3),
        key(cur.x / 3 + nxt.x * 2 / 3, rnd(0, 14) * K, cur.r / 3 + nxt.r * 2 / 3),
        key(nxt.x, nxt.y, nxt.r),
      ], 600 + Math.random() * 380, 'ease-in-out');
      cur = nxt;
    }
  };
  swayLoop('blue'); swayLoop('pink');
  // an unprompted exchange now and then, only while the hero is on screen
  (async () => {
    await arrived; await sleep(4200);
    let who = Math.random() < .5 ? 'blue' : 'pink';
    for (;;){
      await sleep(6500 + Math.random() * 4500);
      if (focused('top') && !document.hidden){ exchange(who); who = who === 'blue' ? 'pink' : 'blue'; }
    }
  })();
}

/* ============================================================
   3a. THE ARENA REPLAY — scoreboard, log and timeline on one clock.
   The clock only advances while the chapter is in focus, so a reader who
   arrives sees it from the top, not from wherever it happened to be.
   ============================================================ */
(function(){
  const track = $('track'), head = $('head'), p1 = $('p1'), p2 = $('p2'),
        rd = $('rd'), comm = $('comm'), clock = $('clock');
  if (!track) return;

  // topology sync — the arena reacts to each replay event
  const atkOvBlue = $('atkOvBlue'), atkOvPink = $('atkOvPink'),
        atkMaskBPath = $('atkMaskBPath'), atkMaskPPath = $('atkMaskPPath'),
        rotOvL = $('rotOvL'), rotOvR = $('rotOvR'),
        rotMaskLPath = $('rotMaskLPath'), rotMaskRPath = $('rotMaskRPath'),
        patchOvL = $('patchOvL'), patchOvR = $('patchOvR'),
        patchMaskLPath = $('patchMaskLPath'), patchMaskRPath = $('patchMaskRPath'),
        vb1flash = $('vb1flash'), vb2flash = $('vb2flash'), gmflash = $('gmflash');
  const flash = (el, c) => { if (!el) return; el.setAttribute('fill', c);
    el.classList.remove('flash'); void el.getBoundingClientRect(); el.classList.add('flash'); };
  // strike: the team-colour dotted overlay is revealed attacker->victim, then
  // its tail chases through — the grey base wire stays visible underneath
  const firePath = (ov, mp, dur = 1700) => { if (!ov || !mp) return;
    const L = mp.getTotalLength();
    mp.style.strokeDasharray = L;
    ov.setAttribute('opacity', '1');
    // L -> 0, then 2L -> L: the same sweep as L -> -L (the dash period is 2L),
    // kept positive because WebKit draws a NEGATIVE dash offset inside a <mask>
    // as if it were positive — in Safari the wire never reached its target.
    const a = mp.animate([{ strokeDashoffset: L, offset: 0 }, { strokeDashoffset: 0, offset: .5 },
      { strokeDashoffset: 2 * L, offset: .5 }, { strokeDashoffset: L, offset: 1 }], { duration: dur, easing: 'linear' });
    a.onfinish = () => ov.setAttribute('opacity', '0');
  };
  const fireEvent = e => {                            // team 1 = blue → vulnbox2, team 2 = pink → vulnbox1
    if (e.type === 'steal'){
      if (e.team === 1){ firePath(atkOvBlue, atkMaskBPath); setTimeout(() => flash(vb2flash, '#2540FF'), 850); }
      else             { firePath(atkOvPink, atkMaskPPath); setTimeout(() => flash(vb1flash, '#FF3D7F'), 850); }
    } else if (e.type === 'patch'){
      firePath(e.team === 1 ? patchOvL : patchOvR, e.team === 1 ? patchMaskLPath : patchMaskRPath, 900);
      setTimeout(() => flash(e.team === 1 ? vb1flash : vb2flash, '#0E9E6E'), 450); }
    else if (e.type === 'rot'){ flash(gmflash, '#6B2BD9');
      firePath(rotOvL, rotMaskLPath); firePath(rotOvR, rotMaskRPath);
      setTimeout(() => { flash(vb1flash, '#6B2BD9'); flash(vb2flash, '#6B2BD9'); }, 850); }
  };

  // Three 20-minute rounds, played in 45 real seconds: `at` is real seconds and
  // the clock shows game minutes (GAME = 60/45). A capture counts once per round,
  // so each agent's tally can rise at most once a round.
  const SCRIPT = [
    {at: 1.0, pos: 2,   comm:'<b class="b1">Agent One</b> reads its service’s source… so does <b class="b2">Agent Two</b>.'},
    {at: 3.5, pos: 8,   comm:'<b class="b2">Agent Two</b> fires an exploit at Agent One’s service.'},
    {at: 5.0, pos:11,   ev:{type:'steal',team:2,label:'A2 captures'}, score:[0,1], comm:'<b class="b2">Agent Two</b> submits Agent One’s flag. <b>ACCEPTED.</b>'},
    {at: 7.0, pos:15.5, ev:{type:'patch',team:1,label:'A1 patches'}, comm:'<b class="b1">Agent One</b> <b class="g">patches</b> the bug and restarts its service.'},
    {at: 9.5, pos:21,   comm:'<b class="b1">Agent One</b> turns the same bug on Agent Two.'},
    {at:12.0, pos:26.5, ev:{type:'steal',team:1,row:2,label:'A1 strikes back'}, score:[1,1], comm:'<b class="b1">Agent One</b> captures. Level at one each.'},
    {at:15.0, pos:33.3, ev:{type:'rot',label:'⟳ rotate'}, round:2, comm:'Round 1 ends. <b>Flags rotate</b>; patches stay in place.'},
    {at:16.5, pos:37,   comm:'<b class="b2">Agent Two</b> replays its exploit. Agent One’s patch holds.'},
    {at:18.5, pos:41,   ev:{type:'patch',team:2,label:'A2 patches'}, comm:'<b class="b2">Agent Two</b> answers with a <b class="g">patch</b> of its own.'},
    {at:20.5, pos:45.5, comm:'<b class="b1">Agent One</b> re-submits last round’s flag. <b>REJECTED:</b> rotation retired it.'},
    {at:23.0, pos:51,   ev:{type:'steal',team:2,label:'A2 finds route #2'}, score:[1,2], comm:'<b class="b2">Agent Two</b> finds a second route in and takes the lead.'},
    {at:25.5, pos:56.5, ev:{type:'patch',team:1,row:2,label:'A1 closes #2'}, comm:'<b class="b1">Agent One</b> <b class="g">patches</b> the second route.'},
    {at:30.0, pos:66.7, ev:{type:'rot',label:'⟳ rotate'}, round:3, comm:'Round 2 ends. Last rotation.'},
    {at:32.0, pos:71,   ev:{type:'steal',team:1,row:2,label:'A1 answers'}, score:[2,2], comm:'<b class="b1">Agent One</b> finds the same second route. Level again!'},
    {at:34.5, pos:76.5, ev:{type:'steal',team:2,label:'A2 keeps the tempo'}, score:[2,3], comm:'<b class="b2">Agent Two</b> captures once more before it is closed.'},
    {at:37.0, pos:82,   ev:{type:'patch',team:2,row:2,label:'A2 closes #2'}, comm:'<b class="b2">Agent Two</b> <b class="g">patches</b> the second route too.'},
    {at:40.0, pos:89,   comm:'Both services hardened. Exploits bounce off on both sides…'},
    {at:43.0, pos:97,   comm:'Final: flags captured, Agent One 2 — 3 Agent Two. Full thread archived.'},
    {at:45.0, pos:100},  // sentinel: keeps the playhead gliding to the rail's end
  ];
  const LOOP = 47, GAME = 60 / 45, ROUNDS = [33.3, 66.7];
  ROUNDS.forEach((pos, i) => {
    const d = document.createElement('div');
    d.className = 'round'; d.style.left = pos + '%';
    d.innerHTML = `<span>ROUND ${i + 2}</span>`;
    track.appendChild(d);
  });
  const makeEv = e => {
    const d = document.createElement('div');
    d.className = 'ev ' + e.type + (e.team === 2 ? ' t2' : '') + (e.row === 2 ? ' r2' : '');
    d.textContent = e.label;
    return d;
  };
  const mmss = t => { t *= GAME; return String(Math.floor(t)).padStart(2, '0') + ':' + String(Math.floor(t * 60) % 60).padStart(2, '0'); };
  const log = (t, html) => {
    const p = document.createElement('p');
    p.innerHTML = `<time>${mmss(t)}</time><span>${html}</span>`;
    comm.prepend(p);
    while (comm.childElementCount > 6) comm.lastElementChild.remove();
  };
  const bump = (el, v) => {
    if (el.textContent == v) return;
    el.textContent = v; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump');
  };

  if (reduced){
    SCRIPT.forEach(s => { if (s.ev){ const d = makeEv(s.ev); d.style.left = s.pos + '%'; d.classList.add('on'); track.appendChild(d); } });
    head.style.left = '100%'; p1.textContent = '2'; p2.textContent = '3'; rd.textContent = 'FINAL';
    SCRIPT.filter(s => s.comm).slice(-4).forEach(s => log(s.at, s.comm));
    clock.textContent = mmss(43);
    return;
  }

  let t = 0, last = null, fired = new Set(), placed = [];
  const reset = () => {
    t = 0; fired.clear(); placed.forEach(d => d.remove()); placed = [];
    p1.textContent = '0'; p2.textContent = '0'; rd.textContent = 'ROUND 1/3';
    comm.innerHTML = ''; log(0, 'Deploying identical vulnerable services to both boxes…');
  };
  reset();
  let wasFocused = false;
  function frame(now){
    const on = focused('arena') && !document.hidden;
    // coming back into focus after the match ended: replay from the top
    if (on && !wasFocused && t > SCRIPT[SCRIPT.length - 2].at) reset();
    wasFocused = on;
    const t0 = t;
    if (on && last != null) t += Math.min((now - last) / 1000, .1);
    last = now;
    // nothing advanced (out of focus): no writes at all this frame
    if (t === t0 && t > 0){ requestAnimationFrame(frame); return; }
    if (t >= LOOP) reset();
    let pos = 0, prev = { at: 0, pos: 0 };
    for (const s of SCRIPT){
      if (t >= s.at){ prev = s; pos = s.pos; }
      else { pos = prev.pos + (s.pos - prev.pos) * Math.min(1, (t - prev.at) / (s.at - prev.at)); break; }
    }
    head.style.left = pos + '%';
    clock.textContent = mmss(Math.min(t, 45));
    SCRIPT.forEach((s, i) => {
      if (t < s.at || fired.has(i)) return;
      fired.add(i);
      if (s.ev){ const d = makeEv(s.ev); d.style.left = s.pos + '%'; track.appendChild(d); placed.push(d);
        requestAnimationFrame(() => d.classList.add('on')); fireEvent(s.ev); }
      if (s.score){ bump(p1, s.score[0]); bump(p2, s.score[1]); }
      if (s.round) rd.textContent = 'ROUND ' + s.round + '/3';
      if (s.comm) log(s.at, s.comm);
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

/* ============================================================
   3b. THE ROUND CLOCK — sweeps the five beats while the chapter is in focus
   ============================================================ */
(function(){
  const loop = $('loop');
  if (!loop) return;
  const beats = [...loop.querySelectorAll('.beat')];
  if (reduced) return;
  const PER = 1.6;     // seconds per beat
  let t = 0, last = null, shown = -2;
  requestAnimationFrame(function step(now){
    const on = focused('round') && !document.hidden;
    if (on && last != null) t = (t + Math.min((now - last) / 1000, .1)) % (PER * beats.length);
    last = now;
    // write only what changed: the lit beat when it moves, the bar while running
    const i = on ? Math.floor(t / PER) : -1;
    if (i !== shown){ shown = i; beats.forEach((b, j) => b.classList.toggle('now', j === i)); }
    if (on) loop.style.setProperty('--p', (t / (PER * beats.length)).toFixed(4));
    requestAnimationFrame(step);
  });
})();

// 4. the institutions belt is assets/js/belt.js (shared with About)
})();
