// Does the prototype reproduce the product — every screen, every transition, the same interface, the same layout?
// (Moved from ds-extract-method scripts/prototype_parity.mjs @ebaa66f.)
//
// The product side is what was recorded, not a live product: flows/flows.json (every transition, flows.mjs) and
// the baseline captures (every element's text, box and computed style, capture.mjs). The prototype side is opened
// live, the way a person opens it. For every product screen:
//   screen       the prototype has it: the mapped route renders, with no console error
//   copy         every piece of interface text the product shows — headings, column headers, tabs, buttons, links,
//                labels — outside the data rows (data is invented in a prototype; the interface is not)
//   transitions  every control the product answers to is there (by role and name) and does the same kind of thing:
//                navigates to the same screen, opens the same kind of surface, changes the page. A control that
//                does nothing where the product's does something is DEAD
//   layout       each matched element with its own text (interface elements, and any other text the prototype also shows with a box that agrees) sits where the product's does and draws the same: box within
//                --tolerance px, font size / weight / line height, colours within OKLab 0.02, padding, radius
//   density      as many data rows fill the first screen as in the product
// Anything missing, dead or off fails the run; the report names each one, with where to look.
//
// Routes: every named screen opens at #/<name> (the Workbench routes each screen so). <repo>/flows/routes.json overrides
// it: keyed by the screen NAME ({"orders": "#/orders"}), else by its path pattern ({"/accounts/:id": "#/accounts/a1"}) or
// path. A screen without a name opens at the product's own path under a hash router (#/accounts/…). A control the
// product answers by becoming a screen (flows: navigate { toScreen }, or a pattern some named screen has) must take the
// prototype to that screen's route.
//
// Usage: node tools/parity.mjs <product-repo> --prototype <url> [--tolerance 4] [--json] [--only <screen name or path> …]
//   --skip-unbuilt lists a flow screen whose route still shows the Workbench's screen list as "not built yet" instead of
//   failing it (gates task, mid-flow); the flow is done only without it.
//   --require <screen> (repeatable): that screen is never skipped by --skip-unbuilt; unbuilt, it fails (gates task <screens>)
//   --only checks those screens alone (one screen being rebuilt); the report says it was a part, never PASS for all.

import { launch } from './lib/browser.mjs';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { product } from './lib/product.mjs';
import { parseColor, oklabDistance } from './lib/color.mjs';
import { interfaceElements, layoutElements, excludedBand, findInPrototype, targetScreen, missingControlText, missingTextLine, shotFileName, NO_BASELINE, UNREACHABLE, notInFlows } from './lib/flow-model.mjs';

const args = process.argv.slice(2);
const P = product(args.find((a) => !a.startsWith('--') && !/^https?:/.test(a)), 'usage: node tools/parity.mjs <product-repo> --prototype <url>');
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
// The prototype: a running URL (--prototype), or a built one this script serves itself (--serve <dist dir>), so the
// check never depends on a dev server someone left running.
let BASE = opt('--prototype');
let server;
if (!BASE && opt('--serve')) {
  const { createServer } = await import('node:http');
  const { extname } = await import('node:path');
  const root = opt('--serve');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png' };
  server = createServer((req, res) => {
    const p = decodeURIComponent(req.url.split('?')[0]);
    let f = join(root, p);
    if (!existsSync(f) || p.endsWith('/')) f = join(root, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  BASE = `http://127.0.0.1:${server.address().port}/`;
}
if (!BASE) { console.error('--prototype <url> or --serve <built prototype dir> is required'); process.exit(2); }
const TOL = Number(opt('--tolerance') || 4);
const flows = JSON.parse(readFileSync(join(P.spec, 'flows', 'flows.json'), 'utf8'));
const routes = existsSync(join(P.spec, 'flows', 'routes.json')) ? JSON.parse(readFileSync(join(P.spec, 'flows', 'routes.json'), 'utf8')) : {};
// Controls the product leaves without a name and the kit names (an accessible name is a kit decision, DEVIATIONS): per
// screen and role, the kit's names in the order the product's unnamed controls come — {"orders": {"combobox": ["Status"]}}.
// Without it such a control cannot be found, and what it does is never checked.
const kitNames = existsSync(join(P.spec, 'flows', 'names.json')) ? JSON.parse(readFileSync(join(P.spec, 'flows', 'names.json'), 'utf8')) : {};
const pattern = (u) => { try { const x = new URL(u); return x.pathname.split('/').map((seg) => (/^[0-9a-f-]{8,}$|^\d+$|@|%40/i.test(seg) ? ':id' : seg)).join('/') + (x.search ? '?…' : ''); } catch { return u; } };
const protoUrl = (productPath, pat) => new URL(routes[pat] ?? routes[productPath] ?? `#${productPath}`, BASE).href;
// A named screen opens at its own route, #/<name> (the Workbench routes every screen so); routes.json overrides it, by name first.
const screenUrl = (s) => (s.name ? new URL(routes[s.name] ?? routes[s.pattern] ?? routes[s.path] ?? `#/${s.name}`, BASE).href : protoUrl(s.path, s.pattern));
// Records the product shows inside interface elements (a program's name as a card heading, a person's name on a
// button) are data, and the prototype's data is invented: <repo>/flows/data-text.json names them — exact texts, or
// regexes — and they are left out of the copy and layout comparison. Each entry is a decision; say why beside it.
const dataText = existsSync(join(P.spec, 'flows', 'data-text.json')) ? JSON.parse(readFileSync(join(P.spec, 'flows', 'data-text.json'), 'utf8')) : {};
const dataRe = (dataText.patterns || []).map((p) => new RegExp(p.pattern ?? p));
const isData = (text) => (dataText.texts || []).some((t) => (t.text ?? t) === text) || dataRe.some((r) => r.test(text));

// Prototype-only parts (a role switcher, a demo toggle): the designer left them unticked at the checkpoint, so
// decisions.json lists them as excluded with the texts they show. Those texts and controls are not the product's
// interface: they are left out of the copy, layout and transitions checks. No decisions.json, nothing left out.
const norm = (t) => String(t ?? '').trim().toLowerCase();
const leftOutTexts = new Set();
const leftOutParts = []; // each excluded part's own texts: the top band is computed per part
if (existsSync(join(P.spec, 'decisions.json'))) {
  try {
    for (const x of JSON.parse(readFileSync(join(P.spec, 'decisions.json'), 'utf8')).excluded ?? []) if (!x.include) { for (const t of x.texts ?? []) leftOutTexts.add(norm(t)); leftOutParts.push(x.texts ?? []); }
  } catch (e) { console.error(`warning: ${join(P.spec, 'decisions.json')} could not be read (${e.message}) — nothing is left out as prototype-only`); }
}
const leftOut = (text) => leftOutTexts.has(norm(text));

// The baseline capture of a screen's resting state (light, desktop, no click).
// A screen of a single-URL product is the capture taken --as-screen under its name.
const caps = readdirSync(join(P.spec, 'baseline')).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(P.spec, 'baseline', f), 'utf8'))).filter((c) => c.meta?.tool === 'capture.mjs' && (!c.meta.clicked || c.meta.screenKind === 'screen') && !c.meta.rootSet && (c.meta.colorScheme || 'light') === 'light' && c.meta.viewport?.width >= 1024);
const captureOf = (s) => (s.clicks || s.landmark !== undefined ? caps.find((c) => c.meta.screenKind === 'screen' && c.meta.screen === s.name) : caps.find((c) => !c.meta.clicked && (c.meta.finalUrl || c.meta.requestedUrl) === s.url));

// Interface text and the screen a link opens: tools/lib/flow-model.mjs, shared with the flow spec.
const chromeOf = (els, isDetail) => interfaceElements(els, { isDetail });
const layoutOf = (els, isDetail) => layoutElements(els, { isDetail });
const STYLE = ['fontSize', 'fontWeight', 'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopLeftRadius'];
const COLOURS = ['color', 'backgroundColor'];

// In the prototype page: the same element record walk_live keeps (tag, role, own text, box, the compared styles).
const PAGE_ELEMENTS = ({ style, colours }) => {
  const out = [];
  const path = (el) => { const p = []; let n = el; while (n && n.nodeType === 1 && p.length < 12) { p.unshift(n.tagName.toLowerCase()); n = n.parentElement; } return p.join('>'); };
  for (const el of document.body.querySelectorAll('*')) {
    let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    own = own.trim().replace(/\s+/g, ' ');
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el);
    const values = {}; for (const k of [...style, ...colours, 'height']) values[k] = cs[k];
    out.push({ tag: el.tagName.toLowerCase(), role: el.getAttribute('role'), text: own.slice(0, 160), path: path(el), rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, values });
  }
  return out;
};
const SNAP = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const surfaces = [...document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"], [data-state="open"], [popover], dialog[open]')].filter(vis).map((e) => e.getAttribute('role') || e.tagName.toLowerCase());
  return { url: location.href, elements: document.querySelectorAll('body *').length, textHash: [...document.body.innerText].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0), surfaces };
};
const ROLE = { link: 'link', a: 'link', button: 'button', tab: 'tab', menuitem: 'menuitem', checkbox: 'checkbox', switch: 'switch', summary: 'button' };

const browser = await launch();
const [W, H] = (flows.viewport || '1440x900').split('x').map(Number);
const errors = [];
let page;
mkdirSync(join(P.spec, 'flows', 'parity'), { recursive: true });
// Every open is a fresh page: going to the same #/route again does not reload a single-page app, so a drawer the
// last transition opened would stay open and cover the next control (found on the first real prototype: every
// control after "Assistant" read as DEAD)
// ... and a fresh browser context: what the prototype keeps in storage (the program last chosen) would otherwise carry
// from one screen to the next — the Settings screens, checked after an e-pass screen, opened on the e-pass program.
// map_flows presses every control of the product in a fresh context too.
const open = async (url) => {
  if (page) await page.context().close().catch(() => {});
  page = await (await browser.newContext({ viewport: { width: W, height: H }, reducedMotion: 'reduce' })).newPage();
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 160)); });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
};
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// The control as map_flows named it. The name is the page's innerText, which CSS text-transform has already changed
// ("OVERVIEW" for "Overview") and which is cut at 80 characters: exact first, then ignoring case, then a cut name as
// a prefix. A control with no name at all is found by the icon it draws (data-icon, written by the capture),
// enabled ones first: "the first button in a list" was the disabled Previous of a pager.
// A name that holds a record (data-text.json: "ePass Disabled yhh-v2 1 programs", a card's fold button titled with a
// program's name) is found by its interface words, the record and any count standing for "anything", and the k-th
// such control on the screen answers the k-th transition (`seen` counts them per screen).
const dataTexts = (dataText.texts || []).map((t) => t.text ?? t).filter(Boolean).sort((a, b) => b.length - a.length);
const dataPattern = (name) => {
  const hit = dataTexts.filter((d) => name.includes(d));
  if (!hit.length) return null;
  let src = esc(name.trim());
  for (const d of hit) src = src.split(esc(d)).join('\u0000');
  return new RegExp(`^\\s*${src.replace(/\d+/g, '\\d+').replace(/\u0000/g, '.+?')}\\s*$`, 'i');
};
async function locate(role, c, seen = new Map()) {
  const tagOf = { link: 'a[href]', button: 'button' }[role] ?? `[role="${role}"]`;
  const tries = [];
  const dp = c.name && dataPattern(c.name);
  if (dp) {
    const k = seen.get(dp.source) ?? 0; seen.set(dp.source, k + 1);
    const l = page.getByRole(role, { name: dp });
    if ((await l.count().catch(() => 0)) > k) return l.nth(k);
  }
  if (c.name) {
    tries.push(page.getByRole(role, { name: c.name, exact: true }));
    tries.push(page.getByRole(role, { name: new RegExp(`^\\s*${esc(c.name.trim())}\\s*$`, 'i') }));
    if (c.name.length >= 79) tries.push(page.getByRole(role, { name: new RegExp(`^\\s*${esc(c.name.trim())}`, 'i') }));
  } else if (c.icon) tries.push(page.locator(`${tagOf}:not([disabled]):has([data-icon="${c.icon}"])`), page.locator(`${tagOf}:has([data-icon="${c.icon}"])`));
  else tries.push(page.getByRole(role, { name: '', exact: true }));
  if (c.inData) tries.push(page.locator(`tbody [role="${role}"], tbody ${tagOf}, li[role="${role}"], li ${tagOf}`));
  for (const l of tries) if (await l.first().count().catch(() => 0)) return l.first();
  return null;
}

// A clickable row the product drew with no control role (a list row, a view link, an icon picture): flows.mjs records
// it as role "row", and a correct rebuild makes it a link or a button (rule 7, jsx-a11y) — so it is looked up under
// those roles, the one its effect implies first (navigate → link, open/change → button), then as a row. Found on the
// first designer's product: 29 of 29 transitions were "missing control: row" against a rebuild of links and buttons.
async function locateRow(role, c, effect, seen) {
  if (role !== 'row') return locate(role, c, seen);
  const order = (effect?.kind === 'navigate' && !effect.toScreen ? ['link', 'button'] : ['button', 'link']).concat(['row', 'menuitem', 'tab']);
  const before = new Map(seen); // a failed role must not use up the k-th match of a name that holds a record
  for (const r of order) {
    const l = await locate(r, c, seen);
    if (l) return l;
    seen.clear(); for (const [k, v] of before) seen.set(k, v);
  }
  return locate('row', c, seen);
}

const ONLY = args.flatMap((a, i) => (a === '--only' ? [args[i + 1]] : []));
const REQUIRE = args.flatMap((a, i) => (a === '--require' ? [args[i + 1]] : []));
const report = [];
// An --only value that matches no screen is a failure, never silently nothing (the screen was captured after the last flows run)
// (--require is judged the same way: a typo there would otherwise un-require nothing and say nothing)
const unknownOnly = [...ONLY, ...REQUIRE].filter((v) => !flows.screens.some((x) => x.name === v || x.path === v));
for (const s of flows.screens.filter((x) => !ONLY.length || ONLY.includes(x.name) || ONLY.includes(x.path))) {
  if (s.unreachable || !s.pattern) {
    // flows.mjs could not reach this screen in the app any more: nothing to open or compare
    report.push({ product: s.name ?? s.url, name: s.name, prototype: '', unreachable: true, renders: true, missingCopy: [], transitions: { ok: 0, missing: [], dead: [], wrong: [] }, layout: [], density: null, errors: [], leftOut: { elements: 0, controls: 0 } });
    continue;
  }
  const r = { product: s.name ? `${s.path} · ${s.name}` : s.path, name: s.name, prototype: screenUrl(s), missingCopy: [], transitions: { ok: 0, missing: [], dead: [], wrong: [] }, layout: [], density: null, errors: [], leftOut: { elements: 0, controls: 0 } };
  errors.length = 0;
  await open(r.prototype);
  // The Workbench's own screen list (data-workbench-index) is what an unknown route shows: the prototype has no such screen
  const { bodyText, isIndex } = await page.evaluate(() => ({ bodyText: document.body.innerText.trim().length, isIndex: !!document.body.querySelector('[data-workbench-index]') }));
  r.renders = bodyText > 0 && !isIndex;
  // task mode (gates task): a flow screen not built yet is listed, not failed — the flow is done only without this flag
  if (isIndex && REQUIRE.includes(s.name)) {
    report.push({ ...r, renders: false, requiredButUnbuilt: true, screenshot: undefined, errors: [], leftOut: { elements: 0, controls: 0 } });
    continue;
  }
  if (isIndex && args.includes('--skip-unbuilt')) {
    report.push({ ...r, skipped: true, renders: true, screenshot: undefined, errors: [], leftOut: { elements: 0, controls: 0 } });
    continue;
  }
  const cap = captureOf(s);
  const isDetail = s.pattern.includes(':id');
  if (r.renders && cap) {
    const mine = await page.evaluate(PAGE_ELEMENTS, { style: STYLE, colours: COLOURS });
    const chrome = chromeOf(cap.elements || [], isDetail).filter((e) => !isData(e.text));
    const theirs = chrome.filter((e) => !leftOut(e.text));
    r.leftOut.elements = chrome.length - theirs.length;
    const protoChrome = chromeOf(mine, isDetail);
    // a prototype-only bar at the top (excluded): the prototype is built without it, so the app's boxes sit `top` px higher
    const band = excludedBand(cap, leftOutParts);
    const top = band?.top ?? 0, left = band?.left ?? 0;
    if (band?.top) r.leftOut.band = band.top;
    if (band?.left) r.leftOut.bandLeft = band.left;
    // R31: the layout also covers every other app element with its own text that the prototype shows too; a text the
    // prototype lacks is not a failure there (missing text is the copy check's job, for interface elements only)
    const asChrome = new Set(theirs);
    const protoLayout = layoutOf(mine, isDetail);
    const wider = layoutOf(cap.elements || [], isDetail).filter((e) => !asChrome.has(e) && !isData(e.text) && !leftOut(e.text));
    // A box fixed to the bottom of the window (a side panel, a drawer) does not move up with the band: in the app it ends at
    // the window's bottom under the band, in the prototype at the same bottom with nothing above it (the 2nd cold run's
    // Evaluator panel). Elements inside it may keep their distance to the bottom instead of the shifted top.
    const vh = cap.meta?.viewport?.height;
    const pathOf = (x) => String(x.path ?? '').replace(/\s*>\s*/g, '>');
    const bottomFixed = top && typeof vh === 'number' ? (cap.elements || []).filter((a) => a.values?.position === 'fixed' && a.rect && Math.abs(a.rect.y + a.rect.h - vh) <= 2) : [];
    const inBottomFixed = (e) => bottomFixed.some((a) => a === e || pathOf(e).startsWith(`${pathOf(a)}>`));
    for (const e of [...theirs, ...wider]) {
      const m = findInPrototype(e, asChrome.has(e) ? protoChrome : protoLayout, mine, top, left);
      if (!m) { if (asChrome.has(e) && !r.missingCopy.includes(e.text)) r.missingCopy.push(e.text); continue; }
      const off = [];
      for (const k of ['x', 'y', 'w', 'h']) { const was = k === 'y' ? e.rect.y - top : k === 'x' ? e.rect.x - left : e.rect[k]; if (Math.abs(m.rect[k] - was) > TOL && !(k === 'y' && inBottomFixed(e) && Math.abs(m.rect.y - e.rect.y) <= TOL)) off.push(`${k} ${was}→${m.rect[k]}`); }
      // R31b: in the wider set a pair is compared only when the boxes agree; the same text held by a different element
      // (a span inside a field, a row of another list) is a different DOM, not a layout difference — skipped
      if (!asChrome.has(e) && off.length) continue;
      for (const k of STYLE) if (e.values?.[k] !== undefined && e.values[k] !== m.values[k] && !(parseFloat(e.values[k]) === parseFloat(m.values[k]))) off.push(`${k} ${e.values[k]}→${m.values[k]}`);
      for (const k of COLOURS) { const a = parseColor(e.values?.[k]), b = parseColor(m.values[k]); if (a && b && ((a.a > 0 || b.a > 0) && (Math.abs(a.a - b.a) > 0.02 || oklabDistance(a, b) > 0.02))) off.push(`${k} ${e.values[k]}→${m.values[k]}`); }
      if (off.length) r.layout.push({ text: e.text, tag: e.tag, off });
    }
    const rows = (els) => els.filter((e) => e.tag === 'tr' && /tbody/.test(e.path) && e.rect.y < H).length;
    const theirRows = rows(cap.elements || []), myRows = rows(mine);
    if (theirRows) r.density = { product: theirRows, prototype: myRows, ok: Math.abs(theirRows - myRows) <= 1 };
  } else if (!cap) { r.note = NO_BASELINE; r.noBaseline = true; }
  // transitions
  const seenData = new Map();
  const unnamed = new Map(); // role -> how many of the product's unnamed controls of that role were met
  const kitSeen = new Map();
  const checked = s.transitions.filter((x) => ['navigate', 'open', 'change'].includes(x.effect.kind));
  r.leftOut.controls = checked.filter((x) => leftOut(x.control.name)).length;
  for (const t0 of checked.filter((x) => !leftOut(x.control.name))) {
    await open(r.prototype);
    const role = ROLE[t0.control.role] ?? t0.control.role;
    let t = t0;
    if (!t0.control.name && !t0.control.icon) {
      const k = unnamed.get(role) ?? 0; unnamed.set(role, k + 1);
      const given = kitNames[s.name]?.[t0.control.role]?.[k] ?? kitNames[s.name]?.[role]?.[k];
      if (given) t = { ...t0, control: { ...t0.control, name: given, inData: false, kitName: true } };
    }
    // A control in repeated data carries the row's data in its name, and the data is invented: find it by role in a
    // row. But a control can sit in a list and still be interface (a menu of li[role=menuitem]): by name first.
    // a kit name given to several of the product's controls (a chevron on every row): the n-th of them, in order
    let loc;
    if (t.control.kitName) {
      const n = kitSeen.get(t.control.name) ?? 0; kitSeen.set(t.control.name, n + 1);
      const all = page.getByRole(role, { name: t.control.name, exact: true });
      loc = (await all.count().catch(() => 0)) > n ? all.nth(n) : null;
    } else loc = await locateRow(role, t.control, t.effect, seenData);
    if (!loc) { r.transitions.missing.push(`${t.control.kitName ? `${t.control.role} ""` : missingControlText(t.control)}${t.control.kitName ? ` (the kit's "${t.control.name}" not found)` : ''}`); continue; }
    const before = await page.evaluate(SNAP);
    try { await loc.click({ timeout: 3000 }); } catch { r.transitions.dead.push(`${t.control.role} "${t.control.name}" (not clickable)`); continue; }
    await page.waitForTimeout(400);
    const after = await page.evaluate(SNAP);
    const kind = after.url !== before.url ? 'navigate' : after.surfaces.length > before.surfaces.length ? 'open' : after.textHash !== before.textHash || after.elements !== before.elements ? 'change' : 'none';
    const label = `${t.control.role} "${t.control.kitName ? '' : t.control.name}"${t.control.kitName ? ` (the kit's "${t.control.name}", flows/names.json)` : ''}${t.control.inData ? ' (a data row)' : ''}`;
    const target = t.effect.kind === 'navigate' ? targetScreen(t.effect, flows.screens) : null;
    if (kind === 'none') r.transitions.dead.push(`${label} — the product's ${t.effect.kind}s${t.effect.toScreen ? ` to the ${t.effect.toScreen} screen` : t.effect.pattern ? ` to ${t.effect.pattern}` : t.effect.surface ? ` a ${t.effect.surface}` : ''}`);
    else if (kind !== t.effect.kind && !(t.effect.kind === 'change' && kind === 'open') && !(t.effect.kind === 'open' && kind === 'change')) r.transitions.wrong.push(`${label}: the product's ${t.effect.kind}s, the prototype's ${kind}s`);
    else if (target && kind === 'navigate' && after.url !== screenUrl(target) && !(!t.effect.toScreen && pattern(after.url.replace('#', '')) === pattern(screenUrl(target).replace('#', '')))) r.transitions.wrong.push(`${label}: goes to ${after.url}, the product's to the ${t.effect.toScreen ?? target.name} screen (${screenUrl(target)})`);
    else if (t.effect.kind === 'navigate' && !target && protoUrl(t.effect.to, t.effect.pattern) !== after.url && pattern(after.url.replace('#', '')) !== pattern(new URL(protoUrl(t.effect.to, t.effect.pattern)).href.replace('#', ''))) r.transitions.wrong.push(`${label}: goes to ${after.url}, the product's to ${t.effect.pattern}`);
    else r.transitions.ok++;
  }
  r.errors = [...errors];
  await open(r.prototype);
  const shot = `flows/parity/${shotFileName(s)}`;
  await page.screenshot({ path: join(P.spec, shot) }).catch(() => {});
  r.screenshot = shot;
  r.productScreenshot = cap?.meta?.screenshot;
  report.push(r);
}
await browser.close();
server?.close();

const fails = (r) => !r.skipped && (r.unreachable || r.noBaseline || !r.renders || r.errors.length || r.missingCopy.length || r.transitions.missing.length || r.transitions.dead.length || r.transitions.wrong.length || r.layout.length || (r.density && !r.density.ok));
// --only with --merge writes its screens into parity.json over their last results (a run split into parallel parts:
// each part merges what it checked; the file is read again just before the write)
const PARITY = join(P.spec, 'flows', 'parity.json');
if (!ONLY.length) writeFileSync(PARITY, JSON.stringify({ prototype: BASE, tolerance: TOL, checkedAt: new Date().toISOString(), screens: report }, null, 1) + '\n');
else if (args.includes('--merge')) {
  const prev = existsSync(PARITY) ? JSON.parse(readFileSync(PARITY, 'utf8')) : { screens: [] };
  const key = (x) => x.name ?? x.product;
  const mine = new Set(report.map(key));
  const screens = [...(prev.screens || []).filter((x) => !mine.has(key(x))), ...report].sort((a, b) => flows.screens.findIndex((x) => (x.name ?? x.path) === key(a)) - flows.screens.findIndex((x) => (x.name ?? x.path) === key(b)));
  writeFileSync(PARITY, JSON.stringify({ prototype: BASE, tolerance: TOL, checkedAt: new Date().toISOString(), screens }, null, 1) + '\n');
}
if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
for (const v of unknownOnly) console.log(notInFlows(v));
for (const r of report) {
  if (r.skipped) { console.log(`– ${r.name ?? r.product}: not built yet (skipped)`); continue; }
  if (r.unreachable) { console.log(`✗ ${r.product}\n    ${UNREACHABLE}`); continue; }
  console.log(`${fails(r) ? '✗' : '✓'} ${r.product}  →  ${r.prototype}`);
  if (r.noBaseline) console.log(`    ${r.note}`);
  if (r.requiredButUnbuilt) console.log(`    ✗ ${r.name}: required by this task but its route shows the screen list — register it in src/screens/index.ts under the captured name '${r.name}'`);
  else if (!r.renders) console.log('    the prototype has no such screen (the route renders nothing)');
  for (const e of r.errors) console.log(`    console error: ${e}`);
  if (r.missingCopy.length) console.log(`    ${missingTextLine(r.missingCopy)}`);
  for (const m of r.transitions.missing) console.log(`    missing control: ${m}`);
  for (const d of r.transitions.dead) console.log(`    DEAD: ${d}`);
  for (const w of r.transitions.wrong) console.log(`    wrong: ${w}`);
  for (const l of r.layout.slice(0, 8)) console.log(`    off: ${l.tag} "${l.text}" — ${l.off.join(', ')}`);
  if (r.layout.length > 8) console.log(`    … ${r.layout.length - 8} more off (flows/parity.json)`);
  if (r.density && !r.density.ok) console.log(`    density: ${r.density.product} data rows on the first screen in the product, ${r.density.prototype} in the prototype`);
  if (r.transitions.ok) console.log(`    ${r.transitions.ok} transition(s) reproduced`);
  if (r.leftOut.elements || r.leftOut.controls) console.log(`    left out as prototype-only: ${r.leftOut.elements} element(s), ${r.leftOut.controls} control(s)${r.leftOut.band ? ` (a top band of ${r.leftOut.band} px: the app's positions are compared ${r.leftOut.band} px higher)` : ''}${r.leftOut.bandLeft ? ` (a left band of ${r.leftOut.bandLeft} px: the app's positions are compared ${r.leftOut.bandLeft} px further left)` : ''}`);
}
const skipped = report.filter((r) => r.skipped).length;
const bad = report.filter(fails).length + unknownOnly.length;
const T = report.reduce((n, r) => n + r.transitions.ok, 0), D = report.reduce((n, r) => n + r.transitions.dead.length + r.transitions.missing.length + r.transitions.wrong.length, 0);
if (ONLY.length) console.log(`(--only: ${report.length} of ${flows.screens.length} screens checked — a part, not the prototype)`);
if (!report.length) { console.log('parity: nothing was checked'); process.exit(1); }
const compared = report.length - skipped;
if (!bad && !compared) { console.log(`parity: 0 of ${report.length} screens compared (${skipped} not built yet, skipped) — nothing was compared yet. PASS.`); process.exit(0); }
console.log(bad ? `parity: ${bad} of ${report.length} screens differ from the product (${T} transitions reproduced, ${D} missing, dead or wrong). FAIL.` : `parity: ${skipped ? `${report.length - skipped} of ${report.length} screens (${skipped} not built yet, skipped)` : `all ${report.length} screens`}, ${T} transitions, the interface text and the layout match the product. PASS.`);
process.exit(bad ? 1 : 0);
