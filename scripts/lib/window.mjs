// One browser window for the whole run (capture.mjs --keep-open, then --attach in capture.mjs and flows.mjs): for a
// product that signs the designer out when its tab closes, or keeps its sign-in only in the tab it was made in, so a
// saved session opens the sign-in page in every new browser. The designer signs in in a window that stays open; every
// run works in that same tab, closes nothing, and leaves the window as it found it (the size, the scheme and the write
// block are this connection's: they end when it does).
//
// The window is the designer's Google Chrome on a profile folder of its own (~/.ds-from-app/windows/<name>, 0700: it
// holds the sign-in), started with --enable-automation like every browser the tools drive: the bar "Chrome is being
// controlled by automated test software" stays, nothing is disguised. The tools reach it on 127.0.0.1 through the port
// Chrome writes into that folder (DevToolsActivePort). `capture.mjs --close <name>` closes it and deletes the folder.
//
// Measured before it was built (2026-10-21, Chrome 155): a Chrome started this way outlives the process that started
// it and every tool that disconnects from it; the next run finds the same tab with its sessionStorage; a route set by
// one run is gone in the next; Playwright's fullPage screenshot resizes an attached page to the window's own size, so
// the whole-page screenshot here goes through CDP at the capture's size and scale.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync, chmodSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { findChrome, playwright } from './browser.mjs';

export const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/i;
export const windowsRoot = () => process.env.DSFA_WINDOWS_DIR || join(homedir(), '.ds-from-app', 'windows');
export function windowDir(name) {
  if (!NAME.test(name || '')) throw new Error(`window name "${name ?? ''}": letters, digits and dashes only (the product's slug)`);
  return join(windowsRoot(), name);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const portOf = (dir) => { try { return readFileSync(join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim() || null; } catch { return null; } };

/** The open window, connected; null when there is none (never opened, closed by the designer, or crashed). */
export async function connectWindow(name) {
  const port = portOf(windowDir(name));
  if (!port) return null;
  const chromium = await playwright();
  try { return await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 5000 }); } catch { return null; }
}

/** Open the window at `url` (or connect to it, when it is open already). */
export async function openWindow(name, url) {
  const dir = windowDir(name);
  const open = await connectWindow(name);
  if (open) return { browser: open, reused: true };
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  rmSync(join(dir, 'DevToolsActivePort'), { force: true });
  const exe = findChrome() ?? (await playwright()).executablePath();
  if (!exe || !existsSync(exe)) throw new Error('No browser for the window. Install Google Chrome (https://www.google.com/chrome/).');
  const child = spawn(exe, [
    `--user-data-dir=${dir}`, '--remote-debugging-port=0', '--enable-automation', '--no-first-run', '--no-default-browser-check',
    // a window behind others still renders, so a capture taken while the designer looks elsewhere is not blank
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling',
    url,
  ], { detached: true, stdio: 'ignore' });
  child.unref();
  writeFileSync(join(dir, 'pid'), String(child.pid), { mode: 0o600 });
  for (let i = 0; i < 300 && !portOf(dir); i++) await sleep(100);
  const browser = await connectWindow(name);
  if (!browser) throw new Error(`the window "${name}" did not open (no DevTools port in ${dir} after 30 s)`);
  return { browser, reused: false };
}

/** Close the window and delete its profile folder (it holds the sign-in). True when a window was open. */
export async function closeWindow(name) {
  const dir = windowDir(name);
  const browser = await connectWindow(name);
  if (browser) {
    const s = await browser.newBrowserCDPSession().catch(() => null);
    await s?.send('Browser.close').catch(() => {});
  }
  // a window that answered but did not close: stopped by the PID this module started it with (never by name; and only
  // when it answered just now, so a PID the system has since given to another program is never touched)
  const pid = Number(existsSync(join(dir, 'pid')) ? readFileSync(join(dir, 'pid'), 'utf8') : 0);
  for (let i = 0; i < 50 && browser && pid && alive(pid); i++) await sleep(100);
  if (browser && pid && alive(pid)) { try { process.kill(pid); } catch { /* gone */ } await sleep(500); }
  rmSync(dir, { recursive: true, force: true });
  return Boolean(browser);
}

/** The tab the designer signed in in: the first on the product's origin, else the first tab. */
export function signedInTab(browser, url) {
  const pages = browser.contexts()[0]?.pages() ?? [];
  let origin = null;
  try { origin = new URL(url).origin; } catch { /* no url */ }
  const on = (p) => { try { return new URL(p.url()).origin === origin; } catch { return false; } };
  return pages.find(on) ?? pages[0] ?? null;
}

/** One run at a time in a window: two would drive the same tab. Released when this process exits. */
export function lockWindow(name) {
  const f = join(windowDir(name), 'run.lock');
  for (let i = 0; i < 2; i++) {
    try {
      const fd = openSync(f, 'wx');
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      process.on('exit', () => { try { if (readFileSync(f, 'utf8') === String(process.pid)) unlinkSync(f); } catch { /* gone */ } });
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = Number(readFileSync(f, 'utf8'));
      if (pid && alive(pid)) throw new Error(`another run (pid ${pid}) is working in the window "${name}": run them one after another`);
      unlinkSync(f); // left by a run that ended without releasing it
    }
  }
}

/** The page at the size, scale, colour scheme and motion a fresh browser context would give it; this connection's only. */
export async function emulate(page, { width, height, deviceScaleFactor = 1, colorScheme, reducedMotion }) {
  // emulateMedia first: Playwright re-sends its own device metrics with it (scale 1), which would undo ours
  await page.emulateMedia({ colorScheme: colorScheme ?? null, reducedMotion: reducedMotion ?? null });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile: false });
  return cdp;
}

/** The whole page as one PNG, at the emulated width and scale. */
export async function fullShot(cdp, path) {
  const m = await cdp.send('Page.getLayoutMetrics');
  const c = m.cssContentSize || m.contentSize;
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: Math.ceil(c.width), height: Math.ceil(c.height), scale: 1 } });
  writeFileSync(path, Buffer.from(data, 'base64'));
}
