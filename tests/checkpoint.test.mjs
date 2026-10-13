import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
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

test('a screen is flagged as a sign-in page when ANY of its captures is', async () => {
  const { repo, spec } = makeExtraction(DECLARED);
  try {
    const f = join(spec, 'baseline', 'огляд--1440x900--dark.json');
    const j = JSON.parse(readFileSync(f, 'utf8'));
    j.meta.looksLikeSignIn = true;
    writeFileSync(f, JSON.stringify(j));
    await cp('prepare', repo);
    const c = JSON.parse(readFileSync(join(spec, 'checkpoint.json'), 'utf8'));
    assert.equal(c.screens.find((s) => s.id === 'огляд').looksLikeSignIn, true);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('the screen card follows the flow map: wide light capture, never a surface', async () => {
  const { repo, spec } = makeExtraction(DECLARED);
  try {
    const put = (base, meta, png = true) => {
      writeFileSync(join(spec, 'baseline', `${base}.json`), JSON.stringify({ meta: { tool: 'capture.mjs', colorScheme: 'light', requestedUrl: 'https://app.test/x', ...meta } }));
      if (png) writeFileSync(join(spec, 'baseline', `${base}.png`), PNG);
    };
    put('список--390x844--light', { screen: 'список', viewport: { width: 390, height: 844 }, screenshot: 'список--390x844--light.png' });
    put('список--1440x900--light', { screen: 'список', viewport: { width: 1440, height: 900 }, screenshot: 'список--1440x900--light.png' });
    put('меню--1440x900--light', { screen: 'меню', viewport: { width: 1440, height: 900 }, clicked: [{ selector: 'button' }], screenshot: 'меню--1440x900--light.png' });
    put('вкладка--1440x900--light', { screen: 'вкладка', viewport: { width: 1440, height: 900 }, clicked: [{ selector: 'a' }], screenKind: 'screen', screenshot: 'вкладка--1440x900--light.png' });
    await cp('prepare', repo);
    const c = JSON.parse(readFileSync(join(spec, 'checkpoint.json'), 'utf8'));
    const scr = Object.fromEntries(c.screens.map((s) => [s.id, s]));
    assert.equal(scr['список'].screenshot, 'baseline/список--1440x900--light.png', 'the wide capture is the card');
    assert.equal(scr['меню'], undefined, 'a surface behind a click is not a screen card');
    assert.ok(scr['вкладка'], 'a click-reached capture marked as a screen is a card');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('prepare: a screenshot named by a capture but missing from baseline/ is reported by screen name', async () => {
  const { repo, spec } = makeExtraction(DECLARED);
  try {
    unlinkSync(join(spec, 'baseline', 'огляд--1440x900--light.png'));
    const r = await cp('prepare', repo);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /screenshot not found in extraction\/baseline\/: огляд — re-capture into extraction\/baseline/);
    assert.equal(JSON.parse(readFileSync(join(spec, 'checkpoint.json'), 'utf8')).screens.find((x) => x.id === 'огляд').screenshot, null);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('prepare: a corrupt checkpoint.json stops the run and is not overwritten', async () => {
  const { repo, spec } = makeExtraction(DECLARED);
  try {
    const f = join(spec, 'checkpoint.json');
    writeFileSync(f, '{"excluded": [ {"id": "x"');
    const r = await cp('prepare', repo);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /extraction\/checkpoint\.json is not valid JSON — fix or delete it \(it holds the excluded parts and questions Claude wrote\)/);
    assert.equal(readFileSync(f, 'utf8'), '{"excluded": [ {"id": "x"', 'the file is untouched');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('prepare: a corrupt capture file is skipped with its name, the rest is used', async () => {
  const { repo, spec } = makeExtraction(DECLARED);
  try {
    writeFileSync(join(spec, 'baseline', 'сломаний--1440x900--light.json'), '{"meta": ');
    const r = await cp('prepare', repo);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /сломаний--1440x900--light\.json/);
    const c = JSON.parse(readFileSync(join(spec, 'checkpoint.json'), 'utf8'));
    assert.deepEqual(c.screens.map((x) => x.id).sort(), ['вхід', 'огляд']);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('prepare: a decided token with no authoredName (as a canon-merged one arrives) is "decided"', async () => {
  const { repo, spec } = makeExtraction({ 'spacing-8': { $type: 'dimension', $value: 32, $provenance: { label: 'decided', evidence: 'decided 2026-10-12' }, $extensions: { [EXT]: { role: 'spacing' } } } });
  try {
    await cp('prepare', repo);
    const c = JSON.parse(readFileSync(join(spec, 'checkpoint.json'), 'utf8'));
    assert.equal(c.tokens.find((t) => t.id === 'spacing-8').nameStatus, 'decided');
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('prepare keeps the token ids an excluded part names', async () => {
  const { repo, spec } = makeExtraction(DECLARED);
  try {
    await cp('prepare', repo);
    const f = join(spec, 'checkpoint.json');
    const c = JSON.parse(readFileSync(f, 'utf8'));
    c.excluded = [{ id: 'proto-bar', what: 'Панель прототипу', why: 'лише для показу', tokens: ['proto', 'proto-text'] }];
    writeFileSync(f, JSON.stringify(c));
    await cp('prepare', repo);
    assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')).excluded[0].tokens, ['proto', 'proto-text']);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('prepare keeps the visible texts an excluded part names', async () => {
  const { repo, spec } = makeExtraction(DECLARED);
  try {
    await cp('prepare', repo);
    const f = join(spec, 'checkpoint.json');
    const c = JSON.parse(readFileSync(f, 'utf8'));
    c.excluded = [{ id: 'role-switch', what: 'Перемикач Admin / User', why: 'лише для показу', texts: ['Admin', 'User'] }];
    writeFileSync(f, JSON.stringify(c));
    await cp('prepare', repo);
    assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')).excluded[0].texts, ['Admin', 'User']);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});

test('prepare adds the lit colours only an excluded part paints to its tokens; a colour also painted outside is not added', async () => {
  const lit = (hex) => ({ $type: 'color', $value: hex, $provenance: { label: 'derived', evidence: 'painted on 2 elements' }, $extensions: { [EXT]: { role: 'color', painted: true, roleProvenance: { label: 'derived' } } } });
  const { repo, spec } = makeExtraction({ ...DECLARED, 'lit-ff3300': lit('#FF3300'), 'lit-0033ff': lit('#0033FF'), 'lit-222222': lit('#222222') });
  try {
    const el = (tag, text, path, rect, values = {}) => ({ tag, text, path, rect, values });
    const cap = { meta: { tool: 'capture.mjs', screen: 'огляд', colorScheme: 'light', requestedUrl: 'https://app.test/', finalUrl: 'https://app.test/', screenshot: '/x/огляд--1440x900--light.png', viewport: { width: 1440, height: 900 } }, elements: [
      el('header', '', 'div#root>header', { x: 0, y: 0, w: 1440, h: 52 }, { backgroundColor: 'rgb(255, 51, 0)' }),
      el('button', 'Admin', 'div#root>header>button:nth-of-type(1)', { x: 1200, y: 10, w: 50, h: 30 }, { color: 'rgb(255, 255, 255)', backgroundColor: 'rgb(255, 51, 0)', borderTopColor: 'rgb(0, 51, 255)', borderTopWidth: '0px', borderTopStyle: 'none' }),
      el('button', 'User', 'div#root>header>button:nth-of-type(2)', { x: 1260, y: 10, w: 50, h: 30 }, { color: 'rgb(255, 255, 255)', outlineColor: 'rgb(0, 51, 255)', outlineWidth: '0px' }),
      el('h1', 'Policies', 'div#root>main>h1', { x: 260, y: 80, w: 200, h: 30 }, { color: 'rgb(22, 22, 15)', backgroundColor: 'rgb(255, 255, 255)' }),
      el('a', 'Docs', 'div#root>main>a', { x: 260, y: 200, w: 60, h: 20 }, { color: 'rgb(0, 51, 255)' }),
    ], states: [
      // the cold run's lit-222222: painted only by a bar button's :hover
      { path: 'div#root>header>button:nth-of-type(1)', tag: 'button', byForcedPseudo: { hover: { properties: { backgroundColor: { from: 'rgb(255, 51, 0)', to: 'rgb(34, 34, 34)' } }, changed: 1 } }, byInteraction: {} },
    ] };
    writeFileSync(join(spec, 'baseline', 'огляд--1440x900--light.json'), JSON.stringify(cap));
    await cp('prepare', repo);
    const f = join(spec, 'checkpoint.json');
    const c = JSON.parse(readFileSync(f, 'utf8'));
    c.excluded = [{ id: 'role-switch', what: 'Перемикач Admin / User', why: 'лише для показу', texts: ['Admin', 'User'], tokens: ['proto'] }];
    writeFileSync(f, JSON.stringify(c));
    const r = await cp('prepare', repo);
    assert.equal(r.status, 0, r.stderr);
    const ex = JSON.parse(readFileSync(f, 'utf8')).excluded[0];
    assert.deepEqual(ex.tokens, ['proto', 'lit-ff3300', 'lit-222222'], 'the orange is painted only in the bar, the dark grey only by a bar button\'s hover; the blue is also on the page link');
    assert.deepEqual(ex.tokenNotes, { 'lit-ff3300': 'painted only inside this part', 'lit-222222': 'painted only inside this part' });
    await cp('prepare', repo); // again: nothing doubles
    assert.deepEqual(JSON.parse(readFileSync(f, 'utf8')).excluded[0].tokens, ['proto', 'lit-ff3300', 'lit-222222']);
  } finally { rmSync(repo, { recursive: true, force: true }); }
});
