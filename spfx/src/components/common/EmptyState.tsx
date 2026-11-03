import * as React from 'react';
import { Inbox } from 'lucide-react';
import styles from './EmptyState.module.scss';

export interface IEmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
}

export const EmptyState: React.FC<IEmptyStateProps> = ({ title, description, icon }) => (
  <div className={styles.emptyState}>
    <div className={styles.icon}>{icon ?? <Inbox size={40} />}</div>
    <div className={styles.title}>{title}</div>
    {description && <div className={styles.description}>{description}</div>}
  </div>
);
