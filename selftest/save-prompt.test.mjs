// A map leaves a form as it found it (the first designer's report, item 11, 2026-10-26): on a product whose record form
// counts itself changed when a press sets a field and asks to save it when left, and which answers every blocked write
// with a "connection problem" message over the page, at any time. Opens a visible Chrome window (lib/window.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { startServer } from './server.mjs';
import { run, fixtureRepo } from './helpers.mjs';

let S, repo, windows;
const F = 'form-window';
const MSG = 'button[id^="msg-ok"]';
before(async () => {
  S = await startServer();
  repo = fixtureRepo('dsfa-form-');
  windows = mkdtempSync(join(tmpdir(), 'dsfa-windows-'));
  process.env.DSFA_WINDOWS_DIR = windows;
});
after(async () => {
  await run('capture.mjs', '--close', F);
  S.close();
  rmSync(repo, { recursive: true, force: true });
  rmSync(windows, { recursive: true, force: true });
});

// the product's own tab, and what it holds
const inTab = async (fn) => {
  const b = await (await import('../scripts/lib/window.mjs')).connectWindow(F);
  const t = b.contexts()[0].pages().find((p) => { try { return new URL(p.url()).pathname === '/form-app/'; } catch { return false; } });
  try { return await t.evaluate(fn); } finally { await b.close(); }
};
const flowsJson = () => JSON.parse(readFileSync(join(repo, 'flows', 'flows.json'), 'utf8'));
const capture = (screen, ...clicks) => run('capture.mjs', '--attach', F, '--here', ...clicks.flatMap((c) => ['--click', c]), '--as-screen', '--screen', screen, '--dismiss-late', MSG, '--out', join(repo, 'baseline'), '--settle', '200');
const cap = (screen) => JSON.parse(readFileSync(join(repo, 'baseline', `${screen}--1440x900--light.json`), 'utf8'));
const holdsMessage = (c) => c.elements.some((e) => /Internet Connection Problem/.test(e.text || ''));

test('--dismiss-late in a capture: before every click, and again when the message comes between the walk and the screenshot', async () => {
  const w = await run('capture.mjs', '--login-url', `${S.url}form-app/`, '--until-url', 'form-app', '--keep-open', F);
  assert.equal(w.status, 0, w.stderr);
  // the list: the message comes when the capture reads the page's icon file, after the walk
  const l = await capture('list', '#m-list');
  assert.equal(l.status, 0, l.stderr);
  assert.ok(cap('list').meta.dismissed?.retaken >= 1, `the walk and the screenshot were made again: ${JSON.stringify(cap('list').meta.dismissed)}`);
  assert.ok(!holdsMessage(cap('list')), 'the list capture does not hold the message');
  const r = await capture('record', '#m-rec');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!holdsMessage(cap('record')), 'the record capture does not hold the message');
  // opening the record writes, the message covers the page, and the next click of the chain gets through
  const d = await capture('record-details', '#m-rec', '#details');
  assert.equal(d.status, 0, d.stderr);
  assert.ok(cap('record-details').elements.some((e) => e.text === 'Record details'), 'the second click was made');
  assert.ok(cap('record-details').meta.dismissed.late >= 2, `closed before the second click and before the walk: ${JSON.stringify(cap('record-details').meta.dismissed)}`);
});

test('flows.mjs: a form\'s field controls are refused, a press that changes the form is recorded, and the question to save is answered No', async () => {
  S.resetPosts();
  const f = await run('flows.mjs', repo, '--attach', F, '--no-reload', '--home', '#m-list', '--dismiss-late', MSG, '--settle', '150');
  assert.equal(f.status, 0, f.stdout + f.stderr);
  const flows = flowsJson();
  const rec = flows.screens.find((x) => x.name === 'record');
  const fieldRefused = rec.refused.filter((x) => /field of a form that holds values/.test(x.why));
  assert.ok(fieldRefused.some((x) => x.name === 'Find party'), `the lookup's "…" is refused: ${JSON.stringify(rec.refused)}`);
  assert.ok(fieldRefused.some((x) => /span/.test(x.selector)), `the date's calendar button (a pointer span) is refused: ${JSON.stringify(rec.refused)}`);
  const byName = (n) => rec.transitions.find((t) => t.control.name === n);
  assert.deepEqual(byName('Fill defaults')?.effect.edited?.fields, ['f-date'], JSON.stringify(byName('Fill defaults')));
  assert.equal(byName('Fill defaults').effect.savePrompt?.answered, 'No', 'the way back met the question and answered No');
  assert.deepEqual(byName('Copy from last')?.effect.edited?.fields, ['f-party'], JSON.stringify(byName('Copy from last')));
  assert.equal(byName('Copy from last').effect.savePrompt?.answered, 'No');
  assert.ok(!byName('Details').effect.edited, 'a press that changes no field is not an edit');
  assert.ok(byName('Details').effect.closedMessage >= 1, 'the message the press caused was closed before its effect was read');
  assert.ok(flows.savePrompts?.length >= 2 && flows.savePrompts.every((p) => p.answered === 'No'), JSON.stringify(flows.savePrompts));
  const det = flows.screens.find((x) => x.name === 'record-details');
  assert.ok(['Fill defaults', 'Copy from last'].every((n) => det.refused.some((x) => x.name === n && /pressed once/.test(x.why))), `a control that changed the form is pressed once: ${JSON.stringify(det.refused)}`);
  const all = flows.screens.flatMap((x) => x.transitions);
  assert.ok(!all.some((t) => t.control.name === 'OK'), 'the message\'s OK is not one of the screens\' controls');
  assert.ok(!all.some((t) => t.effect.kind === 'unclickable'), `nothing was covered: ${JSON.stringify(all.filter((t) => t.effect.kind === 'unclickable'))}`);
  assert.deepEqual([...new Set(await inTab(() => window.answers))], ['No'], 'every question answered No');
  assert.equal(S.posts(), 0, 'nothing reached the server');
  assert.equal(await inTab(() => document.querySelectorAll('.confirmwindow, .msgwin').length), 0, 'the map ends with nothing over the page');
});

test('flows.mjs: a map whose last press changed the form ends with the way back, so no question to save is left open', async () => {
  // --only record: its last press is "Copy from last"
  const f = await run('flows.mjs', repo, '--attach', F, '--no-reload', '--home', '#m-list', '--dismiss-late', MSG, '--only', 'record', '--settle', '150');
  assert.equal(f.status, 0, f.stdout + f.stderr);
  const flows = flowsJson();
  assert.deepEqual(flows.screens.map((x) => x.name).sort(), ['list', 'record', 'record-details'], 'the other screens are kept');
  const copy = flows.screens.find((x) => x.name === 'record').transitions.find((t) => t.control.name === 'Copy from last');
  assert.equal(copy.effect.savePrompt?.answered, 'No', 'the way back at the end met the question and answered No');
  const left = await inTab(() => ({ party: document.getElementById('f-party')?.value, over: document.querySelectorAll('.confirmwindow').length }));
  assert.deepEqual(left, { party: 'Acme', over: 0 }, 'the window shows the record as it was, with no question open');
});

test('flows.mjs keeps flows.json when a screen the last map reached is not reached now (exit 5)', async () => {
  const was = readFileSync(join(repo, 'flows', 'flows.json'), 'utf8');
  const f = await run('flows.mjs', repo, '--attach', F, '--no-reload', '--home', '#nope', '--dismiss-late', MSG, '--settle', '150');
  assert.equal(f.status, 5, f.stdout + f.stderr);
  assert.match(f.stderr, /kept flows\/flows\.json: the last map reached .*record.*#nope: nothing visible matches it.*flows\.new\.json/);
  assert.equal(readFileSync(join(repo, 'flows', 'flows.json'), 'utf8'), was, 'the old map is untouched');
  assert.ok(existsSync(join(repo, 'flows', 'flows.new.json')), 'the new map is beside it');
});

test('flows.mjs stops (exit 4) when the question to save offers no way to leave without saving', async () => {
  await inTab(() => { window.saveOrStay = true; });
  const was = readFileSync(join(repo, 'flows', 'flows.json'), 'utf8');
  const f = await run('flows.mjs', repo, '--attach', F, '--no-reload', '--home', '#m-list', '--dismiss-late', MSG, '--only', 'record', '--settle', '150');
  assert.equal(f.status, 4, f.stdout + f.stderr);
  assert.match(f.stderr, /stopped: the product asks to save what pressing "Fill defaults" \(button#defaults\) changed .*Save \/ Cancel.*answered "Cancel", nothing saved/);
  assert.equal(readFileSync(join(repo, 'flows', 'flows.json'), 'utf8'), was, 'flows.json was not written');
  assert.ok(!(await inTab(() => window.answers)).includes('Save'), 'Save was never pressed');
});
