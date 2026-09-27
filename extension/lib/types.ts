export type Lang = 'en' | 'hi' | 'te';
export type TextSize = 'md' | 'lg' | 'xl';
export type Label = 'FRAUD' | 'SUSPICIOUS' | 'LIKELY_SAFE';

export interface PageLink { href: string; text: string }

/** What the page overlay + background worker hand to the side panel. */
export interface PendingScan {
  id: string;
  createdAt: number;
  image?: string;            // data URL of the cropped selection (JPEG)
  text: string;              // text the page shows inside the selection (DOM, no OCR needed)
  links: PageLink[];         // real hrefs under the selection
  sampleIds: string[];       // demo-feed ads inside the selection
  pageUrl: string;
  pageTitle: string;
  source: 'area' | 'text' | 'link';
  windowId?: number;         // only the side panel of THIS window picks it up
}

export interface TraceMsg {
  step: number; t: number; from: string; to: string; type: string; text: string;
  evidence_ids?: string[]; data?: unknown;
}

export interface Evidence { id: string; agent: string; finding: string; supports: 'FRAUD' | 'LEGIT' | 'NEUTRAL'; strength: number; source: string }
export interface Charge { id: string; charge: string; severity: number; evidence_ids: string[]; status: string; history: [string, string][]; ruling: unknown }
export interface Verdict {
  label: Label; risk: number; headline: string; headline_hi?: string; not_investment?: boolean;
  reasons: string[]; reasons_hi?: string[]; reason_evidence?: string[][];
  what_to_do: string[]; what_to_do_hi?: string[];
  deciding_factor?: string; retiree_targeting?: number; retiree_hooks?: string[];
  charges_summary?: Record<string, number>; converged?: boolean;
}
export interface Run {
  ad_text: string; page_url?: string; claims: Record<string, any>; evidence: Evidence[]; charges: Charge[];
  trace: TraceMsg[]; verdict: Verdict; agent_runs?: string[]; duration_s?: number;
}
export interface DoneLine { type: 'done'; run: Run; replayed: boolean; scan_id?: string | null; memory?: string; learned?: number }

export interface HistoryItem { id: string; at: number; label: Label; risk: number; headline: string; page: string; thumb?: string; scanId?: string | null }
