import type { SyntheticEvent } from 'react';

const BASE = import.meta.env.BASE_URL;

/** URL for a character portrait PNG served from assets/transparent-character-portraits/. */
export function portraitSrc(filename: string): string {
  return `${BASE}transparent-character-portraits/${filename}`;
}

/**
 * Generic head-and-shoulders silhouette, used when a portrait PNG is missing.
 * The licensed portrait pack isn't distributed with the public source repo,
 * so this keeps clones of it looking intentional rather than broken.
 */
const SILHOUETTE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' +
  '<rect width="64" height="64" rx="8" fill="#161b22"/>' +
  '<circle cx="32" cy="24" r="11" fill="#30363d"/>' +
  '<path d="M10 60c0-13 10-21 22-21s22 8 22 21z" fill="#30363d"/>' +
  '</svg>';

export const PORTRAIT_FALLBACK_SRC = `data:image/svg+xml,${encodeURIComponent(SILHOUETTE_SVG)}`;

/** onError handler for portrait <img> tags: swaps in the silhouette once. */
export function handlePortraitError(e: SyntheticEvent<HTMLImageElement>): void {
  const img = e.currentTarget;
  if (img.src !== PORTRAIT_FALLBACK_SRC) img.src = PORTRAIT_FALLBACK_SRC;
}
