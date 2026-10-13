import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = { renders: true, errors: [], missingCopy: [], transitions: { ok: 1, missing: [], dead: [], wrong: [] }, layout: [], density: null };

test('compare.html says "differs" exactly when parity fails, and explains every kind', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dsfa-compare-'));
  try {
    mkdirSync(join(repo, 'extraction', 'flows'), { recursive: true });
    writeFileSync(join(repo, 'extraction', 'decisions.json'), JSON.stringify({ lang: 'en' }));
    const screens = [
      { ...base, name: 'dense', density: { product: 5, prototype: 2, ok: false } },
      { ...base, name: 'wrongone', transitions: { ok: 0, missing: [], dead: [], wrong: ['button "Go": the product\'s navigates, the prototype\'s opens'] } },
      { ...base, name: 'gone', renders: false },
      { ...base, name: 'nobase', noBaseline: true },
      { ...base, name: '<script>alert(1)</script>', missingCopy: ['Owner'], productScreenshot: '/Users/someone/app-repo/extraction/baseline/x--1440x900--light.png' },
    ];
    writeFileSync(join(repo, 'extraction', 'flows', 'parity.json'), JSON.stringify({ screens }));
    execFileSync('node', [join(ROOT, 'templates', 'workbench', 'tools', 'compare.mjs')], { cwd: repo });
    const html = readFileSync(join(repo, 'extraction', 'compare.html'), 'utf8');
    const heads = html.match(/<h2>.*?<\/h2>/g);
    assert.equal(heads.length, 5);
    assert.match(heads[3], /nobase — differs/);
    assert.match(heads[0], /dense — differs/);
    assert.match(heads[1], /wrongone — differs/);
    assert.match(heads[2], /gone — differs/);
    assert.ok(!/matches/.test(html), 'no failing screen says matches');
    assert.match(html, /density: 5 rows in the app, 2 in the prototype/);
    assert.match(html, /wrong: button &quot;Go&quot;/);
    assert.match(html, /no such screen \(the route renders nothing\)/);
    assert.ok(!/<script>/.test(html) && /&lt;script&gt;/.test(html), 'a screen name is escaped');
    assert.match(html, /<img src="baseline\/x--1440x900--light.png"/, 'the recorded product screenshot is used');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('compare.html encodes a recorded product screenshot path per segment and notes truncated off-layout items', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dsfa-compare-'));
  try {
    mkdirSync(join(repo, 'extraction', 'flows'), { recursive: true });
    const layout = Array.from({ length: 13 }, (_, i) => ({ tag: 'div', text: `t${i}`, off: ['x'] }));
    const screens = [{ ...base, name: 'a b', layout, productScreenshot: '/Users/someone/app-repo/extraction/baseline/a b#1--1440x900--light.png' }];
    writeFileSync(join(repo, 'extraction', 'flows', 'parity.json'), JSON.stringify({ screens }));
    execFileSync('node', [join(ROOT, 'templates', 'workbench', 'tools', 'compare.mjs')], { cwd: repo });
    const html = readFileSync(join(repo, 'extraction', 'compare.html'), 'utf8');
    assert.match(html, /<img src="baseline\/a%20b%231--1440x900--light\.png"/, 'segments encoded, slash kept');
    assert.equal((html.match(/<li>off:/g) ?? []).length, 10);
    assert.match(html, /<li>\+3 more \(extraction\/flows\/parity\.json\)<\/li>/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('compare.html links each Cyrillic screen to its own prototype picture, encoded per segment', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dsfa-compare-'));
  try {
    mkdirSync(join(repo, 'extraction', 'flows'), { recursive: true });
    const screens = [{ ...base, name: 'рахунки', screenshot: 'flows/parity/рахунки.png' }, { ...base, name: 'налаштування', screenshot: 'flows/parity/налаштування.png' }];
    writeFileSync(join(repo, 'extraction', 'flows', 'parity.json'), JSON.stringify({ screens }));
    execFileSync('node', [join(ROOT, 'templates', 'workbench', 'tools', 'compare.mjs')], { cwd: repo });
    const html = readFileSync(join(repo, 'extraction', 'compare.html'), 'utf8');
    assert.ok(html.includes(`<img src="flows/parity/${encodeURIComponent('рахунки')}.png"`));
    assert.ok(html.includes(`<img src="flows/parity/${encodeURIComponent('налаштування')}.png"`));
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('compare.html shows only the screens of the current flow (decisions.json flow.screens); older entries are ignored', () => {
  const repo = mkdtempSync(join(tmpdir(), 'dsfa-compare-'));
  try {
    mkdirSync(join(repo, 'extraction', 'flows'), { recursive: true });
    writeFileSync(join(repo, 'extraction', 'decisions.json'), JSON.stringify({ lang: 'en', flow: { name: 'main', screens: ['home', 'orders'] } }));
    writeFileSync(join(repo, 'extraction', 'flows', 'parity.json'), JSON.stringify({ screens: [{ ...base, name: 'home' }, { ...base, name: 'old-screen' }, { ...base, name: 'orders' }] }));
    const out = execFileSync('node', [join(ROOT, 'templates', 'workbench', 'tools', 'compare.mjs')], { cwd: repo, encoding: 'utf8' });
    const html = readFileSync(join(repo, 'extraction', 'compare.html'), 'utf8');
    assert.deepEqual(html.match(/<h2>.*?<\/h2>/g).map((h) => h.replace(/<\/?h2>| — .*/g, '')), ['home', 'orders']);
    assert.match(out, /\(2 screen\(s\)\)/);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('compare.html (I1): a skipped screen gets its own heading, never "matches" (uk and en)', () => {
  for (const [lang, want] of [['uk', 'ще не збудовано'], ['en', 'not built yet']]) {
    const repo = mkdtempSync(join(tmpdir(), 'dsfa-compare-'));
    try {
      mkdirSync(join(repo, 'extraction', 'flows'), { recursive: true });
      writeFileSync(join(repo, 'extraction', 'decisions.json'), JSON.stringify({ lang }));
      writeFileSync(join(repo, 'extraction', 'flows', 'parity.json'), JSON.stringify({ screens: [{ ...base, name: 'later', skipped: true }, { ...base, name: 'done' }] }));
      execFileSync('node', [join(ROOT, 'templates', 'workbench', 'tools', 'compare.mjs')], { cwd: repo });
      const heads = readFileSync(join(repo, 'extraction', 'compare.html'), 'utf8').match(/<h2>.*?<\/h2>/g);
      assert.equal(heads[0], `<h2>later — ${want}</h2>`);
      assert.match(heads[1], /done — (matches|збігається)/);
    } finally { rmSync(repo, { recursive: true, force: true }); }
  }
});

test('compare.html (G3): a screen with a prototype-only top band says so under the app\'s picture, in uk and en; others do not', () => {
  for (const [lang, want] of [['uk', 'Смуга прототипу вгорі (52 px) лишилась на знімку застосунку; у прототипі її немає — так і має бути.'], ['en', "The prototype bar at the top (52 px) is in the app's picture; the prototype leaves it out on purpose."]]) {
    const repo = mkdtempSync(join(tmpdir(), 'dsfa-compare-'));
    try {
      mkdirSync(join(repo, 'extraction', 'flows'), { recursive: true });
      writeFileSync(join(repo, 'extraction', 'decisions.json'), JSON.stringify({ lang }));
      writeFileSync(join(repo, 'extraction', 'flows', 'parity.json'), JSON.stringify({ screens: [{ ...base, name: 'banded', leftOut: { elements: 2, controls: 0, band: 52 }, productScreenshot: '/x/baseline/b--1440x900--light.png' }, { ...base, name: 'plain', leftOut: { elements: 0, controls: 0 } }] }));
      execFileSync('node', [join(ROOT, 'templates', 'workbench', 'tools', 'compare.mjs')], { cwd: repo });
      const html = readFileSync(join(repo, 'extraction', 'compare.html'), 'utf8');
      const [banded, plain] = html.split('<section>').slice(1);
      assert.ok(banded.includes(`<img src="baseline/b--1440x900--light.png" alt=""><p class="band">${want.replace("'", '&#39;')}</p>`) || banded.includes(`<p class="band">${want}</p>`), banded);
      assert.ok(banded.indexOf('class="band"') < banded.indexOf('<figcaption>Prototype') || banded.indexOf('class="band"') < banded.indexOf('<figcaption>Прототип'), 'under the app picture, before the prototype figure');
      assert.ok(!plain.includes('class="band"'));
    } finally { rmSync(repo, { recursive: true, force: true }); }
  }
});
