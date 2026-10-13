import type { Preview } from '@storybook/react-vite';
import '../src/tokens/index.css';
import '../src/global.css';
import meta from '../src/tokens/tokens.json';

// A theme switch only when the product has a dark theme (tools/tokens-css.mjs writes `themes.dark`).
const dark = Boolean((meta as { themes?: { dark?: boolean } }).themes?.dark);

const preview: Preview = {
  // a Docs page for every component (what it is, its props, where the app uses it); main.ts takes it off Screens and Foundations
  tags: ['autodocs'],
  ...(dark
    ? {
        globalTypes: { theme: { description: 'Theme', toolbar: { title: 'Theme', icon: 'mirror', dynamicTitle: true, items: [{ value: 'light', title: 'Light' }, { value: 'dark', title: 'Dark' }] } } },
        initialGlobals: { theme: 'light' },
        decorators: [(Story, ctx) => { document.documentElement.dataset.theme = ctx.globals.theme ?? 'light'; return Story(); }],
      }
    : {}),
  parameters: {
    layout: 'padded',
    options: { storySort: { order: ['Foundations', 'Components', 'Screens'] } },
    backgrounds: { disabled: true },
    // accessibility is a test: a violation fails `npm run test:stories`
    a11y: { test: 'error' },
  },
};
export default preview;
