#!/usr/bin/env node
// Gate 7: the token layer on disk is exactly what extraction/tokens.json (+ the designer's decisions) generates.
// A hand edit, a stale file, a token without a label, or two tokens with one name — each fails.
// Notes (a token left out because it refers to a dropped token or sits on a reference cycle) are printed, never fail.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { generate } from './tokens-css.mjs';

const ROOT = process.cwd();
const r = generate({ root: ROOT });
if (r.error) { console.error(r.error); process.exit(2); }
const out = [];
for (const [rel, content] of Object.entries(r.files)) {
  const f = join(ROOT, rel);
  if (!existsSync(f)) out.push(`${rel} is missing — run npm run tokens`);
  else if (readFileSync(f, 'utf8') !== content) out.push(`${rel} was edited by hand or is stale — run npm run tokens (a value to change goes into extraction/canon/decided.tokens.json)`);
}
const tokDir = join(ROOT, 'src', 'tokens');
for (const f of existsSync(tokDir) ? readdirSync(tokDir).filter((f) => /\.(css|json)$/.test(f)) : []) if (!r.files[`src/tokens/${f}`]) out.push(`src/tokens/${f} is not generated — remove it, tokens come only from extraction/tokens.json`);
for (const p of r.problems) out.push(`token: ${p}`);
for (const n of r.notes) console.log(`note: ${n}`);
for (const x of out) console.log(x);
console.log(out.length ? `check-tokens: ${out.length} problem(s). FAIL.` : `check-tokens: ${Object.keys(r.files).length} generated files match extraction/tokens.json.`);
process.exit(out.length ? 1 : 0);
