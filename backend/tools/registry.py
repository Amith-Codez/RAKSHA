"""Offline lookups against official registers.

* SEBI Investment Advisers (INA...) and Research Analysts (INH...) - scraped from sebi.gov.in
* RBI Alert List of unauthorised forex platforms
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlparse

from rapidfuzz import fuzz

from core.config import DATA

PREFIX_TYPES = {"INA": "Investment Adviser", "INH": "Research Analyst", "INZ": "Stock Broker",
                "INP": "Portfolio Manager", "INM": "Merchant Banker", "INR": "Registrar / Transfer Agent"}
COVERED = {"INA", "INH"}
SUFFIXES = r"\b(private|pvt|limited|ltd|llp|inc|company|co|the|and|services|investment|advisers?|advisors?|"\
           r"research|analysts?)\b"
SECOND_LEVEL = {"co", "gov", "org", "net", "ac", "nic", "res", "gen", "firm", "ind", "edu", "com"}


def registered_domain(value: str) -> str:
    """'https://www.sbi.co.in/x' -> 'sbi.co.in'; 'a@gmail.com' -> 'gmail.com'."""
    v = (value or "").strip().lower()
    if "@" in v and "/" not in v:
        v = v.split("@", 1)[1]
    if "://" not in v:
        v = "http://" + v
    host = (urlparse(v).hostname or "").strip(".")
    parts = host.split(".")
    if len(parts) >= 3 and parts[-2] in SECOND_LEVEL and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def _norm(name: str) -> str:
    n = (name or "").lower().replace("&", " and ")
    n = re.sub(r"[^a-z0-9 ]", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def _core(name: str) -> str:
    return re.sub(r"\s+", " ", re.sub(SUFFIXES, " ", _norm(name))).strip()


class Registry:
    def __init__(self, data_dir: Path | str = DATA):
        data_dir = Path(data_dir)
        self.sebi: dict[str, dict] = {}
        self.meta: dict = {}
        for fname, label in (("sebi_ia.json", "Investment Adviser"), ("sebi_ra.json", "Research Analyst")):
            p = data_dir / fname
            if not p.exists():
                self.meta[fname] = {"count": 0, "complete": False}
                continue
            d = json.loads(p.read_text())
            for r in d.get("records", []):
                if r.get("reg_no"):
                    self.sebi[r["reg_no"].upper()] = {**r, "type": label}
            self.meta[fname] = {"count": len(d.get("records", [])), "complete": d.get("complete", True),
                                "date": d.get("scraped_on", "")}
        p = data_dir / "rbi_alert.json"
        d = json.loads(p.read_text()) if p.exists() else {"records": []}
        self.rbi = d.get("records", [])
        self.meta["rbi_alert.json"] = {"count": len(self.rbi), "date": d.get("updated_as_on", "")}
        self._names = [(_core(r["name"]), r) for r in self.sebi.values()]

    # ---- descriptions used in evidence text ----
    def sebi_source(self) -> str:
        ia, ra = self.meta.get("sebi_ia.json", {}), self.meta.get("sebi_ra.json", {})
        return (f"SEBI registers on sebi.gov.in: {ia.get('count', 0)} Investment Advisers, "
                f"{ra.get('count', 0)} Research Analysts (snapshot {ia.get('date') or ra.get('date') or 'n/a'})")

    def sebi_complete(self) -> bool:
        return all(self.meta.get(f, {}).get("complete") for f in ("sebi_ia.json", "sebi_ra.json"))

    def rbi_source(self) -> str:
        return f"RBI Alert List ({len(self.rbi)} entities, updated {self.meta['rbi_alert.json'].get('date')})"

    # ---- lookups ----
    def lookup_reg_no(self, reg_no: str) -> dict:
        reg = (reg_no or "").upper().replace(" ", "")
        prefix = reg[:3]
        rec = self.sebi.get(reg)
        return {"reg_no": reg, "found": rec is not None, "record": rec, "covered": prefix in COVERED,
                "prefix_type": PREFIX_TYPES.get(prefix, "unknown SEBI category")}

    def search_name(self, name: str, limit: int = 3, threshold: int = 90) -> list[dict]:
        q = _core(name)
        if len(q) < 3:
            return []
        scored = []
        for core, rec in self._names:
            if not core:
                continue
            s = max(fuzz.token_sort_ratio(q, core), fuzz.ratio(q, core))
            # "360 ONE" should find "360 ONE Investment Adviser and Trustee Services Ltd":
            # allow subset matches, but only for specific (multi-word) queries.
            if s < threshold and len(q.split()) >= 2 and len(q) >= 5 \
                    and len(core.split()) <= len(q.split()) + 2 and fuzz.token_set_ratio(q, core) >= 95:
                s = 91
            if s >= threshold:
                scored.append({"score": round(s), "record": rec})
        scored.sort(key=lambda x: -x["score"])
        return scored[:limit]

    def official_domain(self, record: dict) -> str | None:
        email = (record or {}).get("email") or ""
        return registered_domain(email) if "@" in email else None

    def rbi_alert(self, names: list[str], links: list[str]) -> list[dict]:
        hits = []
        domains = {registered_domain(l) for l in links if l}
        texts = [_norm(n) for n in names if n]
        for r in self.rbi:
            dom = (r.get("domain") or "").lower()
            if dom and registered_domain(dom) in domains:
                hits.append({**r, "matched_on": "website"})
                continue
            rn = _norm(r["name"])
            for t in texts:
                if not rn or not t:
                    continue
                whole_word = re.search(rf"(?<![a-z0-9]){re.escape(rn)}(?![a-z0-9])", t) is not None
                if whole_word or (len(rn) >= 6 and fuzz.token_set_ratio(rn, t) >= 95 and len(t) <= len(rn) + 12):
                    hits.append({**r, "matched_on": "name"})
                    break
        return hits
