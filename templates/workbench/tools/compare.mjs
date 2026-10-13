#!/usr/bin/env node
// Side by side, for the designer: each flow screen as the product shows it and as the prototype draws it, with what
// parity found. Run `npm run parity` first (it takes the prototype's pictures).   -> extraction/compare.html
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { NO_BASELINE, UNREACHABLE } from './lib/flow-model.mjs';

const SPEC = join(process.cwd(), 'extraction');
const parityFile = join(SPEC, 'flows', 'parity.json');
if (!existsSync(parityFile)) { console.error('no extraction/flows/parity.json — run npm run parity first'); process.exit(2); }
const parity = JSON.parse(readFileSync(parityFile, 'utf8'));
const decisions = existsSync(join(SPEC, 'decisions.json')) ? JSON.parse(readFileSync(join(SPEC, 'decisions.json'), 'utf8')) : {};
const lang = (decisions.lang ?? 'uk') === 'en' ? 'en' : 'uk';
// only the screens of the current flow: older entries in parity.json (a screen taken out of the flow) are ignored
const flowScreens = Array.isArray(decisions.flow?.screens) && decisions.flow.screens.length ? new Set(decisions.flow.screens) : null;
const S = { uk: { title: 'Застосунок і прототип поруч', product: 'Застосунок', proto: 'Прототип', same: 'збігається', diff: 'відрізняється', unbuilt: 'ще не збудовано', band: (n) => `Смуга прототипу вгорі (${n} px) лишилась на знімку застосунку; у прототипі її немає — так і має бути.` },
            en: { title: 'The app and the prototype side by side', product: 'App', proto: 'Prototype', same: 'matches', diff: 'differs', unbuilt: 'not built yet', band: (n) => `The prototype bar at the top (${n} px) is in the app's picture; the prototype leaves it out on purpose.` } }[lang];
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const shots = existsSync(join(SPEC, 'baseline')) ? readdirSync(join(SPEC, 'baseline')).filter((f) => f.endsWith('--light.png')) : [];
const productShot = (name) => shots.find((f) => f.startsWith(`${name}--1440x900--`)) ?? shots.find((f) => f.startsWith(`${name}--`));
const rows = (parity.screens ?? []).filter((r) => !flowScreens || flowScreens.has(r.name ?? r.product)).map((r) => {
  const name = r.name ?? r.product;
  const t = r.transitions ?? {};
  const bad = !r.skipped && (r.unreachable || r.noBaseline || !r.renders || r.errors?.length || r.missingCopy?.length || t.missing?.length || t.dead?.length || t.wrong?.length || r.layout?.length || (r.density && !r.density.ok));
  const notes = [...(r.skipped ? ['not built yet (skipped)'] : []), ...(r.unreachable ? [UNREACHABLE] : []), ...(r.noBaseline ? [NO_BASELINE] : []), ...(!r.renders ? ['no such screen (the route renders nothing)'] : []), ...(r.errors ?? []).map((x) => `console error: ${x}`),
    ...(r.missingCopy ?? []).map((x) => `missing text: "${x}"`), ...(t.dead ?? []).map((x) => `DEAD: ${x}`), ...(t.missing ?? []).map((x) => `missing control: ${x}`),
    ...(t.wrong ?? []).map((x) => `wrong: ${x}`), ...(r.layout ?? []).slice(0, 10).map((l) => `off: ${l.tag} "${l.text}" — ${l.off.join(', ')}`),
    ...((r.layout ?? []).length > 10 ? [`+${r.layout.length - 10} more (extraction/flows/parity.json)`] : []),
    ...(r.density && !r.density.ok ? [`density: ${r.density.product} rows in the app, ${r.density.prototype} in the prototype`] : [])];
  const ps = r.productScreenshot ? null : productShot(name);
  const productSrc = r.productScreenshot ? `baseline/${esc(encodeURIComponent(basename(r.productScreenshot)))}` : ps ? `baseline/${esc(encodeURIComponent(ps))}` : '';
  return `<section><h2>${esc(name)} — ${r.skipped ? S.unbuilt : bad ? S.diff : S.same}</h2><div class="pair">
<figure><figcaption>${S.product}</figcaption>${productSrc ? `<img src="${productSrc}" alt="">` : ''}${r.leftOut?.band ? `<p class="band">${esc(S.band(r.leftOut.band))}</p>` : ''}</figure>
<figure><figcaption>${S.proto}</figcaption>${r.screenshot ? `<img src="${esc(r.screenshot.replace(/^extraction\//, '').split('/').map(encodeURIComponent).join('/'))}" alt="">` : ''}</figure></div>
${notes.length ? `<ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</section>`;
});
writeFileSync(join(SPEC, 'compare.html'), `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${S.title}</title>
<style>body{margin:0;padding:24px;font:15px/1.5 system-ui,sans-serif;background:#f6f6f4;color:#16160f}h1{font-size:24px}h2{font-size:18px;margin:32px 0 8px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:16px}figure{margin:0}figcaption{font-weight:600;margin-bottom:4px}img{width:100%;border:1px solid #c9c8c2;border-radius:6px;background:#fff}li{color:#5f5e57}.band{color:#5f5e57;font-size:13px;margin:6px 0 0}</style>
</head><body><h1>${S.title}</h1>${rows.join('\n')}</body></html>\n`);
console.log(`compare: ${join('extraction', 'compare.html')} (${rows.length} screen(s))`);
