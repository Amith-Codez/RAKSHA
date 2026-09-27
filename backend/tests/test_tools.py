import json

import pytest

from core.llm import parse_json, LLMError
from tools.text_extract import extract_contacts
from tools.registry import Registry, registered_domain
from tools.web_contact import phone_info, classify_domain


# ---------- JSON repair --------------------------------------------------
def test_parse_json_plain_and_fenced():
    assert parse_json('{"a": 1}') == {"a": 1}
    assert parse_json('```json\n{"a": 2}\n```') == {"a": 2}
    assert parse_json('Sure! Here it is: {"a": {"b": "x}"}} thanks') == {"a": {"b": "x}"}}


def test_parse_json_garbage_raises():
    with pytest.raises(LLMError):
        parse_json("no json here")


# ---------- regex extraction ------------------------------------------------
AD = ("Invest ₹21,000 and get ₹15,00,000 in 10 days! SEBI Reg No. INA000099999. "
      "Visit www.sbi-govtscheme-invest.com/register or bit.ly/abc12 "
      "WhatsApp +44 7700 900123 or call 98480 22338. Mail help.desk@gmail.com")


def test_extract_contacts():
    c = extract_contacts(AD)
    assert c["reg_numbers"] == ["INA000099999"]
    assert "help.desk@gmail.com" in c["emails"]
    assert any("sbi-govtscheme-invest.com" in l for l in c["links"])
    assert any("bit.ly" in l for l in c["links"])
    assert not any("gmail.com" in l for l in c["links"])          # emails are not links
    digits = ["".join(ch for ch in p if ch.isdigit()) for p in c["phones"]]
    assert "447700900123" in digits and "9848022338" in digits
    assert not any(d.startswith("21000") or d.startswith("1500000") for d in digits)  # money is not a phone


# ---------- registry -------------------------------------------------------
@pytest.fixture
def reg(tmp_path):
    (tmp_path / "sebi_ia.json").write_text(json.dumps({"complete": True, "scraped_on": "2026-09-26", "records": [
        {"name": "360 ONE Investment Adviser and Trustee Services Limited", "reg_no": "INA000000888",
         "email": "advcompliance@360.one"},
        {"name": "1 Finance Private Limited", "reg_no": "INA000017523", "email": "compliance@1finance.co.in"}]}))
    (tmp_path / "sebi_ra.json").write_text(json.dumps({"complete": True, "records": []}))
    (tmp_path / "rbi_alert.json").write_text(json.dumps({"updated_as_on": "2025-11-19", "records": [
        {"name": "Starnet FX", "domain": "starnetfx.com"}, {"name": "XM", "domain": "xm.com"},
        {"name": "Dream Trade", "domain": None}]}))
    return Registry(tmp_path)


def test_reg_lookup_found_and_missing(reg):
    hit = reg.lookup_reg_no("ina000000888")
    assert hit["found"] and hit["record"]["name"].startswith("360 ONE")
    miss = reg.lookup_reg_no("INA000099999")
    assert not miss["found"] and miss["covered"]
    other = reg.lookup_reg_no("INZ000031633")        # stock-broker numbers are not in our snapshot
    assert not other["found"] and not other["covered"]


def test_name_search(reg):
    m = reg.search_name("360 ONE Investment Adviser & Trustee Services Ltd")
    assert m and m[0]["record"]["reg_no"] == "INA000000888"
    assert reg.search_name("Suraksha Wealth Nidhi") == []


def test_rbi_alert(reg):
    assert reg.rbi_alert(["Trade with Starnet FX today"], [])[0]["name"] == "Starnet FX"
    assert reg.rbi_alert([], ["https://www.starnetfx.com/join"])[0]["name"] == "Starnet FX"
    assert reg.rbi_alert(["XM Global"], [])[0]["name"] == "XM"          # short names need a whole-word hit
    assert reg.rbi_alert(["Maxima Wealth"], []) == []                   # 'xm' inside a word is not a hit


def test_registered_domain():
    assert registered_domain("https://www.sbi.co.in/web/personal") == "sbi.co.in"
    assert registered_domain("help@gmail.com") == "gmail.com"
    assert registered_domain("indiapost.gov.in") == "indiapost.gov.in"
    assert registered_domain("advcompliance@360.one") == "360.one"


# ---------- web & contact ----------------------------------------------------
def test_phone_info():
    uk = phone_info("+44 7700 900123")
    assert uk["region"] == "GB" and not uk["is_indian"]
    ind = phone_info("98480 22338")
    assert ind["is_indian"]


def test_classify_domain():
    fake = classify_domain("www.sbi-govtscheme-invest.com")
    assert fake["lookalike_of"] == "SBI" and not fake["official"]
    real = classify_domain("https://www.indiapost.gov.in")
    assert real["official"]
    assert classify_domain("bit.ly/abc")["shortener"]
    assert classify_domain("wa.me/447700900123")["messaging"]
    assert classify_domain("gmail.com")["free_email"]


# ---------- returns rules ----------------------------------------------------------
from tools.returns_check import check_returns


def test_returns_rules():
    fm = check_returns("Invest just ₹21,000 and receive ₹15,00,000 within 10 days — 100% guaranteed")
    assert any(f["strength"] == 3 and "15,00,000" in f["finding"] for f in fm)
    assert any(f["strength"] == 3 for f in check_returns("guaranteed 30% profit every month"))
    assert any(f["strength"] == 3 for f in check_returns("earn 2% daily profit"))
    assert any(f["strength"] == 3 for f in check_returns("assured 4% monthly returns"))
    fd = check_returns("Special Fixed Deposit at 18% per annum, assured monthly payout")
    assert fd and fd[0]["strength"] == 2
    assert check_returns("Interest 8.2% per annum, paid every quarter. Deposit up to ₹30 lakh") == []
    assert check_returns("Earn 7.4% per annum. Invest up to ₹9 lakh for 5 years") == []
    ai = check_returns("earning ₹3,00,000 every month. Deposit just ₹21,000")
    assert any(f["strength"] == 3 for f in ai)


def test_upi_extraction():
    c = extract_contacts("Pay via UPI to surakshawealth.nidhi@ybl today")
    assert c["upi_ids"] == ["surakshawealth.nidhi@ybl"] and c["emails"] == []


def _isolate_keys(monkeypatch, **keys):
    """The developer's real .env must not leak into these tests."""
    for name in ("GEMINI_API_KEYS", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3",
                 "GEMINI_API_KEY_4", "GEMINI_MODEL"):
        monkeypatch.delenv(name, raising=False)
    for k, v in keys.items():
        monkeypatch.setenv(k, v)


# ---------- model fallback ----------------------------------------------------------
def test_gemini_fallback_on_busy_and_slow(monkeypatch):
    import core.llm as llm
    _isolate_keys(monkeypatch, GEMINI_API_KEY="k1", GEMINI_MODEL="model-a")
    monkeypatch.setattr(llm, "GEMINI_CHAIN", ["model-a", "model-b", "model-c"])
    monkeypatch.setattr(llm, "_cooldown", {})
    monkeypatch.setattr(llm, "_slow_until", {})
    monkeypatch.setattr(llm, "_lat", {})
    monkeypatch.setitem(llm.stats, "last_model", None)
    calls = []

    def once(model, key, *a, **k):
        calls.append(model)
        if model == "model-a":
            raise RuntimeError("504 DEADLINE_EXCEEDED")
        if model == "model-b":
            raise RuntimeError("503 UNAVAILABLE high demand")
        return '{"ok": true}'

    monkeypatch.setattr(llm, "_gemini_once", once)
    assert llm._call_gemini("s", "u", None, "image/png", 0.2) == '{"ok": true}'
    assert calls == ["model-a", "model-b", "model-c"]
    # slow / overloaded are MODEL problems: those models go to the back of the line for everyone
    assert llm._slow_until.get("model-a") and llm._slow_until.get("model-b")
    assert llm.stats["last_model"] == "model-c"
    assert llm.gemini_models()[0] == "model-c"          # next call starts with the model that just worked


def test_routing_prefers_the_fastest_measured_model(monkeypatch):
    import core.llm as llm
    _isolate_keys(monkeypatch, GEMINI_API_KEY="k1", GEMINI_MODEL="model-a")
    monkeypatch.setattr(llm, "GEMINI_CHAIN", ["model-a", "model-b", "model-c"])
    monkeypatch.setattr(llm, "_slow_until", {})
    monkeypatch.setattr(llm, "_lat", {"model-a": 8.3, "model-b": 0.9, "model-c": 3.0})
    monkeypatch.setitem(llm.stats, "last_model", None)
    assert llm.gemini_models() == ["model-b", "model-c", "model-a"]


def test_second_key_used_when_first_is_out_of_quota(monkeypatch):
    import core.llm as llm
    _isolate_keys(monkeypatch, GEMINI_API_KEY="k1", GEMINI_API_KEY_2="k2")
    monkeypatch.setattr(llm, "GEMINI_CHAIN", ["m"])
    monkeypatch.setattr(llm, "_cooldown", {})
    monkeypatch.setitem(llm.stats, "last_model", None)
    used = []

    def once(model, key, *a, **k):
        used.append(key)
        if key == "k1":
            raise RuntimeError("429 RESOURCE_EXHAUSTED quota")
        return '{"ok": 1}'

    monkeypatch.setattr(llm, "_gemini_once", once)
    assert llm._call_gemini("s", "u", None, "image/png", 0.2) == '{"ok": 1}' and used == ["k1", "k2"]


def test_parse_json_keeps_bare_lists_when_asked():
    assert parse_json('[{"charge_id": "C1"}, {"charge_id": "C2"}]', "responses") == \
        {"responses": [{"charge_id": "C1"}, {"charge_id": "C2"}]}
    assert parse_json('[{"a": 1}]') == {"a": 1}


def test_deepseek_backup_when_gemini_is_out_of_quota(monkeypatch, tmp_path):
    import core.llm as llm
    _isolate_keys(monkeypatch, GEMINI_API_KEY="k1")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "ds")
    monkeypatch.setattr(llm, "LLM_CACHE", tmp_path)
    monkeypatch.setattr(llm, "_call_gemini", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("429 RESOURCE_EXHAUSTED")))
    monkeypatch.setattr(llm, "_call_deepseek", lambda system, user, t, timeout: '{"ok": "backup"}')
    monkeypatch.setattr(llm.time, "sleep", lambda s: None)
    assert llm.call_json("sys-ds", "user-ds") == {"ok": "backup"}
