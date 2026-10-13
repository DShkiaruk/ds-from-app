import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../selftest/helpers.mjs';

const files = (d) => readdirSync(d).flatMap((f) => { const p = join(d, f); return statSync(p).isDirectory() ? files(p) : [p]; });

const FLAG = /--allow-writes|--interact/;
// (a) a line that names an unsafe flag must say, on the same line, that it is never or only for a sandbox / fixture;
// (b) a line that starts a capture or flows command must not carry an unsafe flag at all.
export function unsafeLines(text) {
  const bad = [];
  text.split('\n').forEach((line, i) => {
    if (FLAG.test(line) && !/never|Never|sandbox|fixture/.test(line)) bad.push({ line: i + 1, rule: 'a', text: line });
    if (/capture\.mjs --url|flows\.mjs /.test(line) && FLAG.test(line)) bad.push({ line: i + 1, rule: 'b', text: line });
  });
  return bad;
}

test('the instructions never teach --allow-writes or --interact outside a sandbox or fixture', () => {
  const bad = [];
  for (const f of files(join(ROOT, 'skills'))) for (const b of unsafeLines(readFileSync(f, 'utf8'))) bad.push(`${f}:${b.line} (${b.rule})`);
  assert.deepEqual(bad, []);
});

test('the checker sees an unsafe command (a planted counterexample)', () => {
  const planted = [
    'Run `node scripts/capture.mjs --url https://app.example.com --allow-writes` to get the data.', // a and b
    '    node scripts/flows.mjs repo --interact',                                                  // a and b
    'Pass --interact to see hover states.',                                                         // a only
    'Never pass `--allow-writes` on a real product.',                                               // fine
    'Only on a fixture: `--interact`.',                                                             // fine
    'Do not use a sandbox. Run capture.mjs --url x --allow-writes',                                 // b: the word sandbox does not excuse a command
  ].join('\n');
  const got = unsafeLines(planted).map((b) => `${b.line}${b.rule}`);
  assert.deepEqual(got, ['1a', '1b', '2a', '2b', '3a', '6b']);
});

test('R27.7: the Workbench texts name src/tokens (Storybook → Foundations), not DESIGN.md, as the token source; the README says the decided.tokens.json exception and one task per session', async () => {
  const { readFileSync } = await import('node:fs');
  const T = (f) => readFileSync(new URL(`../templates/workbench/${f}`, import.meta.url), 'utf8');
  assert.match(T('.claude/skills/build-page/SKILL.md'), /`var\(--…\)` from src\/tokens \(Storybook → Foundations\)/);
  assert.doesNotMatch(T('.claude/skills/build-page/SKILL.md'), /from DESIGN\.md/);
  assert.match(T('README.md'), /src\/tokens` \(Storybook → Foundations\) — які токени є/);
  assert.match(T('README.md'), /крім `extraction\/canon\/decided\.tokens\.json`, і то через агента \(правило 4/);
  assert.match(T('README.md'), /Одна задача — одна нова сесія \(правило 10 в AGENTS\.md\)/);
});

test('R28.2: one task is checked with npm run check:task before its commit; the flow is done only when npm run check passes', async () => {
  const { readFileSync } = await import('node:fs');
  const T = (f) => readFileSync(new URL(`../templates/workbench/${f}`, import.meta.url), 'utf8');
  assert.match(T('AGENTS.md'), /^10\. One task per session: plan\/IMPLEMENTATION_PLAN\.md → one task → plan\/progress\.md → `npm run check:task` → commit\./m);
  assert.match(T('AGENTS.md'), /^9\. Never say "done" before `npm run check` passes/m, 'rule 9 stays: the FLOW is done only when npm run check passes');
  assert.match(T('AGENTS.md'), /`npm run check:task`[^\n]*(skip|not built)/i, 'the Commands line says what check:task is');
  assert.match(T('PROMPT_build.md'), /npm run check:task/);
  assert.doesNotMatch(T('PROMPT_build.md'), /Run `npm run check`/);
  assert.match(T('.claude/skills/build-page/SKILL.md'), /`npm run check:task` passes \(the flow is done only when `npm run check` passes\) → update plan\/progress\.md BEFORE the commit/);
  assert.match(T('.claude/skills/frontend-qa/SKILL.md'), /check:task/);
});

test('R28.3: the first two commits are on main, then a branch per task merged after check:task and the designer\'s yes', async () => {
  const { readFileSync } = await import('node:fs');
  const T = (f) => readFileSync(new URL(`../templates/workbench/${f}`, import.meta.url), 'utf8');
  const rule = T('AGENTS.md').split('\n').find((l) => l.startsWith('11. '));
  assert.ok(rule.includes("The Workbench's first two commits (the extraction, the Workbench) are on main. After that every task is on its own branch (`git switch -c task/<n>-<slug>`), merged into main after `npm run check:task` passes and the designer says yes. Never push, deploy or publish without the designer's yes. Why: "), rule);
  assert.doesNotMatch(rule, /Never commit to main directly/);
  assert.match(T('PROMPT_build.md'), /git switch -c task\/<n>-<slug>/);
  assert.match(T('PROMPT_build.md'), /merge[^\n]*main[^\n]*designer/i);
  const skill = readFileSync(new URL('../skills/ds-from-app/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /Commit the extraction \(on main\)/);
  assert.match(skill, /Commit "Workbench from the extraction" \(on main\)/);
});

test('R28.4: rule 7 says a control of the app keeps the app\'s own role (parity finds controls by role and name)', async () => {
  const { readFileSync } = await import('node:fs');
  const rule = readFileSync(new URL('../templates/workbench/AGENTS.md', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith('7. '));
  assert.ok(rule.startsWith("7. A control of the app is built with the app's own role (parity finds controls by role and name); new controls: `<button>` for actions, `<a>` for navigation; every control has an accessible name. Why: "), rule);
});

test('R28.8: AGENTS rule 4 shows the role field of a decided token', async () => {
  const { readFileSync } = await import('node:fs');
  const rule = readFileSync(new URL('../templates/workbench/AGENTS.md', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith('4. '));
  assert.ok(rule.includes('"role": "<color|spacing|fontSize|lineHeight|letterSpacing|fontWeight|fontFamily|radius|shadow|borderWidth>"'), rule);
});

test('R28.8: plan/progress.md is updated before the task\'s commit and committed with it, naming the task not a hash; one commit per task', async () => {
  const { readFileSync } = await import('node:fs');
  const T = (f) => readFileSync(new URL(`../templates/workbench/${f}`, import.meta.url), 'utf8');
  for (const f of ['PROMPT_build.md', '.claude/skills/build-page/SKILL.md']) {
    const t = T(f).replace(/\s+/g, ' ');
    assert.match(t, /plan\/progress\.md[^.]*before the (task's )?commit[\s\S]{0,300}?committed with it/i, f);
    assert.match(t, /names the task, not a commit hash \(git log has the hash\)/, f);
    assert.match(t, /One commit per task/, f);
    assert.doesNotMatch(t, /date, task, (the )?last line of (`npm run check`|the check)(:task)?, (the )?commit,/i, f);
  }
  // progress.md's own header says the same line: no commit hash, the PROMPT_build format
  const prog = T('plan/progress.md').replace(/\s+/g, ' ');
  assert.match(prog, /<date> · <task> · npm run check:task: <last line> · NEEDS-\*/);
  assert.doesNotMatch(prog, /commit/i, 'progress.md names no commit hash');
});

test('R28.8: build-page says how States stories reach a composite component (storybook-addon-pseudo-states 10.x: a selector string or array, targeting specific elements)', async () => {
  const { readFileSync } = await import('node:fs');
  const t = readFileSync(new URL('../templates/workbench/.claude/skills/build-page/SKILL.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.ok(t.includes(`parameters: { pseudo: { hover: ['[data-pseudo="hover"] button'] } }`), 'the inner-element form');
  assert.match(t, /composite component/i);
  assert.match(t, /never a prop added only for stories/);
  assert.match(t, /string or an array of CSS selectors/);
});

test('I1: a screen task runs check:task with the screens it built (PROMPT_build, build-page, frontend-qa)', async () => {
  const { readFileSync } = await import('node:fs');
  const T = (f) => readFileSync(new URL(`../templates/workbench/${f}`, import.meta.url), 'utf8');
  for (const f of ['PROMPT_build.md', '.claude/skills/build-page/SKILL.md', '.claude/skills/frontend-qa/SKILL.md']) {
    assert.match(T(f), /npm run check:task -- <the screens this task built>/, f);
  }
});

test('M4: build-page says to build a navigation list inside <nav> as the app does', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync(new URL('../templates/workbench/.claude/skills/build-page/SKILL.md', import.meta.url), 'utf8'), /build a navigation list inside `<nav>` as the app does/i);
});

test('M5: PROMPT_build follows rule 10 (plan/progress.md, then check:task, then commit) and says where a task branch starts', async () => {
  const { readFileSync } = await import('node:fs');
  const t = readFileSync(new URL('../templates/workbench/PROMPT_build.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const at = (re) => { const m = re.exec(t); assert.ok(m, String(re)); return m.index; };
  const progress = at(/Write the task's entry in plan\/progress\.md/), check = at(/Then run `npm run check:task -- /), commit = at(/Then commit once/);
  assert.ok(progress < check && check < commit, 'progress.md → check:task → commit');
  assert.match(t, /entry[\s\S]{0,80}the check you are about to run/);
  assert.match(t, /starts from main/);
  assert.match(t, /while the previous task still waits for the designer's yes[^.]*start[^.]*from the previous task's branch[^.]*say so in plan\/progress\.md/i);
});

test('G2: the APP-A11Y rule prefers excluding the one element the app fails on (axe context.exclude), a whole-story rule off only when no selector singles it out', async () => {
  const { readFileSync } = await import('node:fs');
  const files = ['../templates/workbench/FRONTEND.md', '../skills/ds-from-app/references/storybook.md', '../templates/workbench/.claude/skills/build-page/SKILL.md'];
  for (const f of files) {
    const t = readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\s+/g, ' ');
    assert.ok(t.includes("parameters: { a11y: { context: { exclude: [['<selector of that element>']] } } }"), f);
    assert.match(t, /the app itself: <what> — reported to the designer/, f);
    assert.match(t, /APP-A11Y: <story>, <rule>, <what>/, f);
    assert.match(t, /no element selector can single it out/, f);
    assert.ok(t.indexOf('context: { exclude') < t.indexOf("enabled: false"), `${f}: the element exclusion comes first`);
  }
});

test('T7.2: capture.md names screens by their heading or menu label, never by the file or the URL; SKILL.md step 1 points there', async () => {
  const { readFileSync } = await import('node:fs');
  const R = (f) => readFileSync(new URL(`../skills/ds-from-app/${f}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');
  assert.match(R('references/capture.md'), /name every screen by its heading or menu label in kebab-case \(`policies-management`\), never by the file or the URL \(`option-1`\)/);
  assert.match(R('SKILL.md'), /### 1 · Capture Follow \[references\/capture\.md\]\(references\/capture\.md\)[^#]*screen names/i);
});

test('T7.3: icons come from the captures (FRONTEND.md and build-page)', async () => {
  const { readFileSync } = await import('node:fs');
  const T = (f) => readFileSync(new URL(`../templates/workbench/${f}`, import.meta.url), 'utf8').replace(/\s+/g, ' ');
  const sentence = /Icons: the app's own SVGs from the captures \(`svgs` in extraction\/baseline\/\*\.json\) are the source; one Icon component holds them; a library icon only when it is the identical drawing\./;
  assert.match(T('FRONTEND.md'), sentence);
  assert.match(T('.claude/skills/build-page/SKILL.md'), sentence);
});

test('the harness has the client-handoff skill (Eleken harness: build-page, frontend-qa, client-handoff), routed from AGENTS.md', () => {
  const T = (f) => readFileSync(new URL(`../templates/workbench/${f}`, import.meta.url), 'utf8');
  const s = T('.claude/skills/client-handoff/SKILL.md');
  assert.match(s, /^---\nname: client-handoff\ndescription: .+\n---/);
  assert.match(s, /HANDOFF\.md/);
  assert.match(s, /\.env\.example/);
  assert.match(s, /Never push, publish, send or deploy/);
  assert.match(s, /never leave one out/);
  assert.match(T('AGENTS.md'), /«готуй передачу» → the client-handoff skill/);
});
