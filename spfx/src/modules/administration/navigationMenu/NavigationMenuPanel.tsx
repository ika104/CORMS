import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid, DataGridColumn } from '../../../components/grid/DataGrid';
import { ConfirmDialog } from '../../../components/common/ConfirmDialog';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Icon } from '../../../components/icons/Icon';
import { useServices } from '../../../services/ServiceProvider';
import { useAppShell } from '../../../state/AppShellContext';
import { INavMenuEntryRow } from '../../../models/INavigationMenuEntry';
import { CORMS_ROLE_TRANSLATION_KEY, CORMS_ROLES, CormsRole } from '../../../models/ICormsRole';
import styles from './NavigationMenuPanel.module.scss';

interface IRow extends INavMenuEntryRow {
  depth: number;
  colKey: string;
  colTranslationKey: string;
  colIcon: string;
  colRoute: string;
  colSortOrder: string;
  colVisible: string;
  colRoles: string;
  colActions: string;
}

/** Groups flat CORMS_NavigationMenu rows so each parent is immediately followed by its own
 * children (SortOrder within the parent), rather than the flat SortOrder-only order the service
 * returns them in — purely a display concern for this grid. */
function orderForDisplay(entries: INavMenuEntryRow[]): Array<INavMenuEntryRow & { depth: number }> {
  const byParent = new Map<string, INavMenuEntryRow[]>();
  entries.forEach((e) => {
    const key = e.parentKey ?? '';
    byParent.set(key, [...(byParent.get(key) ?? []), e]);
  });
  const result: Array<INavMenuEntryRow & { depth: number }> = [];
  const visit = (parentKey: string, depth: number): void => {
    (byParent.get(parentKey) ?? []).forEach((entry) => {
      result.push({ ...entry, depth });
      visit(entry.key, depth + 1);
    });
  };
  visit('', 0);
  return result;
}

const NavigationMenuPanel: React.FC = () => {
  const { t } = useTranslation();
  const { navigationService } = useServices();
  const { refreshNav } = useAppShell();

  const [entries, setEntries] = React.useState<INavMenuEntryRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<INavMenuEntryRow | undefined>(undefined);
  const [deleteError, setDeleteError] = React.useState<string | undefined>(undefined);
  // In-progress Sort Order typing, keyed by entry — kept separate from `entries` so retyping a
  // number (e.g. "1" then "10") doesn't reorder/re-render the grid on every keystroke; committed
  // (persisted + cleared) on blur.
  const [sortOrderDrafts, setSortOrderDrafts] = React.useState<Record<string, string>>({});
  // Required Roles is edited via a modal (not an inline dropdown) — AG Grid cells clip
  // overflowing content, so a popover expanding within the cell would get cut off; Fluent's
  // Modal portals to document.body and isn't subject to that.
  const [editingRoles, setEditingRoles] = React.useState<INavMenuEntryRow | undefined>(undefined);
  const [rolesDraft, setRolesDraft] = React.useState<CormsRole[]>([]);

  const fetchEntries = React.useCallback(() => {
    setLoading(true);
    navigationService
      .listAllEntries()
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch(() => {
        setEntries([]);
        setLoading(false);
      });
  }, [navigationService]);

  React.useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleToggleVisible = (key: string, next: boolean): void => {
    // Optimistic — the grid should feel immediate, and setVisibility's own failure just leaves
    // the row's real state to be reconciled on the next fetchEntries().
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, isVisible: next } : e)));
    navigationService
      .setVisibility(key, next)
      .then(() => refreshNav())
      .catch(() => fetchEntries());
  };

  const commitSortOrder = (key: string, draftValue: string): void => {
    setSortOrderDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    const parsed = Number(draftValue);
    const current = entries.find((e) => e.key === key)?.sortOrder;
    if (!Number.isFinite(parsed) || parsed === current) return;
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, sortOrder: parsed } : e)));
    navigationService
      .setSortOrder(key, parsed)
      .then(() => refreshNav())
      .catch(() => fetchEntries());
  };

  const openRolesEditor = (row: INavMenuEntryRow): void => {
    setEditingRoles(row);
    setRolesDraft(row.requiredRoles);
  };

  const toggleRoleInDraft = (role: CormsRole, checked: boolean): void => {
    setRolesDraft((prev) => (checked ? [...prev, role] : prev.filter((r) => r !== role)));
  };

  const saveRolesEditor = (): void => {
    if (!editingRoles) return;
    const key = editingRoles.key;
    // Optimistic, same pattern as handleToggleVisible above.
    setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, requiredRoles: rolesDraft } : e)));
    setEditingRoles(undefined);
    navigationService
      .setRequiredRoles(key, rolesDraft)
      .then(() => refreshNav())
      .catch(() => fetchEntries());
  };

  const confirmDelete = (): void => {
    if (!pendingDelete) return;
    setDeleteError(undefined);
    navigationService
      .deleteEntry(pendingDelete.key)
      .then(() => {
        setPendingDelete(undefined);
        refreshNav();
        fetchEntries();
      })
      .catch((err: unknown) => {
        setDeleteError(err instanceof Error ? err.message : String(err));
      });
  };

  const rows: IRow[] = orderForDisplay(entries).map((entry) => ({
    ...entry,
    colKey: entry.key,
    colTranslationKey: entry.key,
    colIcon: entry.key,
    colRoute: entry.key,
    colSortOrder: entry.key,
    colVisible: entry.key,
    colRoles: entry.key,
    colActions: entry.key,
  }));

  const columns: DataGridColumn<IRow>[] = [
    {
      field: 'colKey',
      headerKey: 'navigationMenu.column.key',
      filter: 'text',
      flex: 1,
      minWidth: 220,
      cellRenderer: (row) => (
        <span className={styles.key} style={{ paddingInlineStart: row.depth * 16 }}>
          {row.key}
        </span>
      ),
    },
    {
      field: 'colTranslationKey',
      headerKey: 'navigationMenu.column.translationKey',
      filter: 'text',
      minWidth: 200,
      cellRenderer: (row) => <span className={styles.translationKey}>{row.translationKey ?? ''}</span>,
    },
    {
      field: 'colIcon',
      headerKey: 'navigationMenu.column.icon',
      filter: false,
      width: 90,
      cellRenderer: (row) => (row.iconKey ? <Icon name={row.iconKey} size={16} /> : null),
    },
    {
      field: 'colRoute',
      headerKey: 'navigationMenu.column.route',
      filter: 'text',
      minWidth: 180,
      cellRenderer: (row) => <span>{row.route ?? ''}</span>,
    },
    {
      field: 'colSortOrder',
      headerKey: 'navigationMenu.column.sortOrder',
      filter: 'number',
      width: 110,
      cellRenderer: (row) => (
        <input
          type="number"
          className={styles.sortOrderInput}
          value={sortOrderDrafts[row.key] ?? String(row.sortOrder)}
          onChange={(e) => setSortOrderDrafts((prev) => ({ ...prev, [row.key]: e.currentTarget.value }))}
          onBlur={(e) => commitSortOrder(row.key, e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          aria-label={t('navigationMenu.column.sortOrder')}
        />
      ),
    },
    {
      field: 'colVisible',
      headerKey: 'navigationMenu.column.visible',
      filter: false,
      width: 90,
      cellRenderer: (row) => (
        <input
          type="checkbox"
          checked={row.isVisible}
          onChange={(e) => handleToggleVisible(row.key, e.currentTarget.checked)}
          aria-label={t('navigationMenu.column.visible')}
        />
      ),
    },
    {
      field: 'colRoles',
      headerKey: 'navigationMenu.column.requiredRoles',
      filter: false,
      minWidth: 220,
      cellRenderer: (row) => (
        <button type="button" className={styles.rolesButton} onClick={() => openRolesEditor(row)}>
          {row.requiredRoles.length === 0
            ? t('navigationMenu.requiredRoles.all')
            : row.requiredRoles.map((r) => t(CORMS_ROLE_TRANSLATION_KEY[r] ?? r)).join(', ')}
        </button>
      ),
    },
    {
      field: 'colActions',
      headerKey: 'navigationMenu.column.actions',
      filter: false,
      sortable: false,
      width: 100,
      cellRenderer: (row) =>
        row.isSystemEntry ? null : (
          <button type="button" className={styles.key} onClick={() => setPendingDelete(row)} aria-label={t('navigationMenu.action.delete')}>
            <Icon name="trash" size={16} />
          </button>
        ),
    },
  ];

  return (
    <div className={styles.panel}>
      <p className={styles.description}>{t('navigationMenu.description')}</p>

      <DataGrid<IRow>
        columns={columns}
        rows={rows}
        loading={loading}
        onRefresh={fetchEntries}
        getRowId={(row) => row.key}
        enableViewToggle={false}
        gridId="admin-navigation-menu"
        emptyStateKey="grid.empty.default"
        toolbarTitle={t('navigationMenu.panelTitle')}
      />

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={t('navigationMenu.deleteConfirmTitle')}
        message={deleteError ?? t('navigationMenu.deleteConfirmMessage', { key: pendingDelete?.key ?? '' })}
        confirmLabel={t('navigationMenu.action.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => {
          setPendingDelete(undefined);
          setDeleteError(undefined);
        }}
      />

      <Modal
        isOpen={!!editingRoles}
        onDismiss={() => setEditingRoles(undefined)}
        title={t('navigationMenu.rolesModal.title', { key: editingRoles?.key ?? '' })}
        footer={
          <>
            <Button variant="default" text={t('common.cancel')} onClick={() => setEditingRoles(undefined)} />
            <Button variant="primary" text={t('common.save')} onClick={saveRolesEditor} />
          </>
        }
      >
        <p className={styles.rolesModalHint}>{t('navigationMenu.rolesModal.hint')}</p>
        {CORMS_ROLES.map((role) => (
          <label key={role} className={styles.roleOption}>
            <input
              type="checkbox"
              checked={rolesDraft.indexOf(role) !== -1}
              onChange={(e) => toggleRoleInDraft(role, e.currentTarget.checked)}
            />
            {t(CORMS_ROLE_TRANSLATION_KEY[role])}
          </label>
        ))}
      </Modal>
    </div>
  );
};

export default NavigationMenuPanel;
