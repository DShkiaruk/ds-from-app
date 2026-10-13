# ds-from-app — Plan 1 of 3: Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Claude Code plugin that takes a live web app's link and produces, in the product's own repository, captures of its screens, a token set where every value says how it was obtained, a draft component list, a transition map, and the designer's decisions from a local checkpoint page.

**Architecture:** The tested platform instruments of `~/ds-extract-method` (@`ebaa66f`) are moved — not rewritten — into `scripts/` under new names, with their planted self-test split into `node:test` files. New, small pieces around them: a browser launcher that prefers the designer's own Chrome, an environment check, a repository scaffold that runs before any capture, and a checkpoint page adapted from `prototype-storybook` 0.1.2. Plan 2 (Workbench repo, gates, Storybook) and Plan 3 (pilot, cold run, rollout) build on this.

**Tech Stack:** Node ≥ 22 (ES modules, `.mjs`), `playwright-core` 1.62.1 (the only dependency), `node:test` + `node:assert`, Google Chrome (or Playwright's Chromium).

**Spec:** `docs/superpowers/specs/2026-10-12-ds-from-app-design.md`

## Global Constraints

- Node `>= 22` (`engines`); plain JavaScript ES modules (`.mjs`); no TypeScript, no build step.
- Exactly one runtime dependency: `"playwright-core": "1.62.1"` (the version the source self-test passes on). Tests use only `node:test` and `node:assert/strict`.
- Source of moved code: `~/ds-extract-method` at commit `ebaa66f`. It is **read-only** — never edit, commit or push there. Copy files out of it.
- `scripts/lib/color.mjs`, `scripts/lib/safety.mjs`, `scripts/lib/session.mjs`, `scripts/lib/product.mjs` are byte-identical copies. Moved scripts get only the edits a task lists.
- A product repository's layout (spec §3, aligned to the moved scripts in Task 1): `extraction/baseline/` (captures + screenshots), `extraction/canon/decided.tokens.json`, `extraction/tokens.json`, `extraction/components.draft.json`, `extraction/flows/flows.json`, `extraction/checkpoint.json`, `extraction/decisions.json`, `extraction/capture-manifest.json`.
- A capture's `meta.tool` is `'capture.mjs'`; every reader filters on that string. Token extension key stays `'co.eleken.ds'`.
- Every value carries `measured` / `derived` / `decided` (spec rule 1). Nothing in this plan may drop or rewrite a label.
- Read-only toward the app (spec rule 3): `lib/safety.mjs` is unchanged; no task adds a way around a refusal.
- Text for agents (scripts' output, `SKILL.md`, references) in English. Text the designer sees (checkpoint page, README) in their language: the page defaults to Ukrainian (`--lang uk`), English available (`--lang en`). Plain words; no English jargon in Ukrainian text.
- Size budget (spec §5): `skills/ds-from-app/SKILL.md` ≤ 1,500 words; ≤ 10 `.mjs` files directly in `scripts/` (not counting `scripts/lib/`).
- Tests: `npm test` runs `tests/*.test.mjs`; `npm run selftest` runs `selftest/*.test.mjs`; both with `--test-concurrency=1` (one browser at a time: the target machine has 8 GB RAM).
- The checkpoint server binds `127.0.0.1` only.
- Commit after every task. Every commit message ends with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Implementers: DO NOT SPAWN SUBAGENTS.

## Review Focus

1. **An expired or missing sign-in session** silently turns every capture into the sign-in page (exit 0, a valid file). Expected: the capture warns on the console and records `meta.looksLikeSignIn: true`; the checkpoint shows that screen as "looks like a sign-in page". Tests: Task 3 (capture), Task 9 (prepare carries the flag).
2. **Re-opening the checkpoint after Done** (the designer closes the tab, Claude reruns `serve`). Expected: the page opens with the previous choices — flow screens ticked, renamed tokens, components unticked. Test: Task 10.
3. **Non-ASCII names** — a Ukrainian product name, a Cyrillic screen name. Expected: the repository gets an ASCII `slug` (falls back to the folder name); a Cyrillic screenshot is served on the checkpoint page. Tests: Task 8, Task 10, Task 11.
4. **Port 6020 already taken** (a previous checkpoint still running). Expected: exit 2 and a message naming the next port to try, not a stack trace. Test: Task 10.
5. **An app with no CSS custom properties at all.** Expected: every token is `derived` with a kit name, so the checkpoint shows every token under "proposed names" for the designer to check. Test: Task 9.

## Deferred to later plans (spec §4.1 traps this plan does not plant)

- **A hidden state** (one a forced pseudo-class cannot reach) → Plan 2, with the states stories and the parity gate that consume states.
- **A prototype-only switcher** → Plan 3: the pilot (a client's prototype) has a real one (option switcher, Admin/User); deciding it is Claude's checkpoint work, so it is checked on the pilot, not in a synthetic page.
- Planted here: `oklch()` colours, a radius through a shorthand with `var()`, a dark scheme by media query, **a theme switched by a class on `<html>`** (new route, Task 3 + Task 4), a sign-in page (Task 3).

---

## File structure (this plan)

```
ds-from-app/
├── .claude-plugin/plugin.json          name, version 0.1.0 — scripts read the version from here
├── .claude-plugin/marketplace.json     local marketplace "ds-from-app"
├── .gitignore, package.json, CHANGES.md, README.md
├── commands/ds-from-app.md             /ds-from-app <link> | continue
├── skills/ds-from-app/SKILL.md         steps 0–4 of the extraction + the 8 rules
├── skills/ds-from-app/references/capture.md, tokens.md
├── scripts/
│   ├── preflight.mjs                   new — what the machine is missing, and the fix
│   ├── scaffold.mjs                    new — `init`: the product repository, before any capture
│   ├── capture.mjs                     ← walk_live.mjs (+ sign-in warning)
│   ├── tokens.mjs                      ← captures_to_canon.mjs
│   ├── inventory.mjs                   ← inventory_seed.mjs
│   ├── flows.mjs                       ← map_flows.mjs
│   ├── checkpoint.mjs                  new, adapted from prototype-storybook — `prepare`, `serve`
│   └── lib/ browser.mjs (new) · color.mjs · safety.mjs · session.mjs · product.mjs (verbatim)
├── selftest/                           the planted self-test, split per instrument
│   ├── fixtures/ platform.html · flows.html · literal.html · spa.html   (verbatim)
│   ├── server.mjs, helpers.mjs
│   └── capture.test.mjs · tokens.test.mjs · inventory.test.mjs · flows.test.mjs · e2e.test.mjs
└── tests/                              fast checks of the new code
    └── size · lib · preflight · scaffold · checkpoint · checkpoint-page  (.test.mjs)
```

---

### Task 1: Plugin skeleton, test runner, size budget

**Files:**
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `package.json`, `.gitignore`, `CHANGES.md`, `commands/ds-from-app.md`, `skills/ds-from-app/SKILL.md` (frontmatter + rules only; Task 12 completes it), `tests/size.test.mjs`
- Modify: `docs/superpowers/specs/2026-10-12-ds-from-app-design.md` (file names aligned to the moved scripts)

**Interfaces:**
- Consumes: nothing.
- Produces: `.claude-plugin/plugin.json` → `{ "version": "0.1.0" }` (read by `scripts/tokens.mjs` and `scripts/scaffold.mjs` as `JSON.parse(readFileSync(join(<repo root>, '.claude-plugin', 'plugin.json'))).version`); `npm test`, `npm run selftest`.

- [ ] **Step 1: Write the failing test**

`tests/size.test.mjs`:

```js
// The size budget is a check, not an intention (spec §5): the method this plugin came from grew to 41k words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('SKILL.md stays within 1,500 words', () => {
  const text = readFileSync(join(ROOT, 'skills', 'ds-from-app', 'SKILL.md'), 'utf8').replace(/^---[\s\S]*?---/, '');
  const words = text.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 1500, `SKILL.md has ${words} words`);
});

test('scripts/ holds at most 10 scripts (lib/ not counted)', () => {
  const scripts = readdirSync(join(ROOT, 'scripts')).filter((f) => f.endsWith('.mjs'));
  assert.ok(scripts.length <= 10, `scripts/ has ${scripts.length}: ${scripts.join(', ')}`);
});

test('the plugin manifest carries a version', () => {
  const p = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(p.name, 'ds-from-app');
  assert.match(p.version, /^\d+\.\d+\.\d+$/);
});
```

`package.json`:

```json
{
  "name": "ds-from-app-plugin",
  "private": true,
  "type": "module",
  "description": "Scripts of the ds-from-app Claude Code plugin",
  "engines": { "node": ">=22" },
  "scripts": {
    "test": "node --test --test-concurrency=1 \"tests/*.test.mjs\"",
    "selftest": "node --test --test-concurrency=1 \"selftest/*.test.mjs\"",
    "check": "npm test && npm run selftest"
  },
  "dependencies": {
    "playwright-core": "1.62.1"
  }
}
```

`.gitignore`:

```
node_modules/
.DS_Store
# sign-in sessions never enter any repository
*.auth.json
```

- [ ] **Step 2: Install and run the test to verify it fails**

Run: `cd ~/ds-from-app && npm install && npm test`
Expected: FAIL — `ENOENT … skills/ds-from-app/SKILL.md` and `… .claude-plugin/plugin.json`.

- [ ] **Step 3: Write the skeleton**

`.claude-plugin/plugin.json`:

```json
{
  "name": "ds-from-app",
  "version": "0.1.0",
  "description": "A live web app → its design tokens (each saying how it was obtained), components and transitions, decided by the designer on a checkpoint page; then a Workbench repo with a test flow and Storybook on those tokens.",
  "author": { "name": "Eleken" }
}
```

`.claude-plugin/marketplace.json`:

```json
{
  "name": "ds-from-app",
  "owner": { "name": "Eleken" },
  "plugins": [
    { "name": "ds-from-app", "source": "./", "description": "Live app → design tokens → Workbench repo" }
  ],
  "description": "ds-from-app, local catalogue until it joins Eleken's design tools",
  "metadata": { "description": "ds-from-app, local catalogue until it joins Eleken's design tools" }
}
```

`commands/ds-from-app.md`:

```markdown
---
description: Pull a design system out of a live app — tokens, components, transitions — and let the designer decide what goes in
argument-hint: "[https://… | continue]"
---

Use the ds-from-app skill.

Input: $ARGUMENTS

- A link: start a new extraction (the skill's steps from 0).
- "continue", or the current folder has `extraction/capture-manifest.json`: continue from the first step whose output is missing.
- Nothing: ask the designer, in their language and in plain words, for the link to the app.
```

`skills/ds-from-app/SKILL.md` (Task 12 adds the tools and steps):

```markdown
---
name: ds-from-app
description: Pull a design system out of a live web app — tokens that each say how they were obtained, components, screens and transitions — and let the designer decide what goes in on a checkpoint page. Use when someone asks to extract tokens or a design system from a running app or site, or runs /ds-from-app.
---

# Live app → tokens → checkpoint

The people running this are Eleken designers, often without coding experience. Speak to them in their language, in
plain words. Files for agents stay in English.

## The rules (never bend these)

1. **Every value says how it was obtained**: `measured` (read from the app), `derived` (computed from what it paints),
   `decided` (a person, with a date). `not-reached` is not "absent".
2. **The app's own names first.** Propose a name only where the app has none; the designer approves it at the checkpoint.
3. **Read-only.** Never submit a form, never press what could change data, never type a password. The designer signs in by hand.
4. **Absence is not proven by an empty search.** Before saying "the app has no X", show the instrument catching a
   planted X (`npm run selftest`) or name what it cannot see.
5. **States are produced, never guessed** — forced hover / focus / active, or `not-reached`.
6. **The set is closed.** Nothing outside the extracted tokens; what is missing is `NEEDS-TOKEN` / `NEEDS-COMPONENT` /
   `NEEDS-STATE`, never an invented value.
7. **Prototype-only parts stay out** — role switchers, demo toggles, debug panels — unless the designer puts them back.
8. **Reproduce one flow before trusting the tokens.** Until the test flow is built, say the tokens are unchecked.
```

`CHANGES.md`:

```markdown
# Changes

## 0.1.0 (in progress)

Extraction half (Plan 1): the platform instruments of ds-extract-method @ebaa66f moved in under new names
(walk_live → capture, captures_to_canon → tokens, inventory_seed → inventory, map_flows → flows) with their planted
self-test; a browser launcher that uses the designer's own Chrome; an environment check; the product repository
created before any capture; the checkpoint page, adapted from prototype-storybook 0.1.2 (Eleken).
```

- [ ] **Step 4: Align the spec's file names to the moved scripts**

The moved scripts keep the method's layout (`baseline/`, `canon/decided.tokens.json`); renaming would touch tested code for no gain. In `docs/superpowers/specs/2026-10-12-ds-from-app-design.md` replace:
- `extraction/captures/` → `extraction/baseline/` (every occurrence; also the tree line `captures/        values + screenshots…` → `baseline/        values + screenshots…`)
- the tree line `decided.json     values a person approved…` → `canon/decided.tokens.json   values a person approved…`
- in §3 decision 1, `` `decided.json` `` → `` `canon/decided.tokens.json` ``

Run: `grep -n "extraction/captures\|decided\.json" docs/superpowers/specs/2026-10-12-ds-from-app-design.md`
Expected: no output.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Plugin skeleton: manifest, command, the 8 rules, size budget as a test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Shared libraries and the browser launcher

**Files:**
- Create (verbatim copies): `scripts/lib/color.mjs`, `scripts/lib/safety.mjs`, `scripts/lib/session.mjs`, `scripts/lib/product.mjs`
- Create: `scripts/lib/browser.mjs`, `tests/lib.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `launch({ headless = true } = {}) → Promise<Browser>` (playwright-core `Browser`); throws `Error('No browser to capture with. Install Google Chrome, or run: npx playwright install chromium\n(…)')`.
  - `findChrome(list = CANDIDATES) → string | null`; `CANDIDATES: string[]` (honours `process.env.CHROME_PATH` first).
  - `browser.mjs` imports `playwright-core` lazily inside `launch()`, so `preflight.mjs` can import `findChrome` when the dependency is missing.
  - From the verbatim libs: `parseColor`, `toHex`, `oklabDistance` (color); `UNSAFE`, `REVEAL`, `REVEAL_ICON`, `blockWrites` (safety); `readSessionStorage`, `restoreSession` (session); `product(arg, usage) → { dir, spec, name, slug, canonDir, canonFile, … }`, `here(p)` (product).

- [ ] **Step 1: Copy the libraries**

```bash
mkdir -p scripts/lib
for f in color safety session product; do cp ~/ds-extract-method/scripts/lib/$f.mjs scripts/lib/; done
for f in color safety session product; do cmp ~/ds-extract-method/scripts/lib/$f.mjs scripts/lib/$f.mjs && echo "$f identical"; done
```
Expected: four lines `… identical`.

- [ ] **Step 2: Write the failing test**

`tests/lib.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, toHex } from '../scripts/lib/color.mjs';
import { UNSAFE, REVEAL } from '../scripts/lib/safety.mjs';
import { launch, findChrome } from '../scripts/lib/browser.mjs';

test('colour: any notation a browser hands back is read, garbage is null', () => {
  assert.equal(toHex(parseColor('rgb(255, 0, 170)')), '#FF00AA');
  assert.equal(parseColor('oklch(0.55 0.2 260)').space, 'oklch');
  assert.equal(toHex(parseColor('rgba(0,0,0,0.5)')), '#00000080');
  assert.equal(parseColor('nonsense'), null);
});

test('safety: an action on data is unsafe, navigation is not; "Show" unmasks', () => {
  assert.ok(UNSAFE.test('Delete account'));
  assert.ok(!UNSAFE.test('Settings'));
  assert.ok(REVEAL.test('Show'));
});

test('findChrome: the first path that exists, or null', () => {
  assert.equal(findChrome(['/nonexistent/chrome']), null);
  assert.equal(findChrome(['/nonexistent/chrome', process.execPath]), process.execPath);
});

test('launch: a headless browser that renders a page', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<p>ok</p>');
    assert.equal(await page.textContent('p'), 'ok');
  } finally {
    await browser.close();
  }
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '…/scripts/lib/browser.mjs'`.

- [ ] **Step 4: Write `scripts/lib/browser.mjs`**

```js
// One browser for every instrument: the designer's own Google Chrome when it is installed, otherwise the Chromium
// Playwright downloads (npx playwright install chromium) — designers have Chrome, and do not need a 150 MB download.
// The same candidate list as prototype-storybook's scripts/browser.mjs. playwright-core is imported inside launch(),
// so preflight.mjs can use findChrome() before the dependency is installed.
import { existsSync } from 'node:fs';

export const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

export const findChrome = (list = CANDIDATES) => list.find((p) => existsSync(p)) ?? null;

export async function launch({ headless = true } = {}) {
  const { chromium } = await import('playwright-core');
  const executablePath = findChrome();
  try {
    return await chromium.launch({ headless, ...(executablePath ? { executablePath } : {}) });
  } catch (e) {
    throw new Error(`No browser to capture with. Install Google Chrome, or run: npx playwright install chromium\n(${String(e.message).split('\n')[0]})`);
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS (size + lib).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Shared libraries (verbatim from ds-extract-method @ebaa66f) and a launcher that prefers the designer's Chrome

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The self-test harness and `capture.mjs`

**Files:**
- Create (verbatim copies): `selftest/fixtures/platform.html`, `flows.html`, `literal.html`, `spa.html`
- Create: `selftest/server.mjs`, `selftest/helpers.mjs`, `selftest/capture.test.mjs`
- Create from `~/ds-extract-method/scripts/walk_live.mjs`: `scripts/capture.mjs`

**Interfaces:**
- Consumes: `launch` from `scripts/lib/browser.mjs`; `UNSAFE`, `REVEAL`, `REVEAL_ICON`, `blockWrites` (safety); `readSessionStorage`, `restoreSession` (session).
- Produces:
  - CLI `node scripts/capture.mjs --url <url> [--screen <name>] [--out <dir>] [--viewport 1440x900] [--scheme light|dark] [--storage <session.json>] [--no-interact] [--block-writes [--reads <regex>]] [--click <css> …] [--as-screen] [--root-class <c>] [--root-attr k=v] [--settle <ms>]`, and sign-in mode `--login-url <url> --save-storage <file> [--until-url <regex>]`. Writes `<out>/<screen>--<WxH>--<scheme>.json` and `.png`. Exit codes: 0 captured · 2 navigation failed / refused click · 3 nothing visible · 4 redirected.
  - Capture JSON: `meta.tool === 'capture.mjs'`; `meta.looksLikeSignIn: true` when the page looks like a sign-in page (absent otherwise); everything else exactly as `walk_live.mjs` writes it.
  - `selftest/server.mjs`: `startServer() → Promise<{ url: string, close(): void, posts(): number, resetPosts(): void }>`.
  - `selftest/helpers.mjs`: `ROOT`; `run(script, ...args) → Promise<{ status: number, stdout: string, stderr: string }>` (runs `scripts/<script>`); `fixtureRepo(prefix) → string` (temp dir with `baseline/`, `capture-manifest.json`, `tokens.json` skeleton); `dropPngs(dir)`; `expectAll(checks: [boolean, string][])` (fails listing every missed check).

- [ ] **Step 1: Copy the fixtures and write the harness**

```bash
mkdir -p selftest/fixtures
cp ~/ds-extract-method/scripts/fixtures/{platform,flows,literal,spa}.html selftest/fixtures/
```

`selftest/server.mjs`:

```js
// The synthetic products the instruments are checked against. Server and fixtures moved from ds-extract-method
// scripts/selftest_platform.mjs @ebaa66f: /spa/ is a single-URL product (screens swapped in place, a sessionStorage
// sign-in, a masked secret), /flows/ a two-screen product with transitions, /literal a product with no custom
// properties, /one-theme the main fixture without its dark block, / the main fixture. Added here: /class-theme, the
// main fixture with its dark block switched by a class on <html> instead of prefers-color-scheme.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const F = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const html = readFileSync(join(F, 'platform.html'), 'utf8');
const flowsHtml = readFileSync(join(F, 'flows.html'), 'utf8');
const literalHtml = readFileSync(join(F, 'literal.html'), 'utf8');
const spaHtml = readFileSync(join(F, 'spa.html'), 'utf8');
const SPRITE = '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="icon-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle></symbol></svg>';
const BELL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path></svg>';

export async function startServer() {
  let posts = 0;
  const server = createServer((req, res) => {
    if (req.method === 'POST') { posts++; res.writeHead(204); res.end(); return; }
    if (req.url.startsWith('/go-elsewhere')) { res.writeHead(302, { location: '/' }); res.end(); return; }
    if (req.url.startsWith('/sprite.svg') || req.url.startsWith('/bell.svg')) { res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end(req.url.startsWith('/sprite') ? SPRITE : BELL); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    if (req.url.startsWith('/spa')) { res.end(spaHtml); return; }
    if (req.url.startsWith('/literal')) { res.end(literalHtml); return; }
    if (req.url.startsWith('/class-theme')) { res.end(html.replace(/\/\* dark:start \*\/[\s\S]*?\/\* dark:end \*\//, '/* dark:start */ html.dark { --color-primary: oklch(0.7 0.15 260); --color-surface: oklch(0.2 0 0); } /* dark:end */')); return; }
    res.end(req.url.startsWith('/flows') || req.url.startsWith('/detail')
      ? flowsHtml.replaceAll('href="/', 'href="/flows/').replace("location.pathname.startsWith('/detail')", "location.pathname.startsWith('/flows/detail')")
      : req.url.startsWith('/one-theme') ? html.replace(/\/\* dark:start \*\/[\s\S]*?\/\* dark:end \*\//, '') : html);
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close(), posts: () => posts, resetPosts: () => { posts = 0; } };
}
```

`selftest/helpers.mjs`:

```js
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Asynchronous on purpose: the walker needs this process's fixture server to answer while it runs.
export const run = (script, ...args) => new Promise((ok) => execFile('node', [join(ROOT, 'scripts', script), ...args],
  { cwd: ROOT, env: { ...process.env, INIT_CWD: ROOT }, maxBuffer: 64 << 20 },
  (err, stdout, stderr) => ok({ status: err ? (typeof err.code === 'number' ? err.code : 1) : 0, stdout, stderr })));

// A product repository in the method's root layout (no extraction/ folder): product() then uses the root.
export function fixtureRepo(prefix = 'dsfa-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  mkdirSync(join(dir, 'baseline'));
  writeFileSync(join(dir, 'capture-manifest.json'), JSON.stringify({ product: 'Fixture' }));
  writeFileSync(join(dir, 'tokens.json'), JSON.stringify({ $closure: 'fixture', $meta: { product: 'Fixture', derivationPolicy: { colorDerivation: 'forbidden', enforcement: {} } }, tokens: {} }));
  return dir;
}

export const dropPngs = (dir) => { for (const f of readdirSync(dir)) if (f.endsWith('.png')) rmSync(join(dir, f)); };

// Every planted shape is checked, and every miss is listed — one failing line must not hide the next.
export function expectAll(checks) {
  const missed = checks.filter(([ok]) => !ok).map(([, what]) => what);
  assert.deepEqual(missed, [], `missed:\n  ${missed.join('\n  ')}`);
}
```

- [ ] **Step 2: Write the failing test**

`selftest/capture.test.mjs`:

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { run, fixtureRepo } from './helpers.mjs';

let S, dir;
before(async () => { S = await startServer(); dir = fixtureRepo('dsfa-capture-'); });
after(() => { S.close(); rmSync(dir, { recursive: true, force: true }); });

test('captures the fixture in both schemes, read-only, as capture.mjs', async () => {
  for (const scheme of ['light', 'dark']) {
    const r = await run('capture.mjs', '--url', S.url, '--screen', 'fixture', '--scheme', scheme, '--out', join(dir, 'baseline'), '--no-interact', '--settle', '300');
    assert.equal(r.status, 0, r.stderr);
    const cap = JSON.parse(readFileSync(join(dir, 'baseline', `fixture--1440x900--${scheme}.json`), 'utf8'));
    assert.equal(cap.meta.tool, 'capture.mjs');
    assert.equal(cap.meta.looksLikeSignIn, undefined, 'the fixture is not a sign-in page');
  }
});

test('a screen that redirects is refused, not written under the wrong name', async () => {
  const r = await run('capture.mjs', '--url', `${S.url}go-elsewhere`, '--screen', 'elsewhere', '--out', join(dir, 'runs-redirect'), '--no-interact', '--settle', '200');
  assert.equal(r.status, 4);
  assert.ok(!existsSync(join(dir, 'runs-redirect', 'elsewhere--1440x900--light.json')));
});

test('a single-URL product: the session restore, a screen behind a click, and the refusals', async () => {
  const sp = join(dir, 'spa');
  mkdirSync(join(sp, 'baseline'), { recursive: true });
  const origin = new URL(S.url).origin;
  const signedIn = join(sp, 'session.auth.json'), cookieOnly = join(sp, 'no-session.auth.json');
  writeFileSync(signedIn, JSON.stringify({ cookies: [], origins: [{ origin, localStorage: [], sessionStorage: [{ name: 'signedIn', value: '1' }] }] }));
  writeFileSync(cookieOnly, JSON.stringify({ cookies: [], origins: [{ origin, localStorage: [] }] }));
  const h1Of = (d, f) => (JSON.parse(readFileSync(join(d, f), 'utf8')).elements || []).find((e) => e.tag === 'h1')?.text;

  // the counterexample first: the same session without its sessionStorage lands on the sign-in page — and says so
  const outNo = join(sp, 'no-session');
  const no = await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', cookieOnly, '--screen', 'orders', '--as-screen', '--out', outNo, '--no-interact', '--settle', '300');
  assert.equal(h1Of(outNo, 'orders--1440x900--light.json'), 'Sign in', 'without its sessionStorage the session lands on the sign-in page');
  assert.match(no.stderr, /looks like a sign-in page/);
  assert.equal(JSON.parse(readFileSync(join(outNo, 'orders--1440x900--light.json'), 'utf8')).meta.looksLikeSignIn, true);

  const yes = await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--screen', 'orders', '--as-screen', '--out', join(sp, 'baseline'), '--no-interact', '--settle', '300');
  assert.equal(h1Of(join(sp, 'baseline'), 'orders--1440x900--light.json'), 'Orders', 'the session file restores sessionStorage');
  assert.doesNotMatch(yes.stderr, /looks like a sign-in page/);

  const ws = await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--click', '[data-key="settings"]', '--as-screen', '--screen', 'settings', '--out', join(sp, 'baseline'), '--no-interact', '--settle', '300');
  assert.equal(ws.status, 0, ws.stderr);
  assert.equal(h1Of(join(sp, 'baseline'), 'settings--1440x900--light.json'), 'Settings', 'a screen behind a menu click at the same URL is captured --as-screen');

  const wr = await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--click', '[data-key="settings"]', '--click', '#show', '--allow-unsafe-click', '--screen', 'settings--shown', '--out', join(sp, 'runs'), '--no-interact', '--settle', '300');
  assert.notEqual(wr.status, 0);
  assert.match(wr.stderr, /unmasks/, 'a click that unmasks a secret is refused, even with --allow-unsafe-click');

  S.resetPosts();
  const wReads = await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--click', '#sync', '--block-writes', '--reads', '^/spa/api/sync$', '--screen', 'orders--synced', '--out', join(sp, 'runs'), '--no-interact', '--settle', '300');
  assert.equal(wReads.status, 0, wReads.stderr);
  assert.equal(S.posts(), 1, '--reads lets a named read through a write block');
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run selftest`
Expected: FAIL — `Cannot find module …/scripts/capture.mjs` in every test.

- [ ] **Step 4: Move `walk_live.mjs` to `scripts/capture.mjs`**

```bash
cp ~/ds-extract-method/scripts/walk_live.mjs scripts/capture.mjs
sed -i '' -e 's#scripts/walk_live\.mjs#scripts/capture.mjs#g' \
          -e "s#tool: 'walk_live\.mjs',#tool: 'capture.mjs',#" \
          -e "s#^import { chromium } from 'playwright';#import { launch } from './lib/browser.mjs';#" \
          -e 's#const browser = await chromium\.launch({ headless: !o\.loginUrl || o\.headless });#const browser = await launch({ headless: !o.loginUrl || o.headless });#' \
          scripts/capture.mjs
```

Then edit by hand:

1. Line 3, replace ` * walk_live.mjs — capture one screen of a running product, once, completely.` with:
   ```
    * capture.mjs — capture one screen of a running product, once, completely.
    * (Moved from ds-extract-method scripts/walk_live.mjs @ebaa66f; additions: the browser launcher, the sign-in warning.)
   ```
2. Directly after the block
   ```js
   if (!walk.elements.length) {
     console.error('nothing visible captured — wrong URL, a login wall, or a blocked render');
     await browser.close();
     process.exit(3);
   }
   ```
   insert:
   ```js

   // A capture of a sign-in page is not a capture of the screen asked for: a missing or expired session turns every
   // later reading into the sign-in page, silently (exit 0, a valid file). Say so on the console and in the file.
   const looksLikeSignIn = o.loginUrl ? false : await page.evaluate(() => {
     const heading = (document.querySelector('h1')?.textContent || document.title || '').trim();
     return Boolean(document.querySelector('input[type="password"]')) || /^(sign ?in|log ?in|увійти|вхід)\b/i.test(heading);
   }).catch(() => false);
   if (looksLikeSignIn) console.error('warning: this looks like a sign-in page (a password field, or a "Sign in" heading) — the session is missing or expired: sign in again and re-capture (references/capture.md § Sign-in)');
   ```
3. In the `capture.meta` object, directly after the line `    screenKind: o.asScreen ? 'screen' : undefined,` insert:
   ```js
       looksLikeSignIn: looksLikeSignIn || undefined,
   ```

Verify the edits landed and nothing of the old name or package remains:

Run: `grep -n "walk_live\|from 'playwright'\|chromium\.launch" scripts/capture.mjs; grep -c "looksLikeSignIn" scripts/capture.mjs`
Expected: first grep prints nothing; the count is `4`.

- [ ] **Step 5: Run the self-test to verify it passes**

Run: `npm run selftest`
Expected: PASS, 3 tests (about 1 minute).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "capture.mjs: walk_live moved in, on the designer's Chrome; a capture of a sign-in page says so

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `tokens.mjs` and its planted shapes

**Files:**
- Create from `~/ds-extract-method/scripts/captures_to_canon.mjs`: `scripts/tokens.mjs`
- Create: `selftest/tokens.test.mjs`

**Interfaces:**
- Consumes: capture JSON with `meta.tool === 'capture.mjs'` (Task 3); `product()`, `parseColor`, `toHex` (Task 2); `.claude-plugin/plugin.json` version (Task 1).
- Produces: CLI `node scripts/tokens.mjs <repo> [capture.json …]` → writes `<spec>/tokens.json` = `{ $closure, $meta, tokens: { [key]: { $id, $type, $value, $modes?, $provenance: { label: 'measured'|'derived'|'decided', authoredName?, evidence, counters? }, $extensions: { 'co.eleken.ds': { cssVar, role, roleProvenance: { label, evidence }, css, usage?, modeStatus?, … } } } } }` and, when a scheme varies, `<spec>/tokens.resolver.json`. Merges `<spec>/canon/decided.tokens.json` and `<spec>/canon/components.tokens.json` when present. `$meta.instruments` lists `{ name: 'ds-from-app scripts/capture.mjs' | 'ds-from-app scripts/tokens.mjs', version: <plugin version> }`. Exit 2 when no capture is found.

- [ ] **Step 1: Write the failing test**

`selftest/tokens.test.mjs` — the checks are those of `selftest_platform.mjs` lines 60–109, 152–155, 201–202, 209–238 at @ebaa66f, unchanged; the library-roles, build_kit, icons and drift checks stay behind with those scripts.

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { run, fixtureRepo, dropPngs, expectAll } from './helpers.mjs';

let S, dir, doc, T, X, is;
before(async () => {
  S = await startServer();
  dir = fixtureRepo('dsfa-tokens-');
  for (const scheme of ['light', 'dark']) {
    const r = await run('capture.mjs', '--url', S.url, '--screen', 'fixture', '--scheme', scheme, '--out', join(dir, 'baseline'), '--no-interact', '--settle', '300');
    assert.equal(r.status, 0, r.stderr);
  }
  dropPngs(join(dir, 'baseline'));
  const c2c = await run('tokens.mjs', dir);
  assert.equal(c2c.status, 0, c2c.stderr || c2c.stdout);
  doc = JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8'));
  doc.$meta.platform ??= {};
  T = doc.tokens;
  X = (k) => T[k]?.$extensions?.['co.eleken.ds'] ?? {};
  is = (k, role, label) => X(k).role === role && X(k).roleProvenance?.label === label;
});
after(() => { S.close(); rmSync(dir, { recursive: true, force: true }); });

test('the planted shapes of a product that declares its tokens', () => expectAll([
  [T['color-primary']?.$value === 'oklch(0.55 0.2 260)', 'an oklch colour keeps its notation (color-primary)'],
  [T['color-primary']?.$modes?.dark === 'oklch(0.7 0.15 260)', 'the dark scheme is a mode of it'],
  [is('color-primary', 'color', 'measured') && X('color-primary').twKey === 'primary', '…its role is read from where it is spent'],
  [T['color-muted']?.$value === '{color-surface}' && !T['color-muted'].$modes && X('color-muted').modeStatus === 'follows-alias', 'an alias stays an alias, and follows its target across schemes'],
  [T.accent?.$value === '#0F172A' && X('accent').cssForm === 'hsl-channels' && is('accent', 'color', 'measured'), 'bare hsl channels spent inside hsl() are a colour, kept in channel form'],
  [T['color-border']?.$value === 'oklch(0 0 0 / 0.1)' || T['color-border']?.$value === 'oklch(0 0 0 / 10%)', `a translucent colour keeps its alpha (${T['color-border']?.$value})`],
  [T.radius?.$value === 10 && is('radius', 'radius', 'measured'), 'a radius spent only through the border-radius shorthand is measured as a radius (10px from 0.625rem)'],
  [T['radius-md']?.$value === 8 && X('radius-md').css === 'calc(var(--radius) - 2px)', 'calc() over rem resolves to px, and the relation is kept'],
  [T.spacing?.$value === 4 && T['spacing-4']?.$value === 16 && T['spacing-4'].$provenance.label === 'decided', 'one --spacing base gets the multiplier scale, labelled decided'],
  [T['text-sm']?.$value === 14 && X('text-sm').twKey === 'sm', 'a --text-* size (14px)'],
  [Math.abs((T['text-sm--line-height']?.$value ?? 0) - 1.25 / 0.875) < 1e-4 && X('text-sm--line-height').role === 'lineHeight', 'a unitless calc() line-height ratio resolves to its number'],
  [T['font-weight-medium']?.$value === 500 && is('font-weight-medium', 'fontWeight', 'measured'), 'a font weight'],
  [X('shadow-sm').role === 'shadow' && /rgba\(0, 0, 0, 0\.05\)/.test(String(T['shadow-sm']?.$value)), 'a shadow'],
  [X('shadow-md')?.css === '0 4px 6px -1px rgba(0, 0, 0, .1), 0 2px 4px -2px rgba(0, 0, 0, .1)', `a token declared twice on :root takes the declaration the cascade applies (${X('shadow-md')?.css})`],
  [T['unused-gap']?.$value === 12 && is('unused-gap', 'spacing', 'derived'), 'declared and never spent: the role is derived, and says so'],
  [!T['tw-ring-color'] && doc.$meta.platform.excluded && Object.values(doc.$meta.platform.excluded).some((e) => e.examples.includes('--tw-ring-color')), 'a framework internal (--tw-*) is left out, and counted'],
  [!T['card-pad'], 'a property declared only inside .card is not a global token'],
  [X('card').role === 'color' && X('card').twKey === 'card', `a colour spent inside box-shadow more than as a background is still a colour (${X('card').role})`],
  [!/^\{/.test(String(T['font-sans']?.$value)) && /Inter/.test(String(T['font-sans']?.$value)), `a self-referencing --font-sans resolves to the family that wins (${T['font-sans']?.$value})`],
  [X('radius').twKey === 'lg' && /rounded-lg/.test(X('radius').twKeyEvidence ?? ''), `--radius gets the product's own class name, measured from rounded-lg (${X('radius').twKey})`],
  [T['spacing-4']?.$provenance.authoredName === '--spacing-4' && /decided \d{4}-\d{2}-\d{2}/.test(T['spacing-4']?.$provenance.evidence), 'a decided spacing step carries a name and a dated decision'],
  [JSON.stringify(doc.$meta.platform.breakpoints?.screenSize) === JSON.stringify({ md: 768, lg: 1024 }), 'breakpoints from the stylesheets\' @media min-widths'],
  [doc.$meta.platform.canvas?.background?.token === 'color-surface' && doc.$meta.platform.canvas?.color?.token === 'color-foreground', 'the canvas is <body>\'s own colours, named by their tokens'],
  [doc.$meta.platform.modes?.scheme?.counts?.varies >= 2 && !doc.$meta.platform.oneTheme, 'a product with a dark theme gets a scheme mode'],
  [T['lit-ff00aa']?.$extensions?.['co.eleken.ds']?.painted === true && T['lit-ff00aa'].$provenance.label === 'derived', 'a colour painted outside the declared tokens on 2 elements becomes lit-ff00aa (derived, painted)'],
  [!T['lit-radius-13'] && doc.$meta.platform.literals?.oneOffs?.radius?.includes(13), 'a radius off the declared scale painted once is a one-off, not a lit-* token'],
  [doc.$meta.instruments.some((i) => i.name === 'ds-from-app scripts/tokens.mjs' && /^\d+\.\d+\.\d+$/.test(i.version)), 'the instrument and the plugin version are recorded'],
]));

test('an approved value survives the build; overwriting a measured token, or an undated decision, is refused', async () => {
  mkdirSync(join(dir, 'canon'), { recursive: true });
  writeFileSync(join(dir, 'canon', 'decided.tokens.json'), JSON.stringify({
    'color-warning': { $type: 'color', $value: '#B45309', $provenance: { label: 'decided', evidence: 'approved by the designer 2026-09-23: the product has no warning colour' } },
    'color-primary': { $type: 'color', $value: '#000000', $provenance: { label: 'decided', evidence: 'an attempt to overwrite 2026-09-23' } },
    'color-undated': { $type: 'color', $value: '#123456', $provenance: { label: 'decided', evidence: 'no date' } },
  }));
  const again = await run('tokens.mjs', dir);
  const doc2 = JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8'));
  assert.equal(doc2.tokens['color-warning']?.$value, '#B45309');
  assert.equal(doc2.tokens['color-primary']?.$value, 'oklch(0.55 0.2 260)');
  assert.ok(!doc2.tokens['color-undated']);
  assert.match(again.stdout, /refused 2/);
  rmSync(join(dir, 'canon', 'decided.tokens.json'));
});

test('the component layer: a colour pointing at a role or a painted value is spent as that token; one pointing at no token is refused', async () => {
  const ev = { label: 'derived', evidence: 'derived 2026-09-24 from the kit (self-test)' };
  writeFileSync(join(dir, 'canon', 'components.tokens.json'), JSON.stringify({
    'button-primary-default-background': { $type: 'color', $value: '{color-primary}', $provenance: ev },
    'chip-off-default-background': { $type: 'color', $value: '{lit-ff00aa}', $provenance: ev },
    'button-ghost-default-label': { $type: 'color', $value: '{color-nothing}', $provenance: ev },
    'button-default-focus-ring': { $type: 'color', $value: '{color-ring}', $provenance: ev },
  }));
  writeFileSync(join(dir, 'canon', 'decided.tokens.json'), JSON.stringify({ 'color-ring': { $type: 'color', $value: '{lit-ff00aa}', twKey: 'ring-role', $provenance: ev } }));
  const comp = await run('tokens.mjs', dir);
  const C = JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8')).tokens;
  const cssOf = (k) => C[k]?.$extensions?.['co.eleken.ds']?.css;
  expectAll([
    [cssOf('button-default-focus-ring') === 'var(--color-ring)' && cssOf('color-ring') === 'var(--lit-ff00aa)', `a chain merges link by link (${cssOf('button-default-focus-ring')})`],
    [cssOf('button-primary-default-background') === 'var(--color-primary)' && cssOf('chip-off-default-background') === 'var(--lit-ff00aa)' && !C['button-ghost-default-label'] && /button-ghost-default-label \(points at color-nothing/.test(comp.stdout), 'a role or a painted value is spent as that token; one pointing at no token is refused'],
  ]);
  rmSync(join(dir, 'canon', 'components.tokens.json'));
  rmSync(join(dir, 'canon', 'decided.tokens.json'));
});

test('a product with no dark theme gets no scheme mode', async () => {
  const one = fixtureRepo('dsfa-one-');
  try {
    for (const scheme of ['light', 'dark']) await run('capture.mjs', '--url', `${S.url}one-theme`, '--screen', 'fixture', '--scheme', scheme, '--out', join(one, 'baseline'), '--no-interact', '--settle', '300');
    dropPngs(join(one, 'baseline'));
    await run('tokens.mjs', one);
    const oneDoc = JSON.parse(readFileSync(join(one, 'tokens.json'), 'utf8'));
    assert.ok(!oneDoc.$meta.platform.modes?.scheme);
    assert.match(oneDoc.$meta.platform.oneTheme ?? '', /one theme/);
  } finally { rmSync(one, { recursive: true, force: true }); }
});

test('a theme switched by a class on <html>: named when missed, a mode when captured with --root-class', async () => {
  // the counterexample first: a dark capture without the class resolves light values — the build must say a dark theme exists
  const missed = fixtureRepo('dsfa-class-missed-');
  const caught = fixtureRepo('dsfa-class-caught-');
  try {
    await run('capture.mjs', '--url', `${S.url}class-theme`, '--screen', 'fixture', '--out', join(missed, 'baseline'), '--no-interact', '--settle', '300');
    await run('capture.mjs', '--url', `${S.url}class-theme`, '--screen', 'fixture', '--scheme', 'dark', '--out', join(missed, 'baseline'), '--no-interact', '--settle', '300');
    dropPngs(join(missed, 'baseline'));
    const m = await run('tokens.mjs', missed);
    assert.match(m.stdout, /a dark theme exists\. Capture it: capture\.mjs … --scheme dark --root-class dark/);
    assert.equal(JSON.parse(readFileSync(join(missed, 'tokens.json'), 'utf8')).tokens['color-primary']?.$modes?.dark, undefined);

    await run('capture.mjs', '--url', `${S.url}class-theme`, '--screen', 'fixture', '--out', join(caught, 'baseline'), '--no-interact', '--settle', '300');
    const d = await run('capture.mjs', '--url', `${S.url}class-theme`, '--screen', 'fixture', '--scheme', 'dark', '--root-class', 'dark', '--out', join(caught, 'baseline'), '--no-interact', '--settle', '300');
    assert.equal(d.status, 0, d.stderr);
    dropPngs(join(caught, 'baseline'));
    await run('tokens.mjs', caught);
    assert.equal(JSON.parse(readFileSync(join(caught, 'tokens.json'), 'utf8')).tokens['color-primary']?.$modes?.dark, 'oklch(0.7 0.15 260)', 'captured with the class, the dark value is a mode');
  } finally {
    rmSync(missed, { recursive: true, force: true });
    rmSync(caught, { recursive: true, force: true });
  }
});

test('a product with no custom properties: its tokens are derived from what it paints', async () => {
  const lit = fixtureRepo('dsfa-literal-');
  try {
    await run('capture.mjs', '--url', `${S.url}literal`, '--screen', 'dashboard', '--out', join(lit, 'baseline'), '--no-interact', '--settle', '300');
    dropPngs(join(lit, 'baseline'));
    await run('tokens.mjs', lit);
    const L = JSON.parse(readFileSync(join(lit, 'tokens.json'), 'utf8')), LT = L.tokens;
    const val = (k) => LT[k]?.$value;
    const fgs = Object.keys(LT).filter((k) => k.startsWith('fg-')).map(val);
    expectAll([
      [Object.values(LT).length > 0 && Object.values(LT).every((t) => t.$provenance.label === 'derived' && t.$provenance.counters?.nodes >= 2), `every token is derived, with counters (${Object.keys(LT).length})`],
      [Object.keys(LT).filter((k) => k.startsWith('surface-')).map(val).includes('#FFFFFF') && Object.keys(LT).filter((k) => k.startsWith('surface-')).map(val).includes('#1976D2'), 'the surfaces are the page white and the brand blue'],
      [fgs.includes('#000000DE') && fgs.includes('#00000099') && fgs.includes('#FFFFFF'), `the text colours are the body's .87 black, the muted .6 and white (${fgs.join(', ')})`],
      [!LT['spacing-2px'], 'a value one element paints on two sides is still one element'],
      [val('radius-1') === 4, 'the 4px radius painted on cards and buttons is a token'],
      [val('spacing-16px') === 16 && val('spacing-6px') === 6, 'the paddings painted more than once are tokens'],
      [val('text-14px') === 14 && val('font-weight-500') === 500, 'a font size and a weight painted on several elements are tokens'],
      [!Object.values(LT).some((t) => /FF5722/i.test(String(t.$value))), 'a colour painted once (the orange badge) is a one-off, not a token'],
      [L.$meta.platform.derived?.oneOffs?.surface?.some((v) => /255, 87, 34/.test(v)), 'the one-off is listed'],
    ]);
  } finally { rmSync(lit, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test selftest/tokens.test.mjs`
Expected: FAIL — `before` hook fails: `tokens.mjs` exits non-zero with `Cannot find module`.

- [ ] **Step 3: Move `captures_to_canon.mjs` to `scripts/tokens.mjs`**

```bash
cp ~/ds-extract-method/scripts/captures_to_canon.mjs scripts/tokens.mjs
sed -i '' -e 's#scripts/captures_to_canon\.mjs#scripts/tokens.mjs#g' \
          -e "s#'no walk_live captures given, and none in baseline/ — capture the screens first (RUN\.md §4)'#'no captures given, and none in baseline/ — capture the screens first (scripts/capture.mjs)'#" \
          -e 's#walk_live population#capture.mjs population#g' \
          -e 's#walk_live\.mjs#capture.mjs#g' \
          -e 's#(see RUN\.md)#(see references/capture.md)#' \
          scripts/tokens.mjs
```

Then edit by hand:

1. Line 1, replace `// Captures of a running product -> tokens.json, the canon the kit is built from. The platform track's figma_to_canon.` with:
   ```js
   // Captures of a running product -> tokens.json, the canon the kit is built from.
   // (Moved from ds-extract-method scripts/captures_to_canon.mjs @ebaa66f; the only change: names and the instrument version.)
   ```
2. Replace the line
   ```js
   const git = (...a) => spawnSync('git', ['-C', join(import.meta.dirname, '..'), ...a], { encoding: 'utf8' }).stdout.trim();
   ```
   with
   ```js
   const PLUGIN_VERSION = JSON.parse(readFileSync(join(import.meta.dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version;
   ```
3. Replace the three lines starting `meta.instruments = [...(meta.instruments || []).filter((i) => !/walk_live|captures_to_canon/.test(i.name)),` with:
   ```js
   meta.instruments = [...(meta.instruments || []).filter((i) => !/walk_live|captures_to_canon|capture\.mjs|tokens\.mjs/.test(i.name)),
     { name: 'ds-from-app scripts/capture.mjs', version: PLUGIN_VERSION },
     { name: 'ds-from-app scripts/tokens.mjs', version: PLUGIN_VERSION }];
   ```
4. Delete the now-unused line `import { spawnSync } from 'node:child_process';` only if `grep -n "spawnSync" scripts/tokens.mjs` shows no other use.

Run: `grep -n "walk_live\|captures_to_canon\|RUN\.md\|git(" scripts/tokens.mjs`
Expected: only comment lines remain (lines starting with `//`), e.g. the header line naming the source file. No code line.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test selftest/tokens.test.mjs`
Expected: PASS, 6 tests. The class-theme test is new (not in the source self-test): if it fails, report the output — do not change `tokens.mjs` to make it pass without saying what the instrument got wrong.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "tokens.mjs: captures_to_canon moved in with its planted shapes; the plugin version is the instrument version

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `inventory.mjs`

**Files:**
- Create from `~/ds-extract-method/scripts/inventory_seed.mjs`: `scripts/inventory.mjs`
- Create: `selftest/inventory.test.mjs`

**Interfaces:**
- Consumes: captures (Task 3), `product()` (Task 2).
- Produces: CLI `node scripts/inventory.mjs <repo>` → `<spec>/components.draft.json` = `{ _why, $meta, components: [{ name, role, recognize: { selectors, markers: string[], example? }, anatomy, states: [{ state, status, mechanism }], usage: { instances, screens, … }, provenance: { label: 'measured'|'derived', evidence } }] }`. A layout primitive carries the marker text `a layout primitive or an internal part of the library — probably not a component of the product`.

- [ ] **Step 1: Write the failing test**

`selftest/inventory.test.mjs` (checks of `selftest_platform.mjs` lines 157–163 @ebaa66f):

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { run, fixtureRepo, dropPngs, expectAll } from './helpers.mjs';

let S, dir;
before(async () => {
  S = await startServer();
  dir = fixtureRepo('dsfa-inventory-');
  for (const scheme of ['light', 'dark']) await run('capture.mjs', '--url', S.url, '--screen', 'fixture', '--scheme', scheme, '--out', join(dir, 'baseline'), '--no-interact', '--settle', '300');
  dropPngs(join(dir, 'baseline'));
});
after(() => { S.close(); rmSync(dir, { recursive: true, force: true }); });

test('the inventory draft: a library\'s own names are measured, a role alone is derived', async () => {
  const inv = await run('inventory.mjs', dir);
  assert.equal(inv.status, 0, inv.stderr);
  const D = JSON.parse(readFileSync(join(dir, 'components.draft.json'), 'utf8')).components;
  const card = D.find((c) => c.name === 'Card'), btn = D.find((c) => c.name === 'Button');
  expectAll([
    [card?.usage.instances === 2 && card.provenance.label === 'measured' && /data-slot/.test(card.recognize.markers[0]), 'the draft names what data-slot names (Card ×2, measured)'],
    [btn?.provenance.label === 'derived' && btn.states.some((s) => s.state === 'hover'), 'a plain <button> is a Button by its role (derived), with the hover the capture measured'],
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test selftest/inventory.test.mjs`
Expected: FAIL — `inventory.mjs` not found (status 1).

- [ ] **Step 3: Move `inventory_seed.mjs` to `scripts/inventory.mjs`**

```bash
cp ~/ds-extract-method/scripts/inventory_seed.mjs scripts/inventory.mjs
sed -i '' -e 's#scripts/inventory_seed\.mjs#scripts/inventory.mjs#g' \
          -e "s#c\.meta?\.tool === 'walk_live\.mjs'#c.meta?.tool === 'capture.mjs'#" \
          -e 's#walk_live#capture.mjs#g' \
          -e "s#The platform track's figma_components\.mjs\.#(Moved from ds-extract-method scripts/inventory_seed.mjs @ebaa66f.)#" \
          scripts/inventory.mjs
```

Run: `grep -n "walk_live\|inventory_seed\|figma_components" scripts/inventory.mjs; grep -c "'capture.mjs'" scripts/inventory.mjs`
Expected: the first grep prints only the header comment naming the source (`inventory_seed.mjs @ebaa66f`); the count is `1`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test selftest/inventory.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "inventory.mjs: inventory_seed moved in with its planted shapes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `flows.mjs`

**Files:**
- Create from `~/ds-extract-method/scripts/map_flows.mjs`: `scripts/flows.mjs`
- Create: `selftest/flows.test.mjs`

**Interfaces:**
- Consumes: captures (Task 3), `launch` (Task 2), `UNSAFE`, `REVEAL`, `REVEAL_ICON`, `blockWrites`, `restoreSession`, `product()`.
- Produces: CLI `node scripts/flows.mjs <repo> [--storage <session>] [--url <url> …] [--viewport WxH] [--landmark <css>] [--allow <regex>] [--deny <regex>] [--only <screen> …] [--block-writes [--reads <regex>]] [--settle <ms>]` → `<spec>/flows/flows.json` = `{ _why, mappedAt, viewport, landmark?, blockedWrites?, screens: [{ url, name, clicks?, landmark?, path, pattern, title, controls, pressed, refused: [{ name, icon?, why }], allowed?, skipped, transitions: [{ control: { role, name }, effect: { kind: 'navigate'|'open'|'change'|'none', pattern?, toScreen?, surface?, screenshot? } }] }], uncaptured?: string[] }` plus `flows/<screen>--<n>.png`. Prints `reachable but not captured (N): …`.

- [ ] **Step 1: Write the failing test**

`selftest/flows.test.mjs` (checks of `selftest_platform.mjs` lines 240–258 and 286–311 @ebaa66f; the parity checks move with `parity` in Plan 2):

```js
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { run, fixtureRepo, dropPngs, expectAll } from './helpers.mjs';

let S;
before(async () => { S = await startServer(); });
after(() => S.close());

test('a two-screen product: every transition, and the screen no capture holds', async () => {
  const fl = fixtureRepo('dsfa-flows-');
  try {
    await run('capture.mjs', '--url', `${S.url}flows/`, '--screen', 'accounts', '--out', join(fl, 'baseline'), '--no-interact', '--settle', '300');
    const mf0 = await run('flows.mjs', fl, '--settle', '250');
    assert.ok(JSON.parse(readFileSync(join(fl, 'flows', 'flows.json'), 'utf8')).uncaptured?.includes('/flows/detail/:id'));
    assert.match(mf0.stdout, /reachable but not captured/, 'a screen the product navigates to and no capture holds is named');
    await run('capture.mjs', '--url', `${S.url}flows/detail/1`, '--screen', 'account-detail', '--out', join(fl, 'baseline'), '--no-interact', '--settle', '300');
    const mf = await run('flows.mjs', fl, '--settle', '250');
    assert.equal(mf.status, 0, mf.stderr || mf.stdout);
    const F = JSON.parse(readFileSync(join(fl, 'flows', 'flows.json'), 'utf8'));
    const eff = (name) => F.screens.flatMap((x) => x.transitions).find((t) => t.control.name === name)?.effect;
    expectAll([
      [eff('Filters')?.kind === 'open' && eff('Filters')?.surface === 'dialog', 'a button that opens a dialog is recorded as open (dialog)'],
      [eff('Acme')?.kind === 'navigate' && eff('Acme')?.pattern === '/flows/detail/:id', 'a data row link navigates to the detail pattern'],
      [eff('Help')?.kind === 'none', `a press while the page is still drawing itself is not credited with its change (Help: ${eff('Help')?.kind})`],
      [eff('Activity')?.kind === 'change', 'a tab that swaps the panel is recorded as change'],
    ]);
  } finally { rmSync(fl, { recursive: true, force: true }); }
});

test('a single-URL product: screens by landmark, refusals, and the write block', async () => {
  const sp = fixtureRepo('dsfa-spa-');
  try {
    const origin = new URL(S.url).origin;
    const signedIn = join(sp, 'session.auth.json');
    writeFileSync(signedIn, JSON.stringify({ cookies: [], origins: [{ origin, localStorage: [], sessionStorage: [{ name: 'signedIn', value: '1' }] }] }));
    await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--screen', 'orders', '--as-screen', '--out', join(sp, 'baseline'), '--no-interact', '--settle', '300');
    await run('capture.mjs', '--url', `${S.url}spa/`, '--storage', signedIn, '--click', '[data-key="settings"]', '--as-screen', '--screen', 'settings', '--out', join(sp, 'baseline'), '--no-interact', '--settle', '300');
    dropPngs(join(sp, 'baseline'));

    S.resetPosts();
    const mNo = await run('flows.mjs', sp, '--storage', signedIn, '--landmark', 'h1', '--settle', '250');
    assert.ok(S.posts() > 0, 'a control named like nothing unsafe ("Sync now") writes when pressed — the name lists alone cannot stop it');
    const F0 = JSON.parse(readFileSync(join(sp, 'flows', 'flows.json'), 'utf8'));
    assert.equal(mNo.status, 0, mNo.stderr);
    assert.ok(F0.screens.find((x) => x.name === 'settings')?.refused.some((r) => r.name === 'Order history'), 'without --allow, a menu item named like an action on data is refused');

    S.resetPosts();
    const mf2 = await run('flows.mjs', sp, '--storage', signedIn, '--landmark', 'h1', '--allow', 'Order history', '--settle', '250', '--block-writes');
    const raw = readFileSync(join(sp, 'flows', 'flows.json'), 'utf8');
    const F2 = JSON.parse(raw);
    const on = (scr, name) => F2.screens.find((x) => x.name === scr)?.transitions.find((t) => t.control.name === name)?.effect;
    const refusedOn = (scr) => F2.screens.find((x) => x.name === scr)?.refused || [];
    expectAll([
      [S.posts() === 0 && F2.blockedWrites?.includes('POST /spa/api/sync'), '--block-writes: the same press reaches the server as nothing, and the block is listed'],
      [mf2.status === 0 && F2.screens.length === 2, 'both screens of the single-URL product are mapped'],
      [on('orders', 'Settings')?.kind === 'navigate' && on('orders', 'Settings')?.toScreen === 'settings', 'a menu item that swaps the page in place navigates to the other screen (by its landmark)'],
      [on('settings', 'Order history')?.toScreen === 'orders' && F2.screens.find((x) => x.name === 'settings')?.allowed?.some((a) => a.name === 'Order history'), '--allow lets a named menu item through, and says so'],
      [refusedOn('settings').some((r) => r.name === 'Show' && /unmask/.test(r.why)), 'a "Show" button beside a secret is refused, not pressed'],
      [refusedOn('settings').some((r) => !r.name && r.icon === 'delete'), 'an unnamed icon button drawing a trash can is refused by its icon'],
      [!/sk_live_PLANTED/.test(raw), 'the secret appears nowhere in flows.json'],
    ]);
  } finally { rmSync(sp, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test selftest/flows.test.mjs`
Expected: FAIL — `flows.json` missing (`ENOENT`) because `flows.mjs` does not exist.

- [ ] **Step 3: Move `map_flows.mjs` to `scripts/flows.mjs`**

```bash
cp ~/ds-extract-method/scripts/map_flows.mjs scripts/flows.mjs
sed -i '' -e 's#scripts/map_flows\.mjs#scripts/flows.mjs#g' \
          -e "s#^import { chromium } from 'playwright';#import { launch } from './lib/browser.mjs';#" \
          -e 's#^const browser = await chromium\.launch();#const browser = await launch();#' \
          -e "s#c\.meta?\.tool === 'walk_live\.mjs'#c.meta?.tool === 'capture.mjs'#" \
          -e 's#walk_live\.mjs#capture.mjs#g' \
          -e 's#prototype_parity\.mjs checks it#the Workbench repo'"'"'s tools/parity.mjs checks it#' \
          scripts/flows.mjs
```

Then edit line 1 by hand: replace `// Every transition a running product offers, read-only — the checklist a prototype must reproduce.` with:

```js
// Every transition a running product offers, read-only — the checklist a prototype must reproduce.
// (Moved from ds-extract-method scripts/map_flows.mjs @ebaa66f; changes: names, the browser launcher.)
```

Run: `grep -n "walk_live\|map_flows\|from 'playwright'\|chromium\.\|prototype_parity" scripts/flows.mjs`
Expected: only the header comment line naming `map_flows.mjs @ebaa66f`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test selftest/flows.test.mjs`
Expected: PASS, 2 tests.

- [ ] **Step 5: Run the whole self-test**

Run: `npm run selftest`
Expected: PASS — capture (3), tokens (6), inventory (1), flows (2).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "flows.mjs: map_flows moved in with its planted shapes, on the designer's Chrome

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `preflight.mjs`

**Files:**
- Create: `scripts/preflight.mjs`, `tests/preflight.test.mjs`

**Interfaces:**
- Consumes: `findChrome` from `scripts/lib/browser.mjs`.
- Produces: exported `checkNode(version?)`, `checkDeps(root?)`, `checkBrowser({ chrome?, bundled? }?)` (async), `checkGit()`, `checkDisk(freeBytes?, needBytes = 1e9)` — each returns `{ id: 'node'|'deps'|'browser'|'git'|'disk', ok: boolean, blocking: true, have: string, need: string, fix: string }`. CLI `node scripts/preflight.mjs [--json]`: prints one line per check (`✓`/`✗`, and `fix:` under each failure), or the JSON array; exit 1 when a blocking check fails. Importing the module runs nothing.

- [ ] **Step 1: Write the failing test**

`tests/preflight.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkNode, checkDeps, checkBrowser, checkDisk, checkGit } from '../scripts/preflight.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Node: 22 and later pass, 20 does not, and the fix says where to get it', () => {
  assert.equal(checkNode('20.11.0').ok, false);
  assert.equal(checkNode('22.0.0').ok, true);
  assert.equal(checkNode('26.7.0').ok, true);
  assert.match(checkNode('20.11.0').fix, /nodejs\.org/);
});

test('plugin dependencies: missing → the npm install command for that folder', () => {
  const empty = mkdtempSync(join(tmpdir(), 'dsfa-pre-'));
  try {
    const r = checkDeps(empty);
    assert.equal(r.ok, false);
    assert.ok(r.fix.includes(`npm install --prefix "${empty}"`));
  } finally { rmSync(empty, { recursive: true, force: true }); }
  assert.equal(checkDeps(ROOT).ok, true);
});

test('browser: none → how to get one; Chrome found → ok', async () => {
  const none = await checkBrowser({ chrome: null, bundled: '/nonexistent/chromium' });
  assert.equal(none.ok, false);
  assert.match(none.fix, /Google Chrome/);
  assert.match(none.fix, /npx playwright install chromium/);
  assert.equal((await checkBrowser({ chrome: process.execPath, bundled: null })).ok, true);
});

test('disk: under 1 GB free blocks', () => {
  assert.equal(checkDisk(5e8).ok, false);
  assert.equal(checkDisk(5e9).ok, true);
});

test('git is found on this machine', () => {
  assert.equal(checkGit().ok, true);
});

test('CLI --json: five checks, exit 0 on a ready machine', async () => {
  const r = await new Promise((ok) => execFile('node', [join(ROOT, 'scripts', 'preflight.mjs'), '--json'], (e, out) => ok({ code: e ? e.code : 0, out })));
  assert.deepEqual(JSON.parse(r.out).map((c) => c.id), ['node', 'deps', 'browser', 'git', 'disk']);
  assert.equal(r.code, 0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/preflight.test.mjs`
Expected: FAIL — `Cannot find module …/scripts/preflight.mjs`.

- [ ] **Step 3: Write `scripts/preflight.mjs`**

```js
#!/usr/bin/env node
// What this machine is missing before an extraction, and the exact command that fixes each.
//
//   node scripts/preflight.mjs [--json]      exit 1 when anything blocking is missing
//
// An extraction with no browser is a guess; one that stops halfway for disk space leaves half a baseline.
import { existsSync, statfsSync } from 'node:fs';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './lib/browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEED_NODE = 22;

export function checkNode(version = process.versions.node) {
  const major = Number(String(version).split('.')[0]);
  return { id: 'node', ok: major >= NEED_NODE, blocking: true, have: version, need: `>= ${NEED_NODE}`, fix: 'install the current Node LTS from https://nodejs.org (or: brew install node)' };
}

export function checkDeps(root = ROOT) {
  const ok = existsSync(join(root, 'node_modules', 'playwright-core', 'package.json'));
  return { id: 'deps', ok, blocking: true, have: ok ? 'installed' : 'missing', need: 'playwright-core in the plugin folder', fix: `npm install --prefix "${root}"` };
}

async function bundledChromium() {
  try { const { chromium } = await import('playwright-core'); return chromium.executablePath(); } catch { return null; }
}

export async function checkBrowser({ chrome = findChrome(), bundled } = {}) {
  const b = bundled === undefined ? await bundledChromium() : bundled;
  const have = chrome || (b && existsSync(b) ? b : null);
  return { id: 'browser', ok: Boolean(have), blocking: true, have: have ?? 'none found', need: 'Google Chrome, or Playwright\'s Chromium', fix: 'install Google Chrome (https://www.google.com/chrome/), or run: npx playwright install chromium' };
}

export function checkGit() {
  const r = spawnSync('git', ['--version'], { encoding: 'utf8' });
  const ok = r.status === 0;
  return { id: 'git', ok, blocking: true, have: ok ? r.stdout.trim() : 'missing', need: 'git', fix: 'macOS: xcode-select --install; elsewhere: https://git-scm.com/downloads' };
}

const freeBytes = () => { const s = statfsSync(homedir()); return s.bavail * s.bsize; };

export function checkDisk(free = freeBytes(), need = 1e9) {
  return { id: 'disk', ok: free >= need, blocking: true, have: `${(free / 1e9).toFixed(1)} GB free`, need: `${need / 1e9} GB`, fix: 'free some disk space: every captured screen keeps a full-page screenshot' };
}

async function main() {
  const results = [checkNode(), checkDeps(), await checkBrowser(), checkGit(), checkDisk()];
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 1));
  else for (const r of results) console.log(r.ok ? `✓ ${r.id}: ${r.have}` : `✗ ${r.id}: ${r.have} (need ${r.need})\n    fix: ${r.fix}`);
  process.exit(results.some((r) => r.blocking && !r.ok) ? 1 : 0);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/preflight.test.mjs && node scripts/preflight.mjs`
Expected: PASS, 6 tests; then five `✓` lines.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "preflight.mjs: what the machine is missing, and the command that fixes it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `scaffold.mjs init` — the product repository, before any capture

**Files:**
- Create: `scripts/scaffold.mjs`, `tests/scaffold.test.mjs`

**Interfaces:**
- Consumes: `.claude-plugin/plugin.json` version.
- Produces: CLI `node scripts/scaffold.mjs init <dir> --product "<Name>" --url <app-url>`. Creates (never overwrites): `extraction/baseline/.gitkeep`, `extraction/canon/.gitkeep`, `extraction/capture-manifest.json` = `{ _why, tool: 'ds-from-app', toolVersion, product, slug, entryPoint, createdAt: 'YYYY-MM-DD', screens: [], viewports: [], colorSchemes: [] }`, `extraction/tokens.json` = `{ $closure: <closure sentence containing "NEEDS-TOKEN">, $meta: { product, extractedAt: null, instruments: [], screens: { captured: [], notReached: [] }, derivationPolicy: { colorDerivation: 'forbidden', … } }, tokens: {} }`, `.gitignore` (contains `*.auth.json`), and `git init`. Exit 2: the folder has other content and no `extraction/capture-manifest.json`, or `git init` failed. `slug` = ASCII slug of the product name, else of the folder name, else `product`. Plan 2 adds the `workbench` subcommand to this file.

- [ ] **Step 1: Write the failing test**

`tests/scaffold.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/scaffold.test.mjs`
Expected: FAIL — status 1, `Cannot find module …/scripts/scaffold.mjs`.

- [ ] **Step 3: Write `scripts/scaffold.mjs`**

```js
#!/usr/bin/env node
// The product's own repository — created FIRST, before any capture, so every capture lands where it is kept and the
// extraction can be reproduced from it.
//
//   node scripts/scaffold.mjs init <dir> --product "<Name>" --url <app-url>
//
// Creates extraction/ (baseline/, canon/, capture-manifest.json, tokens.json carrying the closure sentence),
// .gitignore (sign-in sessions never enter the repository) and `git init`. Run again on a repository it made, it
// creates only what is missing and overwrites nothing. A folder with other content is refused.
// (The Workbench part — `scaffold.mjs workbench` — comes in the next version.)
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VERSION = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).version;
// One sentence in every machine file of the set (spec rule 6). Measured in the method this came from: with it,
// off-system output fell from 18 of 29 runs to 3 of 30 (research/_exp/closure/ in ds-extract-method) — never to zero.
const CLOSURE = 'This set is closed: no other token name exists, no literal value may be written, and no new component may be drawn. When something needed is not here, emit NEEDS-TOKEN / NEEDS-COMPONENT / NEEDS-STATE naming what was missing — never invent, never approximate, never fall back to a literal. Every NEEDS-* is a candidate row in GAPS.md.';
const GITIGNORE = ['node_modules/', '.DS_Store', '# sign-in sessions never enter the repository', '*.auth.json', '.session/', '# capture runs that are not the baseline', 'extraction/runs/', ''].join('\n');
const slugOf = (...names) => {
  for (const n of names) { const s = String(n ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); if (s) return s; }
  return 'product';
};

const [cmd, dirArg, ...rest] = process.argv.slice(2);
const opt = (k) => { const i = rest.indexOf(`--${k}`); return i > -1 ? rest[i + 1] : undefined; };
if (cmd !== 'init' || !dirArg) { console.error('usage: node scripts/scaffold.mjs init <dir> --product "<Name>" --url <app-url>'); process.exit(1); }

const dir = resolve(process.env.INIT_CWD || process.cwd(), dirArg);
const manifest = join(dir, 'extraction', 'capture-manifest.json');
if (existsSync(dir) && readdirSync(dir).some((f) => f !== '.DS_Store') && !existsSync(manifest)) {
  console.error(`refused: ${dir} has other content and is not a ds-from-app repository — choose a new or empty folder`);
  process.exit(2);
}

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
  _why: 'What makes a capture reproducible: which app, which tool. Every number in the extraction traces here.',
  tool: 'ds-from-app', toolVersion: VERSION, product, slug: slugOf(product, basename(dir)), entryPoint: opt('url') || null,
  createdAt: new Date().toISOString().slice(0, 10), screens: [], viewports: [], colorSchemes: [],
}, null, 2) + '\n');
put('extraction/tokens.json', JSON.stringify({
  $closure: CLOSURE,
  $meta: {
    product, extractedAt: null, instruments: [], screens: { captured: [], notReached: [] },
    derivationPolicy: { colorDerivation: 'forbidden', enforcement: { detects: ['hex', 'numeric-rgb-hsl', 'color-mix'] }, _note: 'The default is the strict one. Relax it deliberately, and say why here.' },
  },
  tokens: {},
}, null, 2) + '\n');
put('.gitignore', GITIGNORE);
if (!existsSync(join(dir, '.git'))) {
  const g = spawnSync('git', ['init', '-q'], { cwd: dir });
  if (g.status !== 0) { console.error('git init failed — is git installed? (node scripts/preflight.mjs)'); process.exit(2); }
  made.push('.git');
}
console.log(made.length ? `${dir}: created ${made.join(', ')}` : `${dir}: already a ds-from-app repository — nothing to create`);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/scaffold.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "scaffold.mjs init: the product repository before any capture, with the closure sentence

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: `checkpoint.mjs prepare`

**Files:**
- Create: `scripts/checkpoint.mjs` (the `prepare` half; Task 10 adds `serve`), `tests/checkpoint.test.mjs`

**Interfaces:**
- Consumes: `<spec>/tokens.json` (Task 4 shape), `<spec>/components.draft.json` (Task 5), `<spec>/flows/flows.json` (Task 6), `<spec>/baseline/*.json` captures (Task 3: `meta.screen`, `meta.colorScheme`, `meta.screenshot`, `meta.finalUrl`, `meta.requestedUrl`, `meta.looksLikeSignIn`), `product()`.
- Produces: CLI `node scripts/checkpoint.mjs prepare <repo>` → `<spec>/checkpoint.json`:
  ```
  { project, source, preparedAt,
    screens:    [{ id, name, url, screenshot: 'baseline/<file>.png' | null, looksLikeSignIn?: true, transitions: number | null }],
    tokens:     [{ id, name, value, dark?, group, label: 'measured'|'derived'|'decided'|'unknown', roleLabel?, nameStatus: 'product'|'proposed'|'decided', evidence, uses?: { kind: 'elements'|'rules', n } }],
    components: [{ id, name, nameStatus: 'product'|'proposed', label, instances, screens, states: string[], part: boolean, include: boolean }],
    excluded:   [{ id, what, why }]   — kept from an earlier checkpoint.json (Claude writes these),
    questions:  [{ id, text, options }] — kept likewise }
  ```
  `nameStatus`: `decided` when `$provenance.label === 'decided'`; else `product` when `$provenance.authoredName` exists; else `proposed`. One screen card per `meta.screen`, the light capture when there is one. Exit 2 when `tokens.json` holds no token.

- [ ] **Step 1: Write the failing test**

`tests/checkpoint.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cp = (...a) => new Promise((ok) => execFile('node', [join(ROOT, 'scripts', 'checkpoint.mjs'), ...a], (e, stdout, stderr) => ok({ status: e ? e.code : 0, stdout, stderr })));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const EXT = 'co.eleken.ds';

// An extraction as the scripts leave it, small enough to read: two schemes of one Cyrillic-named screen.
function makeExtraction(tokens) {
  const repo = mkdtempSync(join(tmpdir(), 'dsfa-cp-'));
  const spec = join(repo, 'extraction');
  mkdirSync(join(spec, 'baseline'), { recursive: true });
  mkdirSync(join(spec, 'flows'), { recursive: true });
  writeFileSync(join(spec, 'capture-manifest.json'), JSON.stringify({ product: 'Політики' }));
  writeFileSync(join(spec, 'tokens.json'), JSON.stringify({ $closure: 'closed', $meta: { platform: { source: { url: 'https://app.test/' } } }, tokens }));
  for (const scheme of ['dark', 'light']) {
    const base = `огляд--1440x900--${scheme}`;
    writeFileSync(join(spec, 'baseline', `${base}.png`), PNG);
    writeFileSync(join(spec, 'baseline', `${base}.json`), JSON.stringify({ meta: { tool: 'capture.mjs', screen: 'огляд', colorScheme: scheme, requestedUrl: 'https://app.test/', finalUrl: 'https://app.test/', screenshot: `/elsewhere/${base}.png` } }));
  }
  writeFileSync(join(spec, 'baseline', 'вхід--1440x900--light.json'), JSON.stringify({ meta: { tool: 'capture.mjs', screen: 'вхід', colorScheme: 'light', requestedUrl: 'https://app.test/login', looksLikeSignIn: true } }));
  writeFileSync(join(spec, 'baseline', 'old--1440x900--light.json'), JSON.stringify({ meta: { tool: 'walk_live.mjs', screen: 'old' } }));
  writeFileSync(join(spec, 'flows', 'flows.json'), JSON.stringify({ screens: [{ name: 'огляд', transitions: [{}, {}, {}] }] }));
  writeFileSync(join(spec, 'components.draft.json'), JSON.stringify({ components: [
    { name: 'Card', provenance: { label: 'measured' }, usage: { instances: 2, screens: 1 }, states: [{ state: 'default' }, { state: 'hover' }], recognize: { markers: ['named by data-slot'] } },
    { name: 'Box', provenance: { label: 'measured' }, usage: { instances: 9, screens: 1 }, states: [], recognize: { markers: ['named by MUI', 'a layout primitive or an internal part of the library — probably not a component of the product'] } },
    { name: 'Button', provenance: { label: 'derived' }, usage: { instances: 3, screens: 1 }, states: [{ state: 'focus-visible' }], recognize: { markers: ['named by role'] } },
  ] }));
  return { repo, spec };
}

const DECLARED = {
  'text-2': { $type: 'color', $value: '#5E5E5E', $modes: { light: '#5E5E5E', dark: '#AAAAAA' }, $provenance: { label: 'measured', authoredName: '--text-2', evidence: 'declared on ":root"' }, $extensions: { [EXT]: { role: 'color', roleProvenance: { label: 'measured', evidence: 'spent in color ×9' }, usage: { rules: 9 } } } },
  'radius-card': { $type: 'dimension', $value: 8, $provenance: { label: 'measured', authoredName: '--radius-card', evidence: 'declared on ":root"' }, $extensions: { [EXT]: { role: 'radius', roleProvenance: { label: 'derived', evidence: 'from the value and name' } } } },
  'spacing-4': { $type: 'dimension', $value: 16, $provenance: { label: 'decided', authoredName: '--spacing-4', evidence: 'decided 2026-10-12' }, $extensions: { [EXT]: { role: 'spacing' } } },
  'surface-1': { $type: 'color', $value: '#FFFFFF', $provenance: { label: 'derived', evidence: 'painted on 40 elements', counters: { nodes: 40, screens: 1 } }, $extensions: { [EXT]: { role: 'color', roleProvenance: { label: 'derived' } } } },
};

test('prepare: screens, tokens with labels and name status, components, the sign-in flag', async () => {
  const { repo, spec } = makeExtraction(DECLARED);
  try {
    const r = await cp('prepare', repo);
    assert.equal(r.status, 0, r.stderr);
    const c = JSON.parse(readFileSync(join(spec, 'checkpoint.json'), 'utf8'));
    assert.equal(c.project, 'Політики');
    assert.equal(c.source, 'https://app.test/');
    const scr = Object.fromEntries(c.screens.map((s) => [s.id, s]));
    assert.deepEqual(Object.keys(scr).sort(), ['вхід', 'огляд'], 'one card per screen; a capture of another tool is ignored');
    assert.equal(scr['огляд'].screenshot, 'baseline/огляд--1440x900--light.png', 'the light screenshot, found next to the capture');
    assert.equal(scr['огляд'].transitions, 3);
    assert.equal(scr['вхід'].looksLikeSignIn, true);
    assert.equal(scr['вхід'].screenshot, null);
    const tok = Object.fromEntries(c.tokens.map((t) => [t.id, t]));
    assert.equal(tok['text-2'].nameStatus, 'product');
    assert.equal(tok['text-2'].label, 'measured');
    assert.equal(tok['text-2'].dark, '#AAAAAA');
    assert.deepEqual(tok['text-2'].uses, { kind: 'rules', n: 9 });
    assert.equal(tok['radius-card'].value, '8px');
    assert.equal(tok['radius-card'].roleLabel, 'derived');
    assert.equal(tok['spacing-4'].nameStatus, 'decided');
    assert.equal(tok['surface-1'].nameStatus, 'proposed');
    assert.deepEqual(tok['surface-1'].uses, { kind: 'elements', n: 40 });
    const comp = Object.fromEntries(c.components.map((x) => [x.id, x]));
    assert.equal(comp.Card.include, true);
    assert.deepEqual(comp.Card.states, ['hover']);
    assert.equal(comp.Box.part, true);
    assert.equal(comp.Box.include, false, 'a layout primitive starts unticked');
    assert.equal(comp.Button.nameStatus, 'proposed');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('prepare again keeps what Claude added: excluded parts and questions', async () => {
  const { repo, spec } = makeExtraction(DECLARED);
  try {
    await cp('prepare', repo);
    const f = join(spec, 'checkpoint.json');
    const c = JSON.parse(readFileSync(f, 'utf8'));
    c.excluded = [{ id: 'role-switch', what: 'Перемикач Admin / User', why: 'лише для показу прототипу' }];
    c.questions = [{ id: 'role', text: 'Чиї це екрани?', options: ['Admin', 'User'] }];
    writeFileSync(f, JSON.stringify(c));
    await cp('prepare', repo);
    const again = JSON.parse(readFileSync(f, 'utf8'));
    assert.equal(again.excluded[0].id, 'role-switch');
    assert.equal(again.questions[0].id, 'role');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('an app with no custom properties: every token is a proposed name', async () => {
  const { repo, spec } = makeExtraction({ 'surface-1': DECLARED['surface-1'], 'fg-1': { ...DECLARED['surface-1'], $value: '#111111' } });
  try {
    await cp('prepare', repo);
    const c = JSON.parse(readFileSync(join(spec, 'checkpoint.json'), 'utf8'));
    assert.ok(c.tokens.length === 2 && c.tokens.every((t) => t.nameStatus === 'proposed'));
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('prepare with no tokens yet says what to run', async () => {
  const { repo } = makeExtraction({});
  try {
    const r = await cp('prepare', repo);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /tokens\.mjs/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/checkpoint.test.mjs`
Expected: FAIL — status 1, `Cannot find module …/scripts/checkpoint.mjs`.

- [ ] **Step 3: Write `scripts/checkpoint.mjs` with `prepare`**

```js
#!/usr/bin/env node
// The designer's checkpoint: what the extraction found, on one local page, decided before anything is built.
// Adapted from prototype-storybook 0.1.2 scripts/checkpoint.mjs (Eleken): the page shell, the /save route, the
// "earlier answers win" merge and the localhost-only server are its. The test-flow choice, the provenance labels, the
// prototype-only list and the page's language are this plugin's.
//
//   node scripts/checkpoint.mjs prepare <repo>     extraction/{tokens.json, components.draft.json, flows/, baseline/}
//                                                  -> extraction/checkpoint.json (keeps `excluded` and `questions`)
//   node scripts/checkpoint.mjs serve <repo> [--port 6020] [--lang uk|en]
//        the page at http://localhost:<port>; Done writes extraction/decisions.json and the process exits 0.
//
// Claude adds to checkpoint.json before `serve`, by editing it:
//   excluded:  [{ id, what, why }]             parts that look prototype-only (role switchers, demo toggles) — unticked
//   questions: [{ id, text, options: [...] }]  only what the designer can answer
import fs from 'node:fs';
import path from 'node:path';
import { product } from './lib/product.mjs';

const EXT = 'co.eleken.ds';
const USAGE = 'usage: node scripts/checkpoint.mjs prepare|serve <repo> [--port 6020] [--lang uk|en]';
const [cmd, repoArg, ...rest] = process.argv.slice(2);
const opt = (k, d) => { const i = rest.indexOf(`--${k}`); return i > -1 ? rest[i + 1] : d; };
if (!['prepare', 'serve'].includes(cmd)) { console.error(USAGE); process.exit(1); }
const P = product(repoArg, USAGE);
const readJson = (rel, fallback = null) => { const f = path.join(P.spec, rel); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback; };

function prepare() {
  const doc = readJson('tokens.json');
  if (!doc || !Object.keys(doc.tokens ?? {}).length) { console.error('no tokens yet — run: node scripts/tokens.mjs <repo>'); process.exit(2); }
  const prev = readJson('checkpoint.json', {});
  const baseDir = path.join(P.spec, 'baseline');
  const caps = fs.existsSync(baseDir)
    ? fs.readdirSync(baseDir).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(fs.readFileSync(path.join(baseDir, f), 'utf8'))).filter((c) => c.meta?.tool === 'capture.mjs')
    : [];
  const flows = readJson(path.join('flows', 'flows.json'), { screens: [] });
  const screens = new Map();
  for (const c of caps) {
    const id = c.meta.screen;
    if (screens.has(id) && (c.meta.colorScheme || 'light') !== 'light') continue; // one card per screen: the light capture when there is one
    const png = c.meta.screenshot ? path.join(baseDir, path.basename(c.meta.screenshot)) : null;
    screens.set(id, {
      id, name: id, url: c.meta.finalUrl || c.meta.requestedUrl,
      screenshot: png && fs.existsSync(png) ? path.relative(P.spec, png).split(path.sep).join('/') : null,
      looksLikeSignIn: c.meta.looksLikeSignIn || undefined,
      transitions: flows.screens?.find((s) => s.name === id)?.transitions?.length ?? null,
    });
  }
  const nameStatus = (t) => (t.$provenance?.label === 'decided' ? 'decided' : t.$provenance?.authoredName ? 'product' : 'proposed');
  const shown = (t) => (t.$type === 'dimension' && typeof t.$value === 'number' ? `${t.$value}px` : typeof t.$value === 'object' ? JSON.stringify(t.$value) : String(t.$value));
  const tokens = Object.entries(doc.tokens).map(([key, t]) => {
    const x = t.$extensions?.[EXT] ?? {};
    const nodes = t.$provenance?.counters?.nodes;
    return {
      id: key, name: key, value: shown(t), dark: t.$modes?.dark != null ? String(t.$modes.dark) : undefined,
      group: x.role ?? 'other', label: t.$provenance?.label ?? 'unknown', roleLabel: x.roleProvenance?.label,
      nameStatus: nameStatus(t), evidence: String(t.$provenance?.evidence ?? '').slice(0, 300),
      uses: nodes != null ? { kind: 'elements', n: nodes } : x.usage?.rules ? { kind: 'rules', n: x.usage.rules } : undefined,
    };
  });
  const draft = readJson('components.draft.json', { components: [] });
  const components = (draft.components ?? []).map((c) => {
    const part = (c.recognize?.markers ?? []).some((m) => /layout primitive or an internal part/.test(m));
    return {
      id: c.name, name: c.name, nameStatus: c.provenance?.label === 'measured' ? 'product' : 'proposed', label: c.provenance?.label ?? 'unknown',
      instances: c.usage?.instances ?? null, screens: c.usage?.screens ?? null,
      states: (c.states ?? []).map((s) => s.state).filter((s) => s !== 'default'), part, include: !part,
    };
  });
  const out = {
    project: P.name, source: doc.$meta?.platform?.source?.url ?? caps[0]?.meta.requestedUrl ?? '', preparedAt: new Date().toISOString(),
    screens: [...screens.values()], tokens, components, excluded: prev.excluded ?? [], questions: prev.questions ?? [],
  };
  fs.writeFileSync(path.join(P.spec, 'checkpoint.json'), JSON.stringify(out, null, 1) + '\n');
  console.log(`checkpoint.json: ${out.screens.length} screen(s), ${tokens.length} token(s) (${tokens.filter((t) => t.nameStatus === 'proposed').length} with proposed names), ${components.length} component candidate(s); kept ${out.excluded.length} excluded part(s), ${out.questions.length} question(s)`);
}

function serve() {
  console.error('serve: not built yet'); // Task 10
  process.exit(1);
}

if (cmd === 'prepare') prepare(); else serve();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/checkpoint.test.mjs`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "checkpoint.mjs prepare: screens, labelled tokens, components and the sign-in flag on one list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `checkpoint.mjs serve` — the designer's page

**Files:**
- Modify: `scripts/checkpoint.mjs` (replace the `serve()` stub; add `http` import, strings and the page)
- Create: `tests/checkpoint-page.test.mjs`

**Interfaces:**
- Consumes: `<spec>/checkpoint.json` (Task 9 shape, plus `excluded`, `questions`); `launch` (Task 2) in the test; `makeExtraction` is NOT imported — the page test writes its own `checkpoint.json`.
- Produces: CLI `node scripts/checkpoint.mjs serve <repo> [--port 6020] [--lang uk|en]`: prints `checkpoint for <project>: http://localhost:<port> — waiting …`; `GET /` the page; `GET /preview/<encoded path under extraction/>.png` the screenshot (404 outside `extraction/` or not `.png`); `POST /save` (JSON only) writes `<spec>/decisions.json` and exits 0:
  ```
  { project, source, savedAt, lang, comment,
    flow: { name, screens: [screen ids, in list order] },
    questions: [{ id, text, options, answer }], screens: [...as in checkpoint.json],
    tokens: [{ ...checkpoint item, name }], components: [{ ...item, include, name }], excluded: [{ ...item, include }] }
  ```
  Re-running `serve` pre-fills the page from an existing `decisions.json` (flow screens, flow name, names, include, answers, comment). Exit 2 when `checkpoint.json` is missing or the port is in use (message: `port <p> is in use — run again with --port <p+1>`).
- Page element contract (the test relies on it): a flow card is `label.screen[data-kind="flow"][data-id=<id>]` with one `input[type=checkbox]`; token rows `.row[data-kind="tokens"][data-id]` (proposed ones hold `input[type=text]`); component rows `.row[data-kind="components"][data-id]` with `input[type=checkbox]`; excluded rows `.row[data-kind="excluded"][data-id]`; questions `.q[data-id]` with radio inputs; the flow name `#flow-name`; the comment `#comment`; the button `#done`.

- [ ] **Step 1: Write the failing test**

`tests/checkpoint-page.test.mjs` — real mouse clicks at element coordinates (synthetic `el.click()` would not catch an overlay or `pointer-events` problem), plus a contrast check in both colour schemes:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from '../scripts/lib/browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const freePort = () => new Promise((ok) => { const s = createServer(); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });

function repoWithCheckpoint() {
  const repo = mkdtempSync(join(tmpdir(), 'dsfa-page-'));
  const spec = join(repo, 'extraction');
  mkdirSync(join(spec, 'baseline'), { recursive: true });
  writeFileSync(join(spec, 'capture-manifest.json'), JSON.stringify({ product: 'Політики' }));
  writeFileSync(join(spec, 'baseline', 'огляд--1440x900--light.png'), PNG);
  writeFileSync(join(spec, 'checkpoint.json'), JSON.stringify({
    project: 'Політики', source: 'https://app.test/',
    screens: [
      { id: 'огляд', name: 'огляд', url: 'https://app.test/', screenshot: 'baseline/огляд--1440x900--light.png', transitions: 3 },
      { id: 'вхід', name: 'вхід', url: 'https://app.test/login', screenshot: null, looksLikeSignIn: true, transitions: null },
    ],
    tokens: [
      { id: 'text-2', name: 'text-2', value: '#5E5E5E', group: 'color', label: 'measured', nameStatus: 'product', evidence: 'declared on ":root"', uses: { kind: 'rules', n: 9 } },
      { id: 'surface-1', name: 'surface-1', value: '#FFFFFF', group: 'color', label: 'derived', nameStatus: 'proposed', evidence: 'painted on 40 elements', uses: { kind: 'elements', n: 40 } },
      { id: 'spacing-4', name: 'spacing-4', value: '16px', group: 'spacing', label: 'decided', nameStatus: 'decided', evidence: 'decided 2026-10-12' },
    ],
    components: [
      { id: 'Card', name: 'Card', nameStatus: 'product', label: 'measured', instances: 2, screens: 1, states: ['hover'], part: false, include: true },
      { id: 'Button', name: 'Button', nameStatus: 'proposed', label: 'derived', instances: 3, screens: 1, states: [], part: false, include: true },
    ],
    excluded: [{ id: 'role-switch', what: 'Перемикач Admin / User', why: 'лише для показу прототипу' }],
    questions: [{ id: 'role', text: 'Чиї це екрани?', options: ['Admin', 'User'] }],
  }));
  return { repo, spec };
}

function startServe(repo, port, extra = []) {
  const child = spawn('node', [join(ROOT, 'scripts', 'checkpoint.mjs'), 'serve', repo, '--port', String(port), ...extra]);
  let out = '', err = '';
  child.stdout.on('data', (d) => (out += d));
  child.stderr.on('data', (d) => (err += d));
  const ready = new Promise((ok, fail) => {
    const t = setInterval(() => { if (/waiting/.test(out)) { clearInterval(t); ok(); } }, 50);
    child.on('exit', (code) => { clearInterval(t); fail(new Error(`serve exited ${code}: ${err}`)); });
  });
  ready.catch(() => {}); // a test that expects the exit never awaits `ready`; awaiting it still throws
  const exited = new Promise((ok) => child.on('exit', (code) => ok({ code, out, err })));
  return { child, ready, exited };
}

const clickAt = async (page, locator, opts = {}) => {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  assert.ok(b, 'element is on the page');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2, opts);
};

// Every visible text node's colour against the first opaque background behind it: WCAG AA (4.5, or 3 for large text).
const CONTRAST = () => {
  const rgba = (s) => { const m = s.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; return { r: m[0], g: m[1], b: m[2], a: m[3] ?? 1 }; };
  const lum = ({ r, g, b }) => [r, g, b].map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const c = rgba(getComputedStyle(n).backgroundColor); if (c.a > 0.99) return c; } return { r: 255, g: 255, b: 255, a: 1 }; };
  const bad = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!t.textContent.trim() || !el || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const bg = bgOf(el), fg = over(rgba(cs.color), bg);
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) bad.push(`${t.textContent.trim().slice(0, 30)} — ${ratio.toFixed(2)}`);
  }
  return bad;
};

test('the designer decides with real clicks; Done writes decisions.json; re-opening keeps the choices', async () => {
  const { repo, spec } = repoWithCheckpoint();
  const port = await freePort();
  const browser = await launch();
  try {
    const s1 = startServe(repo, port);
    await s1.ready;
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${port}/`);
    assert.equal(await page.textContent('#done'), 'Готово', 'the page speaks Ukrainian by default');
    assert.match(await page.textContent('[data-kind="flow"][data-id="вхід"]'), /сторінку входу/, 'a sign-in capture is marked');

    const shot = await page.request.get(`http://localhost:${port}/preview/${encodeURIComponent('baseline/огляд--1440x900--light.png')}`);
    assert.equal(shot.status(), 200, 'a Cyrillic screenshot is served');
    assert.equal((await page.request.get(`http://localhost:${port}/preview/${encodeURIComponent('../capture-manifest.json')}`)).status(), 404);

    assert.deepEqual(await page.evaluate(CONTRAST), [], 'every text meets AA contrast (light)');
    await page.emulateMedia({ colorScheme: 'dark' });
    assert.deepEqual(await page.evaluate(CONTRAST), [], 'every text meets AA contrast (dark)');
    await page.emulateMedia({ colorScheme: 'light' });

    await clickAt(page, page.locator('[data-kind="flow"][data-id="огляд"] input[type=checkbox]'));
    const proposed = page.locator('[data-kind="tokens"][data-id="surface-1"] input[type=text]');
    await clickAt(page, proposed, { clickCount: 3 });
    await page.keyboard.type('surface-page');
    await clickAt(page, page.locator('[data-kind="components"][data-id="Button"] input[type=checkbox]'));
    await clickAt(page, page.locator('[data-kind="excluded"][data-id="role-switch"] input[type=checkbox]'));
    await clickAt(page, page.locator('.q[data-id="role"] input[value="Admin"]'));
    await clickAt(page, page.locator('#done'));
    const done = await s1.exited;
    assert.equal(done.code, 0, done.err);

    const d = JSON.parse(readFileSync(join(spec, 'decisions.json'), 'utf8'));
    assert.deepEqual(d.flow.screens, ['огляд']);
    assert.equal(d.flow.name, 'main-flow');
    assert.equal(d.tokens.find((t) => t.id === 'surface-1').name, 'surface-page');
    assert.equal(d.tokens.find((t) => t.id === 'text-2').name, 'text-2');
    assert.equal(d.components.find((c) => c.id === 'Button').include, false);
    assert.equal(d.components.find((c) => c.id === 'Card').include, true);
    assert.equal(d.excluded.find((x) => x.id === 'role-switch').include, true);
    assert.equal(d.questions.find((q) => q.id === 'role').answer, 'Admin');
    assert.equal(d.lang, 'uk');

    const s2 = startServe(repo, port);
    await s2.ready;
    const page2 = await ctx.newPage();
    await page2.goto(`http://localhost:${port}/`);
    assert.equal(await page2.isChecked('[data-kind="flow"][data-id="огляд"] input[type=checkbox]'), true, 're-opened: the flow choice is kept');
    assert.equal(await page2.inputValue('[data-kind="tokens"][data-id="surface-1"] input[type=text]'), 'surface-page', 're-opened: the renamed token is kept');
    assert.equal(await page2.isChecked('[data-kind="components"][data-id="Button"] input[type=checkbox]'), false, 're-opened: the unticked component stays unticked');
    s2.child.kill();
    await s2.exited;
  } finally {
    await browser.close();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('English on request', async () => {
  const { repo } = repoWithCheckpoint();
  const port = await freePort();
  const browser = await launch();
  try {
    const s = startServe(repo, port, ['--lang', 'en']);
    await s.ready;
    const page = await browser.newPage();
    await page.goto(`http://localhost:${port}/`);
    assert.equal(await page.textContent('#done'), 'Done');
    s.child.kill();
    await s.exited;
  } finally { await browser.close(); rmSync(repo, { recursive: true, force: true }); }
});

test('a port already in use: exit 2 and the next port to try', async () => {
  const { repo } = repoWithCheckpoint();
  const blocker = createServer();
  await new Promise((ok) => blocker.listen(0, '127.0.0.1', ok));
  const port = blocker.address().port;
  try {
    const s = startServe(repo, port);
    const r = await s.exited;
    assert.equal(r.code, 2);
    assert.match(r.err, new RegExp(`port ${port} is in use — run again with --port ${port + 1}`));
  } finally { blocker.close(); rmSync(repo, { recursive: true, force: true }); }
});

test('no checkpoint.json: exit 2 and what to run', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'dsfa-page-'));
  mkdirSync(join(repo, 'extraction'));
  writeFileSync(join(repo, 'extraction', 'capture-manifest.json'), JSON.stringify({ product: 'X' }));
  try {
    const r = await startServe(repo, await freePort()).exited;
    assert.equal(r.code, 2);
    assert.match(r.err, /checkpoint\.mjs prepare/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tests/checkpoint-page.test.mjs`
Expected: FAIL — `serve exited 1: serve: not built yet`.

- [ ] **Step 3: Implement `serve` in `scripts/checkpoint.mjs`**

Add `import http from 'node:http';` after `import fs from 'node:fs';`. Replace the `serve()` stub with everything below (keep `prepare()` and the final dispatch line as they are):

```js
const STR = {
  uk: {
    title: 'Рішення перед збиранням', intro: 'Тут усе, що інструмент знайшов у застосунку. Оберіть екрани для тестового флоу, перевірте назви з позначкою «запропонована назва» і відмітьте, що є лише частиною прототипу. Нічого не збирається, доки ви не натиснете «Готово».',
    questions: 'Питання', questionsIntro: 'На них можете відповісти лише ви.',
    flow: 'Тестовий флоу', flowIntro: 'Оберіть екрани, які ми перезберемо першими і порівняємо із застосунком. Порядок — як у списку.', flowName: 'Назва флоу',
    noShot: 'без знімка', signIn: 'схоже на сторінку входу — перевірте знімок', transitions: 'переходів: {n}',
    tokens: 'Токени', tokensIntro: 'Значення дизайну: кольори, радіуси, відступи, шрифти. Усі вони йдуть у проєкт як є. Перевірте лише назви з позначкою «запропонована назва»: у застосунку їх не було.',
    facts: '{n} з назвами із застосунку або вирішеними людиною — відкрийте, щоб подивитися', dark: 'темна тема',
    label: { measured: 'виміряно', derived: 'виведено', decided: 'вирішено', unknown: 'невідомо' },
    nameStatus: { product: 'назва із застосунку', proposed: 'запропонована назва', decided: 'вирішено людиною' },
    roleDerived: 'призначення виведене: напряму ніде не використовується',
    usesElements: 'на {n} елементах', usesRules: 'у {n} правилах стилів',
    components: 'Компоненти', componentsIntro: 'Частини інтерфейсу, які отримають свою сторінку в Storybook. Без галочки — те, що схоже на службову частину бібліотеки; поставте, якщо потрібне.',
    instances: '{i} шт. на {s} екр.', states: 'стани', part: 'схоже на службову частину бібліотеки, а не на компонент продукту',
    excluded: 'Лише для прототипу', excludedIntro: 'Схоже, ці частини існують лише для показу прототипу (перемикачі ролей, демо-кнопки). У проєкт вони не підуть. Поставте галочку, якщо це частина продукту.',
    comment: 'Ще щось?', commentPh: 'Необовʼязкова примітка для Claude', name: 'Назва', all: 'Обрати всі', none: 'Зняти всі',
    done: 'Готово', summary: 'Флоу: {f} екр. · компонентів: {c} · токенів: {t}',
    saved: 'Збережено', savedSub: 'Поверніться до Claude — він продовжить звідси. Вкладку можна закрити.',
    notSaved: 'Не збереглося', notSavedSub: 'Щось пішло не так. Скажіть про це Claude.',
  },
  en: {
    title: 'Decisions before the build', intro: 'Everything the tool found in the app. Choose the screens for the test flow, check the names marked "proposed name", and mark what exists only in the prototype. Nothing is built until you press Done.',
    questions: 'Questions', questionsIntro: 'Only you can answer these.',
    flow: 'Test flow', flowIntro: 'Choose the screens we rebuild first and compare with the app. The order is the list\'s.', flowName: 'Flow name',
    noShot: 'no screenshot', signIn: 'looks like a sign-in page — check the screenshot', transitions: '{n} transitions',
    tokens: 'Tokens', tokensIntro: 'The design values: colours, radii, spacing, fonts. They all go into the project as they are. Check only the names marked "proposed name": the app had none.',
    facts: '{n} named by the app or decided by a person — open to look', dark: 'dark theme',
    label: { measured: 'measured', derived: 'derived', decided: 'decided', unknown: 'unknown' },
    nameStatus: { product: 'name from the app', proposed: 'proposed name', decided: 'decided by a person' },
    roleDerived: 'its purpose is derived: nothing uses it directly',
    usesElements: 'on {n} elements', usesRules: 'in {n} style rules',
    components: 'Components', componentsIntro: 'The parts of the interface that get their own Storybook page. Unticked: what looks like an internal part of a library; tick it if it is needed.',
    instances: '{i} on {s} screen(s)', states: 'states', part: 'looks like an internal part of a library, not a component of the product',
    excluded: 'Prototype only', excludedIntro: 'These parts seem to exist only to demo the prototype (role switchers, demo buttons). They stay out of the project. Tick one if it is part of the product.',
    comment: 'Anything else?', commentPh: 'Optional note for Claude', name: 'Name', all: 'Select all', none: 'Clear',
    done: 'Done', summary: 'Flow: {f} screen(s) · components: {c} · tokens: {t}',
    saved: 'Saved', savedSub: 'Go back to Claude — it continues from here. You can close this tab.',
    notSaved: 'Not saved', notSavedSub: 'Something went wrong. Tell Claude.',
  },
};
const fmt = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const COLOUR = /^(#|rgb|hsl|oklch|oklab|lab\(|lch\(|color\()/i;

function page(inv, s, lang, picked, flowName, comment) {
  const badge = (cls, text) => `<span class="badge ${cls}">${esc(text)}</span>`;
  const labelBadge = (l) => badge({ measured: 'ok', derived: 'info', decided: 'muted' }[l] ?? 'muted', s.label[l] ?? l);
  const nameBadge = (n) => badge({ product: 'ok', proposed: 'warn', decided: 'muted' }[n] ?? 'muted', s.nameStatus[n] ?? n);
  const sw = (v) => (COLOUR.test(String(v)) ? `<span class="sw" style="background:${esc(v)}"></span>` : '');
  const nameCell = (x) => (x.nameStatus === 'proposed' ? `<input type="text" value="${esc(x.name)}" aria-label="${esc(s.name)}: ${esc(x.id)}">` : `<span class="name">${esc(x.name)}</span>`);
  const uses = (u) => (u ? ` · ${esc(fmt(u.kind === 'elements' ? s.usesElements : s.usesRules, { n: u.n }))}` : '');
  const screens = (inv.screens ?? []).map((sc) => `<label class="screen" data-kind="flow" data-id="${esc(sc.id)}">
<input type="checkbox" ${picked.has(sc.id) ? 'checked' : ''} aria-label="${esc(sc.name)}">
${sc.screenshot ? `<img src="/preview/${encodeURIComponent(sc.screenshot)}" alt="">` : `<span class="noimg">${esc(s.noShot)}</span>`}
<span class="name">${esc(sc.name)}</span>
<span class="meta">${esc(sc.url)}${sc.transitions != null ? ` · ${esc(fmt(s.transitions, { n: sc.transitions }))}` : ''}</span>
${sc.looksLikeSignIn ? `<span class="meta warn-text">${esc(s.signIn)}</span>` : ''}</label>`).join('');
  const tokenRow = (t) => `<div class="row token" data-kind="tokens" data-id="${esc(t.id)}"><span></span>
<div><div>${nameCell(t)}</div>
<div class="meta">${sw(t.value)}${esc(t.value)}${t.dark ? ` · ${esc(s.dark)} ${sw(t.dark)}${esc(t.dark)}` : ''}${uses(t.uses)}</div>
<div class="meta">${esc(t.evidence)}${t.roleLabel === 'derived' ? ` · ${esc(s.roleDerived)}` : ''}</div></div>
<div class="side">${labelBadge(t.label)}${nameBadge(t.nameStatus)}</div></div>`;
  const proposed = (inv.tokens ?? []).filter((t) => t.nameStatus === 'proposed');
  const facts = (inv.tokens ?? []).filter((t) => t.nameStatus !== 'proposed');
  const groups = Object.entries(facts.reduce((g, t) => ((g[t.group] ??= []).push(t), g), {}));
  const compRow = (c) => `<div class="row" data-kind="components" data-id="${esc(c.id)}">
<input type="checkbox" aria-label="${esc(c.name)}" ${c.include !== false ? 'checked' : ''}>
<div><div>${nameCell(c)}</div>
<div class="meta">${c.instances != null ? esc(fmt(s.instances, { i: c.instances, s: c.screens })) : ''}${c.states?.length ? ` · ${esc(s.states)}: ${esc(c.states.join(', '))}` : ''}</div>
${c.part ? `<div class="meta">${esc(s.part)}</div>` : ''}</div>
<div class="side">${labelBadge(c.label)}${nameBadge(c.nameStatus)}</div></div>`;
  const exRow = (x) => `<div class="row" data-kind="excluded" data-id="${esc(x.id)}">
<input type="checkbox" aria-label="${esc(x.what)}" ${x.include ? 'checked' : ''}>
<div><div class="name">${esc(x.what)}</div><div class="meta">${esc(x.why)}</div></div><div></div></div>`;
  const qs = (inv.questions ?? []).map((q) => `<div class="q" data-id="${esc(q.id)}"><div class="name">${esc(q.text)}</div>${(q.options ?? []).map((o) => `<label><input type="radio" name="q:${esc(q.id)}" value="${esc(o)}" ${q.answer === o ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div>`).join('');
  const client = { summary: s.summary, saved: s.saved, savedSub: s.savedSub, notSaved: s.notSaved, notSavedSub: s.notSavedSub };
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(s.title)} · ${esc(inv.project)}</title>
<style>
:root{--bg:#f6f6f4;--card:#fff;--ink:#16160f;--muted:#5f5e57;--line:#e4e3de;--ok:#1a6b3c;--okbg:#e3f3e9;--warn:#7a4f00;--warnbg:#fdf1d8;--info:#1d4f91;--infobg:#e3ecf8;--accent:#16160f}
@media (prefers-color-scheme:dark){:root{--bg:#121210;--card:#1c1c19;--ink:#f1f0ea;--muted:#b3b1a8;--line:#2e2d29;--okbg:#14301f;--ok:#8fdcab;--warnbg:#33270c;--warn:#f0c46b;--infobg:#132339;--info:#a9c8f2;--accent:#f1f0ea}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:32px 16px 120px}h1{font-size:26px;margin:0 0 4px}
h2{font-size:18px;margin:36px -16px 4px;padding:10px 16px;position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line)}
.intro,.sub{color:var(--muted);margin:6px 0 10px;font-size:14px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4px 16px}
.row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:12px;align-items:start;padding:12px 0;border-top:1px solid var(--line)}.row:first-child{border-top:0}
.row.off .name{color:var(--muted)}.name{font-weight:600}.meta{color:var(--muted);font-size:13px;overflow-wrap:anywhere}.warn-text{color:var(--warn)}
input[type=text]{font:inherit;font-weight:600;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:6px;padding:2px 8px;width:min(320px,100%)}
input[type=checkbox],input[type=radio]{width:20px;height:20px;margin:2px 0 0;accent-color:var(--accent);cursor:pointer}
.badge{font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;white-space:nowrap}.ok{background:var(--okbg);color:var(--ok)}.warn{background:var(--warnbg);color:var(--warn)}.info{background:var(--infobg);color:var(--info)}.muted{background:var(--line);color:var(--ink)}
.side{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.sw{display:inline-block;width:18px;height:18px;border-radius:4px;vertical-align:-4px;margin-right:6px;box-shadow:inset 0 0 0 1px rgb(0 0 0/.2)}
.screens{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.screen{display:grid;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;cursor:pointer;position:relative}
.screen input{position:absolute;top:16px;left:16px;z-index:1}
.screen img,.noimg{width:100%;height:150px;object-fit:cover;object-position:top;border-radius:6px;border:1px solid var(--line);background:var(--bg)}
.noimg{display:grid;place-items:center;color:var(--muted);font-size:13px}
.field{display:flex;gap:8px;align-items:center;margin:10px 0}
.q{padding:14px 0;border-top:1px solid var(--line)}.q:first-child{border-top:0}.q label{display:flex;gap:8px;align-items:center;margin:4px 0}
details.group{background:var(--card);border:1px solid var(--line);border-radius:12px;margin:8px 0}details.group>summary{cursor:pointer;padding:10px 16px;font-weight:600}details.group .rows{padding:0 16px 4px}
.tools{display:flex;gap:8px;margin:0 0 8px;flex-wrap:wrap}.tools button{background:transparent;color:var(--ink);border:1px solid var(--line);padding:4px 10px;font-weight:500;font-size:13px}
textarea{font:inherit;width:100%;min-height:60px;border:1px solid var(--line);border-radius:8px;padding:8px;background:transparent;color:var(--ink)}
.bar{position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:12px 16px}
.bar div{max-width:1040px;margin:0 auto;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
button{font:inherit;font-weight:600;border:0;border-radius:8px;padding:10px 18px;background:var(--accent);color:var(--bg);cursor:pointer}
</style></head><body><main>
<h1>${esc(s.title)} · ${esc(inv.project)}</h1>
<p class="sub">${esc(inv.source)}</p>
<p class="sub">${esc(s.intro)}</p>
${qs ? `<h2>${esc(s.questions)}</h2><p class="intro">${esc(s.questionsIntro)}</p><div class="card">${qs}</div>` : ''}
<h2>${esc(s.flow)}</h2><p class="intro">${esc(s.flowIntro)}</p>
<div class="field"><label for="flow-name">${esc(s.flowName)}</label><input type="text" id="flow-name" value="${esc(flowName)}"></div>
<div class="screens">${screens}</div>
<h2>${esc(s.tokens)}</h2><p class="intro">${esc(s.tokensIntro)}</p>
${proposed.length ? `<div class="card">${proposed.map(tokenRow).join('')}</div>` : ''}
<details class="group"><summary>${esc(fmt(s.facts, { n: facts.length }))}</summary><div class="rows">${groups.map(([g, ts]) => `<div class="meta" style="margin:10px 0 0;font-weight:600">${esc(g)} · ${ts.length}</div>${ts.map(tokenRow).join('')}`).join('')}</div></details>
<h2>${esc(s.components)}</h2><p class="intro">${esc(s.componentsIntro)}</p>
<div class="tools"><button type="button" data-all="1">${esc(s.all)}</button><button type="button" data-all="0">${esc(s.none)}</button></div>
<div class="card">${(inv.components ?? []).map(compRow).join('')}</div>
${(inv.excluded ?? []).length ? `<h2>${esc(s.excluded)}</h2><p class="intro">${esc(s.excludedIntro)}</p><div class="card">${inv.excluded.map(exRow).join('')}</div>` : ''}
<h2>${esc(s.comment)}</h2><textarea id="comment" placeholder="${esc(s.commentPh)}">${esc(comment)}</textarea>
</main>
<div class="bar"><div><span class="sub" id="summary"></span><button id="done" type="button">${esc(s.done)}</button></div></div>
<script>
const S = ${JSON.stringify(client).replace(/</g, '\\u003c')};
const fmt = (t, v) => t.replace(/\\{(\\w+)\\}/g, (_, k) => v[k] ?? '');
const $$ = (q) => [...document.querySelectorAll(q)];
const ticked = (k) => $$('[data-kind="' + k + '"]').filter((r) => r.querySelector('input[type=checkbox]')?.checked);
const sync = () => {
  $$('.row').forEach((r) => { const c = r.querySelector('input[type=checkbox]'); r.classList.toggle('off', c ? !c.checked : false); });
  document.getElementById('summary').textContent = fmt(S.summary, { f: ticked('flow').length, c: ticked('components').length, t: $$('[data-kind="tokens"]').length });
};
document.addEventListener('change', sync);
$$('[data-all]').forEach((b) => b.onclick = () => { $$('[data-kind="components"] input[type=checkbox]').forEach((c) => (c.checked = b.dataset.all === '1')); sync(); });
sync();
document.getElementById('done').onclick = async () => {
  const pick = (k) => $$('[data-kind="' + k + '"]').map((r) => ({ id: r.dataset.id, include: r.querySelector('input[type=checkbox]') ? r.querySelector('input[type=checkbox]').checked : undefined, name: r.querySelector('input[type=text]')?.value ?? undefined }));
  const body = {
    flow: { name: document.getElementById('flow-name').value.trim(), screens: ticked('flow').map((r) => r.dataset.id) },
    tokens: pick('tokens'), components: pick('components'), excluded: pick('excluded'),
    questions: $$('.q').map((q) => ({ id: q.dataset.id, answer: q.querySelector('input[type=radio]:checked')?.value ?? null })),
    comment: document.getElementById('comment').value,
  };
  const res = await fetch('/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => ({ ok: false }));
  const main = document.createElement('main');
  const h = document.createElement('h1'); h.textContent = res.ok ? S.saved : S.notSaved;
  const p = document.createElement('p'); p.className = 'sub'; p.textContent = res.ok ? S.savedSub : S.notSavedSub;
  main.append(h, p);
  document.body.replaceChildren(main);
};
</script></body></html>`;
}

function serve() {
  const inv = readJson('checkpoint.json');
  if (!inv) { console.error('no extraction/checkpoint.json — run: node scripts/checkpoint.mjs prepare <repo>'); process.exit(2); }
  const lang = STR[opt('lang', 'uk')] ? opt('lang', 'uk') : 'uk';
  const s = STR[lang];
  const port = Number(opt('port', '6020'));
  const prev = readJson('decisions.json');
  if (prev) { // earlier answers win: re-opening the page keeps what the designer decided
    for (const k of ['components', 'tokens', 'excluded', 'questions']) {
      const byId = Object.fromEntries((prev[k] ?? []).map((x) => [x.id, x]));
      for (const item of inv[k] ?? []) for (const f of ['include', 'name', 'answer']) if (byId[item.id]?.[f] !== undefined) item[f] = byId[item.id][f];
    }
  }
  const html = page(inv, s, lang, new Set(prev?.flow?.screens ?? []), prev?.flow?.name || 'main-flow', prev?.comment ?? '');
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/save') {
      // only the page itself saves: a JSON request from another site needs a CORS preflight this server never grants
      if (!/^application\/json/.test(req.headers['content-type'] ?? '')) return res.writeHead(415).end();
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let d;
        try {
          d = JSON.parse(body);
          for (const k of ['components', 'tokens', 'excluded', 'questions']) if (!Array.isArray(d[k] ?? [])) throw new Error(k);
          if (!Array.isArray(d.flow?.screens ?? [])) throw new Error('flow');
        } catch { return res.writeHead(400).end('bad request'); }
        const merge = (k) => (inv[k] ?? []).map((item) => ({ ...item, ...Object.fromEntries(Object.entries((d[k] ?? []).find((x) => x.id === item.id) ?? {}).filter(([, v]) => v !== undefined)) }));
        const known = new Set((inv.screens ?? []).map((x) => x.id));
        const out = {
          project: inv.project, source: inv.source, savedAt: new Date().toISOString(), lang, comment: String(d.comment ?? ''),
          flow: { name: String(d.flow?.name || 'main-flow'), screens: (d.flow?.screens ?? []).filter((id) => known.has(id)) },
          questions: (inv.questions ?? []).map((q) => ({ ...q, answer: (d.questions ?? []).find((x) => x.id === q.id)?.answer ?? q.answer ?? null })),
          screens: inv.screens ?? [], tokens: merge('tokens'), components: merge('components'), excluded: merge('excluded'),
        };
        fs.writeFileSync(path.join(P.spec, 'decisions.json'), JSON.stringify(out, null, 1) + '\n');
        res.writeHead(200).end('ok');
        console.log(`saved decisions.json: flow "${out.flow.name}" with ${out.flow.screens.length} screen(s); ${out.components.filter((c) => c.include).length} of ${out.components.length} components; ${out.excluded.filter((x) => x.include).length} of ${out.excluded.length} prototype-only part(s) put back`);
        setTimeout(() => process.exit(0), 300);
      });
      return;
    }
    if (req.url.startsWith('/preview/')) {
      const f = path.join(P.spec, decodeURIComponent(req.url.slice('/preview/'.length)));
      if (f.startsWith(P.spec + path.sep) && f.endsWith('.png') && fs.existsSync(f)) return res.writeHead(200, { 'content-type': 'image/png' }).end(fs.readFileSync(f));
      return res.writeHead(404).end();
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html);
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') { console.error(`port ${port} is in use — run again with --port ${port + 1}`); process.exit(2); }
    throw e;
  });
  // this machine only, not the local network
  server.listen(port, '127.0.0.1', () => console.log(`checkpoint for ${inv.project}: http://localhost:${port} — waiting for the designer to press "${s.done}"`));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tests/checkpoint-page.test.mjs`
Expected: PASS, 4 tests. If the contrast assertion lists a text, change only the colour token in the `:root` block it uses (never lower the threshold) and run again.

- [ ] **Step 5: Look at the page yourself**

A test can pass and the page still look wrong. In the first test, right after `await page.goto(…)`, add temporarily
`await page.screenshot({ path: '/tmp/dsfa-checkpoint.png', fullPage: true });`, run the test, open
`/tmp/dsfa-checkpoint.png` with the Read tool and check: the flow cards sit in a grid with their checkbox on the
picture's corner, badges do not overlap names, the bottom bar does not cover the last section. Fix what is off, then
remove the line.

- [ ] **Step 6: Run all fast tests and commit**

Run: `npm test`
Expected: PASS — size, lib, preflight, scaffold, checkpoint, checkpoint-page.

```bash
git add -A
git commit -m "checkpoint.mjs serve: the designer's page in Ukrainian, flow choice, Done writes decisions.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The chain on the product layout

**Files:**
- Create: `selftest/e2e.test.mjs`

**Interfaces:**
- Consumes: every script of Tasks 3–9 through its CLI.
- Produces: nothing new — the proof that the scripts work together on the `extraction/` layout that `scaffold.mjs init` makes (the moved self-test uses the root layout).

- [ ] **Step 1: Write the test**

`selftest/e2e.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { run } from './helpers.mjs';

test('init → capture → tokens → inventory → flows → checkpoint prepare, on extraction/', async () => {
  const S = await startServer();
  const home = mkdtempSync(join(tmpdir(), 'dsfa-e2e-'));
  const repo = join(home, 'fixture-workbench');
  try {
    let r = await run('scaffold.mjs', 'init', repo, '--product', 'Фікстура', '--url', S.url);
    assert.equal(r.status, 0, r.stderr);
    for (const scheme of ['light', 'dark']) {
      r = await run('capture.mjs', '--url', S.url, '--screen', 'огляд', '--scheme', scheme, '--out', join(repo, 'extraction', 'baseline'), '--no-interact', '--block-writes', '--settle', '300');
      assert.equal(r.status, 0, r.stderr);
    }
    r = await run('tokens.mjs', repo);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    r = await run('inventory.mjs', repo);
    assert.equal(r.status, 0, r.stderr);
    r = await run('flows.mjs', repo, '--block-writes', '--settle', '250');
    assert.equal(r.status, 0, r.stderr || r.stdout);
    r = await run('checkpoint.mjs', 'prepare', repo);
    assert.equal(r.status, 0, r.stderr);

    const doc = JSON.parse(readFileSync(join(repo, 'extraction', 'tokens.json'), 'utf8'));
    assert.match(doc.$closure, /NEEDS-TOKEN/, 'the closure sentence survives the build');
    assert.ok(Object.values(doc.tokens).every((t) => ['measured', 'derived', 'decided'].includes(t.$provenance?.label)), 'every token carries a label');
    assert.ok(doc.$meta.instruments.some((i) => i.name === 'ds-from-app scripts/tokens.mjs'));
    const cp = JSON.parse(readFileSync(join(repo, 'extraction', 'checkpoint.json'), 'utf8'));
    assert.equal(cp.project, 'Фікстура');
    assert.deepEqual(cp.screens.map((s) => s.id), ['огляд']);
    assert.ok(cp.screens[0].screenshot && existsSync(join(repo, 'extraction', cp.screens[0].screenshot)), 'the light screenshot is linked');
    assert.equal(cp.tokens.find((t) => t.id === 'color-primary')?.nameStatus, 'product');
    assert.equal(cp.tokens.find((t) => t.id === 'spacing-4')?.nameStatus, 'decided');
    assert.ok(cp.components.some((c) => c.name === 'Card'));
    assert.ok(existsSync(join(repo, 'extraction', 'flows', 'flows.json')));
  } finally {
    S.close();
    rmSync(home, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Run it**

Run: `node --test selftest/e2e.test.mjs`
Expected: PASS. If it fails, the failure is real (the chain is new): read the script's stderr in the assertion message, fix the cause in the script that broke, and re-run Tasks' own tests for that script before continuing.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "The extraction chain end to end on the repository layout scaffold makes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: The skill's instructions, references, README — and the full run

**Files:**
- Modify: `skills/ds-from-app/SKILL.md` (append tools, steps, talking to the designer)
- Create: `skills/ds-from-app/references/capture.md`, `skills/ds-from-app/references/tokens.md`, `README.md`

**Interfaces:**
- Consumes: every CLI above, exactly as their Interfaces blocks state.
- Produces: the instructions Claude follows; `tests/size.test.mjs` keeps them within budget.

- [ ] **Step 1: Append to `skills/ds-from-app/SKILL.md`** (after rule 8):

```markdown

## Tools

All in `${CLAUDE_PLUGIN_ROOT}/scripts`, run with `node`. Once per machine: `node preflight.mjs` names what is missing
and the command that fixes it (usually `npm install --prefix "${CLAUDE_PLUGIN_ROOT}"`). `npm run selftest` in
`${CLAUDE_PLUGIN_ROOT}` proves the instruments still catch every planted shape — run it after any change to a script.

| Script | Does |
|---|---|
| `preflight.mjs` | Node, browser, git, disk — and the fix for each |
| `scaffold.mjs init <repo> --product "<Name>" --url <url>` | the product's repository, **before** any capture |
| `capture.mjs --url <url> --screen <name> --out <repo>/extraction/baseline …` | one screen: every element's values, states, a screenshot |
| `flows.mjs <repo>` | every safe control pressed once: transitions, and screens not captured yet |
| `tokens.mjs <repo>` | captures → `extraction/tokens.json`, every token labelled |
| `inventory.mjs <repo>` | captures → `extraction/components.draft.json` |
| `checkpoint.mjs prepare\|serve <repo>` | the designer's decision page → `extraction/decisions.json` |

## Steps

### 0 · Prepare
1. `node preflight.mjs`; fix what it names, saying what you install.
2. Ask, in plain words: the link; does it need signing in, and whose account (a different role is a different
   system); is there a dark theme; where to keep the project (default `~/<product>-workbench`). If the app shows real
   people's data, say the screenshots will hold it and the repository stays private.
3. `node scaffold.mjs init <repo> --product "<Name>" --url <url>`.
4. Sign-in, when needed: [references/capture.md](references/capture.md) § Sign-in.

### 1 · Capture
Follow [references/capture.md](references/capture.md). End with a short report: screens captured, which did not open
and why, what was refused and why.

### 2 · Tokens and components
`node tokens.mjs <repo>`, then `node inventory.mjs <repo>`; read [references/tokens.md](references/tokens.md). If
`tokens.mjs` says a dark theme exists and none was captured, capture it before going on.

### 3 · Checkpoint
[references/tokens.md](references/tokens.md) § The checkpoint. Never continue before the designer pressed the button.

### 4 · Commit and hand over
`git add -A && git commit -m "Extraction: <N> screens, <M> tokens, the designer's decisions"` in the product
repository. Tell the designer what is in it: screens, how many tokens the app named itself and how many were
proposed, what was left out as prototype-only, and that the tokens are unchecked until the test flow is rebuilt
(the next version of this plugin builds the flow, Storybook and the Workbench).

## Talking to the designer

- Plain words: "екран", "кнопка", "колір" — not "computed style", "CDP", "DOM".
- Say what you checked and how; say plainly what did not work.
- Ask only what the designer can answer; decide technical things yourself.
```

- [ ] **Step 2: Write `skills/ds-from-app/references/capture.md`**

```markdown
# Capturing screens

## Where captures go
Always into the product repository: `<repo>/extraction/baseline/` — create it first (`scaffold.mjs init`). One capture
is `<screen>--<WxH>--<scheme>.json` plus `.png`. Screen names: short, lowercase, hyphens (`policies`,
`policy-rules`); the designer's language is fine. Default viewport `1440x900`.

## Read-only, always
- `--no-interact` on every real product. States are still produced by forced pseudo-classes (hover, focus,
  focus-visible, active). Real input (focus, hover, press) is NOT read-only — it can submit a form; use it only on a
  prototype or sandbox the designer confirmed in words has nothing to break.
- `--block-writes` on every real product. If widgets come back empty, the product reads through POST: name those reads
  with `--reads '<regex over the path>'`. Never drop `--block-writes` to make data appear.
- Never `--allow-unsafe-click` or `--allow-reveal` on a real product. A refused click is reported: tell the designer
  what was refused and why.

## Sign-in
1. `node capture.mjs --login-url <sign-in url> --save-storage ~/.ds-from-app/sessions/<slug>.auth.json --until-url '<regex
   of the first screen after sign-in>'` — a browser window opens; the designer signs in by hand. Never type a password
   or a code for them. `<slug>` is in `extraction/capture-manifest.json`.
2. Every capture and `flows.mjs` run then takes `--storage ~/.ds-from-app/sessions/<slug>.auth.json`. The session file
   stays outside the repository.
3. `warning: this looks like a sign-in page` means the session is missing or expired. Stop, sign in again, and
   re-capture that screen — every capture after an expired session is of the sign-in page.

## Which screens
1. Capture the entry screen.
2. `node flows.mjs <repo> --block-writes [--storage …]` presses every safe control once and lists screens it reached
   that no capture holds (`reachable but not captured`).
3. Capture those and run `flows.mjs` again. Stop when it names nothing new, or the designer says the rest is out of
   scope; write what was left out into your report.

## One address, many screens
When a menu swaps the page in place and the address does not change: capture each screen with
`--click '<selector of the menu item>' --as-screen --screen <name>` (several `--click`, in order, for nested menus). Map
it with `flows.mjs <repo> --landmark '<css>'` — the landmark is the text that tells screens apart (the page heading,
the selected menu item); without it every screen looks like one. A menu item named like an action on data ("Order
Management") is refused; `--allow '<its exact name>'` lets it through only after the designer confirmed it only
navigates.

## Dark theme
`tokens.mjs` says when a dark theme is declared but not captured. Capture with `--scheme dark`; for a theme switched by
a class or attribute on `<html>`: `--scheme dark --root-class dark` or `--root-attr data-theme=dark`.

## The machine
One capture at a time: each runs a browser, and on an 8 GB machine two in parallel next to other browsers can run out
of memory.

## Exit codes
0 captured · 2 navigation failed, or a click refused · 3 nothing visible (wrong address, a sign-in wall, a blocked
render) · 4 redirected to another screen (the file is not written).
```

- [ ] **Step 3: Write `skills/ds-from-app/references/tokens.md`**

````markdown
# Tokens and the checkpoint

## Build
`node tokens.mjs <repo>` reads `extraction/baseline/*.json` and writes `extraction/tokens.json`. Its output is the first
finding — read it:
- `roles: …` — how many roles were read from where the app spends them (`measured`), how many `derived`;
- `left out N: …` — framework internals (`--tw-*`, `--radix-*`) and scoped properties: counted, not tokens;
- `derived N token(s) from painted values` — the app declares no token of that kind; the names (`surface-1`, `fg-2`,
  `spacing-16px`) are proposals the designer checks;
- `literals: …` — values painted outside the declared tokens (`lit-*`): findings, not decisions;
- `one colour scheme captured` / `a dark theme exists` — capture the dark scheme before the checkpoint.

## Labels
Every token: `$provenance.label` is `measured` (read from the app), `derived` (computed from what it paints) or
`decided` (a person). Its role has its own label: `$extensions["co.eleken.ds"].roleProvenance.label`. Never change a
label by hand.

## A value a person decides
Write it into `extraction/canon/decided.tokens.json`, then run `tokens.mjs` again:

```json
{ "color-warning": { "$type": "color", "$value": "#B45309",
  "$provenance": { "label": "decided", "evidence": "approved by <designer> 2026-10-12: the app has no warning colour" } } }
```

The evidence needs a date (`YYYY-MM-DD`) or the value is refused; a decision may not overwrite a measured token. Both
refusals are printed.

## Components
`node inventory.mjs <repo>` writes `extraction/components.draft.json`. A name a component library writes on the
element (shadcn `data-slot`, MUI, Chakra, Ant) is `measured`; the rest are named by role (`derived`). Layout
primitives are flagged and start unticked at the checkpoint.

## The checkpoint
1. `node checkpoint.mjs prepare <repo>` → `extraction/checkpoint.json`.
2. Look at the screenshots in `extraction/baseline/`. Then edit `checkpoint.json`:
   - `excluded`: `{ "id", "what", "why" }` for every part that looks prototype-only — a role or "view as" switcher, a
     demo or screen-state toggle, a prototype toolbar, colours only those use. `what` says what it looks like, `why`
     why you think so — both in the designer's language. They start unticked.
   - `questions`: `{ "id", "text", "options": [...] }` — only what the designer can answer (whose screens these are;
     whether a screen is in scope).
   `prepare` keeps both when it runs again.
3. Start `node checkpoint.mjs serve <repo> --lang <uk|en>` **in the background** (the designer's language). Give the
   designer http://localhost:6020 and ask them to choose the test flow, check the proposed names, and press the
   button. Wait until the process exits; do not continue before. Port taken: it says which port to use instead.
4. Read `extraction/decisions.json`: `flow.screens` (in order) and `flow.name`; renamed tokens (`name` ≠ `id`);
   components with `include`; prototype-only parts put back (`include: true`); answers; the comment. Tell the
   designer in one or two lines what was decided.
````

- [ ] **Step 4: Write `README.md`** (for designers — Ukrainian, plain words)

```markdown
# ds-from-app — плагін для Claude Code

Бере живий застосунок за посиланням і витягує з нього дизайн-систему: кольори, відступи, шрифти, радіуси (кожне
значення каже, як його отримали — виміряно, виведено чи вирішено людиною), компоненти, екрани й переходи. Перед
тим як щось збирати, ви на окремій сторінці обираєте тестовий флоу, перевіряєте запропоновані назви й відмічаєте, що
є лише частиною прототипу.

Ця версія робить витяг і сторінку рішень. Тестовий флоу, Storybook і репозиторій-Верстак — у наступній.

## Встановити (один раз)

```
claude plugin marketplace add ~/ds-from-app
claude plugin install ds-from-app@ds-from-app
```

Потрібні Node 22+ і Google Chrome. Відкрийте нову сесію Claude Code — команда `/ds-from-app` зʼявиться.

## Користуватися

```
/ds-from-app https://app.example.com
/ds-from-app continue        # у теці проєкту, щоб продовжити
```

Claude спитає, чи треба входити в акаунт (входите ви самі у вікні браузера), чи є темна тема і де тримати проєкт.
Застосунок він лише читає: форми не надсилає і нічого не змінює.

## Для того, хто змінює плагін

`npm test` — швидкі перевірки; `npm run selftest` — інструменти проти синтетичних застосунків із відомою відповіддю
(кілька хвилин, відкриває браузер).
```

- [ ] **Step 5: Run every check**

Run: `npm test && npm run selftest`
Expected: PASS — `tests/` (size, lib, preflight, scaffold, checkpoint, checkpoint-page) and `selftest/` (capture 3, tokens 6, inventory 1, flows 2, e2e 1). The size test must report SKILL.md within 1,500 words.

- [ ] **Step 6: Check the plugin loads**

Run: `claude plugin validate ~/ds-from-app`
Expected: exit 0, no errors for the manifest, the marketplace, the skill or the command. Fix every error it names.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "The skill's steps 0–4, references for capture and tokens, a README for designers

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
