"""Deterministic extraction of checkable facts from ad text (backs up the Extractor agent)."""
import re

import phonenumbers

REG_RE = re.compile(r"\bIN[A-Z]\s?\d{9}\b", re.I)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+", re.I)
UPI_RE = re.compile(r"\b[\w.-]{2,}@(?:ybl|ibl|axl|okaxis|oksbi|okhdfcbank|okicici|paytm|ptyes|ptsbi|pthdfc|ptaxis|"
                    r"upi|apl|yapl|axisbank|icici|hdfcbank|sbi|kotak|idfcbank|fbl|jupiteraxis|slc|freecharge|"
                    r"airtel|jio|waicici|wahdfcbank|wasbi|waaxis)\b(?!\.)", re.I)
TLDS = ("com|in|net|org|co|io|app|xyz|online|info|biz|live|club|site|top|uk|me|ly|gd|at|exchange|sbi|"
        "one|pro|money|finance|fund|trade|vip|cc|us|ai|link|world|today|store|shop|tech")
URL_RE = re.compile(rf"(?:https?://)?(?:www\.)?[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:{TLDS})\b(?:/[^\s,;)\]]*)?", re.I)
PHONE_RE = re.compile(r"(?<![\w₹.,/])(\+?\d[\d\s-]{8,16}\d)(?![\w,.]\d)")


def _dedupe(items):
    seen, out = set(), []
    for i in items:
        k = i.lower()
        if k not in seen:
            seen.add(k)
            out.append(i)
    return out


def extract_contacts(text: str) -> dict:
    text = text or ""
    emails = _dedupe(EMAIL_RE.findall(text))
    no_email = EMAIL_RE.sub(" ", text)
    links = _dedupe(u.rstrip(".") for u in URL_RE.findall(no_email))
    phones = []
    for m in PHONE_RE.findall(no_email):
        digits = re.sub(r"\D", "", m)
        if not 10 <= len(digits) <= 13:
            continue
        try:
            num = phonenumbers.parse(m, "IN")
            if phonenumbers.is_possible_number(num):
                phones.append(m.strip())
        except phonenumbers.NumberParseException:
            continue
    regs = _dedupe(r.upper().replace(" ", "") for r in REG_RE.findall(text))
    upis = _dedupe(UPI_RE.findall(text))
    return {"reg_numbers": regs, "emails": emails, "links": links, "phones": _dedupe(phones), "upi_ids": upis}
