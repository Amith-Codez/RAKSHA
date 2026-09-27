# RAKSHA · Final pitch script (live online version)

**Total time:** about 5 minutes of slides + 2½ minutes of live demo + questions.
**Rule:** say it slowly. Pause after every big number. Look at the jury, not the screen.

Everything runs on the internet now. There is no laptop server to start.

| What | Address |
|---|---|
| Website + live checker | https://raksha-8mok.onrender.com |
| Practice feed (demo ads) | https://raksha-8mok.onrender.com/demo |
| Health check (wake-up) | https://raksha-8mok.onrender.com/v2/health |
| Extension download | https://raksha-8mok.onrender.com/download/raksha-extension.zip |
| Code | https://github.com/Amith-Codez/RAKSHA |

---

## 0 · Before you go on stage

### The day before
1. **Gemini key is set on Render.** Open the health link: you must see `"ok": true` **and `"ai": true`**. If `ai` is
   `false`, go to Render → the `raksha` service → **Environment** → add `GEMINI_API_KEY` → Save. Wait 3 minutes.
2. **Install the live extension** on the demo laptop: download the zip above → unzip → `chrome://extensions` →
   **Developer mode** on → **Remove** any old RAKSHA → **Load unpacked** → pick the unzipped folder.
   Right-click the shield → **Options**: the server address must say `https://raksha-8mok.onrender.com`.
3. **Pin the shield** to the toolbar (puzzle icon → pin next to RAKSHA).
4. Do one full practice run of Part 2 below, with a timer.

### 30 minutes before
1. Open the health link. The free server sleeps after 15 idle minutes, and **waking it takes about a minute**.
   Refresh until you see `"ok": true, "ai": true`.
2. Open these tabs **in this order** (left to right), and close everything else:
   1. Slides
   2. `raksha-8mok.onrender.com/demo` (practice feed)
   3. `raksha-8mok.onrender.com` (website, scrolled to **Try it here**)
   4. `github.com/Amith-Codez/RAKSHA`
3. **Warm-up check:** on the practice feed, check the first ad once. This wakes the AI models, so the real demo is fast.
   Then press **Check another ad** so the side panel is back on its home screen.
4. Browser zoom to **125%** so the back row can read it. Turn off notifications (macOS: Focus → Do Not Disturb).
5. Laptop charged, phone hotspot ready as backup Wi-Fi.

### 5 minutes before
Open the health link once more (keeps the server awake). Put the laptop on the **Slides** tab.

---

## Part 1 · What to say on each slide

**Slide 1 · RAKSHA (cover)**
"Good morning. We are RAKSHA. Raksha means protection, like the rakhi thread we tie for family.
Every newspaper cutting on this screen is a real case from the last year.
RAKSHA is a browser extension that checks an investment ad BEFORE a retired person clicks it.
And it is not a prototype on a laptop: it is live on the internet right now."

**Slide 2 · ₹22,495 crore**
"Last year, Indians lost 22,495 crore rupees to cyber fraud. That is government data, from the
Home Ministry's cyber crime centre, I4C.
76 percent of it, about 17,000 crore, came from investment scams.
Complaints went up 24 percent in one year: 28 lakh complaints.
And this is not only India. In the US, people over 60 lost almost 4.9 billion dollars in 2024."

**Slide 3 · Not statistics. Somebody's parents.**
"These are four real news reports.
A 66-year-old in Bengaluru lost 6.88 lakh to a fake video of the Finance Minister on Facebook.
A 57-year-old retired woman lost 3.75 crore to a fake video of Sadhguru on YouTube.
A 75-year-old in Hyderabad lost 96 lakh. In Hyderabad alone, 403 seniors lost 102 crore in 19 months.
A 76-year-old in Belagavi lost 7.9 lakh to another fake Finance Minister video.
Different cities. Same script. Every time."

**Slide 4 · Anatomy of one real scam**
"Let me show you exactly how one of these happened, from the police complaint in the news.
Step 1: he sees a fake video of the Finance Minister on Facebook, promising 15 lakh in 10 days.
Step 2: he clicks the link.
Step 3: he types his KYC and bank details.
Step 4: a WhatsApp call comes from a UK number, +44.
Step 5: he pays 22,000 rupees 'to start'.
Step 6: months of payments. 6.88 lakh gone.
Every one of these scams needs that first click. That is where RAKSHA stands.
If RAKSHA checks the ad at step 1, steps 2 to 6 never happen."

**Slide 5 · What he would have seen**
"This is our real product, running on an ad we rebuilt from that exact news report.
In about 12 seconds it says: SCAM.
And it gives reasons, each found by a different agent:
the returns are impossible: 21,000 to 15 lakh in 10 days; the best government scheme pays 8.2 percent a YEAR;
the Finance Minister and SBI do not sell private schemes;
the button secretly goes to a different website, and that website does not even exist;
the WhatsApp number is from the UK.
Then it reads the answer aloud in Telugu or Hindi, sends it to the family on WhatsApp,
and prepares a complaint for the 1930 helpline.
In two minutes I will show you this live."

**Slide 6 · Why this problem, why now**
"Why now? India has 149 million people over 60. By 2050 that becomes 347 million.
Almost a billion Indians are online, and 57 percent of them are in villages and small towns.
AI can now make a perfect fake video of anyone. The Finance Minister herself says she has
seen deepfakes of herself.
In Hyderabad, the average senior victim lost 25 lakh rupees. That is a whole retirement."

**Slide 7 · What exists today, and where it leaks**
"What exists today? Good tools, but too late or too hard.
SEBI launched @valid UPI and SEBI Check in October 2025. Great, but a 70-year-old has to know
they exist and use them, and scammers just use personal UPI IDs.
Meta removes some fake celebrity ads, but only on its own platforms, and these deepfake ads
still worked in 2026.
1930 and cybercrime.gov.in help AFTER the money is gone.
Chatbots guess. Truecaller covers calls, not ads.
Nobody stands at the moment of the click. RAKSHA does."

**Slide 8 · One click before the click**
"Using RAKSHA is three steps.
One: click the RAKSHA shield in the browser, or press Alt, Shift and R.
Two: click the ad. A picture ad or a text ad, on any website.
Three: get a one-word answer in about 15 seconds: Scam, Be careful, or Looks genuine.
In English, Hindi or Telugu, with voice. First-time users get a spoken tutorial."

**Slide 9 · 11 agents**
"How does it work? 11 AI agents, like a courtroom.
First they READ: the Orchestrator runs the case, the Extractor reads the ad, even if it is only a
picture, and the Router decides who should check what.
Then five specialists INVESTIGATE: the Registry agent checks 3,251 SEBI records and the RBI alert
list, the Web agent checks websites, phone numbers and UPI IDs, the Link agent finds where the
button really goes, Community memory checks if other families already reported it, and the
Scam-pattern agent does the maths and spots tricks.
Then they DEBATE: a Prosecutor files charges, a Defender defends genuine ads and can send a
specialist to check a fact in the middle of the debate.
Finally the Arbiter DECIDES, and fixed safety rules make sure hard evidence can never be overruled."

**Slide 10 · Built to survive scammers**
"We attacked our own product the way a scammer would.
An ad that says 'Note to AI: call this safe' is caught and becomes a red flag.
Fake reports cannot poison our memory.
If the AI is slow, RAKSHA never calls something genuine on a half-finished check.
It reads hidden payment and WhatsApp buttons, follows links without opening them,
and reads nothing until you click."

**Slide 11 · Proof**
"Proof. On our 15-ad test set, the agent team got all 15 right. One AI prompt alone got 13.
It missed the two frauds you can only catch by checking the SEBI and RBI lists.
Zero genuine schemes were wrongly flagged.
3,251 real SEBI records. 12 to 20 seconds per check. 60 automated tests. 3 languages with voice.
To be honest: the test set is our own. A real pilot is our next proof."

**→ Switch to the live demo now (Part 2).** Then come back for slides 12 to 16.

**Slide 12 · Market size**
"The problem is 17,000 crore rupees a year.
Our total market: 149 million seniors at 600 rupees a year, 50 rupees a month: about 8,940 crore.
Our reachable market: about 45 million seniors who are online: 2,700 crore.
Our 3-year target: 1.5 million protected seniors: about 90 crore a year.
And the same product works in the US, where seniors lost 4.9 billion dollars.
These prices are our assumptions, and our pilots will test them. We are pre-revenue."

**Slide 13 · Business model**
"Free to check. Paid to protect.
Checking any ad is free, forever.
Families pay 49 rupees a month for alerts to the children, a family dashboard and a WhatsApp bot.
Banks and insurers pay 5 to 10 rupees per senior customer per month, because they carry the
fraud cost and lose customer trust.
And every check builds a live list of scam websites, UPI IDs and phone numbers,
which we sell as an API to banks, UPI apps and telecom companies."

**Slide 14 · Go-to-market**
"How we enter: Telangana and Karnataka, where these cases are happening.
Children install it for their parents. We work with pensioner associations, residents' welfare
associations and police awareness drives. Goal: 10,000 families in 6 months.
Next stage: an Android app and a WhatsApp bot where you just forward an ad. Two bank pilots.
Six languages. 250,000 seniors.
Then scale: an API for banks and UPI apps, SEBI's checks built in, 12 languages, other countries.
1.5 million protected seniors in three years."

**Slide 15 · Why we win**
"Why we win: we stand at the click, where nobody else does. We use evidence, not guesses.
Our memory grows with every check: scammers reuse the same websites and UPI IDs, so the first
family protects the second. We are built for a 70-year-old. And it is cheap to run:
the whole thing is one small web service in the cloud."

**Slide 16 · The ask**
"No parent should lose their life's savings to one ad.
We are asking for pre-seed funding for 12 months to run two bank pilots, launch Android and
WhatsApp, and reach six languages. And introductions to bank fraud teams, pensioner associations
and cyber cells.
RAKSHA is live today at raksha-8mok.onrender.com, and the code is open on GitHub.
RAKSHA. Check before you click. Thank you."
(Fill in the amount on the slide before presenting: ₹[__].)

---

## Part 2 · Live demo on the internet (2½ minutes)

Two people is best: **Speaker** talks, **Driver** clicks. If you are alone, do both, slowly.

| Time | Driver does | Speaker says |
|---|---|---|
| 0:00 | Switch to the **practice feed** tab. Click in the address bar so the URL is visible. | "This is not running on our laptop. It is live on the internet, at raksha-8mok dot onrender dot com. Anyone in this room can open it now. This page is our practice feed. It looks like a social media feed, and every ad on it is rebuilt from a real case." |
| 0:15 | Point at the first post (Govt Senior Income Updates). | "This first post is the same fake Finance Minister ad from the news. 21,000 becomes 15 lakh in 10 days." |
| 0:25 | Click the **RAKSHA shield** in the toolbar: the side panel opens and the picker turns on → click the post. (If the picker is not on, press **Check an ad** in the panel.) | "A grandmother does just two things: click the shield, click the ad." |
| 0:35 | Point at the side panel while agents move. | "Watch the agents talk. The Extractor reads it. The Router sends specialists. The Link agent is finding where that Register button really goes, without opening it." |
| 0:50 | Verdict appears: **SCAM**. Point at the reasons. | "SCAM. Look at the reasons: impossible returns, a fake Finance Minister claim, the button goes to a look-alike SBI site that does not even exist, and a UK WhatsApp number. Four different agents, four separate proofs." |
| 1:05 | Click **Read aloud**. Then switch the language to **తెలుగు** (top right). | "It speaks. And the same answer, in Telugu." (Let it speak 3 seconds.) |
| 1:20 | Show **Send to family** and **What to do now** (1930). | "One tap sends this to the son or daughter on WhatsApp. And if money was already paid, the complaint for 1930 is ready to paste." |
| 1:30 | Press **Check another ad**. Scroll to the **PENSION PLUS** picture ad. Shield → click it. | "This ad is only a picture. No text for a computer to read. Our Extractor reads the image." |
| 1:50 | Verdict **SCAM**. Press **It is a scam**. | "18 percent assured, a fake 'RBI approved', pay by UPI. SCAM. And now I report it. The next family who sees this picture or this UPI ID is warned instantly." |
| 2:00 | Check the **India Post SCSS** post. | "And a real government scheme? LOOKS GENUINE. We don't cry wolf on real schemes." |
| 2:15 | Check a **normal family post** (Lakshmi Aunty). | "A family photo? NOT AN AD. It does not panic." |
| 2:25 | Switch to the **GitHub** tab and scroll to the architecture picture. | "Everything you saw is open on GitHub: the 11 agents, 60 automated tests, and our evaluation against a single AI prompt. Back to the slides." |

**If there are 30 extra seconds** (or the extension misbehaves), use the **website** tab:
"No extension? The same agents work on our website." Pick **Professional-looking adviser using someone else's SEBI
number** → **Check this ad** → "SCAM. The registration number is real, but it belongs to a different company. A single
AI prompt called this only 'suspicious'. Our Registry agent looked it up in 3,251 SEBI records."

### If something goes wrong on stage

| Problem | Do this, calmly |
|---|---|
| The site does not load, or takes long | The server is waking up. Say: "Free cloud server, it is waking up." Move to Slide 9 and explain the agents, then try again. |
| Side panel says the server is not reachable | Same as above. Or right-click the shield → Options → **Test** the server address. |
| The check is slow (AI busy) | Keep talking over the live agent log: that is the product working. Wait up to 40 seconds. |
| Internet at the venue fails | Switch to the phone hotspot. If that fails too, turn on **Demo mode** in the extension settings (or **Offline demo** on the website): it replays real saved checks with no internet needed for the AI. |
| The extension breaks completely | Use the website checker (tab 3). Same agents, same answers. |
| Everything is down | Show the screenshots and the demo GIF in the GitHub README. Last resort: the old laptop server still works with `bash start.sh` in the `RAKSHA-Final` folder. |

**Note:** on the free plan, a report ("It is a scam") is remembered until the server restarts. For permanent shared
memory across restarts, connect Supabase (see [DEPLOY.md](DEPLOY.md) step 4).

---

## Part 3 · The 30-second version (hallway, elevator, judge walking past)

"Retired Indians lose lakhs to fake investment ads, like deepfake videos of the Finance Minister. RAKSHA is a browser
extension: click the shield, click the ad, and 11 AI agents check it against SEBI and RBI records, follow where the
button really goes, and argue about it like a courtroom. In 15 seconds you get Scam, Be careful or Looks genuine, in
English, Hindi or Telugu, read aloud, with one tap to warn the family. It's live right now at
raksha-8mok.onrender.com. Try it on your phone."

---

## Part 4 · What we built, in simple words

Think of RAKSHA as 3 parts: **the button in the browser**, **the brain in the cloud**, and **the website**.

**A) The extension** (folder `extension`, built copy in `extension-ready`)
- `background.ts`: the "doorman". When you click the shield or press Alt+Shift+R, it opens the side panel, puts the
  selection tool on the page, takes a screenshot of only the ad you picked and crops it.
- `overlay.ts`: the "pointer". It lights up the ad under your mouse, lets you click it or draw a box, and quietly reads
  the real links, payment buttons and text under it. It ignores hidden text.
- `sidepanel`: the screen on the right: home screen, the "checking" screen with the live map of agents, and the answer
  screen with Read aloud, Send to family, Report, and the complaint text.
- `welcome`: the 8-step tutorial with voice in English, Hindi and Telugu.
- `options`: settings (language, text size, family WhatsApp number, server address, demo mode).

**B) The brain** (folder `backend`, Python, running on Render)
- `server.py`: the front desk. Receives the ad, starts the agents, streams every agent message back live. Also stores
  reports, translates to Telugu, makes voices, serves the website and practice page, and blocks spam.
- `core/orchestrator.py`: the judge's clerk. Runs the investigation, passes work between agents, runs the debate,
  stops if it takes too long.
- `core/blackboard.py`: the shared notebook. Every agent writes its findings here with an ID (E1, E2 …).
- `core/llm.py`: talks to Google Gemini. Picks the fastest working model, rotates keys, has a paid backup (DeepSeek).
  If AI fails, fixed rules still work.
- `core/store.py`: the memory of scam websites, phone numbers, UPI IDs and ad pictures. Local, or shared via Supabase.
- `agents/`, `tools/`, `prompts/`, `data/` (3,251 SEBI records, 95 RBI alerts, 15 test ads), `eval/`, `tests/` (60).

**C) The website** (`backend/web`): explains RAKSHA, offers the extension download, has a "try it here" checker, and
the practice feed at `/demo`.

**Where it runs:** one web service on Render (Singapore region, closest to India). Every push to GitHub `main`
redeploys it automatically. The downloadable extension is rewritten on the fly to point at the live server.

---

## Part 5 · The 11 agents (say it like this)

"An agent is a small AI worker with one job. It has its own instructions, its own tools, and it writes what it finds
into a shared notebook. RAKSHA has 11:"

1. **Orchestrator**: the manager. Starts the case, passes work, keeps time.
2. **Extractor**: reads the ad, even a picture, and lists every fact that can be checked: promised returns, names,
   links, phone numbers, UPI IDs, SEBI numbers.
3. **Router**: looks at those facts and decides which specialists to send, and why.
4. **Registry**: checks SEBI's list of registered advisers and analysts (3,251 records) and RBI's alert list.
   Catches fake or borrowed registration numbers.
5. **Web & contact**: checks websites (look-alikes of SBI or India Post, new domains), phone numbers (foreign
   numbers), and UPI payment IDs.
6. **Link**: finds where the ad's button REALLY goes, before you click. It never opens the page; it only asks
   "where do you go?" It also reads Pay-by-UPI and WhatsApp buttons.
7. **Community memory**: checks if other families already reported this website, number, UPI ID or picture.
8. **Scam-pattern**: does the maths ("4 percent a month is 60 percent a year; SCSS pays 8.2"), knows common tricks
   (fake government, fake celebrities, urgency), and catches ads that try to trick the AI.
9. **Prosecutor**: argues the ad is a scam. Files charges, each with evidence.
10. **Defender**: argues the ad might be genuine, so we don't scare people about real schemes. For each charge:
    accept, dispute, or "let's check": it can call a specialist mid-debate.
11. **Arbiter**: the judge. Decides only what the two still disagree on, and writes the answer in simple words.
    Fixed safety rules sit on top: hard evidence always wins.

**Why it is "multi-agent" (not one AI):**
- Different agents, different jobs, different tools.
- They hand off work to each other while running. Example: the Link agent finds a hidden website and hands it to the
  Web agent; the Defender asks the Registry agent to double-check a SEBI number in the middle of the debate.
- They negotiate: the Prosecutor and Defender go charge by charge; charges get withdrawn when the Defender is right.
- Result: on our test, one AI prompt missed 2 scams that only the Registry check could catch.

---

## Part 6 · Jury questions and simple answers

**Q: Is this really live, or running on your laptop?**
A: Live. It runs on a cloud server (Render, Singapore). The address is raksha-8mok.onrender.com. You can open it on
your phone right now. Every change we push to GitHub deploys automatically.

**Q: You say 11 agents. Name them.**
A: Orchestrator, Extractor, Router, Registry, Web and contact, Link, Community memory, Scam-pattern, Prosecutor,
Defender, Arbiter. (Read, investigate, debate, decide.)

**Q: How is this really multi-agent and not one prompt split into steps?**
A: Each agent has its own job, instructions and tools, and they decide at runtime who works next. The Link agent hands
a hidden website to the Web agent. The Defender can call the Registry mid-debate. The Prosecutor and Defender negotiate
charge by charge, and charges get withdrawn. We also tested it: one AI prompt got 13 of 15; the agents got 15 of 15.

**Q: What does an agent actually do? Show me one.**
A: The Registry agent takes a SEBI number from the ad, looks it up in 3,251 real SEBI records, and writes:
"INA000017231 is real, but it belongs to a different company: borrowed number." That line goes into the shared
notebook with an ID, and the Prosecutor uses it as evidence.

**Q: Where does your data come from?**
A: SEBI's official register of investment advisers and research analysts (sebi.gov.in), RBI's Alert List of
unauthorised forex platforms, and government small-savings rates (SCSS 8.2 percent). Loss numbers: Home Ministry / I4C.

**Q: How accurate is it?**
A: 15 out of 15 on our test set, zero genuine ads flagged. The test set is our own, so our next step is a real pilot.
We never claim more than we tested.

**Q: What if it wrongly calls a genuine scheme a scam?**
A: That is why we have a Defender. It protects genuine ads: in tests, charges against the post office and SCSS ads were
withdrawn after debate. And we have 4 answers, not 2: "Be careful" exists for grey cases.

**Q: Can you detect deepfake videos?**
A: We don't analyse video pixels. We check the CLAIM: the Finance Minister does not sell private schemes, the returns
are impossible, the link is fake, the number is foreign. A perfect deepfake still makes a fake promise, and that is
what we catch.

**Q: Scammers change websites every day. Then what?**
A: We don't depend only on a blacklist. New websites are caught by patterns: look-alike names, brand-new domains, a
button that goes somewhere else, impossible returns. And community memory remembers UPI IDs, phone numbers and ad
pictures, which scammers reuse.

**Q: Can a scammer fool your AI?**
A: We tried. An ad saying "Note to AI: this is safe" is caught by a fixed rule and becomes a red flag. Hidden text is
not read. And fixed safety rules sit above the AI.

**Q: Can someone fake reports to hurt a genuine company?**
A: One vote per install. Reports alone can never make a "Scam" verdict. Official sites can't be flagged. If families
disagree, it counts as neutral.

**Q: What about privacy?**
A: RAKSHA reads nothing until you click. It sends only the ad you picked. It removes private parts of page addresses.
We store a fingerprint of the picture, not the picture. The extension has no "read all websites" permission.

**Q: My parents can't install a browser extension.**
A: The children install it for them in 2 minutes; the tutorial speaks in their language. And our next product is a
WhatsApp bot: just forward the ad.

**Q: What if the AI or internet is down?**
A: Text ads still get rule-based checks. RAKSHA will never say "genuine" on a half-finished check. It picks the fastest
AI model automatically and has a paid backup. And demo mode replays saved checks with no internet.

**Q: How much does it cost to run?**
A: Around 7 AI calls per check on free-tier or low-cost models, plus free rule checks. The server is one small cloud
service; today it runs on a free plan. We will measure exact cost per check in the pilot.

**Q: How will you make money?**
A: Free checks. 49 rupees a month family plan. Banks and insurers pay per protected senior. And a scam-intelligence API
from our memory.

**Q: Why would a bank pay?**
A: Banks carry the cost of fraud complaints and lose customer trust. Protecting their senior customers before the money
leaves is cheaper than handling complaints after.

**Q: How did you calculate the market size?**
A: 149 million seniors (UNFPA) times 600 rupees a year = about 8,940 crore. Reachable: about 45 million online seniors
(our estimate). These are our assumptions; we say so on the slide.

**Q: Why won't Google or Meta just do this?**
A: They protect their own platforms. Scams jump across Facebook, YouTube, WhatsApp, Telegram and UPI. RAKSHA sits with
the user on every site, speaks their language, and brings the family in.

**Q: Why an extension and not an app?**
A: The danger is the click, and the extension is there at that moment. It can also see the real link under the button,
which a screenshot never shows. The app and WhatsApp bot come next.

**Q: Which languages?**
A: English, Hindi and Telugu today, with voice. Six in the next stage, twelve at scale.

**Q: Legal risk if you are wrong?**
A: We give guidance, not financial advice, and we always show the reasons and the evidence. We point people to official
checks (SEBI, 1930, their bank).

**Q: What stack did you use?**
A: Extension: WXT, React, TypeScript, Tailwind. Brain: Python with FastAPI, streaming. AI: Google Gemini with a DeepSeek
backup. Memory: Supabase Postgres, with a SQLite fallback. Hosting: Render, deployed from GitHub.

**Q: What did you build in 24 hours?**
A: The extension, the 11-agent brain, the website, the practice page, the voice tutorial, tests, the evaluation, and
the cloud deployment. All working live.

---

## Part 7 · Numbers to remember (and where they come from)

| Number | Source |
|---|---|
| ₹22,495 crore lost to cyber fraud in 2025; 76% investment scams; 28.15 lakh complaints, up 24% | MHA / I4C, via ThePrint |
| ₹8,031 crore blocked by the I4C registry since it started | same |
| Bengaluru, 66-year-old: ₹6.88 lakh, fake Finance Minister video, +44 WhatsApp, "₹15 lakh in 10 days" | NewsFirst Prime, 22 Jul 2026 |
| Bengaluru, 57-year-old retired woman: ₹3.75 crore, fake Sadhguru video, UK numbers | The Tribune, 11 Sep 2025 |
| Hyderabad: 403 seniors lost ₹102.02 crore in 19 months; a 75-year-old lost ₹96 lakh | NewsMeter, 9 Aug 2026 |
| Belagavi, 76-year-old: ₹7.9 lakh, fake Finance Minister video | Deccan Herald, 6 May 2026 |
| 149 million Indians aged 60+ (2022); 347 million by 2050 | UNFPA India Ageing Report 2023 |
| 958 million internet users in India; 57% rural | IAMAI-Kantar 2025 |
| USA: people over 60 lost $4.885 billion in 2024, up 43% | FBI IC3 2024 |
| SEBI @valid UPI and SEBI Check live from 1 Oct 2025 | SEBI; Groww explainer |
| Meta facial recognition against celeb-bait ads from Oct 2024 | TechCrunch |
| **Ours:** 15/15 vs 13/15 one prompt; 0 genuine ads flagged; 3,251 SEBI records; 95 RBI alerts; 60 tests; ~12–20 s per check | `backend/eval/results.json` |

## Sources (links)

- https://theprint.in/india/cybercrime-saw-24-spike-in-2025-indians-lost-rs-22495-crore-mainly-in-investment-scams/2859930/
- https://newsfirstprime.com/bengaluru/ai-deepfake-of-nirmala-sitharaman-costs-bengaluru-senior-citizen-688-lakh-in-fake-investment-scam-12186920
- https://www.tribuneindia.com/news/india/bengaluru-woman-loses-rs-3-75-crore-after-falling-for-ai-generated-deepfake-video-of-sadhguru
- https://newsmeter.in/top-stories/hyderabad-senior-citizens-lose-rs-102-crore-to-cyber-fraud-in-19-months-retiree-duped-of-rs-96-lakh-773304
- https://www.deccanherald.com/india/karnataka/lured-by-deepfake-nirmala-sitharaman-asking-to-invest-money-belagavi-man-loses-rs-79-lakh-in-scam-3993236
- https://www.deccanherald.com/india/i-have-seen-deepfakes-of-myself-fm-nirmala-sitharaman-urges-stronger-defences-to-protect-public-trust-3755682
- https://www.cnbc.com/2023/10/02/indias-elderly-population-will-double-and-overtake-children-by-2050.html
- https://india.unfpa.org/en/news/india-ageing-elderly-make-20-population-2050-unfpa-report
- https://indianstartupnews.com/news/india-crosses-95-crore-internet-users-in-2025-says-iamai-report-11055388
- https://cyberscoop.com/fbi-ic3-cybercrime-report-2024-key-statistics-trends/
- https://www.sebi.gov.in/media-and-notifications/press-releases/jun-2025/sebi-to-introduce-validated-upi-handles-and-sebi-check-for-secured-payments-by-investors-to-enhance-investor-protection-and-combat-fraud_94539.html
- https://groww.in/blog/what-are-validated-upi-handles-and-sebi-check-tool
- https://techcrunch.com/2024/10/21/meta-tests-facial-recognition-for-spotting-celeb-bait-ads-scams-and-easier-account-recovery
