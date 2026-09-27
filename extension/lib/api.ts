import type { DoneLine, PendingScan, TraceMsg } from './types';
import { cleanApi } from './settings';

export class ApiError extends Error {
  constructor(message: string, public status = 0, public kind: 'offline' | 'server' | 'input' | 'busy' = 'server') {
    super(message);
  }
}

async function friendly(r: Response): Promise<never> {
  let detail = '';
  try { detail = (await r.json()).detail; } catch { /* not JSON */ }
  if (typeof detail !== 'string') detail = '';
  const kind = r.status === 400 || r.status === 413 || r.status === 422 ? 'input' : r.status === 503 ? 'busy' : 'server';
  throw new ApiError(detail || `The RAKSHA server answered ${r.status}.`, r.status, kind);
}

/** POST /v2/scan and stream the agents' messages (NDJSON) as they happen. */
export async function streamScan(
  api: string,
  scan: PendingScan,
  opts: { installId: string; lang: string; offline: boolean; signal?: AbortSignal },
  onEvent: (m: TraceMsg) => void,
): Promise<DoneLine> {
  // hard ceiling: a hung model call must never leave the panel spinning forever
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort('timeout'), SCAN_TIMEOUT_MS);
  opts.signal?.addEventListener('abort', () => ctl.abort('user'));
  try {
    return await doScan(api, scan, opts, onEvent, ctl.signal);
  } catch (e) {
    if (ctl.signal.aborted && ctl.signal.reason === 'timeout') throw new ApiError('timeout', 0, 'busy');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const SCAN_TIMEOUT_MS = 75_000;

/** Privacy: never send query strings or #fragments (they can hold tokens, e-mails, chat IDs). */
export function privateUrl(u: string): string {
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? `${x.origin}${x.pathname}` : ''; } catch { return ''; }
}

async function doScan(
  api: string, scan: PendingScan, opts: { installId: string; lang: string; offline: boolean },
  onEvent: (m: TraceMsg) => void, signal: AbortSignal,
): Promise<DoneLine> {
  let r: Response;
  try {
    r = await fetch(`${cleanApi(api)}/v2/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        image_b64: scan.image, text: scan.text, page_url: privateUrl(scan.pageUrl), page_title: scan.pageTitle,
        links: scan.links.slice(0, 40), sample_ids: scan.sampleIds, install_id: opts.installId, lang: opts.lang,
        offline: opts.offline,
      }),
    });
  } catch (e) {
    if (signal.aborted) throw e;
    throw new ApiError('RAKSHA could not reach its server.', 0, 'offline');
  }
  if (!r.ok || !r.body) await friendly(r);
  const reader = r.body!.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buf += dec.decode(value, { stream: true });
    let i: number;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const msg = JSON.parse(line);
      if (msg.type === 'event') onEvent(msg.event);
      else if (msg.type === 'done') return msg as DoneLine;
      else if (msg.type === 'error') throw new ApiError(msg.message, 200, 'busy');
    }
    if (done) break;
  }
  throw new ApiError('The check stopped before it finished.', 0, 'server');
}

export async function sendReport(api: string, scanId: string, label: 'scam' | 'safe' | 'unsure', installId: string) {
  const r = await fetch(`${cleanApi(api)}/v2/report`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scan_id: scanId, label, install_id: installId }),
  });
  if (!r.ok) await friendly(r);
  return (await r.json()) as { ok: boolean; indicators_updated: number };
}

export interface Health { ok: boolean; ai: boolean; model: string; tts: boolean; memory: 'cloud' | 'local' }

export async function health(api: string, timeoutMs = 3500): Promise<Health | null> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(`${cleanApi(api)}/v2/health`, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

/** Natural voice from the server (ElevenLabs); falls back to the browser's own voice. */
let current: HTMLAudioElement | null = null;
export async function speak(api: string, text: string, lang: string): Promise<'natural' | 'browser'> {
  stopSpeaking();
  try {
    const r = await fetch(`${cleanApi(api)}/v2/tts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang }),
    });
    if (r.ok) {
      current = new Audio(URL.createObjectURL(await r.blob()));
      await current.play();
      return 'natural';
    }
  } catch { /* fall back */ }
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang === 'hi' ? 'hi-IN' : lang === 'te' ? 'te-IN' : 'en-IN';
  u.rate = 0.92;
  const v = speechSynthesis.getVoices().find((x) => x.lang === u.lang) ?? speechSynthesis.getVoices().find((x) => x.lang.startsWith(u.lang.slice(0, 2)));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
  return 'browser';
}
export function stopSpeaking() {
  current?.pause();
  current = null;
  speechSynthesis.cancel();
}

/** Verdict sentences in Telugu (or another Indian language), translated once on the server and cached. */
export async function translate(api: string, texts: string[], lang: string): Promise<string[] | null> {
  try {
    const r = await fetch(`${cleanApi(api)}/v2/translate`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texts, lang }),
    });
    return r.ok ? ((await r.json()).texts as string[]) : null;
  } catch { return null; }
}
