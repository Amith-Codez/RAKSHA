/** The 11 agents, their colours and where they sit in the constellation (x, y in a 0–100 box, z for depth). */
export interface AgentMeta { id: string; name: string; role: string; color: string; glyph: string; x: number; y: number; z: number }

export const AGENTS: AgentMeta[] = [
  { id: 'orchestrator', name: 'Orchestrator', role: 'runs the investigation', color: '#9C8BFF', glyph: 'O', x: 50, y: 50, z: 1 },
  { id: 'extractor', name: 'Extractor', role: 'reads the ad (vision OCR)', color: '#6B4DFF', glyph: 'E', x: 50, y: 12, z: 0.7 },
  { id: 'router', name: 'Router', role: 'plans who checks what', color: '#FFB224', glyph: 'R', x: 80, y: 22, z: 0.85 },
  { id: 'registry', name: 'Registry', role: 'SEBI & RBI records', color: '#12C38A', glyph: '₹', x: 92, y: 50, z: 0.6 },
  { id: 'web', name: 'Web & contact', role: 'links, phones, UPI', color: '#22B8CF', glyph: 'W', x: 82, y: 78, z: 0.8 },
  { id: 'link', name: 'Link', role: 'where buttons really go', color: '#4DABF7', glyph: 'L', x: 58, y: 90, z: 0.65 },
  { id: 'community', name: 'Community memory', role: 'what other families reported', color: '#F783AC', glyph: 'C', x: 30, y: 88, z: 0.75 },
  { id: 'pattern', name: 'Scam-pattern', role: 'how retiree scams work', color: '#FF922B', glyph: 'P', x: 12, y: 70, z: 0.6 },
  { id: 'prosecutor', name: 'Prosecutor', role: 'argues it is a scam', color: '#FF4D6D', glyph: '⚖', x: 10, y: 38, z: 0.85 },
  { id: 'defender', name: 'Defender', role: 'argues it is genuine', color: '#51CF66', glyph: '⛨', x: 22, y: 16, z: 0.7 },
  { id: 'arbiter', name: 'Arbiter', role: 'gives the final verdict', color: '#FFD43B', glyph: 'A', x: 50, y: 70, z: 0.95 },
];
export const AGENT = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<string, AgentMeta>;
export const agentName = (id: string) => (id === 'blackboard' ? 'Blackboard' : id === 'user' ? 'You' : AGENT[id]?.name ?? id);
export const agentColor = (id: string) => AGENT[id]?.color ?? '#9C8BFF';
