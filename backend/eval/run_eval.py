"""Run all sample ads through (a) the RAKSHA agent team and (b) a single-prompt baseline.

    python -m eval.run_eval            # all ads
    python -m eval.run_eval scam_fm_deepfake genuine_scss   # only these

Saves every agent run to cache/runs/ (used by the offline demo) and a summary to eval/results.json.
"""
import json
import sys
import time
from datetime import datetime

from core import llm
from core.config import DATA, EVAL_RESULTS, PROMPTS
from core.orchestrator import investigate, save_run

BASELINE = ("# ROLE: baseline\nYou are a fraud detector for investment ads aimed at Indian retirees.\n\n"
            + (PROMPTS / "knowledge.md").read_text() +
            "\n\nDecide in one step. Return ONLY JSON: "
            '{"label": "FRAUD|SUSPICIOUS|LIKELY_SAFE", "risk": 0-100, "reason": "one sentence"}')


def baseline(ad_text: str) -> dict:
    try:
        d = llm.call_json(BASELINE, f"AD TEXT:\n{ad_text}", temperature=0.1)
        label = str(d.get("label", "")).upper().replace(" ", "_")
        return {"label": label if label in ("FRAUD", "SUSPICIOUS", "LIKELY_SAFE") else "ERROR",
                "reason": d.get("reason", "")}
    except llm.LLMError as e:
        return {"label": "ERROR", "reason": str(e)[:120]}


def main(only):
    ads = json.loads((DATA / "test_ads.json").read_text())["ads"]
    if only:
        ads = [a for a in ads if a["id"] in only]
    rows = []
    prev = json.loads(EVAL_RESULTS.read_text())["rows"] if EVAL_RESULTS.exists() else []
    keep = {r["id"]: r for r in prev if r["id"] not in {a["id"] for a in ads}}
    for a in ads:
        t0 = time.time()
        calls0 = llm.stats["calls"]
        try:
            bb = investigate(a["text"])
            save_run(bb, a["id"])
            v = bb.verdict
            agents_label, risk = v["label"], v["risk"]
        except llm.LLMError as e:
            agents_label, risk = "ERROR", None
            print("  agent run failed:", e)
        b = baseline(a["text"])
        row = {"id": a["id"], "title": a["title"], "category": a["category"], "expected": a["expected"],
               "agents_label": agents_label, "agents_risk": risk, "agents_ok": agents_label in a["acceptable"],
               "baseline_label": b["label"], "baseline_reason": b["reason"],
               "baseline_ok": b["label"] in a["acceptable"], "seconds": round(time.time() - t0, 1),
               "llm_calls": llm.stats["calls"] - calls0}
        rows.append(row)
        print(f"{a['id']:<28} expected {a['expected']:<11} agents {agents_label:<11} "
              f"{'✓' if row['agents_ok'] else '✗'}   single-prompt {b['label']:<11} {'✓' if row['baseline_ok'] else '✗'}"
              f"   ({row['seconds']} s, {row['llm_calls']} calls)")
    order = [a["id"] for a in json.loads((DATA / "test_ads.json").read_text())["ads"]]
    allrows = sorted(list(keep.values()) + rows, key=lambda r: order.index(r["id"]) if r["id"] in order else 99)
    res = {"run_at": datetime.now().strftime("%d %b %Y %H:%M"), "model": f"{llm.provider()} {llm.model_name()}",
           "rows": allrows, "agents_correct": sum(r["agents_ok"] for r in allrows),
           "baseline_correct": sum(r["baseline_ok"] for r in allrows),
           "agents_false_alarms": sum(1 for r in allrows if r["category"] == "genuine" and r["agents_label"] != "LIKELY_SAFE")}
    EVAL_RESULTS.write_text(json.dumps(res, indent=1, ensure_ascii=False))
    print(f"\nAgents {res['agents_correct']}/{len(allrows)} · single prompt {res['baseline_correct']}/{len(allrows)} "
          f"· saved {EVAL_RESULTS}")


if __name__ == "__main__":
    main(sys.argv[1:])
