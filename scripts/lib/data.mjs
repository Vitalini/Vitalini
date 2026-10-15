// Fetch, filter and group external pull requests. `select` is pure; only `fetchPrs` does I/O.

const GRAPHQL_URL = 'https://api.github.com/graphql';

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

/** Search qualifiers that exclude employer and own repositories. */
export function baseQuery(config, state) {
  const owners = config.excludeOwners.map((o) =>
    lower(o) === lower(config.user) ? `-user:${o}` : `-org:${o}`,
  );
  return [`is:pr`, `author:${config.user}`, `is:${state}`, ...owners].join(' ');
}

/** GitHub search URL that reproduces the merged count shown on the card. */
export function verifyUrl(config) {
  const q = [baseQuery(config, 'merged'), ...config.denyRepos.map((r) => `-repo:${r}`)].join(' ');
  return `https://github.com/search?q=${encodeURIComponent(q)}&type=pullrequests`;
}

async function search(q, token) {
  const nodes = [];
  let cursor = null;
  do {
    const res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: SEARCH_QUERY, variables: { q, cursor } }),
    });
    if (!res.ok) throw new Error(`GitHub GraphQL HTTP ${res.status} for "${q}"`);
    const body = await res.json();
    if (body.errors?.length) throw new Error(`GitHub GraphQL error for "${q}": ${body.errors[0].message}`);
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

const byDesc = (a, b) => (a < b ? 1 : a > b ? -1 : 0);

/** Filter and group raw PRs into the model the renderers draw. Throws when no merged PR is left. */
export function select(raw, config) {
  const merged = applyFilters(raw.merged, config);
  if (merged.kept.length === 0) {
    throw new Error(
      merged.emptiedBy
        ? `No merged pull requests left after the ${merged.emptiedBy} filter`
        : 'GitHub search returned no merged pull requests',
    );
  }

  const groups = new Map();
  for (const p of merged.kept) {
    const name = p.repository.nameWithOwner;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push({ number: p.number, title: p.title, url: p.url, mergedAt: p.mergedAt });
  }
  const repos = [...groups].map(([name, prs]) => {
    prs.sort((a, b) => byDesc(a.mergedAt, b.mergedAt) || b.number - a.number);
    const [owner, repo] = name.split('/');
    return { name, owner, repo, url: `https://github.com/${name}`, count: prs.length, prs };
  });
  repos.sort(
    (a, b) => b.count - a.count || byDesc(a.prs[0].mergedAt, b.prs[0].mergedAt) || (a.name < b.name ? -1 : 1),
  );

  const items = applyFilters(raw.open, config)
    .kept.map((p) => ({
      repo: p.repository.nameWithOwner,
      number: p.number,
      title: p.title,
      url: p.url,
      createdAt: p.createdAt,
    }))
    .sort((a, b) => (a.repo < b.repo ? -1 : a.repo > b.repo ? 1 : b.number - a.number));

  return {
    merged: { total: merged.kept.length, repoCount: repos.length, repos },
    open: { items },
    verifyUrl: verifyUrl(config),
  };
}
