"""RAKSHA website backend: serves the site and streams the agents' investigation live.

Run:  python server.py        (then open http://localhost:8000)
"""
from __future__ import annotations

import base64
import binascii
import hashlib
import html
import io
import json
import os
import queue
import threading
import time
import zipfile
from typing import Literal
from urllib.parse import quote, urlparse

import requests
from collections import defaultdict, deque

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from core import llm
from core import store as store_mod
from core.config import CACHE, DATA, EVAL_RESULTS, ROOT
from core.orchestrator import get_registry, investigate, load_run, save_run
from tools.fingerprint import dhash

WEB = ROOT / "web"
REPLAY_DELAY = 0.35          # seconds between replayed events (0 in tests)
MAX_IMAGE_BYTES = 6 * 1024 * 1024

app = FastAPI(title="RAKSHA")
# The browser extension calls this API from chrome-extension:// (or moz-extension://) pages; the site from localhost.
app.add_middleware(CORSMiddleware,
                   allow_origin_regex=r"(chrome|moz)-extension://[a-z0-9-]+|https?://(localhost|127\.0\.0\.1)(:\d+)?",
                   allow_methods=["GET", "POST"], allow_headers=["Content-Type"], max_age=600)
ADS = json.loads((DATA / "test_ads.json").read_text())["ads"]
AD_BY_ID = {a["id"]: a for a in ADS}


class CheckRequest(BaseModel):
    text: str = ""
    sample_id: str | None = None
    image_b64: str | None = None
    mime: str = "image/png"
    offline: bool = False


def _line(obj) -> bytes:
    return (json.dumps(obj, ensure_ascii=False) + "\n").encode()


def _public(run: dict) -> dict:
    return {k: v for k, v in run.items() if k != "image"}


@app.get("/api/samples")
def samples():
    return {"ads": [{k: a[k] for k in ("id", "title", "category", "text", "expected")} for a in ADS]}


@app.get("/api/status")
def status():
    reg = get_registry()
    return {"ai_available": llm.available(), "provider": llm.provider(), "model": llm.model_name(),
            "keys": len(llm.gemini_keys()) if llm.provider() == "gemini" else int(llm.available()),
            "registry": {"sebi_records": len(reg.sebi), "rbi_alerts": len(reg.rbi), "source": reg.sebi_source()}}


@app.get("/api/results")
def results():
    if not EVAL_RESULTS.exists():
        raise HTTPException(404, "No evaluation results yet. Run: python -m eval.run_eval")
    return json.loads(EVAL_RESULTS.read_text())


def _decode_image(b64: str | None) -> tuple[bytes | None, str]:
    if not b64:
        return None, "image/png"
    head, _, data = b64.rpartition(",")
    mime = head[5:].split(";")[0] if head.startswith("data:") else "image/png"
    try:
        image = base64.b64decode(data, validate=False)
    except (binascii.Error, ValueError):
        raise HTTPException(400, "That screenshot could not be read. Try a PNG or JPG.")
    if len(image) > MAX_IMAGE_BYTES:
        raise HTTPException(413, "That screenshot is too large (max 6 MB). Select a smaller area and try again.")
    return image or None, mime or "image/png"


@app.post("/api/check")
def check(req: CheckRequest):
    sample = AD_BY_ID.get(req.sample_id) if req.sample_id else None
    text = (sample["text"] if sample else req.text or "").strip()
    image, _ = _decode_image(req.image_b64)

    saved = load_run(req.sample_id) if req.sample_id else None
    if req.offline or (sample and not llm.available()):
        if not saved:
            raise HTTPException(404, "There is no saved run for this ad yet. Switch offline mode off and try again.")
        return StreamingResponse(_replay(saved), media_type="application/x-ndjson")
    if not text and not image:
        raise HTTPException(400, "Paste the ad text, upload a screenshot, or pick a sample first.")
    if image and not llm.available():
        raise HTTPException(503, "Reading screenshots needs the AI model. Add a Gemini key to .env.")
    return StreamingResponse(_live(text, image, req.mime, req.sample_id if sample else None),
                             media_type="application/x-ndjson")


def _replay(run: dict):
    for m in run["trace"]:
        yield _line({"type": "event", "event": m})
        if REPLAY_DELAY:
            time.sleep(REPLAY_DELAY * (0.5 if m["type"] in ("handoff", "note") else 1.0))
    yield _line({"type": "done", "run": _public(run), "replayed": True})


def _live(text: str, image: bytes | None, mime: str, sample_id: str | None, context: dict | None = None,
          after=None):
    """Run the agents in a worker thread and stream each blackboard message as one NDJSON line.
    `context` = extension page context (page_url, page_title, page_links, image_hash, store);
    `after(run) -> dict` adds fields (e.g. scan_id) to the final line."""
    q: queue.Queue = queue.Queue()

    def work():
        try:
            bb = investigate(text, image, mime, on_event=lambda m: q.put(("event", m)), **(context or {}))
            if sample_id:
                save_run(bb, sample_id)          # every live sample run becomes an offline backup
            run = bb.to_dict()
            extra = after(run) if after else {}
            q.put(("done", (run, extra)))
        except llm.LLMError as e:
            msg = ("We couldn't read that screenshot because the AI model is busy. Paste the ad text instead, "
                   "or try again in a minute.") if image and not text else f"The AI model is busy right now ({e})."
            q.put(("error", msg))
        except Exception as e:                    # never leave the browser hanging
            q.put(("error", f"Something went wrong while checking this ad: {type(e).__name__}."))

    threading.Thread(target=work, daemon=True).start()
    while True:
        kind, payload = q.get()
        if kind == "event":
            yield _line({"type": "event", "event": payload})
        elif kind == "done":
            run, extra = payload if isinstance(payload, tuple) else (payload, {})
            yield _line({"type": "done", "run": _public(run), "replayed": False, **extra})
            return
        else:
            yield _line({"type": "error", "message": payload})
            return

# ============================ v2: browser-extension API ============================
class PageLink(BaseModel):
    href: str = Field(max_length=2048)
    text: str = Field("", max_length=200)


class ScanRequest(BaseModel):
    image_b64: str | None = None          # the cropped screenshot of the selected ad (data URL or plain base64)
    text: str = Field("", max_length=8000)  # text the page itself shows inside the selection (DOM), OCR-free
    page_url: str = Field("", max_length=2048)
    page_title: str = Field("", max_length=300)
    links: list[PageLink] = Field(default_factory=list, max_length=40)
    sample_ids: list[str] = Field(default_factory=list, max_length=10)   # demo-feed ads inside the selection
    install_id: str | None = Field(None, max_length=64)
    lang: str = "en"
    offline: bool = False


class ReportRequest(BaseModel):
    scan_id: str = Field(max_length=64)
    label: Literal["scam", "safe", "unsure"]
    note: str | None = Field(None, max_length=500)
    install_id: str | None = Field(None, max_length=64)


class TranslateRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=12)
    lang: Literal["te", "hi", "ta", "kn", "ml", "mr", "bn", "gu"] = "te"


LANG_NAMES = {"te": "Telugu", "hi": "Hindi", "ta": "Tamil", "kn": "Kannada", "ml": "Malayalam", "mr": "Marathi",
              "bn": "Bengali", "gu": "Gujarati"}


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=1200)
    lang: str = "en"


# ---------- abuse limits: each scan costs ~7 model calls; reports feed shared memory ----------
_hits: dict[tuple, deque] = defaultdict(deque)
LIMITS = {"scan": (20, 300), "report": (30, 3600), "translate": (60, 300)}   # (max requests, per seconds)


def _limit(kind: str, request: Request, install_id: str | None = None):
    n, window = LIMITS[kind]
    now = time.time()
    for key in {(kind, request.client.host if request.client else "?"), (kind, install_id or "-")}:
        if key[1] == "-":
            continue
        q = _hits[key]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= n:
            raise HTTPException(429, "Too many checks in a short time. Please wait a few minutes and try again.")
        q.append(now)


def _clean_page_url(u: str) -> str:
    """Privacy: keep only scheme://host/path. Query strings and #fragments can carry tokens, emails or chat IDs."""
    p = urlparse(u or "")
    return f"{p.scheme}://{p.netloc}{p.path}"[:500] if p.scheme in ("http", "https") and p.netloc else ""


def _public_origin(request: Request) -> str:
    """This server's own public address, e.g. https://raksha.onrender.com (Render sets RENDER_EXTERNAL_URL)."""
    env = (os.getenv("PUBLIC_URL") or os.getenv("RENDER_EXTERNAL_URL") or "").strip().rstrip("/")
    return env or str(request.base_url).rstrip("/")


def _is_demo_page(u: str, request: Request | None = None) -> bool:
    """Saved demo runs may only be replayed for OUR demo feed; any other page could fake data-raksha-sample ids."""
    p = urlparse(u or "")
    own = {"localhost", "127.0.0.1"}
    if request is not None:
        own |= {request.url.hostname or "", urlparse(_public_origin(request)).hostname or ""}
    return (p.hostname or "") in own - {""} and p.path.rstrip("/") == "/demo"


def _remember(run: dict, meta: dict) -> dict:
    """Save the scan and let the verdict teach the community memory. Never fails the scan."""
    try:
        st = store_mod.get_store()
        sid = st.save_scan(run, meta)
        learned = store_mod.learn_from_verdict(st, run, meta.get("install_id"))
        return {"scan_id": sid, "learned": learned, "memory": "cloud" if getattr(st, "url", None) and
                not getattr(st, "degraded", False) else "local"}
    except Exception as e:                                           # memory is best-effort
        return {"scan_id": None, "memory_error": type(e).__name__}


def _replay_v2(run: dict, meta: dict):
    yield from (l for l in _replay(run) if b'"type": "done"' not in l)
    run = {**run, "image_hash": meta.get("image_hash") or run.get("image_hash")}
    yield _line({"type": "done", "run": _public(run), "replayed": True, **_remember(run, meta)})


@app.post("/v2/scan")
def scan(req: ScanRequest, request: Request):
    image, mime = _decode_image(req.image_b64)
    text = req.text.strip()
    page_url = _clean_page_url(req.page_url)
    sample = next((AD_BY_ID[i] for i in req.sample_ids if i in AD_BY_ID), None) if _is_demo_page(page_url, request) else None
    if not text and not image and sample:
        text = sample["text"]                   # e.g. right-click "check text" on a demo ad
    if not image and not text:
        raise HTTPException(400, "Nothing to check yet. Draw a box around the ad and try again.")
    _limit("scan", request, req.install_id)
    image_hash = dhash(image) if image else None
    links = [l.model_dump() for l in req.links if urlparse(l.href).scheme in ("http", "https", "upi", "tel", "mailto")]
    meta = {"page_url": page_url, "install_id": req.install_id, "model": llm.model_name(), "image_hash": image_hash}

    saved = load_run(sample["id"]) if sample else None
    if saved and (req.offline or not llm.available()):
        return StreamingResponse(_replay_v2(saved, meta), media_type="application/x-ndjson")
    if req.offline:
        raise HTTPException(409, "Offline mode only works on the demo ads. Turn offline mode off to check this ad.")
    if image and not text and not llm.available():
        raise HTTPException(503, "Reading this screenshot needs the AI model, and it is not set up on the RAKSHA "
                                 "server. Ask the person who installed RAKSHA to add an API key.")
    context = {"page_url": page_url, "page_title": req.page_title, "page_links": links,
               "image_hash": image_hash, "store": store_mod.get_store()}
    return StreamingResponse(
        _live(text, image, mime, sample["id"] if sample else None, context, after=lambda run: _remember(run, meta)),
        media_type="application/x-ndjson")


@app.post("/v2/report")
def report_scan(req: ReportRequest, request: Request):
    _limit("report", request, req.install_id)
    try:
        n = store_mod.report(store_mod.get_store(), req.scan_id, req.label, req.note, req.install_id)
    except KeyError:
        raise HTTPException(404, "We could not find that check any more. Please check the ad again.")
    return {"ok": True, "indicators_updated": n}


@app.get("/v2/indicators")
def indicators(kind: Literal["domain", "phone", "upi", "reg_no", "image_hash"], value: str = Query(max_length=200)):
    value = value.strip().lower() if kind in ("domain", "upi") else value.strip()
    hit = store_mod.get_store().lookup(kind, [value]).get(value)
    return {"kind": kind, "value": value, **(hit or {"scam_count": 0, "safe_count": 0, "last_seen": None})}


@app.get("/v2/health")
def health():
    st = store_mod.get_store()
    return {"ok": True, "ai": llm.available(), "model": llm.model_name(), "tts": bool(os.getenv("ELEVENLABS_API_KEY")),
            "memory": "cloud" if getattr(st, "url", None) and not getattr(st, "degraded", False) else "local"}


@app.post("/v2/translate")
def translate(req: TranslateRequest, request: Request):
    """Verdict in the family's own language (Telugu for Hyderabad). Cached, so each sentence is translated once."""
    _limit("translate", request)
    if not llm.available():
        raise HTTPException(503, "Translation needs the AI model.")
    lang = LANG_NAMES[req.lang]
    system = (f"You translate short safety messages for elderly readers in India into simple, everyday {lang} "
              f"(the way a grandchild would say it). Keep numbers, rupee amounts, website names, phone numbers, "
              f"UPI IDs and '1930' exactly as they are. Return ONLY JSON: {{\"texts\": [one translation per input, same order]}}")
    texts = [t[:600] for t in req.texts]
    try:
        out = llm.call_json(system, json.dumps(texts, ensure_ascii=False), list_key="texts")
    except llm.LLMError:
        raise HTTPException(503, "The AI model is busy; showing English for now.")
    res = out.get("texts") if isinstance(out, dict) else None
    if not isinstance(res, list) or len(res) != len(texts):
        raise HTTPException(502, "Translation came back incomplete; showing English for now.")
    return {"lang": req.lang, "texts": [str(x) for x in res]}


TTS_CACHE = CACHE / "tts"
FREE_VOICES = {"en": "en-IN-NeerjaNeural", "hi": "hi-IN-SwaraNeural", "te": "te-IN-ShrutiNeural"}


def _free_voice(req: "TTSRequest"):
    """No ElevenLabs key: Microsoft's free neural voices (Indian English, Hindi, Telugu). Browsers rarely ship a
    Telugu voice, so this is what makes "Read aloud" work in Telugu. 501 → the extension uses the browser voice."""
    try:
        import asyncio
        import ssl

        import edge_tts
        import edge_tts.communicate as comm
    except ImportError:
        raise HTTPException(501, "Natural voice is not set up; using the browser voice.")
    ca = os.getenv("SSL_CERT_FILE")
    if ca and hasattr(comm, "_SSL_CTX"):          # behind a TLS-inspecting proxy
        comm._SSL_CTX = ssl.create_default_context(cafile=ca)
    voice = FREE_VOICES.get(req.lang, FREE_VOICES["en"])
    TTS_CACHE.mkdir(parents=True, exist_ok=True)
    path = TTS_CACHE / (hashlib.sha256(f"{voice}|{req.text}".encode()).hexdigest()[:32] + ".mp3")
    if not path.exists():
        try:
            asyncio.run(edge_tts.Communicate(req.text, voice, rate="-8%").save(str(path)))
        except Exception:
            path.unlink(missing_ok=True)
            raise HTTPException(502, "The voice service could not be reached; using the browser voice.")
    return Response(path.read_bytes(), media_type="audio/mpeg", headers={"Cache-Control": "max-age=86400"})


@app.post("/v2/tts")
def tts(req: TTSRequest):
    """Natural voice for the verdict (ElevenLabs). 501 = not configured → the extension uses the browser's voice."""
    key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    if not key:
        return _free_voice(req)
    voice = os.getenv("ELEVENLABS_VOICE_ID", "JBFqnCBsd6RMkjVDRZzb")
    model = os.getenv("ELEVENLABS_MODEL", "eleven_multilingual_v2")
    TTS_CACHE.mkdir(parents=True, exist_ok=True)
    path = TTS_CACHE / (hashlib.sha256(f"{voice}|{model}|{req.text}".encode()).hexdigest()[:32] + ".mp3")
    if not path.exists():
        try:
            r = requests.post(f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_64",
                              headers={"xi-api-key": key, "Content-Type": "application/json"},
                              json={"text": req.text, "model_id": model}, timeout=20)
        except requests.RequestException:
            raise HTTPException(502, "The voice service could not be reached; using the browser voice.")
        if r.status_code != 200 or not r.content:
            raise HTTPException(502, "The voice service refused the request; using the browser voice.")
        path.write_bytes(r.content)
    return Response(path.read_bytes(), media_type="audio/mpeg", headers={"Cache-Control": "max-age=86400"})


# ---------------- demo feed (a realistic page to try the extension on, no real ads needed) ----------------
DEMO_IMAGES = {"scam_pension_fd": "/demo-ads/pension_plus.jpg"}   # image-only ads: the Extractor must read them (vision OCR)
DEMO_ADS = [  # (sample id, sponsor name, button text, where the button REALLY goes)
    ("scam_fm_deepfake", "Govt Senior Income Updates", "Register now", "https://govt-sbi-yojana.online/pay"),
    ("genuine_scss", "India Post Savings Info", "Learn more", "https://www.indiapost.gov.in/"),
    ("hard_lookalike_indiapost", "SCSS Online Desk", "Open account online", "https://www.indiapost-scss.in/apply"),
    ("scam_fake_sebi_tips", "Growth Capital Advisors", "Join WhatsApp club", "https://chat.whatsapp.com/VIPstockclub"),
    ("hard_genuine_registered_adviser", "1 Finance", "Book a consultation", "https://www.1finance.co.in/"),
    ("scam_pension_fd", "Suraksha Wealth Nidhi", "Pay by UPI", "upi://pay?pa=surakshawealth.nidhi@ybl&pn=Suraksha"),
]


def _demo_cards() -> str:
    out = []
    for i, (sid, sponsor, cta, dest) in enumerate(DEMO_ADS):
        ad = AD_BY_ID[sid]
        href = dest if not dest.startswith("http") else "/r?u=" + quote(dest, safe="")
        out.append(f"""
      <article class="post ad" data-raksha-sample="{sid}">
        <header><span class="avatar a{i % 6}">{html.escape(sponsor[:1])}</span>
          <div><b>{html.escape(sponsor)}</b><small>Sponsored</small></div></header>
        {f'<img src="{DEMO_IMAGES[sid]}" alt="Sponsored image" width="900" height="900">' if sid in DEMO_IMAGES
         else f'<p>{html.escape(ad["text"])}</p>'}
        <a class="cta" href="{html.escape(href)}">{html.escape(cta)}</a>
      </article>""")
        if i in (0, 2, 4):
            out.append(FRIEND_POSTS[i // 2])
    return "".join(out)


FRIEND_POSTS = [
    '<article class="post"><header><span class="avatar f0">L</span><div><b>Lakshmi Aunty</b><small>2 h</small></div></header>'
    '<p>Grandson\'s first day at school today. So proud!</p></article>',
    '<article class="post"><header><span class="avatar f1">R</span><div><b>Ramesh (Retired Teachers Group)</b>'
    '<small>5 h</small></div></header><p>Morning walk group meets at 6 am tomorrow near the temple. Bring water!</p></article>',
    '<article class="post"><header><span class="avatar f2">S</span><div><b>Sunita</b><small>Yesterday</small></div></header>'
    '<p>Does anyone know if the post office on MG Road is open on Saturday?</p></article>',
]


@app.get("/demo", response_class=HTMLResponse)
def demo_feed():
    return (WEB / "demo.html").read_text().replace("<!--ADS-->", _demo_cards())


@app.get("/r", response_class=HTMLResponse)
def demo_redirect(u: str = Query(max_length=2048)):
    """The demo feed's click-tracking wrapper (like l.facebook.com/l.php?u=…). It never sends anyone to the
    scam site: it only shows where the button would have gone."""
    return f"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Demo link</title><body style="font:18px/1.5 system-ui;max-width:560px;margin:15vh auto;padding:0 16px">
<h1 style="font-size:24px">This is a demo link</h1><p>On a real site this button would have taken you to:</p>
<p style="word-break:break-all;background:#fff4e5;padding:12px;border-radius:8px"><b>{html.escape(u)}</b></p>
<p><a href="/demo">← Back to the demo feed</a></p></body>"""


EXTENSION_READY = ROOT.parent / "extension-ready"
BUILT_API_URL = b"http://localhost:8000"      # the extension's built-in server address
_zips: dict[str, bytes] = {}


@app.get("/download/raksha-extension.zip")
def download_extension(request: Request):
    """The ready-to-install extension, already pointed at THIS server, so families never type a server address."""
    if not (EXTENSION_READY / "manifest.json").is_file():
        raise HTTPException(404, "The extension-ready folder is missing on this server.")
    origin = _public_origin(request)
    if origin not in _zips:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
            for p in sorted(EXTENSION_READY.rglob("*")):
                if p.is_file() and not p.name.startswith("."):
                    data = p.read_bytes()
                    if p.suffix == ".js":
                        data = data.replace(BUILT_API_URL, origin.encode())
                    z.writestr(p.relative_to(EXTENSION_READY).as_posix(), data)
        if len(_zips) > 4:
            _zips.clear()
        _zips[origin] = buf.getvalue()
    return Response(_zips[origin], media_type="application/zip",
                    headers={"Content-Disposition": 'attachment; filename="raksha-extension.zip"'})


@app.get("/")
def home():
    return FileResponse(WEB / "index.html")


app.mount("/", StaticFiles(directory=WEB), name="web")


if __name__ == "__main__":
    import uvicorn

    threading.Thread(target=llm.warmup, daemon=True).start()     # find the fastest model before the first check
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "127.0.0.1")        # only this laptop by default; HOST=0.0.0.0 on a cloud server
    print(f"\n  RAKSHA is running: open http://localhost:{port}\n")
    # Behind a cloud proxy (Render, Railway) set FORWARDED_ALLOW_IPS=* so rate limits see each visitor's own IP.
    uvicorn.run(app, host=host, port=port, log_level="warning", proxy_headers=True,
                forwarded_allow_ips=os.getenv("FORWARDED_ALLOW_IPS", "127.0.0.1"))
