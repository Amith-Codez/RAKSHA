"""Router: decides at runtime which specialists investigate first (autonomous hand-off)."""
from agents.common import SPECIALIST_NAMES, claims_json, load_prompt
from core import llm


def fallback_plan(c: dict) -> list[dict]:
    plan = []
    if c.get("reg_numbers") or c.get("advertiser"):
        plan.append({"agent": "registry", "why": "(rule) the ad names a company or quotes a registration number"})
    if c.get("links") or c.get("phones") or c.get("emails"):
        plan.append({"agent": "web", "why": "(rule) the ad has links or phone numbers to check"})
    return plan


def run(bb) -> list[dict]:
    plan, seen = [], set()
    try:
        ctx = f"\nPAGE LINKS UNDER THE AD: {len(bb.page_links)}" if bb.page_links else ""
        data = llm.call_json(load_prompt("router"), f"CLAIMS FROM THE AD:\n{claims_json(bb)}{ctx}")
        for p in data.get("plan", []) if isinstance(data, dict) else []:
            a = str(p.get("agent", "")).strip().lower()
            if a in SPECIALIST_NAMES and a not in seen:
                seen.add(a)
                plan.append({"agent": a, "why": str(p.get("why") or "").strip() or f"{a} check"})
    except llm.LLMError as e:
        bb.log("router", "orchestrator", "note", f"AI planning failed ({str(e)[:80]}); using rule-based plan.")
    if not plan:
        plan = fallback_plan(bb.claims)
        seen = {p["agent"] for p in plan}
    if "registry" not in seen:
        plan.append({"agent": "registry", "why": "(safety rule) every ad is screened against SEBI and RBI lists"})
    if "web" not in seen and (bb.claims.get("links") or bb.claims.get("phones") or bb.claims.get("emails")
                              or bb.claims.get("upi_ids")):
        plan.append({"agent": "web", "why": "(safety rule) the ad has links, numbers or payment IDs to check"})
    if "link" not in seen and bb.page_links:
        plan.insert(0, {"agent": "link", "why": "(safety rule) follow the real links under the ad before anyone clicks"})
    if "community" not in seen:
        plan.append({"agent": "community", "why": "(safety rule) check whether other families already reported this"})
    if "pattern" not in seen:
        plan.append({"agent": "pattern", "why": "(safety rule) every ad gets a scam-pattern check"})
    bb.plan = plan
    names = {"registry": "Registry", "web": "Web & contact", "pattern": "Scam-pattern", "link": "Link",
             "community": "Community memory"}
    bb.log("router", "orchestrator", "plan", "Plan: " + " → ".join(names[p["agent"]] for p in plan), data=plan)
    return plan
