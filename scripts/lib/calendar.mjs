// Fetch the contribution calendar and reduce it to a model shared by the graphics. Only `fetchCalendar` does I/O.

import { graphql } from './github.mjs';

const CALENDAR_QUERY = `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount } }
      }
    }
  }
}`;

/** Raw GraphQL response body (the same shape as scripts/fixtures/calendar.json). */
export async function fetchCalendar(login, token) {
  if (!token) throw new Error('GITHUB_TOKEN is not set');
  const body = await graphql({ query: CALENDAR_QUERY, variables: { login }, token });
  if (!body.data?.user) throw new Error(`GitHub user "${login}" not found`);
  return body;
}

/** Value at percentile `p` (0..100) of an ascending array, nearest-rank. */
export function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

const weekday = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

export const DEFAULT_NAME = 'Vitalii Borovyk';

/**
 * Render model. Every week GitHub returns is kept (53 for "last year"). `total` is GitHub's reported
 * `totalContributions`, so the caption equals the number on the profile page; `daySum` is the sum of
 * the day counts, which the CLI compares against it. `name` is the display name for the title. `cap` is the
 * 99th percentile of active days.
 */
export function toModel(body, { name = DEFAULT_NAME } = {}) {
  const cal = body?.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal?.weeks?.length) throw new Error('calendar has no weeks');
  const weeks = cal.weeks.map((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount, weekday: weekday(d.date) })),
  );
  const days = weeks.flat();
  const daySum = days.reduce((s, d) => s + d.count, 0);
  const active = days.filter((d) => d.count > 0).map((d) => d.count).sort((a, b) => a - b);
  const max = active.at(-1) ?? 0;
  const peak = max > 0 ? days.find((d) => d.count === max) : null;
  return {
    name,
    weeks,
    total: cal.totalContributions ?? daySum,
    daySum,
    first: days[0].date,
    last: days.at(-1).date,
    activeDays: active.length,
    dayCount: days.length,
    max,
    peak,
    cap: Math.max(1, percentile(active, 99)),
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = (date) => MONTHS[Number(date.slice(5, 7)) - 1];
const monthYear = (date) => `${monthName(date)} ${date.slice(0, 4)}`;

/** "8,645 contributions · Oct 2025 – Oct 2026" */
export function caption(model) {
  const n = model.total.toLocaleString('en-US');
  return `${n} contribution${model.total === 1 ? '' : 's'} · ${monthYear(model.first)} – ${monthYear(model.last)}`;
}

const dayMonth = (date) => `${monthName(date)} ${Number(date.slice(8))}`;

/** "Oct 1, 2026", "Oct 1–15, 2026", "Sep 28 – Oct 4, 2026", "Dec 28, 2025 – Jan 3, 2026". */
export function dateRange(first, last) {
  const y1 = first.slice(0, 4);
  const y2 = last.slice(0, 4);
  if (first === last) return `${dayMonth(first)}, ${y1}`;
  if (y1 !== y2) return `${dayMonth(first)}, ${y1} – ${dayMonth(last)}, ${y2}`;
  if (first.slice(5, 7) === last.slice(5, 7)) return `${dayMonth(first)}–${Number(last.slice(8))}, ${y1}`;
  return `${dayMonth(first)} – ${dayMonth(last)}, ${y1}`;
}

/** Hover text for a span of days: "414 contributions · Sep 29, 2026", "No contributions · Oct 1–15, 2026". */
export function tooltip(count, first, last = first) {
  const n = count === 0 ? 'No contributions' : `${count.toLocaleString('en-US')} contribution${count === 1 ? '' : 's'}`;
  return `${n} · ${dateRange(first, last)}`;
}
