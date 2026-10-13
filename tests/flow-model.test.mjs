import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { interfaceElements, layoutElements, targetScreen } from '../templates/workbench/tools/lib/flow-model.mjs';

test('interfaceElements: a span inside a button is interface; li items are data; the detail h1 is left out', () => {
  const els = [
    { tag: 'span', text: 'Save', path: 'body>main>button>span' },
    { tag: 'span', text: 'Menu item', path: 'body>ul>li>span', role: null },
    { tag: 'li', text: 'Listed', path: 'body>ul>li' },
    { tag: 'h1', text: 'Title', path: 'body>main>h1' },
    { tag: 'p', text: 'x'.repeat(81), path: 'body>main>button>p' },
  ];
  assert.deepEqual(interfaceElements(els).map((e) => e.text), ['Save', 'Title']);
  assert.deepEqual(interfaceElements(els, { isDetail: true }).map((e) => e.text), ['Save']);
  assert.deepEqual(interfaceElements([{ tag: 'a', text: 'G', path: 'main > table > tbody > tr > td > a' }]), []);
});

test('targetScreen: exact URL first, then a pattern held by exactly one named screen', () => {
  const screens = [
    { name: 'first', pattern: '/a/:id', url: 'https://p.test/a/1#one' },
    { name: 'second', pattern: '/a/:id', url: 'https://p.test/a/1#two' },
    { name: 'solo', pattern: '/solo', url: 'https://p.test/solo' },
    { pattern: '/anon', url: 'https://p.test/anon' },
  ];
  assert.equal(targetScreen({ kind: 'navigate', to: 'https://p.test/a/1#two', pattern: '/a/:id' }, screens).name, 'second');
  assert.equal(targetScreen({ kind: 'navigate', to: 'https://p.test/a/1#one', pattern: '/a/:id' }, screens).name, 'first');
  assert.equal(targetScreen({ kind: 'navigate', to: 'https://p.test/a/9', pattern: '/a/:id' }, screens), null, 'two screens share the pattern: no guess');
  assert.equal(targetScreen({ kind: 'navigate', to: 'https://p.test/solo?x=1', pattern: '/solo' }, screens).name, 'solo');
  assert.equal(targetScreen({ kind: 'navigate', pattern: '/anon' }, screens), null, 'an unnamed screen is not a target');
  assert.equal(targetScreen({ kind: 'navigate', toScreen: 'first' }, screens).name, 'first');
});

test('missingControlText: an icon-only control says to put data-icon on the icon', async () => {
  const { missingControlText } = await import('../templates/workbench/tools/lib/flow-model.mjs');
  assert.equal(missingControlText({ role: 'button', name: '', icon: 'bell' }), 'button, icon "bell" — put data-icon="bell" on the icon inside the control');
  assert.equal(missingControlText({ role: 'link', name: 'Home' }), 'link "Home"');
});

test('shotFileName: Cyrillic screens each get their own file, ASCII names keep the old form', async () => {
  const { shotFileName } = await import('../templates/workbench/tools/lib/flow-model.mjs');
  assert.equal(shotFileName({ name: 'рахунки' }), 'рахунки.png');
  assert.equal(shotFileName({ name: 'налаштування' }), 'налаштування.png');
  assert.notEqual(shotFileName({ name: 'рахунки' }), shotFileName({ name: 'налаштування' }));
  assert.equal(shotFileName({ name: 'Order list' }), 'Order-list.png');
  assert.equal(shotFileName({ pattern: '/accounts/:id' }), 'accounts-id.png');
  assert.equal(shotFileName({ pattern: '/' }), 'root.png');
});

test('parity messages: missing text says where data goes, a control with no name and no icon says where to name it', async () => {
  const { missingControlText, missingTextLine } = await import('../templates/workbench/tools/lib/flow-model.mjs');
  assert.ok(missingTextLine(['Owner', 'Status']).endsWith(`"Owner", "Status" (a record's name or other data? list it in extraction/flows/data-text.json with why)`));
  assert.equal(missingTextLine(Array.from({ length: 12 }, (_, i) => `t${i}`)).split('", "').length, 10);
  assert.equal(missingControlText({ role: 'combobox', name: '' }), 'combobox "" (name it in extraction/flows/names.json — see the build-page skill)');
});

test('interfaceElements: navigation, tab and menu labels in lists are interface; records in lists stay data', () => {
  const texts = (els, o) => interfaceElements(els, o).map((e) => e.text);
  // the capture shapes (walker path, tags only), as in the re-review probe
  assert.deepEqual(texts([
    { tag: 'a', text: 'Overview', path: 'body>aside>nav>ul>li>a' },
    { tag: 'span', text: 'Billing', path: 'body>aside>nav>ul>li>a>span' },
    { tag: 'a', text: 'Reports', path: 'body > aside > nav > ul > li:nth-of-type(3) > a' },
  ]), ['Overview', 'Billing', 'Reports']);
  // an li with a menu item (or a tab) in it is interface; so is a link under a menu / tablist segment
  assert.deepEqual(texts([
    { tag: 'div', role: 'menuitem', text: 'Rename', path: 'body>div>ul>li>div' },
    { tag: 'span', role: 'tab', text: 'Members', path: 'body>div>ul>li>span' },
    { tag: 'a', text: 'Docs', path: 'body>div>menu>li>a' },
    { tag: 'a', text: 'Plans', path: 'body>div[role=tablist]>ul>li>a' },
    { tag: 'button', text: 'Mine', path: 'body>div>ul>li>button', ancestorRoles: ['menubar'] },
  ]), ['Rename', 'Members', 'Docs', 'Plans', 'Mine']);
  // records and row actions stay data
  assert.deepEqual(texts([
    { tag: 'span', text: 'Acme Corp', path: 'body>main>ul>li>span' },
    { tag: 'button', text: 'Delete Acme', path: 'body>main>ul>li>div>button' },
    { tag: 'a', text: 'Acme Corp', path: 'body>main>ul>li>a', role: 'link' },
    { tag: 'td', text: 'Acme', path: 'body>main>table>tbody>tr>td' },
    { tag: 'a', text: 'Open', path: 'body>nav>table>tbody>tr>td>a' },
  ]), []);
});

test('R27.7.2: messages that ask for a plugin step end with the ask-the-designer line', async () => {
  const m = await import('../templates/workbench/tools/lib/flow-model.mjs');
  const tail = "— ask the designer to run /ds-from-app again (capturing is the plugin's job)";
  for (const x of [m.NO_BASELINE, m.UNREACHABLE, m.notInFlows('ghost')]) assert.ok(x.endsWith(tail), x);
  assert.match(m.UNREACHABLE, /^unreachable in the app — recapture/);
  assert.doesNotMatch(m.notInFlows('ghost'), /run flows\.mjs/);
});

// R28.1: the prototype-only bar at the top of the page
const bandCapture = (extra = []) => ({
  meta: { viewport: { width: 1440, height: 900 } },
  elements: [
    { tag: 'header', text: '', path: 'div#root>header', rect: { x: 0, y: 0, w: 1440, h: 52 } },
    { tag: 'button', text: 'Option 1', path: 'div#root>header>nav>button:nth-of-type(1)', rect: { x: 151, y: 12, w: 74, h: 28 } },
    { tag: 'span', text: 'Admin', path: 'div#root>header>div:nth-of-type(2)>div>button:nth-of-type(1)>span', rect: { x: 1210, y: 18, w: 40, h: 16 } },
    { tag: 'h1', text: 'Policies', path: 'div#root>div>main>h1', rect: { x: 280, y: 76, w: 300, h: 32 } },
    ...extra,
  ],
});

test('excludedBand (R28.1): the excluded texts sit in a full-width band at the top → its height', async () => {
  const { excludedBand } = await import('../templates/workbench/tools/lib/flow-model.mjs');
  assert.deepEqual(excludedBand(bandCapture(), ['option 1', ' Admin ']), { top: 52 });
});

test('excludedBand (R28.1): no band when an excluded element is mid-page, when interface of the app sits in the band, or nothing is excluded', async () => {
  const { excludedBand } = await import('../templates/workbench/tools/lib/flow-model.mjs');
  const mid = bandCapture([{ tag: 'button', text: 'Demo', path: 'div#root>div>main>button', rect: { x: 300, y: 400, w: 60, h: 28 } }]);
  assert.equal(excludedBand(mid, ['Option 1', 'Admin', 'Demo']), null, 'the common prefix is the page, not a band');
  const withApp = bandCapture([{ tag: 'a', text: 'Help', path: 'div#root>header>a', rect: { x: 1300, y: 14, w: 40, h: 24 } }]);
  assert.equal(excludedBand(withApp, ['Option 1', 'Admin']), null, 'the app\'s own link inside the band');
  assert.equal(excludedBand(bandCapture(), []), null);
  assert.equal(excludedBand(bandCapture(), ['No such text']), null);
  const narrow = bandCapture(); narrow.elements[0].rect = { x: 0, y: 0, w: 900, h: 52 };
  assert.equal(excludedBand(narrow, ['Option 1', 'Admin']), null, 'not full width');
  const low = bandCapture(); low.elements[0].rect = { x: 0, y: 40, w: 1440, h: 52 };
  assert.equal(excludedBand(low, ['Option 1', 'Admin']), null, 'not at the very top');
});

// M2 + M3: a band per excluded part, never the app's own header
const PILOT_EXCLUDED = [
  ['Policy models', 'Option 1', 'Option 2', 'Option 3', 'Reset'],
  ['Admin', 'User'],
];
test('excludedBand (M2): the pilot\'s two real captures, with the two excluded parts of its decisions.json, still give { top: 52 }', async () => {
  const { excludedBand } = await import('../templates/workbench/tools/lib/flow-model.mjs');
  const caps = JSON.parse(readFileSync(new URL('./fixtures/pilot-band-captures.json', import.meta.url), 'utf8'));
  for (const [name, cap] of Object.entries(caps)) assert.deepEqual(excludedBand(cap, PILOT_EXCLUDED), { top: 52 }, name);
});

test('excludedBand (M2): a second excluded part elsewhere (a floating Feedback button) does not hide the band; the band is the largest, never a sum', async () => {
  const { excludedBand } = await import('../templates/workbench/tools/lib/flow-model.mjs');
  const cap = bandCapture([{ tag: 'button', text: 'Feedback', path: 'div#root>div>main>button', rect: { x: 1300, y: 800, w: 100, h: 36 } }]);
  assert.deepEqual(excludedBand(cap, [['Option 1', 'Admin'], ['Feedback']]), { top: 52 });
  assert.equal(excludedBand(cap, [['Option 1', 'Admin', 'Feedback']]), null, 'pooled (one part), the old behaviour: no band');
});

test('excludedBand (M3): data is not a hit (a members table cell "Admin"), and the app\'s own header with a brand text is never a band', async () => {
  const { excludedBand } = await import('../templates/workbench/tools/lib/flow-model.mjs');
  const cell = bandCapture([{ tag: 'td', text: 'Admin', path: 'div#root>div>main>table>tbody>tr>td', rect: { x: 300, y: 300, w: 80, h: 30 } }]);
  assert.deepEqual(excludedBand(cell, [['Option 1', 'Admin']]), { top: 52 });
  const brand = bandCapture([{ tag: 'span', text: 'Acme', path: 'div#root>header>span', rect: { x: 16, y: 17, w: 60, h: 19 } }]);
  assert.equal(excludedBand(brand, [['Option 1', 'Admin']]), null, 'an element in the band with its own text that is not excluded');
  const labelled = bandCapture([{ tag: 'button', text: '', label: 'Account', interactive: true, path: 'div#root>header>button', rect: { x: 1380, y: 12, w: 40, h: 28 } }]);
  assert.equal(excludedBand(labelled, [['Option 1', 'Admin']]), null, 'a control in the band with its own label that is not excluded');
});

// M4: a navigation list built without <nav> in the prototype
test('findInPrototype (M4): an app interface text missing among the prototype\'s interface elements is matched against any visible element with that text', async () => {
  const { findInPrototype, interfaceElements } = await import('../templates/workbench/tools/lib/flow-model.mjs');
  const app = { tag: 'a', text: 'Overview', path: 'nav>ul>li>a', rect: { x: 16, y: 100, w: 80, h: 24 } };
  // the prototype drew the list as div>ul>li>span with no <nav>: an li without a navigation context is data to interfaceElements
  const mine = [{ tag: 'span', text: 'Overview', path: 'div>ul>li>span', rect: { x: 16, y: 101, w: 80, h: 24 } }, { tag: 'span', text: 'Overview', path: 'div>footer>span', rect: { x: 600, y: 800, w: 80, h: 24 } }];
  const chrome = interfaceElements(mine);
  assert.equal(chrome.length, 0, 'precondition: not interface by path');
  assert.deepEqual(findInPrototype(app, chrome, mine, 0).rect, { x: 16, y: 101, w: 80, h: 24 }, 'the nearest one');
  assert.equal(findInPrototype({ ...app, text: 'Nowhere' }, chrome, mine, 0), undefined);
  const real = [{ tag: 'a', text: 'Overview', path: 'nav>a', rect: { x: 16, y: 100, w: 80, h: 24 } }];
  assert.equal(findInPrototype(app, real, [...real, ...mine], 0), real[0], 'an interface element wins');
});

test('layoutElements (R31): a plain text div is in; data, excluded-by-path data and long or empty text are out; interface elements stay in', () => {
  const els = [
    { tag: 'div', text: 'Search', path: 'body>main>div' },
    { tag: 'button', text: 'Save', path: 'body>main>button' },
    { tag: 'td', text: 'Acme', path: 'body>main>table>tbody>tr>td' },
    { tag: 'div', text: 'Cell', path: 'body>main>table>tbody>tr>td>div' },
    { tag: 'span', text: 'Row', path: 'body>ul>li>span' },
    { tag: 'div', text: '', path: 'body>main>div' },
    { tag: 'p', text: 'x'.repeat(81), path: 'body>main>p' },
    { tag: 'h1', text: 'Title', path: 'body>main>h1' },
  ];
  assert.deepEqual(layoutElements(els).map((e) => e.text), ['Search', 'Save', 'Title']);
  assert.deepEqual(layoutElements(els, { isDetail: true }).map((e) => e.text), ['Search', 'Save'], 'the detail h1 is left out as for interface elements');
});
