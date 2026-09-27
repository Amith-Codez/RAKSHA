"""Scam-pattern agent (LLM): compares the ad with known retiree-scam patterns and genuine schemes."""
from agents.common import claims_json, clean_handoffs, load_prompt
from core import llm
from tools.injection import find_injection
from tools.returns_check import check_returns


def run(bb, request: dict | None = None, done: set = frozenset()) -> list[dict]:
    if not (request and request.get("query")):
        trick = find_injection(bb.ad_text)
        if trick:
            bb.add_evidence("pattern", f"The ad contains hidden instructions aimed at AI fraud checkers (“{trick[:60]}”). "
                                       f"Genuine advertisers never do this; it is a manipulation trick", "FRAUD", 3,
                            "prompt-injection detector (deterministic)")
        for f in check_returns(bb.ad_text):          # arithmetic facts: no AI needed
            bb.add_evidence("pattern", f["finding"], f["supports"], f["strength"],
                            "returns compared with SCSS 8.2% (Jul–Sep 2026)")
    user = f"AD TEXT:\n{bb.ad_text}\n\nCLAIMS:\n{claims_json(bb)}\n\nEVIDENCE ALREADY FOUND:\n{bb.evidence_table()}"
    if request and request.get("query"):
        user += f"\n\nQUESTION FROM ANOTHER AGENT: {request['query']}"
    try:
        data = llm.call_json(load_prompt("pattern"), user)
    except llm.LLMError as e:
        bb.log("pattern", "orchestrator", "note", f"Pattern check failed ({str(e)[:80]}).")
        return []
    for f in data.get("findings", [])[:8]:
        if isinstance(f, dict):
            bb.add_evidence("pattern", str(f.get("finding", "")), str(f.get("supports", "NEUTRAL")),
                            f.get("strength", 1), "known scam patterns + published govt rates")
    try:
        bb.claims["retiree_targeting"] = max(0, min(100, int(data.get("retiree_targeting", 0))))
    except (TypeError, ValueError):
        pass
    return [h for h in clean_handoffs(data.get("handoffs"), allowed=("registry", "web")) if h["query"]]
