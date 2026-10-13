// What a read-only instrument must not press: a control whose name reads like an action on data or on the
// person's account. Shared by capture.mjs (--click) and flows.mjs so the two cannot drift apart.
// This file diverged on purpose from ds-extract-method's safety.mjs (ruling P2, 2026-10-13): the pilot found data-changing
// words the original list lacked ("Decline", "End now"). It is no longer a byte-identical copy.
// A consent banner's "Allow analytics" is on the list too: accepting sets state on the product for that account.
export const UNSAFE = /\b(delete|remove|save|submit|send|archive|confirm|pay|purchase|buy|order|checkout|invite|publish|approve|reject|log[ -]?out|sign[ -]?out|trash|sign ?up|register|discard|reset|create|add|update|apply|upload|import|export|download|duplicate|restore|disable|enable|deactivate|revoke|leave|accept|allow|agree|consent|subscribe|unsubscribe|follow|join|book|schedule|share|post|reply|comment|vote|like|assign|move|merge|transfer|withdraw|deposit|claim|redeem|mark as|mark all|decline|deny|end|terminate|cancel|stop|disconnect|unlink|uninstall|regenerate|rotate)\b/i;

// A control that shows what the page hides on purpose — a secret, an API key, a password. Pressing it changes no
// data, but the capture and the screenshot taken after it would carry the secret into the repository. Found on the
// first single-URL product: an API-credentials card whose unmask button is named "Show" — no word UNSAFE knows —
// so the flow mapper would have pressed it and screenshotted every credential on the page.
export const REVEAL = /^(show|reveal|unmask|view|display)$|\b(show|reveal|unmask|view) (the )?(secret|key|token|password|credential|issuer)s?\b/i;

// An icon-only control has no name to read, so its verb is its icon: an unnamed button drawing a trash can is a
// delete. flows.mjs reads the icon name from an Ant Design data-icon or a lucide- / anticon- / icon- / tabler-icon- /
// heroicon- class on the control; capture.mjs --click reads data-icon only. The name is matched against UNSAFE
// (tested: trash, trash-2, log-out, logout, sign-out, delete) and REVEAL_ICON. Eye icons are reveals.
export const REVEAL_ICON = /^(eye|eye-invisible|eye-off|eye-slash|eye-open)$/i;

// The network as the last line: every request that is not GET / HEAD / OPTIONS is aborted in the browser before it
// leaves, and counted; so is every WebSocket connection (a socket carries writes the HTTP methods never show:
// Firebase RTDB, Phoenix LiveView, collaborative editors). This is the DEFAULT (--allow-writes lifts it, on a fixture or a sandbox only). The name lists
// above are a guess about what a control does; this is a guarantee about what the server receives — so a control the
// lists miss still cannot create, send or delete. A product that READS through POST (GraphQL, a search API) loses its
// data under it — measured on the first single-URL product: its analytics, order list and user list are all POST. Name
// those reads with `reads` (a regex over the request's path, --reads '<regex>'): they go through, everything else that
// is not GET/HEAD/OPTIONS is blocked and listed. `reads` does not apply to sockets: a connection is refused whatever its path. A product that
// READS through a socket shows empty data; the console summary of capture.mjs / flows.mjs says so. Default-deny: a read the list misses shows up as a blocked request and
// an empty widget, which is visible; a write the list misses would not be.
export async function blockWrites(context, reads) {
  const blocked = [];
  const readRe = reads ? new RegExp(reads) : null;
  await context.route('**/*', (route) => {
    const req = route.request();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return route.continue();
    if (readRe && readRe.test(new URL(req.url()).pathname)) return route.continue();
    blocked.push({ method: req.method(), url: req.url().replace(/[?#].*$/, '') });
    return route.abort('blockedbyclient');
  });
  // Playwright 1.62: context.routeWebSocket(url, handler(ws)); with no ws.connectToServer() the page talks to a mock and
  // nothing reaches the server. ws.close() refuses it.
  await context.routeWebSocket(/.*/, (ws) => {
    blocked.push({ method: 'WEBSOCKET', url: ws.url().replace(/[?#].*$/, '') });
    ws.close();
  });
  return blocked;
}

// The console line that tells the designer what the block cost: null when nothing was blocked.
export function blockedSummary(blocked) {
  if (!blocked || !blocked.length) return null;
  const counts = new Map();
  for (const b of blocked) {
    const what = b.method === 'WEBSOCKET' ? `WEBSOCKET ${b.url}` : `${b.method} ${new URL(b.url).pathname}`;
    counts.set(what, (counts.get(what) || 0) + 1);
  }
  const sockets = blocked.some((b) => b.method === 'WEBSOCKET');
  return `writes blocked: ${blocked.length} — ${[...counts].map(([k, n]) => `${k} ×${n}`).join(', ')} (if these were reads, the page may show empty data: pass --reads '<regex of their paths>' after checking with the designer)${sockets ? '; a WebSocket is refused whatever --reads says: data the page reads through one stays empty — tell the designer' : ''}`;
}
