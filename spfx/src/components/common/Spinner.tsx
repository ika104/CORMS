import * as React from 'react';
import { Spinner as FluentSpinner, SpinnerSize } from '@fluentui/react';
import { useTranslation } from 'react-i18next';

export interface ISpinnerProps {
  label?: string;
  /** 'inline' is a small spinner with its label beside it, for status lines inside a form. */
  variant?: 'block' | 'inline';
}

export const Spinner: React.FC<ISpinnerProps> = ({ label, variant = 'block' }) => {
  const { t } = useTranslation();
  const inline = variant === 'inline';
  return (
    <FluentSpinner
      size={inline ? SpinnerSize.small : SpinnerSize.medium}
      labelPosition={inline ? 'right' : undefined}
      label={label ?? t('common.loading')}
    />
  );
};
