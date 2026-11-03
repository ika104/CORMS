import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Info } from 'lucide-react';
import { DataGrid, DataGridColumn } from '../../../components/grid/DataGrid';
import { Modal } from '../../../components/common/Modal';
import { Button } from '../../../components/common/Button';
import { Icon } from '../../../components/icons/Icon';
import { useServices, useNav } from '../../../state/hooks';
import { IAdminConfigEntry } from '../../../models/IAdminConfig';
import { resolveConfigOwner } from './configOwnership';
import gridStyles from '../../../components/grid/DataGrid.module.scss';
import styles from './AdminConfigPanel.module.scss';

function nowTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 16);
}

// CMS-056: applies to any key containing "API_Key" (or the equivalent "API Key"/"api-key"
// spelling) — plain values like RootSiteUrl/Task-List stay unmasked. Extended for the
// Dynamsoft_License_Key row (Create Correspondence backend task) so any "..._License_Key"
// config also gets the same masked/reveal-toggle/audit-redacted treatment, and for the signing
// flow's provider password/client credentials.
function isSecretKey(key: string): boolean {
  return /api[_\s-]?key|license[_\s-]?key|password|credentials|token|secret/i.test(key);
}

// A masked stand-in shown in the grid for a secret value, so keys never render in the clear.
const SECRET_MASK = '••••••••';

/** A value the admin is entering as JSON (a key named *Json/*Sites, or text that opens with { or [)
 * gets JSON-validated on save so a typo can't persist a broken configuration value. */
function looksLikeJson(key: string, value: string): boolean {
  const trimmed = value.trim();
  return /(json|sites)$/i.test(key) || trimmed.startsWith('{') || trimmed.startsWith('[');
}

/** A boolean feature flag — a key ending in "Enabled" or a value that is already exactly true/false.
 * These render as an inline On/Off switch instead of a free-text field so an admin can't mistype a
 * boolean (e.g. integration.auditingEnabled, the master auditing switch). Null-safe: live config
 * rows can carry an empty/null Value, so never call String methods on the raw value. */
function isBooleanConfig(key: string, value: string | undefined): boolean {
  return /enabled$/i.test(key) || /^(true|false)$/i.test((value ?? '').trim());
}

/** On unless explicitly "false" — mirrors the service-side default-on semantics so a blank value
 * still reads as enabled. */
function isConfigOn(value: string | undefined): boolean {
  return (value ?? '').trim().toLowerCase() !== 'false';
}

type NewCategory = 'General' | 'Integration';

interface IAddDraft {
  key: string;
  value: string;
  description: string;
  category: NewCategory;
}

const BLANK_ADD_DRAFT: IAddDraft = { key: '', value: '', description: '', category: 'General' };

// CMS-055/CMS-056 — the RecordsHub Configuration List admin screen. Row-level inline edit
// (pencil -> input -> explicit save/cancel) lives entirely in the Value cell via the shared
// InlineEditCell component, matching the story's description of the interaction; there is no
// separate "Actions" column since the edit control the story describes is the Value cell's own
// pencil, not a distinct row action. CMS-055 AC1 adds an "Add configuration" affordance for
// creating NEW keys; AC5 adds an Owner column + ownership/storage banner.
export const AdminConfigPanel: React.FC = () => {
  const { t } = useTranslation();
  const { adminConfigService, auditTrailService } = useServices();
  const { currentUser } = useNav();

  const [entries, setEntries] = React.useState<IAdminConfigEntry[] | undefined>(undefined);
  const [loading, setLoading] = React.useState(false);
  // Edit is a modal (mirrors the Translations editor) rather than an in-cell input, for a consistent
  // editing UX across Administration.
  const [editTarget, setEditTarget] = React.useState<IAdminConfigEntry | undefined>(undefined);
  const [editValue, setEditValue] = React.useState('');
  const [editReveal, setEditReveal] = React.useState(false);
  const [editError, setEditError] = React.useState<string | undefined>(undefined);
  const [addOpen, setAddOpen] = React.useState(false);
  const [addDraft, setAddDraft] = React.useState<IAddDraft>(BLANK_ADD_DRAFT);
  const [addError, setAddError] = React.useState<string | undefined>(undefined);

  const fetchData = React.useCallback(() => {
    setLoading(true);
    adminConfigService
      .getEntries()
      .then((data) => {
        // translations.en / translations.ar are the label dictionaries owned by the Translations
        // tab — hide them here so they aren't a confusing second copy in Admin Config.
        setEntries(data.filter((entry) => entry.key.indexOf('translations.') !== 0));
        setLoading(false);
      })
      .catch(() => {
        setEntries([]);
        setLoading(false);
      });
  }, [adminConfigService]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openEdit = (row: IAdminConfigEntry): void => {
    setEditTarget(row);
    setEditValue(row.value);
    setEditReveal(false);
    setEditError(undefined);
  };

  // Persist a single value change: optimistic grid update + audit event. Shared by the edit modal
  // and the inline boolean toggle so both save and audit identically.
  const persistValue = (row: IAdminConfigEntry, value: string): void => {
    if (value === row.value) return;
    adminConfigService
      .saveEntry(row.key, value)
      .then((updated) => {
        setEntries((prev) => prev?.map((e) => (e.key === row.key ? { ...e, ...updated } : e)));
        // Changes here are audited (CMS-055) — secret values are masked in the audit detail
        // text too, so they never leak into the audit log.
        const secret = isSecretKey(row.key);
        const details = secret
          ? t('adminConfig.audit.secretChanged')
          : t('adminConfig.audit.valueChanged', { before: row.value || '—', after: value || '—' });
        return auditTrailService.logEvent({
          objectId: row.key,
          actor: currentUser?.displayName ?? 'Unknown',
          action: 'Config Updated',
          details,
          timestamp: nowTimestamp(),
        });
      })
      .catch(() => undefined);
  };

  const commitEdit = (): void => {
    if (!editTarget) return;
    const row = editTarget;
    const value = editValue;
    // JSON-shaped values are validated so a broken config can't be saved (matches the Translations
    // editor's JSON validation).
    if (looksLikeJson(row.key, value) && value.trim()) {
      try {
        JSON.parse(value);
      } catch {
        setEditError(t('adminConfig.edit.invalidJson'));
        return;
      }
    }
    setEditTarget(undefined);
    persistValue(row, value);
  };

  const openAdd = (): void => {
    setAddDraft(BLANK_ADD_DRAFT);
    setAddError(undefined);
    setAddOpen(true);
  };

  const commitAdd = (): void => {
    const key = addDraft.key.trim();
    if (key.length === 0) {
      setAddError(t('adminConfig.add.keyRequired'));
      return;
    }
    // Client-side duplicate guard for an immediate message; AdminConfigService.addEntry re-checks
    // (case-insensitive) as the real backstop, since its underlying save is a MERGE.
    const duplicate = (entries ?? []).some((e) => e.key.toLowerCase() === key.toLowerCase());
    if (duplicate) {
      setAddError(t('adminConfig.add.duplicate', { key }));
      return;
    }
    adminConfigService
      .addEntry({
        key,
        value: addDraft.value,
        description: addDraft.description,
        category: addDraft.category,
      })
      .then((created) => {
        setEntries((prev) => (prev ? [...prev, created] : [created]));
        setAddOpen(false);
        // The add is audited exactly like an edit (actor/timestamp) — secret values masked.
        const details = isSecretKey(created.key)
          ? t('adminConfig.audit.secretAdded')
          : t('adminConfig.audit.added', { key: created.key, value: created.value || '—' });
        return auditTrailService.logEvent({
          objectId: created.key,
          actor: currentUser?.displayName ?? 'Unknown',
          action: 'Config Added',
          details,
          timestamp: nowTimestamp(),
        });
      })
      .catch((err: unknown) => setAddError(err instanceof Error ? err.message : String(err)));
  };

  const columns: DataGridColumn<IAdminConfigEntry>[] = [
    { field: 'key', headerKey: 'adminConfig.col.key', filter: 'text', width: 240 },
    {
      field: 'value',
      headerKey: 'adminConfig.col.value',
      filter: 'text',
      flex: 1,
      minWidth: 260,
      cellRenderer: (row) => {
        // Boolean flags get an inline switch — flipping it saves immediately (and audits), no modal.
        if (isBooleanConfig(row.key, row.value)) {
          const on = isConfigOn(row.value);
          return (
            <div className={styles.valueCell}>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-label={t('adminConfig.toggle.ariaLabel', { key: row.key })}
                className={`${styles.toggle} ${on ? styles.toggleOn : ''}`}
                onClick={() => persistValue(row, on ? 'false' : 'true')}
              >
                <span className={styles.toggleKnob} />
              </button>
              <span className={styles.valueText}>
                {on ? t('adminConfig.toggle.on') : t('adminConfig.toggle.off')}
              </span>
            </div>
          );
        }
        return (
          <div className={styles.valueCell}>
            <span className={styles.valueText}>{isSecretKey(row.key) ? SECRET_MASK : row.value || '—'}</span>
            <button
              type="button"
              className={styles.editBtn}
              onClick={() => openEdit(row)}
              aria-label={t('common.edit')}
              title={t('common.edit')}
            >
              <Icon name="pencil" size={13} />
            </button>
          </div>
        );
      },
    },
    {
      // CMS-055 AC5 — which system owns the config this row governs. Derived purely from the key
      // (configOwnership.ts); the banner above states where each is stored.
      field: 'key',
      headerKey: 'adminConfig.col.owner',
      filter: false,
      sortable: false,
      width: 130,
      cellRenderer: (row) => {
        const owner = resolveConfigOwner(row.key);
        return (
          <span
            className={`${styles.ownerBadge} ${owner === 'RecordsHub' ? styles.ownerRecordsHub : styles.ownerCorms}`}
          >
            {owner === 'RecordsHub' ? t('adminConfig.owner.recordsHub') : t('adminConfig.owner.corms')}
          </span>
        );
      },
    },
    {
      field: 'description',
      headerKey: 'adminConfig.col.description',
      filter: 'text',
      flex: 1,
      minWidth: 260,
    },
  ];

  return (
    <div className={styles.panel}>
      <div className={styles.banner}>
        <Info size={16} />
        <div className={styles.bannerText}>
          <span>{t('adminConfig.ownership.corms')}</span>
          <span>{t('adminConfig.ownership.recordsHub')}</span>
        </div>
      </div>

      <DataGrid<IAdminConfigEntry>
        columns={columns}
        rows={entries ?? []}
        loading={loading}
        onRefresh={fetchData}
        getRowId={(row) => row.key}
        enableViewToggle={false}
        gridId="admin-config"
        emptyStateKey="grid.empty.default"
        toolbarTitle={t('adminConfig.panelTitle')}
        toolbarRightActions={
          <button type="button" className={gridStyles.gridToolbarBtn} onClick={openAdd}>
            <Icon name="plus" size={14} />
            <span>{t('adminConfig.add.button')}</span>
          </button>
        }
      />

      <Modal
        isOpen={!!editTarget}
        onDismiss={() => setEditTarget(undefined)}
        title={t('adminConfig.edit.title')}
        width={600}
        footer={
          <>
            <Button onClick={() => setEditTarget(undefined)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={commitEdit}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {editTarget && (
          <div className={styles.form}>
            <div className={styles.formRow}>
              <span className={styles.formLabel}>{t('adminConfig.col.key')}</span>
              <span className={styles.readonlyValue}>{editTarget.key}</span>
            </div>
            {editTarget.description && (
              <div className={styles.formRow}>
                <span className={styles.formLabel}>{t('adminConfig.col.description')}</span>
                <span className={styles.readonlyDescription}>{editTarget.description}</span>
              </div>
            )}
            <div className={styles.formRow}>
              <label className={styles.formLabel} htmlFor="admin-config-edit-value">
                {t('adminConfig.col.value')}
              </label>
              {isSecretKey(editTarget.key) ? (
                <div className={styles.secretRow}>
                  <input
                    id="admin-config-edit-value"
                    className={styles.formInput}
                    type={editReveal ? 'text' : 'password'}
                    value={editValue}
                    spellCheck={false}
                    onChange={(e) => {
                      setEditValue(e.target.value);
                      setEditError(undefined);
                    }}
                  />
                  <button
                    type="button"
                    className={styles.revealBtn}
                    onClick={() => setEditReveal((v) => !v)}
                    aria-label={editReveal ? t('common.hide') : t('common.show')}
                    title={editReveal ? t('common.hide') : t('common.show')}
                  >
                    <Icon name={editReveal ? 'eyeOff' : 'eye'} size={14} />
                  </button>
                </div>
              ) : (
                <textarea
                  id="admin-config-edit-value"
                  className={styles.formTextarea}
                  value={editValue}
                  spellCheck={false}
                  rows={looksLikeJson(editTarget.key, editValue) ? 10 : 3}
                  onChange={(e) => {
                    setEditValue(e.target.value);
                    setEditError(undefined);
                  }}
                />
              )}
            </div>
            {editError && <div className={styles.formError}>{editError}</div>}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={addOpen}
        onDismiss={() => setAddOpen(false)}
        title={t('adminConfig.add.title')}
        width={560}
        footer={
          <>
            <Button onClick={() => setAddOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="primary" onClick={commitAdd}>
              {t('adminConfig.add.submit')}
            </Button>
          </>
        }
      >
        <div className={styles.form}>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="admin-config-add-key">
              {t('adminConfig.col.key')}
            </label>
            <input
              id="admin-config-add-key"
              className={styles.formInput}
              value={addDraft.key}
              spellCheck={false}
              onChange={(e) => {
                setAddDraft((prev) => ({ ...prev, key: e.target.value }));
                setAddError(undefined);
              }}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="admin-config-add-value">
              {t('adminConfig.col.value')}
            </label>
            <input
              id="admin-config-add-value"
              className={styles.formInput}
              value={addDraft.value}
              spellCheck={false}
              onChange={(e) => setAddDraft((prev) => ({ ...prev, value: e.target.value }))}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="admin-config-add-description">
              {t('adminConfig.col.description')}
            </label>
            <textarea
              id="admin-config-add-description"
              className={styles.formTextarea}
              value={addDraft.description}
              spellCheck={false}
              onChange={(e) => setAddDraft((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className={styles.formRow}>
            <label className={styles.formLabel} htmlFor="admin-config-add-category">
              {t('adminConfig.add.category')}
            </label>
            <select
              id="admin-config-add-category"
              className={styles.formSelect}
              value={addDraft.category}
              onChange={(e) => setAddDraft((prev) => ({ ...prev, category: e.target.value as NewCategory }))}
            >
              <option value="General">{t('adminConfig.category.general')}</option>
              <option value="Integration">{t('adminConfig.category.integration')}</option>
            </select>
          </div>
          {addError && <div className={styles.formError}>{addError}</div>}
        </div>
      </Modal>
    </div>
  );
};

export default AdminConfigPanel;
