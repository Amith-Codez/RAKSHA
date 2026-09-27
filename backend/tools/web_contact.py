"""Checks on links, e-mails and phone numbers found in an ad."""
from __future__ import annotations

import json
from datetime import datetime, timezone

import phonenumbers
import requests
from phonenumbers import geocoder

from core.config import CACHE
from tools.registry import registered_domain

FREE_EMAIL = {"gmail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com", "rediffmail.com",
              "proton.me", "protonmail.com", "icloud.com", "aol.com", "ymail.com", "mail.com"}
SHORTENERS = {"bit.ly", "tinyurl.com", "t.ly", "cutt.ly", "rb.gy", "is.gd", "shorturl.at", "t.co",
              "ow.ly", "tiny.cc", "rebrand.ly", "shorturl.gg"}
MESSAGING = {"wa.me", "whatsapp.com", "t.me", "telegram.me", "telegram.org"}
OFFICIAL = {"sbi.co.in": "SBI", "onlinesbi.sbi": "SBI", "sbi": "SBI", "rbi.org.in": "RBI",
            "sebi.gov.in": "SEBI", "indiapost.gov.in": "India Post", "licindia.in": "LIC",
            "amfiindia.com": "AMFI", "mutualfundssahihai.com": "AMFI", "nseindia.com": "NSE",
            "bseindia.com": "BSE", "pfrda.org.in": "PFRDA", "npscra.nsdl.co.in": "NPS", "nsiindia.gov.in": "NSI"}
BRANDS = {"sbi": "SBI", "rbi": "RBI", "sebi": "SEBI", "lic": "LIC", "indiapost": "India Post",
          "govt": "Government of India", "gov": "Government of India", "modi": "Government of India",
          "nse": "NSE", "bse": "BSE", "pmyojana": "Government of India", "yojana": "Government of India"}
RDAP_CACHE = CACHE / "rdap.json"
COUNTRY = {"GB": "United Kingdom", "US": "United States", "AE": "UAE", "SG": "Singapore", "HK": "Hong Kong",
           "KH": "Cambodia", "MM": "Myanmar", "TH": "Thailand", "VN": "Vietnam", "CN": "China",
           "PH": "Philippines", "NG": "Nigeria", "PK": "Pakistan", "BD": "Bangladesh", "NP": "Nepal",
           "CA": "Canada", "AU": "Australia", "MY": "Malaysia", "ID": "Indonesia", "IN": "India", "LA": "Laos"}


def phone_info(raw: str) -> dict:
    out = {"raw": raw, "valid": False, "is_indian": None, "region": None, "country": None, "e164": None}
    try:
        n = phonenumbers.parse(raw, "IN")
    except phonenumbers.NumberParseException:
        return out
    region = phonenumbers.region_code_for_number(n) or phonenumbers.region_code_for_country_code(n.country_code)
    if region == "ZZ":
        region = None
    out.update(valid=phonenumbers.is_valid_number(n), region=region, is_indian=(n.country_code == 91),
               country=COUNTRY.get(region) or geocoder.country_name_for_number(n, "en") or region,
               e164=phonenumbers.format_number(n, phonenumbers.PhoneNumberFormat.E164))
    return out


def classify_domain(value: str) -> dict:
    dom = registered_domain(value)
    label = dom.split(".")[0] if dom else ""
    official = dom in OFFICIAL or dom.endswith(".gov.in") or dom.endswith(".nic.in")
    lookalike = None
    if not official and dom not in FREE_EMAIL | SHORTENERS | MESSAGING:
        tokens = set(label.replace("_", "-").split("-"))
        for key, brand in BRANDS.items():
            if key in tokens or (len(key) >= 4 and key in label):
                lookalike = brand
                break
    return {"input": value, "domain": dom, "official": official, "official_owner": OFFICIAL.get(dom),
            "free_email": dom in FREE_EMAIL, "shortener": dom in SHORTENERS,
            "messaging": dom in MESSAGING, "lookalike_of": lookalike}


def domain_age_days(domain: str, timeout: float = 6.0) -> int | None:
    """Age of a domain from public RDAP records. None if unknown (offline, unsupported TLD...)."""
    cache = json.loads(RDAP_CACHE.read_text()) if RDAP_CACHE.exists() else {}
    if domain in cache:
        created = cache[domain]
    else:
        created = None
        try:
            r = requests.get(f"https://rdap.org/domain/{domain}", timeout=timeout,
                             headers={"Accept": "application/rdap+json"})
            if r.status_code == 200:
                for ev in r.json().get("events", []):
                    if ev.get("eventAction") == "registration":
                        created = ev.get("eventDate")
                        break
        except Exception:
            return None
        cache[domain] = created
        try:
            RDAP_CACHE.write_text(json.dumps(cache, indent=1))
        except OSError:
            pass
    if not created:
        return None
    try:
        dt = datetime.fromisoformat(created.replace("Z", "+00:00"))
        return (datetime.now(timezone.utc) - dt).days
    except ValueError:
        return None
