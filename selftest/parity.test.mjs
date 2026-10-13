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

test('parity: a two-screen product against itself passes; renamed header, dead control and re-padded button are named', async () => {
  const fl = fixtureRepo('dsfa-parity-');
  try {
    await run('capture.mjs', '--url', `${S.url}flows/`, '--screen', 'accounts', '--out', join(fl, 'baseline'), '--no-interact', '--settle', '300');
    await run('capture.mjs', '--url', `${S.url}flows/detail/1`, '--screen', 'account-detail', '--out', join(fl, 'baseline'), '--no-interact', '--settle', '300');
    const mf = await run('flows.mjs', fl, '--settle', '250');
    assert.equal(mf.status, 0, mf.stderr || mf.stdout);
    const routesFor = (v) => ({ '/flows/': `/flows/?variant=${v}`, '/flows/detail/:id': `/flows/detail/1?variant=${v}` });
    writeFileSync(join(fl, 'flows', 'routes.json'), JSON.stringify(routesFor('good')));
    const good = await parity(fl, '--prototype', S.url);
    assert.equal(good.status, 0, good.stdout + good.stderr);
    writeFileSync(join(fl, 'flows', 'routes.json'), JSON.stringify(routesFor('bad')));
    const bad = await parity(fl, '--prototype', S.url);
    assert.notEqual(bad.status, 0);
    assert.match(bad.stdout, /missing interface text[^\n]*"Owner"/, 'a renamed column header is named as missing interface text');
    assert.match(bad.stdout, /DEAD: button "Filters"/, 'a control that does nothing where the product\'s opens a dialog is DEAD');
    assert.match(bad.stdout, /off: button "Compact view"[^\n]*padding/, 'a re-padded button is named with its padding');
    // R18: prototype-only parts the designer left out (decisions.json excluded, unticked) are not demanded from the prototype
    const dec = join(fl, 'decisions.json');
    const excl = (include) => ({ excluded: [{ id: 'demo', what: 'demo controls', why: 'test', include, texts: ['Filters', 'Owner'] }] });
    writeFileSync(join(fl, 'flows', 'routes.json'), JSON.stringify(routesFor('bad')));
    writeFileSync(dec, JSON.stringify(excl(false)));
    const left = await parity(fl, '--prototype', S.url);
    assert.notEqual(left.status, 0, 'the re-padded button still fails');
    assert.match(left.stdout, /off: button "Compact view"[^\n]*padding/);
    assert.doesNotMatch(left.stdout, /DEAD: button "Filters"/);
    assert.doesNotMatch(left.stdout, /missing interface text[^\n]*"Owner"/);
    assert.match(left.stdout, /left out as prototype-only: \d+ element\(s\), \d+ control\(s\)/);
    writeFileSync(dec, JSON.stringify(excl(true)));
    const back = await parity(fl, '--prototype', S.url);
    assert.match(back.stdout, /DEAD: button "Filters"/, 'put back, the control is demanded again');
    assert.doesNotMatch(back.stdout, /left out as prototype-only/);
    writeFileSync(dec, '{ not json');
    const broken = await parity(fl, '--prototype', S.url);
    assert.notEqual(broken.status, 0);
    assert.match(broken.stderr, /decisions\.json/, 'an unreadable decisions.json is named on stderr');
    assert.match(broken.stdout, /DEAD: button "Filters"/, 'and nothing is left out');
    rmSync(dec);
    rmSync(join(fl, 'flows', 'routes.json')); // no mapping: the product's own paths, as hash routes under the prototype's root
    const none = await parity(fl, '--prototype', `${S.url}nothing-here/`);
    assert.notEqual(none.status, 0);
    assert.match(none.stdout, /no such screen|renders nothing/, 'a prototype that has no such screen is named');
    assert.match(none.stdout, /\/flows\/ · accounts/, 'a named screen is labelled path · name');
    assert.match(none.stdout, /nothing-here\/#\/accounts\b/, 'a named screen opens at #/<name>, the Workbench route');
    writeFileSync(join(fl, 'flows', 'routes.json'), JSON.stringify({ accounts: '/flows/?variant=bad' })); // a routes.json entry keyed by NAME wins
    const byNameRoute = await parity(fl, '--prototype', S.url);
    assert.match(byNameRoute.stdout, /accounts[^\n]*→\s+\S*\/flows\/\?variant=bad/, 'a routes.json entry keyed by the screen name decides where it opens');
  } finally { rmSync(fl, { recursive: true, force: true }); }
});

test('parity: a single-URL product, a screen route each; a dead menu item names the screen the product goes to', async () => {
  const sp = fixtureRepo('dsfa-parity-spa-');
  try {
    const origin = new URL(S.url).origin;
    const signedIn = join(sp, 'session.auth.json');
    writeFileSync(signedIn, JSON.stringify({ cookies: [], origins: [{ origin, localStorage: [], sessionStorage: [{ name: 'signedIn', value: '1' }] }] }));
    await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--screen', 'orders', '--as-screen', '--out', join(sp, 'baseline'), '--no-interact', '--settle', '300');
    await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--click', '[data-key="settings"]', '--as-screen', '--screen', 'settings', '--out', join(sp, 'baseline'), '--no-interact', '--settle', '300');
    dropPngs(join(sp, 'baseline'));
    const mf = await run('flows.mjs', sp, '--storage', signedIn, '--landmark', 'h1', '--allow', 'Order history', '--settle', '250');
    assert.equal(mf.status, 0, mf.stderr || mf.stdout);
    const spaRoutes = (v) => ({ orders: `/spa/?proto=1${v}#/orders`, settings: `/spa/?proto=1${v}#/settings` });
    writeFileSync(join(sp, 'flows', 'routes.json'), JSON.stringify(spaRoutes('')));
    const good = await parity(sp, '--prototype', S.url);
    assert.equal(good.status, 0, good.stdout + good.stderr);
    writeFileSync(join(sp, 'flows', 'routes.json'), JSON.stringify(spaRoutes('&variant=bad')));
    const bad = await parity(sp, '--prototype', S.url);
    assert.notEqual(bad.status, 0);
    assert.match(bad.stdout, /DEAD: menuitem "Settings"[^\n]*settings screen/);
  } finally { rmSync(sp, { recursive: true, force: true }); }
});

// R21: gate 6 never passes having checked nothing
const handFlows = (fl, screens) => { mkdirSync(join(fl, 'flows'), { recursive: true }); writeFileSync(join(fl, 'flows', 'flows.json'), JSON.stringify({ viewport: '1440x900', screens })); };
const accounts = { url: 'http://product.test/accounts', path: '/accounts', pattern: '/accounts', name: 'accounts', transitions: [] };

test('parity: an --only value that names no screen is a failure, and an empty report exits 1', async () => {
  const fl = fixtureRepo('dsfa-parity-only-');
  try {
    handFlows(fl, [accounts]);
    const r = await parity(fl, '--prototype', S.url, '--only', 'nosuchscreen');
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /✗ nosuchscreen: not in extraction\/flows\/flows\.json \(the screen was captured after the last flows run\) — ask the designer to run \/ds-from-app again \(capturing is the plugin's job\)/);
    assert.match(r.stdout, /parity: nothing was checked/);
  } finally { rmSync(fl, { recursive: true, force: true }); }
});

test('parity: a requested screen without a baseline capture counts as a failure', async () => {
  const fl = fixtureRepo('dsfa-parity-nobase-');
  try {
    handFlows(fl, [accounts]);
    writeFileSync(join(fl, 'flows', 'routes.json'), JSON.stringify({ accounts: '/flows/' }));
    const r = await parity(fl, '--prototype', S.url, '--only', 'accounts');
    assert.notEqual(r.status, 0, r.stdout);
    assert.match(r.stdout, /no baseline capture for this screen/);
    assert.match(r.stdout, /FAIL/);
  } finally { rmSync(fl, { recursive: true, force: true }); }
});

test('parity: a page carrying data-workbench-index is "renders nothing" — the prototype has no such screen', async () => {
  const fl = fixtureRepo('dsfa-parity-index-');
  try {
    handFlows(fl, [accounts]);
    writeFileSync(join(fl, 'flows', 'routes.json'), JSON.stringify({ accounts: '/workbench-index' }));
    const r = await parity(fl, '--prototype', S.url);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /the prototype has no such screen \(the route renders nothing\)/);
  } finally { rmSync(fl, { recursive: true, force: true }); }
});

test('parity: a screen flows.mjs marked unreachable (no pattern) does not crash parity', async () => {
  const fl = fixtureRepo('dsfa-parity-unreach-');
  try {
    handFlows(fl, [{ url: 'http://product.test/', name: 'ghost', clicks: ['[data-x]'], unreachable: true, transitions: [] }]);
    const r = await parity(fl, '--prototype', S.url);
    assert.notEqual(r.status, 0);
    assert.doesNotMatch(r.stderr, /TypeError|at file:/);
    assert.match(r.stdout, /ghost[^\n]*\n\s+unreachable in the app — recapture/);
  } finally { rmSync(fl, { recursive: true, force: true }); }
});

test('parity (R23): a missing icon-only control is reported with how to make it findable', async () => {
  const fl = fixtureRepo('dsfa-parity-icon-');
  try {
    handFlows(fl, [{ ...accounts, transitions: [{ control: { role: 'button', name: '', icon: 'nosuchicon' }, effect: { kind: 'open', surface: 'dialog' } }] }]);
    writeFileSync(join(fl, 'flows', 'routes.json'), JSON.stringify({ accounts: '/flows/' }));
    const r = await parity(fl, '--prototype', S.url);
    assert.notEqual(r.status, 0);
    assert.match(r.stdout, /missing control: button, icon "nosuchicon" — put data-icon="nosuchicon" on the icon inside the control/);
  } finally { rmSync(fl, { recursive: true, force: true }); }
});

test('parity (R24): prototype screenshots are named by screen name, so two screens on one pattern never share a file', async () => {
  const fl = fixtureRepo('dsfa-parity-shots-');
  try {
    handFlows(fl, [accounts, { ...accounts, name: 'accounts-compact' }]);
    writeFileSync(join(fl, 'flows', 'routes.json'), JSON.stringify({ accounts: '/flows/', 'accounts-compact': '/flows/?variant=good' }));
    await parity(fl, '--prototype', S.url);
    const files = readdirSync(join(fl, 'flows', 'parity')).sort();
    assert.deepEqual(files, ['accounts-compact.png', 'accounts.png']);
  } finally { rmSync(fl, { recursive: true, force: true }); }
});

test('parity (R31): the layout of a plain text div is compared — padding 14 → 16 on .search fails; same padding passes; a text the prototype lacks is not a layout failure', async () => {
  const fl = fixtureRepo('dsfa-parity-wide-');
  try {
    await run('capture.mjs', '--url', `${S.url}flows/`, '--screen', 'accounts', '--out', join(fl, 'baseline'), '--no-interact', '--settle', '300');
    await run('capture.mjs', '--url', `${S.url}flows/detail/1`, '--screen', 'account-detail', '--out', join(fl, 'baseline'), '--no-interact', '--settle', '300');
    const mf = await run('flows.mjs', fl, '--settle', '250');
    assert.equal(mf.status, 0, mf.stderr || mf.stdout);
    const at = (v) => writeFileSync(join(fl, 'flows', 'routes.json'), JSON.stringify({ '/flows/': `/flows/?variant=${v}`, '/flows/detail/:id': `/flows/detail/1?variant=${v}` }));
    at('good');
    const same = await parity(fl, '--prototype', S.url, '--only', 'accounts');
    assert.equal(same.status, 0, same.stdout + same.stderr);
    at('search16');
    const off = await parity(fl, '--prototype', S.url, '--only', 'accounts');
    assert.notEqual(off.status, 0, 'a padding change on a plain div fails parity');
    assert.match(off.stdout, /off: div "Search"[^\n]*paddingLeft 14px→16px/);
    at('lh');
    const lh = await parity(fl, '--prototype', S.url, '--only', 'accounts');
    assert.match(lh.stdout, /off: div "Search"[^\n]*lineHeight/, 'the box agrees, the line height differs: still off (R31b)');
    for (const v of ['inner', 'far']) {
      at(v);
      const skipped = await parity(fl, '--prototype', S.url, '--only', 'accounts');
      assert.doesNotMatch(skipped.stdout, /off: \w+ "Search"/, `${v}: the boxes do not agree, so the pair is skipped, not failed (R31b)`);
      assert.equal(skipped.status, 0, skipped.stdout + skipped.stderr);
    }
    at('nosearch');
    const lacks = await parity(fl, '--prototype', S.url, '--only', 'accounts');
    assert.doesNotMatch(lacks.stdout, /off: div "Search"/, 'text the prototype lacks is not a layout failure');
    assert.doesNotMatch(lacks.stdout, /missing interface text[^\n]*"Search"/, 'a plain div is not interface copy');
    assert.equal(lacks.status, 0, lacks.stdout + lacks.stderr);
  } finally { rmSync(fl, { recursive: true, force: true }); }
});
