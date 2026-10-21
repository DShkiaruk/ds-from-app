// One browser for every instrument: the designer's own Google Chrome when it is installed, otherwise the Chromium
// Playwright downloads (npm exec … playwright-core install chromium) — designers have Chrome, and do not need a 150 MB download.
// The same candidate list as prototype-storybook's scripts/browser.mjs. playwright-core is imported inside launch(),
// so preflight.mjs can use findChrome() before the dependency is installed.
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Computed at call time: a CHROME_PATH set after this module was imported is honoured.
export const candidates = () => [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

export const findChrome = (list = candidates()) => list.find((p) => existsSync(p)) ?? null;

const first = (e) => String(e?.message ?? e).split('\n')[0];

// Sign-in needs a window a person can see and type into; every other mode runs hidden. --headless hides the sign-in
// window too (tests only). Always a boolean: launch() treats a missing value as hidden.
export const headlessFor = ({ loginUrl, headless } = {}) => !loginUrl || headless === true;

/** playwright-core's chromium, or an error that says how to install it. */
export async function playwright() {
  try {
    return (await import('playwright-core')).chromium;
  } catch (e) {
    throw new Error(`The browser library is not installed. Run: npm install --omit=dev --prefix "${PLUGIN}"\n(${first(e)})`);
  }
}

export async function launch({ headless = true } = {}) {
  const chromium = await playwright();
  // Every installed candidate in order (a CHROME_PATH that is not a browser must not hide the real Chrome), then
  // Playwright's own Chromium.
  const tried = [];
  for (const executablePath of candidates().filter((p) => existsSync(p))) {
    try { return await chromium.launch({ headless, executablePath }); } catch (e) { tried.push(`tried ${executablePath}: ${first(e)}`); }
  }
  try {
    return await chromium.launch({ headless }); // Playwright's own Chromium, when it has been downloaded
  } catch (e) {
    throw new Error(`No browser to capture with. Install Google Chrome (https://www.google.com/chrome/), or run: npm exec --prefix "${PLUGIN}" -- playwright-core install chromium\n`
      + tried.map((t) => `(${t})\n`).join('')
      + `(tried Playwright's Chromium: ${first(e)})`);
  }
}
