"""Rule-based check of promised returns against published safe-scheme rates (works without any AI)."""
import re

BENCHMARK = 8.2   # SCSS, % p.a., Jul–Sep 2026 — the best government-backed rate a retiree can get
PERIODS = {"day": 365, "daily": 365, "week": 52, "weekly": 52, "month": 12, "monthly": 12, "year": 1, "yearly": 1,
           "annum": 1, "annual": 1, "annually": 1, "p.a": 1, "pa": 1}
PCT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%\s*(?:(?:profit|returns?|interest|payout|gain)s?\s+)?"
                    r"(?:(?:every|per|a|each|in)\s+)?(day|daily|week|weekly|month|monthly|year|yearly|annum|annual|"
                    r"annually|p\.?\s?a)\b", re.I)
AMT_RE = re.compile(r"(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakh|lac|crore|cr)?", re.I)
DUR_RE = re.compile(r"(?:in|within|after)\s+(?:just\s+)?(\d+)\s*(day|week|month)s?|(every|per|a|each)\s+(day|week|month)",
                    re.I)


def _amount(num: str, unit: str | None) -> float:
    v = float(num.replace(",", ""))
    unit = (unit or "").lower()
    return v * (1e5 if unit in ("lakh", "lac") else 1e7 if unit in ("crore", "cr") else 1)


GAIN_WORDS = ("get", "receive", "earn", "earning", "return", "become", "grow", "payout", "profit", "make", "turn into")
INVEST_WORDS = ("invest", "deposit", "pay", "just", "only", "start with", "minimum")


def inr(x: float) -> str:
    """Indian digit grouping: 1500000 -> '15,00,000'."""
    s = f"{int(round(x))}"
    if len(s) <= 3:
        return s
    head, tail = s[:-3], s[-3:]
    groups = []
    while len(head) > 2:
        groups.insert(0, head[-2:])
        head = head[:-2]
    return ",".join(([head] if head else []) + groups) + "," + tail


def check_returns(text: str) -> list[dict]:
    """Returns findings: {finding, supports, strength}."""
    t = text or ""
    low = t.lower()
    guaranteed = any(w in low for w in ("guarantee", "assured", "fixed return", "risk-free", "zero risk", "no risk"))
    out = []
    worst = None
    for m in PCT_RE.finditer(t):
        rate = float(m.group(1))
        per = PERIODS.get(m.group(2).lower().replace(" ", "").rstrip("."), 1)
        annual = rate * per
        if worst is None or annual > worst[0]:
            worst = (annual, m.group(0).strip())
    if worst:
        annual, quote = worst
        if annual >= 24:
            out.append({"finding": f"'{quote}' works out to about {annual:.0f}% a year, while the best government-"
                                   f"backed rate for seniors (SCSS) is {BENCHMARK}%", "supports": "FRAUD", "strength": 3})
        elif annual >= 12 and guaranteed:
            out.append({"finding": f"'{quote}' is promised as guaranteed/assured, far above SCSS ({BENCHMARK}%) and "
                                   f"bank FDs for seniors (7–8.5%)", "supports": "FRAUD", "strength": 2})
        elif annual <= 9 and not guaranteed:
            pass
    gains, stakes = [], []
    for m in AMT_RE.finditer(t):
        ctx = low[max(0, m.start() - 45):m.start()]
        val = _amount(m.group(1), m.group(2))
        g = max((ctx.rfind(w) for w in GAIN_WORDS), default=-1)      # the nearest keyword decides
        i = max((ctx.rfind(w) for w in INVEST_WORDS), default=-1)
        if g > i:
            gains.append(val)
        elif i > g:
            stakes.append(val)
    dur = DUR_RE.search(t)
    if gains and stakes and dur:
        small, big = min(stakes), max(gains)
        if dur.group(1):
            n, unit = int(dur.group(1)), dur.group(2).lower()
        else:
            n, unit = 1, dur.group(4).lower()
        months = n / 30 if unit == "day" else n / 4.3 if unit == "week" else n
        if small > 0 and big / small >= 2 and months <= 12:
            out.append({"finding": f"It promises to turn ₹{inr(small)} into ₹{inr(big)} within "
                                   f"{n} {unit}{'s' if n > 1 else ''} — no real investment multiplies money like that",
                        "supports": "FRAUD", "strength": 3})
    return out
