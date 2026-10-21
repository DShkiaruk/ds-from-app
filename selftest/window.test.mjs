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
  await run('capture.mjs', '--close', W);
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

test('--close closes the window and deletes its profile folder', async () => {
  const r = await run('capture.mjs', '--close', W);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /is closed/);
  assert.ok(!existsSync(join(windows, W)), 'the profile folder (it held the sign-in) is gone');
  assert.equal(await connect(), null);
});
