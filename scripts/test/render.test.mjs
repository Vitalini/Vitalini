import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { select } from '../lib/data.mjs';
import { renderSvg, renderReadmeBlock, THEMES } from '../lib/render.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/prs.json', import.meta.url)));
const config = JSON.parse(readFileSync(new URL('../../oss.config.json', import.meta.url)));
const model = select(fixture, config);
const light = renderSvg(model, 'light');
const dark = renderSvg(model, 'dark');
const height = (s) => Number(s.match(/height="(\d+)"/)[1]);
const repo = (name) => {
  const [owner, r] = name.split('/');
  return { name, owner, repo: r, url: `https://github.com/${name}` };
};

// Golden files: UPDATE_SNAPSHOTS=1 npm test rewrites them.
function golden(name, actual) {
  const url = new URL(`./snapshots/${name}`, import.meta.url);
  if (process.env.UPDATE_SNAPSHOTS) writeFileSync(url, actual);
  assert.equal(actual, readFileSync(url, 'utf8'), `${name} differs from its golden file`);
}

test('fixture matches golden files', () => {
  golden('oss-light.svg', light);
  golden('oss-dark.svg', dark);
});

test('both cards are 880 px wide', () => {
  for (const svg of [light, dark]) assert.match(svg, /<svg [^>]*width="880"/);
});

test('cards show the title, subtitle and one chip per repository', () => {
  for (const svg of [light, dark]) {
    assert.ok(svg.includes('>Open-source contributions</text>'));
    assert.ok(svg.includes('>External repositories I contribute to</text>'));
    assert.equal(svg.match(/class="chip"/g).length, model.repos.length);
    assert.ok(svg.includes('<tspan class="muted">manaflow-ai/</tspan><tspan class="strong">cmux</tspan>'));
  }
});

test('cards carry no numbers: no PR ids, counts or dates', () => {
  const text = light.replace(/<style>[^]*<\/style>/, '').match(/>[^<]+</g).join('');
  assert.ok(!/#\d/.test(text), 'PR id');
  assert.ok(!/\bmerged\b/i.test(text), 'merged count');
  assert.ok(!/\d{4}-\d{2}-\d{2}/.test(text), 'date');
});

test('cards carry role="img" and a title listing every repository', () => {
  for (const svg of [light, dark]) {
    assert.match(svg, /role="img"/);
    const title = svg.match(/<title id="oss-title">([^<]*)<\/title>/)[1];
    assert.ok(title.startsWith('Open-source contributions: '));
    for (const r of model.repos) assert.ok(title.includes(r.name), r.name);
  }
});

test('cards load no external resources', () => {
  for (const svg of [light, dark]) {
    for (const bad of ['<script', '<image', '<foreignObject', '@import', 'href=', 'url(']) {
      assert.ok(!svg.includes(bad), bad);
    }
  }
});

test('special characters are escaped', () => {
  const svg = renderSvg({ repos: [repo('a&b/<x>')] }, 'light');
  assert.ok(svg.includes('a&amp;b/</tspan><tspan class="strong">&lt;x&gt;'));
  assert.ok(!svg.includes('<x>'));
});

test('a long label is shortened from the owner side and keeps the repo name', () => {
  const svg = renderSvg({ repos: [repo('segment-integrations-long-owner/analytics')] }, 'light');
  assert.match(svg, /<tspan class="muted">segment-integra…\/<\/tspan><tspan class="strong">analytics<\/tspan>/);
});

test('height grows by one chip row per three repositories', () => {
  const svg = (n) => renderSvg({ repos: model.repos.slice(0, n) }, 'light');
  assert.equal(height(svg(1)), height(svg(3)));
  assert.equal(height(svg(4)) - height(svg(3)), 56);
});

test('light and dark differ only in color values', () => {
  const strip = (s) => s.replace(/#[0-9a-f]{6}/g, '#');
  assert.equal(strip(light), strip(dark));
  assert.notEqual(light, dark);
  assert.ok(Object.values(THEMES.dark).every((c) => dark.includes(c)));
});

test('README block is the linked card only: no table, no PR links', () => {
  const block = renderReadmeBlock(model);
  assert.ok(block.startsWith(`<a href="${model.verifyUrl}" title="All my external pull requests on GitHub">`));
  assert.ok(block.includes('srcset="./generated/oss-dark.svg"'));
  assert.ok(!block.includes('|'));
  assert.ok(!block.includes('/pull/'));
});
