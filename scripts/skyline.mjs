#!/usr/bin/env node
// Generate the 3D contribution skyline (light + dark SVG).
// Usage: node scripts/skyline.mjs [--fixture <calendar.json>] [--out <dir>] [--user <login>] [--name <display name>]
// Live mode reads GITHUB_TOKEN (or GH_TOKEN). Nothing is written unless both renders succeed.

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_NAME, caption, fetchCalendar, toModel } from './lib/skyline-data.mjs';
import { renderSkyline } from './lib/skyline-render.mjs';
import { writeAllAtomic } from './lib/write.mjs';

async function main() {
  const { values } = parseArgs({
    options: {
      fixture: { type: 'string' },
      out: { type: 'string', default: 'generated' },
      user: { type: 'string', default: 'Vitalini' },
      name: { type: 'string', default: DEFAULT_NAME },
    },
  });
  const body = values.fixture
    ? JSON.parse(readFileSync(values.fixture, 'utf8'))
    : await fetchCalendar(values.user, process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const model = toModel(body, { name: values.name });
  if (model.daySum !== model.total) {
    console.warn(`skyline: warning: day counts sum to ${model.daySum}, GitHub reports ${model.total}; the caption uses ${model.total}`);
  }
  const files = [
    [join(values.out, 'skyline-light.svg'), renderSkyline(model, 'light')],
    [join(values.out, 'skyline-dark.svg'), renderSkyline(model, 'dark')],
  ];
  mkdirSync(values.out, { recursive: true });
  writeAllAtomic(files);
  console.log(`${caption(model)}; peak ${model.max}, cap ${model.cap}`);
}

main().catch((err) => {
  console.error(`skyline: ${err.message}`);
  process.exit(1);
});
