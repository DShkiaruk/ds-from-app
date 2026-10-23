// Gate 1. jsx-a11y: <button> for actions, <a> for navigation, every control named (parity finds controls by role and name).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'storybook-static', 'node_modules', 'extraction', 'tools'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  jsxA11y.flatConfigs.recommended,
  { plugins: { 'react-hooks': reactHooks }, rules: reactHooks.configs.recommended.rules },
  { languageOptions: { globals: { ...globals.browser } } },
  // A scrolling region must be focusable for axe (scrollable-region-focusable, the stories gate) and jsx-a11y refused
  // tabIndex={0} on it (the lint gate): both could not pass, so a rebuild left its document viewer unscrollable (found
  // on the first designer's run). <div role="region" aria-label="…" tabIndex={0}> — the pattern axe recommends — passes.
  { rules: { 'jsx-a11y/no-noninteractive-tabindex': ['error', { tags: [], roles: ['tabpanel', 'region'], allowExpressionValues: true }] } },
);
