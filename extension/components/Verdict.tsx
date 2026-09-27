import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { privateUrl, sendReport, speak, stopSpeaking, translate } from '@/lib/api';
import { agentColor, agentName } from '@/lib/agents';
import { tr } from '@/lib/i18n';
import type { Settings } from '@/lib/settings';
import type { DoneLine, Evidence, Lang, PendingScan, Run } from '@/lib/types';

type Tone = 'FRAUD' | 'SUSPICIOUS' | 'LIKELY_SAFE' | 'NOT_AD';
const TONE: Record<Tone, { strong: string; soft: string; glow: string; text: string; ring: string }> = {
  FRAUD: { strong: 'bg-scam', soft: 'bg-scam-soft', glow: 'rgba(225,29,72,.28)', text: 'text-scam', ring: 'ring-scam/15' },
  SUSPICIOUS: { strong: 'bg-care-bright', soft: 'bg-care-soft', glow: 'rgba(245,158,11,.3)', text: 'text-care', ring: 'ring-care-bright/20' },
  LIKELY_SAFE: { strong: 'bg-safe-bright', soft: 'bg-safe-soft', glow: 'rgba(16,185,129,.28)', text: 'text-safe', ring: 'ring-safe-bright/20' },
  NOT_AD: { strong: 'bg-none', soft: 'bg-none-soft', glow: 'rgba(71,85,105,.2)', text: 'text-none', ring: 'ring-none/15' },
};

const pick = (lang: Lang, en?: string, hi?: string) => (lang === 'hi' && hi ? hi : en ?? '');
const pickList = (lang: Lang, en?: string[], hi?: string[]) => (lang === 'hi' && hi?.length ? hi : en ?? []);

function linkFacts(run: Run) {
  const go = run.evidence.filter((e) => e.agent === 'link');
  const reveals = go.filter((e) => e.finding.startsWith('Before you click')).map((e) => {
    const m = e.finding.match(/^Before you click: (?:the button “(.+?)”|the link) (.+)$/);
    const rest = m?.[2] ?? e.finding;
    const dom = rest.match(/really goes to ([^\s(]+)/)?.[1];
    return { button: m?.[1] ?? '', domain: dom ?? '', text: dom ? '' : rest };
  });
  return { reveals, warnings: go.filter((e) => e.supports === 'FRAUD') };
}

/** Telugu comes from /v2/translate; English stays on screen until it arrives. */
function useLocalized(run: Run, lang: Lang, api: string) {
  const [te, setTe] = useState<Run['verdict'] | null>(null);
  useEffect(() => {
    setTe(null);
    if (lang !== 'te') return;
    const v = run.verdict;
    let alive = true;
    translate(api, [v.headline, ...v.reasons, ...v.what_to_do], 'te').then((out) => {
      if (!alive || !out) return;
      const r = v.reasons.length;
      setTe({ ...v, headline: out[0] ?? v.headline, reasons: out.slice(1, 1 + r), what_to_do: out.slice(1 + r) });
    });
    return () => { alive = false; };
  }, [run, lang, api]);
  return te ?? run.verdict;
}

function familyText(v: Run['verdict'], tone: Tone, lang: Lang, pageUrl: string) {
  const L = tr(lang);
  const reasons = pickList(lang, v.reasons, v.reasons_hi).slice(0, 3).map((r) => `- ${r}`).join('\n');
  return `${L.familyMsgIntro}: *${L[tone]}* (${L.risk} ${v.risk}/100)\n"${pick(lang, v.headline, v.headline_hi)}"\n\n${reasons}` +
    (pageUrl ? `\n\n${pageUrl}` : '') + (v.label === 'FRAUD' ? `\n\n${L.helpline}` : '');
}

function complaintText(run: Run, pageUrl: string) {
  const c = run.claims ?? {};
  const list = (k: string) => (Array.isArray(c[k]) && c[k].length ? c[k].join(', ') : '—');
  const when = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
  return [
    'To: National Cyber Crime Reporting Portal (cybercrime.gov.in) / Helpline 1930',
    'Subject: Suspected fraudulent investment advertisement targeting senior citizens',
    '',
    `I saw this advertisement on ${when} IST${pageUrl ? ` at ${pageUrl}` : ''}.`,
    `Advertiser named in the ad: ${c.advertiser ?? '—'}`,
    `Promised return: ${c.promised_return ?? '—'}`,
    `Websites shown: ${list('links')}`,
    `Where the ad's buttons actually lead: ${list('final_domains')}`,
    `Phone / WhatsApp numbers: ${list('phones')}`,
    `UPI IDs: ${list('upi_ids')}`,
    `Registration numbers claimed: ${list('reg_numbers')}`,
    '',
    'Why it appears fraudulent (automated check by RAKSHA against SEBI/RBI public records):',
    ...run.verdict.reasons.map((r, i) => `${i + 1}. ${r}`),
    '',
    `Ad text: "${(run.ad_text || '').slice(0, 700)}"`,
  ].join('\n');
}

export function VerdictView({ done, scan, settings, onAgain }: { done: DoneLine; scan: PendingScan; settings: Settings; onAgain: () => void }) {
  const run = done.run;
  const v = useLocalized(run, settings.lang, settings.apiUrl);
  const lang = settings.lang;
  const L = tr(lang);
  const tone: Tone = v.not_investment ? 'NOT_AD' : v.label;
  const T = TONE[tone];
  const ev = Object.fromEntries(run.evidence.map((e) => [e.id, e])) as Record<string, Evidence>;
  const { reveals, warnings } = linkFacts(run);
  const community = run.evidence.filter((e) => e.agent === 'community');
  const page = privateUrl(scan.pageUrl);
  const [speaking, setSpeaking] = useState(false);
  const [openReason, setOpenReason] = useState<number | null>(null);
  const [reported, setReported] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHow, setShowHow] = useState(false);
  const todo = pickList(lang, v.what_to_do, v.what_to_do_hi);
  const reasons = pickList(lang, v.reasons, v.reasons_hi);
  const cs = v.charges_summary ?? {};

  useEffect(() => () => stopSpeaking(), []);

  async function readAloud() {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    setSpeaking(true);
    await speak(settings.apiUrl, `${L[tone]}. ${pick(lang, v.headline, v.headline_hi)} ${reasons.join(' ')} ${todo[0] ?? ''}`, lang);
    setTimeout(() => setSpeaking(false), 1200);
  }
  const toFamily = () => chrome.tabs.create({
    url: `https://wa.me/${settings.familyPhone.replace(/\D/g, '')}?text=${encodeURIComponent(familyText(v, tone, lang, page))}`,
  });
  async function report(label: 'scam' | 'safe') {
    if (!done.scan_id) return;
    setReported(label);
    try { await sendReport(settings.apiUrl, done.scan_id, label, settings.installId); } catch { /* best effort */ }
  }
  async function copyComplaint() {
    await navigator.clipboard.writeText(complaintText(run, page));
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  return (
    <div className="flex flex-col gap-3 pb-28">
      {/* ── 1. the answer, readable in one glance ── */}
      <motion.section initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
        className={`relative overflow-hidden rounded-[28px] ${T.soft} p-4 ring-1 ${T.ring}`}>
        <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full blur-3xl" style={{ background: T.glow }} />
        <div className="relative flex items-center gap-3">
          <motion.span initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ delay: 0.12, type: 'spring', stiffness: 380, damping: 16 }}
            className={`grid h-14 w-14 flex-none place-items-center rounded-2xl ${T.strong} text-white shadow-lg`}>
            <VerdictIcon tone={tone} />
          </motion.span>
          <div className="min-w-0 flex-1">
            <h2 role="status" className={`font-display text-[1.9rem] font-extrabold leading-none tracking-tight ${T.text}`}>{L[tone]}</h2>
            {tone !== 'NOT_AD' && <p className="mt-1 text-[.8rem] font-semibold text-muted">{L.risk} {v.risk}/100</p>}
          </div>
          {scan.image && <img src={scan.image} alt={L.youSelected} className="h-14 w-14 flex-none rounded-xl object-cover ring-2 ring-white" />}
        </div>
        <p className="relative mt-3 text-[1.14rem] font-semibold leading-snug text-ink">{pick(lang, v.headline, v.headline_hi)}</p>
        {tone !== 'NOT_AD' && <RiskMeter risk={v.risk} low={L.meterLow} high={L.meterHigh} />}
        {done.replayed && <p className="relative mt-2 text-[.72rem] font-semibold text-muted">{L.replayed}</p>}
      </motion.section>

      {/* ── 2. what to do: the first line is the one that matters ── */}
      {todo.length > 0 && (
        <Card title={L.whatToDo} delay={0.08}>
          <p className={`flex gap-2 text-[1.02rem] font-bold leading-snug ${T.text}`}><Arrow />{todo[0]}</p>
          {todo.slice(1).map((t, i) => <p key={i} className="pl-6 text-[.95rem] leading-snug text-ink-2">{t}</p>)}
          {(v.label === 'FRAUD' || v.label === 'SUSPICIOUS') && !v.not_investment && (
            <div className="mt-1 flex flex-wrap gap-2 pl-6">
              <button onClick={copyComplaint} className="rounded-full bg-paper px-3 py-1.5 text-[.82rem] font-semibold ring-1 ring-line">
                {copied ? `✓ ${L.copied}` : L.copyComplaint}
              </button>
              <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer" className="rounded-full bg-paper px-3 py-1.5 text-[.82rem] font-semibold text-ink no-underline ring-1 ring-line">cybercrime.gov.in ↗</a>
            </div>
          )}
        </Card>
      )}

      {/* ── 3. two big actions ── */}
      {!v.not_investment && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={readAloud} className="flex items-center justify-center gap-2 rounded-2xl bg-ink px-3 py-3 font-semibold text-white shadow-card active:scale-[.98]">
            <SpeakerIcon on={speaking} /> {speaking ? L.stop : L.readAloud}
          </button>
          <button onClick={toFamily} className="flex items-center justify-center gap-2 rounded-2xl bg-[#1FAF5A] px-3 py-3 font-semibold text-white shadow-card active:scale-[.98]">
            <ChatIcon /> {L.sendFamily}
          </button>
        </div>
      )}

      {/* ── 4. why ── */}
      {!v.not_investment && reasons.length > 0 && (
        <Card title={L.why} delay={0.14}>
          <ol className="flex flex-col gap-2.5">
            {reasons.map((r, i) => {
              const ids = v.reason_evidence?.[i] ?? [];
              return (
                <li key={i}>
                  <button onClick={() => setOpenReason(openReason === i ? null : i)} className="flex w-full gap-2.5 text-left" aria-expanded={openReason === i}>
                    <span className={`mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full text-[.75rem] font-bold text-white ${T.strong}`}>{i + 1}</span>
                    <span className="text-[.98rem] leading-snug">{r}
                      {ids.length > 0 && <span className="ml-1.5 whitespace-nowrap text-[.72rem] font-bold text-violet">{L.evidence} {openReason === i ? '▴' : '▾'}</span>}
                    </span>
                  </button>
                  <AnimatePresence>
                    {openReason === i && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="ml-8 mt-2 flex flex-col gap-1.5">
                          {ids.map((id) => ev[id] && (
                            <div key={id} className="rounded-xl bg-paper p-2.5 text-[.8rem] ring-1 ring-line">
                              <span className="font-bold" style={{ color: agentColor(ev[id].agent) }}>{agentName(ev[id].agent)}</span>
                              <p className="leading-snug">{ev[id].finding}</p>
                              {ev[id].source && <p className="mt-0.5 text-[.7rem] text-muted">{ev[id].source}</p>}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {/* ── 5. where the buttons really go ── */}
      {reveals.length > 0 && (
        <Card title={L.buttonGoes} delay={0.2}>
          {reveals.map((r, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-2xl bg-violet-soft px-3 py-2.5">
              <LinkIcon />
              <div className="min-w-0">
                {r.button && <p className="text-[.76rem] font-semibold text-muted">“{r.button}”</p>}
                {r.domain ? <p className="break-all font-display text-[1rem] font-bold leading-tight">{r.domain}</p>
                  : <p className="text-[.9rem] font-semibold leading-snug">{r.text}</p>}
              </div>
            </div>
          ))}
          {warnings.map((w) => <Flag key={w.id} text={w.finding} />)}
        </Card>
      )}

      {/* ── 6. other families ── */}
      {community.length > 0 && (
        <Card title={L.community} delay={0.24}>
          {community.map((e) => e.supports === 'FRAUD' ? <Flag key={e.id} text={e.finding} /> : <Good key={e.id} text={e.finding} />)}
        </Card>
      )}

      {/* ── 7. teach the memory ── */}
      {done.scan_id && !v.not_investment && (
        <Card title={L.wasRight} delay={0.28}>
          {reported ? <p className="font-semibold text-safe">✓ {L.thanks}</p> : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => report('scam')} className="rounded-2xl bg-scam-soft px-3 py-2.5 font-bold text-scam ring-1 ring-scam/15">{L.reportScam}</button>
              <button onClick={() => report('safe')} className="rounded-2xl bg-safe-soft px-3 py-2.5 font-bold text-safe ring-1 ring-safe-bright/20">{L.reportSafe}</button>
            </div>
          )}
        </Card>
      )}

      {/* ── 8. for the curious (and the jury) ── */}
      {!v.not_investment && (
        <section className="rounded-3xl bg-card/80 p-3.5 ring-1 ring-line">
          <button className="flex w-full items-center justify-between text-[.92rem] font-bold" onClick={() => setShowHow(!showHow)} aria-expanded={showHow}>
            <span>{L.howDecided}</span><span className="text-muted">{showHow ? '−' : '+'}</span>
          </button>
          <p className="mt-0.5 text-[.76rem] text-muted">
            {new Set(run.trace.map((m) => m.from).filter((f) => f !== 'blackboard' && f !== 'user')).size} {L.agents} · {run.trace.filter((m) => m.type === 'handoff').length} {L.handoffs} · {run.charges.length} {L.charges}: {cs.ACCEPTED ?? 0} {L.agreed}, {cs.WITHDRAWN ?? 0} {L.withdrawn}, {(cs.UPHELD ?? 0) + (cs.DISMISSED ?? 0)} {L.ruled}
            {run.duration_s ? ` · ${Math.round(run.duration_s)}${L.secs}` : ''}
          </p>
          {showHow && (
            <div className="mt-2 flex flex-col gap-2">
              {v.deciding_factor && <p className="rounded-xl bg-violet-soft p-2.5 text-[.85rem]">{v.deciding_factor}</p>}
              {run.charges.map((c) => (
                <div key={c.id} className="rounded-xl bg-paper p-2.5 text-[.82rem] ring-1 ring-line">
                  <span className={`rounded-md px-1.5 py-0.5 text-[.64rem] font-bold text-white ${c.status === 'WITHDRAWN' || c.status === 'DISMISSED' ? 'bg-safe-bright' : 'bg-scam'}`}>{c.status}</span>
                  <p className="mt-1 leading-snug">{c.charge}</p>
                  {c.history.map(([who, what], i) => <p key={i} className="mt-1 text-[.74rem] text-muted"><b>{who}:</b> {what}</p>)}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-paper via-paper/95 to-transparent p-3 pt-8">
        <motion.button whileTap={{ scale: 0.98 }} onClick={onAgain}
          className="w-full rounded-2xl bg-marigold py-3.5 font-display text-[1.02rem] font-bold text-ink shadow-[0_14px_30px_-12px_rgba(255,178,36,.9)]">
          {L.checkAnother}
        </motion.button>
      </div>
    </div>
  );
}

function RiskMeter({ risk, low, high }: { risk: number; low: string; high: string }) {
  return (
    <div className="relative mt-3.5">
      <div className="h-2.5 rounded-full bg-gradient-to-r from-safe-bright via-care-bright to-scam opacity-90" />
      <motion.span initial={{ left: '0%' }} animate={{ left: `${Math.max(2, Math.min(98, risk))}%` }} transition={{ delay: 0.25, duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        className="absolute top-[5px] h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-ink shadow-md" aria-hidden />
      <div className="mt-1.5 flex justify-between text-[.7rem] font-semibold text-muted"><span>{low}</span><span>{high}</span></div>
    </div>
  );
}

function Card({ title, delay = 0, children }: { title: string; delay?: number; children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.32 }}
      className="rounded-3xl bg-card p-4 shadow-card ring-1 ring-line/70">
      <h3 className="mb-2.5 font-display text-[.74rem] font-bold uppercase tracking-[.12em] text-muted">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </motion.section>
  );
}
const Flag = ({ text }: { text: string }) => <p className="rounded-2xl bg-scam-soft px-3 py-2 text-[.88rem] font-semibold leading-snug text-[#9F1239]">⚠ {text}</p>;
const Good = ({ text }: { text: string }) => <p className="rounded-2xl bg-safe-soft px-3 py-2 text-[.88rem] leading-snug text-safe">✓ {text}</p>;

function VerdictIcon({ tone }: { tone: Tone }) {
  const p = { width: 30, height: 30, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  if (tone === 'FRAUD') return <svg {...p}><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" /><path d="M9.5 9.5l5 5M14.5 9.5l-5 5" /></svg>;
  if (tone === 'SUSPICIOUS') return <svg {...p}><path d="M12 3l9.5 17h-19L12 3z" /><path d="M12 10v4.5M12 17.6v.1" /></svg>;
  if (tone === 'LIKELY_SAFE') return <svg {...p}><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></svg>;
  return <svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.6v.1" /></svg>;
}
const Arrow = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" className="mt-0.5 flex-none" aria-hidden><path d="M5 12h13M13 6l6 6-6 6" /></svg>;
const LinkIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6D4AFF" strokeWidth="2.2" strokeLinecap="round" className="flex-none" aria-hidden><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></svg>;
const SpeakerIcon = ({ on }: { on: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
    {on ? <path d="M17 9l4 6M21 9l-4 6" /> : <><path d="M16.5 8.5a5 5 0 010 7" /><path d="M19 6a8.5 8.5 0 010 12" /></>}
  </svg>
);
const ChatIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .2-3.3-.7-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.8s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1c.2-.3.4-.2.6-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.4z" />
  </svg>
);
