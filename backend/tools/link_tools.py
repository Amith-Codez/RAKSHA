"""Where does an ad's button really go?  Unwrap redirect wrappers and follow short links safely."""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import parse_qs, urljoin, urlparse

import requests

from tools.registry import registered_domain

# redirect wrappers used by social networks, search engines and ad networks: host -> query parameter holding the target
WRAPPERS = {
    "l.facebook.com": ("u",), "lm.facebook.com": ("u",), "l.instagram.com": ("u",), "l.messenger.com": ("u",),
    "www.google.com": ("q", "url", "adurl"), "google.com": ("q", "url", "adurl"),
    "www.googleadservices.com": ("adurl",), "googleadservices.com": ("adurl",),
    "www.youtube.com": ("q",), "youtube.com": ("q",), "m.youtube.com": ("q",),
    "out.reddit.com": ("url",), "t.umblr.com": ("z",), "away.vk.com": ("to",),
}
GENERIC_KEYS = ("u", "url", "q", "target", "dest", "destination", "redirect", "to", "adurl", "link")
MAX_HOPS = 3
TIMEOUT = 4.0


def _norm(url: str) -> str:
    url = (url or "").strip()
    if url and "://" not in url:
        url = "https://" + url
    return url


def unwrap(url: str) -> list[str]:
    """Peel redirect wrappers without any network call. Returns the chain, last = best guess of the destination."""
    chain = [_norm(url)]
    for _ in range(4):
        p = urlparse(chain[-1])
        host = (p.hostname or "").lower()
        qs = parse_qs(p.query)
        keys = WRAPPERS.get(host)
        nxt = None
        if keys:
            nxt = next((qs[k][0] for k in keys if k in qs and qs[k][0].startswith("http")), None)
        elif p.path.rstrip("/").endswith(("/l.php", "/url", "/redirect", "/r", "/out", "/away")):
            nxt = next((qs[k][0] for k in GENERIC_KEYS if k in qs and qs[k][0].startswith("http")), None)
        if not nxt or nxt in chain:
            break
        chain.append(nxt)
    return chain


def host_status(host: str) -> str:
    """'public', 'private' (SSRF guard: never call localhost / LAN) or 'missing' (name does not resolve)."""
    try:
        infos = socket.getaddrinfo(host, None)
    except (socket.gaierror, UnicodeError, OSError):
        return "missing"
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            return "private"
    return "public"


def _public_host(host: str) -> bool:
    return host_status(host) == "public"


_online = {"t": 0.0, "ok": True}


def internet_ok() -> bool:
    """Canary: if even well-known names don't resolve, WE are offline, so a missing domain proves nothing."""
    import time
    if time.time() - _online["t"] > 60:
        _online["ok"] = any(host_status(h) == "public" for h in ("www.google.com", "www.sebi.gov.in", "one.one.one.one"))
        _online["t"] = time.time()
    return _online["ok"]


def follow(url: str, max_hops: int = MAX_HOPS, timeout: float = TIMEOUT) -> dict:
    """Follow HTTP redirects with HEAD requests only (no page bodies), public hosts only."""
    chain, status, error = [url], None, None
    cur = url
    for _ in range(max_hops):
        p = urlparse(cur)
        if p.scheme not in ("http", "https") or not p.hostname:
            error = "not a web link"
            break
        st = host_status(p.hostname)
        if st != "public":
            error = "website does not exist" if st == "missing" else "not a public website"
            break
        try:
            r = requests.head(cur, allow_redirects=False, timeout=timeout,
                              headers={"User-Agent": "Mozilla/5.0 (RAKSHA link checker)"})
            status = r.status_code
        except requests.RequestException as e:
            error = f"could not be reached ({type(e).__name__})"
            break
        loc = r.headers.get("location")
        if status in (301, 302, 303, 307, 308) and loc:
            cur = urljoin(cur, loc)
            chain.append(cur)
            continue
        break
    return {"chain": chain, "final": chain[-1], "status": status, "error": error}


def resolve(url: str, network: bool = True) -> dict:
    """Unwrap wrappers, then (optionally) follow real redirects. Returns shown/final domains and the full chain."""
    chain = unwrap(url)
    info = {"input": url, "chain": chain, "final": chain[-1], "status": None, "error": None}
    if network:
        f = follow(chain[-1])
        info["chain"] = chain[:-1] + f["chain"]
        info.update(final=f["final"], status=f["status"], error=f["error"])
    info["final_domain"] = registered_domain(info["final"])
    info["input_domain"] = registered_domain(url)
    return info
