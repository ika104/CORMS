import * as React from 'react';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Spinner } from '../../../components/common/Spinner';
import { useServices, useNav } from '../../../state/hooks';
import { ApprovalWorkflowSection } from '../../createCorrespondence/sections/ApprovalWorkflowSection';
import { useCreateCorrespondenceForm } from '../../createCorrespondence/state/useCreateCorrespondenceForm';
import {
  APPROVAL_WORKFLOWS_CONFIG_KEY,
  IApprovalWorkflow,
  isDefaultApprovalWorkflow,
  parseApprovalWorkflowsJson,
  serializeApprovalWorkflows,
} from '../../createCorrespondence/state/approvalWorkflows';
import styles from './ApprovalWorkflowsPanel.module.scss';

function nowTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 16);
}

/**
 * Administrator-owned editor for the saved workflow catalogue. The editor deliberately reuses
 * Create Correspondence's chain builder, so reviewer/department/group selection, approval modes,
 * signing, and ordering produce exactly the same contract that correspondence submission uses.
 */
const ApprovalWorkflowsPanel: React.FC = () => {
  const { t } = useTranslation();
  const { adminConfigService, auditTrailService } = useServices();
  const { currentUser } = useNav();
  const form = useCreateCorrespondenceForm('');
  const [workflows, setWorkflows] = React.useState<IApprovalWorkflow[] | undefined>(undefined);
  const [hasConfigEntry, setHasConfigEntry] = React.useState(false);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | undefined>(undefined);
  const [name, setName] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const load = React.useCallback(() => {
    setWorkflows(undefined);
    adminConfigService
      .getEntries()
      .then((entries) => {
        const entry = entries.find((item) => item.key === APPROVAL_WORKFLOWS_CONFIG_KEY);
        setHasConfigEntry(!!entry);
        setWorkflows(parseApprovalWorkflowsJson(entry?.value));
      })
      .catch(() => {
        setHasConfigEntry(false);
        setWorkflows(parseApprovalWorkflowsJson(undefined));
      });
  }, [adminConfigService]);

  React.useEffect(() => load(), [load]);

  const startEdit = (workflow: IApprovalWorkflow): void => {
    setEditorOpen(true);
    setEditingId(workflow.id);
    setName(workflow.name);
    setError(undefined);
    form.replaceApprovalSteps(workflow.steps);
  };

  const startAdd = (): void => {
    setEditorOpen(true);
    setEditingId(undefined);
    setName('');
    setError(undefined);
    form.replaceApprovalSteps([]);
  };

  const cancel = (): void => {
    setEditorOpen(false);
    setEditingId(undefined);
    setName('');
    setError(undefined);
    form.replaceApprovalSteps([]);
  };

  const persist = (nextWorkflows: IApprovalWorkflow[], action: string): void => {
    setSaving(true);
    const value = serializeApprovalWorkflows(nextWorkflows);
    const write = hasConfigEntry
      ? adminConfigService.saveEntry(APPROVAL_WORKFLOWS_CONFIG_KEY, value)
      : adminConfigService.addEntry({
          key: APPROVAL_WORKFLOWS_CONFIG_KEY,
          value,
          description: 'Predefined approval workflows for Create Correspondence, stored as JSON.',
          category: 'Integration',
        });
    write
      .then(() => {
        setWorkflows(parseApprovalWorkflowsJson(value));
        setHasConfigEntry(true);
        return auditTrailService.logEvent({
          objectId: APPROVAL_WORKFLOWS_CONFIG_KEY,
          actor: currentUser?.displayName ?? 'Unknown',
          action,
          details: `Saved ${nextWorkflows.length} predefined approval workflows.`,
          timestamp: nowTimestamp(),
        });
      })
      .then(cancel)
      .catch(() => setError(t('approvalWorkflows.saveFailed')))
      .finally(() => setSaving(false));
  };

  const save = (): void => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('approvalWorkflows.nameRequired'));
      return;
    }
    const id = editingId ?? `workflow-${Date.now()}`;
    const duplicate = (workflows ?? []).some((workflow) => workflow.id !== id && workflow.name.toLowerCase() === trimmedName.toLowerCase());
    if (duplicate) {
      setError(t('approvalWorkflows.nameDuplicate'));
      return;
    }
    const updated: IApprovalWorkflow = { id, name: trimmedName, steps: form.state.approvalSteps };
    const next = editingId
      ? (workflows ?? []).map((workflow) => (workflow.id === editingId ? updated : workflow))
      : [...(workflows ?? []), updated];
    persist(next, editingId ? 'Approval Workflow Updated' : 'Approval Workflow Added');
  };

  const remove = (workflow: IApprovalWorkflow): void => {
    if (isDefaultApprovalWorkflow(workflow.id) || !window.confirm(t('approvalWorkflows.confirmDelete', { name: workflow.name }))) return;
    persist((workflows ?? []).filter((item) => item.id !== workflow.id), 'Approval Workflow Deleted');
  };

  if (!workflows) {
    return (
      <div className={styles.panel}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>{t('approvalWorkflows.panelTitle')}</h2>
          <p className={styles.description}>{t('approvalWorkflows.description')}</p>
        </div>
        {!editorOpen && (
          <button type="button" className={styles.primaryButton} onClick={startAdd}>
            <Plus size={14} /> {t('approvalWorkflows.add')}
          </button>
        )}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {editorOpen && (
        <div className={styles.editor}>
          <h3 className={styles.editorTitle}>{editingId ? t('approvalWorkflows.editTitle') : t('approvalWorkflows.addTitle')}</h3>
          <label className={styles.field}>
            <span className={styles.label}>{t('approvalWorkflows.name')}</span>
            <input
              className={styles.input}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setError(undefined);
              }}
              placeholder={t('approvalWorkflows.namePlaceholder')}
              autoFocus
            />
          </label>
          <div className={styles.builderLabel}>{t('approvalWorkflows.steps')}</div>
          <ApprovalWorkflowSection form={form} showPresets={false} />
          <div className={styles.editorActions}>
            <button type="button" className={styles.secondaryButton} onClick={cancel} disabled={saving}>
              <X size={14} /> {t('common.cancel')}
            </button>
            <button type="button" className={styles.primaryButton} onClick={save} disabled={saving}>
              <Check size={14} /> {t('common.save')}
            </button>
          </div>
        </div>
      )}

      <div className={styles.workflowList}>
        {workflows.map((workflow) => (
          <article key={workflow.id} className={styles.workflowRow}>
            <div>
              <h3 className={styles.workflowName}>{workflow.name}</h3>
              <p className={styles.workflowMeta}>{t('approvalWorkflows.stepCount', { count: workflow.steps.length })}</p>
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.iconButton} onClick={() => startEdit(workflow)} aria-label={t('common.edit')} disabled={saving}>
                <Pencil size={14} />
              </button>
              {!isDefaultApprovalWorkflow(workflow.id) && (
                <button type="button" className={styles.iconButtonDanger} onClick={() => remove(workflow)} aria-label={t('approvalWorkflows.delete')} disabled={saving}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default ApprovalWorkflowsPanel;
