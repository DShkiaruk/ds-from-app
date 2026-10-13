// The size budget is a check, not an intention (spec §5): the method this plugin came from grew to 41k words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('SKILL.md stays within 1,500 words', () => {
  const text = readFileSync(join(ROOT, 'skills', 'ds-from-app', 'SKILL.md'), 'utf8').replace(/^---[\s\S]*?---/, '');
  const words = text.split(/\s+/).filter(Boolean).length;
  assert.ok(words <= 1500, `SKILL.md has ${words} words`);
});

test('scripts/ holds at most 10 scripts (lib/ not counted)', () => {
  const dir = join(ROOT, 'scripts');
  const scripts = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.mjs')) : [];
  assert.ok(scripts.length <= 10, `scripts/ has ${scripts.length}: ${scripts.join(', ')}`);
});

test('the plugin manifest carries a version', () => {
  const p = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(p.name, 'ds-from-app');
  assert.match(p.version, /^\d+\.\d+\.\d+$/);
});

test('templates/workbench/AGENTS.md has at most 60 lines, and every numbered rule carries a Why', () => {
  const lines = readFileSync(join(ROOT, 'templates', 'workbench', 'AGENTS.md'), 'utf8').replace(/\n$/, '').split('\n');
  assert.ok(lines.length <= 60, `AGENTS.md has ${lines.length} lines`);
  const rules = lines.filter((l) => /^\d+\. /.test(l));
  assert.ok(rules.length > 0, 'AGENTS.md has no numbered rules');
  const without = rules.filter((l) => !l.includes('Why:'));
  assert.deepEqual(without, [], 'rules without Why:');
});
