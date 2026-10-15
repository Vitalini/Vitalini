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

const W = ['winter'];
const SP = ['spring'];
const SU = ['summer'];
const AU = ['autumn'];
const WARM = ['spring', 'summer', 'autumn'];

/**
 * The challenge registry. Each kind: `phases` [[pose, seconds], ...] (one pose = one phase),
 * `move` (px he advances during it; 0 = he stands still), `off` (anchor offset from the plateau
 * middle), `reach` (how far left of the anchor he starts), `seasons` (all when absent), `needs`
 * ('down' / 'up': the next plateau must be lower / higher). `set` marks the set pieces that go to the
 * strongest weeks; every other kind is a quick challenge for one week.
 */
const k = (phases, o = {}) => ({ phases: typeof phases === 'string' ? [[phases, o.dur ?? 1.1]] : phases, move: 0, off: 0, reach: 0, ...o });
export const CHALLENGES = {
  // set pieces
  campfire: k('sit', { dur: 2.6, off: 2, reach: 8, set: true }),
  boulder: k('push', { dur: 2.0, off: 2.5, reach: 8.4, set: true, needs: 'down' }),
  'boulder-uphill': k('push', { dur: 2.0, off: 2.5, reach: 8.4, set: true, needs: 'up' }),
  tree: k('saw', { dur: 2.0, off: 2, reach: 6.5, set: true }),
  'tree-axe': k('chop', { dur: 2.0, off: 2, reach: 6, set: true }),
  'apple-tree': k([['reach', 0.8], ['eat', 0.8]], { off: 2.5, reach: 4.5, set: true, seasons: ['summer', 'autumn'] }),
  drift: k('shovel', { dur: 1.8, off: 1, reach: 7.5, set: true, seasons: W }),
  // the first minis
  puddle: k('jump', { dur: 0.9, move: 10, reach: 5, seasons: WARM }),
  fence: k('jump', { dur: 1.0, move: 10, reach: 5 }),
  log: k('balance', { dur: 1.1, move: 9, reach: 4.5 }),
  bush: k('chop', { dur: 1.1, off: 2, reach: 6 }),
  bee: k('swat', { dur: 1.0, off: 2, reach: 4, seasons: ['spring', 'summer'] }),
  mushroom: k([['crouch', 0.5], ['eat', 0.6]], { off: 2, reach: 4, seasons: WARM }),
  cat: k('crouch', { dur: 1.2, off: 2.5, reach: 5 }),
  bird: k('wave', { dur: 0.9, off: 3, reach: 6 }),
  rock: k('push', { dur: 1.0, off: 2, reach: 5.5 }),
  pinecone: k('kick', { dur: 0.9, off: 2, reach: 3.5, seasons: AU }),
  ice: k('slip', { dur: 1.0, seasons: W }),
  shake: k('shake', { dur: 1.0, seasons: W }),
  flask: k('drink', { dur: 1.0 }),
  binoculars: k('look', { dur: 1.0 }),
  // food
  sandwich: k([['crouch', 0.5], ['eat', 0.8]], { off: 2, reach: 4.5 }),
  berries: k([['crouch', 0.5], ['eat', 0.7]], { off: 2, reach: 4.5, seasons: ['summer', 'autumn'] }),
  honey: k([['reach', 0.6], ['eat', 0.7]], { off: 2.5, reach: 4.5, seasons: ['spring', 'summer'] }),
  marshmallow: k('roast', { dur: 1.2, off: 3, reach: 7 }),
  cocoa: k('eat', { dur: 1.1, seasons: W }),
  icecream: k('eat', { dur: 1.1, seasons: SU }),
  fish: k([['crouch', 0.6], ['eat', 0.7]], { off: 2, reach: 4.5, seasons: WARM }),
  watermelon: k('eat', { dur: 1.1, seasons: SU }),
  carrot: k([['crouch', 0.6], ['eat', 0.7]], { off: 2, reach: 4.5, seasons: WARM }),
  corn: k('roast', { dur: 1.2, off: 3, reach: 7, seasons: ['summer', 'autumn'] }),
  pie: k([['crouch', 0.5], ['eat', 0.7]], { off: 2, reach: 4.5, seasons: AU }),
  coffee: k([['crouch', 0.5], ['eat', 0.7]], { off: 2, reach: 4.5 }),
  nut: k([['crouch', 0.5], ['eat', 0.7]], { off: 2, reach: 4 }),
  pizza: k([['look', 0.6], ['eat', 0.8]], {}),
  banana: k([['eat', 0.7], ['slip', 0.6]], {}),
  // movement and gear
  pogo: k('pogo', { dur: 1.2, move: 10, reach: 5 }),
  trampoline: k('bounce', { dur: 1.2 }),
  skateboard: k('skate', { dur: 1.0, move: 10, reach: 5 }),
  bicycle: k('bike', { dur: 1.0, move: 10, reach: 5 }),
  polevault: k('vault', { dur: 1.1, move: 10, reach: 5 }),
  limbo: k('limbo', { dur: 1.3, move: 8, reach: 4 }),
  hopscotch: k('hop', { dur: 1.2, move: 10, reach: 5 }),
  stilts: k('stilts', { dur: 1.2, move: 9, reach: 4.5 }),
  sheep: k('ride', { dur: 1.3, move: 8, reach: 4 }),
  raft: k('raft', { dur: 1.2, move: 6, reach: 3, seasons: WARM }),
  // nature and the rest
  snowman: k('crouch', { dur: 1.3, off: 2.5, reach: 5, seasons: W }),
  snowball: k('toss', { dur: 1.2, off: 3, reach: 6, seasons: W }),
  sapling: k('pour', { dur: 1.3, off: 3, reach: 6, seasons: ['spring', 'summer'] }),
  flowers: k('pour', { dur: 1.2, off: 3, reach: 6, seasons: ['spring', 'summer'] }),
  dandelion: k([['crouch', 0.5], ['blow', 0.7]], { off: 2, reach: 4, seasons: SP }),
  butterfly: k('net', { dur: 1.2, off: 2, reach: 3, seasons: ['spring', 'summer'] }),
  rabbit: k('run', { dur: 1.0, move: 6, off: 1, reach: 6 }),
  ducks: k('toss', { dur: 1.2, off: 3, reach: 6, seasons: WARM }),
  goose: k('wave', { dur: 1.1, off: 3, reach: 6 }),
  chest: k('crouch', { dur: 1.3, off: 2.5, reach: 5 }),
  bell: k('reach', { dur: 1.1, off: 2.5, reach: 3.5 }),
  selfie: k('selfie', { dur: 1.1 }),
  telescope: k('peer', { dur: 1.2, off: 2.5, reach: 3.5 }),
  hammock: k('lie', { dur: 1.4 }),
  windmill: k('crouch', { dur: 1.2, off: 2.5, reach: 5 }),
  dig: k('shovel', { dur: 1.2, off: 1, reach: 6.5 }),
  juggle: k('juggle', { dur: 1.3 }),
  pushups: k('pushup', { dur: 1.3 }),
  yoga: k('yoga', { dur: 1.3 }),
  skiprope: k('skip', { dur: 1.2 }),
  carrylog: k('carry', { dur: 1.2, move: 8, reach: 4 }),
  snowroll: k('push', { dur: 1.3, move: 5, off: 2, reach: 6, seasons: W }),
  kite: k('kite', { dur: 1.3, seasons: WARM }),
  umbrella: k('umbrella', { dur: 1.2, seasons: SP }),
  hat: k('hat', { dur: 1.1, seasons: ['spring', 'autumn'] }),
  map: k('map', { dur: 1.1 }),
  scarecrow: k('reach', { dur: 1.1, off: 2.5, reach: 4.5, seasons: AU }),
  football: k('kick', { dur: 1.0, off: 2, reach: 3.5 }),
  pennant: k('crouch', { dur: 1.0, off: 2, reach: 4 }),
};
for (const c of Object.values(CHALLENGES)) c.dur = c.phases.reduce((s, [, d]) => s + d, 0);
export const SET_PIECES = Object.keys(CHALLENGES).filter((t) => CHALLENGES[t].set);
export const MINIS = Object.keys(CHALLENGES).filter((t) => !CHALLENGES[t].set);

/**
 * A different challenge on every plateau. Set pieces go to the strongest buckets: the campfire to
 * the busiest; one boulder pushed off the edge and one rolled uphill in the top 10% (where the next
 * plateau is lower / higher); the three tree kinds in the rest of the top 25%; the snow drift on the
 * busiest Dec–Feb bucket left. Then, strongest bucket first, each plateau takes the unused kind
 * allowed in its season with the lowest hash of (its first date + kind). No kind is used twice
 * while unused kinds remain (always, for the 53 weeks of a year).
 * Each: { type, bucket, x (anchor), y (plateau top), stop (walker start) }.
 */
export function placeChallenges(model, terrain) {
  const { buckets } = terrain;
  const order = buckets.map((b, i) => i).sort((a, c) => buckets[c].sum - buckets[a].sum || a - c);
  const type = new Map();
  const used = new Set();
  const take = (i, t) => {
    type.set(i, t);
    used.add(t);
  };
  const fits = (i, t) => {
    const spec = CHALLENGES[t];
    const b = buckets[i];
    if (spec.seasons && !spec.seasons.includes(bucketSeason(model, b))) return false;
    if (spec.needs === 'down' && !(buckets[i + 1] && buckets[i + 1].h < b.h)) return false;
    if (spec.needs === 'up' && !(buckets[i + 1] && buckets[i + 1].h > b.h)) return false;
    return true;
  };
  const byHash = (list, t) => [...list].sort((a, c) => hash(buckets[a].first + t) - hash(buckets[c].first + t) || a - c);
  const free = (list) => list.filter((i) => !type.has(i));
  const active = order.filter((i) => buckets[i].sum > 0);
  if (active.length) take(active[0], 'campfire');
  const top10 = active.slice(1, Math.max(2, Math.ceil(buckets.length * 0.1)));
  const top25 = active.slice(1, Math.ceil(buckets.length * 0.25));
  for (const [t, pool] of [['boulder', top10], ['boulder-uphill', top10], ['tree', top25], ['tree-axe', top25], ['apple-tree', top25], ['drift', active]]) {
    const i = byHash(free(pool).filter((j) => fits(j, t)), t)[0];
    if (i !== undefined) take(i, t);
  }
  for (const i of order) {
    if (type.has(i)) continue;
    let pool = MINIS.filter((t) => !used.has(t) && fits(i, t));
    // More plateaus than kinds (day buckets): reuse, but never next to the same kind.
    if (!pool.length) pool = MINIS.filter((t) => fits(i, t) && type.get(i - 1) !== t && type.get(i + 1) !== t);
    take(i, pool.sort((a, c) => hash(buckets[i].first + a) - hash(buckets[i].first + c) || (a < c ? -1 : 1))[0]);
  }
  return buckets.map((b, i) => {
    const t = type.get(i);
    const spec = CHALLENGES[t];
    const x = r2((b.flat0 + b.flat1) / 2 + spec.off);
    return { type: t, bucket: i, x, y: BASE - b.h, stop: r2(x - spec.reach) };
  });
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
    c.phases = [];
    for (const [pose, dur] of spec.phases) {
      const to = spec.move ? [r2(pos[0] + (spec.move * dur) / spec.dur), y] : pos;
      c.phases.push({ pose, t0: clock, t1: clock + dur });
      push(to, pose, dur);
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
