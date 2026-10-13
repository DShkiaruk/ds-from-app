// Heavy self-test (npm run selftest:workbench): a scaffolded Workbench installs, its gates are green when clean,
// and every gate goes red on its own planted defect. Takes several minutes (npm install, Storybook build).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, rmSync, renameSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { startServer } from '../server.mjs';
import { run } from '../helpers.mjs';

const sh = (cmd, args, cwd, env = {}) => new Promise((ok) => execFile(cmd, args,
  { cwd, env: { ...process.env, ...env }, maxBuffer: 256 << 20, timeout: 840000 },
  (err, stdout, stderr) => ok({ status: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr, out: `${stdout}${stderr}` })));

// The flow screen as build-page builds it: ASCII folder, tokens only, story «Screens/огляд». Token names are the ones
// the fixture extraction generates into src/tokens/tokens.json (checked in the test before use).
const SCREEN = {
  css: `.card {
  padding: var(--unused-gap);
}

.btn {
  background-color: var(--color-primary);
  color: var(--color-on-primary);
  border-radius: var(--radius-md);
  padding: var(--spacing-2) var(--spacing-4);
  font-size: var(--text-sm);
  line-height: var(--text-sm--line-height);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-sm);
  border: 0;
}
`,
  tsx: `import s from './Overview.module.css';

export function Overview() {
  return (
    <main className={s.card}>
      <h1>Fixture</h1>
      <button type="button" className={s.btn}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>Save
      </button>{' '}
      <svg aria-label="Company logo" role="img" width="20" height="20" viewBox="0 0 20 20"><rect width="20" height="20" rx="4" fill="currentColor"></rect></svg>{' '}
      <svg width="300" height="160" viewBox="0 0 300 160" aria-hidden="true"><rect width="300" height="160" fill="currentColor"></rect></svg>
    </main>
  );
}
`,
  story: `import type { Meta, StoryObj } from '@storybook/react-vite';
import { Overview } from './Overview';

const meta: Meta<typeof Overview> = { title: 'Screens/огляд', component: Overview };
export default meta;
export const Default: StoryObj<typeof Overview> = {};
`,
  index: `import type { ComponentType } from 'react';
import { Overview } from './overview/Overview';

export const screens: Record<string, ComponentType> = {
  'огляд': Overview,
};
`,
};

test('the Workbench end to end: installs, green when clean, every gate red on its planted defect', { timeout: 900000 }, async () => {
  const S = await startServer();
  const home = mkdtempSync(join(tmpdir(), 'dsfa-wbe2e-'));
  const repo = join(home, 'fixture-workbench');
  try {
    // 1. the extraction, as selftest/e2e.test.mjs builds it
    let r = await run('scaffold.mjs', 'init', repo, '--product', 'Фікстура', '--url', S.url);
    assert.equal(r.status, 0, r.stderr);
    for (const scheme of ['light', 'dark']) {
      r = await run('capture.mjs', '--url', S.url, '--screen', 'огляд', '--scheme', scheme, '--out', join(repo, 'extraction', 'baseline'), '--no-interact', '--block-writes', '--settle', '300');
      assert.equal(r.status, 0, r.stderr);
    }
    for (const [script, ...args] of [['tokens.mjs', repo], ['inventory.mjs', repo], ['flows.mjs', repo, '--block-writes', '--settle', '250'], ['checkpoint.mjs', 'prepare', repo]]) {
      r = await run(script, ...args);
      assert.equal(r.status, 0, `${script}: ${r.stderr || r.stdout}`);
    }

    // 2. decisions.json from checkpoint.json
    const cp = JSON.parse(readFileSync(join(repo, 'extraction', 'checkpoint.json'), 'utf8'));
    let renamed = false;
    const decisions = {
      flow: { name: 'main-flow', screens: ['огляд'] },
      tokens: cp.tokens.map((t) => {
        if (!renamed && t.nameStatus === 'proposed') { renamed = true; return { id: t.id, name: 'surface-page' }; }
        return { id: t.id, name: t.id };
      }),
      components: cp.components.map((c) => ({ id: c.id, name: c.name, include: c.include })),
      excluded: [], questions: [], screens: [], lang: 'uk',
    };
    writeFileSync(join(repo, 'extraction', 'decisions.json'), JSON.stringify(decisions, null, 2));

    // 3. scaffold the Workbench
    r = await run('scaffold.mjs', 'workbench', repo);
    assert.equal(r.status, 0, r.stderr || r.stdout);

    // 4. install
    r = await sh('npm', ['install', '--no-audit', '--no-fund', '--prefer-offline'], repo);
    assert.equal(r.status, 0, `npm install:\n${r.out.slice(-4000)}`);

    const npm = (script) => sh('npm', ['run', '-s', script], repo);
    const green = async (script, why) => { const x = await npm(script); assert.equal(x.status, 0, `${why}: ${script} must pass\n${x.out.slice(-3000)}`); return x; };
    const red = async (script, why, pattern) => {
      const x = await npm(script);
      assert.notEqual(x.status, 0, `${why}: ${script} must fail but exited 0\n${x.out.slice(-2000)}`);
      if (pattern) assert.match(x.out, pattern, `${why}: output of ${script}`);
      return x;
    };

    // 5-7. a fresh Workbench is clean
    await green('check:fast', 'fresh Workbench');
    await green('test:stories', 'Foundations stories');
    await green('build', 'fresh Workbench');
    await green('build-storybook', 'fresh Workbench');

    // 8. the probe component, valid first
    const tokens = JSON.parse(readFileSync(join(repo, 'src', 'tokens', 'tokens.json'), 'utf8'));
    const colorRow = tokens.tokens.find((t) => t.group === 'color');
    assert.ok(colorRow, `a color token in src/tokens/tokens.json: ${JSON.stringify(tokens).slice(0, 300)}`);
    const colorVar = colorRow.cssVar;
    const dir = join(repo, 'src', 'components', 'Probe');
    mkdirSync(dir, { recursive: true });
    const F = { tsx: join(dir, 'Probe.tsx'), css: join(dir, 'Probe.module.css'), story: join(dir, 'Probe.stories.tsx'), index: join(dir, 'index.ts') };
    const GOOD = {
      tsx: "import s from './Probe.module.css';\nexport function Probe() { return <p className={s.x}>Probe</p>; }\n",
      css: `.x { color: var(${colorVar}); }\n`,
      story: "import type { Meta, StoryObj } from '@storybook/react-vite';\nimport { Probe } from './Probe';\n\nconst meta: Meta<typeof Probe> = { title: 'Components/Probe', component: Probe };\nexport default meta;\nexport const Default: StoryObj<typeof Probe> = {};\n",
      index: "export { Probe } from './Probe';\n",
    };
    const restore = () => { for (const k of Object.keys(F)) writeFileSync(F[k], GOOD[k]); };
    restore();
    await green('check:fast', 'valid Probe');

    const plant = async (file, content, script, why, pattern) => {
      writeFileSync(F[file], content);
      try { await red(script, why, pattern); } finally { restore(); }
      await green(script, `${why} (restored)`);
    };
    await plant('css', '.x { color: #ff00aa; }\n', 'lint:css', 'a hex colour in module.css');
    await plant('tsx', "import s from './Probe.module.css';\nexport function Probe() { return <div className={s.x} style={{ padding: 12 }}>x</div>; }\n", 'check:inline', 'an inline padding');
    await plant('css', '.x { color: var(--not-a-token); }\n', 'check:vars', 'a var() that names no token (gate 2)', /Probe\.module\.css:1: var\(--not-a-token\) is not a token/);
    // a missing story
    rmSync(F.story);
    try { await red('check:stories', 'a component without a story', /\.claude\/skills\/build-page\/SKILL\.md/); } finally { restore(); }
    await green('check:stories', 'story restored');
    // a hand edit of a generated token file
    const colorCss = join(repo, 'src', 'tokens', 'color.css');
    const colorOrig = readFileSync(colorCss, 'utf8');
    appendFileSync(colorCss, '\n:root { --hand-edit: 1; }\n');
    try { await red('check:tokens', 'a hand edit in src/tokens/color.css'); } finally { writeFileSync(colorCss, colorOrig); }
    await green('check:tokens', 'color.css restored');
    await plant('tsx', "import s from './Probe.module.css';\nexport function Probe() { return <div className={s.x} onClick={() => {}}>x</div>; }\n", 'lint', 'a clickable div');
    await plant('tsx', "import s from './Probe.module.css';\nconst n: number = 'x';\nexport function Probe() { return <p className={s.x}>{n}</p>; }\n", 'typecheck', 'a type error');
    await plant('story', `${GOOD.story}export const NoName: StoryObj<typeof Probe> = { render: () => <button></button> };\n`, 'test:stories', 'a button without a name');

    // 9. the flow screen is not built yet: parity sees it
    r = await npm('parity');
    assert.notEqual(r.status, 0, `parity must fail while the flow screen is not built\n${r.out.slice(-2000)}`);
    assert.match(r.out, /огляд/, 'parity names the missing screen');

    // 10. build the flow screen the way build-page says
    for (const v of ['--unused-gap', '--color-primary', '--color-on-primary', '--radius-md', '--spacing-2', '--spacing-4', '--text-sm', '--text-sm--line-height', '--font-weight-medium', '--shadow-sm']) {
      assert.ok(tokens.tokens.some((t) => t.cssVar === v), `the fixture's tokens.json holds ${v}`);
    }
    const sdir = join(repo, 'src', 'screens', 'overview');
    mkdirSync(sdir, { recursive: true });
    writeFileSync(join(sdir, 'Overview.module.css'), SCREEN.css);
    writeFileSync(join(sdir, 'Overview.tsx'), SCREEN.tsx);
    writeFileSync(join(sdir, 'Overview.stories.tsx'), SCREEN.story);
    writeFileSync(join(repo, 'src', 'screens', 'index.ts'), SCREEN.index);

    // 11. fast gates, probes removed
    rmSync(dir, { recursive: true, force: true });
    r = await sh('node', ['tools/gates.mjs', 'fast'], repo);
    assert.equal(r.status, 0, r.out.slice(-3000));
    assert.match(r.stdout, /gates: 6 passed, 0 failed/);

    // 12. the whole check goes green with the flow screen built, parity included
    r = await npm('parity');
    assert.equal(r.status, 0, `parity must pass once the flow screen is built\n${r.out.slice(-3000)}`);
    r = await npm('check');
    assert.equal(r.status, 0, `npm run check must be green\n${r.out.slice(-4000)}`);
    assert.match(r.stdout, /gates: 10 passed, 0 failed/);

    // 13. compare: one screen, a relative product image that exists next to compare.html
    r = await npm('compare');
    assert.equal(r.status, 0, `npm run compare\n${r.out.slice(-3000)}`);
    const cmpFile = join(repo, 'extraction', 'compare.html');
    assert.ok(existsSync(cmpFile), 'extraction/compare.html exists');
    const html = readFileSync(cmpFile, 'utf8');
    assert.match(r.stdout, /\(1 screen\(s\)\)/, 'compare reports 1 screen');
    const imgs = [...html.matchAll(/<img[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);
    assert.ok(imgs.length >= 1, 'compare.html has product images');
    for (const src of imgs) {
      assert.ok(!/^(\/|[a-z]+:)/i.test(src), `image src is a relative path: ${src}`);
      assert.ok(existsSync(join(dirname(cmpFile), decodeURIComponent(src))), `image file exists next to compare.html: ${src}`);
    }

    // 14. planted: a function in CSS (R25.3), a non-ASCII component folder (R25.1)
    mkdirSync(dir, { recursive: true });
    restore();
    await green('check:fast', 'Probe back');
    await plant('css', '.x { color: var(' + colorVar + '); padding: calc(13px + 0px); }\n', 'lint:css', 'a raw value inside calc()');
    // the edges of gate 2 (R27.5): a negated token, a gradient of tokens and a url pass; a raw fallback in var() fails
    writeFileSync(F.css, '.x { margin: calc(-1 * var(' + colorVar + ')); background: linear-gradient(var(' + colorVar + '), var(' + colorVar + ')); }\n.y { background: url(./x.png); }\n');
    try { await green('lint:css', 'calc(-1 * var()), a gradient of tokens and url() pass'); } finally { restore(); }
    await plant('css', '.x { font-size: var(--t, 13px); }\n', 'lint:css', 'a raw fallback inside var()');
    const cyr = join(repo, 'src', 'components', 'Проба');
    renameSync(dir, cyr);
    try { await red('check:stories', 'a component in a non-ASCII folder', /ASCII/i); } finally { renameSync(cyr, dir); }
    await green('check:stories', 'Probe moved back');
    rmSync(dir, { recursive: true, force: true });

    // 15. ci mode: no parity line
    r = await sh('node', ['tools/gates.mjs', 'ci'], repo);
    assert.equal(r.status, 0, `gates ci\n${r.out.slice(-3000)}`);
    assert.doesNotMatch(r.out, /parity/i, 'ci mode runs no parity gate');

    // 16. the Stop hook
    const git = (...a) => sh('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], repo);
    assert.equal((await git('init', '-q')).status, 0);
    assert.equal((await git('add', '-A')).status, 0);
    const c = await git('commit', '-q', '-m', 'fixture');
    assert.equal(c.status, 0, c.out);
    const hook = () => sh('node', ['tools/stop-check.mjs'], repo, { CLAUDE_PROJECT_DIR: repo });
    mkdirSync(dir, { recursive: true });
    writeFileSync(F.tsx, GOOD.tsx); writeFileSync(F.story, GOOD.story); writeFileSync(F.index, GOOD.index);
    writeFileSync(F.css, '.x { color: #ff00aa; }\n');
    r = await hook();
    assert.equal(r.status, 2, `Stop hook must block on a planted hex\n${r.out.slice(-2000)}`);
    assert.match(r.stderr, /^Quality gates failed/);
    r = await hook();
    assert.equal(r.status, 0, `the same failing state is reported once (R10)\n${r.out.slice(-1000)}`);
    // the hex is replaced by a CLEAN uncommitted change (not removed: a clean tree would exit 0 without running a gate)
    const stamp = () => { try { return JSON.parse(readFileSync(join(repo, '.git', 'ds-stop-check.json'), 'utf8')); } catch { return null; } };
    const before = stamp();
    writeFileSync(F.css, `.x { color: var(${colorVar}); }\n`);
    r = await hook();
    assert.equal(r.status, 0, `Stop hook passes once the hex is gone\n${r.out.slice(-1000)}`);
    const after = stamp();
    assert.ok(after && after.ok === true && after.fingerprint !== before?.fingerprint, `the gates ran on the clean change and passed (fingerprint ${before?.fingerprint?.slice(0, 8)} -> ${after?.fingerprint?.slice(0, 8)}, ok=${after?.ok})`);
    rmSync(dir, { recursive: true, force: true });
    // a hex in a NEW untracked non-ASCII folder (R25.6, quotePath)
    const kdir = join(repo, 'src', 'components', 'Картка');
    mkdirSync(kdir, { recursive: true });
    writeFileSync(join(kdir, 'x.module.css'), `.x { color: var(${colorVar}); }\n`);
    r = await hook();
    assert.equal(r.status, 0, `Stop hook passes on a clean file in a new non-ASCII folder (the gates pass)\n${r.out.slice(-2000)}`);
    writeFileSync(join(kdir, 'x.module.css'), '.x { color: #ff00aa; }\n');
    r = await hook();
    assert.equal(r.status, 2, `Stop hook must block on a hex in an untracked non-ASCII folder\n${r.out.slice(-2000)}`);
    const beforeK = stamp();
    writeFileSync(join(kdir, 'x.module.css'), `.x { color: var(${colorVar}); margin: 0; }\n`);   // clean again, still uncommitted
    r = await hook();
    assert.equal(r.status, 0, `Stop hook passes once the hex is replaced by a clean change in the non-ASCII folder\n${r.out.slice(-1000)}`);
    const afterK = stamp();
    assert.ok(afterK?.ok === true && afterK.fingerprint !== beforeK?.fingerprint, 'the gates ran on the clean non-ASCII change and passed');
    rmSync(kdir, { recursive: true, force: true });
  } finally {
    S.close();
    rmSync(home, { recursive: true, force: true });
  }
});
