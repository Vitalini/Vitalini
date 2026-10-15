// GitHub GraphQL transport shared by both generators.

const GRAPHQL_URL = 'https://api.github.com/graphql';

/** POST one GraphQL query and return the parsed body. `context` is appended to error messages. */
export async function graphql({ query, variables, token, context = '' }) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`GitHub GraphQL HTTP ${res.status}${context}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`GitHub GraphQL error${context}: ${body.errors[0].message}`);
  return body;
}
