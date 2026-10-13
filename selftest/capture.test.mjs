import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, statSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { execFile } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { run, fixtureRepo, ROOT } from './helpers.mjs';

let S, dir;
before(async () => { S = await startServer(); dir = fixtureRepo('dsfa-capture-'); });
after(() => { S.close(); rmSync(dir, { recursive: true, force: true }); });

test('captures the fixture in both schemes, read-only, as capture.mjs', async () => {
  for (const scheme of ['light', 'dark']) {
    const r = await run('capture.mjs', '--url', S.url, '--screen', 'fixture', '--scheme', scheme, '--out', join(dir, 'baseline'), '--no-interact', '--settle', '300');
    assert.equal(r.status, 0, r.stderr);
    const cap = JSON.parse(readFileSync(join(dir, 'baseline', `fixture--1440x900--${scheme}.json`), 'utf8'));
    assert.equal(cap.meta.tool, 'capture.mjs');
    assert.equal(cap.meta.looksLikeSignIn, undefined, 'the fixture is not a sign-in page');
  }
});

test('hidden state (spec 4.1): a background only a script-toggled class produces is not read, and the capture says it cannot see it', () => {
  const raw = readFileSync(join(dir, 'baseline', 'fixture--1440x900--light.json'), 'utf8');
  const cap = JSON.parse(raw);
  assert.ok(cap.elements.some((e) => e.text === 'Accordion' || /Accordion/.test(JSON.stringify(e))), 'the accordion element itself is captured');
  assert.ok(!/250,\s*240,\s*200/.test(raw), 'the .card.is-open background (rgb(250, 240, 200)) appears nowhere: no pseudo-class reaches it, and the instrument does not invent it');
  assert.match((cap.meta.stateMechanisms || []).join('\n'), /CSS\.forcePseudoState \(CDP\) — deterministic, fires no events, so JS\/attribute-driven state stays invisible/);
});

test('line styles: a dashed focus ring and a dotted border are recorded, not just their colour and width', () => {
  const cap = JSON.parse(readFileSync(join(dir, 'baseline', 'fixture--1440x900--light.json'), 'utf8'));
  const st = cap.states.find((x) => x.byForcedPseudo['focus-visible']?.properties?.outlineStyle?.to === 'dashed');
  assert.ok(st, 'the focus-visible state sample records outlineStyle dashed');
  const el = cap.elements.find((e) => e.text === 'Dotted box');
  assert.ok(el, 'the dotted element is captured');
  assert.equal(el.values.borderTopStyle, 'dotted', 'the element records borderTopStyle dotted');
  assert.equal(el.values.borderLeftStyle, 'dotted');
});

test('drawings: a non-icon svg is recorded with its dash pattern; an icon-sized svg is not', () => {
  const cap = JSON.parse(readFileSync(join(dir, 'baseline', 'fixture--1440x900--light.json'), 'utf8'));
  const d = cap.drawings.find((x) => x.box.width === 160 && x.box.height === 58);
  assert.ok(d, 'the 160x58 frame is in drawings');
  assert.ok(d.shapes.some((sh) => sh['stroke-dasharray'] && sh['stroke-dasharray'] !== 'none'), 'its dashed rect keeps a stroke-dasharray');
  assert.ok(d.shapes.some((sh) => sh.stroke === 'rgb(228, 228, 231)'), 'the stroke colour is the computed one');
  assert.ok(!/on[a-z]+=|<script|foreignObject/i.test(d.markup), 'the markup is sanitized');
  assert.ok(!cap.drawings.some((x) => x.box.width <= 48 && x.box.height <= 48), 'no icon-sized svg is a drawing');
});

test('the fonts the page loads: a cross-origin stylesheet is recorded by href, a declared face by absolute src', () => {
  const cap = JSON.parse(readFileSync(join(dir, 'baseline', 'fixture--1440x900--light.json'), 'utf8'));
  const href = (cap.fonts.crossOriginStylesheets ?? []).find((h) => /\/fonts\/fixture\.css$/.test(h));
  assert.ok(href && new URL(href).hostname === 'localhost', `the cross-origin font stylesheet (got ${JSON.stringify(cap.fonts.crossOriginStylesheets)})`);
  const face = cap.fonts.declared.find((f) => /Fixture Sans/.test(f.family));
  assert.ok(face, 'the same-origin @font-face is declared');
  assert.match(face.src, /url\("?https?:\/\/127\.0\.0\.1:\d+\/fixture\.woff2"?\)/, 'its src url is absolute');
  assert.ok('style' in face && 'unicodeRange' in face, 'a face carries style and unicode-range');
});

test('a screen that redirects is refused, not written under the wrong name', async () => {
  const r = await run('capture.mjs', '--url', `${S.url}go-elsewhere`, '--screen', 'elsewhere', '--out', join(dir, 'runs-redirect'), '--no-interact', '--settle', '200');
  assert.equal(r.status, 4);
  assert.ok(!existsSync(join(dir, 'runs-redirect', 'elsewhere--1440x900--light.json')));
});

test('a single-URL product: the session restore, a screen behind a click, and the refusals', async () => {
  const sp = join(dir, 'spa');
  mkdirSync(join(sp, 'baseline'), { recursive: true });
  const origin = new URL(S.url).origin;
  const signedIn = join(sp, 'session.auth.json'), cookieOnly = join(sp, 'no-session.auth.json');
  writeFileSync(signedIn, JSON.stringify({ cookies: [], origins: [{ origin, localStorage: [], sessionStorage: [{ name: 'signedIn', value: '1' }] }] }));
  writeFileSync(cookieOnly, JSON.stringify({ cookies: [], origins: [{ origin, localStorage: [] }] }));
  const h1Of = (d, f) => (JSON.parse(readFileSync(join(d, f), 'utf8')).elements || []).find((e) => e.tag === 'h1')?.text;

  // the counterexample first: the same session without its sessionStorage lands on the sign-in page — and says so
  const outNo = join(sp, 'no-session');
  const no = await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', cookieOnly, '--screen', 'orders', '--as-screen', '--out', outNo, '--no-interact', '--settle', '300');
  assert.equal(h1Of(outNo, 'orders--1440x900--light.json'), 'Sign in', 'without its sessionStorage the session lands on the sign-in page');
  assert.match(no.stderr, /looks like a sign-in page/);
  assert.equal(JSON.parse(readFileSync(join(outNo, 'orders--1440x900--light.json'), 'utf8')).meta.looksLikeSignIn, true);

  const yes = await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--screen', 'orders', '--as-screen', '--out', join(sp, 'baseline'), '--no-interact', '--settle', '300');
  assert.equal(h1Of(join(sp, 'baseline'), 'orders--1440x900--light.json'), 'Orders', 'the session file restores sessionStorage');
  assert.doesNotMatch(yes.stderr, /looks like a sign-in page/);

  const ws = await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--click', '[data-key="settings"]', '--as-screen', '--screen', 'settings', '--out', join(sp, 'baseline'), '--no-interact', '--settle', '300');
  assert.equal(ws.status, 0, ws.stderr);
  assert.equal(h1Of(join(sp, 'baseline'), 'settings--1440x900--light.json'), 'Settings', 'a screen behind a menu click at the same URL is captured --as-screen');

  const wr = await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--click', '[data-key="settings"]', '--click', '#show', '--allow-unsafe-click', '--screen', 'settings--shown', '--out', join(sp, 'runs'), '--no-interact', '--settle', '300');
  assert.notEqual(wr.status, 0);
  assert.match(wr.stderr, /unmasks/, 'a click that unmasks a secret is refused, even with --allow-unsafe-click');

  S.resetPosts();
  const wReads = await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--click', '#sync', '--block-writes', '--reads', '^/spa/api/sync$', '--screen', 'orders--synced', '--out', join(sp, 'runs'), '--no-interact', '--settle', '300');
  assert.equal(wReads.status, 0, wReads.stderr);
  assert.equal(S.posts(), 1, '--reads lets a named read through a write block');
});

test('sign-in mode saves the session into a folder that does not exist yet', async () => {
  const target = join(dir, 'new', 'sessions', 'x.auth.json');
  assert.ok(!existsSync(join(dir, 'new')), 'precondition: the folder is absent');
  const r = await run('capture.mjs', '--login-url', `${S.url}spa/`, '--until-url', 'spa', '--save-storage', target, '--headless');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(target), 'the session file is written');
  assert.ok(Array.isArray(JSON.parse(readFileSync(target, 'utf8')).origins), 'the file parses with an origins array');
  assert.equal(statSync(target).mode & 0o777, 0o600, 'the session file is readable by its owner only');
});

test('by default capture.mjs blocks writes and uses no real input', async () => {
  const sp = join(dir, 'default-ro');
  mkdirSync(sp, { recursive: true });
  const origin = new URL(S.url).origin;
  const signedIn = join(sp, 'session.auth.json');
  writeFileSync(signedIn, JSON.stringify({ cookies: [], origins: [{ origin, localStorage: [], sessionStorage: [{ name: 'signedIn', value: '1' }] }] }));
  S.resetPosts();
  const r = await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--click', '#sync', '--screen', 'orders--default', '--out', sp, '--settle', '300');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(S.posts(), 0, 'the click reached the page, the write did not reach the server');
  assert.match(r.stdout, /writes blocked: 1 — POST \/spa\/api\/sync ×1 \(if these were reads, the page may show empty data: pass --reads '<regex of their paths>' after checking with the designer\)/);
  const meta = JSON.parse(readFileSync(join(sp, 'orders--default--1440x900--light.json'), 'utf8')).meta;
  const mech = (meta.stateMechanisms || []).join('\n');
  assert.match(mech, /real input disabled \(the default; --interact enables it\)/);
  assert.doesNotMatch(mech, /real input —/);
});

test('a Ukrainian sign-in heading is caught without a password field', async () => {
  const out = join(dir, 'uk');
  const r = await run('capture.mjs', '--url', `${S.url}uk-sign-in`, '--screen', 'uk', '--out', out, '--settle', '300');
  assert.match(r.stderr, /looks like a sign-in page/);
  assert.equal(JSON.parse(readFileSync(join(out, 'uk--1440x900--light.json'), 'utf8')).meta.looksLikeSignIn, true);
});

test('sign-in mode refuses to run without --save-storage', async () => {
  const r = await run('capture.mjs', '--login-url', `${S.url}spa/`, '--until-url', 'spa', '--headless');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /needs --save-storage/);
});

test('sign-in mode without --until-url and without a terminal is refused, not left waiting', async () => {
  const target = join(dir, 'noterm', 's.auth.json');
  const r = await run('capture.mjs', '--login-url', `${S.url}spa/`, '--save-storage', target, '--headless');
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /needs --until-url/);
  assert.ok(!existsSync(target));
});

test('sign-in mode narrows an existing session file to 0600', async () => {
  const target = join(dir, 'perm', 's.auth.json');
  mkdirSync(join(dir, 'perm'), { recursive: true });
  writeFileSync(target, '{}', { mode: 0o644 });
  chmodSync(target, 0o644);
  assert.equal(statSync(target).mode & 0o777, 0o644, 'precondition');
  const r = await run('capture.mjs', '--login-url', `${S.url}spa/`, '--until-url', 'spa', '--save-storage', target, '--headless');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(statSync(target).mode & 0o777, 0o600);
});

test('sign-in mode leaves no runs/ folder in the working directory (H6)', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'dsfa-cwd-'));
  const inCwd = (...args) => new Promise((ok) => execFile('node', [join(ROOT, 'scripts', 'capture.mjs'), ...args], { cwd, timeout: 240000, killSignal: 'SIGKILL' }, (err, stdout, stderr) => ok({ status: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr })));
  try {
    const refused = await inCwd('--login-url', `${S.url}spa/`, '--headless');
    assert.equal(refused.status, 2, refused.stderr);
    const ok = await inCwd('--login-url', `${S.url}spa/`, '--until-url', 'spa', '--save-storage', join(cwd, 'x', 's.auth.json'), '--headless');
    assert.equal(ok.status, 0, ok.stderr);
    assert.ok(!existsSync(join(cwd, 'runs')), 'neither sign-in run created runs/');
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('--viewport sets the size, the metadata and the file name', async () => {
  const out = join(dir, 'vp');
  const r = await run('capture.mjs', '--url', S.url, '--screen', 'fixture', '--viewport', '390x844', '--out', out, '--settle', '300');
  assert.equal(r.status, 0, r.stderr);
  const f = readdirSync(out).find((n) => n.endsWith('.json'));
  assert.match(f, /--390x844--/);
  assert.equal(JSON.parse(readFileSync(join(out, f), 'utf8')).meta.viewport.width, 390);
});
