import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { DataGrid, DataGridColumn } from '../../../components/grid/DataGrid';
import { ActionsMenu, IActionsMenuItem } from '../../../components/common/ActionsMenu';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { Icon } from '../../../components/icons/Icon';
import { CONDITION_ANY, IWorkflowRule, RoutingMatchMode } from '../../../models/IWorkflowRule';
import { SECURITY_TIERS } from '../../../models/ICorrespondence';
import { resolveWorkflowRules } from '../../../utils/workflowRouting';
import { useServices } from '../../../state/hooks';
import { AddEditRuleModal } from './AddEditRuleModal';
import styles from './WorkflowMatrixPanel.module.scss';

/** AC5 — the matrix-wide match mode lives in CORMS_AdminConfig, so it persists and applies to
 * all rule resolution rather than being a per-rule flag. */
const MATCH_MODE_KEY = 'routing.matchMode';

interface IWorkflowRuleRow extends IWorkflowRule {
  flowText: string;
  routeToText: string;
}

interface ITestCriteria {
  type: string;
  direction: string;
  priority: string;
  securityLevel: string;
  function: string;
  department: string;
}

const BLANK_TEST_CRITERIA: ITestCriteria = {
  type: CONDITION_ANY,
  direction: CONDITION_ANY,
  priority: CONDITION_ANY,
  securityLevel: CONDITION_ANY,
  function: CONDITION_ANY,
  department: CONDITION_ANY,
};

// TODO(confirm): Add/Edit Rule modal and Test Mode toggle are not shown in the current
// prototype capture — built per the story text (CMS-012); reconcile against Figma once that
// state exists.
const WorkflowMatrixPanel: React.FC = () => {
  const { t } = useTranslation();
  const { workflowMatrixService, adminConfigService } = useServices();

  const [rules, setRules] = React.useState<IWorkflowRule[] | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [modalRule, setModalRule] = React.useState<IWorkflowRule | undefined>(undefined);
  const [modalOpen, setModalOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<IWorkflowRule | undefined>(undefined);
  const [testMode, setTestMode] = React.useState(false);
  const [testCriteria, setTestCriteria] = React.useState<ITestCriteria>(BLANK_TEST_CRITERIA);
  // AC5 — matrix-wide first-match / all-match, persisted in CORMS_AdminConfig.
  const [matchMode, setMatchMode] = React.useState<RoutingMatchMode>('first-match');

  React.useEffect(() => {
    adminConfigService
      .getEntries()
      .then((entries) => {
        const entry = entries.find((e) => e.key === MATCH_MODE_KEY);
        if (entry?.value === 'all-match' || entry?.value === 'first-match') setMatchMode(entry.value);
      })
      .catch(() => undefined);
  }, [adminConfigService]);

  const changeMatchMode = (mode: RoutingMatchMode): void => {
    setMatchMode(mode);
    // Persist immediately so it takes effect for all routing resolution (AC7).
    adminConfigService.saveEntry(MATCH_MODE_KEY, mode).catch(() => undefined);
  };

  const fetchData = React.useCallback(() => {
    setLoading(true);
    workflowMatrixService
      .getRules()
      .then((data) => {
        setRules(data);
        setLoading(false);
      })
      .catch(() => {
        setRules([]);
        setLoading(false);
      });
  }, [workflowMatrixService]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const routeToText = (r: IWorkflowRule): string => {
    const kind = r.targetKind ?? 'department';
    return kind === 'department' ? r.department : `${t(`workflowMatrix.targetKind.${kind}`)}: ${r.department}`;
  };
  const rows: IWorkflowRuleRow[] = (rules ?? []).map((r) => ({ ...r, flowText: r.flow.join(' → '), routeToText: routeToText(r) }));

  const openAdd = (): void => {
    setModalRule(undefined);
    setModalOpen(true);
  };
  const openEdit = (rule: IWorkflowRule): void => {
    setModalRule(rule);
    setModalOpen(true);
  };
  const handleSave = (rule: IWorkflowRule): void => {
    workflowMatrixService
      .saveRule(rule)
      .then(() => {
        setModalOpen(false);
        fetchData();
      })
      .catch(() => undefined);
  };
  const confirmDelete = (): void => {
    if (!pendingDelete) return;
    workflowMatrixService
      .deleteRule(pendingDelete.id)
      .then(() => {
        setPendingDelete(undefined);
        fetchData();
      })
      .catch(() => undefined);
  };

  const columns: DataGridColumn<IWorkflowRuleRow>[] = [
    { field: 'type', headerKey: 'workflowMatrix.col.type', filter: 'text', width: 110 },
    { field: 'direction', headerKey: 'workflowMatrix.col.direction', filter: 'text', width: 110 },
    { field: 'routeToText', headerKey: 'workflowMatrix.col.routeTo', filter: 'text', width: 180 },
    {
      field: 'flowText',
      headerKey: 'workflowMatrix.col.flow',
      filter: 'text',
      flex: 1,
      minWidth: 220,
      cellRenderer: (row) => <span className={styles.flowText}>{row.flowText}</span>,
    },
    { field: 'approver', headerKey: 'workflowMatrix.col.approver', filter: 'text', width: 170 },
    { field: 'rule', headerKey: 'workflowMatrix.col.rule', filter: 'text', width: 180 },
    { field: 'note', headerKey: 'workflowMatrix.col.note', filter: 'text', flex: 1, minWidth: 200 },
    {
      field: 'id',
      headerKey: 'workflowMatrix.col.actions',
      filter: false,
      sortable: false,
      width: 70,
      cellRenderer: (row) => {
        const items: IActionsMenuItem[] = [
          { key: 'edit', labelKey: 'workflowMatrix.action.edit', iconName: 'pencil', onClick: () => openEdit(row) },
          {
            key: 'delete',
            labelKey: 'workflowMatrix.action.delete',
            iconName: 'trash',
            dividerBefore: true,
            onClick: () => setPendingDelete(row),
          },
        ];
        return <ActionsMenu items={items} ariaLabelKey="workflowMatrix.actions" />;
      },
    },
  ];

  // One past the highest order in use, not the row count — deleting a rule from the middle
  // leaves a gap, and `length + 1` would then collide with an existing rule's order.
  const nextOrder = (rules ?? []).reduce((max, rule) => Math.max(max, rule.order), 0) + 1;
  const testMatches = testMode ? resolveWorkflowRules(rules ?? [], testCriteria, matchMode) : [];

  const setTestField = (key: keyof ITestCriteria, value: string): void =>
    setTestCriteria((prev) => ({ ...prev, [key]: value }));

  return (
    <div className={styles.panel}>
      <div className={styles.banner}>
        <Info size={16} />
        {t('workflowMatrix.banner')}
      </div>

      {testMode && (
        <div className={styles.testPanel}>
          <div className={styles.testPanelTitle}>
            <Icon name="repeat" size={14} />
            {t('workflowMatrix.test.title')}
          </div>
          <div className={styles.testGrid}>
            <div className={styles.testField}>
              <span className={styles.testFieldLabel}>{t('workflowMatrix.col.type')}</span>
              <select className={styles.testSelect} value={testCriteria.type} onChange={(e) => setTestField('type', e.target.value)}>
                <option value={CONDITION_ANY}>{t('workflowMatrix.condition.any')}</option>
                {Array.from(new Set((rules ?? []).map((r) => r.type).filter((v) => v !== CONDITION_ANY))).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.testField}>
              <span className={styles.testFieldLabel}>{t('workflowMatrix.col.direction')}</span>
              <select
                className={styles.testSelect}
                value={testCriteria.direction}
                onChange={(e) => setTestField('direction', e.target.value)}
              >
                <option value={CONDITION_ANY}>{t('workflowMatrix.condition.any')}</option>
                <option value="Incoming">{t('createCorrespondence.field.incoming')}</option>
                <option value="Outgoing">{t('createCorrespondence.field.outgoing')}</option>
                <option value="External">{t('workflowMatrix.condition.external')}</option>
              </select>
            </div>
            <div className={styles.testField}>
              <span className={styles.testFieldLabel}>{t('createCorrespondence.field.priority')}</span>
              <select
                className={styles.testSelect}
                value={testCriteria.priority}
                onChange={(e) => setTestField('priority', e.target.value)}
              >
                <option value={CONDITION_ANY}>{t('workflowMatrix.condition.any')}</option>
                <option value="Normal">{t('createCorrespondence.field.normal')}</option>
                <option value="High">{t('createCorrespondence.field.high')}</option>
              </select>
            </div>
            <div className={styles.testField}>
              <span className={styles.testFieldLabel}>{t('createCorrespondence.field.securityLevel')}</span>
              <select
                className={styles.testSelect}
                value={testCriteria.securityLevel}
                onChange={(e) => setTestField('securityLevel', e.target.value)}
              >
                <option value={CONDITION_ANY}>{t('workflowMatrix.condition.any')}</option>
                {SECURITY_TIERS.map((tier) => (
                  <option key={tier.tier} value={tier.name}>
                    {tier.name}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.testField}>
              <span className={styles.testFieldLabel}>{t('createCorrespondence.field.originatingFunction')}</span>
              <select
                className={styles.testSelect}
                value={testCriteria.function}
                onChange={(e) => setTestField('function', e.target.value)}
              >
                <option value={CONDITION_ANY}>{t('workflowMatrix.condition.any')}</option>
                {Array.from(new Set((rules ?? []).map((r) => r.function).filter((v) => v !== CONDITION_ANY))).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.testField}>
              <span className={styles.testFieldLabel}>{t('workflowMatrix.modal.departmentCondition')}</span>
              <select
                className={styles.testSelect}
                value={testCriteria.department}
                onChange={(e) => setTestField('department', e.target.value)}
              >
                <option value={CONDITION_ANY}>{t('workflowMatrix.condition.any')}</option>
                {Array.from(
                  new Set((rules ?? []).map((r) => r.departmentCondition).filter((v): v is string => !!v && v !== CONDITION_ANY))
                ).map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.testResultBox}>
            {testMatches.length > 0 ? (
              <>
                <span className={styles.testResultMode}>
                  {t(matchMode === 'all-match' ? 'workflowMatrix.test.allMatchHeader' : 'workflowMatrix.test.firstMatchHeader', {
                    count: testMatches.length,
                  })}
                </span>
                {testMatches.map((match) => (
                  <div key={match.id} className={styles.testResultRule}>
                    <span>{t('workflowMatrix.test.matchedRule', { rule: match.rule })}</span>
                    <span>{t('workflowMatrix.test.resolvedDepartment', { department: routeToText(match) })}</span>
                    <span>{t('workflowMatrix.test.resolvedFlow', { flow: match.flow.join(' → ') })}</span>
                  </div>
                ))}
              </>
            ) : (
              <span className={styles.testResultNoMatch}>{t('workflowMatrix.test.noMatch')}</span>
            )}
          </div>
        </div>
      )}

      <DataGrid<IWorkflowRuleRow>
        columns={columns}
        rows={rows}
        loading={loading}
        onRefresh={fetchData}
        getRowId={(row) => row.id}
        enableViewToggle={false}
        gridId="admin-workflow-matrix"
        emptyStateKey="workflowMatrix.noRules"
        toolbarTitle={t('workflowMatrix.panelTitle')}
        toolbarRightActions={
          <>
            {/* AC5 — matrix-wide match mode (persisted). */}
            <div className={styles.matchModeControl}>
              <span className={styles.testModeLabel}>{t('workflowMatrix.matchMode.label')}</span>
              <div className={styles.matchModeSegment}>
                <button
                  type="button"
                  className={`${styles.matchModeBtn} ${matchMode === 'first-match' ? styles.matchModeBtnActive : ''}`}
                  aria-pressed={matchMode === 'first-match'}
                  onClick={() => changeMatchMode('first-match')}
                >
                  {t('workflowMatrix.matchMode.first')}
                </button>
                <button
                  type="button"
                  className={`${styles.matchModeBtn} ${matchMode === 'all-match' ? styles.matchModeBtnActive : ''}`}
                  aria-pressed={matchMode === 'all-match'}
                  onClick={() => changeMatchMode('all-match')}
                >
                  {t('workflowMatrix.matchMode.all')}
                </button>
              </div>
            </div>
            <div className={styles.testModeToggleRow}>
              <span className={styles.testModeLabel}>{t('workflowMatrix.testMode')}</span>
              <button
                type="button"
                className={`${styles.toggleSwitch} ${testMode ? styles.toggleSwitchOn : ''}`}
                role="switch"
                aria-checked={testMode}
                aria-label={t('workflowMatrix.testMode')}
                onClick={() => setTestMode((v) => !v)}
              >
                <span className={`${styles.toggleKnob} ${testMode ? styles.toggleKnobOn : ''}`} />
              </button>
            </div>
            <button type="button" className={styles.addRuleBtn} onClick={openAdd}>
              <Icon name="plus" size={14} />
              {t('workflowMatrix.addRule')}
            </button>
          </>
        }
      />

      <AddEditRuleModal
        isOpen={modalOpen}
        onDismiss={() => setModalOpen(false)}
        rule={modalRule}
        nextOrder={nextOrder}
        onSave={handleSave}
      />

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={t('workflowMatrix.deleteConfirm.title')}
        message={t('workflowMatrix.deleteConfirm.message', { rule: pendingDelete?.rule ?? '' })}
        confirmLabel={t('workflowMatrix.deleteConfirm.confirm')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(undefined)}
      />
    </div>
  );
};

export default WorkflowMatrixPanel;
