// The three documents the Workbench starts from, written from the extraction and the designer's decisions:
// PROJECT.md (what this is and what is in scope), DESIGN.md (the closed token set and the components), and the
// test-flow spec specs/pages/<flow>.md (what each screen must show and do). Pure functions: each returns markdown.
import { interfaceElements, isDataPath, targetScreen, excludedBand } from '../../templates/workbench/tools/lib/flow-model.mjs';

const EXT = 'co.eleken.ds';

const GROUPS = ['color', 'space', 'type', 'radius', 'shadow', 'border', 'motion', 'other'];
const TITLE = { color: 'Colors', space: 'Spacing', type: 'Typography', radius: 'Radius', shadow: 'Shadows', border: 'Borders', motion: 'Motion', other: 'Other' };

const ids = (list) => (list ?? []).map((s) => (typeof s === 'string' ? s : s?.id ?? s?.name)).filter(Boolean);
const cell = (v) => String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');

export function projectMd({ manifest = {}, decisions = {}, tokensDoc = {}, pluginVersion = '', specPath }) {
  const meta = tokensDoc.$meta ?? {};
  const link = manifest.entryPoint || meta.platform?.source?.url || 'not recorded';
  const hashes = (meta.instruments ?? []).map((i) => `${i.name} ${String(i.hash ?? '').slice(0, 12)}`).join(', ');
  const flow = decisions.flow ?? {};
  const inFlow = flow.screens ?? [];
  const others = ids(decisions.screens?.length ? decisions.screens : manifest.screens).filter((id) => !inFlow.includes(id));
  const asked = decisions.questions ?? [];
  return [
    `# ${manifest.product || meta.product || 'Product'} — project`,
    '',
    `- Product: ${manifest.product || meta.product || 'not recorded'}`,
    `- Source: ${link}`,
    `- Captured: ${meta.extractedAt || 'not recorded'}`,
    `- Tool: ds-from-app ${pluginVersion}${hashes ? ` (instruments: ${hashes})` : ''}`,
    '',
    `## Test flow: ${flow.name || 'not chosen'}`,
    '',
    ...(specPath ? [`Spec: ${specPath}`, ''] : []),
    ...(inFlow.length ? inFlow.map((id, i) => `${i + 1}. ${id}`) : ['No screens chosen.']),
    '',
    '## Designer decisions',
    '',
    ...(asked.length ? asked.map((q) => (q.answer != null && q.answer !== '' ? `- ${q.text} → ${q.answer}` : `- ${q.text} — (not answered)`)) : ['No questions were asked.']),
    ...(decisions.comment ? ['', `Comment: ${decisions.comment}`] : []),
    '',
    '## Scope',
    '',
    `In scope: the flow above (${inFlow.join(', ') || 'none'}).`,
    `Not in this flow: ${others.join(', ') || 'none'}`,
    '',
  ].join('\n');
}

// `rows` are the `tokens` of the generated src/tokens/tokens.json (tools/tokens-css.mjs): the one source of the values.
export function designMd({ rows = [], tokensDoc = {}, decisions = {}, closure }) {
  const T = tokensDoc.tokens ?? {};
  const rename = new Map((decisions.tokens ?? []).filter((x) => x.name && x.name !== x.id).map((x) => [x.id, x.name]));
  const out = (decisions.excluded ?? []).filter((x) => !x.include);
  const nameOf = (k) => rename.get(k) ?? String(T[k]?.$extensions?.[EXT]?.cssVar ?? `--${k}`).replace(/^--/, '');
  const lines = [tokensDoc.$closure || closure || '', '', '# Design', '', 'This is the snapshot taken when the Workbench was made. The tokens as they are now: src/tokens/*.css (generated; each line says how the value was obtained) or Storybook → Foundations.', ''];
  for (const g of GROUPS) {
    const rs = rows.filter((r) => (r.group ?? 'other') === g);
    if (!rs.length) continue;
    lines.push(`## ${TITLE[g]}`, '', '| Token | Value | Dark | How obtained |', '| --- | --- | --- | --- |');
    for (const r of rs) lines.push(`| ${r.cssVar} | ${cell(r.value)} | ${r.dark ? cell(r.dark) : ''} | ${r.label ?? 'unknown'}${r.renamedFrom ? ` (renamed from ${r.renamedFrom})` : ''} |`);
    lines.push('');
  }
  lines.push('## Left out as prototype-only', '');
  lines.push(...(out.length ? out.map((x) => `- ${x.what ?? x.id}${x.tokens?.length ? ` — tokens: ${x.tokens.map((k) => `--${nameOf(k)}`).join(', ')}` : ''}`) : ['Nothing.']), '');
  const comps = (decisions.components ?? []).filter((c) => c.include);
  lines.push('## Components', '', ...(comps.length ? comps.map((c) => `- ${c.name}${c.instances != null ? ` (${c.instances} ${c.instances === 1 ? 'instance' : 'instances'})` : ''}`) : ['None chosen.']), '');
  lines.push('## Not covered yet', '', 'NEEDS-TOKEN / NEEDS-COMPONENT / NEEDS-STATE found while building are listed in plan/progress.md.', '');
  return lines.join('\n');
}

// One definition shared with the parity check (tools/parity.mjs): which text is interface, which screen a link opens.
const clean = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();
const isDataEl = (e) => String(e.tag).toLowerCase() === 'td' || isDataPath(e.path, e);

// the visible words the screen must carry, in document order, once each — exactly what parity requires (minus data
// text and excluded texts); text inside data rows is kept apart as sample data. An icon-only link or button is listed
// under its aria-label (the capture keeps it as `label`).
export function interfaceText(capture, { isDetail = false, skip = new Set() } = {}) {
  const els = (capture?.elements ?? []).map((e) => ({ ...e, text: clean(e.text || e.label) }));
  const seen = new Set(), text = [], data = [], skipped = [];
  let more = 0;
  // `skip`: normalized texts left out (excluded parts) — listed apart, never counted in the cap or in `more`
  for (const e of interfaceElements(els, { isDetail })) {
    if (!seen.has(e.text)) { if (skip.has(e.text.trim().toLowerCase())) skipped.push(e.text); else if (text.length < 60) text.push(e.text); else more++; }
    seen.add(e.text);
  }
  const iface = new Set(interfaceElements(els, { isDetail }));
  for (const e of els) {
    if (iface.has(e) || !isDataEl(e) || !e.text || e.text.length > 80 || seen.has(e.text)) continue;
    seen.add(e.text);
    if (data.length < 8) data.push(e.text);
  }
  return { text, data, more, skipped };
}

export function flowSpecMd({ flowName, specPath, screens = [], flows = {}, excluded = [] }) {
  // prototype-only parts the designer left unticked: their visible texts and controls are not part of the product
  const left = excluded.filter((x) => !x.include && (x.texts ?? []).length);
  const norm = (t) => String(t ?? '').trim().toLowerCase();
  const gone = new Set(left.flatMap((x) => x.texts.map(norm)));
  const inFlow = new Set(screens.map((s) => s.id));
  const known = new Map((flows.screens ?? []).map((x) => [x.name, x]));
  const where = (e) => {
    const name = targetScreen(e, flows.screens ?? [])?.name;
    if (name) return `navigates to ${name} (#/${name}${inFlow.has(name) ? '' : ', not in this flow — link to the route; the screen need not exist yet'})`;
    return `navigates to ${e.toScreen ?? e.pattern ?? 'another page'} (not captured)${e.to ? ` — parity expects the route #${e.to}` : ''}`;
  };
  const effectText = (e = {}) => (e.kind === 'navigate' ? where(e) : e.kind === 'open' ? `opens ${e.surface ?? 'a surface'}` : e.kind === 'change' ? 'changes the page' : 'does nothing');
  // a control with no name is found by the icon it draws: parity looks for [data-icon="<icon>"] inside the control
  const controlLine = (t) => (!t.control?.name && t.control?.icon
    ? `- (${t.control.role ?? 'control'}, icon "${t.control.icon}") → ${effectText(t.effect)} — put data-icon="${t.control.icon}" on the icon inside the control`
    : `- "${t.control?.name ?? ''}" (${t.control?.role ?? 'control'}) → ${effectText(t.effect)}`);
  const lines = [`# Test flow: ${flowName}`, '', ...(specPath ? [`File: ${specPath}`, ''] : [])];
  for (const s of screens) {
    const allTrs = known.get(s.id)?.transitions ?? [];
    const trs = allTrs.filter((t) => !gone.has(norm(t.control?.name)));
    const all = interfaceText(s.capture, { isDetail: !!known.get(s.id)?.pattern?.includes(':id'), skip: gone });
    const text = all.text, data = all.data;
    // the part's texts as this screen shows them: in its interface text or as a control name
    const seenHere = [...all.text, ...all.skipped, ...allTrs.map((t) => t.control?.name)].filter((t) => t && gone.has(norm(t)));
    const band = excludedBand(s.capture, left.map((x) => x.texts));
    const leftOut = left.map((x) => [x.what ?? x.id, [...new Set(seenHere.filter((t) => x.texts.map(norm).includes(norm(t))).map((t) => String(t).trim()))]]).filter(([, t]) => t.length);
    lines.push(`## ${s.id}`, '', `- Screenshot: ${s.screenshot ?? 'none captured'}`, `- Route: #/${s.id}`, `- Source: ${s.url ?? 'unknown'}`, '',
      'Interface text (must appear exactly):', '', ...(text.length ? text.map((t) => `- ${t}`) : ['- none found']), ...(all.more ? [`- … and ${all.more} more (parity checks all of them)`] : []), '',
      ...(data.length ? ['Sample data (invent your own — parity ignores data rows):', '', ...data.map((t) => `- ${t}`), ''] : []),
      'Controls and what they do:', '', ...(trs.length ? trs.map(controlLine) : ['- none recorded']), '',
      ...(leftOut.length ? ['Left out as prototype-only (do not build):', '', ...leftOut.map(([what, t]) => `- ${what}: ${t.map((x) => `"${x}"`).join(', ')}`), ''] : []),
      ...(band?.top && leftOut.length ? [`The prototype-only bar at the top is ${band.top} px tall: build the screen without it — it starts at the top of the page (parity accounts for the difference).`, ''] : []),
      ...(band?.left && leftOut.length ? [`The prototype-only column at the left is ${band.left} px wide: build the screen without it — it starts at the left edge of the page (parity accounts for the difference).`, ''] : []),
      'Done when:', '', '- `npm run parity` passes for these screens', '- `npm run check` passes', '');
  }
  return lines.join('\n');
}
