import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Constellation } from '@/components/Constellation';
import { DrawDemo } from '@/components/DrawDemo';
import { LiveLog } from '@/components/LiveLog';
import { Shield } from '@/components/Shield';
import { Stepper, stepOf } from '@/components/Stepper';
import { VerdictView } from '@/components/Verdict';
import { ApiError, health, streamScan, type Health } from '@/lib/api';
import { agentColor, agentName } from '@/lib/agents';
import { tr } from '@/lib/i18n';
import { cleanApi, useSettings, type Settings } from '@/lib/settings';
import type { DoneLine, HistoryItem, Lang, PendingScan, TraceMsg } from '@/lib/types';

type View =
  | { name: 'idle' }
  | { name: 'selecting' }
  | { name: 'blocked'; reason: 'page' | 'inject' }
  | { name: 'scanning'; scan: PendingScan; events: TraceMsg[]; startedAt: number }
  | { name: 'done'; scan: PendingScan; done: DoneLine }
  | { name: 'error'; scan: PendingScan; error: ApiError };

type Status = { phase: string; reason?: 'page' | 'inject'; at?: number; windowId?: number };

export default function App() {
  const [settings, update] = useSettings();
  const [view, setView] = useState<View>({ name: 'idle' });
  const [srv, setSrv] = useState<Health | null | undefined>(undefined);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const abort = useRef<AbortController | null>(null);
  const settingsRef = useRef<Settings | null>(null);
  const myWindow = useRef<number | undefined>(undefined);
  settingsRef.current = settings;

  const run = useCallback(async (scan: PendingScan, offline = false) => {
    const s = settingsRef.current;
    if (!s) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    setView({ name: 'scanning', scan, events: [], startedAt: Date.now() });
    try {
      const done = await streamScan(s.apiUrl, scan, { installId: s.installId, lang: s.lang, offline: offline || s.demoMode, signal: ctl.signal },
        (m) => setView((v) => (v.name === 'scanning' && v.scan.id === scan.id ? { ...v, events: [...v.events, m] } : v)));
      if (ctl.signal.aborted) return;
      setView({ name: 'done', scan, done });
      void remember(scan, done);
    } catch (e) {
      if (ctl.signal.aborted && !(e instanceof ApiError)) return;
      setView({ name: 'error', scan, error: e instanceof ApiError ? e : new ApiError(String(e)) });
    }
  }, []);

  async function remember(scan: PendingScan, done: DoneLine) {
    const thumb = scan.image ? await shrink(scan.image, 120).catch(() => undefined) : undefined;
    const item: HistoryItem = {
      id: scan.id, at: Date.now(), label: done.run.verdict.label, risk: done.run.verdict.risk, headline: done.run.verdict.headline,
      page: hostOf(scan.pageUrl), thumb, scanId: done.scan_id,
    };
    const { history: h = [] } = await chrome.storage.local.get('history');
    const next = [item, ...(h as HistoryItem[]).filter((x) => x.id !== item.id)].slice(0, 12);
    await chrome.storage.local.set({ history: next });
    setHistory(next);
  }

  // ---------- wired to the service worker through chrome.storage.session (only for THIS window) ----------
  useEffect(() => {
    if (!settings) return;
    let alive = true;
    const mine = (w?: number) => w === undefined || myWindow.current === undefined || w === myWindow.current;
    const consume = async (scan?: PendingScan) => {
      if (!scan || !mine(scan.windowId)) return;
      const { lastScanId } = await chrome.storage.session.get('lastScanId');
      if (lastScanId === scan.id || Date.now() - scan.createdAt > 5 * 60_000) return;
      await chrome.storage.session.set({ lastScanId: scan.id });
      void run(scan);
    };
    const onStatus = (st?: Status) => {
      if (!st || !mine(st.windowId)) return;
      if (st.phase === 'selecting') { abort.current?.abort(); setView({ name: 'selecting' }); }
      if (st.phase === 'blocked') setView({ name: 'blocked', reason: st.reason ?? 'inject' });
      if (st.phase === 'idle') setView((v) => (v.name === 'selecting' ? { name: 'idle' } : v));
    };
    chrome.windows.getCurrent().then((w) => { myWindow.current = w.id; }).catch(() => {}).finally(() => {
      if (!alive) return;
      chrome.storage.session.get(['pendingScan', 'status']).then(({ pendingScan, status }) => {
        const st = status as Status | undefined;
        if (st?.at && Date.now() - st.at < 60_000) onStatus(st);
        void consume(pendingScan as PendingScan | undefined);
      });
    });
    const on = (ch: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'session') return;
      if (ch.status) onStatus(ch.status.newValue as Status);
      if (ch.pendingScan) void consume(ch.pendingScan.newValue as PendingScan);
    };
    chrome.storage.onChanged.addListener(on);
    chrome.storage.local.get('history').then(({ history: h }) => setHistory((h as HistoryItem[]) ?? []));
    return () => { alive = false; chrome.storage.onChanged.removeListener(on); };
  }, [!!settings, run]);

  // server heartbeat
  useEffect(() => {
    if (!settings) return;
    let alive = true;
    const ping = () => health(settings.apiUrl).then((h) => alive && setSrv(h));
    ping();
    const t = setInterval(ping, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [settings?.apiUrl]);

  if (!settings) return null;
  const L = tr(settings.lang);

  const startSelect = async () => {
    setView({ name: 'selecting' });
    const res = await chrome.runtime.sendMessage({ type: 'raksha:start' }).catch(() => null);
    if (!res?.ok) setView({ name: 'blocked', reason: 'inject' });
  };
  const cancel = () => { abort.current?.abort(); setView({ name: 'idle' }); };

  return (
    <div className="min-h-screen">
      <Header settings={settings} update={update} srv={srv} />
      <main className="px-3.5 pt-3.5">
        <AnimatePresence mode="wait">
          <motion.div key={view.name} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }}>
            {view.name === 'idle' && <Idle L={L} settings={settings} srv={srv} history={history} onStart={startSelect} />}
            {view.name === 'selecting' && <Selecting L={L} onCancel={cancel} />}
            {view.name === 'blocked' && <Blocked L={L} reason={view.reason} onBack={() => setView({ name: 'idle' })} />}
            {view.name === 'scanning' && <Scanning L={L} view={view} onCancel={cancel} />}
            {view.name === 'done' && <VerdictView done={view.done} scan={view.scan} settings={settings} onAgain={startSelect} />}
            {view.name === 'error' && (
              <ErrorCard L={L} error={view.error} canDemo={view.scan.sampleIds.length > 0} apiUrl={settings.apiUrl}
                onRetry={() => run(view.scan)} onDemo={() => run(view.scan, true)} onBack={() => setView({ name: 'idle' })} />
            )}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

// ======================================================================================
function Header({ settings, update, srv }: { settings: Settings; update: (p: Partial<Settings>) => Promise<void>; srv: Health | null | undefined }) {
  const L = tr(settings.lang);
  const dot = srv === undefined ? 'bg-muted/40' : srv ? (srv.ai ? 'bg-safe-bright' : 'bg-care-bright') : 'bg-scam';
  const title = srv === undefined ? '…' : srv ? `${srv.ai ? srv.model : L.noAi} · ${srv.memory === 'cloud' ? L.memCloud : L.memLocal}` : L.serverDown;
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-paper/80 px-3.5 py-2.5 backdrop-blur-xl">
      <div className="flex items-center gap-2.5">
        <Shield size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="font-display text-[1.05rem] font-extrabold tracking-tight">RAKSHA</span>
            <span className={`h-2 w-2 rounded-full ${dot}`} title={title} aria-label={title} />
          </div>
          <p className="truncate text-[.7rem] font-medium text-muted">{L.tag}</p>
        </div>
        <div className="flex rounded-full bg-card p-0.5 ring-1 ring-line" role="group" aria-label="Language">
          {(['en', 'hi', 'te'] as Lang[]).map((l) => (
            <button key={l} onClick={() => update({ lang: l })} aria-pressed={settings.lang === l}
              className={`rounded-full px-2.5 py-1 text-[.74rem] font-bold transition-colors ${settings.lang === l ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>
              {l === 'en' ? 'EN' : l === 'hi' ? 'हि' : 'తె'}
            </button>
          ))}
        </div>
        <button onClick={() => chrome.runtime.openOptionsPage()} className="rounded-full p-1.5 text-muted hover:bg-card hover:text-ink" aria-label={L.settings} title={L.settings}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
        </button>
      </div>
    </header>
  );
}

type Dict = ReturnType<typeof tr>;

function Idle({ L, settings, srv, history, onStart }: { L: Dict; settings: Settings; srv: Health | null | undefined; history: HistoryItem[]; onStart: () => void }) {
  return (
    <div className="flex flex-col gap-3.5 pb-8">
      <section className="grain relative overflow-hidden rounded-[30px] bg-night p-5 text-white shadow-card">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-violet/60 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-marigold/35 blur-3xl" />
        <div className="relative">
          <div className="mb-4 animate-float"><AdIllustration /></div>
          <h1 className="font-display text-[1.7rem] font-extrabold leading-[1.05] tracking-tight">
            {L.heroA} <span className="serif text-[1.15em] font-normal text-marigold">{L.heroB}</span> {L.heroC}
          </h1>
          <p className="mt-2.5 text-[.92rem] leading-snug text-white/75">{L.heroSub}</p>
          <motion.button whileHover={{ scale: 1.015 }} whileTap={{ scale: 0.97 }} onClick={onStart}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-marigold py-3.5 font-display text-[1.05rem] font-bold text-ink shadow-[0_14px_36px_-12px_rgba(255,178,36,.95)]">
            <BoxIcon /> {L.checkAd}
          </motion.button>
          <p className="mt-2.5 text-center text-[.76rem] text-white/60">{L.orPress} <kbd>Alt</kbd> <kbd>Shift</kbd> <kbd>R</kbd></p>
        </div>
      </section>

      <ol className="grid grid-cols-3 gap-2" aria-label="How it works">
        {[L.how1, L.how2, L.how3].map((t, i) => (
          <li key={i} className="rounded-2xl bg-card p-2.5 text-center shadow-card ring-1 ring-line/70">
            <span className="mx-auto mb-1 grid h-7 w-7 place-items-center rounded-full bg-violet-soft font-display text-[.8rem] font-bold text-violet">{i + 1}</span>
            <span className="block text-[.76rem] font-semibold leading-tight">{t}</span>
          </li>
        ))}
      </ol>

      {srv === null && (
        <div className="rounded-2xl bg-scam-soft p-3.5 text-[.88rem] ring-1 ring-scam/15">
          <b className="text-scam">{L.serverDown}</b>
          <p className="text-ink-2">{L.serverDownBody}</p>
          <p className="mt-1 font-mono text-[.72rem] text-muted">{cleanApi(settings.apiUrl)}</p>
        </div>
      )}
      {srv && !srv.ai && <p className="rounded-2xl bg-care-soft p-3 text-[.85rem] text-care ring-1 ring-care-bright/20">{L.noAi}</p>}

      {history.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 font-display text-[.72rem] font-bold uppercase tracking-[.12em] text-muted">{L.recent}</h2>
          <ul className="flex flex-col gap-2">
            {history.slice(0, 5).map((h) => (
              <li key={h.id} className="flex items-center gap-2.5 rounded-2xl bg-card p-2 shadow-card ring-1 ring-line/70">
                {h.thumb ? <img src={h.thumb} alt="" className="h-11 w-11 rounded-xl object-cover" /> : <div className="h-11 w-11 rounded-xl bg-violet-soft" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[.85rem] font-semibold">{h.headline}</p>
                  <p className="truncate text-[.7rem] text-muted">{h.page} · {new Date(h.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[.68rem] font-bold text-white ${h.label === 'FRAUD' ? 'bg-scam' : h.label === 'SUSPICIOUS' ? 'bg-care-bright' : 'bg-safe-bright'}`}>{L[h.label]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex items-center justify-center gap-4">
        <button onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('/welcome.html') })}
          className="flex items-center gap-1.5 rounded-full bg-card px-3.5 py-2 text-[.82rem] font-bold text-ink shadow-card ring-1 ring-line hover:ring-violet/40">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 010 7" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
          {L.tutorial}
        </button>
        <a href={`${cleanApi(settings.apiUrl)}/demo`} target="_blank" rel="noreferrer"
          className="text-[.82rem] font-semibold text-violet underline decoration-violet/30 underline-offset-4">{L.practice} ↗</a>
      </div>
    </div>
  );
}

function Selecting({ L, onCancel }: { L: Dict; onCancel: () => void }) {
  return (
    <section className="rounded-[30px] bg-card p-5 text-center shadow-card ring-1 ring-line/70">
      <DrawDemo />
      <h2 className="mt-4 font-display text-[1.2rem] font-bold leading-tight">{L.selecting}</h2>
      <p className="mt-1 text-[.9rem] text-muted">{L.selectingHint}</p>
      <button onClick={onCancel} className="mt-5 rounded-full px-5 py-2 font-semibold text-muted ring-1 ring-line hover:text-ink">{L.cancel}</button>
    </section>
  );
}

function Blocked({ L, reason, onBack }: { L: Dict; reason: 'page' | 'inject'; onBack: () => void }) {
  const [granted, setGranted] = useState(false);
  const allow = async () => setGranted(await chrome.permissions.request({ origins: ['<all_urls>'] }).catch(() => false));
  return (
    <section className="rounded-[30px] bg-card p-5 shadow-card ring-1 ring-line/70">
      {reason === 'page' ? (
        <>
          <h2 className="font-display text-[1.1rem] font-bold">{L.cantPage}</h2>
          <p className="mt-1 text-[.92rem] text-muted">{L.cantPageBody}</p>
        </>
      ) : (
        <>
          <div className="relative mb-4 h-20 rounded-2xl bg-violet-soft">
            <motion.div className="absolute right-7 top-3" animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 1.2 }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="#6D4AFF"><path d="M12 2l7 9h-4v11H9V11H5z" /></svg>
            </motion.div>
            <div className="absolute bottom-3 left-3 flex items-center gap-2 text-[.8rem] font-semibold text-muted"><Shield size={24} /> toolbar</div>
          </div>
          <p className="text-[1rem] font-semibold leading-snug">{L.clickIcon}</p>
          <button onClick={allow} className="mt-3 w-full rounded-2xl px-3 py-2.5 text-[.85rem] font-semibold ring-1 ring-line">
            {granted ? '✓ ' : ''}{L.allowAll}
          </button>
        </>
      )}
      <button onClick={onBack} className="mt-3 w-full rounded-2xl bg-ink py-3 font-semibold text-white">OK</button>
    </section>
  );
}

function Scanning({ L, view, onCancel }: { L: Dict; view: Extract<View, { name: 'scanning' }>; onCancel: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [talk, setTalk] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const step = stepOf(view.events);
  const { scan } = view;
  const latest = [...view.events].reverse().find((m) => m.from !== 'blackboard' && m.text);
  return (
    <div className="flex flex-col gap-3 pb-8">
      <section className="grain relative overflow-hidden rounded-[30px] bg-night p-4 text-white shadow-card">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-violet/50 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="relative h-16 w-16 flex-none overflow-hidden rounded-2xl bg-white/10 ring-2 ring-white/20">
            {scan.image ? <img src={scan.image} alt={L.youSelected} className="h-full w-full object-cover" />
              : <p className="p-1.5 text-[.55rem] leading-tight text-white/70">{scan.text.slice(0, 90)}</p>}
            <div className="absolute inset-x-0 top-0 h-2 animate-scan bg-gradient-to-b from-transparent via-marigold to-transparent blur-[1px]" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[1.1rem] font-bold leading-tight">{L.scanning}<span className="animate-breathe">…</span></p>
            <p className="text-[.74rem] text-white/55">{((now - view.startedAt) / 1000).toFixed(0)}{L.secs}{scan.links.length ? ` · ${scan.links.length} ${L.linksFound}` : ''}</p>
          </div>
        </div>
        <div className="relative mt-3.5"><Stepper current={step} labels={{ read: L.read, check: L.check, debate: L.debate, verdict: L.verdict }} /></div>
        <div className="relative"><Constellation events={view.events} done={false} /></div>
        <AnimatePresence mode="wait">
          {latest && (
            <motion.div key={latest.step} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}
              className="relative rounded-2xl bg-white/[.07] px-3 py-2.5 ring-1 ring-white/10">
              <p className="flex items-center gap-1.5 text-[.7rem] font-bold uppercase tracking-wider" style={{ color: agentColor(latest.from) }}>
                <span className="h-2 w-2 rounded-full" style={{ background: agentColor(latest.from) }} />{L.now} · {agentName(latest.from)}
              </p>
              <p className="mt-0.5 line-clamp-3 text-[.9rem] leading-snug text-white/90">{latest.text}</p>
            </motion.div>
          )}
        </AnimatePresence>
        <button onClick={() => setTalk(!talk)} className="relative mt-2.5 text-[.78rem] font-semibold text-white/60 underline decoration-white/25 underline-offset-4 hover:text-white">
          {talk ? L.hideTalk : `${L.showTalk} (${view.events.length})`}
        </button>
        {talk && <div className="relative mt-2"><LiveLog events={view.events} /></div>}
      </section>
      <button onClick={onCancel} className="mx-auto rounded-full px-4 py-2 text-[.88rem] font-semibold text-muted hover:text-ink">{L.cancel}</button>
    </div>
  );
}

function ErrorCard({ L, error, canDemo, apiUrl, onRetry, onDemo, onBack }: {
  L: Dict; error: ApiError; canDemo: boolean; apiUrl: string; onRetry: () => void; onDemo: () => void; onBack: () => void;
}) {
  const offline = error.kind === 'offline';
  const msg = offline ? L.serverDown : error.message === 'timeout' ? L.tooSlow : error.message;
  return (
    <section className="rounded-[30px] bg-card p-5 shadow-card ring-1 ring-line/70" role="alert">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-care-soft text-care">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.4v.1" /></svg>
      </div>
      <h2 className="font-display text-[1.1rem] font-bold leading-snug">{msg}</h2>
      {offline && <p className="mt-1 text-[.9rem] text-muted">{L.serverDownBody}<br /><span className="font-mono text-[.72rem]">{cleanApi(apiUrl)}</span></p>}
      <div className="mt-5 flex flex-col gap-2">
        {error.kind !== 'input' && <button onClick={onRetry} className="rounded-2xl bg-ink py-3 font-semibold text-white">{L.retry}</button>}
        {canDemo && <button onClick={onDemo} className="rounded-2xl py-3 font-semibold ring-1 ring-line">{L.demoMode}</button>}
        <button onClick={onBack} className="py-2 font-semibold text-muted">{L.checkAnother}</button>
      </div>
    </section>
  );
}

// ---------- small visuals ----------
function AdIllustration() {
  return (
    <svg width="74" height="62" viewBox="0 0 74 62" aria-hidden="true">
      <rect x="4" y="6" width="46" height="50" rx="10" fill="#fff" />
      <rect x="10" y="12" width="34" height="15" rx="5" fill="#E11D48" />
      <text x="27" y="23.2" textAnchor="middle" fontSize="8.5" fontWeight="800" fill="#fff" fontFamily="system-ui">₹15 L!</text>
      <rect x="10" y="32" width="26" height="3.6" rx="1.8" fill="#ECE7F5" />
      <rect x="10" y="38.5" width="20" height="3.6" rx="1.8" fill="#ECE7F5" />
      <rect x="10" y="45.5" width="19" height="5.5" rx="2.7" fill="#6D4AFF" />
      <rect x="0.5" y="2.5" width="53" height="57" rx="13" fill="none" stroke="#FFB224" strokeWidth="2.5" strokeDasharray="6 5" />
      <circle cx="56" cy="44" r="12" fill="#141131" stroke="#FFB224" strokeWidth="3" />
      <path d="M64.5 52.5l6 6" stroke="#FFB224" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

const BoxIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
    <path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3" />
    <path d="M10 10l5 1.8-2 1.1-1.1 2z" fill="currentColor" />
  </svg>
);

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

async function shrink(dataUrl: string, edge: number): Promise<string> {
  const img = new Image();
  img.src = dataUrl;
  await img.decode();
  const k = Math.min(1, edge / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.7);
}
