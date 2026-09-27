# Deploy RAKSHA (about 15 minutes)

> **Live now:** https://raksha-8mok.onrender.com (Render web service `raksha`, free plan, Singapore), deployed from
> [github.com/Amith-Codez/RAKSHA](https://github.com/Amith-Codez/RAKSHA) `main`. Every push to `main` redeploys it.
> Check it any time at [`/v2/health`](https://raksha-8mok.onrender.com/v2/health). The steps below are for a fresh
> copy on your own account.

One web service runs everything, on one address such as `https://raksha-xxxx.onrender.com`:

| Address | What it is |
|---|---|
| `/` | the website (with the "try it here" checker) |
| `/demo` | the practice feed with sample ads |
| `/v2/*` | the API the extension talks to |
| `/download/raksha-extension.zip` | the extension, **already pointed at this server** |

## 0. Before you start

1. **Make a new Gemini key.** The old ones were pasted in a chat, so treat them as leaked: open
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey), create a new key, and delete the old ones.
2. You need a **GitHub** account (you have one) and a free **Render** account: sign up at
   [render.com](https://render.com) with "Sign in with GitHub".

## 1. Put the code on GitHub

The folder `RAKSHA-Final` is already a git repository with everything committed. `.env`, `.venv`, caches and the
local database are excluded by `.gitignore`, so your keys never leave your laptop.

**Option A: VS Code or Cursor (easiest)**
1. File → Open Folder → `Avn wins/RAKSHA-Final`.
2. Source Control (the branch icon on the left) → **Publish Branch**.
3. Pick **Publish to GitHub public repository** (so the jury can see the code) or private. Sign in to GitHub if it asks.

**Option B: GitHub Desktop**
File → Add Local Repository → pick `RAKSHA-Final` → **Publish repository** → name `raksha` → untick
"Keep this code private" if you want it public → Publish.

**Option C: Terminal**
1. Create an empty repo at [github.com/new](https://github.com/new): name `raksha`, **no** README, no .gitignore.
2. Run:
   ```bash
   cd ~/"Avn wins/RAKSHA-Final"
   git remote add origin https://github.com/Amith-Codez/raksha.git
   git push -u origin main
   ```
   If git asks for a password, use a GitHub personal access token, not your GitHub password.

## 2. Deploy on Render

1. Open [dashboard.render.com](https://dashboard.render.com) → **New** → **Blueprint**.
2. Connect GitHub and allow Render to see the `raksha` repo. Select it.
3. Render reads `render.yaml` and shows one web service called **raksha** (free plan, Singapore region).
4. It asks for **GEMINI_API_KEY**: paste your new key. Click **Apply** / **Deploy Blueprint**.
5. Wait 3 to 5 minutes until the service says **Live**. Your address is shown at the top, like
   `https://raksha-xxxx.onrender.com`.
6. **Check it:** open `https://<your-address>/v2/health`. You want `"ok": true` and `"ai": true`.

**Optional keys** (Render → your service → **Environment** → Add → Save; it redeploys by itself):

| Key | What it adds |
|---|---|
| `GEMINI_API_KEY_2`, `GEMINI_API_KEY_3` | more free quota (each key from a different Google account) |
| `DEEPSEEK_API_KEY` | paid backup when Gemini is busy or out of quota |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | community memory that survives restarts (step 4) |
| `ELEVENLABS_API_KEY` | premium voice (without it, free neural voices are used) |

## 3. Install the extension that talks to your server

1. Open your Render address → **Download the extension (.zip)** → unzip it.
2. Chrome → `chrome://extensions` → switch on **Developer mode** → **Load unpacked** → pick the unzipped
   `raksha-extension` folder. The voice tutorial opens.
3. Already have the old local copy installed? Remove it first, or open RAKSHA's **Options** (right-click the shield)
   and paste your Render address as the server.
4. Test: open `https://<your-address>/demo`, click the shield, click a sponsored post.

## 4. Shared memory with Supabase (recommended)

On the free Render plan the local memory file is wiped whenever the service sleeps or redeploys. Supabase keeps it:
1. Create a free project at [supabase.com](https://supabase.com).
2. SQL Editor → paste all of `backend/supabase/schema.sql` → **Run**.
3. Project Settings → API: copy the **Project URL** and the **service_role** key.
4. Add them on Render as `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. The service_role key stays on the server only.
5. `/v2/health` now shows `"memory": "cloud"`.

## 5. Demo-day checklist

- The free plan **sleeps after 15 idle minutes** and takes about a minute to wake. Open
  `https://<your-address>/v2/health` **5 minutes before you present** and again between rounds.
  For the event day you can switch the service to a paid instance type (Render → Settings → Instance type), which
  never sleeps, and switch back afterwards.
- If the venue Wi-Fi fails: turn on **Demo mode** in the extension settings and use the laptop server (`bash start.sh`).
- Every `git push` to `main` redeploys automatically. Don't push during your slot.

## 6. Other hosts (Docker)

The `Dockerfile` works on any host that runs containers (Railway, Fly.io, Koyeb, Google Cloud Run, a VPS):

```bash
docker build -t raksha .
docker run -p 8000:8000 -e GEMINI_API_KEY=your-key raksha        # → http://localhost:8000
```

On **Railway**: New Project → Deploy from GitHub repo → it finds the Dockerfile → Variables: add `GEMINI_API_KEY` →
Settings → Networking → **Generate Domain**.

## 7. Chrome Web Store (later)

The zip from `/download/raksha-extension.zip` can be uploaded to the
[Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole) as it is (manifest at the root).
You pay a one-time developer registration fee, add screenshots and a privacy policy, and wait for review.

## Troubleshooting

| You see | Fix |
|---|---|
| `"ai": false` in `/v2/health` | `GEMINI_API_KEY` is missing or wrong: Render → Environment |
| Extension says the server is not reachable | the service is asleep (open the address, wait a minute) or Options has the wrong address |
| "Too many checks in a short time" | the built-in limit: 20 checks per person per 5 minutes |
| Checks slow or "could not finish" | Gemini free quota used up: add `GEMINI_API_KEY_2` or `DEEPSEEK_API_KEY` |
| Build fails on Render | check the build log; `PYTHON_VERSION` must be `3.11.9` (set by `render.yaml`) |

**Never commit `.env`.** Keys live only in Render's Environment tab (and in `backend/.env` on your laptop).
