#!/usr/bin/env node
// "The pages work": the production build (dist/), every screen opened in a browser, served by this tool.
//   console       no console error, no page error (warnings are listed)
//   links         every internal link resolves to a screen of this Workbench; external links are listed, never fetched
//   overflow      no horizontal scroll at the widths the app was captured at (extraction/baseline/*.json); at the other
//                 widths of the harness it is reported, not failed: the app never showed them
//   performance   at 1440: CLS <= 0.1, LCP <= 2.5 s, images <= 1 MB
//   basics        a <title>, exactly one <h1>, <html lang>
// Usage: node tools/check-pages.mjs [dist dir]
import { createServer } from 'node:http';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { launch } from './lib/browser.mjs';
import { classifyLink, perfProblems, seoProblems, widthPlan } from './lib/pages-model.mjs';

const root = resolve(process.argv[2] || 'dist');
if (!existsSync(join(root, 'index.html'))) { console.error(`no build at ${root}: run npm run build first`); process.exit(1); }
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let f = join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (p.endsWith('/') || !existsSync(f)) {
    if (extname(p)) { res.writeHead(404); return res.end('not found'); }   // a missing asset is a 404, not the page
    f = join(root, 'index.html');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f));
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };
const baseDir = join(process.cwd(), 'extraction', 'baseline');
const captured = existsSync(baseDir) ? readdirSync(baseDir).filter((f) => f.endsWith('.json')).map((f) => readJson(join(baseDir, f))?.meta?.viewport?.width) : [];
const routes = readJson(join(process.cwd(), 'extraction', 'flows', 'routes.json')) ?? {};
// the app's pages this Workbench does not build: flow screens not built yet, and the app's other pages (by name and by the
// last part of their path, as a #/<name> route would name them)
const flowsDoc = readJson(join(process.cwd(), 'extraction', 'flows', 'flows.json')) ?? {};
const appPages = new Map();
const lastSeg = (p) => decodeURIComponent(String(p ?? '').split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop() || '');
for (const sc of flowsDoc.screens ?? []) {
  if (sc.name) appPages.set(sc.name, 'a flow screen not built yet');
  for (const t of sc.transitions ?? []) if (t.effect?.to) { const k = lastSeg(t.effect.to); if (k && !appPages.has(k)) appPages.set(k, 'a page of the app outside the flow'); }
}
for (const h of flowsDoc.uncapturedLandmarks ?? []) { const k = String(h).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, ''); if (k && !appPages.has(k)) appPages.set(k, 'a page of the app outside the flow'); }
for (const u of flowsDoc.uncaptured ?? flowsDoc.reachableNotCaptured ?? []) { const k = lastSeg(typeof u === 'string' ? u : u?.path ?? u?.url); if (k && !appPages.has(k)) appPages.set(k, 'a page of the app outside the flow'); }
const { cap, other } = widthPlan(captured.filter((w) => typeof w === 'number'));
const HEIGHT = 900;

let browser, problems = 0, screens = [];
const lines = [];
try {
  browser = await launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: HEIGHT } });
  // the screens: the Workbench's own index lists them all
  const idx = await ctx.newPage();
  await idx.goto(BASE, { waitUntil: 'load' });
  await idx.waitForSelector('[data-workbench-index]', { timeout: 10000 }).catch(() => {});
  screens = await idx.$$eval('[data-workbench-index] a[href^="#/"]', (as) => as.map((a) => decodeURIComponent(a.getAttribute('href').replace(/^#\/?/, ''))));
  await idx.close();

  for (const name of screens) {
    const bad = [], warn = [], notes = [], external = new Set();
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: HEIGHT });
    // A resource that did not load is judged by where it lives, not by its console line: a file of this build missing is
    // the Workbench's fault; one from another origin (the app's web fonts on its own server, a CDN) is the network's —
    // found on GitHub Actions, where the app's font server was out of reach: listed, not failed.
    const own = (u) => { try { return new URL(u).origin === new URL(BASE).origin; } catch { return false; } };
    page.on('console', (m) => { if (m.type() === 'error') { if (!/^Failed to load resource/.test(m.text())) bad.push(`console error: ${m.text().slice(0, 200)}`); } else if (m.type() === 'warning') warn.push(m.text().slice(0, 200)); });
    const told = new Set(); // one line per resource: a 404 can also come back as a failed request
    page.on('response', (res) => { if (res.status() >= 400 && !told.has(res.url())) { told.add(res.url()); (own(res.url()) ? bad.push(`a file of the build is missing (${res.status()}): ${res.url().slice(0, 160)}`) : warn.push(`an outside resource answered ${res.status()}: ${res.url().slice(0, 160)}`)); } });
    page.on('requestfailed', (q) => { if (told.has(q.url())) return; told.add(q.url()); (own(q.url()) ? bad.push(`a file of the build did not load: ${q.url().slice(0, 160)}`) : warn.push(`an outside resource did not load (the network or its server, not the Workbench): ${q.url().slice(0, 160)}`)); });
    page.on('pageerror', (e) => bad.push(`page error: ${String(e.message).slice(0, 200)}`));
    await page.addInitScript(() => {
      window.__m = { cls: 0, lcp: null };
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch { /* not supported */ }
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch { /* not supported */ }
    });
    const route = typeof routes[name] === 'string' ? routes[name] : `#/${encodeURIComponent(name)}`;
    await page.goto(new URL(route, BASE).href, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    const d = await page.evaluate(() => {
      const bytes = performance.getEntriesByType('resource').filter((e) => e.initiatorType === 'img' || (e.initiatorType === 'css' && /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/i.test(e.name)) || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(e.name)).reduce((s, e) => s + (e.transferSize || e.encodedBodySize || 0), 0);
      return {
        cls: window.__m.cls, lcpMs: window.__m.lcp, imageBytes: bytes, title: document.title, h1Count: document.querySelectorAll('h1').length, lang: document.documentElement.lang,
        hrefs: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')), ids: [...document.querySelectorAll('[id]')].map((e) => e.id),
      };
    });
    bad.push(...seoProblems(d));
    bad.push(...perfProblems(d));
    const ids = new Set(d.ids);
    for (const h of d.hrefs) {
      const c = classifyLink(h, BASE, screens, routes, (id) => ids.has(id), appPages);
      if (c.kind === 'bad') bad.push(`link ${h}: ${c.why}`);
      else if (c.kind === 'elsewhere') notes.push(`link ${h}: ${c.why}`);
      else if (c.kind === 'external') external.add(h);
    }
    for (const w of [...cap, ...other]) {
      await page.setViewportSize({ width: w, height: HEIGHT });
      await page.waitForTimeout(150);
      const sw = await page.evaluate(() => ({ scroll: document.scrollingElement.scrollWidth, inner: window.innerWidth }));
      if (sw.scroll > sw.inner + 1) {
        if (cap.includes(w)) bad.push(`horizontal scroll at ${w} px (page ${sw.scroll} px wide); the app was captured at this width and the capture does not record scrolling, so it counts as the Workbench's`);
        else notes.push(`overflow at ${w} px, not captured in the app: its behaviour at ${w} px is unknown`);
      }
    }
    await page.close();
    problems += bad.length;
    lines.push(`${bad.length ? '✗' : '✓'} ${name}${bad.length ? ': ' : ''}${bad.join('; ')}`);
    lines.push(`    CLS ${d.cls.toFixed(3)}, LCP ${d.lcpMs == null ? 'n/a' : (d.lcpMs / 1000).toFixed(2) + ' s'}, images ${(d.imageBytes / 1e6).toFixed(2)} MB`);
    for (const n of notes) lines.push(`    note: ${n}`);
    for (const x of [...new Set(warn)]) lines.push(`    warning: ${x}`);
    for (const x of external) lines.push(`    external (not fetched): ${x}`);
  }
} catch (e) {
  lines.push(`✗ the browser run failed: ${e.message}`); problems++;
} finally {
  await browser?.close().catch(() => {});
  server.close();
}
for (const l of lines) console.log(l);
console.log(`check:pages: ${screens.length} screens, ${problems} problems`);
process.exit(problems ? 1 : 0);
