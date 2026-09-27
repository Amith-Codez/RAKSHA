"""Prosecutor and Defender (LLM): negotiate the verdict charge by charge.

OPEN     Prosecutor files charges C1, C2… (each with evidence and severity)
RESPOND  Defender answers each charge: ACCEPT, DISPUTE (innocent explanation) or CHECK (asks a specialist)
REBUT    Prosecutor answers disputed/checked charges: MAINTAIN or WITHDRAW
FINAL    Defender answers maintained charges: ACCEPT or CONTEST  -> contested charges go to the Arbiter
"""
from agents.common import SPECIALIST_NAMES, claims_json, clean_handoffs, load_prompt
from core import llm

SCHEMAS = {
    "OPEN": '{"fraud_probability": 0-100, "message": "…", "charges": [{"charge": "one specific accusation", '
            '"evidence_ids": ["E1"], "severity": 1-3}], "request": {"to": "registry|web|pattern", "query": "…", '
            '"why": "…"} or null}',
    "RESPOND": '{"fraud_probability": 0-100, "message": "…", "responses": [{"charge_id": "C1", '
               '"stance": "ACCEPT|DISPUTE|CHECK", "reason": "…", "evidence_ids": ["E2"], '
               '"check": {"to": "registry|web|pattern", "query": "…"} or null}]}',
    "REBUT": '{"fraud_probability": 0-100, "message": "…", "rulings": [{"charge_id": "C2", '
             '"stance": "MAINTAIN|WITHDRAW", "reason": "…", "evidence_ids": ["E3"]}]}',
    "FINAL": '{"fraud_probability": 0-100, "message": "…", "final": [{"charge_id": "C2", '
             '"stance": "ACCEPT|CONTEST", "reason": "…"}]}',
}
SIDE = {"OPEN": "prosecutor", "RESPOND": "defender", "REBUT": "prosecutor", "FINAL": "defender"}
LIST_KEY = {"OPEN": "charges", "RESPOND": "responses", "REBUT": "rulings", "FINAL": "final"}


def charge_sheet(bb) -> str:
    if not bb.charges:
        return "(no charges filed yet)"
    lines = []
    for c in bb.charges:
        line = f"{c['id']} [{c['status']}] severity {c['severity']}: {c['charge']} (evidence: {', '.join(c['evidence_ids']) or 'none'})"
        for who, text in c["history"]:
            line += f"\n    - {who}: {text}"
        lines.append(line)
    return "\n".join(lines)


def negotiation_so_far(bb) -> str:
    """Compact transcript used by the Arbiter and by later stages."""
    talk = "\n".join(f"{t['stage']} — {t['agent'].title()} ({t['fraud_probability']}%): {t['message']}"
                     for t in bb.turns) or "(nobody has spoken yet)"
    return f"{talk}\n\nCHARGE SHEET:\n{charge_sheet(bb)}"


def _call(bb, stage: str, focus: list[str] | None = None) -> dict | None:
    side = SIDE[stage]
    user = (f"AD TEXT:\n{bb.ad_text}\n\nCLAIMS:\n{claims_json(bb)}\n\nEVIDENCE:\n{bb.evidence_table()}\n\n"
            f"NEGOTIATION SO FAR:\n{negotiation_so_far(bb)}\n\n"
            f"STAGE: {stage}\n"
            + (f"Answer only these charges: {', '.join(focus)}\n" if focus else "")
            + f"Return ONLY this JSON:\n{SCHEMAS[stage]}")
    key = LIST_KEY[stage]
    try:
        data = llm.call_json(load_prompt(side), user, temperature=0.3, list_key=key)
        if key not in data and ("charge_id" in data or "charge" in data):   # a single item, not wrapped
            data = {key: [data]}
        return data
    except llm.LLMError as e:
        bb.log(side, "orchestrator", "note", f"{side.title()} could not respond ({str(e)[:80]}).")
        return None


def _prob(data, default=50) -> int:
    try:
        return max(0, min(100, int(float(data.get("fraud_probability", default)))))
    except (TypeError, ValueError):
        return default


def _turn(bb, stage, data) -> dict:
    side = SIDE[stage]
    t = {"agent": side, "stage": stage, "round": 1 if stage in ("OPEN", "RESPOND") else 2,
         "fraud_probability": _prob(data), "message": str(data.get("message") or "").strip()}
    bb.turns.append(t)
    other = "defender" if side == "prosecutor" else "prosecutor"
    if t["message"]:
        bb.log(side, other, "argument", t["message"], data={"fraud_probability": t["fraud_probability"],
                                                           "stage": stage, "round": t["round"]})
    return t


def _valid_ids(bb, ids) -> list[str]:
    valid = bb.evidence_ids()
    return [e for e in (ids or []) if isinstance(e, str) and e in valid]


def _find(bb, cid):
    return next((c for c in bb.charges if c["id"] == str(cid).strip().upper()), None)


def open_case(bb) -> tuple[dict | None, dict | None]:
    """Returns (turn, optional specialist request)."""
    data = _call(bb, "OPEN")
    if data is None:
        return None, None
    turn = _turn(bb, "OPEN", data)
    for raw in (data.get("charges") or [])[:5]:
        if not isinstance(raw, dict) or not str(raw.get("charge", "")).strip():
            continue
        try:
            sev = max(1, min(3, int(raw.get("severity", 1))))
        except (TypeError, ValueError):
            sev = 1
        c = {"id": f"C{len(bb.charges) + 1}", "charge": str(raw["charge"]).strip(), "severity": sev,
             "evidence_ids": _valid_ids(bb, raw.get("evidence_ids")), "status": "OPEN", "history": [],
             "ruling": None}
        bb.charges.append(c)
        bb.log("prosecutor", "defender", "charge", c["charge"], c["evidence_ids"],
               data={"charge_id": c["id"], "severity": sev})
    req = clean_handoffs([data.get("request")] if isinstance(data.get("request"), dict) else [], SPECIALIST_NAMES)
    return turn, (req[0] if req and req[0]["query"] else None)


def respond(bb) -> tuple[dict | None, list[dict]]:
    """Defender answers every open charge. Returns (turn, specialist checks to run)."""
    data = _call(bb, "RESPOND")
    if data is None:
        return None, []
    turn = _turn(bb, "RESPOND", data)
    checks = []
    for r in data.get("responses") or []:
        c = _find(bb, r.get("charge_id", "")) if isinstance(r, dict) else None
        if not c or c["status"] != "OPEN":
            continue
        stance = str(r.get("stance", "")).upper()
        reason = str(r.get("reason") or "").strip()
        ids = _valid_ids(bb, r.get("evidence_ids"))
        if stance == "ACCEPT":
            c["status"] = "ACCEPTED"
        elif stance == "CHECK" and len(checks) < 2:
            chk = clean_handoffs([r.get("check")] if isinstance(r.get("check"), dict) else [], SPECIALIST_NAMES)
            if chk and chk[0]["query"]:
                c["status"] = "CHECKED"
                checks.append({**chk[0], "why": f"{c['id']}: {reason or chk[0]['why']}"})
            else:
                c["status"] = "DISPUTED"
        else:
            c["status"] = "DISPUTED"
        c["history"].append(("Defender", f"{c['status'].lower()}: {reason}"))
        bb.log("defender", "prosecutor", "response", reason or c["status"].title(), ids,
               data={"charge_id": c["id"], "stance": c["status"]})
    for c in bb.charges:            # charges the Defender ignored stay open for the Arbiter
        if c["status"] == "OPEN":
            c["history"].append(("Defender", "no answer"))
    return turn, checks


def rebut(bb) -> dict | None:
    focus = [c["id"] for c in bb.charges if c["status"] in ("DISPUTED", "CHECKED")]
    data = _call(bb, "REBUT", focus)
    if data is None:
        return None
    turn = _turn(bb, "REBUT", data)
    for r in data.get("rulings") or []:
        c = _find(bb, r.get("charge_id", "")) if isinstance(r, dict) else None
        if not c or c["id"] not in focus:
            continue
        stance = str(r.get("stance", "")).upper()
        c["status"] = "WITHDRAWN" if stance == "WITHDRAW" else "MAINTAINED"
        reason = str(r.get("reason") or "").strip()
        c["history"].append(("Prosecutor", f"{c['status'].lower()}: {reason}"))
        bb.log("prosecutor", "defender", "ruling", reason or c["status"].title(),
               _valid_ids(bb, r.get("evidence_ids")), data={"charge_id": c["id"], "stance": c["status"]})
    for c in bb.charges:            # no answer from the Prosecutor = still maintained
        if c["status"] in ("DISPUTED", "CHECKED"):
            c["status"] = "MAINTAINED"
    return turn


def final(bb) -> dict | None:
    focus = [c["id"] for c in bb.charges if c["status"] == "MAINTAINED"]
    data = _call(bb, "FINAL", focus)
    if data is None:
        for c in bb.charges:
            if c["status"] == "MAINTAINED":
                c["status"] = "CONTESTED"
        return None
    turn = _turn(bb, "FINAL", data)
    for r in data.get("final") or []:
        c = _find(bb, r.get("charge_id", "")) if isinstance(r, dict) else None
        if not c or c["id"] not in focus:
            continue
        stance = str(r.get("stance", "")).upper()
        c["status"] = "ACCEPTED" if stance == "ACCEPT" else "CONTESTED"
        reason = str(r.get("reason") or "").strip()
        c["history"].append(("Defender", f"{c['status'].lower()}: {reason}"))
        bb.log("defender", "prosecutor", "response", reason or c["status"].title(),
               data={"charge_id": c["id"], "stance": c["status"]})
    for c in bb.charges:
        if c["status"] == "MAINTAINED":
            c["status"] = "CONTESTED"
    return turn
