import * as React from 'react';
import { Icon } from '../components/icons/Icon';
import { Button } from '../components/common/Button';
import styles from './ModuleHeader.module.scss';

export interface IModuleHeaderProps {
  icon: string;
  title: string;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
}

// Reproduces the reference module header row (§2, §8): icon + title on the left,
// a navy primary action button on the right (e.g. RecordsHub's "Advanced Search").
export const ModuleHeader: React.FC<IModuleHeaderProps> = ({
  icon,
  title,
  primaryActionLabel,
  onPrimaryAction,
}) => (
  <div className={styles.moduleHeader}>
    <div className={styles.titleGroup}>
      <span className={styles.icon}>
        <Icon name={icon} size={20} />
      </span>
      <h1 className={styles.title}>{title}</h1>
    </div>
    {primaryActionLabel && <Button variant="primary" onClick={onPrimaryAction} text={primaryActionLabel} />}
  </div>
);
