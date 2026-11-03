import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { SECURITY_TIERS } from '../../../models/ICorrespondence';
import styles from './SecurityLevelPills.module.scss';

export interface ISecurityLevelOption {
  tier: number;
  name: string;
}

export interface ISecurityLevelPillsProps {
  value?: number;
  maxClearanceTier: number;
  onChange: (tier: number) => void;
  /** Levels sourced from RecordsHub (RH_SecurityLevels) when ds.metadata is live; falls back to
   * the built-in ascending scale when absent/empty, so the field never renders blank. */
  levels?: ISecurityLevelOption[];
  /** CMS-034 AC5 — when set, tiers at/above this rank are also disabled (a vetted-only band the
   * current user is not vetted for) and a note explains why. Independent of the clearance ceiling:
   * a user may be cleared to a tier but still not vetted to *capture* at it. */
  restrictedFromTier?: number;
  /** Focus target for submit-time validation, including an already-selected restricted level. */
  validationField?: string;
  invalid?: boolean;
  ariaLabel?: string;
}

// Ascending sensitivity scale (Public/Unclassified=1 .. Top Secret=5) — TASK-05 §4.1 confirms this
// direction, and live RecordsHub levels are normalized onto it (securityLevelRank.ts). Clearance is
// a CEILING: a user may pick their own level and every LESS-sensitive one below it; higher tiers are
// disabled (not hidden) so the ceiling stays visible. The least-sensitive level (Unclassified) is
// always selectable regardless of clearance.
export const SecurityLevelPills: React.FC<ISecurityLevelPillsProps> = ({
  value,
  maxClearanceTier,
  onChange,
  levels,
  restrictedFromTier,
  validationField,
  invalid = false,
  ariaLabel,
}) => {
  const { t } = useTranslation();
  const options =
    levels && levels.length ? levels : SECURITY_TIERS.map((tier) => ({ tier: tier.tier, name: tier.name }));
  const maxTierLabel = options.find((tier) => tier.tier === maxClearanceTier)?.name ?? '';
  // The lowest tier present is always allowed ("unclassified should always be allowed"), even if a
  // user's clearance were somehow resolved below it.
  const minTier = options.reduce((min, tier) => Math.min(min, tier.tier), Number.POSITIVE_INFINITY);

  return (
    <div
      data-validation-field={validationField}
      tabIndex={validationField ? -1 : undefined}
      role="group"
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
    >
      <div className={styles.row}>
        {options.map((tier) => {
          const aboveClearance = tier.tier > maxClearanceTier;
          // CMS-034 AC5 — the vetted-only band the current user isn't vetted for is disabled too.
          const restricted = restrictedFromTier !== undefined && tier.tier >= restrictedFromTier;
          const disabled = (aboveClearance || restricted) && tier.tier !== minTier;
          return (
            <button
              key={tier.tier}
              type="button"
              disabled={disabled}
              className={`${styles.pill} ${value === tier.tier ? styles.pillActive : ''} ${disabled ? styles.pillDisabled : ''}`}
              onClick={() => onChange(tier.tier)}
            >
              {tier.name}
            </button>
          );
        })}
      </div>
      <div className={styles.helper}>
        {t('createCorrespondence.field.securityLevelHelper', { tier: maxTierLabel })}
      </div>
      {restrictedFromTier !== undefined && (
        <div className={styles.helper}>{t('createCorrespondence.field.classifiedCaptureRestricted')}</div>
      )}
    </div>
  );
};
