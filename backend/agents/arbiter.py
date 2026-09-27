"""Arbiter (LLM) + deterministic guardrails -> final verdict."""
from agents.advocates import negotiation_so_far
from agents.common import claims_json, load_prompt
from core import llm

WHAT_TO_DO = {
    "FRAUD": (["Do not pay any money. Do not share OTP, bank or KYC details.",
               "Call 1930 (National Cyber Crime Helpline) or report at cybercrime.gov.in.",
               "If money was already sent, call your bank right away to try to stop it."],
              ["कोई पैसा न भेजें। OTP, बैंक या KYC जानकारी किसी को न दें।",
               "1930 (राष्ट्रीय साइबर अपराध हेल्पलाइन) पर कॉल करें या cybercrime.gov.in पर शिकायत करें।",
               "अगर पैसे भेज चुके हैं, तो तुरंत अपने बैंक को फ़ोन करें।"]),
    "SUSPICIOUS": (["Do not pay yet. Check the company on sebi.gov.in or ask at your bank branch.",
                    "Talk to a family member or a trusted adviser before investing.",
                    "Never pay to a personal UPI ID or to someone on WhatsApp."],
                   ["अभी पैसे न भेजें। कंपनी को sebi.gov.in पर या अपनी बैंक शाखा में जाँचें।",
                    "निवेश से पहले परिवार के किसी सदस्य या भरोसेमंद सलाहकार से बात करें।",
                    "किसी निजी UPI ID या WhatsApp वाले व्यक्ति को कभी भुगतान न करें।"]),
    "LIKELY_SAFE": (["Invest only through the official channel: the post office, your bank branch, or the company's "
                     "own registered app or website.",
                     "Check the interest rate and name on the official website before paying.",
                     "If anyone later asks for OTP or an extra fee, stop — that is a scam."],
                    ["केवल आधिकारिक रास्ते से निवेश करें: डाकघर, अपनी बैंक शाखा, या कंपनी का पंजीकृत ऐप/वेबसाइट।",
                     "भुगतान से पहले आधिकारिक वेबसाइट पर ब्याज दर और नाम जाँच लें।",
                     "अगर बाद में कोई OTP या अतिरिक्त फ़ीस माँगे, तो रुक जाएँ — वह धोखा है।"]),
}
HEADLINE = {"FRAUD": ("This looks like a fake investment scheme. Do not pay.",
                      "यह नकली निवेश योजना लगती है। पैसे न भेजें।"),
            "SUSPICIOUS": ("Something is not right here. Verify before you pay anything.",
                           "यहाँ कुछ ठीक नहीं है। कुछ भी भेजने से पहले जाँच करें।"),
            "LIKELY_SAFE": ("This looks like a genuine scheme. Invest only through official channels.",
                            "यह असली योजना लगती है। केवल आधिकारिक रास्ते से निवेश करें।")}


def _hindi(text: str) -> bool:
    return any("\u0900" <= ch <= "\u097f" for ch in text or "")


def label_for(risk: int) -> str:
    return "FRAUD" if risk >= 70 else "SUSPICIOUS" if risk >= 40 else "LIKELY_SAFE"


def evidence_score(bb) -> int:
    fraud = sum(e["strength"] for e in bb.evidence if e["supports"] == "FRAUD")
    legit = sum(e["strength"] for e in bb.evidence if e["supports"] == "LEGIT")
    risk = max(3, min(97, 50 + 10 * (fraud - legit)))
    if any(e["supports"] == "FRAUD" and e["strength"] == 3 for e in bb.evidence):
        risk = max(risk, 80)
    return risk


def apply_guardrails(bb, risk: int) -> tuple[int, list[str]]:
    notes = []
    # Community reports can raise a warning but can never, on their own, make an ad "FRAUD":
    # otherwise a few fake reports could brand a genuine scheme a scam (memory poisoning).
    own = [e for e in bb.evidence if e["agent"] != "community"]
    decisive = [e for e in own if e["supports"] == "FRAUD" and e["strength"] == 3]
    strong_fraud = [e for e in own if e["supports"] == "FRAUD" and e["strength"] >= 2]
    any_fraud = [e for e in bb.evidence if e["supports"] == "FRAUD"]
    if decisive and risk < 75:
        notes.append(f"Decisive fraud evidence {decisive[0]['id']} sets the minimum risk to 75 (was {risk}).")
        risk = 75
    if not strong_fraud and risk >= 70:
        notes.append(f"No strong fraud evidence of its own exists, so risk is capped at 60 (was {risk}).")
        risk = 60
    if not any_fraud and risk > 30:
        notes.append(f"No fraud evidence at all, so risk is capped at 30 (was {risk}).")
        risk = 30
    failed = llm.degraded()
    solid_legit = [e for e in own if e["supports"] == "LEGIT" and e["strength"] >= 2]
    if failed and label_for(risk) == "LIKELY_SAFE" and not solid_legit:
        notes.append(f"{len(failed)} AI check(s) could not finish, and nothing proves the ad genuine, so RAKSHA will "
                     f"not call it safe: raised to SUSPICIOUS (was {risk}).")
        risk = 45
    if bb.converged is False and label_for(risk) == "LIKELY_SAFE" and strong_fraud:
        notes.append(f"Agents did not agree and strong fraud evidence exists, so the verdict is raised to "
                     f"SUSPICIOUS (was {risk}).")
        risk = 45
    return risk, notes


def _fallback_reasons(bb, label):
    want = "FRAUD" if label != "LIKELY_SAFE" else "LEGIT"
    ev = sorted([e for e in bb.evidence if e["supports"] == want], key=lambda e: -e["strength"])[:3]
    return [e["finding"] for e in ev], [[e["id"]] for e in ev]


def run(bb) -> dict:
    user = (f"AD TEXT:\n{bb.ad_text}\n\nCLAIMS:\n{claims_json(bb)}\n\nEVIDENCE:\n{bb.evidence_table()}\n\n"
            f"NEGOTIATION:\n{negotiation_so_far(bb)}\n\n"
            f"Charges you must rule on: {', '.join(c['id'] for c in bb.charges if c['status'] in ('CONTESTED', 'OPEN')) or 'none'}")
    data, used_ai = {}, True
    try:
        data = llm.call_json(load_prompt("arbiter"), user, temperature=0.1)
        risk = int(float(data.get("risk")))
    except (llm.LLMError, TypeError, ValueError) as e:
        used_ai = False
        risk = evidence_score(bb)
        bb.log("arbiter", "orchestrator", "note", f"AI verdict unavailable ({str(e)[:60]}); scoring the evidence "
                                                  f"directly.")
    for r in data.get("rulings") or [] if used_ai else []:
        c = next((c for c in bb.charges if isinstance(r, dict) and c["id"] == str(r.get("charge_id", "")).upper()), None)
        if c and c["status"] in ("CONTESTED", "OPEN"):
            c["status"] = "UPHELD" if str(r.get("ruling", "")).upper() == "UPHELD" else "DISMISSED"
            c["ruling"] = str(r.get("why") or "").strip()
            c["history"].append(("Arbiter", f"{c['status'].lower()}: {c['ruling']}"))
            bb.log("arbiter", "user", "ruling", c["ruling"] or c["status"].title(),
                   data={"charge_id": c["id"], "stance": c["status"]})
    for c in bb.charges:
        if c["status"] in ("CONTESTED", "OPEN"):
            c["status"] = "UNRESOLVED"
    risk = max(0, min(100, risk))
    risk, notes = apply_guardrails(bb, risk)
    for n in notes:
        bb.log("arbiter", "orchestrator", "guardrail", n)
    label = label_for(risk)
    llm_label = label_for(max(0, min(100, int(float(data.get("risk", risk)))))) if used_ai else label
    valid = bb.evidence_ids()
    if used_ai and llm_label == label and data.get("reasons"):
        reasons = [str(r) for r in data.get("reasons", [])][:3]
        reason_ev = [[e for e in (x if isinstance(x, list) else []) if e in valid]
                     for x in (data.get("reason_evidence") or [])][:3]
        headline, headline_hi = data.get("headline") or HEADLINE[label][0], data.get("headline_hi") or HEADLINE[label][1]
        reasons_hi = [str(r) for r in data.get("reasons_hi", [])][:3]
        if _hindi(headline):                       # model put Hindi in the English field
            model_hi = str(data.get("headline_hi") or "")
            headline_hi, headline = model_hi if _hindi(model_hi) else headline, HEADLINE[label][0]
        if any(_hindi(r) for r in reasons):
            reasons_hi = reasons_hi if any(_hindi(r) for r in reasons_hi) else reasons
            reasons, reason_ev = _fallback_reasons(bb, label)
    else:   # guardrail changed the label: don't show AI text that argues for a different verdict
        reasons, reason_ev = _fallback_reasons(bb, label)
        headline, headline_hi = HEADLINE[label]
        reasons_hi = []
    while len(reason_ev) < len(reasons):
        reason_ev.append([])
    todo, todo_hi = WHAT_TO_DO[label]
    c = bb.claims
    # Someone boxed a family photo or a news post: say so plainly instead of "genuine investment".
    not_investment = (label == "LIKELY_SAFE" and not any(e["supports"] == "FRAUD" for e in bb.evidence)
                      and not any(c.get(k) for k in ("promised_return", "product", "reg_numbers", "upi_ids", "phones",
                                                     "links", "emails")) and not c.get("guaranteed"))
    if not_investment:
        headline, headline_hi = ("This doesn't look like an investment offer. Nothing to worry about here.",
                                 "यह निवेश का कोई प्रस्ताव नहीं लगता। इसमें चिंता की कोई बात नहीं।")
        todo = ["If you meant to check an ad, click on the ad itself (or draw the box around the whole ad, with its button)."]
        todo_hi = ["अगर आप कोई विज्ञापन जाँचना चाहते थे, तो सीधे उस विज्ञापन पर क्लिक कीजिए (या बटन समेत पूरे विज्ञापन के चारों ओर बॉक्स बनाइए)।"]
    verdict = {"label": label, "not_investment": not_investment, "risk": risk, "headline": headline, "headline_hi": headline_hi,
               "reasons": reasons, "reasons_hi": reasons_hi, "reason_evidence": reason_ev,
               "what_to_do": todo, "what_to_do_hi": todo_hi, "converged": bb.converged,
               "deciding_factor": str(data.get("deciding_factor") or ""), "guardrails": notes,
               "retiree_targeting": bb.claims.get("retiree_targeting"),
               "retiree_hooks": bb.claims.get("retiree_hooks", [])[:2],
               "charges_summary": {s: sum(1 for c in bb.charges if c["status"] == s)
                                   for s in ("ACCEPTED", "WITHDRAWN", "UPHELD", "DISMISSED", "UNRESOLVED")}}
    bb.verdict = verdict
    bb.log("arbiter", "user", "verdict", f"{label.replace('_', ' ')} (risk {risk}/100): {headline}",
           sorted({e for x in reason_ev for e in x}, key=lambda x: int(x[1:])), data=verdict)
    return verdict
