// Render the skyline model to an animated SVG string. Pure: same model + theme -> same bytes.

import { cuboid, heightFor, makeProjector } from './skyline-geometry.mjs';
import { caption, monthName } from './skyline-data.mjs';

export const WIDTH = 880;
const MARGIN = 20;
const LABEL_W = 34; // room for Mon/Wed/Fri left of each terrace
const TERRACE_GAP = 2.6; // world units between the two terraces (month labels live here)
const CAPTION_H = 40;
const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
const RISE = 2.6; // seconds, the whole rise wave
const BLOCK_RISE = 0.7; // seconds, one block

export const THEMES = {
  light: {
    ramp: ['#9be9a8', '#40c463', '#30a14e', '#216e39'], // 1 contribution -> the cap
    tile: '#e4e8ec',
    ground: '#f6f8fa',
    grid: '#d0d7de',
    label: '#57606a',
    text: '#24292f',
    shade: [0.16, 0.32],
  },
  dark: {
    ramp: ['#0e4429', '#006d32', '#26a641', '#39d353'], // GitHub dark-mode greens, 1 contribution -> the cap
    tile: '#1b2230',
    ground: '#111822',
    grid: '#232c3a',
    label: '#8b949e',
    text: '#c9d1d9',
    shade: [0.24, 0.44],
  },
};

const r1 = (n) => {
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? '0' : String(v);
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
function mix(a, b, t) {
  const to = hexToRgb(b);
  return rgbToHex(hexToRgb(a).map((v, i) => v + (to[i] - v) * t));
}

/** Ramp color at t in [0, 1], linear between stops. */
export function rampColor(ramp, t) {
  const p = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(p));
  return mix(ramp[i], ramp[i + 1], p - i);
}

/** Green only: zero days are neutral tiles, active days follow the ramp by sqrt-scaled count. */
function topColor(day, theme, t) {
  return day.count === 0 ? theme.tile : rampColor(theme.ramp, t);
}

/** Lay out every day in world space: two terraces, older half at the back. */
export function layout(model) {
  const perRow = Math.ceil(model.weeks.length / 2);
  const cells = [];
  model.weeks.forEach((week, i) => {
    const row = i < perRow ? 0 : 1;
    const col = i - row * perRow;
    for (const day of week) cells.push({ day, week: i, x: col, y: day.weekday + row * (7 + TERRACE_GAP), row, col });
  });
  return { perRow, cells, rows: [0, 1].map((row) => ({ row, y0: row * (7 + TERRACE_GAP) })) };
}

function months(model, perRow) {
  const out = [];
  let prev = null;
  model.weeks.forEach((week, i) => {
    const m = monthName(week[0].date);
    const startsMonth = week.some((d) => d.date.endsWith('-01'));
    const row = i < perRow ? 0 : 1;
    const col = i - row * perRow;
    if ((col === 0 && m !== prev) || startsMonth) {
      const first = week.find((d) => d.date.endsWith('-01')) ?? week[0];
      out.push({ row, col, label: monthName(first.date) });
    }
    prev = monthName(week.at(-1).date);
  });
  // Drop a label that would collide with the next one on the same terrace.
  return out.filter((m, i) => !(out[i + 1] && out[i + 1].row === m.row && out[i + 1].col - m.col < 2));
}

/** Native hover text for one block: "414 contributions · Sep 29, 2026", "No contributions · Jan 3, 2026". */
export function tooltip(day) {
  const date = `${monthName(day.date)} ${Number(day.date.slice(8))}, ${day.date.slice(0, 4)}`;
  const n = day.count === 0 ? 'No contributions' : `${day.count.toLocaleString('en-US')} contribution${day.count === 1 ? '' : 's'}`;
  return `${n} · ${date}`;
}

export function renderSkyline(model, themeName) {
  const theme = THEMES[themeName];
  if (!theme) throw new Error(`unknown theme ${themeName}`);
  const { perRow, cells, rows } = layout(model);
  const depth = 7 + TERRACE_GAP + 7;

  // Fit the scene to the width: measure at scale 1, then scale.
  const unit = makeProjector(1);
  const corners = [];
  for (const x of [0, perRow]) for (const y of [0, depth + 0.8]) corners.push(unit([x, y, 0]));
  for (const c of cells) corners.push(unit([c.x + 0.5, c.y + 0.5, heightFor(c.day.count, model.cap).h + 0.9]));
  const minX = Math.min(...corners.map((p) => p[0]));
  const maxX = Math.max(...corners.map((p) => p[0]));
  const minY = Math.min(...corners.map((p) => p[1]));
  const maxY = Math.max(...corners.map((p) => p[1]));
  const s = (WIDTH - 2 * MARGIN - LABEL_W) / (maxX - minX);
  const ox = MARGIN + LABEL_W - minX * s;
  const oy = MARGIN - minY * s;
  const height = Math.round(MARGIN + (maxY - minY) * s + CAPTION_H);
  const raw = makeProjector(s);
  const P = (pt) => {
    const [x, y] = raw(pt);
    return [x + ox, y + oy];
  };
  const pathOf = (pts, rel = [0, 0]) =>
    `M${pts.map((p) => P(p)).map(([x, y]) => `${r1(x - rel[0])} ${r1(y - rel[1])}`).join('L')}Z`;
  const [shFront, shSide] = theme.shade;

  // Ground: one slab and one grid path per terrace.
  const ground = [];
  const grid = [];
  for (const { y0 } of rows) {
    ground.push(pathOf([[0, y0, 0], [perRow, y0, 0], [perRow, y0 + 7, 0], [0, y0 + 7, 0]]));
    for (let x = 0; x <= perRow; x++) grid.push(`M${P([x, y0, 0]).map(r1).join(' ')}L${P([x, y0 + 7, 0]).map(r1).join(' ')}`);
    for (let y = 0; y <= 7; y++) grid.push(`M${P([0, y0 + y, 0]).map(r1).join(' ')}L${P([perRow, y0 + y, 0]).map(r1).join(' ')}`);
  }

  // Blocks, back to front: y-major then x (valid because yaw < 45 degrees).
  const order = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
  const n = model.weeks.length;
  const blocks = [];
  for (const c of order) {
    const { h, t, zero } = heightFor(c.day.count, model.cap);
    const f = cuboid(c.x, c.y, h);
    const color = topColor(c.day, theme, t);
    const piv = P(f.pivot);
    const rel = (pts) => pathOf(pts, piv);
    const faces = [
      `<path fill="${mix(color, '#000000', shSide)}" d="${rel(f.side)}"/>`,
      `<path fill="${mix(color, '#000000', shFront)}" d="${rel(f.front)}"/>`,
      `<path fill="${color}" d="${rel(f.top)}"/>`,
    ];
    const isPeak = model.peak && c.day.date === model.peak.date;
    if (isPeak) {
      // Sheen: a light band that sweeps across the top and front faces, clipped to them.
      const clip = `M${rel(f.top).slice(1, -1)}ZM${rel(f.front).slice(1, -1)}Z`;
      const w = 6;
      faces.push(
        `<clipPath id="pk"><path d="${clip}"/></clipPath>` +
          `<g clip-path="url(#pk)" class="sh"><path fill="#ffffff" opacity=".55" transform="translate(-40 0)" d="M0 ${r1(-h * s - 20)}l${w} 0l-${w * 3} ${r1(h * s + 40)}l-${w} 0Z">` +
          `<animateTransform attributeName="transform" type="translate" values="-40 0;-40 0;60 0;60 0" keyTimes="0;.62;.82;1" dur="5s" begin="${RISE}s" repeatCount="indefinite"/></path></g>`,
      );
    }
    const [px, py] = piv.map(r1);
    const tip = `<title>${tooltip(c.day)}</title>`;
    if (zero) {
      blocks.push(`<g transform="translate(${px} ${py})">${tip}${faces.join('')}</g>`);
      continue;
    }
    // Rise: scale Y from 0 at the ground corner. Static (no SMIL) = fully risen.
    const delay = 0.1 + 1.55 * (c.week / Math.max(1, n - 1)) + 0.03 * c.day.weekday;
    const a = (delay / RISE).toFixed(3);
    const b = (Math.min(RISE, delay + BLOCK_RISE) / RISE).toFixed(3);
    blocks.push(
      `<g transform="translate(${px} ${py})">${tip}<g class="r">` +
        `<animateTransform attributeName="transform" type="scale" values="1 0;1 0;1 1;1 1" keyTimes="0;${a};${b};1" calcMode="spline" keySplines="0 0 1 1;.2 .8 .3 1;0 0 1 1" dur="${RISE}s" fill="freeze"/>` +
        `${faces.join('')}</g></g>`,
    );
  }

  // Labels: Mon/Wed/Fri left of each terrace, month ticks along each terrace's front edge.
  const labels = [];
  for (const { y0 } of rows) {
    for (const [d, name] of [[1, 'Mon'], [3, 'Wed'], [5, 'Fri']]) {
      const [x, y] = P([-0.3, y0 + d + 0.5, 0]);
      labels.push(`<text x="${r1(x)}" y="${r1(y + 4)}" text-anchor="end">${name}</text>`);
    }
  }
  for (const m of months(model, perRow)) {
    const [x, y] = P([m.col + 0.1, rows[m.row].y0 + 7.35, 0]);
    labels.push(`<text x="${r1(x)}" y="${r1(y + 10)}">${m.label}</text>`);
  }

  const cx = r1(WIDTH / 2);
  const cy = r1(height / 2);
  const title = `${model.name}'s GitHub contributions as a 3D skyline: ${caption(model)}`;
  const desc =
    `One block per day, ${model.dayCount} days in two rows of weeks, older weeks at the back. ` +
    `Height uses a square-root scale. Days above ${model.cap} contributions are drawn at the cap height` +
    (model.peak ? `; the busiest day, ${model.peak.date}, had ${model.peak.count}.` : '.');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="sky-title sky-desc">
<title id="sky-title">${esc(title)}</title>
<desc id="sky-desc">${esc(desc)}</desc>
<style>
text{font-family:${FONT};font-size:12px;fill:${theme.label}}
.cap{font-size:15px;font-weight:600;fill:${theme.text}}
.sig{font-size:11px}
@media (prefers-reduced-motion: reduce){.r,.cam{transform:none!important}.sh{display:none}}
</style>
<g transform="translate(${cx} ${cy})"><g class="cam">
<animateTransform attributeName="transform" type="skewX" values="0;1.4;0;-1.4;0" keyTimes="0;.25;.5;.75;1" dur="12s" begin="${RISE}s" repeatCount="indefinite"/>
<animateTransform attributeName="transform" type="scale" values="1 1;1 .975;1 1;1 1.015;1 1" keyTimes="0;.25;.5;.75;1" dur="12s" begin="${RISE}s" repeatCount="indefinite" additive="sum"/>
<g transform="translate(-${cx} -${cy})">
<g fill="${theme.ground}">${ground.map((d) => `<path d="${d}"/>`).join('')}</g>
<path fill="none" stroke="${theme.grid}" stroke-width=".6" d="${grid.join('')}"/>
${blocks.join('\n')}
${labels.join('')}
</g></g></g>
<text x="${MARGIN}" y="${height - 14}" class="cap">${esc(caption(model))}</text>
<text x="${WIDTH - MARGIN}" y="${height - 14}" text-anchor="end" class="sig">Vitalini</text>
</svg>
`;
}
