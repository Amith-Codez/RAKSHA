"""Runs one investigation: extract -> route -> specialists (with hand-offs) -> negotiation -> verdict."""
from __future__ import annotations

import json
import os
from collections import deque

from agents import (advocates, arbiter, community_agent, extractor, link_agent, pattern_agent, registry_agent,
                    router, web_agent)
from core import llm
from core.blackboard import Blackboard
from core.config import MAX_AGENT_STEPS, RUNS
from tools.registry import Registry

_registry: Registry | None = None


def get_registry() -> Registry:
    global _registry
    if _registry is None:
        _registry = Registry()
    return _registry


class Runner:
    def __init__(self, bb: Blackboard, reg: Registry, store=None):
        self.bb, self.reg, self.store = bb, reg, store
        self.steps = 0
        self.done: set[str] = set()
        self.queries: set[tuple] = set()

    def specialist(self, task: dict) -> list[dict]:
        """Run one specialist for a task {to, query, why, from}; returns its own hand-offs."""
        to, q = task["to"], task.get("query")
        key = (to, (q or "").strip().lower())
        if key in self.queries:
            return []
        if self.steps >= MAX_AGENT_STEPS:
            self.bb.log("orchestrator", to, "note", f"Step limit ({MAX_AGENT_STEPS}) reached; skipped: {task['why']}")
            return []
        self.queries.add(key)
        self.steps += 1
        text = task["why"] + (f' — checking "{q}"' if q else "")
        self.bb.log(task.get("from", "orchestrator"), to, "handoff", text)
        req = {"query": q} if q else None
        if to == "registry":
            out = registry_agent.run(self.bb, self.reg, req, self.done)
        elif to == "web":
            out = web_agent.run(self.bb, req, self.done)
        elif to == "link":
            out = link_agent.run(self.bb, req, self.done)
        elif to == "community":
            out = community_agent.run(self.bb, self.store, req, self.done) if self.store else []
        else:
            out = pattern_agent.run(self.bb, req, self.done)
        self.done.add(to)
        self.bb.agent_runs.append(to)
        return [{**h, "from": to} for h in out]

    def investigate_specialists(self, plan: list[dict]):
        queue = deque({"to": p["agent"], "query": None, "why": p["why"], "from": "router"} for p in plan)
        while queue and self.steps < MAX_AGENT_STEPS:
            task = queue.popleft()
            if task.get("query") is None and task["to"] in self.done:
                continue
            for h in self.specialist(task):
                if h.get("query") is None and (h["to"] in self.done or any(t["to"] == h["to"] for t in queue)):
                    continue
                queue.append(h)

    def _round(self, n: int, p_turn: dict | None, d_turn: dict | None):
        if not p_turn or not d_turn:
            return
        p, d = p_turn["fraud_probability"], d_turn["fraud_probability"]
        self.bb.log("orchestrator", "arbiter", "round",
                    f"Round {n}: Prosecutor {p}% vs Defender {d}% — {abs(p - d)} points apart",
                    data={"round": n, "prosecutor": p, "defender": d, "gap": abs(p - d)})

    def negotiate(self):
        """Charge-by-charge negotiation: OPEN -> RESPOND (+checks) -> REBUT -> FINAL. Contested charges go to the Arbiter."""
        bb = self.bb
        bb.log("orchestrator", "prosecutor", "handoff",
               f"{len(bb.evidence)} pieces of evidence collected. Prosecutor: file your charges. "
               f"Defender: answer each one.")
        p_open, req = advocates.open_case(bb)
        if p_open is None:
            bb.converged = False
            return
        if not bb.charges:
            bb.converged = True
            bb.log("orchestrator", "arbiter", "note", "The Prosecutor filed no charges.")
            return
        if req:
            self.specialist({**req, "from": "prosecutor"})
        d_resp, checks = advocates.respond(bb)
        if d_resp is None:
            bb.converged = False
            return
        for chk in checks:                                  # the Defender asks specialists to settle a charge
            self.specialist({**chk, "from": "defender"})
        self._round(1, p_open, d_resp)
        if any(c["status"] in ("DISPUTED", "CHECKED") for c in bb.charges):
            p_reb = advocates.rebut(bb)
            if p_reb is None:
                for c in bb.charges:
                    if c["status"] in ("DISPUTED", "CHECKED"):
                        c["status"] = "CONTESTED"
            d_fin = advocates.final(bb) if any(c["status"] == "MAINTAINED" for c in bb.charges) else None
            self._round(2, p_reb, d_fin or d_resp)
        open_ = [c for c in bb.charges if c["status"] in ("CONTESTED", "OPEN")]
        bb.converged = not open_
        agreed = len(bb.charges) - len(open_)
        bb.log("orchestrator", "arbiter", "note",
               f"Agreed on {agreed} of {len(bb.charges)} charges"
               + (f"; {len(open_)} contested charge(s) go to the Arbiter." if open_ else ". Arbiter confirms the verdict."))


def investigate(ad_text: str = "", image: bytes | None = None, image_mime: str = "image/png",
                on_event=None, registry: Registry | None = None, *, page_url: str = "", page_title: str = "",
                page_links: list | None = None, image_hash: str | None = None, store=None) -> Blackboard:
    llm.set_scan_deadline(float(os.getenv("SCAN_BUDGET_S", "50")))
    bb = Blackboard(ad_text, image, image_mime, on_event, page_url, page_title, page_links, image_hash)
    runner = Runner(bb, registry or get_registry(), store)
    bb.log("orchestrator", "extractor", "handoff", "New ad received. Extractor: read it and list every checkable claim.")
    extractor.run(bb)
    plan = router.run(bb)
    runner.investigate_specialists(plan)
    runner.negotiate()
    arbiter.run(bb)
    return bb


def save_run(bb: Blackboard, run_id: str) -> str:
    path = RUNS / f"{run_id}.json"
    path.write_text(json.dumps(bb.to_dict(), ensure_ascii=False, indent=1))
    return str(path)


def load_run(run_id: str) -> dict | None:
    path = RUNS / f"{run_id}.json"
    return json.loads(path.read_text()) if path.exists() else None
