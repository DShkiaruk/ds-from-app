#!/usr/bin/env node
// What this machine is missing before an extraction, and the exact command that fixes each.
//
//   node scripts/preflight.mjs [--json]      exit 1 when anything blocking is missing
//
// An extraction with no browser is a guess; one that stops halfway for disk space leaves half a baseline.
import { existsSync, realpathSync, statfsSync } from 'node:fs';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findChrome } from './lib/browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEED_NODE = 22;

export function checkNode(version = process.versions.node) {
  const major = Number(String(version).split('.')[0]);
  return { id: 'node', ok: major >= NEED_NODE, blocking: true, have: version, need: `>= ${NEED_NODE}`, fix: 'install the current Node LTS from https://nodejs.org (or: brew install node)' };
}

export function checkDeps(root = ROOT) {
  const ok = existsSync(join(root, 'node_modules', 'playwright-core', 'package.json'));
  return { id: 'deps', ok, blocking: true, have: ok ? 'installed' : 'missing', need: 'playwright-core in the plugin folder', fix: `npm install --omit=dev --prefix "${root}"` };
}

async function bundledChromium() {
  try { const { chromium } = await import('playwright-core'); return chromium.executablePath(); } catch { return null; }
}

export async function checkBrowser({ chrome = findChrome(), bundled, root = ROOT } = {}) {
  const b = bundled === undefined ? await bundledChromium() : bundled;
  const have = chrome || (b && existsSync(b) ? b : null);
  return { id: 'browser', ok: Boolean(have), blocking: true, have: have ?? 'none found', need: 'Google Chrome, or Playwright\'s Chromium', fix: `install Google Chrome (https://www.google.com/chrome/), or run: npm exec --prefix "${root}" -- playwright-core install chromium` };
}

export function checkGit() {
  const r = spawnSync('git', ['--version'], { encoding: 'utf8' });
  const ok = r.status === 0;
  return { id: 'git', ok, blocking: true, have: ok ? r.stdout.trim() : 'missing', need: 'git', fix: 'macOS: xcode-select --install; elsewhere: https://git-scm.com/downloads' };
}

export function checkGitIdentity() {
  const r = spawnSync('git', ['config', 'user.email'], { encoding: 'utf8' });
  const email = r.status === 0 ? r.stdout.trim() : '';
  return { id: 'gitIdentity', ok: email !== '', blocking: false, have: email || 'not set', need: 'a git name and email for the commit', fix: 'git config --global user.name "<your name>" && git config --global user.email "<your email>"' };
}

const freeBytes = () => { const s = statfsSync(homedir()); return s.bavail * s.bsize; };

export function checkDisk(free = freeBytes(), need = 1e9) {
  return { id: 'disk', ok: free >= need, blocking: true, have: `${(free / 1e9).toFixed(1)} GB free`, need: `${need / 1e9} GB`, fix: 'free some disk space: every captured screen keeps a full-page screenshot' };
}

async function main() {
  const results = [checkNode(), checkDeps(), await checkBrowser(), checkGit(), checkDisk(), checkGitIdentity()];
  if (process.argv.includes('--json')) console.log(JSON.stringify(results, null, 1));
  else for (const r of results) console.log(r.ok ? `✓ ${r.id}: ${r.have}` : `✗ ${r.id}: ${r.have} (need ${r.need})\n    fix: ${r.fix}`);
  process.exit(results.some((r) => r.blocking && !r.ok) ? 1 : 0);
}

const isMain = () => { try { return Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (isMain()) await main();
