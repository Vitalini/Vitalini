import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cli = new URL('../oss-card.mjs', import.meta.url).pathname;
const fixture = new URL('../fixtures/prs.json', import.meta.url).pathname;
const golden = readFileSync(new URL('./snapshots/table.md', import.meta.url), 'utf8');
const before = '# Title\n\nIntro text.\n\n<!-- oss:start -->\n';
const after = '<!-- oss:end -->\n\nOutro text.\n';
const run = (...args) => spawnSync(process.execPath, [cli, '--fixture', fixture, ...args], { encoding: 'utf8' });
const tmp = () => mkdtempSync(join(tmpdir(), 'oss-card-'));

test('replaces only the block between the markers', () => {
  const dir = tmp();
  const readme = join(dir, 'README.md');
  writeFileSync(readme, `${before}old table\n${after}`);
  const r = run('--out', join(dir, 'out'), '--readme', readme);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readFileSync(readme, 'utf8'), `${before}${golden}${after}`);
});

test('a second run changes nothing', () => {
  const dir = tmp();
  const readme = join(dir, 'README.md');
  writeFileSync(readme, `${before}${after}`);
  run('--out', join(dir, 'out'), '--readme', readme);
  const snap = () => [readFileSync(readme, 'utf8'), readFileSync(join(dir, 'out', 'oss-light.svg'), 'utf8')];
  const first = snap();
  run('--out', join(dir, 'out'), '--readme', readme);
  assert.deepEqual(snap(), first);
});

test('missing markers exit non-zero and leave every file untouched', () => {
  const dir = tmp();
  const readme = join(dir, 'README.md');
  writeFileSync(readme, '# No markers here\n');
  const r = run('--out', join(dir, 'out'), '--readme', readme);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /markers/);
  assert.equal(readFileSync(readme, 'utf8'), '# No markers here\n');
  assert.ok(!existsSync(join(dir, 'out')));
});

test('an empty result writes no file', () => {
  const dir = tmp();
  const junk = join(dir, 'junk.json');
  const all = JSON.parse(readFileSync(fixture, 'utf8'));
  writeFileSync(junk, JSON.stringify({ merged: all.merged.filter((p) => p.repository.owner.login === 'Green-Software-Foundation'), open: [] }));
  const out = join(dir, 'out');
  const r = spawnSync(process.execPath, [cli, '--fixture', junk, '--out', out], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /denyRepos/);
  assert.ok(!existsSync(out));
});

test('fixture mode writes both SVGs', () => {
  const out = join(tmp(), 'out');
  execFileSync(process.execPath, [cli, '--fixture', fixture, '--out', out]);
  assert.deepEqual(readdirSync(out).sort(), ['oss-dark.svg', 'oss-light.svg']);
  assert.equal(readFileSync(join(out, 'oss-dark.svg'), 'utf8'), readFileSync(new URL('./snapshots/oss-dark.svg', import.meta.url), 'utf8'));
});
