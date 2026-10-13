// The States story's layout: every state of a component drawn with its name under it (hover, focus-visible, active (pressed),
// disabled, the app's own: selected, open). A state the capture never reached is named and says so instead of an invented look.
// The pseudo states (hover / focus-visible / active) are drawn by storybook-addon-pseudo-states on the element with the state's id.
import type { ReactNode } from 'react';
import styles from './StateGrid.module.css';

export type StateItem = {
  name: string;
  /** The component in this state. Missing: the capture never reached the state. */
  node?: ReactNode;
  /** 'hover' | 'focus-visible' | 'active': the wrapper gets this id, and `pseudoStates()` forces the state on the element inside it. */
  id?: string;
};

/** The `parameters.pseudo` for a States story that uses StateGrid; `inner` is what inside each wrapper takes the state ('> *': the component's root, 'button': an element in a composite). */
export function pseudoStates(inner = '> *') {
  return { hover: [`#hover ${inner}`], focusVisible: [`#focus-visible ${inner}`], active: [`#active ${inner}`] };
}

export function StateGrid({ states }: { states: StateItem[] }) {
  return (
    <ul className={styles.grid}>
      {states.map((s) => (
        <li key={s.name} className={styles.cell}>
          <div id={s.id} className={s.node === undefined ? styles.missing : styles.stage}>
            {s.node === undefined ? <span className={styles.note}>not reached (NEEDS-STATE)</span> : s.node}
          </div>
          <span className={styles.name}>{s.name}</span>
        </li>
      ))}
    </ul>
  );
}
