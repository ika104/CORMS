import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid, DataGridColumn } from '../../../components/grid/DataGrid';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Icon } from '../../../components/icons/Icon';
import { useServices, useNav } from '../../../state/hooks';
import { ITranslationEntry } from '../../../models/ITranslationEntry';
import { applyTranslations } from '../../../i18n/runtimeTranslations';
import { exportJsonToFile } from '../../../utils/exportJson';
import gridStyles from '../../../components/grid/DataGrid.module.scss';
import styles from './TranslationsPanel.module.scss';

const PREVIEW_LENGTH = 90;

function nowTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 16);
}

// CMS-056 — the Translations admin screen.
const TranslationsPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { translationsService, auditTrailService } = useServices();
  const { currentUser } = useNav();

  const [entries, setEntries] = React.useState<ITranslationEntry[] | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<ITranslationEntry | undefined>(undefined);
  const [draftText, setDraftText] = React.useState('');
  const [draftError, setDraftError] = React.useState<string | undefined>(undefined);

  const fetchData = React.useCallback(() => {
    setLoading(true);
    translationsService
      .getEntries()
      .then((data) => {
        setEntries(data);
        setLoading(false);
      })
      .catch(() => {
        setEntries([]);
        setLoading(false);
      });
  }, [translationsService]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openEdit = (row: ITranslationEntry): void => {
    setEditTarget(row);
    setDraftText(JSON.stringify(row.json, null, 2));
    setDraftError(undefined);
  };

  const closeEdit = (): void => {
    setEditTarget(undefined);
    setDraftError(undefined);
  };

  const handleSave = (): void => {
    if (!editTarget) return;
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(draftText) as Record<string, string>;
    } catch {
      setDraftError(t('translations.invalidJson'));
      return;
    }
    translationsService
      .saveEntry(editTarget.code, parsed)
      .then((updated) => {
        setEntries((prev) => prev?.map((e) => (e.code === updated.code ? updated : e)));
        // Apply the change to the live app immediately (and re-render) so the admin sees the new
        // labels without a reload — the persisted change is picked up by everyone else on next load.
        applyTranslations(i18n, [updated]);
        i18n.changeLanguage(i18n.language).catch(() => undefined);
        closeEdit();
        return auditTrailService.logEvent({
          objectId: updated.code,
          actor: currentUser?.displayName ?? 'Unknown',
          action: 'Translation Updated',
          details: t('translations.audit.updated', { label: updated.label }),
          timestamp: nowTimestamp(),
        });
      })
      .catch(() => undefined);
  };

  const handleExport = (): void => {
    const combined: Record<string, Record<string, string>> = {};
    (entries ?? []).forEach((entry) => {
      combined[entry.code] = entry.json;
    });
    exportJsonToFile(combined, 'translations.json');
  };

  const columns: DataGridColumn<ITranslationEntry>[] = [
    {
      field: 'label',
      headerKey: 'translations.col.language',
      filter: 'text',
      width: 200,
      cellRenderer: (row) => (
        <span>
          {row.label} <span className={styles.code}>({row.code})</span>
        </span>
      ),
    },
    {
      field: 'code',
      headerKey: 'translations.col.jsonData',
      filter: false,
      flex: 1,
      minWidth: 260,
      cellRenderer: (row) => {
        const text = JSON.stringify(row.json);
        return <span className={styles.preview}>{text.length > PREVIEW_LENGTH ? `${text.slice(0, PREVIEW_LENGTH)}…` : text}</span>;
      },
    },
    {
      field: 'json',
      headerKey: 'translations.col.action',
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
      <DataGrid<ITranslationEntry>
        columns={columns}
        rows={entries ?? []}
        loading={loading}
        onRefresh={fetchData}
        getRowId={(row) => row.code}
        enableViewToggle={false}
        gridId="admin-translations"
        emptyStateKey="grid.empty.default"
        toolbarTitle={t('translations.panelTitle')}
        toolbarRightActions={
          <button type="button" className={gridStyles.gridToolbarBtn} onClick={handleExport}>
            <Icon name="download" size={14} />
            <span>{t('translations.export')}</span>
          </button>
        }
      />

      <Modal
        isOpen={!!editTarget}
        onDismiss={closeEdit}
        title={editTarget ? t('translations.editTitle', { label: editTarget.label }) : ''}
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

export default TranslationsPanel;
