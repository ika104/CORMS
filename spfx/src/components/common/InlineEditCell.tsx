import * as React from 'react';
import { Icon } from '../icons/Icon';
import styles from './InlineEditCell.module.scss';

export interface IInlineEditCellProps {
  value: string;
  editing: boolean;
  canEdit: boolean;
  onStartEdit: () => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
  /** CMS-056 — renders the display value as a fixed-length mask and defaults the edit input to
   * a password field with an eye-icon reveal toggle. Use for API keys / secrets only; a plain
   * value like RootSiteUrl or Task-List should leave this unset. */
  secret?: boolean;
  ariaLabel?: string;
}

const MASK_DISPLAY = '••••••••••';

/**
 * Shared row/cell inline-edit interaction: pencil -> editable input with an explicit
 * check (save) / cross (cancel) button pair, used by Admin Config (CMS-055) and Translations
 * row actions. Deliberately a distinct component from correspondenceDetail's DetailsTab
 * `FieldRow` (Enter/blur-to-commit, single edit toggle, no explicit save/cancel buttons) —
 * that pattern predates this one and its interaction contract differs, so it is left as-is
 * rather than forced onto this one. TODO(confirm): fully consolidating the two into one
 * component was flagged as a nice-to-have in the story text, not a hard requirement.
 */
export const InlineEditCell: React.FC<IInlineEditCellProps> = ({
  value,
  editing,
  canEdit,
  onStartEdit,
  onCommit,
  onCancel,
  secret,
  ariaLabel,
}) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [reveal, setReveal] = React.useState(false);

  React.useEffect(() => {
    if (!editing) setReveal(false);
  }, [editing]);

  if (!editing) {
    return (
      <div className={styles.cell}>
        <span className={styles.valueText}>{secret ? MASK_DISPLAY : value || '—'}</span>
        {canEdit && (
          <button type="button" className={styles.iconBtn} onClick={onStartEdit} aria-label={ariaLabel ?? 'edit'}>
            <Icon name="pencil" size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={styles.cell}>
      <input
        ref={inputRef}
        type={secret && !reveal ? 'password' : 'text'}
        autoFocus
        defaultValue={value}
        className={styles.editInput}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onCommit(inputRef.current?.value ?? value);
          if (e.key === 'Escape') onCancel();
        }}
      />
      {secret && (
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => setReveal((r) => !r)}
          aria-label={reveal ? 'hide' : 'reveal'}
        >
          <Icon name={reveal ? 'eyeOff' : 'eye'} size={12} />
        </button>
      )}
      <button
        type="button"
        className={styles.iconBtnSave}
        onClick={() => onCommit(inputRef.current?.value ?? value)}
        aria-label="save"
      >
        <Icon name="check" size={12} />
      </button>
      <button type="button" className={styles.iconBtnCancel} onClick={onCancel} aria-label="cancel">
        <Icon name="x" size={12} />
      </button>
    </div>
  );
};
