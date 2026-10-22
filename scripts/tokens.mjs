// Captures of a running product -> tokens.json, the canon the kit is built from.
// (Moved from ds-extract-method scripts/captures_to_canon.mjs @ebaa66f; changes: names, the instrument version, messages.)
//
// A token here is a custom property the product itself declares globally, under its own name: `--color-primary`
// becomes the token `color-primary`, and the kit's CSS variable is `--color-primary` again. Nothing is renamed,
// so the kit, the prototype and the product speak one vocabulary and a drift check compares like with like.
//
// Every value is the BROWSER's resolution, read by capture.mjs (its `computed` block): a colour as the browser
// computes it, a length in px (calc and rem included), never a parse of stylesheet text. What a token is FOR is read
// from where the product spends it (`varUsage`: "rgb(var(--x))" in background-color says colour; border-radius says
// radius) — measured. Only when nothing spends it directly does the role come from the value's shape and the name,
// and then it is labelled derived and says so.
//
// Left out, and counted: the framework's own per-utility variables (`--tw-*`), runtime values a component library
// sets on elements (`--radix-*`), and properties declared only inside a nested scope (not a global token).
//
// Colour schemes: every scheme captured (capture.mjs --scheme dark) becomes a mode; a token whose resolved value
// differs between them `varies`. Breakpoints: the @media min-widths the product's stylesheets hold.
// Tailwind v4 spacing (`--spacing` as one base, utilities multiply it): the kit gets the multiplier scale Tailwind
// itself uses, each step `calc(var(--spacing) * k)` — labelled decided, because the steps are Tailwind's, not read.
//
// Usage: node scripts/tokens.mjs <product-repo> [capture.json …]   (default: <repo>/baseline/*.json)
// Writes <repo>/tokens.json (keeps $closure and the rest of $meta) and prints what it left out and why.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { product, here } from './lib/product.mjs';
import { parseColor, toHex } from './lib/color.mjs';

const EXT = 'co.eleken.ds';
const args = process.argv.slice(2);
const P = product(args[0], 'usage: node scripts/tokens.mjs <product-repo> [capture.json …]');
let files = args.slice(1).filter((a) => !a.startsWith('--')).map(here);
if (!files.length) {
  const dir = join(P.spec, 'baseline');
  files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => join(dir, f)) : [];
}
const caps = files.map((f) => ({ file: f, cap: JSON.parse(readFileSync(f, 'utf8')) })).filter(({ cap }) => cap.meta?.tool === 'capture.mjs');
if (!caps.length) { console.error('no captures given, and none in baseline/ — capture the screens first (scripts/capture.mjs)'); process.exit(2); }
// A capture from before the walker resolved properties through the browser. (A product with no custom properties at
// all has an empty list — that is a finding, not an old capture.)
const old = caps.filter(({ cap }) => !cap.varUsage || (Object.keys(cap.customProperties || {}).length && !Object.values(cap.customProperties).some((c) => 'computed' in c)));
if (old.length) { console.error(`refused: ${old.length} capture(s) predate the walker's browser resolution (no computed / varUsage): ${old.map((c) => basename(c.file)).join(', ')} — re-capture them`); process.exit(2); }

// ---- schemes: light is the base when captured, otherwise the first scheme seen
const schemes = [...new Set(caps.map(({ cap }) => cap.meta.colorScheme || 'light'))];
const base = schemes.includes('light') ? 'light' : schemes[0];
const inScheme = (s) => caps.filter(({ cap }) => (cap.meta.colorScheme || 'light') === s);
const rootPx = (() => { const v = [...new Set(caps.map(({ cap }) => parseFloat(cap.rootFontSize)).filter(Number.isFinite))]; return { px: v[0] ?? 16, consistent: v.length <= 1, measured: v.length > 0 }; })();

// ---- the properties, per scheme: the first capture that resolved one is its reading
const GLOBAL = /^(:root|html|:host|html:root|\*|:root:root)$/;
const isGlobal = (sel) => String(sel).split(',').map((x) => x.trim()).some((x) => GLOBAL.test(x));
const EXCLUDE = [[/^--tw-/, 'Tailwind\'s own per-utility variables (--tw-*), not design tokens'], [/^--radix-/, 'runtime values a component library sets on elements (--radix-*)']];
const props = new Map(); // name -> { byScheme: {s: {resolved, computed, screen}}, declarations, usage }
const excluded = {};
const note = (why, name) => { (excluded[why] ||= []).push(name); };
for (const s of schemes) for (const { cap } of inScheme(s)) {
  for (const [name, cp] of Object.entries(cap.customProperties || {})) {
    const ex = EXCLUDE.find(([re]) => re.test(name));
    if (ex) { if (s === base) note(ex[1], name); continue; }
    if (!props.has(name)) props.set(name, { byScheme: {}, declarations: cp.declarations || [], usage: { rules: 0, props: {}, wrappers: {} } });
    const p = props.get(name);
    if (!p.byScheme[s] && cp.resolvedAtRoot != null) p.byScheme[s] = { resolved: cp.resolvedAtRoot, computed: cp.computed || {}, screen: cap.meta.screen };
  }
  if (s === base) for (const [name, u] of Object.entries(cap.varUsage || {})) {
    const p = props.get(name);
    if (!p) continue;
    p.usage.rules += u.rules;
    for (const [k, v] of Object.entries(u.props)) p.usage.props[k] = (p.usage.props[k] || 0) + v;
    for (const [k, v] of Object.entries(u.wrappers)) p.usage.wrappers[k] = (p.usage.wrappers[k] || 0) + v;
  }
}
for (const [name, p] of props) {
  if (!p.byScheme[base]) { note('declared only inside a nested scope, never resolved at the document root — not a global token', name); props.delete(name); continue; }
  if (!p.declarations.some((d) => isGlobal(d.selector))) { note('resolved at the root but not declared on :root / html / :host (inherited from a scope the walker saw no rule for)', name); }
}

// ---- role: where the product spends it (measured), else the value's shape and the name (derived)
const PROP_ROLE = [
  [/^(color|background(-color)?|border(-(top|right|bottom|left|block|inline)(-start|-end)?)?-color|outline-color|fill|stroke|text-decoration-color|caret-color|accent-color|column-rule-color|stop-color|flood-color)$/, 'color'],
  [/^border(-(top|bottom)-(left|right)|-(start|end)-(start|end))?-radius$/, 'radius'],
  [/^(padding|margin|inset|gap|row-gap|column-gap)(-.+)?$|^(top|right|bottom|left|width|height|min-width|max-width|min-height|max-height|flex-basis|translate)$/, 'spacing'],
  [/^font-size$/, 'fontSize'], [/^line-height$/, 'lineHeight'], [/^font-weight$/, 'fontWeight'], [/^font-family$/, 'fontFamily'],
  [/^letter-spacing$/, 'letterSpacing'], [/^box-shadow$/, 'shadow'],
  [/^(border(-(top|right|bottom|left))?-width|outline-width|stroke-width)$/, 'borderWidth'],
  [/^(transition|animation)-duration$/, 'duration'], [/^(transition|animation)-timing-function$/, 'easing'],
];
const TYPE_OF = { color: 'color', radius: 'dimension', spacing: 'dimension', fontSize: 'dimension', lineHeight: 'dimension', letterSpacing: 'dimension', borderWidth: 'dimension', screen: 'dimension', fontWeight: 'fontWeight', fontFamily: 'fontFamily', shadow: 'shadow', duration: 'duration', easing: 'cubicBezier', number: 'number', string: 'string' };
// A name segment anywhere in the name: `radius-lg` and `primitives-radius-lg` both say radius.
const seg = (words, tail = '(-|$)') => new RegExp(`(^|-)(${words})${tail}`);
// Most specific first: `stroke-weight` is a border width, not a font weight; a bare `size` says nothing.
const NAME_ROLE = [[seg('border-width|stroke-width|stroke-weight|stroke'), 'borderWidth'], [seg('font-weight'), 'fontWeight'], [seg('radius|rounded|corner'), 'radius'], [seg('line-height|leading'), 'lineHeight'], [seg('letter-spacing|tracking'), 'letterSpacing'], [seg('font-size|text'), 'fontSize'], [seg('font-family|family|font'), 'fontFamily'], [seg('shadow|elevation'), 'shadow'], [seg('breakpoint'), 'screen'], [seg('duration'), 'duration'], [seg('ease|easing'), 'easing'], [seg('spacing|space|gap|padding|margin'), 'spacing']];
// An alias only when the declaration that points at another property is the one that WINS. next/font declares
// `--font-sans: var(--font-sans)` on :root and the real family on a class of <html> — read as an alias, the name
// pointed at itself and the kit's font resolved to nothing.
const aliasOf = (p, self) => {
  const d = p.declarations.find((x) => isGlobal(x.selector)) ?? p.declarations[0];
  const m = d && /^var\(\s*(--[A-Za-z0-9_-]+)\s*\)$/.exec(String(d.authored).trim());
  if (!m || !props.has(m[1]) || m[1] === self) return null;
  const target = props.get(m[1]).byScheme[base]?.resolved, mine = p.byScheme[base]?.resolved;
  return target != null && mine != null && target !== mine ? null : m[1];
};
const roles = new Map(); // name -> { role, label, evidence }
for (const [name, p] of props) {
  const tally = {};
  // Only roles the VALUE can have: a colour spent inside a box-shadow more often than as a background is still a
  // colour (shadcn's --card became a shadow, and the kit lost bg-card); a length is never a colour.
  const cc = p.byScheme[base]?.computed || {};
  const isColour = Boolean(cc.color || cc.rgbChannels || cc.hslChannels);
  const fits = (role) => isColour ? role === 'color' || role === 'shadow' : role !== 'color';
  for (const [prop, n] of Object.entries(p.usage.props)) { const hit = PROP_ROLE.find(([re]) => re.test(prop)); if (hit && fits(hit[1])) tally[hit[1]] = (tally[hit[1]] || 0) + n; }
  if (isColour && tally.shadow) { tally.color = (tally.color || 0) + tally.shadow; delete tally.shadow; }
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
  if (top) {
    const wrap = Object.entries(p.usage.wrappers).filter(([w]) => w !== 'bare').map(([w, n]) => `${w}(var(${name})) ×${n}`).join(', ');
    roles.set(name, { role: top[0], label: 'measured', evidence: `spent in ${Object.entries(p.usage.props).filter(([k]) => k !== '(custom property)').map(([k, n]) => `${k} ×${n}`).join(', ')}${wrap ? `; as ${wrap}` : ''}` });
  }
}
// Through aliases: a primitive that only semantic tokens point at is for what they are for.
for (let pass = 0; pass < 6; pass++) for (const [name, p] of props) {
  if (roles.has(name)) continue;
  const parents = [...props].filter(([n, q]) => aliasOf(q, n) === name && roles.has(n)).map(([n]) => n);
  if (parents.length) roles.set(name, { role: roles.get(parents[0]).role, label: 'derived', evidence: `nothing spends it directly; ${parents.slice(0, 3).join(', ')}${parents.length > 3 ? ` and ${parents.length - 3} more` : ''} point at it` });
}
for (const [name, p] of props) {
  if (roles.has(name)) continue;
  const c = p.byScheme[base].computed;
  // camelCase is a word boundary too: MUI's --mui-shape-borderRadius says radius, as --radius-lg does
  const n = name.slice(2).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
  const byName = NAME_ROLE.find(([re]) => re.test(n))?.[1];
  let role = null;
  if (c.color) role = 'color';
  else if (c.rgbChannels || c.hslChannels) role = 'color';
  else if (c.length) role = byName && TYPE_OF[byName] === 'dimension' ? byName : 'spacing';
  else if (c.shadow) role = 'shadow';
  else if (c.duration) role = 'duration';
  else if (byName === 'fontWeight' && c.fontWeight) role = 'fontWeight';
  else if (byName === 'lineHeight' && (c.number != null || /^[\d.]+$/.test(p.byScheme[base].resolved))) role = 'lineHeight';
  else if (byName === 'fontFamily' && c.fontFamily) role = 'fontFamily';
  else if (byName === 'easing') role = 'easing';
  else role = c.number != null || /^-?[\d.]+$/.test(p.byScheme[base].resolved) ? 'number' : 'string';
  roles.set(name, { role, label: 'derived', evidence: `not spent by any rule the walker could read; ${c.color || c.rgbChannels || c.hslChannels ? 'the browser accepts its value as a colour' : c.length ? 'the browser resolves it as a length' : 'from its value'}${byName ? ` and its name (${byName})` : ''}` });
}

// ---- values, as the browser resolved them
// Bare channels can read both ways ("222.2 47.4% 11.2%" is also a valid rgb()): the product's own wrapper decides —
// hsl(var(--x)) in its stylesheet is measured — and only without one does the shape (a hue, then two percentages).
const channelForm = (c, usage) => {
  if (c.color) return 'color';
  const w = usage?.wrappers || {};
  if (c.hslChannels && (w.hsl || w.hsla) && !(w.rgb || w.rgba)) return 'hsl-channels';
  if (c.rgbChannels && (w.rgb || w.rgba) && !(w.hsl || w.hsla)) return 'rgb-channels';
  if (c.hslChannels && !c.rgbChannels) return 'hsl-channels';
  if (c.rgbChannels && !c.hslChannels) return 'rgb-channels';
  if (c.hslChannels && c.rgbChannels) return 'hsl-channels'; // hue + two percentages is hsl's shape
  return null;
};
const colorOf = (c, usage) => ({ color: c.color, 'rgb-channels': c.rgbChannels, 'hsl-channels': c.hslChannels })[channelForm(c, usage)];
const cssFormOf = (c, usage) => channelForm(c, usage);
const canonicalColor = (str) => { const k = parseColor(str); if (!k) return str; return ['rgb', 'hex', 'named', 'hsl'].includes(k.space) || !k.clipped && k.space === 'color(srgb)' ? toHex(k) : str; };
const valueOf = (role, reading, usage) => {
  const c = reading.computed;
  if (role === 'color') return colorOf(c, usage) ? canonicalColor(colorOf(c, usage)) : reading.resolved;
  if (role === 'lineHeight' && !c.length && c.number != null) return +Number(c.number).toFixed(6); // a unitless ratio
  if (role === 'shadow') return c.shadow ?? reading.resolved;
  if (TYPE_OF[role] === 'dimension') return c.length ? parseFloat(c.length) : reading.resolved;
  if (role === 'fontWeight') return Number(c.fontWeight ?? reading.resolved);
  if (role === 'number' || role === 'lineHeight') return c.length ? parseFloat(c.length) : c.number != null ? +Number(c.number).toFixed(6) : /^-?[\d.]+$/.test(reading.resolved) ? Number(reading.resolved) : reading.resolved;
  return reading.resolved;
};
// The declaration text, when everything it references is a token too — otherwise the resolved value, because a
// var() pointing outside the canon (a --tw-* internal, a scoped property) would resolve to nothing in the kit.
// The declaration the cascade applies: a property declared twice on :root (a base sheet, then an override) is the later
// one — the one whose text the browser holds at the root; failing that, the last global one in source order.
const norm = (x) => String(x ?? '').replace(/\s+/g, ' ').trim();
const authoredCss = (p) => {
  const globals = p.declarations.filter((x) => isGlobal(x.selector));
  const resolved = norm(p.byScheme[base]?.resolved);
  const d = (globals.find((x) => norm(x.authored) === resolved) ?? globals.at(-1) ?? p.declarations[0])?.authored ?? null;
  const refs = [...String(d ?? '').matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  return d && refs.every((r) => props.has(r)) ? d : p.byScheme[base].resolved;
};

const tokens = {};
const keyOf = (name) => name.slice(2);
const STRIP = { color: /^color-/, radius: /^radius-?/, spacing: /^spacing-?/, fontSize: /^(text|font-size)-/, lineHeight: /^(leading|line-height)-?/, letterSpacing: /^(tracking|letter-spacing)-?/, fontWeight: /^font-weight-/, fontFamily: /^(font-family|font)-/, shadow: /^shadow-?/, borderWidth: /^(border-width|stroke-width)-?/, screen: /^breakpoint-/ };
const twTaken = new Map();
const twKeyOf = (role, key) => {
  let k = STRIP[role] ? key.replace(STRIP[role], '') : key;
  if (!k) k = 'DEFAULT';
  if (twTaken.has(`${role}:${k}`)) k = key; // a second token claiming the same class keeps its full name…
  if (twTaken.has(`${role}:${k}`)) { noClass.push(`--${key} (bg-/text-${k} is --${twTaken.get(`${role}:${k}`)})`); return null; } // …unless that is taken too
  twTaken.set(`${role}:${k}`, key);
  return k;
};
// A name carrying its role's prefix claims the class first: in Tailwind v4, bg-primary is --color-primary, and a
// bare --primary beside it is the raw value the theme points at. The loser keeps no class and is reported.
const unprefixed = (name) => Number(!STRIP[roles.get(name).role]?.test(name.slice(2)));
const ordered = [...props].sort(([a], [b]) => unprefixed(a) - unprefixed(b));
const noClass = [];
for (const [name, p] of ordered) {
  const r = roles.get(name);
  const alias = aliasOf(p, name);
  const reading = p.byScheme[base];
  const key = keyOf(name);
  const t = {
    $id: name,
    $type: r.role === 'lineHeight' && !reading.computed.length && reading.computed.number != null ? 'number' : TYPE_OF[r.role] ?? 'string',
    $value: alias ? `{${keyOf(alias)}}` : valueOf(r.role, reading, p.usage),
    $provenance: {
      label: 'measured',
      instrument: 'computed-style',
      authoredName: name,
      evidence: `declared ${p.declarations.slice(0, 2).map((d) => `on "${d.selector}"`).join(', ')}${p.declarations.length > 2 ? ` (+${p.declarations.length - 2})` : ''}; resolved by the browser on ${reading.screen} (${base})${alias ? `; its declaration is var(${alias}), recorded as an alias` : ''}`,
    },
    $extensions: { [EXT]: {
      cssVar: name,
      role: r.role,
      roleProvenance: { label: r.label, evidence: r.evidence },
      twKey: twKeyOf(r.role, key),
      // What the kit's stylesheet declares: the product's own declaration text (var() references and rem kept,
      // so relations survive), unless that text is not resolvable outside the product.
      css: authoredCss(p),
      ...(r.role === 'color' ? { cssForm: cssFormOf(reading.computed, p.usage) ?? 'unresolved' } : {}),
      scopes: ({ radius: ['CORNER_RADIUS'], spacing: ['GAP'], fontSize: ['FONT_SIZE'], lineHeight: ['LINE_HEIGHT'], borderWidth: ['STROKE_FLOAT'] })[r.role] ?? [],
      usage: p.usage.rules ? p.usage : undefined,
    } },
  };
  // modes: the other schemes, where the browser resolved something different
  const others = schemes.filter((s) => s !== base && p.byScheme[s]);
  const varies = others.filter((s) => p.byScheme[s].resolved !== reading.resolved);
  // An alias changes with its target: it gets no modes of its own, or the kit would freeze it to a literal.
  if (alias && varies.length) t.$extensions[EXT].modeStatus = 'follows-alias';
  else if (varies.length) {
    t.$modes = { [base]: t.$value, ...Object.fromEntries(varies.map((s) => [s, valueOf(r.role, p.byScheme[s], p.usage)])) };
    t.$extensions[EXT].modeStatus = 'varies';
    t.$extensions[EXT].cssModes = Object.fromEntries(varies.map((s) => [s, p.byScheme[s].resolved]));
  } else if (others.length) t.$extensions[EXT].modeStatus = 'uniform';
  tokens[key] = t;
}
const resolveLit = (k, d = 0) => { const t = tokens[k]; const m = t && /^\{(.+)\}$/.exec(String(t.$value)); return m && d < 10 ? resolveLit(m[1], d + 1) : t?.$value; };
// an alias's colour form is its target's
for (const t of Object.values(tokens)) {
  const x = t.$extensions[EXT];
  if (x.role !== 'color' || !/^\{.+\}$/.test(String(t.$value))) continue;
  let target = t, hops = 0;
  while (/^\{(.+)\}$/.test(String(target.$value)) && hops++ < 10) target = tokens[/^\{(.+)\}$/.exec(target.$value)[1]] ?? target;
  x.cssForm = target.$extensions[EXT].cssForm;
}

// ---- the product's own class names, measured: which utility class computes to which token on its elements.
// A Tailwind v4 / shadcn theme names classes in `@theme inline`, consumed at build time and absent from the CSS
// (rounded-lg = var(--radius), bg-card = var(--card)); the class and the value it produces are both in the capture.
{
  const seen = new Map(); // class -> { prop, values: Map(value -> n) }
  const PREFIX = [[/^rounded(-[a-z0-9]+)?$/, 'borderTopLeftRadius', 'radius'], [/^bg-[a-z][a-z0-9-]*$/, 'backgroundColor', 'color'], [/^border-[a-z][a-z0-9-]*$/, 'borderTopColor', 'color'], [/^shadow(-[a-z0-9]+)?$/, 'boxShadow', 'shadow']];
  for (const { cap } of inScheme(base)) for (const e of cap.elements || []) for (const cls of e.classes || []) {
    const hit = PREFIX.find(([re]) => re.test(cls)); if (!hit) continue;
    const v = e.values?.[hit[1]]; if (v == null) continue;
    const r = seen.get(cls) || { prop: hit[1], role: hit[2], values: new Map() };
    r.values.set(v, (r.values.get(v) || 0) + 1); seen.set(cls, r);
  }
  const keyOfClass = (cls) => cls.replace(/^(rounded|bg|border|shadow)-?/, '') || 'DEFAULT';
  const renamed = [];
  for (const [cls, r] of seen) {
    const [value, n] = [...r.values].sort((a, b) => b[1] - a[1])[0];
    const total = [...r.values.values()].reduce((a, b) => a + b, 0);
    if (n < 2 || n / total < 0.9) continue; // a class that computes to several values is not one token
    const k = keyOfClass(cls);
    const cand = Object.entries(tokens).filter(([, t]) => t.$extensions[EXT].role === r.role).filter(([name]) => {
      const lit = resolveLit(name);
      if (r.role === 'radius') return typeof lit === 'number' && Math.abs(lit - parseFloat(value)) < 0.01;
      if (r.role === 'color') { const a = parseColor(lit), b = parseColor(value); return a && b && Math.abs(a.a - b.a) < 0.01 && Math.hypot(a.lab[0] - b.lab[0], a.lab[1] - b.lab[1], a.lab[2] - b.lab[2]) < 0.002; }
      return String(lit) === String(value);
    });
    // the token the class names: the one whose own key IS that name, else the one whose name ends with it, else the only one
    const own = cand.find(([name]) => name.endsWith(`-${k}`) || name === k) ?? (cand.length === 1 ? cand[0] : null);
    if (!own) continue;
    const x = own[1].$extensions[EXT];
    if (x.twKey === k) continue;
    if (Object.values(tokens).some((t) => t !== own[1] && t.$extensions[EXT].role === r.role && t.$extensions[EXT].twKey === k)) continue;
    x.twKeyEvidence = `the product's class ${cls} computes to ${value} on ${n} of ${total} element(s) (measured); the kit's class keeps that name`;
    renamed.push(`${cls} → --${own[0]}`);
    x.twKey = k;
  }
  if (renamed.length) console.log(`  classes named as the product names them: ${renamed.slice(0, 8).join(', ')}${renamed.length > 8 ? ` (+${renamed.length - 8})` : ''}`);
}

// ---- a product that declares no tokens of a kind: derive them from what it paints (METHOD fill rule 2, frequency)
// MUI / CSS-in-JS / CSS modules often ship literals, not custom properties. For each kind the product declares no
// token of (colour: fewer than 3), the values its elements really paint become DERIVED tokens: colours clustered in
// OKLab (0.006) per use — surfaces, text, lines — dimensions by exact value. A value painted on fewer than 2 elements
// is a one-off, listed, not a token. Each derived token carries the counters phase 3 asks for.
const declaredOf = (role) => Object.values(tokens).filter((t) => t.$extensions[EXT].role === role).length;
const derivedAdded = [];
const oneOffs = {};
{
  const baseCaps = inScheme(base).map(({ cap }) => cap);
  const counters = new Map(); // key -> { value, nodes, screens:Set, area }
  const count = (kind, value, e, screen) => {
    const k = `${kind}|${value}`;
    const c = counters.get(k) || { kind, value, nodes: 0, screens: new Set(), area: 0 };
    c.nodes++; c.screens.add(screen); c.area += e.area || 0; counters.set(k, c);
  };
  const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) && /px$/.test(String(v)) ? Math.round(n * 100) / 100 : null; };
  for (const cap of baseCaps) {
  // once per capture, not per element
  const topDepth = (cap.elements || []).reduce((m, x) => Math.min(m, x.depth ?? 0), Infinity);
  for (const e of cap.elements || []) {
    const v = e.values || {}, screen = cap.meta.screen;
    // once per element per value: a badge padded 2px top and bottom is one element, not two
    const once = new Set();
    const countOnce = (kind, value) => { const k = `${kind}|${value}`; if (once.has(k)) return; once.add(k); count(kind, value, e, screen); };
    const bg = parseColor(v.backgroundColor); if (bg && bg.a > 0) count('surface', v.backgroundColor, e, screen);
    if ((e.text || '').trim()) { count('fg', v.color, e, screen); if (px(v.fontSize)) count('fontSize', px(v.fontSize), e, screen); if (v.fontWeight) count('fontWeight', Number(v.fontWeight), e, screen); if (v.fontFamily) count('fontFamily', v.fontFamily, e, screen); if (px(v.lineHeight) && px(v.fontSize)) count(`lineHeight@${px(v.fontSize)}`, px(v.lineHeight), e, screen); }
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(v[`border${side}Width`]) > 0 && v.borderStyle !== 'none') { count('line', v[`border${side}Color`], e, screen); break; }
    // letter-spacing: a painted non-normal value on text, once per element, unless the element only inherits it (a span in a tracked heading)
    const ls = px(v.letterSpacing); if (ls && (e.text || '').trim() && ((e.depth ?? 0) === topDepth || !(e.notOwnChoice || []).includes('letterSpacing'))) countOnce('letterSpacing', ls);
    const r = px(v.borderTopLeftRadius); if (r) countOnce('radius', r);
    for (const side of ['Top', 'Right', 'Bottom', 'Left']) { const p = px(v[`padding${side}`]); if (p) countOnce('spacing', p); }
    if (/flex|grid/.test(v.display || '')) for (const g of ['rowGap', 'columnGap']) { const x = px(v[g]); if (x) countOnce('spacing', x); }
    if (v.boxShadow && v.boxShadow !== 'none') count('shadow', v.boxShadow, e, screen);
  }
  }
  const need = { color: declaredOf('color') < 3, radius: !declaredOf('radius'), spacing: !declaredOf('spacing'), fontSize: !declaredOf('fontSize'), fontWeight: !declaredOf('fontWeight'), fontFamily: !declaredOf('fontFamily'), shadow: !declaredOf('shadow'), letterSpacing: !declaredOf('letterSpacing') };
  const add = (key, role, value, c, cssValue, twKey, rule) => {
    tokens[key] = {
      $id: `--${key}`, $type: TYPE_OF[role], $value: value,
      $provenance: { label: 'derived', evidence: `${rule}; painted on ${c.nodes} element(s) across ${c.screens.size} screen(s). The product declares no token of this kind — it paints literals — so the value is the token and the name is the kit's.`,
        counters: { nodes: c.nodes, screens: c.screens.size, summedVisibleArea: Math.round(c.area), populationSelected: 'every visible element of the base-scheme captures (capture.mjs population), counted per element' } },
      $extensions: { [EXT]: { cssVar: `--${key}`, role, roleProvenance: { label: 'derived', evidence: 'the property it is painted in' }, twKey, css: cssValue, ...(role === 'color' ? { cssForm: 'color' } : {}), scopes: ({ radius: ['CORNER_RADIUS'], spacing: ['GAP'], fontSize: ['FONT_SIZE'] })[role] ?? [] } },
    };
    derivedAdded.push(key);
  };
  const byKind = (kind) => [...counters.values()].filter((c) => c.kind === kind);
  const keep = (list, kind) => { const kept = list.filter((c) => c.nodes >= 2); const off = list.filter((c) => c.nodes < 2); if (off.length) oneOffs[kind] = off.map((c) => c.value).slice(0, 12); return kept; };
  if (need.color) for (const [kind, prefix] of [['surface', 'surface'], ['fg', 'fg'], ['line', 'line']]) {
    const clusters = [];
    for (const c of byKind(kind).sort((a, b) => (kind === 'surface' ? b.area - a.area : b.nodes - a.nodes))) {
      const col = parseColor(c.value); if (!col) continue;
      const hit = clusters.find((k) => Math.abs(k.col.a - col.a) < 0.01 && Math.hypot(k.col.lab[0] - col.lab[0], k.col.lab[1] - col.lab[1], k.col.lab[2] - col.lab[2]) < 0.006);
      if (hit) { hit.nodes += c.nodes; hit.area += c.area; c.screens.forEach((x) => hit.screens.add(x)); } else clusters.push({ ...c, col, screens: new Set(c.screens) });
    }
    keep(clusters, kind).forEach((c, i) => add(`${prefix}-${i + 1}`, 'color', canonicalColor(c.value), c, c.value, `${prefix}-${i + 1}`, `cluster ${i + 1} of the ${kind === 'surface' ? 'background' : kind === 'fg' ? 'text' : 'border'} colours, by ${kind === 'surface' ? 'painted area' : 'element count'}`));
  }
  if (need.radius) keep(byKind('radius').sort((a, b) => a.value - b.value), 'radius').forEach((c, i) => add(`radius-${i + 1}`, 'radius', c.value, c, `${c.value}px`, String(i + 1), `a corner radius the product sets (${c.value}px)`));
  if (need.spacing) keep(byKind('spacing').sort((a, b) => a.value - b.value), 'spacing').forEach((c) => add(`spacing-${String(c.value).replace('.', '_')}px`, 'spacing', c.value, c, `${c.value}px`, `${c.value}px`, `a padding or gap the product sets (${c.value}px)`));
  if (need.fontSize) keep(byKind('fontSize').sort((a, b) => a.value - b.value), 'fontSize').forEach((c) => {
    // a '.' is not a CSS name character (`--text-12.5px` is dropped by the browser): 12.5 → 12_5, as spacing and lit-* do
    add(`text-${String(c.value).replace('.', '_')}px`, 'fontSize', c.value, c, `${c.value}px`, `${c.value}px`, `a font size the product sets (${c.value}px)`);
    const lh = byKind(`lineHeight@${c.value}`).sort((a, b) => b.nodes - a.nodes)[0];
    if (lh) add(`text-${String(c.value).replace('.', '_')}px--line-height`, 'lineHeight', lh.value, lh, `${lh.value}px`, `${c.value}px--line-height`, `the line height the product sets most at ${c.value}px (${lh.value}px)`);
  });
  if (need.fontWeight) keep(byKind('fontWeight').sort((a, b) => a.value - b.value), 'fontWeight').forEach((c) => add(`font-weight-${c.value}`, 'fontWeight', c.value, c, String(c.value), String(c.value), `a font weight the product sets (${c.value})`));
  if (need.fontFamily) keep(byKind('fontFamily').sort((a, b) => b.nodes - a.nodes), 'fontFamily').slice(0, 4).forEach((c, i) => add(i === 0 ? 'font-sans' : `font-${i + 1}`, 'fontFamily', c.value, c, c.value, i === 0 ? 'sans' : String(i + 1), `the ${i === 0 ? 'most used' : `number ${i + 1}`} font family`));
  if (need.letterSpacing) keep(byKind('letterSpacing').sort((a, b) => a.value - b.value), 'letterSpacing').forEach((c) => add(`tracking-${String(c.value).replace('.', '_').replace('-', 'm')}px`, 'letterSpacing', c.value, c, `${c.value}px`, `${c.value}px`, `a letter spacing the product sets (${c.value}px)`));
  if (need.shadow) keep(byKind('shadow').sort((a, b) => b.nodes - a.nodes), 'shadow').forEach((c, i) => add(`shadow-${i + 1}`, 'shadow', c.value, c, c.value, String(i + 1), 'a box shadow the product sets'));
}

// ---- Tailwind v4: one --spacing base, utilities multiply it
// derived, not decided (only a person decides); no authoredName: the product never writes --spacing-4, so the
// checkpoint shows these as proposed names, pre-filled, for the designer to keep.
const multiplierAdded = [];
// Only when the product's own rules multiply it (calc(var(--spacing) * k) — Tailwind v4's utilities): a --spacing
// nobody multiplies is one length, not a scale.
const spacingBase = tokens.spacing && tokens.spacing.$extensions[EXT].role === 'spacing' && typeof tokens.spacing.$value === 'number' && (tokens.spacing.$extensions[EXT].usage?.wrappers?.calc ?? 0) > 0 ? tokens.spacing : null;
if (spacingBase && !Object.keys(tokens).some((k) => /^spacing-\d/.test(k))) {
  const STEPS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96];
  for (const k of STEPS) {
    const key = `spacing-${String(k).replace('.', '_')}`;
    tokens[key] = {
      $id: `--${key}`, $type: 'dimension', $value: +(spacingBase.$value * k).toFixed(4),
      $provenance: { label: 'derived', evidence: `the spacing multiplier scale of Tailwind v4 over the product's --spacing: ${k} × --spacing. The product declares one spacing base and Tailwind v4 utilities multiply it; the steps are Tailwind's default spacing scale, so the kit's p-${k} means what it means in the product. Not read from the product.` },
      $extensions: { [EXT]: { cssVar: `--${key}`, role: 'spacing', roleProvenance: { label: 'derived', evidence: 'Tailwind\'s spacing multipliers' }, twKey: String(k), css: `calc(var(--spacing) * ${k})`, scopes: ['GAP'] } },
    };
    multiplierAdded.push(key);
  }
}

// ---- breakpoints: the @media min-widths the stylesheets hold
const TW_SCREENS = { 640: 'sm', 768: 'md', 1024: 'lg', 1280: 'xl', 1536: '2xl' };
const mins = new Set();
for (const { cap } of caps) for (const m of cap.conditions?.media || []) for (const x of String(m).matchAll(/min-width:\s*([\d.]+)(px|rem|em)/g)) mins.add(Math.round(parseFloat(x[1]) * (x[2] === 'px' ? 1 : rootPx.px)));
const bpTokens = Object.entries(tokens).filter(([, t]) => t.$extensions[EXT].role === 'screen' && typeof t.$value === 'number');
if (bpTokens.length < 2) bpTokens.length = 0; // one width is not a set of breakpoints
const screenSize = bpTokens.length
  ? Object.fromEntries(bpTokens.map(([k, t]) => [t.$extensions[EXT].twKey, t.$value]))
  : Object.fromEntries([...mins].sort((a, b) => a - b).map((px) => [TW_SCREENS[px] ?? `bp-${px}`, px]));

// ---- values a person decided or approved (GENERATE.md's pending file, once approved): extraction/canon/decided.tokens.json
// {"<key>": {"$type", "$value", "$provenance": {"label": "decided"|"derived", "evidence": "… YYYY-MM-DD …"}, "role"?, "twKey"?}}
// Merged on every build, so an approval survives it. A key the product itself declares is refused: a decision may
// fill a gap, never overwrite a measurement.
// ---- the component layer (extraction/canon/components.tokens.json): each component's own colours, component-variant-
// state-part, pointing at a role, a scale step or a painted value ({color-gray-300}) — derived from the kit's components
// (scripts/component_tokens.mjs), whose states were measured against the product. Merged the same way, after decided.
// A token pointing at a painted value (lit-*) waits: those are made below, after the approved values (which are the
// system too, so a painted value they hold is not a literal); it is merged once they exist.
const deferredRefs = [];
const mergeApproved = (file, key, t) => {
  const ref = /^\{(.+)\}$/.exec(String(t.$value))?.[1];
  tokens[key] = { $id: `--${key}`, $type: t.$type, $value: t.$value, $provenance: { ...t.$provenance }, // the canon file's name is the kit's or a library's: no authoredName, which says the product wrote it
    // painted: a literal of the product's (a state value painted once, a component size), approved for the kit — like
    // the lit-* tokens, it is never what makes a painted value on-system in platform_drift.mjs
    $extensions: { [EXT]: { cssVar: `--${key}`, ...(t.painted ? { painted: true } : {}), role: t.role ?? (t.$type === 'color' ? 'color' : t.$type === 'shadow' ? 'shadow' : 'spacing'), roleProvenance: { label: t.$provenance.label, evidence: `stated in canon/${file}` }, twKey: t.twKey ?? key, css: ref ? `var(--${ref})` : typeof t.$value === 'number' ? `${t.$value}px` : String(t.$value), ...(t.$type === 'color' ? { cssForm: 'color' } : {}) } } };
};
for (const file of ['decided.tokens.json', 'components.tokens.json']) {
  const f = join(P.canonDir, file);
  if (existsSync(f)) {
    const decided = JSON.parse(readFileSync(f, 'utf8'));
    const refused = [];
    let n = 0;
    // values first, then the tokens that point at others (a role pointing at a painted value merged just before)
    const isAlias = ([, t]) => /^\{.+\}$/.test(String(t?.$value ?? ''));
    for (const [key, t] of [...Object.entries(decided).filter((e) => !isAlias(e)), ...Object.entries(decided).filter(isAlias)]) {
      if (key.startsWith('_')) continue;
      if (tokens[key] && tokens[key].$provenance.label === 'measured') { refused.push(`${key} (the product declares it)`); continue; }
      const ev = t.$provenance?.evidence || '';
      if (!['decided', 'derived'].includes(t.$provenance?.label) || !/\d{4}-\d{2}-\d{2}/.test(ev)) { refused.push(`${key} (needs a decided/derived label and dated evidence)`); continue; }
      // a value that points at another token ({color-gray-300}) is spent as that token's variable, and must name one
      const ref = /^\{(.+)\}$/.exec(String(t.$value))?.[1];
      // not made yet: a painted value (made below), or another approved token that itself waits for one
      if (ref && !tokens[ref]) { deferredRefs.push({ file, key, t }); n++; continue; }
      mergeApproved(file, key, t);
      n++;
    }
    console.log(`  ${file}: ${n} value(s) merged${refused.length ? `; refused ${refused.length}: ${refused.join(', ')}` : ''}`);
  }
}

// ---- (after the spacing scale and the approved values, which are the system too) a product that DECLARES tokens of a kind and paints OUTSIDE them: its literals, as `lit-*` tokens
// The pass above fires only when a kind has no token at all. The first single-URL product declared every kind — 69
// colours, 12 font sizes, 14 radii, 31 spacings — and painted far outside them: 7 of its 21 font sizes, 6 of 15 radii
// and 10 of 53 line heights were on its own scale; the rest were its component library's literals (Ant Design's
// 22px line height, 6px radius, #d9d9d9 border …) and hand-written values. A kit that may only use tokens cannot rebuild
// such a product, and a canon that silently absorbed those values would make the drift check pass on everything.
// So each value painted outside the declared set on 2+ elements becomes a DERIVED token named for what it is — a
// literal: `lit-<hex>` for a colour (OKLab > 0.02 from every declared colour of the same alpha), `lit-text-13_33`,
// `lit-leading-22`, `lit-radius-999`, `lit-space-14`, `lit-border-3`, `lit-font-weight-300`, `lit-font-<n>`,
// `lit-shadow-<n>` — marked `painted: true`. The kit uses them; platform_drift.mjs does NOT count them as on-system,
// so every one stays a finding. A value painted once is a one-off, listed, not a token.
const litAdded = [];
// the lits an approved token waits for ({lit-…} in canon/), and the values held by an approved name instead of a lit
const waited = new Set(deferredRefs.map(({ t }) => /^\{(.+)\}$/.exec(String(t.$value))?.[1]).filter(Boolean));
const heldBy = [];
const litOneOffs = {};
{
  const EXTX = (t) => t.$extensions[EXT];
  // a token whose chain comes to a painted value (a component colour → ant-purple-6, which holds #722ED1 painted) is no
  // declared value either: the product paints it outside its own tokens, whoever names it
  const paintedChain = (k, d = 0) => { const t = tokens[k]; if (!t || d > 10) return false; if (EXTX(t).painted) return true; const m = /^\{(.+)\}$/.exec(String(t.$value)); return !!m && paintedChain(m[1], d + 1); };
  const declared = (role) => Object.entries(tokens).filter(([k, t]) => EXTX(t).role === role && !paintedChain(k)).map(([k]) => resolveLit(k));
  const decColors = declared('color').map((v) => parseColor(v)).filter(Boolean);
  const onColor = (c) => decColors.some((d) => Math.abs(d.a - c.a) < 0.02 && Math.hypot(d.lab[0] - c.lab[0], d.lab[1] - c.lab[1], d.lab[2] - c.lab[2]) <= 0.02);
  const num = (v) => (typeof v === 'number' ? v : parseFloat(v));
  const scale = (role) => new Set(declared(role).map(num).filter(Number.isFinite).map((x) => Math.round(x * 100) / 100));
  const S = { letterSpacing: scale('letterSpacing'), fontSize: scale('fontSize'), radius: scale('radius'), spacing: new Set([...scale('spacing'), ...scale('borderWidth')]), borderWidth: scale('borderWidth'), fontWeight: scale('fontWeight') };
  const ratios = [...new Set(declared('lineHeight').map(num).filter((x) => Number.isFinite(x) && x < 4))];
  const lhPx = new Set(declared('lineHeight').map(num).filter((x) => Number.isFinite(x) && x >= 4));
  const families = new Set(declared('fontFamily').map((v) => String(v).split(',')[0].replace(/["']/g, '').trim().toLowerCase()));
  const shadows = new Set(declared('shadow').map(String));
  const maxRadius = Math.max(0, ...S.radius);
  // a radius at or above the largest declared one renders as a pill only when that one IS a pill value (9999px): with
  // a largest radius of 10px, a painted 13px is a literal, not "full" (platform_drift.mjs had the same slip)
  const pill = (r) => maxRadius >= 100 && r >= maxRadius;
  // kinds the product declares nothing of are the pass above's (derived from what is painted), not literals
  const has = { letterSpacing: S.letterSpacing.size > 0, color: decColors.length >= 3, fontSize: S.fontSize.size > 0, lineHeight: ratios.length + lhPx.size > 0, radius: S.radius.size > 0, spacing: S.spacing.size > 0, borderWidth: S.borderWidth.size > 0, fontWeight: S.fontWeight.size > 0, fontFamily: families.size > 0, shadow: shadows.size > 0 };
  const SVG_SHAPE = /^(path|circle|rect|ellipse|line|polyline|polygon|text|tspan|use)$/;
  const counters = new Map();
  const count = (kind, value, cap, extra) => { const k = `${kind}|${value}`; const c = counters.get(k) || { kind, value, nodes: 0, screens: new Set(), ...extra }; c.nodes++; c.screens.add(cap.meta.screen); counters.set(k, c); return c; };
  const px = (v) => { const n = parseFloat(v); return Number.isFinite(n) && /px$/.test(String(v)) ? Math.round(n * 100) / 100 : null; };
  for (const { cap } of inScheme(base)) {
    const top = Math.min(...(cap.elements || []).map((x) => x.depth ?? 0));
    for (const e of cap.elements || []) {
      const v = e.values || {};
      const own = new Set((e.depth ?? 0) === top ? [] : (e.notOwnChoice || []));
      const once = new Set();
      const one = (kind, value, extra) => { if (!has[kind]) return; const k = `${kind}|${value}`; if (once.has(k)) return; once.add(k); const c = count(kind, value, cap, extra); if (extra?.use) (c.uses ||= new Set()).add(extra.use); };
      const colour = (val, use) => { const c = parseColor(val); if (!c || c.a === 0 || onColor(c)) return; one('color', toHex(c), { use }); };
      if ((e.text || '').trim() && !own.has('color')) colour(v.color, 'text');
      colour(v.backgroundColor, 'background');
      if (v.borderStyle && v.borderStyle !== 'none') for (const side of ['Top', 'Right', 'Bottom', 'Left']) if (parseFloat(v[`border${side}Width`]) > 0) colour(v[`border${side}Color`], 'border');
      // fill and stroke paint only SVG shapes; on an HTML element they are the inherited default (black) and paint nothing
      if (SVG_SHAPE.test(e.tag)) { if (v.fill && v.fill !== 'none') colour(v.fill, 'fill'); if (v.stroke && v.stroke !== 'none') colour(v.stroke, 'stroke'); }
      const fs = px(v.fontSize);
      if (!own.has('fontSize') && fs && !S.fontSize.has(fs)) one('fontSize', fs);
      const lh = px(v.lineHeight);
      // counted (and named) at 2 decimals, kept at 4: Ant Design's 1.5714 line height on 24px is 37.7143px, and a
      // token rounded to 37.71 put every heading 0.004px off the product in prototype_parity
      if (!own.has('lineHeight') && lh && fs && !lhPx.has(lh) && !ratios.some((r) => Math.abs(lh / fs - r) < 0.02)) one('lineHeight', lh, { exact: Math.round(parseFloat(v.lineHeight) * 10000) / 10000 });
      const r = px(v.borderTopLeftRadius); if (r && !S.radius.has(r) && !pill(r)) one('radius', r);
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) { const p = px(v[`padding${side}`]); if (p && !S.spacing.has(p)) one('spacing', p); }
      if (/flex|grid/.test(v.display || '')) for (const g of ['rowGap', 'columnGap']) { const x = px(v[g]); if (x && !S.spacing.has(x)) one('spacing', x); }
      if (v.borderStyle && v.borderStyle !== 'none') for (const side of ['Top', 'Right', 'Bottom', 'Left']) { const w = px(v[`border${side}Width`]); if (w && !S.borderWidth.has(w)) one('borderWidth', w); }
      if (!own.has('fontWeight') && v.fontWeight && !S.fontWeight.has(Number(v.fontWeight))) one('fontWeight', Number(v.fontWeight));
      const ls = px(v.letterSpacing); if (!own.has('letterSpacing') && ls && !S.letterSpacing.has(ls)) one('letterSpacing', ls);
      if (!own.has('fontFamily') && v.fontFamily && !families.has(v.fontFamily.split(',')[0].replace(/["']/g, '').trim().toLowerCase())) one('fontFamily', v.fontFamily);
      if (v.boxShadow && v.boxShadow !== 'none' && !shadows.has(v.boxShadow)) one('shadow', v.boxShadow);
    }
  }
  // The states the walker forced (:hover, :focus, :focus-visible, :active) paint values the resting page never shows —
  // a hover background, a focus ring. They are measured too (forced pseudo-classes, read-only), so they count: once
  // per control and state, marked `state` in the evidence.
  for (const { cap } of inScheme(base)) for (const smp of (Array.isArray(cap.states) ? cap.states : cap.states?.samples) || []) {
    for (const [st, rec] of Object.entries(smp.byForcedPseudo || {})) {
      const once = new Set();
      for (const [prop, ch] of Object.entries(rec?.properties || {})) {
        const val = ch?.to; if (val == null) continue;
        if (/^(color|backgroundColor|borderTopColor|borderRightColor|borderBottomColor|borderLeftColor|outlineColor|fill|stroke)$/.test(prop)) {
          const c = parseColor(val); if (!c || c.a === 0 || onColor(c)) continue;
          const k = `color|${toHex(c)}`; if (once.has(k)) continue; once.add(k);
          const r = count('color', toHex(c), cap); (r.uses ||= new Set()).add(`${st} ${prop === 'color' ? 'text' : prop.replace(/(Top|Right|Bottom|Left)?Color$/, '').replace('background', 'background') || prop}`);
        } else if (prop === 'boxShadow' && val !== 'none' && !shadows.has(val) && has.shadow) {
          const k = `shadow|${val}`; if (once.has(k)) continue; once.add(k);
          const r = count('shadow', val, cap); (r.uses ||= new Set()).add(`${st} shadow`);
        }
      }
    }
  }
  const nameOf = { color: (x) => `lit-${x.replace('#', '').toLowerCase()}`, fontSize: (x) => `lit-text-${String(x).replace('.', '_')}`, lineHeight: (x) => `lit-leading-${String(x).replace('.', '_')}`, radius: (x) => `lit-radius-${String(x).replace('.', '_')}`, spacing: (x) => `lit-space-${String(x).replace('.', '_')}`, borderWidth: (x) => `lit-border-${String(x).replace('.', '_')}`, letterSpacing: (x) => `lit-tracking-${String(x).replace('.', '_').replace('-', 'm')}`, fontWeight: (x) => `lit-font-weight-${x}` };
  const TYPE = { letterSpacing: 'dimension', color: 'color', fontSize: 'dimension', lineHeight: 'dimension', radius: 'dimension', spacing: 'dimension', borderWidth: 'dimension', fontWeight: 'fontWeight', fontFamily: 'fontFamily', shadow: 'shadow' };
  const nearestOf = (kind, value) => {
    if (kind === 'color') { const c = parseColor(value); let best = null; for (const [k, t] of Object.entries(tokens)) { if (EXTX(t).role !== 'color' || EXTX(t).painted || t.$provenance?.label !== 'measured') continue; /* the product's own tokens only: a kit or library name is no advice to the product team */ const d = parseColor(resolveLit(k)); if (!d) continue; const dist = Math.hypot(d.lab[0] - c.lab[0], d.lab[1] - c.lab[1], d.lab[2] - c.lab[2]); if (!best || dist < best.dist) best = { k, dist }; } return best ? `${best.k} (OKLab ${best.dist.toFixed(3)})` : 'none'; }
    const set = kind === 'lineHeight' ? [...lhPx] : [...(S[kind] || [])];
    return set.length ? String(set.reduce((b, y) => (Math.abs(y - value) < Math.abs(b - value) ? y : b), set[0])) : 'none';
  };
  const byKind = (kind) => [...counters.values()].filter((c) => c.kind === kind).sort((a, b) => b.nodes - a.nodes);
  for (const kind of ['color', 'fontSize', 'lineHeight', 'letterSpacing', 'radius', 'spacing', 'borderWidth', 'fontWeight', 'fontFamily', 'shadow']) {
    const list = byKind(kind);
    const off = list.filter((c) => c.nodes < 2); if (off.length) litOneOffs[kind] = off.map((c) => c.value).slice(0, 20);
    for (const c of list.filter((x) => x.nodes >= 2)) {
      // names must not depend on rank: a new capture (or a state now counted) reorders a ranked list, and a kit class
      // written against lit-shadow-1 silently starts painting another shadow — found when forced-state values joined
      // the count. A family is named by its first name, a shadow by a hash of its value.
      const key = kind === 'fontFamily' ? `lit-font-${String(c.value).split(',')[0].replace(/["']/g, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}` : kind === 'shadow' ? `lit-shadow-${createHash('sha1').update(String(c.value)).digest('hex').slice(0, 6)}` : nameOf[kind](c.value);
      if (tokens[key]) continue;
      // a value an approved name holds itself, painted (a library's role or palette step: ant-blue-6 is #1677FF), is not
      // named a second time; where the product paints it goes onto the names that hold it. A lit an approved token
      // still points at ({lit-…}) is made as before.
      if (kind === 'color') {
        const holders = Object.entries(tokens).filter(([, t]) => EXTX(t).painted && EXTX(t).role === 'color' && !/^\{/.test(String(t.$value)) && canonicalColor(String(t.$value)) === canonicalColor(c.value)).map(([k]) => k);
        if (holders.length && !waited.has(key)) {
          for (const k of holders) tokens[k].$provenance.evidence += `; the product paints it outside its own tokens on ${c.nodes} element(s) across ${c.screens.size} screen(s)${c.uses ? ` (as ${[...c.uses].join(', ')})` : ''}`;
          heldBy.push(key);
          continue;
        }
      }
      const role = kind === 'spacing' ? 'spacing' : kind;
      const val = c.exact ?? c.value;
      const css = kind === 'color' || kind === 'fontFamily' || kind === 'shadow' ? String(c.value) : kind === 'fontWeight' ? String(c.value) : `${val}px`;
      tokens[key] = {
        $id: `--${key}`, $type: TYPE[kind], $value: kind === 'color' ? canonicalColor(c.value) : val,
        $provenance: { label: 'derived', evidence: `a literal the product paints OUTSIDE its own token set: ${kind} ${c.value} on ${c.nodes} element(s) across ${c.screens.size} screen(s)${c.uses ? ` (as ${[...c.uses].join(', ')})` : ''}; nearest product token ${nearestOf(kind, c.value)}. Named for what it is; drift keeps reporting it.`,
          counters: { nodes: c.nodes, screens: c.screens.size, populationSelected: 'every visible element of the base-scheme captures (capture.mjs population), counted once per element, where the value is set rather than inherited' } },
        $extensions: { [EXT]: { cssVar: `--${key}`, role, painted: true, roleProvenance: { label: 'derived', evidence: 'the property it is painted in' }, twKey: key.replace(/^lit-(text|leading|tracking|radius|space|border|font-weight|font|shadow)-/, 'lit-'), css, ...(kind === 'color' ? { cssForm: 'color' } : {}), scopes: ({ radius: ['CORNER_RADIUS'], spacing: ['GAP'], fontSize: ['FONT_SIZE'] })[kind] ?? [] } },
      };
      litAdded.push(key);
    }
  }
}

// ---- the approved tokens that point at a painted value, now that the lit-* exist
{
  // in chains (a component colour → a role → a painted value): merge whatever now has its target, until nothing moves
  let waiting = [...deferredRefs];
  for (let moved = true; moved && waiting.length;) {
    moved = false;
    for (const d of [...waiting]) if (tokens[/^\{(.+)\}$/.exec(String(d.t.$value))[1]]) { mergeApproved(d.file, d.key, d.t); waiting = waiting.filter((x) => x !== d); moved = true; }
  }
  if (waiting.length) console.log(`  refused ${waiting.length} approved token(s) that point at no token: ${waiting.map(({ key, t }) => `${key} (points at ${String(t.$value).slice(1, -1)}, which is not a token)`).join(', ')}`);
}

// ---- the canvas: what <body> computes to on the captured screens (most common value), named by the token that
// holds it when one does. The kit's Storybook paints its stories on it, and the prototype its pages.
const resolveTok = (k, d = 0) => { const t = tokens[k]; const m = t && /^\{(.+)\}$/.exec(String(t.$value)); return m && d < 10 ? resolveTok(m[1], d + 1) : t?.$value; };
const docs = inScheme(base).map(({ cap }) => cap.documentStyle).filter(Boolean);
const most = (f) => { const n = new Map(); for (const d of docs) { const v = f(d); if (v) n.set(v, (n.get(v) || 0) + 1); } return [...n].sort((a, b) => b[1] - a[1])[0]?.[0]; };
const tokenForColour = (value, prefer) => {
  const c = parseColor(value); if (!c || c.a === 0) return null;
  // the canvas is a role: never a component's own colour (canon/components.tokens.json) nor a painted literal, even of
  // the same value — found when a table's hover colour, equal to the page's, became the Storybook's background
  const hits = Object.keys(tokens).filter((k) => tokens[k].$extensions[EXT].role === 'color' && !/components\.tokens\.json/.test(tokens[k].$extensions[EXT].roleProvenance?.evidence ?? '') && !/^lit-/.test(k)).filter((k) => { const x = parseColor(resolveTok(k)); return x && Math.abs(x.a - c.a) < 0.01 && Math.hypot(x.lab[0] - c.lab[0], x.lab[1] - c.lab[1], x.lab[2] - c.lab[2]) < 0.002; });
  return hits.sort((a, b) => prefer.findIndex((re) => re.test(a)) - prefer.findIndex((re) => re.test(b)) || a.length - b.length).find(() => true) ?? null;
};
const rank = (...res) => [...res, /./];
const RENDER_DEFAULTS = { textRendering: 'auto', fontSmoothing: 'auto', fontSynthesisWeight: 'auto', fontSynthesisStyle: 'auto', colorScheme: 'normal' };
let canvas;
if (docs.length) {
  const bg = most((d) => { const b = parseColor(d.body.backgroundColor); return b && b.a > 0 ? d.body.backgroundColor : d.html.backgroundColor; });
  const fg = most((d) => d.body.color);
  const family = most((d) => d.body.fontFamily);
  const size = most((d) => d.body.fontSize), lh = most((d) => d.body.lineHeight), weight = most((d) => d.body.fontWeight);
  const first = (f) => String(f ?? '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
  const famTok = Object.keys(tokens).find((k) => tokens[k].$extensions[EXT].role === 'fontFamily' && first(resolveTok(k)) === first(family)) ?? null;
  const sizeTok = Object.keys(tokens).find((k) => tokens[k].$extensions[EXT].role === 'fontSize' && resolveTok(k) === parseFloat(size)) ?? null;
  canvas = {
    label: 'measured',
    evidence: `computed style of <body> (of <html> where <body> is transparent), the most common value over ${docs.length} captured screen(s) in the ${base} scheme; a token is named where one holds exactly that value`,
    background: { value: bg, token: tokenForColour(bg, rank(/^(color-)?(background|bg|canvas)$/, /background|canvas|surface/)) },
    color: { value: fg, token: tokenForColour(fg, rank(/^(color-)?(foreground|text|fg)$/, /foreground|text/)) },
    fontFamily: { value: family, token: famTok },
    fontSize: { value: size, token: sizeTok },
    lineHeight: { value: lh }, fontWeight: { value: weight },
    // text rendering, from the captures that read it (the walker reads it since 2026-09-24); the browser's default is left out
    ...Object.fromEntries(Object.entries(RENDER_DEFAULTS).map(([k, d]) => [k, most((x) => x.body?.[k] ?? x.html?.[k])]).filter(([k, v]) => v && v !== RENDER_DEFAULTS[k]).map(([k, v]) => [k, { value: v }])),
  };
}

// ---- write, keeping what the scaffold and a person put in $meta
const doc = existsSync(P.canonFile) ? JSON.parse(readFileSync(P.canonFile, 'utf8')) : {};
const PLUGIN_HASH = (() => {
  const dir = join(import.meta.dirname);
  const files = [...readdirSync(dir).filter((f) => f.endsWith('.mjs')).map((f) => join(dir, f)), ...readdirSync(join(dir, 'lib')).filter((f) => f.endsWith('.mjs')).map((f) => join(dir, 'lib', f))].sort();
  const h = createHash('sha256');
  for (const f of files) h.update(f.slice(dir.length)).update('\0').update(readFileSync(f));
  return h.digest('hex').slice(0, 12);
})();
const PLUGIN_VERSION = JSON.parse(readFileSync(join(import.meta.dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version;
const roleCounts = {};
for (const t of Object.values(tokens)) roleCounts[t.$extensions[EXT].role] = (roleCounts[t.$extensions[EXT].role] || 0) + 1;
const screensCaptured = [...new Set(caps.map(({ cap }) => cap.meta.screen))];
const meta = doc.$meta || {};
meta.extractedAt = caps.map(({ cap }) => cap.meta.capturedAt).sort().at(-1);
meta.screens = { notReached: [], ...(meta.screens || {}), captured: caps.map(({ cap }) => ({ name: cap.meta.screen, url: cap.meta.finalUrl || cap.meta.requestedUrl, viewport: `${cap.meta.viewport.width}x${cap.meta.viewport.height}`, colorScheme: cap.meta.colorScheme || 'light' })) };
meta.instruments = [...(meta.instruments || []).filter((i) => !/walk_live|captures_to_canon|capture\.mjs|tokens\.mjs/.test(i.name)),
  { name: 'ds-from-app scripts/capture.mjs', version: PLUGIN_VERSION, hash: PLUGIN_HASH },
  { name: 'ds-from-app scripts/tokens.mjs', version: PLUGIN_VERSION, hash: PLUGIN_HASH }];
// The web fonts the product loads (capture.mjs fonts.*): font-service stylesheets, declared faces, the faces in use.
// The Workbench loads them from src/tokens/fonts.css, so text is measured in the product's own typefaces.
const FONT_SHEET = /\/fonts?[./]|family=|typekit|typography/i;
const uniqBy = (list, key) => [...new Map(list.map((x) => [key(x), x])).values()];
const xSheets = [...new Set(caps.flatMap(({ cap }) => cap.fonts?.crossOriginStylesheets ?? []))];
const isFontSheet = (h) => { try { const u = new URL(h); return FONT_SHEET.test(u.host + u.pathname + u.search); } catch { return FONT_SHEET.test(h); } };
const faceKey = (f) => JSON.stringify([f.family, f.weight, f.style, f.unicodeRange, f.src]);
const allFaces = caps.flatMap(({ cap }) => cap.fonts?.declared ?? []);
// a face's local copy (capture.mjs: assets/fonts/…), from whichever capture fetched it
const fontFaces = uniqBy(allFaces, faceKey).map((f) => ({ ...f, file: allFaces.find((x) => faceKey(x) === faceKey(f) && x.file)?.file }));
const fontsUsed = uniqBy(caps.flatMap(({ cap }) => (cap.fonts?.used ?? []).filter((f) => f.status === 'loaded')), (f) => JSON.stringify([f.family, f.weight, f.style])).map(({ family, weight, style }) => ({ family, weight, style }));
const fonts = xSheets.length || fontFaces.length || fontsUsed.length ? {
  stylesheets: xSheets.filter(isFontSheet),
  otherStylesheets: xSheets.some((h) => !isFontSheet(h)) ? { hrefs: xSheets.filter((h) => !isFontSheet(h)), note: 'cross-origin stylesheets that do not look like fonts — not loaded in the Workbench' } : undefined,
  faces: fontFaces,
  used: fontsUsed,
} : undefined;
meta.platform = {
  source: { url: caps[0].cap.meta.requestedUrl, capturedAt: meta.extractedAt, screens: screensCaptured, captures: caps.map(({ file }) => relative(P.spec, file)) },
  collections: Object.keys(roleCounts).sort(),
  counts: { ...roleCounts, total: Object.keys(tokens).length },
  rootFontSize: { px: rootPx.px, label: rootPx.measured ? 'measured' : 'decided', note: rootPx.consistent ? undefined : 'the captures disagree on the root font size' },
  // A scheme is a mode only when something differs in it: a dark capture that resolves every token as light means
  // the product has one theme, and the kit gets no switch that does nothing.
  modes: Object.values(tokens).some((t) => t.$extensions[EXT].modeStatus === 'varies') ? { scheme: { global: true, order: [base, ...schemes.filter((s) => s !== base)], base, counts: { varies: Object.values(tokens).filter((t) => t.$extensions[EXT].modeStatus === 'varies').length } } } : {},
  oneTheme: schemes.length > 1 && !Object.values(tokens).some((t) => t.$extensions[EXT].modeStatus === 'varies') ? `captured in ${schemes.join(' and ')}; every token resolves the same in each — one theme` : undefined,
  breakpoints: Object.keys(screenSize).length ? { collection: null, order: Object.keys(screenSize), baseMode: null, screenSize, note: bpTokens.length ? 'from the product\'s --breakpoint-* tokens' : 'from the @media (min-width) conditions of the product\'s stylesheets; names are Tailwind\'s for Tailwind\'s default widths, bp-<px> otherwise (derived)' } : undefined,
  excluded: Object.fromEntries(Object.entries(excluded).map(([why, names]) => [why, { count: names.length, examples: names.slice(0, 6) }])),
  spacingScale: multiplierAdded.length ? { count: multiplierAdded.length, why: 'Tailwind v4 spacing multipliers over the product\'s --spacing' } : undefined,
  derived: derivedAdded.length ? { count: derivedAdded.length, why: 'the product declares no token of these kinds and paints literals: tokens from what it paints, by frequency', oneOffs } : undefined,
  literals: litAdded.length ? { count: litAdded.length, why: 'values the product paints outside the tokens it declares (lit-*, derived, painted: true) — the kit may use them, drift still reports them', byKind: Object.fromEntries(['color', 'text', 'leading', 'tracking', 'radius', 'space', 'border', 'font-weight', 'font', 'shadow'].map((k) => [k, litAdded.filter((x) => x.startsWith(`lit-${k}-`) || (k === 'color' && /^lit-[0-9a-f]{6,8}$/.test(x))).length]).filter(([, n]) => n)), oneOffs: litOneOffs } : undefined,
  canvas,
  fonts,
  // What the product is built with (capture.mjs's in-page signals). The kit is React whatever the product is.
  stack: [...new Map(caps.flatMap(({ cap }) => cap.stack || []).map((x) => [x.name, x])).values()],
};
delete meta.figma;
// The schemes as a DTCG 2025.10 Resolver document, as the Figma adapter writes its modes: tokens.json holds the base
// scheme, each other scheme overrides only what varies.
const RESOLVER = join(P.spec, 'tokens.resolver.json');
const varying = Object.entries(tokens).filter(([, t]) => t.$modes);
if (varying.length) {
  meta.resolver = { path: 'tokens.resolver.json', authoritative: true, axes: ['scheme'] };
  const contexts = Object.fromEntries(meta.platform.modes.scheme.order.map((m) => [m, m === base ? [] : [Object.fromEntries(varying.filter(([, t]) => m in t.$modes).map(([k, t]) => [k, { $value: t.$modes[m], $type: t.$type }]))]]));
  writeFileSync(RESOLVER, JSON.stringify({
    $schema: 'https://www.designtokens.org/schemas/2025.10/resolver.json', version: '2025.10', name: `${P.name} tokens`,
    description: 'Colour schemes of the running product, as the browser resolved them under prefers-color-scheme. The base scheme lives in tokens.json; each other scheme overrides only the tokens that differ.',
    sets: { base: { description: `Every token, in the ${base} scheme.`, sources: [{ $ref: 'tokens.json#/tokens' }] } },
    modifiers: { scheme: { description: 'prefers-color-scheme, as captured', contexts, default: base } },
    resolutionOrder: [{ $ref: '#/sets/base' }, { $ref: '#/modifiers/scheme' }],
  }, null, 2) + '\n');
} else delete meta.resolver;
writeFileSync(P.canonFile, JSON.stringify({ $closure: doc.$closure, $meta: meta, tokens }, null, 2) + '\n');

const measuredRoles = [...roles.values()].filter((r) => r.label === 'measured').length;
console.log(`captures -> ${relative(process.cwd(), P.canonFile)}: ${Object.keys(tokens).length} tokens from ${caps.length} capture(s) of ${screensCaptured.length} screen(s), schemes ${schemes.join('/')}`);
console.log(`  roles: ${Object.entries(roleCounts).map(([k, v]) => `${k} ${v}`).join(' · ')} — ${measuredRoles} read from where the product spends them, ${props.size - measuredRoles} derived (through an alias, or from the value and name)`);
console.log(`  aliases: ${Object.values(tokens).filter((t) => /^\{/.test(String(t.$value))).length} · varying by scheme: ${Object.values(tokens).filter((t) => t.$extensions[EXT].modeStatus === 'varies').length} · breakpoints: ${Object.entries(screenSize).map(([k, v]) => `${k}=${v}`).join(' ') || 'none'} · root font ${rootPx.px}px${rootPx.measured ? '' : ' (not in the captures — assumed)'}`);
for (const [why, names] of Object.entries(excluded)) console.log(`  left out ${names.length}: ${why}${names.length ? ` — e.g. ${names.slice(0, 3).join(', ')}` : ''}`);
if (noClass.length) console.log(`  ${noClass.length} token(s) with no Tailwind class of their own, only their CSS variable: ${noClass.slice(0, 4).join('; ')}`);
if (heldBy.length) console.log(`  ${heldBy.length} painted colour(s) a library's name holds itself (ant-blue-6 is #1677FF) were not named again as lit-*`);
if (litAdded.length) console.log(`  literals: ${litAdded.length} value(s) painted outside the declared tokens on 2+ elements became lit-* tokens (derived, painted) — ${litAdded.filter((x) => /^lit-[0-9a-f]{6,8}$/.test(x)).length} colours, ${litAdded.length - litAdded.filter((x) => /^lit-[0-9a-f]{6,8}$/.test(x)).length} sizes/type; drift still reports every one${Object.keys(litOneOffs).length ? `; one-offs (painted once): ${Object.entries(litOneOffs).map(([k, v]) => `${k} ${v.length}`).join(', ')}` : ''}`);
if (derivedAdded.length) console.log(`  derived ${derivedAdded.length} token(s) from painted values — the product declares none of these kinds: ${[...new Set(derivedAdded.map((k) => k.replace(/-[^-]+$/, '')))].join(', ')}${Object.keys(oneOffs).length ? `; one-off values (painted once, not tokens): ${Object.entries(oneOffs).map(([k, v]) => `${k} ${v.length}`).join(', ')}` : ''}`);
if (multiplierAdded.length) console.log(`  added ${multiplierAdded.length} derived spacing steps (calc(var(--spacing) * k)) — Tailwind v4's multiplier scale`);
if (meta.platform.oneTheme) console.log(`  one theme: ${meta.platform.oneTheme} (no theme switch in the kit)`);
if (schemes.length === 1) console.log(`  one colour scheme captured (${base}). If the product has a dark theme, capture with --scheme dark; a theme switched by a class is not reached that way (see references/capture.md).`);
// A dark theme switched by a class or attribute is declared in the stylesheet even when no capture resolved it:
// name the selector, and the capture that would.
const darkSel = new Map();
// Any class or attribute that names dark: .dark, .theme-dark, [data-theme=dark], [data-mui-color-scheme="dark"], [data-bs-theme=dark] …
for (const p of props.values()) for (const d of p.declarations) { const m = /(\.[a-z-]*\bdark\b[a-z-]*|\[[a-z-]+=["']?dark["']?\])/i.exec(d.selector); if (m) darkSel.set(m[1], (darkSel.get(m[1]) || 0) + 1); }
// Properties declared ONLY under a dark selector were left out as scoped; they are the dark theme's own — count them.
for (const { cap } of caps) for (const cp of Object.values(cap.customProperties || {})) for (const d of cp.declarations || []) { if (cp.resolvedAtRoot != null) continue; const m = /(\.[a-z-]*\bdark\b[a-z-]*|\[[a-z-]+=["']?dark["']?\])/i.exec(d.selector); if (m) darkSel.set(m[1], (darkSel.get(m[1]) || 0) + 1); }
const varyCount = Object.values(tokens).filter((t) => t.$extensions[EXT].modeStatus === 'varies').length;
for (const [sel, n] of darkSel) if (!varyCount) {
  const how = sel.startsWith('.') ? `--root-class ${sel.slice(1)}` : `--root-attr ${sel.slice(1, -1).replace(/["']/g, '')}`;
  console.log(`  note: ${n} properties are redeclared under ${sel} and no capture resolved them — a dark theme exists. Capture it: capture.mjs … --scheme dark ${how}`);
}
if (meta.platform.stack.length) console.log(`  built with: ${meta.platform.stack.map((x) => x.name).join(', ')}${meta.platform.stack.some((x) => /Vue|Angular|Svelte|Nuxt/.test(x.name)) ? ' — the kit is React; say so in the README' : ''}`);
