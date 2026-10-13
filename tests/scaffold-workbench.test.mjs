import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (...a) => new Promise((ok) => execFile('node', [join(ROOT, 'scripts', 'scaffold.mjs'), ...a], (e, stdout, stderr) => ok({ status: e ? e.code : 0, stdout, stderr })));
const count = (text, line) => text.split('\n').filter((l) => l.trim() === line).length;

test('without extraction/decisions.json the workbench is refused with a pointer to the checkpoint', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-wb-'));
  const dir = join(home, 'acme-repo');
  try {
    await run('init', dir, '--product', 'Acme');
    const r = await run('workbench', dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /run the checkpoint first/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('with decisions: the skeleton is copied, .gitignore amended once, re-running keeps edits', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-wb-'));
  const dir = join(home, 'acme-repo');
  try {
    await run('init', dir, '--product', 'Acme');
    writeFileSync(join(dir, '.gitignore'), 'foo');
    writeFileSync(join(dir, 'extraction', 'tokens.json'), JSON.stringify({ $meta: { product: 'Acme', platform: { canvas: {} } }, tokens: { 'color-primary': { $type: 'color', $value: '#112233', $provenance: { label: 'measured', evidence: 'fixture', authoredName: '--color-primary' }, $extensions: { 'co.eleken.ds': { cssVar: '--color-primary', role: 'color', css: '#123' } } } } }));
    writeFileSync(join(dir, 'extraction', 'decisions.json'), JSON.stringify({ flow: { name: 'main-flow', screens: [] }, tokens: [], components: [], excluded: [], questions: [], screens: [] }));
    const r = await run('workbench', dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name, 'acme-workbench');
    for (const f of ['src/App.tsx', '.storybook/main.ts', 'tsconfig.json', 'plan/progress.md', '.stylelintrc.json', 'specs/features/.gitkeep', 'src/tokens/index.css', 'src/foundations/Foundations.stories.tsx', 'tools/lib/flow-model.mjs']) assert.ok(existsSync(join(dir, f)), f);
    assert.ok(!existsSync(join(dir, '.gitignore.workbench')));
    const gi = readFileSync(join(dir, '.gitignore'), 'utf8');
    for (const l of ['node_modules/', 'dist/', 'storybook-static/']) assert.equal(count(gi, l), 1, l);
    assert.match(gi, /^foo\n# Workbench\n/);

    for (const f of ['PROJECT.md', 'DESIGN.md', 'specs/pages/main-flow.md']) assert.ok(existsSync(join(dir, f)), f);
    assert.match(readFileSync(join(dir, 'DESIGN.md'), 'utf8'), /\| --color-primary \| #123 \|/);
    appendFileSync(join(dir, 'DESIGN.md'), '\n<!-- marker-design -->\n');
    appendFileSync(join(dir, 'src', 'App.tsx'), '\n// marker-kept\n');
    const r2 = await run('workbench', dir);
    assert.equal(r2.status, 0, r2.stderr);
    assert.match(readFileSync(join(dir, 'src', 'App.tsx'), 'utf8'), /marker-kept/);
    assert.match(readFileSync(join(dir, 'DESIGN.md'), 'utf8'), /marker-design/);
    const gi2 = readFileSync(join(dir, '.gitignore'), 'utf8');
    for (const l of ['node_modules/', 'dist/', 'storybook-static/']) assert.equal(count(gi2, l), 1, l);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('workbench with decisions.json but no capture-manifest.json exits 2 without a stack trace', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-wb-'));
  const dir = join(home, 'bare');
  try {
    mkdirSync(join(dir, 'extraction'), { recursive: true });
    writeFileSync(join(dir, 'extraction', 'decisions.json'), '{}');
    const r = await run('workbench', dir);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /no extraction\/capture-manifest\.json — run scaffold\.mjs init first/);
    assert.doesNotMatch(r.stderr, /\n\s+at /);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('the workbench template carries the agent and designer harness files', () => {
  const wb = join(ROOT, 'templates', 'workbench');
  for (const f of ['AGENTS.md', 'CLAUDE.md', 'FRONTEND.md', 'PROMPT_plan.md', 'PROMPT_build.md', 'README.md', '.claude/skills/build-page/SKILL.md']) {
    assert.ok(existsSync(join(wb, f)), `templates/workbench/${f} is missing`);
  }
});

test('an existing README.md is kept: the designer\'s README is written as WORKBENCH.md and the message says so', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-wb-'));
  const dir = join(home, 'acme-repo');
  try {
    await run('init', dir, '--product', 'Acme');
    writeFileSync(join(dir, 'README.md'), '# Acme\nthe client\'s own readme\n');
    writeFileSync(join(dir, 'extraction', 'tokens.json'), JSON.stringify({ $meta: { product: 'Acme', platform: { canvas: {} } }, tokens: { 'color-primary': { $type: 'color', $value: '#112233', $provenance: { label: 'measured', evidence: 'fixture', authoredName: '--color-primary' }, $extensions: { 'co.eleken.ds': { cssVar: '--color-primary', role: 'color', css: '#123' } } } } }));
    writeFileSync(join(dir, 'extraction', 'decisions.json'), JSON.stringify({ flow: { name: 'main-flow', screens: [] }, tokens: [], components: [], excluded: [], questions: [], screens: [] }));
    const r = await run('workbench', dir);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(join(dir, 'README.md'), 'utf8'), '# Acme\nthe client\'s own readme\n');
    assert.match(readFileSync(join(dir, 'WORKBENCH.md'), 'utf8'), /^# Верстак/);
    assert.match(r.stdout, /README\.md already exists: the Workbench README is WORKBENCH\.md/);
    const r2 = await run('workbench', dir);
    assert.equal(r2.status, 0, r2.stderr);
    assert.match(readFileSync(join(dir, 'WORKBENCH.md'), 'utf8'), /^# Верстак/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('R28.5: the closing message gives the order of SKILL.md step 4, and the closure sentence points at no GAPS.md and forbids no component', async () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-wb-'));
  const dir = join(home, 'acme-repo');
  try {
    await run('init', dir, '--product', 'Acme');
    const closure = JSON.parse(readFileSync(join(dir, 'extraction', 'tokens.json'), 'utf8')).$closure;
    assert.doesNotMatch(closure, /GAPS\.md|no new component/);
    assert.match(closure, /NEEDS-COMPONENT/);
    writeFileSync(join(dir, 'extraction', 'tokens.json'), JSON.stringify({ $meta: { product: 'Acme', platform: { canvas: {} } }, tokens: { 'color-primary': { $type: 'color', $value: '#112233', $provenance: { label: 'measured', evidence: 'fixture', authoredName: '--color-primary' }, $extensions: { 'co.eleken.ds': { cssVar: '--color-primary', role: 'color', css: '#123' } } } } }));
    writeFileSync(join(dir, 'extraction', 'decisions.json'), JSON.stringify({ flow: { name: 'f', screens: [] }, tokens: [], components: [], excluded: [], questions: [], screens: [] }));
    const r = await run('workbench', dir);
    assert.equal(r.status, 0, r.stderr);
    const next = r.stdout.split('\n').find((l) => l.startsWith('next:'));
    const at = ['npm install', 'npm run check:fast', 'commit', 'new Claude Code session'].map((s) => next.indexOf(s));
    assert.ok(at.every((i) => i >= 0) && at.every((v, i) => i === 0 || v > at[i - 1]), next);
    assert.match(next, /«склади план»/);
    assert.doesNotMatch(next, /npm run storybook/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
