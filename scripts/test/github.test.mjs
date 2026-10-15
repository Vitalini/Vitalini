// Live-mode I/O with `fetch` stubbed: no network.
import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fetchPrs } from '../lib/data.mjs';
import { graphql } from '../lib/github.mjs';
import { fetchCalendar } from '../lib/skyline-data.mjs';

const config = JSON.parse(readFileSync(new URL('../../oss.config.json', import.meta.url)));
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Replace fetch with `handler(requestBody, init)`; returns the list of request bodies seen. */
function stubFetch(handler) {
  const calls = [];
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ body, init });
    const res = handler(body, init);
    return { ok: res.status === undefined, status: res.status ?? 200, json: async () => res.json };
  };
  return calls;
}

const pr = (n) => ({
  number: n,
  title: `PR ${n}`,
  url: `https://github.com/acme/repo${n}/pull/${n}`,
  createdAt: '2026-01-01T00:00:00Z',
  mergedAt: null,
  repository: { nameWithOwner: `acme/repo${n}`, isPrivate: false, owner: { login: 'acme' } },
});
const page = (nodes, issueCount, endCursor = null) => ({
  json: { data: { search: { issueCount, pageInfo: { hasNextPage: endCursor !== null, endCursor }, nodes } } },
});

test('graphql: an HTTP error throws with the status and context', async () => {
  stubFetch(() => ({ status: 502 }));
  await assert.rejects(graphql({ query: 'q', token: 't', context: ' for "x"' }), /GitHub GraphQL HTTP 502 for "x"/);
});

test('graphql: a GraphQL errors[] body throws with the first message', async () => {
  stubFetch(() => ({ json: { errors: [{ message: 'Something went wrong' }] } }));
  await assert.rejects(graphql({ query: 'q', token: 't' }), /GitHub GraphQL error: Something went wrong/);
});

test('graphql: every request carries a timeout signal and the bearer token', async () => {
  const calls = stubFetch(() => ({ json: { data: {} } }));
  await graphql({ query: 'q', token: 'abc' });
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.equal(calls[0].init.headers.Authorization, 'bearer abc');
});

test('fetchPrs: follows the cursor over two pages; open search excludes drafts', async () => {
  const calls = stubFetch(({ variables }) => {
    if (variables.q.includes('is:open')) return page([pr(9)], 1);
    return variables.cursor === null ? page([pr(1), pr(2)], 3, 'c1') : page([pr(3)], 3);
  });
  const raw = await fetchPrs(config, 'token');
  assert.deepEqual(raw.merged.map((p) => p.number), [1, 2, 3]);
  assert.deepEqual(raw.open.map((p) => p.number), [9]);
  const merged = calls.filter((c) => c.body.variables.q.includes('is:merged'));
  assert.deepEqual(merged.map((c) => c.body.variables.cursor), [null, 'c1']);
  const open = calls.find((c) => c.body.variables.q.includes('is:open'));
  assert.match(open.body.variables.q, /draft:false/);
});

test('fetchPrs: a search that returns fewer nodes than issueCount throws', async () => {
  stubFetch(() => page([pr(1)], 1500));
  await assert.rejects(fetchPrs(config, 'token'), /reported 1500 results .* but returned 1/);
});

test('fetchCalendar: a null user throws "not found"', async () => {
  stubFetch(() => ({ json: { data: { user: null } } }));
  await assert.rejects(fetchCalendar('nobody-here', 'token'), /GitHub user "nobody-here" not found/);
});
