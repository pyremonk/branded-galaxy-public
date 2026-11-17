/**
 * InfoNavHUD — vertical nav buttons for accessing info panels that don't
 * have a dedicated trigger in the main HUD (Characters, Intel).
 * Spec: 035-information-panels-spec.md
 */
import './InfoNavHUD.css';

/* ── Flat monochrome SVG icons (inherit currentColor) ────────────────── */
const PersonIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="8" r="3.5"/>
    <path d="M12 14c-5.33 0-8 2.67-8 4v1h16v-1c0-1.33-2.67-4-8-4z"/>
  </svg>
);

const MagnifierIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 4a6 6 0 100 12A6 6 0 0010 4zm-8 6a8 8 0 1114.32 4.9l4.39 4.38-1.41 1.41-4.39-4.38A8 8 0 012 10z"/>
  </svg>
);

const GridIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 3h8v8H3V3zm10 0h8v8h-8V3zM3 13h8v8H3v-8zm10 0h8v8h-8v-8z"/>
  </svg>
);

const TargetIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2a10 10 0 100 20A10 10 0 0012 2zm0 2a8 8 0 018 8 8 8 0 01-8 8A8 8 0 014 12a8 8 0 018-8zm0 3a5 5 0 100 10A5 5 0 0012 7zm0 2a3 3 0 110 6A3 3 0 0112 9z"/>
  </svg>
);

const FlaskIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.5 3h5v8.5l3.5 6a2 2 0 01-1.75 2.97H7.75A2 2 0 016 17.5l3.5-6V3zm1.5 1.5v7l-3 5.2a.5.5 0 00.44.75h8.12a.5.5 0 00.44-.75L14 11.5v-7h-3z"/>
  </svg>
);

const ShipIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2l2.5 5H20l-4 3.5 1.5 5.5L12 13l-5.5 3 1.5-5.5L4 7h5.5L12 2zm0 3.2L10.3 8.5H7l2.6 2.3-1 3.6L12 12.2l3.4 2.2-1-3.6L17 8.5h-3.3L12 5.2z"/>
    <path d="M8 18h8v1.5a1 1 0 01-1 1H9a1 1 0 01-1-1V18z"/>
  </svg>
);

const NAV_BUTTONS = [
  { id: 'commandOverview', icon: <GridIcon />,      label: 'CMD OVR',  title: 'Command Overview (B)' },
  { id: 'characters',      icon: <PersonIcon />,    label: 'CHARS',    title: 'Character Roster (C)' },
  { id: 'intel',           icon: <MagnifierIcon />, label: 'INTEL',    title: 'Intel Reports (I)'    },
  { id: 'fleet',           icon: <ShipIcon />,      label: 'FLEET',    title: 'Fleet Status (F)'     },
  { id: 'missions',        icon: <TargetIcon />,    label: 'MISSIONS', title: 'Active Missions (M)'  },
  { id: 'research',        icon: <FlaskIcon />,     label: 'RESEARCH', title: 'Research Panel (R)'   },
];

export function InfoNavHUD({ onOpenPanel, panelOpen }: any) {
  return (
    <div className={`info-nav-hud${panelOpen ? ' info-nav-hud--shifted' : ''}`}>
      {NAV_BUTTONS.map(({ id, icon, label, title }) => (
        <button
          key={id}
          className="info-nav-btn"
          onClick={() => onOpenPanel(id)}
          title={title}
        >
          <span className="info-nav-icon">{icon}</span>
          <span className="info-nav-label">{label}</span>
        </button>
      ))}
    </div>
  );
}
