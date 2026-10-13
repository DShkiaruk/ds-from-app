import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designMd, flowSpecMd, projectMd } from '../scripts/lib/workbench-docs.mjs';
import { bestCaptures } from '../scripts/lib/card-capture.mjs';

const CLOSURE = 'This set is closed: nothing else exists.';
const tokensDoc = {
  $closure: CLOSURE,
  $meta: { product: 'Acme', extractedAt: '2026-10-01', instruments: [{ name: 'tokens', version: '1', hash: 'abcdef1234567890' }], platform: { source: { url: 'https://acme.test/app' } } },
  tokens: {
    'surface-1': { $value: '#F7F7F7', $provenance: { label: 'derived' }, $extensions: { 'co.eleken.ds': { cssVar: '--surface-1', role: 'color' } } },
    'demo-bg': { $value: '#FF00FF', $provenance: { label: 'measured' }, $extensions: { 'co.eleken.ds': { cssVar: '--demo-bg', role: 'color' } } },
    'space-4': { $value: 16, $provenance: { label: 'measured' }, $extensions: { 'co.eleken.ds': { cssVar: '--space-4', role: 'spacing' } } },
  },
};
const decisions = {
  flow: { name: 'Main flow', screens: ['c', 'a'] },
  tokens: [{ id: 'surface-1', name: 'surface-page' }],
  components: [{ id: 'btn', name: 'Button', include: true, instances: 12 }, { id: 'x', name: 'Skipped', include: false }],
  excluded: [{ id: 'proto', what: 'proto role switcher', include: false, tokens: ['demo-bg'] }, { id: 'back', what: 'put back', include: true }],
  questions: [{ id: 'q1', text: 'Dark theme?', answer: 'later' }],
  comment: 'Start with c', screens: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
};

test('projectMd: link, tool, flow order, answers, scope', () => {
  const md = projectMd({ manifest: { product: 'Acme', entryPoint: 'https://acme.test/' }, decisions, tokensDoc, pluginVersion: '0.1.0' });
  assert.match(md, /https:\/\/acme\.test\//);
  assert.match(md, /ds-from-app 0\.1\.0/);
  assert.match(md, /abcdef123456/);
  assert.ok(md.indexOf('1. c') > -1 && md.indexOf('1. c') < md.indexOf('2. a'));
  assert.match(md, /Dark theme\? → later/);
  assert.match(md, /Not in this flow: b\b/);
  assert.match(projectMd({ manifest: {}, decisions, tokensDoc, pluginVersion: '0.1.0' }), /https:\/\/acme\.test\/app/);
});

const rows = [
  { name: 'surface-page', cssVar: '--surface-page', group: 'color', value: '#F7F7F7', dark: '#111111', label: 'derived', renamedFrom: 'surface-1' },
  { name: 'surface-card', cssVar: '--surface-card', group: 'color', value: 'var(--color-surface)', label: 'derived' },
  { name: 'weight-medium', cssVar: '--weight-medium', group: 'type', value: '500', label: 'measured' },
  { name: 'leading-body', cssVar: '--leading-body', group: 'type', value: '1.42857', label: 'measured' },
  { name: 'space-4', cssVar: '--space-4', group: 'space', value: '16px', label: 'measured' },
];
test('designMd: closure first, values straight from the generated rows, prototype-only, components, not covered', () => {
  const md = designMd({ rows, tokensDoc, decisions, closure: 'ignored' });
  assert.ok(md.startsWith('This set is closed'));
  assert.match(md, /\| Token \| Value \| Dark \| How obtained \|/);
  assert.match(md, /\| --surface-page \| #F7F7F7 \| #111111 \| derived \(renamed from surface-1\) \|/);
  assert.match(md, /\| --surface-card \| var\(--color-surface\) \|  \| derived \|/);
  assert.match(md, /\| --weight-medium \| 500 \|/);
  assert.doesNotMatch(md, /500px/);
  assert.match(md, /\| --leading-body \| 1\.42857 \|/);
  assert.match(md, /\| --space-4 \| 16px \|/);
  const left = md.split('## Left out as prototype-only')[1].split('## Components')[0];
  assert.match(left, /proto/);
  assert.match(left, /--demo-bg/);
  assert.doesNotMatch(left, /put back/);
  assert.match(md, /- Button \(12 instances\)/);
  assert.match(designMd({ rows, tokensDoc, decisions: { components: [{ name: 'Tab', include: true, instances: 1 }] } }), /- Tab \(1 instance\)/);
  assert.doesNotMatch(md, /Skipped/);
  assert.match(md, /NEEDS-TOKEN \/ NEEDS-COMPONENT \/ NEEDS-STATE found while building are listed in plan\/progress\.md\./);
});

test('flowSpecMd: interface text deduplicated, td left out, controls rendered', () => {
  const capture = { elements: [{ tag: 'h1', text: 'Policies' }, { tag: 'button', text: 'Add policy' }, { tag: 'td', text: 'Acme' }, { tag: 'td', text: 'Ann', path: 'main > table > tbody > tr > td' }, { tag: 'a', text: 'Globex', path: 'main > table > tbody > tr:nth-child(1) > td:nth-child(1) > a' }, { tag: 'th', text: 'Owner', path: 'main > table > thead > tr > th' }, { tag: 'a', text: '', label: 'Settings' }, { tag: 'button', text: 'Add policy' }, { tag: 'div', role: 'tab', text: 'Active' }] };
  const flows = { screens: [{ name: 'c', pattern: '/c' }, { name: 'other', pattern: '/other/:id' }, { name: 'a', transitions: [
    { control: { role: 'button', name: 'Filters' }, effect: { kind: 'open', surface: 'dialog' } },
    { control: { role: 'link', name: 'Home' }, effect: { kind: 'navigate', toScreen: 'c' } },
    { control: { role: 'link', name: 'Other' }, effect: { kind: 'navigate', pattern: '/other/:id' } },
    { control: { role: 'link', name: 'Gone' }, effect: { kind: 'navigate', to: '/gone', pattern: '/gone' } },
    { control: { role: 'button', name: 'Sort' }, effect: { kind: 'change' } },
    { control: { role: 'button', name: 'Noop' }, effect: { kind: 'none' } }] }] };
  const md = flowSpecMd({ flowName: 'main-flow', screens: [{ id: 'a', url: 'https://acme.test/a', screenshot: 'extraction/baseline/a.png', capture }, { id: 'c', capture: {} }], flows });
  const text = md.split('Sample data')[0];
  assert.match(text, /- Policies\n/);
  assert.match(text, /- Settings\n/);
  assert.match(text, /- Active\n/);
  assert.equal(text.split('- Add policy\n').length - 1, 1);
  assert.doesNotMatch(text, /Acme\n/);
  assert.doesNotMatch(text, /Globex/);
  assert.doesNotMatch(text, /Ann/);
  assert.match(md.split('Sample data')[1], /- Ann\n/);
  assert.match(text, /- Owner\n/);
  assert.match(md.split('Sample data')[1].split('Controls and what')[0], /- Globex\n/);
  assert.match(md, /"Filters" \(button\) → opens dialog/);
  assert.match(md, /"Home" \(link\) → navigates to c \(#\/c\)\n/);
  assert.match(md, /"Other" \(link\) → navigates to other \(#\/other, not in this flow — link to the route; the screen need not exist yet\)/);
  assert.match(md, /"Gone" \(link\) → navigates to \/gone \(not captured\)/);
  assert.match(md, /"Gone" \(link\)[^\n]*— parity expects the route #\/gone\n/, 'R24: the route parity expects for an uncaptured page');
  assert.match(md, /"Sort" \(button\) → changes the page/);
  assert.match(md, /"Noop" \(button\) → does nothing/);
  assert.match(md, /Route: #\/a/);
  assert.match(md, /npm run parity` passes for these screens/);
});

test('flowSpecMd: prototype-only texts and controls stay out of the spec and are listed as left out', () => {
  const capture = { elements: [{ tag: 'h1', text: 'Policies' }, { tag: 'button', text: 'Admin' }] };
  const flows = { screens: [{ name: 'a', transitions: [{ control: { role: 'button', name: 'Admin' }, effect: { kind: 'change' } }, { control: { role: 'button', name: 'Sort' }, effect: { kind: 'change' } }] }] };
  const item = { id: 'role', what: 'Admin/User switch', include: false, texts: ['admin'] }; // lower case on purpose
  const md = flowSpecMd({ flowName: 'f', screens: [{ id: 'a', capture }], flows, excluded: [item] });
  const [required, afterControls] = md.split('Controls and what they do:');
  const rest = afterControls.split('Left out as prototype-only')[0];
  assert.doesNotMatch(required, /- Admin\n/, 'not under must appear exactly');
  assert.doesNotMatch(rest, /"Admin"/, 'not under Controls');
  assert.match(md, /Left out as prototype-only \(do not build\):\n\n- Admin\/User switch: "Admin"\n/);
  assert.match(md, /- Policies\n/);
  assert.match(md, /"Sort" \(button\)/);
  const back = flowSpecMd({ flowName: 'f', screens: [{ id: 'a', capture }], flows, excluded: [{ ...item, include: true }] });
  assert.match(back, /- Admin\n/);
  assert.match(back, /"Admin" \(button\)/);
  assert.doesNotMatch(back, /Left out as prototype-only/);
  const none = flowSpecMd({ flowName: 'f', screens: [{ id: 'a', capture: { elements: [{ tag: 'h1', text: 'Policies' }] } }], flows: { screens: [] }, excluded: [item] });
  assert.doesNotMatch(none, /Left out as prototype-only/, 'a screen without those texts has no such section');
});

test('flowSpecMd (R28.1): a prototype-only bar at the top says how tall it is and that parity accounts for it', () => {
  const capture = { meta: { viewport: { width: 1440, height: 900 } }, elements: [
    { tag: 'header', text: '', path: 'div#root>header', rect: { x: 0, y: 0, w: 1440, h: 52 } },
    { tag: 'button', text: 'Option 1', path: 'div#root>header>nav>button:nth-of-type(1)', rect: { x: 151, y: 12, w: 74, h: 28 } },
    { tag: 'button', text: 'Admin', path: 'div#root>header>div>button', rect: { x: 1210, y: 12, w: 40, h: 28 } },
    { tag: 'h1', text: 'Policies', path: 'div#root>div>main>h1', rect: { x: 280, y: 76, w: 300, h: 32 } }] };
  const item = { id: 'bar', what: 'prototype bar', include: false, texts: ['Option 1', 'Admin'] };
  const md = flowSpecMd({ flowName: 'f', screens: [{ id: 'a', capture }], flows: { screens: [] }, excluded: [item] });
  assert.match(md, /Left out as prototype-only \(do not build\):\n\n- prototype bar: "Option 1", "Admin"\n\nThe prototype-only bar at the top is 52 px tall: build the screen without it — it starts at the top of the page \(parity accounts for the difference\)\.\n/);
  const flat = flowSpecMd({ flowName: 'f', screens: [{ id: 'a', capture: { elements: capture.elements.map((e) => ({ ...e, rect: undefined })) } }], flows: { screens: [] }, excluded: [item] });
  assert.doesNotMatch(flat, /bar at the top/, 'no band found: no line');
});

test('card capture: light and wide beats dark; a click-reached surface never counts', () => {
  const m = (o) => ({ meta: { screen: 'a', colorScheme: 'light', viewport: { width: 1280 }, ...o } });
  const dark = m({ colorScheme: 'dark' }), narrow = m({ viewport: { width: 400 } }), good = m({}), surface = m({ clicked: ['x'] });
  assert.equal(bestCaptures([dark, narrow, surface, good]).get('a'), good);
  assert.equal(bestCaptures([surface]).size, 0);
});

test('minors: flow name and file path both shown; unanswered questions listed', () => {
  const d = { ...decisions, flow: { name: 'Основний потік', screens: ['a'] }, questions: [{ id: 'q1', text: 'Dark theme?', answer: 'later' }, { id: 'q2', text: 'Mobile?', answer: '' }] };
  const md = projectMd({ manifest: {}, decisions: d, tokensDoc, pluginVersion: '0.1.0', specPath: 'specs/pages/main-flow.md' });
  assert.match(md, /Основний потік/);
  assert.match(md, /specs\/pages\/main-flow\.md/);
  assert.match(md, /Mobile\? — \(not answered\)/);
  const spec = flowSpecMd({ flowName: 'Основний потік', specPath: 'specs/pages/main-flow.md', screens: [], flows: {} });
  assert.match(spec, /Основний потік/);
  assert.match(spec, /specs\/pages\/main-flow\.md/);
});

test('flowSpecMd (R22): the spec lists what parity requires — a span inside a button is interface, an li item is data', () => {
  const capture = { elements: [{ tag: 'span', text: 'Save', path: 'body>main>button>span' }, { tag: 'li', text: 'Profile', path: 'body>ul>li', role: null }, { tag: 'span', text: 'Menu item', path: 'body>ul>li#m1>span' }] };
  const md = flowSpecMd({ flowName: 'f', screens: [{ id: 'a', capture }], flows: { screens: [{ name: 'a', pattern: '/a', transitions: [] }] } });
  const required = md.split('Interface text (must appear exactly):')[1].split('Controls and what they do:')[0];
  assert.match(required.split('Sample data')[0], /- Save\n/);
  assert.doesNotMatch(required.split('Sample data')[0], /Profile|Menu item/);
  assert.match(required.split('Sample data')[1] ?? '', /- Profile\n/);
});

test('flowSpecMd (R22): two screens on one pattern — a link resolves by the exact URL, as parity does', () => {
  const flows = { screens: [
    { name: 'first', pattern: '/a/:id', url: 'https://p.test/a/1#one', transitions: [] },
    { name: 'second', pattern: '/a/:id', url: 'https://p.test/a/1#two', transitions: [] },
    { name: 'home', pattern: '/', url: 'https://p.test/', transitions: [{ control: { role: 'link', name: 'Two' }, effect: { kind: 'navigate', to: 'https://p.test/a/1#two', pattern: '/a/:id' } }, { control: { role: 'link', name: 'One' }, effect: { kind: 'navigate', to: 'https://p.test/a/1#one', pattern: '/a/:id' } }] }] };
  const md = flowSpecMd({ flowName: 'f', screens: [{ id: 'home', capture: {} }], flows });
  assert.match(md, /"Two" \(link\) → navigates to second \(#\/second/);
  assert.match(md, /"One" \(link\) → navigates to first \(#\/first/);
});

test('flowSpecMd (R23): an icon-only control says how to make it findable', () => {
  const flows = { screens: [{ name: 'a', pattern: '/a', transitions: [{ control: { role: 'button', name: '', icon: 'bell' }, effect: { kind: 'open', surface: 'dialog' } }] }] };
  const md = flowSpecMd({ flowName: 'f', screens: [{ id: 'a', capture: {} }], flows });
  assert.match(md, /^- \(button, icon "bell"\) → opens dialog — put data-icon="bell" on the icon inside the control$/m);
});

test('flowSpecMd: a navigation label inside nav > ul > li > a is listed under "must appear exactly"', () => {
  const capture = { elements: [
    { tag: 'a', text: 'Overview', path: 'body>aside>nav>ul>li>a' },
    { tag: 'h1', text: 'Dashboard', path: 'body>main>h1' },
    { tag: 'span', text: 'Acme Corp', path: 'body>main>ul>li>span' },
  ] };
  const md = flowSpecMd({ flowName: 'f', screens: [{ id: 'home', capture }], flows: { screens: [{ name: 'home', pattern: '/', url: 'https://p.test/', transitions: [] }] } });
  const must = md.slice(md.indexOf('Interface text (must appear exactly):'), md.indexOf('Sample data'));
  assert.ok(must.includes('- Overview'), must);
  assert.ok(!must.includes('Acme Corp') && md.includes('Sample data') && md.includes('- Acme Corp'), md);
});

test('flowSpecMd (R27.7.4): a capped interface-text list ends with how many more parity checks', () => {
  const elements = Array.from({ length: 65 }, (_, i) => ({ tag: 'h2', text: `Heading ${i}`, path: 'body>main>h2' }));
  const flows = { screens: [{ name: 'home', pattern: '/', url: 'https://p.test/', transitions: [] }] };
  const md = flowSpecMd({ flowName: 'f', screens: [{ id: 'home', capture: { elements } }], flows });
  assert.ok(md.includes('- Heading 59\n- … and 5 more (parity checks all of them)\n'), md.slice(0, 2500));
  const few = flowSpecMd({ flowName: 'f', screens: [{ id: 'home', capture: { elements: elements.slice(0, 3) } }], flows });
  assert.ok(!few.includes('more (parity'), 'an uncapped list has no such line');
});

test('flowSpecMd (M7): the "… and N more" count leaves out the excluded texts', () => {
  const elements = [...Array.from({ length: 62 }, (_, i) => ({ tag: 'h2', text: `Heading ${i}`, path: 'body>main>h2' })),
    ...Array.from({ length: 3 }, (_, i) => ({ tag: 'button', text: `Demo ${i}`, path: 'body>header>button' }))];
  const flows = { screens: [{ name: 'home', pattern: '/', url: 'https://p.test/', transitions: [] }] };
  const excluded = [{ id: 'demo', what: 'demo bar', include: false, texts: ['Demo 0', 'Demo 1', 'Demo 2'] }];
  const md = flowSpecMd({ flowName: 'f', screens: [{ id: 'home', capture: { elements } }], flows, excluded });
  assert.ok(md.includes('- Heading 59\n- … and 2 more (parity checks all of them)\n'), md.slice(0, 2500));
  assert.ok(md.includes('- demo bar: "Demo 0", "Demo 1", "Demo 2"'), 'the left-out part still lists what the screen showed');
});
