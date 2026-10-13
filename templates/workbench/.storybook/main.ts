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
  framework: { name: '@storybook/react-vite', options: {} },
};
export default config;
