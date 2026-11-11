// Escudo y canchita de fondo de la app original, armados con nodos SVG.
const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  el.append(...kids);
  return el;
};

const SHIELD = 'M12 4 H88 V58 C88 82 50 108 50 108 C50 108 12 82 12 58 Z';
let crestSeq = 0;

export function crestPM(height = 52) {
  const clipId = `pm-sh-${++crestSeq}`;
  return s('svg', {
    class: 'crest', viewBox: '0 0 100 112', width: Math.round((height * 100) / 112), height,
    role: 'img', 'aria-label': 'Escudo Piel Morena FC',
  },
  s('defs', {}, s('clipPath', { id: clipId }, s('path', { d: SHIELD }))),
  s('g', { 'clip-path': `url(#${clipId})` },
    s('rect', { x: 12, y: 4, width: 38, height: 104, fill: '#7d2233' }),
    s('rect', { x: 50, y: 4, width: 38, height: 104, fill: '#f2b705' })),
  s('g', { transform: 'rotate(-8 50 62)' },
    s('rect', { x: 18, y: 55, width: 14, height: 14, rx: 6, fill: '#8bc34a' }),
    s('rect', { x: 28, y: 54, width: 36, height: 16, rx: 5, fill: '#f3ead6' }),
    s('rect', { x: 63, y: 56, width: 17, height: 12, rx: 4, fill: '#6a2c91' })),
  s('rect', { x: 45, y: 60, width: 12, height: 38, rx: 5, fill: '#b5703c' }),
  s('circle', { cx: 51, cy: 60, r: 9, fill: '#b5703c' }),
  s('path', { d: SHIELD, fill: 'none', stroke: '#17110f', 'stroke-width': 5 }));
}

export function pitchBackground() {
  const lines = s('g', { fill: '#f3ead6', stroke: '#f3ead6', 'stroke-width': 4 },
    ...[[8, 8, 224, 4], [8, 348, 224, 4], [8, 8, 4, 344], [228, 8, 4, 344], [8, 178, 224, 4], [116, 176, 8, 8]]
      .map(([x, y, width, height]) => s('rect', { x, y, width, height, stroke: 'none' })),
    s('circle', { cx: 120, cy: 180, r: 42, fill: 'none' }),
    ...[[60, 8, 120, 58], [90, 8, 60, 24], [60, 294, 120, 58], [90, 328, 60, 24]]
      .map(([x, y, width, height]) => s('rect', { x, y, width, height, fill: 'none' })),
    ...['M8 8 h44 M8 8 v24', 'M232 8 h-44 M232 8 v24', 'M8 352 h44 M8 352 v-24', 'M232 352 h-44 M232 352 v-24']
      .map((d) => s('path', { d, fill: 'none' })));
  const svg = s('svg', { viewBox: '0 0 240 360', preserveAspectRatio: 'xMidYMid slice', 'shape-rendering': 'crispEdges' },
    s('rect', { width: 240, height: 360, fill: '#17622f' }),
    s('g', { fill: '#1d7a3c' }, ...[0, 60, 120, 180].map((x) => s('rect', { x, y: 0, width: 30, height: 360 }))),
    lines);
  const div = document.createElement('div');
  div.id = 'pitch-bg';
  div.setAttribute('aria-hidden', 'true');
  div.append(svg);
  return div;
}
