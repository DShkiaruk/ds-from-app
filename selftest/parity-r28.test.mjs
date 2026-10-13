import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFileSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { run, fixtureRepo, dropPngs, ROOT } from './helpers.mjs';

let S;
before(async () => { S = await startServer(); });
after(() => S.close());

const parity = (...args) => new Promise((ok) => execFile('node', [join(ROOT, 'templates', 'workbench', 'tools', 'parity.mjs'), ...args],
  { cwd: ROOT, maxBuffer: 64 << 20, timeout: 240000, killSignal: 'SIGKILL' },
  (err, stdout, stderr) => ok({ status: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr })));

const handFlows = (fl, screens) => { mkdirSync(join(fl, 'flows'), { recursive: true }); writeFileSync(join(fl, 'flows', 'flows.json'), JSON.stringify({ viewport: '1440x900', screens })); };

// R28.1: the product has a prototype-only bar at the top (52 px, texts "Option 1" and "Admin") that decisions.json
// excludes; the prototype page is built without it, so its content sits 52 px higher than in the capture.
test('parity (R28.1): a top prototype-only bar is accounted for — content 52 px higher passes, without the exclusion it fails on position', async () => {
  const fl = fixtureRepo('dsfa-parity-band-');
  try {
    const url = 'http://product.test/orders';
    handFlows(fl, [{ url, path: '/orders', pattern: '/orders', name: 'orders', transitions: [] }]);
    writeFileSync(join(fl, 'flows', 'routes.json'), JSON.stringify({ orders: '/band/' }));
    const el = (tag, text, path, x, y, w, h) => ({ tag, text, path, rect: { x, y, w, h } });
    writeFileSync(join(fl, 'baseline', 'orders--1440x900--light.json'), JSON.stringify({
      meta: { tool: 'capture.mjs', requestedUrl: url, finalUrl: url, viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
      elements: [
        el('header', '', 'div#root>header', 0, 0, 1440, 52),
        el('button', 'Option 1', 'div#root>header>nav>button:nth-of-type(1)', 151, 12, 74, 28),
        el('span', 'Admin', 'div#root>header>div:nth-of-type(2)>div>button>span', 1210, 18, 40, 16),
        el('h1', 'Orders', 'div#root>main>h1', 24, 76, 300, 32),
        el('button', 'Add order', 'div#root>main>button', 24, 132, 120, 32)] }));
    const dec = join(fl, 'decisions.json');
    const excl = (include) => ({ excluded: [{ id: 'bar', what: 'prototype bar', why: 'test', include, texts: ['Option 1', 'Admin'] }] });
    writeFileSync(dec, JSON.stringify(excl(false)));
    const ok = await parity(fl, '--prototype', S.url);
    assert.equal(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /left out as prototype-only: 2 element\(s\), 0 control\(s\) \(a top band of 52 px: the app's positions are compared 52 px higher\)/);
    writeFileSync(dec, JSON.stringify(excl(true)));
    const bad = await parity(fl, '--prototype', S.url);
    assert.notEqual(bad.status, 0, bad.stdout);
    assert.match(bad.stdout, /off: h1 "Orders" — y 76→24/);
    writeFileSync(dec, JSON.stringify({}));
    const none = await parity(fl, '--prototype', S.url);
    assert.notEqual(none.status, 0);
    assert.match(none.stdout, /off: h1 "Orders" — y 76→24/);
  } finally { rmSync(fl, { recursive: true, force: true }); }
});

// R28.2: mid-flow, a screen whose route still shows the Workbench's screen list is "not built yet", not a failure
test('parity (R28.2): --skip-unbuilt lists an unbuilt flow screen and passes; without the flag it fails as before', async () => {
  const fl = fixtureRepo('dsfa-parity-skip-');
  try {
    const url = 'http://product.test/orders';
    handFlows(fl, [{ url, path: '/orders', pattern: '/orders', name: 'orders', transitions: [] },
      { url: 'http://product.test/ghost', path: '/ghost', pattern: '/ghost', name: 'ghost', transitions: [] }]);
    writeFileSync(join(fl, 'flows', 'routes.json'), JSON.stringify({ orders: '/band/', ghost: '/workbench-index' }));
    const el = (tag, text, path, x, y, w, h) => ({ tag, text, path, rect: { x, y, w, h } });
    writeFileSync(join(fl, 'baseline', 'orders--1440x900--light.json'), JSON.stringify({
      meta: { tool: 'capture.mjs', requestedUrl: url, finalUrl: url, viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
      elements: [el('h1', 'Orders', 'div#root>main>h1', 24, 24, 300, 32), el('button', 'Add order', 'div#root>main>button', 24, 80, 120, 32)] }));
    const skip = await parity(fl, '--prototype', S.url, '--skip-unbuilt');
    assert.equal(skip.status, 0, skip.stdout + skip.stderr);
    assert.match(skip.stdout, /^– ghost: not built yet \(skipped\)$/m);
    assert.match(skip.stdout, /✓ \/orders · orders/);
    const strict = await parity(fl, '--prototype', S.url);
    assert.notEqual(strict.status, 0);
    assert.match(strict.stdout, /the prototype has no such screen/);
    assert.doesNotMatch(strict.stdout, /not built yet/);
  } finally { rmSync(fl, { recursive: true, force: true }); }
});

// I1: the screen a task built is never skipped as "not built yet"
test('parity (I1): --require names a screen that must not be skipped — unbuilt it fails with where to register it; without --require it is skipped', async () => {
  const fl = fixtureRepo('dsfa-parity-require-');
  try {
    const url = 'http://product.test/orders';
    handFlows(fl, [{ url, path: '/orders', pattern: '/orders', name: 'orders', transitions: [] },
      { url: 'http://product.test/ghost', path: '/ghost', pattern: '/ghost', name: 'ghost', transitions: [] }]);
    writeFileSync(join(fl, 'flows', 'routes.json'), JSON.stringify({ orders: '/band/', ghost: '/workbench-index' }));
    const el = (tag, text, path, x, y, w, h) => ({ tag, text, path, rect: { x, y, w, h } });
    writeFileSync(join(fl, 'baseline', 'orders--1440x900--light.json'), JSON.stringify({
      meta: { tool: 'capture.mjs', requestedUrl: url, finalUrl: url, viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
      elements: [el('h1', 'Orders', 'div#root>main>h1', 24, 24, 300, 32), el('button', 'Add order', 'div#root>main>button', 24, 80, 120, 32)] }));
    const req = await parity(fl, '--prototype', S.url, '--skip-unbuilt', '--require', 'ghost');
    assert.notEqual(req.status, 0, req.stdout);
    assert.match(req.stdout, /✗ ghost: required by this task but its route shows the screen list — register it in src\/screens\/index\.ts under the captured name 'ghost'/);
    assert.doesNotMatch(req.stdout, /not built yet/);
    const other = await parity(fl, '--prototype', S.url, '--skip-unbuilt', '--require', 'orders');
    assert.equal(other.status, 0, other.stdout + other.stderr);
    assert.match(other.stdout, /^– ghost: not built yet \(skipped\)$/m);
  } finally { rmSync(fl, { recursive: true, force: true }); }
});

// M1: a typo in --require fails like a typo in --only; nothing compared is not "match the product"
test('parity (M1): an unknown --require name fails like an unknown --only; with 0 screens compared the summary does not claim a match', async () => {
  const fl = fixtureRepo('dsfa-parity-req-unknown-');
  try {
    handFlows(fl, [{ url: 'http://product.test/ghost', path: '/ghost', pattern: '/ghost', name: 'ghost', transitions: [] }]);
    writeFileSync(join(fl, 'flows', 'routes.json'), JSON.stringify({ ghost: '/workbench-index' }));
    const typo = await parity(fl, '--prototype', S.url, '--skip-unbuilt', '--require', 'gohst');
    assert.notEqual(typo.status, 0, typo.stdout);
    assert.match(typo.stdout, /✗ gohst: not in extraction\/flows\/flows\.json/);
    const none = await parity(fl, '--prototype', S.url, '--skip-unbuilt');
    assert.doesNotMatch(none.stdout, /match the product/, none.stdout);
    assert.match(none.stdout, /parity: 0 of 1 screens compared \(1 not built yet, skipped\)/);
  } finally { rmSync(fl, { recursive: true, force: true }); }
});
