import type { Difficulty } from '../engine/types';

/** `?seed=…&d=…` for a puzzle. */
export function puzzleSearch(seed: string, difficulty: Difficulty): string {
  const q = new URLSearchParams({ seed, d: difficulty });
  return `?${q.toString()}`;
}

/** Absolute, shareable link to a puzzle. */
export function shareUrl(seed: string, difficulty: Difficulty): string {
  return `${window.location.origin}${window.location.pathname}${puzzleSearch(seed, difficulty)}`;
}

/** Copy text with the async Clipboard API, falling back to a hidden textarea + execCommand. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
