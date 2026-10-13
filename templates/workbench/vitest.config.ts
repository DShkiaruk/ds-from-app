// Stories as tests: every story renders in a real browser and fails on an accessibility error (.storybook/preview.ts).
// The designer's own Google Chrome when it is installed, otherwise Playwright's Chromium (npx playwright install chromium).
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import viteConfig from './vite.config';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const chrome = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].some((p) => existsSync(p));

export default mergeConfig(viteConfig, defineConfig({
  test: {
    projects: [{
      extends: true,
      plugins: [storybookTest({ configDir: path.join(dirname, '.storybook') })],
      test: {
        name: 'storybook',
        browser: { enabled: true, provider: playwright(chrome ? { launchOptions: { channel: 'chrome' } } : {}), headless: true, instances: [{ browser: 'chromium' }] },
      },
    }],
  },
}));
