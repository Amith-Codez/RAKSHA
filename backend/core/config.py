"""Paths and settings shared by every module."""
import os
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PROMPTS = ROOT / "prompts"
CACHE = ROOT / "cache"
LLM_CACHE = CACHE / "llm"
RUNS = CACHE / "runs"
EVAL_RESULTS = ROOT / "eval" / "results.json"

# .env can live in the project folder or one level up (the team's shared folder).
load_dotenv(ROOT / ".env")
load_dotenv(ROOT.parent / ".env")

MAX_AGENT_STEPS = int(os.getenv("RAKSHA_MAX_STEPS", "12"))   # hard stop for handoff loops
MAX_ROUNDS = int(os.getenv("RAKSHA_MAX_ROUNDS", "2"))        # negotiation rounds
CONVERGENCE_GAP = int(os.getenv("RAKSHA_CONVERGENCE_GAP", "20"))  # % points

for d in (LLM_CACHE, RUNS):
    d.mkdir(parents=True, exist_ok=True)
