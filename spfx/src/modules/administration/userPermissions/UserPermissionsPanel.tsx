import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid, DataGridColumn } from '../../../components/grid/DataGrid';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Icon } from '../../../components/icons/Icon';
import { useServices, useNav } from '../../../state/hooks';
import { IUserPermissionRecord } from '../../../services/interfaces/IUserPermissionsService';
import { IUserPermissions } from '../../../models/IUserPermissions';
import { exportJsonToFile } from '../../../utils/exportJson';
import gridStyles from '../../../components/grid/DataGrid.module.scss';
import styles from './UserPermissionsPanel.module.scss';

const PREVIEW_LENGTH = 90;

function nowTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 16);
}

/**
 * CMS-055 AC3 (= CMS-036 AC3) — the per-user permission-configuration admin screen. An admin edits,
 * per user, a JSON object controlling which views/tabs/buttons/dashboards that user can see
 * (CORMS_UserRoles.PermissionsJson). Mirrors TranslationsPanel: JSON.parse validation on save +
 * exportable. The signed-in user's saved value is resolved by RoleServiceCore and enforced for
 * navigation view visibility by NavigationServiceCore; buttons/tabs/dashboards consult the same
 * rules via the usePermissions() hook (incremental adoption).
 */
const UserPermissionsPanel: React.FC = () => {
  const { t } = useTranslation();
  const { userPermissionsService, auditTrailService } = useServices();
  const { currentUser } = useNav();

  const [records, setRecords] = React.useState<IUserPermissionRecord[] | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<IUserPermissionRecord | undefined>(undefined);
  const [draftText, setDraftText] = React.useState('');
  const [draftError, setDraftError] = React.useState<string | undefined>(undefined);

  const fetchData = React.useCallback(() => {
    setLoading(true);
    userPermissionsService
      .listUsers()
      .then((data) => {
        setRecords(data);
        setLoading(false);
      })
      .catch(() => {
        setRecords([]);
        setLoading(false);
      });
  }, [userPermissionsService]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openEdit = (row: IUserPermissionRecord): void => {
    setEditTarget(row);
    setDraftText(JSON.stringify(row.permissions ?? {}, null, 2));
    setDraftError(undefined);
  };

  const closeEdit = (): void => {
    setEditTarget(undefined);
    setDraftError(undefined);
  };

  const handleSave = (): void => {
    if (!editTarget) return;
    let parsed: IUserPermissions;
    try {
      const raw: unknown = JSON.parse(draftText);
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not an object');
      parsed = raw as IUserPermissions;
    } catch {
      setDraftError(t('userPermissions.invalidJson'));
      return;
    }
    const target = editTarget;
    userPermissionsService
      .savePermissions(target.itemId, parsed)
      .then(() => {
        setRecords((prev) => prev?.map((r) => (r.itemId === target.itemId ? { ...r, permissions: parsed } : r)));
        closeEdit();
        return auditTrailService.logEvent({
          objectId: `UserPermissions:${target.userId}`,
          actor: currentUser?.displayName ?? 'Unknown',
          action: 'Config Updated',
          details: t('userPermissions.audit.updated', { user: target.displayName }),
          timestamp: nowTimestamp(),
        });
      })
      .catch(() => undefined);
  };

  const handleExport = (): void => {
    const combined: Record<string, IUserPermissions> = {};
    (records ?? []).forEach((r) => {
      combined[r.displayName || r.userId] = r.permissions ?? {};
    });
    exportJsonToFile(combined, 'user-permissions.json');
  };

  const columns: DataGridColumn<IUserPermissionRecord>[] = [
    {
      field: 'displayName',
      headerKey: 'userPermissions.col.user',
      filter: 'text',
      width: 220,
      cellRenderer: (row) => (
        <span>
          {row.displayName} <span className={styles.role}>({row.role})</span>
        </span>
      ),
    },
    {
      field: 'userId',
      headerKey: 'userPermissions.col.permissions',
      filter: false,
      flex: 1,
      minWidth: 260,
      cellRenderer: (row) => {
        const text = JSON.stringify(row.permissions ?? {});
        return <span className={styles.preview}>{text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text}</span>;
      },
    },
    {
      field: 'itemId',
      headerKey: 'userPermissions.col.action',
      filter: false,
      sortable: false,
      width: 80,
      cellRenderer: (row) => (
        <button type="button" className={styles.editBtn} onClick={() => openEdit(row)} aria-label="edit">
          <Icon name="pencil" size={14} />
        </button>
      ),
    },
  ];

  return (
    <div className={styles.panel}>
      <p className={styles.description}>{t('userPermissions.description')}</p>

      <DataGrid<IUserPermissionRecord>
        columns={columns}
        rows={records ?? []}
        loading={loading}
        onRefresh={fetchData}
        getRowId={(row) => String(row.itemId)}
        enableViewToggle={false}
        gridId="admin-user-permissions"
        emptyStateKey="grid.empty.default"
        toolbarTitle={t('userPermissions.panelTitle')}
        toolbarRightActions={
          <button type="button" className={gridStyles.gridToolbarBtn} onClick={handleExport}>
            <Icon name="download" size={14} />
            <span>{t('userPermissions.export')}</span>
          </button>
        }
      />

      <Modal
        isOpen={!!editTarget}
        onDismiss={closeEdit}
        title={editTarget ? t('userPermissions.editTitle', { user: editTarget.displayName }) : ''}
        width={640}
        footer={
          <>
            <Button onClick={closeEdit}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={handleSave}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <p className={styles.jsonHint}>{t('userPermissions.editHint')}</p>
        <textarea
          className={styles.jsonTextarea}
          value={draftText}
          spellCheck={false}
          onChange={(e) => {
            setDraftText(e.target.value);
            setDraftError(undefined);
          }}
        />
        {draftError && <div className={styles.jsonError}>{draftError}</div>}
      </Modal>
    </div>
  );
};

export default UserPermissionsPanel;
