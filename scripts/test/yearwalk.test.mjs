import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { caption, dateRange, percentile, toModel, tooltip } from '../lib/calendar.mjs';
import { THEMES, rampColor, renderYearWalk, scene } from '../lib/yearwalk-render.mjs';
import { BASE, H_MAX, H_MIN, X0, bucketize, heightFor, layoutTerrain } from '../lib/yearwalk-terrain.mjs';

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

test('challenges sit on their plateau top; the campfire is on the busiest week', () => {
  const { terrain, challenges, peakIndex } = scene(model, 'week');
  assert.ok(challenges.length >= 6);
  assert.equal(new Set(challenges.map((c) => c.bucket)).size, challenges.length);
  for (const c of challenges) {
    const b = terrain.buckets[c.bucket];
    assert.equal(c.y, BASE - b.h, c.type);
    assert.ok(c.x >= b.flat0 && c.x <= b.flat1, `${c.type} x ${c.x} outside ${b.flat0}..${b.flat1}`);
  }
  assert.equal(challenges.find((c) => c.type === 'campfire').bucket, peakIndex);
  for (const c of challenges.filter((c) => c.type === 'boulder')) assert.ok(terrain.buckets[c.bucket + 1].h < terrain.buckets[c.bucket].h);
  assert.deepEqual(scene(model, 'week').challenges, challenges, 'deterministic');
});

test('walker: one loop of at least 30 s; pauses line up with the action windows', () => {
  const { terrain, challenges, route } = scene(model, 'week');
  assert.ok(route.loop >= 30, `loop ${route.loop}`);
  for (let i = 1; i < route.segs.length; i++) {
    assert.ok(route.segs[i].t0 === route.segs[i - 1].t1);
    assert.deepEqual(route.segs[i].from, route.segs[i - 1].to);
  }
  for (const c of challenges.filter((c) => ['tree', 'boulder', 'campfire', 'drift'].includes(c.type))) {
    const pause = route.segs.find((s) => s.t0 === c.t0 && s.t1 === c.t1);
    assert.ok(pause, `${c.type}: no segment for its window`);
    assert.deepEqual(pause.from, pause.to, `${c.type}: the walker moves during the action`);
    assert.equal(pause.from[1], -terrain.buckets[c.bucket].h);
    assert.ok(Math.abs(pause.from[0] + X0 - c.stop) < 0.06);
  }
  // Feet are on a plateau top except while climbing.
  for (const s of route.segs.filter((s) => s.mode === 'walk' && s.from[1] === s.to[1])) {
    const x = s.from[0] + X0;
    const b = terrain.buckets.find((b) => x >= b.x0 - 4 && x <= b.x1 + 4 && -b.h === s.from[1]);
    assert.ok(b, `walk at ${x},${s.from[1]} is not on a plateau`);
  }
  const motion = light.match(/<animateMotion [^>]*>/)[0];
  assert.match(motion, new RegExp(`dur="${Math.round(route.loop * 100) / 100}s"`));
  assert.match(motion, /repeatCount="indefinite"/);
  assert.match(light, /dur="1.2s" repeatCount="indefinite"\/><\/use>/); // 0.6 s per walk frame
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
