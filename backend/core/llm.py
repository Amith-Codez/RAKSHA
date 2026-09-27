"""One door to the language model.

call_json(system, user, image=None) -> dict
  * Gemini (default, free tier) or any OpenAI-compatible API (OpenAI, Groq, OpenRouter).
  * Every response is cached on disk: re-running the same ad costs no quota and works offline.
  * Tests inject a fake backend with set_backend().
"""
from __future__ import annotations

import base64
import hashlib
import contextvars
import json
import os
import re
import time

import requests

from core.config import LLM_CACHE


class LLMError(Exception):
    pass


_backend = None      # tests: fn(system, user, image) -> dict
stats = {"calls": 0, "cache_hits": 0, "last_model": None}


def set_backend(fn):
    """Replace the real model with a function (used by tests). Pass None to restore."""
    global _backend
    _backend = fn


def provider() -> str:
    p = os.getenv("LLM_PROVIDER", "").strip().lower()
    if p:
        return p
    if gemini_keys():
        return "gemini"
    if os.getenv("OPENAI_API_KEY"):
        return "openai"
    return "none"


# Tried in order; a model that is overloaded (503), rate-limited (429) or retired (404) is skipped for a while.
GEMINI_CHAIN = ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-flash-latest", "gemini-3.7-flash",
                "gemini-3.5-flash-lite", "gemini-3.5-flash"]
_cooldown: dict[str, float] = {}


_lat: dict[str, float] = {}          # moving average of real response times per model (seconds)
_slow_until: dict[str, float] = {}   # model-wide trouble (timeouts, 503 overload): try other models first


def gemini_models() -> list[str]:
    """Latency-aware routing: the fastest healthy model first (measured on real calls), the pinned model
    (GEMINI_MODEL) gets a small head start, and a model that just timed out or was overloaded goes to the back.
    Measured at the venue: one pinned model timing out on every key cost 70 s per check; this costs ~1 s."""
    pinned = os.getenv("GEMINI_MODEL", "").strip()
    chain = list(dict.fromkeys(m for m in [pinned, *GEMINI_CHAIN] if m))
    now = time.time()

    def score(m: str) -> float:
        s = _lat.get(m, 4.0) - (0.5 if m == pinned else 0.0) - (0.3 if m == stats.get("last_model") else 0.0)
        return s + (100 if _slow_until.get(m, 0) > now else 0)
    return sorted(chain, key=score)


def warmup():
    """At server start, time one tiny call per model (in parallel) so the very first family check already goes to
    the fastest healthy model instead of discovering a slow one the hard way."""
    if provider() != "gemini" or not gemini_keys():
        return
    from concurrent.futures import ThreadPoolExecutor
    key = gemini_keys()[0]

    def probe(m):
        t0 = time.time()
        try:
            _gemini_once(m, key, 'Return JSON {"ok": true}', "ping", None, "image/png", 0.0)
            _lat[m] = time.time() - t0
        except Exception:
            _slow_until[m] = time.time() + 60
    with ThreadPoolExecutor(max_workers=len(GEMINI_CHAIN) + 1) as pool:
        list(pool.map(probe, list(dict.fromkeys([os.getenv("GEMINI_MODEL", "").strip() or GEMINI_CHAIN[0], *GEMINI_CHAIN]))))


def model_name() -> str:
    if provider() == "gemini":
        return stats.get("last_model") or f"auto ({gemini_models()[0]} first)"
    if provider() == "openai":
        return os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    return "none"


def available() -> bool:
    return _backend is not None or provider() in ("gemini", "openai")


def parse_json(text: str, list_key: str | None = None) -> dict:
    """Models sometimes wrap JSON in ``` fences or add prose. Recover the first JSON object.
    If the model returns a bare list and list_key is given, keep every item: {list_key: [...]}."""
    if text is None:
        raise LLMError("empty response")
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t, flags=re.S).strip()
    try:
        out = json.loads(t)
        if isinstance(out, dict):
            return out
        if isinstance(out, list) and list_key:
            return {list_key: [x for x in out if isinstance(x, dict)]}
        if isinstance(out, list) and out and isinstance(out[0], dict):
            return out[0]
    except json.JSONDecodeError:
        pass
    start = t.find("{")
    while start != -1:
        depth, in_str, esc = 0, False, False
        for i in range(start, len(t)):
            ch = t[i]
            if in_str:
                if esc:
                    esc = False
                elif ch == "\\":
                    esc = True
                elif ch == '"':
                    in_str = False
                continue
            if ch == '"':
                in_str = True
            elif ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(t[start:i + 1])
                    except json.JSONDecodeError:
                        break
        start = t.find("{", start + 1)
    raise LLMError(f"could not parse JSON from model output: {t[:200]!r}")


def _cache_key(system: str, user: str, image: bytes | None) -> str:
    img = hashlib.sha256(image).hexdigest() if image else ""
    raw = json.dumps([provider(), system, user, img], ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


_scan_deadline: contextvars.ContextVar[float | None] = contextvars.ContextVar("scan_deadline", default=None)


_degraded: contextvars.ContextVar[list] = contextvars.ContextVar("degraded", default=[])


def set_scan_deadline(seconds: float | None):
    """Whole-check time budget: when it runs out, remaining agents skip the model and use their rule-based
    fallbacks, so a slow or rate-limited model can never leave the family waiting for minutes."""
    _scan_deadline.set(time.time() + seconds if seconds else None)
    _degraded.set([])


def degraded() -> list:
    """Model calls that failed during this check (the Arbiter must not say 'genuine' on half a check)."""
    return _degraded.get()


def _fail(msg: str) -> "LLMError":
    lst = _degraded.get()
    if lst is not None:
        lst.append(msg[:120])
    return LLMError(msg)


def call_json(system: str, user: str, image: bytes | None = None, image_mime: str = "image/png",
              temperature: float = 0.2, list_key: str | None = None) -> dict:
    if _backend is not None:
        stats["calls"] += 1
        return _backend(system, user, image)

    key = _cache_key(system, user, image)
    path = LLM_CACHE / f"{key}.json"
    if path.exists():
        stats["cache_hits"] += 1
        return json.loads(path.read_text())["response"]
    if os.getenv("RAKSHA_OFFLINE") == "1":
        raise LLMError("offline mode and this request is not cached")

    p = provider()
    if p == "none":
        raise LLMError("No API key found. Add GEMINI_API_KEY=... to a .env file.")

    last_err = None
    deadline = time.time() + float(os.getenv("LLM_CALL_BUDGET_S", "35"))   # then the agent falls back to rules
    scan_end = _scan_deadline.get()
    if scan_end:
        if time.time() > scan_end - 1.5:
            raise _fail("time budget for this check is used up; finishing with rule-based checks")
        deadline = min(deadline, scan_end)
    for attempt in range(4):
        if time.time() > deadline:
            break
        try:
            text = _call_gemini(system, user, image, image_mime, temperature, deadline) if p == "gemini" \
                else _call_openai(system, user, image, image_mime, temperature)
            data = parse_json(text, list_key)
            stats["calls"] += 1
            path.write_text(json.dumps({"model": stats.get("last_model"), "system": system[:200],
                                        "user": user[:500], "response": data},
                                       ensure_ascii=False, indent=1))
            return data
        except LLMError as e:          # bad JSON: ask again
            last_err = e
        except Exception as e:         # rate limit / network: back off
            last_err = e
            msg = str(e)
            if not any(s in msg for s in ("429", "500", "502", "503", "504", "RESOURCE_EXHAUSTED",
                                          "UNAVAILABLE", "timed out", "Timeout", "Connection")):
                raise _fail(f"{p} error: {msg[:300]}") from e
            time.sleep(min([2, 5, 10, 15][attempt], max(0.0, deadline - time.time())))
            _cooldown.clear()                     # after waiting, give every model another chance
    if p == "gemini" and image is None and os.getenv("DEEPSEEK_API_KEY", "").strip() and time.time() < deadline - 3:
        try:                                   # Gemini busy / out of quota → paid text backup
            data = parse_json(_call_deepseek(system, user, temperature, deadline - time.time()), list_key)
            stats["calls"] += 1
            path.write_text(json.dumps({"model": stats.get("last_model"), "system": system[:200], "user": user[:500],
                                        "response": data}, ensure_ascii=False, indent=1))
            return data
        except Exception as e:
            last_err = e
    raise _fail(f"model call failed after retries: {last_err}")


def gemini_keys() -> list[str]:
    """Several free keys (one per teammate) multiply the free quota: GEMINI_API_KEYS=k1,k2 or GEMINI_API_KEY_2..."""
    keys = [k.strip() for k in os.getenv("GEMINI_API_KEYS", "").split(",") if k.strip()]
    for name in ("GEMINI_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY_2", "GEMINI_API_KEY_3", "GEMINI_API_KEY_4"):
        v = os.getenv(name, "").strip()
        if v and v not in keys:
            keys.append(v)
    return keys


_clients: dict[str, object] = {}


def _gemini_once(model, key, system, user, image, image_mime, temperature) -> str:
    from google import genai
    from google.genai import types

    if key not in _clients:
        _clients[key] = genai.Client(api_key=key, http_options=types.HttpOptions(
            timeout=int(max(10.0, float(os.getenv("GEMINI_TIMEOUT_S", "10"))) * 1000)))   # API minimum is 10 s
    client = _clients[key]
    parts = []
    if image:
        parts.append(types.Part.from_bytes(data=image, mime_type=image_mime))
    parts.append(user)
    cfg = dict(system_instruction=system, temperature=temperature, response_mime_type="application/json",
               automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True))
    if model.startswith("gemini-2.5-flash"):
        cfg["thinking_config"] = types.ThinkingConfig(thinking_budget=0)      # fast: no hidden reasoning
    elif model.startswith("gemini-3") or "latest" in model:
        cfg["thinking_config"] = types.ThinkingConfig(thinking_level="low")
    try:
        resp = client.models.generate_content(model=model, contents=parts, config=types.GenerateContentConfig(**cfg))
    except Exception as e:
        if "thinking" in str(e).lower() and "thinking_config" in cfg:
            cfg.pop("thinking_config")
            resp = client.models.generate_content(model=model, contents=parts,
                                                  config=types.GenerateContentConfig(**cfg))
        else:
            raise
    if not resp.text:
        raise LLMError(f"{model} returned an empty response")
    return resp.text


HEDGE_S = float(os.getenv("GEMINI_HEDGE_S", "0"))   # off by default: free-tier quota matters more than tail latency
_hedge_pool = None


def _call_gemini(system, user, image, image_mime, temperature, deadline: float | None = None) -> str:
    """Hedged request: ask the fastest model; if it hasn't answered in HEDGE_S seconds, ask the next-fastest model
    on another key in parallel and take whichever answers first. Cuts the slow tail (a 27 s call → ~5 s)."""
    global _hedge_pool
    order = gemini_models()
    healthy = [m for m in order if _slow_until.get(m, 0) <= time.time()]
    if HEDGE_S <= 0 or len(healthy) < 2 or _backend is not None:
        return _call_gemini_seq(system, user, image, image_mime, temperature, deadline)
    from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait
    if _hedge_pool is None:
        _hedge_pool = ThreadPoolExecutor(max_workers=8, thread_name_prefix="gemini")
    first = _hedge_pool.submit(_call_gemini_seq, system, user, image, image_mime, temperature, deadline, order, 0)
    done, _ = wait([first], timeout=HEDGE_S)
    if done:
        return first.result()
    alt = [healthy[1]] + [m for m in order if m != healthy[1]]
    second = _hedge_pool.submit(_call_gemini_seq, system, user, image, image_mime, temperature, deadline, alt, 1)
    pending, err = {first, second}, None
    while pending:
        done, pending = wait(pending, return_when=FIRST_COMPLETED)
        for f in done:
            try:
                return f.result()
            except Exception as e:          # this racer failed; wait for the other one
                err = err or e
    raise err


def _call_gemini_seq(system, user, image, image_mime, temperature, deadline: float | None = None,
                     order: list[str] | None = None, key_offset: int = 0) -> str:
    """Try each model on each key. Busy/over-quota pairs rest for a while; a one-off slow call just moves on."""
    errors = []
    keys = gemini_keys()
    if keys and key_offset:
        keys = keys[key_offset % len(keys):] + keys[:key_offset % len(keys)]
    for model in (order or gemini_models()):
        if _slow_until.get(model, 0) > time.time() and any(_slow_until.get(m, 0) <= time.time() for m in GEMINI_CHAIN):
            continue                                      # a healthy model exists: don't wait on a sick one
        for ki, key in enumerate(keys):
            ki = (ki + key_offset) % len(keys)
            if deadline and time.time() > deadline:
                raise RuntimeError("504 time budget used up (" + " | ".join(errors) + ")")
            slot = f"{model}#{ki}"
            if _cooldown.get(slot, 0) > time.time():
                continue
            try:
                t0 = time.time()
                text = _gemini_once(model, key, system, user, image, image_mime, temperature)
                dt = time.time() - t0
                _lat[model] = dt if model not in _lat else 0.7 * _lat[model] + 0.3 * dt
                stats["last_model"] = model
                return text
            except LLMError:
                raise
            except Exception as e:
                msg = str(e)
                if any(c in msg for c in ("504", "DEADLINE", "timed out", "Timeout", "timeout")):
                    errors.append(f"{slot}: slow")
                    _slow_until[model] = time.time() + 120          # the MODEL is slow, not the key: move on
                    _lat[model] = max(_lat.get(model, 0), 10.0)
                    break
                if "503" in msg or "UNAVAILABLE" in msg:
                    errors.append(f"{slot}: overloaded")
                    _slow_until[model] = time.time() + 60
                    break
                retired = "404" in msg or "NOT_FOUND" in msg
                if retired or any(c in msg for c in ("503", "UNAVAILABLE", "429", "RESOURCE_EXHAUSTED", "500",
                                                      "INTERNAL")):
                    daily = "PerDay" in msg                       # free-tier daily quota: gone until tomorrow
                    _cooldown[slot] = time.time() + (3600 if retired else 6 * 3600 if daily else 300 if "429" in msg else 45)
                    errors.append(f"{slot}: {msg[:40]}")
                    continue
                if "API key" in msg or "API_KEY" in msg or "401" in msg or "403" in msg:
                    _cooldown[slot] = time.time() + 3600          # bad key: skip it, try the others
                    errors.append(f"key {ki + 1} rejected")
                    continue
                raise
    raise RuntimeError("503 UNAVAILABLE: every Gemini model/key is busy or out of quota (" + " | ".join(errors) + ")")


def _call_openai(system, user, image, image_mime, temperature) -> str:
    base = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    content = [{"type": "text", "text": user}]
    if image:
        b64 = base64.b64encode(image).decode()
        content.append({"type": "image_url", "image_url": {"url": f"data:{image_mime};base64,{b64}"}})
    body = {"model": model_name(), "temperature": temperature,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": content}]}
    r = requests.post(f"{base}/chat/completions", json=body, timeout=90,
                      headers={"Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}"})
    if r.status_code != 200:
        raise RuntimeError(f"{r.status_code} {r.text[:300]}")
    return r.json()["choices"][0]["message"]["content"]


def _call_deepseek(system, user, temperature, timeout: float) -> str:
    """Paid backup brain (DeepSeek, OpenAI-compatible, text only). Used only when every Gemini model/key is busy or
    out of free quota, so a check still gets the AI debate instead of rules only."""
    key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    body = {"model": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"), "temperature": temperature,
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system + "\nReturn only valid JSON."},
                         {"role": "user", "content": user}]}
    r = requests.post(os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/") + "/chat/completions",
                      json=body, timeout=max(5.0, timeout), headers={"Authorization": f"Bearer {key}"})
    if r.status_code != 200:
        raise RuntimeError(f"deepseek {r.status_code} {r.text[:200]}")
    stats["last_model"] = body["model"]
    return r.json()["choices"][0]["message"]["content"]
