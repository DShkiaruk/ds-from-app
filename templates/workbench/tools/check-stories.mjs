#!/usr/bin/env node
// Gate 5, first half: every component file and every built screen has a story (Storybook is where the work is reviewed).
// A PascalCase <Name>.tsx needs <Name>.stories.tsx|ts next to it; an index.tsx needs any *.stories.ts(x) in its folder.
// Second half: a story's title starts where its file lives (Storybook's tree is the review surface): src/components → Components/,
// src/screens/<screen> → Screens/<screen> (a screen-local component: Screens/<screen>/<Component>), src/foundations → Foundations/.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const REF = '(see .claude/skills/build-page/SKILL.md)';
const missing = [];
const realRoot = realpathSync(ROOT);
const slug = (() => { try { return JSON.parse(readFileSync(join(ROOT, 'extraction', 'capture-manifest.json'), 'utf8')).slug || '<slug>'; } catch { return '<slug>'; } })();
if (/[^\x00-\x7f]/.test(realRoot)) missing.push(`the folder path must be ASCII (Storybook's test runner skips stories under non-ASCII paths): ${realRoot} — move the repository to e.g. ~/${slug}-workbench`);
const rel = (p) => relative(ROOT, p).split('\\').join('/');
function expectedPrefix(file) {
  const parts = rel(file).split('/'); // src/<area>/...
  if (parts[1] === 'components') return 'Components/';
  if (parts[1] === 'foundations') return 'Foundations/';
  if (parts[1] === 'screens') return parts.length > 3 ? `Screens/${parts[2]}` : 'Screens/';
  return null;
}
function checkTitle(file) {
  const want = expectedPrefix(file);
  if (!want) return;
  const m = /\btitle\s*:\s*(['"`])(.*?)\1/s.exec(readFileSync(file, 'utf8'));
  if (!m) { missing.push(`${rel(file)}: no title — set title: '${want}${want.endsWith('/') ? '<Name>' : '/<Component>'}' ${REF}`); return; }
  const t = m[2];
  const ok = want.endsWith('/') ? t.startsWith(want) : (t === want || t.startsWith(`${want}/`));
  if (!ok) missing.push(`${rel(file)}: title '${t}' must start with '${want}' ${REF}`);
}
function walk(d, titlesOnly = false) {
  if (!existsSync(d)) return;
  const entries = readdirSync(d, { withFileTypes: true });
  const names = entries.filter((e) => e.isFile()).map((e) => e.name);
  for (const e of entries) {
    if (e.isDirectory()) { walk(join(d, e.name), titlesOnly); continue; }
    const n = e.name;
    if (/\.stories\.tsx?$/.test(n)) checkTitle(join(d, n));
    if (titlesOnly || !/\.tsx$/.test(n) || /\.(stories|test)\.tsx$/.test(n) || /\.d\.tsx$/.test(n)) continue;
    const base = n.slice(0, -4);
    const dir = rel(d);
    if (/[^\x00-\x7f]/.test(`${dir}/${n}`)) { missing.push(`${dir}/${n}: use ASCII folder and file names (Storybook's test runner skips stories in non-ASCII paths); keep the captured screen name as the key in src/screens/index.ts`); continue; }
    if (base === 'index') {
      if (!names.some((f) => /\.stories\.tsx?$/.test(f))) missing.push(`${dir}/index.tsx: no story in the folder — add ${dir}/<Name>.stories.tsx ${REF}`);
    } else if (/^\p{Lu}/u.test(base) && !names.includes(`${base}.stories.tsx`) && !names.includes(`${base}.stories.ts`)) {
      missing.push(`${dir}/${n}: ${base} has no story — add ${dir}/${base}.stories.tsx ${REF}`);
    }
  }
}
walk(join(ROOT, 'src', 'components'));
walk(join(ROOT, 'src', 'screens'));
walk(join(ROOT, 'src', 'foundations'), true); // generated pages and review helpers: their titles only
for (const m of missing) console.log(m);
console.log(missing.length ? `check-stories: ${missing.length} problem(s). FAIL.` : 'check-stories: every component and screen has a story.');
process.exit(missing.length ? 1 : 0);
