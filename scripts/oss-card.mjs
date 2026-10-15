#!/usr/bin/env node
// Generate the open-source impact card (light + dark SVG) and the README table.
// Usage: node scripts/oss-card.mjs [--fixture <prs.json>] [--out <dir>] [--readme <README.md>] [--config <oss.config.json>]
// Live mode reads GH_TOKEN. Nothing is written unless every step succeeds.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchPrs, select } from './lib/data.mjs';
import { renderReadmeBlock, renderSvg, headerLine } from './lib/render.mjs';

const START = '<!-- oss:start -->';
const END = '<!-- oss:end -->';

function replaceBlock(readme, block) {
  const s = readme.indexOf(START);
  const e = readme.indexOf(END);
  if (s === -1 || e === -1 || e < s) throw new Error(`README is missing the ${START} / ${END} markers`);
  return `${readme.slice(0, s + START.length)}\n${block}${readme.slice(e)}`;
}

function writeAtomic(path, content) {
  writeFileSync(`${path}.tmp`, content);
  renameSync(`${path}.tmp`, path);
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
    [join(values.out, 'oss-light.svg'), renderSvg(model, 'light', config.maxPrsPerRepo)],
    [join(values.out, 'oss-dark.svg'), renderSvg(model, 'dark', config.maxPrsPerRepo)],
  ];
  if (values.readme) {
    files.push([values.readme, replaceBlock(readFileSync(values.readme, 'utf8'), renderReadmeBlock(model))]);
  }

  mkdirSync(values.out, { recursive: true });
  for (const [path, content] of files) writeAtomic(path, content);
  console.log(`${headerLine(model)}; ${model.open.items.length} in review`);
}

main().catch((err) => {
  console.error(`oss-card: ${err.message}`);
  process.exit(1);
});
