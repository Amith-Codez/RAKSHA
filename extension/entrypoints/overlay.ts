/**
 * Selection overlay, injected into the current tab ONLY when the user clicks RAKSHA (activeTab).
 * Simplest possible interaction for an older user: hover highlights the ad card under the pointer, one click picks
 * it. Power users can drag a box instead. Esc or Cancel leaves the page untouched.
 *
 * Hardening (jury audit):
 * - closed Shadow DOM + constructable stylesheet → page CSS/CSP can't break or restyle it;
 * - the overlay is removed before the screenshot, so it never appears in it;
 * - text is read only inside the chosen card (fast on huge pages like Facebook) and HIDDEN text is skipped
 *   (white-on-white or 1-px text is a known trick to smuggle instructions to AI checkers);
 * - links, payment (upi:) and phone (tel:) buttons under the box are collected so the Link agent can follow them.
 */
const STR = {
  en: { title: 'Click the ad you want to check', hint: 'or drag a box around it · Esc to cancel', cancel: 'Cancel', pick: 'Check this', small: 'Too small. Click the ad, or drag a bigger box around it.' },
  hi: { title: 'जिस विज्ञापन को जाँचना है उस पर क्लिक करें', hint: 'या उसके चारों ओर बॉक्स बनाइए · Esc से रद्द', cancel: 'रद्द करें', pick: 'इसे जाँचें', small: 'बहुत छोटा है। विज्ञापन पर क्लिक करें या बड़ा बॉक्स बनाइए।' },
  te: { title: 'తనిఖీ చేయాల్సిన ప్రకటనపై క్లిక్ చేయండి', hint: 'లేదా దాని చుట్టూ బాక్స్ గీయండి · Esc తో రద్దు', cancel: 'రద్దు', pick: 'దీన్ని తనిఖీ చేయండి', small: 'చాలా చిన్నది. ప్రకటనపై క్లిక్ చేయండి లేదా పెద్ద బాక్స్ గీయండి.' },
};

type Rect = { x: number; y: number; w: number; h: number };

const CSS = `
  :host { all: initial; }
  .layer, .pill, .toast, .tag, button { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "Helvetica Neue", "Noto Sans", Arial, sans-serif; }
  .pill, .toast { font-size: 16px; font-weight: 600; line-height: 1.4; color: #fff; }
  * { box-sizing: border-box; }
  .layer { position: fixed; inset: 0; cursor: pointer; background: rgba(20,17,49,.34); transition: background .18s;
           -webkit-font-smoothing: antialiased; }
  .layer.drawing { cursor: crosshair; }
  .layer.drawing, .layer.hovering { background: transparent; }
  .box { position: fixed; display: none; border: 3px solid #FFB224; border-radius: 16px; pointer-events: none;
         box-shadow: 0 0 0 100vmax rgba(20,17,49,.46), 0 0 0 7px rgba(255,178,36,.22), 0 0 44px rgba(255,178,36,.5);
         transition: left .12s ease, top .12s ease, width .12s ease, height .12s ease; }
  .box.hover { border-color: #8B6CFF; box-shadow: 0 0 0 100vmax rgba(20,17,49,.28), 0 0 0 7px rgba(139,108,255,.22), 0 0 36px rgba(139,108,255,.45); }
  .box.drawing { transition: none; }
  .tag { position: absolute; left: 50%; bottom: -44px; transform: translateX(-50%); white-space: nowrap; display: none;
         background: #6D4AFF; color: #fff; font: inherit; font-size: 14px; font-weight: 700; line-height: 1; padding: 10px 14px; border-radius: 999px;
         box-shadow: 0 10px 24px -8px rgba(109,74,255,.7); }
  .box.hover .tag { display: block; }
  .box.hover.low .tag { bottom: auto; top: -44px; }
  .pill { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 12px;
          background: rgba(20,17,49,.94); backdrop-filter: blur(12px); color: #fff; padding: 9px 9px 9px 12px; border-radius: 999px;
          box-shadow: 0 20px 50px -14px rgba(0,0,0,.6), inset 0 0 0 1px rgba(255,255,255,.08);
          animation: drop .35s cubic-bezier(.2,.9,.3,1.2); cursor: default; max-width: calc(100vw - 24px); }
  .shield { width: 34px; height: 34px; border-radius: 11px; background: linear-gradient(150deg,#2B1F7A,#6D4AFF); display: grid; place-items: center; flex: none; }
  .txt b { display: block; font-size: 16px; letter-spacing: -.01em; } .txt small { display: block; font-weight: 500; font-size: 13px; opacity: .7; }
  button { all: unset; cursor: pointer; background: rgba(255,255,255,.12); color: #fff; padding: 9px 15px; border-radius: 999px; font: inherit; font-size: 14px; font-weight: 700; }
  button:hover { background: rgba(255,255,255,.22); } button:focus-visible { outline: 3px solid #FFB224; }
  .toast { position: fixed; bottom: 26px; left: 50%; transform: translateX(-50%); background: #E11D48; color: #fff; padding: 11px 16px;
           border-radius: 14px; display: none; font-size: 15px; box-shadow: 0 16px 36px -12px rgba(225,29,72,.6); }
  @keyframes drop { from { opacity: 0; transform: translate(-50%, -14px) scale(.96); } }
  @media (prefers-reduced-motion: reduce) { .pill { animation: none; } .box { transition: none; } }
`;

export default defineUnlistedScript(async () => {
  const w = window as unknown as { __rakshaOverlay?: boolean };
  if (w.__rakshaOverlay) return;
  w.__rakshaOverlay = true;

  const { settings } = await chrome.storage.local.get('settings').catch(() => ({ settings: null }));
  const s = STR[((settings as { lang?: string } | null)?.lang as keyof typeof STR) ?? 'en'] ?? STR.en;

  const host = document.createElement('raksha-overlay');
  host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'closed' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
  } catch {
    const st = document.createElement('style');
    st.textContent = CSS;
    root.appendChild(st);
  }
  const el = (tag: string, cls: string, html = '') => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };
  const layer = el('div', 'layer');
  const box = el('div', 'box', `<span class="tag"></span>`);
  (box.firstChild as HTMLElement).textContent = `✓ ${s.pick}`;
  const pill = el('div', 'pill', `
    <span class="shield"><svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M12 2l8 3v6c0 5-3.4 9.4-8 11-4.6-1.6-8-6-8-11V5l8-3z" fill="#FFB224"/><path d="M8 12l3 3 5-6" stroke="#141131" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
    <span class="txt"><b></b><small></small></span><button type="button"></button>`);
  pill.setAttribute('role', 'dialog');
  pill.setAttribute('aria-live', 'polite');
  pill.querySelector('b')!.textContent = s.title;
  pill.querySelector('small')!.textContent = s.hint;
  const cancelBtn = pill.querySelector('button')!;
  cancelBtn.textContent = s.cancel;
  const toast = el('div', 'toast');
  root.append(layer, box, pill, toast);
  document.documentElement.appendChild(host);

  let start: { x: number; y: number } | null = null;
  let hoverRect: Rect | null = null;
  let hoverEl: Element | null = null;
  let finished = false;

  const show = (r: Rect, mode: 'hover' | 'drawing' | 'final') => {
    Object.assign(box.style, { display: 'block', left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    box.classList.toggle('hover', mode === 'hover');
    box.classList.toggle('drawing', mode === 'drawing');
    box.classList.toggle('low', r.y + r.h > innerHeight - 60);
  };

  const under = (x: number, y: number) => {
    host.style.pointerEvents = 'none';
    const e = document.elementFromPoint(x, y);
    host.style.pointerEvents = '';
    return e;
  };

  const clip = (r: DOMRect): Rect => {
    const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top);
    return { x: x0, y: y0, w: Math.min(innerWidth, r.right) - x0, h: Math.min(innerHeight, r.bottom) - y0 };
  };

  /** The ad "card" under the pointer: a post/article if the site marks one, else the smallest block that
   *  contains a link or picture plus some text, never (almost) the whole page. */
  const cardAt = (x: number, y: number): { rect: Rect; el: Element } | null => {
    const first = under(x, y);
    const area = innerWidth * innerHeight;
    let fallback: Element | null = null;
    for (let n: Element | null = first; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const r = n.getBoundingClientRect();
      if (r.width * r.height > area * 0.85) break;
      if (r.width < 180 || r.height < 90) continue;
      if (n.matches('article, [role="article"], [data-pagelet*="FeedUnit"], [data-raksha-sample]')) return { rect: clip(r), el: n };
      const rich = !!n.querySelector('a[href], img, video, iframe, button') && (n.textContent ?? '').trim().length > 30;
      if (rich && !fallback) fallback = n;
    }
    const f = fallback ?? (first && first !== document.body && first !== document.documentElement ? first : null);
    return f ? { rect: clip(f.getBoundingClientRect()), el: f } : null;
  };

  const close = (msg?: object) => {
    finished = true;
    removeEventListener('keydown', onKey, true);
    removeEventListener('scroll', onScroll, true);
    host.remove();
    w.__rakshaOverlay = false;
    if (msg) chrome.runtime.sendMessage(msg).catch(() => {});
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close({ type: 'raksha:cancel' }); }
  };
  const onScroll = () => { if (!start) { box.style.display = 'none'; hoverRect = null; } };
  addEventListener('keydown', onKey, true);
  addEventListener('scroll', onScroll, true);
  cancelBtn.addEventListener('click', () => close({ type: 'raksha:cancel' }));
  // the page keeps scrolling under the overlay (the ad may be half off-screen)
  layer.addEventListener('wheel', (e) => scrollBy({ top: e.deltaY, left: e.deltaX }), { passive: true });

  layer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    start = { x: e.clientX, y: e.clientY };
    layer.setPointerCapture(e.pointerId);
  });
  layer.addEventListener('pointermove', (e) => {
    if (start) {
      const r = { x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY), w: Math.abs(e.clientX - start.x), h: Math.abs(e.clientY - start.y) };
      if (r.w > 8 || r.h > 8) { layer.classList.add('drawing'); show(r, 'drawing'); }
      return;
    }
    const c = cardAt(e.clientX, e.clientY);
    hoverRect = c?.rect ?? null;
    hoverEl = c?.el ?? null;
    layer.classList.toggle('hovering', !!hoverRect);
    if (hoverRect) show(hoverRect, 'hover'); else box.style.display = 'none';
  });
  layer.addEventListener('pointerup', (e) => {
    if (!start) return;
    const r = { x: Math.min(start.x, e.clientX), y: Math.min(start.y, e.clientY), w: Math.abs(e.clientX - start.x), h: Math.abs(e.clientY - start.y) };
    start = null;
    layer.classList.remove('drawing');
    let pick: Rect | null = r;
    let scope: Element | null = null;
    if (r.w < 8 && r.h < 8) {            // a click, not a drag → the card under the pointer
      const c = cardAt(e.clientX, e.clientY);
      pick = c?.rect ?? hoverRect;
      scope = c?.el ?? hoverEl;
    }
    if (!pick || pick.w < 40 || pick.h < 30) {
      toast.textContent = s.small;
      toast.style.display = 'block';
      setTimeout(() => (toast.style.display = 'none'), 2400);
      return;
    }
    show(pick, 'final');
    finish(pick, scope);
  });

  function finish(r: Rect, scope: Element | null) {
    if (finished) return;
    finished = true;
    const data = collect(r, scope ?? commonAncestor(r));
    setTimeout(() => {                    // a short flash of the final box = "got it" feedback
      close();
      // two frames so the overlay is really gone from the screen before the screenshot
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
        chrome.runtime.sendMessage({
          type: 'raksha:region', rect: r, viewport: { w: innerWidth, h: innerHeight }, ...data,
          pageUrl: location.href, pageTitle: document.title.slice(0, 300),
        }).catch(() => {});
      }, 40)));
    }, 160);
  }

  /** The smallest element that contains the whole box (sampled on a grid): keeps the text scan local and fast. */
  function commonAncestor(r: Rect): Element {
    const pts: Element[] = [];
    for (let i = 1; i <= 3; i++) for (let j = 1; j <= 3; j++) {
      const e = under(r.x + (r.w * i) / 4, r.y + (r.h * j) / 4);
      if (e) pts.push(e);
    }
    if (!pts.length) return document.body;
    let anc: Element | null = pts[0]!;
    while (anc && !pts.every((p) => anc!.contains(p))) anc = anc.parentElement;
    return anc ?? document.body;
  }

  function overlap(a: DOMRect, r: Rect) {
    const x = Math.max(0, Math.min(a.right, r.x + r.w) - Math.max(a.left, r.x));
    const y = Math.max(0, Math.min(a.bottom, r.y + r.h) - Math.max(a.top, r.y));
    return x * y;
  }

  function visible(p: Element) {
    const cs = getComputedStyle(p);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.1) return false;
    if (parseFloat(cs.fontSize) < 7) return false;
    const c = cs.color.match(/[\d.]+/g);
    if (c && c.length === 4 && Number(c[3]) < 0.1) return false;          // transparent text
    return true;
  }

  /** The real links, the visible text and demo-ad ids under the box: no OCR needed for text-based ads. */
  function collect(r: Rect, scope: Element) {
    const links: { href: string; text: string }[] = [];
    const seen = new Set<string>();
    const inScope = scope.querySelectorAll<HTMLAnchorElement>('a[href]');
    const pool = inScope.length ? inScope : document.querySelectorAll<HTMLAnchorElement>('a[href]');
    pool.forEach((a) => {
      if (links.length >= 40 || seen.has(a.href)) return;
      const rects = a.getClientRects();
      if (!rects.length || ![...rects].some((b) => overlap(b, r) > 0)) return;
      seen.add(a.href);
      links.push({ href: a.href, text: (a.innerText || a.getAttribute('aria-label') || a.title || '').trim().replace(/\s+/g, ' ').slice(0, 120) });
    });

    const sampleIds: string[] = [];
    document.querySelectorAll<HTMLElement>('[data-raksha-sample]').forEach((el) => {
      const b = el.getBoundingClientRect();
      const area = b.width * b.height;
      if (area && (overlap(b, r) / area > 0.5 || overlap(b, r) / (r.w * r.h) > 0.6)) sampleIds.push(el.getAttribute('data-raksha-sample')!);
    });

    const parts: string[] = [];
    let total = 0, visited = 0;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p || !n.nodeValue?.trim() || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const range = document.createRange();
    for (let n = walker.nextNode(); n && total < 6000 && visited < 4000; n = walker.nextNode()) {
      visited++;
      range.selectNodeContents(n);
      const b = range.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) continue;
      const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
      if (cx < r.x || cx > r.x + r.w || cy < r.y || cy > r.y + r.h) continue;
      if (!visible(n.parentElement!)) continue;
      const t = n.nodeValue!.replace(/\s+/g, ' ').trim();
      parts.push(t);
      total += t.length + 1;
    }
    return { links, sampleIds: [...new Set(sampleIds)], text: parts.join(' ').slice(0, 6000) };
  }
});
