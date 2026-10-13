import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'templates', 'workbench', 'tools', 'tokens-css.mjs');
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

function repo(tokens = TOKENS, withDecisions = true) {
  const dir = mkdtempSync(join(tmpdir(), 'dsfa-tok-'));
  mkdirSync(join(dir, 'extraction'));
  writeFileSync(join(dir, 'extraction', 'tokens.json'), JSON.stringify({ $meta: META, tokens }));
  if (withDecisions) writeFileSync(join(dir, 'extraction', 'decisions.json'), JSON.stringify({
    tokens: Object.keys(tokens).map((id) => ({ id, name: id === 'surface-1' ? 'surface-page' : id })),
    excluded: [{ id: 'toolbar', what: 'Prototype toolbar', why: 'not the product', include: false, tokens: ['proto'] }],
  }));
  return dir;
}
const gen = (dir) => spawnSync(process.execPath, [CLI], { cwd: dir, encoding: 'utf8' });
const rd = (dir, f) => readFileSync(join(dir, f), 'utf8');
const line = (text, needle) => text.split('\n').find((l) => l.includes(needle)) ?? '';
const snapshot = (dir) => { const o = {}; for (const d of ['src/tokens', 'src/foundations']) for (const f of readdirSync(join(dir, d)).sort()) o[`${d}/${f}`] = rd(dir, `${d}/${f}`); return o; };

test('tokens become labelled CSS variables, dark blocks, canvas, index, compact JSON and Foundations stories', () => {
  const dir = repo();
  try {
    const r = gen(dir);
    assert.equal(r.status, 0, r.stderr);
    const color = rd(dir, 'src/tokens/color.css');
    for (const s of ['--color-primary: oklch(0.55 0.2 260);', '--color-muted: var(--color-surface);', '--color-surface: #fff;', '--accent: #0F172A;', '--surface-page: #F7F7F7;']) assert.ok(color.includes(s), s);
    assert.ok(!color.includes('--surface-1'));
    assert.ok(!color.includes('--proto:'));
    assert.match(color, /@media \(prefers-color-scheme: dark\)/);
    assert.ok(color.includes(':root:not([data-theme="light"])'));
    assert.ok(color.includes(':root[data-theme="dark"]'));
    assert.equal(color.split('--color-primary: oklch(0.7 0.15 260);').length - 1, 2);
    assert.ok(rd(dir, 'src/tokens/radius.css').includes('--radius-md: calc(var(--radius) - 2px);'));
    assert.ok(rd(dir, 'src/tokens/radius.css').includes('--radius: 0.625rem;'));
    const type = rd(dir, 'src/tokens/type.css');
    assert.ok(type.includes('--text-sm: 0.875rem;') && type.includes('--font-weight-medium: 500;'));
    assert.ok(rd(dir, 'src/tokens/shadow.css').includes('--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);'));
    assert.match(line(color, '--surface-page'), /\/\* derived · on 40 elements · proposed name surface-1, renamed by the designer \*\//);
    assert.match(line(color, '--color-primary: oklch(0.55'), /\/\* measured · in 9 style rules \*\//);

    const canvas = rd(dir, 'src/tokens/canvas.css');
    for (const s of ['background-color: var(--color-surface);', 'color: rgb(17, 17, 17);', '/* measured, no token holds it */', 'font-size: var(--text-sm);', 'font-family: Inter, sans-serif;', 'line-height: 20px;']) assert.ok(canvas.includes(s), s);

    const index = rd(dir, 'src/tokens/index.css');
    for (const g of ['color', 'radius', 'type', 'shadow', 'canvas']) assert.ok(index.includes(`./${g}.css`), g);
    for (const g of ['space', 'border', 'motion', 'other']) assert.ok(!index.includes(`./${g}.css`), g);

    const j = JSON.parse(rd(dir, 'src/tokens/tokens.json'));
    assert.equal(j.themes.dark, true);
    assert.equal(j.tokens.find((t) => t.name === 'surface-page').renamedFrom, 'surface-1');
    assert.ok(j.dropped.some((d) => d.key === 'proto' && d.reason === 'prototype-only: Prototype toolbar'));
    assert.ok(j.dropped.some((d) => d.key === 'proto-uses' && d.reason === 'refers to a dropped token: proto'));
    assert.match(r.stderr, /proto-uses refers to a dropped token \(--proto\)/);

    const stories = rd(dir, 'src/foundations/Foundations.stories.tsx');
    for (const s of ['Colors', 'Radius', 'Typography', 'Shadows']) assert.match(stories, new RegExp(`export const ${s}\\b`));
    assert.doesNotMatch(stories, /export const Spacing\b/);

    const gens = readdirSync(join(dir, 'src', 'tokens')).filter((f) => f.endsWith('.css'));
    for (const f of gens) assert.equal(rd(dir, `src/tokens/${f}`).split('\n')[0], '/* Generated by tools/tokens-css.mjs — do not edit (npm run check:tokens) */', f);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('running the generator twice yields identical files', () => {
  const dir = repo();
  try {
    assert.equal(gen(dir).status, 0);
    const a = snapshot(dir);
    assert.equal(gen(dir).status, 0);
    assert.deepEqual(snapshot(dir), a);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('without decisions the product names stay; missing or empty tokens.json exits 2', () => {
  const dir = repo(TOKENS, false);
  const empty = repo({}, false);
  try {
    assert.equal(gen(dir).status, 0);
    assert.ok(rd(dir, 'src/tokens/color.css').includes('--surface-1: #F7F7F7;'));
    const r = gen(empty);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /no tokens/);
    rmSync(join(empty, 'extraction', 'tokens.json'));
    assert.equal(gen(empty).status, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); rmSync(empty, { recursive: true, force: true }); }
});

test('renames reach css references, dark aliases join the drop cascade, duplicate names are reported', () => {
  const t = {
    ...TOKENS,
    base: tok('color', '#111111', { cssVar: '--base', role: 'color', css: '#111' }, M('--base')),
    mix: tok('color', '#888888', { cssVar: '--mix', role: 'color', css: 'color-mix(in srgb, var(--base) 50%, white)' }, M('--mix')),
    gone: tok('color', '#222222', { cssVar: '--gone', role: 'color', css: '#222' }, M('--gone')),
    themed: tok('color', '#ffffff', { cssVar: '--themed', role: 'color', css: '#fff' }, M('--themed'), { $modes: { light: '#ffffff', dark: '{gone}' } }),
  };
  const dir = repo(t);
  const d = JSON.parse(rd(dir, 'extraction/decisions.json'));
  d.tokens = d.tokens.map((x) => (x.id === 'base' ? { ...x, name: 'ink' } : x.id === 'accent' ? { ...x, name: 'color-surface' } : x));
  d.excluded[0].tokens = ['proto', 'gone'];
  writeFileSync(join(dir, 'extraction', 'decisions.json'), JSON.stringify(d));
  try {
    const r = gen(dir);
    assert.equal(r.status, 0, r.stderr);
    const color = rd(dir, 'src/tokens/color.css');
    assert.ok(color.includes('--mix: color-mix(in srgb, var(--ink) 50%, white);'));
    assert.ok(!color.includes('var(--base)'));
    const all = Object.values(snapshot(dir)).join('\n');
    assert.ok(!all.includes('var(--gone)') && !all.includes('--themed'));
    const j = JSON.parse(rd(dir, 'src/tokens/tokens.json'));
    assert.ok(j.dropped.some((x) => x.key === 'themed' && x.reason === 'refers to a dropped token: gone'));
    assert.match(r.stderr, /themed refers to a dropped token \(--gone\)/);
    assert.match(r.stderr, /two tokens are both named --color-surface: accent, color-surface/);
    assert.equal(color.split('--color-surface:').length - 1, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a self-referencing variable (next/font pattern) gets its resolved value; a two-token cycle is resolved and reported', () => {
  const fam = '"Inter", system-ui, sans-serif';
  const dir = repo({
    'font-sans': tok('fontFamily', fam, { cssVar: '--font-sans', role: 'fontFamily', css: 'var(--font-sans)' }, M('--font-sans')),
    'cyc-a': tok('color', '#111111', { cssVar: '--cyc-a', role: 'color', css: 'var(--cyc-b)' }, M('--cyc-a')),
    'cyc-b': tok('color', '#222222', { cssVar: '--cyc-b', role: 'color', css: 'var(--cyc-a)' }, M('--cyc-b')),
  }, false);
  try {
    const r = gen(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(rd(dir, 'src/tokens/type.css').includes(`--font-sans: ${fam};`));
    assert.ok(!r.stderr.includes('--font-sans →'), 'a single self-reference is not a problem');
    const color = rd(dir, 'src/tokens/color.css');
    assert.ok(color.includes('--cyc-a: #111111;') && color.includes('--cyc-b: #222222;'));
    assert.match(r.stderr, /cycle in token references: --cyc-a → --cyc-b → --cyc-a \(resolved values used\)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('an alias-only cycle or a self-alias has no concrete value: left out and reported, and so is a token pointing into it', () => {
  const dir = repo({
    a: tok('color', '{b}', { cssVar: '--a', role: 'color', css: 'var(--b)' }, M('--a')),
    b: tok('color', '{a}', { cssVar: '--b', role: 'color', css: 'var(--a)' }, M('--b')),
    c: tok('color', '{a}', { cssVar: '--c', role: 'color', css: 'var(--a)' }, M('--c')),
    e: tok('color', '{e}', { cssVar: '--e', role: 'color', css: 'var(--e)' }, M('--e')),
    ok: tok('color', '#123456', { cssVar: '--ok', role: 'color', css: '#123456' }, M('--ok')),
  }, false);
  try {
    const r = gen(dir);
    assert.equal(r.status, 0, r.stderr);
    const color = rd(dir, 'src/tokens/color.css');
    assert.ok(color.includes('--ok: #123456;'));
    for (const n of ['--a:', '--b:', '--c:', '--e:']) assert.ok(!color.includes(n), n);
    for (const [f, s] of Object.entries(snapshot(dir))) for (const v of ['var(--a)', 'var(--b)', 'var(--e)']) assert.ok(!s.includes(v), `${f} contains ${v}`);
    assert.match(r.stderr, /cycle in token references: --a → --b → --a \(no concrete value\)/);
    assert.match(r.stderr, /cycle in token references: --e → --e \(no concrete value\)/);
    assert.match(r.stderr, /c refers to a token with no concrete value \(--a\): left out too/);
    assert.ok(!r.stderr.includes('resolved values used'));
    const dropped = Object.fromEntries(JSON.parse(rd(dir, 'src/tokens/tokens.json')).dropped.map((d) => [d.key, d.reason]));
    for (const k of ['a', 'b', 'e']) assert.equal(dropped[k], 'cycle in token references with no concrete value');
    assert.equal(dropped.c, 'refers to a token with no concrete value: a');
    const chk = spawnSync(process.execPath, [join(ROOT, 'templates', 'workbench', 'tools', 'check-tokens.mjs')], { cwd: dir, encoding: 'utf8' });
    // gate 7 prints these as notes and passes: they are consequences, not something the designer can fix
    assert.equal(chk.status, 0, chk.stdout + chk.stderr);
    assert.equal(chk.stdout.split('\n').filter((l) => l.startsWith('note: ')).length, 3, chk.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const checkIn = (dir) => spawnSync(process.execPath, [join(ROOT, 'templates', 'workbench', 'tools', 'check-tokens.mjs')], { cwd: dir, encoding: 'utf8' });

test('check-tokens fails on two tokens with one name', () => {
  const dir = repo();
  const d = JSON.parse(rd(dir, 'extraction/decisions.json'));
  d.tokens = d.tokens.map((x) => (x.id === 'accent' ? { ...x, name: 'color-surface' } : x));
  writeFileSync(join(dir, 'extraction', 'decisions.json'), JSON.stringify(d));
  try {
    assert.equal(gen(dir).status, 0);
    const chk = checkIn(dir);
    assert.equal(chk.status, 1, chk.stdout);
    assert.match(chk.stdout, /token: two tokens are both named/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('check-tokens passes on the drop cascade and prints it as a note', () => {
  const dir = repo({
    gone: tok('color', '#222222', { cssVar: '--gone', role: 'color', css: '#222' }, M('--gone')),
    themed: tok('color', '#ffffff', { cssVar: '--themed', role: 'color', css: '#fff' }, M('--themed'), { $modes: { light: '#ffffff', dark: '{gone}' } }),
    ok: tok('color', '#123456', { cssVar: '--ok', role: 'color', css: '#123456' }, M('--ok')),
  }, false);
  writeFileSync(join(dir, 'extraction', 'decisions.json'), JSON.stringify({ excluded: [{ id: 'x', what: 'Prototype toolbar', include: false, tokens: ['gone'] }] }));
  try {
    const r = gen(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /tokens: note: themed refers to a dropped token \(--gone\)/);
    const chk = checkIn(dir);
    assert.equal(chk.status, 0, chk.stdout);
    assert.match(chk.stdout, /note: themed refers to a dropped token/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('web fonts: fonts.css holds the @import and the @font-face, index.css imports it first, an uncovered family is NEEDS-FONT', () => {
  const dir = repo();
  try {
    const doc = JSON.parse(rd(dir, 'extraction/tokens.json'));
    doc.$meta.platform.fonts = {
      stylesheets: ['https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap'],
      faces: [{ family: 'Fixture Sans', weight: '400', style: 'normal', unicodeRange: 'U+0000-00FF', src: 'url("https://app.example/f.woff2") format("woff2")' }],
      used: [{ family: 'Inter', weight: '400', style: 'normal' }, { family: 'Figtree', weight: '700', style: 'normal' }, { family: 'Fixture Sans', weight: '400', style: 'normal' }],
    };
    writeFileSync(join(dir, 'extraction', 'tokens.json'), JSON.stringify(doc));
    const r = gen(dir);
    assert.equal(r.status, 0, r.stderr);
    const fonts = rd(dir, 'src/tokens/fonts.css');
    assert.ok(fonts.startsWith('/* Generated by tools/tokens-css.mjs'));
    assert.ok(fonts.includes('@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500&display=swap");'));
    for (const s of ['@font-face {', 'font-family: "Fixture Sans";', 'font-weight: 400;', 'font-style: normal;', 'unicode-range: U+0000-00FF;', 'src: url("https://app.example/f.woff2") format("woff2");', 'font-display: swap;']) assert.ok(fonts.includes(s), s);
    assert.equal(rd(dir, 'src/tokens/index.css').split('\n')[1], "@import './fonts.css';");
    assert.match(r.stderr, /the app uses Figtree 700 but no font source was captured — text widths in parity may differ \(NEEDS-FONT\)/);
    assert.doesNotMatch(r.stderr, /the app uses Inter|the app uses Fixture Sans/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('without recorded fonts there is no fonts.css and index.css does not import it', () => {
  const dir = repo();
  try {
    assert.equal(gen(dir).status, 0);
    assert.ok(!readdirSync(join(dir, 'src/tokens')).includes('fonts.css'));
    assert.ok(!rd(dir, 'src/tokens/index.css').includes('fonts.css'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const decide = (dir, obj) => { mkdirSync(join(dir, 'extraction', 'canon'), { recursive: true }); writeFileSync(join(dir, 'extraction', 'canon', 'decided.tokens.json'), JSON.stringify(obj)); };
const dec = (value, evidence = 'Anna, 2026-10-13: the designer approved it', label = 'decided', type = 'color') => ({ $type: type, $value: value, $provenance: { label, evidence } });

test('a decided token (extraction/canon/decided.tokens.json) is added, labelled decided, and check-tokens passes', () => {
  const dir = repo();
  decide(dir, { 'color-accent-2': dec('#112233'), 'color-accent-alias': dec('{color-accent-2}') });
  try {
    const r = gen(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(line(rd(dir, 'src/tokens/color.css'), '--color-accent-2:'), /--color-accent-2: #112233; \/\* decided/);
    assert.match(line(rd(dir, 'src/tokens/color.css'), '--color-accent-alias:'), /--color-accent-alias: var\(--color-accent-2\); \/\* decided/);
    const t = JSON.parse(rd(dir, 'src/tokens/tokens.json')).tokens.find((x) => x.name === 'color-accent-2');
    assert.equal(t.label, 'decided');
    assert.match(t.evidence, /2026-10-13/);
    const chk = checkIn(dir);
    assert.equal(chk.status, 0, chk.stdout);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a decided token without a date, with another label, or over a measured key is a problem (gate 7 fails)', () => {
  for (const [obj, re] of [
    [{ 'color-new': dec('#112233', 'Anna: because') }, /token: color-new in decided\.tokens\.json needs label decided and dated evidence/],
    [{ 'color-new': dec('#112233', 'Anna, 2026-10-13: x', 'measured') }, /token: color-new in decided\.tokens\.json needs label decided and dated evidence/],
    [{ accent: dec('#abcdef') }, /token: accent in decided\.tokens\.json would replace a value measured in the app — a decision fills a gap, never overwrites a measurement/],
  ]) {
    const dir = repo();
    decide(dir, obj);
    try {
      gen(dir);
      const chk = checkIn(dir);
      assert.equal(chk.status, 1, chk.stdout);
      assert.match(chk.stdout, re);
      assert.doesNotMatch(rd(dir, 'src/tokens/color.css'), /#abcdef|#112233/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('R27.6: a decided value for a derived key REPLACES it and says so; for a measured key it stays a problem', () => {
  const dir = repo();
  decide(dir, { 'surface-1': dec('#abcdef') });
  try {
    const r = gen(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /tokens: note: surface-1 in decided\.tokens\.json replaces the derived value #F7F7F7 with #abcdef/);
    assert.doesNotMatch(r.stderr, /tokens: surface-1/, 'not a problem');
    assert.match(line(rd(dir, 'src/tokens/color.css'), '--surface-page:'), /--surface-page: #abcdef; \/\* decided/);
    assert.doesNotMatch(rd(dir, 'src/tokens/color.css'), /#F7F7F7/i);
    const chk = checkIn(dir);
    assert.equal(chk.status, 0, chk.stdout);
    assert.match(chk.stdout, /note: surface-1 in decided\.tokens\.json replaces/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const m = repo();
  decide(m, { accent: dec('#abcdef') });
  try { gen(m); const chk = checkIn(m); assert.equal(chk.status, 1); assert.match(chk.stdout, /accent in decided\.tokens\.json would replace a value measured/); } finally { rmSync(m, { recursive: true, force: true }); }
});

test('R27.6: an alias to a token that does not exist is a problem and is not written', () => {
  const dir = repo();
  decide(dir, { 'color-ghost-alias': dec('{color-ghost}') });
  try {
    gen(dir);
    const chk = checkIn(dir);
    assert.equal(chk.status, 1, chk.stdout);
    assert.match(chk.stdout, /token: color-ghost-alias in decided\.tokens\.json points at \{color-ghost\}, which is not a token/);
    assert.doesNotMatch(rd(dir, 'src/tokens/color.css'), /color-ghost/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R27.6: decided.tokens.json that is not valid JSON is a problem, with no stack trace', () => {
  const dir = repo();
  mkdirSync(join(dir, 'extraction', 'canon'), { recursive: true });
  writeFileSync(join(dir, 'extraction', 'canon', 'decided.tokens.json'), '{ "a": ');
  try {
    const r = gen(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /tokens: extraction\/canon\/decided\.tokens\.json is not valid JSON: /);
    assert.ok(!/\n\s+at /.test(r.stderr), r.stderr);
    const chk = checkIn(dir);
    assert.equal(chk.status, 1, chk.stdout);
    assert.match(chk.stdout, /token: extraction\/canon\/decided\.tokens\.json is not valid JSON: /);
    assert.ok(!/\n\s+at /.test(chk.stdout + chk.stderr));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R28.5: tokens the designer left out as prototype-only are noted directly, not only their cascade (flow.md promises note: lines)', () => {
  const dir = repo();
  try {
    const r = gen(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /tokens: note: 1 token\(s\) left out as prototype-only \(the designer's decision\): --proto\n/);
    const chk = checkIn(dir);
    assert.match(chk.stdout, /^note: 1 token\(s\) left out as prototype-only \(the designer's decision\): --proto$/m);
    const d = JSON.parse(rd(dir, 'extraction/decisions.json'));
    d.excluded[0].tokens = ['proto', 'nosuch'];
    d.tokens = d.tokens.map((x) => (x.id === 'proto' ? { ...x, name: 'bar-bg' } : x));
    writeFileSync(join(dir, 'extraction', 'decisions.json'), JSON.stringify(d));
    assert.match(gen(dir).stderr, /note: 1 token\(s\) left out as prototype-only \(the designer's decision\): --bar-bg\n/, 'the current name; a key no token has is not counted');
    d.excluded[0].tokens = []; writeFileSync(join(dir, 'extraction', 'decisions.json'), JSON.stringify(d));
    assert.doesNotMatch(gen(dir).stderr, /left out as prototype-only/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R28.6: canvas.css uses a token when exactly one token of that role holds the value; two holders or none keep the raw value', () => {
  const extra = {
    'lh-20': tok('dimension', 20, { cssVar: '--lh-20', role: 'lineHeight', css: '20px' }, M('--lh-20')),
    'fw-400': tok('fontWeight', 400, { cssVar: '--fw-400', role: 'fontWeight', css: '400' }, M('--fw-400')),
    ink: tok('color', '#111111', { cssVar: '--ink', role: 'color', css: '#111' }, M('--ink')),
    'font-body': tok('fontFamily', 'Inter, sans-serif', { cssVar: '--font-body', role: 'fontFamily', css: 'Inter, sans-serif' }, M('--font-body')),
    'space-20': tok('dimension', 20, { cssVar: '--space-20', role: 'spacing', css: '20px' }, M('--space-20')),
  };
  const dir = repo({ ...TOKENS, ...extra });
  try {
    assert.equal(gen(dir).status, 0);
    const canvas = rd(dir, 'src/tokens/canvas.css');
    for (const s of ['color: var(--ink);', 'font-family: var(--font-body);', 'line-height: var(--lh-20);', 'font-weight: var(--fw-400);', 'font-size: var(--text-sm);']) assert.ok(canvas.includes(s), `${s}\n${canvas}`);
    assert.ok(!canvas.includes('no token holds it'), canvas);
    assert.equal(checkIn(dir).status, 0);
    // two tokens of the role hold the value: ambiguous, so the raw value stays; a token of another role never matches
    const t = { ...TOKENS, ...extra, 'lh-20-b': tok('dimension', 20, { cssVar: '--lh-20-b', role: 'lineHeight', css: '20px' }, M('--lh-20-b')) };
    writeFileSync(join(dir, 'extraction', 'tokens.json'), JSON.stringify({ $meta: META, tokens: t }));
    assert.equal(gen(dir).status, 0);
    const again = rd(dir, 'src/tokens/canvas.css');
    assert.ok(again.includes('line-height: 20px; /* two or more tokens hold it — choose one: --lh-20, --lh-20-b */'), again);
    assert.ok(!/line-height[^\n]*no token holds it/.test(again), 'ambiguous is not "none"');
    assert.ok(again.includes('color: var(--ink);'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('R28.8: a decided token that is neither a colour nor a shadow needs a role — without it gate 7 fails; with it the token lands in its group', () => {
  const bare = { $type: 'dimension', $value: 18, $provenance: { label: 'decided', evidence: 'Anna, 2026-10-13: the heading size' } };
  const dir = repo();
  decide(dir, { 'text-18': bare });
  try {
    const r = gen(dir);
    assert.match(r.stderr, /tokens: text-18 in decided\.tokens\.json needs a role \(where the value is used: spacing, fontSize, …\)/);
    const chk = checkIn(dir);
    assert.equal(chk.status, 1, chk.stdout);
    assert.match(chk.stdout, /token: text-18 in decided\.tokens\.json needs a role/);
    assert.ok(!Object.values(snapshot(dir)).join('\n').includes('--text-18'), 'never filed under spacing by default');
    decide(dir, { 'text-18': { ...bare, role: 'fontSize' } });
    assert.equal(gen(dir).stderr.includes('needs a role'), false);
    assert.match(rd(dir, 'src/tokens/type.css'), /--text-18: 18px; \/\* decided/);
    assert.equal(checkIn(dir).status, 0);
    decide(dir, { 'color-new': dec('#112233') });
    assert.equal(gen(dir).stderr.includes('needs a role'), false, 'a colour needs none');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- Foundations that read like a design system's: colours by what they paint, text styles from the captures, Overview, no noise

const col = (name, props, value = '#123456') => tok('color', value, { cssVar: `--${name}`, role: 'color', css: value, usage: { rules: 9, props } }, M(`--${name}`));
const rowOf = (dir, name) => JSON.parse(rd(dir, 'src/tokens/tokens.json')).tokens.find((t) => t.name === name);

test('Foundations: a colour goes to the group of what it paints most, the rest listed as "also"', () => {
  const dir = repo({
    'bg-main': col('bg-main', { background: 16, 'border-color': 4, color: 1 }, '#ffffff'),
    ink: col('ink', { color: 40, 'text-decoration-color': 2, 'box-shadow': 3 }, '#111111'),
    line: col('line', { border: 30, 'border-bottom': 20, background: 4 }, '#dddddd'),
    mark: col('mark', { fill: 6, stroke: 2 }, '#ff0000'),
    idle: col('idle', undefined, '#00ff00'),
    lit: tok('color', '#B795F7', { cssVar: '--lit', role: 'color', css: '#B795F7' }, { label: 'derived', evidence: 'a literal the product paints OUTSIDE its own token set: color #B795F7 on 12 element(s) across 2 screen(s) (as hover background, border); nearest product token ink', counters: { nodes: 12 } }),
  }, false);
  try {
    assert.equal(gen(dir).status, 0);
    assert.equal(rowOf(dir, 'bg-main').paint, 'background');
    assert.deepEqual(rowOf(dir, 'bg-main').also, ['border ×4', 'text ×1']);
    assert.equal(rowOf(dir, 'ink').paint, 'text');
    assert.ok(rowOf(dir, 'ink').also.includes('box-shadow ×3'));
    assert.equal(rowOf(dir, 'line').paint, 'border');
    assert.deepEqual(rowOf(dir, 'line').also, ['background ×4']);
    assert.equal(rowOf(dir, 'mark').paint, 'icon');
    assert.equal(rowOf(dir, 'idle').paint, 'other');
    assert.equal(rowOf(dir, 'lit').paint, 'background', 'a derived colour with no counts: first role named in its evidence');
    assert.equal(checkIn(dir).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

const el = (text, v, path = 'div#root>main>h1') => ({ path, tag: 'span', text, interactive: false, values: { fontFamily: 'Inter, sans-serif', fontSize: '14px', fontWeight: '400', lineHeight: '20px', letterSpacing: 'normal', ...v } });
const capture = (dir, name, elements, scheme = 'light') => {
  mkdirSync(join(dir, 'extraction', 'baseline'), { recursive: true });
  writeFileSync(join(dir, 'extraction', 'baseline', `${name}--1440x900--${scheme}.json`), JSON.stringify({ meta: { screen: name, colorScheme: scheme }, elements }));
};
const typeTokens = {
  'text-sm': tok('dimension', 14, { cssVar: '--text-sm', role: 'fontSize', css: '14px' }, M('--text-sm')),
  'text-xl': tok('dimension', 24, { cssVar: '--text-xl', role: 'fontSize', css: '24px' }, M('--text-xl')),
  'text-sm--lh': tok('dimension', 20, { cssVar: '--text-sm--lh', role: 'lineHeight', css: '20px' }, M('--text-sm--lh')),
  'fw-medium': tok('fontWeight', 500, { cssVar: '--fw-medium', role: 'fontWeight', css: '500' }, M('--fw-medium')),
  'fw-normal': tok('fontWeight', 400, { cssVar: '--fw-normal', role: 'fontWeight', css: '400' }, M('--fw-normal')),
  'font-body': tok('fontFamily', 'Inter, sans-serif', { cssVar: '--font-body', role: 'fontFamily', css: 'Inter, sans-serif' }, M('--font-body')),
};

test('Foundations: text styles from the light captures — one style per combination, uses counted, an interface text as the example, tokens mapped, "no token" marked', () => {
  const dir = repo(typeTokens, false);
  capture(dir, 'home', [
    el('42 rows', {}, 'div#root>main>table>tbody>tr>td'),         // data: counted, never the example
    el('Save changes', {}),
    el('Cancel', {}),
    el('Overview', { fontSize: '24px', fontWeight: '500', lineHeight: '33.6px' }),
    el('', {}),                                                   // no own text: not a text style
  ]);
  capture(dir, 'home', [el('Dark only', { fontSize: '99px' })], 'dark');
  try {
    assert.equal(gen(dir).status, 0);
    const s = JSON.parse(rd(dir, 'src/tokens/tokens.json')).textStyles;
    assert.equal(s.length, 2, JSON.stringify(s));
    const [body, head] = s;                                        // sorted by size, then weight
    assert.deepEqual([body.size, body.weight, body.lineHeight, body.uses], [14, 400, 20, 3]);
    assert.equal(body.example, 'Save changes');
    assert.deepEqual(body.tokens, { fontFamily: '--font-body', fontSize: '--text-sm', fontWeight: '--fw-normal', lineHeight: '--text-sm--lh' });
    assert.equal(body.letterSpacing, 'normal');
    assert.deepEqual([head.size, head.weight, head.uses, head.example], [24, 500, 1, 'Overview']);
    assert.equal(head.tokens.fontSize, '--text-xl');
    assert.equal(head.tokens.lineHeight, null, '33.6px: no token holds it');
    assert.ok(!s.some((x) => x.size === 99), 'dark captures are not read');
    assert.equal(checkIn(dir).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Foundations: without captures there are no text styles; the flow\'s screens give the example first', () => {
  const none = repo(typeTokens, false);
  const two = repo(typeTokens, false);
  capture(two, 'aaa-other', [el('Other screen', {})]);
  capture(two, 'zzz-flow', [el('Flow screen', {})]);
  mkdirSync(join(two, 'extraction', 'flows'), { recursive: true });
  writeFileSync(join(two, 'extraction', 'flows', 'flows.json'), JSON.stringify({ screens: [{ name: 'zzz-flow' }] }));
  try {
    assert.equal(gen(none).status, 0);
    assert.deepEqual(JSON.parse(rd(none, 'src/tokens/tokens.json')).textStyles, []);
    assert.equal(gen(two).status, 0);
    const s = JSON.parse(rd(two, 'src/tokens/tokens.json')).textStyles;
    assert.equal(s[0].example, 'Flow screen');
    assert.equal(s[0].uses, 2);
  } finally { rmSync(none, { recursive: true, force: true }); rmSync(two, { recursive: true, force: true }); }
});

test('Foundations: Overview carries the product and date; stories have no args and no controls; existing tokens.json fields stay', () => {
  const dir = repo();
  writeFileSync(join(dir, 'extraction', 'capture-manifest.json'), JSON.stringify({ product: 'Fixture', createdAt: '2026-10-13' }));
  try {
    assert.equal(gen(dir).status, 0);
    const mdx = rd(dir, 'src/foundations/Overview.mdx');
    assert.match(mdx, /<Meta title="Foundations\/Overview" \/>/);
    assert.match(mdx, /Fixture/);
    assert.match(mdx, /2026-10-13/);
    for (const w of ['measured', 'derived', 'decided', 'npm run tokens', 'Foundations', 'Components', 'Screens']) assert.ok(mdx.includes(w), w);
    const stories = rd(dir, 'src/foundations/Foundations.stories.tsx');
    assert.match(stories, /controls: \{ disable: true \}, actions: \{ disable: true \}/);
    assert.doesNotMatch(stories, /args:/);
    assert.doesNotMatch(stories, /group:/);
    const j = JSON.parse(rd(dir, 'src/tokens/tokens.json'));
    for (const f of ['key', 'name', 'cssVar', 'group', 'role', 'value', 'label', 'evidence']) assert.ok(f in j.tokens[0], f);
    assert.ok(j.themes && j.product && Array.isArray(j.dropped));
    assert.equal(checkIn(dir).status, 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a token name with a dot is reported, not written (the browser drops `--text-12.5px: …` and every var() of it)', () => {
  const t = { ...TOKENS, 'text-12.5px': tok('dimension', 12.5, { cssVar: '--text-12.5px', role: 'fontSize', css: '12.5px' }, M('--text-12.5px')) };
  const dir = repo(t);
  try {
    const r = gen(dir);
    assert.match(r.stderr, /--text-12\.5px is not a valid CSS custom property name/);
    assert.ok(!Object.values(snapshot(dir)).join('\n').includes('--text-12.5px:'), 'the invalid name is not written');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
