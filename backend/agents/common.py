import json
from functools import lru_cache

from core.config import PROMPTS

SPECIALIST_NAMES = ("registry", "web", "pattern", "link", "community")


@lru_cache(maxsize=None)
def load_prompt(name: str) -> str:
    text = (PROMPTS / f"{name}.md").read_text()
    if "{knowledge}" in text:
        text = text.replace("{knowledge}", (PROMPTS / "knowledge.md").read_text())
    return text


def claims_json(bb) -> str:
    return json.dumps(bb.claims, ensure_ascii=False, indent=1)


def clean_handoffs(raw, allowed=SPECIALIST_NAMES) -> list[dict]:
    out = []
    for h in raw or []:
        if not isinstance(h, dict):
            continue
        to = str(h.get("to", "")).strip().lower()
        if to in allowed:
            out.append({"to": to, "query": str(h.get("query") or "").strip() or None,
                        "why": str(h.get("why") or "").strip() or f"needs a {to} check"})
    return out
