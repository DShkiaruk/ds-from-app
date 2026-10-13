import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Asynchronous on purpose: the walker needs this process's fixture server to answer while it runs.
export const run = (script, ...args) => new Promise((ok) => execFile('node', [join(ROOT, 'scripts', script), ...args],
  { cwd: ROOT, env: { ...process.env, INIT_CWD: ROOT }, maxBuffer: 64 << 20, timeout: 240000, killSignal: 'SIGKILL' },
  (err, stdout, stderr) => ok({ status: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout,
    stderr: err?.killed ? `${stderr}\n[run] timed out after 240 s` : stderr })));

// A product repository in the method's root layout (no extraction/ folder): product() then uses the root.
export function fixtureRepo(prefix = 'dsfa-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(dir, 'baseline'));
  writeFileSync(join(dir, 'capture-manifest.json'), JSON.stringify({ product: 'Fixture' }));
  writeFileSync(join(dir, 'tokens.json'), JSON.stringify({ $closure: 'fixture', $meta: { product: 'Fixture', derivationPolicy: { colorDerivation: 'forbidden', enforcement: {} } }, tokens: {} }));
  return dir;
}

export const dropPngs = (dir) => { for (const f of readdirSync(dir)) if (f.endsWith('.png')) rmSync(join(dir, f)); };

// Every planted shape is checked, and every miss is listed — one failing line must not hide the next.
export function expectAll(checks) {
  const missed = checks.filter(([ok]) => !ok).map(([, what]) => what);
  assert.deepEqual(missed, [], `missed:\n  ${missed.join('\n  ')}`);
}
