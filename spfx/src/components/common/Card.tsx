import * as React from 'react';
import styles from './Card.module.scss';

export interface ICardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<ICardProps> = ({ children, className }) => (
  <div className={className ? `${styles.card} ${className}` : styles.card}>{children}</div>
);
