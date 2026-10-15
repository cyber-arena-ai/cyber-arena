// The entrant icon — one small pixel creature per <model × harness>, used
// wherever the site names an entrant (leaderboard, runs, the match thread,
// the mc-v1 analysis, the Entrants page). The art lives in bead-icons.js
// (16×12 sprites, picked by model prefix); this renders it the same way
// everywhere, crisp at any size.
//
// ONE colour per icon: the MODEL's vendor colour (CLAUDE.md §3). Models of one
// line share it and are told apart by SHAPE (CAST in bead-icons.js). The
// sprites' accent cells are drawn in that same colour — a second colour (the
// harness's, or ink where it matched the ground) read as a mark on the head.
//
// Two forms:
//   plain   the creature itself, in the vendor colour. Sized in px — the
//           Entrants seats and roster, where it stands on its own.
//   inline  the same creature REVERSED, as a badge set in text: the ground is
//           the vendor colour, the whole creature cut out in paper. No px size:
//           CSS sets its height to the font's (.eicon.rev in base.css), so it
//           lines up with the name.
//
//   fit     (with inline) crop to the creature's own bounding box, padded evenly,
//           so it sits optically centred in a square tile (the thread avatars).
//
//   entrantIcon(H, entity, width, { title, cls, inline, fit })  -> '<svg …>'
//   H is the loadHarnesses() resolver; entity is {model, harness}.
import { W, H as SH, beadGrid, beadSVG, beadColors } from './bead-icons.js';

const PAPER = '#FFFDF8';
const cache = new Map();

export function entrantIcon(H, ent, width = 24, { title = '', cls = '', inline = false, fit = false } = {}){
  const e = (ent && typeof ent === 'object') ? ent : { model: ent };
  const key = `${H.comboKey(e)}|${width}|${title}|${cls}|${inline}|${fit}`;
  if (cache.has(key)) return cache.get(key);
  const grid = beadGrid(e.model);
  const vendor = H.modelColor(e);
  const label = title ? ` role="img" aria-label="${title}"` : ' aria-hidden="true"';
  let svg;
  if (inline){
    let px = '';
    grid.forEach((row, y) => {
      // one rect per run of filled cells; the .06 overlap downward closes row seams
      for (let x = 0; x < W;){
        const on = row[x] !== '.';
        let end = x + 1;
        while (end < W && (row[end] !== '.') === on) end++;
        if (on) px += `<rect x="${x}" y="${y}" width="${end - x}" height="${y === SH - 1 ? 1 : 1.06}" fill="${PAPER}"/>`;
        x = end;
      }
    });
    // the frame: the whole canvas plus a one-cell margin, or (fit) the creature's
    // bounding box squared up and padded by one cell, so it reads centred
    let [x0, y0, vw, vh] = [-1, -1, W + 2, SH + 2];
    if (fit){
      const ys = grid.map((r, y) => /[^.]/.test(r) ? y : -1).filter(y => y >= 0);
      const xs = grid.flatMap(r => [...r].map((c, x) => c !== '.' ? x : -1)).filter(x => x >= 0);
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs) + 1, by0 = Math.min(...ys), by1 = Math.max(...ys) + 1;
      const side = Math.max(bx1 - bx0, by1 - by0) + 2;
      x0 = (bx0 + bx1) / 2 - side / 2; y0 = (by0 + by1) / 2 - side / 2; vw = vh = side;
    }
    svg = `<svg class="eicon rev${cls ? ' ' + cls : ''}" viewBox="${x0} ${y0} ${vw} ${vh}" shape-rendering="crispEdges"${label}>`
        + `<rect x="${x0}" y="${y0}" width="${vw}" height="${vh}" fill="${vendor}"/>${px}</svg>`;
  } else {
    svg = beadSVG(grid, beadColors(vendor, vendor), { size: width, bead: false, holes: false, title })
      .replace('<svg ', `<svg class="eicon${cls ? ' ' + cls : ''}" `);
  }
  cache.set(key, svg);
  return svg;
}
