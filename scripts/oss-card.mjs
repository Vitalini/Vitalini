#!/usr/bin/env node
// Generate the open-source contributions card (light + dark SVG) and the README block that links it.
// Usage: node scripts/oss-card.mjs [--fixture <prs.json>] [--out <dir>] [--readme <README.md>] [--config <oss.config.json>]
// Live mode reads GH_TOKEN. Nothing is written unless every step succeeds.

import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchPrs, select } from './lib/data.mjs';
import { renderReadmeBlock, renderSvg } from './lib/render.mjs';
import { writeAtomic } from './lib/write.mjs';

const START = '<!-- oss:start -->';
const END = '<!-- oss:end -->';

function replaceBlock(readme, block) {
  const s = readme.indexOf(START);
  const e = readme.indexOf(END);
  if (s === -1 || e === -1 || e < s) throw new Error(`README is missing the ${START} / ${END} markers`);
  return `${readme.slice(0, s + START.length)}\n${block}${readme.slice(e)}`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      fixture: { type: 'string' },
      out: { type: 'string', default: 'generated' },
      readme: { type: 'string' },
      config: { type: 'string', default: new URL('../oss.config.json', import.meta.url).pathname },
    },
  });
  const config = JSON.parse(readFileSync(values.config, 'utf8'));
  const raw = values.fixture
    ? JSON.parse(readFileSync(values.fixture, 'utf8'))
    : await fetchPrs(config, process.env.GH_TOKEN);
  const model = select(raw, config);

  const files = [
    [join(values.out, 'oss-light.svg'), renderSvg(model, 'light')],
    [join(values.out, 'oss-dark.svg'), renderSvg(model, 'dark')],
  ];
  if (values.readme) {
    files.push([values.readme, replaceBlock(readFileSync(values.readme, 'utf8'), renderReadmeBlock(model))]);
  }

  mkdirSync(values.out, { recursive: true });
  for (const [path, content] of files) writeAtomic(path, content);
  console.log(`${model.repos.length} repositories: ${model.repos.map((r) => r.name).join(', ')}`);
}

main().catch((err) => {
  console.error(`oss-card: ${err.message}`);
  process.exit(1);
});
