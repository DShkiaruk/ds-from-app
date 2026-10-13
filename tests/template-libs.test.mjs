import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const f of ['color.mjs', 'product.mjs']) {
  test(`the Workbench's tools/lib/${f} is byte-identical to scripts/lib/${f}`, () => {
    assert.ok(readFileSync(join(ROOT, 'templates', 'workbench', 'tools', 'lib', f)).equals(readFileSync(join(ROOT, 'scripts', 'lib', f))));
  });
}
