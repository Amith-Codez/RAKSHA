import { motion } from 'motion/react';
import { useMemo } from 'react';
import { AGENT, AGENTS } from '@/lib/agents';
import type { TraceMsg } from '@/lib/types';

/**
 * The 11 agents as a slowly turning 3D constellation. Every real hand-off in the stream lights up
 * the edge between the two agents, so the viewer SEES the negotiation happen.
 */
export function Constellation({ events, done }: { events: TraceMsg[]; done: boolean }) {
  const { edges, spoken, last } = useMemo(() => {
    const edges = new Map<string, { a: string; b: string; n: number; step: number; kind: string }>();
    const spoken = new Set<string>();
    let last = '';
    for (const m of events) {
      if (AGENT[m.from]) { spoken.add(m.from); last = m.from; }
      const to = m.to === 'blackboard' || m.to === 'user' ? 'orchestrator' : m.to;
      if (!AGENT[m.from] || !AGENT[to] || m.from === to) continue;
      const key = [m.from, to].sort().join('|');
      const e = edges.get(key);
      edges.set(key, { a: m.from, b: to, n: (e?.n ?? 0) + 1, step: m.step, kind: m.type });
    }
    return { edges: [...edges.values()], spoken, last };
  }, [events]);
  const newest = events.at(-1)?.step ?? -1;

  return (
    <div className="relative h-48 [perspective:700px]" aria-label="Live map of the agents talking to each other">
      <motion.div
        className="absolute inset-0 [transform-style:preserve-3d]"
        animate={done ? { rotateX: 0, rotateY: 0 } : { rotateY: [-14, 14, -14], rotateX: [16, 8, 16] }}
        transition={done ? { duration: 0.8 } : { duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      >
        <svg viewBox="-6 -6 112 112" className="h-full w-full overflow-visible">
          <defs>
            <radialGradient id="glow"><stop offset="0" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          </defs>
          {AGENTS.flatMap((a, i) => AGENTS.slice(i + 1).map((b) => (
            <line key={a.id + b.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffffff" strokeOpacity=".04" strokeWidth=".3" />
          )))}
          {edges.map((e) => {
            const A = AGENT[e.a]!, B = AGENT[e.b]!;
            const fresh = newest - e.step < 3;
            const hot = e.kind === 'argument' || e.kind === 'charge' || e.kind === 'response';
            return (
              <g key={e.a + e.b}>
                <line x1={A.x} y1={A.y} x2={B.x} y2={B.y} stroke={hot ? '#FF4D6D' : '#9C8BFF'}
                      strokeOpacity={fresh ? 0.95 : 0.35} strokeWidth={Math.min(1.6, 0.5 + e.n * 0.18)} strokeLinecap="round" />
                {fresh && (
                  <motion.circle r="1.6" fill={hot ? '#FF4D6D' : '#FFB224'}
                    initial={{ cx: A.x, cy: A.y, opacity: 0 }} animate={{ cx: [A.x, B.x], cy: [A.y, B.y], opacity: [0, 1, 0] }}
                    transition={{ duration: 1.1, repeat: done ? 0 : Infinity, ease: 'easeInOut' }} />
                )}
              </g>
            );
          })}
          {AGENTS.map((a) => {
            const on = spoken.has(a.id);
            const r = 3.2 + a.z * 2.2;
            return (
              <g key={a.id} opacity={on ? 1 : 0.35}>
                {a.id === last && !done && (
                  <motion.circle cx={a.x} cy={a.y} fill="url(#glow)" initial={{ r: r }} animate={{ r: [r, r * 2.6], opacity: [0.8, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity }} />
                )}
                <circle cx={a.x} cy={a.y} r={r} fill={on ? a.color : '#2A2560'} stroke="#fff" strokeOpacity={on ? 0.9 : 0.2} strokeWidth=".5" />
                <text x={a.x} y={a.y + 1.3} textAnchor="middle" fontSize="3.6" fontWeight="700" fill={on ? '#110D2E' : '#8f88c9'}>{a.glyph}</text>
                {on && (
                  <text x={a.x} y={a.y + r + 4.2} textAnchor="middle" fontSize="3.3" fill="#fff" fillOpacity=".85">{a.name.split(' ')[0]}</text>
                )}
              </g>
            );
          })}
        </svg>
      </motion.div>
    </div>
  );
}
