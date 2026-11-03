import * as React from 'react';
import styles from './StatusBadge.module.scss';

export type StatusBadgeTone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'purple';

// Same colour values already used per-domain (STATUS_CONFIG in ICorrespondence.ts,
// SECURITY_TIERS) — centralised here as named tones rather than introducing new hex
// literals, since no formal green/amber/red/grey token exists in theme/tokens.ts yet.
const TONE_COLORS: Record<StatusBadgeTone, { color: string; bg: string }> = {
  success: { color: '#107c10', bg: '#dff6dd' },
  warning: { color: '#835b00', bg: '#fff4ce' },
  danger: { color: '#c50f1f', bg: '#fde7e9' },
  neutral: { color: '#605e5c', bg: '#f3f2f1' },
  info: { color: '#0070d0', bg: '#e8f0fb' },
  purple: { color: '#5c2d91', bg: '#f4eafb' },
};

export interface IStatusBadgeProps {
  label: string;
  tone: StatusBadgeTone;
  className?: string;
  /** Optional hover tooltip — e.g. the expedite reason shown wherever the flag appears (CMS-015 AC3). */
  title?: string;
}

export const StatusBadge: React.FC<IStatusBadgeProps> = ({ label, tone, className, title }) => {
  const cfg = TONE_COLORS[tone];
  // Client feedback ("too much colour"): a neutral tag — Status and Security — is drawn as a plain
  // label, with no pill background or border. Coloured tones (the Expedited/escalation flags) keep
  // the filled badge so they still read as flags.
  const plain = tone === 'neutral';
  const style: React.CSSProperties = plain
    ? { color: cfg.color, background: 'transparent', border: 'none', padding: 0 }
    : { color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.color}22` };
  return (
    <span
      className={className ? `${styles.badge} ${className}` : styles.badge}
      style={style}
      title={title}
    >
      {label}
    </span>
  );
};
