#!/usr/bin/env node
// Generate the 3D contribution skyline (light + dark SVG).
// Usage: node scripts/skyline.mjs [--fixture <calendar.json>] [--out <dir>] [--user <login>]
// Live mode reads GITHUB_TOKEN (or GH_TOKEN). Nothing is written unless both renders succeed.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { caption, fetchCalendar, toModel } from './lib/skyline-data.mjs';
import { renderSkyline } from './lib/skyline-render.mjs';

function writeAtomic(path, content) {
  writeFileSync(`${path}.tmp`, content);
  renameSync(`${path}.tmp`, path);
}

async function main() {
  const { values } = parseArgs({
    options: {
      fixture: { type: 'string' },
      out: { type: 'string', default: 'generated' },
      user: { type: 'string', default: 'Vitalini' },
    },
  });
  const body = values.fixture
    ? JSON.parse(readFileSync(values.fixture, 'utf8'))
    : await fetchCalendar(values.user, process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const model = toModel(body);
  const files = [
    [join(values.out, 'skyline-light.svg'), renderSkyline(model, 'light')],
    [join(values.out, 'skyline-dark.svg'), renderSkyline(model, 'dark')],
  ];
  mkdirSync(values.out, { recursive: true });
  for (const [path, content] of files) writeAtomic(path, content);
  console.log(`${caption(model)}; peak ${model.max}, cap ${model.cap}`);
}

main().catch((err) => {
  console.error(`skyline: ${err.message}`);
  process.exit(1);
});
