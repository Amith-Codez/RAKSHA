import { motion } from 'motion/react';

/** Animated "cursor draws a box over an ad" demo, reused by the tutorial. */
export function DrawDemo() {
  return (
    <div className="relative mx-auto h-36 w-56 overflow-hidden rounded-2xl bg-violet-soft">
      <div className="absolute left-5 top-4 h-28 w-44 rounded-xl bg-white p-2 shadow">
        <div className="h-8 rounded bg-scam/80" /><div className="mt-2 h-2 w-32 rounded bg-line" /><div className="mt-1.5 h-2 w-24 rounded bg-line" />
        <div className="mt-2.5 h-5 w-20 rounded bg-violet" />
      </div>
      <motion.div className="absolute rounded-xl border-[3px] border-marigold"
        style={{ left: 14, top: 10 }}
        animate={{ width: [0, 190, 190, 0], height: [0, 120, 120, 0], opacity: [1, 1, 1, 0] }}
        transition={{ duration: 3, repeat: Infinity, times: [0, 0.55, 0.85, 1] }} />
      <motion.svg width="22" height="22" viewBox="0 0 24 24" className="absolute" style={{ left: 8, top: 4 }}
        animate={{ x: [0, 190, 190, 0], y: [0, 120, 120, 0] }} transition={{ duration: 3, repeat: Infinity, times: [0, 0.55, 0.85, 1] }}>
        <path d="M3 2l7 19 2.5-7.5L20 11z" fill="#110D2E" stroke="#fff" strokeWidth="1.5" />
      </motion.svg>
    </div>
  );
}
