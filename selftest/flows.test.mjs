import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { UNSAFE } from '../scripts/lib/safety.mjs';
import { run, fixtureRepo, dropPngs, expectAll } from './helpers.mjs';

let S;
before(async () => { S = await startServer(); });
after(() => S.close());

test('a two-screen product: every transition, and the screen no capture holds', async () => {
  const fl = fixtureRepo('dsfa-flows-');
  try {
    await run('capture.mjs', '--url', `${S.url}flows/`, '--screen', 'accounts', '--out', join(fl, 'baseline'), '--no-interact', '--settle', '300');
    const mf0 = await run('flows.mjs', fl, '--settle', '250');
    assert.ok(JSON.parse(readFileSync(join(fl, 'flows', 'flows.json'), 'utf8')).uncaptured?.includes('/flows/detail/:id'));
    assert.match(mf0.stdout, /reachable but not captured/, 'a screen the product navigates to and no capture holds is named');
    await run('capture.mjs', '--url', `${S.url}flows/detail/1`, '--screen', 'account-detail', '--out', join(fl, 'baseline'), '--no-interact', '--settle', '300');
    const mf = await run('flows.mjs', fl, '--settle', '250');
    assert.equal(mf.status, 0, mf.stderr || mf.stdout);
    const F = JSON.parse(readFileSync(join(fl, 'flows', 'flows.json'), 'utf8'));
    const eff = (name) => F.screens.flatMap((x) => x.transitions).find((t) => t.control.name === name)?.effect;
    expectAll([
      [eff('Filters')?.kind === 'open' && eff('Filters')?.surface === 'dialog', 'a button that opens a dialog is recorded as open (dialog)'],
      [eff('Acme')?.kind === 'navigate' && eff('Acme')?.pattern === '/flows/detail/:id', 'a data row link navigates to the detail pattern'],
      [eff('Help')?.kind === 'none', `a press while the page is still drawing itself is not credited with its change (Help: ${eff('Help')?.kind})`],
      [eff('Activity')?.kind === 'change', 'a tab that swaps the panel is recorded as change'],
    ]);
  } finally { rmSync(fl, { recursive: true, force: true }); }
});

test('a single-URL product: screens by landmark, refusals, and the write block', async () => {
  const sp = fixtureRepo('dsfa-spa-');
  try {
    const origin = new URL(S.url).origin;
    const signedIn = join(sp, 'session.auth.json');
    writeFileSync(signedIn, JSON.stringify({ cookies: [], origins: [{ origin, localStorage: [], sessionStorage: [{ name: 'signedIn', value: '1' }] }] }));
    await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--screen', 'orders', '--as-screen', '--out', join(sp, 'baseline'), '--no-interact', '--settle', '300');
    await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--click', '[data-key="settings"]', '--as-screen', '--screen', 'settings', '--out', join(sp, 'baseline'), '--no-interact', '--settle', '300');
    dropPngs(join(sp, 'baseline'));

    S.resetPosts(); S.resetWs();
    const mNo = await run('flows.mjs', sp, '--storage', signedIn, '--landmark', 'h1', '--settle', '250', '--allow-writes');
    assert.ok(S.posts() > 0, 'a control named like nothing unsafe ("Sync now") writes when pressed — the name lists alone cannot stop it');
    assert.ok(S.wsMessages() > 0, 'with --allow-writes the "Details" press sends its message over the WebSocket: the trap is planted');
    const F0 = JSON.parse(readFileSync(join(sp, 'flows', 'flows.json'), 'utf8'));
    assert.equal(mNo.status, 0, mNo.stderr);
    assert.ok(F0.screens.find((x) => x.name === 'settings')?.refused.some((r) => r.name === 'Order history'), 'without --allow, a menu item named like an action on data is refused');

    S.resetPosts(); S.resetWs();
    const mf2 = await run('flows.mjs', sp, '--storage', signedIn, '--landmark', 'h1', '--allow', 'Order history', '--settle', '250', '--block-writes');
    const raw = readFileSync(join(sp, 'flows', 'flows.json'), 'utf8');
    const F2 = JSON.parse(raw);
    const on = (scr, name) => F2.screens.find((x) => x.name === scr)?.transitions.find((t) => t.control.name === name)?.effect;
    const refusedOn = (scr) => F2.screens.find((x) => x.name === scr)?.refused || [];
    expectAll([
      [S.wsMessages() === 0 && F2.blockedWrites?.some((b) => /^WEBSOCKET \/ws/.test(b)), 'a write sent over a WebSocket reaches the server as nothing, and the refused connection is listed'],
      [S.posts() === 0 && F2.blockedWrites?.includes('POST /spa/api/sync'), '--block-writes: the same press reaches the server as nothing, and the block is listed'],
      [mf2.status === 0 && F2.screens.length === 2, 'both screens of the single-URL product are mapped'],
      [on('orders', 'Settings')?.kind === 'navigate' && on('orders', 'Settings')?.toScreen === 'settings', 'a menu item that swaps the page in place navigates to the other screen (by its landmark)'],
      [on('settings', 'Order history')?.toScreen === 'orders' && F2.screens.find((x) => x.name === 'settings')?.allowed?.some((a) => a.name === 'Order history'), '--allow lets a named menu item through, and says so'],
      [refusedOn('settings').some((r) => r.name === 'Show' && /unmask/.test(r.why)), 'a "Show" button beside a secret is refused, not pressed'],
      [refusedOn('settings').some((r) => !r.name && r.icon === 'delete'), 'an unnamed icon button drawing a trash can is refused by its icon'],
      [refusedOn('settings').some((r) => !r.name && r.icon === 'trash-2'), 'an unnamed icon button drawing a Lucide trash-2 is refused by its icon'],
      [!/sk_live_PLANTED/.test(raw), 'the secret appears nowhere in flows.json'],
    ]);
  } finally { rmSync(sp, { recursive: true, force: true }); }
});

test('by default flows.mjs blocks writes', async () => {
  const sp = fixtureRepo('dsfa-spa-def-');
  try {
    const origin = new URL(S.url).origin;
    const signedIn = join(sp, 'session.auth.json');
    writeFileSync(signedIn, JSON.stringify({ cookies: [], origins: [{ origin, localStorage: [], sessionStorage: [{ name: 'signedIn', value: '1' }] }] }));
    await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--screen', 'orders', '--as-screen', '--out', join(sp, 'baseline'), '--settle', '300');
    await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--click', '[data-key="settings"]', '--as-screen', '--screen', 'settings', '--out', join(sp, 'baseline'), '--settle', '300');
    dropPngs(join(sp, 'baseline'));
    S.resetPosts(); S.resetWs();
    const mDef = await run('flows.mjs', sp, '--storage', signedIn, '--landmark', 'h1', '--allow', 'Order history', '--settle', '250');
    assert.match(mDef.stdout, /writes blocked: \d+ — (.*POST \/spa\/api\/sync ×\d+.*WEBSOCKET ws:\/\/127\.0\.0\.1:\d+\/ws ×\d+|.*WEBSOCKET ws:\/\/127\.0\.0\.1:\d+\/ws ×\d+.*POST \/spa\/api\/sync ×\d+) \(if these were reads, the page may show empty data: pass --reads '<regex of their paths>' after checking with the designer\); a WebSocket is refused whatever --reads says/);
    const F = JSON.parse(readFileSync(join(sp, 'flows', 'flows.json'), 'utf8'));
    assert.equal(S.posts(), 0, 'no write reaches the server without any flag');
    assert.equal(S.wsMessages(), 0, 'no WebSocket message reaches the server without any flag');
    assert.ok(F.blockedWrites?.includes('POST /spa/api/sync'));
  } finally { rmSync(sp, { recursive: true, force: true }); }
});

test('clickable elements that are not controls are reported, never pressed', async () => {
  const rp = fixtureRepo('dsfa-rows-');
  try {
    await run('capture.mjs', '--url', `${S.url}rows/`, '--screen', 'rows', '--out', join(rp, 'baseline'), '--no-interact', '--settle', '300');
    const m = await run('flows.mjs', rp, '--settle', '250');
    assert.equal(m.status, 0, m.stderr || m.stdout);
    const F = JSON.parse(readFileSync(join(rp, 'flows', 'flows.json'), 'utf8'));
    const scr = F.screens[0];
    expectAll([
      [scr.unpressed?.some((u) => u.text === 'Row one' && u.selector), 'the pointer-cursor row is listed in unpressed, with a selector'],
      [scr.unpressedCount === 2, `unpressedCount counts both rows (${scr.unpressedCount})`],
      [!scr.transitions.some((t) => t.control.name === 'Row one'), 'no transition is named "Row one": the row was not pressed'],
      [scr.transitions.some((t) => t.control.name === 'Refresh' && t.effect.kind === 'change'), 'the real button on the same page is still pressed'],
    ]);
    assert.match(m.stdout, /clickable elements that are not controls were not pressed/);
    assert.match(m.stdout, /2 clickable, not controls \(not pressed\)/);
  } finally { rmSync(rp, { recursive: true, force: true }); }
});

test('a menu that swaps the page at one address is seen without --landmark (the default landmark is the main heading)', async () => {
  const mp = fixtureRepo('dsfa-menu-');
  try {
    await run('capture.mjs', '--url', `${S.url}menu/`, '--screen', 'overview', '--out', join(mp, 'baseline'), '--no-interact', '--settle', '300');
    const m = await run('flows.mjs', mp, '--settle', '250');
    assert.equal(m.status, 0, m.stderr || m.stdout);
    const F = JSON.parse(readFileSync(join(mp, 'flows', 'flows.json'), 'utf8'));
    const eff = (name) => F.screens[0].transitions.find((t) => t.control.name === name)?.effect;
    expectAll([
      [F.uncapturedLandmarks?.includes('Policies') && F.uncapturedLandmarks?.includes('Members'), `the other menu screens are reported by their headings (${JSON.stringify(F.uncapturedLandmarks)})`],
      [!F.uncapturedLandmarks?.includes('Overview') && !F.uncapturedLandmarks?.includes('Brand'), 'the landing view IS the screen "Overview" (a plain capture whose heading is a landmark), and the brand h1 outside main is not the landmark'],
      [eff('Overview')?.kind !== 'navigate' || eff('Overview')?.toScreen === 'overview', 'pressing the menu item of the screen already open is not another screen'],
    ]);
    assert.match(m.stdout, /pages reached at the same URL that no capture holds \(2\)/);
    // an explicit --landmark still wins
    await run('flows.mjs', mp, '--settle', '250', '--landmark', '.sub');
    const G = JSON.parse(readFileSync(join(mp, 'flows', 'flows.json'), 'utf8'));
    assert.ok(G.uncapturedLandmarks?.includes('Policies content'), `explicit landmark wins (${JSON.stringify(G.uncapturedLandmarks)})`);
    // once a capture holds a screen, it is no longer reported
    await run('capture.mjs', '--url', `${S.url}menu/`, '--click', 'nav button:nth-of-type(2)', '--as-screen', '--screen', 'policies', '--out', join(mp, 'baseline'), '--no-interact', '--settle', '300');
    await run('flows.mjs', mp, '--settle', '250');
    const H = JSON.parse(readFileSync(join(mp, 'flows', 'flows.json'), 'utf8'));
    assert.deepEqual(H.uncapturedLandmarks, ['Members']);
  } finally { rmSync(mp, { recursive: true, force: true }); }
});

test('safety.mjs UNSAFE knows the icon names a library writes for delete and sign-out', () => {
  for (const n of ['trash', 'trash-2', 'log-out', 'logout', 'sign-out']) assert.ok(UNSAFE.test(n), n);
  for (const n of ['search', 'settings', 'menu']) assert.ok(!UNSAFE.test(n), n);
});
