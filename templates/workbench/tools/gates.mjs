#!/usr/bin/env node
// The seven gates. Work counts as done only when `node tools/gates.mjs all` passes (AGENTS.md rule 9).
//   fast    every quick gate (the Stop hook runs these)      all     fast + build + stories + Storybook + parity
//   parity  build, then the flow screens against the captures of the app
//   task    fast + build + stories + Storybook + parity of the flow screens already built (--skip-unbuilt): before each
//           task's commit (AGENTS.md rule 10); the flow is done only when `all` passes (rule 9)
//   ci      fast + build + stories + Storybook, no parity: CI (Linux) draws other system fonts than the macOS the app was
//           captured on, so parity's 4 px box check is a local gate, run on the machine the app was captured on
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const mode = process.argv[2] ?? 'fast';
// extra arguments: for `task` the screens the task built (parity must not skip them); for `parity` they go to parity.mjs as given
const extraArgs = process.argv.slice(3);
const npm = (script) => ({ cmd: process.platform === 'win32' ? 'npm.cmd' : 'npm', args: ['run', '-s', script] });
// "tokens only (styles)": stylelint (no raw values) and check:vars (no var() that names nothing), both always run
const stylesGate = () => {
  const a = run1(npm('lint:css').cmd, npm('lint:css').args), b = run1(npm('check:vars').cmd, npm('check:vars').args);
  return { ok: a.ok && b.ok, out: `${a.ok ? '' : a.out}${b.ok ? '' : b.out}` };
};
const FAST = [
  ['lint (code)', npm('lint')], ['tokens only (styles)', stylesGate], ['tokens only (TypeScript)', npm('check:inline')],
  ['types', npm('typecheck')], ['token layer', npm('check:tokens')], ['stories exist', npm('check:stories')],
];
const SLOW = [['build', npm('build')], ['stories render + accessibility', npm('test:stories')], ['Storybook builds', npm('build-storybook')]];

function flowScreens() {
  const f = join(process.cwd(), 'extraction', 'decisions.json');
  if (!existsSync(f)) return [];
  let screens;
  try { screens = JSON.parse(readFileSync(f, 'utf8')).flow?.screens ?? []; } catch (e) { throw new Error(e.message); }
  if (!Array.isArray(screens)) throw new Error('flow.screens must be a list');
  return screens;
}
const run1 = (cmd, args) => {
  const x = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: x.status === 0 && !x.error, out: `${x.stdout ?? ''}${x.stderr ?? ''}${x.error ? x.error.message : ''}` };
};
function parityGate(extra = []) {
  let screens;
  try { screens = flowScreens(); } catch (e) { return { ok: false, out: `extraction/decisions.json is not valid: ${e.message}` }; }
  if (!screens.length) return { ok: false, out: 'no screens in the test flow yet (extraction/decisions.json flow.screens) — choose them at the checkpoint — ask the designer to run /ds-from-app again' };
  const b = run1(npm('build').cmd, npm('build').args);
  if (!b.ok) return b;
  // an --only of the caller (`npm run parity -- --only <screen>`) replaces the flow's own list: only that screen is checked
  const only = extra.includes('--only') ? [] : screens.flatMap((s) => ['--only', s]);
  return run1(process.execPath, ['tools/parity.mjs', '.', '--serve', 'dist', '--merge', ...extra, ...only]);
}
if (!['fast', 'all', 'parity', 'ci', 'task'].includes(mode)) { console.error('usage: node tools/gates.mjs fast|all|parity|ci|task'); process.exit(2); }
const plan = mode === 'ci' ? [...FAST, ...SLOW] : mode === 'task' ? [...FAST, ...SLOW, ['similarity to the app', () => parityGate(['--skip-unbuilt', ...extraArgs.flatMap((s) => ['--require', s])])]] : mode === 'parity' ? [['similarity to the app', () => parityGate(extraArgs)]] : mode === 'all' ? [...FAST, ...SLOW, ['similarity to the app', () => parityGate()]] : FAST;
let failed = 0;
for (const [name, run] of plan) {
  const r = typeof run === 'function' ? run() : run1(run.cmd, run.args);
  console.log(`${r.ok ? '✓' : '✗'} ${name}`);
  if (!r.ok) { failed++; for (const l of r.out.trimEnd().split('\n').slice(-30)) console.log(`    ${l}`); }
}
console.log(`gates: ${plan.length - failed} passed, ${failed} failed${failed ? ' — see above' : ''}`);
process.exit(failed ? 1 : 0);
