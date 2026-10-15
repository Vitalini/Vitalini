#!/usr/bin/env node
// Generate the Year Walk landscape (light + dark SVG).
// Usage: node scripts/yearwalk.mjs [--fixture <calendar.json>] [--out <dir>] [--user <login>] [--name <display name>]
//                                  [--bucket day|week|halfmonth|month]
// Live mode reads GITHUB_TOKEN (or GH_TOKEN). Nothing is written unless both renders succeed.

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_NAME, caption, fetchCalendar, toModel } from './lib/calendar.mjs';
import { renderYearWalk, scene } from './lib/yearwalk-render.mjs';
import { BUCKETS } from './lib/yearwalk-terrain.mjs';
import { writeAllAtomic } from './lib/write.mjs';

async function main() {
  const { values } = parseArgs({
    options: {
      fixture: { type: 'string' },
      out: { type: 'string', default: 'generated' },
      user: { type: 'string', default: 'Vitalini' },
      name: { type: 'string', default: DEFAULT_NAME },
      bucket: { type: 'string', default: 'week' },
    },
  });
  if (!BUCKETS.includes(values.bucket)) throw new Error(`--bucket must be one of ${BUCKETS.join(', ')}`);
  const body = values.fixture
    ? JSON.parse(readFileSync(values.fixture, 'utf8'))
    : await fetchCalendar(values.user, process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const model = toModel(body, { name: values.name });
  if (model.daySum !== model.total) {
    console.warn(`yearwalk: warning: day counts sum to ${model.daySum}, GitHub reports ${model.total}; the caption uses ${model.total}`);
  }
  const files = ['light', 'dark'].map((t) => [join(values.out, `yearwalk-${t}.svg`), renderYearWalk(model, t, values.bucket)]);
  mkdirSync(values.out, { recursive: true });
  writeAllAtomic(files);
  const { terrain, challenges, route } = scene(model, values.bucket);
  const kinds = challenges.map((c) => c.type).join(', ');
  console.log(`${caption(model)}; ${terrain.buckets.length} ${values.bucket} plateaus, cap ${terrain.cap}; loop ${route.loop.toFixed(1)} s; ${kinds}`);
}

main().catch((err) => {
  console.error(`yearwalk: ${err.message}`);
  process.exit(1);
});
