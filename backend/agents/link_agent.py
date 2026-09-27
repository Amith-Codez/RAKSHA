"""Link agent (tool agent): finds where the ad's buttons REALLY go, before anyone clicks.

Inputs: the real hrefs the extension read from under the selected ad (page_links) and short links printed in the ad.
- Non-web buttons are read too: upi://pay?pa=… (who gets the money), tel:, wa.me / api.whatsapp.com (whose chat),
  mailto:. Their IDs join the claim sheet so the Web and Community agents can check them.
- Same-site navigation (profile, "Like", photo links on Facebook etc.) is ignored; redirect wrappers
  (l.facebook.com, google.com/url, googleadservices…) are peeled without any network call.
- Up to 4 real destinations are followed IN PARALLEL with HEAD requests only (max 3 hops, public hosts only).
- Ad trackers and app stores are reported neutrally (we can't see the final page), never as a mismatch.
- "This site does not exist" is only claimed when our own internet works (offline canary).
"""
from __future__ import annotations

import re
from concurrent.futures import ThreadPoolExecutor, wait
from urllib.parse import parse_qs, unquote, urlparse

from tools.link_tools import internet_ok, resolve, unwrap
from tools.registry import registered_domain
from tools.web_contact import MESSAGING, SHORTENERS, classify_domain

NETWORK = True          # tests switch this off
MAX_DESTINATIONS = 4
BUDGET_S = 8.0

TRACKERS = {"doubleclick.net", "googleadservices.com", "googlesyndication.com", "adj.st", "adjust.com", "app.link",
            "onelink.me", "bnc.lt", "branch.io", "sng.link", "go.link", "appsflyer.com", "linksynergy.com",
            "anrdoezrs.net"}
APP_STORES = {"play.google.com": "Google Play", "apps.apple.com": "the App Store", "itunes.apple.com": "the App Store"}
CTA = re.compile(r"(learn|shop|sign|register|join|apply|book|download|install|invest|open|start|buy|pay|get|claim|"
                 r"chat|call|whatsapp|more|details|now|visit|जुड़|रजिस्टर|भुगतान|अभी|చేరండి|నమోదు)", re.I)


def _add(bb, key: str, value: str):
    lst = bb.claims.setdefault(key, [])
    if value and value not in lst:
        lst.append(value)


def _label(text: str) -> str:
    return f"the button “{text[:40]}”" if text else "the link"


def _non_web(bb, href: str, text: str) -> bool:
    """upi:, tel:, mailto: and WhatsApp chat links: record who the money / chat really goes to."""
    p = urlparse(href)
    scheme, host = p.scheme.lower(), (p.hostname or "").lower()
    if scheme == "upi":
        vpa = unquote((parse_qs(p.query).get("pa") or [""])[0]).strip().lower()
        if vpa:
            _add(bb, "upi_ids", vpa)
            bb.add_evidence("link", f"Before you click: {_label(text)} pays money to the UPI ID {vpa}", "NEUTRAL", 1,
                            "payment link read from the page under the ad")
        return True
    if scheme == "tel":
        num = re.sub(r"[^\d+]", "", href[4:])
        if len(num) >= 8:
            _add(bb, "phones", num)
            bb.add_evidence("link", f"Before you click: {_label(text)} calls {num}", "NEUTRAL", 1,
                            "phone link read from the page under the ad")
        return True
    if scheme == "mailto":
        _add(bb, "emails", (p.path or "").split("?")[0].lower())
        return True
    if registered_domain(href) in MESSAGING or host.endswith("whatsapp.com"):
        num = re.sub(r"\D", "", (parse_qs(p.query).get("phone") or [p.path.strip("/")])[0])
        if len(num) >= 8:
            _add(bb, "phones", "+" + num)
            _add(bb, "links", href)
            bb.add_evidence("link", f"Before you click: {_label(text)} opens a private WhatsApp chat with +{num}",
                            "NEUTRAL", 1, "chat link read from the page under the ad")
            return True
    return False


def run(bb, request: dict | None = None, done: set = frozenset()) -> list[dict]:
    host_site = registered_domain(bb.page_url or "")
    local = {"localhost", "127.0.0.1"} | ({host_site} if host_site else set())
    if request and request.get("query"):
        items = [{"href": request["query"], "text": ""}]
    else:
        items = [l for l in (bb.page_links or []) if isinstance(l, dict) and l.get("href")]
        items += [{"href": l, "text": ""} for l in bb.claims.get("links", []) if registered_domain(l) in SHORTENERS]

    # 1) read every button; keep only real outside destinations (not same-site navigation), best candidates first
    cands, seen_dom = [], set()
    for it in items[:40]:
        href, text = str(it["href"]).strip(), str(it.get("text") or "").strip()
        if _non_web(bb, href, text):
            continue
        if not href.lower().startswith(("http://", "https://")):
            continue
        dom = registered_domain(unwrap(href)[-1])
        if not dom or dom in local or dom in seen_dom:
            continue
        seen_dom.add(dom)
        cands.append({"href": href, "text": text, "dom": dom, "cta": bool(CTA.search(text))})
    cands.sort(key=lambda c: (not c["cta"], not c["text"]))
    cands = cands[:MAX_DESTINATIONS]

    handoffs, finals = [], []
    if cands:
        # 2) follow them in parallel, inside a hard time budget (a slow scam site can't stall the check)
        online = internet_ok() if NETWORK else True
        net = NETWORK and online
        pool = ThreadPoolExecutor(max_workers=len(cands))
        futs = {pool.submit(resolve, c["href"], net): c for c in cands}
        finished, _ = wait(futs, timeout=BUDGET_S)
        pool.shutdown(wait=False, cancel_futures=True)
        results = [(c, f.result() if f in finished else resolve(c["href"], network=False)) for f, c in futs.items()]
        results.sort(key=lambda r: cands.index(r[0]))

        shown = {registered_domain(l) for l in bb.claims.get("links", [])} - SHORTENERS - MESSAGING - local
        src = "links read from the page under the ad"
        for c, info in results:
            final_dom = info["final_domain"] or c["dom"]
            if final_dom in finals:
                continue
            finals.append(final_dom)
            hops = [registered_domain(u) for u in info["chain"][:-1]]
            middle = list(dict.fromkeys(h for h in hops if h and h != final_dom and h not in local))
            via = f" (via {', '.join(middle)})" if middle else ""
            if final_dom in TRACKERS:
                bb.add_evidence("link", f"Before you click: {_label(c['text'])} goes through an ad-tracking link "
                                        f"({final_dom}); the final page could not be seen safely", "NEUTRAL", 1, src)
                continue
            fhost = (urlparse(info["final"]).hostname or "").lower()
            if fhost in APP_STORES:
                app = (parse_qs(urlparse(info["final"]).query).get("id") or [""])[0]
                store = APP_STORES[fhost]
                bb.add_evidence("link", f"Before you click: {_label(c['text'])} opens an app page on {store}"
                                        f"{f' ({app})' if app else ''}", "NEUTRAL", 1, src)
                continue
            bb.add_evidence("link", f"Before you click: {_label(c['text'])} really goes to {final_dom}{via}",
                            "NEUTRAL", 1, src)
            if shown and final_dom not in shown and not classify_domain(final_dom)["official"]:
                bb.add_evidence("link", f"The ad shows {', '.join(sorted(shown))}, but its button goes to {final_dom}",
                                "FRAUD", 2, src)
            if (info.get("error") or "").startswith("website does not exist") and not classify_domain(final_dom)["official"]:
                bb.add_evidence("link", f"{final_dom} does not exist on the internet right now (scam sites are often "
                                        f"short-lived or taken down)", "FRAUD", 1, "DNS lookup")
            handoffs.append({"to": "web", "query": info["final"], "why": f"check the real destination {final_dom}"})
        if NETWORK and not online:
            bb.log("link", "blackboard", "note", "The RAKSHA server has no internet right now, so links were only "
                                                 "unwrapped, not visited. A missing website is NOT counted against the ad.")
    bb.claims["final_domains"] = sorted(set(bb.claims.get("final_domains", [])) | set(finals))

    # payment / chat IDs found in buttons always get their own web check (the router planned before we found them)
    id_hand = [{"to": "web", "query": i, "why": f"check the payment / chat ID from a button ({i})"}
               for i in (bb.claims.get("upi_ids") or [])[:1] + (bb.claims.get("phones") or [])[:1]]
    handoffs = handoffs[:2] + id_hand
    if not cands and not any(e["agent"] == "link" for e in bb.evidence):
        bb.log("link", "blackboard", "note", "No outside links under the ad to follow (only this site's own links).")
    return handoffs[:4]
