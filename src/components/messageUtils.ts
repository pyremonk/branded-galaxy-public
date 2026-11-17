/**
 * messageUtils.js — Shared message-rendering helpers used by ResolutionHUD and TurnSummaryHUD.
 */
import { createElement } from 'react';

// ─── Faction display data ────────────────────────────────────────────────────

export const FACTION_DATA: Record<string, { shortName: string; color: string }> = {
  brandAuthority: { shortName: 'Brand Authority', color: '#58a6ff' },
  union:          { shortName: 'Union',           color: '#3fb950' },
  autoforge:      { shortName: 'Autoforge',       color: '#f0883e' },
};

// ─── Outcome groups ──────────────────────────────────────────────────────────

export const OUTCOME_GROUPS = [
  {
    key:      'failures',
    label:    'Critical Failures & Failures',
    icon:     '\u2716',
    color:    '#f85149',
    outcomes: ['critical_failure', 'failure'],
  },
  {
    key:      'successes',
    label:    'Critical Successes & Successes',
    icon:     '\u2605',
    color:    '#3fb950',
    outcomes: ['critical_success', 'success'],
  },
  {
    key:      'info',
    label:    'Informational',
    icon:     '\u25c6',
    color:    '#8b949e',
    outcomes: ['info'],
  },
];

// ─── Message renderer ────────────────────────────────────────────────────────

/**
 * Replace faction IDs embedded in a message string with colored inline spans.
 * E.g. "brandAuthority defeated union at Orion" →
 *   <span style="color:#58a6ff">Brand Authority</span> defeated
 *   <span style="color:#3fb950">Union</span> at Orion
 * @param {string} message
 * @returns {React.ReactNode}
 */
export function renderMessage(message: any) {
  if (!message) return '';

  const factionIds = Object.keys(FACTION_DATA);
  let parts: Array<{ text: string; isFaction: boolean; color?: string }> = [{ text: message, isFaction: false }];

  for (const fid of factionIds) {
    const newParts: Array<{ text: string; isFaction: boolean; color?: string }> = [];
    for (const part of parts) {
      if (part.isFaction) { newParts.push(part); continue; }
      const idx = part.text.indexOf(fid);
      if (idx === -1) { newParts.push(part); continue; }
      if (idx > 0) newParts.push({ text: part.text.slice(0, idx), isFaction: false });
      newParts.push({
        text: FACTION_DATA[fid].shortName,
        isFaction: true,
        color: FACTION_DATA[fid].color,
      });
      const after = part.text.slice(idx + fid.length);
      if (after) newParts.push({ text: after, isFaction: false });
    }
    parts = newParts;
  }

  return parts.map((part, i) =>
    part.isFaction
      ? createElement('span', { key: i, style: { color: part.color, fontWeight: 'bold' } }, part.text)
      : part.text
  );
}
