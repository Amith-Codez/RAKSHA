"""Community memory + scan history.

Supabase (managed Postgres) when SUPABASE_URL and SUPABASE_SERVICE_KEY are set, otherwise a local SQLite file with the
same tables. If Supabase fails mid-demo, every call falls back to SQLite so a check never breaks.
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from datetime import datetime, timezone

import requests

from core.config import CACHE
from tools.fingerprint import similar
from tools.registry import registered_domain
from tools.web_contact import FREE_EMAIL, MESSAGING, OFFICIAL, SHORTENERS, phone_info

# Big platforms carry scams but are not scams themselves: never let them (or official sites) be "flagged".
PLATFORMS = {"facebook.com", "fb.com", "instagram.com", "youtube.com", "youtu.be", "google.com", "x.com", "twitter.com",
             "linkedin.com", "apple.com", "microsoft.com", "amazon.in", "amazon.com", "reddit.com", "sharechat.com"}
SKIP_DOMAINS = set(OFFICIAL) | FREE_EMAIL | MESSAGING | SHORTENERS | PLATFORMS | {"localhost", "127.0.0.1"}
AUTO_WEIGHT, REPORT_WEIGHT = 1, 2


def indicators_of(run: dict) -> list[tuple[str, str]]:
    """The reusable fingerprints of an ad: domains (shown + real destinations), phones, UPI IDs, SEBI numbers, image."""
    c = run.get("claims") or {}
    out = set()
    for x in (c.get("links") or []) + (c.get("emails") or []) + (c.get("final_domains") or []):
        d = registered_domain(x)
        if d and d not in SKIP_DOMAINS and not d.endswith(".gov.in"):
            out.add(("domain", d))
    for p in c.get("phones") or []:
        info = phone_info(p)
        if info.get("e164"):
            out.add(("phone", info["e164"]))
    for u in c.get("upi_ids") or []:
        out.add(("upi", u.lower()))
    for r in c.get("reg_numbers") or []:
        out.add(("reg_no", r.upper()))
    if run.get("image_hash"):
        out.add(("image_hash", run["image_hash"]))
    return sorted(out)


class SQLiteStore:
    name = "sqlite"

    def __init__(self, path=None):
        self.path = str(path or (CACHE / "raksha.db"))
        self.lock = threading.Lock()
        with self._db() as db:
            db.executescript("""
            create table if not exists scans (id text primary key, created_at text, install_id text, page_domain text,
              page_url text, verdict text, risk int, image_hash text, ocr_text text, claims text, charges text,
              evidence text, trace text, model text);
            create table if not exists indicators (kind text, value text, scam_count int default 0,
              safe_count int default 0, first_seen text, last_seen text, primary key (kind, value));
            create table if not exists reports (id integer primary key autoincrement, scan_id text, install_id text,
              label text, note text, created_at text);
            create table if not exists installs (install_id text primary key, language text, text_size text,
              family_hint text, created_at text);
            create table if not exists votes (install_id text, kind text, value text, source text, created_at text,
              primary key (install_id, kind, value, source));
            """)

    def _db(self):
        return sqlite3.connect(self.path, timeout=10)

    @staticmethod
    def _now():
        return datetime.now(timezone.utc).isoformat(timespec="seconds")

    def save_scan(self, run: dict, meta: dict) -> str:
        sid = str(uuid.uuid4())
        v = run.get("verdict") or {}
        with self.lock, self._db() as db:
            db.execute("insert into scans values (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                sid, self._now(), meta.get("install_id"), registered_domain(meta.get("page_url") or ""),
                meta.get("page_url"), v.get("label"), v.get("risk"), run.get("image_hash"), run.get("ad_text", "")[:4000],
                json.dumps(run.get("claims")), json.dumps(run.get("charges")), json.dumps(run.get("evidence")),
                json.dumps(run.get("trace"))[:200000], meta.get("model")))
        return sid

    def bump(self, kind: str, value: str, scam: int, safe: int):
        now = self._now()
        with self.lock, self._db() as db:
            db.execute("""insert into indicators values (?,?,?,?,?,?) on conflict(kind, value) do update set
                          scam_count = scam_count + excluded.scam_count, safe_count = safe_count + excluded.safe_count,
                          last_seen = excluded.last_seen""", (kind, value, scam, safe, now, now))

    def lookup(self, kind: str, values: list[str]) -> dict:
        if not values:
            return {}
        with self._db() as db:
            q = f"select value, scam_count, safe_count, last_seen from indicators where kind=? and value in ({','.join('?' * len(values))})"
            return {r[0]: {"scam_count": r[1], "safe_count": r[2], "last_seen": r[3]} for r in db.execute(q, [kind, *values])}

    def first_vote(self, install_id: str | None, kind: str, value: str, source: str) -> bool:
        """One vote per install per fingerprint per source: re-scanning or re-reporting can't inflate the count."""
        if not install_id:
            return True
        with self.lock, self._db() as db:
            cur = db.execute("insert or ignore into votes values (?,?,?,?,?)", (install_id, kind, value, source, self._now()))
            return cur.rowcount == 1

    def scam_hashes(self, limit: int = 500) -> list[tuple[str, str]]:
        with self._db() as db:
            return list(db.execute("select image_hash, created_at from scans where verdict='FRAUD' and image_hash is not null "
                                   "order by created_at desc limit ?", (limit,)))

    def get_scan(self, scan_id: str) -> dict | None:
        with self._db() as db:
            r = db.execute("select claims, image_hash, verdict from scans where id=?", (scan_id,)).fetchone()
        return {"claims": json.loads(r[0] or "{}"), "image_hash": r[1], "verdict": {"label": r[2]}} if r else None

    def add_report(self, scan_id: str, label: str, note: str | None, install_id: str | None):
        with self.lock, self._db() as db:
            db.execute("insert into reports (scan_id, install_id, label, note, created_at) values (?,?,?,?,?)",
                       (scan_id, install_id, label, note, self._now()))


class SupabaseStore(SQLiteStore):
    """Same interface over Supabase's REST API (PostgREST). Local SQLite is the safety net."""
    name = "supabase"

    def __init__(self, url: str, key: str):
        super().__init__()                       # creates the local fallback DB
        self.url = url.rstrip("/") + "/rest/v1"
        self.h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
        self.degraded = False

    def _req(self, method, path, **kw):
        r = requests.request(method, f"{self.url}/{path}", headers={**self.h, **kw.pop("headers", {})}, timeout=6, **kw)
        if r.status_code >= 300:
            raise RuntimeError(f"supabase {r.status_code}: {r.text[:200]}")
        return r.json() if r.text else None

    def _try(self, remote, local):
        try:
            out = remote()
            self.degraded = False
            return out
        except Exception:
            self.degraded = True
            return local()

    def save_scan(self, run, meta):
        v = run.get("verdict") or {}
        row = {"install_id": meta.get("install_id"), "page_domain": registered_domain(meta.get("page_url") or ""),
               "page_url": meta.get("page_url"), "verdict": v.get("label"), "risk": v.get("risk"),
               "image_hash": run.get("image_hash"), "ocr_text": (run.get("ad_text") or "")[:4000],
               "claims": run.get("claims"), "charges": run.get("charges"), "evidence": run.get("evidence"),
               "trace": run.get("trace"), "model": meta.get("model")}
        return self._try(lambda: self._req("POST", "scans", json=row, headers={"Prefer": "return=representation"})[0]["id"],
                         lambda: SQLiteStore.save_scan(self, run, meta))

    def bump(self, kind, value, scam, safe):
        return self._try(lambda: self._req("POST", "rpc/bump_indicator",
                                           json={"p_kind": kind, "p_value": value, "p_scam": scam, "p_safe": safe}),
                         lambda: SQLiteStore.bump(self, kind, value, scam, safe))

    def lookup(self, kind, values):
        if not values:
            return {}
        quoted = ",".join('"' + v.replace('"', "") + '"' for v in values)

        def remote():
            rows = self._req("GET", "indicators", params={"select": "value,scam_count,safe_count,last_seen",
                                                          "kind": f"eq.{kind}", "value": f"in.({quoted})"})
            return {r["value"]: {k: r[k] for k in ("scam_count", "safe_count", "last_seen")} for r in rows}
        return self._try(remote, lambda: SQLiteStore.lookup(self, kind, values))

    def scam_hashes(self, limit=500):
        def remote():
            rows = self._req("GET", "scans", params={"select": "image_hash,created_at", "verdict": "eq.FRAUD",
                                                     "image_hash": "not.is.null", "order": "created_at.desc",
                                                     "limit": str(limit)})
            return [(r["image_hash"], r["created_at"]) for r in rows]
        return self._try(remote, lambda: SQLiteStore.scam_hashes(self, limit))

    def get_scan(self, scan_id):
        def remote():
            rows = self._req("GET", "scans", params={"select": "claims,image_hash,verdict", "id": f"eq.{scan_id}"})
            return {"claims": rows[0]["claims"] or {}, "image_hash": rows[0]["image_hash"],
                    "verdict": {"label": rows[0]["verdict"]}} if rows else None
        return self._try(remote, lambda: SQLiteStore.get_scan(self, scan_id))

    def add_report(self, scan_id, label, note, install_id):
        return self._try(lambda: self._req("POST", "reports", json={"scan_id": scan_id, "label": label, "note": note,
                                                                    "install_id": install_id}),
                         lambda: SQLiteStore.add_report(self, scan_id, label, note, install_id))


# ---------------- high-level operations ----------------
def learn_from_verdict(store, run: dict, install_id: str | None = None):
    label = (run.get("verdict") or {}).get("label")
    if label not in ("FRAUD", "LIKELY_SAFE"):
        return 0
    n = 0
    for kind, value in indicators_of(run):
        if not store.first_vote(install_id, kind, value, "auto"):
            continue
        store.bump(kind, value, AUTO_WEIGHT if label == "FRAUD" else 0, AUTO_WEIGHT if label == "LIKELY_SAFE" else 0)
        n += 1
    return n


def report(store, scan_id: str, label: str, note: str | None = None, install_id: str | None = None) -> int:
    scan = store.get_scan(scan_id)
    if not scan:
        raise KeyError(scan_id)
    store.add_report(scan_id, label, note, install_id)
    if label == "unsure":
        return 0
    n = 0
    for kind, value in indicators_of(scan):
        if not store.first_vote(install_id, kind, value, "report"):
            continue
        store.bump(kind, value, REPORT_WEIGHT if label == "scam" else 0, REPORT_WEIGHT if label == "safe" else 0)
        n += 1
    return n


def similar_scams(store, image_hash: str | None) -> list[str]:
    if not image_hash:
        return []
    return [ts for h, ts in store.scam_hashes() if similar(h, image_hash)]


_store = None


def get_store():
    global _store
    if _store is None:
        url, key = os.getenv("SUPABASE_URL", "").strip(), os.getenv("SUPABASE_SERVICE_KEY", "").strip()
        _store = SupabaseStore(url, key) if url and key else SQLiteStore()
    return _store


def reset_store(store=None):
    global _store
    _store = store
