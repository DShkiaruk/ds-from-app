import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startServer } from './server.mjs';
import { run, fixtureRepo, dropPngs, expectAll } from './helpers.mjs';

let S, dir, doc, T, X, is;
before(async () => {
  S = await startServer();
  dir = fixtureRepo('dsfa-tokens-');
  for (const scheme of ['light', 'dark']) {
    const r = await run('capture.mjs', '--url', S.url, '--screen', 'fixture', '--scheme', scheme, '--out', join(dir, 'baseline'), '--no-interact', '--settle', '300');
    assert.equal(r.status, 0, r.stderr);
  }
  dropPngs(join(dir, 'baseline'));
  const c2c = await run('tokens.mjs', dir);
  assert.equal(c2c.status, 0, c2c.stderr || c2c.stdout);
  doc = JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8'));
  doc.$meta.platform ??= {};
  T = doc.tokens;
  X = (k) => T[k]?.$extensions?.['co.eleken.ds'] ?? {};
  is = (k, role, label) => X(k).role === role && X(k).roleProvenance?.label === label;
});
after(() => { S.close(); rmSync(dir, { recursive: true, force: true }); });

test('the planted shapes of a product that declares its tokens', () => expectAll([
  [doc.$meta.instruments.every((i) => /^[0-9a-f]{12}$/.test(i.hash)), 'every instrument carries a 12-hex hash of the plugin scripts'],
  [T['color-primary']?.$value === 'oklch(0.55 0.2 260)', 'an oklch colour keeps its notation (color-primary)'],
  [T['color-primary']?.$modes?.dark === 'oklch(0.7 0.15 260)', 'the dark scheme is a mode of it'],
  [is('color-primary', 'color', 'measured') && X('color-primary').twKey === 'primary', '…its role is read from where it is spent'],
  [T['color-muted']?.$value === '{color-surface}' && !T['color-muted'].$modes && X('color-muted').modeStatus === 'follows-alias', 'an alias stays an alias, and follows its target across schemes'],
  [T.accent?.$value === '#0F172A' && X('accent').cssForm === 'hsl-channels' && is('accent', 'color', 'measured'), 'bare hsl channels spent inside hsl() are a colour, kept in channel form'],
  [T['color-border']?.$value === 'oklch(0 0 0 / 0.1)' || T['color-border']?.$value === 'oklch(0 0 0 / 10%)', `a translucent colour keeps its alpha (${T['color-border']?.$value})`],
  [T.radius?.$value === 10 && is('radius', 'radius', 'measured'), 'a radius spent only through the border-radius shorthand is measured as a radius (10px from 0.625rem)'],
  [T['radius-md']?.$value === 8 && X('radius-md').css === 'calc(var(--radius) - 2px)', 'calc() over rem resolves to px, and the relation is kept'],
  [T.spacing?.$value === 4 && T['spacing-4']?.$value === 16 && T['spacing-4'].$provenance.label === 'derived', 'one --spacing base gets the multiplier scale, labelled derived (only a person decides)'],
  [T['text-sm']?.$value === 14 && X('text-sm').twKey === 'sm', 'a --text-* size (14px)'],
  [Math.abs((T['text-sm--line-height']?.$value ?? 0) - 1.25 / 0.875) < 1e-4 && X('text-sm--line-height').role === 'lineHeight', 'a unitless calc() line-height ratio resolves to its number'],
  [T['font-weight-medium']?.$value === 500 && is('font-weight-medium', 'fontWeight', 'measured'), 'a font weight'],
  [X('shadow-sm').role === 'shadow' && /rgba\(0, 0, 0, 0\.05\)/.test(String(T['shadow-sm']?.$value)), 'a shadow'],
  [X('shadow-md')?.css === '0 4px 6px -1px rgba(0, 0, 0, .1), 0 2px 4px -2px rgba(0, 0, 0, .1)', `a token declared twice on :root takes the declaration the cascade applies (${X('shadow-md')?.css})`],
  [T['unused-gap']?.$value === 12 && is('unused-gap', 'spacing', 'derived'), 'declared and never spent: the role is derived, and says so'],
  [!T['tw-ring-color'] && doc.$meta.platform.excluded && Object.values(doc.$meta.platform.excluded).some((e) => e.examples.includes('--tw-ring-color')), 'a framework internal (--tw-*) is left out, and counted'],
  [!T['card-pad'], 'a property declared only inside .card is not a global token'],
  [X('card').role === 'color' && X('card').twKey === 'card', `a colour spent inside box-shadow more than as a background is still a colour (${X('card').role})`],
  [!/^\{/.test(String(T['font-sans']?.$value)) && /Inter/.test(String(T['font-sans']?.$value)), `a self-referencing --font-sans resolves to the family that wins (${T['font-sans']?.$value})`],
  [X('radius').twKey === 'lg' && /rounded-lg/.test(X('radius').twKeyEvidence ?? ''), `--radius gets the product's own class name, measured from rounded-lg (${X('radius').twKey})`],
  [T['spacing-4']?.$provenance.authoredName === undefined && T['spacing-4']?.$provenance.evidence.startsWith("the spacing multiplier scale of Tailwind v4 over the product's --spacing") && T['spacing-4']?.$extensions['co.eleken.ds'].roleProvenance.label === 'derived', 'a multiplier step says where the scale comes from, derived not decided, and claims no name from the product'],
  [JSON.stringify(doc.$meta.platform.breakpoints?.screenSize) === JSON.stringify({ md: 768, lg: 1024 }), 'breakpoints from the stylesheets\' @media min-widths'],
  [doc.$meta.platform.canvas?.background?.token === 'color-surface' && doc.$meta.platform.canvas?.color?.token === 'color-foreground', 'the canvas is <body>\'s own colours, named by their tokens'],
  [doc.$meta.platform.modes?.scheme?.counts?.varies >= 2 && !doc.$meta.platform.oneTheme, 'a product with a dark theme gets a scheme mode'],
  [T['lit-ff00aa']?.$extensions?.['co.eleken.ds']?.painted === true && T['lit-ff00aa'].$provenance.label === 'derived', 'a colour painted outside the declared tokens on 2 elements becomes lit-ff00aa (derived, painted)'],
  [!T['lit-radius-13'] && doc.$meta.platform.literals?.oneOffs?.radius?.includes(13), 'a radius off the declared scale painted once is a one-off, not a lit-* token'],
  [doc.$meta.platform.fonts?.stylesheets?.some((h) => /\/fonts\/fixture\.css$/.test(h)) && doc.$meta.platform.fonts.faces?.some((f) => /Fixture Sans/.test(f.family)), 'the web fonts the product loads: a font stylesheet and a declared face'],
  [doc.$meta.platform.fonts?.faces?.some((f) => /Fixture Sans/.test(f.family) && f.file === 'assets/fonts/fixture.woff2'), 'a declared face keeps the path of its local copy'],
  [doc.$meta.platform.stack !== undefined, 'the stack the product is built with is recorded'],
  [doc.$meta.instruments.some((i) => i.name === 'ds-from-app scripts/tokens.mjs' && /^\d+\.\d+\.\d+$/.test(i.version)), 'the instrument and the plugin version are recorded'],
]));

test('an approved value survives the build; overwriting a measured token, or an undated decision, is refused', async () => {
  mkdirSync(join(dir, 'canon'), { recursive: true });
  writeFileSync(join(dir, 'canon', 'decided.tokens.json'), JSON.stringify({
    'color-warning': { $type: 'color', $value: '#B45309', $provenance: { label: 'decided', evidence: 'approved by the designer 2026-09-23: the product has no warning colour' } },
    'color-primary': { $type: 'color', $value: '#000000', $provenance: { label: 'decided', evidence: 'an attempt to overwrite 2026-09-23' } },
    'color-undated': { $type: 'color', $value: '#123456', $provenance: { label: 'decided', evidence: 'no date' } },
  }));
  const again = await run('tokens.mjs', dir);
  const doc2 = JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8'));
  assert.equal(doc2.tokens['color-warning']?.$value, '#B45309');
  assert.equal(doc2.tokens['color-primary']?.$value, 'oklch(0.55 0.2 260)');
  assert.ok(!doc2.tokens['color-undated']);
  assert.match(again.stdout, /refused 2/);
  rmSync(join(dir, 'canon', 'decided.tokens.json'));
});

test('the component layer: a colour pointing at a role or a painted value is spent as that token; one pointing at no token is refused', async () => {
  const ev = { label: 'derived', evidence: 'derived 2026-09-24 from the kit (self-test)' };
  writeFileSync(join(dir, 'canon', 'components.tokens.json'), JSON.stringify({
    'button-primary-default-background': { $type: 'color', $value: '{color-primary}', $provenance: ev },
    'chip-off-default-background': { $type: 'color', $value: '{lit-ff00aa}', $provenance: ev },
    'button-ghost-default-label': { $type: 'color', $value: '{color-nothing}', $provenance: ev },
    'button-default-focus-ring': { $type: 'color', $value: '{color-ring}', $provenance: ev },
  }));
  writeFileSync(join(dir, 'canon', 'decided.tokens.json'), JSON.stringify({ 'color-ring': { $type: 'color', $value: '{lit-ff00aa}', twKey: 'ring-role', $provenance: ev } }));
  const comp = await run('tokens.mjs', dir);
  const C = JSON.parse(readFileSync(join(dir, 'tokens.json'), 'utf8')).tokens;
  const cssOf = (k) => C[k]?.$extensions?.['co.eleken.ds']?.css;
  expectAll([
    [cssOf('button-default-focus-ring') === 'var(--color-ring)' && cssOf('color-ring') === 'var(--lit-ff00aa)', `a chain merges link by link (${cssOf('button-default-focus-ring')})`],
    [cssOf('button-primary-default-background') === 'var(--color-primary)' && cssOf('chip-off-default-background') === 'var(--lit-ff00aa)' && !C['button-ghost-default-label'] && /button-ghost-default-label \(points at color-nothing/.test(comp.stdout), 'a role or a painted value is spent as that token; one pointing at no token is refused'],
  ]);
  rmSync(join(dir, 'canon', 'components.tokens.json'));
  rmSync(join(dir, 'canon', 'decided.tokens.json'));
});

test('a product with no dark theme gets no scheme mode', async () => {
  const one = fixtureRepo('dsfa-one-');
  try {
    for (const scheme of ['light', 'dark']) await run('capture.mjs', '--url', `${S.url}one-theme`, '--screen', 'fixture', '--scheme', scheme, '--out', join(one, 'baseline'), '--no-interact', '--settle', '300');
    dropPngs(join(one, 'baseline'));
    await run('tokens.mjs', one);
    const oneDoc = JSON.parse(readFileSync(join(one, 'tokens.json'), 'utf8'));
    assert.ok(!oneDoc.$meta.platform.modes?.scheme);
    assert.match(oneDoc.$meta.platform.oneTheme ?? '', /one theme/);
  } finally { rmSync(one, { recursive: true, force: true }); }
});

test('a theme switched by a class on <html>: named when missed, a mode when captured with --root-class', async () => {
  // the counterexample first: a dark capture without the class resolves light values — the build must say a dark theme exists
  const missed = fixtureRepo('dsfa-class-missed-');
  const caught = fixtureRepo('dsfa-class-caught-');
  try {
    await run('capture.mjs', '--url', `${S.url}class-theme`, '--screen', 'fixture', '--out', join(missed, 'baseline'), '--no-interact', '--settle', '300');
    await run('capture.mjs', '--url', `${S.url}class-theme`, '--screen', 'fixture', '--scheme', 'dark', '--out', join(missed, 'baseline'), '--no-interact', '--settle', '300');
    dropPngs(join(missed, 'baseline'));
    const m = await run('tokens.mjs', missed);
    assert.match(m.stdout, /a dark theme exists\. Capture it: capture\.mjs … --scheme dark --root-class dark/);
    assert.equal(JSON.parse(readFileSync(join(missed, 'tokens.json'), 'utf8')).tokens['color-primary']?.$modes?.dark, undefined);

    await run('capture.mjs', '--url', `${S.url}class-theme`, '--screen', 'fixture', '--out', join(caught, 'baseline'), '--no-interact', '--settle', '300');
    const d = await run('capture.mjs', '--url', `${S.url}class-theme`, '--screen', 'fixture', '--scheme', 'dark', '--root-class', 'dark', '--out', join(caught, 'baseline'), '--no-interact', '--settle', '300');
    assert.equal(d.status, 0, d.stderr);
    dropPngs(join(caught, 'baseline'));
    await run('tokens.mjs', caught);
    assert.equal(JSON.parse(readFileSync(join(caught, 'tokens.json'), 'utf8')).tokens['color-primary']?.$modes?.dark, 'oklch(0.7 0.15 260)', 'captured with the class, the dark value is a mode');
  } finally {
    rmSync(missed, { recursive: true, force: true });
    rmSync(caught, { recursive: true, force: true });
  }
});

test('a product with no custom properties: its tokens are derived from what it paints', async () => {
  const lit = fixtureRepo('dsfa-literal-');
  try {
    await run('capture.mjs', '--url', `${S.url}literal`, '--screen', 'dashboard', '--out', join(lit, 'baseline'), '--no-interact', '--settle', '300');
    dropPngs(join(lit, 'baseline'));
    await run('tokens.mjs', lit);
    const L = JSON.parse(readFileSync(join(lit, 'tokens.json'), 'utf8')), LT = L.tokens;
    const val = (k) => LT[k]?.$value;
    const fgs = Object.keys(LT).filter((k) => k.startsWith('fg-')).map(val);
    expectAll([
      [Object.values(LT).length > 0 && Object.values(LT).every((t) => t.$provenance.label === 'derived' && t.$provenance.counters?.nodes >= 2), `every token is derived, with counters (${Object.keys(LT).length})`],
      [Object.keys(LT).filter((k) => k.startsWith('surface-')).map(val).includes('#FFFFFF') && Object.keys(LT).filter((k) => k.startsWith('surface-')).map(val).includes('#1976D2'), 'the surfaces are the page white and the brand blue'],
      [fgs.includes('#000000DE') && fgs.includes('#00000099') && fgs.includes('#FFFFFF'), `the text colours are the body's .87 black, the muted .6 and white (${fgs.join(', ')})`],
      [!LT['spacing-2px'], 'a value one element paints on two sides is still one element'],
      [val('radius-1') === 4, 'the 4px radius painted on cards and buttons is a token'],
      [val('spacing-16px') === 16 && val('spacing-6px') === 6, 'the paddings painted more than once are tokens'],
      [val('text-14px') === 14 && val('font-weight-500') === 500, 'a font size and a weight painted on several elements are tokens'],
      // R28.7: a product that declares no letter-spacing still paints one — a derived token on 2+ elements, a one-off on one
      [val('tracking-m0_24px') === -0.24 && LT['tracking-m0_24px']?.$extensions['co.eleken.ds'].role === 'letterSpacing' && LT['tracking-m0_24px'].$provenance.counters?.nodes === 2, `the letter-spacing painted on two elements is a derived token (${Object.keys(LT).filter((k) => k.startsWith('tracking')).join(', ') || 'none'})`],
      [!Object.keys(LT).some((k) => /tracking-1_5/.test(k)) && L.$meta.platform.derived?.oneOffs?.letterSpacing?.includes(1.5), 'a letter-spacing painted once is a one-off, listed, not a token'],
      [!Object.values(LT).some((t) => /FF5722/i.test(String(t.$value))), 'a colour painted once (the orange badge) is a one-off, not a token'],
      [L.$meta.platform.derived?.oneOffs?.surface?.some((v) => /255, 87, 34/.test(v)), 'the one-off is listed'],
    ]);
  } finally { rmSync(lit, { recursive: true, force: true }); }
});
