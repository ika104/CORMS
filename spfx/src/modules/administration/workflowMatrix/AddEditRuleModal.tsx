import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { CONDITION_ANY, IWorkflowRule, ROUTING_TARGET_KINDS, RoutingTargetKind } from '../../../models/IWorkflowRule';
import { SECURITY_TIERS } from '../../../models/ICorrespondence';
import { useServices } from '../../../state/hooks';
import { IContentType, IDestinationDepartment, IOriginatingFunction } from '../../../models/ICorrespondenceMetadata';
import styles from './AddEditRuleModal.module.scss';

export interface IAddEditRuleModalProps {
  isOpen: boolean;
  onDismiss: () => void;
  rule?: IWorkflowRule;
  nextOrder: number;
  onSave: (rule: IWorkflowRule) => void;
}

function blankRule(nextOrder: number): IWorkflowRule {
  return {
    id: `wm-new-${Date.now()}`,
    type: CONDITION_ANY,
    direction: CONDITION_ANY,
    priority: CONDITION_ANY,
    securityLevel: CONDITION_ANY,
    function: CONDITION_ANY,
    departmentCondition: CONDITION_ANY,
    targetKind: 'department',
    department: '',
    flow: [],
    approver: '',
    rule: '',
    note: '',
    order: nextOrder,
  };
}

// TODO(confirm): Add/Edit Rule modal and Test Mode toggle are not shown in the current
// prototype capture — built per the story text (CMS-012); reconcile against Figma once that
// state exists.
export const AddEditRuleModal: React.FC<IAddEditRuleModalProps> = ({ isOpen, onDismiss, rule, nextOrder, onSave }) => {
  const { t } = useTranslation();
  const { metadataService } = useServices();
  const [draft, setDraft] = React.useState<IWorkflowRule>(rule ?? blankRule(nextOrder));
  const [flowText, setFlowText] = React.useState((rule?.flow ?? []).join(', '));
  const [departments, setDepartments] = React.useState<IDestinationDepartment[]>([]);
  const [contentTypes, setContentTypes] = React.useState<IContentType[]>([]);
  const [functions, setFunctions] = React.useState<IOriginatingFunction[]>([]);

  React.useEffect(() => {
    if (!isOpen) return;
    setDraft(rule ?? blankRule(nextOrder));
    setFlowText((rule?.flow ?? []).join(', '));
  }, [isOpen, rule, nextOrder]);

  // The modal stays mounted (closed) alongside the grid, so the option lists are only fetched
  // once the admin actually opens it rather than on every visit to the Workflow Matrix screen.
  React.useEffect(() => {
    if (!isOpen) return;
    metadataService.getDestinationDepartments().then(setDepartments).catch(() => setDepartments([]));
    metadataService.getContentTypes().then(setContentTypes).catch(() => setContentTypes([]));
    metadataService.getOriginatingFunctions().then(setFunctions).catch(() => setFunctions([]));
  }, [isOpen, metadataService]);

  const set = <K extends keyof IWorkflowRule>(key: K, value: IWorkflowRule[K]): void =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const canSave = draft.department.trim() !== '' && draft.rule.trim() !== '' && flowText.trim() !== '';

  const handleSave = (): void => {
    if (!canSave) return;
    onSave({
      ...draft,
      flow: flowText
        .split(/[,>]|→/)
        .map((step) => step.trim())
        .filter(Boolean),
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onDismiss={onDismiss}
      title={rule ? t('workflowMatrix.modal.editTitle') : t('workflowMatrix.modal.addTitle')}
      width={640}
      footer={
        <>
          <Button variant="default" text={t('common.cancel')} onClick={onDismiss} />
          <Button variant="primary" disabled={!canSave} text={t('workflowMatrix.modal.save')} onClick={handleSave} />
        </>
      }
    >
      <div className={styles.grid}>
        <div className={styles.field}>
          <span className={styles.label}>{t('workflowMatrix.col.type')}</span>
          <select className={styles.select} value={draft.type} onChange={(e) => set('type', e.target.value)}>
            <option value={CONDITION_ANY}>{t('workflowMatrix.condition.any')}</option>
            {contentTypes.map((ct) => (
              <option key={ct.id} value={ct.name}>
                {ct.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t('workflowMatrix.col.direction')}</span>
          <select
            className={styles.select}
            value={draft.direction}
            onChange={(e) => set('direction', e.target.value as IWorkflowRule['direction'])}
          >
            <option value={CONDITION_ANY}>{t('workflowMatrix.condition.any')}</option>
            <option value="Incoming">{t('createCorrespondence.field.incoming')}</option>
            <option value="Outgoing">{t('createCorrespondence.field.outgoing')}</option>
            <option value="External">{t('workflowMatrix.condition.external')}</option>
          </select>
        </div>

        {/* AC4 — route to a department, an individual, or a role group. */}
        <div className={styles.field}>
          <span className={styles.label}>{t('workflowMatrix.modal.routeToKind')}</span>
          <select
            className={styles.select}
            value={draft.targetKind ?? 'department'}
            onChange={(e) => set('targetKind', e.target.value as RoutingTargetKind)}
          >
            {ROUTING_TARGET_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {t(`workflowMatrix.targetKind.${kind}`)}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t('workflowMatrix.modal.routeTo')}</span>
          {(draft.targetKind ?? 'department') === 'department' ? (
            <select className={styles.select} value={draft.department} onChange={(e) => set('department', e.target.value)}>
              <option value="">{t('triageRouting.classify.selectPlaceholder')}</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.name}>
                  {dept.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              className={styles.input}
              value={draft.department}
              placeholder={t('workflowMatrix.modal.routeToPlaceholder')}
              onChange={(e) => set('department', e.target.value)}
            />
          )}
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t('createCorrespondence.field.priority')}</span>
          <select
            className={styles.select}
            value={draft.priority}
            onChange={(e) => set('priority', e.target.value as IWorkflowRule['priority'])}
          >
            <option value={CONDITION_ANY}>{t('workflowMatrix.condition.any')}</option>
            <option value="Normal">{t('createCorrespondence.field.normal')}</option>
            <option value="High">{t('createCorrespondence.field.high')}</option>
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t('createCorrespondence.field.securityLevel')}</span>
          <select className={styles.select} value={draft.securityLevel} onChange={(e) => set('securityLevel', e.target.value)}>
            <option value={CONDITION_ANY}>{t('workflowMatrix.condition.any')}</option>
            {SECURITY_TIERS.map((tier) => (
              <option key={tier.tier} value={tier.name}>
                {tier.name}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t('createCorrespondence.field.originatingFunction')}</span>
          <select className={styles.select} value={draft.function} onChange={(e) => set('function', e.target.value)}>
            <option value={CONDITION_ANY}>{t('workflowMatrix.condition.any')}</option>
            {functions.map((fn) => (
              <option key={fn.id} value={fn.name}>
                {fn.name}
              </option>
            ))}
          </select>
        </div>

        {/* AC3 — the item's own (source) department as a match condition. */}
        <div className={styles.field}>
          <span className={styles.label}>{t('workflowMatrix.modal.departmentCondition')}</span>
          <select
            className={styles.select}
            value={draft.departmentCondition ?? CONDITION_ANY}
            onChange={(e) => set('departmentCondition', e.target.value)}
          >
            <option value={CONDITION_ANY}>{t('workflowMatrix.condition.any')}</option>
            {departments.map((dept) => (
              <option key={dept.id} value={dept.name}>
                {dept.name}
              </option>
            ))}
          </select>
        </div>

        <div className={`${styles.field} ${styles.fullWidth}`}>
          <span className={styles.label}>{t('workflowMatrix.col.flow')}</span>
          <input
            type="text"
            className={styles.input}
            value={flowText}
            placeholder={t('workflowMatrix.modal.flowPlaceholder')}
            onChange={(e) => setFlowText(e.target.value)}
          />
          <span className={styles.helper}>{t('workflowMatrix.modal.flowHelper')}</span>
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t('workflowMatrix.col.approver')}</span>
          <input type="text" className={styles.input} value={draft.approver} onChange={(e) => set('approver', e.target.value)} />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t('workflowMatrix.col.rule')}</span>
          <input type="text" className={styles.input} value={draft.rule} onChange={(e) => set('rule', e.target.value)} />
        </div>

        <div className={`${styles.field} ${styles.fullWidth}`}>
          <span className={styles.label}>{t('workflowMatrix.col.note')}</span>
          <input type="text" className={styles.input} value={draft.note} onChange={(e) => set('note', e.target.value)} />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t('workflowMatrix.modal.order')}</span>
          <input
            type="number"
            className={styles.input}
            value={draft.order}
            onChange={(e) => set('order', Number(e.target.value) || 0)}
          />
          <span className={styles.helper}>{t('workflowMatrix.modal.orderHelper')}</span>
        </div>

      </div>
    </Modal>
  );
};
