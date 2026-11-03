import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../../components/common/EmptyState';

const NotFoundView: React.FC = () => {
  const { t } = useTranslation();
  return <EmptyState title={t('common.notFound')} description={t('common.notFoundDescription')} />;
};

export default NotFoundView;
