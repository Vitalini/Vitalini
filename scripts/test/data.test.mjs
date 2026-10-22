import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { select, verifyUrl } from '../lib/data.mjs';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/prs.json', import.meta.url)));
const config = JSON.parse(readFileSync(new URL('../../oss.config.json', import.meta.url)));
const names = (model) => model.repos.map((r) => r.name);

test('merged and open repositories form one alphabetical set', () => {
  assert.deepEqual(names(select(fixture, config)), [
    'acme/widgets',
    'activepieces/activepieces',
    'calcom/cal.diy',
    'eivindfjeldstad/validate',
    'emmetio/emmet',
    'manaflow-ai/cmux',
    'medusajs/medusa',
    'n8n-io/n8n',
    'openclaw/openclaw',
    'paperclipai/paperclip',
    'Shopify/hydrogen',
    'vercel/next.js',
  ]);
});

test('each repository appears once with owner, repo and URL', () => {
  const model = select(fixture, config);
  assert.equal(new Set(names(model)).size, model.repos.length);
  assert.deepEqual(model.repos.find((r) => r.name === 'manaflow-ai/cmux'), {
    name: 'manaflow-ai/cmux',
    owner: 'manaflow-ai',
    repo: 'cmux',
    url: 'https://github.com/manaflow-ai/cmux',
  });
});

test('the model carries no PR numbers, counts or dates', () => {
  const json = JSON.stringify(select(fixture, config).repos);
  for (const bad of ['number', 'count', 'mergedAt', 'createdAt', 'title', '/pull/']) assert.ok(!json.includes(bad), bad);
});

test('denied repositories never appear, merged or open', () => {
  const repos = names(select(fixture, config));
  for (const denied of config.denyRepos) assert.ok(!repos.includes(denied), denied);
});

test('excluded owners are dropped case-insensitively', () => {
  assert.ok(!names(select(fixture, config)).includes('Talkable/x'));
});

test('private repositories are dropped', () => {
  assert.ok(!names(select(fixture, config)).includes('acme/secret'));
});

test('denyPrs drops a repository only when all its PRs are denied', () => {
  const emmet = fixture.merged.filter((p) => p.repository.nameWithOwner === 'emmetio/emmet').map((p) => p.url);
  assert.ok(!names(select(fixture, { ...config, denyPrs: emmet })).includes('emmetio/emmet'));
  const one = 'https://github.com/activepieces/activepieces/pull/3238';
  assert.ok(names(select(fixture, { ...config, denyPrs: [one] })).includes('activepieces/activepieces'));
});

test('a repository with only open PRs is included', () => {
  const model = select({ merged: [], open: fixture.open }, config);
  assert.ok(names(model).includes('vercel/next.js'));
});

test('an all-denied input throws and names the filter that emptied it', () => {
  const onlyJunk = { merged: fixture.merged.filter((p) => p.repository.nameWithOwner === 'Green-Software-Foundation/awesome-green-software'), open: [] };
  assert.throws(() => select(onlyJunk, config), /denyRepos/);
  assert.throws(() => select({ merged: [], open: [] }, config), /no merged or open pull requests/);
});

test('shuffled input gives deep-equal output', () => {
  const reversed = { merged: [...fixture.merged].reverse(), open: [...fixture.open].reverse() };
  assert.deepEqual(select(reversed, config), select(fixture, config));
});

test('verify URL reproduces the card filters as a GitHub search without a state filter', () => {
  const q = decodeURIComponent(new URL(verifyUrl(config)).searchParams.get('q'));
  assert.equal(
    q.split(' ').slice(0, 6).join(' '),
    'is:pr author:Vitalini -org:talkable -user:Vitalini -org:tidegap -repo:Repairex-rgb/repairextech-1',
  );
  assert.ok(!q.includes('is:merged') && !q.includes('is:open'));
});
