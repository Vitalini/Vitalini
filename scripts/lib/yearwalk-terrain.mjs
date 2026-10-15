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
export const LADDER_MAX = Math.round(0.06 * H_MAX); // a rise up to this gets a ladder, a taller one a rope
export const HOP_MAX = Math.round(0.06 * H_MAX); // a drop up to this is walked down, a deeper one is slid down

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
 * bucket totals. Each boundary between two plateaus of different height is a transition:
 * `ladder` / `rope` for a rise, `hop` (walked down) / `slide` (slid down the wall) for a drop.
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
    const kindOf = d > 0 ? (d <= LADDER_MAX ? 'ladder' : 'rope') : -d <= HOP_MAX ? 'hop' : 'slide';
    transitions.push({ i, x: L.x1, low: Math.min(L.h, R.h), high: Math.max(L.h, R.h), kind: kindOf });
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

// Anchor of each challenge relative to the plateau middle, and how far left of it the walker stands.
// With the 1.3x sprites every object stays inside a 15-px plateau.
const OFFSET = { campfire: 2, boulder: 2.5, tree: 2, drift: 1, cat: 0, bird: 0 };
const REACH = { campfire: 8, boulder: 8.4, tree: 6.5, drift: 7.5, cat: 0, bird: 0 };

/**
 * Challenges on plateau tops, bigger for stronger buckets:
 * - campfire on the busiest bucket (the flag is planted there after the rest),
 * - up to 2 boulders in the top 10% (only where the next plateau is lower, so it can roll off),
 * - up to 3 trees to saw in the rest of the top 25%,
 * - 1 snow drift on the busiest Dec–Feb bucket left,
 * - 1 sleeping cat in the middle of the ranking, 1 bird in the bottom 30%.
 * Each: { type, bucket, x (object anchor), y (plateau top), stop (walker x while acting) }.
 */
export function placeChallenges(model, terrain) {
  const { buckets } = terrain;
  const ranked = buckets.map((b, i) => i).filter((i) => buckets[i].sum > 0).sort((a, c) => buckets[c].sum - buckets[a].sum || a - c);
  const used = new Set();
  const out = [];
  const byHash = (list) => [...list].sort((a, c) => hash(buckets[a].first) - hash(buckets[c].first) || a - c);
  const add = (type, i) => {
    const b = buckets[i];
    const mid = (b.flat0 + b.flat1) / 2;
    const x = Math.round((mid + OFFSET[type]) * 10) / 10;
    out.push({ type, bucket: i, x, y: BASE - b.h, stop: Math.round((x - REACH[type]) * 10) / 10 });
    used.add(i);
  };
  const free = (list) => list.filter((i) => !used.has(i) && buckets[i].flat1 - buckets[i].flat0 >= 8);
  if (ranked.length) add('campfire', ranked[0]);
  const top10 = ranked.slice(1, Math.max(2, Math.ceil(buckets.length * 0.1)));
  for (const i of byHash(free(top10).filter((i) => buckets[i + 1] && buckets[i + 1].h < buckets[i].h)).slice(0, 2)) add('boulder', i);
  for (const i of byHash(free(ranked.slice(0, Math.ceil(buckets.length * 0.25)))).slice(0, 3)) add('tree', i);
  const winter = free(ranked.filter((i) => bucketSeason(model, buckets[i]) === 'winter'));
  if (winter.length) add('drift', winter[0]);
  const n = ranked.length;
  const mid = free(ranked.slice(Math.floor(n * 0.4), Math.ceil(n * 0.6)));
  if (mid.length) add('cat', byHash(mid)[0]);
  const low = free(ranked.slice(Math.floor(n * 0.7)));
  if (low.length) add('bird', byHash(low)[0]);
  return out.sort((a, c) => a.bucket - c.bucket);
}

// Walker speeds in px/s and action lengths in s. The loop length is whatever the route adds up to.
export const SPEED = { walk: 48, ladder: 44, rope: 56, slide: 120, tiptoe: 14, bird: 10 };
export const ACTION = { saw: 2.2, push: 2.4, sit: 3.0, shovel: 2.0 };
const ACT_OF = { tree: 'saw', boulder: 'push', campfire: 'sit', drift: 'shovel' };
export const POSE_OF = { walk: 'walk', tiptoe: 'walk', bird: 'walk', ladder: 'climb', rope: 'climb', slide: 'climb', saw: 'saw', push: 'push', sit: 'sit', shovel: 'shovel' };

/**
 * The walker's timeline, relative to (X0, BASE). Segments { from, to, mode, t0, t1 } in seconds.
 * Feet stay on a plateau top except while climbing; action segments are pauses (from = to).
 * Each challenge gets `t0`/`t1`: the window of its action (or of the slow walk past it).
 */
export function walkerRoute(model, terrain, challenges = placeChallenges(model, terrain)) {
  const { buckets, transitions } = terrain;
  const at = new Map(transitions.map((t) => [t.i, t]));
  const ch = new Map(challenges.map((c) => [c.bucket, c]));
  const segs = [];
  let pos = [Math.round((buckets[0].x0 + 1 - X0) * 10) / 10, -buckets[0].h];
  let clock = 0;
  const go = (x, y, mode) => {
    const to = [Math.round((x - X0) * 10) / 10, y];
    const dist = Math.hypot(to[0] - pos[0], to[1] - pos[1]);
    if (dist < 0.05 || to[0] < pos[0] - 0.05) return;
    const dt = dist / SPEED[mode];
    segs.push({ from: pos, to, mode, t0: clock, t1: clock + dt });
    clock += dt;
    pos = to;
  };
  const act = (mode) => {
    segs.push({ from: pos, to: pos, mode, t0: clock, t1: clock + ACTION[mode] });
    clock += ACTION[mode];
  };
  buckets.forEach((b, i) => {
    const y = -b.h;
    const c = ch.get(i);
    if (c) {
      const t0 = clock;
      if (c.type === 'cat') {
        go(c.x - 6, y, 'walk');
        c.t0 = clock;
        go(c.x + 6, y, 'tiptoe');
        c.t1 = clock;
      } else if (c.type === 'bird') {
        go(b.flat0 + 1, y, 'walk');
        c.t0 = clock;
        go(b.flat1 - 1, y, 'bird');
        c.t1 = clock;
      } else {
        go(c.stop, y, 'walk');
        c.stop = Math.round((pos[0] + X0) * 10) / 10; // where he actually stands (he never walks back)
        c.t0 = clock;
        act(ACT_OF[c.type]);
        c.t1 = clock;
      }
      if (c.t0 === undefined) c.t0 = t0;
    }
    const t = at.get(i);
    if (!t) return;
    const next = -buckets[i + 1].h;
    if (t.kind === 'ladder') {
      go(t.x - 5, y, 'walk');
      go(t.x - 1.5, next, 'ladder');
      go(t.x + 2.5, next, 'walk');
    } else if (t.kind === 'rope') {
      go(t.x - 3, y, 'walk');
      t.t0 = clock;
      go(t.x - 3, next, 'rope');
      t.t1 = clock;
      go(t.x + 2.5, next, 'walk');
    } else if (t.kind === 'hop') {
      go(t.x - 1, y, 'walk');
      go(t.x + 3, next, 'walk');
    } else {
      go(t.x + 3, y, 'walk');
      t.t0 = clock;
      go(t.x + 3, next, 'slide');
      t.t1 = clock;
      go(t.x + 4, next, 'walk');
    }
  });
  go(buckets.at(-1).x1 - 1, -buckets.at(-1).h, 'walk');
  return { segs, loop: clock };
}
