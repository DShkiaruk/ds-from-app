import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { run } from './helpers.mjs';

test('init → capture → tokens → inventory → flows → checkpoint prepare, on extraction/', async () => {
  const S = await startServer();
  const home = mkdtempSync(join(tmpdir(), 'dsfa-e2e-'));
  const repo = join(home, 'fixture-workbench');
  try {
    let r = await run('scaffold.mjs', 'init', repo, '--product', 'Фікстура', '--url', S.url);
    assert.equal(r.status, 0, r.stderr);
    for (const scheme of ['light', 'dark']) {
      r = await run('capture.mjs', '--url', S.url, '--screen', 'огляд', '--scheme', scheme, '--out', join(repo, 'extraction', 'baseline'), '--no-interact', '--block-writes', '--settle', '300');
      assert.equal(r.status, 0, r.stderr);
    }
    r = await run('tokens.mjs', repo);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    r = await run('inventory.mjs', repo);
    assert.equal(r.status, 0, r.stderr);
    r = await run('flows.mjs', repo, '--block-writes', '--settle', '250');
    assert.equal(r.status, 0, r.stderr || r.stdout);
    r = await run('checkpoint.mjs', 'prepare', repo);
    assert.equal(r.status, 0, r.stderr);

    const doc = JSON.parse(readFileSync(join(repo, 'extraction', 'tokens.json'), 'utf8'));
    assert.match(doc.$closure, /NEEDS-TOKEN/, 'the closure sentence survives the build');
    assert.ok(Object.keys(doc.tokens).length > 0, 'tokens.json holds tokens');
    assert.ok(Object.values(doc.tokens).every((t) => ['measured', 'derived', 'decided'].includes(t.$provenance?.label)), 'every token carries a label');
    assert.ok(doc.$meta.instruments.some((i) => i.name === 'ds-from-app scripts/tokens.mjs'));
    const cp = JSON.parse(readFileSync(join(repo, 'extraction', 'checkpoint.json'), 'utf8'));
    assert.equal(cp.project, 'Фікстура');
    assert.deepEqual(cp.screens.map((s) => s.id), ['огляд']);
    assert.ok(cp.screens[0].screenshot && existsSync(join(repo, 'extraction', cp.screens[0].screenshot)), 'the light screenshot is linked');
    assert.match(cp.screens[0].screenshot, /--light\.png$/, 'the light capture is the one linked');
    assert.equal(cp.tokens.find((t) => t.id === 'color-primary')?.nameStatus, 'product');
    assert.equal(cp.tokens.find((t) => t.id === 'spacing-4')?.nameStatus, 'proposed', 'the method made the spacing steps: a proposed name, not the app\'s and not a person\'s decision');
    assert.ok(cp.components.some((c) => c.name === 'Card'));
    const F = JSON.parse(readFileSync(join(repo, 'extraction', 'flows', 'flows.json'), 'utf8'));
    assert.ok(F.screens.some((s) => s.name === 'огляд'), 'flows.json maps the captured screen');
  } finally {
    S.close();
    rmSync(home, { recursive: true, force: true });
  }
});
