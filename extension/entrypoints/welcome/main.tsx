import { AnimatePresence, motion } from 'motion/react';
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '@/assets/theme.css';
import { Seg } from '@/components/Seg';
import { Shield } from '@/components/Shield';
import { health, type Health } from '@/lib/api';
import { cleanApi, useSettings, type Settings } from '@/lib/settings';
import type { Lang, TextSize } from '@/lib/types';
import { SCRIPT, sentences, useNarrator, type VoiceKey } from '@/lib/voice';

/**
 * First-install tutorial, designed for a 65-year-old first-time user:
 * - every step is narrated by a real voice (English, Hindi or Telugu) with read-along captions;
 * - one idea per screen, big text, big buttons, animated pictures that SHOW the action;
 * - "Next" glows only when the voice has finished, so nobody is rushed;
 * - interactive practice with spoken feedback, and live detection of the pinned shield.
 */
type StepId = 'welcome' | 'what' | 'pin' | 'start' | 'practice' | 'answer' | 'help' | 'family';
const STEPS: StepId[] = ['welcome', 'what', 'pin', 'start', 'practice', 'answer', 'help', 'family'];

const T = {
  en: {
    tag: 'Tutorial', step: 'Step', of: 'of', next: 'Next', back: 'Back', finish: 'Start using RAKSHA', skip: 'Skip',
    listen: 'Listen again', sound: 'Sound', on: 'on', off: 'off', start: 'Start', withSound: 'with sound',
    titles: {
      welcome: ['Namaste!', 'Let’s keep your savings', 'safe.'], what: ['How scammers', 'trap', 'people'],
      pin: ['Keep RAKSHA', 'one click', 'away'], start: ['Before you click', 'any', 'ad…'],
      practice: ['Now,', 'try it', 'yourself'], answer: ['One', 'clear', 'answer'],
      help: ['Already paid?', 'Act', 'fast'], family: ['Keep your family', 'in the', 'loop'],
    },
    lang: 'Language', size: 'Text size', pinned: 'Pinned! The shield is on your toolbar.', notPinned: 'Waiting for you to pin it…',
    flags: ['Too-good returns', 'Fake government or celebrity', 'Pay by UPI or chat on WhatsApp'],
    practiceOk: 'Perfect! That is exactly how you do it.', practiceMiss: 'Almost. Click on the ad itself.',
    v: ['Scam', 'Be careful', 'Looks genuine', 'Not an ad'], vd: ['Do not pay.', 'Ask family or bank first.', 'The facts check out.', 'Nothing to check.'],
    call: 'Call now', bank: 'Call your bank', report: 'Report online',
    phone: 'Family member’s WhatsApp number (with country code)', server: 'RAKSHA server', ok: 'Connected', down: 'Not running yet: start it with bash start.sh',
    demo: 'Open the practice feed', ready: 'You are ready!',
  },
  hi: {
    tag: 'ट्यूटोरियल', step: 'चरण', of: 'में से', next: 'आगे', back: 'पीछे', finish: 'RAKSHA शुरू करें', skip: 'छोड़ें',
    listen: 'फिर से सुनें', sound: 'आवाज़', on: 'चालू', off: 'बंद', start: 'शुरू करें', withSound: 'आवाज़ के साथ',
    titles: {
      welcome: ['नमस्ते!', 'आइए, आपकी जमा-पूँजी', 'सुरक्षित रखें।'], what: ['धोखेबाज़', 'कैसे', 'फँसाते हैं'],
      pin: ['RAKSHA को', 'हमेशा', 'पास रखें'], start: ['किसी विज्ञापन पर', 'क्लिक से', 'पहले…'],
      practice: ['अब', 'खुद', 'आज़माइए'], answer: ['एक', 'साफ़', 'जवाब'],
      help: ['पैसे भेज दिए?', 'तुरंत', 'कदम उठाइए'], family: ['परिवार को', 'साथ', 'रखें'],
    },
    lang: 'भाषा', size: 'अक्षरों का आकार', pinned: 'पिन हो गया! ढाल टूलबार पर है।', notPinned: 'आपके पिन करने का इंतज़ार…',
    flags: ['बहुत ज़्यादा मुनाफ़ा', 'नकली सरकार या मशहूर चेहरा', 'UPI से भुगतान या WhatsApp चैट'],
    practiceOk: 'बिल्कुल सही! ऐसे ही करना है।', practiceMiss: 'लगभग। सीधे विज्ञापन पर क्लिक कीजिए।',
    v: ['धोखा', 'सावधान', 'असली लगता है', 'विज्ञापन नहीं'], vd: ['पैसे मत दीजिए।', 'पहले परिवार या बैंक से पूछिए।', 'तथ्य सही हैं।', 'जाँचने को कुछ नहीं।'],
    call: 'अभी कॉल करें', bank: 'बैंक को कॉल करें', report: 'ऑनलाइन शिकायत',
    phone: 'परिवार के सदस्य का WhatsApp नंबर (देश कोड के साथ)', server: 'RAKSHA सर्वर', ok: 'जुड़ गया', down: 'अभी चालू नहीं: bash start.sh चलाइए',
    demo: 'अभ्यास फ़ीड खोलें', ready: 'आप तैयार हैं!',
  },
  te: {
    tag: 'ట్యుటోరియల్', step: 'అడుగు', of: 'లో', next: 'తర్వాత', back: 'వెనుకకు', finish: 'RAKSHA ప్రారంభించండి', skip: 'దాటవేయండి',
    listen: 'మళ్ళీ వినండి', sound: 'ధ్వని', on: 'ఆన్', off: 'ఆఫ్', start: 'ప్రారంభించండి', withSound: 'ధ్వనితో',
    titles: {
      welcome: ['నమస్కారం!', 'మీ పొదుపును', 'కాపాడుకుందాం.'], what: ['మోసగాళ్ళు', 'ఎలా', 'మోసం చేస్తారు'],
      pin: ['RAKSHA ను', 'ఒక్క క్లిక్', 'దూరంలో ఉంచండి'], start: ['ఏ ప్రకటనపైనైనా', 'క్లిక్ చేసే', 'ముందు…'],
      practice: ['ఇప్పుడు', 'మీరే', 'ప్రయత్నించండి'], answer: ['ఒక', 'స్పష్టమైన', 'సమాధానం'],
      help: ['డబ్బు పంపేశారా?', 'వెంటనే', 'స్పందించండి'], family: ['కుటుంబాన్ని', 'తోడుగా', 'ఉంచండి'],
    },
    lang: 'భాష', size: 'అక్షరాల పరిమాణం', pinned: 'పిన్ అయింది! షీల్డ్ టూల్‌బార్‌లో ఉంది.', notPinned: 'మీరు పిన్ చేసే వరకు వేచి ఉంది…',
    flags: ['అతి ఎక్కువ లాభాలు', 'నకిలీ ప్రభుత్వం లేదా ప్రముఖులు', 'UPI చెల్లింపు లేదా WhatsApp చాట్'],
    practiceOk: 'అద్భుతం! సరిగ్గా ఇలాగే చేయాలి.', practiceMiss: 'దాదాపు. ప్రకటనపైనే క్లిక్ చేయండి.',
    v: ['మోసం', 'జాగ్రత్త', 'నిజమైనదిగా ఉంది', 'ప్రకటన కాదు'], vd: ['డబ్బు కట్టకండి.', 'ముందు కుటుంబం/బ్యాంకును అడగండి.', 'వివరాలు సరిపోతున్నాయి.', 'తనిఖీ చేయడానికి ఏమీ లేదు.'],
    call: 'ఇప్పుడే కాల్ చేయండి', bank: 'బ్యాంకుకు కాల్', report: 'ఆన్‌లైన్ ఫిర్యాదు',
    phone: 'కుటుంబ సభ్యుడి WhatsApp నంబర్ (దేశ కోడ్‌తో)', server: 'RAKSHA సర్వర్', ok: 'కనెక్ట్ అయింది', down: 'ఇంకా నడవడం లేదు: bash start.sh నడపండి',
    demo: 'సాధన ఫీడ్ తెరవండి', ready: 'మీరు సిద్ధం!',
  },
};
type D = typeof T.en;

function Tutorial() {
  const [s, update] = useSettings();
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const [soundOn, setSoundOn] = useState(true);
  const [started, setStarted] = useState(false);
  const [heard, setHeard] = useState<Set<StepId>>(new Set());
  const narrator = useNarrator(soundOn);
  const lang: Lang = s?.lang ?? 'en';
  const t = T[lang] ?? T.en;
  const step = STEPS[i]!;

  // what the voice is saying right now → read-along captions
  const voiceKey: VoiceKey = narrator.now?.key ?? step;
  const voiceLang: Lang = narrator.now?.lang ?? lang;
  const lines = useMemo(() => sentences(SCRIPT[voiceKey][voiceLang]), [voiceKey, voiceLang]);
  const active = useMemo(() => {
    if (!narrator.now) return -1;
    const total = lines.join(' ').length;
    let acc = 0;
    for (let k = 0; k < lines.length; k++) { acc += lines[k]!.length + 1; if (narrator.progress * total < acc) return k; }
    return lines.length - 1;
  }, [narrator.now, narrator.progress, lines]);

  useEffect(() => { if (narrator.now === null && started) setHeard((h) => new Set(h).add(step)); }, [narrator.now, started, step]);

  const speakStep = (id: StepId) => narrator.say([[id, lang]]);

  // try to greet immediately; browsers may block sound until the first tap → the big Start button
  useEffect(() => { if (s && !started) narrator.say([['welcome', 'en'], ['welcome', 'hi'], ['welcome', 'te']]); }, [!!s]);
  useEffect(() => { if (narrator.now) setStarted(true); }, [narrator.now]);

  if (!s) return null;
  const go = (d: number) => {
    const n = Math.max(0, Math.min(STEPS.length - 1, i + d));
    setDir(d); setI(n); setStarted(true); speakStep(STEPS[n]!);
  };
  const finish = async () => { narrator.stop(); await update({ onboarded: true }); window.close(); };
  const chooseLang = async (l: Lang) => { await update({ lang: l }); setStarted(true); narrator.say([['welcome', l]]); };
  const ready = heard.has(step) || !soundOn || narrator.now === null;

  return (
    <div className="relative min-h-screen overflow-hidden" onKeyDown={(e) => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); }}>
      <Backdrop />
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center gap-4 px-6 pt-6">
        <Shield size={48} />
        <div>
          <p className="font-display text-2xl font-extrabold leading-none tracking-tight">RAKSHA</p>
          <p className="text-sm font-semibold text-muted">{t.tag}</p>
        </div>
        <ol className="mx-auto hidden gap-1.5 md:flex" aria-label={`${t.step} ${i + 1} ${t.of} ${STEPS.length}`}>
          {STEPS.map((id, k) => (
            <li key={id}><button onClick={() => go(k - i)} aria-label={`${t.step} ${k + 1}`}
              className={`block h-2.5 rounded-full transition-all duration-500 ${k === i ? 'w-12 bg-violet' : k < i ? 'w-6 bg-violet/50' : 'w-6 bg-ink/10'}`} /></li>
          ))}
        </ol>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <div className="flex rounded-full bg-card/80 p-1 shadow-card ring-1 ring-line backdrop-blur">
            {(['en', 'hi', 'te'] as Lang[]).map((l) => (
              <button key={l} onClick={() => chooseLang(l)} aria-pressed={lang === l}
                className={`rounded-full px-3.5 py-1.5 text-base font-bold transition ${lang === l ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}>
                {l === 'en' ? 'English' : l === 'hi' ? 'हिंदी' : 'తెలుగు'}
              </button>
            ))}
          </div>
          <button onClick={() => { setSoundOn(!soundOn); if (soundOn) narrator.stop(); }} aria-pressed={soundOn}
            className="flex items-center gap-2 rounded-full bg-card/80 px-4 py-2.5 text-base font-bold shadow-card ring-1 ring-line backdrop-blur">
            <SpeakerIcon on={soundOn} /> {t.sound} {soundOn ? t.on : t.off}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-8 px-6 py-8 lg:grid-cols-[1.1fr_1fr]">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div key={step} custom={dir} initial={{ opacity: 0, x: 60 * dir, rotate: dir * 1.5 }} animate={{ opacity: 1, x: 0, rotate: 0 }}
            exit={{ opacity: 0, x: -60 * dir }} transition={{ type: 'spring', stiffness: 180, damping: 24 }}>
            <Stage step={step} t={t} s={s} active={active} speaking={narrator.now?.key === step}
              onPractice={(ok) => narrator.say([[ok ? 'practice_ok' : 'practice_miss', lang]])}
              onPinned={() => narrator.say([['pinned', lang]])} />
          </motion.div>
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.section key={step + lang} initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} transition={{ duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-violet-soft px-3 py-1 text-sm font-bold text-violet">
              {t.step} {i + 1} {t.of} {STEPS.length}
            </p>
            <h1 className="font-display text-[clamp(2.2rem,4.2vw,3.6rem)] font-extrabold leading-[1.02] tracking-tight">
              {t.titles[step][0]} <span className="serif text-violet">{t.titles[step][1]}</span> {t.titles[step][2]}
            </h1>

            <div className="mt-6 rounded-[28px] bg-card/85 p-5 shadow-card ring-1 ring-line backdrop-blur">
              <div className="mb-3 flex items-center gap-3">
                <Wave on={!!narrator.now} />
                <button onClick={() => { setStarted(true); speakStep(step); }} className="ml-auto flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-base font-bold text-white hover:bg-ink-2">
                  <PlayIcon /> {t.listen}
                </button>
              </div>
              <p className="text-[1.35rem] leading-relaxed" aria-live="polite">
                {lines.map((line, k) => (
                  <span key={k} className={`transition-colors duration-300 ${active === -1 ? 'text-ink' : k === active ? 'rounded-lg bg-marigold-soft text-ink box-decoration-clone px-1' : k < active ? 'text-ink/80' : 'text-ink/35'}`}>
                    {line}{' '}
                  </span>
                ))}
              </p>
            </div>

            {step === 'welcome' && <WelcomeControls t={t} s={s} chooseLang={chooseLang} update={update} />}
            {step === 'family' && <FamilyControls t={t} s={s} update={update} />}
          </motion.section>
        </AnimatePresence>
      </main>

      <footer className="relative z-10 mx-auto flex w-full max-w-6xl items-center gap-4 px-6 pb-10">
        {i > 0 ? <button onClick={() => go(-1)} className="rounded-2xl px-6 py-4 text-xl font-bold text-muted hover:text-ink">← {t.back}</button>
          : <button onClick={finish} className="rounded-2xl px-6 py-4 text-lg font-semibold text-muted hover:text-ink">{t.skip}</button>}
        <div className="flex-1" />
        {i < STEPS.length - 1 ? (
          <motion.button onClick={() => go(1)} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            animate={ready ? { boxShadow: ['0 0 0 0 rgba(255,178,36,.7)', '0 0 0 18px rgba(255,178,36,0)'] } : {}}
            transition={ready ? { duration: 1.6, repeat: Infinity } : {}}
            className="flex items-center gap-3 rounded-[22px] bg-marigold px-10 py-5 font-display text-2xl font-extrabold text-ink shadow-[0_18px_40px_-14px_rgba(255,178,36,.95)]">
            {t.next} <span aria-hidden>→</span>
          </motion.button>
        ) : (
          <motion.button onClick={finish} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            className="rounded-[22px] bg-ink px-10 py-5 font-display text-2xl font-extrabold text-white shadow-card">{t.finish} ✓</motion.button>
        )}
      </footer>

      <AnimatePresence>
        {narrator.blocked && !started && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 grid place-items-center bg-night/70 backdrop-blur-md">
            <motion.button onClick={() => { narrator.setBlocked(false); setStarted(true); narrator.say([['welcome', 'en'], ['welcome', 'hi'], ['welcome', 'te']]); }}
              initial={{ scale: 0.8 }} animate={{ scale: 1 }} whileHover={{ scale: 1.04 }} className="flex flex-col items-center gap-5 text-white">
              <span className="relative grid h-44 w-44 place-items-center rounded-full bg-marigold text-ink shadow-[0_0_80px_rgba(255,178,36,.6)]">
                <span className="absolute inset-0 animate-ping rounded-full bg-marigold/40" />
                <svg width="70" height="70" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              </span>
              <span className="font-display text-4xl font-extrabold">Start · शुरू करें · ప్రారంభించండి</span>
              <span className="text-xl text-white/80">with sound · आवाज़ के साथ · ధ్వనితో</span>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─────────────────────────────── right-hand controls ───────────────────────────────
function WelcomeControls({ t, s, chooseLang, update }: { t: D; s: Settings; chooseLang: (l: Lang) => void; update: (p: Partial<Settings>) => Promise<void> }) {
  return (
    <div className="mt-6 grid gap-5">
      <div>
        <p className="mb-2 text-lg font-bold">{t.lang}</p>
        <div className="grid grid-cols-3 gap-3">
          {([['en', 'English', 'Hello'], ['hi', 'हिंदी', 'नमस्ते'], ['te', 'తెలుగు', 'నమస్కారం']] as [Lang, string, string][]).map(([l, name, hi]) => (
            <motion.button key={l} whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} onClick={() => chooseLang(l)} aria-pressed={s.lang === l}
              className={`rounded-3xl px-4 py-4 text-left ring-2 transition ${s.lang === l ? 'bg-violet text-white ring-violet shadow-pop' : 'bg-card ring-line hover:ring-violet/40'}`}>
              <span className="block font-display text-2xl font-extrabold">{name}</span>
              <span className={`text-base ${s.lang === l ? 'text-white/80' : 'text-muted'}`}>{hi} 🔊</span>
            </motion.button>
          ))}
        </div>
      </div>
      <div><p className="mb-2 text-lg font-bold">{t.size}</p>
        <Seg value={s.textSize} onChange={(v) => update({ textSize: v as TextSize })} options={[['md', 'A'], ['lg', 'A+'], ['xl', 'A++']]} /></div>
    </div>
  );
}

function FamilyControls({ t, s, update }: { t: D; s: Settings; update: (p: Partial<Settings>) => Promise<void> }) {
  const [h, setH] = useState<Health | null | undefined>();
  useEffect(() => { health(s.apiUrl).then(setH); }, [s.apiUrl]);
  return (
    <div className="mt-6 grid gap-4">
      <label className="block"><span className="mb-1.5 block text-lg font-bold">{t.phone}</span>
        <input className="w-full rounded-2xl border-2 border-line bg-card px-5 py-4 text-xl focus:border-violet focus:outline-none" inputMode="tel" placeholder="91 98765 43210"
          defaultValue={s.familyPhone} onBlur={(e) => update({ familyPhone: e.target.value.replace(/[^\d]/g, '') })} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full px-4 py-2 text-base font-semibold ${h ? 'bg-safe-soft text-safe' : 'bg-care-soft text-care'}`}>
          {t.server}: {h === undefined ? '…' : h ? `✓ ${t.ok}` : t.down}
        </span>
        <button onClick={() => chrome.tabs.create({ url: `${cleanApi(s.apiUrl)}/demo` })} className="rounded-full px-4 py-2 text-base font-bold text-violet ring-2 ring-violet/30 hover:bg-violet-soft">{t.demo} ↗</button>
      </div>
    </div>
  );
}

// ─────────────────────────────── the illustrated stage ───────────────────────────────
function Stage({ step, t, s, active, speaking, onPractice, onPinned }: {
  step: StepId; t: D; s: Settings; active: number; speaking: boolean; onPractice: (ok: boolean) => void; onPinned: () => void;
}) {
  return (
    <div className="grain relative aspect-[5/4] w-full overflow-hidden rounded-[40px] bg-night shadow-[0_40px_90px_-40px_rgba(20,17,49,.7)]">
      <div className="pointer-events-none absolute -left-20 -top-24 h-80 w-80 rounded-full bg-violet/60 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-10 h-80 w-80 rounded-full bg-marigold/40 blur-3xl" />
      <Rangoli className="pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 opacity-[.13]" />
      <div className="relative h-full w-full">
        {step === 'welcome' && <SceneWelcome speaking={speaking} />}
        {step === 'what' && <SceneFlags t={t} active={active} />}
        {step === 'pin' && <ScenePin t={t} onPinned={onPinned} />}
        {step === 'start' && <SceneStart />}
        {step === 'practice' && <ScenePractice t={t} onResult={onPractice} />}
        {step === 'answer' && <SceneAnswer t={t} active={active} />}
        {step === 'help' && <SceneHelp t={t} />}
        {step === 'family' && <SceneFamily t={t} s={s} />}
      </div>
    </div>
  );
}

function SceneWelcome({ speaking }: { speaking: boolean }) {
  return (
    <div className="grid h-full place-items-center">
      <motion.div animate={{ y: [0, -12, 0], rotate: [0, 1.5, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }} className="relative">
        <motion.div className="absolute inset-[-18%] rounded-full border-2 border-dashed border-marigold/40" animate={{ rotate: 360 }} transition={{ duration: 40, repeat: Infinity, ease: 'linear' }} />
        <motion.div className="absolute inset-[-8%] rounded-full bg-marigold/20 blur-2xl" animate={{ opacity: speaking ? [0.4, 0.9, 0.4] : 0.4 }} transition={{ duration: 1.2, repeat: Infinity }} />
        <Shield size={250} className="relative drop-shadow-[0_30px_40px_rgba(0,0,0,.35)]" />
      </motion.div>
      {[[12, 18, 26], [82, 14, 18], [88, 72, 22], [10, 76, 14]].map(([x, y, sz], k) => (
        <motion.span key={k} className="absolute text-marigold" style={{ left: `${x}%`, top: `${y}%`, fontSize: sz }}
          animate={{ scale: [0.6, 1.2, 0.6], opacity: [0.3, 1, 0.3], rotate: [0, 90, 0] }} transition={{ duration: 3 + k, repeat: Infinity }}>✦</motion.span>
      ))}
    </div>
  );
}

function SceneFlags({ t, active }: { t: D; active: number }) {
  const cards = [
    { head: '₹21,000 → ₹15 lakh', sub: '100% guaranteed in 10 days!', c: '#E11D48' },
    { head: 'Govt + SBI scheme', sub: 'Launched by the Finance Minister', c: '#F59E0B' },
    { head: 'Pay by UPI', sub: 'WhatsApp +44 7700 900123', c: '#8B6CFF' },
  ];
  return (
    <div className="flex h-full flex-col justify-center gap-4 p-8">
      {cards.map((c, k) => {
        const on = active === -1 || active === k + 1 || (k === 2 && active >= 3);
        return (
          <motion.div key={k} initial={{ opacity: 0, x: -40, rotate: -3 }} animate={{ opacity: 1, x: 0, rotate: k % 2 ? 1.5 : -1.5, scale: on ? 1 : 0.94 }}
            transition={{ delay: 0.15 + k * 0.25, type: 'spring', stiffness: 160, damping: 16 }}
            className={`relative rounded-3xl bg-white p-5 text-ink shadow-xl transition-opacity ${on ? 'opacity-100' : 'opacity-60'}`}>
            <p className="font-display text-2xl font-extrabold">{c.head}</p>
            <p className="text-lg text-muted">{c.sub}</p>
            <motion.span initial={{ scale: 2.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.6 + k * 0.25, type: 'spring', stiffness: 300, damping: 14 }}
              className="absolute -right-3 -top-4 rotate-6 rounded-xl px-3 py-1.5 font-display text-base font-extrabold text-white shadow-lg" style={{ background: c.c }}>
              ⚠ {t.flags[k]}
            </motion.span>
          </motion.div>
        );
      })}
    </div>
  );
}

function ScenePin({ t, onPinned }: { t: D; onPinned: () => void }) {
  const [pinned, setPinned] = useState<boolean | null>(null);
  const said = useRef(false);
  useEffect(() => {
    const check = () => chrome.action.getUserSettings?.().then((u) => setPinned(!!u.isOnToolbar)).catch(() => setPinned(null));
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { if (pinned && !said.current) { said.current = true; onPinned(); } }, [pinned]);
  return (
    <div className="flex h-full flex-col justify-center gap-6 p-8">
      <div className="relative rounded-2xl bg-[#DEE1E6] p-3 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="flex gap-1.5"><i className="h-3 w-3 rounded-full bg-[#FF5F57]" /><i className="h-3 w-3 rounded-full bg-[#FEBC2E]" /><i className="h-3 w-3 rounded-full bg-[#28C840]" /></span>
          <div className="h-9 flex-1 rounded-full bg-white px-4 text-sm leading-9 text-muted">facebook.com</div>
          <motion.div animate={pinned ? { scale: [1, 1.2, 1] } : { opacity: [0.2, 1, 1, 1] }} transition={{ duration: 5, repeat: pinned ? 0 : Infinity, times: [0, 0.55, 0.9, 1] }}>
            <Shield size={34} />
          </motion.div>
          <div className="relative grid h-10 w-10 place-items-center rounded-full bg-white/70">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#5F6368"><path d="M20.5 11H19V7a2 2 0 00-2-2h-4V3.5a2.5 2.5 0 00-5 0V5H4a2 2 0 00-2 2v3.8h1.5a2.7 2.7 0 010 5.4H2V20a2 2 0 002 2h3.8v-1.5a2.7 2.7 0 015.4 0V22H17a2 2 0 002-2v-4h1.5a2.5 2.5 0 000-5z" /></svg>
            {!pinned && <motion.span className="absolute inset-0 rounded-full ring-4 ring-marigold" animate={{ opacity: [0, 1, 0], scale: [0.8, 1.3, 1.5] }} transition={{ duration: 5, repeat: Infinity, times: [0.1, 0.2, 0.3] }} />}
          </div>
        </div>
        {!pinned && (
          <motion.div className="absolute right-3 top-16 w-72 rounded-2xl bg-white p-3 text-ink shadow-2xl" animate={{ opacity: [0, 0, 1, 1, 0], y: [8, 8, 0, 0, 8] }} transition={{ duration: 5, repeat: Infinity, times: [0, 0.22, 0.28, 0.85, 1] }}>
            <p className="mb-2 text-sm font-semibold text-muted">Extensions</p>
            <div className="flex items-center gap-3 rounded-xl bg-violet-soft p-2">
              <Shield size={30} /><span className="flex-1 font-bold">RAKSHA</span>
              <motion.span className="grid h-9 w-9 place-items-center rounded-full" animate={{ backgroundColor: ['#fff', '#fff', '#FFB224', '#FFB224'] }} transition={{ duration: 5, repeat: Infinity, times: [0, 0.45, 0.5, 1] }}>📌</motion.span>
            </div>
          </motion.div>
        )}
        {!pinned && <Cursor path={{ x: ['10%', '84%', '84%', '80%', '80%'], y: ['80%', '40%', '40%', '150%', '150%'] }} />}
      </div>
      <div className={`mt-24 flex items-center gap-3 self-start rounded-2xl px-5 py-4 text-xl font-bold ${pinned ? 'bg-safe-bright text-white' : 'bg-white/10 text-white'}`} aria-live="polite">
        {pinned ? '✓' : <motion.span animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.4, repeat: Infinity }}>●</motion.span>}
        {pinned ? t.pinned : t.notPinned}
      </div>
    </div>
  );
}

function SceneStart() {
  return (
    <div className="relative h-full p-8">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {['Alt', 'Shift', 'R'].map((k, n) => (
            <motion.kbd key={k} animate={{ y: [0, 0, 5, 5, 0], boxShadow: ['0 6px 0 #9C8BFF', '0 6px 0 #9C8BFF', '0 1px 0 #9C8BFF', '0 1px 0 #9C8BFF', '0 6px 0 #9C8BFF'] }}
              transition={{ duration: 6, repeat: Infinity, times: [0, 0.05 + n * 0.02, 0.1 + n * 0.02, 0.2, 0.25] }}
              className="!rounded-xl !border-0 !bg-white !px-4 !py-2.5 !text-lg !text-ink">{k}</motion.kbd>
          ))}
        </div>
        <motion.div animate={{ scale: [1, 1, 1.25, 1] }} transition={{ duration: 6, repeat: Infinity, times: [0, 0.3, 0.35, 0.4] }}><Shield size={52} /></motion.div>
      </div>
      <motion.div className="absolute inset-x-8 bottom-8 top-28 rounded-3xl bg-white p-5 text-ink shadow-2xl"
        animate={{ outlineColor: ['rgba(139,108,255,0)', 'rgba(139,108,255,0)', 'rgba(139,108,255,1)', 'rgba(255,178,36,1)', 'rgba(255,178,36,0)'] }}
        style={{ outlineWidth: 5, outlineStyle: 'solid', outlineOffset: 6 }}
        transition={{ duration: 6, repeat: Infinity, times: [0, 0.45, 0.55, 0.7, 1] }}>
        <p className="text-sm font-semibold text-muted">Sponsored</p>
        <p className="mt-1 font-display text-2xl font-extrabold">PENSION PLUS · 18% assured!</p>
        <p className="text-lg text-muted">No documents. Pay today by UPI.</p>
        <div className="mt-4 rounded-xl bg-[#3B5BDB] py-3 text-center text-lg font-bold text-white">Pay now</div>
        <motion.div className="absolute -right-4 -top-5 rounded-2xl bg-scam px-4 py-2 font-display text-xl font-extrabold text-white shadow-xl"
          animate={{ scale: [0, 0, 0, 1.2, 1], rotate: [-10, -10, -10, 4, 4] }} transition={{ duration: 6, repeat: Infinity, times: [0, 0.6, 0.7, 0.78, 0.85] }}>
          ⚠ Scam
        </motion.div>
      </motion.div>
      <Cursor path={{ x: ['40%', '92%', '92%', '50%', '50%'], y: ['60%', '12%', '12%', '55%', '55%'] }} />
    </div>
  );
}

function ScenePractice({ t, onResult }: { t: D; onResult: (ok: boolean) => void }) {
  const ad = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<'ok' | 'miss' | null>(null);
  const click = (e: React.MouseEvent) => {
    const a = ad.current!.getBoundingClientRect();
    const ok = e.clientX >= a.left && e.clientX <= a.right && e.clientY >= a.top && e.clientY <= a.bottom;
    setResult(ok ? 'ok' : 'miss');
    onResult(ok);
  };
  return (
    <div className="grid h-full cursor-pointer place-items-center p-8" onClick={click}>
      <motion.div ref={ad} whileHover={{ scale: 1.02 }}
        className={`relative w-[82%] rounded-3xl bg-white p-6 text-ink shadow-2xl transition-[outline] ${result === 'ok' ? 'outline outline-[5px] outline-offset-8 outline-marigold' : 'hover:outline hover:outline-4 hover:outline-offset-8 hover:outline-violet-2'}`}>
        <p className="text-base font-semibold text-muted">Sponsored</p>
        <p className="mt-1 font-display text-2xl font-extrabold leading-tight">Senior Citizen Special FD: 18% per year, assured!</p>
        <p className="mt-1 text-lg text-muted">No documents. Pay today by UPI and get ₹5,000 bonus.</p>
        <div className="mt-4 rounded-xl bg-[#3B5BDB] py-3 text-center text-lg font-bold text-white">Pay by UPI</div>
        <AnimatePresence>
          {result === 'ok' && (
            <motion.div initial={{ scale: 2.5, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: -6 }} className="absolute -right-6 -top-6 rounded-2xl bg-scam px-5 py-2.5 font-display text-2xl font-extrabold text-white shadow-xl">
              ⚠ Scam
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
      <AnimatePresence>
        {result && (
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`absolute bottom-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-2xl px-5 py-3 text-xl font-bold ${result === 'ok' ? 'bg-safe-bright text-white' : 'bg-marigold text-ink'}`}>
            {result === 'ok' ? `✓ ${t.practiceOk}` : t.practiceMiss}
          </motion.p>
        )}
      </AnimatePresence>
      {!result && <motion.span className="pointer-events-none absolute bottom-8 text-5xl" animate={{ y: [0, -14, 0] }} transition={{ duration: 1.2, repeat: Infinity }}>👆</motion.span>}
    </div>
  );
}

function SceneAnswer({ t, active }: { t: D; active: number }) {
  const tiles = [
    { bg: '#E11D48', icon: 'M9.5 9.5l5 5M14.5 9.5l-5 5', shield: true },
    { bg: '#F59E0B', icon: 'M12 10v4.5M12 17.6v.1', tri: true },
    { bg: '#10B981', icon: 'M8.5 12l2.5 2.5 4.5-5', shield: true },
    { bg: '#475569', icon: 'M12 11v5M12 7.6v.1', circle: true },
  ];
  return (
    <div className="grid h-full grid-cols-2 gap-4 p-8">
      {tiles.map((x, k) => {
        const on = active === -1 || active === k + 1 || (k === 3 && active >= 4);
        return (
          <motion.div key={k} initial={{ opacity: 0, scale: 0.6, rotate: -8 }} animate={{ opacity: on ? 1 : 0.45, scale: on && active !== -1 ? 1.05 : 1, rotate: 0 }}
            transition={{ delay: active === -1 ? 0.1 + k * 0.15 : 0, type: 'spring', stiffness: 200, damping: 16 }}
            className="flex flex-col justify-between rounded-[28px] p-5 text-white shadow-xl" style={{ background: x.bg }}>
            <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              {x.shield && <path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" />}
              {x.tri && <path d="M12 3l9.5 17h-19L12 3z" />}
              {x.circle && <circle cx="12" cy="12" r="9" />}
              <path d={x.icon} />
            </svg>
            <div><p className="font-display text-3xl font-extrabold leading-none">{t.v[k]}</p><p className="mt-1 text-lg text-white/85">{t.vd[k]}</p></div>
          </motion.div>
        );
      })}
    </div>
  );
}

function SceneHelp({ t }: { t: D }) {
  return (
    <div className="flex h-full flex-col justify-center gap-4 p-8">
      <motion.a href="tel:1930" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="relative flex items-center gap-5 rounded-[30px] bg-scam p-6 text-white no-underline shadow-2xl">
        <motion.span animate={{ rotate: [0, -14, 14, -10, 10, 0] }} transition={{ duration: 1, repeat: Infinity, repeatDelay: 1 }}
          className="grid h-20 w-20 place-items-center rounded-full bg-white/20 text-5xl">📞</motion.span>
        <span><span className="block font-display text-6xl font-extrabold leading-none">1930</span><span className="text-xl font-semibold">{t.call} · Cyber Crime Helpline</span></span>
      </motion.a>
      <div className="grid grid-cols-2 gap-4">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }} className="rounded-[26px] bg-white p-5 text-ink shadow-xl">
          <span className="text-4xl">🏦</span><p className="mt-2 font-display text-xl font-extrabold">{t.bank}</p></motion.div>
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="rounded-[26px] bg-white p-5 text-ink shadow-xl">
          <span className="text-4xl">🌐</span><p className="mt-2 font-display text-xl font-extrabold">{t.report}</p><p className="text-base text-muted">cybercrime.gov.in</p></motion.div>
      </div>
    </div>
  );
}

function SceneFamily({ t, s }: { t: D; s: Settings }) {
  return (
    <div className="grid h-full place-items-center p-8">
      <motion.div initial={{ y: 30, rotate: -4, opacity: 0 }} animate={{ y: 0, rotate: -3, opacity: 1 }} className="w-[62%] rounded-[36px] border-[10px] border-ink bg-[#ECE5DD] p-4 shadow-2xl">
        <div className="-mx-4 -mt-4 mb-4 flex items-center gap-2 rounded-t-[26px] bg-[#075E54] px-4 py-3 text-white">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white/25">👩</span>
          <span className="font-bold">{s.familyPhone ? `+${s.familyPhone}` : 'Family'}</span>
        </div>
        <motion.div initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }} className="ml-auto max-w-[90%] rounded-2xl rounded-tr-sm bg-[#DCF8C6] p-3 text-ink shadow">
          <p className="text-sm">RAKSHA checked an ad for me: <b>Scam</b> (risk 100/100)</p>
          <p className="mt-1 text-sm">“This is a fake scheme. Do not pay.”</p>
          <p className="mt-1 text-right text-xs text-muted">10:42 ✓✓</p>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.4 }} className="mt-2 max-w-[80%] rounded-2xl rounded-tl-sm bg-white p-3 text-sm text-ink shadow">
          Good that you checked! 🙏 Don’t pay. Calling you now.
        </motion.div>
      </motion.div>
      <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 2, type: 'spring' }} className="absolute bottom-6 right-8 rotate-3 rounded-2xl bg-marigold px-5 py-2.5 font-display text-2xl font-extrabold text-ink shadow-xl">
        {t.ready} ✦
      </motion.p>
    </div>
  );
}

// ─────────────────────────────── decoration ───────────────────────────────
function Cursor({ path }: { path: { x: string[]; y: string[] } }) {
  return (
    <motion.svg width="34" height="34" viewBox="0 0 24 24" className="pointer-events-none absolute z-20 drop-shadow-lg" style={{ left: 0, top: 0 }}
      animate={{ left: path.x, top: path.y }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', times: [0, 0.3, 0.45, 0.6, 1] }}>
      <path d="M4 2l7.5 20 2.6-8 7.9-2.8z" fill="#141131" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
    </motion.svg>
  );
}

/** A slowly turning rangoli: Indian craft pattern as quiet texture behind every scene. */
function Rangoli({ className = '' }: { className?: string }) {
  const petals = Array.from({ length: 16 }, (_, k) => k * 22.5);
  return (
    <motion.svg viewBox="-100 -100 200 200" className={className} animate={{ rotate: 360 }} transition={{ duration: 120, repeat: Infinity, ease: 'linear' }} aria-hidden>
      <g fill="none" stroke="#FFB224" strokeWidth=".8">
        {[90, 70, 50, 30].map((r) => <circle key={r} r={r} strokeDasharray="2 4" />)}
        {petals.map((a) => <ellipse key={a} cx="0" cy="-60" rx="8" ry="22" transform={`rotate(${a})`} />)}
        {petals.map((a) => <ellipse key={`i${a}`} cx="0" cy="-32" rx="4" ry="12" transform={`rotate(${a + 11.25})`} stroke="#fff" />)}
        {petals.map((a) => <circle key={`d${a}`} cx="0" cy="-84" r="2.4" transform={`rotate(${a})`} fill="#FFB224" />)}
      </g>
    </motion.svg>
  );
}

/** Soft moving colour fields: violet (trust), marigold (warmth), rose (care). */
function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      <motion.div className="absolute -left-40 -top-40 h-[36rem] w-[36rem] rounded-full bg-[#E4DBFF] blur-3xl" animate={{ x: [0, 60, 0], y: [0, 40, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute -bottom-48 right-[-10rem] h-[40rem] w-[40rem] rounded-full bg-[#FFE7C2] blur-3xl" animate={{ x: [0, -50, 0], y: [0, -30, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} />
      <motion.div className="absolute left-1/2 top-1/3 h-[22rem] w-[22rem] rounded-full bg-[#FFD9E1] opacity-60 blur-3xl" animate={{ x: [0, 40, -20, 0] }} transition={{ duration: 26, repeat: Infinity, ease: 'easeInOut' }} />
    </div>
  );
}

function Wave({ on }: { on: boolean }) {
  return (
    <span className="flex h-8 items-end gap-1" aria-hidden>
      {[0, 1, 2, 3, 4].map((k) => (
        <motion.i key={k} className="w-1.5 rounded-full bg-violet" animate={on ? { height: [8, 28, 12, 22, 8] } : { height: 6 }}
          transition={on ? { duration: 0.9, repeat: Infinity, delay: k * 0.12 } : {}} />
      ))}
    </span>
  );
}
const PlayIcon = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>;
const SpeakerIcon = ({ on }: { on: boolean }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
    {on ? <><path d="M16.5 8.5a5 5 0 010 7" /><path d="M19 6a8.5 8.5 0 010 12" /></> : <path d="M17 9l4 6M21 9l-4 6" />}
  </svg>
);

createRoot(document.getElementById('root')!).render(<StrictMode><Tutorial /></StrictMode>);
