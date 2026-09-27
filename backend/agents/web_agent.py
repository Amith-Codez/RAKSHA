"""Web & contact agent (tool agent): domains, domain age, phone origin. Facts only, no LLM."""
from tools.registry import registered_domain
from tools.text_extract import extract_contacts
from tools.web_contact import FREE_EMAIL, classify_domain, domain_age_days, phone_info

COMPANY_WORDS = ("ltd", "limited", "pvt", "bank", "capital", "wealth", "finance", "securities", "fund", "invest",
                 "government", "govt", "scheme", "yojana")


def run(bb, request: dict | None = None, done: set = frozenset()) -> list[dict]:
    handoffs = []
    if request and request.get("query"):
        q = request["query"]
        found = extract_contacts(q)
        links = found["links"] + found["emails"] or ([q] if "." in q and " " not in q.strip() and "@" not in q else [])
        phones = found["phones"]
        upis = found["upi_ids"]
    else:
        links = bb.claims.get("links", []) + bb.claims.get("emails", [])
        phones = bb.claims.get("phones", [])
        upis = bb.claims.get("upi_ids", [])

    official_look = bool(bb.claims.get("authority_claims")) or any(
        w in (bb.claims.get("advertiser") or "").lower() for w in COMPANY_WORDS)
    seen = set()
    for item in links:
        dom = registered_domain(item)
        if not dom or dom in seen:
            continue
        seen.add(dom)
        c = classify_domain(item)
        src = "domain check"
        if c["official"]:
            bb.add_evidence("web", f"{dom} is an official website" + (f" of {c['official_owner']}"
                            if c["official_owner"] else " of the Government of India"), "LEGIT", 2, src)
        elif c["lookalike_of"]:
            bb.add_evidence("web", f"{dom} uses the name '{c['lookalike_of']}' but is not its official website — "
                                   f"a look-alike domain", "FRAUD", 3, src)
            if "pattern" not in done:
                handoffs.append({"to": "pattern", "query": f"The ad uses a look-alike {c['lookalike_of']} website "
                                 f"({dom}). Is this ad impersonating {c['lookalike_of']}?",
                                 "why": f"look-alike {c['lookalike_of']} website found"})
        elif c["shortener"]:
            bb.add_evidence("web", f"{dom} is a link shortener that hides the real destination", "FRAUD", 1, src)
        elif c["messaging"]:
            app = "Telegram" if "t.me" in dom or "telegram" in dom else "WhatsApp"
            bb.add_evidence("web", f"The ad moves you to a private {app} chat ({dom}) instead of an official "
                                   f"platform", "FRAUD", 1, src)
        elif c["free_email"]:
            if official_look:
                bb.add_evidence("web", f"It uses a free {dom} e-mail address, not an official company or "
                                       f"government address", "FRAUD", 1, src)
        else:
            age = domain_age_days(dom)
            if age is None:
                bb.log("web", "blackboard", "note", f"Could not look up the age of {dom} (offline or registry "
                                                    f"doesn't publish it).")
            elif age < 180:
                bb.add_evidence("web", f"{dom} was registered only {age} days ago", "FRAUD", 2, "RDAP domain records")
            elif age > 5 * 365:
                bb.add_evidence("web", f"{dom} has existed for {age // 365} years", "LEGIT", 1, "RDAP domain records")
            else:
                bb.add_evidence("web", f"{dom} is {age // 30} months old", "NEUTRAL", 1, "RDAP domain records")

    for p in phones[:4]:
        info = phone_info(p)
        if info["is_indian"] is False:
            strong = bool(bb.claims.get("authority_claims") or bb.claims.get("people_shown"))
            bb.add_evidence("web", f"{p.strip()} is a {info['country'] or 'foreign'} number — an Indian government, "
                                   f"bank or registered firm would not use a foreign WhatsApp number",
                            "FRAUD", 3 if strong else 2, "phone numbering plan")
        elif info["is_indian"] and not info["valid"]:
            bb.add_evidence("web", f"{p.strip()} is not a valid Indian phone number", "FRAUD", 1,
                            "phone numbering plan")

    if upis:
        for u in upis[:2]:
            bb.add_evidence("web", f"It asks you to pay into a UPI ID ({u}). Genuine deposits and government schemes "
                                   f"are never collected through a personal UPI ID", "FRAUD", 2, "payment channel check")

    if not links and not phones and not upis:
        bb.log("web", "blackboard", "note", "No links or phone numbers to check.")
    return handoffs
