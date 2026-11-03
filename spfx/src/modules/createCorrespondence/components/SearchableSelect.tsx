import * as React from 'react';
import { X } from 'lucide-react';
import styles from './SearchableSelect.module.scss';

export interface ISelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

export interface ISearchableSelectProps {
  placeholder: string;
  helperText?: string;
  /** An asynchronous-source failure is distinct from an empty option set. */
  errorText?: string;
  /** Copy shown only when the asynchronous options source fails. */
  loadErrorText?: string;
  fetchOptions: (query: string) => Promise<ISelectOption[]>;
  multiple?: boolean;
  selected: ISelectOption[];
  onChange: (selected: ISelectOption[]) => void;
  disabled?: boolean;
  ariaLabel?: string;
  /** A stable target used to return users to this custom input after a failed Send attempt. */
  validationField?: string;
  invalid?: boolean;
}

const DEBOUNCE_MS = 200;

// Async searchable dropdown used for every "RecordHub API"-badged field on the New Correspondence
// form (Content Type, Recipient, Record Classification, Destination Departments, External
// Organizations) — single- or multi-select over whatever fetchOptions resolves to.
export const SearchableSelect: React.FC<ISearchableSelectProps> = ({
  placeholder,
  helperText,
  errorText,
  loadErrorText,
  fetchOptions,
  multiple = false,
  selected,
  onChange,
  disabled,
  ariaLabel,
  validationField,
  invalid = false,
}) => {
  const [query, setQuery] = React.useState('');
  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState<ISelectOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const debounceRef = React.useRef<number>();

  React.useEffect(() => {
    if (!open) return undefined;
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setLoading(true);
      setLoadFailed(false);
      fetchOptions(query)
        .then((result) => {
          setOptions(result);
          setLoading(false);
        })
        .catch(() => {
          setOptions([]);
          setLoadFailed(true);
          setLoading(false);
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(debounceRef.current);
  }, [query, open, fetchOptions]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isSelected = (id: string): boolean => selected.some((s) => s.id === id);

  const selectOption = (option: ISelectOption): void => {
    if (multiple) {
      onChange(isSelected(option.id) ? selected.filter((s) => s.id !== option.id) : [...selected, option]);
      setQuery('');
    } else {
      onChange([option]);
      setQuery('');
      setOpen(false);
    }
  };

  const removeChip = (id: string): void => {
    onChange(selected.filter((s) => s.id !== id));
  };

  const showChips = multiple && selected.length > 0;
  const singleValueLabel = !multiple && selected.length > 0 ? selected[0].label : '';

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <div className={`${styles.inputRow} ${disabled ? styles.inputRowDisabled : ''}`}>
        {showChips &&
          selected.map((chip) => (
            <span key={chip.id} className={styles.chip}>
              {chip.label}
              {!disabled && (
                <button
                  type="button"
                  className={styles.chipRemove}
                  onClick={() => removeChip(chip.id)}
                  aria-label={chip.label}
                >
                  <X size={12} />
                </button>
              )}
            </span>
          ))}
        <input
          type="text"
          className={styles.input}
          value={open ? query : query || singleValueLabel}
          placeholder={placeholder}
          aria-label={ariaLabel ?? placeholder}
          aria-invalid={invalid || undefined}
          data-validation-field={validationField}
          disabled={disabled}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
        />
      </div>
      {open && (
        <div className={styles.dropdown}>
          {loading && <div className={styles.empty}>…</div>}
          {!loading && options.length === 0 && <div className={styles.empty}>—</div>}
          {!loading &&
            options.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`${styles.option} ${isSelected(option.id) ? styles.optionSelected : ''}`}
                onClick={() => selectOption(option)}
              >
                {option.label}
                {option.sublabel && <span className={styles.optionSublabel}>{option.sublabel}</span>}
              </button>
            ))}
        </div>
      )}
      {helperText && <div className={styles.helper}>{helperText}</div>}
      {(errorText || (loadFailed && loadErrorText)) && (
        <div className={styles.error} role="alert">
          {loadFailed ? loadErrorText ?? errorText : errorText}
        </div>
      )}
    </div>
  );
};
