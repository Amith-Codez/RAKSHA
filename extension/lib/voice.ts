import { useCallback, useEffect, useRef, useState } from 'react';
import script from './tutorial-script.json';
import type { Lang } from './types';

export type VoiceKey = keyof typeof script;
export const SCRIPT = script as Record<VoiceKey, Record<Lang, string>>;

/** Sentences of a narration, used for read-along captions. */
export const sentences = (text: string) => text.split(/(?<=[.!?।])\s+/).filter(Boolean);

/**
 * Narrator for the tutorial: plays the bundled neural-voice clips (public/voice/{lang}/{key}.mp3: Indian English,
 * Hindi and Telugu voices, recorded slowly for older listeners) and reports progress so captions can follow along.
 * Works offline; falls back to the browser voice only if a clip can't play.
 */
export function useNarrator(enabled: boolean) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const queue = useRef<[VoiceKey, Lang][]>([]);
  const [now, setNow] = useState<{ key: VoiceKey; lang: Lang } | null>(null);
  const [progress, setProgress] = useState(0);
  const [blocked, setBlocked] = useState(false);

  const stop = useCallback(() => {
    queue.current = [];
    if (audio.current) { audio.current.onended = null; audio.current.pause(); }
    speechSynthesis.cancel();
    setNow(null);
  }, []);

  const playNext = useCallback(() => {
    const item = queue.current.shift();
    if (!item) { setNow(null); return; }
    const [key, lang] = item;
    if (!audio.current) audio.current = new Audio();
    const a = audio.current;
    a.src = chrome.runtime.getURL(`/voice/${lang}/${key}.mp3`);
    a.playbackRate = 1;
    setNow({ key, lang });
    setProgress(0);
    a.ontimeupdate = () => a.duration && setProgress(a.currentTime / a.duration);
    a.onended = () => { setProgress(1); setTimeout(playNext, 350); };
    a.onerror = () => fallback(key, lang);
    a.play().then(() => setBlocked(false)).catch((e: Error) => {
      if (e.name === 'NotAllowedError') { setBlocked(true); setNow(null); queue.current = []; }
      else fallback(key, lang);
    });
  }, []);

  function fallback(key: VoiceKey, lang: Lang) {
    const u = new SpeechSynthesisUtterance(SCRIPT[key][lang].replace(/RAKSHA/g, 'Raksha'));
    u.lang = lang === 'hi' ? 'hi-IN' : lang === 'te' ? 'te-IN' : 'en-IN';
    u.rate = 0.9;
    u.onend = () => { setProgress(1); playNext(); };
    speechSynthesis.speak(u);
  }

  const say = useCallback((items: [VoiceKey, Lang][]) => {
    stop();
    if (!enabled) return;
    queue.current = [...items];
    playNext();
  }, [enabled, playNext, stop]);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => { if (!enabled) stop(); }, [enabled, stop]);
  return { say, stop, now, progress, blocked, setBlocked };
}
