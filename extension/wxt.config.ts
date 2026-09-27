import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

// RAKSHA browser extension (Chrome / Edge / Brave, Manifest V3).
// Privacy by design: no content script runs until the user clicks RAKSHA (activeTab + scripting),
// so the extension never reads pages on its own and needs no "read all sites" permission at install.
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({ plugins: [tailwindcss()] }),
  manifest: {
    name: 'RAKSHA · Scam Ad Checker',
    short_name: 'RAKSHA',
    description:
      'Before you click an investment ad, draw a box around it. 11 AI agents check it against SEBI and RBI records and explain the answer in plain words.',
    permissions: ['activeTab', 'scripting', 'sidePanel', 'storage', 'contextMenus'],
    host_permissions: ['http://localhost/*', 'http://127.0.0.1/*'],
    optional_host_permissions: ['<all_urls>'],
    action: { default_title: 'Check an ad with RAKSHA (Alt+Shift+R)' },
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+R', mac: 'Alt+Shift+R' },
        description: 'Check an ad on this page',
      },
    },
  },
});
