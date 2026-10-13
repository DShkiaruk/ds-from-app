// Every transition a running product offers, read-only — the checklist a prototype must reproduce.
// (Moved from ds-extract-method scripts/map_flows.mjs @ebaa66f; changes: names, the browser launcher.)
//
// For each screen (the URLs the baseline captures were taken at, or --url …), every visible control is pressed once,
// on a freshly loaded page, and what followed is recorded:
//   navigate  the URL changed (to which path — ids folded into a pattern, /accounts/:id) — or, in a product whose
//             screens share one URL, the page became ANOTHER captured screen (its landmark, below): { toScreen }
//   open      a surface appeared: a dialog, menu, listbox, popover, or a region that was not there
//   change    the page changed in place (a tab, a sort, a filter chip, a disclosure)
//   none      nothing — in a product, a control that does nothing is itself a finding
//
// Screens that share one URL (a single-URL app whose menu swaps the page in place): a capture taken with
// capture.mjs --click … --as-screen is a screen of its own. It is reached by loading its URL and replaying the
// capture's clicks, and it is recognised by its LANDMARK — the visible text of --landmark <css>. Without --landmark the
// landmark is the page's own heading: the first visible `main h1`, else `h1`, else `[role=heading][aria-level="1"]`.
// A pressed control that keeps the URL but changes that text is a screen change; a heading no capture holds is
// reported (pages reached at the same URL that no capture holds). A screen captured plainly counts as the screen its
// own heading names. Without landmarks every screen of such a product is the same URL,
// and the mapper sees one screen whose menu "changes" it — found on the first single-URL product, where all eleven
// screens lived at /tenant/home.
//
// Read-only, as the walker's --click: a control is REFUSED when it could change data — a submit control, a button
// inside a form that is not type=button, or one whose name reads like an action on data (delete, save, send, create,
// pay, invite, archive, sign out …) — or when its only name is an icon that reads so (a trash can), or when it unmasks
// what the page hides (REVEAL: "Show" beside a secret, an eye icon): its screenshot would hold the secret. Links to
// other origins and downloads are skipped. Refusals are listed, not silent. Clickable rows that are not controls (a table
// row with a delegated click handler) are pressed like controls, one per group of siblings (`group: N`), under the same
// name checks. A press that opens a layer (menu, dialog, drawer) is followed one level down: its controls are judged
// the same way and each safe one pressed once (`inside`). A tab press that changes its panel in place, with no capture
// holding that click, is listed (`uncapturedTabs`) with the capture command. Nothing is typed. Repeated rows (sixty
// account links) are one pattern: the first two of each are pressed.
//
// --allow <regex>: a control whose whole name matches is pressed although UNSAFE matches it — a menu item named
// "Order Management", a "Share" button that only opens a dialog. Decided per product, by a person who opened it;
// every one is listed in flows.json under `allowed`. It never lifts a REVEAL refusal.
// --deny <regex>: the opposite — a control whose whole name matches is refused although nothing above catches it (an
// export that opens the print dialog, a "Copy" that would put a credential on the clipboard). Listed under `refused`.
//
// Usage: node scripts/flows.mjs <product-repo> [--storage auth.json] [--url <screen url> …] [--viewport 1440x900]
//        [--landmark '<css>'] [--allow '<regex>'] [--deny '<regex>'] [--only <screen name> …] [--allow-writes (fixture/sandbox only)] [--reads '<regex>'] [--socket-reads '<regex over the socket URL>']
// Writes <repo>/flows/flows.json and a screenshot of every state reached (flows/<screen>--<n>.png).

import { launch } from './lib/browser.mjs';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { product, here } from './lib/product.mjs';
import { UNSAFE, REVEAL, REVEAL_ICON, blockWrites, blockedSummary, socketSummary, platformSummary } from './lib/safety.mjs';
import { restoreSession } from './lib/session.mjs';

const args = process.argv.slice(2);
const P = product(args.find((a) => !a.startsWith('--') && !args[args.indexOf(a) - 1]?.startsWith('--')), 'usage: node scripts/flows.mjs <product-repo> [--storage auth.json] [--url <url> …]');
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const many = (n) => args.flatMap((a, i) => (a === n ? [args[i + 1]] : []));
const [W, H] = (opt('--viewport') || '1440x900').split('x').map(Number);
const SETTLE = Number(opt('--settle') || 700);
const LANDMARK = opt('--landmark') || null;   // null: the default landmark, the page's own heading (see SNAP)
const ALLOW = opt('--allow') ? new RegExp(`^(?:${opt('--allow')})$`, 'i') : null;
const DENY = opt('--deny') ? new RegExp(`^(?:${opt('--deny')})$`, 'i') : null;
const ONLY = many('--only');

// The screens: explicit --url, else every distinct resting URL the baseline captures were taken at, plus every capture
// taken --as-screen (a screen reached by clicks at a URL other screens share).
let screensIn = many('--url').map((u) => ({ url: u, clicks: [] }));
const capDir = join(P.spec, 'baseline');
const caps = existsSync(capDir) ? readdirSync(capDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(capDir, f), 'utf8'))).filter((c) => c.meta?.tool === 'capture.mjs') : [];
if (!screensIn.length) {
  const base = (c) => !c.meta.rootSet && (c.meta.colorScheme || 'light') === 'light' && c.meta.viewport?.width >= 1024;
  // resting states: a capture reached by a click, or with a theme class set, is not a screen of its own — unless it was
  // taken --as-screen
  for (const u of new Set(caps.filter((c) => base(c) && !c.meta.clicked && c.meta.screenKind !== 'screen').map((c) => c.meta.finalUrl || c.meta.requestedUrl))) screensIn.push({ url: u, clicks: [], name: caps.find((c) => (c.meta.finalUrl || c.meta.requestedUrl) === u && !c.meta.clicked)?.meta.screen });
  const named = new Map();
  for (const c of caps.filter((c) => base(c) && c.meta.screenKind === 'screen')) if (!named.has(c.meta.screen)) named.set(c.meta.screen, { url: c.meta.requestedUrl, clicks: (c.meta.clicked || []).map((k) => k.selector), name: c.meta.screen, shared: true });
  screensIn.push(...named.values());
}
// --only presses one part of the screens, but every screen's landmark is still read: a control on a screen of this part
// that leads to a screen of another part must still be recognised as that screen.
const allScreens = screensIn;
if (ONLY.length) screensIn = screensIn.filter((s) => ONLY.includes(s.name));
if (!screensIn.length) { console.error('no screens: capture the baseline first, or pass --url'); process.exit(2); }

const pattern = (u) => { try { const x = new URL(u); return x.pathname.split('/').map((seg) => (/^[0-9a-f-]{8,}$|^\d+$|@|%40/i.test(seg) ? ':id' : seg)).join('/') + (x.search ? '?…' : ''); } catch { return u; } };

// In the page: the visible controls, each with its role, accessible name, a selector to find it again, the icon it
// draws (for a control whose only name is its icon), and whether it sits in repeated data (a table body, a list of rows).
const CONTROLS = (inner) => {
  const sel = 'a[href], button, [role="button"], [role="tab"], [role="menuitem"], [role="link"], [role="switch"], [role="checkbox"], summary, [aria-haspopup], [aria-expanded]';
  const out = [];
  const seen = new Set();
  const cssPath = (el) => { const parts = []; let n = el; while (n && n.nodeType === 1 && parts.length < 10) { let p = n.tagName.toLowerCase(); if (n.id && !/^(base-ui|radix|headlessui|:r|rc_|rc-)|uuid|\d{4,}/.test(n.id)) { parts.unshift(`${p}#${CSS.escape(n.id)}`); break; } const sib = [...(n.parentElement?.children || [])].filter((c) => c.tagName === n.tagName); if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(n) + 1})`; parts.unshift(p); n = n.parentElement; } return parts.join('>'); };
  const iconOf = (el) => {
    const d = el.querySelector('[data-icon]')?.getAttribute('data-icon'); if (d) return d;
    const svg = el.querySelector('svg'); const cls = (svg?.getAttribute('class') || '') + ' ' + (el.querySelector('[class*="icon-"], [class*="anticon-"]')?.getAttribute('class') || '');
    const m = cls.match(/(?:lucide-|anticon-|icon-|tabler-icon-|heroicon-)([a-z0-9-]+)/i); return m ? m[1] : '';
  };
  // inner: only what sits inside an opened layer (a menu, a dialog, a drawer), option rows included
  const layers = inner ? [...document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"], [popover], dialog[open], [data-state="open"]')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; }) : [document];
  const found = layers.flatMap((l) => [...l.querySelectorAll(inner ? sel + ', [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"]' : sel)]);
  for (const el of found) {
    if (seen.has(el)) continue; seen.add(el);
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const name = (el.getAttribute('aria-label') || (el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.innerText) || el.innerText || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 80);
    const role = el.getAttribute('role') || (el.tagName === 'A' ? 'link' : el.tagName === 'SUMMARY' ? 'button' : el.tagName.toLowerCase());
    out.push({
      role, name, selector: cssPath(el), href: el.getAttribute('href'), type: el.getAttribute('type'), icon: iconOf(el),
      inTablist: Boolean(el.closest('[role="tablist"]')),
      // tabs drawn without ARIA (buttons in a div.tabs): a "tab" / "tabs" class on the control or its parent
      tabLike: /(^|[\s_-])tabs?($|[\s_-])/i.test(`${typeof el.className === 'string' ? el.className : ''} ${typeof el.parentElement?.className === 'string' ? el.parentElement.className : ''}`), inForm: Boolean(el.closest('form')), disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
      inData: Boolean(el.closest('tbody, [role="row"], [role="rowgroup"] [role="row"], ul li, ol li, [role="listitem"]')),
      expanded: el.getAttribute('aria-expanded'), selected: el.getAttribute('aria-selected') ?? el.getAttribute('aria-current'),
    });
  }
  return out;
};
// In the page: the outermost visible elements that draw a pointer cursor but are not controls (a table row that opens a
// record through a delegated handler). They are pressed like controls, under the same name checks; of a group of
// siblings (same tag and class) only the first is listed, with the size of the group.
const UNPRESSED = () => {
  const ctl = 'a[href], button, input, select, textarea, summary, label, [role="button"], [role="tab"], [role="menuitem"], [role="link"], [role="switch"], [role="checkbox"], [role="combobox"], [aria-haspopup], [aria-expanded]';
  const cssPath = (el) => { const parts = []; let n = el; while (n && n.nodeType === 1 && parts.length < 10) { let p = n.tagName.toLowerCase(); if (n.id && !/^(base-ui|radix|headlessui|:r|rc_|rc-)|uuid|\d{4,}/.test(n.id)) { parts.unshift(`${p}#${CSS.escape(n.id)}`); break; } const sib = [...(n.parentElement?.children || [])].filter((c) => c.tagName === n.tagName); if (sib.length > 1) p += `:nth-of-type(${sib.indexOf(n) + 1})`; parts.unshift(p); n = n.parentElement; } return parts.join('>'); };
  const out = [];
  const taken = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest(ctl)) continue;
    const cs = getComputedStyle(el);
    if (cs.cursor !== 'pointer' || cs.visibility === 'hidden' || cs.display === 'none') continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (el.parentElement && taken.has(el.parentElement)) { taken.add(el); continue; }
    if (el.parentElement && el.parentElement !== document.body && getComputedStyle(el.parentElement).cursor === 'pointer') continue;
    taken.add(el);
    const sibs = [...(el.parentElement?.children || [])].filter((c) => c.tagName === el.tagName && c.className === el.className);
    if (sibs[0] !== el) continue;
    out.push({ text: (el.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80), selector: cssPath(el), group: sibs.length });
  }
  return out;
};
const SNAP = (landmark) => {
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  const surfaces = [...document.querySelectorAll('[role="dialog"], [role="menu"], [role="listbox"], [role="tooltip"], [data-state="open"], [popover], dialog[open]')].filter(vis).map((e) => e.getAttribute('role') || e.tagName.toLowerCase());
  const text = (e) => e.innerText.trim().replace(/\s+/g, ' ');
  // an explicit --landmark wins; else the text of the first visible `main h1`, else `h1`, else `[role=heading][aria-level="1"]`
  const mark = landmark
    ? [...document.querySelectorAll(landmark)].filter(vis).map(text).filter(Boolean).join(' | ')
    : ['main h1', 'h1', '[role="heading"][aria-level="1"]'].map((q) => [...document.querySelectorAll(q)].filter(vis).map(text).find(Boolean)).find(Boolean) ?? '';
  return { url: location.href, elements: document.querySelectorAll('body *').length, text: document.body.innerText.length, textHash: [...document.body.innerText].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0), surfaces, landmark: mark };
};

const browser = await launch();
const storage = opt('--storage') ? here(opt('--storage')) : undefined;
// writes are blocked by default (lib/safety.mjs); --allow-writes lifts it — only on a fixture or a sandbox. One list per context
const blockedLists = args.includes('--allow-writes') ? null : [];
// A FRESH browser context for every load. A product that keeps its UI state in localStorage or sessionStorage (the
// tab last open, the program last chosen, a list left expanded) carries it from one press into the next load inside
// one context — so "a freshly loaded page" was the previous press's page. Found on the first single-URL product:
// after one press opened its dashboards list, every analytics tab reloaded as that list, and after a program switch
// every later screen was mapped in the other program. The fixture plants it (spa.html remembers its last screen).
let ctx = null, page = null;
const fresh = async () => {
  if (ctx) await ctx.close().catch(() => {});
  ctx = await browser.newContext({ viewport: { width: W, height: H }, storageState: storage, reducedMotion: 'reduce' });
  await restoreSession(ctx, storage);
  if (blockedLists) blockedLists.push(await blockWrites(ctx, opt('--reads'), opt('--socket-reads')));
  page = await ctx.newPage();
};
mkdirSync(join(P.spec, 'flows'), { recursive: true });

// A page that is still drawing itself (charts, late data) changes with no press at all, and a press made then is
// credited with that change. Found on the first single-URL product: a bell that does nothing was recorded as changing
// its page by the four elements a chart was still removing. So each screen gets a CONTROL load — the same load, the
// same waits, no press — and a press whose page ends exactly as the control's did changed nothing itself.
// Load a screen in a fresh context: its URL, then its clicks (a screen of a single-URL product), each followed by a settle.
const SIGNIN = /\/(log-?in|sign-?in|auth)\b/i;
const openScreen = async (s) => {
  await fresh();
  await page.goto(s.url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => page.goto(s.url, { waitUntil: 'domcontentloaded' }).catch(() => {}));
  // a session that expired sends every screen to the sign-in page: stop, rather than record the screens as unreachable
  if (!SIGNIN.test(s.url) && SIGNIN.test(new URL(page.url()).pathname)) { console.error(`session expired: ${s.name ?? s.url} opened the sign-in page (${new URL(page.url()).pathname}) — refresh the session file and run again; flows.json was not written`); process.exit(3); }
  await page.waitForTimeout(SETTLE);
  for (const c of s.clicks) {
    const l = page.locator(c).first();
    if (!(await l.count().catch(() => 0))) return false;
    await l.click({ timeout: 5000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(SETTLE);
  }
  return true;
};

// Every shared-URL screen's landmark, read once: the page is recognised as that screen when its landmark matches.
const landmarkOf = new Map();
// A screen captured plainly (no --as-screen) counts too: its own heading is a landmark target (the landing view of a
// product whose menu swaps the page in place IS one of its screens).
const sharedNames = new Set(allScreens.filter((x) => x.shared).map((x) => x.name ?? x.url));
for (const s of allScreens) { await openScreen(s); landmarkOf.set(s.name ?? s.url, (await page.evaluate(SNAP, LANDMARK)).landmark); }
{
  const dup = [...landmarkOf.entries()].filter(([k, m], i, a) => sharedNames.has(k) && a.findIndex(([, x]) => x === m) !== i);
  if (dup.length) console.log(`  warning: landmark "${LANDMARK ?? 'the main heading'}" does not tell these screens apart: ${dup.map(([k, m]) => `${k} ("${m}")`).join(', ')} — pass a --landmark that does`);
}
const screenByLandmark = (mark) => [...landmarkOf.entries()].find(([, m]) => m && m === mark)?.[0];

const ROLE_OF = { link: 'link', button: 'button', tab: 'tab', menuitem: 'menuitem', checkbox: 'checkbox', switch: 'switch', combobox: 'combobox' };
// One verdict for every control the mapper might press (the page's, a clickable row, one inside an opened layer):
// { skip: why } | { refuse: {…} } | { allowed: bool } (pressable; allowed: UNSAFE matched, --allow lifted it).
const judge = (c, url, origin) => {
  if (c.disabled) return { skip: 'disabled' };
  if (c.href && /^(mailto|tel|javascript):/i.test(c.href)) return { skip: 'not a page' };
  if (c.href && !c.href.startsWith('#')) { try { if (new URL(c.href, url).origin !== origin) return { skip: 'another origin' }; } catch { /* relative */ } }
  // In a data row the name carries the row's data ("Edit Create your first guide"): the verb is its first word.
  const verb = c.inData ? c.name.split(' ')[0] : c.name;
  if (DENY && c.name && DENY.test(c.name)) return { refuse: { role: c.role, name: c.name, why: 'denied for this product (--deny)' } };
  if (REVEAL.test(verb) || REVEAL_ICON.test(c.icon)) return { refuse: { role: c.role, name: c.name, icon: c.icon || undefined, why: 'unmasks something the page hides' } };
  const risky = c.type === 'submit' || (c.inForm && c.role === 'button' && c.type !== 'button') || UNSAFE.test(verb) || (!c.name && UNSAFE.test(c.icon));
  if (risky && !(ALLOW && c.name && ALLOW.test(c.name) && c.type !== 'submit')) return { refuse: { role: c.role, name: c.name, icon: c.icon || undefined, why: 'could change data' } };
  return { allowed: risky };
};
const screens = [];
const unknownLandmarks = new Set();
// What a press did, from the page before and after it.
const effectOf = (before, after, id, own, origin) => {
  const newSurfaces = after.surfaces.filter((x, i) => after.surfaces.slice(0, i).concat(before.surfaces).filter((y) => y === x).length < after.surfaces.filter((y) => y === x).length);
  // Another screen at the same URL: the landmark moved to one a capture holds (the surfaces rule first — a dialog
  // with its own heading is a surface, not a screen).
  const toScreen = landmarkOf.size && after.url === before.url && after.landmark !== before.landmark && after.surfaces.length <= before.surfaces.length ? screenByLandmark(after.landmark) : undefined;
  if (landmarkOf.size && after.url === before.url && after.landmark !== before.landmark && after.landmark && after.landmark !== own && !toScreen && after.surfaces.length <= before.surfaces.length) unknownLandmarks.add(after.landmark);
  return after.url !== before.url && new URL(after.url).origin === origin
    ? { kind: 'navigate', to: new URL(after.url).pathname + new URL(after.url).search + new URL(after.url).hash, pattern: pattern(after.url) }
    : toScreen && toScreen !== id ? { kind: 'navigate', toScreen, landmark: after.landmark }
    : after.surfaces.length > before.surfaces.length ? { kind: 'open', surface: newSurfaces[0] ?? after.surfaces.at(-1), addedElements: after.elements - before.elements }
    : after.textHash !== before.textHash || Math.abs(after.elements - before.elements) > 0 ? { kind: 'change', addedElements: after.elements - before.elements }
    : { kind: 'none' };
};
let shots = 0;
for (const s of screensIn) {
  const url = s.url;
  const id = s.name ?? url;
  if (!(await openScreen(s))) { console.log(`  ${id}: its clicks no longer reach it — recapture`); screens.push({ url, name: s.name, clicks: s.clicks, unreachable: true, transitions: [] }); continue; }
  const origin = new URL(url).origin;
  const all = await page.evaluate(CONTROLS);
  const title = await page.evaluate(() => document.querySelector('h1')?.innerText?.trim() ?? document.title);
  const own = (await page.evaluate(SNAP, LANDMARK)).landmark;
  const rows = await page.evaluate(UNPRESSED);
  // One pattern for repeated data: the first two controls that share role and target pattern.
  const perPattern = new Map();
  const todo = [];
  const refused = [], skipped = [], allowed = [], unpressed = [];
  for (const c of all) {
    const j = judge(c, url, origin);
    if (j.skip) { skipped.push({ ...c, why: j.skip }); continue; }
    if (j.refuse) { refused.push(j.refuse); continue; }
    if (j.allowed) allowed.push({ role: c.role, name: c.name });
    const key = c.inData ? `${c.role}|${c.href ? pattern(new URL(c.href, url).href) : c.name.replace(/\d+/g, '#')}` : `${c.role}|${c.name}|${c.selector}`;
    const n = perPattern.get(key) || 0; perPattern.set(key, n + 1);
    if (c.inData && n >= 2) continue;
    todo.push(c);
  }
  // Clickable rows (not controls): one representative per group, under the same name checks. A row's name is data, so
  // the check is on the whole text (over-refusing a row is listed, not silent).
  for (const r of rows) {
    const c = { role: 'row', name: r.text, selector: r.selector, group: r.group, type: null, href: null, icon: '', inForm: false, inData: false, disabled: false };
    const j = judge(c, url, origin);
    if (j.refuse) { refused.push(j.refuse); unpressed.push({ text: r.text, selector: r.selector, why: j.refuse.why }); continue; }
    if (j.allowed) allowed.push({ role: 'row', name: c.name });
    todo.push(c);
  }
  const transitions = [];
  const tabs = [];
  // the control load: what the page does by itself between the moment a press is made and the moment its effect is read
  const control = {};
  if (todo.length) {
    await openScreen(s);
    control.before = await page.evaluate(SNAP, LANDMARK);
    await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(SETTLE);
    control.after = await page.evaluate(SNAP, LANDMARK);
    control.changed = control.after.elements !== control.before.elements || control.after.textHash !== control.before.textHash;
  }
  const settle = async () => { await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {}); await page.waitForTimeout(SETTLE); };
  // a selector that no longer matches (a generated id, a list re-ordered by the load) — the control by role and name
  const locate = async (c) => {
    let loc = page.locator(c.selector).first();
    if (!(await loc.count().catch(() => 0)) && c.name && c.role !== 'row') loc = page.getByRole(ROLE_OF[c.role] ?? c.role, { name: c.name, exact: true }).first();
    return (await loc.count().catch(() => 0)) ? loc : null;
  };
  const known = new Set(all.map((c) => c.selector));
  for (const c of todo) {
    await openScreen(s);
    const before = await page.evaluate(SNAP, LANDMARK);
    const ref = { role: c.role, name: c.name, selector: c.selector };
    const loc = await locate(c);
    if (!loc) { transitions.push({ control: ref, effect: { kind: 'unreachable' } }); continue; }
    try { await loc.click({ timeout: 3000 }); } catch (e) { transitions.push({ control: ref, effect: { kind: 'unclickable', why: String(e).slice(0, 80) } }); continue; }
    await settle();
    const after = await page.evaluate(SNAP, LANDMARK);
    const effect = effectOf(before, after, id, own, origin);
    if (effect.kind === 'change' && control.changed && after.elements === control.after.elements && after.textHash === control.after.textHash) { effect.kind = 'none'; effect.ownChange = 'the page ends the same with no press (control load)'; delete effect.addedElements; }
    if (effect.kind !== 'none' && effect.kind !== 'navigate') { const f = `flows/${(s.name || new URL(url).pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'}--${++shots}.png`; await page.screenshot({ path: join(P.spec, f) }).catch(() => {}); effect.screenshot = f; }
    const t = { control: { ...ref, inData: c.inData, href: c.href, icon: c.icon || undefined }, effect };
    if (c.group > 1) { t.group = c.group; t.note = `${c.group} similar, pressed the first`; }
    // One level down: a press that opened a layer — its own controls, each judged like the page's, each pressed once.
    if (effect.kind === 'open') {
      const inner = (await page.evaluate(CONTROLS, true)).filter((x, i, a) => !known.has(x.selector) && a.findIndex((y) => y.role === x.role && y.name === x.name) === i);
      t.inside = { refused: [], pressed: [] };
      const safe = [];
      for (const x of inner) {
        const j = judge(x, url, origin);
        if (j.refuse) t.inside.refused.push({ name: x.name, why: j.refuse.why });
        else if (!j.skip) safe.push(x);
      }
      for (const x of safe.slice(0, 12)) {
        await openScreen(s);
        const opener = await locate(c);
        if (opener) { await opener.click({ timeout: 3000 }).catch(() => {}); await settle(); }
        const b2 = await page.evaluate(SNAP, LANDMARK);
        const l2 = await locate(x);
        const rec = { role: x.role, name: x.name };
        if (!opener || !l2) { t.inside.pressed.push({ ...rec, effect: { kind: 'unreachable' } }); continue; }
        try { await l2.click({ timeout: 3000 }); } catch (e) { t.inside.pressed.push({ ...rec, effect: { kind: 'unclickable', why: String(e).slice(0, 80) } }); continue; }
        await settle();
        t.inside.pressed.push({ ...rec, effect: effectOf(b2, await page.evaluate(SNAP, LANDMARK), id, own, origin) });
      }
      if (safe.length > 12) t.inside.notPressed = safe.length - 12;
    }
    // A tab whose press changed the page in place leaves its panel uncaptured, unless a capture holds that click.
    if ((c.role === 'tab' || c.inTablist || c.tabLike) && effect.kind === 'change') {
      const held = caps.some((k) => k.meta.requestedUrl === url && k.meta.clicked?.at(-1)?.selector === c.selector && (k.meta.clicked?.length ?? 0) === s.clicks.length + 1);
      if (!held) {
        const scr = s.name ?? (new URL(url).pathname.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root');
        const q = (x) => `'${x.replace(/'/g, `'\\''`)}'`;
        tabs.push({ screen: scr, tab: c.name, selector: c.selector, command: `capture.mjs --url ${url} ${[...s.clicks, c.selector].map((x) => `--click ${q(x)}`).join(' ')} --screen ${scr}--${c.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'tab'}` });
      }
    }
    transitions.push(t);
  }
  screens.push({ url, name: s.name, clicks: s.clicks.length ? s.clicks : undefined, landmark: s.shared ? own : undefined, path: new URL(url).pathname + new URL(url).search, pattern: pattern(url), title, controls: all.length, pressed: todo.length, refused, allowed: allowed.length ? allowed : undefined, skipped: skipped.length, transitions, unpressed: unpressed.length ? unpressed.slice(0, 20) : undefined, unpressedCount: unpressed.length, uncapturedTabs: tabs.length ? tabs : undefined });
  const k = (x) => transitions.filter((t) => t.effect.kind === x).length;
  console.log(`  ${String(s.name ?? pattern(url)).padEnd(32)} ${all.length} controls: ${k('navigate')} navigate · ${k('open')} open · ${k('change')} change · ${k('none')} none · ${refused.length} refused${allowed.length ? ` · ${allowed.length} allowed` : ''}${transitions.some((t) => t.control.role === 'row') ? ` · ${transitions.filter((t) => t.control.role === 'row').length} clickable rows pressed` : ''}${unpressed.length ? ` · ${unpressed.length} clickable rows refused, not pressed` : ''}${transitions.some((t) => t.inside) ? ` · ${transitions.reduce((n, t) => n + (t.inside?.pressed.length || 0), 0)} pressed inside opened layers (${transitions.reduce((n, t) => n + (t.inside?.refused.length || 0), 0)} refused)` : ''}`);
}
await browser.close();
const blocked = blockedLists ? blockedLists.flat() : null;

// Merge into an existing flows.json when only some screens were re-mapped (--only), so one screen can be redone.
const out = join(P.spec, 'flows', 'flows.json');
let merged = screens;
if (ONLY.length && existsSync(out)) { const prev = JSON.parse(readFileSync(out, 'utf8')).screens || []; merged = [...prev.filter((x) => !ONLY.includes(x.name)), ...screens]; }
const doc = {
  _why: 'Every transition the product offers on its captured screens, pressed once each, read-only (scripts/flows.mjs). The prototype must reproduce each one: the Workbench repo\'s tools/parity.mjs checks it.',
  mappedAt: new Date().toISOString(), viewport: `${W}x${H}`, landmark: LANDMARK ?? undefined, allow: ALLOW ? opt('--allow') : undefined, deny: DENY ? opt('--deny') : undefined, blockedWrites: blocked ? [...new Set(blocked.map((b) => `${b.method} ${new URL(b.url).pathname}`))] : undefined, reads: blocked ? opt('--reads') ?? null : undefined, socketReads: blocked ? opt('--socket-reads') ?? null : undefined, screens: merged,
};
const T = merged.flatMap((s) => s.transitions);
// Screens the product navigates to that no capture holds: the screen list's gaps, found by following the product.
const known = new Set(merged.map((s) => s.pattern));
const reachable = [...new Set(T.filter((t) => t.effect.kind === 'navigate' && t.effect.pattern).map((t) => t.effect.pattern))].filter((p) => !known.has(p));
if (reachable.length) { doc.uncaptured = reachable; console.log(`  reachable but not captured (${reachable.length}): ${reachable.slice(0, 12).join(', ')} — capture them (capture.mjs), or tell the designer why not (your report)`); }
if (unknownLandmarks.size) { doc.uncapturedLandmarks = [...unknownLandmarks]; console.log(`  pages reached at the same URL that no capture holds (${unknownLandmarks.size}): ${[...unknownLandmarks].slice(0, 8).map((m) => `"${m}"`).join(', ')} — capture them --as-screen, or tell the designer why not (your report)`); }
const withUnpressed = merged.filter((s) => s.unpressedCount);
if (withUnpressed.length) console.log(`  clickable rows (not controls) refused as unsafe, not pressed (${withUnpressed.reduce((n, s) => n + s.unpressedCount, 0)} on ${withUnpressed.length} screens, e.g. "${withUnpressed[0].unpressed[0].text}") — what they open is unknown; capture one with --click '<selector>' --as-screen if the designer wants that screen`);
const tabsOpen = merged.flatMap((s) => s.uncapturedTabs || []);
if (tabsOpen.length) {
  doc.uncapturedTabs = tabsOpen;
  console.log(`  tab panels no capture holds (${tabsOpen.length}): ${tabsOpen.slice(0, 12).map((t) => `${t.screen} \u203a ${t.tab}`).join(', ')} — capture each the flow needs, e.g. node scripts/${tabsOpen[0].command}`);
}
writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
if (blocked?.length) console.log(`  ${blockedSummary(blocked)}`);
const sockLine = blockedLists ? socketSummary(...blockedLists) : null;
if (sockLine) console.log(`  ${sockLine}`);
const hostLine = platformSummary(...(blockedLists || []));
if (hostLine) console.log(`  ${hostLine}`);
console.log(`flows -> flows/flows.json: ${merged.length} screens, ${T.length} controls pressed (${T.filter((t) => t.effect.kind === 'navigate').length} navigate, ${T.filter((t) => t.effect.kind === 'open').length} open, ${T.filter((t) => t.effect.kind === 'change').length} change, ${T.filter((t) => t.effect.kind === 'none').length} did nothing), ${merged.reduce((n, s) => n + (s.refused?.length || 0), 0)} refused as unsafe`);
