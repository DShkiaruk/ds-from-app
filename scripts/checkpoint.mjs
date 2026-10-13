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
//   excluded:  [{ id, what, why, texts? }]     parts that look prototype-only (role switchers, demo toggles) — unticked
//   questions: [{ id, text, options: [...] }]  only what the designer can answer
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { product } from './lib/product.mjs';
import { bestCaptures } from './lib/card-capture.mjs';

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
  let prev;
  try { prev = readJson('checkpoint.json', {}); } catch {
    console.error('extraction/checkpoint.json is not valid JSON — fix or delete it (it holds the excluded parts and questions Claude wrote)');
    process.exit(2);
  }
  const baseDir = path.join(P.spec, 'baseline');
  const caps = fs.existsSync(baseDir)
    ? fs.readdirSync(baseDir).filter((f) => f.endsWith('.json')).sort().map((f) => {
      try { return JSON.parse(fs.readFileSync(path.join(baseDir, f), 'utf8')); } catch { console.error(`skipped extraction/baseline/${f}: not valid JSON`); return null; }
    }).filter((c) => c?.meta?.tool === 'capture.mjs')
    : [];
  const flows = readJson(path.join('flows', 'flows.json'), { screens: [] });
  const screens = new Map();
  const flagged = new Set(caps.filter((c) => c.meta.looksLikeSignIn).map((c) => c.meta.screen)); // ANY capture of a screen flagged flags its card
  // One card per screen: the capture chosen by lib/card-capture.mjs (light, wide, no theme class set by hand; never a surface).
  const best = bestCaptures(caps);
  for (const [id, c] of best) {
    const png = c.meta.screenshot ? path.join(baseDir, path.basename(c.meta.screenshot)) : null;
    if (png && !fs.existsSync(png)) console.error(`screenshot not found in extraction/baseline/: ${id} — re-capture into extraction/baseline`);
    screens.set(id, {
      id, name: id, url: c.meta.finalUrl || c.meta.requestedUrl,
      screenshot: png && fs.existsSync(png) ? path.relative(P.spec, png).split(path.sep).join('/') : null,
      looksLikeSignIn: flagged.has(id) || undefined,
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

const STR = {
  uk: {
    title: 'Рішення перед збиранням', intro: 'Тут усе, що інструмент знайшов у застосунку. Оберіть екрани для тестового флоу, перевірте назви з позначкою «запропонована назва» і відмітьте, що є лише частиною прототипу. Нічого не збирається, доки ви не натиснете «Готово».',
    questions: 'Питання', questionsIntro: 'На них можете відповісти лише ви.',
    flow: 'Тестовий флоу', flowIntro: 'Оберіть екрани, які ми перезберемо першими і порівняємо із застосунком. Порядок — той, у якому ви їх відмічаєте (цифра на картці).', flowName: 'Назва флоу',
    noShot: 'без знімка', signIn: 'схоже на сторінку входу — перевірте знімок', transitions: 'переходів: {n}',
    tokens: 'Токени', tokensIntro: 'Значення дизайну: кольори, радіуси, відступи, шрифти. Усі вони йдуть у проєкт як є. Перевірте лише назви з позначкою «запропонована назва»: у застосунку їх не було.',
    facts: '{n} з назвами із застосунку або вирішеними людиною — відкрийте, щоб подивитися', dark: 'темна тема',
    label: { measured: 'виміряно', derived: 'виведено', decided: 'вирішено', unknown: 'невідомо' },
    nameStatus: { product: 'назва із застосунку', proposed: 'запропонована назва', decided: 'вирішено людиною' },
    roleDerived: 'призначення виведене: напряму ніде не використовується',
    usesElements: 'на {n} елементах', usesRules: 'у {n} правилах стилів',
    components: 'Компоненти', componentsIntro: 'Частини інтерфейсу, які отримають свою сторінку в Storybook. Без галочки — те, що схоже на службову частину бібліотеки; поставте, якщо потрібне.',
    instances: '{i} шт. на {s} екр.', states: 'стани', part: 'схоже на службову частину бібліотеки, а не на компонент продукту',
    excludedTokens: 'кольори й значення лише цієї частини', excludedTexts: 'тексти', excluded: 'Лише для прототипу', excludedIntro: 'Схоже, ці частини існують лише для показу прототипу (перемикачі ролей, демо-кнопки). У проєкт вони не підуть. Поставте галочку, якщо це частина продукту.',
    comment: 'Ще щось?', commentPh: 'Необовʼязкова примітка для Claude', name: 'Назва', all: 'Обрати всі', none: 'Зняти всі',
    done: 'Готово', summary: 'Флоу: {f} екр. · компонентів: {c} · токенів: {t}',
    saved: 'Збережено', savedSub: 'Поверніться до Claude — він продовжить звідси. Вкладку можна закрити.',
    notSaved: 'Не збереглося', notSavedSub: 'Щось пішло не так. Скажіть про це Claude.',
    badToken: 'Лише малі латинські літери, цифри й дефіс; назва має бути унікальною', badComponent: 'Латиницею, з великої літери, без пробілів; назва має бути унікальною',
  },
  en: {
    title: 'Decisions before the build', intro: 'Everything the tool found in the app. Choose the screens for the test flow, check the names marked "proposed name", and mark what exists only in the prototype. Nothing is built until you press Done.',
    questions: 'Questions', questionsIntro: 'Only you can answer these.',
    flow: 'Test flow', flowIntro: 'Choose the screens we rebuild first and compare with the app. The order is the order you tick them in (the number on the card).', flowName: 'Flow name',
    noShot: 'no screenshot', signIn: 'looks like a sign-in page — check the screenshot', transitions: '{n} transitions',
    tokens: 'Tokens', tokensIntro: 'The design values: colours, radii, spacing, fonts. They all go into the project as they are. Check only the names marked "proposed name": the app had none.',
    facts: '{n} named by the app or decided by a person — open to look', dark: 'dark theme',
    label: { measured: 'measured', derived: 'derived', decided: 'decided', unknown: 'unknown' },
    nameStatus: { product: 'name from the app', proposed: 'proposed name', decided: 'decided by a person' },
    roleDerived: 'its purpose is derived: nothing uses it directly',
    usesElements: 'on {n} elements', usesRules: 'in {n} style rules',
    components: 'Components', componentsIntro: 'The parts of the interface that get their own Storybook page. Unticked: what looks like an internal part of a library; tick it if it is needed.',
    instances: '{i} on {s} screen(s)', states: 'states', part: 'looks like an internal part of a library, not a component of the product',
    excludedTokens: 'values only this part uses', excludedTexts: 'texts', excluded: 'Prototype only', excludedIntro: 'These parts seem to exist only to demo the prototype (role switchers, demo buttons). They stay out of the project. Tick one if it is part of the product.',
    comment: 'Anything else?', commentPh: 'Optional note for Claude', name: 'Name', all: 'Select all', none: 'Clear',
    done: 'Done', summary: 'Flow: {f} screen(s) · components: {c} · tokens: {t}',
    saved: 'Saved', savedSub: 'Go back to Claude — it continues from here. You can close this tab.',
    notSaved: 'Not saved', notSavedSub: 'Something went wrong. Tell Claude.',
    badToken: 'Lowercase Latin letters, digits and hyphens only; the name must be unique', badComponent: 'Latin letters, starting with a capital, no spaces; the name must be unique',
  },
};
const fmt = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');
const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const COLOUR = /^(#|rgb|hsl|oklch|oklab|lab\(|lch\(|color\()/i;

function page(inv, s, lang, picked, flowName, comment) {
  const badge = (cls, text, title) => `<span class="badge ${cls}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`;
  const labelBadge = (l, title) => badge({ measured: 'ok', derived: 'info', decided: 'muted' }[l] ?? 'muted', s.label[l] ?? l, title);
  const nameBadge = (n) => badge({ product: 'ok', proposed: 'warn', decided: 'muted' }[n] ?? 'muted', s.nameStatus[n] ?? n);
  const sw = (v) => (COLOUR.test(String(v)) ? `<span class="sw" style="background:${esc(v)}"></span>` : '');
  let errN = 0;
  const nameCell = (x) => (x.nameStatus === 'proposed' ? `<input type="text" value="${esc(x.name)}" aria-label="${esc(s.name)}: ${esc(x.id)}" aria-describedby="err-${++errN}"><div class="meta err" id="err-${errN}" hidden></div>` : `<span class="name">${esc(x.name)}</span>`);
  const uses = (u) => (u ? ` · ${esc(fmt(u.kind === 'elements' ? s.usesElements : s.usesRules, { n: u.n }))}` : '');
  const screens = (inv.screens ?? []).map((sc) => `<label class="screen" data-kind="flow" data-id="${esc(sc.id)}">
<input type="checkbox" ${picked.includes(sc.id) ? 'checked' : ''} aria-label="${esc(sc.name)}"><span class="order" aria-hidden="true"></span>
${sc.screenshot ? `<img src="/preview/${encodeURIComponent(sc.screenshot)}" alt="">` : `<span class="noimg">${esc(s.noShot)}</span>`}
<span class="name">${esc(sc.name)}</span>
<span class="meta">${esc(sc.url)}${sc.transitions != null ? ` · ${esc(fmt(s.transitions, { n: sc.transitions }))}` : ''}</span>
${sc.looksLikeSignIn ? `<span class="meta warn-text">${esc(s.signIn)}</span>` : ''}</label>`).join('');
  const tokenRow = (t) => `<div class="row token" data-kind="tokens" data-id="${esc(t.id)}"><span></span>
<div><div>${nameCell(t)}</div>
<div class="meta">${sw(t.value)}${esc(t.value)}${t.dark ? ` · ${esc(s.dark)} ${sw(t.dark)}${esc(t.dark)}` : ''}${uses(t.uses)}</div>
${t.label === 'measured' && t.roleLabel === 'derived' ? `<div class="meta">${esc(s.roleDerived)}</div>` : ''}</div>
<div class="side">${labelBadge(t.label, t.evidence)}${nameBadge(t.nameStatus)}</div></div>`;
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
<div><div class="name">${esc(x.what)}</div><div class="meta">${esc(x.why)}</div>${x.tokens?.length ? `<div class="meta">${esc(s.excludedTokens)}: ${esc(x.tokens.join(', '))}</div>` : ''}${x.texts?.length ? `<div class="meta">${esc(s.excludedTexts)}: ${esc(x.texts.map((t) => `"${t}"`).join(', '))}</div>` : ''}</div><div></div></div>`;
  const qs = (inv.questions ?? []).map((q) => `<div class="q" data-id="${esc(q.id)}"><div class="name">${esc(q.text)}</div>${(q.options ?? []).map((o) => `<label><input type="radio" name="q:${esc(q.id)}" value="${esc(o)}" ${q.answer === o ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div>`).join('');
  const client = { badToken: s.badToken, badComponent: s.badComponent, summary: s.summary, saved: s.saved, savedSub: s.savedSub, notSaved: s.notSaved, notSavedSub: s.notSavedSub };
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(s.title)} · ${esc(inv.project)}</title>
<style>
:root{--bg:#f6f6f4;--card:#fff;--ink:#16160f;--muted:#5f5e57;--line:#e4e3de;--ok:#1a6b3c;--okbg:#e3f3e9;--warn:#7a4f00;--warnbg:#fdf1d8;--err:#a01818;--info:#1d4f91;--infobg:#e3ecf8;--accent:#16160f}
@media (prefers-color-scheme:dark){:root{--bg:#121210;--card:#1c1c19;--ink:#f1f0ea;--muted:#b3b1a8;--line:#2e2d29;--okbg:#14301f;--ok:#8fdcab;--warnbg:#33270c;--warn:#f0c46b;--infobg:#132339;--err:#ff9d9d;--info:#a9c8f2;--accent:#f1f0ea}}
*{box-sizing:border-box}html{scroll-padding-block:56px 96px}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1040px;margin:0 auto;padding:32px 16px 120px}h1{font-size:26px;margin:0 0 4px}
h2{font-size:18px;margin:36px -16px 4px;padding:10px 16px;position:sticky;top:0;z-index:2;background:var(--bg);border-bottom:1px solid var(--line)}
.intro,.sub{color:var(--muted);margin:6px 0 10px;font-size:14px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4px 16px}
.row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:12px;align-items:start;padding:12px 0;border-top:1px solid var(--line)}.row:first-child{border-top:0}
.row.off .name{color:var(--muted)}.name{font-weight:600}.meta{color:var(--muted);font-size:13px;overflow-wrap:anywhere}.warn-text{color:var(--warn)}.err{color:var(--err)}input[aria-invalid=true]{border-color:var(--err)}button:disabled{opacity:.55;cursor:not-allowed}
input[type=text]{font:inherit;font-weight:600;color:var(--ink);background:transparent;border:1px solid var(--line);border-radius:6px;padding:2px 8px;width:min(320px,100%)}
input[type=checkbox],input[type=radio]{width:20px;height:20px;margin:2px 0 0;accent-color:var(--accent);cursor:pointer}
.badge{font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;white-space:nowrap}.ok{background:var(--okbg);color:var(--ok)}.warn{background:var(--warnbg);color:var(--warn)}.info{background:var(--infobg);color:var(--info)}.muted{background:var(--line);color:var(--ink)}
.side{display:flex;flex-direction:column;align-items:flex-end;gap:6px}
.sw{display:inline-block;width:18px;height:18px;border-radius:4px;vertical-align:-4px;margin-right:6px;box-shadow:inset 0 0 0 1px rgb(0 0 0/.2)}
.screens{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px}
.screen{display:grid;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;cursor:pointer;position:relative;align-content:start}
.screen input{position:absolute;top:16px;left:16px;z-index:1}
.order{position:absolute;top:14px;left:42px;z-index:1;width:20px;height:20px;border-radius:50%;background:var(--accent);color:var(--bg);font-size:12px;font-weight:700;display:none;align-items:center;justify-content:center}.order:not(:empty){display:flex}
.screen img,.noimg{width:100%;height:150px;object-fit:cover;object-position:top;border-radius:6px;border:1px solid var(--line);background:var(--bg)}
.noimg{display:grid;place-items:center;color:var(--muted);font-size:13px}
.field{display:flex;gap:8px;align-items:center;margin:10px 0}
.q{padding:14px 0;border-top:1px solid var(--line)}.q:first-child{border-top:0}.q label{display:flex;gap:8px;align-items:center;margin:4px 0}
details.group{background:var(--card);border:1px solid var(--line);border-radius:12px;margin:8px 0}details.group>summary{cursor:pointer;padding:10px 16px;font-weight:600}details.group .rows{padding:0 16px 4px}
.tools{display:flex;gap:8px;margin:0 0 8px;flex-wrap:wrap}.tools button{background:transparent;color:var(--ink);border:1px solid var(--line);padding:4px 10px;font-weight:500;font-size:13px}
textarea{font:inherit;width:100%;min-height:60px;border:1px solid var(--line);border-radius:8px;padding:8px;background:transparent;color:var(--ink)}
.bar #notsaved{max-width:1040px;margin:8px auto 0;font-size:14px}.bar{z-index:5;position:fixed;left:0;right:0;bottom:0;background:var(--card);border-top:1px solid var(--line);padding:12px 16px}
.bar>div:first-child{max-width:1040px;margin:0 auto;display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap}
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
<div class="bar"><div><span class="sub" id="summary"></span><button id="done" type="button">${esc(s.done)}</button></div><div class="err" id="notsaved" role="alert" hidden></div></div>
<script>
const S = ${JSON.stringify(client).replace(/</g, '\\u003c')};
const fmt = (t, v) => t.replace(/\\{(\\w+)\\}/g, (_, k) => v[k] ?? '');
const $$ = (q) => [...document.querySelectorAll(q)];
const ticked = (k) => $$('[data-kind="' + k + '"]').filter((r) => r.querySelector('input[type=checkbox]')?.checked);
const RULES = { tokens: [/^[a-z][a-z0-9-]*$/, S.badToken], components: [/^[A-Z][A-Za-z0-9]*$/, S.badComponent] };
const validate = () => {
  let bad = false;
  for (const [kind, [re, msg]] of Object.entries(RULES)) {
    const rows = $$('[data-kind="' + kind + '"]');
    const counted = (r) => kind === 'tokens' || r.querySelector('input[type=checkbox]')?.checked;
    const names = rows.filter(counted).map((r) => r.querySelector('input[type=text]')?.value ?? r.dataset.id);
    for (const r of rows) {
      const inp = r.querySelector('input[type=text]');
      if (!inp) continue;
      const invalid = (inp.value !== r.dataset.id && !re.test(inp.value)) || (counted(r) && names.filter((n) => n === inp.value).length > 1);
      const m = document.getElementById(inp.getAttribute('aria-describedby'));
      inp.setAttribute('aria-invalid', String(invalid));
      if (m) { m.hidden = !invalid; m.textContent = invalid ? msg : ''; }
      bad = bad || invalid;
    }
  }
  document.getElementById('done').disabled = bad;
};
let order = ${JSON.stringify(picked).replace(/</g, '\\u003c')};
const flowBox = (r) => r.querySelector('input[type=checkbox]');
const renumber = () => $$('[data-kind="flow"]').forEach((r) => { r.querySelector('.order').textContent = flowBox(r).checked ? String(order.indexOf(r.dataset.id) + 1) : ''; });
document.addEventListener('change', (e) => {
  const r = e.target.closest?.('[data-kind="flow"]');
  if (!r) return;
  order = order.filter((id) => id !== r.dataset.id);
  if (e.target.checked) order.push(r.dataset.id);
  renumber();
});
const sync = () => {
  validate();
  $$('.row').forEach((r) => { const c = r.querySelector('input[type=checkbox]'); r.classList.toggle('off', c ? !c.checked : false); });
  document.getElementById('summary').textContent = fmt(S.summary, { f: ticked('flow').length, c: ticked('components').length, t: $$('[data-kind="tokens"]').length });
};
document.addEventListener('change', sync);
document.addEventListener('input', sync);
$$('[data-all]').forEach((b) => b.onclick = () => { $$('[data-kind="components"] input[type=checkbox]').forEach((c) => (c.checked = b.dataset.all === '1')); sync(); });
renumber();
sync();
document.getElementById('done').onclick = async () => {
  const pick = (k) => $$('[data-kind="' + k + '"]').map((r) => ({ id: r.dataset.id, include: r.querySelector('input[type=checkbox]') ? r.querySelector('input[type=checkbox]').checked : undefined, name: r.querySelector('input[type=text]')?.value ?? undefined }));
  const body = {
    flow: { name: document.getElementById('flow-name').value.trim(), screens: order },
    tokens: pick('tokens'), components: pick('components'), excluded: pick('excluded'),
    questions: $$('.q').map((q) => ({ id: q.dataset.id, answer: q.querySelector('input[type=radio]:checked')?.value ?? null })),
    comment: document.getElementById('comment').value,
  };
  const res = await fetch('/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch(() => ({ ok: false }));
  if (!res.ok) { // keep every choice on the page: say so in the bar, let the designer press Done again
    const n = document.getElementById('notsaved');
    n.textContent = S.notSaved + '. ' + S.notSavedSub; n.hidden = false;
    return;
  }
  const main = document.createElement('main');
  const h = document.createElement('h1'); h.textContent = S.saved;
  const p = document.createElement('p'); p.className = 'sub'; p.textContent = S.savedSub;
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
  const html = page(inv, s, lang, [...new Set(prev?.flow?.screens ?? [])].filter((id) => (inv.screens ?? []).some((x) => x.id === id)), prev?.flow?.name || 'main-flow', prev?.comment ?? '');
  const server = http.createServer((req, res) => {
    // a page on another site that points its own name at 127.0.0.1 (DNS rebinding) is not the designer's tab
    if (![`localhost:${port}`, `127.0.0.1:${port}`].includes(req.headers.host ?? '')) return res.writeHead(403).end();
    if (req.method === 'POST' && req.url === '/save') {
      // only the page itself saves: a JSON request from another site needs a CORS preflight this server never grants
      if (!/^application\/json/.test(req.headers['content-type'] ?? '')) return res.writeHead(415).end();
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let d;
        try {
          d = JSON.parse(body);
          for (const k of ['components', 'tokens', 'excluded', 'questions']) if (!Array.isArray(d[k] ?? []) || (d[k] ?? []).some((x) => !x || typeof x !== 'object' || typeof x.id !== 'string')) throw new Error(k);
          if (!Array.isArray(d.flow?.screens ?? [])) throw new Error('flow');
        } catch { return res.writeHead(400).end('bad request'); }
        const finalOf = (k) => (inv[k] ?? []).map((item) => { const x = (d[k] ?? []).find((y) => y.id === item.id) ?? {}; return { item, x, name: x.name ?? item.name, include: x.include ?? item.include }; });
        const bad = (k, re, counted) => {
          const rows = finalOf(k);
          // the pattern binds a name the designer changed; a name the tool itself proposed (lit-leading-37_71, text-13.5px) passes untouched
          if (rows.some((r) => r.x.name !== undefined && (typeof r.x.name !== 'string' || (r.x.name !== r.item.id && !re.test(r.x.name))))) return true;
          const names = rows.filter(counted).map((r) => r.name);
          return new Set(names).size !== names.length;
        };
        if (bad('tokens', /^[a-z][a-z0-9-]*$/, () => true) || bad('components', /^[A-Z][A-Za-z0-9]*$/, (r) => r.include !== false)) return res.writeHead(400).end('bad request');
        const merge = (k) => (inv[k] ?? []).map((item) => { const x = (d[k] ?? []).find((y) => y.id === item.id) ?? {}; return { ...item, ...Object.fromEntries(['include', 'name'].filter((f) => x[f] !== undefined).map((f) => [f, x[f]])) }; });
        const known = new Set((inv.screens ?? []).map((x) => x.id));
        const out = {
          project: inv.project, source: inv.source, savedAt: new Date().toISOString(), lang, comment: String(d.comment ?? ''),
          flow: { name: String(d.flow?.name || 'main-flow'), screens: [...new Set(d.flow?.screens ?? [])].filter((id) => known.has(id)) },
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
      let rel;
      try { rel = decodeURIComponent(req.url.slice('/preview/'.length)); } catch { return res.writeHead(404).end(); }
      const f = path.join(P.spec, rel);
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

if (cmd === 'prepare') prepare(); else serve();
