// The Foundations pages: every token of one group, as the product paints it, with how it was obtained.
import data from '../tokens/tokens.json';
import styles from './TokenTable.module.css';

type Row = { key: string; name: string; cssVar: string; group: string; role: string; value: string; dark?: string; label: string; roleLabel?: string; evidence: string; uses?: string; renamedFrom?: string };
const rows = (data as { tokens: Row[] }).tokens;

function Sample({ r }: { r: Row }) {
  const v = `var(${r.cssVar})`;
  if (r.role === 'color') return <span className={styles.swatch} style={{ background: v }} />;
  if (r.group === 'type' && r.role === 'fontSize') return <span style={{ fontSize: v }}>Aa</span>;
  if (r.group === 'type' && r.role === 'fontFamily') return <span style={{ fontFamily: v }}>Aa Бб 123</span>;
  if (r.group === 'type' && r.role === 'fontWeight') return <span style={{ fontWeight: v }}>Aa</span>;
  if (r.group === 'radius') return <span className={styles.box} style={{ borderRadius: v }} />;
  if (r.group === 'shadow') return <span className={styles.box} style={{ boxShadow: v }} />;
  if (r.group === 'space') return <span className={styles.bar} style={{ width: v }} />;
  return null;
}

export function TokenTable({ group }: { group: string }) {
  const list = rows.filter((r) => r.group === group);
  return (
    <table className={styles.table}>
      <thead>
        <tr><th scope="col">Sample</th><th scope="col">Token</th><th scope="col">Value</th><th scope="col">How it was obtained</th></tr>
      </thead>
      <tbody>
        {list.map((r) => (
          <tr key={r.key}>
            <td><Sample r={r} /></td>
            <td><code>{r.cssVar}</code>{r.renamedFrom ? <div className={styles.note}>renamed from {r.renamedFrom}</div> : null}</td>
            <td><code>{r.value}</code>{r.dark ? <div className={styles.note}>dark: <code>{r.dark}</code></div> : null}</td>
            <td><span className={styles[r.label] ?? styles.badge} title={r.evidence}>{r.label}</span>{r.uses ? <div className={styles.note}>{r.uses}</div> : null}{r.roleLabel === 'derived' ? <div className={styles.note}>purpose derived</div> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
