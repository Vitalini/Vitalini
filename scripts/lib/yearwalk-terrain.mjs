// Year Walk geometry: buckets of days -> plateaus, challenges, ladders/ropes and the walker timeline.
// Pure math, no SVG strings.

import { percentile } from './calendar.mjs';

export const WIDTH = 880;
export const HEIGHT = 440;
export const X0 = 24; // left edge of the terrain
export const PLOT_W = WIDTH - 2 * X0;
export const BASE = 372; // ground line: a zero bucket sits here
export const H_MIN = 3; // a bucket with 1 contribution
export const H_MAX = 290; // a bucket at the cap: its top is at ~81% of the image height
export const LADDER_MAX = Math.round(0.06 * H_MAX); // a step up to this gets a ladder, a taller one a rope

export const BUCKETS = ['day', 'week', 'halfmonth', 'month'];

/**
 * Group the days into buckets. `day` = one bucket per day, `week` = GitHub's calendar weeks,
 * `halfmonth` = 1st–15th and 16th–end of each month, `month` = calendar months.
 * Each bucket: { first, last, start, end (day index, exclusive), sum, days }.
 */
export function bucketize(model, kind = 'halfmonth') {
  if (!BUCKETS.includes(kind)) throw new Error(`unknown bucket "${kind}" (use ${BUCKETS.join(', ')})`);
  const keyed = [];
  model.weeks.forEach((week, w) => {
    for (const d of week) {
      const key =
        kind === 'day' ? d.date
        : kind === 'week' ? String(w)
        : kind === 'month' ? d.date.slice(0, 7)
        : `${d.date.slice(0, 7)}${Number(d.date.slice(8)) <= 15 ? 'a' : 'b'}`;
      keyed.push({ key, d });
    }
  });
  const out = [];
  keyed.forEach(({ key, d }, i) => {
    const b = out.at(-1);
    if (b && b.key === key) {
      b.last = d.date;
      b.end = i + 1;
      b.sum += d.count;
      b.days += 1;
    } else {
      out.push({ key, first: d.date, last: d.date, start: i, end: i + 1, sum: d.count, days: 1 });
    }
  });
  return out.map(({ key, ...b }) => b);
}

/** Square-root height with a cap: 0 -> 0 (flat ground), 1..cap -> H_MIN..H_MAX, above the cap -> H_MAX. */
export function heightFor(sum, cap) {
  if (sum <= 0) return { h: 0, t: 0 };
  const t = Math.sqrt(Math.min(sum, cap) / cap);
  return { h: Math.max(H_MIN, Math.round(H_MIN + (H_MAX - H_MIN) * t)), t };
}

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * Lay the buckets out left to right as flat-topped plateaus. Width is proportional to the number of
 * days, so a partial bucket at either end is narrower. The cap is the 99th percentile of the non-zero
 * bucket totals. Each boundary between two plateaus of different height is a transition: a `ladder`
 * (up to LADDER_MAX px) or a `rope`, on the higher plateau's wall, used to climb up or down.
 */
export function layoutTerrain(model, kind = 'week') {
  const buckets = bucketize(model, kind);
  const dayCount = buckets.at(-1).end;
  const ppd = PLOT_W / dayCount;
  const xOf = (dayIndex) => r2(X0 + dayIndex * ppd);
  const active = buckets.map((b) => b.sum).filter((s) => s > 0).sort((a, b) => a - b);
  const cap = Math.max(1, percentile(active, 99));
  for (const b of buckets) {
    b.x0 = xOf(b.start);
    b.x1 = xOf(b.end);
    Object.assign(b, heightFor(b.sum, cap));
    b.flat0 = r2(b.x0 + 0.5);
    b.flat1 = r2(b.x1 - 0.5);
  }
  const transitions = [];
  for (let i = 0; i + 1 < buckets.length; i++) {
    const L = buckets[i];
    const R = buckets[i + 1];
    const d = R.h - L.h;
    if (d === 0) continue;
    const kindOf = Math.abs(d) <= LADDER_MAX ? 'ladder' : 'rope';
    const up = d > 0;
    // The prop hangs on the higher plateau's wall, on the side of the lower one; [xa, xb] is its x-range.
    const [xa, xb] = up ? [L.x1 - 5, L.x1 + 1] : [L.x1 - 1, L.x1 + 5];
    transitions.push({ i, x: L.x1, low: Math.min(L.h, R.h), high: Math.max(L.h, R.h), kind: kindOf, up, xa: r2(xa), xb: r2(xb) });
  }
  return { kind, buckets, transitions, cap, dayCount, ppd, xOf };
}

const season = (date) => {
  const m = Number(date.slice(5, 7));
  return m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn';
};
/** The month a bucket belongs to: the month of its middle day. */
export const bucketDate = (model, b) => model.weeks.flat()[Math.floor((b.start + b.end - 1) / 2)].date;
export const bucketSeason = (model, b) => season(bucketDate(model, b));

/** Small deterministic string hash (FNV-1a), so the choice varies by week but never between runs. */
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/**
 * Every challenge: the walker pose while doing it, its length in seconds, `move` (px he advances
 * during it; 0 = he stands still), `off` (anchor offset from the plateau middle), `reach` (how far
 * left of the anchor he stands or starts), and the seasons it may appear in (all when absent).
 * The first four are the set pieces on the strongest weeks; the rest are the quick mini-challenges.
 */
export const CHALLENGES = {
  campfire: { pose: 'sit', dur: 2.6, move: 0, off: 2, reach: 8 },
  boulder: { pose: 'push', dur: 2.0, move: 0, off: 2.5, reach: 8.4 },
  tree: { pose: 'saw', dur: 2.0, move: 0, off: 2, reach: 6.5 },
  drift: { pose: 'shovel', dur: 1.8, move: 0, off: 1, reach: 7.5 },
  puddle: { pose: 'jump', dur: 0.8, move: 10, off: 0, reach: 5, seasons: ['spring', 'summer', 'autumn'] },
  fence: { pose: 'jump', dur: 0.9, move: 10, off: 0, reach: 5 },
  log: { pose: 'balance', dur: 1.1, move: 9, off: 0, reach: 4.5 },
  bush: { pose: 'chop', dur: 1.1, move: 0, off: 2, reach: 6 },
  bee: { pose: 'swat', dur: 1.0, move: 0, off: 2, reach: 4, seasons: ['spring', 'summer'] },
  mushroom: { pose: 'crouch', dur: 1.0, move: 0, off: 2, reach: 4, seasons: ['spring', 'summer', 'autumn'] },
  cat: { pose: 'crouch', dur: 1.2, move: 0, off: 2.5, reach: 5 },
  bird: { pose: 'wave', dur: 0.9, move: 0, off: 3, reach: 6 },
  rock: { pose: 'push', dur: 1.0, move: 0, off: 2, reach: 5.5 },
  pinecone: { pose: 'kick', dur: 0.8, move: 0, off: 2, reach: 3.5, seasons: ['autumn'] },
  ice: { pose: 'slip', dur: 1.0, move: 0, off: 0, reach: 0, seasons: ['winter'] },
  shake: { pose: 'shake', dur: 0.9, move: 0, off: 0, reach: 0, seasons: ['winter'] },
  flask: { pose: 'drink', dur: 0.9, move: 0, off: 0, reach: 0 },
  binoculars: { pose: 'look', dur: 1.0, move: 0, off: 0, reach: 0 },
};
export const SET_PIECES = ['campfire', 'boulder', 'tree', 'drift'];
export const MINIS = Object.keys(CHALLENGES).filter((k) => !SET_PIECES.includes(k));

/**
 * One challenge on every plateau. Set pieces go to the strongest buckets: the campfire to the busiest,
 * up to 2 boulders in the top 10% (only where the next plateau is lower, so it rolls off), up to 3
 * trees in the rest of the top 25%, a snow drift on the busiest Dec–Feb bucket left. Every other
 * plateau gets a mini-challenge picked by a hash of its first date, allowed in its season, never the
 * same as its left neighbour. Each: { type, bucket, x (anchor), y (plateau top), stop (walker start) }.
 */
export function placeChallenges(model, terrain) {
  const { buckets } = terrain;
  const ranked = buckets.map((b, i) => i).filter((i) => buckets[i].sum > 0).sort((a, c) => buckets[c].sum - buckets[a].sum || a - c);
  const type = new Map();
  const byHash = (list) => [...list].sort((a, c) => hash(buckets[a].first) - hash(buckets[c].first) || a - c);
  const free = (list) => list.filter((i) => !type.has(i));
  if (ranked.length) type.set(ranked[0], 'campfire');
  const top10 = ranked.slice(1, Math.max(2, Math.ceil(buckets.length * 0.1)));
  // Up to `max` of a set piece, never on two neighbouring plateaus.
  const spread = (list, kind, max) => {
    for (const i of list) {
      if ([...type.values()].filter((t) => t === kind).length >= max) break;
      if (type.get(i - 1) !== kind && type.get(i + 1) !== kind) type.set(i, kind);
    }
  };
  spread(byHash(free(top10).filter((i) => buckets[i + 1] && buckets[i + 1].h < buckets[i].h)), 'boulder', 2);
  spread(byHash(free(ranked.slice(0, Math.ceil(buckets.length * 0.25)))), 'tree', 3);
  const winter = free(ranked.filter((i) => bucketSeason(model, buckets[i]) === 'winter'));
  if (winter.length) type.set(winter[0], 'drift');
  const out = [];
  buckets.forEach((b, i) => {
    let t = type.get(i);
    if (!t) {
      const s = bucketSeason(model, b);
      const prev = out.at(-1)?.type;
      const next = type.get(i + 1);
      const pool = MINIS.filter((k) => (!CHALLENGES[k].seasons || CHALLENGES[k].seasons.includes(s)) && k !== prev && k !== next);
      t = pool.sort((a, c) => hash(b.first + a) - hash(b.first + c))[0];
    }
    const spec = CHALLENGES[t];
    const mid = (b.flat0 + b.flat1) / 2;
    const x = r2(mid + spec.off);
    out.push({ type: t, bucket: i, x, y: BASE - b.h, stop: r2(x - spec.reach) });
  });
  return out;
}

// Speeds in px/s. The loop length is whatever the route adds up to.
export const SPEED = { walk: 40, climb: 37, down: 60 };

/** Pose shown for a segment mode. Challenge modes are their own pose names. */
export const poseOf = (mode) => (mode === 'walk' ? 'walk' : mode === 'climb' || mode === 'down' ? 'climb' : mode);

/**
 * The walker's timeline, relative to (X0, BASE): segments { from, to, mode, t0, t1 } in seconds.
 * Horizontal moves happen only on a plateau top, or inside a ladder/rope's x-range while stepping
 * on or off it; vertical moves happen only on a ladder or rope, at its x. Each challenge gets
 * `t0`/`t1`, the window of its action; each transition gets the window of its climb.
 */
export function walkerRoute(model, terrain, challenges = placeChallenges(model, terrain)) {
  const { buckets, transitions } = terrain;
  const at = new Map(transitions.map((t) => [t.i, t]));
  const ch = new Map(challenges.map((c) => [c.bucket, c]));
  const segs = [];
  let pos = [r2(buckets[0].x0 + 1 - X0), -buckets[0].h];
  let clock = 0;
  const push = (to, mode, dt) => {
    segs.push({ from: pos, to, mode, t0: clock, t1: clock + dt });
    clock += dt;
    pos = to;
  };
  const go = (x, y, mode, speed = SPEED[mode]) => {
    const to = [r2(x - X0), y];
    const dist = Math.hypot(to[0] - pos[0], to[1] - pos[1]);
    if (dist < 0.05 || to[0] < pos[0] - 0.05) return;
    push(to, mode, dist / speed);
  };
  buckets.forEach((b, i) => {
    const y = -b.h;
    const c = ch.get(i);
    const spec = CHALLENGES[c.type];
    go(c.stop, y, 'walk');
    c.stop = r2(pos[0] + X0); // where he actually starts (he never walks back)
    c.t0 = clock;
    if (spec.move) {
      const to = [r2(pos[0] + spec.move), y];
      push(to, spec.pose, spec.dur);
    } else {
      push(pos, spec.pose, spec.dur);
    }
    c.t1 = clock;
    const t = at.get(i);
    if (!t) return;
    const next = -buckets[i + 1].h;
    const hug = t.up ? t.x - 2.6 : t.x + 2.6; // his centre on the prop, body against the wall
    go(t.up ? hug : t.x - 1, y, 'walk');
    if (!t.up) go(hug, y, 'down', SPEED.walk); // step off the edge onto the prop
    t.t0 = clock;
    go(hug, next, t.up ? 'climb' : 'down');
    t.t1 = clock;
    if (t.up) go(t.x + 0.6, next, 'climb', SPEED.walk); // step off the prop onto the plateau
  });
  go(buckets.at(-1).x1 - 1, -buckets.at(-1).h, 'walk');
  return { segs, loop: clock };
}
