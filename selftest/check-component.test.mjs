import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

// tools/check-component.mjs: a built Storybook story against the baseline capture (needs a browser).
const TOOLS = join(ROOT, 'templates', 'workbench', 'tools');
const STYLE = 'font:500 14px/20px Arial;letter-spacing:normal;color:rgb(17,17,17);background:rgb(255,255,255);border:0;padding:0 8px;height:32px;margin:0;';
const IFRAME = `<!doctype html><html><body style="margin:0"><div id="storybook-root"></div><script>
const id = new URLSearchParams(location.search).get('id');
document.getElementById('storybook-root').innerHTML = '<button style="width:126px;${STYLE}">Help Center</button><span>Only here</span>';
</script></body></html>`;
const el = (text, w, extra = {}) => ({ tag: 'button', role: null, text, path: 'html>body>nav>button', rect: { x: 0, y: 0, w, h: 32 },
  values: { fontSize: '14px', fontWeight: '500', lineHeight: '20px', letterSpacing: 'normal', color: 'rgb(17, 17, 17)', backgroundColor: 'rgb(255, 255, 255)', paddingLeft: '8px', ...extra } });
const capture = (...elements) => JSON.stringify({ meta: { tool: 'capture.mjs', viewport: { width: 1440 }, requestedUrl: 'http://app/' }, elements });

function fixture(capW) {
  const dir = mkdtempSync(join(tmpdir(), 'dsfa-cc-'));
  mkdirSync(join(dir, 'tools', 'lib'), { recursive: true });
  copyFileSync(join(TOOLS, 'check-component.mjs'), join(dir, 'tools', 'check-component.mjs'));
  for (const f of ['browser.mjs', 'color.mjs', 'flow-model.mjs']) copyFileSync(join(TOOLS, 'lib', f), join(dir, 'tools', 'lib', f));
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'));
  mkdirSync(join(dir, 'storybook-static'));
  writeFileSync(join(dir, 'storybook-static', 'index.json'), JSON.stringify({ v: 5, entries: { 'x--default': { id: 'x--default', title: 'Components/X', name: 'Default', type: 'story' } } }));
  writeFileSync(join(dir, 'storybook-static', 'iframe.html'), IFRAME);
  mkdirSync(join(dir, 'extraction', 'baseline'), { recursive: true });
  writeFileSync(join(dir, 'extraction', 'baseline', 'x.json'), capture(el('Help Center', capW)));
  return dir;
}
const run = (dir, ...a) => spawnSync(process.execPath, [join(dir, 'tools', 'check-component.mjs'), ...a], { cwd: dir, encoding: 'utf8', timeout: 120000 });

test('check-component: a 126 px button against a 244 px capture is reported as width 126→244 and fails', () => {
  const dir = fixture(244);
  try {
    const r = run(dir, 'X');
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /✗ Help Center: width 126→244/);
    assert.match(r.stdout, /check:component: 0 matched, 1 differ, 1 texts not in any capture/);
    assert.doesNotMatch(r.stdout, /container/, 'the story root is 1280 wide: not a container difference');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('check-component: the capture at 126 px passes; a text not in any capture is counted, not failed; --story picks one', () => {
  const dir = fixture(126);
  try {
    const r = run(dir, 'X');
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /✓ Help Center/);
    assert.match(r.stdout, /check:component: 1 matched, 0 differ, 1 texts not in any capture/);
    const s = run(dir, '--story', 'x--default');
    assert.equal(s.status, 0, s.stdout + s.stderr);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('check-component: a font or padding difference is named; a size beyond the story root is flagged and does not fail', () => {
  const dir = fixture(126);
  try {
    writeFileSync(join(dir, 'extraction', 'baseline', 'x.json'), capture(el('Help Center', 126, { fontWeight: '600', paddingLeft: '12px' })));
    const r = run(dir, 'X');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /font-weight 500→600/);
    assert.match(r.stdout, /padding-left 8→12/);
    writeFileSync(join(dir, 'extraction', 'baseline', 'x.json'), capture(el('Help Center', 1400)));
    const c = run(dir, 'X');
    assert.equal(c.status, 0, c.stdout);
    assert.match(c.stdout, /width 126→1400 \(may be the story's container\)/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
