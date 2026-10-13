// Which capture stands for a screen: the flow map's rule (flows.mjs `base`) — light, wide (>= 1024), no theme class set
// by hand. A capture behind a click that is not a screen of its own (screenKind) is a surface — a menu, a dialog —
// and never stands for a screen. Used by the checkpoint's cards and by the test-flow spec.
export const isSurface = (c) => (c.meta.clicked?.length ?? 0) > 0 && c.meta.screenKind !== 'screen';
const score = (c) => ((c.meta.colorScheme || 'light') === 'light' ? 4 : 0) + (c.meta.viewport?.width >= 1024 ? 2 : 0) + (!c.meta.rootSet ? 1 : 0);

// -> Map(screen id -> best capture)
export function bestCaptures(caps) {
  const best = new Map();
  for (const c of caps) {
    if (isSurface(c)) continue;
    const cur = best.get(c.meta.screen);
    if (!cur || score(c) > score(cur)) best.set(c.meta.screen, c);
  }
  return best;
}
