"""Registry agent (tool agent): SEBI IA/RA registers + RBI Alert List. Facts only, no LLM."""
from rapidfuzz import fuzz

from tools.registry import Registry, _core, registered_domain
from tools.text_extract import extract_contacts
from tools.web_contact import FREE_EMAIL


def _same_entity(a: str, b: str) -> bool:
    ca, cb = _core(a), _core(b)
    return bool(ca and cb) and (fuzz.token_sort_ratio(ca, cb) >= 85 or fuzz.token_set_ratio(ca, cb) >= 95)


def _contact_domains(bb) -> set[str]:
    return {registered_domain(x) for x in bb.claims.get("links", []) + bb.claims.get("emails", []) if x}


def _check_consistency(bb, reg: Registry, rec: dict, src: str, handoffs: list, done: set):
    official = reg.official_domain(rec)
    contacts = _contact_domains(bb)
    if not official or official in FREE_EMAIL or not contacts:
        return
    if official not in contacts:
        bb.add_evidence("registry",
                        f"'{rec['name']}' is registered with the e-mail domain {official}, but the ad sends people to "
                        f"{', '.join(sorted(contacts))} — this looks like a clone pretending to be a registered firm",
                        "FRAUD", 2, src)
        if "web" not in done:
            handoffs.append({"to": "web", "query": None, "why": "contact details don't match the registered firm"})
    else:
        bb.add_evidence("registry", f"The ad's website/e-mail ({official}) matches the registered firm's official "
                                    f"domain", "LEGIT", 2, src)


def run(bb, reg: Registry, request: dict | None = None, done: set = frozenset()) -> list[dict]:
    src = reg.sebi_source()
    handoffs: list[dict] = []
    claimed = bb.claims.get("advertiser")
    sells_advice = bool(bb.claims.get("promised_return") or bb.claims.get("guaranteed"))

    if request and request.get("query"):
        q = request["query"]
        found = extract_contacts(q)
        regs = found["reg_numbers"]
        links = found["links"] + found["emails"]
        names = [] if (regs or links) else [q]
    else:
        regs = bb.claims.get("reg_numbers", [])
        links = bb.claims.get("links", []) + bb.claims.get("emails", [])
        names = [claimed] if claimed else []

    checked_names = set()
    for r in regs:
        res = reg.lookup_reg_no(r)
        if res["found"]:
            rec = res["record"]
            checked_names.add(_core(rec["name"]))
            bb.add_evidence("registry", f"{r} is a real SEBI {rec['type']} registration belonging to '{rec['name']}'",
                            "LEGIT", 2, src)
            if claimed and not _same_entity(claimed, rec["name"]):
                bb.add_evidence("registry", f"The ad says it is '{claimed}', but {r} belongs to '{rec['name']}' — "
                                            f"a borrowed registration number", "FRAUD", 3, src)
            _check_consistency(bb, reg, rec, src, handoffs, done)
        elif res["covered"]:
            complete = reg.sebi_complete()
            bb.add_evidence("registry", f"The ad quotes SEBI registration {r}, but no {res['prefix_type']} with this "
                                        f"number exists in SEBI's register", "FRAUD", 3 if complete else 2, src)
        else:
            bb.add_evidence("registry", f"{r} looks like a SEBI {res['prefix_type']} number; our snapshot covers only "
                                        f"advisers and research analysts, so it could not be verified here",
                            "NEUTRAL", 1, src)

    for n in names:
        if not n or _core(n) in checked_names:
            continue
        matches = reg.search_name(n)
        if matches:
            rec = matches[0]["record"]
            bb.add_evidence("registry", f"'{n}' matches SEBI-registered {rec['type']} '{rec['name']}' "
                                        f"({rec['reg_no']})", "LEGIT", 1, src)
            _check_consistency(bb, reg, rec, src, handoffs, done)
        elif sells_advice:
            bb.add_evidence("registry", f"'{n}' is not in SEBI's registers of investment advisers or research "
                                        f"analysts, yet the ad promises investment returns", "FRAUD", 1, src)
        else:
            bb.add_evidence("registry", f"'{n}' is not a SEBI-registered adviser or analyst (not required if it only "
                                        f"sells bank or government schemes)", "NEUTRAL", 1, src)

    alert_names = [x for x in [claimed, bb.claims.get("product")] + bb.claims.get("people_shown", []) if x]
    if request and request.get("query") and not regs:
        alert_names.append(request["query"])
    for hit in reg.rbi_alert(alert_names, links or bb.claims.get("links", [])):
        bb.add_evidence("registry", f"'{hit['name']}' is on the RBI Alert List of unauthorised forex/trading "
                                    f"platforms (matched on {hit['matched_on']})", "FRAUD", 3, reg.rbi_source())

    n_checked = len(regs) + len([n for n in names if n])
    bb.log("registry", "blackboard", "note",
           f"Checked {n_checked} number(s)/name(s) against {len(reg.sebi):,} SEBI records and "
           f"{len(reg.rbi)} RBI alert entries." if n_checked else
           f"No registration number or company name to check; screened against {len(reg.rbi)} RBI alert entries.")
    return handoffs
