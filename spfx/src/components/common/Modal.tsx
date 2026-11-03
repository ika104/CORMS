import * as React from 'react';
import { Modal as FluentModal } from '@fluentui/react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../icons/Icon';
import styles from './Modal.module.scss';

export interface IModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  /** Saves are atomic: prevent an accidental dismiss while a mutation is in flight. */
  isDismissable?: boolean;
}

// Shared modal shell (header + X close + body + footer) — there is no app-wide modal
// primitive yet, so this wraps Fluent's Modal once and every screen that needs a dialog
// (Create Delegation, Reassign Correspondence, ...) reuses this instead of Fluent directly.
export const Modal: React.FC<IModalProps> = ({ isOpen, onDismiss, title, children, footer, width = 560, isDismissable = true }) => {
  const { t } = useTranslation();
  return (
    <FluentModal
      isOpen={isOpen}
      onDismiss={isDismissable ? onDismiss : undefined}
      isBlocking={!isDismissable}
      containerClassName={styles.container}
      styles={{ main: { width, maxWidth: '90vw' } }}
    >
      <div className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <button type="button" className={styles.closeBtn} onClick={onDismiss} disabled={!isDismissable} aria-label={t('common.close')}>
          <Icon name="x" size={18} />
        </button>
      </div>
      <div className={styles.body}>{children}</div>
      {footer && <div className={styles.footer}>{footer}</div>}
    </FluentModal>
  );
};
