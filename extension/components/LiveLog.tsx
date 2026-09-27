import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { agentColor, agentName } from '@/lib/agents';
import type { TraceMsg } from '@/lib/types';

const KIND: Record<string, string> = {
  handoff: 'hands off to', evidence: 'found', note: 'noted', claims: 'read the ad', plan: 'planned', charge: 'charges',
  argument: 'argues', response: 'answers', round: 'scores the round', ruling: 'rules', verdict: 'decides',
};

export function LiveLog({ events, dark = true, max = 80 }: { events: TraceMsg[]; dark?: boolean; max?: number }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [events.length]);
  const shown = events.slice(-max);
  return (
    <div className={`scroll-thin max-h-72 overflow-y-auto pr-1 ${dark ? 'text-white' : 'text-ink'}`} role="log" aria-live="polite">
      <AnimatePresence initial={false}>
        {shown.map((m) => {
          const toAgent = m.type === 'handoff' || m.type === 'charge' || m.type === 'argument' || m.type === 'response';
          const sup = m.type === 'evidence' ? (m.data as { supports?: string } | undefined)?.supports : undefined;
          return (
            <motion.div key={m.step} layout initial={{ opacity: 0, y: 10, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25 }} className={`mb-2 rounded-2xl px-3 py-2 ${dark ? 'bg-white/[.07]' : 'bg-white shadow-card'}`}>
              <div className="flex items-center gap-1.5 text-[.72rem] font-semibold">
                <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: agentColor(m.from) }} />
                <span style={{ color: agentColor(m.from) }}>{agentName(m.from)}</span>
                <span className={dark ? 'text-white/50' : 'text-muted'}>{KIND[m.type] ?? m.type}</span>
                {toAgent && <span style={{ color: agentColor(m.to) }}>{agentName(m.to)}</span>}
                {sup === 'FRAUD' && <span className="ml-auto rounded-full bg-scam px-1.5 text-[.65rem] text-white">red flag</span>}
                {sup === 'LEGIT' && <span className="ml-auto rounded-full bg-safe-bright px-1.5 text-[.65rem] text-white">good sign</span>}
              </div>
              <p className={`mt-0.5 text-[.86rem] leading-snug ${dark ? 'text-white/90' : ''}`}>{m.text}</p>
            </motion.div>
          );
        })}
      </AnimatePresence>
      <div ref={end} />
    </div>
  );
}
