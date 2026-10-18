// Visitor likes: the star on a match row and on a match thread.
//
// The count is the midend's (POST /api/runs/{id}/like adds one and answers with
// the new total; every /api/runs row carries `likes`). There is no per-visitor
// limit yet: every click is a like. The star is hollow with no number at 0 and
// solid with the count beside it otherwise. Styles: .like in base.css.
//
//   starHTML(id, n, cls)        -> '<span class="like …" data-like="id">…</span>'
//   bindLikes(host, onCount)    delegated clicks/keys on every [data-like] in host
//   paintStar(el, n)            set one star's count
import { api } from './config.js';

const icon = n => `<i class="fa-${n ? 'solid' : 'regular'} fa-star"></i>`;

export function starHTML(id, n = 0, cls = ''){
  return `<span class="like${n ? ' on' : ''}${cls ? ' ' + cls : ''}" data-like="${id}" role="button" tabindex="0"`
    + ` aria-label="Like this match" title="Like this match">${icon(n)}<b>${n || ''}</b></span>`;
}

export function paintStar(el, n){
  el.classList.toggle('on', n > 0);
  el.querySelector('i').className = `fa-${n ? 'solid' : 'regular'} fa-star`;
  el.querySelector('b').textContent = n || '';
}

// a short pop on the star and a "+1" that floats off it; restarts on a fast re-click
function burst(el){
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
  const plus = document.createElement('em');
  plus.className = 'like-plus';
  plus.textContent = '+1';
  el.appendChild(plus);
  plus.addEventListener('animationend', () => plus.remove());
}

async function like(el, onCount){
  const id = el.dataset.like;
  const before = +el.querySelector('b').textContent || 0;
  paintStar(el, before + 1);                 // optimistic, corrected by the reply
  burst(el);
  try {
    const r = await fetch(api(`/api/runs/${id}/like`), { method: 'POST' });
    if(!r.ok) throw new Error(r.status);
    const { likes } = await r.json();
    paintStar(el, likes);
    onCount?.(id, likes);
  } catch {
    paintStar(el, before);
  }
}

// One listener for the whole host. A star inside a row link must not open the
// match: preventDefault here also tells chrome.js's router to leave the click.
export function bindLikes(host, onCount){
  if(!host) return;
  host.addEventListener('click', e => {
    const el = e.target.closest('[data-like]');
    if(!el || !host.contains(el)) return;
    e.preventDefault(); e.stopPropagation();
    like(el, onCount);
  });
  host.addEventListener('keydown', e => {
    if(e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-like]');
    if(!el || !host.contains(el)) return;
    e.preventDefault(); e.stopPropagation();
    like(el, onCount);
  });
}
