import { useEffect, useState } from 'react';
import type { Lang, TextSize } from './types';

export interface Settings {
  apiUrl: string;
  lang: Lang;
  textSize: TextSize;
  familyPhone: string;       // digits with country code, e.g. 919876543210
  installId: string;
  onboarded: boolean;
  demoMode: boolean;         // replay saved runs for demo-feed ads (no internet / no AI needed)
}

export const DEFAULTS: Settings = {
  apiUrl: 'http://localhost:8000', lang: 'en', textSize: 'lg', familyPhone: '', installId: '', onboarded: false, demoMode: false,
};

export async function getSettings(): Promise<Settings> {
  const { settings } = await chrome.storage.local.get('settings');
  const s = { ...DEFAULTS, ...(settings ?? {}) } as Settings;
  if (!s.installId) {
    s.installId = crypto.randomUUID();
    await chrome.storage.local.set({ settings: s });
  }
  return s;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

/** React hook: live settings shared by the side panel, the tutorial and the options page. */
export function useSettings(): [Settings | null, (p: Partial<Settings>) => Promise<void>] {
  const [s, setS] = useState<Settings | null>(null);
  useEffect(() => {
    getSettings().then(setS);
    const on = (ch: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && ch.settings) setS({ ...DEFAULTS, ...(ch.settings.newValue as Settings) });
    };
    chrome.storage.onChanged.addListener(on);
    return () => chrome.storage.onChanged.removeListener(on);
  }, []);
  useEffect(() => {
    if (!s) return;
    document.documentElement.dataset.size = s.textSize;
    document.documentElement.lang = s.lang;
  }, [s?.textSize, s?.lang]);
  return [s, async (p) => { setS(await saveSettings(p)); }];
}

export const cleanApi = (u: string) => (u || DEFAULTS.apiUrl).trim().replace(/\/+$/, '');
