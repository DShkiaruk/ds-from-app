import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { run, fixtureRepo, dropPngs, expectAll } from './helpers.mjs';

let S, dir;
before(async () => {
  S = await startServer();
  dir = fixtureRepo('dsfa-inventory-');
  for (const scheme of ['light', 'dark']) await run('capture.mjs', '--url', S.url, '--screen', 'fixture', '--scheme', scheme, '--out', join(dir, 'baseline'), '--no-interact', '--settle', '300');
  dropPngs(join(dir, 'baseline'));
});
after(() => { S.close(); rmSync(dir, { recursive: true, force: true }); });

test('the inventory draft: a library\'s own names are measured, a role alone is derived', async () => {
  const inv = await run('inventory.mjs', dir);
  assert.equal(inv.status, 0, inv.stderr);
  const D = JSON.parse(readFileSync(join(dir, 'components.draft.json'), 'utf8')).components;
  const card = D.find((c) => c.name === 'Card'), btn = D.find((c) => c.name === 'Button');
  expectAll([
    [card?.usage.instances === 2 && card.provenance.label === 'measured' && /data-slot/.test(card.recognize.markers[0]), 'the draft names what data-slot names (Card ×2, measured)'],
    [btn?.provenance.label === 'derived' && btn.states.some((s) => s.state === 'hover'), 'a plain <button> is a Button by its role (derived), with the hover the capture measured'],
  ]);
});
