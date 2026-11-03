import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { formatCardDateTime } from '../../../utils/formatDateTime';
import { Icon } from '../../../components/icons/Icon';
import { Button } from '../../../components/common/Button';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { SearchableSelect, ISelectOption } from '../../createCorrespondence/components/SearchableSelect';
import { ICorrespondenceStub, SECURITY_TIERS, correspondenceStatusTone } from '../../../models/ICorrespondence';
import { IDestinationDepartment, IRecordClassification } from '../../../models/ICorrespondenceMetadata';
import { useServices } from '../../../state/hooks';
import { ITriageDraft, NEXT_ACTIONS, NextAction } from '../types';
import { IRoutingRecipient, IRoutingSelection, canRoute } from '../routing';
import styles from './ClassifyPanel.module.scss';

export interface IClassifyPanelProps {
  item: ICorrespondenceStub;
  draft: ITriageDraft;
  onDraftChange: (patch: Partial<ITriageDraft>) => void;
  readOnly?: boolean;
  onAmendClassification: () => void;
  onChangeSecurity: () => void;
  routingSelection: IRoutingSelection;
  onRoutingSelectionChange: (next: IRoutingSelection) => void;
  matrixRouting?: IRoutingSelection;
  onRoute: () => void;
  routing: boolean;
}

const URGENCY_DAYS_THRESHOLD = 14;

function daysUntil(dateStr?: string): number | undefined {
  if (!dateStr) return undefined;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

/** A single operational surface: classify the received correspondence, then choose its real route. */
export const ClassifyPanel: React.FC<IClassifyPanelProps> = ({
  item, draft, onDraftChange, readOnly, onAmendClassification, onChangeSecurity,
  routingSelection, onRoutingSelectionChange, matrixRouting, onRoute, routing,
}) => {
  const { t } = useTranslation();
  const { metadataService, sharePointService } = useServices();
  const daysToDue = daysUntil(draft.responseDeadline ?? item.dueDate);
  const showUrgencyNote = daysToDue !== undefined && daysToDue >= 0 && daysToDue <= URGENCY_DAYS_THRESHOLD;
  const securityLevelName = SECURITY_TIERS.find((tier) => tier.tier === draft.securityTier)?.name ?? '';
  const departments = routingSelection.recipients.filter((recipient) => recipient.kind === 'department');
  const individuals = routingSelection.recipients.filter((recipient) => recipient.kind === 'user');

  const setRecipients = (recipients: IRoutingRecipient[]): void =>
    onRoutingSelectionChange({ ...routingSelection, recipients, matrixApplied: false });
  const toOptions = (recipients: IRoutingRecipient[]): ISelectOption[] => recipients.map((recipient) => ({ id: recipient.id, label: recipient.name }));

  return (
    <section className={styles.panel} aria-label={t('triageRouting.classify.classifyAndRoute')}>
      <header className={styles.headerRow}>
        <div>
          <h2 className={styles.subject}>{item.subject}</h2>
          <div className={styles.metaLine}>
            {item.referenceNumber || t('myCorrespondence.draftNotRegistered')} · {item.department} · {formatCardDateTime(item.createdAt)}
          </div>
          {showUrgencyNote && <div className={styles.urgencyNote}><Icon name="alertTriangle" size={12} />{t('triageRouting.classify.urgencyNote', { days: daysToDue })}</div>}
        </div>
        <div className={styles.headerRight}>
          <StatusBadge label={item.status} tone={correspondenceStatusTone(item.status)} />
          {securityLevelName && <StatusBadge label={securityLevelName} tone="neutral" />}
        </div>
      </header>

      {readOnly && <div className={styles.lockedNote}><Icon name="shieldCheck" size={14} />{t('triageRouting.classify.lockedNote')}</div>}

      <div className={styles.sectionHeaderRow}>
        <div>
          <h3 className={styles.sectionTitle}>{t('triageRouting.classify.classificationDetails')}</h3>
          <p className={styles.sectionDescription}>{t('triageRouting.classify.classificationHelper')}</p>
        </div>
        {!readOnly && <button type="button" className={styles.amendBtn} onClick={onAmendClassification}><Icon name="pencil" size={13} />{t('triageRouting.classify.amend')}</button>}
      </div>

      <div className={styles.grid}>
        <div className={styles.field}>
          <div className={styles.labelRow}><span className={styles.label}>{t('triageRouting.classify.contentType')}</span><span className={styles.badge}>{t('createCorrespondence.badge.recordHubApi')}</span></div>
          <SearchableSelect
            placeholder={t('createCorrespondence.field.contentTypePlaceholder')}
            disabled={readOnly}
            fetchOptions={async (query) => (await metadataService.getContentTypes(query)).map((result): ISelectOption => ({ id: result.id, label: result.name }))}
            selected={draft.contentTypeName ? [{ id: draft.contentTypeId ?? draft.contentTypeName, label: draft.contentTypeName }] : []}
            onChange={(selected) => onDraftChange({ contentTypeId: selected[0]?.id, contentTypeName: selected[0]?.label })}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{t('triageRouting.classify.priority')}</span>
          <select className={styles.select} value={draft.priority} disabled={readOnly} onChange={(e) => onDraftChange({ priority: e.target.value as 'Normal' | 'High' })}>
            <option value="Normal">{t('createCorrespondence.field.normal')}</option><option value="High">{t('createCorrespondence.field.high')}</option>
          </select>
        </div>
        <div className={styles.field}>
          <div className={styles.labelRow}><span className={styles.label}>{t('triageRouting.classify.securityLevel')}</span><span className={styles.badge}>{t('createCorrespondence.badge.securityLevelsApi')}</span></div>
          <div className={styles.securityRow}>
            <StatusBadge label={securityLevelName || t('triageRouting.classify.selectPlaceholder')} tone="neutral" />
            {!readOnly && <button type="button" className={styles.changeLink} onClick={onChangeSecurity}>{t('triageRouting.classify.changeSecurity')}</button>}
          </div>
        </div>
        <div className={styles.field}>
          <div className={styles.labelRow}><span className={styles.label}>{t('triageRouting.classify.recordClassification')}</span><span className={styles.badge}>{t('createCorrespondence.badge.recordHubApi')}</span></div>
          <SearchableSelect
            placeholder={t('createCorrespondence.field.recordClassificationPlaceholder')}
            loadErrorText={t('triageRouting.classify.recordClassificationLoadError')}
            disabled={readOnly}
            fetchOptions={async (query) => (await metadataService.getRecordClassifications(query)).map((result: IRecordClassification): ISelectOption => ({ id: result.id, label: `${result.recordNumber} — ${result.name}` }))}
            selected={draft.recordClassificationId ? [{ id: draft.recordClassificationId, label: draft.recordClassificationLabel ?? '' }] : []}
            onChange={(selected) => onDraftChange({ recordClassificationId: selected[0]?.id, recordClassificationLabel: selected[0]?.label })}
          />
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{t('triageRouting.classify.responseDeadline')}</span>
          <input type="date" className={styles.select} disabled={readOnly} value={draft.responseDeadline ?? ''} onChange={(e) => onDraftChange({ responseDeadline: e.target.value || undefined })} />
          <div className={styles.helper}>{t('triageRouting.classify.responseDeadlineHelper')}</div>
        </div>
      </div>

      {!readOnly && (
        <div className={styles.routingSection}>
          <div className={styles.sectionHeaderRow}>
            <div><h3 className={styles.sectionTitle}>{t('triageRouting.classify.routingDetails')}</h3><p className={styles.sectionDescription}>{t('triageRouting.classify.routingHelper')}</p></div>
            {matrixRouting && <button type="button" className={styles.matrixBtn} onClick={() => onRoutingSelectionChange({ ...matrixRouting })}><Icon name="workflow" size={13} />{t('triageRouting.route.applyMatrix')}</button>}
          </div>
          {matrixRouting && <div className={styles.matrixHint}><Icon name="arrow" size={13} />{t('triageRouting.route.matrixHint', { recipients: matrixRouting.recipients.map((recipient) => recipient.name).join(', '), action: t(`triageRouting.classify.nextActionOption.${matrixRouting.nextAction ?? 'Review'}`) })}</div>}
          <div className={styles.routeGrid}>
            <div className={styles.field}>
              <span className={styles.label}>{t('triageRouting.route.departments')}</span>
              <SearchableSelect multiple placeholder={t('createCorrespondence.field.destinationDepartmentsPlaceholder')} selected={toOptions(departments)} fetchOptions={async (query) => (await metadataService.getDestinationDepartments(query)).map((result: IDestinationDepartment): ISelectOption => ({ id: result.id, label: result.name }))} onChange={(options) => setRecipients([...individuals, ...options.map((option): IRoutingRecipient => ({ id: option.id, name: option.label, kind: 'department' }))])} />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>{t('triageRouting.route.individuals')}</span>
              <SearchableSelect multiple placeholder={t('triageRouting.route.individualsPlaceholder')} selected={toOptions(individuals)} fetchOptions={async (query) => (await sharePointService.searchPeople(query)).map((result): ISelectOption => ({ id: result.id, label: result.name, sublabel: result.email }))} onChange={(options) => setRecipients([...departments, ...options.map((option): IRoutingRecipient => ({ id: option.id, name: option.label, kind: 'user' }))])} />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>{t('triageRouting.route.nextAction')}</span>
              <select className={styles.select} value={routingSelection.nextAction ?? ''} onChange={(e) => onRoutingSelectionChange({ ...routingSelection, nextAction: (e.target.value || undefined) as NextAction, matrixApplied: false })}>
                <option value="">{t('triageRouting.classify.selectPlaceholder')}</option>
                {NEXT_ACTIONS.map((action) => <option key={action} value={action}>{t(`triageRouting.classify.nextActionOption.${action}`)}</option>)}
              </select>
              <div className={styles.helper}>{t('triageRouting.route.nextActionHelper')}</div>
            </div>
          </div>
          <div className={styles.routeFooter}>
            {routingSelection.matrixApplied && <span className={styles.matrixBadge}>{t('triageRouting.route.matrixApplied')}</span>}
            <Button variant="primary" disabled={!canRoute(routingSelection) || routing} onClick={onRoute}>{routing ? t('triageRouting.route.routing') : t('triageRouting.route.routeButton')}</Button>
          </div>
        </div>
      )}
    </section>
  );
};
