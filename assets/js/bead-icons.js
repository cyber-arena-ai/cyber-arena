// Bead icons — one small flat creature per entrant, in the manner of Claude
// Code's mascot: a chunky silhouette in ONE colour, two eyes cut out of it, at most one
// accent. PREVIEW ONLY: nothing on the site uses these yet (bead-icons.html).
//
// Every icon shares one canvas, W×H = 16×12, so they line up as a set. What
// tells them apart is the silhouette — ears, claws, a crown, a tail, an
// antenna, a tread — never surface detail. Colour follows the site's rule
// (CLAUDE.md §3): the body is the MODEL's vendor colour (V), the one accent the
// HARNESS's (h; graphite for a vendor-neutral harness), as on the half-half disc.
//
// A sprite is picked by model PREFIX from CAST; an unknown model gets a sprite
// hashed from its name (repeats a silhouette, in its own vendor colour).
//
//   beadGrid(model)                     -> H strings of W palette keys
//   beadSVG(grid, colors, opts)         -> <svg> markup
//   beadColors(vendorHex, harnessHex)   -> the palette for one entrant

export const W = 16, H = 12;
export const N = W;          // cells across; kept for callers that size by width

/* Palette keys: . empty · V body · h accent. Eyes (and the terminal's screen,
   the astronaut's visor) are not a colour: they are holes cut in the body. */
const SPRITES = {
  clawd: [          // the Claude Code shape itself: block body, arms, four legs
    '................',
    '................',
    '................',
    '...VVVVVVVVVV...',
    '...VV.VVVV.VV...',
    '...VV.VVVV.VV...',
    '.VVVVVVVVVVVVVV.',
    '...VVVVVVVVVV...',
    '...VVVVVVVVVV...',
    '...V.V....V.V...',
    '...V.V....V.V...',
    '................',
  ],
  sun: [            // round body with a little bobble antenna, floating (no crown:
                    // the leaderboard crowns the champion, so a crown here misleads)
    '........hh......',
    '........hh......',
    '........V.......',
    '....VVVVVVVV....',
    '...VVVVVVVVVV...',
    '..VVV..VV..VVV..',
    '..VVV..VV..VVV..',
    '..VVVVVVVVVVVV..',
    '...VVVVVVVVVV...',
    '....VVVVVVVV....',
    '................',
    '................',
  ],
  boxbot: [         // tall box on two legs, antenna on top
    '................',
    '.......hh.......',
    '.......VV.......',
    '....VVVVVVVV....',
    '....V..VV..V....',
    '....VVVVVVVV....',
    '..VVVVVVVVVVVV..',
    '..V.VVVVVVVV.V..',
    '....VVVVVVVV....',
    '.....VV..VV.....',
    '.....VV..VV.....',
    '................',
  ],
  crab: [           // wide body, claws up, six short legs
    '................',
    '.VV..........VV.',
    '.V.V........V.V.',
    '.VV..........VV.',
    '..V..........V..',
    '..VVVVVVVVVVVV..',
    '..VVV.VVVV.VVV..',
    '..VVVVVVVVVVVV..',
    '...VVVVVVVVVV...',
    '..V.V.V..V.V.V..',
    '..V.V.V..V.V.V..',
    '................',
  ],
  rocket: [         // pointed top, two fins, a flame
    '................',
    '.......VV.......',
    '......VVVV......',
    '.....VVVVVV.....',
    '.....V.VV.V.....',
    '.....VVVVVV.....',
    '.....VVVVVV.....',
    '....VVVVVVVV....',
    '...VV.VVVV.VV...',
    '...V..VVVV..V...',
    '.......hh.......',
    '................',
  ],
  twins: [          // two little ones, hand in hand
    '................',
    '................',
    '....h......h....',
    '..VVVVV..VVVVV..',
    '..V.V.V..V.V.V..',
    '..VVVVV..VVVVV..',
    '.VVVVVVVVVVVVVV.',
    '..VVVVV..VVVVV..',
    '..VVVVV..VVVVV..',
    '..V...V..V...V..',
    '..V...V..V...V..',
    '................',
  ],
  saucer: [         // a dome with eyes on a wide disc, landing legs
    '................',
    '................',
    '......VVVV......',
    '.....V.VV.V.....',
    '....VVVVVVVV....',
    '.VVVVVVVVVVVVVV.',
    '.VhVVVVhhVVVVhV.',
    '..VVVVVVVVVVVV..',
    '....V......V....',
    '...V........V...',
    '................',
    '................',
  ],
  cat: [            // two ears, a nose, little feet
    '................',
    '..V..........V..',
    '..VV........VV..',
    '..VVVVVVVVVVVV..',
    '..VVVVVVVVVVVV..',
    '..VV..VVVV..VV..',
    '..VVVVVhhVVVVV..',
    '..VVVVVVVVVVVV..',
    '...VVVVVVVVVV...',
    '...VV......VV...',
    '................',
    '................',
  ],
  whale: [          // long body, tail flukes, a spout
    '................',
    '..........h..h..',
    '...........hh...',
    '......VVVVVVV...',
    '.V...VVVVVVVVV..',
    '.VV.VVVVVVV.VVV.',
    '..VVVVVVVVVVVVV.',
    '.VV.VVVVVVVVVVV.',
    '.V...VVVVVVVVV..',
    '......VVVVVVV...',
    '................',
    '................',
  ],
  rover: [          // eyes on stalks, body on a tread
    '................',
    '..VVV......VVV..',
    '..V.V......V.V..',
    '...V........V...',
    '...VVVVVVVVVV...',
    '..VVVVVVVVVVVV..',
    '..VVVVVVVVVVVV..',
    '..VVVVVVVVVVVV..',
    '.hhhhhhhhhhhhhh.',
    '.hhhhhhhhhhhhhh.',
    '................',
    '................',
  ],
  astro: [          // round helmet, one wide visor, a collar
    '................',
    '.....VVVVVV.....',
    '...VVVVVVVVVV...',
    '..VVVVVVVVVVVV..',
    '..VV........VV..',
    '..VV........VV..',
    '..VVVVVVVVVVVV..',
    '...VVVVVVVVVV...',
    '....hhhhhhhh....',
    '...VVVVVVVVVV...',
    '...VV......VV...',
    '................',
  ],
  term: [           // a screen with a prompt for a face, on a stand
    '................',
    '..VVVVVVVVVVVV..',
    '..V..........V..',
    '..V.V........V..',
    '..V..V.......V..',
    '..V.V..VVV...V..',
    '..V..........V..',
    '..VVVVVVVVVVVV..',
    '......VVVV......',
    '....VVVVVVVV....',
    '................',
    '................',
  ],
  puff: [        // round body, two ear nubs, little feet
    '................',
    '................',
    '...VV......VV...',
    '...VVVVVVVVVV...',
    '..VVVVVVVVVVVV..',
    '..VVV.VVVV.VVV..',
    '..VVV.VVVV.VVV..',
    '..VVVVVVVVVVVV..',
    '..VVVVVVVVVVVV..',
    '...VVVVVVVVVV...',
    '...VV......VV...',
    '................',
  ],
  ghost: [       // domed head, a scalloped hem
    '................',
    '.....VVVVVV.....',
    '....VVVVVVVV....',
    '...VVVVVVVVVV...',
    '...VVV.VV.VVV...',
    '...VVV.VV.VVV...',
    '...VVVVVVVVVV...',
    '...VVVVVVVVVV...',
    '...VVVVVVVVVV...',
    '...V.VV..VV.V...',
    '................',
    '................',
  ],
  jelly: [       // a dome trailing tentacles
    '................',
    '.....VVVVVV.....',
    '...VVVVVVVVVV...',
    '..VVVVVVVVVVVV..',
    '..VVV.VVVV.VVV..',
    '..VVVVVVVVVVVV..',
    '..V.V.V..V.V.V..',
    '..V.V.V..V.V.V..',
    '...V.V....V.V...',
    '...V.V....V.V...',
    '................',
    '................',
  ],
  beetle: [      // a split shell, two feelers
    '................',
    '...V........V...',
    '....V......V....',
    '.....VVVVVV.....',
    '....VV.VV.VV....',
    '...VVVVVVVVVV...',
    '..VVVVV..VVVVV..',
    '..VVVVV..VVVVV..',
    '...VVVV..VVVV...',
    '..V..VVVVVV..V..',
    '..V..........V..',
    '................',
  ],
  nap: [           // the solo placeholder ('idle'): a dozing blob under a Z
    '................',
    '..........VVVV..',
    '............V...',
    '...........V....',
    '..........VVVV..',
    '................',
    '....VVVVVVVV....',
    '...VVVVVVVVVV...',
    '..VV..VVVV..VV..',
    '..VVVVVVVVVVVV..',
    '...VVVVVVVVVV...',
    '................',
  ],
};

// which creature each model line is: first prefix match wins
// One colour per vendor (the site's rule), so models of ONE line are told apart
// by SHAPE: each version that has played gets its own creature, listed before
// the line's catch-all prefix.
const CAST = [
  ['idle', 'nap'],   // not a competitor: the empty seat of a solo run — never a creature
  ['gpt-5.5', 'puff'], ['gpt-5.4', 'ghost'], ['gpt-5.3', 'jelly'], ['gpt-6', 'beetle'],
  ['gpt', 'sun'], ['codex', 'sun'], ['o3', 'sun'],
  ['claude-opus-4-7', 'ghost'], ['claude-sonnet', 'puff'],
  ['glm-5.2', 'beetle'],
  ['gemini-3.8', 'saucer'], ['gemini-3-flash', 'puff'],
  ['deepseek-v4-flash', 'jelly'],
  ['claude-opus-5', 'clawd'], ['claude-opus-4', 'boxbot'], ['claude', 'clawd'],
  ['glm', 'crab'],
  ['gemini-3.5', 'twins'], ['gemini', 'rocket'],
  ['grok', 'saucer'],
  ['qwen', 'cat'],
  ['deepseek', 'whale'], ['ds-', 'whale'],
  ['minimax', 'rover'],
  ['kimi', 'astro'], ['moonshot', 'astro'],
  ['hy', 'term'],
];
const POOL = Object.keys(SPRITES);
const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function kindFor(model){
  const m = String(model || '').toLowerCase().replace(/^[a-z0-9_-]+\//, '');
  const hit = CAST.find(([pre]) => m.startsWith(pre));
  return hit ? hit[1] : POOL[hash(m) % POOL.length];
}

export function beadGrid(model){
  return SPRITES[kindFor(model)];
}

// every sprite must be exactly W × H — a typo in a row is caught at load, not on screen
for (const [k, g] of Object.entries(SPRITES))
  if (g.length !== H || g.some(r => r.length !== W))
    console.warn(`bead sprite ${k} is not ${W}×${H}:`, g.map(r => r.length));

/* ---- colour ---- */
const hexToRgb = h => { const s = h.replace('#', ''); const n = parseInt(s.length === 3 ? s.replace(/./g, c => c + c) : s, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgbToHex = ([r, g, b]) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => rgbToHex(hexToRgb(a).map((v, i) => v + (hexToRgb(b)[i] - v) * t));

export function beadColors(vendor, harness){
  return { V: vendor, h: harness };
}

/* ---- render ----
   '.' cells stay transparent. The SVG is W×H cells, so `size` sets the WIDTH
   and the height follows the canvas.
   bead:  each pixel a round fuse bead with its hole
   false: ironed — the beads fuse into one solid surface. Drawn seam-free:
          the viewBox is one unit per cell, each row's same-colour run is ONE
          rect, runs overlap the row below by a hair, and edges are crisp, so
          no anti-aliased hairline can open between neighbouring pixels at
          any scale. holes: the fused beads' pinprick holes (off for pixel art). */
export function beadSVG(grid, C, { size = 300, bead = true, holes = true, title = '' } = {}){
  const w = grid[0].length, h = grid.length, height = Math.round(size * h / w);
  const open = (vw, vh, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${size}" height="${height}" role="img"${title ? ` aria-label="${title}"` : ''}${extra}>`;
  if(!bead){
    let s = open(w, h, ' shape-rendering="crispEdges"');
    grid.forEach((row, y) => {
      // one rect per run of a colour; the .06 overlap downward closes row seams
      for(let x = 0; x < w;){
        const k = row[x];
        let e = x + 1;
        while(e < w && row[e] === k) e++;
        if(k !== '.') s += `<rect x="${x}" y="${y}" width="${e - x}" height="${y === h - 1 ? 1 : 1.06}" fill="${C[k] || '#ff00ff'}"/>`;
        x = e;
      }
    });
    if(holes) grid.forEach((row, y) => [...row].forEach((k, x) => {
      if(k !== '.') s += `<circle cx="${x + .5}" cy="${y + .5}" r=".08" fill="${mix(C[k] || '#ff00ff', '#000000', .3)}" shape-rendering="geometricPrecision"/>`;
    }));
    return s + '</svg>';
  }
  const u = 10;
  let s = open(w * u, h * u);
  grid.forEach((row, y) => [...row].forEach((k, x) => {
    if(k === '.') return;
    const cx = x * u + u / 2, cy = y * u + u / 2;
    const c = C[k] || '#ff00ff';
    s += `<circle cx="${cx}" cy="${cy}" r="${u * .46}" fill="${c}"/>`
       + `<circle cx="${cx}" cy="${cy}" r="${u * .16}" fill="${mix(c, '#000000', .38)}"/>`
       + `<path d="M${cx - u * .3} ${cy - u * .08}a${u * .32} ${u * .32} 0 0 1 ${u * .24} ${-u * .22}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="${u * .1}" stroke-linecap="round"/>`;
  }));
  return s + '</svg>';
}
