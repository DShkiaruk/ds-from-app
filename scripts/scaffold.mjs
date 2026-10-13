#!/usr/bin/env node
// The product's own repository — created FIRST, before any capture, so every capture lands where it is kept and the
// extraction can be reproduced from it.
//
//   node scripts/scaffold.mjs init <dir> --product "<Name>" --url <app-url>
//   node scripts/scaffold.mjs workbench <repo>
//   node scripts/scaffold.mjs update <repo>   (a Workbench made by an older plugin: see update() below)
//
// Creates extraction/ (baseline/, canon/, capture-manifest.json, tokens.json carrying the closure sentence),
// .gitignore (sign-in sessions never enter the repository) and `git init`. Run again on a repository it made, it
// creates only what is missing and overwrites nothing. A folder with other content is refused; one that holds only
// what a new or cloned empty GitHub repository holds (.git, README.md, LICENSE, .gitignore) is accepted.
// `workbench` copies templates/workbench/ into the repository (never overwriting) once the checkpoint has written
// extraction/decisions.json.
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bestCaptures } from './lib/card-capture.mjs';
import { designMd, flowSpecMd, projectMd } from './lib/workbench-docs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
// One sentence in every machine file of the set (spec rule 6). Measured in the method this came from: with it,
// off-system output fell from 18 of 29 runs to 3 of 30 (research/_exp/closure/ in ds-extract-method) — never to zero.
const CLOSURE = 'This set is closed: no other token name exists, and no literal value may be written. When something needed is not here, write NEEDS-TOKEN / NEEDS-COMPONENT / NEEDS-STATE in plan/progress.md naming what was missing — never invent, never approximate, never fall back to a literal. A component the app does not have is built only from these tokens and only after the designer says yes.';
const EMPTY_REPO = new Set(['.git', '.DS_Store', 'README.md', 'LICENSE', '.gitignore']);
const GITIGNORE = ['node_modules/', '.DS_Store', '# sign-in sessions never enter the repository', '*.auth.json', '*.storage.json', 'auth.json', '.env*', '!.env.example', '.session/', '# capture runs that are not the baseline', 'extraction/runs/', 'runs/', ''].join('\n');
const slugOf = (...names) => {
  for (const n of names) { const s = String(n ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); if (s) return s; }
  return 'product';
};

const [cmd, dirArg, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(`--${k}`); const v = i > -1 ? rest[i + 1] : undefined; return v === undefined || v.startsWith('--') ? undefined : v; }; // a flag is not a value
const USAGE = 'usage: node scripts/scaffold.mjs init <dir> --product "<Name>" --url <app-url>\n       node scripts/scaffold.mjs workbench <repo>\n       node scripts/scaffold.mjs update <repo>';
if (!['init', 'workbench', 'update'].includes(cmd) || !dirArg) { console.error(USAGE); process.exit(1); }

// The product's slug for the example folder: from --product, else from the manifest the repository already has, else a placeholder.
function knownSlug(dir) {
  const fromProduct = opt('product') ? slugOf(opt('product')) : null;
  if (fromProduct && fromProduct !== 'product') return fromProduct;
  try { const m = JSON.parse(readFileSync(join(dir, 'extraction', 'capture-manifest.json'), 'utf8')); if (m.slug) return m.slug; } catch { /* no manifest yet */ }
  return '<slug>';
}

// The full real path must be ASCII: Storybook's test runner skips every story under a non-ASCII path, silently.
function refuseNonAscii(dir) {
  let head = dir; const tail = [];
  while (!existsSync(head) && dirname(head) !== head) { tail.unshift(basename(head)); head = dirname(head); }
  const real = join(realpathSync(head), ...tail);
  if (/[^\x00-\x7f]/.test(real)) {
    console.error(`refused: the folder path must be ASCII (Storybook's test runner skips stories under non-ASCII paths): ${real} — choose e.g. ~/${knownSlug(dir)}-workbench`);
    process.exit(2);
  }
}

function workbench(dir) {
  refuseNonAscii(dir);
  const spec = join(dir, 'extraction');
  if (!existsSync(join(spec, 'decisions.json'))) { console.error('no extraction/decisions.json — run the checkpoint first (checkpoint.mjs serve)'); process.exit(2); }
  if (!existsSync(join(spec, 'capture-manifest.json'))) { console.error('no extraction/capture-manifest.json — run scaffold.mjs init first'); process.exit(2); }
  const manifest = JSON.parse(readFileSync(join(spec, 'capture-manifest.json'), 'utf8'));
  const TPL = join(ROOT, 'templates', 'workbench');
  const made = [];
  let readmeNote = '';
  const walk = (rel = '') => {
    for (const e of readdirSync(join(TPL, rel), { withFileTypes: true })) {
      const r = join(rel, e.name);
      if (e.isDirectory()) { walk(r); continue; }
      if (r === '.gitignore.workbench') continue;
      let target = join(dir, r);
      // the repository already has its own README: the designer's README goes next to it, as WORKBENCH.md
      if (r === 'README.md' && existsSync(target) && !readFileSync(target, 'utf8').startsWith(readFileSync(join(TPL, r), 'utf8').split('\n')[0])) {
        target = join(dir, 'WORKBENCH.md');
        if (!existsSync(target)) readmeNote = 'README.md already exists: the Workbench README is WORKBENCH.md';
      }
      if (existsSync(target)) continue;
      mkdirSync(dirname(target), { recursive: true });
      let content = readFileSync(join(TPL, r));
      if (r === 'package.json') content = Buffer.from(String(content).replace('__SLUG__', manifest.slug || slugOf(manifest.product, basename(dir))));
      writeFileSync(target, content);
      made.push(basename(target) === 'WORKBENCH.md' ? 'WORKBENCH.md' : r);
    }
  };
  walk();
  const giPath = join(dir, '.gitignore');
  const giText = existsSync(giPath) ? readFileSync(giPath, 'utf8') : '';
  const have = new Set(giText.split('\n').map((l) => l.trim()));
  const add = readFileSync(join(TPL, '.gitignore.workbench'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !have.has(l));
  if (add.length) { appendFileSync(giPath, `${giText === '' || giText.endsWith('\n') ? '' : '\n'}# Workbench\n${add.join('\n')}\n`); made.push('.gitignore (+ Workbench lines)'); }
  // the token layer is generated from extraction/tokens.json (rewritten on every run: it is a generated file) — first, so DESIGN.md reads its values
  const gen = spawnSync(process.execPath, ['tools/tokens-css.mjs'], { cwd: dir, stdio: 'inherit' });
  if (gen.status !== 0) { console.error('tokens could not be generated (see above)'); process.exit(2); }
  // PROJECT.md, DESIGN.md and the test-flow spec: written from the extraction and the decisions, only if absent
  const readJson = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
  const decisions = readJson(join(spec, 'decisions.json'), {});
  const tokensDoc = readJson(join(spec, 'tokens.json'), {});
  const flows = readJson(join(spec, 'flows', 'flows.json'), { screens: [] });
  const baseDir = join(spec, 'baseline');
  const caps = existsSync(baseDir) ? readdirSync(baseDir).filter((f) => f.endsWith('.json')).sort().map((f) => readJson(join(baseDir, f), null)).filter((c) => c?.meta?.tool === 'capture.mjs') : [];
  const best = bestCaptures(caps);
  const flowName = String(decisions.flow?.name || 'main-flow').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'main-flow';
  const flowScreens = (decisions.flow?.screens ?? []).map((id) => {
    const c = best.get(id);
    return { id, url: c?.meta.finalUrl || c?.meta.requestedUrl, screenshot: c?.meta.screenshot ? `extraction/baseline/${basename(c.meta.screenshot)}` : null, capture: c };
  });
  const specPath = `specs/pages/${flowName}.md`;
  const docs = {
    'PROJECT.md': () => projectMd({ manifest, decisions, tokensDoc, pluginVersion: VERSION, specPath }),
    'DESIGN.md': () => designMd({ rows: readJson(join(dir, 'src', 'tokens', 'tokens.json'), {}).tokens ?? [], tokensDoc, decisions, closure: CLOSURE }),
    [specPath]: () => flowSpecMd({ flowName: decisions.flow?.name || flowName, specPath, screens: flowScreens, flows, excluded: decisions.excluded ?? [] }),
  };
  for (const [rel, make] of Object.entries(docs)) {
    const target = join(dir, rel);
    if (existsSync(target)) continue;
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, make());
    made.push(rel);
  }
  console.log(made.length ? `${dir}: created ${made.length} file(s)\n  ${made.join('\n  ')}` : `${dir}: the Workbench is already here — nothing to create`);
  if (readmeNote) console.log(readmeNote);
  console.log('next: npm install, then npm run check:fast; commit "Workbench from the extraction" with package-lock.json (CI installs from it); then open a new Claude Code session in the repository (trust the folder when asked) and say «склади план»');
}

// What the plugin owns in a Workbench (overwritten by `update`); any other template file is only added when missing.
const OWNED = [/^tools\//, /^\.claude\/skills\//, /^\.claude\/settings\.json$/, /^\.storybook\//, /^eslint\.config\.js$/, /^\.stylelintrc\.json$/, /^vite\.config\.ts$/, /^vitest\.config\.ts$/, /^tsconfig\.json$/, /^\.github\/workflows\/ci\.yml$/, /^PROMPT_(plan|build)\.md$/, /^src\/foundations\/(TokenTable|StateGrid)\./];
const SIDE_BY_SIDE = ['AGENTS.md', 'FRONTEND.md']; // the designer's rules live here: the template's version goes next to them

function update(dir) {
  const TPL = join(ROOT, 'templates', 'workbench');
  if (!existsSync(join(dir, 'tools', 'gates.mjs'))) { console.error(`refused: ${dir} is not a Workbench (no tools/gates.mjs) — new ones are made with scaffold.mjs workbench`); process.exit(2); }
  const st = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' });
  if (st.status === 0 && st.stdout.trim()) { console.error('refused: the git tree has uncommitted changes — commit them first, so the update is one reviewable diff'); process.exit(2); }
  const vf = join(dir, '.workbench-version');
  const from = existsSync(vf) ? readFileSync(vf, 'utf8').trim() : 'unknown (before .workbench-version)';
  const overwritten = []; const added = []; const side = [];
  const walk = (rel = '') => {
    for (const e of readdirSync(join(TPL, rel), { withFileTypes: true })) {
      const r = join(rel, e.name);
      if (e.isDirectory()) { walk(r); continue; }
      if (r === '.gitignore.workbench' || r === 'package.json') continue;
      if (r === 'README.md' && existsSync(join(dir, 'WORKBENCH.md'))) continue; // the repository's own README sits at README.md
      const content = readFileSync(join(TPL, r));
      const target = join(dir, r);
      if (!existsSync(target)) { mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, content); added.push(r); continue; }
      if (SIDE_BY_SIDE.includes(r)) {
        if (!readFileSync(target).equals(content)) { const t = r.replace(/\.md$/, '.template.md'); writeFileSync(join(dir, t), content); side.push(t); }
        continue;
      }
      if (OWNED.some((re) => re.test(r)) && !readFileSync(target).equals(content)) { writeFileSync(target, content); overwritten.push(r); }
    }
  };
  walk();
  // package.json: add what is missing, update a script the template also has, never remove the designer's own
  const pkgPath = join(dir, 'package.json');
  const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : {};
  const tpl = JSON.parse(readFileSync(join(TPL, 'package.json'), 'utf8'));
  const changes = [];
  for (const key of ['scripts', 'dependencies', 'devDependencies']) {
    for (const [k, v] of Object.entries(tpl[key] ?? {})) {
      pkg[key] ??= {};
      if (!(k in pkg[key])) { pkg[key][k] = v; changes.push(`${key}.${k}: added`); }
      else if (key === 'scripts' && pkg[key][k] !== v) { pkg[key][k] = v; changes.push(`scripts.${k}: updated`); }
    }
  }
  // the Workbench's .gitignore gets the template's lines it lacks (as `workbench` does)
  const giPath = join(dir, '.gitignore');
  const giText = existsSync(giPath) ? readFileSync(giPath, 'utf8') : '';
  const have = new Set(giText.split('\n').map((l) => l.trim()));
  const giAdd = readFileSync(join(TPL, '.gitignore.workbench'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !have.has(l));
  if (giAdd.length) { appendFileSync(giPath, `${giText === '' || giText.endsWith('\n') ? '' : '\n'}${giAdd.join('\n')}\n`); added.push(`.gitignore (+ ${giAdd.join(', ')})`); }
  const depsChanged = changes.some((c) => !c.startsWith('scripts.'));
  if (changes.length) writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  writeFileSync(vf, `${VERSION}\n`);
  const gen = spawnSync(process.execPath, ['tools/tokens-css.mjs'], { cwd: dir, stdio: 'inherit' });
  if (gen.status !== 0) { console.error('tokens could not be regenerated (see above)'); process.exit(2); }
  console.log(`${dir}: updated from ${from} to ${VERSION}`);
  console.log(`overwritten ${overwritten.length}${overwritten.length ? `:\n  ${overwritten.join('\n  ')}` : ''}`);
  console.log(`added ${added.length}${added.length ? `:\n  ${added.join('\n  ')}` : ''}`);
  console.log(`package.json: ${changes.length ? `\n  ${changes.join('\n  ')}` : 'no changes'}`);
  if (side.length) console.log(`${side.join(', ')} written next to yours: merge the new rules by hand (your own rules stay)`);
  if (depsChanged) console.log('dependencies changed: npm install is needed');
  console.log('next: npm install && npm run check; review the diff and commit it as one commit');
}

const dir = resolve(process.env.INIT_CWD || process.cwd(), dirArg);
if (cmd === 'workbench') { workbench(dir); process.exit(0); }
if (cmd === 'update') { update(dir); process.exit(0); }
refuseNonAscii(dir);
const manifest = join(dir, 'extraction', 'capture-manifest.json');
if (existsSync(dir) && readdirSync(dir).some((f) => !EMPTY_REPO.has(f)) && !existsSync(manifest)) {
  console.error(`refused: ${dir} has other content and is not a ds-from-app repository — choose a new or empty folder`);
  process.exit(2);
}

const localDate = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const product = opt('product') || basename(dir);
const made = [];
const put = (rel, content) => {
  const f = join(dir, rel);
  if (existsSync(f)) return;
  mkdirSync(dirname(f), { recursive: true });
  writeFileSync(f, content);
  made.push(rel);
};
put('extraction/baseline/.gitkeep', '');
put('extraction/canon/.gitkeep', '');
put('extraction/capture-manifest.json', JSON.stringify({
  _why: 'What makes a capture reproducible: which app, which tool.',
  tool: 'ds-from-app', toolVersion: VERSION, product, slug: slugOf(product, basename(dir)), entryPoint: opt('url') || null,
  createdAt: localDate(),
}, null, 2) + '\n');
put('extraction/tokens.json', JSON.stringify({
  $closure: CLOSURE,
  $meta: {
    product, extractedAt: null, instruments: [], screens: { captured: [], notReached: [] },
    derivationPolicy: { colorDerivation: 'forbidden', enforcement: { detects: ['hex', 'numeric-rgb-hsl', 'color-mix'] }, _note: 'The default is the strict one. Relax it deliberately, and say why here.' },
  },
  tokens: {},
}, null, 2) + '\n');
if (existsSync(join(dir, '.gitignore'))) { // a repository that already has one: add what is missing, never rewrite it
  const f = join(dir, '.gitignore');
  const have = new Set(readFileSync(f, 'utf8').split('\n').map((l) => l.trim()));
  const missing = GITIGNORE.split('\n').filter((l) => l && !l.startsWith('#') && !have.has(l));
  if (missing.length) {
    const text = readFileSync(f, 'utf8');
    writeFileSync(f, `${text}${text === '' || text.endsWith('\n') ? '' : '\n'}# ds-from-app\n${missing.join('\n')}\n`);
    made.push(`.gitignore (added ${missing.length} pattern(s))`);
  }
} else put('.gitignore', GITIGNORE);
if (!existsSync(join(dir, '.git'))) {
  const g = spawnSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  if (g.status !== 0) { console.error('git init failed — is git installed? (node scripts/preflight.mjs)'); process.exit(2); }
  made.push('.git');
}
console.log(made.length ? `${dir}: created ${made.join(', ')}` : `${dir}: already a ds-from-app repository — nothing to create`);
