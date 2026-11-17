/**
 * Global feature flags (build-time).
 *
 * Add future flags here using VITE_FEATURE_* env vars.
 * Example: VITE_FEATURE_SOME_SYSTEM=true
 */
function readFeatureFlag(name, fallback = false) {
  const raw = import.meta.env[name];
  if (typeof raw !== 'string') return fallback;
  const normalized = raw.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export const FEATURES = Object.freeze({
  EVENT_SYSTEM: readFeatureFlag('VITE_FEATURE_EVENT_SYSTEM', false),
  // When false, the landing page shows a contact form instead of account creation.
  SIGNUPS: readFeatureFlag('VITE_FEATURE_SIGNUPS', false),
});
