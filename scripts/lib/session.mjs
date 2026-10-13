// A session file is Playwright's storageState (cookies + localStorage per origin) PLUS each origin's sessionStorage.
//
// Why the addition: a product that keeps part of its sign-in in sessionStorage (an `isLogin` flag next to an httpOnly
// cookie is a common shape) loses it in every new browser context, because storageState does not carry
// sessionStorage — so every capture of an authenticated screen silently lands on the sign-in page instead. Found on the
// first single-URL product: the saved session held both cookies and the token in localStorage, and every screen still
// redirected to /login until the sessionStorage flag was restored.
//
// The walker's sign-in mode writes origins[].sessionStorage; every instrument that opens the product restores it
// before the first page script runs, and only where the page has not set a value itself.

import { existsSync, readFileSync } from 'node:fs';

/** The current page's sessionStorage, as [{ name, value }] — written into the session file at sign-in. */
export const readSessionStorage = (page) => page.evaluate(() => Object.keys(sessionStorage).map((name) => ({ name, value: sessionStorage.getItem(name) }))).catch(() => []);

/** Restore every origin's sessionStorage from the session file into a context, before any page script runs. */
export async function restoreSession(context, file) {
  if (!file || !existsSync(file)) return 0;
  let origins = [];
  try { origins = (JSON.parse(readFileSync(file, 'utf8')).origins || []).filter((o) => o.sessionStorage?.length).map((o) => ({ origin: o.origin, items: o.sessionStorage })); } catch { return 0; }
  if (!origins.length) return 0;
  await context.addInitScript((list) => {
    for (const o of list) {
      if (o.origin !== location.origin) continue;
      for (const { name, value } of o.items) { try { if (sessionStorage.getItem(name) === null) sessionStorage.setItem(name, value); } catch { /* storage blocked */ } }
    }
  }, origins);
  return origins.reduce((n, o) => n + o.items.length, 0);
}
