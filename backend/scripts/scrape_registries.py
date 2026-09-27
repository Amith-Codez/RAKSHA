"""Refresh SEBI registry snapshots (Investment Advisers + Research Analysts).

Run:  python scripts/scrape_registries.py
Writes data/sebi_ia.json and data/sebi_ra.json. Uses only the Python standard library.
Source: https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=13 (IA) / 14 (RA)
"""
import html, http.cookiejar, json, re, sys, time, urllib.parse, urllib.request
from datetime import date
from pathlib import Path

BASE = "https://www.sebi.gov.in"
AJAX = BASE + "/sebiweb/ajax/other/getintmfpiinfo.jsp"
LISTS = {"sebi_ia.json": ("13", "SEBI Registered Investment Advisers"),
         "sebi_ra.json": ("14", "SEBI Registered Research Analysts")}
FIELDS = {"Name": "name", "Registration No.": "reg_no", "E-mail": "email", "Telephone": "phone",
          "Address": "address", "Contact Person": "contact_person", "Validity": "validity"}
UA = {"User-Agent": "Mozilla/5.0 (RAKSHA hackathon research)"}


_jar = http.cookiejar.CookieJar()
_opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(_jar))
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36"}


def fetch(url, data=None, referer=None):
    headers = dict(UA)
    if data is not None:  # the AJAX endpoint needs the session cookie + browser-like headers
        headers.update({"Content-Type": "application/x-www-form-urlencoded", "X-Requested-With": "XMLHttpRequest",
                        "Origin": BASE, "Referer": referer or BASE})
    req = urllib.request.Request(url, data=data, headers=headers)
    with _opener.open(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def parse_cards(page):
    records = []
    for card in re.split(r"<div class=['\"]fixed-table-body card-table['\"]>", page)[1:]:
        rec = {}
        for title, value in re.findall(r"<div class=['\"]title['\"]><span>\s*(.*?)\s*</span></div><div class=['\"]value[^'\"]*['\"]><span>(.*?)</span>", card, re.S):
            key = FIELDS.get(html.unescape(title).strip())
            if key:
                rec[key] = re.sub(r"\s+", " ", html.unescape(re.sub(r"<.*?>", "", value))).strip()
        if rec.get("reg_no"):
            records.append(rec)
    return records


def total_pages(page):
    m = re.search(r"of\s+(\d+)\s+records", page)
    return (int(m.group(1)) + 24) // 25 if m else 1, int(m.group(1)) if m else 0


def scrape(intm_id, partial_path, delay=1.5):
    """Resumable: pages already fetched are kept in partial_path, so a block (HTTP 530) loses nothing."""
    state = json.loads(partial_path.read_text()) if partial_path.exists() else {"pages": {}, "expected": 0, "n_pages": 0}
    page_url = f"{BASE}/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId={intm_id}"
    first = fetch(page_url)  # always: sets the session cookie
    if "0" not in state["pages"]:
        first = fetch(f"{BASE}/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId={intm_id}")
        state["n_pages"], state["expected"] = total_pages(first)
        state["pages"]["0"] = parse_cards(first)
        partial_path.write_text(json.dumps(state))
    for p in range(1, state["n_pages"]):
        if str(p) in state["pages"]:
            continue
        body = urllib.parse.urlencode({"nextValue": "1", "next": "n", "intmId": intm_id, "contPer": "", "name": "",
                                       "regNo": "", "email": "", "location": "", "exchange": "", "affiliate": "",
                                       "alp": "", "doDirect": str(p), "intmIds": ""}).encode()
        try:
            state["pages"][str(p)] = parse_cards(fetch(AJAX, body, referer=page_url))
        except Exception as e:
            print(f"stopped at page {p}: {e} -- wait a few minutes and re-run; progress is saved", file=sys.stderr)
            break
        partial_path.write_text(json.dumps(state))
        time.sleep(delay)
    done = len(state["pages"]) == state["n_pages"]
    records = [r for pg in state["pages"].values() for r in pg]
    return records, state["expected"], done


if __name__ == "__main__":
    out_dir = Path(__file__).resolve().parent.parent / "data"
    only = sys.argv[1:]  # optional: file names to refresh
    for fname, (intm_id, label) in LISTS.items():
        if only and fname not in only:
            continue
        partial = out_dir / f".partial_{fname}"
        recs, expected, done = scrape(intm_id, partial)
        uniq = {r["reg_no"]: r for r in recs}
        payload = {"source": f"{BASE}/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId={intm_id}",
                   "label": label, "scraped_on": date.today().isoformat(), "complete": done,
                   "expected_count": expected, "count": len(uniq), "records": list(uniq.values())}
        (out_dir / fname).write_text(json.dumps(payload, indent=1, ensure_ascii=False))
        print(f"{fname}: {len(uniq)} / {expected} records ({'complete' if done else 'PARTIAL - re-run later'})")
