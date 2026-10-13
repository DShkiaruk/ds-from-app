// A first draft of the component inventory, from the captures. (Moved from ds-extract-method scripts/inventory_seed.mjs @ebaa66f.)
//
// A component library names its own parts in the page, and that name is the measurement: shadcn / Base UI write
// data-slot="button", MUI a class MuiButton-root, Chakra chakra-button, Ant Design ant-btn. Where no library names
// an element, its role does (a <button>, a table, a dialog, a tab list) — labelled derived. For each component:
// how many instances on how many screens (the population it was counted in, and what was left out), the selectors
// that recognise it, and the states the walker measured on it (forced :hover / :focus-visible / :active that changed
// something; data-state values; disabled).
//
// It writes a DRAFT — extraction/components.draft.json — and never touches components.json. The draft is what the
// checkpoint page shows: the designer ticks what goes in, and nothing is copied into a components.json by hand. What a
// component is for, how it splits into variants and which page it belongs on come after the designer's ticks.
//
// Usage: node scripts/inventory.mjs <product-repo>

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { product } from './lib/product.mjs';

const P = product(process.argv[2], 'usage: node scripts/inventory.mjs <product-repo>');
const dir = join(P.spec, 'baseline');
const caps = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8'))).filter((c) => c.meta?.tool === 'capture.mjs' && (c.meta.colorScheme || 'light') === 'light') : [];
if (!caps.length) { console.error('no captures in extraction/baseline/ — capture the screens first'); process.exit(2); }

const pascal = (s) => s.replace(/(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g, (_, __, c) => c.toUpperCase());
const ROLE_NAME = { button: 'Button', link: 'Link', textbox: 'TextField', searchbox: 'SearchField', combobox: 'Select', listbox: 'Listbox', checkbox: 'Checkbox', radio: 'Radio', switch: 'Switch', tab: 'Tab', tablist: 'Tabs', dialog: 'Dialog', menu: 'Menu', menuitem: 'MenuItem', table: 'Table', progressbar: 'Progress', slider: 'Slider', tooltip: 'Tooltip', alert: 'Alert', navigation: 'Navigation' };
const TAG_ROLE = { button: 'button', a: 'link', input: 'textbox', select: 'combobox', textarea: 'textbox', table: 'table', dialog: 'dialog', nav: 'navigation' };
// Which name an element carries, and from which convention.
const nameOf = (e) => {
  const slot = e.state?.['data-slot'];
  if (slot) return { name: pascal(slot), by: 'data-slot (shadcn / Base UI)', selector: `[data-slot="${slot}"]` };
  // MUI puts several *-root classes on one element (MuiButtonBase-root MuiButton-root): the most specific names it.
  const mui = (e.classes || []).map((c) => /^Mui([A-Z][A-Za-z]+)-root$/.exec(c)?.[1]).filter(Boolean);
  if (mui.length) { const pick = mui.find((x) => !/Base$/.test(x)) ?? mui[0]; return { name: pick, by: 'Mui*-root (MUI)', selector: `.Mui${pick}-root` }; }
  for (const c of e.classes || []) {
    let m = /^chakra-([a-z]+(?:-[a-z]+)?)$/.exec(c); if (m && !/portal|stack|text$/.test(m[1])) return { name: pascal(m[1]), by: 'chakra-* (Chakra UI)', selector: `.${c}` };
    m = /^ant-([a-z]+)$/.exec(c); if (m) return { name: pascal(m[1]), by: 'ant-* (Ant Design)', selector: `.${c}` };
  }
  const role = e.role || TAG_ROLE[e.tag];
  if (role && ROLE_NAME[role]) return { name: ROLE_NAME[role], by: `its role (${role})`, selector: e.role ? `[role="${e.role}"]` : e.tag, derived: true };
  return null;
};

const comps = new Map();
let population = 0;
const excluded = { 'no library name and no component role': 0 };
for (const cap of caps) {
  const statesByPath = new Map((cap.states || []).map((s) => [s.path, s]));
  for (const e of cap.elements || []) {
    population++;
    const n = nameOf(e);
    if (!n) { excluded['no library name and no component role']++; continue; }
    const c = comps.get(n.name) || { name: n.name, by: n.by, derived: Boolean(n.derived), selectors: new Set(), instances: 0, screens: new Set(), states: new Map(), dataStates: new Set(), disabled: 0, sample: null };
    c.instances++; c.screens.add(cap.meta.screen); c.selectors.add(n.selector);
    if (!c.sample && (e.text || e.label)) c.sample = (e.text || e.label).slice(0, 40);
    for (const [k, v] of Object.entries(e.state || {})) { if (k.startsWith('data-state')) c.dataStates.add(v); if (k === 'disabled' || (k === 'aria-disabled' && v === 'true')) c.disabled++; }
    const st = statesByPath.get(e.path);
    if (st) for (const pseudo of Object.keys(st.byForcedPseudo || {})) c.states.set(pseudo, (c.states.get(pseudo) || 0) + 1);
    comps.set(n.name, c);
  }
}
const STATE_OF = { hover: 'hover', focus: 'focus', 'focus-visible': 'focus-visible', active: 'active', open: 'expanded', checked: 'checked', unchecked: null, closed: null, active_: null, selected: 'selected', on: 'checked', off: null, indeterminate: 'indeterminate' };
// Layout primitives and internal parts a library names too — listed, flagged, never promoted silently.
const PART = /^(Box|Stack|Grid\d?|Container|Typography|SvgIcon|Paper|Charts[A-Z]\w*|ButtonBase|InputBase|TouchRipple|Backdrop|Portal|Popper|Modal|Collapse|Fade|Grow|Slide)$/;
for (const c of comps.values()) c.part = PART.test(c.name);
const list = [...comps.values()].sort((a, b) => Number(a.part) - Number(b.part) || Number(a.derived) - Number(b.derived) || b.instances - a.instances);
const draft = {
  _why: 'A DRAFT of components.json from the captures (scripts/inventory.mjs). The checkpoint page shows it and the designer ticks what goes in; nothing is copied into a components.json. What the draft cannot say (each role, variants, the page it belongs on) comes after the ticks. Names from a library convention are measured; names from a role are derived.',
  $meta: {
    product: P.name, extractedAt: caps.map((c) => c.meta.capturedAt).sort().at(-1),
    inventoryBasis: {
      screensCaptured: new Set(caps.map((c) => c.meta.screen)).size,
      clusteringRule: 'by the name the component library writes on the element (data-slot, Mui*-root, chakra-*, ant-*), else by the element\'s role — measured where a library names it, derived where only a role does',
      promotionRule: 'decided: every named element is listed; the designer unticks what is not a component of the product (a part, a layout wrapper) on the checkpoint page',
    },
  },
  components: list.map((c) => ({
    name: c.name,
    role: '(no description yet — write what it is for)',
    recognize: { selectors: [...c.selectors].slice(0, 4), markers: [`named by ${c.by}`, ...(c.part ? ['a layout primitive or an internal part of the library — probably not a component of the product'] : [])], ...(c.sample ? { example: c.sample } : {}) },
    anatomy: [],
    states: [
      { state: 'default', status: 'measured', mechanism: 'none' },
      ...[...c.states.keys()].map((p) => ({ state: p, status: 'measured', mechanism: 'forced-pseudo-state' })),
      // seen as rendered (data-state on a resting element), not injected: the mechanism is 'none'
      ...[...c.dataStates].map((v) => STATE_OF[v]).filter(Boolean).map((s) => ({ state: s, status: 'measured', mechanism: 'none' })),
      ...(c.disabled ? [{ state: 'disabled', status: 'measured', mechanism: 'none' }] : []),
    ].filter((s, i, a) => a.findIndex((x) => x.state === s.state) === i),
    usage: { instances: c.instances, screens: c.screens.size, populationSelected: 'visible elements of the light-scheme captures that a library names or that have a component role', populationTotal: population, excluded },
    provenance: { label: c.derived ? 'derived' : 'measured', evidence: `named by ${c.by}; ${c.instances} instance(s) on ${c.screens.size} screen(s): ${[...c.screens].slice(0, 4).join(', ')}` },
  })),
};
writeFileSync(join(P.spec, 'components.draft.json'), JSON.stringify(draft, null, 2) + '\n');
const named = list.filter((c) => !c.derived && !c.part);
console.log(`inventory draft -> extraction/components.draft.json: ${list.length} candidate components (${named.length} named by the product's component library, ${list.length - named.length} by role only) from ${population} elements on ${draft.$meta.inventoryBasis.screensCaptured} screen(s)`);
const comp = list.filter((c) => !c.part), parts = list.filter((c) => c.part);
console.log(`  components: ${comp.slice(0, 18).map((c) => `${c.name} ×${c.instances}`).join(' · ')}${comp.length > 18 ? ` · … ${comp.length - 18} more` : ''}`);
if (parts.length) console.log(`  parts and layout (flagged, probably not components): ${parts.map((c) => c.name).join(', ')}`);
console.log('  a draft: the checkpoint page shows it; the designer ticks what goes in');
