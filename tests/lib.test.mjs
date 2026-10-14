import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseColor, toHex } from '../scripts/lib/color.mjs';
import { UNSAFE, REVEAL } from '../scripts/lib/safety.mjs';
import { existsSync } from 'node:fs';
import { launch, findChrome, headlessFor } from '../scripts/lib/browser.mjs';

test('colour: any notation a browser hands back is read, garbage is null', () => {
  assert.equal(toHex(parseColor('rgb(255, 0, 170)')), '#FF00AA');
  assert.equal(parseColor('oklch(0.55 0.2 260)').space, 'oklch');
  assert.equal(toHex(parseColor('rgba(0,0,0,0.5)')), '#00000080');
  assert.equal(parseColor('nonsense'), null);
});

test('safety: an action on data is unsafe, navigation is not; "Show" unmasks', () => {
  assert.ok(UNSAFE.test('Delete account'));
  assert.ok(!UNSAFE.test('Settings'));
  assert.ok(REVEAL.test('Show'));
});

test('safety: words that end, refuse or cut something are unsafe; look-alike words are not', () => {
  for (const w of ['Decline', 'End now', 'Terminate', 'Cancel subscription', 'Stop scan', 'Disconnect', 'Regenerate key', 'Rotate key', 'Deny']) assert.ok(UNSAFE.test(w), `${w} must be unsafe`);
  for (const w of ['Backend', 'Weekend', 'Legend', 'Calendar', 'Endpoints', 'Stopwatch']) assert.ok(!UNSAFE.test(w), `${w} must not be unsafe`);
});

test('headlessFor: sign-in opens a visible window unless --headless; every other mode is hidden; always a boolean', () => {
  assert.equal(headlessFor({ loginUrl: 'https://app.example.com/login' }), false, 'sign-in without --headless: a window the designer can use');
  assert.equal(headlessFor({ loginUrl: 'https://app.example.com/login', headless: undefined }), false);
  assert.equal(headlessFor({ loginUrl: 'https://app.example.com/login', headless: true }), true);
  assert.equal(headlessFor({ url: 'https://app.example.com/' }), true);
  assert.equal(headlessFor({}), true);
  assert.equal(headlessFor(), true);
});

test('findChrome: the first path that exists, or null', () => {
  assert.equal(findChrome(['/nonexistent/chrome']), null);
  assert.equal(findChrome(['/nonexistent/chrome', process.execPath]), process.execPath);
});

test('launch: a headless browser that renders a page', async () => {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setContent('<p>ok</p>');
    assert.equal(await page.textContent('p'), 'ok');
  } finally {
    await browser.close();
  }
});

test('findChrome honours a CHROME_PATH set after the module was imported', () => {
  const had = process.env.CHROME_PATH;
  try {
    process.env.CHROME_PATH = process.execPath;
    assert.equal(findChrome(), process.execPath);
  } finally { if (had === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = had; }
});

test('launch: a CHROME_PATH that is not a browser falls back to the other browser', async (t) => {
  const { chromium } = await import('playwright-core');
  const real = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].some((p) => existsSync(p));
  const bundled = existsSync(chromium.executablePath());
  if (!real && !bundled) return t.skip('neither Google Chrome nor Playwright\'s Chromium is installed here');
  const had = process.env.CHROME_PATH;
  process.env.CHROME_PATH = process.execPath;
  let browser;
  try {
    browser = await launch();
    const page = await browser.newPage();
    await page.setContent('<p>ok</p>');
    assert.equal(await page.textContent('p'), 'ok');
  } finally {
    if (had === undefined) delete process.env.CHROME_PATH; else process.env.CHROME_PATH = had;
    await browser?.close();
  }
});
