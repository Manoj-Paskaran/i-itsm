import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const CHUNK_MS = 50;

/** Cumulative word chunks that preserve the message's original whitespace. */
export function revealChunks(text: string, wordsPerChunk = 2): string[] {
  if (!text.trim()) return [];
  const words = [...text.matchAll(/\S+/g)];
  const size = Number.isFinite(wordsPerChunk) ? Math.max(1, Math.floor(wordsPerChunk)) : 2;
  const chunks = [];
  for (let index = size - 1; index < words.length - 1; index += size) {
    const word = words[index]!;
    chunks.push(text.slice(0, word.index + word[0].length));
  }
  return [...chunks, text];
}

function subscribeToMotion(callback: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

const reducedMotion = () => window.matchMedia(REDUCED_MOTION).matches;

export function useReducedMotion() {
  return useSyncExternalStore(subscribeToMotion, reducedMotion, () => true);
}

export function useReveal(reply: { readonly text: string } | undefined, animate: boolean) {
  const chunks = useMemo(() => (reply ? revealChunks(reply.text) : []), [reply]);
  const lastIndex = Math.max(0, chunks.length - 1);
  const [progress, setProgress] = useState({ chunks, index: animate ? 0 : lastIndex });
  let index = progress.index;
  if (progress.chunks !== chunks || (!animate && index < lastIndex)) {
    // Once shown in full, a reply stays visible if the motion preference changes again.
    index = animate ? 0 : lastIndex;
    setProgress({ chunks, index });
  }
  const done = index === lastIndex;
  useEffect(() => {
    if (done) return;
    const timer = window.setTimeout(() => setProgress({ chunks, index: index + 1 }), CHUNK_MS);
    return () => window.clearTimeout(timer);
  }, [chunks, index, done]);
  return { text: chunks[index] ?? reply?.text, done };
}
