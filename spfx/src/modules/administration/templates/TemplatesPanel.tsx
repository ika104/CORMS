import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useServices } from '../../../state/hooks';
import { Spinner } from '../../../components/common/Spinner';
import { EmptyState } from '../../../components/common/EmptyState';
import { ICorrespondenceTemplate } from '../../../models/ICorrespondenceMetadata';
import styles from './TemplatesPanel.module.scss';

function emptyTemplate(): ICorrespondenceTemplate {
  return { id: '', name: '', header: '', footer: '', bodyHtml: '', approved: true };
}

// CMS-005 AC13 — correspondence templates are authored/provided by SSL Oman and edited here by
// administrators; updates apply to correspondence authored thereafter (templates are read fresh
// each time the Compose picker opens). Only approved templates are offered to originators (AC5).
const TemplatesPanel: React.FC = () => {
  const { t } = useTranslation();
  const { templatesService } = useServices();

  const [templates, setTemplates] = React.useState<ICorrespondenceTemplate[] | undefined>(undefined);
  const [draft, setDraft] = React.useState<ICorrespondenceTemplate | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | undefined>(undefined);

  const load = React.useCallback(() => {
    setTemplates(undefined);
    templatesService
      .getTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, [templatesService]);

  React.useEffect(() => load(), [load]);

  const startAdd = (): void => {
    setError(undefined);
    setDraft(emptyTemplate());
  };
  const startEdit = (template: ICorrespondenceTemplate): void => {
    setError(undefined);
    setDraft({ ...template });
  };
  const cancelEdit = (): void => {
    setDraft(undefined);
    setError(undefined);
  };

  const setDraftField = <K extends keyof ICorrespondenceTemplate>(field: K, value: ICorrespondenceTemplate[K]): void => {
    setDraft((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const save = (): void => {
    if (!draft || !draft.name.trim()) {
      setError(t('templates.nameRequired'));
      return;
    }
    setBusy(true);
    setError(undefined);
    templatesService
      .saveTemplate(draft)
      .then(() => {
        cancelEdit();
        load();
      })
      .catch(() => setError(t('templates.saveFailed')))
      .finally(() => setBusy(false));
  };

  const remove = (template: ICorrespondenceTemplate): void => {
    if (!window.confirm(t('templates.confirmDelete', { name: template.name }))) return;
    setBusy(true);
    templatesService
      .deleteTemplate(template.id)
      .then(load)
      .catch(() => setError(t('templates.deleteFailed')))
      .finally(() => setBusy(false));
  };

  if (!templates) {
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
          <h2 className={styles.title}>{t('templates.panelTitle')}</h2>
          <p className={styles.description}>{t('templates.panelDescription')}</p>
        </div>
        {!draft && (
          <button type="button" className={styles.primaryButton} onClick={startAdd}>
            <Plus size={14} /> {t('templates.add')}
          </button>
        )}
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {draft && (
        <div className={styles.editor}>
          <h3 className={styles.editorTitle}>{draft.id ? t('templates.editTitle') : t('templates.addTitle')}</h3>
          <label className={styles.field}>
            <span className={styles.label}>{t('templates.name')}</span>
            <input
              className={styles.input}
              value={draft.name}
              onChange={(e) => setDraftField('name', e.target.value)}
              placeholder={t('templates.namePlaceholder')}
            />
          </label>
          <div className={styles.row}>
            <label className={styles.field}>
              <span className={styles.label}>{t('templates.headerField')}</span>
              <textarea
                className={styles.textarea}
                rows={2}
                value={draft.header}
                onChange={(e) => setDraftField('header', e.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>{t('templates.footerField')}</span>
              <textarea
                className={styles.textarea}
                rows={2}
                value={draft.footer}
                onChange={(e) => setDraftField('footer', e.target.value)}
              />
            </label>
          </div>
          <label className={styles.field}>
            <span className={styles.label}>{t('templates.bodyField')}</span>
            <textarea
              className={styles.textarea}
              rows={5}
              value={draft.bodyHtml}
              onChange={(e) => setDraftField('bodyHtml', e.target.value)}
            />
            <span className={styles.hint}>{t('templates.placeholderHint')}</span>
          </label>
          <label className={styles.checkboxField}>
            <input
              type="checkbox"
              checked={draft.approved !== false}
              onChange={(e) => setDraftField('approved', e.target.checked)}
            />
            <span>{t('templates.approved')}</span>
          </label>
          <div className={styles.editorActions}>
            <button type="button" className={styles.secondaryButton} onClick={cancelEdit} disabled={busy}>
              <X size={14} /> {t('common.cancel')}
            </button>
            <button type="button" className={styles.primaryButton} onClick={save} disabled={busy}>
              <Check size={14} /> {t('templates.save')}
            </button>
          </div>
        </div>
      )}

      {templates.length === 0 && !draft ? (
        <EmptyState title={t('templates.emptyTitle')} description={t('templates.emptyDescription')} />
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('templates.name')}</th>
              <th>{t('templates.status')}</th>
              <th className={styles.actionsCol}>{t('templates.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id}>
                <td>{template.name}</td>
                <td>
                  <span
                    className={`${styles.statusBadge} ${template.approved === false ? styles.statusDraft : styles.statusApproved}`}
                  >
                    {template.approved === false ? t('templates.statusDraftLabel') : t('templates.statusApprovedLabel')}
                  </span>
                </td>
                <td className={styles.actionsCol}>
                  <button
                    type="button"
                    className={styles.iconButton}
                    onClick={() => startEdit(template)}
                    aria-label={t('templates.editTitle')}
                    disabled={busy}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    className={styles.iconButtonDanger}
                    onClick={() => remove(template)}
                    aria-label={t('templates.delete')}
                    disabled={busy}
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default TemplatesPanel;
