// The judgements of check-pages, apart from the browser so they can be tested on plain numbers and strings.

export const HARNESS_WIDTHS = [320, 375, 768, 1024, 1440, 1920];
export const BUDGET = { cls: 0.1, lcpMs: 2500, imageBytes: 1_000_000 };

// An <a href> of a screen: where does it go? {kind:'screen'|'external'|'anchor'|'bad', why?}
// appPages: the app's pages that are not built here (extraction/flows/flows.json): a flow screen not built yet, or a page of
// the app outside the flow. A link to one is a note, not a broken link: mid-flow (check:task) the next screen is not
// built yet, and the app's own menu links to pages the test flow does not rebuild.
export function classifyLink(href, base, screens, routes = {}, hasId = () => false, appPages = new Map()) {
  const raw = String(href ?? '').trim();
  if (!raw) return { kind: 'bad', why: 'empty href' };
  if (/^(mailto|tel|sms):/i.test(raw)) return { kind: 'external' };
  let u;
  try { u = new URL(raw, base); } catch { return { kind: 'bad', why: 'not a URL' }; }
  if (!/^https?:$/.test(u.protocol)) return { kind: 'external' };
  const b = new URL(base);
  if (u.origin !== b.origin) return { kind: 'external' };
  if (u.pathname !== b.pathname) return { kind: 'bad', why: `a path of the server (${u.pathname}), not a screen route` };
  const hash = u.hash;
  const known = new Set(screens);
  for (const [k, v] of Object.entries(routes)) if (known.has(k) && typeof v === 'string') known.add(decodeURIComponent(v.replace(/^#\/?/, '').split('?')[0]));
  if (/^#\/?/.test(hash) && (hash.startsWith('#/') || hash === '#')) {
    const id = decodeURIComponent(hash.replace(/^#\/?/, '').split('?')[0]);
    if (!id) return { kind: 'bad', why: 'goes to the screen index' };
    if (known.has(id)) return { kind: 'screen', id };
    if (appPages.has(id)) return { kind: 'elsewhere', id, why: appPages.get(id) };
    return { kind: 'bad', why: `no screen "${id}"` };
  }
  if (hash.length > 1) return hasId(decodeURIComponent(hash.slice(1))) ? { kind: 'anchor' } : { kind: 'bad', why: `no element with id "${hash.slice(1)}"` };
  return { kind: 'bad', why: 'goes to the screen index' };
}

// Performance numbers of one screen at 1440 -> list of problems.
export function perfProblems({ cls, lcpMs, imageBytes }) {
  const out = [];
  if (cls > BUDGET.cls) out.push(`CLS ${cls.toFixed(3)} > ${BUDGET.cls}`);
  if (lcpMs != null && lcpMs > BUDGET.lcpMs) out.push(`LCP ${(lcpMs / 1000).toFixed(2)} s > ${BUDGET.lcpMs / 1000} s`);
  if (imageBytes > BUDGET.imageBytes) out.push(`images ${(imageBytes / 1e6).toFixed(2)} MB > ${BUDGET.imageBytes / 1e6} MB`);
  return out;
}

export function seoProblems({ title, h1Count, lang }) {
  const out = [];
  if (!String(title ?? '').trim()) out.push('empty <title>');
  if (h1Count !== 1) out.push(h1Count === 0 ? 'no <h1> (exactly one is needed)' : `${h1Count} <h1> (exactly one is needed)`);
  if (!String(lang ?? '').trim()) out.push('<html> has no lang');
  return out;
}

// Widths where overflow is measured: captured ones fail, the others are reported.
export function widthPlan(captured) {
  const cap = [...new Set(captured.filter((w) => Number.isFinite(w) && w > 0))].sort((a, b) => a - b);
  const other = HARNESS_WIDTHS.filter((w) => !cap.includes(w));
  return { cap: cap.length ? cap : [1440], other };
}
