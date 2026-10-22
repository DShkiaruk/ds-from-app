#!/usr/bin/env node
/**
 * capture.mjs — capture one screen of a running product, once, completely.
 * (Moved from ds-extract-method scripts/walk_live.mjs @ebaa66f; additions: the browser launcher, the sign-in warning.)
 *
 * The capture is the artefact. Every later question (what is a token, what is a
 * component, what changed) is answered by a pure function over these JSON files,
 * so a changed rule never means re-crawling a product.
 *
 * What one capture records, per visible element:
 *   · where it is        selector path, tag, role, aria, data-state, trimmed classes
 *   · how big it is      rect + area + share of viewport + above-the-fold flag
 *   · what it renders    a fixed property list, read from getComputedStyle
 *   · what it inherits   whether each value differs from the parent's (so an
 *                        inherited colour is not counted as a deliberate choice)
 * Plus, per screen: declared custom properties, the stylesheets the page itself
 * could NOT read, @media/@container conditions reachable from the page, fonts
 * actually used vs declared, and the interaction states of a sample of controls
 * captured two different ways, each labelled with the mechanism that produced it.
 *
 *   node scripts/capture.mjs --url https://app.example.com/dashboard --screen dashboard --out runs/example
 *   node scripts/capture.mjs --url ... --storage ~/.ds-from-app/sessions/<slug>.auth.json --viewport 1440x900 --scheme dark
 *   node scripts/capture.mjs --url ... --scheme dark --root-class dark      (a theme switched by a class on <html>)
 *   (read-only by default: writes blocked, no real input. --interact is opt-in real input;
 *    --allow-writes lifts the write block — only on a fixture or a sandbox the designer confirmed in words)
 *   node scripts/capture.mjs --url ... --click 'button[aria-haspopup="menu"]' --screen list--menu-open   (behind a click)
 *   node scripts/capture.mjs --login-url https://app.example.com/sign-in --save-storage ~/.ds-from-app/sessions/<slug>.auth.json [--until-url '/dashboard']
 *   node scripts/capture.mjs --url https://app.example.com/home --click '<nav item>' --as-screen --screen orders
 *        (a SCREEN reached by clicks at a URL other screens share — a single-URL app — not a surface on top of one)
 *
 * Exit codes: 0 captured · 2 navigation failed · 3 nothing visible captured · 4 redirected to another screen.
 */

import { launch, headlessFor } from './lib/browser.mjs';
import { openWindow, connectWindow, closeWindow, signedInTab, rememberTab, lockWindow, emulate, fullShot } from './lib/window.mjs';
import { mkdirSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { UNSAFE, REVEAL, REVEAL_ICON, OUTLIVING_WRITES, clickFailure, dismiss, blockWrites, blockedSummary, socketSummary, platformSummary, looksLikeBotCheck, BOT_CHECK_ADVICE } from './lib/safety.mjs';
import { readSessionStorage, restoreSession } from './lib/session.mjs';

// ── properties we read. Fixed on purpose: a capture whose property list drifts
// cannot be diffed against an earlier one. Add to the END of this list only.
const PROPS = [
  // colour
  'color', 'backgroundColor', 'backgroundImage',
  'borderTopColor', 'borderRightColor', 'borderBottomColor', 'borderLeftColor',
  'outlineColor', 'fill', 'stroke', 'accentColor', 'caretColor', 'textDecorationColor',
  // typography
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
  'textTransform', 'textAlign', 'fontVariantNumeric', 'whiteSpace', 'textOverflow',
  // box
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'rowGap', 'columnGap',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
  'borderTopLeftRadius', 'borderTopRightRadius', 'borderBottomRightRadius', 'borderBottomLeftRadius',
  'boxShadow', 'outlineWidth', 'outlineOffset', 'opacity',
  // layout
  'display', 'position', 'flexDirection', 'alignItems', 'justifyContent', 'flexWrap',
  'gridTemplateColumns', 'width', 'height', 'minHeight', 'maxWidth', 'overflowX', 'overflowY',
  'zIndex', 'containerType', 'aspectRatio',
  // motion + affordance
  'transitionProperty', 'transitionDuration', 'transitionTimingFunction', 'transitionDelay',
  'animationName', 'animationDuration', 'animationTimingFunction', 'animationIterationCount',
  'cursor', 'pointerEvents',
  // line styles (added later, at the end): a focus ring or a border that is dashed / dotted is not a solid one
  'outlineStyle', 'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
];

// properties that inherit, so a match with the parent means "not chosen here"
const INHERITED = new Set([
  'color', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
  'textTransform', 'textAlign', 'whiteSpace', 'cursor', 'fontVariantNumeric', 'accentColor',
]);

const STATE_PSEUDO = ['hover', 'focus', 'focus-visible', 'active'];
const INTERACTIVE = [
  'button', 'a[href]', 'input', 'select', 'textarea', 'summary',
  '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]', '[role="option"]',
  '[role="checkbox"]', '[role="radio"]', '[role="switch"]', '[tabindex]:not([tabindex="-1"])',
].join(',');

// ── args ─────────────────────────────────────────────────────────────────────
function args(argv) {
  const o = { viewport: '1440x900', scheme: 'light', out: 'runs/latest', screen: null,
              url: null, storage: null, saveStorage: null, loginUrl: null,
              maxStateSamples: 40, settle: 1200, reducedMotion: true, interact: false, blockWrites: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--url') o.url = next();
    else if (a === '--screen') o.screen = next();
    else if (a === '--out') o.out = next();
    else if (a === '--viewport') o.viewport = next();
    else if (a === '--scheme') o.scheme = next();
    else if (a === '--storage') o.storage = next();
    else if (a === '--save-storage') o.saveStorage = next();
    else if (a === '--login-url') o.loginUrl = next();
    else if (a === '--until-url') o.untilUrl = next();
    else if (a === '--headless') o.headless = true;
    // One window for the whole run (lib/window.mjs): sign in with --keep-open <name> instead of --save-storage, work in
    // that window with --attach <name>, close it with --close <name>.
    else if (a === '--keep-open') o.keepOpen = next();
    else if (a === '--attach') o.attach = next();
    else if (a === '--close') o.close = next();
    // With --attach: no page load at all. The capture starts from the tab as it is and reaches the surface by its
    // --click chain; a click that would load another page is held (a product that signs out on every page load).
    else if (a === '--here') o.here = true;
    // what the product leaves over the page, closed by its own close control whenever one is visible (lib/safety.mjs
    // dismiss), repeatable: --dismiss before the clicks (a window an earlier run left open, a back button to the
    // screen's start); --dismiss-late before the screenshot (a message that comes late, over the surface) — never the
    // surface the clicks opened, so it is a flag of its own.
    else if (a === '--dismiss') (o.dismiss ||= []).push(next());
    else if (a === '--dismiss-late') (o.dismissLate ||= []).push(next());
    else if (a === '--max-state-samples') o.maxStateSamples = Number(next());
    else if (a === '--settle') o.settle = Number(next());
    else if (a === '--motion') o.reducedMotion = false;   // opt OUT of reduced motion
    else if (a === '--interact') o.interact = true;       // opt-in real input: NOT read-only (it can submit, navigate, mutate)
    else if (a === '--no-interact') o.interact = false;   // the default: forced pseudo-classes only, never touches the product
    // A theme switched by a class or attribute on <html> (next-themes, .dark) rather than by prefers-color-scheme:
    // set it before the walk, and it is recorded with the capture. Use with --scheme dark so the file says so.
    else if (a === '--root-class') (o.rootClass ||= []).push(next());
    else if (a === '--root-attr') (o.rootAttr ||= []).push(next());
    // Reach a surface behind a click (a menu, a dialog, a tab) before the walk. Repeatable, in order. A click that
    // could change the product is refused: a submit control, or one whose text reads like an action on data.
    else if (a === '--click') (o.clicks ||= []).push(next());
    else if (a === '--allow-unsafe-click') o.allowUnsafeClick = true;
    // A control that unmasks a secret (REVEAL) is refused even with --allow-unsafe-click: the capture would hold it.
    else if (a === '--allow-reveal') o.allowReveal = true;
    // The clicks lead to another SCREEN of a product whose screens share one URL (its menu swaps the page in place),
    // not to a surface on top of this one. flows.mjs and the Workbench repo's tools/parity.mjs treat such a capture as a screen.
    else if (a === '--as-screen') o.asScreen = true;
    // abort every request that is not GET/HEAD/OPTIONS (lib/safety.mjs): nothing the walk presses can write
    else if (a === '--block-writes') o.blockWrites = true;   // the default
    else if (a === '--allow-writes') o.blockWrites = false;  // opt-out: only on a fixture or a sandbox
    // with --block-writes: the non-GET requests that are READS (a regex over the path) — they go through
    else if (a === '--reads') o.reads = next();
    else if (a === '--socket-reads') o.socketReads = next();
    else if (a === '--allow-redirect') o.allowRedirect = true;
  }
  return o;
}

// ── the in-page walk. Everything here runs in the page, so it must be
// self-contained: no imports, no closures over node scope.
const PAGE_WALK = ({ props, inherited }) => {
  const out = {
    elements: [],
    customProperties: {},
    varUsage: {},
    unreadableStylesheets: 0,
    readableStylesheets: 0,
    media: [],
    container: [],
    supports: [],
    layers: [],
    fontFacesDeclared: [],
    crossOriginStylesheets: [],
    fontsUsed: [],
    shadowRoots: 0,
    skipped: { invisible: 0, zeroSize: 0, offscreenAbove: 0 },
    documentTitle: document.title,
    scrollHeight: document.documentElement.scrollHeight,
  };

  const vw = window.innerWidth, vh = window.innerHeight;
  const viewportArea = Math.max(1, vw * vh);

  // ---- declared custom properties, authored vs resolved -------------------
  const rootCS = getComputedStyle(document.documentElement);
  const seenProp = new Map();
  const walkRules = (rules, sheetHref) => {
    for (const rule of rules) {
      if (rule.style) {
        // Where each custom property is SPENT, and inside what: "hsl(var(--primary))" in background-color says
        // what --primary is for, from the product's own stylesheet rather than from its name. Read from the
        // declaration TEXT: a shorthand holding var() ("border-radius: var(--r)") leaves its longhands empty in
        // CSSOM, and a per-property read saw no radius at all.
        for (const decl of (rule.style.cssText || '').matchAll(/(?:^|;)\s*(--[A-Za-z0-9_-]+|[a-z-]+)\s*:\s*([^;]*)/g)) {
          const [, prop0, value] = decl;
          if (!value.includes('var(--')) continue;
          for (const m of value.matchAll(/(?:([a-z-]+)\()?\s*var\(\s*(--[A-Za-z0-9_-]+)/g)) {
            const u = (out.varUsage[m[2]] ||= { rules: 0, props: {}, wrappers: {} });
            u.rules++;
            const prop = prop0.startsWith('--') ? '(custom property)' : prop0;
            u.props[prop] = (u.props[prop] || 0) + 1;
            const w = m[1] && m[1] !== 'var' ? m[1] : 'bare';
            u.wrappers[w] = (u.wrappers[w] || 0) + 1;
          }
        }
        for (let i = 0; i < rule.style.length; i++) {
          const p = rule.style[i];
          if (!p.startsWith('--')) continue;
          const authored = rule.style.getPropertyValue(p).trim();
          const key = p;
          if (!seenProp.has(key)) seenProp.set(key, { name: p, declarations: [] });
          seenProp.get(key).declarations.push({
            authored,
            selector: (rule.selectorText || rule.conditionText || '?').slice(0, 160),
            sheet: sheetHref || 'inline',
          });
        }
      }
      if (rule.media) out.media.push(rule.media.mediaText);
      if (rule.conditionText && rule.constructor?.name === 'CSSContainerRule') out.container.push(rule.conditionText);
      if (rule.constructor?.name === 'CSSSupportsRule') out.supports.push(rule.conditionText);
      if (rule.constructor?.name === 'CSSLayerBlockRule' && rule.name) out.layers.push(rule.name);
      if (rule.constructor?.name === 'CSSFontFaceRule' && out.fontFacesDeclared.length < 50) {
        // src urls are made absolute against the sheet that declares them (the document, for an inline sheet): the
        // Workbench loads the same file from its own origin
        const base = sheetHref || document.URL;
        const abs = (src) => src.replace(/url\(\s*(["']?)(.*?)\1\s*\)/g, (m, q, u) => { try { return /^data:/i.test(u) ? m : `url("${new URL(u, base).href}")`; } catch { return m; } });
        out.fontFacesDeclared.push({
          family: rule.style.getPropertyValue('font-family'),
          weight: rule.style.getPropertyValue('font-weight'),
          style: rule.style.getPropertyValue('font-style'),
          unicodeRange: rule.style.getPropertyValue('unicode-range'),
          src: abs(rule.style.getPropertyValue('src')),
        });
      }
      if (rule.cssRules) { try { walkRules(rule.cssRules, sheetHref); } catch { /* nested cross-origin */ } }
    }
  };
  for (const sheet of document.styleSheets) {
    try { walkRules(sheet.cssRules, sheet.href); out.readableStylesheets++; }
    catch { out.unreadableStylesheets++; if (sheet.href) out.crossOriginStylesheets.push(sheet.href); }   // CSSOM: SecurityError on a cross-origin sheet
  }
  // Each custom property resolved BY THE BROWSER, as the kinds of value it could be: a colour (also as rgb()/hsl()
  // channels, the shape shadcn on Tailwind 3 uses), a length in px (calc and rem included), a font weight, a
  // family, a shadow. A value the browser rejects for a kind stays null — the kind is not guessed from the name.
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:0';
  document.body.appendChild(probe);
  const asKind = (value, cssProp, valid) => {
    if (!value || !CSS.supports(cssProp, value)) return null;
    probe.style.setProperty(cssProp, value);
    const v = getComputedStyle(probe).getPropertyValue(cssProp);
    probe.style.removeProperty(cssProp);
    return valid ? (valid(v) ? v : null) : v;
  };
  for (const [name, rec] of seenProp) {
    const resolved = rootCS.getPropertyValue(name).trim() || null;
    const computed = resolved ? {
      color: asKind(resolved, 'color'),
      rgbChannels: /^[\d.]+%?\s+[\d.]+%?\s+[\d.]+%?(\s*\/\s*[\d.]+%?)?$/.test(resolved) ? asKind(`rgb(${resolved})`, 'color') : null,
      hslChannels: /^[\d.]+(deg)?\s+[\d.]+%\s+[\d.]+%(\s*\/\s*[\d.]+%?)?$/.test(resolved) ? asKind(`hsl(${resolved})`, 'color') : null,
      length: asKind(resolved, 'margin-left', (v) => /^-?[\d.]+px$/.test(v)),
      fontWeight: asKind(resolved, 'font-weight'),
      fontFamily: /[a-z]/i.test(resolved) && !/^[\d.]/.test(resolved) ? asKind(resolved, 'font-family') : null,
      shadow: /\d/.test(resolved) && !/^[\d.]+(px|rem|em)?$/.test(resolved) ? asKind(resolved, 'box-shadow', (v) => v !== 'none') : null,
      duration: /^[\d.]+m?s$/.test(resolved) ? resolved : null,
      // a unitless number (a line-height ratio, a weight), calc() included — flex-grow takes any number >= 0
      number: asKind(resolved, 'flex-grow'),
    } : null;
    out.customProperties[name] = {
      resolvedAtRoot: resolved,
      computed,
      declarations: rec.declarations.slice(0, 12),
      declarationCount: rec.declarations.length,
    };
  }
  probe.remove();
  out.rootFontSize = rootCS.fontSize;
  // The canvas the product paints on: what <html> and <body> compute to (they are outside the element walk, which
  // starts under <body>). The kit's Storybook renders its stories on the same canvas.
  // how text is rendered is part of the canvas too: kerning and ligatures (text-rendering) change a text's width,
  // font-synthesis whether a missing weight is faked, color-scheme how form controls and scrollbars are drawn
  const docStyle = (el) => { const c = getComputedStyle(el); return { backgroundColor: c.backgroundColor, color: c.color, fontFamily: c.fontFamily, fontSize: c.fontSize, lineHeight: c.lineHeight, fontWeight: c.fontWeight, letterSpacing: c.letterSpacing, textRendering: c.textRendering, fontSmoothing: c.webkitFontSmoothing, fontSynthesisWeight: c.fontSynthesisWeight, fontSynthesisStyle: c.fontSynthesisStyle, colorScheme: c.colorScheme }; };
  out.documentStyle = { html: docStyle(document.documentElement), body: docStyle(document.body) };
  // Every distinct inline <svg> on the screen, as markup — the product's icons, for the kit (platform_icons.mjs).
  // Keyed by the markup itself; capped so a chart-heavy page cannot blow the capture up. Counted, not silent.
  const svgs = new Map();
  let svgSkipped = 0;
  for (const svg of document.querySelectorAll('svg')) {
    if (svg.closest('svg') !== svg) continue; // nested svg: part of its parent
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height || r.width > 96 || r.height > 96) { svgSkipped++; continue; } // an icon is small; a chart is not
    let markup = svg.outerHTML;
    // A sprite reference (<use href="#icon-x">) holds no drawing of its own: inline the symbol it points at when it
    // is in this document; a symbol in another file is fetched after the walk (svgExternal).
    const use = svg.querySelector('use');
    const ref = use && (use.getAttribute('href') || use.getAttribute('xlink:href'));
    if (ref && ref.startsWith('#')) {
      const sym = document.getElementById(ref.slice(1));
      if (sym) markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sym.getAttribute('viewBox') || svg.getAttribute('viewBox') || '0 0 24 24'}" data-sprite="${ref}">${sym.innerHTML}</svg>`;
    } else if (ref) { (out.svgExternal ||= []).push({ ref, classes: (svg.getAttribute('class') || '').trim(), label: svg.getAttribute('aria-label') || svg.closest('[aria-label]')?.getAttribute('aria-label') || null, size: `${Math.round(r.width)}x${Math.round(r.height)}` }); continue; }
    if (markup.length > 12000) { svgSkipped++; continue; }
    const cls = (svg.getAttribute('class') || '').trim();
    const key = markup.replace(/\s(class|style|width|height|aria-[a-z-]+|data-[a-z-]+|id)="[^"]*"/g, '');
    // Its name, as the product gives one: its own label, the labelled control around it, or the short text of the
    // control it sits in ("Home" beside a house) — in that order.
    const ctl = svg.closest('a, button, [role="button"], [role="menuitem"], [role="tab"], li');
    const ctlText = ctl ? (ctl.innerText || '').trim().split('\n')[0].slice(0, 24) : '';
    const label = svg.getAttribute('aria-label') || svg.closest('[aria-label]')?.getAttribute('aria-label') || (ctlText && ctlText.length >= 2 ? ctlText : null);
    const rec = svgs.get(key) || { markup, classes: cls, label, size: `${Math.round(r.width)}x${Math.round(r.height)}`, count: 0 };
    rec.count++;
    svgs.set(key, rec);
    if (svgs.size >= 400) break;
  }
  out.svgs = [...svgs.values()];
  // Drawings: a visible inline <svg> that is not an icon (an icon = both sides <= 48 px, or already in svgs): a frame, an
  // illustration, a divider. Recorded once with its box, its sanitized markup and the computed stroke / fill of each shape,
  // so the kit reproduces it as is. Capped at 100; markup over 20 KB is cut and marked truncated.
  const drawings = new Map();
  const SHAPES = 'rect, circle, ellipse, line, polyline, polygon, path';
  for (const svg of document.querySelectorAll('svg')) {
    if (svg.closest('svg') !== svg) continue;
    const r = svg.getBoundingClientRect();
    const scs = getComputedStyle(svg);
    if (!r.width || !r.height || scs.display === 'none' || scs.visibility === 'hidden') continue;
    if (r.width <= 48 && r.height <= 48) continue;
    const copy = svg.cloneNode(true);
    for (const n of copy.querySelectorAll('script, foreignObject')) n.remove();
    for (const n of [copy, ...copy.querySelectorAll('*')]) {
      for (const a of [...n.attributes]) {
        const v = a.value.trim();
        if (/^on/i.test(a.name) || (/^(xlink:)?href$/i.test(a.name) && !v.startsWith('#'))) n.removeAttribute(a.name);
      }
    }
    let markup = copy.outerHTML;
    const truncated = markup.length > 20000;
    if (truncated) markup = markup.slice(0, 20000);
    if (svgs.size && [...svgs.values()].some((v) => v.markup === svg.outerHTML)) continue;
    if (drawings.has(markup)) { drawings.get(markup).count++; continue; }
    if (drawings.size >= 100) break;
    const shapes = [...svg.querySelectorAll(SHAPES)].slice(0, 40).map((sh) => { const c = getComputedStyle(sh); return { tag: sh.tagName.toLowerCase(), stroke: c.stroke, 'stroke-width': c.strokeWidth, 'stroke-dasharray': c.strokeDasharray, fill: c.fill }; });
    drawings.set(markup, { box: { width: Math.round(r.width), height: Math.round(r.height) }, classes: (svg.getAttribute('class') || '').trim(), label: svg.getAttribute('aria-label') || null, markup, ...(truncated ? { truncated: true } : {}), shapes, count: 1 });
  }
  out.drawings = [...drawings.values()];
  out.svgSkipped = svgSkipped;
  // Icons drawn as <img src="….svg"> (fetched after the walk), and icon fonts: a glyph font renders a ligature or a
  // pseudo-element, not markup — recorded by family and glyph name, since no SVG exists to copy.
  out.svgImages = [...document.querySelectorAll('img')].filter((im) => { const r = im.getBoundingClientRect(); return r.width && r.width <= 64 && r.height <= 64 && /\.svg(\?|#|$)/i.test(im.currentSrc || im.src); }).slice(0, 200).map((im) => ({ src: im.currentSrc || im.src, label: im.alt || im.getAttribute('aria-label') || null, size: `${Math.round(im.getBoundingClientRect().width)}x${Math.round(im.getBoundingClientRect().height)}` }));
  const fonts = {};
  for (const el of document.querySelectorAll('i, span, em')) {
    const fam = getComputedStyle(el).fontFamily;
    if (!/material|icon|awesome|glyph|fontello|remix/i.test(fam)) continue;
    const r = el.getBoundingClientRect(); if (!r.width || r.width > 64) continue;
    const name = (el.textContent || '').trim() || [...el.classList].find((c) => /^(fa|ri|icon|bi|mdi)-/.test(c)) || '(pseudo-element)';
    const f = (fonts[fam.split(',')[0].replace(/["']/g, '').trim()] ||= {}); f[name] = (f[name] || 0) + 1;
  }
  out.iconFonts = fonts;
  // What the product is built with, from what the page itself carries — each signal is evidence, not a guess.
  const has = (sel) => { try { return document.querySelector(sel) != null; } catch { return false; } };
  const anyEl = [...document.querySelectorAll('body *')].slice(0, 400);
  const keysLike = (re) => anyEl.some((el) => Object.keys(el).some((k) => re.test(k)));
  const scripts = [...document.scripts].map((x) => x.src).filter(Boolean);
  const signals = [];
  if (keysLike(/^__react(Fiber|Props|Container)\$/)) signals.push(['React', 'elements carry __reactFiber$ keys']);
  if (window.__NEXT_DATA__ || scripts.some((u) => u.includes('/_next/')) || has('#__next')) signals.push(['Next.js', window.__NEXT_DATA__ ? '__NEXT_DATA__' : 'scripts under /_next/']);
  if (anyEl.some((el) => el.__vue_app__ || el.__vueParentComponent || el.__vue__) || has('[data-v-app]')) signals.push(['Vue', 'elements carry __vue_app__ / __vueParentComponent']);
  if (window.__NUXT__ || has('#__nuxt')) signals.push(['Nuxt', window.__NUXT__ ? '__NUXT__' : '#__nuxt']);
  if (has('[ng-version]')) signals.push(['Angular', `ng-version ${document.querySelector('[ng-version]').getAttribute('ng-version')}`]);
  if (anyEl.some((el) => [...el.classList].some((c) => /^svelte-[a-z0-9]+$/.test(c)))) signals.push(['Svelte', 'svelte-* scoped classes']);
  if (has('[id^="base-ui-"]') || has('[data-starting-style]')) signals.push(['Base UI', 'base-ui-* ids / data-starting-style']);
  if (has('[data-radix-popper-content-wrapper], [data-radix-collection-item], [id^="radix-"]')) signals.push(['Radix', 'radix-* ids / data-radix-*']);
  if (has('[data-slot]')) signals.push(['shadcn/ui', 'data-slot attributes']);
  if (has('[class*="Mui"]')) signals.push(['MUI', 'Mui* class names']);
  if (has('[class*="chakra-"]')) signals.push(['Chakra UI', 'chakra-* class names']);
  if (has('[class*="ant-"]')) signals.push(['Ant Design', 'ant-* class names']);
  if (has('[class*="lucide"]')) signals.push(['Lucide icons', 'lucide-* classes on svg']);
  out.stack = signals.map(([name, evidence]) => ({ name, evidence }));

  // fonts the page actually loaded and used
  try {
    for (const f of document.fonts) {
      out.fontsUsed.push({ family: f.family, weight: f.weight, style: f.style, status: f.status });
    }
  } catch { /* no-op */ }

  // ---- element walk, shadow DOM included ---------------------------------
  const selectorPath = (el) => {
    const parts = [];
    let node = el, depth = 0;
    while (node && node.nodeType === 1 && depth < 8) {
      let part = node.tagName.toLowerCase();
      if (node.id) { part += `#${node.id}`; parts.unshift(part); break; }
      const parent = node.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
      parts.unshift(part);
      node = node.parentElement || (node.getRootNode()?.host ?? null);
      depth++;
    }
    return parts.join('>');
  };

  const collect = (root, hostPath) => {
    const all = root.querySelectorAll('*');
    for (const el of all) {
      if (el.shadowRoot) { out.shadowRoots++; collect(el.shadowRoot, selectorPath(el)); }
      const tag = el.tagName.toLowerCase();
      if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta' || tag === 'head') continue;

      const cs = getComputedStyle(el);
      if (cs.display === 'none') { out.skipped.invisible++; continue; }
      if (cs.visibility === 'hidden' || cs.opacity === '0') { out.skipped.invisible++; continue; }
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) { out.skipped.zeroSize++; continue; }

      const parentCS = el.parentElement ? getComputedStyle(el.parentElement) : null;
      const values = {};
      const ownChoice = {};
      for (const p of props) {
        const v = cs[p];
        if (v === '' || v == null) continue;
        values[p] = typeof v === 'string' ? v : String(v);
        if (inherited.includes(p) && parentCS && parentCS[p] === v) ownChoice[p] = false;
      }

      const cls = (typeof el.className === 'string' ? el.className : el.className?.baseVal || '')
        .trim().split(/\s+/).filter(Boolean);

      const dataState = {};
      for (const attr of el.getAttributeNames?.() || []) {
        if (attr.startsWith('data-state') || attr.startsWith('data-slot') ||
            attr.startsWith('aria-expanded') || attr.startsWith('aria-selected') ||
            attr.startsWith('aria-checked') || attr.startsWith('aria-current') ||
            attr === 'disabled' || attr === 'aria-disabled' || attr === 'aria-invalid') {
          dataState[attr] = el.getAttribute(attr);
        }
      }

      out.elements.push({
        path: hostPath ? `${hostPath}::shadow>${selectorPath(el)}` : selectorPath(el),
        tag,
        role: el.getAttribute('role') || null,
        label: (el.getAttribute('aria-label') || '').slice(0, 80) || null,
        // up to 40: a shadcn button carries 15+ classes, and the first 12 dropped its size classes
        classes: cls.slice(0, 40),
        // Own text nodes, not textContent: an element with mixed content — a button
        // holding an <svg> and a label — has childElementCount 1, and an earlier version
        // of this walker recorded its text as empty. Found by a states gallery built from
        // a capture: the button's label was missing from the reconstruction.
        text: (() => {
          let own = '';
          for (const n of el.childNodes) if (n.nodeType === 3) own += n.nodeValue;
          own = own.trim().replace(/\s+/g, ' ');
          return own ? own.slice(0, 160) : '';
        })(),
        rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        area: Math.round(r.width * r.height),
        viewportShare: +(Math.max(0, Math.min(r.width, vw)) * Math.max(0, Math.min(r.height, vh)) / viewportArea).toFixed(5),
        aboveFold: r.top < vh && r.bottom > 0,
        depth: (() => { let d = 0, n = el; while ((n = n.parentElement)) d++; return d; })(),
        childCount: el.childElementCount,
        interactive: el.matches('button,a[href],input,select,textarea,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[tabindex]:not([tabindex="-1"])'),
        state: Object.keys(dataState).length ? dataState : undefined,
        values,
        notOwnChoice: Object.keys(ownChoice).length ? Object.keys(ownChoice) : undefined,
      });
    }
  };
  collect(document.body, null);

  out.media = [...new Set(out.media)];
  out.container = [...new Set(out.container)];
  out.supports = [...new Set(out.supports)];
  out.layers = [...new Set(out.layers)];
  return out;
};

// ── state capture, two mechanisms, each labelled ─────────────────────────────
const READ_STATE = ([path, props]) => {
  const el = document.querySelector(path.split('::shadow>')[0]);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const o = {};
  for (const p of props) o[p] = cs[p];
  const attrs = {};
  for (const a of el.getAttributeNames()) {
    if (a.startsWith('data-state') || a.startsWith('aria-') || a === 'disabled') attrs[a] = el.getAttribute(a);
  }
  return { values: o, attrs };
};

const STATE_PROPS = [
  'color', 'backgroundColor', 'borderTopColor', 'borderTopWidth', 'boxShadow',
  'outlineColor', 'outlineWidth', 'outlineOffset', 'outlineStyle', 'opacity', 'transform',
  'textDecorationLine', 'cursor', 'filter',
  'transitionDuration', 'transitionDelay',   // read so the settle wait is derived, not guessed
];


// How long to wait after changing a state, taken from the element's OWN declared
// transition rather than a guess: the longest transition/animation duration it
// declares, plus its delay, capped so a 10s animation cannot stall a capture.
function settleFor(base) {
  const parse = (v) => Math.max(0, ...String(v || '0s').split(',').map((x) => {
    const t = x.trim();
    if (t.endsWith('ms')) return parseFloat(t) || 0;
    if (t.endsWith('s')) return (parseFloat(t) || 0) * 1000;
    return 0;
  }));
  const d = parse(base?.values?.transitionDuration) + parse(base?.values?.transitionDelay);
  return Math.min(600, Math.max(80, Math.ceil(d) + 40));
}

function diff(base, next) {
  if (!base || !next) return null;
  const d = {};
  for (const k of Object.keys(base.values)) {
    if (base.values[k] !== next.values[k]) d[k] = { from: base.values[k], to: next.values[k] };
  }
  const ad = {};
  for (const k of new Set([...Object.keys(base.attrs), ...Object.keys(next.attrs)])) {
    if (base.attrs[k] !== next.attrs[k]) ad[k] = { from: base.attrs[k] ?? null, to: next.attrs[k] ?? null };
  }
  return { properties: d, attributes: Object.keys(ad).length ? ad : undefined,
           changed: Object.keys(d).length + Object.keys(ad).length };
}

async function captureStates(page, cdp, samples, interact, startUrl) {
  const results = [];
  for (const s of samples) {
    const entry = { path: s.path, tag: s.tag, role: s.role, label: s.label, byForcedPseudo: {}, byInteraction: {} };
    const handle = await page.$(s.path.split('::shadow>')[0]).catch(() => null);
    if (!handle) { entry.note = 'element not re-findable by its own selector path'; results.push(entry); continue; }

    const base = await page.evaluate(READ_STATE, [s.path, STATE_PROPS]).catch(() => null);
    if (!base) { entry.note = 'base state unreadable'; results.push(entry); continue; }

    // (1) forced pseudo-classes through CDP: deterministic, fires no events, so
    // it CANNOT show state that JavaScript applies via attributes or classes.
    if (cdp) {
      try {
        const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: s.path.split('::shadow>')[0] });
        if (nodeId) {
          for (const pseudo of STATE_PSEUDO) {
            await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [pseudo] });
            // A forced pseudo-class starts the element's transitions. Reading the
            // computed style immediately returns a value from the MIDDLE of the
            // transition, not the state's real value — measured on a product with
            // a 150 ms default transition, where an immediate read of :hover gave
            // near-white and a settled read gave the intended grey. So wait for
            // the element's own longest transition, then read.
            await page.waitForTimeout(settleFor(base));
            const got = await page.evaluate(READ_STATE, [s.path, STATE_PROPS]);
            const d = diff(base, got);
            if (d && d.changed) entry.byForcedPseudo[pseudo] = d;
            await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
            await page.waitForTimeout(30);
          }
        } else entry.note = 'CDP could not resolve the node';
      } catch (e) { entry.cdpError = String(e).slice(0, 120); }
    }

    // (2) real input: slower, order-dependent, but it is the only way to see
    // state a component expresses through attributes or a JS class toggle.
    // Real input is NOT read-only: a completed click submits forms and navigates.
    // Measured on a sign-in button, a down+up pair submitted the form and the
    // "focus" reading that followed was really the post-submit disabled state
    // (disabled: null -> "", opacity 1 -> 0.6). So: focus first, by keyboard;
    // hover without pressing; and :active with the release deliberately cancelled
    // by moving the pointer off the element before mouseup.
    if (interact) {
      try {
        await handle.focus().catch(() => {});
        await page.waitForTimeout(settleFor(base));
        const foc = await page.evaluate(READ_STATE, [s.path, STATE_PROPS]);
        const df = diff(base, foc);
        if (df && df.changed) entry.byInteraction.focus = df;
        await page.evaluate(() => document.activeElement?.blur?.()).catch(() => {});

        const box = await handle.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.waitForTimeout(settleFor(base));
          const hov = await page.evaluate(READ_STATE, [s.path, STATE_PROPS]);
          const dh = diff(base, hov);
          if (dh && dh.changed) entry.byInteraction.hover = dh;

          await page.mouse.down();
          await page.waitForTimeout(Math.min(120, settleFor(base)));
          const act = await page.evaluate(READ_STATE, [s.path, STATE_PROPS]);
          const da = diff(base, act);
          if (da && da.changed) entry.byInteraction.active = da;
          await page.mouse.move(1, 1);          // leave the element, so mouseup is not a click
          await page.mouse.up().catch(() => {});
          await page.waitForTimeout(40);

          // did the product change under us anyway? record it rather than hide it.
          const after = await page.evaluate(READ_STATE, [s.path, STATE_PROPS]).catch(() => null);
          const drift = diff(base, after);
          if (drift && drift.changed) entry.mutatedByInteraction = drift;
          if (page.url() !== startUrl) entry.navigatedAwayDuring = page.url();
        }
      } catch (e) { entry.interactionError = String(e).slice(0, 120); }
    }

    results.push(entry);
  }
  return results;
}

// pick the state sample so it covers component KINDS, not just the first N nodes:
// one representative per (tag+role+first class) signature, largest first.
function pickStateSamples(elements, max) {
  const bySig = new Map();
  for (const el of elements) {
    if (!el.interactive) continue;
    const sig = `${el.tag}|${el.role || ''}|${el.classes[0] || ''}`;
    const cur = bySig.get(sig);
    if (!cur || el.area > cur.area) bySig.set(sig, el);
  }
  return [...bySig.values()].sort((a, b) => b.area - a.area).slice(0, max);
}

// ── main ─────────────────────────────────────────────────────────────────────
const o = args(process.argv);
if (o.close) {
  const was = await closeWindow(o.close);
  console.log(was ? `the window "${o.close}" is closed; its profile folder (it held the sign-in) is deleted` : `no window "${o.close}" was open; its folder is deleted, if there was one`);
  process.exit(0);
}
if (o.here && !o.attach) { console.error('refused: --here works in an attached window: pass --attach <slug>'); process.exit(2); }
if (!o.url && !o.loginUrl && !o.here) {
  console.error('usage: node scripts/capture.mjs --url <URL> [--screen name] [--out dir] [--viewport WxH] [--scheme light|dark] [--storage auth.json | --attach <window>]');
  process.exit(2);
}
if (o.loginUrl && !o.saveStorage && !o.keepOpen) {
  console.error('refused: --login-url needs --save-storage <file outside the repository> (e.g. ~/.ds-from-app/sessions/<slug>.auth.json), or --keep-open <slug> for a window that stays open');
  process.exit(2);
}
if (o.keepOpen && !o.loginUrl) { console.error('refused: --keep-open goes with --login-url (it is a way to sign in)'); process.exit(2); }
if (o.attach && (o.storage || o.loginUrl)) { console.error('refused: --attach works in the window the designer signed in in: no --storage, no --login-url'); process.exit(2); }
if (o.loginUrl && !o.untilUrl && !process.stdin.isTTY) {
  console.error("refused: --login-url needs --until-url '<regex of the first screen after sign-in>' when it is not run in a terminal");
  process.exit(2);
}
const [W, H] = o.viewport.split('x').map(Number);

// Login mode needs a visible window — a human is going to type into it. Every
// other mode runs headless (lib/browser.mjs headlessFor). An attached window (--attach) is the designer's, open already.
let browser, context, attachedTab = null;
try {
  if (o.attach) {
    browser = await connectWindow(o.attach);
    if (!browser) { console.error(`no open window "${o.attach}" — it was closed, or never opened. Sign in again: capture.mjs --login-url <sign-in url> --until-url '<regex>' --keep-open ${o.attach}`); process.exit(2); }
    lockWindow(o.attach);
    context = browser.contexts()[0];
    attachedTab = await signedInTab(browser, o.url, o.attach);
    if (!attachedTab) { console.error(`the window "${o.attach}" has no tab open — sign in again with --keep-open ${o.attach}`); await browser.close(); process.exit(2); }
  } else if (o.keepOpen) {
    ({ browser } = await openWindow(o.keepOpen, o.loginUrl));
    context = browser.contexts()[0];
  } else {
    browser = await launch({ headless: headlessFor(o) });
    context = await browser.newContext({
      viewport: { width: W, height: H },
      colorScheme: o.scheme,
      reducedMotion: o.reducedMotion ? 'reduce' : 'no-preference',
      storageState: o.storage && existsSync(o.storage) ? o.storage : undefined,
      deviceScaleFactor: 2,
    });
  }
} catch (e) { console.error(String(e.message || e)); process.exit(2); }
// sessionStorage is not part of storageState: restore it from the session file (lib/session.mjs). An attached window
// has its own.
const restoredSession = o.attach || o.keepOpen ? 0 : await restoreSession(context, o.storage);
// An attached window: the whole context, so a tab the product opens is read-only from its first request, and the
// guard goes into the signed-in tab's current document too (it was loaded before this run).
const blockedWrites = o.blockWrites && !o.loginUrl ? await blockWrites(context, o.reads, o.socketReads) : null;
if (blockedWrites && attachedTab) await attachedTab.evaluate(OUTLIVING_WRITES).catch(() => {});

// login mode: open the page, let a human sign in, then persist the session.
if (o.loginUrl) {
  const p = o.keepOpen ? (context.pages()[0] ?? await context.newPage()) : await context.newPage();
  const sockets = new Set();
  const watch = (pg) => pg.on('websocket', (ws) => sockets.add(ws.url().replace(/[?#].*$/, '')));
  for (const pg of context.pages()) watch(pg);
  context.on('page', watch);
  if (!o.keepOpen || p.url() === 'about:blank') await p.goto(o.loginUrl, { waitUntil: 'domcontentloaded' });
  // Signed in when the person presses Enter — or, with no terminal to press it in (an agent's run), when a tab
  // reaches --until-url (a pattern: the product's own screen after sign-in), polled for up to ten minutes.
  let at = p;
  if (o.untilUrl) {
    console.log(`\nA browser is open at ${o.loginUrl}. Sign in; this waits until the page is at ${o.untilUrl}.`);
    const re = new RegExp(o.untilUrl);
    const t0 = Date.now();
    for (;;) {
      const hit = context.pages().find((x) => re.test(x.url()));
      if (hit) { at = hit; break; }
      if (Date.now() - t0 > 600000) { console.error('not signed in after 10 minutes'); await browser.close(); process.exit(2); }
      await new Promise((r) => setTimeout(r, 1000));
    }
    await at.waitForTimeout(1500);
  } else {
    console.log(`\nA browser is open at ${o.loginUrl}. Sign in, then press Enter here.`);
    await new Promise((res) => process.stdin.once('data', res));
  }
  // Keep only the product's own session. A sign-in through an identity provider leaves that provider's cookies in
  // the browser too (google.com, youtube.com …); a file that holds them is a whole account, not a product session.
  const state = await context.storageState();
  const host = new URL(at.url()).hostname;
  const site = (h) => h.replace(/^\./, '');
  const mine = (domain) => { const d = site(domain); return host === d || host.endsWith(`.${d}`) || d.endsWith(`.${host}`); };
  const kept = state.cookies.filter((c) => mine(c.domain));
  const dropped = state.cookies.length - kept.length;
  // sessionStorage too: a product that keeps part of its sign-in there is signed out in every new context otherwise.
  const session = await readSessionStorage(at);
  if (o.keepOpen) {
    // Nothing is written: the window holds the sign-in. What it is made of, so a capture that lands on the sign-in page
    // can be told why (names and counts only, never a value).
    const browserBound = kept.filter((c) => c.expires === -1).length;
    console.log(`signed in — the window "${o.keepOpen}" stays open. Every capture and flows.mjs run takes --attach ${o.keepOpen} and works in its tab. The designer leaves the window open and does not click in it while the tools work. Close it at the end: capture.mjs --close ${o.keepOpen}.`);
    console.log(`  the sign-in: ${kept.length} cookie(s) of ${host}, ${browserBound} of them end with the browser · ${session.length} sessionStorage item(s) · sockets the page opened: ${sockets.size ? [...sockets].join(', ') : 'none seen'}`);
    await rememberTab(o.keepOpen, at);
    await browser.close(); // an attached window: this disconnects, the window stays
    process.exit(0);
  }
  const target = o.saveStorage;
  const origin = new URL(at.url()).origin;
  const origins = state.origins.filter((x) => mine(new URL(x.origin).hostname)).map((x) => (x.origin === origin ? { ...x, sessionStorage: session } : x));
  if (session.length && !origins.some((x) => x.origin === origin)) origins.push({ origin, localStorage: [], sessionStorage: session });
  mkdirSync(dirname(target), { recursive: true, mode: 0o700 }); // the sessions folder may not exist yet (~/.ds-from-app/sessions/)
  writeFileSync(target, JSON.stringify({ cookies: kept, origins }, null, 1), { mode: 0o600 });
  chmodSync(target, 0o600); // `mode` above applies only when the file is created: an existing file keeps its old permissions
  console.log(`session saved → ${target}: ${kept.length} cookie(s) of ${host}${dropped ? `; ${dropped} of other sites (the identity provider's) left out` : ''}. Never commit it.`);
  await browser.close();
  process.exit(0);
}

const page = attachedTab ?? await context.newPage();
// an attached window: the size, scale, scheme and motion of a fresh context, for this connection only
const attachedCdp = attachedTab ? await emulate(page, { width: W, height: H, deviceScaleFactor: 2, colorScheme: o.scheme, reducedMotion: o.reducedMotion ? 'reduce' : 'no-preference' }) : null;
// --here: a page load of the main frame is answered 204 (the browser keeps the page it has, nothing reaches the
// server) and remembered, so a click that would reload is reported, not followed. Registered after the write block,
// so it runs first (Playwright runs the last route registered first).
let heldNav = null;
if (o.here) {
  await page.route('**/*', (route) => {
    const r = route.request();
    if (r.isNavigationRequest() && r.frame() === page.mainFrame()) { heldNav = r.url(); return route.fulfill({ status: 204, body: '' }); }
    return route.fallback();
  });
  if (await page.locator('input[type="password"]').count().catch(() => 0)) {
    console.error(`the window "${o.attach}" is signed out (its tab asks for a password) — sign in again in it: capture.mjs --login-url … --keep-open ${o.attach}`);
    await browser.close(); process.exit(3);
  }
  if (o.url) {
    const want = new URL(o.url), got = new URL(page.url());
    if (want.origin + want.pathname !== got.origin + got.pathname) { console.error(`--here: the tab is at ${got.pathname}, not ${want.pathname} — with --here the capture starts from the tab as it is`); await browser.close(); process.exit(2); }
  }
  o.url = page.url();
}
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });

let nav = null;
if (!o.here) {
  try {
    nav = await page.goto(o.url, { waitUntil: 'networkidle', timeout: 45000 });
  } catch {
    try { nav = await page.goto(o.url, { waitUntil: 'domcontentloaded', timeout: 45000 }); }
    catch (e) { console.error(`navigation failed: ${e}`); await browser.close(); process.exit(2); }
  }
  await page.waitForTimeout(o.settle);
  // A redirect means the screen asked for is not the screen captured: /projects/new that lands on /dashboard would be
  // written as "project-new" holding the dashboard, and counted twice. Refused unless --allow-redirect.
  {
    const want = new URL(o.url), got = new URL(page.url());
    if (want.origin + want.pathname.replace(/\/$/, '') !== got.origin + got.pathname.replace(/\/$/, '') && !o.allowRedirect) {
      console.error(`redirected: asked for ${want.pathname}, landed on ${got.pathname} — nothing written. The screen was not reached (a GAPS row), or capture ${got.pathname} under its own name; --allow-redirect to keep it.`);
      await browser.close(); process.exit(4);
    }
  }
}
const dismissed = { before: 0, beforeShot: 0 };
try { dismissed.before = await dismiss(page, o.dismiss || []); } catch (e) { console.error(e.message); await browser.close(); process.exit(2); }
const clicked = [];
for (const sel of o.clicks || []) {
  // the first VISIBLE match: a page can hold a hidden copy of its menu (a workspace tab not shown) under the same id
  const el = page.locator(sel).filter({ visible: true }).first();
  if (!(await el.count())) { console.error(`--click ${sel}: nothing visible matches — the surface behind it was not reached`); await browser.close(); process.exit(2); }
  const info = await el.evaluate((n) => ({ type: n.getAttribute('type'), inForm: Boolean(n.closest('form')), text: (n.innerText || n.getAttribute('aria-label') || '').trim().slice(0, 80), tag: n.tagName.toLowerCase(), icon: n.querySelector('[data-icon]')?.getAttribute('data-icon') || '' }));
  if ((REVEAL.test(info.text) || REVEAL_ICON.test(info.icon)) && !o.allowReveal) { console.error(`--click ${sel}: refused — "${info.text || info.icon}" unmasks something the page hides; the capture and its screenshot would hold it. --allow-reveal only on a product with nothing secret behind it.`); await browser.close(); process.exit(2); }
  const unsafe = info.type === 'submit' || (info.inForm && info.tag === 'button' && info.type !== 'button') || UNSAFE.test(info.text) || (!info.text && UNSAFE.test(info.icon)); // the icon is the verb only of an unnamed control (a menu item "Product Modules" draws appstore-add)
  if (unsafe && !o.allowUnsafeClick) { console.error(`--click ${sel}: refused — "${info.text}" (${info.tag}${info.type ? ` type=${info.type}` : ''}${info.inForm ? ', inside a form' : ''}) could change the product. Open the surface another way, or pass --allow-unsafe-click on a product you may change.`); await browser.close(); process.exit(2); }
  const before = page.url();
  try { await el.click({ timeout: 15000 }); } catch (e) { console.error(`--click ${sel}: the click did not happen — ${clickFailure(e)}. Close what covers it (--dismiss '<its close control>'), or reach the surface another way.`); await browser.close(); process.exit(2); }
  // a click can load data (a program switch, a tab that fetches its widgets): wait for the network, then settle
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(Math.min(o.settle, 800));
  if (heldNav) { console.error(`--click ${sel}: it would load another page (${new URL(heldNav).pathname}) — held: in --here mode a page load would sign this product out. Reach the surface another way.`); await browser.close(); process.exit(2); }
  clicked.push({ selector: sel, text: info.text, urlBefore: before, urlAfter: page.url() });
}
if (o.rootClass || o.rootAttr) {
  await page.evaluate(({ cls, attrs }) => {
    for (const c of cls) document.documentElement.classList.add(c);
    for (const a of attrs) { const [k, ...v] = a.split('='); document.documentElement.setAttribute(k, v.join('=')); }
  }, { cls: o.rootClass || [], attrs: o.rootAttr || [] });
  await page.waitForTimeout(Math.min(o.settle, 600));
}

const walk = await page.evaluate(PAGE_WALK, { props: PROPS, inherited: [...INHERITED] });
// Icons that live in another file — a sprite symbol, an <img> svg — fetched from the page's own origin, read-only.
const externalIcons = await page.evaluate(async ({ refs, imgs }) => {
  const out = [];
  const files = new Map();
  const get = async (url) => { if (!files.has(url)) files.set(url, fetch(url, { credentials: 'same-origin' }).then((r) => (r.ok ? r.text() : '')).catch(() => '')); return files.get(url); };
  for (const x of refs || []) {
    const [file, id] = x.ref.split('#'); if (!file || !id) continue;
    const url = new URL(file, location.href); if (url.origin !== location.origin) continue;
    const doc = new DOMParser().parseFromString(await get(url.href), 'image/svg+xml');
    const sym = doc.getElementById(id); if (!sym) continue;
    out.push({ markup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${sym.getAttribute('viewBox') || '0 0 24 24'}" data-sprite="${x.ref}">${sym.innerHTML}</svg>`, classes: x.classes, label: x.label || id, size: x.size, count: 1 });
  }
  for (const im of imgs || []) {
    const url = new URL(im.src, location.href); if (url.origin !== location.origin) continue;
    const text = await get(url.href); if (!/<svg[\s>]/.test(text) || text.length > 12000) continue;
    out.push({ markup: text.slice(text.indexOf('<svg')), classes: '', label: im.label || url.pathname.split('/').pop().replace(/\.svg$/, ''), size: im.size, count: 1 });
  }
  return out;
}, { refs: walk.svgExternal, imgs: walk.svgImages }).catch(() => []);
// The web fonts the page declares, fetched from the page's own origin, read-only, and kept next to the captures
// (extraction/assets/fonts): the Workbench loads them from its own folder. A font left on the product's server is
// refused cross-origin there — found on the first designer's product, where every text fell back to the default face
// and measured 1–3 px off.
const fontFiles = await page.evaluate(async (faces) => {
  const out = [];
  for (const f of faces || []) {
    const m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(f.src || ''); if (!m) continue;
    let url; try { url = new URL(m[1], location.href); } catch { continue; }
    if (url.origin !== location.origin || out.some((x) => x.url === url.href)) continue;
    const r = await fetch(url.href, { credentials: 'same-origin' }).catch(() => null); if (!r?.ok) continue;
    const bytes = new Uint8Array(await r.arrayBuffer()); if (!bytes.length || bytes.length > 3_000_000) continue;
    let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    out.push({ url: url.href, name: decodeURIComponent(url.pathname.split('/').pop() || 'font'), base64: btoa(bin) });
  }
  return out;
}, walk.fontFacesDeclared).catch(() => []);
if (await looksLikeBotCheck(page)) {
  console.error(`refused: ${BOT_CHECK_ADVICE}`);
  await browser.close();
  process.exit(3);
}
if (!walk.elements.length) {
  console.error('nothing visible captured — wrong URL, a login wall, or a blocked render');
  await browser.close();
  process.exit(3);
}

// A capture of a sign-in page is not a capture of the screen asked for: a missing or expired session turns every
// later reading into the sign-in page, silently (exit 0, a valid file). Say so on the console and in the file.
const looksLikeSignIn = o.loginUrl ? false : await page.evaluate(() => {
  const heading = (document.querySelector('h1')?.textContent || document.title || '').trim();
  return Boolean(document.querySelector('input[type="password"]')) || /^(sign ?in|log ?in|увійти|вхід)(?![\p{L}\p{N}])/iu.test(heading);
}).catch(() => false);
if (looksLikeSignIn) console.error('warning: this looks like a sign-in page (a password field, or a "Sign in" heading) — check the screenshot: if it is the sign-in page, the session is missing or expired — sign in again and re-capture; a screen that really holds a password field (change password, an API key) is fine');

const screen = o.screen || new URL(page.url()).pathname.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'root';
// the output folder exists only once a capture is going to be written (sign-in mode never needs it)
mkdirSync(o.out, { recursive: true });
// the font files beside the baseline folder (<extraction>/assets/fonts); each declared face says which file is its copy
for (const f of fontFiles) {
  const name = f.name.replace(/[^\w.-]+/g, '_');
  const dir = join(dirname(o.out), 'assets', 'fonts');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), Buffer.from(f.base64, 'base64'));
  for (const face of walk.fontFacesDeclared || []) if ((face.src || '').includes(f.url)) face.file = `assets/fonts/${name}`;
}
try { dismissed.beforeShot = await dismiss(page, o.dismissLate || []); } catch (e) { console.error(e.message); await browser.close(); process.exit(2); }
const shot = join(o.out, `${screen}--${o.viewport}--${o.scheme}.png`);

// The baseline screenshot is taken HERE — immediately after the walk and BEFORE any
// state probing. It used to be taken last, and that was wrong in two ways at once:
// state probing mutates the page (a forced :hover, a focus, an attribute the product
// toggles), and `fullPage: true` scrolls the page, which moves sticky and
// internally-scrolled regions. Found by reconstructing a capture and diffing it
// against its own screenshot: the sidebar sat at a different scroll offset in the two,
// and the reconstruction was right. A screenshot that postdates the rects cannot be
// used to check them.
await (attachedCdp ? fullShot(attachedCdp, shot) : page.screenshot({ path: shot, fullPage: true })).catch(() => {});
await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});

const cdp = await context.newCDPSession(page).catch(() => null);
if (cdp) { await cdp.send('DOM.enable').catch(() => {}); await cdp.send('CSS.enable').catch(() => {}); }
const samples = pickStateSamples(walk.elements, o.maxStateSamples);
const states = await captureStates(page, cdp, samples, o.interact, page.url());

// A second screenshot AFTER probing, only when real input ran. The pair is the
// measurement of what the probe did to the product — the alternative is to hope.
const shotAfter = o.interact ? join(o.out, `${screen}--${o.viewport}--${o.scheme}--after-probe.png`) : null;
if (shotAfter) await (attachedCdp ? fullShot(attachedCdp, shotAfter) : page.screenshot({ path: shotAfter, fullPage: true })).catch(() => {});

const capture = {
  meta: {
    tool: 'capture.mjs',
    capturedAt: new Date().toISOString(),
    requestedUrl: o.url,
    finalUrl: page.url(),
    httpStatus: nav?.status() ?? null,
    screen,
    viewport: { width: W, height: H, deviceScaleFactor: 2 },
    colorScheme: o.scheme,
    rootSet: o.rootClass || o.rootAttr ? { classes: o.rootClass || [], attributes: o.rootAttr || [] } : undefined,
    clicked: clicked.length ? clicked : undefined,
    // 'screen': the clicks reached another screen of a single-URL product (--as-screen), not a surface on this one
    screenKind: o.asScreen ? 'screen' : undefined,
    looksLikeSignIn: looksLikeSignIn || undefined,
    sessionStorageRestored: restoredSession || undefined,
    // captured in the window the designer signed in in (--attach), not in a fresh browser with a saved session
    window: o.attach || undefined,
    // no page load (--here): the tab as it was, then the clicks
    noReload: o.here || undefined,
    dismissed: dismissed.before || dismissed.beforeShot ? dismissed : undefined,
    blockedWrites: blockedWrites ? blockedWrites.map((b) => `${b.method} ${new URL(b.url).pathname}`) : undefined,
    readsAllowed: o.blockWrites ? o.reads ?? null : undefined,
    socketReadsAllowed: o.blockWrites ? o.socketReads ?? null : undefined,
    reducedMotion: o.reducedMotion,
    propertyList: PROPS,
    inheritedProperties: [...INHERITED],
    stateMechanisms: [
      cdp ? 'CSS.forcePseudoState (CDP) — deterministic, fires no events, so JS/attribute-driven state stays invisible' : 'no CDP session: forced pseudo-classes unavailable',
      o.interact ? 'real input — sees attribute/class-driven state, but is NOT read-only: it can submit, navigate or mutate the product' : 'real input disabled (the default; --interact enables it)',
    ],
    screenshot: shot,
    screenshotTakenBefore: 'state probing — the rects above and this image describe the same moment',
    screenshotAfterProbe: shotAfter,
  },
  population: {
    declared: 'every element under document.body, shadow roots included, that is displayed, visible, non-transparent and has a non-zero box',
    captured: walk.elements.length,
    skipped: walk.skipped,
    shadowRoots: walk.shadowRoots,
    note: 'Exclusions are counted, not silent. A number here is the size of what this capture cannot see.',
  },
  stylesheets: {
    readable: walk.readableStylesheets,
    unreadableFromPage: walk.unreadableStylesheets,
    note: 'A cross-origin stylesheet (a web-font CSS, a CDN) cannot be read from the page (CSSOM throws SecurityError): its rules are not counted as declarations; the elements\' computed styles still are.',
  },
  customProperties: walk.customProperties,
  varUsage: walk.varUsage,
  rootFontSize: walk.rootFontSize,
  documentStyle: walk.documentStyle,
  svgs: [...walk.svgs, ...externalIcons],
  svgSkipped: walk.svgSkipped,
  drawings: walk.drawings,
  iconFonts: walk.iconFonts,
  stack: walk.stack,
  conditions: { media: walk.media, container: walk.container, supports: walk.supports, layers: walk.layers },
  fonts: { declared: walk.fontFacesDeclared, crossOriginStylesheets: walk.crossOriginStylesheets, used: walk.fontsUsed },
  documentTitle: walk.documentTitle,
  scrollHeight: walk.scrollHeight,
  consoleErrors: consoleErrors.slice(0, 20),
  states,
  elements: walk.elements,
};

const file = join(o.out, `${screen}--${o.viewport}--${o.scheme}.json`);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, JSON.stringify(capture, null, 1));

const forced = states.filter((s) => Object.keys(s.byForcedPseudo).length).length;
const acted = states.filter((s) => Object.keys(s.byInteraction).length).length;
const attrStates = states.filter((s) => Object.values(s.byInteraction).some((d) => d.attributes)).length;

console.log(`captured ${screen} → ${file}`);
console.log(`  elements ${capture.population.captured} (skipped: ${walk.skipped.invisible} invisible, ${walk.skipped.zeroSize} zero-size)`);
console.log(`  custom properties ${Object.keys(walk.customProperties).length} · stylesheets ${walk.readableStylesheets} readable, ${walk.unreadableStylesheets} unreadable from the page`);
console.log(`  @media ${walk.media.length} · @container ${walk.container.length} · @layer ${walk.layers.length} · shadow roots ${walk.shadowRoots}`);
console.log(`  state samples ${states.length}: ${forced} responded to forced pseudo-classes, ${acted} to real input, ${attrStates} of those changed an attribute`);
if (blockedWrites?.length) console.log(`  ${blockedSummary(blockedWrites)}`);
const sockLine = blockedWrites ? socketSummary(blockedWrites) : null;
if (sockLine) console.log(`  ${sockLine}`);
const hostLine = platformSummary(blockedWrites);
if (hostLine) console.log(`  ${hostLine}`);
await browser.close();
