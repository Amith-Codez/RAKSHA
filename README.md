# RAKSHA · check an ad before you click

RAKSHA is a browser extension for Indian families. When an investment ad shows up on Facebook, YouTube, WhatsApp Web
or any site, click the RAKSHA shield (or press **Alt+Shift+R**), then click the ad. Eleven AI agents read it (vision OCR
for picture ads), follow its real links, check SEBI and RBI records and what other families reported, argue about it,
and answer in the side panel in plain English, Hindi or Telugu.

Promptothon 2026 · Problem #125: *flag fake investment scheme ads targeting retirees using a multi-agent architecture
where specialized AI agents negotiate and hand off tasks autonomously.*

## Run it (2 minutes)

```bash
# 1. key: copy backend/.env.example to backend/.env and set GEMINI_API_KEY=...  (free: aistudio.google.com/apikey)
bash start.sh              # server on http://localhost:8000, opens the practice feed
```

2. In Chrome (or Edge / Brave) open `chrome://extensions`, switch on **Developer mode**, click **Load unpacked**, pick
   the **`extension-ready`** folder. The voice tutorial opens by itself.
3. On **http://localhost:8000/demo** click the shield, then click any sponsored post.

No extension? The website at http://localhost:8000 has the same checker (paste text, upload a screenshot, or pick a sample).

## Put it online

Push this folder to GitHub, then on Render: **New → Blueprint → pick the repo → paste your Gemini key**. `render.yaml`
does the rest. Step by step, including Supabase memory and the demo-day checklist: **[docs/DEPLOY.md](docs/DEPLOY.md)**.
The live site offers the extension as a download that is already pointed at that server.

## Folder

```
RAKSHA/
├── start.sh              one command to run the server
├── render.yaml           one-click cloud deploy on Render (see docs/DEPLOY.md)
├── Dockerfile            the same server as a container, for any other host
├── extension-ready/      the built extension: Load unpacked this folder
├── extension/            extension source: WXT (Manifest V3) + React 19 + TypeScript + Tailwind v4 + Motion
│   ├── entrypoints/      background.ts (click, shortcut, menus, screenshot + crop) · overlay.ts (pick the ad)
│   │                     sidepanel/ (live agents + verdict) · welcome/ (voice tutorial) · options/ (settings)
│   ├── components/       Verdict, Constellation, Stepper, LiveLog, …
│   └── lib/              api (streaming client), i18n (EN/HI/TE), settings, agents
├── backend/              Python · FastAPI
│   ├── server.py         /v2/scan (NDJSON stream) · /v2/report · /v2/indicators · /v2/translate · /v2/tts · /demo
│   ├── agents/           extractor, router, registry, web, link, community, pattern, advocates (prosecutor +
│   │                     defender), arbiter
│   ├── core/             orchestrator (blackboard + hand-offs + negotiation), llm (Gemini routing, DeepSeek backup),
│   │                     store (community memory: Supabase or SQLite)
│   ├── tools/            SEBI/RBI registry lookups, link unwrapping + safe redirect following, domain/phone/UPI
│   │                     checks, returns maths, image fingerprints, prompt-injection detector
│   ├── prompts/          one prompt per agent + shared knowledge (non-coders can tune these)
│   ├── data/             SEBI advisers + analysts (3,251), RBI Alert List (95), 15 test ads
│   ├── web/              website + practice feed (demo.html)
│   ├── cache/runs/       saved checks for demo mode (replays if the internet fails)
│   ├── eval/             agents vs one-prompt baseline → results.json
│   ├── supabase/         schema.sql for shared community memory
│   └── tests/            60 tests, no API key needed:  cd backend && python -m pytest -q
└── docs/                 DEPLOY guide, pitch + explainer, architecture and the jury-audit fixes
```

## Optional keys (backend/.env)

| Key | What it adds | Without it |
|---|---|---|
| `GEMINI_API_KEY` (+ `_2`, `_3` from other Google projects) | the AI agents, picture-ad reading | text ads get rule-based checks only |
| `DEEPSEEK_API_KEY` | paid text backup when Gemini is busy or out of free quota | rule-based fallbacks |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | community memory shared by every family (run `supabase/schema.sql` first) | memory on this laptop |
| `ELEVENLABS_API_KEY` | premium voice for "Read aloud" | free neural voices (English, Hindi, Telugu) |

Rebuild the extension from source: `cd extension && npm install && npm run build` (output: `.output/chrome-mv3`).
