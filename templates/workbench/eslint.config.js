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
);
