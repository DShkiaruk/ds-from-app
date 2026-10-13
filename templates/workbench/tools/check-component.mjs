#!/usr/bin/env node
// One component against the capture, before a whole screen exists. The built Storybook (storybook-static) is opened
// story by story; each element with its own text is matched by exact text to the captured elements of the app
// (extraction/baseline/*.json, the flow's screens first) and compared: box within 2 px, font properties exactly,
// colours within OKLab 0.02 (as parity), padding / radius / border width within 1 px. A difference reads
// <story's value>→<the app's value>.
// Not one of the gates: the build loop runs it before a component's commit.
// Usage: npm run check:component -- <Name> [--story <id>]      (after npm run build-storybook)
// Exit: 0 nothing differs · 1 a difference (a size difference flagged "may be the story's container" does not count) · 2 cannot run.
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { launch } from './lib/browser.mjs';
import { parseColor, oklabDistance } from './lib/color.mjs';
import { layoutElements } from './lib/flow-model.mjs';

const ROOT = process.cwd();
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const ONLY = opt('--story');
const NAME = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--story');
const die = (m, code = 2) => { console.error(m); process.exit(code); };
if (!NAME && !ONLY) die('usage: npm run check:component -- <Name> [--story <id>]');

const SB = join(ROOT, 'storybook-static');
const INDEX = join(SB, 'index.json');
if (!existsSync(INDEX)) die('check:component: storybook-static is missing — run `npm run build-storybook` first.');
const newest = (d) => { let t = 0; if (!existsSync(d)) return t; for (const e of readdirSync(d, { withFileTypes: true })) t = Math.max(t, e.isDirectory() ? newest(join(d, e.name)) : statSync(join(d, e.name)).mtimeMs); return t; };
if (newest(join(ROOT, 'src')) > statSync(INDEX).mtimeMs) die('check:component: storybook-static is older than src/ — run `npm run build-storybook` first.');

const idx = JSON.parse(readFileSync(INDEX, 'utf8'));
const all = Object.values(idx.entries ?? idx.stories ?? {}).filter((e) => (e.type ?? 'story') === 'story');
const mine = ONLY ? all.filter((e) => e.id === ONLY) : all.filter((e) => e.title === NAME || e.title.endsWith(`/${NAME}`));
if (!mine.length) die(`check:component: no story for ${ONLY || NAME} in storybook-static/index.json.`);
// States / Playground stories are not the component's resting look (pseudo-state demos, free knobs).
const resting = mine.filter((e) => !/^(states?|playground)$/i.test(e.name));
const stories = ONLY || !resting.length ? mine : resting;

// The captures: light, desktop, resting state; the flow's screens first.
const BASE = join(ROOT, 'extraction', 'baseline');
const caps = existsSync(BASE) ? readdirSync(BASE).filter((f) => f.endsWith('.json')).map((f) => { try { return JSON.parse(readFileSync(join(BASE, f), 'utf8')); } catch { return null; } })
  .filter((c) => c && c.meta?.tool === 'capture.mjs' && (!c.meta.clicked || c.meta.screenKind === 'screen') && !c.meta.rootSet && (c.meta.colorScheme || 'light') === 'light' && c.meta.viewport?.width >= 1024) : [];
let flowScreens = [];
try { flowScreens = JSON.parse(readFileSync(join(ROOT, 'extraction', 'flows', 'flows.json'), 'utf8')).screens ?? []; } catch { /* no flow yet */ }
const inFlow = (c) => flowScreens.some((s) => (s.name && c.meta.screen === s.name) || (s.url && (c.meta.finalUrl || c.meta.requestedUrl) === s.url));
caps.sort((a, b) => Number(inFlow(b)) - Number(inFlow(a)));
const capEls = caps.map((c) => layoutElements(c.elements || []));
if (!caps.length) die('check:component: no baseline capture in extraction/baseline — nothing to compare with.');

// storybook-static, served here on a free port (no dependency).
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const f = join(SB, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(SB) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const URL_BASE = `http://127.0.0.1:${server.address().port}`;

const KEYS = ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopLeftRadius',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor'];
const PAGE = (keys) => {
  const root = document.querySelector('#storybook-root');
  const rr = root.getBoundingClientRect();
  const els = [];
  for (const el of root.querySelectorAll('*')) {
    let own = ''; for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
    own = own.trim().replace(/\s+/g, ' ');
    if (!own || own.length > 80) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); const values = {}; for (const k of keys) values[k] = cs[k];
    els.push({ tag: el.tagName.toLowerCase(), text: own, w: Math.round(r.width), h: Math.round(r.height), values });
  }
  return { root: { w: Math.round(rr.width), h: Math.round(rr.height) }, els };
};

const px = (v) => parseFloat(v) || 0;
const NAMES = { borderTopLeftRadius: 'radius' };
const name = (k) => NAMES[k] ?? k.replace(/([A-Z])/g, '-$1').toLowerCase();
// story → capture. `size` entries are width / height; a size the story's root is too narrow to hold is flagged.
function compare(s, c, root) {
  const diffs = [], size = [];
  for (const [k, sv, cv, rootDim] of [['width', s.w, c.rect.w, root.w], ['height', s.h, c.rect.h, root.h]]) {
    if (Math.abs(sv - cv) > 2) size.push({ txt: `${k} ${sv}→${cv}`, container: rootDim < cv });
  }
  const sv = s.values, cv = c.values || {};
  for (const k of ['fontSize', 'fontWeight', 'lineHeight', 'letterSpacing']) if (cv[k] !== undefined && String(sv[k]) !== String(cv[k])) diffs.push(`${name(k)} ${sv[k]}→${cv[k]}`);
  for (const k of ['color', 'backgroundColor']) {
    const a = parseColor(sv[k]), b = parseColor(cv[k]);
    if (a && b && ((a.a > 0 || b.a > 0) && (Math.abs(a.a - b.a) > 0.02 || oklabDistance(a, b) > 0.02))) diffs.push(`${name(k)} ${sv[k]}→${cv[k]}`);
  }
  for (const k of ['paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopLeftRadius', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']) {
    if (cv[k] !== undefined && Math.abs(px(sv[k]) - px(cv[k])) > 1) diffs.push(`${name(k)} ${px(sv[k])}→${px(cv[k])}`);
  }
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    if (px(sv[`border${side}Width`]) > 0 && px(cv[`border${side}Width`]) > 0) {
      const a = parseColor(sv[`border${side}Color`]), b = parseColor(cv[`border${side}Color`]);
      if (a && b && oklabDistance(a, b) > 0.02) diffs.push(`border-${side.toLowerCase()}-color ${sv[`border${side}Color`]}→${cv[`border${side}Color`]}`);
    }
  }
  return { diffs, size };
}

let matched = 0, differ = 0, unknown = 0;
const browser = await launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  for (const st of stories) {
    console.log(`${st.title} / ${st.name} (${st.id})`);
    await page.goto(`${URL_BASE}/iframe.html?id=${encodeURIComponent(st.id)}&viewMode=story`, { waitUntil: 'load' });
    await page.waitForSelector('#storybook-root > *', { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.fonts?.ready).catch(() => {});
    await page.waitForTimeout(200);
    const { root, els } = await page.evaluate(PAGE, KEYS);
    if (!els.length) { console.log('  (no text-bearing element in the story)'); continue; }
    const notIn = [];
    for (const s of els) {
      // the first capture (flow screens first) that shows this text; among its elements with that text, the closest one
      let best = null, found = false;
      for (const list of capEls) {
        const cands = list.filter((e) => e.text === s.text && e.rect);
        if (!cands.length) continue;
        found = true;
        for (const c of cands) { const r = compare(s, c, root); r.hard = r.diffs.length + r.size.filter((z) => !z.container).length; if (!best || r.hard < best.hard) best = r; }
        break;
      }
      if (!found) { unknown++; if (!notIn.includes(s.text)) notIn.push(s.text); continue; }
      const soft = best.size.filter((z) => z.container).map((z) => `${z.txt} (may be the story's container)`);
      if (best.hard) {
        differ++;
        console.log(`  ✗ ${s.text}: ${[...best.size.filter((z) => !z.container).map((z) => z.txt), ...best.diffs, ...soft].join(', ')}`);
      } else { matched++; console.log(`  ✓ ${s.text}${soft.length ? ` — ${soft.join(', ')}` : ''}`); }
    }
    if (notIn.length) console.log(`  not in any capture: ${notIn.map((t) => `"${t}"`).join(', ')}`);
  }
} finally { await browser.close(); server.close(); }
console.log(`check:component: ${matched} matched, ${differ} differ, ${unknown} texts not in any capture`);
process.exit(differ ? 1 : 0);
