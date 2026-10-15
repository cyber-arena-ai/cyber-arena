/* CyberArena — pointer-driven "print plate" effects. Classic script, loaded
   once by chrome.js and kept across in-place navigations. Purely decorative: a
   page that never gets it holds still and is otherwise identical.

   One eased pointer, read three ways:
     --mx/--my   -1..1 across the viewport, written ONLY on the elements that
                 lean ([data-lean] and .mast h1). Never on <html>: a custom
                 property there is inherited by every element, so writing it
                 per frame restyled the whole page on every frame.
     --lx/--ly   on a .plate, -1..1 from the plate toward the pointer, so its
                 hard shadow falls away from the pointer as if lit by it.
                 Updated on pointer MOVES only, never on scroll.
     [data-magnet] a button drifts a few px toward a nearby pointer.
   Touch devices have no hover: nothing runs there.
   prefers-reduced-motion: nothing runs. */
(function(){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  // persistent code: use the natives, so the router's per-page cleanup never cancels us
  const N = (window.CA && CA.native) || { raf: requestAnimationFrame.bind(window),
    add: EventTarget.prototype.addEventListener, setTimeout: setTimeout.bind(window) };
  const on = (t, type, fn, o) => N.add.call(t, type, fn, o);
  let px = 0, py = 0, has = false;
  let mx = 0, my = 0, tx = 0, ty = 0, raf = 0, moved = false;

  let leaners = [], plates = [];
  const scan = () => {
    leaners = [...document.querySelectorAll('[data-lean],.mast h1')];
    plates = [...document.querySelectorAll('.plate,[data-magnet]')];
    // a new leaner starts where the pointer already is, not at rest: otherwise
    // the masthead's second plate jumps on the first frame after a page switch
    const sx = mx.toFixed(3), sy = my.toFixed(3);
    for (const el of leaners){ el.style.setProperty('--mx', sx); el.style.setProperty('--my', sy); }
    moved = true;
  };

  function frame(){
    raf = 0;
    mx += (tx - mx) * .14; my += (ty - my) * .14;
    // every read first, then every write: interleaving them forced a layout per frame
    const updates = [];
    if (moved && has){
      moved = false;
      const vh = innerHeight;
      for (const el of plates){
        const r = el.getBoundingClientRect();
        if (r.bottom < -80 || r.top > vh + 80) continue;          // off screen
        // a plate taller than the screen (the runs ledger) shows little of its
        // shadow, and repainting it per frame is the expensive part: hold it still
        if (r.height > vh * 1.4 && !el.hasAttribute('data-magnet')) continue;
        updates.push([el, px - (r.left + r.width / 2), py - (r.top + r.height / 2), r]);
      }
    }
    const sx = mx.toFixed(3), sy = my.toFixed(3);
    for (const el of leaners){ el.style.setProperty('--mx', sx); el.style.setProperty('--my', sy); }
    for (const [el, dx, dy, r] of updates){
      if (el.hasAttribute('data-magnet')){
        const reach = Math.max(r.width, r.height) * .9 + 40, d = Math.hypot(dx, dy);
        const k = d < reach ? (1 - d / reach) : 0;
        el.style.translate = k ? `${(dx / reach * 7 * k).toFixed(1)}px ${(dy / reach * 5 * k).toFixed(1)}px` : '';
        continue;
      }
      // in tenths: a write (and a repaint) only when the shadow visibly moves
      const span = Math.max(r.width, r.height, 300) * .9;
      const lx = Math.max(-1, Math.min(1, dx / span)).toFixed(1), ly = Math.max(-1, Math.min(1, dy / span)).toFixed(1);
      if (el._lx !== lx){ el._lx = lx; el.style.setProperty('--lx', lx); }
      if (el._ly !== ly){ el._ly = ly; el.style.setProperty('--ly', ly); }
    }
    if (Math.abs(tx - mx) > .002 || Math.abs(ty - my) > .002) kick();
  }
  const kick = () => { if (!raf) raf = N.raf(frame); };

  on(window, 'pointermove', e => {
    px = e.clientX; py = e.clientY; has = moved = true;
    tx = px / innerWidth * 2 - 1; ty = py / innerHeight * 2 - 1;
    kick();
  }, { passive: true });
  on(document, 'pointerleave', () => { tx = ty = 0; kick(); });

  scan();
  on(window, 'ca:swap', scan);     // an in-place page switch (chrome.js): re-read at once
  // pages render their plates after fetching, and in-place navigation swaps
  // the whole body: rescan, coalesced (a live match thread mutates constantly)
  let pend = 0;
  new MutationObserver(() => { if (!pend) pend = N.setTimeout(() => { pend = 0; scan(); }, 250); })
    .observe(document.body, { childList: true, subtree: true });
})();
