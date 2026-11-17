/**
 * Shared icon/emoji constants.
 *
 * All values are expressed as Unicode code-point escapes (pure ASCII source)
 * so the file is immune to editor encoding mishaps that can corrupt literal
 * emoji characters into mojibake.
 */

// Resource icons used across TopBarHUD, ResourceHUD, TransactionLog, SystemDetails, etc.
// Pure text glyphs (no emoji variation selector) so CSS `color` always applies.
export const RESOURCE_ICONS = {
  credits:   '\u25C6',           // ◆  black diamond
  materials: '\u2699',           // ⚙  gear (text glyph, no FE0F)
  recruits:  '\u265F',           // ♟  chess pawn (unit proxy)
  influence: '\u2605',           // ★  black star
};

// System special-type icons used in SystemDetails and SystemOverlays.
export const SPECIAL_TYPE_ICONS = {
  manufacturingCenter: '\u2699',        // ⚙  gear
  researchFacility:    '\u269B',        // ⚛  atom (text glyph)
  tradeHub:            '\u25C6',        // ◆  diamond
  strategicChokepoint: '\u25A3',        // ▣  square (text glyph)
  secretBase:          '\u25C8',        // ◈
};

// Facility icons used in the Facilities tab of SystemDetails.
export const FACILITY_ICONS = {
  shipyard:   '\u26D3',          // ⛓
  training:   '\u2694',          // ⚔
  research:   '\u269B',          // ⚛  atom (text glyph)
  defense:    '\u26E8',          // ⛨  black cross on shield
  shield:     '\u26E8',          // ⛨
  extractor:  '\u26CF',          // ⛏
  ion_cannon: '\u26A1',          // ⚡
};

// Ship class icons used in the Ship Production section of the Facilities tab.
export const SHIP_CLASS_ICONS = {
  Fighter:  '\u25B6',          // ▶  small/fast
  Corvette: '\u25C6',          // ◆  diamond
  Cruiser:  '\u{2B22}',        // ⬢  filled hexagon
  Capital:  '\u{2B21}',        // ⬡  white hexagon (largest class)
};

// Misc UI icons.
export const UI_ICONS = {
  cancel:          '\u2715',     // ✕
  chevronRight:    '\u25B6',     // ▶  collapsed accordion chevron
  chevronDown:     '\u25BC',     // ▼  expanded accordion chevron
  facilitiesEmpty: '\u2302',     // ⌂  house / base
  queueEmpty:      '\u2699',     // ⚙
  locked:          '\u26BF',     // ⚿  lock (text glyph)
  trendUp:         '\u25B2',     // ▲
  trendDown:       '\u25BC',     // ▼
  trendStable:     '\u2192',     // →
  fallback:        '\u2302',     // ⌂
  hyperspaceLane:  '\u{2B21}',   // ⬡  white hexagon
  warning:         '\u26A0',     // ⚠  warning sign (text glyph)
  menu:            '\u2630',     // ☰  hamburger menu
  trophy:          '\u2605',     // ★  star (used for tutorial complete)
  inTransit:       '\u25B6',     // ▶  right-pointing triangle (fleet in transit)
  emptyFleet:      '\u2693',     // ⚓  anchor (empty fleet state)
  statusDot:       '\u25CF',     // ●  black circle
  rescue:          '\u2665',     // ♥  heart (rescue / save action)
  archive:         '\u2620',     // ☠  skull and crossbones
  emptyRoster:     '\u25A1',     // □  white square
  missions:        '\u25CE',     // ◎  bullseye/rings (mission target)
  victory:         '\u2691',     // ⚑  black flag (victory progress)
};

// Alert category icons (spec 063 — Player Alerts system).
export const ALERT_ICONS = {
  mission:      '\u25CE',        // ◎  bullseye/rings
  fleet:        '\u25B6',        // ▶  right-pointing triangle
  combat:       '\u2694',        // ⚔  crossed swords
  event:        '\u26A0',        // ⚠  warning sign
  capture:      '\u{2B21}',      // ⬡  white hexagon
  intel:        '\u25C8',        // ◈  rotated square
  construction: '\u2699',        // ⚙  gear
  diplomacy:    '\u265F',        // ♟  chess pawn (diplomatic)
};

// Session & mode icons (spec 060 — async/sync mode switching, session panel).
export const SESSION_ICONS = {
  online:  '\u25CF',             // ●  filled circle (reuse of UI_ICONS.statusDot)
  ready:   '\u2713',             // ✓  check mark
  host:    '\u2605',             // ★  filled star (reuse of RESOURCE_ICONS.influence)
  clock:   '\u23F1',             // ⏱  stopwatch (turn timer)
  sync:    '\u27F3',             // ⟳  clockwise open circle arrow (sync mode)
  pause:   '\u23F8',             // ⏸  double vertical bar (pause)
  play:    '\u25B6',             // ▶  right-pointing triangle (resume/play)
};
