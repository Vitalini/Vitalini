// Render the Year Walk landscape to an animated SVG string. Pure: same model + theme + bucket -> same bytes.
//
// Timing: the terrain rises first (RISE s). From WALK_BEGIN on, the walker and every challenge share
// one loop of `route.loop` seconds (`dur` = loop, `repeatCount="indefinite"`); WHEN something happens
// inside the loop is encoded in keyTimes, so a challenge's action and the walker's pause line up.

import { caption, monthName, tooltip } from './calendar.mjs';
import {
  BASE, HEIGHT, H_MAX, WIDTH, X0, bucketSeason, layoutTerrain, placeChallenges, poseOf, walkerRoute,
} from './yearwalk-terrain.mjs';

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif`;
export const RISE = 2.4; // seconds, the terrain rise wave
export const WALK_BEGIN = 3; // seconds, the walker loop starts after the rise
export const STEP_DUR = 1.2; // seconds, one walk cycle: two frames of 0.6 s
const K = 1.3; // sprite scale: walker ~18 px tall
export const CLIMB_DUR = 1; // seconds, one climb cycle: two frames of 0.5 s

export const THEMES = {
  light: {
    ramp: ['#9be9a8', '#40c463', '#30a14e', '#216e39'],
    bg: '#ffffff', sky0: '#d4eafb', sky1: '#ffffff', grass: '#40c463', soil: '#d8b994',
    tick: '#d0d7de', label: '#57606a', text: '#1f2328', pole: '#57606a', flag: '#cf222e', snow: '#ffffff', snowSh: '#dbe7f0',
    shirt: '#0969da', pants: '#24292f', hair: '#4a3428', skin: '#e8b07d',
    gear: '#8c6d4f', water: '#8cc8ec', rock: '#8c959f', rockSh: '#6e7781', cat: '#f0a35e', catSh: '#c97a3a', bird: '#3d6fb6', cloud: '#ffffff', tool: '#57606a',
  },
  dark: {
    ramp: ['#0e4429', '#006d32', '#26a641', '#39d353'],
    bg: '#0d1117', sky0: '#0d1117', sky1: '#132a45', grass: '#26a641', soil: '#3a2c20',
    tick: '#30363d', label: '#8b949e', text: '#e6edf3', pole: '#c9d1d9', flag: '#f85149', snow: '#e6edf3', snowSh: '#aab6c2',
    shirt: '#58a6ff', pants: '#8b949e', hair: '#d29922', skin: '#f1c27d',
    gear: '#8b949e', water: '#3a6d96', rock: '#6e7681', rockSh: '#484f58', cat: '#d18b4e', catSh: '#9c6331', bird: '#79c0ff', cloud: '#ffffff', tool: '#c9d1d9',
  },
};

const n = (v) => {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
};
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
export function mix(a, b, t) {
  const to = hexToRgb(b);
  return rgbToHex(hexToRgb(a).map((v, i) => v + (to[i] - v) * t));
}

/** Ramp color at t in [0, 1], linear between stops. */
export function rampColor(ramp, t) {
  const p = Math.min(1, Math.max(0, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(p));
  return mix(ramp[i], ramp[i + 1], p - i);
}

/**
 * One loop-synced animation. `frames` = [[seconds into the loop, value], ...] in time order. The value
 * before the first frame is the first value, after the last frame the last value; keyTimes start at 0
 * and end at 1.
 */
function timed(loop, frames, { attr = 'transform', type, calc } = {}) {
  const pts = frames.map(([t, v]) => [Math.min(1, Math.max(0, t / loop)), v]);
  if (pts[0][0] > 0) pts.unshift([0, pts[0][1]]);
  if (pts.at(-1)[0] < 1) pts.push([1, pts.at(-1)[1]]);
  const kt = [];
  for (const [t] of pts) kt.push(Math.max(kt.at(-1) ?? 0, Number(t.toFixed(4))));
  kt[kt.length - 1] = 1;
  const head = type ? `<animateTransform attributeName="transform" type="${type}"` : `<animate attributeName="${attr}"`;
  return `${head} values="${pts.map(([, v]) => v).join(';')}" keyTimes="${kt.join(';')}"${calc ? ` calcMode="${calc}"` : ''} dur="${n(loop)}s" begin="${WALK_BEGIN}s" repeatCount="indefinite"/>`;
}

// ---------- the walker: feet at (0, 0), facing right, drawn 14 px tall and scaled by K ----------

function walkerPoses(C) {
  const limb = (pts, color, w = 1.3) => `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const upper = (dy = 0) =>
    `<g transform="translate(0 ${dy})"><rect x="-1.7" y="-9.2" width="3.4" height="5.2" rx="1.2" fill="${C.shirt}"/>` +
    `<circle cx="0" cy="-11.6" r="2.3" fill="${C.skin}"/><path d="M-2.3 -11.8a2.3 2.3 0 0 1 4.6 0z" fill="${C.hair}"/></g>`;
  const legs = (a, b) => limb(a, C.pants) + limb(b, C.pants);
  const arm = (pts) => limb(pts, C.skin, 1);
  const swing = (vals, cx, cy, dur) => `<animateTransform attributeName="transform" type="rotate" values="${vals.map((v) => `${v} ${cx} ${cy}`).join(';')}" keyTimes="${vals.map((_, i) => n(i / (vals.length - 1))).join(';')}" dur="${dur}s" repeatCount="indefinite"/>`;
  const stand = legs([[-0.6, -4.2], [-1.4, 0]], [[0.6, -4.2], [1.4, 0]]);
  return {
    walkA: legs([[-0.6, -4.2], [-2, 0]], [[0.6, -4.2], [1.8, 0]]) + upper() + arm([[0.3, -8.4], [1.9, -5.6]]),
    walkB: legs([[-0.4, -4.2], [-0.5, 0]], [[0.4, -4.2], [0.7, 0]]) + upper() + arm([[0, -8.4], [0.2, -5]]),
    // Climbing: hands on the rope or rungs above the head, knees alternating.
    climbA: legs([[-0.6, -4.2], [0.6, -2.6], [0.2, 0]], [[0.6, -4.2], [0.8, -1.2], [0.6, 0.6]]) + upper() + arm([[-0.6, -8.6], [-0.2, -13.8]]) + arm([[0.6, -8.6], [0.4, -11.6]]),
    climbB: legs([[-0.6, -4.2], [-0.8, -1.2], [-0.4, 0.6]], [[0.6, -4.2], [1.4, -2.6], [0.8, 0]]) + upper() + arm([[-0.6, -8.6], [-0.4, -11.6]]) + arm([[0.6, -8.6], [0.2, -13.8]]),
    saw:
      legs([[-0.6, -4.2], [-1.6, 0]], [[0.6, -4.2], [1.6, 0]]) + upper() + arm([[0.6, -7.8], [3.6, -6.4]]) +
      `<g><animateTransform attributeName="transform" type="translate" values="0 0;-1.6 0.3;0 0" keyTimes="0;.5;1" dur=".4s" repeatCount="indefinite"/>` +
      `<path d="M3.2 -7.2h1.2v1.6h-1.2z" fill="${C.gear}"/><path d="M4.4 -7l4.6 1.1v0.9l-4.6 -0.4z" fill="${C.tool}"/></g>`,
    push: `<g transform="rotate(16)">${legs([[-0.6, -4.2], [-2.6, 0]], [[0.6, -4.2], [-0.4, 0]])}${upper()}${arm([[0.6, -8], [4, -8]])}${arm([[0.2, -7.6], [3.8, -7]])}</g>`,
    sit: limb([[-0.5, -1.6], [3, -1.6], [3.4, 0]], C.pants) + upper(3) + arm([[0.8, -5], [3, -4]]),
    shovel:
      stand + upper() +
      `<g>${swing([0, -14, 0], 0, -6, 0.5)}${arm([[0.6, -7.8], [3, -5]])}<path d="M-0.4 -9L5 -1.4" stroke="${C.gear}" stroke-width=".8" stroke-linecap="round"/><path d="M4.2 -2.2l2.4 1.4l-1 1.6l-2.4 -1.4z" fill="${C.tool}"/></g>`,
    // Mid-air over a puddle or a fence: the figure is drawn 3 px up, knees tucked.
    jump: `<g transform="translate(0 -3)">${legs([[-0.6, -4.2], [-1.8, -2.6], [-0.6, -1.2]], [[0.6, -4.2], [1.8, -3], [2.6, -1.6]])}${upper()}${arm([[0.3, -8.4], [2.4, -10.6]])}</g>`,
    // Walking along a log: drawn 2.4 px up, arms out.
    balance: `<g transform="translate(0 -2.4)">${legs([[-0.6, -4.2], [-1.2, 0]], [[0.6, -4.2], [1, 0]])}${upper()}${arm([[-0.4, -8], [-4, -8.8]])}${arm([[0.4, -8], [4, -8.8]])}</g>`,
    chop: stand + upper() + `<g>${swing([-40, 30, -40], 0.5, -8, 0.5)}${arm([[0.5, -8], [2.4, -10.6]])}<path d="M2.4 -10.6L4.4 -6.8" stroke="${C.gear}" stroke-width=".8" stroke-linecap="round"/><path d="M3.6 -8.4l1.8 -1l.8 1.6l-1.8 .6z" fill="${C.tool}"/></g>`,
    swat: stand + upper() + `<g>${swing([-30, 30, -30], 0.5, -8.4, 0.3)}${arm([[0.5, -8.4], [2.8, -12]])}</g>`,
    crouch: legs([[-0.4, -1.4], [1.6, -2.4], [1.4, 0]], [[0.4, -1.4], [-1.4, -2.2], [-1.8, 0]]) + upper(3) + arm([[0.6, -5], [3.4, -1.6]]),
    wave: stand + upper() + arm([[-0.3, -8.4], [-1, -5]]) + `<g>${swing([-25, 15, -25], 0.8, -8.6, 0.5)}${arm([[0.8, -8.6], [3.2, -12.4]])}</g>`,
    kick: legs([[-0.6, -4.2], [-1, 0]], [[0.6, -4.2], [3.6, -3]]) + upper() + arm([[0, -8.4], [-1.8, -6]]),
    slip: `<g transform="rotate(-22)">${legs([[-0.6, -4.2], [1.4, 0]], [[0.6, -4.2], [3, -0.6]])}${upper()}${arm([[-0.6, -8.4], [-3, -11]])}${arm([[0.6, -8.4], [3, -11.4]])}</g>`,
    shake: `<g><animateTransform attributeName="transform" type="translate" values="-0.5 0;0.5 0;-0.5 0" keyTimes="0;.5;1" dur=".2s" repeatCount="indefinite"/>${stand}${upper()}${arm([[-0.4, -8.4], [-2.6, -6.6]])}${arm([[0.4, -8.4], [2.6, -6.6]])}</g>`,
    drink: stand + upper() + arm([[0.6, -8.2], [2, -10.4]]) + `<path d="M1.4 -13.4l1.6 -.6l.9 2.4l-1.6 .6z" fill="${C.tool}"/>`,
    look: stand + upper() + arm([[0.6, -8.2], [2.2, -11.2]]) + `<rect x="1.8" y="-12.6" width="2.4" height="1.6" rx=".5" fill="${C.pants}"/>`,
  };
}

// ---------- challenge sprites: origin at the anchor on the plateau top ----------

const CANOPY = {
  winter: ['#2f7d4f', '#1f6040'],
  spring: ['#f4a6c1', '#e07fa3'],
  summer: ['#2da44e', '#1a7f37'],
  autumn: ['#e08a2e', '#bc4c00'],
};

function treeShape(C, s, scale = 1) {
  const [a, b] = CANOPY[s];
  const k = (v) => n(v * scale);
  if (s === 'winter') {
    return `<rect x="${k(-0.6)}" y="${k(-2)}" width="${k(1.2)}" height="${k(2)}" fill="#7a5230"/>` +
      `<path d="M0 ${k(-11)}L${k(4)} ${k(-2)}H${k(-4)}Z" fill="${a}"/><path d="M0 ${k(-11)}L${k(4)} ${k(-2)}H0Z" fill="${b}"/>` +
      `<path d="M0 ${k(-11)}L${k(1.6)} ${k(-7.4)}H${k(-1.6)}Z" fill="${C.snow}"/>`;
  }
  return `<rect x="${k(-0.7)}" y="${k(-4)}" width="${k(1.4)}" height="${k(4)}" rx=".3" fill="#7a5230"/>` +
    `<circle cx="0" cy="${k(-7.2)}" r="${k(3.6)}" fill="${a}"/><path d="M0 ${k(-10.8)}a${k(3.6)} ${k(3.6)} 0 0 1 0 ${k(7.2)}z" fill="${b}"/>`;
}

/** Small burst of particles from (x, y) during [t, t + 0.6]; hidden otherwise. */
function burst(T, x, y, color, t, dirs) {
  return dirs
    .map(([dx, dy], k) => `<circle cx="${x}" cy="${y}" r=".8" fill="${color}" opacity="0">` +
      T([[t + k * 0.05, '0 0'], [t + 0.6, `${dx} ${dy}`]], { type: 'translate' }) +
      T([[t - 0.01, 0], [t, 1], [t + 0.6, 1], [t + 0.61, 0]], { attr: 'opacity', calc: 'discrete' }) + `</circle>`)
    .join('');
}

function challengeSvg(C, c, ctx) {
  const { loop, terrain, model } = ctx;
  const b = terrain.buckets[c.bucket];
  const next = terrain.buckets[c.bucket + 1];
  const T = (frames, o) => timed(loop, frames, o);
  const pos = `transform="translate(${c.x} ${c.y})"`;
  const g = (body) => `<g ${pos}>${body}</g>`;
  const fx = (body) => `<g class="fx">${body}</g>`;
  switch (c.type) {
    case 'tree': {
      // Sawn during the pause, tips over to the right, drops off the edge and fades; the stump stays.
      const drop = Math.max(12, b.h - (next?.h ?? 0) + 6);
      return g(`<rect x="-1.1" y="-1.6" width="2.2" height="1.6" rx=".3" fill="#5c3d24"/>` +
        `<g class="act">${T([[c.t1 + 0.4, '0 0'], [c.t1 + 1.1, `3 ${drop}`]], { type: 'translate' })}${T([[c.t1 + 0.6, 1], [c.t1 + 1.1, 0]], { attr: 'opacity' })}` +
        `<g class="act">${T([[c.t1 - 0.3, '0 0.9 0'], [c.t1 + 0.4, '90 0.9 0']], { type: 'rotate' })}${treeShape(C, bucketSeason(model, b), K)}</g></g>`);
    }
    case 'boulder': {
      // Pushed during the pause: rolls to the edge, falls to the next (lower) plateau, bounces, fades.
      const R = 4.4;
      const edge = n(b.x1 - c.x + 2);
      const drop = b.h - next.h;
      const a = c.t0 + 0.6;
      const roll = (dx) => n((dx / R) * (180 / Math.PI));
      return g(`<g class="act">` +
        T([[a, '0 0'], [c.t1, `${edge} 0`], [c.t1 + 0.35, `${n(edge + 3)} ${drop}`], [c.t1 + 0.55, `${n(edge + 5)} ${drop - 3}`], [c.t1 + 0.75, `${n(edge + 7)} ${drop}`]], { type: 'translate' }) +
        T([[c.t1 + 0.6, 1], [c.t1 + 1.1, 0]], { attr: 'opacity' }) +
        `<g transform="translate(0 -${R})"><g class="act">${T([[a, '0'], [c.t1 + 0.75, String(roll(edge + 7))]], { type: 'rotate' })}` +
        `<circle r="${R}" fill="${C.rock}"/><path d="M0 -${R}a${R} ${R} 0 0 1 0 ${2 * R}z" fill="${C.rockSh}"/><circle cx="-1.5" cy="-1.5" r="1" fill="#ffffff" opacity=".35"/></g></g></g>`);
    }
    case 'drift':
      // Shovelled during the pause: the drift shrinks, scoops of snow fly off to the right.
      return g(`<g class="act">${T([[c.t0 + 0.3, '1 1'], [c.t1, '1 0.15']], { type: 'scale' })}` +
        `<g transform="scale(${K})"><path d="M-4.5 0Q-3.5 -3.8 0 -3.9Q3.4 -3.8 4.8 0Z" fill="${C.snow}"/><path d="M0 -3.9Q3.4 -3.8 4.8 0H0Z" fill="${C.snowSh}"/></g></g>` +
        fx(burst(T, -1, -3, C.snow, c.t0 + 0.4, [[8, -8], [11, -4]]) + burst(T, -1, -3, C.snow, c.t0 + 1.1, [[9, -9], [12, -3]])));
    case 'campfire': {
      // He sits by the fire during the pause; the flag goes up at the left end of the plateau as he gets up.
      const fx0 = n(b.flat0 + 1 - c.x);
      return g(`<g transform="scale(${K})"><path d="M-2.8 -0.4L2.8 -1.6M-2.8 -1.6L2.8 -0.4" stroke="#7a5230" stroke-width="1.1" stroke-linecap="round"/>` +
        `<g class="act"><animateTransform attributeName="transform" type="scale" values="1 1;0.9 1.12;1.05 0.94;1 1" keyTimes="0;.33;.66;1" dur=".7s" repeatCount="indefinite"/>` +
        `<path d="M0 -6.2C1.8 -4 2.4 -2.6 1.4 -1.2H-1.4C-2.4 -2.6 -1.6 -4 0 -6.2Z" fill="#f0883e"/><path d="M0 -4.2C0.9 -3 1.1 -2.2 0.6 -1.3H-0.6C-1.1 -2.2 -0.8 -3 0 -4.2Z" fill="#ffd33d"/></g></g>` +
        `<g class="flg" opacity="0" transform="translate(${fx0} 0)">${T([[c.t1 - 0.4, 0], [c.t1 - 0.39, 1]], { attr: 'opacity', calc: 'discrete' })}` +
        `<g>${T([[c.t1 - 0.4, '1 0'], [c.t1 + 0.1, '1 1']], { type: 'scale' })}` +
        `<path d="M0 0V-19" stroke="${C.pole}" stroke-width="1"/><path d="M0.5 -19h7v4.6h-7z" fill="${C.flag}"/></g></g>`);
    }
    case 'puddle':
      return g(`<ellipse cx="0" cy="-0.5" rx="4.4" ry="1" fill="${C.water}"/><ellipse cx="-1.2" cy="-0.7" rx="1.4" ry=".3" fill="#ffffff" opacity=".5"/>`);
    case 'fence':
      return g(`<path d="M-2.4 0V-4.6M2.4 0V-4.6M-3.2 -3.6H3.2M-3.2 -1.8H3.2" stroke="${C.gear}" stroke-width=".9" stroke-linecap="round"/>`);
    case 'log':
      return g(`<rect x="-5" y="-2.4" width="10" height="2.4" rx="1.2" fill="#8a5a33"/><ellipse cx="4" cy="-1.2" rx=".9" ry="1.1" fill="#c9915c"/>`);
    case 'bush':
      // Chopped: shrinks to a stub, leaves fly.
      return g(`<g class="act">${T([[c.t0 + 0.5, '1 1'], [c.t1, '1 0.3']], { type: 'scale' })}` +
        `<circle cx="-1.2" cy="-2.6" r="2.6" fill="#2da44e"/><circle cx="1.6" cy="-2.3" r="2.3" fill="#1a7f37"/></g>` +
        fx(burst(T, 0, -3, '#2da44e', c.t0 + 0.5, [[6, -6], [3, -9], [8, -2]])));
    case 'bee':
      // Buzzes at head height; swatted, it flies off.
      return g(`<g class="act">${T([[c.t1 - 0.2, '0 0'], [c.t1 + 0.4, '14 -16']], { type: 'translate' })}${T([[c.t1, 1], [c.t1 + 0.4, 0]], { attr: 'opacity' })}` +
        `<g transform="translate(0 -14)"><g class="act"><animateTransform attributeName="transform" type="translate" values="0 0;.8 -.8;-.6 .4;0 0" keyTimes="0;.33;.66;1" dur=".5s" repeatCount="indefinite"/>` +
        `<ellipse rx="1.5" ry="1" fill="#e3b341"/><path d="M-0.3 -1V1" stroke="#24292f" stroke-width=".5"/><ellipse cx="-0.2" cy="-1.3" rx=".9" ry=".6" fill="#ffffff" opacity=".8"/></g></g></g>`);
    case 'mushroom':
      // Picked (gone) half-way through, then eaten.
      return g(`<g opacity="1">${T([[c.t0 + 0.45, 1], [c.t0 + 0.46, 0]], { attr: 'opacity', calc: 'discrete' })}` +
        `<rect x="-0.5" y="-2.2" width="1" height="2.2" fill="#f6f1e7"/><path d="M-2.4 -2A2.4 2.4 0 0 1 2.4 -2Z" fill="#cf222e"/><circle cx="-0.8" cy="-3" r=".4" fill="#ffffff"/><circle cx="0.9" cy="-3.3" r=".35" fill="#ffffff"/></g>`);
    case 'cat':
      // Sitting cat; a heart pops up when he pets it.
      return g(`<path d="M-2 -0.6q-2 0 -1.6 -2.4" fill="none" stroke="${C.catSh}" stroke-width=".9" stroke-linecap="round"/>` +
        `<ellipse cx="0" cy="-2" rx="2.2" ry="2" fill="${C.cat}"/><circle cx="0.6" cy="-4.8" r="1.5" fill="${C.cat}"/><path d="M-0.4 -5.8l.2 -1.4l.9 .8zM1.2 -6.2l.7 -1.1l.4 1.3z" fill="${C.cat}"/>` +
        fx(`<path d="M0 -8.6c-.6 -.8 -1.8 -.2 -1 .7l1 .9l1 -.9c.8 -.9 -.4 -1.5 -1 -.7z" fill="${C.flag}" opacity="0">` +
          `${T([[c.t0 + 0.5, '0 0'], [c.t1 + 0.3, '0 -4']], { type: 'translate' })}${T([[c.t0 + 0.49, 0], [c.t0 + 0.5, 1], [c.t1 + 0.3, 1], [c.t1 + 0.31, 0]], { attr: 'opacity', calc: 'discrete' })}</path>`));
    case 'bird':
      // Sits on the plateau; he waves, it flies off.
      return g(`<g class="act">${T([[c.t0 + 0.4, '0 0'], [c.t1 + 0.4, '16 -24']], { type: 'translate' })}${T([[c.t1, 1], [c.t1 + 0.4, 0]], { attr: 'opacity' })}` +
        `<ellipse cx="0" cy="-1.6" rx="2" ry="1.4" fill="${C.bird}"/><circle cx="1.6" cy="-2.8" r="1" fill="${C.bird}"/><path d="M2.5 -2.9l1.1 .3l-1.1 .3z" fill="#f0883e"/>` +
        `<path d="M-0.6 -2l-2 -1.6l2.8 .4z" fill="${mix(C.bird, '#000000', 0.25)}"/></g>`);
    case 'rock':
      // Pushed 2.5 px along the plateau.
      return g(`<g class="act">${T([[c.t0 + 0.3, '0 0'], [c.t1, '2.5 0']], { type: 'translate' })}` +
        `<circle cx="0" cy="-2.6" r="2.6" fill="${C.rock}"/><path d="M0 -5.2a2.6 2.6 0 0 1 0 5.2z" fill="${C.rockSh}"/></g>`);
    case 'pinecone': {
      // Kicked off the edge: flies right, drops to the next plateau, fades.
      const edge = n(b.x1 - c.x + 3);
      const drop = Math.max(6, b.h - (next?.h ?? 0));
      return g(`<g class="act">${T([[c.t0 + 0.4, '0 0'], [c.t1, `${edge} -4`], [c.t1 + 0.5, `${n(edge + 3)} ${drop}`]], { type: 'translate' })}${T([[c.t1 + 0.3, 1], [c.t1 + 0.6, 0]], { attr: 'opacity' })}` +
        `<ellipse cx="0" cy="-1.6" rx="1.2" ry="1.6" fill="#8a5a33"/><path d="M-1 -2.2h2M-1 -1h2" stroke="#5c3d24" stroke-width=".4"/></g>`);
    }
    case 'ice':
      return g(`<ellipse cx="0" cy="-0.3" rx="5" ry=".8" fill="#bfe3f5"/><path d="M-2.6 -0.5h1.6" stroke="#ffffff" stroke-width=".4"/>`);
    case 'shake':
      // Snow flies off him.
      return g(fx(burst(T, 0, -16, C.snow, c.t0 + 0.2, [[-5, -3], [5, -3], [-4, 3], [4, 3]])));
    default:
      // flask, binoculars: the prop is in his hands (see the pose).
      return '';
  }
}

/** Everything the renderer and the tests need, without SVG. */
export function scene(model, bucket = 'week') {
  const terrain = layoutTerrain(model, bucket);
  const challenges = placeChallenges(model, terrain);
  const route = walkerRoute(model, terrain, challenges);
  const peakIndex = terrain.buckets.reduce((a, b, i, all) => (b.sum > all[a].sum ? i : a), 0);
  return { terrain, challenges, route, peakIndex };
}

function prng(seed) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function renderYearWalk(model, themeName, bucket = 'week') {
  const C = THEMES[themeName];
  if (!C) throw new Error(`unknown theme ${themeName}`);
  const dark = themeName === 'dark';
  const { terrain, challenges, route, peakIndex } = scene(model, bucket);
  const { buckets, transitions, xOf } = terrain;
  const { segs, loop } = route;
  const days = model.weeks.flat();
  const right = buckets.at(-1).x1;
  const ctx = { loop, terrain, model };

  // Month spans in pixels, for labels, ticks and the seasonal sky props.
  const months = [];
  days.forEach((d, i) => {
    const m = d.date.slice(0, 7);
    if (months.at(-1)?.m === m) months.at(-1).end = i + 1;
    else months.push({ m, date: d.date, start: i, end: i + 1 });
  });
  for (const m of months) {
    m.x0 = xOf(m.start);
    m.x1 = xOf(m.end);
    const mo = Number(m.date.slice(5, 7));
    m.season = mo === 12 || mo <= 2 ? 'winter' : mo <= 5 ? 'spring' : mo <= 8 ? 'summer' : 'autumn';
  }
  const inSeason = (s) => months.filter((m) => m.season === s);

  const poses = walkerPoses(C);
  const defs = [
    `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.sky0}"/><stop offset="1" stop-color="${C.sky1}"/></linearGradient>`,
    `<g id="cl"><ellipse cx="11" cy="5" rx="11" ry="3.4" fill="${C.cloud}"/><circle cx="8" cy="3" r="4" fill="${C.cloud}"/><circle cx="14" cy="2" r="5" fill="${C.cloud}"/></g>`,
    `<circle id="fl" r="1.1" fill="${C.snow}"/>`,
    `<ellipse id="pt" rx="1.3" ry=".7" fill="#f4a6c1"/>`,
    `<ellipse id="lf" rx="1.4" ry=".7" fill="#e08a2e"/>`,
    ...Object.entries(poses).map(([k, v]) => `<g id="p-${k}"><g transform="scale(${K})">${v}</g></g>`),
  ];

  const out = [];
  // ---------- sky ----------
  out.push(`<rect width="${WIDTH}" height="${BASE}" fill="url(#sky)"/>`);
  const summer = inSeason('summer');
  const sunX = summer.length ? n((summer[0].x0 + summer.at(-1).x1) / 2) : WIDTH / 2;
  if (dark) {
    const rnd = prng(11);
    let st = '';
    for (let k = 0; k < 70; k++) {
      const x = n(X0 + rnd() * (right - X0));
      const y = n(6 + rnd() * 120);
      const big = rnd() < 0.15;
      const tw = k % 4 === 0
        ? `<animate attributeName="opacity" values="1;.2;1" keyTimes="0;.5;1" dur="${(2.5 + rnd() * 3).toFixed(1)}s" begin="${(rnd() * 3).toFixed(1)}s" repeatCount="indefinite"/>`
        : '';
      st += `<circle cx="${x}" cy="${y}" r="${big ? 1 : 0.6}" fill="#e6edf3" opacity="${big ? 0.9 : 0.55}">${tw}</circle>`;
    }
    out.push(`<g class="fx">${st}</g>`);
    out.push(`<path transform="translate(${sunX} 40)" d="M2 -7.5A7.5 7.5 0 1 0 2 7.5A5.8 5.8 0 1 1 2 -7.5Z" fill="#f0e6c0"/>`);
  } else {
    out.push(`<g transform="translate(${sunX} 44)"><circle r="12" fill="#f4c430" opacity=".18"/><circle r="7" fill="#f4c430"/><path d="M-7 0a7 7 0 0 1 7 -7v7z" fill="#fbe38a" opacity=".6"/></g>`);
    const rnd = prng(5);
    const layer = (count, yMin, yMax, sc, op, dur) => {
      let c = '';
      for (let k = 0; k < count; k++) {
        const x = Math.round((k * WIDTH) / count + rnd() * 60);
        const y = Math.round(yMin + rnd() * (yMax - yMin));
        c += `<use href="#cl" transform="translate(${x} ${y}) scale(${sc})"/><use href="#cl" transform="translate(${x - WIDTH} ${y}) scale(${sc})"/>`;
      }
      return `<g opacity="${op}" class="fx"><animateTransform attributeName="transform" type="translate" values="0 0;${WIDTH} 0" keyTimes="0;1" dur="${dur}s" repeatCount="indefinite"/>${c}</g>`;
    };
    out.push(layer(4, 70, 110, 1, 0.6, 240));
    out.push(layer(5, 14, 60, 1.6, 0.95, 150));
  }
  // Snow (Dec–Feb), blossom petals (Mar–May) and leaves (Sep–Nov) drift down over their own months.
  const rnd = prng(23);
  const fall = (s, id, perMonth, drift) => {
    let f = '';
    for (const m of inSeason(s)) {
      for (let k = 0; k < perMonth; k++) {
        const x = n(m.x0 + rnd() * (m.x1 - m.x0));
        const y = n(30 + rnd() * 80);
        const du = (6 + rnd() * 5).toFixed(1);
        const b = (rnd() * 6).toFixed(1);
        f += `<use href="#${id}" x="${x}" y="${y}"><animateTransform attributeName="transform" type="translate" values="0 -20;${drift} 40" keyTimes="0;1" dur="${du}s" begin="-${b}s" repeatCount="indefinite"/>` +
          `<animate attributeName="opacity" values="0;.9;.9;0" keyTimes="0;.15;.8;1" dur="${du}s" begin="-${b}s" repeatCount="indefinite"/></use>`;
      }
    }
    return f;
  };
  out.push(`<g class="fx">${fall('winter', 'fl', 3, 4)}${fall('spring', 'pt', 2, 8)}${fall('autumn', 'lf', 2, 10)}</g>`);

  // ---------- ground ----------
  out.push(`<rect x="${X0}" y="${BASE}" width="${n(right - X0)}" height="2.5" fill="${C.grass}"/><rect x="${X0}" y="${BASE + 2.5}" width="${n(right - X0)}" height="5" rx="1" fill="${C.soil}"/>`);
  out.push(`<g fill="${C.tick}">${months.slice(1).map((m) => `<rect x="${m.x0}" y="${BASE + 10}" width="1" height="4"/>`).join('')}</g>`);

  // ---------- terrain: one rising plateau per bucket, rounded where it stands above a neighbour ----------
  const terr = [];
  buckets.forEach((b, i) => {
    if (b.h === 0) return;
    const lh = buckets[i - 1]?.h ?? 0;
    const rh = buckets[i + 1]?.h ?? 0;
    const rl = lh < b.h ? Math.min(2.5, b.h - lh) : 0;
    const rr = rh < b.h ? Math.min(2.5, b.h - rh) : 0;
    const x0 = b.x0;
    const x1 = n(b.x1 + (rr ? 0 : 0.4)); // overlap the seam with a taller right neighbour
    const top = `M${x0} ${-b.h + rl}Q${x0} ${-b.h} ${n(x0 + rl)} ${-b.h}H${n(x1 - rr)}Q${x1} ${-b.h} ${x1} ${-b.h + rr}`;
    const fill = rampColor(C.ramp, b.t);
    const edge = mix(fill, '#000000', dark ? 0.35 : 0.22);
    const delay = 0.1 + 1.5 * ((b.x0 - X0) / (right - X0));
    const a = (delay / RISE).toFixed(3);
    const e = (Math.min(RISE, delay + 0.7) / RISE).toFixed(3);
    terr.push(
      `<g class="r"><animateTransform attributeName="transform" type="scale" values="1 0;1 0;1 1;1 1" keyTimes="0;${a};${e};1" dur="${RISE}s" fill="freeze"/>` +
        `<path d="${top}V0H${x0}Z" fill="${fill}"/><path d="${top}" fill="none" stroke="${edge}" stroke-width="1.2"/></g>`,
    );
  });
  out.push(`<g transform="translate(0 ${BASE})">${terr.join('\n')}</g>`);

  // ---------- props: ladders and ropes, challenges. They fade in after the rise ----------
  const props = [];
  for (const t of transitions) {
    const yl = BASE - t.low;
    const yh = BASE - t.high;
    const s = t.up ? -1 : 1; // which side of the wall the prop is on
    if (t.kind === 'ladder') {
      const ra = n(t.x + s * 0.8);
      const rb = n(t.x + s * 4.4);
      let d = `M${ra} ${yl}V${yh - 1.5}M${rb} ${yl}V${yh - 1.5}`;
      for (let y = yl - 2.4; y > yh - 1; y -= 2.6) d += `M${Math.min(ra, rb)} ${n(y)}H${Math.max(ra, rb)}`;
      props.push(`<path d="${d}" stroke="${C.gear}" stroke-width=".7" fill="none" stroke-linecap="round" opacity=".85"/>`);
    } else {
      const x = n(t.x + s * 1.2);
      const peg = n(t.x - s * 0.6);
      // Sways only while he is on it.
      const sway = [[t.t0, `0 ${x} ${yh}`]];
      for (let u = t.t0 + 0.25, k = 0; u < t.t1; u += 0.5, k++) sway.push([u, `${k % 2 ? -2.5 : 2.5} ${x} ${yh}`]);
      sway.push([t.t1 + 0.25, `0 ${x} ${yh}`]);
      props.push(
        `<g class="act">${timed(loop, sway, { type: 'rotate' })}<path d="M${peg} ${yh}H${x}V${n(yl - 1)}" stroke="${C.gear}" stroke-width=".7" fill="none" stroke-linecap="round" opacity=".7"/></g>`,
      );
    }
  }
  for (const c of challenges) props.push(challengeSvg(C, c, ctx));
  out.push(`<g class="fd"><animate attributeName="opacity" values="0;0;1" keyTimes="0;${(RISE / WALK_BEGIN).toFixed(3)};1" dur="${WALK_BEGIN}s" fill="freeze"/>${props.join('\n')}</g>`);

  // ---------- walker: piecewise linear motion with explicit keyTimes, one pose group per pose ----------
  const vals = [segs[0].from, ...segs.map((s) => s.to)].map(([x, y]) => `${n(x)},${n(y)}`).join(';');
  const kts = [0];
  for (const s of segs) kts.push(Math.max(kts.at(-1), Number((s.t1 / loop).toFixed(5))));
  kts[kts.length - 1] = 1;
  const poseAnim = (pose) => {
    const ch = [];
    for (const s of segs) {
      const v = poseOf(s.mode) === pose ? 1 : 0;
      if (!ch.length || ch.at(-1)[1] !== v) ch.push([s.t0, v]);
    }
    ch[0][0] = 0;
    return { first: ch[0][1], anim: timed(loop, ch, { attr: 'opacity', calc: 'discrete' }) };
  };
  const cycle = (a, dur) => `<animate attributeName="opacity" values="${a ? '1;0;1' : '0;1;0'}" keyTimes="0;.5;1" calcMode="discrete" dur="${dur}s" repeatCount="indefinite"/>`;
  const used = [...new Set(segs.map((s) => poseOf(s.mode)))];
  const groups = used.map((p) => {
    const { first, anim } = poseAnim(p);
    const body = p === 'walk'
      ? `<use href="#p-walkA">${cycle(true, STEP_DUR)}</use><use href="#p-walkB" opacity="0">${cycle(false, STEP_DUR)}</use>`
      : p === 'climb'
        ? `<use href="#p-climbA">${cycle(true, CLIMB_DUR)}</use><use href="#p-climbB" opacity="0">${cycle(false, CLIMB_DUR)}</use>`
        : `<use href="#p-${p}"/>`;
    return `<g opacity="${first}">${anim}${body}</g>`;
  });
  const [sx, sy] = segs[0].from;
  out.push(
    `<g class="wk"><animate attributeName="opacity" values="0;0;1" keyTimes="0;.9;1" dur="${WALK_BEGIN}s" fill="freeze"/><g transform="translate(${X0} ${BASE})"><g>` +
      `<animateMotion values="${vals}" keyTimes="${kts.join(';')}" calcMode="linear" dur="${n(loop)}s" begin="${WALK_BEGIN}s" repeatCount="indefinite"/>` +
      groups.join('') +
      `</g></g></g>`,
    `<use class="wk0" href="#p-walkA" x="${n(X0 + sx)}" y="${n(BASE + sy)}"/>`,
  );

  // ---------- labels, caption, hover columns ----------
  const labels = months
    .filter((m) => m.x1 - m.x0 >= 24)
    .map((m) => `<text x="${n((m.x0 + m.x1) / 2)}" y="${BASE + 25}" text-anchor="middle">${monthName(m.date)}</text>`)
    .join('');
  const top = BASE - H_MAX - 30;
  const hover = buckets
    .map((b) => `<rect x="${b.x0}" y="${top}" width="${n(b.x1 - b.x0)}" height="${BASE + 8 - top}"><title>${tooltip(b.sum, b.first, b.last)}</title></rect>`)
    .join('\n');

  const pk = buckets[peakIndex];
  const unit = { day: 'day', week: 'week', halfmonth: 'half-month', month: 'month' }[bucket];
  const title = `${model.name}'s GitHub contributions as a landscape: ${caption(model)}`;
  const desc =
    `One plateau per ${unit}, ${buckets.length} plateaus from left to right. Plateau height is the square root of its total, ` +
    `capped at ${terrain.cap.toLocaleString('en-US')} contributions (the 99th percentile of the totals); empty ${unit}s stay on the ground. ` +
    `A walker crosses the year in a ${Math.round(loop)}-second loop, climbing ladders and ropes between plateaus, with a challenge on every ${unit}: ` +
    `he saws trees and pushes boulders on the busiest ones, and plants a flag by the campfire on the busiest` + (pk.sum ? `: ${tooltip(pk.sum, pk.first, pk.last)}.` : '.');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-labelledby="yw-title yw-desc">
<title id="yw-title">${esc(title)}</title>
<desc id="yw-desc">${esc(desc)}</desc>
<style>
text{font-family:${FONT};font-size:11px;fill:${C.label}}
.cap{font-size:13px;font-weight:600;fill:${C.text}}
.wk0{display:none}
@media (prefers-reduced-motion: reduce){.r,.act{transform:none!important}.act,.fd{opacity:1!important}.flg{opacity:0!important}.wk,.fx{display:none}.wk0{display:inline}}
</style>
<defs>${defs.join('')}</defs>
<rect width="${WIDTH}" height="${HEIGHT}" fill="${C.bg}"/>
${out.join('\n')}
${labels}
<text x="${X0}" y="${HEIGHT - 14}" class="cap">${esc(caption(model))}</text>
<g fill="#000000" fill-opacity="0">
${hover}
</g>
</svg>
`;
}
