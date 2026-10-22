// One window for the whole run (lib/window.mjs): sign in with --keep-open, work with --attach, close with --close —
// for a product that signs the designer out when its tab closes. Opens a visible Chrome window.
// And the leak that sent such a product's "tab closed" requests past the write block (lib/safety.mjs OUTLIVING_WRITES).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from './server.mjs';
import { run, fixtureRepo } from './helpers.mjs';

let S, dir, windows;
const W = 'fixture-window';
before(async () => {
  S = await startServer();
  dir = fixtureRepo('dsfa-window-');
  windows = mkdtempSync(join(tmpdir(), 'dsfa-windows-'));
  process.env.DSFA_WINDOWS_DIR = windows; // run() passes process.env on: every script sees this folder, not ~/.ds-from-app
});
after(async () => {
  // every window the file opened, also when a test failed before its own --close
  await run('capture.mjs', '--close', W);
  await run('capture.mjs', '--close', 'memory-window');
  S.close();
  rmSync(dir, { recursive: true, force: true });
  rmSync(windows, { recursive: true, force: true });
});

const connect = async () => {
  const { connectWindow } = await import('../scripts/lib/window.mjs');
  return connectWindow(W);
};

test('flows.mjs closes a context before every press: the page\'s "tab closed" writes do not reach the server', async () => {
  const repo = fixtureRepo('dsfa-bye-');
  try {
    const c = await run('capture.mjs', '--url', `${S.url}bye`, '--screen', 'account', '--out', join(repo, 'baseline'), '--settle', '200');
    assert.equal(c.status, 0, c.stderr);
    S.resetPosts();
    const f = await run('flows.mjs', repo, '--settle', '200');
    assert.equal(f.status, 0, f.stderr);
    assert.equal(S.posts(), 0, 'a pagehide beacon and a keepalive POST were sent on context close — past the write block');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('flows.mjs stops when a screen is sent on to a sign-in page its address pattern does not name (/LoginV2.aspx)', async () => {
  const repo = fixtureRepo('dsfa-signedout-');
  try {
    const f = await run('flows.mjs', repo, '--url', `${S.url}members`, '--settle', '100');
    assert.equal(f.status, 3, f.stdout + f.stderr);
    assert.match(f.stderr, /session expired: .*\/LoginV2\.aspx/);
    assert.ok(!existsSync(join(repo, 'flows', 'flows.json')), 'no map of the sign-in page was written');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('--keep-open: the designer signs in in a window that stays open; nothing is written to disk but the window\'s profile', async () => {
  const r = await run('capture.mjs', '--login-url', `${S.url}spa/`, '--until-url', 'spa', '--keep-open', W);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /stays open/);
  assert.match(r.stdout, new RegExp(`--attach ${W}`));
  const b = await connect();
  assert.ok(b, 'the window is still open after sign-in mode exited');
  // the designer signs in: this fixture keeps its sign-in in the tab's sessionStorage, which no new browser would have
  const tab = b.contexts()[0].pages().find((p) => p.url().includes('/spa'));
  assert.ok(tab, 'the sign-in tab is there');
  await tab.evaluate(() => { sessionStorage.setItem('signedIn', '1'); });
  await tab.reload();
  assert.equal(await tab.locator('h1').innerText(), 'Orders', 'signed in, in that tab');
  await b.close();
});

test('--attach: a capture works in the signed-in tab, at 2x, read-only, and leaves the window open and signed in', async () => {
  S.resetPosts();
  const out = join(dir, 'baseline');
  const r = await run('capture.mjs', '--attach', W, '--url', `${S.url}spa/`, '--click', '#sync', '--screen', 'orders', '--out', out, '--settle', '300');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(S.posts(), 0, 'the click reached the page, the write did not reach the server');
  const cap = JSON.parse(readFileSync(join(out, 'orders--1440x900--light.json'), 'utf8'));
  assert.equal(cap.meta.window, W);
  assert.equal(cap.meta.looksLikeSignIn, undefined, 'the capture is of the signed-in screen, not of the sign-in page');
  assert.ok(cap.elements.some((e) => e.text === 'Orders'), 'the Orders heading is captured');
  const png = readFileSync(join(out, 'orders--1440x900--light.png'));
  assert.equal(png.readUInt32BE(16), 2880, 'the whole-page screenshot is 1440 px wide at scale 2, as a fresh browser takes it');
  const b = await connect();
  assert.ok(b, 'the window is still open');
  const tab = b.contexts()[0].pages()[0];
  assert.equal(await tab.evaluate(() => sessionStorage.getItem('signedIn')), '1', 'still signed in');
  // the write block was that run's only: a write from the designer's own tab now reaches the server
  S.resetPosts();
  await tab.evaluate(() => fetch('/spa/api/sync', { method: 'POST' }));
  assert.equal(S.posts(), 1, 'the write block ended with the run');
  await b.close();
});

test('--attach: a second run while one is working is refused, not interleaved; a lock left by a finished run is taken over', async () => {
  const lock = join(windows, W, 'run.lock');
  writeFileSync(lock, String(process.pid)); // a run that is alive: this test process
  const busy = await run('capture.mjs', '--attach', W, '--url', `${S.url}spa/`, '--screen', 'x', '--out', join(dir, 'busy'), '--settle', '100');
  assert.equal(busy.status, 2, busy.stderr);
  assert.match(busy.stderr, /another run .* is working in the window/);
  writeFileSync(lock, '999999'); // a run that ended without releasing it
  const ok = await run('capture.mjs', '--attach', W, '--url', `${S.url}spa/`, '--screen', 'x', '--out', join(dir, 'busy'), '--settle', '100');
  assert.equal(ok.status, 0, ok.stderr);
  assert.ok(!existsSync(lock), 'the run released its lock');
});

test('flows.mjs --attach maps the screens in the window and says so in flows.json', async () => {
  const c = await run('capture.mjs', '--attach', W, '--url', `${S.url}spa/`, '--screen', 'orders-plain', '--out', join(dir, 'baseline'), '--settle', '200');
  assert.equal(c.status, 0, c.stderr);
  S.resetPosts();
  const r = await run('flows.mjs', dir, '--attach', W, '--settle', '200');
  assert.equal(r.status, 0, r.stderr);
  const flows = JSON.parse(readFileSync(join(dir, 'flows', 'flows.json'), 'utf8'));
  assert.equal(flows.window?.attached, W);
  assert.ok(flows.screens.length >= 1, 'a screen was mapped');
  assert.equal(S.posts(), 0, 'nothing written');
  const b = await connect();
  assert.ok(b, 'the window is still open after flows.mjs');
  await b.close();
});

test('--attach is refused with --storage, and says what to do when the window is not open', async () => {
  const both = await run('capture.mjs', '--attach', W, '--storage', join(dir, 's.json'), '--url', `${S.url}spa/`);
  assert.equal(both.status, 2);
  assert.match(both.stderr, /no --storage/);
  const none = await run('capture.mjs', '--attach', 'no-such-window', '--url', `${S.url}spa/`, '--out', join(dir, 'none'));
  assert.equal(none.status, 2);
  assert.match(none.stderr, /no open window "no-such-window".*--keep-open no-such-window/);
});

// A product whose sign-in lives only in the page's memory: every page load of its tab signs out (the first designer's
// product, 2026-10-22). --here and --no-reload never load a page.
const M = 'memory-window';
const connectM = async () => (await import('../scripts/lib/window.mjs')).connectWindow(M);
// the app's own tab, never the help tab a press opened on the same origin (their order in pages() is not fixed)
const tabM = async (b) => b.contexts()[0].pages().find((p) => { try { return new URL(p.url()).pathname === '/memory-app/'; } catch { return false; } });
const signedInM = async () => { const b = await connectM(); const t = await tabM(b); const ok = (await t.locator('input[type="password"]').count()) === 0 && (await t.locator('h1').innerText()) !== 'Welcome back'; await b.close(); return ok; };

test('--here: captures a product that signs out on every page load, from the tab as it is, by its clicks', async () => {
  const r = await run('capture.mjs', '--login-url', `${S.url}memory-app/`, '--until-url', 'memory-app', '--keep-open', M);
  assert.equal(r.status, 0, r.stderr);
  const b = await connectM();
  const t = await tabM(b);
  await t.locator('#enter').click(); // the designer signs in
  assert.equal(await t.locator('h1').innerText(), 'Orders');
  await b.close();
  const repo = join(dir, 'memory');
  for (const [key, screen] of [['settings', 'settings'], ['orders', 'orders']]) {
    const c = await run('capture.mjs', '--attach', M, '--here', '--click', `[data-key=${key}]`, '--as-screen', '--screen', screen, '--out', join(repo, 'baseline'), '--settle', '200');
    assert.equal(c.status, 0, c.stderr);
    const cap = JSON.parse(readFileSync(join(repo, 'baseline', `${screen}--1440x900--light.json`), 'utf8'));
    assert.equal(cap.meta.noReload, true);
    assert.equal(cap.meta.looksLikeSignIn, undefined, `${screen} is the signed-in screen`);
    assert.ok(cap.elements.some((e) => e.text === screen[0].toUpperCase() + screen.slice(1)), `the ${screen} heading is captured`);
  }
  assert.ok(await signedInM(), 'the window is still signed in after two captures');
});

test('--here: a click that would load another page is held and refused; the window stays signed in', async () => {
  const before = S.memoryPrints();
  const c = await run('capture.mjs', '--attach', M, '--here', '--click', '#print', '--screen', 'print', '--out', join(dir, 'memory', 'held'), '--settle', '200');
  assert.equal(c.status, 2, c.stderr);
  assert.match(c.stderr, /would load another page \(\/memory-app\/print\) — held/);
  assert.equal(S.memoryPrints(), before, 'the page load never reached the server');
  assert.ok(await signedInM(), 'still signed in');
});

test('flows.mjs --no-reload maps the screens by --home and their clicks, holds the page load, and keeps the sign-in', async () => {
  const repo = join(dir, 'memory');
  const before = S.memoryPrints();
  const f = await run('flows.mjs', repo, '--attach', M, '--no-reload', '--home', '[data-key=orders]', '--dismiss', 'img.wclose', '--settle', '150');
  assert.equal(f.status, 0, f.stdout + f.stderr);
  const flows = JSON.parse(readFileSync(join(repo, 'flows', 'flows.json'), 'utf8'));
  assert.equal(flows.window?.noReload, true);
  const names = flows.screens.map((x) => x.name).sort();
  assert.deepEqual(names, ['orders', 'settings'], 'both screens mapped');
  const all = flows.screens.flatMap((x) => x.transitions);
  const print = all.find((t) => t.control.name === 'Print view');
  assert.ok(print?.effect.held && print.effect.to === '/memory-app/print', `the link is a held navigation: ${JSON.stringify(print?.effect)}`);
  const refresh = flows.screens.find((x) => x.name === 'orders').transitions.find((t) => t.control.name === 'Refresh');
  assert.equal(refresh?.effect.kind, 'change', 'a press that changes the page in place is seen without a reload');
  assert.ok(all.some((t) => t.effect.toScreen === 'settings'), 'the menu reaches the other screen');
  assert.equal(S.memoryPrints(), before, 'no page load reached the server');
  assert.ok(await signedInM(), 'still signed in after the whole map');
  const help = all.find((t) => t.control.name === 'Help');
  assert.match(help?.effect.newTab ?? '', /\/memory-app\/help$/, `a press that opens a tab is recorded with it: ${JSON.stringify(help?.effect)}`);
  assert.equal(S.posts(), 0, 'the tab the product opened wrote nothing: the write block covers the whole window');
});

test('the tab the designer signed in in is the one remembered, not the first tab on the origin', async () => {
  const { signedInTab, windowDir } = await import('../scripts/lib/window.mjs');
  const file = join(windowDir(M), 'tab');
  assert.ok(existsSync(file), 'sign-in mode remembered its tab');
  const b = await connectM();
  const pages = b.contexts()[0].pages();
  const signIn = await signedInTab(b, `${S.url}memory-app/`, M);
  assert.match(signIn.url(), /\/memory-app\/$/);
  const helpTab = pages.find((p) => p.url().endsWith('/memory-app/help'));
  assert.ok(helpTab, 'the help tab the map opened is still open, on the same origin');
  const keep = readFileSync(file, 'utf8');
  const s2 = await helpTab.context().newCDPSession(helpTab);
  writeFileSync(file, (await s2.send('Target.getTargetInfo')).targetInfo.targetId);
  assert.equal(await signedInTab(b, `${S.url}memory-app/`, M), helpTab, 'the remembered tab wins over the origin rule');
  writeFileSync(file, keep);
  await b.close();
});

test('flows.mjs --no-reload stops when a press changes the page for good, names it, and --deny-selector skips it', async () => {
  const fresh = async () => { const b = await connectM(); const t = await tabM(b); await t.reload(); await t.locator('#enter').click(); await b.close(); }; // the designer signs in again
  await fresh();
  const repo = join(dir, 'memory');
  // orders is mapped before settings, and its last press is the "+": settings, next, can no longer be reached
  const f = await run('flows.mjs', repo, '--attach', M, '--no-reload', '--home', '#m-orders', '--dismiss', 'img.wclose', '--only', 'orders', '--only', 'settings', '--settle', '150');
  assert.equal(f.status, 4, f.stdout + f.stderr);
  const m = f.stderr.match(/stopped: after pressing .*\(div#plus\).*--deny-selector '([^']+)'/);
  assert.ok(m, `the press that broke the way back is named, with the flag that skips it:\n${f.stderr}`);
  await fresh();
  const g = await run('flows.mjs', repo, '--attach', M, '--no-reload', '--home', '#m-orders', '--dismiss', 'img.wclose', '--deny-selector', m[1], '--settle', '150');
  assert.equal(g.status, 0, g.stdout + g.stderr);
  const flows = JSON.parse(readFileSync(join(repo, 'flows', 'flows.json'), 'utf8'));
  assert.ok(flows.screens.flatMap((x) => x.refused || []).some((r) => r.selector === 'div#plus' && /--deny-selector/.test(r.why)), 'the "+" is refused by its selector');
});

test('an in-app window Escape does not close: without --dismiss the map stops and names the layer; --here --dismiss closes it', async () => {
  const fresh = async () => { const b = await connectM(); const t = await tabM(b); await t.reload(); await t.locator('#enter').click(); await b.close(); };
  await fresh();
  const repo = join(dir, 'memory');
  const f = await run('flows.mjs', repo, '--attach', M, '--no-reload', '--home', '[data-key=orders]', '--only', 'orders', '--only', 'settings', '--deny-selector', 'div#plus', '--settle', '150');
  assert.equal(f.status, 4, f.stdout + f.stderr);
  assert.match(f.stderr, /stopped: after pressing "Rates".*ratesWin.*intercepts pointer events/, f.stderr);
  // the window is still open over the page: a capture with --dismiss closes it first, then reaches its screen
  const c = await run('capture.mjs', '--attach', M, '--here', '--dismiss', 'img.wclose', '--click', '[data-key=settings]', '--as-screen', '--screen', 'settings-again', '--out', join(dir, 'memory', 'again'), '--settle', '150');
  assert.equal(c.status, 0, c.stderr);
  const cap = JSON.parse(readFileSync(join(dir, 'memory', 'again', 'settings-again--1440x900--light.json'), 'utf8'));
  assert.equal(cap.meta.dismissed?.before, 1, 'the window was closed by its own close control before the clicks');
  assert.ok(!cap.meta.dismissed?.beforeShot, 'nothing is closed before the screenshot without --dismiss-late');
  assert.ok(await signedInM());
});

test('--here and --no-reload stop when the window is signed out', async () => {
  const b = await connectM();
  await (await tabM(b)).reload(); // what any page load does to this product
  await b.close();
  const c = await run('capture.mjs', '--attach', M, '--here', '--click', '[data-key=orders]', '--screen', 'x', '--out', join(dir, 'memory', 'out'), '--settle', '100');
  assert.equal(c.status, 3, c.stderr);
  assert.match(c.stderr, /is signed out/);
  const f = await run('flows.mjs', join(dir, 'memory'), '--attach', M, '--no-reload', '--home', '#pw', '--settle', '100');
  assert.equal(f.status, 3, f.stdout + f.stderr);
  assert.match(f.stderr, /signed out: .* shows a password field/);
  await run('capture.mjs', '--close', M);
});

test('--close closes the window and deletes its profile folder', async () => {
  const r = await run('capture.mjs', '--close', W);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /is closed/);
  assert.ok(!existsSync(join(windows, W)), 'the profile folder (it held the sign-in) is gone');
  assert.equal(await connect(), null);
});
