"""End-to-end tests of the agent pipeline with a scripted fake model (no API key needed)."""
import json
import re

import pytest

from core import llm
from core.orchestrator import investigate
from tools.registry import Registry

FM_AD = ("Finance Minister Nirmala Sitharaman launches Government–SBI scheme. Invest ₹21,000, get ₹15,00,000 in "
         "10 days, 100% guaranteed. Only for pensioners. Register: www.sbi-govtscheme-invest.com "
         "WhatsApp +44 7700 900123")
CLONE_AD = ("360 ONE Investment Adviser — SEBI Reg. No. INA000000888. Assured 4% monthly returns for senior citizens. "
            "WhatsApp +44 7700 900456 or e-mail 360one.retirement@gmail.com")


@pytest.fixture
def reg(tmp_path):
    (tmp_path / "sebi_ia.json").write_text(json.dumps({"complete": True, "scraped_on": "2026-09-26", "records": [
        {"name": "360 ONE Investment Adviser and Trustee Services Limited", "reg_no": "INA000000888",
         "email": "advcompliance@360.one"}]}))
    (tmp_path / "sebi_ra.json").write_text(json.dumps({"complete": True, "records": []}))
    (tmp_path / "rbi_alert.json").write_text(json.dumps({"updated_as_on": "2025-11-19", "records": [
        {"name": "Starnet FX", "domain": "starnetfx.com"}]}))
    return Registry(tmp_path)


def role_of(system: str) -> str:
    return re.search(r"# ROLE: (\w+)", system).group(1)


class FakeModel:
    """Scripted answers per agent role. Override pieces per test."""

    def __init__(self, **overrides):
        self.calls = []
        self.o = overrides

    def __call__(self, system, user, image):
        role = role_of(system)
        self.calls.append(role)
        if role in self.o:
            v = self.o[role]
            if isinstance(v, Exception):
                raise v
            return v(user) if callable(v) else v
        return getattr(self, role)(user)

    def extractor(self, user):
        if "Sitharaman" in user:
            return {"advertiser": None, "people_shown": ["Nirmala Sitharaman", "SBI"],
                    "authority_claims": ["Government–SBI scheme"], "promised_return": "₹21,000 → ₹15,00,000 in 10 days",
                    "guaranteed": True, "retiree_hooks": ["Only for pensioners"], "links": [], "phones": []}
        return {"advertiser": "360 ONE Investment Adviser", "promised_return": "4% monthly", "guaranteed": True}

    def router(self, user):
        return {"plan": [{"agent": "registry", "why": "check the firm"}, {"agent": "web", "why": "check contacts"},
                         {"agent": "pattern", "why": "compare with scams"}]}

    def pattern(self, user):
        return {"findings": [{"finding": "Government never guarantees private returns", "supports": "FRAUD",
                              "strength": 3}], "retiree_targeting": 90, "handoffs": []}

    def prosecutor(self, user):
        if "STAGE: OPEN" in user:
            return {"fraud_probability": 95, "message": "Fake.", "request": None, "charges": [
                {"charge": "Impersonates the Government and SBI", "evidence_ids": ["E1", "E99"], "severity": 3},
                {"charge": "Targets pensioners", "evidence_ids": [], "severity": 1}]}
        return {"fraud_probability": 90, "message": "Fair point on C2.",
                "rulings": [{"charge_id": "C2", "stance": "WITHDRAW", "reason": "Targeting alone is not fraud",
                             "evidence_ids": []}]}

    def defender(self, user):
        if "STAGE: RESPOND" in user:
            return {"fraud_probability": 85, "message": "C1 is true; C2 is not fraud by itself.", "responses": [
                {"charge_id": "C1", "stance": "ACCEPT", "reason": "look-alike site", "evidence_ids": ["E1"]},
                {"charge_id": "C2", "stance": "DISPUTE", "reason": "Senior schemes are meant for pensioners",
                 "evidence_ids": []}]}
        return {"fraud_probability": 88, "message": "Accepted.", "final": []}

    def arbiter(self, user):
        return {"rulings": [], "risk": 93, "headline": "Fake scheme. Do not pay.", "reasons": ["a", "b", "c"],
                "reason_evidence": [["E1"], ["E2"], ["E999"]], "headline_hi": "नकली", "reasons_hi": ["क", "ख", "ग"],
                "deciding_factor": "look-alike site"}


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    monkeypatch.setattr("agents.web_agent.domain_age_days", lambda d: None)
    yield
    llm.set_backend(None)


def types(bb, t):
    return [m for m in bb.trace if m["type"] == t]


def charge(bb, cid):
    return next(c for c in bb.charges if c["id"] == cid)


def test_full_run_fm_deepfake(reg):
    fake = FakeModel()
    llm.set_backend(fake)
    events = []
    bb = investigate(FM_AD, on_event=events.append, registry=reg)
    # regex backfilled what the model missed
    assert "+44 7700 900123" in bb.claims["phones"]
    assert any("sbi-govtscheme-invest.com" in l for l in bb.claims["links"])
    findings = " | ".join(e["finding"] for e in bb.evidence)
    assert "look-alike" in findings and "United Kingdom" in findings
    # hand-offs are visible and come from the router
    assert [m["to"] for m in types(bb, "handoff") if m["from"] == "router"] == ["registry", "web", "pattern", "community"]
    # charge-by-charge negotiation
    assert [c["id"] for c in bb.charges] == ["C1", "C2"]
    assert charge(bb, "C1")["status"] == "ACCEPTED" and charge(bb, "C2")["status"] == "WITHDRAWN"
    assert "E99" not in charge(bb, "C1")["evidence_ids"]            # hallucinated evidence ids are dropped
    assert len(types(bb, "charge")) == 2 and len(types(bb, "response")) == 2 and len(types(bb, "ruling")) == 1
    assert fake.calls.count("prosecutor") == 2 and fake.calls.count("defender") == 1   # no FINAL needed
    assert bb.converged is True                                     # every charge settled by the two sides
    assert bb.verdict["label"] == "FRAUD" and bb.verdict["risk"] == 93
    assert all(e in bb.evidence_ids() for x in bb.verdict["reason_evidence"] for e in x)
    assert events == bb.trace                                       # everything streamed to the UI


def test_defender_check_triggers_specialist_handoff(reg):
    def defender(user):
        if "STAGE: RESPOND" in user:
            return {"fraud_probability": 40, "message": "Let's verify the number.", "responses": [
                {"charge_id": "C1", "stance": "CHECK", "reason": "Is the number real?",
                 "check": {"to": "registry", "query": "INA000000888"}},
                {"charge_id": "C2", "stance": "DISPUTE", "reason": "fine"}]}
        return {"fraud_probability": 80, "message": "ok", "final": []}

    llm.set_backend(FakeModel(defender=defender))
    bb = investigate(CLONE_AD, registry=reg)
    hand = [m for m in types(bb, "handoff") if m["from"] == "defender"]
    assert hand and hand[0]["to"] == "registry" and "INA000000888" in hand[0]["text"]
    assert charge(bb, "C1")["status"] in ("ACCEPTED", "UPHELD", "DISMISSED", "UNRESOLVED", "WITHDRAWN")
    assert any("Re-checked" in m["text"] or m["type"] == "evidence" for m in bb.trace if m["from"] == "registry")


def test_maintained_and_contested_goes_to_arbiter(reg):
    fake = FakeModel(
        prosecutor=lambda u: FakeModel().prosecutor(u) if "STAGE: OPEN" in u else {
            "fraud_probability": 92, "message": "I maintain C2.",
            "rulings": [{"charge_id": "C2", "stance": "MAINTAIN", "reason": "hooks + pressure", "evidence_ids": []}]},
        defender=lambda u: FakeModel().defender(u) if "STAGE: RESPOND" in u else {
            "fraud_probability": 60, "message": "Still disagree on C2.",
            "final": [{"charge_id": "C2", "stance": "CONTEST", "reason": "targeting is normal"}]},
        arbiter={"rulings": [{"charge_id": "C2", "ruling": "DISMISSED", "why": "targeting alone is not fraud"}],
                 "risk": 90, "headline": "Fake.", "reasons": ["x", "y", "z"]})
    llm.set_backend(fake)
    bb = investigate(FM_AD, registry=reg)
    assert fake.calls.count("defender") == 2
    assert charge(bb, "C2")["status"] == "DISMISSED" and charge(bb, "C1")["status"] == "ACCEPTED"
    assert bb.converged is False                                    # the Arbiter had to rule
    assert any(m["from"] == "arbiter" for m in types(bb, "ruling"))


def test_all_accepted_is_one_round(reg):
    fake = FakeModel(defender={"fraud_probability": 97, "message": "All true.", "responses": [
        {"charge_id": "C1", "stance": "ACCEPT", "reason": "yes"}, {"charge_id": "C2", "stance": "ACCEPT", "reason": "yes"}]})
    llm.set_backend(fake)
    bb = investigate(FM_AD, registry=reg)
    assert fake.calls.count("prosecutor") == 1 and fake.calls.count("defender") == 1
    assert all(c["status"] == "ACCEPTED" for c in bb.charges) and bb.converged is True


def test_defender_failure_leaves_charges_for_arbiter(reg):
    llm.set_backend(FakeModel(defender=llm.LLMError("quota")))
    bb = investigate(FM_AD, registry=reg)
    assert bb.converged is False and bb.verdict["label"] == "FRAUD"
    assert all(c["status"] in ("UNRESOLVED", "UPHELD", "DISMISSED") for c in bb.charges)


def test_clone_firm_contact_mismatch(reg):
    llm.set_backend(FakeModel())
    bb = investigate(CLONE_AD, registry=reg)
    fraud = [e for e in bb.evidence if e["supports"] == "FRAUD"]
    assert any("clone" in e["finding"] and e["strength"] == 2 for e in fraud)
    assert any("real SEBI" in e["finding"] for e in bb.evidence if e["supports"] == "LEGIT")


def test_guardrail_overrides_soft_arbiter(reg):
    llm.set_backend(FakeModel(arbiter={"risk": 20, "headline": "Looks fine", "reasons": ["x"]}))
    bb = investigate(FM_AD, registry=reg)
    assert bb.verdict["label"] == "FRAUD" and bb.verdict["risk"] >= 75
    assert types(bb, "guardrail")
    assert bb.verdict["headline"] != "Looks fine"      # AI text arguing for another label is replaced


def test_arbiter_failure_falls_back_to_evidence_score(reg):
    llm.set_backend(FakeModel(arbiter=llm.LLMError("quota")))
    bb = investigate(FM_AD, registry=reg)
    assert bb.verdict["label"] == "FRAUD" and bb.verdict["reasons"]


def test_genuine_ad_not_flagged(reg):
    ad = ("Senior Citizens Savings Scheme 8.2% p.a., Government of India. Open at any post office. "
          "www.indiapost.gov.in")
    llm.set_backend(FakeModel(
        extractor={"advertiser": "India Post", "promised_return": "8.2% p.a.", "guaranteed": False},
        pattern={"findings": [{"finding": "Rate matches published SCSS rate", "supports": "LEGIT", "strength": 2}]},
        prosecutor=lambda u: {"fraud_probability": 15, "message": "Minor concern.", "charges": [
            {"charge": "Claims Government backing", "evidence_ids": [], "severity": 1}]} if "STAGE: OPEN" in u else {
            "fraud_probability": 5, "message": "Withdrawn.", "rulings": [
                {"charge_id": "C1", "stance": "WITHDRAW", "reason": "official India Post website"}]},
        defender={"fraud_probability": 5, "message": "It is the official site.", "responses": [
            {"charge_id": "C1", "stance": "DISPUTE", "reason": "indiapost.gov.in is official", "evidence_ids": ["E1"]}]},
        arbiter={"rulings": [], "risk": 8, "headline": "Genuine scheme.",
                 "reasons": ["official site", "official rate", "post office"]}))
    bb = investigate(ad, registry=reg)
    assert bb.verdict["label"] == "LIKELY_SAFE"
    assert charge(bb, "C1")["status"] == "WITHDRAWN"
    assert any("official website" in e["finding"] for e in bb.evidence)


def test_image_only_without_model_raises(reg):
    llm.set_backend(FakeModel(extractor=llm.LLMError("no key")))
    with pytest.raises(llm.LLMError):
        investigate("", image=b"\x89PNG....", registry=reg)


def test_hindi_in_english_field_is_fixed(reg):
    llm.set_backend(FakeModel(arbiter={"risk": 95, "headline": "यह एक धोखा है।", "headline_hi": "",
                                       "reasons": ["नकली वेबसाइट"], "reasons_hi": []}))
    bb = investigate(FM_AD, registry=reg)
    v = bb.verdict

    def dev(t):
        return any("\u0900" <= ch <= "\u097f" for ch in t)
    assert not dev(v["headline"]) and v["headline_hi"] == "यह एक धोखा है।"
    assert v["reasons_hi"] == ["नकली वेबसाइट"] and v["reasons"] and not any(dev(r) for r in v["reasons"])


def test_defender_bare_list_answer_is_not_lost(reg):
    fake = FakeModel(defender=lambda u: {"charge_id": "C1", "stance": "ACCEPT", "reason": "true"}
                     if "STAGE: RESPOND" in u else {"fraud_probability": 90, "message": "ok", "final": []})
    llm.set_backend(fake)
    bb = investigate(FM_AD, registry=reg)
    assert charge(bb, "C1")["status"] == "ACCEPTED"
