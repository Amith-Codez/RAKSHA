import { createStage } from "./stage.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const store = { get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
                set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

const AG = {
  orchestrator: { n: "Orchestrator", r: "runs the investigation", c: "#6B4DFF", i: "O" },
  extractor: { n: "Extractor", r: "reads the ad", c: "#7C66FF", i: "Ex" },
  router: { n: "Router", r: "plans who checks what", c: "#8E80D9", i: "Ro" },
  registry: { n: "Registry agent", r: "checks SEBI & RBI records", c: "#9A4DF0", i: "Rg" },
  web: { n: "Web & contact agent", r: "checks links & phone numbers", c: "#2E97E6", i: "W" },
  pattern: { n: "Scam-pattern agent", r: "knows retiree scams", c: "#E09A12", i: "P" },
  prosecutor: { n: "Prosecutor", r: "argues it's a fraud", c: "#E11D48", i: "⚖" },
  defender: { n: "Defender", r: "argues it's genuine", c: "#10B981", i: "🛡" },
  arbiter: { n: "Arbiter", r: "gives the verdict", c: "#1A1446", i: "A" },
  blackboard: { n: "Blackboard", r: "", c: "#6B4DFF", i: "B" }, user: { n: "You", r: "", c: "#1A1446", i: "U" },
};
const WORKING = {
  extractor: "Extractor is reading the ad…", router: "Router is planning the investigation…",
  registry: "Registry agent is checking 3,251 SEBI records and 95 RBI alerts…", web: "Web & contact agent is checking links and numbers…",
  pattern: "Scam-pattern agent is comparing this with known scams…", prosecutor: "Prosecutor is drafting charges…",
  defender: "Defender is answering the charges…", arbiter: "Arbiter is weighing everything…",
};
const T = {
  en: { word: { FRAUD: "SCAM", SUSPICIOUS: "CHECK FIRST", LIKELY_SAFE: "LOOKS LEGIT" }, todo: "What to do now", aimed: "Aimed at retirees",
        charges: "Charges", proven: "proven", dropped: "dropped after debate", sheet: "The charge sheet", risk: "risk score",
        wa: "Send to family on WhatsApp", copy: "Copy complaint for 1930", again: "Check another ad",
        steps: { FRAUD: ["Right now", "Report it", "If you paid"], SUSPICIOUS: ["Hold on", "Verify", "Stay safe"], LIKELY_SAFE: ["Go ahead", "Double-check", "Stay alert"] },
        agreed: "Prosecutor and Defender agreed on every charge", settled: (n) => `The Arbiter settled ${n} contested charge${n > 1 ? "s" : ""}` },
  hi: { word: { FRAUD: "धोखा", SUSPICIOUS: "पहले जाँचें", LIKELY_SAFE: "असली लगता है" }, todo: "अब क्या करें", aimed: "सेवानिवृत्त लोगों को निशाना",
        charges: "आरोप", proven: "साबित", dropped: "बहस के बाद हटाए गए", sheet: "आरोप पत्र", risk: "जोखिम",
        wa: "परिवार को WhatsApp पर भेजें", copy: "1930 के लिए शिकायत कॉपी करें", again: "दूसरा विज्ञापन जाँचें",
        steps: { FRAUD: ["अभी", "शिकायत करें", "अगर पैसे भेज दिए"], SUSPICIOUS: ["रुकिए", "जाँचें", "सावधान रहें"], LIKELY_SAFE: ["आगे बढ़ें", "दोबारा जाँचें", "सतर्क रहें"] },
        agreed: "अभियोजक और बचाव पक्ष हर आरोप पर सहमत हुए", settled: (n) => `मध्यस्थ ने ${n} विवादित आरोपों पर फ़ैसला किया` },
};
const STANCE = { ACCEPTED: ["accepts", "accept"], DISPUTED: ["disputes", "dispute"], CHECKED: ["asks for a check", "check"],
                 CONTESTED: ["contests", "dispute"], WITHDRAWN: ["withdraws", "withdraw"], MAINTAINED: ["maintains", "maintain"],
                 UPHELD: ["upholds", "upheld"], DISMISSED: ["dismisses", "dismissed"] };

const state = { lang: store.get("lang", "en"), samples: [], selected: null, pane: "samples", image: null, mime: "image/png",
                run: null, running: false, events: 0, ai: true };

// ---------------- stage ----------------
const stageEl = $("#stage");
const stage = createStage(stageEl, $("#labels"));

function stageFor(m) {
  const { type: t, from: f, to } = m;
  if (t === "handoff") stage.beam(f, to);
  else if (["evidence", "claims", "plan"].includes(t)) stage.beam(f, "blackboard");
  else if (["argument", "charge", "response", "ruling", "concession"].includes(t)) stage.beam(f, to === "arbiter" ? "arbiter" : to);
  else if (t === "round") { stage.activate("prosecutor"); stage.activate("defender"); }
  else if (t === "verdict") { stage.activate("arbiter"); stage.setMood(m.data?.label); }
  else stage.activate(f);
}

// ---------------- status, samples, proof ----------------
async function init() {
  setLang(state.lang);
  $("#simple").checked = store.get("simple", false);
  document.body.classList.toggle("simple", $("#simple").checked);
  try {
    const st = await (await fetch("/api/status")).json();
    state.ai = st.ai_available;
    $("#status").classList.toggle("off", !st.ai_available);
    $("#status span").textContent = st.ai_available ? `AI online · ${st.keys} key${st.keys === 1 ? "" : "s"}` : "Offline demo mode";
    if (!st.ai_available) $("#offline").checked = true;
    $("#stage-count").textContent = `${st.registry.sebi_records.toLocaleString("en-IN")} SEBI records · ${st.registry.rbi_alerts} RBI alerts`;
  } catch { $("#status").classList.add("off"); $("#status span").textContent = "Server offline"; }
  try {
    state.samples = (await (await fetch("/api/samples")).json()).ads;
    renderChips(false);
  } catch { $("#chips").innerHTML = '<p class="helper err">Could not load the sample ads. Is the server running?</p>'; }
  loadProof();
}

const KIND = { scam: "scam pattern", genuine: "genuine", grey: "tricky", hard: "tricky" };
function renderChips(all) {
  const list = all ? state.samples : state.samples.slice(0, 7);
  $("#chips").innerHTML = list.map((a) => `<button type="button" class="chip" data-id="${esc(a.id)}" aria-pressed="${state.selected === a.id}">
      <span class="k ${esc(a.category)}">${esc(KIND[a.category] || a.category)}</span>${esc(a.title)}</button>`).join("")
    + (all ? "" : `<button type="button" class="chip" id="more">+${state.samples.length - list.length} more</button>`);
  $$(".chip[data-id]").forEach((b) => b.addEventListener("click", () => selectSample(b.dataset.id)));
  $("#more")?.addEventListener("click", () => renderChips(true));
  if (!state.selected && state.samples[0]) selectSample(state.samples[0].id);
}
function selectSample(id) {
  state.selected = id;
  $$(".chip[data-id]").forEach((b) => b.setAttribute("aria-pressed", b.dataset.id === id));
  const a = state.samples.find((x) => x.id === id);
  $("#preview").hidden = !a;
  if (a) $("#preview").textContent = a.text;
  helper("");
}

async function loadProof() {
  try {
    const r = await fetch("/api/results");
    if (!r.ok) throw new Error();
    const res = await r.json();
    const n = res.rows.length, missed = res.rows.filter((x) => x.agents_ok && !x.baseline_ok);
    $("#proof-sub").textContent = `Every sample ad was checked twice on ${res.run_at}: once by RAKSHA's agents, once by a single AI prompt that got the same scam knowledge but no registries and no debate. We wrote these ads ourselves, so treat this as a demo benchmark.`;
    $("#proof-cards").innerHTML = `
      <div class="card big us"><div class="n">${res.agents_correct}/${n}</div><p>correct with RAKSHA's agent team, and ${res.agents_false_alarms} genuine ads wrongly flagged</p></div>
      <div class="card big them"><div class="n">${res.baseline_correct}/${n}</div><p>correct with one AI prompt</p></div>
      <div class="card miss"><h3>What the single prompt missed</h3><ul>${missed.map((x) => `<li>${esc(x.title)}: it said <b>${esc(x.baseline_label.replace("_", " ").toLowerCase())}</b></li>`).join("") || "<li>Nothing this time</li>"}</ul>
      <p style="margin:0;color:rgba(255,255,255,.7);font-size:15px">Only a registry lookup reveals these frauds. That's the job of the Registry agent.</p></div>`;
    $("#proof-table").hidden = false;
    $("#proof-table").innerHTML = `<thead><tr><th>Ad</th><th>Should be</th><th>Agents</th><th>One prompt</th></tr></thead><tbody>${res.rows.map((x) => `
      <tr><td>${esc(x.title)}</td><td>${esc(x.expected.replace("_", " "))}</td>
      <td class="${x.agents_ok ? "ok" : "no"}">${x.agents_ok ? "✓" : "✗"} ${esc(x.agents_label.replace("_", " "))}</td>
      <td class="${x.baseline_ok ? "ok" : "no"}">${x.baseline_ok ? "✓" : "✗"} ${esc(x.baseline_label.replace("_", " "))}</td></tr>`).join("")}</tbody>`;
  } catch { $("#proof-sub").textContent = "Run python -m eval.run_eval once to fill this section."; }
}

// ---------------- inputs ----------------
$$(".tab").forEach((t) => t.addEventListener("click", () => {
  state.pane = t.dataset.pane;
  $$(".tab").forEach((x) => x.setAttribute("aria-selected", x === t));
  $$(".pane").forEach((p) => { p.hidden = p.dataset.pane !== state.pane; });
  helper("");
}));
const drop = $("#drop"), file = $("#file");
drop.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } });
["dragenter", "dragover"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", (e) => e.dataTransfer.files[0] && takeImage(e.dataTransfer.files[0]));
file.addEventListener("change", () => file.files[0] && takeImage(file.files[0]));
function takeImage(f) {
  if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return helper("That file isn't a PNG, JPG or WebP image.", true);
  if (f.size > 6 * 1024 * 1024) return helper("That screenshot is over 6 MB. Crop it and try again.", true);
  const rd = new FileReader();
  rd.onload = () => { state.image = String(rd.result).split(",")[1]; state.mime = f.type;
                      $("#shot-preview").innerHTML = `<img src="${rd.result}" alt="Your screenshot">`; helper(""); };
  rd.readAsDataURL(f);
}
function helper(msg, err = false) { const h = $("#helper"); h.textContent = msg; h.classList.toggle("err", err); }
$("#simple").addEventListener("change", (e) => { document.body.classList.toggle("simple", e.target.checked); store.set("simple", e.target.checked); });
$$(".seg button").forEach((b) => b.addEventListener("click", () => setLang(b.dataset.lang)));
function setLang(l) {
  state.lang = l; store.set("lang", l);
  document.documentElement.lang = l === "hi" ? "hi" : "en";
  $$(".seg button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.lang === l));
  if (state.run) renderVerdict(state.run, false);
}

// ---------------- run ----------------
$("#go").addEventListener("click", start);
async function start(opts = {}) {
  if (state.running) return;
  const offline = opts.offline ?? $("#offline").checked;
  const body = { offline };
  if (state.pane === "samples") {
    if (!state.selected) return helper("Pick a sample ad first.", true);
    body.sample_id = state.selected;
  } else if (state.pane === "paste") {
    const txt = $("#adtext").value.trim();
    if (txt.length < 15) { const ta = $("#adtext"); ta.classList.remove("shake"); void ta.offsetWidth; ta.classList.add("shake");
                           return helper("Paste the full ad first. Include any links, numbers or promises it makes.", true); }
    if (offline) return helper("Offline demo only works with the sample ads. Switch it off to check your own text.", true);
    body.text = txt;
  } else {
    if (!state.image) return helper("Choose a screenshot first.", true);
    if (offline) return helper("Offline demo only works with the sample ads.", true);
    body.image_b64 = state.image; body.mime = state.mime;
  }
  helper("");
  setRunning(true);
  resetInvestigation();
  let res;
  try {
    res = await fetch("/api/check", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    setRunning(false);
    return showError("Can't reach the RAKSHA server", "Check that it is still running on this laptop, then try again.");
  }
  if (!res.ok) {
    setRunning(false);
    let detail = "Something went wrong.";
    try { detail = (await res.json()).detail; } catch {}
    return showError(res.status === 404 ? "No saved run for this ad" : "We couldn't check that", detail);
  }
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line) handle(JSON.parse(line));
      }
    }
  } catch {
    showError("The connection dropped", "The investigation stopped halfway. Try again, or switch on the offline demo.");
  }
  setRunning(false);
}

function setRunning(on) {
  state.running = on;
  const b = $("#go");
  b.disabled = on;
  b.innerHTML = on ? '<span class="spin" aria-hidden="true"></span>Agents on it…' : "Check this ad";
  $("#live-dot").hidden = !on;
  $("#stage-status").textContent = on ? "Live investigation" : state.run ? "Investigation complete" : "11 agents standing by";
  if (!on) $("#typing").hidden = true;
}

function resetInvestigation() {
  state.run = null; state.events = 0;
  $("#investigation").hidden = false;
  $("#feed").innerHTML = ""; $("#result-slot").innerHTML = ""; $("#feed-count").textContent = "";
  $$(".step").forEach((s) => s.classList.remove("on", "done"));
  step("read");
  stage.reset();
  stage.moveTo($("#stage-inv"));
  typing("extractor");
  $("#investigation").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
}

const ORDER = ["read", "investigate", "debate", "verdict"];
function step(name) {
  const k = ORDER.indexOf(name);
  $$(".step").forEach((s) => { const j = ORDER.indexOf(s.dataset.step);
    s.classList.toggle("done", j < k); s.classList.toggle("on", j === k); });
}
function typing(agent) {
  const t = WORKING[agent];
  $("#typing").hidden = !t || !state.running;
  if (t) $("#typing-text").textContent = t;
}

function handle(msg) {
  if (msg.type === "event") {
    const m = msg.event;
    state.events++;
    $("#feed-count").textContent = `${state.events} step${state.events === 1 ? "" : "s"}`;
    stageFor(m);
    if (m.type === "claims") step("investigate");
    if (m.type === "handoff" && m.to === "prosecutor") step("debate");
    if (m.type === "handoff") typing(m.to);
    if (m.type === "charge") typing("defender");
    if (m.type === "round") typing("arbiter");
    if (m.type === "verdict") { step("verdict"); $$(".step").forEach((s) => s.classList.replace("on", "done")); }
    const html = eventHTML(m);
    if (html) $("#feed").insertAdjacentHTML("beforeend", html);
  } else if (msg.type === "done") {
    state.run = msg.run;
    renderVerdict(msg.run, true);
  } else if (msg.type === "error") {
    showError("The AI is busy right now", msg.message);
  }
}

// ---------------- rendering ----------------
const av = (id) => { const a = AG[id] || { c: "#6B4DFF", i: "?" }; return `<span class="av" style="background:${a.c}">${esc(a.i)}</span>`; };
const nm = (id) => (AG[id] || { n: id }).n;
const tags = (ids) => (ids || []).map((e) => `<span class="tag">${esc(e)}</span>`).join(" ");

function eventHTML(m) {
  const t = m.type, f = m.from, d = m.data || {}, txt = esc(m.text);
  if (t === "handoff") return `<div class="ev handoff"><span class="arrow">↳</span><span><span class="who">${av(f)}${esc(nm(f))}</span> → <span class="who">${av(m.to)}${esc(nm(m.to))}</span>: ${txt}</span></div>`;
  if (t === "note") return `<div class="ev note">${esc(nm(f))}: ${txt}</div>`;
  if (t === "guardrail") return `<div class="ev guard">Safety rule: ${txt}</div>`;
  if (t === "evidence") {
    const s = d.supports || "NEUTRAL", cls = { FRAUD: "fraud", LEGIT: "legit" }[s] || "neutral";
    const lab = { FRAUD: "points to fraud", LEGIT: "points to genuine" }[s] || "neutral";
    return `<div class="ev msg evd" style="--c:${(AG[f] || {}).c}"><div class="top"><span class="who">${av(f)}${esc(nm(f))}</span>
      <span class="tag">${esc(d.id)}</span><span class="pill ${cls}">${lab}</span><span class="dots" title="strength">${"●".repeat(d.strength || 1)}${"○".repeat(3 - (d.strength || 1))}</span></div>
      <div class="txt">${txt}</div></div>`;
  }
  if (t === "argument") {
    const p = d.fraud_probability ?? 50;
    return `<div class="ev debate ${f}"><div class="msg"><div class="top"><span class="who">${av(f)}${esc(nm(f))}</span>
      <span class="prob">fraud likelihood <b style="--p:${p}%"></b>${p}%</span></div><div class="txt">${txt}</div></div></div>`;
  }
  if (t === "charge") {
    const sev = d.severity || 1;
    return `<div class="ev debate prosecutor"><div class="msg"><div class="top"><span class="cid">${esc(d.charge_id)}</span>
      <span class="who">Prosecutor files a charge</span><span class="dots" title="severity">${"●".repeat(sev)}${"○".repeat(3 - sev)}</span> ${tags(m.evidence_ids)}</div>
      <div class="txt">${txt}</div></div></div>`;
  }
  if (t === "response" || t === "ruling") {
    const [verb, cls] = STANCE[d.stance] || [String(d.stance || "").toLowerCase(), ""];
    if (f === "arbiter") return `<div class="ev msg evd" style="--c:#1A1446"><div class="top"><span class="cid">${esc(d.charge_id)}</span>
      <span class="who">${av("arbiter")}Arbiter ${esc(verb)}</span><span class="stance ${cls}">${esc(d.stance)}</span></div><div class="txt">${txt}</div></div>`;
    const side = f === "defender" ? "defender" : "prosecutor";
    return `<div class="ev debate ${side}"><div class="msg"><div class="top"><span class="cid">${esc(d.charge_id)}</span>
      <span class="who">${av(f)}${esc(nm(f))} ${esc(verb)}</span><span class="stance ${cls}">${esc(verb)}</span> ${tags(m.evidence_ids)}</div>
      <div class="txt">${txt}</div></div></div>`;
  }
  if (t === "round") {
    const p = d.prosecutor ?? 0, df = d.defender ?? 0, lo = Math.min(p, df), hi = Math.max(p, df);
    return `<div class="ev round"><div class="t">Round ${d.round}: ${d.gap} points apart${d.gap <= 20 ? ", close to agreement" : ""}</div>
      <div class="track"><div class="band" style="left:${lo}%;width:${Math.max(hi - lo, 1)}%"></div>
      <div class="d" style="left:${p}%;background:#E11D48"></div><div class="d" style="left:${df}%;background:#10B981"></div>
      <div class="l" style="left:${p}%;top:-22px;color:#E0244A">Prosecutor ${p}%</div><div class="l" style="left:${df}%;top:14px;color:#08865E">Defender ${df}%</div></div></div>`;
  }
  if (t === "verdict") return `<div class="ev msg evd" style="--c:#1A1446"><div class="top"><span class="who">${av("arbiter")}Arbiter</span><span class="role">final verdict</span></div><div class="txt">${txt}</div></div>`;
  return `<div class="ev msg"><div class="top"><span class="who">${av(f)}${esc(nm(f))}</span><span class="role">${esc((AG[f] || {}).r || "")}</span></div><div class="txt">${txt}</div></div>`;
}

function gauge(risk, color, label) {
  const r = 100, c = Math.PI * r;
  return `<div class="gauge"><svg viewBox="-120 -118 240 140" role="img" aria-label="Risk ${risk} out of 100">
    <path d="M -100 0 A 100 100 0 0 1 100 0" fill="none" stroke="#E7E2FF" stroke-width="18" stroke-linecap="round"/>
    <path id="garc" d="M -100 0 A 100 100 0 0 1 100 0" fill="none" stroke="${color}" stroke-width="18" stroke-linecap="round"
          stroke-dasharray="${c}" stroke-dashoffset="${c}" style="transition: stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)"/>
    <text class="num" x="0" y="-18" text-anchor="middle" id="gnum">0</text>
    <text class="cap" x="0" y="8" text-anchor="middle">${esc(label)} / 100</text></svg></div>`;
}

function renderVerdict(run, animate) {
  const v = run.verdict, L = T[state.lang], hi = state.lang === "hi";
  const color = { FRAUD: "#E11D48", SUSPICIOUS: "#FFB224", LIKELY_SAFE: "#10B981" }[v.label];
  const headline = (hi && v.headline_hi) || v.headline;
  const reasons = (hi && v.reasons_hi?.length ? v.reasons_hi : v.reasons) || [];
  const todo = (hi ? v.what_to_do_hi : v.what_to_do) || [];
  const cs = v.charges_summary || {}, proven = (cs.ACCEPTED || 0) + (cs.UPHELD || 0), dropped = (cs.WITHDRAWN || 0) + (cs.DISMISSED || 0);
  const settled = (cs.UPHELD || 0) + (cs.DISMISSED || 0);
  const facts = [];
  if (Number.isInteger(v.retiree_targeting)) facts.push(`${L.aimed}: <b>${v.retiree_targeting}/100</b>${v.retiree_hooks?.[0] ? ` (“${esc(v.retiree_hooks[0])}”)` : ""}`);
  if (proven || dropped) facts.push(`${L.charges}: <b>${proven}</b> ${L.proven}, <b>${dropped}</b> ${L.dropped}`);
  if (run.charges?.length) facts.push(settled ? L.settled(settled) : L.agreed);
  const titles = L.steps[v.label];
  const sheet = (run.charges || []).map((c) => {
    const st = ["ACCEPTED", "UPHELD"].includes(c.status) ? ["proven", "PROVEN"] : ["WITHDRAWN", "DISMISSED"].includes(c.status) ? ["dropped", "DROPPED"] : ["open", "OPEN"];
    const last = (c.history?.at(-1)?.[1] || "").replace(/^[a-z]+:\s*/, "");
    return `<div class="charge"><span class="cid">${esc(c.id)}</span><div>${esc(c.charge)}${last ? `<div class="why">${esc(last)}</div>` : ""}</div>
            <span class="cstamp ${st[0]}">${st[1]}</span></div>`;
  }).join("");
  $("#result-slot").innerHTML = `
    <div class="verdict ${v.label}" id="verdict" tabindex="-1">
      <div class="v-grid"><div>
        <span class="stamp">${esc(L.word[v.label])}</span>
        <h2>${esc(headline)}</h2>
        <ol class="reasons">${reasons.map((r) => `<li><span>${esc(r)}</span></li>`).join("")}</ol>
        <div class="facts">${facts.map((f) => `<span class="fact">${f}</span>`).join("")}</div>
      </div>${gauge(v.risk, color, L.risk)}</div>
      <div class="todo">${todo.map((t, i) => `<div><b>${esc(titles[i] || "")}</b>${esc(t)}</div>`).join("")}</div>
      <div class="v-actions">
        <a class="btn btn-wa" id="wa" target="_blank" rel="noopener">${esc(L.wa)}</a>
        ${v.label !== "LIKELY_SAFE" ? `<button class="btn btn-ghost" id="copy" type="button">${esc(L.copy)}</button>` : ""}
        <button class="btn btn-ghost" id="again" type="button">${esc(L.again)}</button>
      </div>
      ${sheet ? `<div class="sheet simple-hide"><h3>${esc(L.sheet)}</h3>${sheet}</div>` : ""}
    </div>`;
  $("#wa").href = "https://wa.me/?text=" + encodeURIComponent(shareText(run));
  $("#copy")?.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(complaint(run)); toast("Complaint copied. Paste it at cybercrime.gov.in"); }
    catch { toast("Couldn't copy automatically. Select the text manually."); }
  });
  $("#again").addEventListener("click", () => { $("#check").scrollIntoView({ behavior: "smooth" }); stage.reset(); });
  requestAnimationFrame(() => {
    const arc = $("#garc"), num = $("#gnum"), c = Math.PI * 100;
    arc.style.strokeDashoffset = String(c * (1 - v.risk / 100));
    if (!animate) { num.textContent = v.risk; return; }
    const t0 = performance.now();
    const tick = (now) => { const k = Math.min((now - t0) / 1100, 1); num.textContent = Math.round(v.risk * (1 - Math.pow(1 - k, 3)));
                            if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    $("#verdict").scrollIntoView({ behavior: "smooth", block: "start" });
    $("#verdict").focus({ preventScroll: true });
  });
  $("#stage-status").textContent = "Investigation complete";
}

function showError(title, message) {
  $("#investigation").hidden = false;
  $("#typing").hidden = true;
  const canReplay = state.pane === "samples" && state.selected;
  $("#result-slot").innerHTML = `<div class="error-card" role="alert"><h3>${esc(title)}</h3><p style="margin:0 0 16px">${esc(message)}</p>
    <div class="v-actions"><button class="btn btn-primary" id="retry" type="button">Try again</button>
    ${canReplay ? '<button class="btn btn-ghost" id="replay" type="button">Replay the saved demo</button>' : ""}</div></div>`;
  $("#retry").addEventListener("click", () => start());
  $("#replay")?.addEventListener("click", () => start({ offline: true }));
}

function shareText(run) {
  const v = run.verdict, hi = state.lang === "hi";
  const reasons = (hi && v.reasons_hi?.length ? v.reasons_hi : v.reasons) || [];
  return `RAKSHA checked this investment ad: ${(hi && v.headline_hi) || v.headline}\n\n${reasons.map((r, i) => `${i + 1}. ${r}`).join("\n")}\n\n`
    + (v.label !== "LIKELY_SAFE" ? "Don't pay. If money was sent, call 1930 right away." : "Invest only through the official channel.");
}

function complaint(run) {
  const c = run.claims || {}, v = run.verdict || {};
  const fraud = (run.evidence || []).filter((e) => e.supports === "FRAUD").slice(0, 5).map((e) => `- ${e.finding}`);
  const L = ["Subject: Complaint about a fraudulent investment advertisement targeting senior citizens", "",
             "I want to report an online investment advertisement that appears to be a scam aimed at retired people.",
             `Advertiser / name used: ${c.advertiser || "not stated"}`];
  if (c.people_shown?.length) L.push(`People/institutions shown as endorsing it: ${c.people_shown.join(", ")}`);
  if (c.promised_return) L.push(`Promise made: ${c.promised_return}`);
  for (const [k, lab] of [["links", "Websites/links"], ["phones", "Phone/WhatsApp numbers"], ["emails", "E-mails"],
                          ["upi_ids", "UPI IDs"], ["reg_numbers", "Registration numbers quoted"]])
    if (c[k]?.length) L.push(`${lab}: ${c[k].join(", ")}`);
  if (fraud.length) L.push("", "Why it appears fraudulent (checked by RAKSHA):", ...fraud);
  L.push("", `RAKSHA risk score: ${v.risk}/100`, "", "Full ad text:", run.ad_text || "");
  return L.join("\n");
}

let toastTimer;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toastTimer);
                      toastTimer = setTimeout(() => t.classList.remove("show"), 2600); }

init();
