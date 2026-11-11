// Gráfico de líneas "Escabio por partido", con la misma geometría que la app original.
import { h } from '../dom.js';
import { escabioSeries, escabioSummary } from '../domain/domain.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, text) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text != null) e.textContent = text;
  return e;
};
const short = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const comma = (n) => n.toFixed(1).replace('.', ',');

export function escabioChart(matches) {
  const pts = escabioSeries(matches);
  if (pts.length < 2 || !pts.some((p) => p.value > 0)) {
    return h('p', { class: 'muted' }, 'Cargá el escabio de al menos 2 partidos para ver la evolución.');
  }
  const { total, avg } = escabioSummary(pts);
  const last = pts[pts.length - 1];

  const W = 320; const H = 160; const padL = 26; const padR = 10; const padT = 12; const padB = 24;
  const iw = W - padL - padR; const ih = H - padT - padB;
  const maxV = Math.max(1, ...pts.map((p) => p.value));
  const x = (i) => padL + (iw * i) / (pts.length - 1);
  const y = (v) => padT + ih - ih * (v / maxV);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${(padT + ih).toFixed(1)} L${x(0).toFixed(1)},${(padT + ih).toFixed(1)} Z`;

  const stepV = Math.max(1, Math.ceil(maxV / 5));
  const ticks = [];
  for (let v = 0; v < maxV; v += stepV) ticks.push(v);
  ticks.push(maxV);

  const svg = el('svg', {
    class: 'esc-chart', viewBox: `0 0 ${W} ${H}`, width: '100%', role: 'img',
    'aria-label': `Escabio por partido. Último partido: ${last.value}. Promedio: ${comma(avg)} por partido. Total: ${total}.`,
  });
  for (const v of ticks) {
    svg.append(
      el('line', { x1: padL, y1: y(v).toFixed(1), x2: W - padR, y2: y(v).toFixed(1), stroke: 'rgba(255,255,255,.14)', 'stroke-width': 1 }),
      el('text', { x: padL - 3, y: (y(v) + 3).toFixed(1), fill: '#c9b7ba', 'font-size': 8, 'text-anchor': 'end' }, String(v)));
  }
  // Línea del promedio, para comparar cada partido contra lo habitual
  svg.append(
    el('line', { x1: padL, y1: y(avg).toFixed(1), x2: W - padR, y2: y(avg).toFixed(1), stroke: '#9fd3ac', 'stroke-width': 1, 'stroke-dasharray': '4 3' }),
    el('path', { d: area, fill: 'rgba(242,183,5,.12)' }),
    el('path', { d: line, fill: 'none', stroke: '#f2b705', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  pts.forEach((p, i) => {
    const c = el('circle', { cx: x(i).toFixed(1), cy: y(p.value).toFixed(1), r: 3, fill: '#f2b705', stroke: '#7d2233', 'stroke-width': 1.5 });
    c.append(el('title', {}, `${short(p.date)}: ${p.value}`));
    svg.append(c);
  });
  const step = Math.ceil(pts.length / 6);
  pts.forEach((p, i) => {
    if (i % step === 0 || i === pts.length - 1) {
      svg.append(el('text', { x: x(i).toFixed(1), y: H - 7, fill: '#c9b7ba', 'font-size': 9, 'text-anchor': 'middle' }, short(p.date)));
    }
  });

  return h('div', {},
    h('div', { class: 'esc-stats' },
      h('div', { class: 'stat' }, h('b', {}, String(total)), h('span', {}, 'Total')),
      h('div', { class: 'stat' }, h('b', {}, comma(avg)), h('span', {}, 'Promedio por partido')),
      h('div', { class: 'stat' }, h('b', {}, String(last.value)), h('span', {}, 'Último partido'))),
    svg,
    h('p', { class: 'muted center' }, 'Cuánto se tomó en cada partido (total del equipo). La línea punteada es el promedio.'));
}
