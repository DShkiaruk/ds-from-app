// One browser for the checks: the installed Google Chrome when there is one, otherwise Playwright's Chromium
// (npx playwright install chromium). `playwright` in a product repo; `playwright-core` when the plugin runs this file.
import { existsSync } from 'node:fs';

const candidates = () => [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/usr/bin/google-chrome', '/usr/bin/chromium', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean);

export async function launch({ headless = true } = {}) {
  const { chromium } = await import('playwright').catch(() => import('playwright-core'));
  const tried = [];
  for (const executablePath of candidates().filter((p) => existsSync(p))) {
    try { return await chromium.launch({ headless, executablePath }); } catch (e) { tried.push(`${executablePath}: ${String(e.message).split('\n')[0]}`); }
  }
  try { return await chromium.launch({ headless }); } catch (e) {
    tried.push(`bundled Chromium: ${String(e.message).split('\n')[0]}`);
    throw new Error(`No browser for the checks. Install Google Chrome, or run: npx playwright install chromium\n${tried.join('\n')}`);
  }
}
