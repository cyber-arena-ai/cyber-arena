/* CyberArena — uniform page chrome (header nav + footer) and in-place navigation.
   Classic script (no module) placed RIGHT AFTER <nav id="site-nav"> so it fills
   the nav synchronously during parse — before first paint — and never causes a
   layout-shift "blink". The footer element is parsed later, so its fill defers to
   DOMContentLoaded (it's below the fold; a late fill shifts nothing visible).
   Usage: <nav class="nav" id="site-nav"></nav><script src="assets/js/chrome.js"></script>
          … <footer class="footer" id="site-footer"></footer>

   IN-PLACE NAVIGATION. A same-site link does not reload the page: the target
   HTML is fetched (on hover, ahead of the click), its new stylesheets load, the
   body is swapped with THIS <header id="site-top"> kept mounted — the same node,
   so the bar cannot change width or blink — and the new page's scripts run. Every page stays a plain static document — open any URL
   directly and it works as before; the router only changes how you move.

   A page's scripts were written for a full reload, which used to clean up after
   them. So the router does that cleanup: everything a page starts — timers,
   animation frames, window/document listeners, fetches, EventSources and
   WebSockets — is tracked per page and cancelled when you leave it (a live
   match thread's stream, the homepage's animation loops). Code that must
   outlive a page (this file, fx.js) uses CA.native instead.

   It also loads assets/js/fx.js. */
(function(){
  if (window.CA) return;            // already installed (this tag inside a swapped-in page)

  // A top-level item is [href, label, alsoActiveOn]; a group is {label, items:[[href, label, icon]]}.
  // `icon` is a Font Awesome name, or an image path (.svg) drawn on the same ink tile.
  // The group's own pill is active whenever any of its pages is — including the
  // match thread, which is opened from Runs and reads as part of the Arena.
  const LINKS = [
    ['index.html', 'Home'],
    ['pages/leaderboard.html', 'Leaderboard'],
    { label: 'Arena', also: ['pages/trajectory.html'], items: [
      ['pages/runs.html', 'Matches', 'fa-flag-checkered'],
      ['pages/games.html', 'Challenges', 'fa-gamepad'],
      ['pages/entrants.html', 'Entrants', 'fa-user-astronaut'],
      ['https://github.com/cyber-arena-ai/octagon', 'Octagon', 'assets/img/octagon-white.svg'],
    ]},
    { label: 'Research', items: [
      ['pages/blogs.html', 'Blogs', 'fa-pen-nib'],
      ['https://arxiv.org/abs/2610.19005', 'arXiv', 'fa-file-lines'],
      ['https://www.alphaxiv.org/abs/2610.19005', 'alphaXiv', 'fa-comments'],
    ]},
    ['pages/about.html', 'About us'],
  ];
  // The homepage is at the site root, every other page under pages/ (articles in
  // pages/blog/). Hrefs above are root-relative; derive the root from this script's own src
  // rather than hardcoding a domain, so the same chrome works at the site
  // root, from pages/ and pages/blog/, on localhost, and on any preview deploy.
  const src = (document.currentScript && document.currentScript.src) || '';
  const ROOT = src.replace(/assets\/js\/chrome\.js(\?.*)?$/, '');

  /* ---- natives, and the per-page scope ---------------------------------- */
  const N = {
    setTimeout: window.setTimeout.bind(window), clearTimeout: window.clearTimeout.bind(window),
    setInterval: window.setInterval.bind(window), clearInterval: window.clearInterval.bind(window),
    raf: window.requestAnimationFrame.bind(window),
    add: EventTarget.prototype.addEventListener, remove: EventTarget.prototype.removeEventListener,
    fetch: window.fetch.bind(window), ES: window.EventSource, WS: window.WebSocket,
  };
  window.CA = { native: N, go: href => go(href) };
  const on = (t, type, fn, o) => N.add.call(t, type, fn, o);

  const newScope = () => ({ alive: true, timers: new Set(), intervals: new Set(),
                            listeners: [], streams: [], ctrl: new AbortController() });
  let scope = newScope();
  window.setTimeout = function(fn, ms, ...a){
    if (typeof fn !== 'function') return N.setTimeout(fn, ms, ...a);
    const sc = scope;
    const id = N.setTimeout(() => { sc.timers.delete(id); if (sc.alive) fn(...a); }, ms);
    sc.timers.add(id);
    return id;
  };
  window.clearTimeout = id => { scope.timers.delete(id); N.clearTimeout(id); };
  window.setInterval = function(fn, ms, ...a){
    const sc = scope;
    const id = N.setInterval(() => { if (sc.alive) fn(...a); }, ms);
    sc.intervals.add(id);
    return id;
  };
  window.clearInterval = id => { scope.intervals.delete(id); N.clearInterval(id); };
  // a page's rAF loop simply stops: its next frame never runs once the page is gone
  window.requestAnimationFrame = fn => { const sc = scope; return N.raf(t => { if (sc.alive) fn(t); }); };
  // listeners on window/document outlive the body swap, so they are the ones to track
  EventTarget.prototype.addEventListener = function(type, fn, opts){
    if (this === window || this === document) scope.listeners.push([this, type, fn, opts]);
    return N.add.call(this, type, fn, opts);
  };
  window.fetch = (input, init) => (init && init.signal) ? N.fetch(input, init)
    : N.fetch(input, { ...(init || {}), signal: scope.ctrl.signal });
  if (N.ES) window.EventSource = class extends N.ES { constructor(...a){ super(...a); scope.streams.push(this); } };
  if (N.WS) window.WebSocket = class extends N.WS { constructor(...a){ super(...a); scope.streams.push(this); } };
  // a fetch cancelled because its page was left is not an error worth a console line
  on(window, 'unhandledrejection', e => { if (e.reason && e.reason.name === 'AbortError') e.preventDefault(); });

  function leave(){
    const sc = scope;
    sc.alive = false;
    sc.timers.forEach(N.clearTimeout);
    sc.intervals.forEach(N.clearInterval);
    sc.listeners.forEach(([t, type, fn, o]) => N.remove.call(t, type, fn, o));
    sc.streams.forEach(s => { try { s.close(); } catch {} });
    sc.ctrl.abort();
    scope = newScope();
  }

  /* ---- the nav ----------------------------------------------------------- */
  // the open page as a root-relative path, the form LINKS uses ('pages/runs.html')
  const rootPath = new URL(ROOT || location.href).pathname.replace(/[^/]*$/, '');
  const activeFor = path => {
    const rel = path.startsWith(rootPath) ? path.slice(rootPath.length) : path.replace(/^\//, '');
    return /(^|\/)blog\//.test(rel) ? 'pages/blogs.html' : (rel || 'index.html');
  };
  const brand = `<a class="brand" href="${ROOT}index.html">Cyber<em>Arena</em></a>`;
  const link = ([href, label, also]) => `<a href="${ROOT}${href}" data-page="${href}" data-also="${(also || []).join(' ')}">${label}</a>`;
  const ico = icon => /\.svg$/.test(icon) ? `<i class="img"><img src="${ROOT}${icon}" alt=""></i>` : `<i class="fa-solid ${icon}"></i>`;
  const group = g => `<span class="navgroup" data-label="${g.label}" data-also="${(g.also || []).join(' ')}">
      <button type="button" aria-haspopup="true" aria-expanded="false">${g.label}<i class="car"></i></button>
      <span class="navmenu" role="menu">${g.items.map(([href, label, icon]) => /^https?:/.test(href)
        // an off-site item (the paper): a new tab, marked with the site's external arrow
        ? `<a role="menuitem" href="${href}" target="_blank" rel="noopener">
          ${ico(icon)}<b>${label}<em class="arw up"></em></b></a>`
        : `<a role="menuitem" href="${ROOT}${href}" data-page="${href}">
          ${ico(icon)}<b>${label}</b></a>`).join('')}</span>
    </span>`;
  const navlinks = `<span class="navlinks">${LINKS.map(l => Array.isArray(l) ? link(l) : group(l)).join('')}</span>`;

  let navEl = null;
  function markActive(){
    if (!navEl) return;
    const active = activeFor(location.pathname);
    const hit = el => el.dataset.page === active || (el.dataset.also || '').split(' ').includes(active);
    navEl.querySelectorAll('a[data-page]').forEach(a => {
      const on = hit(a);
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    navEl.querySelectorAll('.navgroup').forEach(g =>
      g.classList.toggle('active', hit(g) || !!g.querySelector('a.active')));
  }
  function fillNav(){
    const nav = document.getElementById('site-nav');
    if (!nav || nav.childElementCount) return;
    navEl = nav;
    nav.innerHTML = brand +
      '<button class="nav-burger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
      navlinks;
    markActive();
    const btn = nav.querySelector('.nav-burger');
    btn.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', String(open));
    });
    // the Arena slip: hover opens it on a pointer device, a click toggles it
    // (touch, keyboard), Escape or a click elsewhere closes it
    nav.querySelectorAll('.navgroup').forEach(g => {
      const b = g.querySelector('button');
      let t;
      const set = open => { N.clearTimeout(t); g.classList.toggle('open', open); b.setAttribute('aria-expanded', String(open)); };
      g._set = set;
      const fine = matchMedia('(hover:hover) and (pointer:fine)');
      g.addEventListener('pointerenter', () => { if (fine.matches) set(true); });
      g.addEventListener('pointerleave', () => { if (fine.matches) t = N.setTimeout(() => set(false), 160); });
      b.addEventListener('click', () => set(!g.classList.contains('open')));
      g.addEventListener('keydown', e => { if (e.key === 'Escape'){ set(false); b.focus(); } });
      g.addEventListener('focusout', e => { if (!g.contains(e.relatedTarget)) set(false); });
      on(document, 'click', e => { if (!g.contains(e.target)) set(false); });
    });
  }
  const closeMenus = () => {
    if (!navEl) return;
    navEl.classList.remove('open');
    navEl.querySelector('.nav-burger')?.setAttribute('aria-expanded', 'false');
    navEl.querySelectorAll('.navgroup').forEach(g => g._set && g._set(false));
  };

  const year = new Date().getFullYear();
  // The footer is the header's twin: the same full-width bar, rule and layout
  // (wordmark left, plain links right), just not sticky.
  function fillFooter(){
    const foot = document.getElementById('site-footer');
    if (!foot || foot.childElementCount) return;
    foot.innerHTML = `<div class="wrap foot-in">
        <a class="brand" href="${ROOT}index.html">Cyber<em>Arena</em><small>© ${year}</small></a>
        <span class="foot-links">
          <a href="https://github.com/cyber-arena-ai/cyber-arena" target="_blank" rel="noopener">GitHub</a>
          <a href="https://2077ai.com" target="_blank" rel="noopener">2077AI</a>
          <a href="https://agentbeats.org" target="_blank" rel="noopener">AgentBeats</a>
        </span>
      </div>`;
  }

  // favicon — the simple black/pink "CA", shared by every page
  if (!document.querySelector('link[rel~="icon"]')){
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.type = 'image/svg+xml';
    icon.href = ROOT + 'assets/img/favicon.svg';
    document.head.appendChild(icon);
  }

  /* ---- in-place navigation ----------------------------------------------- */
  const pageKey = u => u.origin + u.pathname + u.search;
  const html = new Map();                 // pageKey -> Promise<text>; the shells are static
  function getHTML(u){
    const k = pageKey(u);
    if (!html.has(k)) html.set(k, N.fetch(u.href, { credentials: 'same-origin' }).then(r => {
      if (!r.ok || !/text\/html/.test(r.headers.get('content-type') || '')) throw new Error(`HTTP ${r.status}`);
      return r.text();
    }).catch(e => { html.delete(k); throw e; }));
    return html.get(k);
  }
  // a link the router takes: same origin, a page (not an asset), plain left click
  function routable(a, e){
    if (!a || typeof a.href !== 'string' || !a.href || a.hasAttribute('download') || a.dataset.reload != null) return null;
    if (a.target && a.target !== '_self') return null;
    if (e && (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented)) return null;
    const u = new URL(a.href, location.href);
    if (u.origin !== location.origin || !/(\.html|\/)$/.test(u.pathname)) return null;
    // an anchor on the page already open is the browser's to scroll to
    if (u.hash && u.pathname === location.pathname && u.search === location.search) return null;
    return u;
  }
  on(document, 'click', e => {
    const u = routable(e.target.closest && e.target.closest('a'), e);
    if (!u) return;
    e.preventDefault();
    go(u.href);
  });
  // start fetching on intent, so the click usually finds the page already here
  on(document, 'pointerover', e => {
    const u = routable(e.target.closest && e.target.closest('a'));
    if (u) getHTML(u).catch(() => {});
  }, { passive: true });

  history.scrollRestoration = 'manual';
  let loaded = new URL(location.href);
  history.replaceState({ ...(history.state || {}), ca: 1 }, '');
  on(window, 'popstate', e => {
    const u = new URL(location.href);
    // a hash change on the open page (the Games sheet) is that page's business
    if (u.pathname === loaded.pathname && u.search === loaded.search) return;
    go(u.href, { push: false, y: e.state && e.state.y });
  });

  let navToken = 0;
  async function go(href, { push = true, y = null } = {}){
    const u = new URL(href, location.href);
    const my = ++navToken;
    closeMenus();
    try {
      const doc = new DOMParser().parseFromString(await getHTML(u), 'text/html');
      if (my !== navToken) return;
      // the new page's stylesheets, loaded BEFORE the swap so it never shows unstyled
      const sheets = [...doc.head.querySelectorAll('link[rel~="stylesheet"]')].map(l => new URL(l.getAttribute('href'), u).href);
      const have = new Set([...document.querySelectorAll('link[rel~="stylesheet"]')].map(l => l.href));
      await Promise.all(sheets.filter(h => !have.has(h)).map(h => new Promise(res => {
        const l = document.createElement('link');
        l.rel = 'stylesheet'; l.href = h; l.onload = l.onerror = res;
        N.setTimeout(res, 2500);
        document.head.appendChild(l);
      })));
      if (my !== navToken) return;

      // pin every stylesheet href to an absolute URL first: a relative one is
      // re-resolved against the NEW address once it is pushed (blog/ is one level down)
      document.querySelectorAll('link[rel~="stylesheet"]').forEach(l => l.setAttribute('href', l.href));
      // where the old page's footer stood: the new one is held there (see hold())
      const oldFoot = document.getElementById('site-footer');
      const footTop = oldFoot ? oldFoot.getBoundingClientRect().top + scrollY : 0;
      // leave the old page: remember where it was scrolled, cancel everything it started
      history.replaceState({ ...(history.state || {}), ca: 1, y: scrollY }, '');
      leave();
      if (push) history.pushState({ ca: 1 }, '', u.href);
      loaded = new URL(location.href);
      swap(doc, u, new Set(sheets));
      // where to land: the remembered position (back/forward), the anchor, or the top
      const target = u.hash && document.getElementById(decodeURIComponent(u.hash.slice(1)));
      const place = () => {
        if (y != null) window.scrollTo({ top: y, behavior: 'instant' });
        else if (target) target.scrollIntoView({ behavior: 'instant' });
        else window.scrollTo({ top: 0, behavior: 'instant' });
      };
      place();
      hold(footTop);
      // a data page grows as its fetches land: re-apply a restored position a few times
      if (y != null) [80, 300, 800].forEach(ms => N.setTimeout(place, ms));
    } catch (err) {
      // anything unexpected: fall back to an ordinary page load
      location.href = u.href;
    }
  }

  // A data page arrives as an empty shell and fills in when its fetches land.
  // Without this the footer would jump up under the title for that moment and
  // drop back down: hold it at the old page's footer line until the content
  // reaches it (or 1.2 s pass), then let it go.
  function hold(oldTop){
    const foot = document.getElementById('site-footer');
    if (!foot || !oldTop) return;
    const base = parseFloat(getComputedStyle(foot).marginTop) || 0;
    const natural = () => foot.getBoundingClientRect().top + scrollY - (parseFloat(foot.style.marginTop) || base) + base;
    const t0 = performance.now();
    (function step(){
      const gap = oldTop - natural();
      if (gap <= 1 || performance.now() - t0 > 1200 || !foot.isConnected){ foot.style.marginTop = ''; return; }
      foot.style.marginTop = (base + gap) + 'px';
      N.setTimeout(step, 60);
    })();
  }

  let gen = 0;
  function swap(doc, u, sheets){
    gen++;
    const root = document.documentElement;
    document.title = doc.title;
    root.lang = doc.documentElement.lang || root.lang;
    // html classes are page state (the homepage's .snap); only ours carry over
    root.className = '';
    // head: drop the old page's stylesheets and <style> blocks, take the new page's
    document.querySelectorAll('link[rel~="stylesheet"]').forEach(l => { if (!sheets.has(l.href)) l.remove(); });
    document.head.querySelectorAll('style').forEach(s => s.remove());
    doc.head.querySelectorAll('style').forEach(s => document.head.appendChild(document.importNode(s, true)));
    // head classic scripts are one-line page setup (the homepage's snap class)
    doc.head.querySelectorAll('script:not([src])').forEach(s => {
      if (s.type && s.type !== 'text/javascript') return;
      const x = document.createElement('script'); x.textContent = s.textContent;
      document.head.appendChild(x); x.remove();
    });
    // body: take the new page's content, then put THIS header in the placeholder
    const scripts = [...doc.body.querySelectorAll('script')];
    scripts.forEach(s => s.remove());
    document.body.className = doc.body.className;
    document.body.replaceChildren(...doc.body.childNodes);
    const top = navEl && navEl.closest('#site-top');
    const ph = document.getElementById('site-top');
    if (top && ph && ph !== top) ph.replaceWith(top);
    else {                                   // a page without the shared header markup
      const n = document.getElementById('site-nav');
      if (n && navEl && n !== navEl) n.replaceWith(navEl);
    }
    markActive();
    fillFooter();
    // no fade: the swap happens inside one task, so the old page is never seen
    // half-gone; fx.js re-reads the new page now, not on its next mutation tick
    window.dispatchEvent(new Event('ca:swap'));
    // run the new page's scripts, strictly in document order, as the parser
    // would: an inline script must not run before the external script above it
    // has loaded (About's team grid reads window.CONTRIBUTORS from
    // contributors.js — appended all at once, it ran first and rendered empty).
    // A module is keyed by URL, so it gets a fresh query to evaluate again; what
    // it imports (util.js, config.js) is shared and stays loaded. Modules are
    // deferred anyway and may await data, so nothing waits on them.
    const mine = gen;
    (async () => {
      for (const old of scripts){
        if (mine !== gen) return;                     // already navigated on
        const s = old.getAttribute('src');
        if (s && /assets\/js\/chrome\.js/.test(s)) continue;
        const x = document.createElement('script');
        for (const a of old.attributes) if (a.name !== 'src') x.setAttribute(a.name, a.value);
        const module = old.type === 'module';
        if (s){
          const url = new URL(s, u);
          if (module) url.searchParams.set('ca', gen);
          x.src = url.href;
        } else x.textContent = old.textContent;
        x.async = false;
        const done = (s && !module) ? new Promise(res => { x.onload = x.onerror = res; }) : null;
        document.body.appendChild(x);
        if (done) await done;
      }
    })();
  }

  // the graph-paper lamp (base.css .bg-lamp). It hangs off <html>, outside the body the router
  // swaps, and listens through the NATIVE addEventListener: a page-scoped listener is removed on
  // every in-place navigation, which is how the lamp used to freeze after a submenu click.
  if (matchMedia('(hover: hover)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    const lamp = document.createElement('div');
    lamp.className = 'bg-lamp'; lamp.setAttribute('aria-hidden', 'true');
    document.documentElement.appendChild(lamp);
    let x = 0, y = 0, queued = false;
    const place = () => {
      queued = false;
      const lx = Math.round(x - 190), ly = Math.round(y - 190);
      lamp.style.transform = `translate3d(${lx}px,${ly}px,0)`;
      lamp.style.backgroundPosition = `${-lx}px ${-ly}px`;       // lines stay on the window's grid
    };
    on(window, 'pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY; lamp.classList.add('on');
      if (!queued){ queued = true; N.raf(place); }
    }, { passive: true });
    on(document, 'pointerleave', () => lamp.classList.remove('on'));
    on(window, 'blur', () => lamp.classList.remove('on'));
  }

  // pointer-driven plate effects; persistent, decorative, never required
  const fx = document.createElement('script');
  fx.src = ROOT + 'assets/js/fx.js';
  fx.defer = true;
  document.head.appendChild(fx);

  fillNav();   // #site-nav exists (script sits right after it) -> filled pre-paint
  // the footer is further down the document; fill it once the DOM is ready
  if (document.getElementById('site-footer')) fillFooter();
  else on(document, 'DOMContentLoaded', fillFooter);
})();
