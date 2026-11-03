import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../../components/icons/Icon';
import { SECURITY_TIERS, STATUS_CONFIG } from '../../../models/ICorrespondence';
import { ICorrespondenceDetail } from '../../../models/ICorrespondenceDetail';
import { DeliveryOptionsSection } from './DeliveryOptionsSection';
import { normalizeDisplayList } from '../../../services/common/mapCorrespondenceRow';
import { formatCardDate, formatCardDateTime } from '../../../utils/formatDateTime';
import { useServices } from '../../../services/ServiceProvider';
import { SearchableSelect, ISelectOption } from '../../createCorrespondence/components/SearchableSelect';
import styles from './DetailsTab.module.scss';

/** Metadata sent alongside a committed field value — currently the resolved SharePoint login of a
 * person picked from the Assigned To picker, which the save needs to set the person column. */
export interface IFieldChangeMeta {
  login?: string;
}

export interface IDetailsTabProps {
  detail: ICorrespondenceDetail;
  canEdit: boolean;
  /** True when there are staged, unsaved field edits — enables the Save button. */
  dirty?: boolean;
  /** Opens the mandatory-comment save modal; the actual persistence happens in the parent. */
  onSave?: () => void;
  onFieldChange: (key: string, value: string, meta?: IFieldChangeMeta) => void;
}

/** How an editable field is edited — matching the Create screen's input for that field. */
type FieldEditor = 'text' | 'select' | 'date' | 'person';

interface IDetailField {
  key: string;
  labelKey: string;
  /** Friendly, display-ready value (dates formatted, empty as '—'). */
  value: string;
  /** Raw value handed to the editor (e.g. `yyyy-mm-dd` for a date input). Defaults to `value`. */
  editValue?: string;
  editable: boolean;
  editor?: FieldEditor;
}

// CMS-040 AC6 — the full metadata set in the order the acceptance criteria list it. Editable fields
// (Originating Function, Due Date, Assigned To, Comments) each declare the editor that mirrors the
// same field on the Create screen. Dates render friendly (DD/MM/YYYY [h:mm]) rather than raw ISO.
function buildFields(detail: ICorrespondenceDetail, t: (key: string) => string): IDetailField[] {
  const securityLevelName = SECURITY_TIERS.find((tier) => tier.tier === detail.securityTier)?.name ?? '';
  const priorityReason = detail.expedited?.reason || detail.priorityReason;
  const priorityValue = priorityReason ? `${detail.priority} — ${priorityReason}` : detail.priority;
  // The date input wants a bare yyyy-mm-dd; a stored ISO timestamp is sliced to its date part.
  const dueDateRaw = detail.dueDate ? detail.dueDate.slice(0, 10) : '';
  const fields: IDetailField[] = [
    { key: 'subject', labelKey: 'correspondenceDetail.field.subject', value: detail.subject, editable: false },
    {
      key: 'referenceNumber',
      labelKey: 'correspondenceDetail.field.refNo',
      value: detail.referenceNumber || '—',
      editable: false,
    },
    { key: 'type', labelKey: 'correspondenceDetail.field.type', value: detail.type, editable: false },
    { key: 'direction', labelKey: 'correspondenceDetail.field.direction', value: detail.direction, editable: false },
    {
      key: 'contentType',
      labelKey: 'correspondenceDetail.field.contentType',
      value: detail.contentType || '—',
      editable: false,
    },
    { key: 'channel', labelKey: 'correspondenceDetail.field.channel', value: detail.channel || '—', editable: false },
    {
      key: 'securityLevel',
      labelKey: 'correspondenceDetail.field.securityLevel',
      value: securityLevelName,
      editable: false,
    },
    { key: 'priority', labelKey: 'correspondenceDetail.field.priority', value: priorityValue, editable: false },
    {
      key: 'status',
      labelKey: 'correspondenceDetail.field.status',
      value: STATUS_CONFIG[detail.status]?.label ?? detail.status,
      editable: false,
    },
    { key: 'sender', labelKey: 'correspondenceDetail.field.sender', value: detail.senderName || '—', editable: false },
    {
      key: 'recipient',
      labelKey: 'correspondenceDetail.field.recipient',
      value: detail.recipientName || '—',
      editable: false,
    },
    {
      key: 'departmentTo',
      labelKey: 'correspondenceDetail.field.departmentTo',
      value:
        detail.direction === 'Incoming'
          ? normalizeDisplayList(detail.department)
          : normalizeDisplayList(detail.recipientName || detail.department),
      editable: false,
    },
    {
      key: 'originatingFunction',
      labelKey: 'correspondenceDetail.field.originatingFunction',
      value: detail.originatingFunction || '—',
      editValue: detail.originatingFunction || '',
      editable: true,
      editor: 'select',
    },
    // CMS-040 AC6 — owned by Triage & Routing (CurrentReviewer/CurrentDepartment), not edited here:
    // there's no write path this screen owns for a triage-assigned reviewer.
    {
      key: 'currentReviewer',
      labelKey: 'correspondenceDetail.field.currentReviewer',
      value: detail.currentReviewer || '—',
      editable: false,
    },
    {
      key: 'currentDepartment',
      labelKey: 'correspondenceDetail.field.currentDepartment',
      value: detail.currentDepartment || '—',
      editable: false,
    },
    {
      key: 'createdAt',
      labelKey: 'correspondenceDetail.field.createdAt',
      value: formatCardDateTime(detail.createdAt),
      editable: false,
    },
    {
      key: 'dueDate',
      labelKey: 'correspondenceDetail.field.dueDate',
      value: detail.dueDate ? formatCardDate(detail.dueDate) : '—',
      editValue: dueDateRaw,
      editable: true,
      editor: 'date',
    },
    {
      key: 'recordClassification',
      labelKey: 'correspondenceDetail.field.recordClassification',
      value: detail.recordClassificationName || '—',
      editable: false,
    },
    {
      key: 'assignedTo',
      labelKey: 'correspondenceDetail.field.assignedTo',
      value: detail.assignedTo || '—',
      editable: true,
      editor: 'person',
    },
    {
      key: 'comment',
      labelKey: 'correspondenceDetail.field.comment',
      value: detail.comment || '',
      editValue: detail.comment || '',
      editable: true,
      editor: 'text',
    },
  ];
  return fields.map((f) => ({ ...f, labelKey: t(f.labelKey) }));
}

interface IFieldRowProps {
  row: IDetailField;
  editing: boolean;
  canEdit: boolean;
  /** Originating-function options (id = English name, label follows the UI language). */
  functionOptions: ISelectOption[];
  searchPeople: (query: string) => Promise<ISelectOption[]>;
  onStartEdit: () => void;
  onCommit: (value: string, meta?: IFieldChangeMeta) => void;
  onCancel: () => void;
}

const FieldRow: React.FC<IFieldRowProps> = ({
  row,
  editing,
  canEdit,
  functionOptions,
  searchPeople,
  onStartEdit,
  onCommit,
  onCancel,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const editorType = row.editor ?? 'text';

  const renderEditor = (): React.ReactNode => {
    if (editorType === 'select') {
      return (
        <select
          autoFocus
          className={styles.editSelect}
          defaultValue={row.editValue ?? ''}
          onChange={(e) => onCommit(e.target.value)}
          onBlur={onCancel}
        >
          <option value="">—</option>
          {/* Keep a stored value selectable even if it isn't (yet) among the loaded options. */}
          {row.editValue && !functionOptions.some((o) => o.id === row.editValue) && (
            <option value={row.editValue}>{row.editValue}</option>
          )}
          {functionOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }
    if (editorType === 'date') {
      return (
        <input
          ref={inputRef}
          type="date"
          autoFocus
          className={styles.editInput}
          defaultValue={row.editValue ?? ''}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit(inputRef.current?.value ?? '');
            if (e.key === 'Escape') onCancel();
          }}
          onBlur={(e) => onCommit(e.currentTarget.value)}
        />
      );
    }
    if (editorType === 'person') {
      return (
        <SearchableSelect
          placeholder={row.value === '—' ? '' : row.value}
          fetchOptions={searchPeople}
          selected={[]}
          onChange={(selected) => {
            const picked = selected[0];
            if (picked) onCommit(picked.label, { login: picked.id });
            else onCancel();
          }}
        />
      );
    }
    // Plain free text (Comments).
    return (
      <input
        ref={inputRef}
        type="text"
        autoFocus
        defaultValue={row.editValue ?? row.value}
        className={styles.editInput}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(inputRef.current?.value ?? '');
          if (e.key === 'Escape') onCancel();
        }}
        onBlur={(e) => onCommit(e.currentTarget.value)}
      />
    );
  };

  return (
    <div className={styles.row}>
      <div className={styles.label}>{row.labelKey}</div>
      <div className={styles.valueWrap}>
        {editing ? (
          renderEditor()
        ) : (
          <>
            <span className={styles.valueText}>{row.value || '—'}</span>
            {canEdit && row.editable && (
              <button type="button" className={styles.pencilBtn} onClick={onStartEdit} aria-label="edit">
                <Icon name="pencil" size={12} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export const DetailsTab: React.FC<IDetailsTabProps> = ({ detail, canEdit, dirty, onSave, onFieldChange }) => {
  const { t, i18n } = useTranslation();
  const { metadataService, sharePointService } = useServices();
  const [editingKey, setEditingKey] = React.useState<string | undefined>(undefined);
  const [functionOptions, setFunctionOptions] = React.useState<ISelectOption[]>([]);
  const preferArabic = i18n.language.indexOf('ar') === 0;

  // Same source and label rule as the Create screen's Originating Function dropdown: the option id
  // is the English name (what's persisted), the label follows the UI language.
  React.useEffect(() => {
    metadataService
      .getOriginatingFunctions()
      .then((functions) =>
        setFunctionOptions(functions.map((f) => ({ id: f.name, label: (preferArabic ? f.nameAr : f.name) || f.name })))
      )
      .catch(() => setFunctionOptions([]));
  }, [metadataService, preferArabic]);

  const searchPeople = React.useCallback(
    async (query: string): Promise<ISelectOption[]> => {
      const results = await sharePointService.searchPeople(query);
      return results.map((p) => ({ id: p.id, label: p.name, sublabel: p.email }));
    },
    [sharePointService]
  );

  const rows = buildFields(detail, t);

  const commit = (key: string, value: string, meta?: IFieldChangeMeta): void => {
    setEditingKey(undefined);
    onFieldChange(key, value, meta);
  };

  return (
    <div className={styles.tab}>
      {detail.status === 'Declared' && (
        <div className={styles.declaredBanner}>
          <Icon name="fileCheck" size={16} />
          <div className={styles.declaredInfo}>
            <span className={styles.declaredTitle}>{t('correspondenceDetail.declare.bannerTitle')}</span>
            <span className={styles.declaredMeta}>
              {t('correspondenceDetail.declare.serial')}: <strong>{detail.recordSerialNumber || '—'}</strong>
              {detail.recordClassificationName ? ` · ${detail.recordClassificationName}` : ''}
            </span>
            {detail.declaredBy && (
              <span className={styles.declaredMeta}>
                {t('correspondenceDetail.declare.by', { name: detail.declaredBy })}
                {detail.declaredAt ? ` · ${formatCardDateTime(detail.declaredAt)}` : ''}
              </span>
            )}
          </div>
        </div>
      )}
      <div className={styles.fieldList}>
        {rows.map((row) => (
          <FieldRow
            key={row.key}
            row={row}
            editing={editingKey === row.key}
            canEdit={canEdit}
            functionOptions={functionOptions}
            searchPeople={searchPeople}
            onStartEdit={() => setEditingKey(row.key)}
            onCommit={(value, meta) => commit(row.key, value, meta)}
            onCancel={() => setEditingKey(undefined)}
          />
        ))}
      </div>

      {/* CMS-040 — Save the staged inline edits. Enabled only once something changed; clicking it
          opens the mandatory change-comment modal (the parent persists on confirm). */}
      {canEdit && (
        <div className={styles.saveRow}>
          <button type="button" className={styles.saveBtn} disabled={!dirty} onClick={() => onSave?.()}>
            <Icon name="check" size={14} /> {t('correspondenceDetail.details.save')}
          </button>
        </div>
      )}

      <DeliveryOptionsSection detail={detail} />
    </div>
  );
};
