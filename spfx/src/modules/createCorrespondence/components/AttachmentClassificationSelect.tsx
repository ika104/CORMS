import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { SECURITY_TIERS } from '../../../models/ICorrespondence';
import { ISecurityLevelOption } from './SecurityLevelPills';
import styles from './AttachmentClassificationSelect.module.scss';

export interface IAttachmentClassificationSelectProps {
  /** The attachment's effective classification tier (its own override, else the inherited parent). */
  value?: number;
  /** The parent correspondence's classification, shown as the "inherited" hint / default option. */
  parentTier?: number;
  /** Levels sourced from RecordsHub when available; falls back to the built-in ascending scale. */
  levels?: ISecurityLevelOption[];
  onChange: (tier: number) => void;
}

/**
 * CMS-034 AC6 — per-attachment classification control. Each attachment inherits the parent
 * correspondence's classification by default; the capturer may override it up or down here. Kept a
 * plain compact select (not the pill row) so it sits inline on a file row without dominating it.
 */
export const AttachmentClassificationSelect: React.FC<IAttachmentClassificationSelectProps> = ({
  value,
  parentTier,
  levels,
  onChange,
}) => {
  const { t } = useTranslation();
  const options = levels && levels.length ? levels : SECURITY_TIERS.map((tier) => ({ tier: tier.tier, name: tier.name }));
  const effective = value ?? parentTier;
  const inherited = value === undefined || value === parentTier;

  return (
    <label className={styles.wrap} title={t('createCorrespondence.attachmentClassification.label')}>
      <ShieldCheck size={12} className={styles.icon} />
      <select
        className={styles.select}
        value={effective ?? ''}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={t('createCorrespondence.attachmentClassification.label')}
      >
        {effective === undefined && <option value="">{t('createCorrespondence.attachmentClassification.placeholder')}</option>}
        {options.map((option) => (
          <option key={option.tier} value={option.tier}>
            {option.name}
          </option>
        ))}
      </select>
      {inherited && effective !== undefined && (
        <span className={styles.inheritedBadge}>{t('createCorrespondence.attachmentClassification.inherited')}</span>
      )}
    </label>
  );
};
