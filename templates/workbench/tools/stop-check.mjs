#!/usr/bin/env node
// Claude Code's Stop hook (.claude/settings.json): before Claude finishes a turn in which code changed, the quick gates
// run; a failure is sent back (exit 2, stderr) so it is fixed before "done". Quiet and quick when nothing changed.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

try { await new Promise((ok) => { process.stdin.resume(); process.stdin.on('data', () => {}); process.stdin.on('end', ok); setTimeout(ok, 200); }); } catch { /* no stdin */ }
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
if (!existsSync(join(root, 'node_modules'))) process.exit(0);
const PATHS = ['src', 'tools', '.storybook', '.stylelintrc.json', 'eslint.config.js', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts', 'package.json'];
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const st = git('status', '--porcelain', '--', ...PATHS);
if (st.error || st.status !== 0) process.exit(0); // no git: changes cannot be told apart, never block a chat
if (!st.stdout.trim()) process.exit(0);
// "uncommitted" is not "changed this turn": fingerprint the code state and block only when it is new since the last check
const hash = createHash('sha256');
hash.update(git('diff', 'HEAD', '--', ...PATHS).stdout ?? '');
for (const f of git('-c', 'core.quotePath=false', 'ls-files', '-z', '--others', '--exclude-standard', '--', ...PATHS).stdout.split('\0').filter(Boolean).sort()) {
  hash.update(`\n--untracked ${f}\n`);
  try { hash.update(readFileSync(join(root, f))); } catch { /* vanished */ }
}
const fingerprint = hash.digest('hex');
const gd = git('rev-parse', '--git-dir').stdout.trim();
const store = gd ? resolve(root, gd, 'ds-stop-check.json') : null;
try { if (store && JSON.parse(readFileSync(store, 'utf8')).fingerprint === fingerprint) process.exit(0); } catch { /* none yet */ }
const r = spawnSync(process.execPath, ['tools/gates.mjs', 'fast'], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
try { if (store) writeFileSync(store, JSON.stringify({ fingerprint, ok: r.status === 0 })); } catch { /* read-only .git */ }
if (r.status === 0) process.exit(0);
process.stderr.write(`Quality gates failed — fix them before you finish (AGENTS.md rule 9):\n${r.stdout}${r.stderr}`);
process.exit(2);
