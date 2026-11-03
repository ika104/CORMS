import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../common/EmptyState';

export interface INoRowsOverlayProps {
  messageKey?: string;
}

export const NoRowsOverlay: React.FC<INoRowsOverlayProps> = ({ messageKey }) => {
  const { t } = useTranslation();
  return <EmptyState title={t(messageKey || 'grid.empty.default')} />;
};
