import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Icon } from '../../../components/icons/Icon';
import { Spinner } from '../../../components/common/Spinner';
import { SearchableSelect, ISelectOption } from '../../createCorrespondence/components/SearchableSelect';
import { ICorrespondenceStub, SECURITY_TIERS } from '../../../models/ICorrespondence';
import { IRecordClassification } from '../../../models/ICorrespondenceMetadata';
import { useServices } from '../../../state/hooks';
import { ITriageDraft } from '../types';
import {
  ClassifyFieldKey,
  diffClassification,
  snapshotFromDraft,
} from '../classificationAudit';
import styles from './AmendClassificationModal.module.scss';

export interface IAmendClassificationModalProps {
  item: ICorrespondenceStub;
  /** The item's currently-captured classification — the "before" of the amendment. */
  captured: ITriageDraft;
  maxClearanceTier: number;
  onDismiss: () => void;
  /** AC9 — the officer confirmed a reasoned amendment: apply the new values and write the audit. */
  onSubmit: (next: ITriageDraft, reason: string) => Promise<void>;
}

/**
 * CMS-010 AC9 — amend an item's core metadata (including the Security Level) after it was captured,
 * to correct human error or reflect an update. Every amendment requires a reason and is audited
 * with before/after values (the caller does the write). Security options stay capped to the
 * officer's own clearance (AC4). Document content is never touched here — metadata only.
 */
export const AmendClassificationModal: React.FC<IAmendClassificationModalProps> = ({
  item,
  captured,
  maxClearanceTier,
  onDismiss,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const { metadataService } = useServices();
  const [next, setNext] = React.useState<ITriageDraft>(captured);
  const [reason, setReason] = React.useState('');
  // Only surface the "reason required" error once the officer has interacted with the field or tried
  // to save — not on first open (a fresh, untouched form shouldn't show a red validation error).
  const [reasonTouched, setReasonTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | undefined>(undefined);

  const patch = (p: Partial<ITriageDraft>): void => setNext((prev) => ({ ...prev, ...p }));

  const changes = diffClassification(snapshotFromDraft(captured), snapshotFromDraft(next));
  const reasonProvided = reason.trim().length > 0;
  const canSubmit = changes.length > 0 && reasonProvided;

  const fieldLabel = (field: ClassifyFieldKey): string => t(`triageRouting.classify.fieldLabel.${field}`);

  const save = async (): Promise<void> => {
    if (!canSubmit || saving) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      await onSubmit(next, reason.trim());
      setSaved(true);
    } catch {
      setSaveError(t('triageRouting.amend.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = (): void => {
    setReasonTouched(true);
    save().catch(() => undefined);
  };

  return (
    <Modal
      isOpen
      onDismiss={onDismiss}
      title={t('triageRouting.amend.title')}
      width={600}
      isDismissable={!saving}
      footer={
        saved ? <Button variant="primary" text={t('common.close')} onClick={onDismiss} /> : (
          <>
            <Button text={t('common.cancel')} onClick={onDismiss} disabled={saving} />
            <Button variant="primary" disabled={!canSubmit || saving} text={saving ? t('triageRouting.amend.saving') : t('triageRouting.amend.submit')} onClick={handleSaveClick} />
          </>
        )
      }
    >
      {saving && <div className={styles.saveState}><Spinner label={t('triageRouting.amend.saving')} /></div>}
      {saved && <div className={styles.successState}><Icon name="check" size={18} /><div><strong>{t('triageRouting.amend.savedTitle')}</strong><span>{t('triageRouting.amend.savedDescription')}</span></div></div>}
      {saveError && <div className={styles.errorState} role="alert">{saveError}</div>}
      {!saved && !saving && <>
      <div className={styles.introNote}>
        <Icon name="alertTriangle" size={14} />
        <span>{t('triageRouting.amend.contentImmutableNote')}</span>
      </div>

      <div className={styles.grid}>
        <div className={styles.field}>
          <span className={styles.label}>{t('triageRouting.classify.contentType')}</span>
          <SearchableSelect
            placeholder={t('createCorrespondence.field.contentTypePlaceholder')}
            disabled={saving}
            fetchOptions={async (query) => {
              const results = await metadataService.getContentTypes(query);
              return results.map((r): ISelectOption => ({ id: r.id, label: r.name }));
            }}
            selected={next.contentTypeName ? [{ id: next.contentTypeId ?? next.contentTypeName, label: next.contentTypeName }] : []}
            onChange={(selected) => patch({ contentTypeId: selected[0]?.id, contentTypeName: selected[0]?.label })}
          />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t('triageRouting.classify.priority')}</span>
          <select className={styles.select} value={next.priority} disabled={saving} onChange={(e) => patch({ priority: e.target.value as 'Normal' | 'High' })}>
            <option value="Normal">{t('createCorrespondence.field.normal')}</option>
            <option value="High">{t('createCorrespondence.field.high')}</option>
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t('triageRouting.classify.securityLevel')}</span>
          <select
            className={styles.select}
            value={next.securityTier ?? ''}
            disabled={saving}
            onChange={(e) => patch({ securityTier: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">{t('triageRouting.classify.selectPlaceholder')}</option>
            {SECURITY_TIERS.map((tier) => (
              <option key={tier.tier} value={tier.tier} disabled={tier.tier > maxClearanceTier}>
                {tier.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t('triageRouting.classify.responseDeadline')}</span>
          <input
            type="date"
            className={styles.select}
            value={next.responseDeadline ?? ''}
            disabled={saving}
            onChange={(e) => patch({ responseDeadline: e.target.value || undefined })}
          />
        </div>

        <div className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.label}>{t('triageRouting.classify.recordClassification')}</span>
          <SearchableSelect
            placeholder={t('createCorrespondence.field.recordClassificationPlaceholder')}
            loadErrorText={t('triageRouting.classify.recordClassificationLoadError')}
            disabled={saving}
            fetchOptions={async (query) => {
              const results = await metadataService.getRecordClassifications(query);
              return results.map((r: IRecordClassification): ISelectOption => ({ id: r.id, label: `${r.recordNumber} — ${r.name}` }));
            }}
            selected={next.recordClassificationId ? [{ id: next.recordClassificationId, label: next.recordClassificationLabel ?? '' }] : []}
            onChange={(selected) => patch({ recordClassificationId: selected[0]?.id, recordClassificationLabel: selected[0]?.label })}
          />
        </div>
      </div>

      {/* Live before/after preview — the exact set of values that will be written to the audit. */}
      <div className={styles.changePreview}>
        <div className={styles.previewTitle}>{t('triageRouting.amend.changesTitle')}</div>
        {changes.length === 0 ? (
          <div className={styles.noChanges}>{t('triageRouting.amend.noChanges')}</div>
        ) : (
          changes.map((c) => (
            <div key={c.field} className={styles.changeRow}>
              <span className={styles.changeField}>{fieldLabel(c.field)}</span>
              <span className={styles.changeFrom}>{c.from}</span>
              <Icon name="arrow" size={12} />
              <span className={styles.changeTo}>{c.to}</span>
            </div>
          ))
        )}
      </div>

      <div className={styles.field}>
        <span className={styles.label}>
          {t('triageRouting.amend.reasonLabel')} <span className={styles.required}>*</span>
        </span>
        <textarea
          className={styles.reason}
          rows={3}
          value={reason}
          disabled={saving}
          placeholder={t('triageRouting.amend.reasonPlaceholder')}
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setReasonTouched(true)}
        />
        {reasonTouched && !reasonProvided && (
          <div className={styles.reasonHint}>{t('triageRouting.amend.reasonRequired')}</div>
        )}
      </div>
      </>}
    </Modal>
  );
};
