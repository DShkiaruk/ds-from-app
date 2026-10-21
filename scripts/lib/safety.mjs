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
// READS through a socket shows empty data; the console summary of capture.mjs / flows.mjs says so. `socketReads` (a regex over
// the socket URL, --socket-reads) lets a socket that only reads connect through to the server; the messages the page sends
// over it are counted in the array's `.socketMessages` (url -> n), and the summary reports them. Default-deny: a read the list misses shows up as a blocked request and
// an empty widget, which is visible; a write the list misses would not be.
// A hosting platform's bot check shown instead of the app (Vercel's Security Checkpoint, Cloudflare's "Just a moment…"). It
// refuses any browser a program drives, visible or not (the 2nd cold run, 2026-10-14: "Failed to verify your browser, Code
// 21", also in a visible window). The tools stop and say so; they never disguise the browser and never retry in a loop.
export const BOT_CHECK = /Vercel Security Checkpoint|Failed to verify your browser|Checking your browser|Just a moment\.\.\.|Verify you are human|Attention Required! \| Cloudflare/i;
export const BOT_CHECK_ADVICE = "the site shows a bot check (Vercel / Cloudflare), not the app. It refuses any browser a program drives, so the tools cannot pass it; do not retry (repeated runs are what trigger it). Tell the designer the ways on: the site's owner turns the protection off for the run, or allows this machine (an IP rule, or a header rule); or the designer gives a copy of the app's files, served locally. Never disguise the browser.";
export async function looksLikeBotCheck(page) {
  const t = await page.evaluate(() => `${document.title}\n${(document.body?.innerText || '').slice(0, 2000)}`).catch(() => '');
  return BOT_CHECK.test(t);
}

// The paths a hosting platform's bot check posts to: they change no product data.
export const PLATFORM_CHECK = /^\/(\.well-known\/vercel\/security\/|cdn-cgi\/challenge-platform\/)/;

// A write the page queues to outlive itself (navigator.sendBeacon, a keepalive fetch) leaves after the page is gone, past
// the route below: closing a context or loading the next page sent a product's "tab closed" requests (a sign-out among
// them) to the server. Measured 2026-10-21 (Chrome 155): a pagehide beacon and a keepalive POST reached the server on
// context.close(), page.close() and on navigating away, with every route in place; browser.close() sent nothing. Found
// when a product signed the designer out each time its tab closed, and flows.mjs closes a context before every press.
// Refused in the page, like any other write: sendBeacon answers false (the browser could not queue it), a keepalive
// fetch that is not GET / HEAD / OPTIONS fails as a network error. Installed before any page script runs.
export const OUTLIVING_WRITES = () => {
  const k = Symbol.for('ds-from-app.read-only');
  if (window[k]) return;
  window[k] = true;
  if (navigator.sendBeacon) navigator.sendBeacon = () => false;
  const f = window.fetch;
  window.fetch = function (input, init) {
    const req = input instanceof Request ? input : null;
    const method = String(init?.method || req?.method || 'GET').toUpperCase();
    if ((init?.keepalive || req?.keepalive) && !['GET', 'HEAD', 'OPTIONS'].includes(method)) return Promise.reject(new TypeError('Failed to fetch'));
    return f.call(this, input, init);
  };
};

// `target` is a browser context, or one page (an attached window, lib/window.mjs: the tab is already open, so the guard
// goes into its current document too).
export async function blockWrites(target, reads, socketReads) {
  const context = target;
  await target.addInitScript(OUTLIVING_WRITES);
  if (typeof target.evaluate === 'function') await target.evaluate(OUTLIVING_WRITES).catch(() => {});
  const blocked = [];
  const socketRe = socketReads ? new RegExp(socketReads) : null;
  blocked.socketMessages = new Map();
  const readRe = reads ? new RegExp(reads) : null;
  await context.route('**/*', (route) => {
    const req = route.request();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method())) return route.continue();
    if (readRe && readRe.test(new URL(req.url()).pathname)) return route.continue();
    // the hosting platform's browser check (Vercel's challenge, Cloudflare's) posts to the platform, not the product:
    // blocked, the page stays a blank challenge (found on the pilot's Vercel prototype after repeated runs)
    if (PLATFORM_CHECK.test(new URL(req.url()).pathname)) { blocked.platformChecks = (blocked.platformChecks || 0) + 1; return route.continue(); }
    blocked.push({ method: req.method(), url: req.url().replace(/[?#].*$/, '') });
    return route.abort('blockedbyclient');
  });
  // Playwright 1.62: context.routeWebSocket(url, handler(ws)); with no ws.connectToServer() the page talks to a mock and
  // nothing reaches the server. ws.close() refuses it.
  await context.routeWebSocket(/.*/, (ws) => {
    if (socketRe && socketRe.test(ws.url())) {
      const key = ws.url().replace(/[?#].*$/, '');
      blocked.socketMessages.set(key, blocked.socketMessages.get(key) || 0);
      const server = ws.connectToServer();
      ws.onMessage((m) => { blocked.socketMessages.set(key, blocked.socketMessages.get(key) + 1); server.send(m); }); // counted, then passed on
      return;
    }
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
  return `writes blocked: ${blocked.length} — ${[...counts].map(([k, n]) => `${k} ×${n}`).join(', ')} (if these were reads, the page may show empty data: pass --reads '<regex of their paths>' after checking with the designer)${sockets ? "; a WebSocket is refused whatever --reads says: data the page reads through one stays empty — tell the designer. --socket-reads '<regex over the socket URL>' lets a reading socket through, only after the designer confirms it only reads" : ''}`;
}

// The line for sockets that --socket-reads let through: one per socket, with the messages the page sent over it. Takes the
// arrays blockWrites returned (one per browser context); null when no socket was let through.
export function socketSummary(...lists) {
  const total = new Map();
  for (const l of lists.filter(Boolean)) for (const [u, n] of l.socketMessages || []) total.set(u, (total.get(u) || 0) + n);
  return total.size ? [...total].map(([u, n]) => `socket messages let through: ${n} on ${u}`).join('; ') : null;
}

// The line for the hosting platform's bot checks let through; null when there were none.
export function platformSummary(...lists) {
  const n = lists.filter(Boolean).reduce((k, l) => k + (l.platformChecks || 0), 0);
  return n ? `hosting checks let through: ${n} (the platform's bot check, Vercel / Cloudflare: it changes no product data; a page that stays a challenge means the platform refused the browser — tell the designer)` : null;
}
