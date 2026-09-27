import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/assets/theme.css';
import { Seg } from '@/components/Seg';
import { Shield } from '@/components/Shield';
import { health, type Health } from '@/lib/api';
import { tr } from '@/lib/i18n';
import { cleanApi, useSettings } from '@/lib/settings';
import type { Lang, TextSize } from '@/lib/types';

function Options() {
  const [s, update] = useSettings();
  const [test, setTest] = useState<Health | null | 'wait' | undefined>();
  if (!s) return null;
  const L = tr(s.lang);
  const check = async () => { setTest('wait'); setTest(await health(s.apiUrl)); };
  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <div className="flex items-center gap-3"><Shield size={40} /><h1 className="font-display text-2xl font-extrabold">RAKSHA · {L.settings}</h1></div>
      <div className="mt-6 flex flex-col gap-4">
        <Field label="Language / भाषा / భాష">
          <Seg value={s.lang} onChange={(v) => update({ lang: v as Lang })} options={[['en', 'English'], ['hi', 'हिंदी'], ['te', 'తెలుగు']]} />
        </Field>
        <Field label="Text size">
          <Seg value={s.textSize} onChange={(v) => update({ textSize: v as TextSize })} options={[['md', 'A'], ['lg', 'A+'], ['xl', 'A++']]} />
        </Field>
        <Field label="Family member's WhatsApp number (with country code, optional)">
          <input className="w-full rounded-xl border border-line bg-white px-3 py-2" inputMode="tel" placeholder="91 98765 43210"
            defaultValue={s.familyPhone} onBlur={(e) => update({ familyPhone: e.target.value.replace(/[^\d]/g, '') })} />
        </Field>
        <Field label="RAKSHA server address">
          <div className="flex gap-2">
            <input className="w-full rounded-xl border border-line bg-white px-3 py-2 font-mono text-sm" defaultValue={s.apiUrl}
              onBlur={(e) => update({ apiUrl: cleanApi(e.target.value) })} />
            <button onClick={check} className="rounded-xl bg-violet px-3 font-semibold text-white">Test</button>
          </div>
          {test === 'wait' && <p className="mt-1 text-sm text-muted">Checking…</p>}
          {test === null && <p className="mt-1 text-sm text-scam">{L.serverDown}</p>}
          {test && test !== 'wait' && <p className="mt-1 text-sm text-safe">✓ Connected · AI {test.ai ? test.model : 'off'} · memory {test.memory} · voice {test.tts ? 'natural' : 'browser'}</p>}
        </Field>
        <Field label="Demo mode (replays saved checks for the demo-feed ads; works without internet)">
          <Seg value={s.demoMode ? 'on' : 'off'} onChange={(v) => update({ demoMode: v === 'on' })} options={[['off', 'Off'], ['on', 'On']]} />
        </Field>
        <button onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('/welcome.html') })} className="rounded-xl border border-line bg-white py-3 font-semibold">
          {L.tutorial} ↗
        </button>
        <p className="text-sm text-muted">Privacy: RAKSHA reads a page only when you click it, and sends only the box you draw (plus the links and text inside it) to your RAKSHA server.</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold text-muted">{label}</span>{children}</label>;
}
createRoot(document.getElementById('root')!).render(<StrictMode><Options /></StrictMode>);
