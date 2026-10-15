import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { select } from '../lib/data.mjs';
import { renderSvg, renderReadmeBlock, THEMES } from '../lib/render.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/prs.json', import.meta.url)));
const config = JSON.parse(readFileSync(new URL('../../oss.config.json', import.meta.url)));
const model = select(fixture, config);
const cap = config.maxPrsPerRepo;
const light = renderSvg(model, 'light', cap);
const dark = renderSvg(model, 'dark', cap);
const block = renderReadmeBlock(model);

// Golden files: UPDATE_SNAPSHOTS=1 npm test rewrites them.
function golden(name, actual) {
  const url = new URL(`./snapshots/${name}`, import.meta.url);
  if (process.env.UPDATE_SNAPSHOTS) writeFileSync(url, actual);
  assert.equal(actual, readFileSync(url, 'utf8'), `${name} differs from its golden file`);
}

test('fixture matches golden files', () => {
  golden('oss-light.svg', light);
  golden('oss-dark.svg', dark);
  golden('table.md', block);
});

test('both cards are 880 px wide', () => {
  for (const svg of [light, dark]) assert.match(svg, /<svg [^>]*width="880"/);
});

test('cards carry role="img" and a title equal to the header line', () => {
  for (const svg of [light, dark]) {
    assert.match(svg, /role="img"/);
    assert.match(svg, /<title id="oss-title">17 merged pull requests in 7 repositories<\/title>/);
  }
});

test('cards load no external resources', () => {
  for (const svg of [light, dark]) {
    for (const bad of ['<script', '<image', '<foreignObject', '@import', 'href=', 'url(']) {
      assert.ok(!svg.includes(bad), bad);
    }
  }
});

test('special characters are escaped in SVG and Markdown', () => {
  assert.ok(light.includes('Fix &lt;Select&gt; &amp; &quot;quoted&quot; |'));
  assert.ok(!light.includes('<Select>'));
  assert.match(block, /\[#42\]\(https:\/\/github\.com\/acme\/widgets\/pull\/42 "Fix &lt;Select&gt; &amp; \\"quoted\\" \\\| piped values in the options list"\)/);
  for (const row of block.split('\n').filter((l) => l.startsWith('| '))) {
    assert.equal(row.replace(/\\\|/g, '').split('|').length, 5, row);
  }
});

test('a long title is truncated with an ellipsis', () => {
  const long = fixture.merged.find((p) => p.number === 43).title;
  assert.ok(long.length > 100);
  assert.ok(!light.includes(long));
  assert.match(light, />Improve the performance of[^<]{0,8}…<\/text>/);
});

test('cap shows 3 PR lines and "+7 more"; the table lists all 10', () => {
  assert.ok(light.includes('>+7 more<'));
  const apRow = block.split('\n').find((l) => l.startsWith('| [activepieces/activepieces]'));
  assert.equal(apRow.match(/\[#\d+\]/g).length, 10);
});

test('no open PRs: in-review row and divider are omitted and the card is shorter', () => {
  const none = { ...model, open: { items: [] } };
  const svg = renderSvg(none, 'light', cap);
  assert.ok(!svg.includes('In review'));
  assert.ok(!svg.includes('<line'));
  const h = (s) => Number(s.match(/height="(\d+)"/)[1]);
  assert.ok(h(svg) < h(light));
  assert.ok(!renderReadmeBlock(none).includes('| In review |'));
});

test('light and dark differ only in color values', () => {
  const strip = (s) => s.replace(/#[0-9a-f]{6}/g, '#');
  assert.equal(strip(light), strip(dark));
  assert.notEqual(light, dark);
  assert.ok(Object.values(THEMES.dark).every((c) => dark.includes(c)));
});
