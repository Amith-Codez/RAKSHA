import { motion } from 'motion/react';

export const STEPS = ['read', 'check', 'debate', 'verdict'] as const;
export type Step = (typeof STEPS)[number];

export function Stepper({ current, labels }: { current: number; labels: Record<Step, string> }) {
  return (
    <ol className="grid grid-cols-4 gap-1.5" aria-label="Progress">
      {STEPS.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'on' : 'todo';
        return (
          <li key={s} className="flex flex-col gap-1" aria-current={state === 'on' ? 'step' : undefined}>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/12">
              <motion.div className="h-full rounded-full bg-marigold" initial={{ width: 0 }}
                animate={{ width: state === 'done' ? '100%' : state === 'on' ? ['15%', '85%', '15%'] : 0 }}
                transition={state === 'on' ? { duration: 2.2, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.4 }} />
            </div>
            <span className={`text-[.7rem] font-semibold tracking-wide ${state === 'todo' ? 'text-white/40' : state === 'on' ? 'text-marigold' : 'text-white/85'}`}>{labels[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function stepOf(events: { type: string; to: string }[]): number {
  let s = 0;
  for (const m of events) {
    if (m.type === 'claims') s = Math.max(s, 1);
    if (m.to === 'prosecutor' && m.type === 'handoff') s = Math.max(s, 2);
    if (m.type === 'verdict') s = 4;
  }
  return s;
}
