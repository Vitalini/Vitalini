// File output shared by the generators.

import { renameSync, writeFileSync } from 'node:fs';

/** Write through a temp file so a crash never leaves a half-written output. */
export function writeAtomic(path, content) {
  writeFileSync(`${path}.tmp`, content);
  renameSync(`${path}.tmp`, path);
}
