import * as React from 'react';

export interface IRailIconProps {
  className?: string;
  size?: number;
}

type RailIconComponent = React.FC<IRailIconProps>;

function makeRailIcon(children: React.ReactNode): RailIconComponent {
  const RailIcon: RailIconComponent = ({ className, size = 20 }) => (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
  return RailIcon;
}

// Rail glyphs are hand-authored inline SVG (§7.8) — deliberately separate from the
// lucide-react content-icon set used elsewhere.
export const railIcons: { [key: string]: RailIconComponent } = {
  inbox: makeRailIcon(
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
    </>
  ),
  listChecks: makeRailIcon(
    <>
      <path d="m3 7 2 2 4-4" />
      <path d="M13 6h8" />
      <path d="m3 15 2 2 4-4" />
      <path d="M13 18h8" />
    </>
  ),
  mail: makeRailIcon(
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 6-10 7L2 6" />
    </>
  ),
  mailOpen: makeRailIcon(
    <>
      <path d="m2 8 9.6 6.4a2 2 0 0 0 2.4 0L22 8" />
      <path d="M2 8v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-8.6-5.7a2 2 0 0 0-2.4 0Z" />
    </>
  ),
  send: makeRailIcon(
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  fileEdit: makeRailIcon(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h8" />
      <path d="M14 2v6h6" />
      <path d="M18 16.5V22h5.5" />
      <path d="m21.5 13.5-4 4L16 19l1.5-1.5 4-4Z" />
    </>
  ),
  workflow: makeRailIcon(
    <>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <path d="M7 11v4a2 2 0 0 0 2 2h4" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </>
  ),
  sliders: makeRailIcon(
    <>
      <path d="M4 6h10M18 6h2M4 12h2M10 12h10M4 18h14M20 18h0" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="8" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </>
  ),
  languages: makeRailIcon(
    <>
      <path d="m5 8 6 6" />
      <path d="m4 14 6-6 2-3" />
      <path d="M2 5h12" />
      <path d="M7 2h1" />
      <path d="m22 22-5-10-5 10" />
      <path d="M14 18h6" />
    </>
  ),
  route: makeRailIcon(
    <>
      <circle cx="6" cy="19" r="3" />
      <circle cx="18" cy="5" r="3" />
      <path d="M9 19h8a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2H9" />
    </>
  ),
  userCog: makeRailIcon(
    <>
      <circle cx="9" cy="7" r="4" />
      <path d="M2 21v-2a4 4 0 0 1 4-4h3.5" />
      <circle cx="18" cy="16" r="3" />
      <path d="M18 12v1M18 19v1M14.7 14l.9.5M20.4 17.5l.9.5M14.7 18l.9-.5M20.4 14.5l.9-.5" />
    </>
  ),
  search: makeRailIcon(
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  barChart: makeRailIcon(
    <>
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="6" />
      <rect x="12" y="8" width="3" height="10" />
      <rect x="17" y="5" width="3" height="13" />
    </>
  ),
  settings: makeRailIcon(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ),
  history: makeRailIcon(
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </>
  ),
  fileCheck: makeRailIcon(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  folderOpen: makeRailIcon(
    <>
      <path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
    </>
  ),
  folder: makeRailIcon(
    <path d="M4 4h5.2a2 2 0 0 1 1.6.8L12 7h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
  ),
  users: makeRailIcon(
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  database: makeRailIcon(
    <>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5V19A9 3 0 0 0 21 19V5" />
      <path d="M3 12A9 3 0 0 0 21 12" />
    </>
  ),
  // Matches lucide-react's List glyph (src/components/icons/Icon.tsx's `list` key) so the same
  // icon renders identically in the rail and elsewhere in the app.
  list: makeRailIcon(
    <>
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
      <path d="M3 6h.01" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M8 6h13" />
    </>
  ),
  // fileText / pen / shieldCheck — used by the Correspondence Template, Signing Dashboard and
  // Re-Classification nav entries (CORMS_NavigationMenu IconKeys). They were absent from this rail
  // set, so those rows rendered with no icon at all; mirror the lucide glyphs used elsewhere in the
  // app (Icon.tsx: fileText/ShieldCheck, pencil/Pen) so the rail matches.
  fileText: makeRailIcon(
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </>
  ),
  pen: makeRailIcon(<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />),
  shieldCheck: makeRailIcon(
    <>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  // Fallback glyph for a CORMS_NavigationMenu row with no IconKey set — NavigationServiceCore
  // maps those to 'circle'. Without an entry here such an entry rendered with no icon at all,
  // which reads as a broken row rather than a generic one (CMS-038 AC11: one consistent icon
  // set, no third-party pack needed).
  circle: makeRailIcon(<circle cx="12" cy="12" r="9" />),
};
