#!/usr/bin/env node
// Gate 2, the part neither stylelint nor check-inline can see: a var(--name) that names nothing.
// Every var(--name) in src/**/*.css and src/**/*.{ts,tsx} must name one of:
//   - a token of src/tokens/tokens.json (its cssVar);
//   - a custom property declared in the same file (`--name:` in CSS, or `'--name':` / setProperty in TSX) — and only
//     when its value is built from tokens: var(--token), and calc() / min() / max() / clamp() over tokens and unitless
//     numbers. `--pad: 13px` or `'--tone': 'red'` is a raw value wearing a name: it fails.
// src/tokens and src/foundations are skipped (they are the token layer). Exit 1 on findings, 0 when clean.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const tokFile = join(SRC, 'tokens', 'tokens.json');
if (!existsSync(tokFile)) { console.error('src/tokens/tokens.json is missing — run npm run tokens'); process.exit(2); }
let rows;
try { rows = JSON.parse(readFileSync(tokFile, 'utf8')).tokens ?? []; } catch (e) { console.error(`src/tokens/tokens.json is not valid: ${e.message}`); process.exit(2); }
const tokens = new Set(rows.map((t) => t.cssVar));

const files = [];
(function walk(d) {
  let entries = [];
  try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(d, e.name);
    if (e.isDirectory()) { if (!/^(foundations|tokens)$/.test(e.name) || d !== SRC) walk(p); continue; }
    if (/\.(css|ts|tsx)$/.test(e.name) && !/\.d\.ts$/.test(e.name)) files.push(p);
  }
})(SRC);

const blank = (s) => s.replace(/[^\n]/g, ' ');
const stripComments = (text, css) => text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(css ? /(?!)/ : /^[ \t]*\/\/.*$/gm, blank);
const DECLARED = /(--[\w-]+)['"]?\s*:|@property\s+(--[\w-]+)|setProperty\(\s*['"](--[\w-]+)['"]/g;
const DECL_CSS = /(--[\w-]+)\s*:\s*([^;}`]*)/g;
const DECL_TS = /['"](--[\w-]+)['"]\s*:\s*(?:'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`|(-?[\d.]+))/g;
const DECL_SET = /setProperty\(\s*['"](--[\w-]+)['"]\s*,\s*(?:'([^'\n]*)'|"([^"\n]*)"|`([^`\n]*)`)/g;
// A value is built from tokens when, once every var(--x) and every calc/min/max/clamp over numbers is folded away,
// nothing but numbers and operators is left — and at least one var() was there (or the value is a plain 0).
function builtFromTokens(v) {
  v = v.trim().replace(/\s*!important$/, '');
  if (v === '0') return true;
  if (!/var\(/.test(v)) return false;
  let prev;
  do {
    prev = v;
    v = v.replace(/var\(\s*--[\w-]+\s*(?:,\s*[\d.\s+*/-]*)?\)/g, '0')
      .replace(/(?:calc|min|max|clamp)?\(([\d.\s+*/,-]*)\)/g, '0');
  } while (v !== prev);
  return /^[\d.\s+*/-]*$/.test(v);
}
const USED = /var\(\s*(--[\w-]+)/g;

const findings = [];
for (const f of files) {
  const text = stripComments(readFileSync(f, 'utf8'), f.endsWith('.css'));
  const own = new Set([...text.matchAll(DECLARED)].map((m) => m[1] ?? m[2] ?? m[3]));
  const lineAt = (idx) => text.slice(0, idx).split('\n').length;
  const seenDecl = new Set();
  const judge = (name, value, idx) => {
    if (value === undefined || builtFromTokens(value)) return;
    const key = `${name}@${lineAt(idx)}`;
    if (seenDecl.has(key)) return;
    seenDecl.add(key);
    findings.push(`${relative(ROOT, f)}:${lineAt(idx)}: ${name} is set to a raw value (${value.trim()}) — use a token`);
  };
  for (const m of text.matchAll(DECL_CSS)) judge(m[1], m[2], m.index);
  if (!f.endsWith('.css')) {
    for (const m of text.matchAll(DECL_TS)) judge(m[1], m[2] ?? m[3] ?? m[4] ?? m[5], m.index);
    for (const m of text.matchAll(DECL_SET)) judge(m[1], m[2] ?? m[3] ?? m[4], m.index);
  }
  text.split('\n').forEach((line, i) => {
    for (const m of line.matchAll(USED)) if (!tokens.has(m[1]) && !own.has(m[1])) findings.push(`${relative(ROOT, f)}:${i + 1}: var(${m[1]}) is not a token — add it through the designer (NEEDS-TOKEN) or use one that exists`);
  });
}
for (const x of findings) console.log(x);
console.log(findings.length ? `check-vars: ${findings.length} undefined var(). FAIL.` : `check-vars: ${files.length} file(s), every var() names a token or a custom property of its file.`);
process.exit(findings.length ? 1 : 0);
