// Paridad visual con la app original: carga avatarSVG() del index.html original (solo lectura)
// y compara píxel por píxel con avatarGrid(). Se saltea si el repo original no está al lado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { avatarGrid, randomFace, resolveFace } from '../src/pmAvatar.js';

const ORIGINAL = fileURLToPath(new URL('../../repo/index.html', import.meta.url));
const has = existsSync(ORIGINAL);

function loadOriginal() {
  const html = readFileSync(ORIGINAL, 'utf8');
  const start = html.indexOf('function hashStr(');
  const end = html.indexOf('function playerAvatar(');
  assert.ok(start > 0 && end > start, 'no se encontró avatarSVG en el original');
  // eslint-disable-next-line no-new-func
  return new Function(`${html.slice(start, end)}; return avatarSVG;`)();
}

// Convierte el SVG de texto del original en una grilla [y][x] = color.
function parse(svg, W = 24, H = 32) {
  const grid = Array.from({ length: H }, () => Array(W).fill(null));
  for (const m of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="1" height="1" fill="(#[0-9a-f]{6})"\/>/g)) {
    grid[Number(m[2])][Number(m[1])] = m[3];
  }
  return grid;
}

let seed = 123;
const rnd = () => { // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

test('avatar idéntico al original: 300 caras al azar, cuerpo y carnet', { skip: !has && 'repo original no disponible' }, () => {
  const avatarSVG = loadOriginal();
  for (let i = 0; i < 300; i++) {
    const face = randomFace(rnd);
    for (const view of [undefined, 'bust']) {
      const expected = parse(avatarSVG(`id-${i}`, 40, face, view));
      assert.deepEqual(avatarGrid(`id-${i}`, face, view), expected, `cara ${i} (${view || 'cuerpo'})`);
    }
  }
});

test('avatar idéntico al original: cada opción de cada campo', { skip: !has && 'repo original no disponible' }, () => {
  const avatarSVG = loadOriginal();
  const LIM = { style: 7, eyes: 5, eyeSize: 6, facial: 5, hat: 4, glasses: 5, jersey: 6 };
  for (const [key, n] of Object.entries(LIM)) {
    for (let v = 0; v < n; v++) {
      const face = { ...randomFace(rnd), [key]: v };
      assert.deepEqual(avatarGrid('x', face), parse(avatarSVG('x', 40, face)), `${key}=${v}`);
    }
  }
});

test('jugadores sin cara (o con cara parcial y "beard" viejo) se ven igual que en el original', { skip: !has && 'repo original no disponible' }, () => {
  const avatarSVG = loadOriginal();
  for (const face of [null, {}, { beard: true }, { skin: 2 }, { shirt: 3 }, { style: 4, hair: 1 }]) {
    for (let i = 0; i < 40; i++) {
      assert.deepEqual(avatarGrid(`p${i}`, face), parse(avatarSVG(`p${i}`, 40, face)), JSON.stringify(face));
      // El editor parte de resolveFace: la cara "resuelta" dibuja exactamente lo mismo.
      assert.deepEqual(avatarGrid(`p${i}`, resolveFace(`p${i}`, face)), avatarGrid(`p${i}`, face));
    }
  }
});
