import * as React from 'react';
import { ChevronRight } from 'lucide-react';
import styles from './CollapsibleSection.module.scss';

export interface ICollapsibleSectionProps {
  number: number;
  title: string;
  badgeText?: string;
  defaultOpen?: boolean;
  rightSlot?: React.ReactNode;
  /** A changing request id expands this section before validation focus is moved into it. */
  openRequest?: number;
  children: React.ReactNode;
}

export const CollapsibleSection: React.FC<ICollapsibleSectionProps> = ({
  number,
  title,
  badgeText,
  defaultOpen = true,
  rightSlot,
  openRequest,
  children,
}) => {
  const [open, setOpen] = React.useState(defaultOpen);

  React.useLayoutEffect(() => {
    if (openRequest !== undefined) setOpen(true);
  }, [openRequest]);

  return (
    <div className={styles.section}>
      <button
        type="button"
        className={styles.header}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
      >
        <ChevronRight size={16} className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} />
        {/* CMS-005 AC10 / CMS-038 — the section step indicator follows the active application
            theme colour (SharePoint "Change the look" accent when hosted, else the brand accent). */}
        <span className={styles.stepIndicator}>{number}</span>
        <span className={styles.title}>{title}</span>
        {badgeText && <span className={styles.badge}>{badgeText}</span>}
        {rightSlot}
      </button>
      {open && <div className={styles.body}>{children}</div>}
    </div>
  );
};
