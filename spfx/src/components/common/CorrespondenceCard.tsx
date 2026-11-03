import * as React from 'react';
import styles from './CorrespondenceCard.module.scss';

export interface ICorrespondenceCardField {
  label: string;
  node: React.ReactNode;
}

export interface ICorrespondenceCardProps {
  /** Omit for items with no reference number (e.g. tasks) — the ref-no line is skipped entirely. */
  refNo?: string;
  subject: string;
  /** Badges (Security Level, Status, ...) shown together under the subject/ref-no — e.g. Inbox/Sent. */
  headerBadges?: React.ReactNode;
  fields: ICorrespondenceCardField[];
  actions?: React.ReactNode;
  /** Selection checkbox (from the grid) rendered in the header, beside the actions menu. */
  selectionControl?: React.ReactNode;
  footer?: React.ReactNode;
}

// TODO(confirm): Inbox/Sent (src/modules/inboxSent) is still an unbuilt placeholder, so
// there is no existing shared card renderer to import — this generalises the field-grid
// card markup MyCorrespondenceView builds inline (cardRenderer, lines ~265-317) into a
// reusable component so Team Inbox renders visually identical cards. MyCorrespondenceView
// itself was left as-is to avoid touching an already-shipped screen; migrating it to this
// component is a reasonable follow-up once Inbox/Sent is built for real. Also doubles as
// the "compact card" renderer for My Tasks' Task Queue panel — same component, fewer fields.
export const CorrespondenceCard: React.FC<ICorrespondenceCardProps> = ({
  refNo,
  subject,
  headerBadges,
  fields,
  actions,
  selectionControl,
  footer,
}) => (
  <div className={styles.card}>
    <div className={styles.header}>
      <div className={styles.titleWrap}>
        <div className={styles.subject}>{subject}</div>
        {refNo && <div className={styles.refNo}>{refNo}</div>}
        {headerBadges && <div className={styles.headerBadges}>{headerBadges}</div>}
      </div>
      {(selectionControl || actions) && (
        <div className={styles.headerRight}>
          {selectionControl}
          {actions}
        </div>
      )}
    </div>
    <div className={styles.body}>
      {fields.map((field, i) => (
        <div key={i}>
          <div className={styles.fieldLabel}>{field.label}</div>
          <div className={styles.fieldValue}>{field.node}</div>
        </div>
      ))}
    </div>
    {footer && <div className={styles.footer}>{footer}</div>}
  </div>
);
