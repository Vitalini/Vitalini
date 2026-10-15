import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caption, dateRange, percentile, toModel, tooltip } from '../lib/calendar.mjs';
import { THEMES, rampColor, renderYearWalk, scene } from '../lib/yearwalk-render.mjs';
import {
  BASE, CHALLENGES, H_MAX, H_MIN, MINIS, SET_PIECES, SPEED, X0, bucketSeason, bucketize, heightFor, layoutTerrain, poseOf,
} from '../lib/yearwalk-terrain.mjs';

const fixturePath = fileURLToPath(new URL('../fixtures/calendar.json', import.meta.url));
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const model = toModel(fixture);
const light = renderYearWalk(model, 'light');
const dark = renderYearWalk(model, 'dark');
const cli = fileURLToPath(new URL('../yearwalk.mjs', import.meta.url));
const tmp = () => mkdtempSync(join(tmpdir(), 'yearwalk-'));

// Golden files: UPDATE_SNAPSHOTS=1 npm test rewrites them.
function golden(name, actual) {
  const url = new URL(`./snapshots/${name}`, import.meta.url);
  if (process.env.UPDATE_SNAPSHOTS) writeFileSync(url, actual);
  assert.equal(actual, readFileSync(url, 'utf8'), `${name} differs from its golden file`);
}

/** A calendar of `n` consecutive days from `start`, in 7-day weeks, counts from `count(i)`. */
function calendar(n, start, count) {
  const days = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.parse(`${start}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10);
    days.push({ date: d, contributionCount: count(i) });
  }
  const weeks = [];
  for (let i = 0; i < n; i += 7) weeks.push({ contributionDays: days.slice(i, i + 7) });
  const total = days.reduce((s, d) => s + d.contributionCount, 0);
  return { data: { user: { contributionsCollection: { contributionCalendar: { totalContributions: total, weeks } } } } };
}

test('fixture matches the Year Walk golden files', () => {
  golden('yearwalk-light.svg', light);
  golden('yearwalk-dark.svg', dark);
});

test('model: totals match GitHub, caption is computed', () => {
  assert.equal(model.total, 8645);
  assert.equal(model.total, model.daySum);
  assert.equal(caption(model), '8,645 contributions · Oct 2025 – Oct 2026');
  assert.equal(percentile([1, 2, 3, 4], 50), 2);
  assert.equal(percentile([], 99), 0);
});

test('buckets: day columns map one to one (369 and 371 days), week is 53, every day counted once', () => {
  assert.equal(bucketize(model, 'day').length, 369);
  const full = toModel(calendar(371, '2025-10-12', (i) => i % 5));
  const cols = layoutTerrain(full, 'day');
  assert.equal(cols.buckets.length, 371);
  cols.buckets.forEach((b, i) => assert.equal(b.start, i));
  assert.equal(cols.buckets[0].x0, X0);
  assert.equal(cols.buckets.at(-1).x1, 880 - X0);
  for (const kind of ['day', 'week', 'halfmonth', 'month']) {
    const bs = bucketize(model, kind);
    assert.equal(bs.reduce((s, b) => s + b.sum, 0), 8645, kind);
    assert.equal(bs.reduce((s, b) => s + b.days, 0), 369, kind);
  }
  assert.equal(bucketize(model, 'week').length, 53);
  assert.equal(bucketize(model, 'halfmonth').length, 25);
  assert.equal(bucketize(model, 'month').length, 13);
  assert.throws(() => bucketize(model, 'year'), /unknown bucket/);
});

test('zero buckets stay flat on the ground and are not drawn', () => {
  const m = toModel(calendar(371, '2025-10-12', (i) => (i % 3 ? 0 : 4)));
  const t = layoutTerrain(m, 'day');
  for (const b of t.buckets) if (b.sum === 0) assert.equal(b.h, 0);
  const svg = renderYearWalk(m, 'light', 'day');
  const plateaus = (svg.match(/<g class="r">/g) ?? []).length;
  assert.equal(plateaus, t.buckets.filter((b) => b.sum > 0).length);
});

test('height: sqrt scale between H_MIN and H_MAX, capped at the 99th percentile of bucket totals', () => {
  assert.deepEqual(heightFor(0, 100), { h: 0, t: 0 });
  assert.equal(heightFor(100, 100).h, H_MAX);
  assert.equal(heightFor(1e6, 100).h, H_MAX);
  assert.equal(heightFor(25, 100).t, 0.5);
  assert.ok(heightFor(1, 100).h >= H_MIN);
  let prev = 0;
  for (let c = 1; c <= 100; c += 3) {
    const { h } = heightFor(c, 100);
    assert.ok(h >= prev);
    prev = h;
  }
  const t = layoutTerrain(model, 'week');
  const sums = t.buckets.map((b) => b.sum).filter(Boolean).sort((a, b) => a - b);
  assert.equal(t.cap, percentile(sums, 99));
});

test('tooltips: one <title> per week with the date range', () => {
  assert.equal(dateRange('2026-10-01', '2026-10-15'), 'Oct 1–15, 2026');
  assert.equal(dateRange('2026-09-28', '2026-10-04'), 'Sep 28 – Oct 4, 2026');
  assert.equal(dateRange('2025-12-28', '2026-01-03'), 'Dec 28, 2025 – Jan 3, 2026');
  assert.equal(tooltip(0, '2026-01-03'), 'No contributions · Jan 3, 2026');
  assert.equal(tooltip(1, '2026-01-03'), '1 contribution · Jan 3, 2026');
  for (const svg of [light, dark]) {
    const titles = [...svg.matchAll(/<rect [^>]*><title>([^<]*)<\/title><\/rect>/g)].map((m) => m[1]);
    assert.equal(titles.length, 53);
    assert.ok(titles.every((t) => / · [A-Z][a-z]{2} \d/.test(t)));
  }
});

test('a different challenge on every week, on its plateau top; set pieces on the strongest weeks', () => {
  const { terrain, challenges, peakIndex } = scene(model, 'week');
  assert.ok(Object.keys(CHALLENGES).length >= 56, 'registry size');
  assert.equal(challenges.length, 53);
  assert.equal(new Set(challenges.map((c) => c.type)).size, 53, 'every week a different kind');
  challenges.forEach((c, i) => {
    const b = terrain.buckets[c.bucket];
    assert.equal(c.bucket, i);
    assert.equal(c.y, BASE - b.h, c.type);
    assert.ok(c.x >= b.flat0 && c.x <= b.flat1, `${c.type} x ${c.x} outside ${b.flat0}..${b.flat1}`);
    const seasons = CHALLENGES[c.type].seasons;
    if (seasons) assert.ok(seasons.includes(bucketSeason(model, b)), `${c.type} out of season`);
  });
  assert.equal(challenges.find((c) => c.type === 'campfire').bucket, peakIndex);
  const ranked = terrain.buckets.map((b, i) => i).sort((a, c) => terrain.buckets[c].sum - terrain.buckets[a].sum || a - c);
  const rank = (i) => ranked.indexOf(i);
  const of = (t) => challenges.find((c) => c.type === t);
  assert.ok(rank(of('boulder').bucket) < Math.ceil(53 * 0.1) && terrain.buckets[of('boulder').bucket + 1].h < of('boulder').y * 0 + terrain.buckets[of('boulder').bucket].h);
  assert.ok(rank(of('boulder-uphill').bucket) < Math.ceil(53 * 0.1) && terrain.buckets[of('boulder-uphill').bucket + 1].h > terrain.buckets[of('boulder-uphill').bucket].h);
  for (const t of ['tree', 'tree-axe', 'apple-tree']) assert.ok(rank(of(t).bucket) < Math.ceil(53 * 0.25), t);
  for (const t of MINIS) assert.ok(CHALLENGES[t].dur >= 0.8 && CHALLENGES[t].dur <= 1.5, t);
  // The live-size year (371 days) also gets 53 distinct kinds; day buckets reuse kinds, never side by side.
  const full = toModel(calendar(371, '2025-10-12', (i) => (i * 7) % 11));
  assert.equal(new Set(scene(full, 'week').challenges.map((c) => c.type)).size, 53);
  const days = scene(full, 'day').challenges;
  days.forEach((c, i) => i && assert.notEqual(c.type, days[i - 1].type));
  assert.deepEqual(scene(model, 'week').challenges, challenges, 'deterministic');
});

test('walker is glued to the terrain: every motion sample is on a plateau top or on a ladder/rope', () => {
  const { terrain, route } = scene(model, 'week');
  const pts = [route.segs[0].from, ...route.segs.map((s) => s.to)];
  const onTop = ([x, y]) => terrain.buckets.some((b) => x + X0 >= b.x0 - 1 && x + X0 <= b.x1 + 1 && Math.abs(y + b.h) <= 1);
  const onProp = ([x, y]) => terrain.transitions.some((t) => x + X0 >= t.xa && x + X0 <= t.xb && -y >= t.low - 1 && -y <= t.high + 1);
  for (const p of pts) assert.ok(onTop(p) || onProp(p), `walker floats at ${p}`);
  // Vertical movement happens only on a ladder or rope, at its x, in the climbing pose.
  for (const s of route.segs) {
    if (s.from[1] === s.to[1]) continue;
    assert.equal(s.from[0], s.to[0], 'no diagonal moves');
    assert.ok(['climb', 'down'].includes(s.mode), s.mode);
    assert.equal(poseOf(s.mode), 'climb');
    assert.ok(onProp(s.from) && onProp(s.to));
  }
  for (const t of terrain.transitions) assert.ok(t.t1 > t.t0, 'every ladder and rope is climbed');
  // Ladders and ropes are drawn at every transition.
  assert.equal((light.match(/stroke-width=".7" fill="none" stroke-linecap="round" opacity="\.(85|7)"/g) ?? []).length, terrain.transitions.length);
});

test('walker timing: linear with explicit keyTimes, walking ~40 px/s, climbing slower, pauses match action windows', () => {
  const { terrain, challenges, route } = scene(model, 'week');
  assert.ok(route.loop >= 60 && route.loop <= 130, `loop ${route.loop}`);
  for (let i = 1; i < route.segs.length; i++) {
    assert.equal(route.segs[i].t0, route.segs[i - 1].t1);
    assert.deepEqual(route.segs[i].from, route.segs[i - 1].to);
  }
  const speed = (s) => Math.hypot(s.to[0] - s.from[0], s.to[1] - s.from[1]) / (s.t1 - s.t0);
  for (const s of route.segs.filter((s) => s.mode === 'walk')) assert.ok(Math.abs(speed(s) - SPEED.walk) < 1e-6);
  for (const s of route.segs.filter((s) => s.mode === 'climb' && s.from[0] === s.to[0])) assert.ok(Math.abs(speed(s) - SPEED.climb) < 1e-6);
  assert.ok(SPEED.climb < SPEED.walk);
  for (const c of challenges) {
    const spec = CHALLENGES[c.type];
    const segs = route.segs.filter((s) => s.t0 >= c.t0 - 1e-9 && s.t1 <= c.t1 + 1e-9);
    assert.deepEqual(segs.map((s) => s.mode), spec.phases.map(([p]) => p), `${c.type}: phases`);
    assert.ok(Math.abs(segs[0].t0 - c.t0) < 1e-9 && Math.abs(segs.at(-1).t1 - c.t1) < 1e-9, `${c.type}: window`);
    assert.ok(Math.abs(c.t1 - c.t0 - spec.dur) < 1e-9);
    for (const s of segs) {
      assert.equal(s.from[1], -terrain.buckets[c.bucket].h);
      assert.equal(s.to[1], -terrain.buckets[c.bucket].h);
      if (!spec.move) assert.deepEqual(s.from, s.to, `${c.type}: he moves during the action`);
    }
    assert.ok(Math.abs(segs[0].from[0] + X0 - c.stop) < 0.011);
  }
  const motion = light.match(/<animateMotion values=[^>]*>/)[0];
  assert.match(motion, /calcMode="linear"/);
  assert.match(motion, new RegExp(`dur="${Math.round(route.loop * 100) / 100}s"`));
  assert.match(motion, /repeatCount="indefinite"/);
  const nv = motion.match(/values="([^"]*)"/)[1].split(';').length;
  assert.equal(nv, route.segs.length + 1);
  assert.match(light, /dur="1.2s" repeatCount="indefinite"\/><\/use>/); // walk: 0.6 s per frame
  assert.match(light, /dur="1s" repeatCount="indefinite"\/><\/use>/); // climb: 0.5 s per frame
  // Every loop-synced animation shares the walker's loop.
  for (const a of light.match(/<animate[^>]*begin="3s"[^>]*>/g)) assert.match(a, new RegExp(`dur="${Math.round(route.loop * 100) / 100}s"`));
});

test('SVG contract: 880x440, <= 300 KB, titled, self-contained, vector, keyTimes valid', () => {
  for (const svg of [light, dark]) {
    assert.match(svg, /<svg [^>]*width="880" height="440"/);
    assert.ok(Buffer.byteLength(svg) <= 300 * 1024);
    assert.match(svg, /role="img"/);
    assert.match(svg, /<title id="yw-title">Vitalii Borovyk's GitHub contributions as a landscape: 8,645 contributions · Oct 2025 – Oct 2026<\/title>/);
    assert.doesNotMatch(svg, /<script|<image|<foreignObject|@import|@font-face|url\(http|href="http|xlink:href/);
    assert.doesNotMatch(svg, /crispEdges/);
    assert.match(svg, /class="cap">8,645 contributions · Oct 2025 – Oct 2026</);
    for (const k of svg.match(/keyTimes="[^"]*"/g)) {
      const v = k.slice(10, -1).split(';').map(Number);
      assert.equal(v[0], 0, k.slice(0, 60));
      assert.equal(v.at(-1), 1, k.slice(0, 60));
      for (let i = 1; i < v.length; i++) assert.ok(v[i] >= v[i - 1], k.slice(0, 60));
    }
    for (const a of svg.match(/<animate(?:Transform|Motion)? [^>]*>/g)) {
      if (!a.includes('keyTimes=')) continue;
      const nv = a.match(/values="([^"]*)"/)[1].split(';').length;
      const nk = a.match(/keyTimes="([^"]*)"/)[1].split(';').length;
      assert.equal(nv, nk, a.slice(0, 80));
    }
    assert.match(svg, /prefers-reduced-motion: reduce\)\{\.r,\.act\{transform:none!important\}/);
  }
  // The flag shows only after the campfire.
  assert.match(light, /<g class="flg" opacity="0"/);
});

test('green terrain ramps per theme', () => {
  assert.equal(rampColor(THEMES.light.ramp, 0), '#9be9a8');
  assert.equal(rampColor(THEMES.light.ramp, 1), '#216e39');
  assert.equal(rampColor(THEMES.dark.ramp, 0), '#0e4429');
  assert.equal(rampColor(THEMES.dark.ramp, 1), '#39d353');
  assert.ok(light.includes('fill="#216e39"'));
  assert.ok(dark.includes('fill="#39d353"'));
});

test('the title uses the display name from the model', () => {
  const named = renderYearWalk(toModel(fixture, { name: 'Ada Lovelace' }), 'light');
  assert.match(named, /<title id="yw-title">Ada Lovelace's GitHub/);
  assert.ok(!named.includes('Vitalii Borovyk'));
});

test('CLI: fixture mode writes both files; --bucket is validated', () => {
  const dir = tmp();
  const r = spawnSync(process.execPath, [cli, '--fixture', fixturePath, '--out', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(dir, 'yearwalk-light.svg'), 'utf8'), light);
  assert.equal(readFileSync(join(dir, 'yearwalk-dark.svg'), 'utf8'), dark);
  const bad = spawnSync(process.execPath, [cli, '--fixture', fixturePath, '--out', join(dir, 'x'), '--bucket', 'year'], { encoding: 'utf8' });
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /--bucket must be one of/);
  assert.equal(existsSync(join(dir, 'x')), false);
  const half = spawnSync(process.execPath, [cli, '--fixture', fixturePath, '--out', join(dir, 'h'), '--bucket', 'halfmonth'], { encoding: 'utf8' });
  assert.equal(half.status, 0, half.stderr);
  assert.match(readFileSync(join(dir, 'h', 'yearwalk-light.svg'), 'utf8'), /<title>\d[\d,]* contributions · Oct 1–15, 2026<\/title>/);
});

test('CLI: live mode without a token exits non-zero and writes nothing', () => {
  const dir = join(tmp(), 'out');
  const env = { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '' };
  const r = spawnSync(process.execPath, [cli, '--out', dir], { encoding: 'utf8', env });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /GITHUB_TOKEN is not set/);
  assert.equal(existsSync(dir), false);
});

test('CLI: a broken calendar exits non-zero and leaves existing files untouched', () => {
  const dir = tmp();
  writeFileSync(join(dir, 'yearwalk-light.svg'), 'old');
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, JSON.stringify({ data: { user: null } }));
  const r = spawnSync(process.execPath, [cli, '--fixture', bad, '--out', dir], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.equal(readFileSync(join(dir, 'yearwalk-light.svg'), 'utf8'), 'old');
});

test('a day-sum mismatch warns on stderr, writes, and the caption uses the reported total', () => {
  const skewed = structuredClone(fixture);
  skewed.data.user.contributionsCollection.contributionCalendar.totalContributions = 8650;
  const dir = tmp();
  const path = join(dir, 'calendar.json');
  writeFileSync(path, JSON.stringify(skewed));
  const r = spawnSync(process.execPath, [cli, '--fixture', path, '--out', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /day counts sum to 8645, GitHub reports 8650/);
  assert.match(readFileSync(join(dir, 'yearwalk-light.svg'), 'utf8'), /8,650 contributions/);
});
