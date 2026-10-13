import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const skills = readdirSync(join(ROOT, 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const commandsOf = (root) => (existsSync(join(root, 'commands')) ? readdirSync(join(root, 'commands')).filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -3)) : []);
const collisions = (cmds, sks) => cmds.filter((c) => sks.includes(c));

// A command and a skill with one name both become <plugin>:<name>; the command shadows the skill and SKILL.md never
// reaches the model (found by the cold-run probe, 2026-10-13). A skill is itself invocable as /<name>.
test('no command shares its name with a skill', () => {
  assert.deepEqual(collisions(commandsOf(ROOT), skills), []);
  assert.deepEqual(collisions(['ds-from-app'], ['ds-from-app']), ['ds-from-app'], 'the guard sees a planted collision');
});

test('every skill has a name and a description in its frontmatter, and the skill handles its own input', () => {
  for (const s of skills) {
    const text = readFileSync(join(ROOT, 'skills', s, 'SKILL.md'), 'utf8');
    const fm = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
    assert.match(fm, new RegExp(`^name: ${s}$`, 'm'), `${s}: name`);
    assert.match(fm, /^description: .{40,}$/m, `${s}: description`);
  }
  assert.match(readFileSync(join(ROOT, 'skills', 'ds-from-app', 'SKILL.md'), 'utf8'), /^## Input$/m);
});
