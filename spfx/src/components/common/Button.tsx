import * as React from 'react';
import {
  concatStyleSets,
  DefaultButton,
  IButtonProps as IFluentButtonProps,
  IButtonStyles,
  PrimaryButton,
} from '@fluentui/react';

export interface IButtonProps extends IFluentButtonProps {
  variant?: 'primary' | 'default' | 'danger';
}

// Solid brandRed fill (Revoke/Reject), styled on top of DefaultButton since Fluent has
// no built-in destructive variant and the theme only carries one red token.
const dangerStyles: IButtonStyles = {
  root: {
    color: '#fff',
    background: 'var(--corms-brand-red)',
    border: '1px solid var(--corms-brand-red)',
  },
  rootHovered: { color: '#fff', background: 'var(--corms-brand-red)', opacity: 0.85 },
  rootPressed: { color: '#fff', background: 'var(--corms-brand-red)', opacity: 0.7 },
  label: { color: '#fff' },
};

// Brand-tokened wrapper over Fluent's buttons — the navy primary action button
// from the reference (module header, right side) resolves through the Fluent
// theme's palette.themePrimary, which ThemeProvider maps to brand.navy.
export const Button: React.FC<IButtonProps> = ({ variant = 'default', styles, ...rest }) => {
  if (variant === 'primary') return <PrimaryButton styles={styles} {...rest} />;
  if (variant === 'danger') return <DefaultButton styles={concatStyleSets(dangerStyles, styles)} {...rest} />;
  return <DefaultButton styles={styles} {...rest} />;
};
