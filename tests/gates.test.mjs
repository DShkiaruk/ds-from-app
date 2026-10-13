import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TPL = join(ROOT, 'templates', 'workbench');
const ok = 'node -e "process.exit(0)"';

function fakeRepo({ screens } = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'dsfa-gates-'));
  const scripts = { lint: ok, 'lint:css': `node -e "console.log('bad css');process.exit(1)"`, 'check:vars': ok, 'check:inline': ok, typecheck: ok, 'check:tokens': ok, 'check:stories': ok, build: ok, 'check:pages': ok };
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'fake', private: true, scripts }));
  mkdirSync(join(repo, 'tools'));
  for (const f of ['gates.mjs', 'stop-check.mjs']) copyFileSync(join(TPL, 'tools', f), join(repo, 'tools', f));
  if (screens) { mkdirSync(join(repo, 'extraction')); writeFileSync(join(repo, 'extraction', 'decisions.json'), JSON.stringify({ flow: { screens } })); }
  return repo;
}
const run = (repo, args, env = {}) => spawnSync(process.execPath, args, { cwd: repo, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: repo, ...env } });

test('gates fast runs every gate, even after a failure, in plain words', () => {
  const repo = fakeRepo();
  try {
    const r = run(repo, ['tools/gates.mjs', 'fast']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✓ lint \(code\)/);
    assert.match(r.stdout, /✗ tokens only \(styles\)/);
    assert.match(r.stdout, /^ {4}bad css$/m);
    assert.match(r.stdout, /gates: 5 passed, 1 failed — see above/);
    assert.equal((r.stdout.match(/^[✓✗] /gm) ?? []).length, 6);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('gates parity fails with a clear message when the flow has no screens', () => {
  const repo = fakeRepo({ screens: [] });
  try {
    const r = run(repo, ['tools/gates.mjs', 'parity']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /no screens in the test flow yet/);
    assert.match(r.stdout, /choose them at the checkpoint — ask the designer to run \/ds-from-app again/);
    assert.match(r.stdout, /similarity to the app/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('stop-check: quiet without node_modules or without changes, exit 2 with the gate output on failure', () => {
  const repo = fakeRepo();
  try {
    let r = run(repo, ['tools/stop-check.mjs']);
    assert.equal(r.status, 0); assert.equal(r.stderr, '');
    mkdirSync(join(repo, 'node_modules')); mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.ts'), 'export {};\n');
    const git = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'ignore' });
    git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'init');
    r = run(repo, ['tools/stop-check.mjs']);
    assert.equal(r.status, 0, 'nothing changed since the commit'); assert.equal(r.stderr, '');
    writeFileSync(join(repo, 'src', 'a.ts'), 'export const x = 1;\n');
    r = run(repo, ['tools/stop-check.mjs']);
    assert.equal(r.status, 2);
    assert.ok(r.stderr.startsWith('Quality gates failed'), r.stderr);
    assert.match(r.stderr, /✗ tokens only \(styles\)/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('.claude/settings.json wires the Stop hook to tools/stop-check.mjs', () => {
  const s = JSON.parse(readFileSync(join(TPL, '.claude', 'settings.json'), 'utf8'));
  assert.match(s.hooks.Stop[0].hooks[0].command, /tools\/stop-check\.mjs/);
  assert.equal(s.hooks.Stop[0].hooks[0].type, 'command');
});

function gitRepo(repo) {
  mkdirSync(join(repo, 'node_modules'), { recursive: true }); mkdirSync(join(repo, 'src')); mkdirSync(join(repo, 'plan'));
  writeFileSync(join(repo, 'src', 'a.ts'), 'export {};\n'); writeFileSync(join(repo, 'plan', 'progress.md'), 'x\n');
  const git = (...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd: repo, stdio: 'ignore' });
  git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'init');
}

test('stop-check blocks only on a code state it has not reported yet', () => {
  const repo = fakeRepo();
  try {
    gitRepo(repo);
    writeFileSync(join(repo, 'src', 'a.ts'), 'export const x = 1;\n');
    assert.equal(run(repo, ['tools/stop-check.mjs']).status, 2);
    const again = run(repo, ['tools/stop-check.mjs']);
    assert.equal(again.status, 0); assert.equal(again.stderr, '');
    writeFileSync(join(repo, 'src', 'a.ts'), 'export const x = 2;\n');
    assert.equal(run(repo, ['tools/stop-check.mjs']).status, 2, 'edited again -> checked again');
    writeFileSync(join(repo, 'src', 'new.ts'), 'export {};\n');
    assert.equal(run(repo, ['tools/stop-check.mjs']).status, 2, 'a new untracked file counts');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('stop-check: a new non-ASCII folder\'s file contents and the gate config files enter the fingerprint', () => {
  const repo = fakeRepo();
  try {
    gitRepo(repo);
    mkdirSync(join(repo, 'src', 'екран'));
    writeFileSync(join(repo, 'src', 'екран', 'a.ts'), 'export const x = 1;\n');
    assert.equal(run(repo, ['tools/stop-check.mjs']).status, 2);
    assert.equal(run(repo, ['tools/stop-check.mjs']).status, 0, 'reported once');
    writeFileSync(join(repo, 'src', 'екран', 'a.ts'), 'export const x = 2;\n');
    assert.equal(run(repo, ['tools/stop-check.mjs']).status, 2, 'content of an untracked non-ASCII file changed -> checked again');
    for (const f of ['.stylelintrc.json', 'eslint.config.js', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'package.json']) {
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'add', '-A'], { cwd: repo, stdio: 'ignore' });
      execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', `base ${f}`], { cwd: repo, stdio: 'ignore' });
      if (f === 'package.json') { const p = JSON.parse(readFileSync(join(repo, f), 'utf8')); p.scripts['check:inline'] = 'node -e "process.exit(0)" '; writeFileSync(join(repo, f), JSON.stringify(p)); }
      else writeFileSync(join(repo, f), `// ${f}\n`);
      assert.equal(run(repo, ['tools/stop-check.mjs']).status, 2, `${f} is watched`);
    }
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('stop-check never blocks without git, or for a change outside the code paths', () => {
  const repo = fakeRepo();
  try {
    mkdirSync(join(repo, 'node_modules'), { recursive: true });
    const r = run(repo, ['tools/stop-check.mjs'], { GIT_DIR: join(repo, 'nope') });
    assert.equal(r.status, 0); assert.equal(r.stderr, '');
    gitRepo(repo);
    writeFileSync(join(repo, 'plan', 'progress.md'), 'changed\n');
    const q = run(repo, ['tools/stop-check.mjs']);
    assert.equal(q.status, 0); assert.equal(q.stderr, '');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('gates parity fails gracefully on a missing or malformed decisions.json, and an unknown mode exits 2', () => {
  const repo = fakeRepo();
  try {
    let r = run(repo, ['tools/gates.mjs', 'parity']);
    assert.equal(r.status, 1); assert.match(r.stdout, /✗ similarity to the app/); assert.match(r.stdout, /no screens in the test flow yet/);
    mkdirSync(join(repo, 'extraction'));
    writeFileSync(join(repo, 'extraction', 'decisions.json'), '{ nope');
    r = run(repo, ['tools/gates.mjs', 'parity']);
    assert.equal(r.status, 1); assert.match(r.stdout, /decisions\.json is not valid: /); assert.ok(!/\n\s+at /.test(r.stdout + r.stderr));
    writeFileSync(join(repo, 'extraction', 'decisions.json'), JSON.stringify({ flow: { screens: 'home' } }));
    r = run(repo, ['tools/gates.mjs', 'parity']);
    assert.match(r.stdout, /is not valid: flow\.screens must be a list/);
    r = run(repo, ['tools/gates.mjs', 'bogus']);
    assert.equal(r.status, 2); assert.match(r.stderr, /usage: node tools\/gates\.mjs fast\|all\|parity/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('stop-check keeps its state file in a linked git worktree', () => {
  const repo = fakeRepo();
  const wt = join(mkdtempSync(join(tmpdir(), 'dsfa-wt-')), 'wt');
  try {
    gitRepo(repo);
    execFileSync('git', ['worktree', 'add', '-q', wt, '-b', 'wt'], { cwd: repo, stdio: 'ignore' });
    mkdirSync(join(wt, 'node_modules'));
    writeFileSync(join(wt, 'src', 'a.ts'), 'export const x = 1;\n');
    assert.equal(run(wt, ['tools/stop-check.mjs'], { CLAUDE_PROJECT_DIR: wt }).status, 2);
    const again = run(wt, ['tools/stop-check.mjs'], { CLAUDE_PROJECT_DIR: wt });
    assert.equal(again.status, 0); assert.equal(again.stderr, '');
    assert.ok(existsSync(join(repo, '.git', 'worktrees', 'wt', 'ds-stop-check.json')));
  } finally {
    try { execFileSync('git', ['worktree', 'remove', '--force', wt], { cwd: repo, stdio: 'ignore' }); } catch { /* already gone */ }
    rmSync(dirname(wt), { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true });
  }
});

test('gates parity passes --merge (so extraction/flows/parity.json is written for compare) and one --only per flow screen', () => {
  const repo = fakeRepo({ screens: ['home', 'settings'] });
  try {
    writeFileSync(join(repo, 'tools', 'parity.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync('argv.json', JSON.stringify(process.argv.slice(2)));\n`);
    const r = run(repo, ['tools/gates.mjs', 'parity']);
    assert.equal(r.status, 0, r.stdout);
    const argv = JSON.parse(readFileSync(join(repo, 'argv.json'), 'utf8'));
    assert.ok(argv.includes('--merge'), argv.join(' '));
    assert.deepEqual(argv.filter((a, i) => argv[i - 1] === '--only'), ['home', 'settings']);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('gates ci = fast + slow, no parity (CI renders other fonts than the machine the app was captured on)', () => {
  const repo = fakeRepo({ screens: ['home'] });
  try {
    const scripts = Object.fromEntries(['lint', 'lint:css', 'check:vars', 'check:inline', 'typecheck', 'check:tokens', 'check:stories', 'build', 'check:pages', 'test:stories', 'build-storybook'].map((k) => [k, ok]));
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'fake', private: true, scripts }));
    const r = run(repo, ['tools/gates.mjs', 'ci']);
    assert.equal(r.status, 0, r.stdout);
    assert.equal((r.stdout.match(/^[✓✗] /gm) ?? []).length, 9);
    assert.doesNotMatch(r.stdout, /similarity to the app/);
    assert.match(r.stdout, /✓ Storybook builds/);
    assert.match(r.stdout, /gates: 9 passed, 0 failed/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('the Workbench wires check:ci to gates ci, CI runs it, and the docs say parity is local', () => {
  assert.equal(JSON.parse(readFileSync(join(TPL, 'package.json'), 'utf8')).scripts['check:ci'], 'node tools/gates.mjs ci');
  assert.match(readFileSync(join(TPL, '.github', 'workflows', 'ci.yml'), 'utf8'), /run: node tools\/gates\.mjs ci/);
  assert.doesNotMatch(readFileSync(join(TPL, '.github', 'workflows', 'ci.yml'), 'utf8'), /npm run check\b/);
  assert.match(readFileSync(join(TPL, 'AGENTS.md'), 'utf8'), /parity[^\n]*(locally|local)[^\n]*captured/i);
  assert.match(readFileSync(join(TPL, 'README.md'), 'utf8'), /parity[\s\S]*локально/i);
  assert.match(readFileSync(join(TPL, '.gitignore.workbench'), 'utf8'), /^extraction\/flows\/parity\.json$/m);
});

test('gates task (R28.2) = fast + slow + parity of the flow screens already built (--skip-unbuilt, --merge, one --only per screen); all and parity do not skip', () => {
  const repo = fakeRepo({ screens: ['home', 'settings'] });
  try {
    const scripts = Object.fromEntries(['lint', 'lint:css', 'check:vars', 'check:inline', 'typecheck', 'check:tokens', 'check:stories', 'build', 'check:pages', 'test:stories', 'build-storybook'].map((k) => [k, ok]));
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'fake', private: true, scripts }));
    writeFileSync(join(repo, 'tools', 'parity.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync('argv.json', JSON.stringify(process.argv.slice(2)));\n`);
    let r = run(repo, ['tools/gates.mjs', 'task']);
    assert.equal(r.status, 0, r.stdout);
    assert.equal((r.stdout.match(/^[✓✗] /gm) ?? []).length, 10);
    assert.match(r.stdout, /✓ similarity to the app/);
    assert.match(r.stdout, /gates: 10 passed, 0 failed/);
    let argv = JSON.parse(readFileSync(join(repo, 'argv.json'), 'utf8'));
    assert.ok(argv.includes('--skip-unbuilt') && argv.includes('--merge'), argv.join(' '));
    assert.deepEqual(argv.filter((a, i) => argv[i - 1] === '--only'), ['home', 'settings']);
    for (const mode of ['all', 'parity']) {
      r = run(repo, ['tools/gates.mjs', mode]);
      argv = JSON.parse(readFileSync(join(repo, 'argv.json'), 'utf8'));
      assert.ok(!argv.includes('--skip-unbuilt'), `${mode}: the flow is done only when every screen passes`);
    }
    r = run(repo, ['tools/gates.mjs', 'bogus']);
    assert.match(r.stderr, /fast\|all\|parity\|ci\|task/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('gates task forwards its extra argv as --require <screen> (I1): the task\'s own screen is never skipped', () => {
  const repo = fakeRepo({ screens: ['home', 'settings'] });
  try {
    const scripts = Object.fromEntries(['lint', 'lint:css', 'check:vars', 'check:inline', 'typecheck', 'check:tokens', 'check:stories', 'build', 'check:pages', 'test:stories', 'build-storybook'].map((k) => [k, ok]));
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'fake', private: true, scripts }));
    writeFileSync(join(repo, 'tools', 'parity.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync('argv.json', JSON.stringify(process.argv.slice(2)));\n`);
    let r = run(repo, ['tools/gates.mjs', 'task', 'settings']);
    assert.equal(r.status, 0, r.stdout);
    let argv = JSON.parse(readFileSync(join(repo, 'argv.json'), 'utf8'));
    assert.deepEqual(argv.filter((a, i) => argv[i - 1] === '--require'), ['settings'], argv.join(' '));
    assert.ok(argv.includes('--skip-unbuilt'));
    r = run(repo, ['tools/gates.mjs', 'task']);
    argv = JSON.parse(readFileSync(join(repo, 'argv.json'), 'utf8'));
    assert.ok(!argv.includes('--require'), 'no screen named, nothing required');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('gates parity forwards its extra argv (G1): `npm run parity -- --only <screen>` checks only that screen', () => {
  const repo = fakeRepo({ screens: ['home', 'settings'] });
  try {
    const scripts = Object.fromEntries(['lint', 'lint:css', 'check:vars', 'check:inline', 'typecheck', 'check:tokens', 'check:stories', 'build', 'check:pages', 'test:stories', 'build-storybook'].map((k) => [k, ok]));
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'fake', private: true, scripts }));
    writeFileSync(join(repo, 'tools', 'parity.mjs'), `import { writeFileSync } from 'node:fs'; writeFileSync('argv.json', JSON.stringify(process.argv.slice(2)));\n`);
    run(repo, ['tools/gates.mjs', 'parity', '--only', 'settings']);
    let argv = JSON.parse(readFileSync(join(repo, 'argv.json'), 'utf8'));
    assert.deepEqual(argv.filter((a, i) => argv[i - 1] === '--only'), ['settings'], argv.join(' '));
    assert.ok(argv.includes('--merge'));
    run(repo, ['tools/gates.mjs', 'parity']);
    argv = JSON.parse(readFileSync(join(repo, 'argv.json'), 'utf8'));
    assert.deepEqual(argv.filter((a, i) => argv[i - 1] === '--only'), ['home', 'settings'], 'without extra argv: the whole flow');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('the Workbench wires check:task to gates task (R28.2)', () => {
  assert.equal(JSON.parse(readFileSync(join(TPL, 'package.json'), 'utf8')).scripts['check:task'], 'node tools/gates.mjs task');
});

test('the styles gate also runs check:vars: an undefined var() fails "tokens only (styles)" with its message, and the gate count stays six', () => {
  const repo = fakeRepo();
  try {
    const p = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
    p.scripts['lint:css'] = ok;
    p.scripts['check:vars'] = `node -e "console.log('src/A.module.css:3: var(--x) is not a token');process.exit(1)"`;
    writeFileSync(join(repo, 'package.json'), JSON.stringify(p));
    const r = run(repo, ['tools/gates.mjs', 'fast']);
    assert.equal(r.status, 1);
    assert.match(r.stdout, /✗ tokens only \(styles\)/);
    assert.match(r.stdout, /^ {4}src\/A\.module\.css:3: var\(--x\) is not a token$/m);
    assert.match(r.stdout, /gates: 5 passed, 1 failed/);
    assert.equal((r.stdout.match(/^[✓✗] /gm) ?? []).length, 6);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
