import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const init = (...a) => new Promise((ok) => execFile('node', [join(ROOT, 'scripts', 'scaffold.mjs'), 'init', ...a], (e, stdout, stderr) => ok({ status: e ? e.code : 0, stdout, stderr })));

test('a new repository: extraction/, the closure sentence, sessions ignored, git', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-scaffold-'));
  const dir = join(home, 'acme-workbench');
  try {
    const r = await init(dir, '--product', 'Acme', '--url', 'https://app.acme.test');
    assert.equal(r.status, 0, r.stderr);
    const m = JSON.parse(readFileSync(join(dir, 'extraction', 'capture-manifest.json'), 'utf8'));
    assert.equal(m.tool, 'ds-from-app');
    assert.equal(m.product, 'Acme');
    assert.equal(m.slug, 'acme');
    assert.equal(m.entryPoint, 'https://app.acme.test');
    assert.match(m.toolVersion, /^\d+\.\d+\.\d+$/);
    const t = JSON.parse(readFileSync(join(dir, 'extraction', 'tokens.json'), 'utf8'));
    assert.match(t.$closure, /NEEDS-TOKEN/);
    assert.deepEqual(t.tokens, {});
    assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /^\*\.auth\.json$/m);
    for (const pat of ['auth.json', '*.storage.json', '.env*', 'runs/']) assert.ok(readFileSync(join(dir, '.gitignore'), 'utf8').split('\n').includes(pat), `.gitignore has ${pat}`);
    assert.ok(existsSync(join(dir, 'extraction', 'baseline')) && existsSync(join(dir, 'extraction', 'canon')) && existsSync(join(dir, '.git')));
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('running it again creates only what is missing and overwrites nothing', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-scaffold-'));
  const dir = join(home, 'acme-workbench');
  try {
    await init(dir, '--product', 'Acme');
    const f = join(dir, 'extraction', 'tokens.json');
    writeFileSync(f, JSON.stringify({ marker: 'kept' }));
    const r = await init(dir, '--product', 'Acme');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(readFileSync(f, 'utf8')).marker, 'kept');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('a folder with other content is refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsfa-scaffold-'));
  try {
    writeFileSync(join(dir, 'notes.txt'), 'mine');
    const r = await init(dir, '--product', 'Acme');
    assert.equal(r.status, 2);
    assert.match(r.stderr, /refused/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a Ukrainian product name: the slug falls back to the folder name', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-scaffold-'));
  const dir = join(home, 'policies-workbench');
  try {
    const r = await init(dir, '--product', 'Політики');
    assert.equal(r.status, 0, r.stderr);
    const m = JSON.parse(readFileSync(join(dir, 'extraction', 'capture-manifest.json'), 'utf8'));
    assert.equal(m.product, 'Політики');
    assert.equal(m.slug, 'policies-workbench');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('a flag is never taken as the value of the one before it', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-scaffold-'));
  const dir = join(home, 'folder-name');
  try {
    const r = await init(dir, '--product', '--url', 'https://x.test');
    assert.equal(r.status, 0, r.stderr);
    const m = JSON.parse(readFileSync(join(dir, 'extraction', 'capture-manifest.json'), 'utf8'));
    assert.equal(m.product, 'folder-name');
    assert.equal(m.entryPoint, 'https://x.test');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('createdAt is the local date, not the UTC one (two zones 25 hours apart: one of them is always on another day than UTC)', async () => {
  for (const TZ of ['Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
    const home = mkdtempSync(join(tmpdir(), 'dsfa-scaffold-'));
    const dir = join(home, 'p');
    try {
      const before = new Date();
      await new Promise((ok) => execFile('node', [join(ROOT, 'scripts', 'scaffold.mjs'), 'init', dir, '--product', 'P'], { env: { ...process.env, TZ } }, ok));
      const after = new Date();
      const local = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ });
      const got = JSON.parse(readFileSync(join(dir, 'extraction', 'capture-manifest.json'), 'utf8')).createdAt;
      assert.ok([local(before), local(after)].includes(got), `${TZ}: ${got} is the local date`);
    } finally { rmSync(home, { recursive: true, force: true }); }
  }
});

test('a freshly created or cloned empty repository is accepted; its README stays untouched', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsfa-scaffold-'));
  try {
    mkdirSync(join(dir, '.git'));
    writeFileSync(join(dir, 'README.md'), '# mine\n');
    writeFileSync(join(dir, 'LICENSE'), 'MIT');
    const r = await init(dir, '--product', 'Acme');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), '# mine\n');
    assert.ok(existsSync(join(dir, 'extraction', 'capture-manifest.json')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an existing .gitignore gets the missing patterns appended, once', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsfa-scaffold-'));
  try {
    writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
    assert.equal((await init(dir, '--product', 'Acme')).status, 0);
    assert.equal((await init(dir, '--product', 'Acme')).status, 0);
    const lines = readFileSync(join(dir, '.gitignore'), 'utf8').split('\n');
    const count = (p) => lines.filter((l) => l === p).length;
    assert.equal(count('node_modules/'), 1);
    assert.equal(count('*.auth.json'), 1);
    assert.equal(count('auth.json'), 1);
    assert.equal(count('# ds-from-app'), 1);
    assert.ok(lines.indexOf('# ds-from-app') < lines.indexOf('*.auth.json'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a folder with a README and anything else is still refused', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsfa-scaffold-'));
  try {
    writeFileSync(join(dir, 'README.md'), '#');
    writeFileSync(join(dir, 'package.json'), '{}');
    assert.equal((await init(dir, '--product', 'Acme')).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('init and workbench refuse a folder whose full path has a non-ASCII character', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-scaffold-'));
  const dir = join(home, 'Проєкти', 'x');
  try {
    const r = await init(dir, '--product', 'Acme');
    assert.equal(r.status, 2);
    assert.ok(r.stderr.includes("refused: the folder path must be ASCII (Storybook's test runner skips stories under non-ASCII paths): ") && r.stderr.includes('Проєкти') && r.stderr.includes('— choose e.g. ~/acme-workbench'), r.stderr);
    assert.ok(!existsSync(dir), 'nothing was created');
    mkdirSync(dir, { recursive: true });
    // the workbench command knows the slug from the manifest of the repository, when there is one
    mkdirSync(join(dir, 'extraction'), { recursive: true });
    writeFileSync(join(dir, 'extraction', 'capture-manifest.json'), JSON.stringify({ product: 'Acme portal', slug: 'acme-portal' }));
    const w0 = await new Promise((ok) => execFile('node', [join(ROOT, 'scripts', 'scaffold.mjs'), 'workbench', dir], (e, stdout, stderr) => ok({ status: e ? e.code : 0, stderr })));
    assert.ok(w0.stderr.includes('— choose e.g. ~/acme-portal-workbench'), w0.stderr);
    rmSync(join(dir, 'extraction'), { recursive: true, force: true });
    const w = await new Promise((ok) => execFile('node', [join(ROOT, 'scripts', 'scaffold.mjs'), 'workbench', dir], (e, stdout, stderr) => ok({ status: e ? e.code : 0, stderr })));
    assert.equal(w.status, 2);
    assert.match(w.stderr, /refused: the folder path must be ASCII/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('R28.3: the new repository starts on main even when git\'s default branch is master (AGENTS rule 11 puts the first two commits on main)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-scaffold-main-'));
  const dir = join(home, 'w');
  const env = { ...process.env, GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'init.defaultBranch', GIT_CONFIG_VALUE_0: 'master' };
  try {
    await new Promise((ok) => execFile('node', [join(ROOT, 'scripts', 'scaffold.mjs'), 'init', dir, '--product', 'Acme', '--url', 'https://app.acme.test'], { env }, ok));
    assert.equal(execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: dir, encoding: 'utf8' }).trim(), 'main');
  } finally { rmSync(home, { recursive: true, force: true }); }
});
