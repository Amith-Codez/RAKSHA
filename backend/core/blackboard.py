"""Shared memory for one investigation: claims, evidence, negotiation turns, trace, verdict.

Every agent reads from and writes to the same Blackboard. Every write is logged to `trace`,
and `on_event` streams each trace message to the UI as it happens.
"""
from __future__ import annotations

import time

AGENTS = {
    "orchestrator": {"name": "Orchestrator", "role": "runs the investigation"},
    "extractor": {"name": "Extractor", "role": "reads the ad"},
    "router": {"name": "Router", "role": "plans who checks what"},
    "registry": {"name": "Registry agent", "role": "checks SEBI & RBI records"},
    "web": {"name": "Web & contact agent", "role": "checks links and phone numbers"},
    "pattern": {"name": "Scam-pattern agent", "role": "knows how retiree scams work"},
    "link": {"name": "Link agent", "role": "finds where the buttons really go"},
    "community": {"name": "Community-memory agent", "role": "remembers scams other families reported"},
    "prosecutor": {"name": "Prosecutor", "role": "argues it is a fraud"},
    "defender": {"name": "Defender", "role": "argues it is genuine"},
    "arbiter": {"name": "Arbiter", "role": "gives the final verdict"},
}

SUPPORTS = ("FRAUD", "LEGIT", "NEUTRAL")


class Blackboard:
    def __init__(self, ad_text: str = "", image: bytes | None = None, image_mime: str = "image/png",
                 on_event=None, page_url: str = "", page_title: str = "", page_links: list | None = None,
                 image_hash: str | None = None):
        self.ad_text = ad_text or ""
        self.page_url = page_url or ""
        self.page_title = page_title or ""
        self.page_links = page_links or []
        self.image_hash = image_hash
        self.image = image
        self.image_mime = image_mime
        self.on_event = on_event
        self.claims: dict = {}
        self.evidence: list[dict] = []
        self.turns: list[dict] = []
        self.charges: list[dict] = []
        self.trace: list[dict] = []
        self.verdict: dict | None = None
        self.agent_runs: list[str] = []
        self.plan: list[dict] = []
        self.converged: bool | None = None
        self.started = time.time()

    # ---- evidence -------------------------------------------------------
    def add_evidence(self, agent: str, finding: str, supports: str = "NEUTRAL", strength: int = 1,
                     source: str = "") -> str | None:
        supports = supports.upper() if isinstance(supports, str) else "NEUTRAL"
        if supports not in SUPPORTS:
            supports = "NEUTRAL"
        try:
            strength = max(1, min(3, int(strength)))
        except (TypeError, ValueError):
            strength = 1
        finding = (finding or "").strip()
        if not finding:
            return None
        for e in self.evidence:                       # no duplicates
            if e["agent"] == agent and e["finding"].lower() == finding.lower():
                self.log(agent, "blackboard", "note", f"Re-checked: confirms {e['id']} ({finding[:90]})", [e["id"]])
                return e["id"]
        eid = f"E{len(self.evidence) + 1}"
        ev = {"id": eid, "agent": agent, "finding": finding, "supports": supports,
              "strength": strength, "source": source}
        self.evidence.append(ev)
        self.log(agent, "blackboard", "evidence", finding, [eid], data=ev)
        return eid

    def evidence_ids(self) -> set[str]:
        return {e["id"] for e in self.evidence}

    def evidence_table(self) -> str:
        if not self.evidence:
            return "(no evidence yet)"
        return "\n".join(
            f"{e['id']} [{e['agent']}] supports={e['supports']} strength={e['strength']}: {e['finding']}"
            + (f" (source: {e['source']})" if e["source"] else "")
            for e in self.evidence)

    # ---- trace ------------------------------------------------------------
    def log(self, frm: str, to: str, type_: str, text: str, evidence_ids=None, data=None) -> dict:
        msg = {"step": len(self.trace) + 1, "t": round(time.time() - self.started, 1),
               "from": frm, "to": to, "type": type_, "text": text,
               "evidence_ids": list(evidence_ids or []), "data": data}
        self.trace.append(msg)
        if self.on_event:
            try:
                self.on_event(msg)
            except Exception:
                pass                                   # UI problems never break the investigation
        return msg

    def to_dict(self) -> dict:
        return {"ad_text": self.ad_text, "page_url": self.page_url, "page_links": self.page_links,
                "image_hash": self.image_hash, "claims": self.claims, "evidence": self.evidence,
                "turns": self.turns, "charges": self.charges, "trace": self.trace, "verdict": self.verdict,
                "plan": self.plan, "converged": self.converged, "agent_runs": self.agent_runs,
                "duration_s": round(time.time() - self.started, 1)}
