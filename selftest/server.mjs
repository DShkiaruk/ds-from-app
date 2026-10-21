// The synthetic products the instruments are checked against. Server and fixtures moved from ds-extract-method
// scripts/selftest_platform.mjs @ebaa66f: /spa/ is a single-URL product (screens swapped in place, a sessionStorage
// sign-in, a masked secret), /flows/ a two-screen product with transitions, /literal a product with no custom
// properties, /one-theme the main fixture without its dark block, / the main fixture. Added here: /class-theme, the
// main fixture with its dark block switched by a class on <html> instead of prefers-color-scheme.
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const F = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const htmlTemplate = readFileSync(join(F, 'platform.html'), 'utf8');
let html = htmlTemplate;   // __XORIGIN__ (the fixture's cross-origin font stylesheet) is filled in once the port is known
const flowsHtml = readFileSync(join(F, 'flows.html'), 'utf8');
const literalHtml = readFileSync(join(F, 'literal.html'), 'utf8');
const spaHtml = readFileSync(join(F, 'spa.html'), 'utf8');
const actionsHtml = readFileSync(join(F, 'actions.html'), 'utf8');
// A font service's stylesheet: linked through the other host name (localhost vs 127.0.0.1), so it is cross-origin.
const FONT_CSS = '@font-face { font-family: "Fixture Web"; font-style: normal; font-weight: 400; src: url(fixture-web.woff2) format("woff2"); unicode-range: U+0000-00FF; }';
const SPRITE = '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="icon-gear" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle></symbol></svg>';
const BELL = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path></svg>';

// A list whose rows are not controls: cursor:pointer divs with a delegated click handler (what a policy table does),
// next to one real button.
const ROWS = '<!doctype html><html><head><meta charset="utf-8"><title>Rows</title></head><body><main><h1>Rows</h1><button type="button" id="refresh">Refresh</button><div id="list"><div class="row" style="cursor:pointer" data-id="1">Row one</div><div class="row" style="cursor:pointer" data-id="2">Row two</div></div></main><script>document.getElementById("list").addEventListener("click",(e)=>{const r=e.target.closest(".row");if(r){document.querySelector("h1").textContent="Row "+r.dataset.id+" opened";location.hash="row-"+r.dataset.id;}});document.getElementById("refresh").addEventListener("click",()=>{document.querySelector("h1").textContent="Refreshed";});</script></body></html>';

// A product whose left menu swaps the h1 and the content at ONE address, with a brand h1 outside main (the default
// landmark is the main heading, so the brand must not be it).
const MENU = '<!doctype html><html><head><meta charset="utf-8"><title>Menu</title></head><body><header><h1>Brand</h1></header><nav><button type="button" data-k="Overview">Overview</button><button type="button" data-k="Policies">Policies</button><button type="button" data-k="Members">Members</button></nav><main><h1>Overview</h1><p class="sub">Overview content</p></main><script>document.querySelectorAll("nav button").forEach((b)=>b.addEventListener("click",()=>{document.querySelector("main h1").textContent=b.dataset.k;document.querySelector(".sub").textContent=b.dataset.k+" content";}));</script></body></html>';

export async function startServer() {
  let posts = 0;
  const agents = [];
  let wsMessages = 0;
  const server = createServer((req, res) => {
    agents.push(req.headers['user-agent'] || '');
    if (req.method === 'POST') { posts++; res.writeHead(204); res.end(); return; }
    // a hosting platform's bot check, as Vercel answered the 2nd cold run (403, its own page instead of the app)
    if (req.url.startsWith('/bot-check')) { res.writeHead(403, { 'content-type': 'text/html' }); res.end('<!doctype html><title>Vercel Security Checkpoint</title><h1>Vercel Security Checkpoint</h1><p>Failed to verify your browser</p><p>Code 21</p>'); return; }
    if (req.url.startsWith('/go-elsewhere')) { res.writeHead(302, { location: '/' }); res.end(); return; }
    // a signed-out product sends a screen on to its sign-in page, whose address no /login pattern names
    if (req.url.startsWith('/members')) { res.writeHead(302, { location: '/LoginV2.aspx?ReturnUrl=%2fmembers' }); res.end(); return; }
    if (req.url.startsWith('/LoginV2.aspx')) { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><html><head><meta charset="utf-8"><title>Logon</title></head><body><main><h1>Welcome</h1><form><input name="u"><input type="password" name="p"><button type="button">Continue</button></form></main></body></html>'); return; }
    if (req.url.startsWith('/fonts/')) { res.writeHead(200, { 'content-type': 'text/css' }); res.end(FONT_CSS); return; }
    if (req.url.startsWith('/sprite.svg') || req.url.startsWith('/bell.svg')) { res.writeHead(200, { 'content-type': 'image/svg+xml' }); res.end(req.url.startsWith('/sprite') ? SPRITE : BELL); return; }
    res.writeHead(200, { 'content-type': 'text/html' });
    if (req.url.startsWith('/uk-sign-in')) { res.end('<!doctype html><html lang="uk"><head><meta charset="utf-8"><title>Вхід</title></head><body><main><h1>Увійти до акаунту</h1><button type="button">Далі</button></main></body></html>'); return; }
    if (req.url.startsWith('/nothing-here')) { res.end('<!doctype html><html><head><meta charset="utf-8"><title></title></head><body></body></html>'); return; }
    if (req.url.startsWith('/rows')) { res.end(ROWS); return; }
    // a product that signs out when its tab closes: a pagehide beacon and a keepalive POST, as such products send them
    if (req.url.startsWith('/bye')) { res.end('<!doctype html><html><head><meta charset="utf-8"><title>Bye</title></head><body><main><h1>Account</h1><button type="button" id="more">More</button><p id="t">Details</p></main><script>document.getElementById("more").onclick=()=>{document.getElementById("t").textContent="More details";};addEventListener("pagehide",()=>{navigator.sendBeacon("/bye/api/sign-out");fetch("/bye/api/tab-closed",{method:"POST",keepalive:true}).catch(()=>{});});</script></body></html>'); return; }
    if (req.url.startsWith('/actions')) { res.end(actionsHtml); return; }
    if (req.url.startsWith('/menu')) { res.end(MENU); return; }
    if (req.url.startsWith('/workbench-index')) { res.end('<!doctype html><html><head><meta charset="utf-8"><title></title></head><body><main data-workbench-index><h1>Screens</h1><a href="#/x">x</a></main></body></html>'); return; }
    // R28.1: a prototype page without the product's prototype-only top bar — its content starts at the top of the page
    // the band and a side panel fixed to the bottom of the window (the 2nd cold run's Evaluator): built without the band,
    // the panel runs the full height and its bottom button stays where it was
    if (req.url.startsWith('/band-panel')) { res.end('<!doctype html><html><head><meta charset="utf-8"><title>Orders</title><style>body{margin:0}h1{position:absolute;left:24px;top:24px;width:300px;height:32px;margin:0;font:600 24px/32px sans-serif}aside{position:fixed;top:0;bottom:0;right:0;width:400px}aside button{position:absolute;left:24px;bottom:24px;width:120px;height:32px;margin:0;font:14px/20px sans-serif}</style></head><body><main><h1>Orders</h1></main><aside aria-label="Evaluator"><button type="button">Run test</button></aside></body></html>'); return; }
    if (req.url.startsWith('/band')) { res.end('<!doctype html><html><head><meta charset="utf-8"><title>Orders</title><style>body{margin:0}h1{position:absolute;left:24px;top:24px;width:300px;height:32px;margin:0;font:600 24px/32px sans-serif}button{position:absolute;left:24px;top:80px;width:120px;height:32px;margin:0;font:14px/20px sans-serif}</style></head><body><main><h1>Orders</h1><button type="button">Add order</button></main></body></html>'); return; }
    if (req.url.startsWith('/spa')) { res.end(spaHtml); return; }
    if (req.url.startsWith('/literal')) { res.end(literalHtml); return; }
    if (req.url.startsWith('/class-theme')) { res.end(html.replace(/\/\* dark:start \*\/[\s\S]*?\/\* dark:end \*\//, '/* dark:start */ html.dark { --color-primary: oklch(0.7 0.15 260); --color-surface: oklch(0.2 0 0); } /* dark:end */')); return; }
    res.end(req.url.startsWith('/flows') || req.url.startsWith('/detail')
      ? flowsHtml.replaceAll('href="/', 'href="/flows/').replace("location.pathname.startsWith('/detail')", "location.pathname.startsWith('/flows/detail')")
      : req.url.startsWith('/one-theme') ? html.replace(/\/\* dark:start \*\/[\s\S]*?\/\* dark:end \*\//, '') : html);
  });
  // A WebSocket on /ws (no dependency: a minimal upgrade handshake). It counts the text frames a page sends; masked
  // client frames of up to 65535 bytes are read, which is all the fixtures send.
  server.on('upgrade', (req, sock) => {
    if (!req.url.startsWith('/ws')) { sock.destroy(); return; }
    const accept = createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    sock.on('data', (b) => { if ((b[0] & 15) === 1) wsMessages++; });
    sock.on('error', () => {});
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  html = htmlTemplate.replaceAll('__XORIGIN__', `http://localhost:${server.address().port}`);
  return { url: `http://127.0.0.1:${server.address().port}/`, close: () => server.close(), posts: () => posts, agents: () => agents.slice(), resetAgents: () => { agents.length = 0; }, resetPosts: () => { posts = 0; }, wsMessages: () => wsMessages, resetWs: () => { wsMessages = 0; } };
}
