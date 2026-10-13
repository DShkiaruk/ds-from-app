import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../scripts/lib/browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });

function repoWithCheckpoint(extraTokens = []) {
  const repo = mkdtempSync(join(tmpdir(), 'dsfa-page-'));
  const spec = join(repo, 'extraction');
  mkdirSync(join(spec, 'baseline'), { recursive: true });
  writeFileSync(join(spec, 'capture-manifest.json'), JSON.stringify({ product: 'Політики' }));
  writeFileSync(join(spec, 'baseline', 'огляд--1440x900--light.png'), PNG);
  writeFileSync(join(spec, 'checkpoint.json'), JSON.stringify({
    project: 'Політики', source: 'https://app.test/',
    screens: [
      { id: 'огляд', name: 'огляд', url: 'https://app.test/', screenshot: 'baseline/огляд--1440x900--light.png', transitions: 3 },
      { id: 'вхід', name: 'вхід', url: 'https://app.test/login', screenshot: null, looksLikeSignIn: true, transitions: null },
    ],
    tokens: [
      { id: 'text-2', name: 'text-2', value: '#5E5E5E', group: 'color', label: 'measured', nameStatus: 'product', evidence: 'declared on ":root"', uses: { kind: 'rules', n: 9 } },
      { id: 'surface-1', name: 'surface-1', value: '#FFFFFF', group: 'color', label: 'derived', nameStatus: 'proposed', evidence: 'painted on 40 elements', uses: { kind: 'elements', n: 40 } },
      { id: 'spacing-4', name: 'spacing-4', value: '16px', group: 'spacing', label: 'decided', nameStatus: 'decided', evidence: 'decided 2026-10-12' },
      ...extraTokens,
    ],
    components: [
      { id: 'Card', name: 'Card', nameStatus: 'product', label: 'measured', instances: 2, screens: 1, states: ['hover'], part: false, include: true },
      { id: 'Button', name: 'Button', nameStatus: 'proposed', label: 'derived', instances: 3, screens: 1, states: [], part: false, include: true },
    ],
    excluded: [{ id: 'role-switch', what: 'Перемикач Admin / User', why: 'лише для показу прототипу' }],
    questions: [{ id: 'role', text: 'Чиї це екрани?', options: ['Admin', 'User'] }],
  }));
  return { repo, spec };
}

const started = [];
// every `finally` calls this: a failing assertion never leaves a server behind
const killAll = () => { for (const c of started.splice(0)) if (c.exitCode === null && c.signalCode === null) c.kill(); };

function startServe(repo, port, extra = []) {
  const child = spawn('node', [join(ROOT, 'scripts', 'checkpoint.mjs'), 'serve', repo, '--port', String(port), ...extra]);
  started.push(child);
  let out = '', err = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  const ready = new Promise((ok, fail) => {
    const t = setInterval(() => { if (/waiting/.test(out)) { clearInterval(t); ok(); } }, 50);
    child.on('exit', (code) => { clearInterval(t); fail(new Error(`serve exited ${code}: ${err}`)); });
  });
  ready.catch(() => {}); // a test that expects the exit never awaits `ready`; awaiting it still throws
  const exited = new Promise((ok) => child.on('exit', (code) => ok({ code, out, err })));
  return { child, ready, exited };
}

const clickAt = async (page, locator, opts = {}) => {
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  let x, y, hit = false;
  // (A known cause of a lost scroll was the full-flow test's PageDown animation, now awaited with settled(); this stays as a safety net.)
  // Scroll, wait until the scrolled frame is drawn and the box stops moving (what Playwright's own click waits for),
  // and click only when the point really lies on this element (or its child). A scroll that did not take
  // (seen right after setViewportSize / emulateMedia) is retried instead of clicking at the old position.
  for (let attempt = 0; attempt < 10 && !hit; attempt++) {
    await locator.evaluate((e) => e.scrollIntoView({ block: 'center' }));
    let b = null;
    for (let i = 0; i < 20; i++) {
      await frame();
      const nb = await locator.boundingBox();
      if (nb && b && nb.x === b.x && nb.y === b.y && nb.width === b.width && nb.height === b.height) break;
      b = nb;
    }
    assert.ok(b, 'element is on the page');
    x = b.x + b.width / 2; y = b.y + b.height / 2;
    hit = await locator.evaluate((e, [px, py]) => { const t = document.elementFromPoint(px, py); return t === e || e.contains(t); }, [x, y]);
  }
  assert.ok(hit, 'the click point lands on the element, not on something covering it');
  await page.mouse.click(x, y, opts);
};

// Resolves when scrollY has been unchanged for 5 consecutive animation frames (a smooth scroll has finished).
const settled = (page) => page.evaluate(() => new Promise((ok) => { let last = -1, same = 0; const tick = () => { const y = window.scrollY; same = y === last ? same + 1 : 0; last = y; if (same >= 5) ok(y); else requestAnimationFrame(tick); }; requestAnimationFrame(tick); }));

// Wait until the field is the focused element and its whole text is selected: typing before that replaces nothing (flaky under load).
const selected = async (page, locator) => {
  const h = await locator.elementHandle();
  await page.waitForFunction((el) => el === document.activeElement && el.selectionStart === 0 && el.selectionEnd === el.value.length, h);
};
const tripleClick = async (page, locator) => { await clickAt(page, locator, { clickCount: 3 }); await selected(page, locator); };

// Every visible text node's colour against the first opaque background behind it: WCAG AA (4.5, or 3 for large text).
const CONTRAST = () => {
  const rgba = (s) => { const m = s.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
  const lum = ({ r, g, b }) => [r, g, b].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c.a > 0.99) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const bad = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!t.textContent.trim() || !el || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const bg = bgOf(el), fg = over(rgba(cs.color), bg);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) bad.push(`${t.textContent.trim().slice(0, 30)} — ${ratio.toFixed(2)}`);
  }
  return bad;
};

test('the designer decides with real clicks; Done writes decisions.json; re-opening keeps the choices', async () => {
  const { repo, spec } = repoWithCheckpoint();
  const port = await freePort();
  const browser = await launch();
  try {
    const s1 = startServe(repo, port);
    await s1.ready;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/`);
    assert.equal(await page.textContent('#done'), 'Готово', 'the page speaks Ukrainian by default');
    assert.match(await page.textContent('[data-kind="flow"][data-id="вхід"]'), /сторінку входу/, 'a sign-in capture is marked');

    const shot = await page.request.get(`http://localhost:${port}/preview/${encodeURIComponent('baseline/огляд--1440x900--light.png')}`);
    assert.equal(shot.status(), 200, 'a Cyrillic screenshot is served');
    assert.equal((await page.request.get(`http://localhost:${port}/preview/${encodeURIComponent('../capture-manifest.json')}`)).status(), 404);

    assert.equal((await page.request.get(`http://localhost:${port}/preview/%E0%A4%A`)).status(), 404, 'a malformed address is a 404');
    assert.equal((await page.request.get(`http://localhost:${port}/`)).status(), 200, 'the server is still alive');
    const surface = page.locator('[data-kind="tokens"][data-id="surface-1"]');
    assert.doesNotMatch(await surface.innerText(), /painted/, 'English evidence is not on the page');
    assert.match(await surface.locator('.badge').first().getAttribute('title'), /painted on 40 elements/, 'the evidence is in the badge tooltip');
    await page.setViewportSize({ width: 1280, height: 700 });
    await page.keyboard.press('PageDown');
    await page.waitForFunction(() => window.scrollY > 0, null, { timeout: 10000 }); // a loaded machine starts the scroll late
    await settled(page); // PageDown starts a smooth-scroll animation that outlives the scrollY > 0 wait
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await settled(page), 0, 'back at the top, no scroll animation running');
    await page.setViewportSize({ width: 1280, height: 900 });
    const flowBox = page.locator('[data-kind="flow"][data-id="огляд"] input[type=checkbox]');
    await clickAt(page, flowBox); // a ticked card shows its order badge, which the contrast check must see
    assert.equal(await page.locator('[data-kind="flow"][data-id="огляд"] .order').isVisible(), true);
    assert.deepEqual(await page.evaluate(CONTRAST), [], 'every text meets AA contrast (light)');
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.deepEqual(await page.evaluate(CONTRAST), [], 'every text meets AA contrast (dark)');
    await page.emulateMedia({ colorScheme: 'light' });

    await clickAt(page, flowBox); // untick again; the later steps tick it once
    await clickAt(page, flowBox);
    const proposed = page.locator('[data-kind="tokens"][data-id="surface-1"] input[type=text]');
    await tripleClick(page, proposed);
    await page.keyboard.type('surface-page');
    await clickAt(page, page.locator('[data-kind="components"][data-id="Button"] input[type=checkbox]'));
    await clickAt(page, page.locator('[data-kind="excluded"][data-id="role-switch"] input[type=checkbox]'));
    await clickAt(page, page.locator('.q[data-id="role"] input[value="Admin"]'));
    assert.match(await page.textContent('#summary'), /Флоу: 1 екр\./);
    await clickAt(page, page.locator('#done'));
    const done = await s1.exited;
    assert.equal(done.code, 0, done.err);

    const d = JSON.parse(readFileSync(join(spec, 'decisions.json'), 'utf8'));
    assert.deepEqual(d.flow.screens, ['огляд']);
    assert.equal(d.flow.name, 'main-flow');
    assert.equal(d.tokens.find((t) => t.id === 'surface-1').name, 'surface-page');
    assert.equal(d.tokens.find((t) => t.id === 'text-2').name, 'text-2');
    assert.equal(d.components.find((c) => c.id === 'Button').include, false);
    assert.equal(d.components.find((c) => c.id === 'Card').include, true);
    assert.equal(d.excluded.find((x) => x.id === 'role-switch').include, true);
    assert.equal(d.questions.find((q) => q.id === 'role').answer, 'Admin');
    assert.equal(d.lang, 'uk');

    const s2 = startServe(repo, port);
    await s2.ready;
    const page2 = await ctx.newPage();
    await page2.goto(`http://localhost:${port}/`);
    assert.equal(await page2.isChecked('[data-kind="flow"][data-id="огляд"] input[type=checkbox]'), true, 're-opened: the flow choice is kept');
    assert.equal(await page2.inputValue('[data-kind="tokens"][data-id="surface-1"] input[type=text]'), 'surface-page', 're-opened: the renamed token is kept');
    assert.equal(await page2.isChecked('[data-kind="components"][data-id="Button"] input[type=checkbox]'), false, 're-opened: the unticked component stays unticked');
    s2.child.kill();
    await s2.exited;
  } finally {
    killAll();
    await browser.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('"nothing uses it directly" appears only under a declared token no element spends', async () => {
  const { repo } = repoWithCheckpoint([
    { id: 'unused-decl', name: 'unused-decl', value: '#123456', group: 'color', label: 'measured', roleLabel: 'derived', nameStatus: 'product', evidence: 'declared on ":root"', uses: { kind: 'rules', n: 0 } },
    { id: 'lit-painted', name: 'lit-painted', value: '#654321', group: 'color', label: 'derived', roleLabel: 'derived', nameStatus: 'product', evidence: 'painted on 77 elements', uses: { kind: 'elements', n: 77 } },
  ]);
  const port = await freePort();
  const browser = await launch();
  try {
    const s = startServe(repo, port);
    await s.ready;
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/`);
    const text = (id) => page.locator(`[data-kind="tokens"][data-id="${id}"]`).textContent();
    assert.match(await text('unused-decl'), /напряму ніде не використовується/, 'a declared variable nothing spends carries the line');
    assert.doesNotMatch(await text('lit-painted'), /напряму ніде не використовується/, 'a painted value does not');
    s.child.kill();
    await s.exited;
  } finally { killAll(); await browser.close(); rmSync(repo, { recursive: true, force: true }); }
});

test('English on request', async () => {
  const { repo } = repoWithCheckpoint();
  const port = await freePort();
  const browser = await launch();
  try {
    const s = startServe(repo, port, ['--lang', 'en']);
    await s.ready;
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/`);
    assert.equal(await page.textContent('#done'), 'Done');
    s.child.kill();
    await s.exited;
  } finally { killAll(); await browser.close(); rmSync(repo, { recursive: true, force: true }); }
});

test('a port already in use: exit 2 and the next port to try', async () => {
  const { repo } = repoWithCheckpoint();
  const blocker = createServer();
  await new Promise((ok) => blocker.listen(0, '127.0.0.1', ok));
  const port = blocker.address().port;
  try {
    const s = startServe(repo, port);
    const r = await s.exited;
    assert.equal(r.code, 2);
    assert.match(r.err, new RegExp(`port ${port} is in use — run again with --port ${port + 1}`));
  } finally { killAll(); blocker.close(); rmSync(repo, { recursive: true, force: true }); }
});

test('no checkpoint.json: exit 2 and what to run', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'dsfa-page-'));
  mkdirSync(join(repo, 'extraction'));
  writeFileSync(join(repo, 'extraction', 'capture-manifest.json'), JSON.stringify({ product: 'X' }));
  try {
    const r = await startServe(repo, await freePort()).exited;
    assert.equal(r.code, 2);
    assert.match(r.err, /checkpoint\.mjs prepare/);
  } finally { killAll(); rmSync(repo, { recursive: true, force: true }); }
});

test('proposed names are checked: the page blocks Done, the server answers 400', async () => {
  const { repo } = repoWithCheckpoint();
  const port = await freePort();
  const browser = await launch();
  const s = startServe(repo, port);
  try {
    await s.ready;
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://localhost:${port}/`);
    const input = page.locator('[data-kind="tokens"][data-id="surface-1"] input[type=text]');
    const done = page.locator('#done');
    const type = async (v) => { await tripleClick(page, input); await page.keyboard.type(v); };
    assert.equal(await done.isDisabled(), false);

    await type('Surface Page');
    assert.equal(await done.isDisabled(), true, 'a name with a capital and a space blocks Done');
    assert.equal(await input.getAttribute('aria-invalid'), 'true');
    const msg = page.locator('[data-kind="tokens"][data-id="surface-1"] .err');
    assert.match(await msg.innerText(), /Лише малі латинські літери, цифри, дефіс і підкреслення; назва має бути унікальною/);
    assert.deepEqual(await page.evaluate(CONTRAST), [], 'the message meets AA contrast (light)');
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.deepEqual(await page.evaluate(CONTRAST), [], 'the message meets AA contrast (dark)');
    await page.emulateMedia({ colorScheme: 'light' });

    await type('text-2');
    assert.equal(await done.isDisabled(), true, 'a name another token already has blocks Done');
    await type('surface-page');
    assert.equal(await done.isDisabled(), false, 'a valid unique name re-enables Done');
    assert.equal(await input.getAttribute('aria-invalid'), 'false');

    const comp = page.locator('[data-kind="components"][data-id="Button"] input[type=text]');
    await tripleClick(page, comp);
    await page.keyboard.type('my button');
    assert.equal(await done.isDisabled(), true, 'a component name with a space blocks Done');
    assert.match(await page.locator('[data-kind="components"][data-id="Button"] .err').innerText(), /Латиницею, з великої літери/);
    await comp.selectText(); await selected(page, comp);
    await page.keyboard.type('Card');
    assert.equal(await done.isDisabled(), true, 'a duplicate component name blocks Done');
    await comp.selectText(); await selected(page, comp);
    await page.keyboard.type('Action');
    assert.equal(await done.isDisabled(), false);

    const post = (body) => page.request.post(`http://localhost:${port}/save`, { data: body });
    const base = { flow: { name: 'f', screens: [] }, tokens: [], components: [], excluded: [], questions: [] };
    assert.equal((await post({ ...base, tokens: [{ id: 'surface-1', name: {} }] })).status(), 400, 'a name that is not a string');
    assert.equal((await post({ ...base, tokens: [{ id: 'surface-1', name: 'text-2' }] })).status(), 400, 'a duplicate token name');
    assert.equal((await post({ ...base, tokens: [{ id: 'surface-1', name: 'Bad Name' }] })).status(), 400, 'an invalid token name');
    assert.equal((await post({ ...base, components: [{ id: 'Button', name: 'Card', include: true }] })).status(), 400, 'a duplicate component name');
    assert.equal((await post({ ...base, tokens: [{ id: 'surface-1', name: 'surface-page' }] })).status(), 200, 'a valid body is saved');
    await s.exited;
  } finally { killAll(); await browser.close(); rmSync(repo, { recursive: true, force: true }); }
});

test('a request whose Host is not this machine is refused', async () => {
  const { repo } = repoWithCheckpoint();
  const port = await freePort();
  const s = startServe(repo, port);
  try {
    await s.ready;
    const get = (host) => new Promise((ok, fail) => {
      const r = httpRequest({ host: '127.0.0.1', port, path: '/', headers: { Host: host } }, (res) => { res.resume(); ok(res.statusCode); });
      r.on('error', fail); r.end();
    });
    assert.equal(await get('evil.test'), 403);
    assert.equal(await get(`evil.test:${port}`), 403);
    assert.equal(await get(`localhost:${port}`), 200);
    assert.equal(await get(`127.0.0.1:${port}`), 200);
  } finally { killAll(); rmSync(repo, { recursive: true, force: true }); }
});

const FRACTIONAL = [
  { id: 'lit-leading-37_71', name: 'lit-leading-37_71', value: '37.71px', group: 'typography', label: 'measured', nameStatus: 'proposed', evidence: 'x' },
  { id: 'text-13.5px', name: 'text-13.5px', value: '13.5px', group: 'typography', label: 'measured', nameStatus: 'proposed', evidence: 'x' },
];

test('a proposed name passes untouched only when it is a valid CSS name: a dot must be renamed before Done (the 2nd cold run\'s text-12.5px)', async () => {
  const { repo, spec } = repoWithCheckpoint(FRACTIONAL);
  const port = await freePort();
  const browser = await launch();
  const s = startServe(repo, port);
  try {
    await s.ready;
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://localhost:${port}/`);
    const done = page.locator('#done');
    assert.equal(await done.isDisabled(), true, 'the proposed text-13.5px is not a CSS name: Done waits');
    assert.equal(await page.locator('[data-kind="tokens"][data-id="text-13.5px"] .err:not([hidden])').count(), 1, 'the row says so');
    assert.equal(await page.locator('[data-kind="tokens"][data-id="lit-leading-37_71"] .err:not([hidden])').count(), 0, 'an underscore is fine');
    const dotted = page.locator('[data-kind="tokens"][data-id="text-13.5px"] input[type=text]');
    await tripleClick(page, dotted);
    await page.keyboard.type('text-13-5px');
    const input = page.locator('[data-kind="tokens"][data-id="lit-leading-37_71"] input[type=text]');
    assert.equal(await done.isDisabled(), false, 'renamed: Done is enabled');
    await tripleClick(page, input);
    await page.keyboard.type('Leading Big');
    assert.equal(await done.isDisabled(), true, 'a changed name must meet the pattern');
    await tripleClick(page, input);
    await page.keyboard.type('lit-leading-37_71');
    assert.equal(await done.isDisabled(), false, 'typing the original back is accepted again');
    await clickAt(page, done);
    const r = await s.exited;
    assert.equal(r.code, 0, r.err);
    const d = JSON.parse(readFileSync(join(spec, 'decisions.json'), 'utf8'));
    assert.equal(d.tokens.find((t) => t.id === 'lit-leading-37_71').name, 'lit-leading-37_71');
    assert.equal(d.tokens.find((t) => t.id === 'text-13.5px').name, 'text-13-5px');
  } finally { killAll(); await browser.close(); rmSync(repo, { recursive: true, force: true }); }
});

test('/save: an untouched valid proposed name is 200, a dotted one 400, a changed one is checked, a null element is 400 and the server stays up', async () => {
  const { repo } = repoWithCheckpoint(FRACTIONAL);
  const port = await freePort();
  const s = startServe(repo, port);
  try {
    await s.ready;
    const url = `http://localhost:${port}`;
    const post = (body) => fetch(`${url}/save`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const base = { flow: { name: 'f', screens: [] }, tokens: [], components: [], excluded: [], questions: [] };
    assert.equal((await post({ ...base, tokens: [null] })).status, 400, 'a null element');
    assert.equal((await fetch(`${url}/`)).status, 200, 'the server is still up');
    assert.equal((await post({ ...base, tokens: [{ id: 'lit-leading-37_71', name: 'Leading Big' }] })).status, 400, 'a changed name must match');
    assert.equal((await post({ ...base, tokens: [{ id: 'text-13.5px', name: 'text-13.5px' }] })).status, 400, 'an untouched proposed name that is not a CSS name');
    assert.equal((await post({ ...base, tokens: [{ id: 'lit-leading-37_71', name: 'lit-leading-37_71' }, { id: 'text-13.5px', name: 'text-13-5px' }] })).status, 200, 'the untouched valid one, and the renamed one');
    await s.exited;
  } finally { killAll(); rmSync(repo, { recursive: true, force: true }); }
});

const withCheckpoint = (spec, edit) => {
  const f = join(spec, 'checkpoint.json');
  const c = JSON.parse(readFileSync(f, 'utf8'));
  edit(c);
  writeFileSync(f, JSON.stringify(c));
};

test('the flow keeps the order the designer ticked', async () => {
  const { repo, spec } = repoWithCheckpoint();
  withCheckpoint(spec, (c) => { c.screens = ['a', 'b', 'c'].map((id) => ({ id, name: id, url: `https://app.test/${id}`, screenshot: null, transitions: null })); });
  const port = await freePort();
  const browser = await launch();
  try {
    const s1 = startServe(repo, port);
    await s1.ready;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/`);
    const box = (id) => page.locator(`[data-kind="flow"][data-id="${id}"] input[type=checkbox]`);
    const order = (p, id) => p.locator(`[data-kind="flow"][data-id="${id}"] .order`).textContent();
    await clickAt(page, box('c'));
    await clickAt(page, box('a'));
    assert.equal(await order(page, 'c'), '1');
    assert.equal(await order(page, 'a'), '2');
    assert.equal(await order(page, 'b'), '', 'an unticked card shows no position');
    await clickAt(page, page.locator('#done'));
    assert.equal((await s1.exited).code, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(spec, 'decisions.json'), 'utf8')).flow.screens, ['c', 'a']);

    const s2 = startServe(repo, port);
    await s2.ready;
    const page2 = await ctx.newPage();
    await page2.goto(`http://localhost:${port}/`);
    assert.equal(await order(page2, 'c'), '1', 're-opened: c is first');
    assert.equal(await order(page2, 'a'), '2', 're-opened: a is second');
    await clickAt(page2, page2.locator('[data-kind="flow"][data-id="b"] input[type=checkbox]'));
    assert.equal(await order(page2, 'b'), '3', 'a newly ticked screen goes last');
    s2.child.kill();
    await s2.exited;
  } finally {
    killAll();
    await browser.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('an excluded part lists the tokens only it uses, and Done keeps them', async () => {
  const { repo, spec } = repoWithCheckpoint();
  withCheckpoint(spec, (c) => { c.excluded[0].tokens = ['proto', 'proto-text']; });
  const port = await freePort();
  const browser = await launch();
  try {
    const s1 = startServe(repo, port);
    await s1.ready;
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/`);
    const row = page.locator('[data-kind="excluded"][data-id="role-switch"]');
    const text = await row.innerText();
    assert.match(text, /proto, proto-text/);
    assert.match(text, /кольори й значення лише цієї частини/);
    await clickAt(page, page.locator('#done'));
    assert.equal((await s1.exited).code, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(spec, 'decisions.json'), 'utf8')).excluded[0].tokens, ['proto', 'proto-text']);
  } finally {
    killAll();
    await browser.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('an excluded part shows its texts, and Done keeps them in decisions.json', async () => {
  const { repo, spec } = repoWithCheckpoint();
  withCheckpoint(spec, (c) => { c.excluded[0].texts = ['Option 1', 'Admin']; });
  const port = await freePort();
  const browser = await launch();
  try {
    const s1 = startServe(repo, port);
    await s1.ready;
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/`);
    const text = await page.locator('[data-kind="excluded"][data-id="role-switch"]').innerText();
    assert.match(text, /тексти: "Option 1", "Admin"/);
    await clickAt(page, page.locator('#done'));
    assert.equal((await s1.exited).code, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(spec, 'decisions.json'), 'utf8')).excluded[0].texts, ['Option 1', 'Admin']);
  } finally {
    killAll();
    await browser.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('unticking a screen renumbers the rest', async () => {
  const { repo, spec } = repoWithCheckpoint();
  withCheckpoint(spec, (c) => { c.screens = ['a', 'b', 'c'].map((id) => ({ id, name: id, url: `https://app.test/${id}`, screenshot: null, transitions: null })); });
  const port = await freePort();
  const browser = await launch();
  try {
    const s1 = startServe(repo, port);
    await s1.ready;
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto(`http://localhost:${port}/`);
    const box = (id) => page.locator(`[data-kind="flow"][data-id="${id}"] input[type=checkbox]`);
    const order = (id) => page.locator(`[data-kind="flow"][data-id="${id}"] .order`).textContent();
    for (const id of ['a', 'b', 'c']) await clickAt(page, box(id));
    await clickAt(page, box('b'));
    assert.equal(await order('a'), '1');
    assert.equal(await order('b'), '');
    assert.equal(await order('c'), '2');
    await clickAt(page, page.locator('#done'));
    assert.equal((await s1.exited).code, 0);
    assert.deepEqual(JSON.parse(readFileSync(join(spec, 'decisions.json'), 'utf8')).flow.screens, ['a', 'c']);
  } finally {
    killAll();
    await browser.close();
    rmSync(repo, { recursive: true, force: true });
  }
});
