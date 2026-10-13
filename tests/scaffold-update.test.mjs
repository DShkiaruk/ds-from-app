import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (...a) => new Promise((ok) => execFile('node', [join(ROOT, 'scripts', 'scaffold.mjs'), ...a], (e, stdout, stderr) => ok({ status: e ? e.code : 0, stdout, stderr })));
const git = (dir, ...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { cwd: dir, stdio: 'pipe' });
const VERSION = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;

// a Workbench scaffolded from a fixture extraction, committed
async function oldWorkbench(home) {
  const dir = join(home, 'acme-repo');
  await run('init', dir, '--product', 'Acme');
  writeFileSync(join(dir, 'extraction', 'tokens.json'), JSON.stringify({ $meta: { product: 'Acme', platform: { canvas: {} } }, tokens: { 'color-primary': { $type: 'color', $value: '#112233', $provenance: { label: 'measured', evidence: 'fixture', authoredName: '--color-primary' }, $extensions: { 'co.eleken.ds': { cssVar: '--color-primary', role: 'color', css: '#123' } } } } }));
  writeFileSync(join(dir, 'extraction', 'decisions.json'), JSON.stringify({ flow: { name: 'main-flow', screens: [] }, tokens: [], components: [], excluded: [], questions: [], screens: [] }));
  const r = await run('workbench', dir);
  assert.equal(r.status, 0, r.stderr);
  return dir;
}
const commit = (dir) => { git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'wip'); };

test('update: overwrites plugin files, restores missing ones, keeps the designer\'s content, merges package.json', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-up-'));
  try {
    const dir = await oldWorkbench(home);
    const gates = join(dir, 'tools', 'gates.mjs');
    const original = readFileSync(gates, 'utf8');
    writeFileSync(gates, '// old\n');
    rmSync(join(dir, 'tools', 'lib', 'flow-model.mjs'));
    appendFileSync(join(dir, 'AGENTS.md'), '\nDESIGNER-RULE-7\n');
    appendFileSync(join(dir, 'DESIGN.md'), '\n<!-- mine -->\n');
    appendFileSync(join(dir, 'src', 'App.tsx'), '\n// mine\n');
    const pkgPath = join(dir, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    pkg.scripts['mine'] = 'echo mine';
    const someScript = Object.keys(pkg.scripts).find((k) => k !== 'mine');
    const templateCmd = pkg.scripts[someScript];
    pkg.scripts[someScript] = 'echo stale';
    const removed = Object.keys(pkg.scripts).filter((k) => k !== 'mine' && k !== someScript).pop();
    const removedCmd = pkg.scripts[removed];
    delete pkg.scripts[removed];
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    commit(dir);

    const r = await run('update', dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(gates, 'utf8'), original);
    assert.ok(existsSync(join(dir, 'tools', 'lib', 'flow-model.mjs')));
    assert.match(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), /DESIGNER-RULE-7/);
    assert.ok(existsSync(join(dir, 'AGENTS.template.md')));
    assert.doesNotMatch(readFileSync(join(dir, 'AGENTS.template.md'), 'utf8'), /DESIGNER-RULE-7/);
    assert.match(r.stdout, /merge the new rules by hand \(your own rules stay\)/);
    assert.match(readFileSync(join(dir, 'DESIGN.md'), 'utf8'), /<!-- mine -->/);
    assert.match(readFileSync(join(dir, 'src', 'App.tsx'), 'utf8'), /\/\/ mine/);
    const after = JSON.parse(readFileSync(pkgPath, 'utf8'));
    assert.equal(after.scripts.mine, 'echo mine');
    assert.equal(after.scripts[someScript], templateCmd);
    assert.equal(after.scripts[removed], removedCmd);
    assert.equal(readFileSync(join(dir, '.workbench-version'), 'utf8').trim(), VERSION);
    assert.match(r.stdout, /overwritten \d+/);
    assert.match(r.stdout, /added \d+/);
    assert.match(r.stdout, /npm install && npm run check/);

    // second run after committing: from VERSION to VERSION, nothing overwritten
    commit(dir);
    const r2 = await run('update', dir);
    assert.equal(r2.status, 0, r2.stderr);
    assert.match(r2.stdout, new RegExp(`from ${VERSION.replace(/\./g, '\\.')} to ${VERSION.replace(/\./g, '\\.')}`));
    assert.match(r2.stdout, /overwritten 0/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('update: a dirty git tree is refused (exit 2) and nothing is written', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-up-'));
  try {
    const dir = await oldWorkbench(home);
    commit(dir);
    writeFileSync(join(dir, 'tools', 'gates.mjs'), '// uncommitted\n');
    const r = await run('update', dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /uncommitted changes/);
    assert.equal(readFileSync(join(dir, 'tools', 'gates.mjs'), 'utf8'), '// uncommitted\n');
    assert.ok(!existsSync(join(dir, '.workbench-version')));
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('update: a folder that is not a Workbench is refused (exit 2)', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-up-'));
  try {
    mkdirSync(join(home, 'plain'));
    const r = await run('update', join(home, 'plain'));
    assert.equal(r.status, 2);
    assert.match(r.stderr, /not a Workbench/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
