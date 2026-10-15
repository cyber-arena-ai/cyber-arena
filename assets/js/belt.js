/* The institutions conveyor — one component, used by the homepage and About
   (styles: assets/css/belt.css). Renders assets/data/list.js in order into
   every .convey on the page, duplicated so the half-track loop is seamless.
   Moved by rAF rather than a CSS keyframe (Chrome can leave a keyframe frozen
   after a scroll restore past it); it only moves while on screen, and a
   hovered crate pauses it. Reduced motion: a still, wrapped row of crates.
   Classic script; needs assets/data/list.js loaded first. */
(function(){
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // list.js paths are relative to the site root; resolve them from this script,
  // so the belt reads the same on the homepage and on pages/about.html
  const ROOT = ((document.currentScript && document.currentScript.src) || location.href).replace(/assets\/js\/belt\.js(\?.*)?$/, '');
  document.querySelectorAll('.convey').forEach(convey => {
    const belt = convey.querySelector('.belt-track');
    const band = convey.querySelector('.band');
    const rollers = convey.querySelector('.rollers');
    // one wheel per ~55px of band, refilled on resize
    const fillRollers = () => {
      const n = Math.max(2, Math.round(band.clientWidth / 55));
      if (rollers.childElementCount !== n) rollers.innerHTML = '<i class="roller"></i>'.repeat(n);
    };
    fillRollers();
    let rrz;
    addEventListener('resize', () => { clearTimeout(rrz); rrz = setTimeout(fillRollers, 150); });
    if (!belt || !window.INSTITUTIONS) return;
    belt.innerHTML = INSTITUTIONS.map(i =>
      `<a class="inst" href="${i.url}" target="_blank" rel="noopener"><img src="${new URL(i.img, ROOT).href}" alt="${i.name} logo" loading="lazy"><div class="nm">${i.name}</div></a>`
    ).join('');
    if (reduced) return;
    belt.innerHTML += belt.innerHTML;
    let pos = 0, wheel = 0, last = null, paused = false;
    belt.addEventListener('pointerover', e => { paused = !!e.target.closest('.inst'); });
    belt.addEventListener('pointerout', () => { paused = false; });
    requestAnimationFrame(function step(now){
      const r = convey.getBoundingClientRect();
      const seen = r.bottom > 0 && r.top < innerHeight;
      if (last != null && !paused && seen){
        const dt = Math.min((now - last) / 1000, .1);
        pos = (pos + dt / 30 * 50) % 50;           // half the track per 30 s
        wheel = (wheel - dt / 1.1 * 360) % 360;    // one wheel turn per 1.1 s
        belt.style.transform = `translateX(${-pos}%)`;
        rollers.style.setProperty('--wheel', wheel + 'deg');
      }
      last = now;
      requestAnimationFrame(step);
    });
  });
})();
