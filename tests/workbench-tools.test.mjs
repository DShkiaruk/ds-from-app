import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, mkdirSync, copyFileSync, readFileSync, writeFileSync, appendFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = join(ROOT, 'templates', 'workbench', 'tools');
const EXT = 'co.eleken.ds';
const tok = (type, value, ext, prov = { label: 'measured', evidence: 'fixture' }, more = {}) => ({ $type: type, $value: value, $provenance: prov, $extensions: { [EXT]: ext }, ...more });
const M = (authoredName, extra = {}) => ({ label: 'measured', evidence: 'fixture', authoredName, ...extra });

const TOKENS = {
  'color-primary': tok('color', 'oklch(0.55 0.2 260)', { cssVar: '--color-primary', role: 'color', css: 'oklch(0.55 0.2 260)', cssForm: 'color', usage: { rules: 9 } }, M('--color-primary'), { $modes: { light: 'oklch(0.55 0.2 260)', dark: 'oklch(0.7 0.15 260)' } }),
  'color-muted': tok('color', '{color-surface}', { cssVar: '--color-muted', role: 'color', css: 'var(--color-surface)' }),
  'color-surface': tok('color', '#FFFFFF', { cssVar: '--color-surface', role: 'color', css: '#fff' }),
  accent: tok('color', '#0F172A', { cssVar: '--accent', role: 'color', css: '222.2 47.4% 11.2%', cssForm: 'hsl-channels' }, M('--accent')),
  'surface-1': tok('color', '#F7F7F7', { cssVar: '--surface-1', role: 'color', css: '#F7F7F7' }, { label: 'derived', evidence: 'fixture', counters: { nodes: 40 } }),
  'radius-md': tok('dimension', 8, { cssVar: '--radius-md', role: 'radius', css: 'calc(var(--radius) - 2px)' }, M('--radius-md')),
  radius: tok('dimension', 10, { cssVar: '--radius', role: 'radius', css: '0.625rem' }, M('--radius')),
  'text-sm': tok('dimension', 14, { cssVar: '--text-sm', role: 'fontSize', css: '0.875rem' }, M('--text-sm')),
  'font-weight-medium': tok('fontWeight', 500, { cssVar: '--font-weight-medium', role: 'fontWeight', css: '500' }, M('--font-weight-medium')),
  'shadow-sm': tok('shadow', '0 1px 2px rgba(0, 0, 0, 0.05)', { cssVar: '--shadow-sm', role: 'shadow', css: '0 1px 2px rgba(0, 0, 0, 0.05)' }, M('--shadow-sm')),
  proto: tok('color', '#1C1C1C', { cssVar: '--proto', role: 'color', css: '#1C1C1C' }, M('--proto')),
  'proto-uses': tok('color', '{proto}', { cssVar: '--proto-uses', role: 'color', css: 'var(--proto)' }),
};
const META = { product: 'Fixture', platform: { canvas: { background: { value: 'rgb(255, 255, 255)', token: 'color-surface' }, color: { value: 'rgb(17, 17, 17)', token: null }, fontFamily: { value: 'Inter, sans-serif', token: null }, fontSize: { value: '14px', token: 'text-sm' }, lineHeight: { value: '20px' }, fontWeight: { value: '400' } } } };


function tmpRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'dsfa-gate-'));
  mkdirSync(join(dir, 'tools', 'lib'), { recursive: true });
  copyFileSync(join(TOOLS, 'lib', 'color.mjs'), join(dir, 'tools', 'lib', 'color.mjs')); // tokens-css reads colours through it (R28.6)
  for (const f of ['check-inline.mjs', 'check-stories.mjs', 'check-tokens.mjs', 'tokens-css.mjs']) copyFileSync(join(TOOLS, f), join(dir, 'tools', f));
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  return dir;
}
const put = (dir, rel, text) => { mkdirSync(dirname(join(dir, rel)), { recursive: true }); writeFileSync(join(dir, rel), text); };
const run = (dir, tool) => spawnSync(process.execPath, [join(dir, 'tools', tool)], { cwd: dir, encoding: 'utf8' });
const withRepo = (fn) => { const dir = tmpRepo(); try { fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); } };

const inline = (dir, file, code) => { put(dir, file, code); return run(dir, 'check-inline.mjs'); };
const A = 'src/components/A/A.tsx';
const lines = (r) => r.stdout.split('\n').filter((l) => /^src\//.test(l));

test('check-inline: raw values the regex version missed now fail', () => withRepo((dir) => {
  const bad = [
    ['css`\n  color: #ff0000;\n  padding: 8px;\n`;\n', 2],
    ['const s = { padding: 8 };\n', 1],
    ["const base: React.CSSProperties = { padding: '8px' };\n", 1],
    ["export const A = () => <Box sx={{ padding: '8px' }} />;\n", 1],
    ["const s = { margin: 'var(--a) 8px' };\n", 1],
    ['export const A = () => <div style={{\n  padding: 8\n}} />;\n', 1],
    ["const s = { width: 20, padding: '50vw' };\n", 1],
    ["const s = { color: '#FFF' };\n", 1],
    ['const s = { color: `#ff00aa` };\n', 1],
    ["export const A = () => <path fill=\"#ff00aa\" />;\n", 1],
    ["const c = 'rgb(0,0,0)'; const s = { fontSize: 14 };\n", 1],
  ];
  for (const [code, n] of bad) {
    const r = inline(dir, A, code);
    assert.equal(r.status, 1, code + r.stdout);
    assert.equal(lines(r).length, n, code + r.stdout);
    assert.match(r.stdout, /use a token \(var\(--…\)\)/);
  }
  const r = inline(dir, A, 'css`\n  color: #ff0000;\n  padding: 8px;\n`;\n');
  assert.ok(r.stdout.includes('A.tsx:2') && r.stdout.includes('A.tsx:3'), r.stdout);
}));

test('check-inline: tokens, unchecked properties and ordinary strings pass', () => withRepo((dir) => {
  const ok = [
    "export const A = () => <div style={{ padding: 'var(--space-3)' }} />;\n",
    'export const A = () => <div style={{ flex: 1, zIndex: 1, opacity: 0.5, order: 2 }} />;\n',
    "const a = ['/docs#abc', '#add', 'Issue #123456', 'a lab(x)'];\n",
    "export const A = () => <Foo style={{ color: 'var(--c)' }} onClick={() => { const o = { count: 5 }; }} />;\n",
    "const s = { padding: 'var(--x, 8px)', margin: '0 auto', borderRadius: '50%', color: 'currentColor', gap: 0 };\n",
    "const s = { width: 20, height: '10px', top: 4 };\n",
  ];
  for (const code of ok) { const r = inline(dir, A, code); assert.equal(r.status, 0, code + r.stdout); }
  for (const f of ['src/components/A/x.test.tsx', 'src/components/A/x.d.ts', 'src/components/A/A.stories.tsx', 'src/components/A/x.spec.ts', 'src/foundations/X.tsx', 'src/tokens/X.ts']) {
    put(dir, f, "const c = { color: '#ff00aa' };\n");
  }
  put(dir, A, 'export const A = () => null;\n');
  assert.equal(run(dir, 'check-inline.mjs').status, 0);
}));

test('check-inline (I1): custom properties and `font` are value-checked; a colour in ANY style string fails', () => withRepo((dir) => {
  const bad = [
    ["export const A = () => <div style={{ '--pad': '13px' } as React.CSSProperties} />;\n", 1],
    ["export const A = () => <div style={{ '--tone': 'red' } as React.CSSProperties} />;\n", 1],
    ["const s = { font: '13px/20px Inter' };\n", 1],
    ["export const A = () => <div style={{ border: '1px solid #ff00aa' }} />;\n", 1],
    ["export const A = () => <div style={{ outline: '2px solid rgb(255 0 0)' }} />;\n", 1],
    ["const s = { color: 'var(--c)', boxShadow: '0 0 0 1px oklch(0.5 0.1 20)' };\n", 1],
  ];
  for (const [code, n] of bad) {
    const r = inline(dir, A, code);
    assert.equal(r.status, 1, code + r.stdout);
    assert.equal(lines(r).length, n, code + r.stdout);
  }
  const ok = [
    "export const A = () => <div style={{ '--gap': 'var(--space-3)', '--w': 'calc(var(--space-3) * 2)', font: 'var(--w) var(--s)/var(--lh) var(--f)', border: '1px solid var(--c)' } as React.CSSProperties} />;\n",
    "const o = { count: 5, label: '#abcdef' };\n",
  ];
  for (const code of ok) { const r = inline(dir, A, code); assert.equal(r.status, 0, code + r.stdout); }
}));

test('check-inline: ds-allow must be a real comment; nested tokens folder is scanned', () => withRepo((dir) => {
  assert.equal(inline(dir, A, "const s = { padding: 8 }; // ds-allow: matches the app's 8px nudge\n").status, 0);
  assert.equal(inline(dir, A, "const s = { padding: 8, note: '// ds-allow: because' };\n").status, 1);
  assert.equal(inline(dir, A, "const s = { padding: 8 }; // ds-allow:\n").status, 1);
  put(dir, A, 'export const A = () => null;\n');
  const r = inline(dir, 'src/components/B/tokens/Swatch.tsx', "const c = { color: '#ff00aa' };\n");
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stdout.includes('src/components/B/tokens/Swatch.tsx:1'), r.stdout);
}));

test('check-inline: without typescript installed it exits 2 with a hint', () => withRepo((dir) => {
  rmSync(join(dir, 'node_modules'));
  const r = run(dir, 'check-inline.mjs');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /run npm install/);
}));

test('check-stories: every component file and screen at any depth needs a story', () => withRepo((dir) => {
  const st = (rel) => put(dir, rel, 'export default {};\n');
  const c = (rel) => put(dir, rel, 'export const X = () => null;\n');
  c('src/components/forms/Input/Input.tsx');
  let r = run(dir, 'check-stories.mjs');
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('src/components/forms/Input/Input.tsx') && r.stdout.includes('Input.stories.tsx'), r.stdout);
  assert.match(r.stdout, /\(see \.claude\/skills\/build-page\/SKILL\.md\)/);
  st('src/components/forms/Input/Input.stories.tsx');
  assert.equal(run(dir, 'check-stories.mjs').status, 0);
  c('src/components/Loose.tsx');
  r = run(dir, 'check-stories.mjs');
  assert.equal(r.status, 1); assert.ok(r.stdout.includes('Loose.tsx'), r.stdout);
  st('src/components/Loose.stories.ts');
  assert.equal(run(dir, 'check-stories.mjs').status, 0);
  c('src/components/helpers/util.tsx'); c('src/components/Loose.test.tsx');
  assert.equal(run(dir, 'check-stories.mjs').status, 0);
  c('src/screens/home/Home.tsx'); c('src/screens/home/Other.tsx'); st('src/screens/home/Home.stories.tsx');
  r = run(dir, 'check-stories.mjs');
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('Other.tsx') && !r.stdout.includes('Home.tsx'), r.stdout);
  st('src/screens/home/Other.stories.tsx');
  assert.equal(run(dir, 'check-stories.mjs').status, 0);
  c('src/components/Card/index.tsx');
  assert.equal(run(dir, 'check-stories.mjs').status, 1);
  st('src/components/Card/Card.stories.tsx');
  assert.equal(run(dir, 'check-stories.mjs').status, 0);
}));

test('check-stories: folder and file names under src/components and src/screens are ASCII', () => withRepo((dir) => {
  const st = (rel) => put(dir, rel, 'export default {};\n');
  const c = (rel) => put(dir, rel, 'export const X = () => null;\n');
  c('src/screens/огляд/Overview.tsx'); st('src/screens/огляд/Overview.stories.tsx');
  let r = run(dir, 'check-stories.mjs');
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stdout.includes("src/screens/огляд/Overview.tsx: use ASCII folder and file names (Storybook's test runner skips stories in non-ASCII paths); keep the captured screen name as the key in src/screens/index.ts"), r.stdout);
  rmSync(join(dir, 'src', 'screens', 'огляд'), { recursive: true });
  c('src/screens/overview/Overview.tsx'); st('src/screens/overview/Overview.stories.tsx');
  r = run(dir, 'check-stories.mjs');
  assert.equal(r.status, 0, r.stdout);
  c('src/components/Ключ/Ключ.tsx'); st('src/components/Ключ/Ключ.stories.tsx');
  r = run(dir, 'check-stories.mjs');
  assert.equal(r.status, 1, r.stdout);
  assert.ok(r.stdout.includes('src/components/Ключ/Ключ.tsx: use ASCII folder and file names'), r.stdout);
}));

test('check-tokens: generated layer passes; hand edits, extra files and unlabelled tokens fail', () => withRepo((dir) => {
  const { 'proto-uses': _drop, ...tokens } = TOKENS;
  const write = (t) => {
    put(dir, 'extraction/tokens.json', JSON.stringify({ $meta: META, tokens: t }));
    put(dir, 'extraction/decisions.json', JSON.stringify({
      tokens: Object.keys(t).map((id) => ({ id, name: id === 'surface-1' ? 'surface-page' : id })),
      excluded: [{ id: 'toolbar', what: 'Prototype toolbar', why: 'not the product', include: false, tokens: ['proto'] }],
    }));
  };
  const gen = () => spawnSync(process.execPath, [join(dir, 'tools', 'tokens-css.mjs')], { cwd: dir, encoding: 'utf8' });
  write(tokens);
  assert.equal(gen().status, 0);
  let r = run(dir, 'check-tokens.mjs');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  appendFileSync(join(dir, 'src/tokens/color.css'), '/* hand */\n');
  r = run(dir, 'check-tokens.mjs');
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('src/tokens/color.css'), r.stdout);
  gen();
  assert.equal(run(dir, 'check-tokens.mjs').status, 0);
  put(dir, 'src/tokens/extra.css', ':root{}\n');
  r = run(dir, 'check-tokens.mjs');
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('src/tokens/extra.css'), r.stdout);
  rmSync(join(dir, 'src/tokens/extra.css'));
  write({ ...tokens, 'color-primary': { ...tokens['color-primary'], $provenance: { label: 'guessed', evidence: 'x' } } });
  gen();
  r = run(dir, 'check-tokens.mjs');
  assert.equal(r.status, 1);
  assert.ok(r.stdout.includes('has no label'), r.stdout);
}));

test('check-tokens: exits 2 when there is nothing to generate from', () => withRepo((dir) => {
  assert.equal(run(dir, 'check-tokens.mjs').status, 2);
}));

test('check-tokens: dotfiles and folders in src/tokens are ignored', () => withRepo((dir) => {
  const { 'proto-uses': _d, ...tokens } = TOKENS;
  put(dir, 'extraction/tokens.json', JSON.stringify({ $meta: META, tokens }));
  assert.equal(spawnSync(process.execPath, [join(dir, 'tools', 'tokens-css.mjs')], { cwd: dir, encoding: 'utf8' }).status, 0);
  put(dir, 'src/tokens/.DS_Store', 'x');
  mkdirSync(join(dir, 'src/tokens/sub'));
  const r = run(dir, 'check-tokens.mjs');
  assert.equal(r.status, 0, r.stdout);
}));

test('tokens-css runs through a symlinked path', () => {
  const base = mkdtempSync(join(tmpdir(), 'dsfa-link-'));
  try {
    const real = join(base, 'real');
    mkdirSync(join(real, 'tools', 'lib'), { recursive: true });
    copyFileSync(join(TOOLS, 'lib', 'color.mjs'), join(real, 'tools', 'lib', 'color.mjs'));
    copyFileSync(join(TOOLS, 'tokens-css.mjs'), join(real, 'tools', 'tokens-css.mjs'));
    put(real, 'extraction/tokens.json', JSON.stringify({ $meta: META, tokens: { 'color-surface': TOKENS['color-surface'] } }));
    symlinkSync(real, join(base, 'link'));
    const r = spawnSync(process.execPath, [join(base, 'link', 'tools', 'tokens-css.mjs')], { cwd: join(base, 'link'), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /files written/);
    assert.ok(readFileSync(join(real, 'src/tokens/color.css'), 'utf8').includes('--color-surface'));
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('check-tokens passes on a self-referencing variable (a product quirk, not a hand edit)', () => withRepo((dir) => {
  const t = { 'font-sans': { $type: 'fontFamily', $value: '"Inter", system-ui, sans-serif', $provenance: { label: 'measured', evidence: 'fixture' }, $extensions: { 'co.eleken.ds': { cssVar: '--font-sans', role: 'fontFamily', css: 'var(--font-sans)' } } } };
  put(dir, 'extraction/tokens.json', JSON.stringify({ $meta: META, tokens: t }));
  assert.equal(spawnSync(process.execPath, [join(dir, 'tools', 'tokens-css.mjs')], { cwd: dir, encoding: 'utf8' }).status, 0);
  const r = run(dir, 'check-tokens.mjs');
  assert.equal(r.status, 0, r.stdout + r.stderr);
}));

test('check-stories: a repository under a non-ASCII full path fails with the reason', () => {
  const home = mkdtempSync(join(tmpdir(), 'dsfa-gate-'));
  const dir = join(home, 'Проєкти', 'x');
  try {
    mkdirSync(join(dir, 'tools'), { recursive: true });
    copyFileSync(join(TOOLS, 'check-stories.mjs'), join(dir, 'tools', 'check-stories.mjs'));
    const r = run(dir, 'check-stories.mjs');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /the folder path must be ASCII \(Storybook's test runner skips stories under non-ASCII paths\)/);
    assert.ok(r.stdout.includes('Проєкти'), r.stdout);
    assert.ok(r.stdout.includes('~/<slug>-workbench'), 'no manifest: the placeholder');
    mkdirSync(join(dir, 'extraction'));
    writeFileSync(join(dir, 'extraction', 'capture-manifest.json'), JSON.stringify({ slug: 'acme-portal' }));
    assert.ok(run(dir, 'check-stories.mjs').stdout.includes('~/acme-portal-workbench'), 'the real slug when the manifest has it');
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('.stylelintrc.json (R27.5): the ignoreValues patterns let tokens through and nothing raw; the message points at Storybook', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'templates', 'workbench', '.stylelintrc.json'), 'utf8'));
  const [, o] = cfg.rules['scale-unlimited/declaration-strict-value'];
  assert.equal(o.ignoreVariables, false, 'a var() is judged by its text, so a raw fallback fails');
  assert.match(o.message, /src\/tokens \(Storybook → Foundations\)/);
  assert.ok(!/DESIGN\.md/.test(o.message));
  const res = o.ignoreValues.filter((v) => v.startsWith('/')).map((v) => new RegExp(v.slice(1, -1)));
  const ok = (v) => o.ignoreValues.includes(v) || res.some((r) => r.test(v));
  for (const v of ['var(--a)', 'var(--a, var(--b))', 'calc(-1 * var(--a))', 'linear-gradient(var(--a), var(--b))', 'linear-gradient(to right, var(--a) 50%, var(--b))', 'url(./x.png)', '0']) assert.ok(ok(v), v);
  for (const v of ['var(--t, 13px)', 'calc(13px + 0px)', 'calc(-1 * 13px)', 'max(8px, 1px)', 'color-mix(in srgb, var(--a) 80%, var(--b))', 'linear-gradient(#fff, var(--b))', 'linear-gradient(var(--a), 13px)', '13px']) assert.ok(!ok(v), v);
});

test('.stylelintrc.json (M1): `font` is a checked property; token-only shorthands pass, a raw one does not', () => {
  const cfg = JSON.parse(readFileSync(join(ROOT, 'templates', 'workbench', '.stylelintrc.json'), 'utf8'));
  const [props, o] = cfg.rules['scale-unlimited/declaration-strict-value'];
  assert.ok(props.includes('font'), 'font is checked');
  const res = o.ignoreValues.filter((v) => v.startsWith('/')).map((v) => new RegExp(v.slice(1, -1)));
  const ok = (v) => o.ignoreValues.includes(v) || res.some((r) => r.test(v));
  // the plugin expands `font` and judges each space-separated part: the size/line-height part is one word, var(--s)/var(--lh)
  const parts = (v) => v.split(/\s+(?![^(]*\))/);
  const okAll = (v) => parts(v).every(ok);
  for (const v of ['var(--w) var(--s)/var(--lh) var(--f)', 'var(--s)/var(--lh) var(--f)']) assert.ok(okAll(v), v);
  for (const v of ['600 13px/20px Inter', 'var(--s)/20px var(--f)', 'var(--s)/var(--lh) Inter', '13px var(--f)', 'var(--s)/var(--lh, 20px) var(--f)']) assert.ok(!okAll(v), v);
});

// check-vars (gate 2): every var(--name) in src/ names a token, a custom property of the same file, or an inline one
const vars = (dir, files) => {
  copyFileSync(join(TOOLS, 'check-vars.mjs'), join(dir, 'tools', 'check-vars.mjs'));
  put(dir, 'src/tokens/tokens.json', JSON.stringify({ tokens: [{ key: 'color-primary', cssVar: '--color-primary', group: 'color' }, { key: 'spacing-4', cssVar: '--spacing-4', group: 'spacing' }] }));
  for (const [f, text] of Object.entries(files)) put(dir, f, text);
  return run(dir, 'check-vars.mjs');
};

test('check-vars: a var(--name) that is no token fails, with file, line and the way out', () => withRepo((dir) => {
  const r = vars(dir, { 'src/components/A/A.module.css': '.x {\n  color: var(--color-primary);\n  padding: var(--spacing-9);\n}\n' });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^src\/components\/A\/A\.module\.css:3: var\(--spacing-9\) is not a token — add it through the designer \(NEEDS-TOKEN\) or use one that exists$/m);
  assert.doesNotMatch(r.stdout, /--color-primary\)/, 'a defined token is not named');
}));

test('check-vars: tokens, a same-file custom property and an inline one pass; a comment is not a use', () => withRepo((dir) => {
  const r = vars(dir, {
    'src/components/A/A.module.css': '/* var(--commented-out) */\n.x { --gap: var(--spacing-4); color: var(--color-primary); margin: var(--gap); }\n',
    'src/components/A/A.tsx': "export const A = () => <div style={{ '--tone': 'var(--color-primary)', color: 'var(--tone)', padding: 'var(--spacing-4)' } as React.CSSProperties}>x</div>;\n",
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
}));

test('check-vars (I1): a same-file custom property holding a raw value fails; a named colour is a raw colour', () => withRepo((dir) => {
  const cases = [
    ['src/components/A/A.module.css', '.x {\n  --pad: 13px;\n  padding: var(--pad);\n}\n', /^src\/components\/A\/A\.module\.css:2: --pad is set to a raw value \(13px\) — use a token$/m],
    ['src/components/A/A.module.css', '.x { --fs: 17.5px; font-size: var(--fs); }\n', /--fs is set to a raw value \(17\.5px\) — use a token/],
    ['src/components/A/A.tsx', "export const A = () => <div style={{ '--gap': '7px', gap: 'var(--gap)' } as React.CSSProperties}>x</div>;\n", /^src\/components\/A\/A\.tsx:1: --gap is set to a raw value \(7px\) — use a token$/m],
    ['src/components/A/A.tsx', "export const A = () => <div style={{ '--tone': 'red', color: 'var(--tone)' } as React.CSSProperties}>x</div>;\n", /--tone is set to a raw value \(red\) — use a token/],
    ['src/components/A/A.tsx', "export const A = () => <div style={{ '--n': 7 } as React.CSSProperties}>x</div>;\n", /--n is set to a raw value \(7\)/],
    ['src/components/A/A.module.css', '.x { --pad: calc(var(--spacing-4) + 3px); }\n', /--pad is set to a raw value \(calc\(var\(--spacing-4\) \+ 3px\)\)/],
  ];
  for (const [f, code, re] of cases) {
    const r = vars(dir, { [f]: code });
    assert.equal(r.status, 1, code + r.stdout);
    assert.match(r.stdout, re, code);
    rmSync(join(dir, f));
  }
  const ok = vars(dir, { 'src/components/A/A.module.css': '.x {\n  --a: var(--spacing-4);\n  --b: calc(var(--spacing-4) * 2);\n  --c: calc(var(--a) * 1.5 + var(--b));\n  --d: min(var(--a), var(--b));\n  --e: clamp(var(--a), var(--b), calc(var(--c) * 2));\n  --f: var(--a) var(--b);\n  --z: 0;\n}\n' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
}));

test('check-vars: a property declared in ANOTHER file does not count; TypeScript is read too', () => withRepo((dir) => {
  const r = vars(dir, {
    'src/components/A/A.module.css': '.x { --only-here: 1px; }\n',
    'src/components/A/A.tsx': "export const A = () => <div style={{ margin: 'var(--only-here)' }}>x</div>;\n",
  });
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^src\/components\/A\/A\.tsx:1: var\(--only-here\) is not a token/m);
}));

test('check-vars: src/tokens and src/foundations are skipped', () => withRepo((dir) => {
  const r = vars(dir, {
    'src/tokens/color.css': ':root { --a: var(--not-declared-here); }\n',
    'src/foundations/Colors.tsx': "export const C = () => <i style={{ color: 'var(--nope)' }} />;\n",
  });
  assert.equal(r.status, 0, r.stdout + r.stderr);
}));

test('check-component: storybook-static missing or older than src/ → says to build it and exits 2', () => withRepo((dir) => {
  mkdirSync(join(dir, 'tools', 'lib'), { recursive: true });
  for (const f of ['browser.mjs', 'color.mjs', 'flow-model.mjs']) copyFileSync(join(TOOLS, 'lib', f), join(dir, 'tools', 'lib', f));
  copyFileSync(join(TOOLS, 'check-component.mjs'), join(dir, 'tools', 'check-component.mjs'));
  const cc = (...a) => spawnSync(process.execPath, [join(dir, 'tools', 'check-component.mjs'), ...a], { cwd: dir, encoding: 'utf8' });
  assert.equal(cc().status, 2, 'no name: usage');
  let r = cc('Button');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /storybook-static is missing — run `npm run build-storybook` first/);
  put(dir, 'storybook-static/index.json', '{"entries":{}}');
  const old = new Date(Date.now() - 60000);
  utimesSync(join(dir, 'storybook-static', 'index.json'), old, old);
  put(dir, 'src/components/Button/Button.tsx', 'export const Button = () => null;\n');
  r = cc('Button');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /older than src\/ — run `npm run build-storybook` first/);
}));

// ---- check-pages: the pages of the production build work ----
const PM = await import(join(TOOLS, 'lib', 'pages-model.mjs'));

test('check-pages model: links resolve to screens, not to the index, a server path or a missing id', () => {
  const B = 'http://127.0.0.1:5000/';
  const c = (h, ids = []) => PM.classifyLink(h, B, ['home', 'a b'], {}, (id) => ids.includes(id));
  assert.equal(c('#/home').kind, 'screen');
  assert.equal(c('#/a%20b').kind, 'screen');
  assert.match(c('#/nowhere').why, /no screen "nowhere"/);
  assert.match(c('#/').why, /index/);
  assert.match(c('#').why, /index/);
  assert.match(c('/orders').why, /path of the server/);
  assert.equal(c('https://example.com/x').kind, 'external');
  assert.equal(c('mailto:a@b.c').kind, 'external');
  assert.equal(c('#sec', ['sec']).kind, 'anchor');
  assert.match(c('#sec').why, /no element/);
  assert.equal(PM.classifyLink('#/orders-list', B, ['orders'], { orders: '#/orders-list' }).kind, 'screen');
  // a flow screen not built yet (mid-flow, check:task) and a page of the app outside the flow are notes, not broken links
  const app = new Map([['billing', 'a flow screen not built yet'], ['scans', 'a page of the app outside the flow']]);
  assert.deepEqual(PM.classifyLink('#/billing', B, ['home'], {}, () => false, app), { kind: 'elsewhere', id: 'billing', why: 'a flow screen not built yet' });
  assert.equal(PM.classifyLink('#/scans', B, ['home'], {}, () => false, app).kind, 'elsewhere');
  assert.equal(PM.classifyLink('#/nowhere', B, ['home'], {}, () => false, app).kind, 'bad', 'a route the app does not have is still broken');
});

test('check-pages model: budgets, basics and which widths fail', () => {
  assert.deepEqual(PM.perfProblems({ cls: 0.1, lcpMs: 2500, imageBytes: 1_000_000 }), []);
  assert.deepEqual(PM.perfProblems({ cls: 0.25, lcpMs: 3100, imageBytes: 1_500_000 }), ['CLS 0.250 > 0.1', 'LCP 3.10 s > 2.5 s', 'images 1.50 MB > 1 MB']);
  assert.deepEqual(PM.seoProblems({ title: 'x', h1Count: 1, lang: 'en' }), []);
  assert.equal(PM.seoProblems({ title: ' ', h1Count: 2, lang: '' }).length, 3);
  const p = PM.widthPlan([1440, 1440, 1024]);
  assert.deepEqual(p.cap, [1024, 1440]);
  assert.deepEqual(p.other, [320, 375, 768, 1920]);
  assert.deepEqual(PM.widthPlan([]).cap, [1440]);
});

test('check-pages (browser): clean screens pass; a console error, a bad link, a missing h1, a 3000 px element fail; other widths are only reported', () => withRepo((dir) => {
  copyFileSync(join(TOOLS, 'check-pages.mjs'), join(dir, 'tools', 'check-pages.mjs'));
  copyFileSync(join(TOOLS, 'lib', 'browser.mjs'), join(dir, 'tools', 'lib', 'browser.mjs'));
  copyFileSync(join(TOOLS, 'lib', 'pages-model.mjs'), join(dir, 'tools', 'lib', 'pages-model.mjs'));
  // a hand-made "build": the Workbench's hash routing without React
  const screensHtml = {
    good: '<h1>Good</h1><a href="#/wide">next</a> <a href="https://example.com">out</a>',
    noisy: '<h1>Noisy</h1><script>console.error("boom")</script>',
    linky: '<h1>Linky</h1><a href="#/nowhere">x</a>',
    wide: '<h1>Wide</h1><div style="width:1000px">x</div>',
    flat: '<p>no heading</p>',
  };
  const page = (w) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>T</title></head><body><div id="r"></div><script>
const S=${JSON.stringify(screensHtml).replace("width:1000px", `width:${w}px`).replace(/</g, "\\u003c")};
function go(){const id=decodeURIComponent(location.hash.replace(/^#\\/?/,''));const r=document.getElementById('r');
 if(S[id]){r.innerHTML='<main>'+S[id]+'</main>';r.querySelectorAll('script').forEach(s=>{const n=document.createElement('script');n.textContent=s.textContent;document.body.appendChild(n);});}
 else r.innerHTML='<main data-workbench-index><h1>Screens</h1><ul>'+Object.keys(S).map(k=>'<li><a href="#/'+encodeURIComponent(k)+'">'+k+'</a></li>').join('')+'</ul></main>';}
addEventListener('hashchange',go);go();</script></body></html>`;
  put(dir, 'dist/index.html', page(1000));
  put(dir, 'extraction/baseline/x.json', JSON.stringify({ meta: { viewport: { width: 1440, height: 900 } } }));
  const check = () => spawnSync(process.execPath, [join(dir, 'tools', 'check-pages.mjs'), 'dist'], { cwd: dir, encoding: 'utf8', timeout: 120000 });
  const r = check();
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /✓ good\n/);
  assert.match(r.stdout, /✗ noisy: console error: boom/);
  assert.match(r.stdout, /✗ linky: link #\/nowhere: no screen "nowhere"/);
  assert.match(r.stdout, /✗ flat: no <h1>/);
  assert.match(r.stdout, /✓ wide\n/);   // 1000 px fits the captured 1440 ...
  assert.match(r.stdout, /note: overflow at 320 px, not captured in the app: its behaviour at 320 px is unknown/);   // ... and is only reported at 320
  assert.match(r.stdout, /external \(not fetched\): https:\/\/example\.com/);
  assert.match(r.stdout, /check:pages: 5 screens, 3 problems/);
  put(dir, 'dist/index.html', page(3000));
  assert.match(check().stdout, /✗ wide: horizontal scroll at 1440 px/);
}));
