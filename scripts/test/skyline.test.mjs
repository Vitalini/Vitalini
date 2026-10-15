import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { caption, percentile, toModel } from '../lib/skyline-data.mjs';
import { FOOT, H_MAX, H_MIN, H_TILE, PITCH_DEG, YAW_DEG, cuboid, heightFor, makeProjector } from '../lib/skyline-geometry.mjs';
import { layout, rampColor, renderSkyline } from '../lib/skyline-render.mjs';

const fixturePath = new URL('../fixtures/calendar.json', import.meta.url).pathname;
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const model = toModel(fixture);
const light = renderSkyline(model, 'light');
const dark = renderSkyline(model, 'dark');
const cli = new URL('../skyline.mjs', import.meta.url).pathname;

// Golden files: UPDATE_SNAPSHOTS=1 npm test rewrites them.
function golden(name, actual) {
  const url = new URL(`./snapshots/${name}`, import.meta.url);
  if (process.env.UPDATE_SNAPSHOTS) writeFileSync(url, actual);
  assert.equal(actual, readFileSync(url, 'utf8'), `${name} differs from its golden file`);
}

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const rad = (d) => (d * Math.PI) / 180;

test('fixture matches skyline golden files', () => {
  golden('skyline-light.svg', light);
  golden('skyline-dark.svg', dark);
});

test('model: totals match GitHub, caption is computed', () => {
  assert.equal(model.total, 8645);
  assert.equal(model.total, model.reportedTotal);
  assert.equal(model.max, 414);
  assert.equal(model.peak.date, '2026-09-29');
  assert.equal(caption(model), '8,645 contributions · Oct 2025 – Oct 2026');
});

test('percentile is nearest-rank', () => {
  assert.equal(percentile([1, 2, 3, 4], 50), 2);
  assert.equal(percentile([1, 2, 3, 4], 100), 4);
  assert.equal(percentile([], 99), 0);
});

test('height scale: zero is a flat tile, active days use sqrt between H_MIN and H_MAX', () => {
  assert.deepEqual(heightFor(0, 100), { h: H_TILE, t: 0, capped: false, zero: true });
  close(heightFor(25, 100).h, H_MIN + (H_MAX - H_MIN) * 0.5);
  close(heightFor(100, 100).h, H_MAX);
  let prev = 0;
  for (let c = 1; c <= 100; c++) {
    const { h } = heightFor(c, 100);
    assert.ok(h > prev, `height must grow at ${c}`);
    prev = h;
  }
});

test('cap: days above the cap are drawn at H_MAX and flagged, never taller', () => {
  assert.equal(heightFor(100, 100).capped, false);
  const over = heightFor(414, 100);
  assert.equal(over.h, H_MAX);
  assert.equal(over.capped, true);
  assert.equal(heightFor(1e6, 100).h, H_MAX);
});

test('no fake data: one break mark per capped day, the peak label shows the real count', () => {
  const capped = model.weeks.flat().filter((d) => d.count > model.cap).length;
  assert.ok(capped >= 1);
  // Two break-mark paths (front + side) per capped block, in the page background color.
  assert.equal((light.match(/<path fill="#ffffff" d=/g) ?? []).length, capped * 2);
  assert.equal((dark.match(/<path fill="#0d1117" d=/g) ?? []).length, capped * 2);
  assert.match(light, /class="pk"[^>]*>414 · Sep 29</);
  assert.match(light, new RegExp(`Days above ${model.cap} contributions are drawn at the cap height with a break mark`));
});

test('projection: known points', () => {
  const s = 10;
  const p = makeProjector(s);
  assert.deepEqual(p([0, 0, 0]), [0, 0]);
  const [x1, y1] = p([1, 0, 0]);
  close(x1, Math.cos(rad(YAW_DEG)) * s);
  close(y1, Math.sin(rad(YAW_DEG)) * Math.sin(rad(PITCH_DEG)) * s);
  const [x2, y2] = p([0, 1, 0]);
  close(x2, -Math.sin(rad(YAW_DEG)) * s);
  close(y2, Math.cos(rad(YAW_DEG)) * Math.sin(rad(PITCH_DEG)) * s);
  const [x3, y3] = p([0, 0, 1]);
  close(x3, 0);
  close(y3, -Math.cos(rad(PITCH_DEG)) * s); // up is up on screen
  // Not the stock 30-degree isometric: a week step does not rise or fall 30 degrees on screen.
  assert.ok(Math.abs(Math.atan2(y1, x1) * (180 / Math.PI)) < 15);
});

test('cuboid: footprint is centred in the cell and faces share the top edge', () => {
  const f = cuboid(2, 3, 1.5);
  close(f.box.x1 - f.box.x0, FOOT);
  close((f.box.x0 + f.box.x1) / 2, 2.5);
  assert.deepEqual(f.front[3], f.top[3]);
  assert.deepEqual(f.side[2], f.top[2]);
  assert.deepEqual(f.pivot, [f.box.x1, f.box.y1, 0]);
});

test('layout: two terraces, older half at the back', () => {
  const { perRow, cells } = layout(model);
  assert.equal(perRow, Math.ceil(model.weeks.length / 2));
  assert.equal(cells.length, model.dayCount);
  assert.ok(cells.filter((c) => c.week < perRow).every((c) => c.row === 0));
  assert.ok(cells.filter((c) => c.week >= perRow).every((c) => c.row === 1 && c.y >= 7));
});

test('ramp color interpolates between stops', () => {
  assert.equal(rampColor(['#000000', '#ffffff'], 0), '#000000');
  assert.equal(rampColor(['#000000', '#ffffff'], 1), '#ffffff');
  assert.equal(rampColor(['#000000', '#ffffff'], 0.5), '#808080');
});

test('SVG contract: 880 wide, <= 520 tall, <= 350 KB, titled, self-contained', () => {
  for (const svg of [light, dark]) {
    const [, w, h] = svg.match(/<svg [^>]*width="(\d+)" height="(\d+)"/);
    assert.equal(Number(w), 880);
    assert.ok(Number(h) <= 520, `height ${h}`);
    assert.ok(Buffer.byteLength(svg) <= 350 * 1024);
    assert.match(svg, /role="img"/);
    assert.match(svg, /<title id="sky-title">[^<]*8,645 contributions · Oct 2025 – Oct 2026<\/title>/);
    assert.doesNotMatch(svg, /<script|<image|@import|@font-face|url\(http|href="http/);
    assert.doesNotMatch(svg, /★|⑂|star|fork/i); // caption is contributions + range only
  }
});

test('animation: final state equals the static drawing', () => {
  const rises = light.match(/type="scale" values="1 0[^"]*"[^>]*/g);
  assert.ok(rises.length > 200);
  for (const r of rises) assert.match(r, /values="1 0;1 0;1 1;1 1".*fill="freeze"/);
  // The camera loops start and end at identity, so the first and every later frame match the static drawing.
  assert.match(light, /type="skewX" values="0;[^"]*;0"/);
  assert.match(light, /type="scale" values="1 1;[^"]*;1 1"/);
  // Every keyTimes list ends at 1 (SMIL rejects linear/spline lists that do not).
  for (const k of light.match(/keyTimes="[^"]*"/g)) assert.match(k, /;1"$/);
  assert.match(light, /prefers-reduced-motion: reduce\)\{\.r,\.cam\{transform:none!important\}/);
});

test('CLI: fixture mode writes both files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skyline-'));
  const r = spawnSync(process.execPath, [cli, '--fixture', fixturePath, '--out', dir], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(join(dir, 'skyline-light.svg'), 'utf8'), light);
  assert.equal(readFileSync(join(dir, 'skyline-dark.svg'), 'utf8'), dark);
});

test('CLI: live mode without a token exits non-zero and writes nothing', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'skyline-')), 'out');
  const env = { ...process.env, GITHUB_TOKEN: '', GH_TOKEN: '' };
  const r = spawnSync(process.execPath, [cli, '--out', dir], { encoding: 'utf8', env });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /GITHUB_TOKEN is not set/);
  assert.equal(existsSync(dir), false);
});

test('CLI: a broken calendar exits non-zero and leaves existing files untouched', () => {
  const dir = mkdtempSync(join(tmpdir(), 'skyline-'));
  writeFileSync(join(dir, 'skyline-light.svg'), 'old');
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, JSON.stringify({ data: { user: null } }));
  const r = spawnSync(process.execPath, [cli, '--fixture', bad, '--out', dir], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.equal(readFileSync(join(dir, 'skyline-light.svg'), 'utf8'), 'old');
});
