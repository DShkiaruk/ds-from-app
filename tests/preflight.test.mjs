import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, symlinkSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkNode, checkDeps, checkBrowser, checkDisk, checkGit, checkGitIdentity } from '../scripts/preflight.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Node: 22 and later pass, 20 does not, and the fix says where to get it', () => {
  assert.equal(checkNode('20.11.0').ok, false);
  assert.equal(checkNode('22.0.0').ok, true);
  assert.equal(checkNode('26.7.0').ok, true);
  assert.match(checkNode('20.11.0').fix, /nodejs\.org/);
});

test('plugin dependencies: missing → the npm install command for that folder', () => {
  const empty = mkdtempSync(join(tmpdir(), 'dsfa-pre-'));
  try {
    const r = checkDeps(empty);
    assert.equal(r.ok, false);
    assert.ok(r.fix.includes(`npm install --omit=dev --prefix "${empty}"`));
  } finally { rmSync(empty, { recursive: true, force: true }); }
  assert.equal(checkDeps(ROOT).ok, true);
});

test('browser: none → how to get one; Chrome found → ok', async () => {
  const none = await checkBrowser({ chrome: null, bundled: '/nonexistent/chromium' });
  assert.equal(none.ok, false);
  assert.match(none.fix, /Google Chrome/);
  assert.match(none.fix, /playwright-core install chromium/);
  assert.equal((await checkBrowser({ chrome: process.execPath, bundled: null })).ok, true);
});

test('disk: under 1 GB free blocks', () => {
  assert.equal(checkDisk(5e8).ok, false);
  assert.equal(checkDisk(5e9).ok, true);
});

test('git is found on this machine', () => {
  assert.equal(checkGit().ok, true);
});

test('git identity: non-blocking, and the fix names both settings', () => {
  const r = checkGitIdentity();
  assert.equal(r.blocking, false);
  assert.match(r.fix, /user\.name.*user\.email/);
});

test('CLI --json: six checks, exit 0 on a ready machine', async () => {
  const r = await new Promise((ok) => execFile('node', [join(ROOT, 'scripts', 'preflight.mjs'), '--json'], (e, out) => ok({ code: e ? e.code : 0, out })));
  assert.deepEqual(JSON.parse(r.out).map((c) => c.id), ['node', 'deps', 'browser', 'git', 'disk', 'gitIdentity']);
  assert.equal(r.code, 0);
});

const run = (file, ...args) => new Promise((ok) => execFile('node', [file, ...args], (e, out, err) => ok({ code: e ? e.code : 0, out, err })));

test('a missing dependency: ✗ deps, the fix command, exit 1', async () => {
  // realpath: on macOS tmpdir() is /var/..., and the script reports its root through /private/var/...
  const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'dsfa-pre-run-')));
  try {
    mkdirSync(join(tmp, 'scripts', 'lib'), { recursive: true });
    copyFileSync(join(ROOT, 'scripts', 'preflight.mjs'), join(tmp, 'scripts', 'preflight.mjs'));
    copyFileSync(join(ROOT, 'scripts', 'lib', 'browser.mjs'), join(tmp, 'scripts', 'lib', 'browser.mjs'));
    const r = await run(join(tmp, 'scripts', 'preflight.mjs'));
    assert.equal(r.code, 1, r.err);
    assert.match(r.out, /✗ deps/);
    assert.ok(r.out.includes(`npm install --omit=dev --prefix "${tmp}"`), r.out);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('run through a symlink, it still runs', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'dsfa-pre-link-'));
  try {
    const link = join(tmp, 'preflight-link.mjs');
    symlinkSync(join(ROOT, 'scripts', 'preflight.mjs'), link);
    const r = await run(link, '--json');
    assert.deepEqual(JSON.parse(r.out).map((c) => c.id), ['node', 'deps', 'browser', 'git', 'disk', 'gitIdentity'], r.err);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('importing preflight with a non-path argv[1] neither throws nor runs the checks', async () => {
  const r = await new Promise((ok) => execFile('node', ['--input-type=module', '-e', `await import(${JSON.stringify(join(ROOT, 'scripts', 'preflight.mjs'))})`, 'some-flag'],
    { cwd: ROOT }, (err, stdout, stderr) => ok({ status: err ? err.code : 0, stdout, stderr })));
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});
