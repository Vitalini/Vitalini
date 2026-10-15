import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { select, verifyUrl } from '../lib/data.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/prs.json', import.meta.url)));
const config = JSON.parse(readFileSync(new URL('../../oss.config.json', import.meta.url)));
const allRepos = (model) => model.merged.repos.map((r) => r.name);
const allUrls = (model) => model.merged.repos.flatMap((r) => r.prs.map((p) => p.url));

test('fixture yields totals and repo order (count desc, then latest merge desc)', () => {
  const model = select(fixture, config);
  assert.equal(model.merged.total, 17);
  assert.equal(model.merged.repoCount, 7);
  assert.deepEqual(allRepos(model), [
    'activepieces/activepieces',
    'acme/widgets',
    'openclaw/openclaw',
    'Shopify/hydrogen',
    'n8n-io/n8n',
    'medusajs/medusa',
    'emmetio/emmet',
  ]);
  const ap = model.merged.repos[0];
  assert.equal(ap.count, 10);
  assert.deepEqual(ap.prs.slice(0, 3).map((p) => p.number), [12390, 8156, 8101]);
});

test('denied repositories never appear', () => {
  const repos = allRepos(select(fixture, config));
  for (const denied of ['Repairex-rgb/repairextech-1', 'import-math/sutra_video_infra', 'Green-Software-Foundation/awesome-green-software']) {
    assert.ok(!repos.includes(denied), denied);
  }
});

test('excluded owners are dropped case-insensitively', () => {
  assert.ok(!allRepos(select(fixture, config)).includes('Talkable/x'));
});

test('private repositories are dropped', () => {
  assert.ok(!allRepos(select(fixture, config)).includes('acme/secret'));
});

test('denyPrs drops one PR and keeps its siblings', () => {
  const url = 'https://github.com/activepieces/activepieces/pull/3238';
  const model = select(fixture, { ...config, denyPrs: [url] });
  assert.ok(!allUrls(model).includes(url));
  assert.equal(model.merged.repos[0].count, 9);
  assert.equal(model.merged.total, 16);
});

test('open PRs are separate, filtered, and not counted as merged', () => {
  const model = select(fixture, config);
  assert.deepEqual(
    model.open.items.map((i) => `${i.repo}#${i.number}`),
    [
      'calcom/cal.diy#28738',
      'eivindfjeldstad/validate#129',
      'manaflow-ai/cmux#7994',
      'manaflow-ai/cmux#7034',
      'paperclipai/paperclip#15716',
      'vercel/next.js#92598',
    ],
  );
  assert.ok(!allUrls(model).some((u) => model.open.items.some((i) => i.url === u)));
});

test('an all-denied input throws and names the filter that emptied it', () => {
  const onlyJunk = { merged: fixture.merged.filter((p) => p.repository.nameWithOwner === 'Green-Software-Foundation/awesome-green-software'), open: [] };
  assert.throws(() => select(onlyJunk, config), /denyRepos/);
  assert.throws(() => select({ merged: [], open: [] }, config), /no merged pull requests/);
});

test('shuffled input gives deep-equal output', () => {
  const reversed = { merged: [...fixture.merged].reverse(), open: [...fixture.open].reverse() };
  assert.deepEqual(select(reversed, config), select(fixture, config));
});

test('verify URL reproduces the card filters as a GitHub search', () => {
  const q = decodeURIComponent(new URL(verifyUrl(config)).searchParams.get('q'));
  assert.equal(
    q.split(' ').slice(0, 6).join(' '),
    'is:pr author:Vitalini is:merged -org:talkable -user:Vitalini -repo:Repairex-rgb/repairextech-1',
  );
});
