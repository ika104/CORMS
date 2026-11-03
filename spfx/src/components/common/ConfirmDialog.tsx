import * as React from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import styles from './ConfirmDialog.module.scss';

export interface IConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  /** Use the danger button variant for the confirm action (e.g. delete). */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Shared "are you sure?" shell on top of the common Modal — for delete/revoke-style
// confirmations anywhere in the app.
export const ConfirmDialog: React.FC<IConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}) => (
  <Modal
    isOpen={isOpen}
    onDismiss={onCancel}
    title={title}
    width={420}
    footer={
      <>
        <Button variant="default" text={cancelLabel} onClick={onCancel} />
        <Button variant={destructive ? 'danger' : 'primary'} text={confirmLabel} onClick={onConfirm} />
      </>
    }
  >
    <p className={styles.message}>{message}</p>
  </Modal>
);
