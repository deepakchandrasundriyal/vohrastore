/**
 * Dependency-free SVG charts.
 *  - lineChart: one series, one axis, area wash, crosshair tooltip (mouse, touch and arrow keys).
 *  - barList:   ranked horizontal bars with direct value labels (single colour — length carries magnitude).
 *  - splitBar:  part-to-whole for two or three parts, with a legend.
 */
import { esc } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';

function niceMax(max, ticks = 4) {
  if (max <= 0) return { top: ticks, step: 1 };
  const raw = max / ticks;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  return { top: step * ticks, step };
}

/**
 * @param {HTMLElement} el
 * @param {{date:string,value:number}[]} points
 * @param {{ label:string, format:(n)=>string, axisFormat:(n)=>string, dateLabel:(d)=>string, tickLabel:(d)=>string, height?:number }} o
 * @returns {() => void} cleanup
 */
export function lineChart(el, points, o) {
  const H = o.height || 260;
  const pad = { t: 12, r: 12, b: 28, l: 52 };
  el.classList.add('chart');
  el.tabIndex = 0;
  el.setAttribute('role', 'img');
  el.setAttribute('aria-label', `${o.label} over time. Use left and right arrow keys to read values.`);

  let active = -1;
  const tip = document.createElement('div');
  tip.className = 'tooltip'; tip.hidden = true;

  function draw() {
    const W = Math.max(280, el.clientWidth);
    const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const max = Math.max(0, ...points.map(p => p.value));
    const { top, step } = niceMax(max);
    const x = i => pad.l + (points.length <= 1 ? iw / 2 : (i / (points.length - 1)) * iw);
    const y = v => pad.t + ih - (v / top) * ih;

    let grid = '';
    for (let v = 0; v <= top + 1e-9; v += step) {
      grid += `<line class="${v === 0 ? 'baseline' : 'gridline'}" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`
        + `<text class="tick" x="${pad.l - 10}" y="${y(v) + 4}" text-anchor="end">${esc(o.axisFormat(v))}</text>`;
    }
    const every = Math.max(1, Math.ceil(points.length / Math.max(2, Math.floor(iw / 78))));
    let xt = '';
    points.forEach((p, i) => {
      if (i % every === 0 || i === points.length - 1 && points.length - 1 - (Math.floor((points.length - 1) / every) * every) > every / 2) {
        xt += `<text class="tick" x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(o.tickLabel(p.date))}</text>`;
      }
    });
    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
    const area = points.length ? `${line}L${x(points.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : '';

    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" height="${H}" preserveAspectRatio="none">
      ${grid}${xt}
      <path class="area" d="${area}"/><path class="line" d="${line}"/>
      <line class="crosshair" y1="${pad.t}" y2="${pad.t + ih}" visibility="hidden"/>
      <circle class="dot" r="5" visibility="hidden"/>
      <rect x="${pad.l}" y="${pad.t}" width="${iw}" height="${ih}" fill="transparent" data-hit/>
    </svg>`;
    el.appendChild(tip);

    const svg = el.querySelector('svg');
    const cross = svg.querySelector('.crosshair'), dot = svg.querySelector('.dot');
    const show = i => {
      if (i < 0 || i >= points.length) return hide();
      active = i;
      const p = points[i], cx = x(i), cy = y(p.value);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('visibility', 'visible');
      tip.innerHTML = `<div class="t-date">${esc(o.dateLabel(p.date))}</div>`
        + `<div class="t-row"><span><i class="swatch"></i>${esc(o.label)}</span><b>${esc(o.format(p.value))}</b></div>`
        + (p.extra ? `<div class="t-row muted"><span>${esc(p.extra[0])}</span><b>${esc(p.extra[1])}</b></div>` : '');
      tip.hidden = false;
      const left = (cx / W) * el.clientWidth;
      tip.style.left = Math.min(el.clientWidth - 80, Math.max(80, left)) + 'px';
      tip.style.top = Math.max(40, cy) + 'px';
    };
    const hide = () => { active = -1; tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
    const fromEvent = e => {
      const r = svg.getBoundingClientRect();
      const px = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) * (W / r.width);
      return Math.round(((px - pad.l) / iw) * (points.length - 1));
    };
    const hit = svg.querySelector('[data-hit]');
    hit.addEventListener('mousemove', e => show(fromEvent(e)));
    hit.addEventListener('touchstart', e => show(fromEvent(e)), { passive: true });
    hit.addEventListener('touchmove', e => show(fromEvent(e)), { passive: true });
    svg.addEventListener('mouseleave', hide);
    el._show = show; el._hide = hide;
  }

  const onKey = e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key)) return;
    e.preventDefault();
    if (e.key === 'Escape') return el._hide();
    const last = points.length - 1;
    const i = e.key === 'Home' ? 0 : e.key === 'End' ? last
      : active < 0 ? last : Math.max(0, Math.min(last, active + (e.key === 'ArrowLeft' ? -1 : 1)));
    el._show(i);
  };
  el.addEventListener('keydown', onKey);
  el.addEventListener('blur', () => el._hide && el._hide());

  draw();
  const ro = new ResizeObserver(() => { const keep = active; draw(); if (keep >= 0) el._show(keep); });
  ro.observe(el);
  return () => { ro.disconnect(); el.removeEventListener('keydown', onKey); };
}

/**
 * @param {{label:string, value:number, display:string, sub?:string, media?:string, href?:string}[]} items
 */
export function barList(items) {
  const max = Math.max(1, ...items.map(i => i.value));
  return `<div class="bar-list">${items.map(i => `
    <div class="bar-row">
      <div class="name">${i.media || ''}<span>${i.href ? `<a href="${esc(i.href)}">${esc(i.label)}</a>` : esc(i.label)}</span></div>
      <div class="val"><b>${esc(i.display)}</b>${i.sub ? `<small>${esc(i.sub)}</small>` : ''}</div>
      <div class="bar-track" aria-hidden="true"><div class="bar-fill" style="width:${((i.value / max) * 100).toFixed(1)}%"></div></div>
    </div>`).join('')}</div>`;
}

/**
 * Vertical columns for an ordered axis (hours, weekdays). Each column is focusable and shows its value on hover/focus.
 * @param {{label:string, value:number, display:string, tick?:string}[]} items
 */
export function columnChart(items, { height = 180 } = {}) {
  const max = Math.max(1, ...items.map(i => i.value));
  return `<div class="cols" style="--h:${height}px" role="list">${items.map(i => `
    <div class="col" role="listitem" tabindex="0" aria-label="${esc(i.label)}: ${esc(i.display)}">
      <span class="col-tip">${esc(i.label)}<b>${esc(i.display)}</b></span>
      <span class="col-bar" style="height:${Math.max(i.value ? 2 : 0, (i.value / max) * 100).toFixed(1)}%"></span>
      <span class="col-tick">${esc(i.tick ?? '')}</span>
    </div>`).join('')}</div>`;
}

/** @param {{label:string, value:number, display:string, color:string}[]} parts */
export function splitBar(parts) {
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return `<div class="split-bar" role="img" aria-label="${esc(parts.map(p => `${p.label} ${Math.round(p.value / total * 100)}%`).join(', '))}">
      ${parts.filter(p => p.value > 0).map(p => `<span style="width:${(p.value / total * 100).toFixed(2)}%;background:${p.color}"></span>`).join('')}
    </div>
    <div class="legend">${parts.map(p => `
      <div class="legend-row"><span><i class="swatch" style="background:${p.color}"></i>${esc(p.label)}</span>
        <span class="num"><b>${esc(p.display)}</b> <span class="muted">· ${Math.round(p.value / total * 100)}%</span></span></div>`).join('')}
    </div>`;
}
