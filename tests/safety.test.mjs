import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM_CHECK, platformSummary } from '../scripts/lib/safety.mjs';

test('a hosting platform\'s bot check is let through the write block; a product path is not', () => {
  for (const p of ['/.well-known/vercel/security/request-challenge', '/cdn-cgi/challenge-platform/h/b/flow/ov1/0.1:1:abc']) assert.ok(PLATFORM_CHECK.test(p), p);
  for (const p of ['/api/delete', '/.well-known/openid-configuration', '/graphql', '/x/.well-known/vercel/security/']) assert.ok(!PLATFORM_CHECK.test(p), p);
  const a = []; a.platformChecks = 2; const b = []; b.platformChecks = 1;
  assert.match(platformSummary(a, b, null), /^hosting checks let through: 3 /);
  assert.equal(platformSummary([], null), null);
});
