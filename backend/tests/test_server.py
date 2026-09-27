"""API tests for the website backend (fake model, no network)."""
import json

import pytest
from fastapi.testclient import TestClient

import server
from core import llm
from tests.test_orchestrator import FM_AD, FakeModel


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setattr("agents.web_agent.domain_age_days", lambda d: None)
    monkeypatch.setattr("core.orchestrator.RUNS", tmp_path)
    monkeypatch.setattr(server, "REPLAY_DELAY", 0)
    llm.set_backend(FakeModel())
    yield TestClient(server.app)
    llm.set_backend(None)


def lines(resp):
    return [json.loads(l) for l in resp.text.splitlines() if l.strip()]


def test_samples_and_status(client):
    s = client.get("/api/samples").json()
    assert len(s["ads"]) >= 10 and {"id", "title", "category", "text"} <= set(s["ads"][0])
    st = client.get("/api/status").json()
    assert st["ai_available"] is True and st["registry"]["sebi_records"] > 3000 and st["registry"]["rbi_alerts"] == 95


def test_check_streams_events_then_verdict(client):
    r = client.post("/api/check", json={"text": FM_AD})
    assert r.status_code == 200 and r.headers["content-type"].startswith("application/x-ndjson")
    ev = lines(r)
    assert ev[0]["type"] == "event" and ev[0]["event"]["type"] == "handoff"
    kinds = {e["event"]["type"] for e in ev if e["type"] == "event"}
    assert {"evidence", "charge", "response", "verdict"} <= kinds
    assert ev[-1]["type"] == "done" and ev[-1]["run"]["verdict"]["label"] == "FRAUD"
    assert "image" not in ev[-1]["run"]


def test_empty_input_is_a_clear_error(client):
    r = client.post("/api/check", json={"text": "   "})
    assert r.status_code == 400 and "Paste" in r.json()["detail"]


def test_sample_run_is_saved_then_replayed_offline(client):
    ad = client.get("/api/samples").json()["ads"][0]
    live = lines(client.post("/api/check", json={"sample_id": ad["id"]}))
    assert live[-1]["type"] == "done"
    replay = lines(client.post("/api/check", json={"sample_id": ad["id"], "offline": True}))
    assert replay[-1]["type"] == "done" and replay[-1]["replayed"] is True
    assert [e["event"]["type"] for e in replay if e["type"] == "event"] == \
           [e["event"]["type"] for e in live if e["type"] == "event"]


def test_offline_without_saved_run(client):
    r = client.post("/api/check", json={"sample_id": "does_not_exist", "offline": True})
    assert r.status_code == 404


def test_model_failure_is_reported_not_crashed(client):
    llm.set_backend(FakeModel(extractor=llm.LLMError("quota")))
    r = client.post("/api/check", json={"image_b64": "iVBORw0KGgo=", "mime": "image/png"})
    ev = lines(r)
    assert ev[-1]["type"] == "error" and "screenshot" in ev[-1]["message"].lower()


def test_home_page_served(client):
    r = client.get("/")
    assert r.status_code == 200 and "<canvas" in r.text or 'id="stage"' in r.text
