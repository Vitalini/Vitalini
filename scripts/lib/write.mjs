// File output shared by the generators.

import { renameSync, writeFileSync } from 'node:fs';

/**
 * Write a set of files as one step: every `<path>.tmp` is written first, then all are renamed into
 * place. A failed write leaves every target untouched; a crash never leaves a half-written file.
 */
export function writeAllAtomic(files) {
  for (const [path, content] of files) writeFileSync(`${path}.tmp`, content);
  for (const [path] of files) renameSync(`${path}.tmp`, path);
}
