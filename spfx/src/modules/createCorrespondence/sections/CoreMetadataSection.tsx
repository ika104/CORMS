import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Building2, Check, Globe2 } from 'lucide-react';
import { useServices } from '../../../services/ServiceProvider';
import { SearchableSelect, ISelectOption } from '../components/SearchableSelect';
import { SecurityLevelPills, ISecurityLevelOption } from '../components/SecurityLevelPills';
import { PhysicalMailWizard } from '../components/PhysicalMailWizard';
import { physicalDispatchDetail } from '../../../models/IPhysicalDispatch';
import { ICourierConfig } from '../../../models/ICourierConfig';
import { IUseCreateCorrespondenceForm } from '../state/useCreateCorrespondenceForm';
import { IFormErrors } from '../state/types';
import { IRecordClassification } from '../../../models/ICorrespondenceMetadata';
import {
  filterRecordClassificationsByClearance,
  isClassifiedCaptureTier,
} from '../state/classificationRules';
import styles from './CoreMetadataSection.module.scss';

export interface ICoreMetadataSectionProps {
  form: IUseCreateCorrespondenceForm;
  maxClearanceTier: number;
  errors: IFormErrors;
  /** CMS-034 AC5 — the tier at/above which classified capture is vetted-only, and whether the
   * current user is vetted. Together they gate the security pills and drive the vetting message. */
  classifiedCaptureThreshold: number;
  isVetted: boolean;
}

const FieldLabel: React.FC<{ label: string; required?: boolean; badge?: string }> = ({
  label,
  required,
  badge,
}) => (
  <div className={styles.labelRow}>
    <span className={styles.label}>
      {label}
      {required && <span className={styles.required}> *</span>}
    </span>
    {badge && <span className={styles.badge}>{badge}</span>}
  </div>
);

export const CoreMetadataSection: React.FC<ICoreMetadataSectionProps> = ({
  form,
  maxClearanceTier,
  errors,
  classifiedCaptureThreshold,
  isVetted,
}) => {
  const { t, i18n } = useTranslation();
  const { metadataService, externalOrgsService, sharePointService } = useServices();
  const { state, setField, setDestinationType, toggleDestinationDepartment, toggleExternalOrg } = form;
  // CMS-034 AC3 — keeps the last-fetched classifications so a pick can carry the chosen one's
  // active flag (and level) into form state without a second round-trip.
  const classificationCacheRef = React.useRef<Map<string, IRecordClassification>>(new Map());

  const [originatingFunctions, setOriginatingFunctions] = React.useState<ISelectOption[]>([]);
  const [securityLevels, setSecurityLevels] = React.useState<ISecurityLevelOption[]>([]);
  const [correspondenceTypes, setCorrespondenceTypes] = React.useState<ISelectOption[]>([]);
  const [channels, setChannels] = React.useState<ISelectOption[]>([]);
  const [dispatchWizardOpen, setDispatchWizardOpen] = React.useState(false);
  const [couriers, setCouriers] = React.useState<ICourierConfig[]>([]);
  const [classificationLoadError, setClassificationLoadError] = React.useState(false);
  const preferArabic = i18n.language.indexOf('ar') === 0;

  React.useEffect(() => {
    metadataService
      .getCouriers()
      .then(setCouriers)
      .catch(() => setCouriers([]));
  }, [metadataService]);

  // Physical Mail is opt-in: ticking it opens the dispatch wizard (CMS-020 §13); unticking clears
  // any captured dispatch so a stale method can't travel with a correspondence sent by email only.
  const handleTogglePhysicalMail = (checked: boolean): void => {
    setField('deliveryPhysicalMail', checked);
    if (checked) {
      setDispatchWizardOpen(true);
    } else {
      setField('physicalDispatch', undefined);
      setDispatchWizardOpen(false);
    }
  };

  React.useEffect(() => {
    metadataService
      .getOriginatingFunctions()
      .then((functions) => {
        // Value is the English name (not the JSON id) so the numbering function-code map
        // (Legal Affairs -> LEG) resolves; the label still follows the UI language.
        setOriginatingFunctions(
          functions.map((f) => ({ id: f.name, label: (preferArabic ? f.nameAr : f.name) || f.name }))
        );
      })
      .catch(() => undefined);
  }, [metadataService, preferArabic]);

  React.useEffect(() => {
    metadataService
      .getCorrespondenceTypes()
      .then((types) =>
        setCorrespondenceTypes(
          // Only the ids the app's logic understands (numbering direction / validation) are
          // rendered, so a stray Admin Config entry can't inject an invalid direction.
          types
            .filter((ct) => ct.id === 'Outgoing' || ct.id === 'Incoming')
            .map((ct) => ({ id: ct.id, label: (preferArabic ? ct.nameAr : ct.nameEn) || ct.nameEn }))
        )
      )
      // Non-fatal: the field falls back to its built-in Outgoing/Incoming options when empty.
      .catch(() => undefined);
  }, [metadataService, preferArabic]);

  const correspondenceTypeOptions: ISelectOption[] =
    correspondenceTypes.length > 0
      ? correspondenceTypes
      : [
          { id: 'Outgoing', label: t('createCorrespondence.field.outgoing') },
          { id: 'Incoming', label: t('createCorrespondence.field.incoming') },
        ];

  // Keep a persisted channel selectable even when it isn't (yet) in the loaded options — a reopened
  // draft whose options haven't arrived, or a value later removed from admin.channelsJson — so the
  // native <select> shows the saved value rather than silently resetting it.
  const channelOptions: ISelectOption[] =
    state.channel && !channels.some((c) => c.id === state.channel)
      ? [{ id: state.channel, label: state.channel }, ...channels]
      : channels;

  // Channel options (Email/Scan/Fax) are admin-managed JSON (admin.channelsJson) — labels follow the
  // UI language; the option id is what gets persisted. Non-fatal: a blank/invalid config leaves the
  // DDL with only its placeholder.
  React.useEffect(() => {
    metadataService
      .getChannels()
      .then((options) =>
        setChannels(
          options.map((c) => ({ id: c.id, label: (preferArabic ? c.nameAr : c.nameEn) || c.nameEn }))
        )
      )
      .catch(() => undefined);
  }, [metadataService, preferArabic]);

  React.useEffect(() => {
    metadataService
      .getSecurityLevels()
      .then((levels) => setSecurityLevels(levels.map((l) => ({ tier: l.tier, name: l.name }))))
      // Non-fatal: SecurityLevelPills falls back to the built-in scale when this stays empty.
      .catch(() => undefined);
  }, [metadataService]);

  // CMS-034 AC3 — resolve the selected classification's active/retired state when it wasn't set by
  // an in-session pick (a reopened draft or a reply prefill only carries the id/label). The list is
  // active-only, so a classification that has since been retired won't be found → recorded as
  // inactive, which blocks Send with an explanatory message. Matched leniently (id, name or the
  // "id - name" label) because a reopened draft persists the label, not the raw id.
  const { recordClassificationId, recordClassificationLabel, recordClassificationActive } = state;
  React.useEffect(() => {
    if (!recordClassificationId || recordClassificationActive !== undefined) return undefined;
    let cancelled = false;
    metadataService
      .getRecordClassifications()
      .then((all) => {
        if (cancelled) return;
        const match = all.find(
          (c) =>
            c.id === recordClassificationId ||
            c.name === recordClassificationId ||
            `${c.id} - ${c.name}` === recordClassificationId ||
            (!!recordClassificationLabel &&
              (c.id === recordClassificationLabel ||
                c.name === recordClassificationLabel ||
                `${c.id} - ${c.name}` === recordClassificationLabel))
        );
        setField('recordClassificationActive', !!match);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [
    recordClassificationId,
    recordClassificationLabel,
    recordClassificationActive,
    metadataService,
    setField,
  ]);

  const destinationSelected: ISelectOption[] = state.destinationDepartmentIds.map((id, i) => ({
    id,
    label: state.destinationDepartmentNames[i],
  }));
  const externalOrgsSelected: ISelectOption[] = state.externalOrgIds.map((id, i) => ({
    id,
    label: state.externalOrgNames[i],
  }));
  const recipientsSelected: ISelectOption[] = state.recipientIds.map((id, i) => ({
    id,
    label: state.recipientNames[i],
  }));

  return (
    <div className={styles.grid}>
      {/* 1 */}
      <div className={styles.field}>
        <FieldLabel label={t('createCorrespondence.field.correspondenceType')} required />
        <select
          className={styles.select}
          value={state.correspondenceType}
          onChange={(e) => form.setCorrespondenceType(e.target.value as 'Outgoing' | 'Incoming')}
        >
          {correspondenceTypeOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* 2 */}
      <div className={styles.field}>
        <FieldLabel label={t('createCorrespondence.field.priority')} required />
        <select
          className={styles.select}
          value={state.priority}
          onChange={(e) => setField('priority', e.target.value as 'Normal' | 'High')}
        >
          <option value="Normal">{t('createCorrespondence.field.normal')}</option>
          <option value="High">{t('createCorrespondence.field.high')}</option>
        </select>
      </div>

      {/* 3 — Content Type (left) and Channel (right) share one row. */}
      <div className={styles.field}>
        <FieldLabel label={t('createCorrespondence.field.contentType')} />
        <SearchableSelect
          placeholder={t('createCorrespondence.field.contentTypePlaceholder')}
          fetchOptions={async (query) => {
            const results = await metadataService.getContentTypes(query);
            return results.map((r) => ({ id: r.id, label: r.name }));
          }}
          selected={
            state.contentTypeId ? [{ id: state.contentTypeId, label: state.contentTypeName ?? '' }] : []
          }
          onChange={(selected) => {
            setField('contentTypeId', selected[0]?.id);
            setField('contentTypeName', selected[0]?.label);
          }}
        />
      </div>

      {/* 3b — Channel: how the correspondence was received (single-select, admin-managed options). */}
      <div className={styles.field}>
        <FieldLabel label={t('createCorrespondence.field.channel')} />
        <select
          className={styles.select}
          value={state.channel ?? ''}
          onChange={(e) => setField('channel', e.target.value || undefined)}
        >
          <option value="">{t('createCorrespondence.field.channelPlaceholder')}</option>
          {channelOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* 4 */}
      <div className={`${styles.field} ${styles.fullWidth}`}>
        <FieldLabel label={t('createCorrespondence.field.subject')} required />
        <input
          type="text"
          className={styles.input}
          data-validation-field="subject"
          aria-invalid={!!errors.subject}
          value={state.subject}
          placeholder={t('createCorrespondence.field.subjectPlaceholder')}
          onChange={(e) => setField('subject', e.target.value)}
        />
        {errors.subject && <span className={styles.error}>{t(errors.subject)}</span>}
      </div>

      {/* 5 */}
      <div className={styles.field}>
        <FieldLabel label={t('createCorrespondence.field.originatingFunction')} />
        <select
          className={styles.select}
          value={state.originatingFunction ?? ''}
          onChange={(e) => setField('originatingFunction', e.target.value || undefined)}
        >
          <option value="">{t('createCorrespondence.field.selectFunctionPlaceholder')}</option>
          {originatingFunctions.map((fn) => (
            <option key={fn.id} value={fn.id}>
              {fn.label}
            </option>
          ))}
        </select>
      </div>

      {/* 6 */}
      <div className={styles.field}>
        <FieldLabel label={t('createCorrespondence.field.referenceNumber')} />
        <input
          type="text"
          className={styles.input}
          readOnly
          value={state.referenceNumber ?? ''}
          placeholder={t('createCorrespondence.field.referenceNumberPlaceholder')}
        />
      </div>

      {/* 7 */}
      <div className={styles.field}>
        <FieldLabel label={t('createCorrespondence.field.sender')} required />
        <SearchableSelect
          placeholder={t('createCorrespondence.field.sender')}
          validationField="sender"
          invalid={!!errors.sender}
          fetchOptions={async (query) => {
            const results = await sharePointService.searchPeople(query);
            return results.map((person) => ({ id: person.id, label: person.name, sublabel: person.email }));
          }}
          selected={state.sender ? [{ id: state.senderId ?? state.sender, label: state.sender }] : []}
          onChange={(selected) => {
            const sender = selected[0];
            setField('sender', sender?.label ?? '');
            setField('senderId', sender?.id);
          }}
        />
        {errors.sender && <span className={styles.error}>{t(errors.sender)}</span>}
      </div>

      {/* 8 */}
      <div className={styles.field}>
        <FieldLabel label={t('createCorrespondence.field.recipient')} required />
        <SearchableSelect
          placeholder={t('createCorrespondence.field.recipientPlaceholder')}
          multiple
          fetchOptions={async (query) => {
            const results = await sharePointService.searchPeople(query);
            return results.map((r) => ({ id: r.id, label: r.name, sublabel: r.email }));
          }}
          validationField="recipient"
          invalid={!!errors.recipient}
          selected={recipientsSelected}
          onChange={(selected) => {
            const removed = recipientsSelected.filter((s) => !selected.some((n) => n.id === s.id));
            const added = selected.filter((s) => !recipientsSelected.some((n) => n.id === s.id));
            removed.forEach((r) => form.toggleRecipient(r.id, r.label));
            added.forEach((a) => form.toggleRecipient(a.id, a.label));
          }}
        />
        {errors.recipient && <span className={styles.error}>{t(errors.recipient)}</span>}
      </div>

      {/* 9 — Date Created is system-assigned (the creation date), never user-editable. */}
      <div className={styles.field}>
        <FieldLabel label={t('createCorrespondence.field.dateCreated')} />
        <input type="date" className={styles.input} value={state.dateCreated} readOnly disabled />
      </div>

      {/* 10 */}
      <div className={styles.field}>
        <FieldLabel label={t('createCorrespondence.field.dueDate')} />
        <input
          type="date"
          className={styles.input}
          value={state.dueDate ?? ''}
          onChange={(e) => setField('dueDate', e.target.value)}
        />
      </div>

      {/* 11 */}
      <div className={`${styles.field} ${styles.fullWidth}`}>
        <FieldLabel label={t('createCorrespondence.field.securityLevel')} required />
        <SecurityLevelPills
          value={state.securityTier}
          maxClearanceTier={maxClearanceTier}
          levels={securityLevels}
          restrictedFromTier={isVetted ? undefined : classifiedCaptureThreshold}
          onChange={(tier) => setField('securityTier', tier)}
          validationField={errors.securityTier || errors.classifiedCapture ? 'securityTier' : undefined}
          invalid={!!errors.securityTier || !!errors.classifiedCapture}
          ariaLabel={t('createCorrespondence.field.securityLevel')}
        />
        {errors.securityTier && <span className={styles.error}>{t(errors.securityTier)}</span>}
        {(errors.classifiedCapture ||
          (!isVetted && isClassifiedCaptureTier(state.securityTier, classifiedCaptureThreshold))) && (
          <span className={styles.error}>
            {t('createCorrespondence.validation.classifiedCaptureNotVetted')}
          </span>
        )}
      </div>

      {/* 12 */}
      <div className={`${styles.field} ${styles.fullWidth}`}>
        <FieldLabel label={t('createCorrespondence.field.recordClassification')} required />
        <SearchableSelect
          placeholder={t('createCorrespondence.field.recordClassificationPlaceholder')}
          helperText={t('createCorrespondence.field.recordClassificationHelper')}
          errorText={
            classificationLoadError
              ? t('createCorrespondence.field.recordClassificationLoadError')
              : undefined
          }
          fetchOptions={async (query) => {
            try {
              const results = await metadataService.getRecordClassifications(query);
              setClassificationLoadError(false);
              // CMS-034 AC2 — only offer classifications the user's clearance permits (an unknown
              // level is treated as allowed). Cache the resolved rows so a pick can carry the chosen
              // one's active flag into form state (AC3) without another round-trip.
              const permitted = filterRecordClassificationsByClearance(results, maxClearanceTier);
              permitted.forEach((r) => classificationCacheRef.current.set(r.id, r));
              // Customer requirement: the DDL shows "RH_Number - LinkTitle" (English) or
              // "RH_Number - RH_ArabicName" (Arabic), sourced from RH_Aggregations.
              return permitted.map((r) => {
                const displayName = (preferArabic ? r.nameAr || r.name : r.name) || r.name;
                const label = r.recordNumber ? `${r.recordNumber} - ${displayName}` : displayName;
                return { id: r.id, label };
              });
            } catch {
              setClassificationLoadError(true);
              throw new Error('Classification source unavailable');
            }
          }}
          validationField="recordClassification"
          invalid={!!errors.recordClassification}
          selected={
            state.recordClassificationId
              ? [{ id: state.recordClassificationId, label: state.recordClassificationLabel ?? '' }]
              : []
          }
          onChange={(selected) => {
            const picked = selected[0];
            setField('recordClassificationId', picked?.id);
            setField('recordClassificationLabel', picked?.label);
            // Picked from the active-only list, so its active state is known immediately (AC3).
            setField(
              'recordClassificationActive',
              picked ? (classificationCacheRef.current.get(picked.id)?.active ?? true) : undefined
            );
          }}
        />
        {errors.recordClassification && (
          <span className={styles.error}>{t(errors.recordClassification)}</span>
        )}
      </div>

      {/* 13 */}
      <div className={`${styles.field} ${styles.fullWidth}`}>
        <FieldLabel label={t('createCorrespondence.field.destinationType')} required />
        <div className={styles.segmented}>
          <button
            type="button"
            className={`${styles.segmentButton} ${state.destinationType === 'Internal' ? styles.segmentButtonActive : ''}`}
            onClick={() => setDestinationType('Internal')}
          >
            <Building2 size={14} /> {t('createCorrespondence.field.internal')}
          </button>
          <button
            type="button"
            className={`${styles.segmentButton} ${state.destinationType === 'External' ? styles.segmentButtonActive : ''}`}
            onClick={() => setDestinationType('External')}
          >
            <Globe2 size={14} /> {t('createCorrespondence.field.external')}
          </button>
        </div>
      </div>

      {/* 14 */}
      <div className={`${styles.field} ${styles.fullWidth}`}>
        {state.destinationType === 'Internal' ? (
          <>
            <FieldLabel label={t('createCorrespondence.field.destinationDepartments')} required />
            <SearchableSelect
              placeholder={t('createCorrespondence.field.destinationDepartmentsPlaceholder')}
              multiple
              fetchOptions={async (query) => {
                const results = await metadataService.getDestinationDepartments(query);
                // Show the Arabic department name (RH_DepartmentNameAR) under the Arabic UI, the
                // English one (RH_DepartmentName) otherwise — falling back to whichever exists.
                return results.map((r) => ({
                  id: r.id,
                  label: (preferArabic ? r.nameAr : r.name) || r.name || r.nameAr || '',
                }));
              }}
              validationField="destination"
              invalid={!!errors.destination}
              selected={destinationSelected}
              onChange={(selected) => {
                const removed = destinationSelected.filter((s) => !selected.some((n) => n.id === s.id));
                const added = selected.filter((s) => !destinationSelected.some((n) => n.id === s.id));
                removed.forEach((r) => toggleDestinationDepartment(r.id, r.label));
                added.forEach((a) => toggleDestinationDepartment(a.id, a.label));
              }}
            />
          </>
        ) : (
          <>
            <FieldLabel label={t('createCorrespondence.field.externalOrganizations')} required />
            <SearchableSelect
              placeholder={t('createCorrespondence.field.externalOrganizationsPlaceholder')}
              multiple
              fetchOptions={async (query) => {
                const results = await externalOrgsService.getExternalOrganizations(query);
                return results.map((r) => ({ id: r.id, label: r.name }));
              }}
              validationField="destination"
              invalid={!!errors.destination}
              selected={externalOrgsSelected}
              onChange={(selected) => {
                const removed = externalOrgsSelected.filter((s) => !selected.some((n) => n.id === s.id));
                const added = selected.filter((s) => !externalOrgsSelected.some((n) => n.id === s.id));
                removed.forEach((r) => toggleExternalOrg(r.id, r.label));
                added.forEach((a) => toggleExternalOrg(a.id, a.label));
              }}
            />
          </>
        )}
        {errors.destination && <span className={styles.error}>{t(errors.destination)}</span>}
      </div>

      {/* 15 */}
      <div className={styles.field}>
        <span className={styles.label}>{t('createCorrespondence.field.deliveryOptions')}</span>
        <div className={styles.deliveryOptionsGroup}>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={state.deliveryEmail}
              onChange={(e) => setField('deliveryEmail', e.target.checked)}
            />
            <span>
              {t('createCorrespondence.field.email')}
              <span className={styles.checkboxHelper}>{t('createCorrespondence.field.emailHelper')}</span>
            </span>
          </label>
          <label className={styles.checkboxRow}>
            <input
              type="checkbox"
              checked={state.deliveryPhysicalMail}
              onChange={(e) => handleTogglePhysicalMail(e.target.checked)}
            />
            <span>
              {t('createCorrespondence.field.physicalMail')}
              <span className={styles.checkboxHelper}>
                {t('createCorrespondence.field.physicalMailHelper')}
              </span>
            </span>
          </label>

          {state.deliveryPhysicalMail &&
            (state.physicalDispatch ? (
              <div className={styles.dispatchSummary}>
                <Check size={14} className={styles.dispatchSummaryIcon} />
                <span className={styles.dispatchSummaryText}>
                  {t(`physicalMail.method.${state.physicalDispatch.method}.short`)}
                  {physicalDispatchDetail(state.physicalDispatch)
                    ? ` · ${physicalDispatchDetail(state.physicalDispatch)}`
                    : ''}
                </span>
                <button
                  type="button"
                  className={styles.dispatchEditBtn}
                  onClick={() => setDispatchWizardOpen(true)}
                >
                  {t('physicalMail.editDetails')}
                </button>
              </div>
            ) : (
              <div className={styles.dispatchSummary}>
                <span className={styles.dispatchSummaryText}>{t('physicalMail.noneSelected')}</span>
                <button
                  type="button"
                  className={styles.dispatchEditBtn}
                  onClick={() => setDispatchWizardOpen(true)}
                >
                  {t('physicalMail.openWizard')}
                </button>
              </div>
            ))}
        </div>

        <PhysicalMailWizard
          isOpen={dispatchWizardOpen}
          couriers={couriers}
          initial={state.physicalDispatch}
          onDismiss={() => setDispatchWizardOpen(false)}
          onSubmit={(dispatch) => {
            setField('physicalDispatch', dispatch);
            setDispatchWizardOpen(false);
          }}
        />
      </div>

      {/* 16 */}
      <div className={styles.field}>
        <span className={styles.label}>{t('createCorrespondence.field.comments')}</span>
        <textarea
          className={styles.textarea}
          value={state.comments}
          placeholder={t('createCorrespondence.field.commentsPlaceholder')}
          onChange={(e) => setField('comments', e.target.value)}
        />
      </div>
    </div>
  );
};
