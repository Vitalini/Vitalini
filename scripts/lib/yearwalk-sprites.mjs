// Year Walk sprites: the walker's poses and one prop per challenge kind. Pure SVG strings.
//
// Every challenge animation runs on the walker's loop (`timed`), so a prop changes exactly while he
// acts on it and is back in its starting state when the loop restarts. Classes: `act` = moves or
// disappears (reduced motion shows its first state), `fx` = appears only during the action
// (reduced motion hides it), `flg` = the campfire flag.

import { bucketSeason } from './yearwalk-terrain.mjs';

export const K = 1.3; // sprite scale: the walker is drawn 14 px tall, shown ~18 px
export const WALK_BEGIN = 3; // seconds, the walker loop starts after the terrain rise

export const n = (v) => {
  const x = Math.round(v * 100) / 100;
  return Object.is(x, -0) ? 0 : x;
};

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const rgbToHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
export function mix(a, b, t) {
  const to = hexToRgb(b);
  return rgbToHex(hexToRgb(a).map((v, i) => v + (to[i] - v) * t));
}

/**
 * One loop-synced animation. `frames` = [[seconds into the loop, value], ...] in time order. The value
 * before the first frame is the first value, after the last frame the last value; keyTimes start at 0
 * and end at 1.
 */
export function timed(loop, frames, { attr = 'transform', type, calc } = {}) {
  const pts = frames.map(([t, v]) => [Math.min(1, Math.max(0, t / loop)), v]);
  if (pts[0][0] > 0) pts.unshift([0, pts[0][1]]);
  if (pts.at(-1)[0] < 1) pts.push([1, pts.at(-1)[1]]);
  const kt = [];
  for (const [t] of pts) kt.push(Math.max(kt.at(-1) ?? 0, Number(t.toFixed(5))));
  kt[kt.length - 1] = 1;
  const head = type ? `<animateTransform attributeName="transform" type="${type}"` : `<animate attributeName="${attr}"`;
  return `${head} values="${pts.map(([, v]) => v).join(';')}" keyTimes="${kt.join(';')}"${calc ? ` calcMode="${calc}"` : ''} dur="${n(loop)}s" begin="${WALK_BEGIN}s" repeatCount="indefinite"/>`;
}

const loopAnim = (type, vals, dur, extra = '') =>
  `<animateTransform attributeName="transform" type="${type}" values="${vals.join(';')}" keyTimes="${vals.map((_, i) => n(i / (vals.length - 1))).join(';')}" dur="${dur}s" repeatCount="indefinite"${extra}/>`;

// ---------- the walker: feet at (0, 0), facing right, in 14-px units (scaled by K in <defs>) ----------

export function walkerPoses(C) {
  const limb = (pts, color, w = 1.3) => `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  const upper = (dy = 0) =>
    `<g transform="translate(0 ${dy})"><rect x="-1.7" y="-9.2" width="3.4" height="5.2" rx="1.2" fill="${C.shirt}"/>` +
    `<circle cx="0" cy="-11.6" r="2.3" fill="${C.skin}"/><path d="M-2.3 -11.8a2.3 2.3 0 0 1 4.6 0z" fill="${C.hair}"/></g>`;
  const legs = (a, b) => limb(a, C.pants) + limb(b, C.pants);
  const arm = (pts) => limb(pts, C.skin, 1);
  const line = (d, color = C.gear, w = 0.8) => `<path d="${d}" stroke="${color}" stroke-width="${w}" fill="none" stroke-linecap="round"/>`;
  const swing = (vals, cx, cy, dur) => loopAnim('rotate', vals.map((v) => `${v} ${cx} ${cy}`), dur);
  const bob = (dy, dur) => loopAnim('translate', ['0 0', `0 ${dy}`, '0 0'], dur);
  const stand = legs([[-0.6, -4.2], [-1.4, 0]], [[0.6, -4.2], [1.4, 0]]);
  const body = stand + upper();
  const armDown = arm([[-0.2, -8.4], [-0.6, -5]]);
  const eat = arm([[0.6, -8.2], [1.6, -10.6]]);
  const crouchLegs = legs([[-0.4, -1.4], [1.6, -2.4], [1.4, 0]], [[0.4, -1.4], [-1.4, -2.2], [-1.8, 0]]);
  const jumpFig = `${legs([[-0.6, -4.2], [-1.8, -2.6], [-0.6, -1.2]], [[0.6, -4.2], [1.8, -3], [2.6, -1.6]])}${upper()}${arm([[0.3, -8.4], [2.4, -10.6]])}`;
  const walkA = legs([[-0.6, -4.2], [-2, 0]], [[0.6, -4.2], [1.8, 0]]) + upper() + arm([[0.3, -8.4], [1.9, -5.6]]);
  return {
    walkA,
    walkB: legs([[-0.4, -4.2], [-0.5, 0]], [[0.4, -4.2], [0.7, 0]]) + upper() + arm([[0, -8.4], [0.2, -5]]),
    // Climbing: hands above the head on the rope or rungs, knees alternating.
    climbA: legs([[-0.6, -4.2], [0.6, -2.6], [0.2, 0]], [[0.6, -4.2], [0.8, -1.2], [0.6, 0.6]]) + upper() + arm([[-0.6, -8.6], [-0.2, -13.8]]) + arm([[0.6, -8.6], [0.4, -11.6]]),
    climbB: legs([[-0.6, -4.2], [-0.8, -1.2], [-0.4, 0.6]], [[0.6, -4.2], [1.4, -2.6], [0.8, 0]]) + upper() + arm([[-0.6, -8.6], [-0.4, -11.6]]) + arm([[0.6, -8.6], [0.2, -13.8]]),
    saw:
      legs([[-0.6, -4.2], [-1.6, 0]], [[0.6, -4.2], [1.6, 0]]) + upper() + arm([[0.6, -7.8], [3.6, -6.4]]) +
      `<g>${loopAnim('translate', ['0 0', '-1.6 0.3', '0 0'], 0.4)}<path d="M3.2 -7.2h1.2v1.6h-1.2z" fill="${C.gear}"/><path d="M4.4 -7l4.6 1.1v0.9l-4.6 -0.4z" fill="${C.tool}"/></g>`,
    push: `<g transform="rotate(16)">${legs([[-0.6, -4.2], [-2.6, 0]], [[0.6, -4.2], [-0.4, 0]])}${upper()}${arm([[0.6, -8], [4, -8]])}${arm([[0.2, -7.6], [3.8, -7]])}</g>`,
    sit: limb([[-0.5, -1.6], [3, -1.6], [3.4, 0]], C.pants) + upper(3) + arm([[0.8, -5], [3, -4]]),
    shovel: body + `<g>${swing([0, -14, 0], 0, -6, 0.5)}${arm([[0.6, -7.8], [3, -5]])}${line('M-0.4 -9L5 -1.4')}<path d="M4.2 -2.2l2.4 1.4l-1 1.6l-2.4 -1.4z" fill="${C.tool}"/></g>`,
    // Mid-air over a puddle or fence: drawn 3 px up, knees tucked; the feet anchor stays on the plateau.
    jump: `<g transform="translate(0 -3)">${jumpFig}</g>`,
    hop: `<g>${bob(-3, 0.4)}${jumpFig}</g>`,
    bounce: `<g>${bob(-6, 0.4)}${jumpFig}</g>`,
    balance: `<g transform="translate(0 -2.4)">${legs([[-0.6, -4.2], [-1.2, 0]], [[0.6, -4.2], [1, 0]])}${upper()}${arm([[-0.4, -8], [-4, -8.8]])}${arm([[0.4, -8], [4, -8.8]])}</g>`,
    chop: body + `<g>${swing([-40, 30, -40], 0.5, -8, 0.5)}${arm([[0.5, -8], [2.4, -10.6]])}${line('M2.4 -10.6L4.4 -6.8')}<path d="M3.6 -8.4l1.8 -1l.8 1.6l-1.8 .6z" fill="${C.tool}"/></g>`,
    swat: body + `<g>${swing([-30, 30, -30], 0.5, -8.4, 0.3)}${arm([[0.5, -8.4], [2.8, -12]])}</g>`,
    net: body + `<g>${swing([-30, 40, -30], 0.5, -8.4, 0.6)}${arm([[0.5, -8.4], [2.6, -11.4]])}${line('M2.6 -11.4L4.4 -15')}<circle cx="5" cy="-16" r="1.4" fill="none" stroke="${C.tool}" stroke-width=".5"/></g>`,
    crouch: crouchLegs + upper(3) + arm([[0.6, -5], [3.4, -1.6]]),
    wave: body + arm([[-0.3, -8.4], [-1, -5]]) + `<g>${swing([-25, 15, -25], 0.8, -8.6, 0.5)}${arm([[0.8, -8.6], [3.2, -12.4]])}</g>`,
    reach: body + armDown + arm([[0.6, -8.6], [2.8, -13.4]]),
    kick: legs([[-0.6, -4.2], [-1, 0]], [[0.6, -4.2], [3.6, -3]]) + upper() + arm([[0, -8.4], [-1.8, -6]]),
    toss: body + armDown + `<g>${swing([30, -40, 30], 0.6, -8.2, 0.6)}${arm([[0.6, -8.2], [3.4, -9.4]])}</g>`,
    slip: `<g transform="rotate(-22)">${legs([[-0.6, -4.2], [1.4, 0]], [[0.6, -4.2], [3, -0.6]])}${upper()}${arm([[-0.6, -8.4], [-3, -11]])}${arm([[0.6, -8.4], [3, -11.4]])}</g>`,
    shake: `<g>${loopAnim('translate', ['-0.5 0', '0.5 0', '-0.5 0'], 0.2)}${body}${arm([[-0.4, -8.4], [-2.6, -6.6]])}${arm([[0.4, -8.4], [2.6, -6.6]])}</g>`,
    drink: body + eat + `<path d="M1.4 -13.4l1.6 -.6l.9 2.4l-1.6 .6z" fill="${C.tool}"/>`,
    look: body + arm([[0.6, -8.2], [2.2, -11.2]]) + `<rect x="1.8" y="-12.6" width="2.4" height="1.6" rx=".5" fill="${C.pants}"/>`,
    peer: `<g transform="rotate(10)">${body}${arm([[0.6, -8.2], [2.4, -10.8]])}</g>`,
    // Eating: hand at the mouth; the food itself is drawn by the challenge at the hand.
    eat: body + armDown + `<g>${swing([0, -12, 0], 0.6, -8.2, 0.5)}${eat}</g>`,
    blow: body + armDown + eat,
    roast: body + arm([[0.6, -7.8], [3, -7]]) + line('M3 -7L8.4 -5.4', C.gear, 0.5) + `<circle cx="8.6" cy="-5.3" r=".7" fill="#f6f1e7"/>`,
    pour: body + arm([[0.6, -7.8], [3, -7]]) + `<g transform="rotate(25 3 -7)"><rect x="2.4" y="-8.4" width="2.6" height="2.4" rx=".4" fill="${C.tool}"/>${line('M5 -7.4L6.8 -8.4', C.tool, 0.5)}</g>`,
    run: `<g transform="rotate(12)">${walkA}</g>`,
    pogo: `<g>${bob(-3.5, 0.35)}<g transform="translate(0 -3)">${legs([[-0.6, -4.2], [-0.4, -1]], [[0.6, -4.2], [0.4, -1]])}${upper()}${arm([[0.6, -8], [1.6, -6.4]])}</g>${line('M0 -0.2V-7.2M-1.4 -7.4H1.6', C.tool, 0.6)}</g>`,
    skate: `<g transform="translate(0 -1.2)">${legs([[-0.6, -4.2], [-1.6, 0]], [[0.6, -4.2], [1.6, 0]])}${upper()}${arm([[-0.4, -8], [-3, -7]])}${arm([[0.4, -8], [2.6, -9]])}</g>` +
      `<rect x="-3" y="-1.3" width="6" height=".7" rx=".35" fill="${C.flag}"/><circle cx="-2" cy="-0.4" r=".45" fill="${C.pants}"/><circle cx="2" cy="-0.4" r=".45" fill="${C.pants}"/>`,
    bike: `<circle cx="-2.6" cy="-1.7" r="1.7" fill="none" stroke="${C.pants}" stroke-width=".5"/><circle cx="2.8" cy="-1.7" r="1.7" fill="none" stroke="${C.pants}" stroke-width=".5"/>` +
      line('M-2.6 -1.7L-0.4 -4.6L2 -4.6L2.8 -1.7M-0.4 -4.6L0.4 -1.8L2 -4.6M2 -4.6L2.2 -6', C.flag, 0.5) +
      legs([[-0.4, -4.6], [0.6, -2.6], [0.4, -1.8]], [[-0.4, -4.6], [-0.8, -2.8], [0.4, -1.4]]) + upper(-0.4) + arm([[0.6, -8.4], [2.2, -6.2]]),
    vault: `<g transform="translate(0 -4)">${jumpFig}${line('M2.4 -10.6L5 2', C.gear, 0.6)}</g>`,
    limbo: legs([[-0.6, -3], [-2.4, -1.6], [-1.8, 0]], [[0.6, -3], [2.4, -1.6], [2.4, 0]]) + `<g transform="rotate(-62 0 -3.2) translate(0 1)">${upper()}</g>`,
    stilts: line('M-0.8 -4.6V0M1 -4.6L1.2 0', C.gear, 0.6) + `<g transform="translate(0 -4.6)">${legs([[-0.6, -4.2], [-0.8, 0]], [[0.6, -4.2], [1, 0]])}${upper()}${arm([[0.4, -8], [1.2, -5]])}</g>`,
    ride:
      `<ellipse cx="0" cy="-2.6" rx="3.4" ry="1.9" fill="#f6f1e7"/><circle cx="3.2" cy="-3.4" r="1.1" fill="#57606a"/>${line('M-2 -1V0.2M-0.6 -1V0.2M1.2 -1V0.2M2.4 -1V0.2', '#57606a', 0.5)}` +
      `${limb([[-0.4, -4.4], [1.4, -3.2], [1.2, -2]], C.pants)}${upper(-0.6)}${arm([[0.6, -8.4], [2.6, -5.4]])}`,
    raft: `<rect x="-3.6" y="-1.2" width="7.2" height="1.2" rx=".4" fill="#8a5a33"/><g transform="translate(0 -1.2)">${body}${arm([[0.6, -8], [2.4, -5]])}</g>${line('M2.4 -6.2L4.6 0', C.gear, 0.5)}`,
    selfie: body + armDown + arm([[0.6, -8.6], [3.4, -12.4]]) + `<rect x="3" y="-14.2" width="1.2" height="2" rx=".3" fill="${C.pants}"/>`,
    lie: `<g transform="translate(-5.6 -4.2) rotate(90)">${legs([[-0.6, -4.2], [-0.8, 0]], [[0.6, -4.2], [0.8, 0]])}${upper()}${arm([[0.4, -8.4], [-1.4, -10.6]])}</g>`,
    juggle: body + arm([[-0.4, -8.2], [-1.4, -6.6]]) + arm([[0.4, -8.2], [1.6, -6.6]]) +
      [0, 1, 2].map((i) => `<circle r=".7" fill="${[C.flag, '#e3b341', '#58a6ff'][i]}">` +
        `<animateMotion path="M-1.4 -7C-1.4 -14 1.6 -14 1.6 -7C1.6 -10 -1.4 -10 -1.4 -7" dur="0.9s" begin="-${n(i * 0.3)}s" repeatCount="indefinite"/></circle>`).join(''),
    pushup: `<g>${bob(0.8, 0.5)}<g transform="translate(-4.6 -2.2) rotate(78)">${legs([[-0.6, -4.2], [-0.4, 0]], [[0.6, -4.2], [0.4, 0]])}${upper()}</g></g>${line('M4.2 -2.2L4.4 0', C.skin, 1)}`,
    yoga: legs([[-0.6, -4.2], [-0.4, 0]], [[0.6, -4.2], [2.2, -3], [0.2, -2.4]]) + upper() + arm([[-0.4, -8.6], [0, -14.2]]) + arm([[0.4, -8.6], [0, -14.2]]),
    skip: `<g>${bob(-2, 0.5)}${legs([[-0.6, -4.2], [-0.8, -0.4]], [[0.6, -4.2], [0.8, -0.4]])}${upper()}${arm([[-0.4, -8], [-2.4, -6.2]])}${arm([[0.4, -8], [2.4, -6.2]])}` +
      `<ellipse cx="0" cy="-6.4" rx="2.6" ry="7" fill="none" stroke="${C.flag}" stroke-width=".4">${loopAnim('scale', ['1 1', '1 -1', '1 1'], 0.5)}</ellipse></g>`,
    carry: walkA + `<rect x="-4.4" y="-11" width="8.8" height="1.6" rx=".8" fill="#8a5a33"/>` + arm([[0.4, -8.6], [1.4, -10.2]]),
    kite: body + armDown + arm([[0.6, -8.6], [2.4, -12]]) +
      `<g>${loopAnim('translate', ['0 0', '1 -1.4', '0 0'], 1.4)}${line('M2.4 -12L12 -24', C.label, 0.25)}<path d="M12 -27l2 3l-2 3l-2 -3z" fill="${C.flag}"/></g>`,
    umbrella: body + armDown + arm([[0.6, -8.6], [1, -11]]) + line('M1 -11V-15', C.pants, 0.5) + `<path d="M-3.6 -15a4.6 3.6 0 0 1 9.2 0z" fill="${C.flag}"/>`,
    hat: body + arm([[-0.4, -8.4], [-1.4, -12.8]]) + arm([[0.4, -8.4], [1, -6]]) + `<rect x="-2.6" y="-14.4" width="5.2" height="1" rx=".4" fill="${C.pants}"/><rect x="-1.6" y="-16" width="3.2" height="1.8" rx=".5" fill="${C.pants}"/>`,
    map: body + arm([[-0.4, -8.2], [1.4, -8.8]]) + arm([[0.4, -8.2], [3.4, -8.8]]) + `<rect x="1.2" y="-11.2" width="3.4" height="2.8" fill="#f6e7b4"/><path d="M2 -10.4l1 1l1 -1" stroke="${C.flag}" stroke-width=".3" fill="none"/>`,
  };
}

// ---------- challenge props: origin at the anchor on the plateau top, scene px ----------

const CANOPY = {
  winter: ['#2f7d4f', '#1f6040'],
  spring: ['#f4a6c1', '#e07fa3'],
  summer: ['#2da44e', '#1a7f37'],
  autumn: ['#e08a2e', '#bc4c00'],
};

export function treeShape(C, s, scale = 1) {
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

/** Small foods and items held at the mouth/hand, centred on (0, 0), scene px. */
const FOOD = {
  'apple-tree': (C) => `<circle r="1.3" fill="${C.flag}"/>`,
  mushroom: () => `<path d="M-1.4 0a1.4 1.4 0 0 1 2.8 0z" fill="#cf222e"/>`,
  sandwich: () => `<path d="M-1.6 .8L0 -1.2L1.6 .8Z" fill="#e8c27a"/><path d="M-1.2 .3H1.2" stroke="#2da44e" stroke-width=".5"/>`,
  berries: () => `<circle cx="-0.5" r=".7" fill="#6639ba"/><circle cx=".6" cy=".3" r=".7" fill="#8250df"/>`,
  honey: () => `<rect x="-1.1" y="-1.2" width="2.2" height="2.4" rx=".5" fill="#e3b341"/><rect x="-1.2" y="-1.6" width="2.4" height=".6" fill="#8a5a33"/>`,
  cocoa: () => `<rect x="-1" y="-1" width="2" height="2.2" rx=".4" fill="#cf222e"/><path d="M-0.3 -1.6q.4 -.8 0 -1.6M.5 -1.6q.4 -.8 0 -1.6" stroke="#d0d7de" stroke-width=".3" fill="none"/>`,
  icecream: () => `<path d="M-0.9 -0.2L0 2L0.9 -0.2Z" fill="#d4a72c"/><circle cy="-0.8" r="1.1" fill="#f4a6c1"/>`,
  fish: () => `<ellipse rx="1.6" ry=".7" fill="#79c0ff"/><path d="M1.4 0l.9 -.7v1.4z" fill="#79c0ff"/>`,
  watermelon: () => `<path d="M-1.8 -0.4a1.8 1.8 0 0 0 3.6 0z" fill="#cf222e"/><path d="M-1.8 -0.4a1.8 1.8 0 0 0 3.6 0" stroke="#2da44e" stroke-width=".4" fill="none"/>`,
  carrot: () => `<path d="M-0.5 -1L0.5 -1L0 1.8Z" fill="#f0883e"/><path d="M0 -1L-0.6 -2M0 -1L.6 -2" stroke="#2da44e" stroke-width=".4"/>`,
  pie: () => `<path d="M-1.6 .6L1.6 .6L1.6 -.6Z" fill="#d4a72c"/>`,
  coffee: () => `<rect x="-0.9" y="-0.9" width="1.8" height="1.9" rx=".3" fill="#ffffff" stroke="#8c959f" stroke-width=".2"/><path d="M0 -1.4q.4 -.8 0 -1.6" stroke="#d0d7de" stroke-width=".3" fill="none"/>`,
  nut: () => `<ellipse rx=".9" ry="1.1" fill="#8a5a33"/>`,
  pizza: () => `<path d="M-1.6 -0.8H1.6L0 1.8Z" fill="#e3b341"/><circle cx="-0.4" cy="-0.2" r=".3" fill="#cf222e"/><circle cx=".5" cy=".1" r=".3" fill="#cf222e"/>`,
  banana: () => `<path d="M-1.6 -1Q0 1.6 1.6 -1Q0 .4 -1.6 -1Z" fill="#e3b341"/>`,
  dandelion: () => `<path d="M0 0V2" stroke="#2da44e" stroke-width=".3"/><circle r="1.2" fill="#ffffff" opacity=".9"/>`,
};

/** Burst of small particles from (x, y) during [t, t + 0.6]; hidden otherwise. */
function burst(T, x, y, color, t, dirs, r = 0.8) {
  return dirs
    .map(([dx, dy], k) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="0">` +
      T([[t + k * 0.05, '0 0'], [t + 0.6, `${dx} ${dy}`]], { type: 'translate' }) +
      T([[t - 0.01, 0], [t, 1], [t + 0.6, 1], [t + 0.61, 0]], { attr: 'opacity', calc: 'discrete' }) + `</circle>`)
    .join('');
}

/** Hand position (scene px, relative to his feet) for poses that hold food. */
const HAND = { eat: [2.1, -13.8], blow: [2.1, -13.8] };

export function challengeSvg(C, c, ctx) {
  const { loop, terrain, model } = ctx;
  const b = terrain.buckets[c.bucket];
  const next = terrain.buckets[c.bucket + 1];
  const T = (frames, o) => timed(loop, frames, o);
  const at = (x, y, body) => `<g transform="translate(${n(x)} ${n(y)})">${body}</g>`;
  const g = (body) => at(c.x, c.y, body);
  const fx = (body) => `<g class="fx">${body}</g>`;
  const show = (t0, t1, body, cls = 'fx') => `<g class="${cls}" opacity="0">${T([[t0 - 0.001, 0], [t0, 1], [t1, 1], [t1 + 0.001, 0]], { attr: 'opacity', calc: 'discrete' })}${body}</g>`;
  const hide = (t, body) => `<g class="act">${T([[t - 0.001, 1], [t, 0]], { attr: 'opacity', calc: 'discrete' })}${body}</g>`;
  const appear = (t, body) => `<g class="fx" opacity="0">${T([[t - 0.001, 0], [t, 1]], { attr: 'opacity', calc: 'discrete' })}${body}</g>`;
  const grow = (t0, t1, body) => `<g class="fx" opacity="0">${T([[t0 - 0.001, 0], [t0, 1]], { attr: 'opacity', calc: 'discrete' })}<g>${T([[t0, '0.1 0.1'], [t1, '1 1']], { type: 'scale' })}${body}</g></g>`;
  const fly = (frames, fade, body) => `<g class="act">${T(frames, { type: 'translate' })}${T(fade, { attr: 'opacity' })}${body}</g>`;
  const mid = (c.t0 + c.t1) / 2;
  const eatPhase = c.phases.find((p) => p.pose === 'eat' || p.pose === 'blow');
  // Food in his hand while he eats (the eat phase), drawn in scene px at his mouth.
  const held = (key) => {
    if (!eatPhase || !FOOD[key]) return '';
    const [hx, hy] = HAND[eatPhase.pose];
    return at(c.stop + hx, c.y + hy, show(eatPhase.t0, eatPhase.t1 - 0.15, FOOD[key](C)));
  };
  const fire = `<path d="M-2.4 -0.4L2.4 -1.4M-2.4 -1.4L2.4 -0.4" stroke="#7a5230" stroke-width="1" stroke-linecap="round"/>` +
    `<g class="act">${loopAnim('scale', ['1 1', '0.9 1.12', '1.05 0.94', '1 1'], 0.7)}<path d="M0 -5C1.4 -3.2 1.9 -2.1 1.1 -1H-1.1C-1.9 -2.1 -1.3 -3.2 0 -5Z" fill="#f0883e"/><path d="M0 -3.4C.7 -2.4 .9 -1.8 .5 -1.1H-.5C-.9 -1.8 -.6 -2.4 0 -3.4Z" fill="#ffd33d"/></g>`;
  const post = (h, x = 0) => `<rect x="${n(x - 0.5)}" y="${-h}" width="1" height="${h}" fill="${C.gear}"/>`;
  const cat = `<path d="M-2 -0.6q-2 0 -1.6 -2.4" fill="none" stroke="${C.catSh}" stroke-width=".9" stroke-linecap="round"/>` +
    `<ellipse cx="0" cy="-2" rx="2.2" ry="2" fill="${C.cat}"/><circle cx="0.6" cy="-4.8" r="1.5" fill="${C.cat}"/><path d="M-0.4 -5.8l.2 -1.4l.9 .8zM1.2 -6.2l.7 -1.1l.4 1.3z" fill="${C.cat}"/>`;
  const bird = `<ellipse cx="0" cy="-1.6" rx="2" ry="1.4" fill="${C.bird}"/><circle cx="1.6" cy="-2.8" r="1" fill="${C.bird}"/><path d="M2.5 -2.9l1.1 .3l-1.1 .3z" fill="#f0883e"/><path d="M-0.6 -2l-2 -1.6l2.8 .4z" fill="${mix(C.bird, '#000000', 0.25)}"/>`;
  const puddle = (rx = 4.4) => `<ellipse cx="0" cy="-0.5" rx="${rx}" ry="1" fill="${C.water}"/><ellipse cx="-1.2" cy="-0.7" rx="1.4" ry=".3" fill="#ffffff" opacity=".5"/>`;
  const drop = (extra = 0) => Math.max(8, b.h - (next?.h ?? 0) + extra);
  const edge = (pad) => n(b.x1 - c.x + pad);

  switch (c.type) {
    case 'tree':
    case 'tree-axe': {
      // Sawn or chopped during the pause, tips over to the right, drops off the edge; the stump stays.
      const dr = Math.max(12, drop(6));
      return g(`<rect x="-1.1" y="-1.6" width="2.2" height="1.6" rx=".3" fill="#5c3d24"/>` +
        fly([[c.t1 + 0.4, '0 0'], [c.t1 + 1.1, `3 ${dr}`]], [[c.t1 + 0.6, 1], [c.t1 + 1.1, 0]],
          `<g class="act">${T([[c.t1 - 0.3, '0 0.9 0'], [c.t1 + 0.4, '90 0.9 0']], { type: 'rotate' })}${treeShape(C, bucketSeason(model, b), K)}</g>`));
    }
    case 'apple-tree':
      // He reaches up, picks the apple and eats it.
      return g(treeShape(C, bucketSeason(model, b), K) + hide(c.phases[0].t1 - 0.2, `<circle cx="-2" cy="-10" r="1.2" fill="${C.flag}"/>`)) + held('apple-tree');
    case 'boulder':
    case 'boulder-uphill': {
      const R = 4.4;
      const a = c.t0 + 0.6;
      const roll = (dx) => n((dx / R) * (180 / Math.PI));
      const rock = `<circle r="${R}" fill="${C.rock}"/><path d="M0 -${R}a${R} ${R} 0 0 1 0 ${2 * R}z" fill="${C.rockSh}"/><circle cx="-1.5" cy="-1.5" r="1" fill="#ffffff" opacity=".35"/>`;
      if (c.type === 'boulder') {
        // Pushed off the edge: rolls, falls to the next (lower) plateau, bounces, fades.
        const e = edge(2);
        const d = b.h - next.h;
        return g(fly([[a, '0 0'], [c.t1, `${e} 0`], [c.t1 + 0.35, `${n(e + 3)} ${d}`], [c.t1 + 0.55, `${n(e + 5)} ${d - 3}`], [c.t1 + 0.75, `${n(e + 7)} ${d}`]], [[c.t1 + 0.6, 1], [c.t1 + 1.1, 0]],
          `<g transform="translate(0 -${R})"><g class="act">${T([[a, '0'], [c.t1 + 0.75, String(roll(e + 7))]], { type: 'rotate' })}${rock}</g></g>`));
      }
      // Rolled toward the higher wall, it rolls back to where it was.
      return g(`<g class="act">${T([[a, '0 0'], [c.t0 + 1.4, '2 0'], [c.t1, '0 0']], { type: 'translate' })}` +
        `<g transform="translate(0 -${R})"><g class="act">${T([[a, '0'], [c.t0 + 1.4, String(roll(2))], [c.t1, '0']], { type: 'rotate' })}${rock}</g></g></g>`);
    }
    case 'drift':
      return g(`<g class="act">${T([[c.t0 + 0.3, '1 1'], [c.t1, '1 0.15']], { type: 'scale' })}` +
        `<g transform="scale(${K})"><path d="M-4.5 0Q-3.5 -3.8 0 -3.9Q3.4 -3.8 4.8 0Z" fill="${C.snow}"/><path d="M0 -3.9Q3.4 -3.8 4.8 0H0Z" fill="${C.snowSh}"/></g></g>` +
        fx(burst(T, -1, -3, C.snow, c.t0 + 0.4, [[8, -8], [11, -4]]) + burst(T, -1, -3, C.snow, c.t0 + 1.1, [[9, -9], [12, -3]])));
    case 'campfire': {
      const fx0 = n(b.flat0 + 1 - c.x);
      return g(`<g transform="scale(${K})">${fire}</g>` +
        `<g class="flg" opacity="0" transform="translate(${fx0} 0)">${T([[c.t1 - 0.4, 0], [c.t1 - 0.39, 1]], { attr: 'opacity', calc: 'discrete' })}` +
        `<g>${T([[c.t1 - 0.4, '1 0'], [c.t1 + 0.1, '1 1']], { type: 'scale' })}` +
        `<path d="M0 0V-19" stroke="${C.pole}" stroke-width="1"/><path d="M0.5 -19h7v4.6h-7z" fill="${C.flag}"/></g></g>`);
    }
    case 'puddle':
      return g(puddle());
    case 'fence':
      return g(`<path d="M-2.4 0V-4.6M2.4 0V-4.6M-3.2 -3.6H3.2M-3.2 -1.8H3.2" stroke="${C.gear}" stroke-width=".9" stroke-linecap="round"/>`);
    case 'log':
      return g(`<rect x="-5" y="-2.4" width="10" height="2.4" rx="1.2" fill="#8a5a33"/><ellipse cx="4" cy="-1.2" rx=".9" ry="1.1" fill="#c9915c"/>`);
    case 'bush':
      return g(`<g class="act">${T([[c.t0 + 0.5, '1 1'], [c.t1, '1 0.3']], { type: 'scale' })}<circle cx="-1.2" cy="-2.6" r="2.6" fill="#2da44e"/><circle cx="1.6" cy="-2.3" r="2.3" fill="#1a7f37"/></g>` +
        fx(burst(T, 0, -3, '#2da44e', c.t0 + 0.5, [[6, -6], [3, -9], [8, -2]])));
    case 'bee':
      return g(fly([[c.t1 - 0.2, '0 0'], [c.t1 + 0.4, '14 -16']], [[c.t1, 1], [c.t1 + 0.4, 0]],
        `<g transform="translate(0 -14)"><g class="act">${loopAnim('translate', ['0 0', '.8 -.8', '-.6 .4', '0 0'], 0.5)}` +
        `<ellipse rx="1.5" ry="1" fill="#e3b341"/><path d="M-0.3 -1V1" stroke="#24292f" stroke-width=".5"/><ellipse cx="-0.2" cy="-1.3" rx=".9" ry=".6" fill="#ffffff" opacity=".8"/></g></g>`));
    case 'mushroom':
      return g(hide(c.phases[0].t1 - 0.1, `<rect x="-0.5" y="-2.2" width="1" height="2.2" fill="#f6f1e7"/><path d="M-2.4 -2A2.4 2.4 0 0 1 2.4 -2Z" fill="#cf222e"/><circle cx="-0.8" cy="-3" r=".4" fill="#ffffff"/><circle cx="0.9" cy="-3.3" r=".35" fill="#ffffff"/>`)) + held('mushroom');
    case 'cat':
      return g(cat + fx(`<path d="M0 -8.6c-.6 -.8 -1.8 -.2 -1 .7l1 .9l1 -.9c.8 -.9 -.4 -1.5 -1 -.7z" fill="${C.flag}" opacity="0">` +
        `${T([[c.t0 + 0.5, '0 0'], [c.t1 + 0.3, '0 -4']], { type: 'translate' })}${T([[c.t0 + 0.49, 0], [c.t0 + 0.5, 1], [c.t1 + 0.3, 1], [c.t1 + 0.31, 0]], { attr: 'opacity', calc: 'discrete' })}</path>`));
    case 'bird':
      return g(fly([[c.t0 + 0.4, '0 0'], [c.t1 + 0.4, '16 -24']], [[c.t1, 1], [c.t1 + 0.4, 0]], bird));
    case 'rock':
      return g(`<g class="act">${T([[c.t0 + 0.3, '0 0'], [c.t1, '2.5 0']], { type: 'translate' })}<circle cx="0" cy="-2.6" r="2.6" fill="${C.rock}"/><path d="M0 -5.2a2.6 2.6 0 0 1 0 5.2z" fill="${C.rockSh}"/></g>`);
    case 'pinecone':
    case 'football': {
      const e = edge(3);
      const body = c.type === 'pinecone'
        ? `<ellipse cx="0" cy="-1.6" rx="1.2" ry="1.6" fill="#8a5a33"/><path d="M-1 -2.2h2M-1 -1h2" stroke="#5c3d24" stroke-width=".4"/>`
        : `<circle cx="0" cy="-1.5" r="1.5" fill="#ffffff" stroke="#24292f" stroke-width=".3"/><circle cx="0" cy="-1.5" r=".5" fill="#24292f"/>`;
      return g(fly([[c.t0 + 0.4, '0 0'], [c.t1, `${e} -6`], [c.t1 + 0.5, `${n(e + 4)} ${drop()}`]], [[c.t1 + 0.3, 1], [c.t1 + 0.6, 0]], body));
    }
    case 'ice':
      return g(`<ellipse cx="0" cy="-0.3" rx="5" ry=".8" fill="#bfe3f5"/><path d="M-2.6 -0.5h1.6" stroke="#ffffff" stroke-width=".4"/>`);
    case 'shake':
      return g(fx(burst(T, 0, -16, C.snow, c.t0 + 0.2, [[-5, -3], [5, -3], [-4, 3], [4, 3]])));
    case 'sandwich':
      return g(`<rect x="-3.6" y="-0.6" width="7.2" height=".6" fill="${C.flag}" opacity=".85"/><path d="M-2.4 -0.6h1.2v.6h-1.2zM0 -0.6h1.2v.6h-1.2zM2.4 -0.6h1.2v.6h-1.2z" fill="#ffffff" opacity=".7"/>` +
        hide(c.phases[0].t1 - 0.1, at(1, -1.4, FOOD.sandwich(C)))) + held('sandwich');
    case 'berries':
      return g(`<circle cx="-1.2" cy="-2.6" r="2.6" fill="#2da44e"/><circle cx="1.6" cy="-2.3" r="2.3" fill="#1a7f37"/>` +
        hide(c.phases[0].t1 - 0.1, `<circle cx="-1.6" cy="-3" r=".6" fill="#8250df"/><circle cx="0.6" cy="-2" r=".6" fill="#6639ba"/><circle cx="1.8" cy="-3.4" r=".6" fill="#8250df"/>`)) + held('berries');
    case 'honey':
      return g(post(7) + `<ellipse cx="0" cy="-8.4" rx="2.2" ry="2.6" fill="#e3b341"/><path d="M-2 -9.2h4M-2 -7.6h4" stroke="#bf8700" stroke-width=".4"/>` +
        `<g class="act">${loopAnim('translate', ['3 -10', '-3 -12', '1 -6', '3 -10'], 1.2)}<ellipse rx="1" ry=".7" fill="#e3b341"/><path d="M-0.2 -0.7V.7" stroke="#24292f" stroke-width=".4"/></g>`) + held('honey');
    case 'marshmallow':
    case 'corn':
      return g(fire + fx(burst(T, 0, -5, '#f0883e', mid, [[-1, -5], [1, -6]], 0.4))) +
        (c.type === 'corn' ? at(c.stop + 10.6, c.y - 7, show(c.t0, c.t1, `<ellipse rx="1.3" ry=".7" fill="#e3b341"/>`)) : '');
    case 'cocoa':
    case 'icecream':
    case 'watermelon':
      return held(c.type);
    case 'fish':
      return g(puddle(3.6) + fly([[c.t0 + 0.1, '0 0'], [c.phases[0].t1 - 0.1, '-2 -4']], [[c.phases[0].t1 - 0.1, 1], [c.phases[0].t1, 0]], `<g class="fx">${FOOD.fish(C)}</g>`)) + held('fish');
    case 'carrot':
      return g(`<ellipse cx="0" cy="-0.3" rx="3.6" ry=".8" fill="#8a5a33"/>` + hide(c.phases[0].t1 - 0.1, `<path d="M0 -0.6L-0.8 -2.6M0 -0.6L.8 -2.6M0 -0.6V-2.8" stroke="#2da44e" stroke-width=".5"/>`)) + held('carrot');
    case 'pie':
      return g(`<rect x="-1.8" y="-2.4" width="3.6" height="2.4" rx=".4" fill="#8a5a33"/>` + hide(c.phases[0].t1 - 0.1, `<ellipse cx="0" cy="-3" rx="2.2" ry=".8" fill="#d4a72c"/>`)) + held('pie');
    case 'coffee':
      return g(hide(c.phases[0].t1 - 0.1, `<rect x="-0.9" y="-4" width="1.8" height="4" rx=".5" fill="#57606a"/><rect x="-0.9" y="-4.4" width="1.8" height=".8" fill="${C.flag}"/>`)) + held('coffee');
    case 'nut':
      return g(`<g transform="translate(3 0)"><path d="M1 -1q2.4 -1 1 -4" stroke="#bc4c00" stroke-width="1.4" fill="none" stroke-linecap="round"/><ellipse cx="0" cy="-1.6" rx="1.2" ry="1.6" fill="#d18b4e"/><circle cx="-0.4" cy="-3.6" r="1" fill="#d18b4e"/></g>` +
        hide(c.phases[0].t1 - 0.1, `<ellipse cx="-1" cy="-0.9" rx=".8" ry="1" fill="#8a5a33"/>`)) + held('nut');
    case 'pizza': {
      // A tiny drone flies in with the slice.
      const hx = c.stop + HAND.eat[0];
      const hy = c.y + HAND.eat[1];
      return at(hx, hy, show(c.t0 - 0.2, c.phases[0].t1 + 0.4,
        `<g>${T([[c.t0 - 0.2, '24 -20'], [c.phases[0].t1, '0 -3'], [c.phases[0].t1 + 0.4, '20 -24']], { type: 'translate' })}` +
        `<rect x="-2" y="-3" width="4" height="1" rx=".4" fill="${C.pants}"/><path d="M-3 -3.4h2M1 -3.4h2" stroke="${C.label}" stroke-width=".4"/></g>`)) + held('pizza');
    }
    case 'banana':
      return held('banana') + at(c.stop + 1, c.y, appear(c.phases[0].t1, `<path d="M-1.4 -0.2Q0 -1 1.4 -0.2" stroke="#e3b341" stroke-width=".7" fill="none"/>`));
    case 'trampoline':
      return g(`<path d="M-4 -2.2H4M-3.4 -2.2V0M3.4 -2.2V0" stroke="${C.pants}" stroke-width=".7"/>`);
    case 'polevault':
      return g(`<path d="M-2.4 0V-4.6M2.4 0V-4.6M-3.2 -3.6H3.2M-3.2 -1.8H3.2" stroke="${C.gear}" stroke-width=".9" stroke-linecap="round"/>`);
    case 'limbo':
      return g(`<path d="M-3 0V-9M3 0V-9" stroke="${C.gear}" stroke-width=".8"/><path d="M-3 -8.4H3" stroke="${C.flag}" stroke-width=".7"/>`);
    case 'hopscotch':
      return g(`<path d="M-5 -0.3h3M-1.5 -0.3h3M2 -0.3h3" stroke="#ffffff" stroke-width=".6" opacity=".9"/>`);
    case 'sheep': {
      // The sheep waits; he rides it across, and it stays where they stop.
      const sheep = `<ellipse cx="0" cy="-2.6" rx="3.4" ry="1.9" fill="#f6f1e7"/><circle cx="3.2" cy="-3.4" r="1.1" fill="#57606a"/><path d="M-2 -1V0.2M-0.6 -1V0.2M1.2 -1V0.2M2.4 -1V0.2" stroke="#57606a" stroke-width=".5"/>`;
      return at(c.stop + 0.4, c.y, hide(c.t0, sheep)) + at(c.stop + CHALLENGES_MOVE(c, ctx) + 0.4, c.y, appear(c.t1, sheep));
    }
    case 'raft':
      return g(puddle(5.6));
    case 'snowman':
      return g(grow(c.t0 + 0.2, c.t1, `<circle cy="-2.2" r="2.2" fill="${C.snow}"/><circle cy="-5.6" r="1.6" fill="${C.snow}"/><circle cx=".6" cy="-5.8" r=".25" fill="#24292f"/><path d="M1.2 -5.4l1.2 .2" stroke="#f0883e" stroke-width=".4"/>`));
    case 'snowball':
      return g(cat + fx(burst(T, -6, -12, C.snow, c.t0 + 0.3, [[6, 9]], 1) + burst(T, 0, -4, C.snow, c.t0 + 0.7, [[-6, -8]], 1)));
    case 'sapling':
      return g(`<ellipse cx="0" cy="-0.3" rx="2" ry=".6" fill="#8a5a33"/>` + grow(c.t0 + 0.3, c.t1, `<path d="M0 0V-4" stroke="#2da44e" stroke-width=".6"/><ellipse cx="-1" cy="-3.6" rx="1" ry=".5" fill="#2da44e"/><ellipse cx="1" cy="-4.2" rx="1" ry=".5" fill="#2da44e"/>`) +
        fx(burst(T, -1.6, -6, C.water, c.t0 + 0.3, [[1, 5], [2, 5]], 0.4)));
    case 'flowers':
      return g(`<path d="M-2 0V-3M0 0V-4M2 0V-3" stroke="#2da44e" stroke-width=".5"/><circle cx="-2" cy="-3.2" r=".9" fill="#f4a6c1"/><circle cx="0" cy="-4.2" r=".9" fill="#e3b341"/><circle cx="2" cy="-3.2" r=".9" fill="#a371f7"/>` +
        fx(burst(T, -2.6, -7, C.water, c.t0 + 0.3, [[1, 3], [2, 3]], 0.4)));
    case 'dandelion':
      return g(hide(c.phases[0].t1 - 0.1, FOOD.dandelion(C).replace('<circle', '<circle cy="-2"').replace('V2', 'V0').replace('M0 0', 'M0 -2'))) + held('dandelion') +
        fx(burst(T, c.stop + 3, c.y - 14, '#ffffff', c.phases[1].t0 + 0.2, [[6, -4], [8, -1], [5, -7]], 0.4));
    case 'butterfly':
      return g(fly([[c.t1 - 0.4, '0 0'], [c.t1, '-1 -2']], [[c.t1 - 0.1, 1], [c.t1, 0]],
        `<g transform="translate(0 -9)"><g class="act">${loopAnim('scale', ['1 1', '0.3 1', '1 1'], 0.3)}<path d="M0 0l-1.6 -1.2v2.4zM0 0l1.6 -1.2v2.4z" fill="#a371f7"/></g></g>`));
    case 'rabbit':
      return g(`<ellipse cx="5" cy="-0.3" rx="1.8" ry=".6" fill="#24292f" opacity=".7"/>` +
        fly([[c.t0, '0 0'], [c.t1 - 0.2, '4.6 0']], [[c.t1 - 0.3, 1], [c.t1 - 0.1, 0]],
          `<ellipse cx="0" cy="-1.4" rx="1.6" ry="1.2" fill="#d0d7de"/><circle cx="1.4" cy="-2.6" r=".9" fill="#d0d7de"/><path d="M1.2 -3.4l-.2 -1.6M1.8 -3.4l.3 -1.5" stroke="#d0d7de" stroke-width=".5"/>`));
    case 'ducks':
      return g(puddle(4.4) + `<g transform="translate(-1.6 -0.6)"><ellipse rx="1.2" ry=".8" fill="#ffd33d"/><circle cx=".9" cy="-0.9" r=".6" fill="#ffd33d"/></g><g transform="translate(1.8 -0.6)"><ellipse rx="1.2" ry=".8" fill="#ffd33d"/><circle cx=".9" cy="-0.9" r=".6" fill="#ffd33d"/></g>` +
        fx(burst(T, -5, -11, '#d4a72c', c.t0 + 0.4, [[3, 10], [6, 10]], 0.35)));
    case 'goose':
      return g(fly([[c.t0 + 0.4, '0 0'], [c.t1 + 0.4, '10 0']], [[c.t1, 1], [c.t1 + 0.4, 0]],
        `<ellipse cx="0" cy="-2" rx="2.2" ry="1.5" fill="#ffffff" stroke="#d0d7de" stroke-width=".3"/><path d="M1.6 -2.6V-5.4" stroke="#ffffff" stroke-width=".9"/><circle cx="1.8" cy="-5.6" r=".8" fill="#ffffff"/><path d="M2.5 -5.6h1" stroke="#f0883e" stroke-width=".5"/><path d="M-0.4 -0.6V0M0.6 -0.6V0" stroke="#f0883e" stroke-width=".4"/>`));
    case 'chest':
      return g(`<rect x="-2.6" y="-3" width="5.2" height="3" rx=".4" fill="#8a5a33"/><rect x="-0.4" y="-2.4" width=".8" height="1" fill="#e3b341"/>` +
        `<g class="act">${T([[c.t0 + 0.4, '0 -2.6 -3'], [c.t0 + 0.8, '-70 -2.6 -3']], { type: 'rotate' })}<path d="M-2.6 -3a2.6 1.4 0 0 1 5.2 0z" fill="#9c6331"/></g>` +
        fx(burst(T, 0, -3.4, '#e3b341', c.t0 + 0.8, [[-3, -5], [0, -7], [3, -5]], 0.5)));
    case 'bell':
      return g(post(10) + `<path d="M-0.5 -10H3" stroke="${C.gear}" stroke-width=".7"/><g class="act">${T([[c.t0 + 0.2, '0 3 -10'], [c.t0 + 0.4, '25 3 -10'], [c.t0 + 0.6, '-25 3 -10'], [c.t0 + 0.8, '15 3 -10'], [c.t1, '0 3 -10']], { type: 'rotate' })}<path d="M1.6 -7a1.4 2 0 0 1 2.8 0z" fill="#e3b341"/></g>`);
    case 'selfie':
      return at(c.stop + 4.4, c.y - 18.4, fx(`<circle r="2.4" fill="#ffffff" opacity="0">${T([[mid - 0.01, 0], [mid, 0.9], [mid + 0.15, 0.9], [mid + 0.16, 0]], { attr: 'opacity', calc: 'discrete' })}</circle>`));
    case 'telescope':
      return g(`<path d="M0 0L1 -4M2 0L1 -4M1 0V-4" stroke="${C.gear}" stroke-width=".5"/><rect x="-2.4" y="-6.4" width="5.6" height="1.6" rx=".6" fill="${C.pants}" transform="rotate(-25 1 -5.6)"/>`);
    case 'hammock':
      return g(`<path d="M-6 0V-6M6 0V-6" stroke="${C.gear}" stroke-width=".8"/><path d="M-6 -5.6Q0 -2.4 6 -5.6" stroke="#58a6ff" stroke-width=".9" fill="none"/>` +
        fx(`<text x="2" y="-10" font-size="4" fill="${C.label}" opacity="0">z${T([[c.t0 + 0.3, 0], [c.t0 + 0.31, 1], [c.t1, 1], [c.t1 + 0.01, 0]], { attr: 'opacity', calc: 'discrete' })}</text>`));
    case 'windmill':
      return g(post(7) + `<g transform="translate(0 -7)"><g class="act">${T([[c.t1 - 0.2, '0'], [c.t1 + 2, '360'], [c.t1 + 4, '720']], { type: 'rotate' })}` +
        `<path d="M0 0L-0.6 -3.6H0.6ZM0 0L3.6 -0.6V0.6ZM0 0L0.6 3.6H-0.6ZM0 0L-3.6 0.6V-0.6Z" fill="#f6f1e7" stroke="${C.gear}" stroke-width=".2"/></g></g>`);
    case 'dig':
      return g(`<ellipse cx="0" cy="-0.4" rx="2.4" ry=".8" fill="#8a5a33"/>` +
        fx(`<g opacity="0">${T([[c.t1 - 0.4, 0], [c.t1 - 0.39, 1], [c.t1 + 0.8, 1], [c.t1 + 0.81, 0]], { attr: 'opacity', calc: 'discrete' })}<g>${T([[c.t1 - 0.4, '0 0'], [c.t1, '0 -5']], { type: 'translate' })}` +
          `<path d="M-1.6 -1H1.6" stroke="#f6f1e7" stroke-width=".7" stroke-linecap="round"/><circle cx="-1.6" cy="-1.3" r=".45" fill="#f6f1e7"/><circle cx="-1.6" cy="-0.7" r=".45" fill="#f6f1e7"/><circle cx="1.6" cy="-1.3" r=".45" fill="#f6f1e7"/><circle cx="1.6" cy="-0.7" r=".45" fill="#f6f1e7"/></g></g>`));
    case 'snowroll':
      return g(`<g class="act">${T([[c.t0, '0 0'], [c.t1, '5 0']], { type: 'translate' })}<g transform="translate(0 0)"><g class="act">${T([[c.t0, '1 1'], [c.t1, '1.5 1.5']], { type: 'scale' })}<circle cy="-2" r="2" fill="${C.snow}"/></g></g></g>`);
    case 'umbrella':
      return at(c.stop, c.y, fx(burst(T, -4, -30, C.water, c.t0, [[0, 10], [3, 10]], 0.35) + burst(T, 6, -30, C.water, c.t0 + 0.4, [[0, 12], [2, 12]], 0.35)));
    case 'hat':
      return at(c.stop, c.y, fx(burst(T, -10, -10, '#e08a2e', c.t0, [[20, -4], [18, 2]], 0.5)));
    case 'scarecrow':
      return g(`<path d="M0 0V-12M-3.4 -8.6H3.4" stroke="#8a5a33" stroke-width=".8"/><rect x="-1.6" y="-9.4" width="3.2" height="4" rx=".4" fill="#bc4c00"/><circle cy="-11" r="1.4" fill="#e3b341"/><path d="M-2 -12.2h4l-2 -1.6z" fill="#8a5a33"/>`);
    case 'pennant':
      return g(appear(c.t0 + 0.6, `<path d="M0 0V-8" stroke="${C.pole}" stroke-width=".6"/><path d="M0.3 -8l3.4 1.2l-3.4 1.2z" fill="#58a6ff"/>`));
    default:
      // flask, binoculars, juggle, pushups, yoga, skiprope, kite, map, pogo, skateboard, bicycle,
      // stilts, carrylog: the gear is in his hands (see the pose).
      return '';
  }
}

/** px he advances during a moving challenge (the sheep stays where the ride ends). */
function CHALLENGES_MOVE(c, ctx) {
  const seg = ctx.route.segs.filter((s) => s.t0 >= c.t0 - 1e-9 && s.t1 <= c.t1 + 1e-9);
  return seg.length ? seg.at(-1).to[0] - seg[0].from[0] : 0;
}
