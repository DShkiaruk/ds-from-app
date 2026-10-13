#!/usr/bin/env node
// Gate 2, the part stylelint cannot see: raw colours and sizes written in TypeScript (style objects, CSS text, JSX colour attributes).
// Reads the code with the TypeScript parser, so it follows property names instead of guessing from text.
// A real one-off the product has: put `// ds-allow: <why>` on that line — the reason is reviewed with the PR.
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

let ts;
try { ts = (await import('typescript')).default; } catch {
  console.error("check-inline needs the repo's dependencies — run npm install");
  process.exit(2);
}

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const files = [];
(function walk(d) {
  let entries = [];
  try { entries = readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(d, e.name);
    if (e.isDirectory()) { if (!/^(foundations|tokens)$/.test(e.name) || d !== SRC) walk(p); continue; }
    if (/\.(ts|tsx)$/.test(e.name) && !/\.(stories|test|spec)\.tsx?$/.test(e.name) && !/\.d\.ts$/.test(e.name)) files.push(p);
  }
})(SRC);

const CAMEL = /^(color|background|fill|stroke|fontSize|fontFamily|fontWeight|lineHeight|letterSpacing|borderRadius|padding[A-Za-z]*|margin[A-Za-z]*|gap|rowGap|columnGap|boxShadow|font|--[\w-]+|[A-Za-z]*Color|[A-Za-z]*Radius)$/;
const KEBAB = /^(color|background|fill|stroke|font-size|font-family|font-weight|line-height|letter-spacing|border-radius|padding(-[a-z-]+)?|margin(-[a-z-]+)?|gap|row-gap|column-gap|box-shadow|font|--[\w-]+|[a-z-]+-color|[a-z-]+-radius)$/;
const KEYWORDS = new Set(['0', 'auto', 'inherit', 'initial', 'unset', 'none', 'normal', 'transparent', 'currentColor', '50%', '100%']);
const VAR = /var\((?:[^()]|\([^()]*\))*\)/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const COLOR_FN = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/;
const LENGTH = /\d(px|rem|em|vw|vh|vmin|vmax|ch|ex|pt|cm|mm|in)\b/;
const COLOR_ATTRS = new Set(['color', 'fill', 'stroke', 'background', 'backgroundColor', 'stopColor']);
const ALLOW = /^(\/\/|\/\*)\s*ds-allow:\s*\S/;
// A custom property may hold a calc()/min()/max()/clamp() over tokens and unitless numbers (same rule as check-vars).
const tokenBuilt = (v) => {
  if (!/var\(/.test(v)) return false;
  let prev;
  do { prev = v; v = v.replace(/var\(\s*--[\w-]+\s*(?:,\s*[\d.\s+*/-]*)?\)/g, '0').replace(/(?:calc|min|max|clamp)?\(([\d.\s+*/,-]*)\)/g, '0'); } while (v !== prev);
  return /^[\d.\s+*/-]*$/.test(v);
};
const SUFFIX = 'use a token (var(--…)) — or write NEEDS-TOKEN in plan/progress.md and ask the designer';

const findings = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true, f.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const lineOf = (pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;
  const allowed = new Set();
  (function comments(n) {
    if (n.kind !== ts.SyntaxKind.JsxText) {
      const ranges = [...(ts.getLeadingCommentRanges(text, n.getFullStart()) ?? []), ...(ts.getTrailingCommentRanges(text, n.getFullStart()) ?? [])];
      for (const r of ranges) if (ALLOW.test(text.slice(r.pos, r.end))) allowed.add(lineOf(r.pos));
    }
    for (const c of n.getChildren(sf)) comments(c);
  })(sf);
  const rel = relative(ROOT, f).split('\\').join('/');
  const add = (pos, what) => { const line = lineOf(pos); if (!allowed.has(line)) findings.push(`${rel}:${line}: ${what} — ${SUFFIX}`); };

  const rawPart = (v) => v.replace(VAR, ' ').split(/\s+/).filter((t) => t && t !== '/' && !KEYWORDS.has(t)).join(' ');
  const unwrap = (e) => { while (e && (ts.isParenthesizedExpression(e) || ts.isAsExpression(e) || ts.isSatisfiesExpression?.(e) || ts.isNonNullExpression(e))) e = e.expression; return e; };
  function checkValue(prop, e) {
    e = unwrap(e);
    if (!e) return;
    if (ts.isConditionalExpression(e)) { checkValue(prop, e.whenTrue); checkValue(prop, e.whenFalse); return; }
    if (ts.isNumericLiteral(e)) { if (Number(e.text) !== 0) add(e.getStart(sf), `raw number for ${prop} (${e.text})`); return; }
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand)) { if (Number(e.operand.text) !== 0) add(e.getStart(sf), `raw number for ${prop} (-${e.operand.text})`); return; }
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) { const raw = prop.startsWith('--') && tokenBuilt(e.text) ? '' : rawPart(e.text); if (raw) add(e.getStart(sf), `raw value for ${prop} (${raw})`); }
  }
  function cssText(node) {
    const src = node.getText(sf), base = node.getStart(sf);
    for (const m of src.matchAll(/(?<![\w-])(--[a-z][\w-]*|[a-z][a-z-]*)\s*:\s*([^;{}\n]*)/g)) {
      if (!KEBAB.test(m[1])) continue;
      if (m[1].startsWith('--') && tokenBuilt(m[2])) continue;
      const value = m[2].replace(VAR, ' ');
      const raw = value.match(HEX)?.[0] ?? (COLOR_FN.test(value) ? value.slice(value.search(COLOR_FN)).split(/[\s;]/)[0] : null) ?? value.match(LENGTH)?.[0];
      const hit = HEX.test(value) || COLOR_FN.test(value) || LENGTH.test(value);
      if (hit) add(base + m.index, `raw value in CSS text for ${m[1]} (${(raw || value).trim()})`);
    }
  }
  // a hex or colour function in ANY string of a style object (`border: '1px solid #ff00aa'`), not only colour-named keys
  const isStyleObject = (o) => {
    let up = o.parent;
    while (up && (ts.isAsExpression(up) || ts.isParenthesizedExpression(up) || ts.isSatisfiesExpression?.(up))) up = up.parent;
    return up && ts.isJsxExpression(up) && up.parent && ts.isJsxAttribute(up.parent) && up.parent.name.getText(sf) === 'style';
  };
  const looksLikeStyle = (o) => isStyleObject(o) || o.properties.some((p) => ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && CAMEL.test(p.name.text));
  function anyColour(o) {
    for (const p of o.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const name = ts.isIdentifier(p.name) || ts.isStringLiteral(p.name) ? p.name.text : '';
      if (CAMEL.test(name)) continue;   // already judged by its own property rule
      const v = unwrap(p.initializer);
      if (v && (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v))) {
        const t = v.text.replace(VAR, ' ');
        if (HEX.test(t) || COLOR_FN.test(t)) add(v.getStart(sf), `raw colour in ${name || 'a style value'}`);
      }
    }
  }
  (function visit(n) {
    if (ts.isObjectLiteralExpression(n) && looksLikeStyle(n)) anyColour(n);
    if (ts.isPropertyAssignment(n) && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name))) {
      const name = n.name.text;
      if (CAMEL.test(name)) checkValue(name, n.initializer);
    } else if (ts.isJsxAttribute(n) && COLOR_ATTRS.has(n.name.getText(sf)) && n.initializer) {
      let v = n.initializer;
      if (ts.isJsxExpression(v)) v = unwrap(v.expression);
      if (v && (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) && (HEX.test(v.text) || COLOR_FN.test(v.text))) add(v.getStart(sf), `raw colour in ${n.name.getText(sf)}`);
    }
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateExpression(n)) cssText(n);
    ts.forEachChild(n, visit);
  })(sf);
}
const seen = [...new Set(findings)];
for (const x of seen) console.log(x);
console.log(seen.length ? `check-inline: ${seen.length} raw value(s). FAIL.` : `check-inline: ${files.length} file(s), no raw colour or size.`);
process.exit(seen.length ? 1 : 0);
