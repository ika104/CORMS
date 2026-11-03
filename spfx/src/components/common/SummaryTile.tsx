import * as React from 'react';
import { Icon } from '../icons/Icon';
import styles from './SummaryTile.module.scss';

export interface ISummaryTileProps {
  label: string;
  value: number;
  color: string;
  iconName: string;
  selected?: boolean;
  onClick?: () => void;
}

// The stat-card tile used in the row above a listing screen's grid (My Correspondence,
// My Tasks, ...). The accent `color` (a CSS custom property such as var(--corms-toolbar-primary))
// drives the top border, the value, and the icon — the icon is coloured via CSS `color` +
// Lucide's `currentColor` stroke, NOT an SVG `fill`/`stroke` attribute, because a `var(...)` does
// not resolve as an SVG presentation attribute (it only works in a CSS property). Using `color`
// keeps the icon on the live theme colour and reactive to theme changes.
export const SummaryTile: React.FC<ISummaryTileProps> = ({
  label,
  value,
  color,
  iconName,
  selected,
  onClick,
}) => (
  <div
    className={`${styles.tile} ${selected ? styles.tileSelected : ''}`}
    style={{ borderTop: `3px solid ${color}`, outlineColor: selected ? color : undefined }}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    aria-pressed={onClick ? selected : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={
      onClick
        ? (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            // A div with role="button" doesn't get the native button's Space handling, so
            // without this the page scrolls every time a tile is toggled by keyboard.
            e.preventDefault();
            onClick();
          }
        : undefined
    }
  >
    <div className={styles.header}>
      <span className={styles.label}>{label}</span>
      <div className={styles.iconWrap} style={{ color }}>
        <Icon name={iconName} size={20} />
      </div>
    </div>
    <div className={styles.value} style={{ color }}>
      {value}
    </div>
  </div>
);
