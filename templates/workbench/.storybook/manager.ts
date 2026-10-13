import { addons } from 'storybook/manager-api';
import { create } from 'storybook/theming';
import meta from '../src/tokens/tokens.json';

addons.setConfig({ theme: create({ base: 'light', brandTitle: `${(meta as { product?: string }).product ?? 'Product'} · Workbench` }) });
