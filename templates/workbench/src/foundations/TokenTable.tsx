// The Foundations pages, read from src/tokens/tokens.json (generated): every value as the product paints it,
// grouped the way a design system groups it, each with how it was obtained (label; the evidence on hover).
import type { CSSProperties, ReactNode } from 'react';
import data from '../tokens/tokens.json';
import styles from './TokenTable.module.css';

type Row = { key: string; name: string; cssVar: string; group: string; role: string; value: string; dark?: string; label: string; roleLabel?: string; evidence: string; uses?: string; renamedFrom?: string; paint?: string; also?: string[] };
type TextStyle = { family: string; familyCss: string; size: number; weight: number; lineHeight: number | 'normal'; letterSpacing: number | 'normal'; uses: number; example?: string; tokens: Record<string, string | null | undefined> };
const doc = data as unknown as { tokens: Row[]; textStyles?: TextStyle[] };
const rows = doc.tokens;
const textStyles = doc.textStyles ?? [];

const px = (v: string) => { const m = /^(-?[\d.]+)(px|rem)?$/.exec(v.trim()); return m ? Number(m[1]) * (m[2] === 'rem' ? 16 : 1) : null; };
const byValue = (list: Row[]) => [...list].sort((a, b) => (px(a.value) ?? Infinity) - (px(b.value) ?? Infinity));
const cap = (x: number | 'normal', unit = 'px') => (x === 'normal' ? 'normal' : `${x}${unit}`);

function Label({ r }: { r: Row }) {
  return <span className={styles[r.label] ?? styles.badge} title={r.evidence}>{r.label}</span>;
}

// the purpose line only when it says something the label does not (a person decided what the value is for)
function Notes({ r, children }: { r: Row; children?: ReactNode }) {
  return (
    <>
      {r.uses ? <div className={styles.note}>{r.uses}</div> : null}
      {children}
      {r.roleLabel && r.roleLabel !== r.label ? <div className={styles.note}>purpose: {r.roleLabel}</div> : null}
      {r.renamedFrom ? <div className={styles.note}>renamed from {r.renamedFrom}</div> : null}
    </>
  );
}

const COLOR_GROUPS: { id: string; title: string; about: string }[] = [
  { id: 'text', title: 'Text', about: 'Colours the app paints text with.' },
  { id: 'background', title: 'Backgrounds', about: 'Colours behind content: pages, panels, controls.' },
  { id: 'border', title: 'Borders', about: 'Lines, outlines and focus rings.' },
  { id: 'icon', title: 'Icons and fills', about: 'Fills and strokes of icons and shapes.' },
  { id: 'other', title: 'Other / not used directly', about: 'Painted outside these roles, or only referenced by other tokens.' },
];

function Swatch({ r }: { r: Row }) {
  const darkLiteral = r.dark && !r.dark.startsWith('var(') ? r.dark : null;
  return (
    <li className={styles.tile} title={r.evidence}>
      <span className={styles.swatchLarge} style={{ background: `var(${r.cssVar})` }} />
      <code className={styles.tileName}>{r.cssVar}</code>
      <code className={styles.note}>{r.value}</code>
      <div><Label r={r} /></div>
      <Notes r={r}>
        {r.also?.length ? <div className={styles.note}>also: {r.also.join(', ')}</div> : null}
        {r.dark ? <div className={styles.note}>{darkLiteral ? <span className={styles.darkDot} style={{ background: darkLiteral }} /> : null}dark: <code>{r.dark}</code></div> : null}
      </Notes>
    </li>
  );
}

function Colors({ list }: { list: Row[] }) {
  return (
    <>
      {COLOR_GROUPS.map((g) => {
        const items = list.filter((r) => (r.paint ?? 'other') === g.id);
        if (!items.length) return null;
        return (
          <section key={g.id} className={styles.section}>
            <h2 className={styles.h2}>{g.title} <span className={styles.count}>{items.length}</span></h2>
            <p className={styles.note}>{g.about}</p>
            <ul className={styles.grid}>{items.map((r) => <Swatch key={r.key} r={r} />)}</ul>
          </section>
        );
      })}
    </>
  );
}

function recipe(s: TextStyle) {
  const parts: [string, string | null | undefined, string][] = [
    ['family', s.tokens.fontFamily, s.family], ['size', s.tokens.fontSize, `${s.size}px`], ['weight', s.tokens.fontWeight, String(s.weight)],
    ['line height', s.lineHeight === 'normal' ? undefined : s.tokens.lineHeight, cap(s.lineHeight)], ['letter spacing', s.letterSpacing === 'normal' ? undefined : s.tokens.letterSpacing, cap(s.letterSpacing)],
  ];
  return parts.map(([what, token, value]) => (
    <li key={what} className={styles.recipeItem}>
      <span className={styles.recipeWhat}>{what}</span>
      {token === undefined ? <span>{value}</span> : token === null ? <span className={styles.noToken}>no token <span className={styles.note}>({value})</span></span> : <code>{token}</code>}
    </li>
  ));
}

function TextStyles() {
  if (!textStyles.length) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>Text styles <span className={styles.count}>{textStyles.length}</span></h2>
      <p className={styles.note}>The combinations the app uses, from its captured screens. Sorted by size, then weight.</p>
      <ul className={styles.list}>
        {textStyles.map((s, i) => {
          const use = (name: string, css: string) => (s.tokens[name] ? `var(${s.tokens[name]})` : css);
          const spec: CSSProperties = {
            fontFamily: use('fontFamily', s.familyCss), fontSize: use('fontSize', `${s.size}px`), fontWeight: use('fontWeight', String(s.weight)),
            lineHeight: s.lineHeight === 'normal' ? 'normal' : use('lineHeight', `${s.lineHeight}px`), letterSpacing: s.letterSpacing === 'normal' ? 'normal' : use('letterSpacing', `${s.letterSpacing}px`),
          };
          return (
            <li key={i} className={styles.style}>
              <div className={styles.specimen} style={spec}>{s.example ?? 'Aa'}</div>
              <div className={styles.note}>{s.size}px / {cap(s.lineHeight)} · {s.weight} · {s.family} · {s.uses} {s.uses === 1 ? 'element' : 'elements'}{s.example ? '' : ' · no interface text captured'}</div>
              <ul className={styles.recipe}>{recipe(s)}</ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Scale({ title, about, list, sample }: { title: string; about?: string; list: Row[]; sample: (r: Row) => ReactNode }) {
  if (!list.length) return null;
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{title} <span className={styles.count}>{list.length}</span></h2>
      {about ? <p className={styles.note}>{about}</p> : null}
      <table className={styles.table}>
        <thead><tr><th scope="col">Sample</th><th scope="col">Token</th><th scope="col">Value</th><th scope="col">How it was obtained</th></tr></thead>
        <tbody>
          {list.map((r) => (
            <tr key={r.key}>
              <td className={styles.sampleCell}>{sample(r)}</td>
              <td><code>{r.cssVar}</code></td>
              <td><code>{r.value}</code>{r.dark ? <div className={styles.note}>dark: <code>{r.dark}</code></div> : null}</td>
              <td><Label r={r} /><Notes r={r} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Typography({ list }: { list: Row[] }) {
  const of = (role: string) => list.filter((r) => r.role === role);
  const sizes = byValue(of('fontSize'));
  // a line height is shown at the size it is paired with by name (--text-sm--line-height next to --text-sm), else a neutral 14px
  const sizeFor = (r: Row) => { const base = r.cssVar.replace(/--(line-height|lh|leading)$/, ''); return sizes.find((s) => s.cssVar === base) ? `var(${base})` : '14px'; };
  return (
    <>
      <TextStyles />
      <Scale title="Sizes" list={sizes} sample={(r) => <span style={{ fontSize: `var(${r.cssVar})` }}>Aa The quick brown fox</span>} />
      <Scale title="Weights" list={of('fontWeight')} sample={(r) => <span style={{ fontWeight: `var(${r.cssVar})` }}>Aa The quick brown fox</span>} />
      <Scale title="Line heights" about="Two lines at that height, so the spacing between lines is visible." list={byValue(of('lineHeight'))}
        sample={(r) => <span className={styles.lines} style={{ lineHeight: `var(${r.cssVar})`, fontSize: sizeFor(r) }}><span>First line of text</span><span>Second line of text</span></span>} />
      <Scale title="Letter spacing" list={of('letterSpacing')} sample={(r) => <span style={{ letterSpacing: `var(${r.cssVar})` }}>Aa The quick brown fox</span>} />
      <Scale title="Families" list={of('fontFamily')} sample={(r) => <span style={{ fontFamily: `var(${r.cssVar})` }}>Aa Бб 123</span>} />
    </>
  );
}

function Spacing({ list }: { list: Row[] }) {
  return <Scale title="Spacing" about="Bars are drawn to scale." list={byValue(list)} sample={(r) => <span className={styles.bar} style={{ width: `var(${r.cssVar})` }} />} />;
}

function Tiles({ title, list, sample }: { title: string; list: Row[]; sample: (r: Row) => ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.h2}>{title} <span className={styles.count}>{list.length}</span></h2>
      <ul className={styles.grid}>
        {list.map((r) => (
          <li key={r.key} className={styles.tile} title={r.evidence}>
            {sample(r)}
            <code className={styles.tileName}>{r.cssVar}</code>
            <code className={styles.note}>{r.value}</code>
            <div><Label r={r} /></div>
            <Notes r={r} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Borders({ list }: { list: Row[] }) {
  return <Scale title="Border widths" about="Lines at their real width." list={byValue(list)} sample={(r) => <span className={styles.line} style={{ borderTopWidth: `var(${r.cssVar})` }} />} />;
}

export function TokenTable({ group }: { group: string }) {
  const list = rows.filter((r) => r.group === group);
  if (group === 'color') return <Colors list={list} />;
  if (group === 'type') return <Typography list={list} />;
  if (group === 'space') return <Spacing list={list} />;
  if (group === 'radius') return <Tiles title="Radius" list={byValue(list)} sample={(r) => <span className={styles.box} style={{ borderRadius: `var(${r.cssVar})` }} />} />;
  if (group === 'shadow') return <Tiles title="Shadows" list={list} sample={(r) => <span className={styles.card} style={{ boxShadow: `var(${r.cssVar})` }} />} />;
  if (group === 'border') return <Borders list={list} />;
  return <Scale title={group === 'motion' ? 'Motion' : 'Other'} list={list} sample={() => null} />;
}
