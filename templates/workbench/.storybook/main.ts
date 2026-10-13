import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/foundations/Overview.mdx', '../src/**/*.stories.@(ts|tsx)'],
  addons: [
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-vitest',
    // hover / pressed / keyboard-focus drawn from the component's own CSS (the States stories)
    'storybook-addon-pseudo-states',
  ],
  // A screen (title Screens/<screen>) and the Foundations pages are pages, not components: no Docs page for them.
  // A component under src/components or a screen-local one (Screens/<screen>/<Component>) keeps its Docs page.
  experimental_indexers: async (existing) => existing.map((indexer) => ({
    ...indexer,
    createIndex: async (fileName, opts) => {
      const entries = await indexer.createIndex(fileName, opts);
      return entries.map((e) => (/^Foundations(\/|$)/.test(e.title ?? '') || /^Screens\/[^/]+$/.test(e.title ?? '') ? { ...e, tags: [...(e.tags ?? []), '!autodocs'] } : e));
    },
  })),
  framework: { name: '@storybook/react-vite', options: {} },
};
export default config;
