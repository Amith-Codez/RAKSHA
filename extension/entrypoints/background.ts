/**
 * RAKSHA service worker.
 * Click the toolbar shield (or Alt+Shift+R, or right-click → "Check an ad here"):
 *   1. open the side panel (must happen synchronously inside the user gesture),
 *   2. inject the selection overlay into THIS tab only (activeTab + scripting),
 *   3. the overlay sends back the box the user drew + the real links and text under it,
 *   4. we screenshot the visible tab, crop the box, and hand everything to the side panel.
 */
import type { PageLink, PendingScan } from '@/lib/types';

type Status =
  | { phase: 'idle'; windowId?: number }
  | { phase: 'selecting'; tabId: number; at: number; windowId?: number }
  | { phase: 'blocked'; reason: 'page' | 'inject'; at: number; windowId?: number };

const MAX_EDGE = 1600; // px: long edge of the image we send (enough for vision OCR, small enough to be fast)

async function setStatus(status: Status) {
  await chrome.storage.session.set({ status });
}

async function openPanel(windowId?: number) {
  if (windowId === undefined) return;
  try { await chrome.sidePanel.open({ windowId }); } catch { /* already open or not allowed */ }
}

const checkable = (url?: string) => !!url && /^(https?|file):/i.test(url) && !/^https:\/\/chrome(webstore)?\.google\.com\//i.test(url);

async function startSelection(tab: chrome.tabs.Tab) {
  if (!tab.id) return;
  const windowId = tab.windowId;
  if (tab.url && !checkable(tab.url)) return setStatus({ phase: 'blocked', reason: 'page', at: Date.now(), windowId });
  await setStatus({ phase: 'selecting', tabId: tab.id, at: Date.now(), windowId });
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['/overlay.js'] });
  } catch {
    await setStatus({ phase: 'blocked', reason: 'inject', at: Date.now(), windowId });
  }
}

/** User gesture entry point: panel first (no await before it), then the overlay. */
function begin(tab?: chrome.tabs.Tab) {
  if (!tab) return;
  void openPanel(tab.windowId);
  void startSelection(tab);
}

async function handOff(scan: PendingScan) {
  await chrome.storage.session.set({ pendingScan: scan, status: { phase: 'idle', windowId: scan.windowId } });
}

// ---------- screenshot + crop (OffscreenCanvas, all inside the service worker) ----------
async function cropVisible(windowId: number, rect: { x: number; y: number; w: number; h: number }, viewportW: number) {
  const shot = await chrome.tabs.captureVisibleTab(windowId, { format: 'png' });
  const blob = await (await fetch(shot)).blob();
  const full = await createImageBitmap(blob);
  const k = full.width / viewportW; // device pixels per CSS pixel (handles zoom + retina)
  const sx = Math.max(0, Math.round(rect.x * k));
  const sy = Math.max(0, Math.round(rect.y * k));
  const sw = Math.min(full.width - sx, Math.round(rect.w * k));
  const sh = Math.min(full.height - sy, Math.round(rect.h * k));
  const scale = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const out = new OffscreenCanvas(Math.max(1, Math.round(sw * scale)), Math.max(1, Math.round(sh * scale)));
  const ctx = out.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, sx, sy, sw, sh, 0, 0, out.width, out.height);
  full.close();
  const jpeg = await out.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
  return blobToDataUrl(jpeg);
}

async function blobToDataUrl(b: Blob) {
  const bytes = new Uint8Array(await b.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${b.type};base64,${btoa(bin)}`;
}

interface RegionMsg {
  type: 'raksha:region';
  rect: { x: number; y: number; w: number; h: number };
  viewport: { w: number; h: number };
  links: PageLink[];
  text: string;
  sampleIds: string[];
  pageUrl: string;
  pageTitle: string;
}

export default defineBackground(() => {
  chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({ id: 'raksha-area', title: 'Check an ad here with RAKSHA', contexts: ['page', 'image', 'frame'] });
      chrome.contextMenus.create({ id: 'raksha-text', title: 'Check this text with RAKSHA', contexts: ['selection'] });
      chrome.contextMenus.create({ id: 'raksha-link', title: 'RAKSHA: where does this link really go?', contexts: ['link'] });
    });
    if (reason === 'install') await chrome.tabs.create({ url: chrome.runtime.getURL('/welcome.html') });
  });

  // Toolbar click and the Alt+Shift+R shortcut (_execute_action) both land here.
  chrome.action.onClicked.addListener((tab) => begin(tab));

  chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (!tab) return;
    if (info.menuItemId === 'raksha-area') return begin(tab);
    void openPanel(tab.windowId);
    const base = { id: crypto.randomUUID(), createdAt: Date.now(), pageUrl: tab.url ?? '', pageTitle: tab.title ?? '', sampleIds: [], windowId: tab.windowId };
    if (info.menuItemId === 'raksha-text' && info.selectionText)
      void handOff({ ...base, text: info.selectionText.slice(0, 6000), links: [], source: 'text' });
    if (info.menuItemId === 'raksha-link' && info.linkUrl)
      void handOff({ ...base, text: `Link on this page: ${info.linkUrl}`, links: [{ href: info.linkUrl, text: '' }], source: 'link' });
  });

  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg?.type === 'raksha:cancel') {
      void setStatus({ phase: 'idle', windowId: sender.tab?.windowId });
      return;
    }
    if (msg?.type === 'raksha:start') {
      // From the side panel's big button: works on tabs RAKSHA was already allowed on (or with the optional permission).
      chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([tab]) =>
        tab ? startSelection(tab).then(() => reply({ ok: true })) : reply({ ok: false }));
      return true;
    }
    if (msg?.type === 'raksha:region' && sender.tab?.windowId !== undefined) {
      const m = msg as RegionMsg;
      cropVisible(sender.tab.windowId, m.rect, m.viewport.w)
        .catch(() => undefined) // screenshot blocked → still check the text and links
        .then((image) => handOff({
          id: crypto.randomUUID(), createdAt: Date.now(), image, text: m.text, links: m.links, sampleIds: m.sampleIds,
          pageUrl: m.pageUrl, pageTitle: m.pageTitle, source: 'area', windowId: sender.tab!.windowId,
        }));
    }
  });
});
