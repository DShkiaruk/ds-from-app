// One route per screen of the product: #/<screen name as captured> — the route tools/parity.mjs opens for it.
import { useEffect, useState } from 'react';
import { screens } from './screens';

const current = () => decodeURIComponent(window.location.hash.replace(/^#\/?/, '').split('?')[0]);

export function App() {
  const [id, setId] = useState(current);
  useEffect(() => {
    const on = () => setId(current());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const Screen = screens[id];
  return Screen ? <Screen /> : <ScreenIndex />;
}

// Not a product screen: the list a designer opens at the root. Browser-default styles on purpose (no tokens needed).
function ScreenIndex() {
  const ids = Object.keys(screens);
  return (
    <main data-workbench-index>
      <h1>Screens</h1>
      {ids.length ? (
        <ul>
          {ids.map((i) => (
            <li key={i}>
              <a href={`#/${encodeURIComponent(i)}`}>{i}</a>
            </li>
          ))}
        </ul>
      ) : (
        <p>No screens yet. The build loop adds them (plan/IMPLEMENTATION_PLAN.md).</p>
      )}
    </main>
  );
}
