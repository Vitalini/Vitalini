// Fetch external pull requests and reduce them to the repositories they target. `select` is pure; only `fetchPrs` does I/O.

import { graphql } from './github.mjs';

const SEARCH_QUERY = `query($q: String!, $cursor: String) {
  search(query: $q, type: ISSUE, first: 100, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on PullRequest {
        number title url createdAt mergedAt
        repository { nameWithOwner isPrivate owner { login } }
      }
    }
  }
}`;

const lower = (s) => s.toLowerCase();

/** Search qualifiers that exclude employer and own repositories; `state` is optional. */
export function baseQuery(config, state) {
  const owners = config.excludeOwners.map((o) =>
    lower(o) === lower(config.user) ? `-user:${o}` : `-org:${o}`,
  );
  return [`is:pr`, `author:${config.user}`, ...(state ? [`is:${state}`] : []), ...owners].join(' ');
}

/** GitHub search URL that lists the pull requests behind the card (every state, same filters). */
export function verifyUrl(config) {
  const q = [baseQuery(config), ...config.denyRepos.map((r) => `-repo:${r}`)].join(' ');
  return `https://github.com/search?q=${encodeURIComponent(q)}&type=pullrequests`;
}

async function search(q, token) {
  const nodes = [];
  let cursor = null;
  do {
    const body = await graphql({ query: SEARCH_QUERY, variables: { q, cursor }, token, context: ` for "${q}"` });
    const page = body.data.search;
    nodes.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return nodes;
}

/** Raw search results: `{ merged: PullRequest[], open: PullRequest[] }`. */
export async function fetchPrs(config, token) {
  if (!token) throw new Error('GH_TOKEN is not set');
  const [merged, open] = await Promise.all([
    search(baseQuery(config, 'merged'), token),
    search(baseQuery(config, 'open'), token),
  ]);
  return { merged, open };
}

function applyFilters(prs, config) {
  const owners = new Set(config.excludeOwners.map(lower));
  const repos = new Set(config.denyRepos.map(lower));
  const urls = new Set(config.denyPrs);
  const stages = [
    ['isPrivate', (p) => !p.repository.isPrivate],
    ['excludeOwners', (p) => !owners.has(lower(p.repository.owner.login))],
    ['denyRepos', (p) => !repos.has(lower(p.repository.nameWithOwner))],
    ['denyPrs', (p) => !urls.has(p.url)],
  ];
  let kept = prs;
  let emptiedBy = null;
  for (const [name, keep] of stages) {
    const next = kept.filter(keep);
    if (next.length === 0 && kept.length > 0) emptiedBy = name;
    kept = next;
  }
  return { kept, emptiedBy };
}

const byName = (a, b) => {
  const x = lower(a.name);
  const y = lower(b.name);
  return x < y ? -1 : x > y ? 1 : 0;
};

/**
 * Filter raw PRs and reduce them to the set of repositories with a merged or an open PR,
 * sorted alphabetically (case-insensitive). Throws when no repository is left.
 */
export function select(raw, config) {
  const merged = applyFilters(raw.merged, config);
  const open = applyFilters(raw.open, config);
  const kept = [...merged.kept, ...open.kept];
  if (kept.length === 0) {
    const emptiedBy = merged.emptiedBy ?? open.emptiedBy;
    throw new Error(
      emptiedBy
        ? `No pull requests left after the ${emptiedBy} filter`
        : 'GitHub search returned no merged or open pull requests',
    );
  }

  const names = new Map();
  for (const p of kept) names.set(lower(p.repository.nameWithOwner), p.repository.nameWithOwner);
  const repos = [...names.values()]
    .map((name) => {
      const [owner, repo] = name.split('/');
      return { name, owner, repo, url: `https://github.com/${name}` };
    })
    .sort(byName);

  return { repos, verifyUrl: verifyUrl(config) };
}
