import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ICorrespondenceStub, SECURITY_TIERS, STATUS_CONFIG, correspondenceStatusTone } from '../../models/ICorrespondence';
import { ITask, taskPriorityConfig, taskStatusConfig, taskTypeConfig } from '../../models/ITask';
import { IDestinationDepartment } from '../../models/ICorrespondenceMetadata';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Button } from '../../components/common/Button';
import { EmptyState } from '../../components/common/EmptyState';
import { DataGrid, DataGridColumn } from '../../components/grid/DataGrid';
import { useServices, useNav } from '../../state/hooks';
import { highlightMatch } from '../../utils/highlightMatch';
import { resolveWorkflowRule } from '../../utils/workflowRouting';
import { IWorkflowRule } from '../../models/IWorkflowRule';
import { SavedSearchTabsRail } from './components/SavedSearchTabsRail';
import { buildSearchQuery } from './searchQuery';
import { BLANK_CORRESPONDENCE_FILTERS, BLANK_TASK_FILTERS, ISearchTab, SearchType, createBlankTab } from './types';
import styles from './SearchView.module.scss';

const DEFAULT_MAX_CLEARANCE = 1;

const SearchView: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { recordsHubService, taskListService, elasticService, metadataService, workflowMatrixService } = useServices();
  const { currentUser } = useNav();

  const [tabs, setTabs] = React.useState<ISearchTab[]>(() => [createBlankTab()]);
  const [activeId, setActiveId] = React.useState<string>(() => tabs[0].id);
  const [searching, setSearching] = React.useState(false);

  const [allCorrespondence, setAllCorrespondence] = React.useState<ICorrespondenceStub[]>([]);
  const [allTasks, setAllTasks] = React.useState<ITask[]>([]);
  const [departments, setDepartments] = React.useState<IDestinationDepartment[]>([]);
  const [rules, setRules] = React.useState<IWorkflowRule[]>([]);

  // allCorrespondence is used only to derive real filter-dropdown option lists (distinct
  // departments) — Correspondence search results always come through elasticService.search()
  // (CMS-025/026, untouched by this task). allTasks is used both for the assignee dropdown AND —
  // per CMS-046 AC10 — as the base data source for the Tasks search type below, now real
  // CORMS_Tasks rows via taskListService (app.taskDataSource-gated) instead of the earlier
  // elasticService.search('tasks', ...) mock path.
  React.useEffect(() => {
    recordsHubService.getMyCorrespondence().then(setAllCorrespondence).catch(() => undefined);
    taskListService.getAll().then(setAllTasks).catch(() => undefined);
    metadataService.getDestinationDepartments().then(setDepartments).catch(() => undefined);
    workflowMatrixService.getRules().then(setRules).catch(() => undefined);
  }, [recordsHubService, taskListService, metadataService, workflowMatrixService]);

  const activeTab = tabs.find((tb) => tb.id === activeId) ?? tabs[0];

  const updateActiveTab = (patch: Partial<ISearchTab>): void => {
    setTabs((prev) => prev.map((tb) => (tb.id === activeTab.id ? { ...tb, ...patch } : tb)));
  };

  const handleNewSearch = (): void => {
    const created = createBlankTab();
    setTabs((prev) => [...prev, created]);
    setActiveId(created.id);
  };

  // Both pieces of state are derived up front rather than calling setActiveId from inside the
  // setTabs updater — updaters have to stay pure, or React re-running one double-fires it.
  const handleDeleteTab = (id: string): void => {
    const remaining = tabs.filter((tb) => tb.id !== id);
    const next = remaining.length > 0 ? remaining : [createBlankTab()];
    setTabs(next);
    if (id === activeTab.id) setActiveId(next[0].id);
  };

  const maxClearanceTier = currentUser?.clearanceTier ?? DEFAULT_MAX_CLEARANCE;

  const runSearch = (): void => {
    const tab = activeTab;
    setSearching(true);
    if (tab.searchType === 'Correspondence') {
      const filters: Record<string, string> = {
        status: tab.correspondenceFilters.status,
        securityLevel: tab.correspondenceFilters.securityLevel,
        team: tab.correspondenceFilters.team,
        dateFrom: tab.correspondenceFilters.dateFrom,
        dateTo: tab.correspondenceFilters.dateTo,
        referenceNo: tab.correspondenceFilters.referenceNo,
        subject: tab.correspondenceFilters.subject,
        sender: tab.correspondenceFilters.sender,
        recipient: tab.correspondenceFilters.recipient,
        type: tab.correspondenceFilters.type,
        priority: tab.correspondenceFilters.priority,
      };
      elasticService
        .search<ICorrespondenceStub>('correspondence', buildSearchQuery(tab.query, filters))
        .then((result) => {
          let items = result.items.filter((item) => item.securityTier <= maxClearanceTier);
          if (tab.correspondenceFilters.routing) {
            items = items.filter(
              (item) =>
                resolveWorkflowRule(rules, { type: item.type, direction: item.direction, priority: item.priority })
                  ?.department === tab.correspondenceFilters.routing
            );
          }
          updateActiveTab({ hasSearched: true, correspondenceResults: items });
          setSearching(false);
        })
        .catch(() => setSearching(false));
    } else {
      // Every search on this screen goes through Elasticsearch — Tasks included (CMS-046). The
      // Tasks type queries the CORMS_Tasks items indexed in the same per-site index (list
      // discriminator integration.elasticTaskList); the free text is full-text-searched by ES and
      // the Type/Priority/Status/Assignee filters are applied to the mapped rows. The mock backend
      // serves representative CORMS_Tasks data until the live index is available (CMS-025 AC7).
      const taskFilters: Record<string, string> = {
        type: tab.taskFilters.type,
        priority: tab.taskFilters.priority,
        status: tab.taskFilters.status,
        assignee: tab.taskFilters.assignee,
      };
      elasticService
        .search<ITask>('tasks', buildSearchQuery(tab.query, taskFilters))
        .then((result) => {
          updateActiveTab({ hasSearched: true, taskResults: result.items });
          setSearching(false);
        })
        .catch(() => setSearching(false));
    }
  };

  const resetFilters = (): void => {
    updateActiveTab({
      correspondenceFilters: { ...BLANK_CORRESPONDENCE_FILTERS },
      taskFilters: { ...BLANK_TASK_FILTERS },
      query: '',
    });
  };

  const setSearchType = (searchType: SearchType): void => {
    updateActiveTab({ searchType, hasSearched: false, correspondenceResults: [], taskResults: [] });
  };

  const distinctDepartments = Array.from(new Set(allCorrespondence.map((i) => i.department))).sort();
  const distinctTypes = Array.from(new Set(allCorrespondence.map((i) => i.type).filter(Boolean))).sort();
  const distinctAssignees = Array.from(new Set(allTasks.map((tsk) => tsk.assignee))).sort();

  const cf = activeTab.correspondenceFilters;
  const patchCorrespondenceFilters = (patch: Partial<typeof cf>): void =>
    updateActiveTab({ correspondenceFilters: { ...cf, ...patch } });

  const correspondenceColumns: DataGridColumn<ICorrespondenceStub>[] = [
    { field: 'referenceNumber', headerKey: 'search.col.refNo', filter: 'text', width: 150 },
    {
      field: 'subject',
      headerKey: 'search.col.subject',
      filter: 'text',
      flex: 1,
      minWidth: 220,
      // CMS-026 AC3 — subject with the keyword highlighted, plus the matched-content snippet
      // (from the ES highlight fragment, or the mock excerpt) on a second line when present.
      cellRenderer: (row) => (
        <div className={styles.subjectCell}>
          <span className={styles.subjectSnippet}>{highlightMatch(row.subject, activeTab.query)}</span>
          {row.searchSnippet && row.searchSnippet !== row.subject && (
            <span className={styles.resultSnippet}>{highlightMatch(row.searchSnippet, activeTab.query)}</span>
          )}
        </div>
      ),
    },
    {
      field: 'senderName',
      headerKey: 'search.col.fromTo',
      filter: 'text',
      width: 160,
      cellRenderer: (row) => row.senderName || row.recipientName || '—',
    },
    {
      field: 'securityTier',
      headerKey: 'search.col.security',
      filter: 'number',
      width: 140,
      cellRenderer: (row) => {
        const tier = SECURITY_TIERS.find((tr) => tr.tier === row.securityTier);
        return tier ? <StatusBadge label={tier.name} tone="neutral" /> : null;
      },
    },
    {
      field: 'status',
      headerKey: 'search.col.status',
      filter: 'text',
      width: 120,
      cellRenderer: (row) => <StatusBadge label={STATUS_CONFIG[row.status]?.label ?? row.status} tone={correspondenceStatusTone(row.status)} />,
    },
    { field: 'createdAt', headerKey: 'search.col.date', filter: 'date', width: 130 },
  ];

  const taskColumns: DataGridColumn<ITask>[] = [
    {
      field: 'subject',
      headerKey: 'myTasks.col.subject',
      filter: 'text',
      flex: 1,
      minWidth: 220,
      cellRenderer: (row) => <span className={styles.subjectSnippet}>{highlightMatch(row.subject, activeTab.query)}</span>,
    },
    {
      field: 'type',
      headerKey: 'myTasks.col.type',
      filter: 'text',
      width: 150,
      cellRenderer: (row) => <StatusBadge label={t(taskTypeConfig(row.type).labelKey)} tone={taskTypeConfig(row.type).tone} />,
    },
    {
      field: 'priority',
      headerKey: 'myTasks.col.priority',
      filter: 'text',
      width: 110,
      cellRenderer: (row) => <StatusBadge label={t(taskPriorityConfig(row.priority).labelKey)} tone={taskPriorityConfig(row.priority).tone} />,
    },
    {
      field: 'status',
      headerKey: 'myTasks.col.status',
      filter: 'text',
      width: 120,
      cellRenderer: (row) => <StatusBadge label={t(taskStatusConfig(row.status).labelKey)} tone={taskStatusConfig(row.status).tone} />,
    },
    { field: 'dueDate', headerKey: 'myTasks.col.dueDate', filter: 'date', width: 130 },
    { field: 'assignee', headerKey: 'myTasks.col.assignee', filter: 'text', width: 160 },
  ];

  const hasResults = activeTab.hasSearched;
  const results = activeTab.searchType === 'Correspondence' ? activeTab.correspondenceResults : activeTab.taskResults;

  return (
    <div className={styles.page}>
      <SavedSearchTabsRail
        tabs={tabs}
        activeId={activeTab.id}
        onSelect={setActiveId}
        onDelete={handleDeleteTab}
        onNewSearch={handleNewSearch}
      />

      <div className={styles.main}>
        <div>
          <div className={styles.mainTitle}>{t('module.search.title')}</div>
          <div className={styles.mainSubtitle}>{t('search.subtitle')}</div>
        </div>

        <div className={styles.filterCard}>
          <div className={styles.typeToggleRow}>
            <span className={styles.typeToggleLabel}>{t('search.whatAreYouSearchingFor')}</span>
            <div className={styles.segmented}>
              <button
                type="button"
                className={`${styles.segmentButton} ${activeTab.searchType === 'Correspondence' ? styles.segmentButtonActive : ''}`}
                onClick={() => setSearchType('Correspondence')}
              >
                {t('search.type.correspondence')}
              </button>
              <button
                type="button"
                className={`${styles.segmentButton} ${activeTab.searchType === 'Tasks' ? styles.segmentButtonActive : ''}`}
                onClick={() => setSearchType('Tasks')}
              >
                {t('search.type.tasks')}
              </button>
            </div>
          </div>

          {activeTab.searchType === 'Correspondence' ? (
            <div className={styles.filterRow}>
              {/* CMS-025 AC1 — metadata filters: Reference No., Subject, Sender, Recipient (text),
                  Type, Priority (choice), alongside the Status / Security / Team / Date set. */}
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('search.filter.refNo')}</span>
                <input
                  type="text"
                  className={styles.filterInput}
                  value={cf.referenceNo}
                  onChange={(e) => patchCorrespondenceFilters({ referenceNo: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                />
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('search.filter.subject')}</span>
                <input
                  type="text"
                  className={styles.filterInput}
                  value={cf.subject}
                  onChange={(e) => patchCorrespondenceFilters({ subject: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                />
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('search.filter.sender')}</span>
                <input
                  type="text"
                  className={styles.filterInput}
                  value={cf.sender}
                  onChange={(e) => patchCorrespondenceFilters({ sender: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                />
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('search.filter.recipient')}</span>
                <input
                  type="text"
                  className={styles.filterInput}
                  value={cf.recipient}
                  onChange={(e) => patchCorrespondenceFilters({ recipient: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                />
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('search.filter.type')}</span>
                <select
                  className={styles.filterInput}
                  value={cf.type}
                  onChange={(e) => patchCorrespondenceFilters({ type: e.target.value })}
                >
                  <option value="">{t('search.filter.all')}</option>
                  {distinctTypes.map((typeName) => (
                    <option key={typeName} value={typeName}>
                      {typeName}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('search.filter.priority')}</span>
                <select
                  className={styles.filterInput}
                  value={cf.priority}
                  onChange={(e) => patchCorrespondenceFilters({ priority: e.target.value })}
                >
                  <option value="">{t('search.filter.all')}</option>
                  <option value="Normal">{t('myTasks.priority.normal')}</option>
                  <option value="High">{t('myTasks.priority.high')}</option>
                </select>
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('grid.column.status')}</span>
                <select
                  className={styles.filterInput}
                  value={activeTab.correspondenceFilters.status}
                  onChange={(e) => updateActiveTab({ correspondenceFilters: { ...activeTab.correspondenceFilters, status: e.target.value } })}
                >
                  <option value="">{t('search.filter.all')}</option>
                  {Object.keys(STATUS_CONFIG).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_CONFIG[s as keyof typeof STATUS_CONFIG].label}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('createCorrespondence.field.securityLevel')}</span>
                <select
                  className={styles.filterInput}
                  value={activeTab.correspondenceFilters.securityLevel}
                  onChange={(e) =>
                    updateActiveTab({ correspondenceFilters: { ...activeTab.correspondenceFilters, securityLevel: e.target.value } })
                  }
                >
                  <option value="">{t('search.filter.all')}</option>
                  {SECURITY_TIERS.map((tier) => (
                    <option key={tier.tier} value={tier.tier}>
                      {tier.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('search.filter.team')}</span>
                <select
                  className={styles.filterInput}
                  value={activeTab.correspondenceFilters.team}
                  onChange={(e) => updateActiveTab({ correspondenceFilters: { ...activeTab.correspondenceFilters, team: e.target.value } })}
                >
                  <option value="">{t('search.filter.all')}</option>
                  {distinctDepartments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('search.filter.dateFrom')}</span>
                <input
                  type="date"
                  className={styles.filterInput}
                  value={activeTab.correspondenceFilters.dateFrom}
                  onChange={(e) => updateActiveTab({ correspondenceFilters: { ...activeTab.correspondenceFilters, dateFrom: e.target.value } })}
                />
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('search.filter.dateTo')}</span>
                <input
                  type="date"
                  className={styles.filterInput}
                  value={activeTab.correspondenceFilters.dateTo}
                  onChange={(e) => updateActiveTab({ correspondenceFilters: { ...activeTab.correspondenceFilters, dateTo: e.target.value } })}
                />
              </div>
              {/* TODO(confirm): Routing filter placement — add per story, not visible in current
                  Figma capture (CMS-025). */}
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('search.filter.routing')}</span>
                <select
                  className={styles.filterInput}
                  value={activeTab.correspondenceFilters.routing}
                  onChange={(e) => updateActiveTab({ correspondenceFilters: { ...activeTab.correspondenceFilters, routing: e.target.value } })}
                >
                  <option value="">{t('search.filter.all')}</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.name}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : (
            <div className={styles.filterRow}>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('myTasks.col.type')}</span>
                <select
                  className={styles.filterInput}
                  value={activeTab.taskFilters.type}
                  onChange={(e) => updateActiveTab({ taskFilters: { ...activeTab.taskFilters, type: e.target.value } })}
                >
                  <option value="">{t('search.filter.all')}</option>
                  <option value="To Do">{t('myTasks.type.toDo')}</option>
                  <option value="Follow-up Task">{t('myTasks.type.followUp')}</option>
                  <option value="Reminder">{t('myTasks.type.reminder')}</option>
                </select>
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('myTasks.col.priority')}</span>
                <select
                  className={styles.filterInput}
                  value={activeTab.taskFilters.priority}
                  onChange={(e) => updateActiveTab({ taskFilters: { ...activeTab.taskFilters, priority: e.target.value } })}
                >
                  <option value="">{t('search.filter.all')}</option>
                  <option value="Low">{t('myTasks.priority.low')}</option>
                  <option value="Normal">{t('myTasks.priority.normal')}</option>
                  <option value="High">{t('myTasks.priority.high')}</option>
                </select>
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('myTasks.col.status')}</span>
                <select
                  className={styles.filterInput}
                  value={activeTab.taskFilters.status}
                  onChange={(e) => updateActiveTab({ taskFilters: { ...activeTab.taskFilters, status: e.target.value } })}
                >
                  <option value="">{t('search.filter.all')}</option>
                  <option value="Pending">{t('myTasks.status.pending')}</option>
                  <option value="In Progress">{t('myTasks.status.inProgress')}</option>
                  <option value="Overdue">{t('myTasks.status.overdue')}</option>
                  <option value="Completed">{t('myTasks.status.completed')}</option>
                </select>
              </div>
              <div className={styles.filterField}>
                <span className={styles.filterLabel}>{t('myTasks.col.assignee')}</span>
                <select
                  className={styles.filterInput}
                  value={activeTab.taskFilters.assignee}
                  onChange={(e) => updateActiveTab({ taskFilters: { ...activeTab.taskFilters, assignee: e.target.value } })}
                >
                  <option value="">{t('search.filter.all')}</option>
                  {distinctAssignees.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <div className={styles.searchRow}>
            <input
              type="text"
              className={styles.filterInput}
              placeholder={t('search.searchBoxPlaceholder')}
              value={activeTab.query}
              onChange={(e) => updateActiveTab({ query: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            />
            <Button variant="primary" text={t('search.searchButton')} onClick={runSearch} disabled={searching} />
            <Button variant="default" text={t('search.resetFilters')} onClick={resetFilters} />
          </div>
        </div>

        {!hasResults ? (
          <EmptyState title={t('search.emptyState')} />
        ) : (
          <div className={styles.resultsSection}>
            <div className={styles.resultsHeader}>{t('search.resultsFound', { count: results.length })}</div>
            {activeTab.searchType === 'Correspondence' ? (
              <DataGrid<ICorrespondenceStub>
                columns={correspondenceColumns}
                rows={activeTab.correspondenceResults}
                loading={searching}
                onRefresh={runSearch}
                getRowId={(row) => row.id}
                enableViewToggle={false}
                gridId="search-correspondence"
                emptyStateKey="search.noResults"
                onRowClick={(row) =>
                  navigate(`/correspondence/${row.id}`, {
                    state: { tab: 'details', originPath: '/search', originLabel: t('module.search.title') },
                  })
                }
              />
            ) : (
              <DataGrid<ITask>
                columns={taskColumns}
                rows={activeTab.taskResults}
                loading={searching}
                onRefresh={runSearch}
                getRowId={(row) => row.id}
                enableViewToggle={false}
                gridId="search-tasks"
                emptyStateKey="search.noResults"
                // CMS-040 Part 10 — cross-linked from Tasks: a task tied to a correspondence item
                // jumps to that item's detail screen; a task with no related correspondence has
                // nowhere to navigate, so the click is a no-op for that row.
                onRowClick={(row) =>
                  row.relatedCorrespondenceId &&
                  navigate(`/correspondence/${row.relatedCorrespondenceId}`, {
                    state: { tab: 'details', originPath: '/search', originLabel: t('module.search.title') },
                  })
                }
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchView;
