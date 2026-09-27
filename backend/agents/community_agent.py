"""Community-memory agent (tool agent): has anyone flagged these links, numbers, UPI IDs or this exact picture before?"""
from core.store import indicators_of, similar_scams

LABEL = {"domain": "website", "phone": "phone number", "upi": "UPI ID", "reg_no": "registration number"}


def _when(ts: str | None) -> str:
    return f", last on {ts[:10]}" if ts else ""


def run(bb, store, request: dict | None = None, done: set = frozenset()) -> list[dict]:
    run_like = {"claims": bb.claims, "image_hash": bb.image_hash}
    groups: dict[str, list[str]] = {}
    for kind, value in indicators_of(run_like):
        if kind != "image_hash":
            groups.setdefault(kind, []).append(value)
    hits = 0
    for kind, values in groups.items():
        for value, rec in store.lookup(kind, values).items():
            scam, safe = rec["scam_count"], rec["safe_count"]
            if scam > 0 and safe >= scam:
                hits += 1           # families disagree: report it, but it counts for neither side
                bb.add_evidence("community", f"Families disagree about this {LABEL[kind]} ({value}): flagged as a scam "
                                             f"{scam} time(s), as genuine {safe} time(s)", "NEUTRAL", 1,
                                f"RAKSHA community memory ({store.name})")
            elif scam > 0:
                hits += 1
                # one family can add at most 3 (1 auto + 2 report) → a lone report is only a hint, many are strong
                strength = 3 if scam >= 6 else 2 if scam >= 3 else 1
                bb.add_evidence("community", f"This {LABEL[kind]} ({value}) was already flagged as a scam by RAKSHA users "
                                             f"(score {scam}){_when(rec.get('last_seen'))}",
                                "FRAUD", strength, f"RAKSHA community memory ({store.name})")
            elif safe >= 2:
                hits += 1
                bb.add_evidence("community", f"This {LABEL[kind]} ({value}) was checked {rec['safe_count']} times "
                                             f"before and found genuine", "LEGIT", 1, f"RAKSHA community memory ({store.name})")
    same = similar_scams(store, bb.image_hash)
    if same:
        hits += 1
        bb.add_evidence("community", f"This same ad picture was flagged as a scam {len(same)} time(s) before"
                                     f"{_when(same[0])}", "FRAUD", 3, f"RAKSHA community memory ({store.name})")
    if not hits:
        n = sum(len(v) for v in groups.values()) + (1 if bb.image_hash else 0)
        bb.log("community", "blackboard", "note",
               f"Checked {n} fingerprint(s) of this ad against earlier reports: nothing flagged before.")
    return []
