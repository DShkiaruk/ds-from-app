// One definition of two things the flow spec (scripts/lib/workbench-docs.mjs) and the parity check
// (tools/parity.mjs) must agree on: which text is interface, and which screen a link opens.

// Interface text: headings, header cells, tabs, buttons, links, labels — not inside data rows.
// Paths come in two spellings: the walker's (stops at the nearest #id, :nth-of-type, depth 8) and the page script's
// (tags only). Both are read here — an element with an id once counted as data on one side and as interface on the other
// (found on a menu of li#… items). A path written with spaces around ">" is read the same.
const tight = (path) => String(path ?? '').replace(/\s*>\s*/g, '>');
// A table body is always data. An `li` is data, unless a navigation context comes before it in the path: a <nav>, a
// <menu>, or a segment carrying role menu / menubar / tablist / navigation ("div[role=tablist]>ul>li>a"; the element
// record may also carry `ancestorRoles`). Labels in navigation, tabs and menus are the interface, not records.
const NAV_SEG = /^(nav|menu)([#:.\[].*)?$|\[role=["']?(menu|menubar|tablist|navigation)\b/;
const NAV_ROLES = new Set(['menu', 'menubar', 'tablist', 'navigation']);
const segOf = (path) => tight(path).split('>');
const hasNavBefore = (segs, i, e) => segs.slice(0, i).some((x) => NAV_SEG.test(x)) || (e?.ancestorRoles ?? []).some((r) => NAV_ROLES.has(r));
const DATA_SEG = /^(tbody|li)([#:][^>]*)?$/;
const inDataPath = (path, e) => {
  const segs = segOf(path);
  const i = segs.findIndex((x, k) => DATA_SEG.test(x) && (!x.startsWith('li') || !hasNavBefore(segs, k, e)));
  if (i < 0) return false;
  if (!segs[i].startsWith('li')) return true;
  // inside a data li: a menu item or a tab is still interface (ARIA puts them in a menu / tablist); a link or button
  // is interface when it sits under nav / menu / tablist; a row action in a data list stays data
  if (['menuitem', 'tab'].includes(e?.role)) return false;
  const control = ['a', 'button'].includes(e?.tag) || ['link', 'button'].includes(e?.role) || /(^|>)(a|button)([#:][^>]*)?(>|$)/.test(tight(path));
  return !(control && hasNavBefore(segs, segs.length, e));
};
const CHROME_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'th', 'button', 'a', 'label', 'summary', 'legend']);
// The text of a button or a header cell usually sits in a <span> inside it: an element is interface text when it, or
// one of its three nearest ancestors, is one of those tags.
const CHROME_NEAR = /(^|>)(h[1-4]|th|button|a|label|summary|legend)([#:][^>]*)?(>[^>]+){0,3}$/;
const ROLES = ['tab', 'button', 'link', 'menuitem', 'columnheader'];

export const isDataPath = inDataPath;
export function interfaceElements(elements, { isDetail = false } = {}) {
  return (elements ?? []).filter((e) => {
    const path = tight(e.path);
    return e.text && e.text.length <= 80 && (CHROME_TAGS.has(e.tag) || CHROME_NEAR.test(path) || ROLES.includes(e.role)) && !inDataPath(path, e) && !(isDetail && (e.tag === 'h1' || /(^|>)h1(:|>)/.test(path)));
  });
}

// Layout (R31): every element with its own text that is not data — the interface elements and also a plain div, p or span
// ("Search" in a fixed box). Copy is still demanded of interface elements only; the layout of these is compared when the
// prototype shows the same text.
export function layoutElements(elements, { isDetail = false } = {}) {
  return (elements ?? []).filter((e) => {
    const path = tight(e.path);
    return e.text && e.text.length <= 80 && e.tag !== 'td' && !inDataPath(path, e) && !(isDetail && (e.tag === 'h1' || /(^|>)h1(:|>)/.test(path)));
  });
}

// A prototype-only band: a bar at the very top of the page (a role switcher, a demo toggle) or a column at the very left
// that the Workbench builds without. Every element of the app sits `top` px higher and `left` px further left in the
// Workbench than in the capture. `excluded` is a list of excluded parts, each the list of the texts it shows (a flat list
// of texts is one part). A band is computed per part: the element its texts share (the longest common path prefix, cut at
// a ">") when that is a full-width box at the very top of the page (-> top), or a full-height column at the very left,
// narrower than 40% of the viewport (-> left). Data is never a hit (a table cell that says "Admin"). A band is refused
// when anything inside its box has its own text, or is a control with its own label, that no excluded part shows (the
// app's own header, the app's own left menu). Each result is the largest band found among the parts, never a sum.
// Returns { top, left } (px, 0 for none), or null when there is no band.
const normText = (t) => String(t ?? '').trim().toLowerCase();
const partsOf = (excluded) => ((excluded ?? []).every((x) => typeof x === 'string') ? [excluded ?? []] : excluded);

// The box an excluded part's texts share, and what is inside it: { path, rect, inside } or null.
function sharedBox(els, part) {
  const out = new Set(part.map(normText).filter(Boolean));
  const hit = els.filter((e) => e.text && out.has(normText(e.text)) && e.tag !== 'td' && !inDataPath(e.path, e));
  if (!hit.length) return null;
  const paths = hit.map((e) => segOf(e.path));
  let n = Math.min(...paths.map((p) => p.length));
  for (let i = 0; i < n; i++) if (paths.some((p) => p[i] !== paths[0][i])) { n = i; break; }
  if (n < 1) return null;
  const path = paths[0].slice(0, n).join('>');
  const r = els.find((e) => tight(e.path) === path)?.rect;
  if (!r) return null;
  // inside: by path, or by position (a floating element drawn over the band)
  const inside = els.filter((e) => tight(e.path).startsWith(`${path}>`) || (e.rect && e.rect.x >= r.x && e.rect.y >= r.y && e.rect.x + e.rect.w <= r.x + r.w && e.rect.y + e.rect.h <= r.y + r.h && tight(e.path) !== path));
  return { path, rect: r, inside, hit };
}

export function excludedBand(capture = {}, excluded = []) {
  const parts = partsOf(excluded);
  const all = new Set(parts.flat().map(normText).filter(Boolean));
  const els = capture.elements ?? [];
  const width = capture.meta?.viewport?.width;
  if (typeof width !== 'number') return null;
  const height = capture.meta?.viewport?.height ?? capture.scrollHeight;
  let top = 0, left = 0;
  for (const part of parts) {
    const box = sharedBox(els, part);
    if (!box) continue;
    const r = box.rect;
    if (!(r.h > 0) || r.x > 1 || r.y > 1) continue;
    const isTop = r.w >= width - 2;
    const isLeft = !isTop && typeof height === 'number' && r.w > 0 && r.w < width * 0.4 && r.h >= height - 2;
    if (!isTop && !isLeft) continue;
    // other excluded parts may sit in the same bar (a role switcher beside a variant switcher): they are prototype-only too
    const app = box.inside.filter((e) => (e.text && !all.has(normText(e.text))) || (e.interactive && e.label && !all.has(normText(e.label))));
    if (app.length) continue;
    if (isTop) top = Math.max(top, r.h); else left = Math.max(left, r.w);
  }
  return top || left ? { top, left } : null;
}

// The elements of one excluded part: its shared box with everything inside, when nothing in it is the app's own text;
// else only the elements showing the part's texts, with what is inside them. Used to find what only this part paints.
export function excludedPartElements(capture = {}, part = [], excluded = [part]) {
  const all = new Set(partsOf(excluded).flat().map(normText).filter(Boolean));
  const els = capture.elements ?? [];
  const box = sharedBox(els, part);
  if (!box) return [];
  const own = (list) => list.filter((e) => (e.text && !all.has(normText(e.text))) || (e.interactive && e.label && !all.has(normText(e.label))));
  const boxEl = els.find((e) => tight(e.path) === box.path);
  if (!own(box.inside).length) return [boxEl, ...box.inside].filter(Boolean);
  const hits = new Set(box.hit);
  return els.filter((e) => [...hits].some((h) => e === h || tight(e.path).startsWith(`${tight(h.path)}>`)));
}

// The prototype's element for one of the app's interface texts: among its interface elements first, the nearest to where
// the app has it (`top` px higher, `left` px further left: a prototype-only band); then any visible element with the same text (a navigation
// list the prototype drew without <nav> reads as data by its path).
export function findInPrototype(e, protoChrome = [], all = [], top = 0, left = 0) {
  const near = (list) => list.filter((x) => x.text === e.text).sort((a, b) => Math.hypot(a.rect.x - (e.rect.x - left), a.rect.y - (e.rect.y - top)) - Math.hypot(b.rect.x - (e.rect.x - left), b.rect.y - (e.rect.y - top)))[0];
  return near(protoChrome) ?? near(all);
}

const key = (u) => { try { const x = new URL(u, 'http://x.invalid'); return x.pathname + x.search + x.hash; } catch { return String(u); } };

// The named screen a navigate effect opens: the one named in the effect (toScreen); else the one whose own URL
// (pathname+search+hash) is exactly effect.to; else by pattern, only when exactly one named screen has that pattern.
export function targetScreen(effect = {}, screens = []) {
  const named = screens.filter((s) => s.name);
  if (effect.toScreen) { const s = named.find((x) => x.name === effect.toScreen); if (s) return s; }
  if (effect.to) {
    const exact = named.filter((s) => s.url && key(s.url) === key(effect.to));
    if (exact.length === 1) return exact[0];
  }
  if (effect.pattern) {
    const same = named.filter((s) => s.pattern === effect.pattern);
    if (same.length === 1) return same[0];
  }
  return null;
}

// How a control the prototype lacks is named in the parity report; a control with no name but an icon is found by
// [data-icon="<icon>"] inside it, so the message says how to make it findable (the flow spec's control line says the same).
export const missingControlText = (c = {}) => (!c.name && c.icon ? `${c.role}, icon "${c.icon}" — put data-icon="${c.icon}" on the icon inside the control`
  : !c.name ? `${c.role} "" (name it in extraction/flows/names.json — see the build-page skill)` : `${c.role} "${c.name}"`);

// The "missing interface text" line of the parity report (at most ten texts), and what to do when the text is a record.
export const missingTextLine = (texts = []) => `missing interface text (${texts.length}): ${texts.slice(0, 10).map((x) => `"${x}"`).join(', ')} (a record's name or other data? list it in extraction/flows/data-text.json with why)`;

// The file name of a screen's prototype picture: letters and digits of any script (a Cyrillic name keeps its own file),
// runs of anything else become one "-".
export const shotFileName = (screen = {}) => `${String(screen.name || screen.pattern || '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || 'root'}.png`;

// Capturing, flows and the checkpoint belong to the plugin; the build agent in this repository cannot run them.
export const ASK_PLUGIN = "— ask the designer to run /ds-from-app again (capturing is the plugin's job)";
export const NO_BASELINE = `no baseline capture for this screen: copy and layout not compared ${ASK_PLUGIN}`;
export const UNREACHABLE = `unreachable in the app — recapture it ${ASK_PLUGIN}`;
export const notInFlows = (v) => `✗ ${v}: not in extraction/flows/flows.json (the screen was captured after the last flows run) ${ASK_PLUGIN}`;
