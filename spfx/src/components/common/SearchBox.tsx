import * as React from 'react';
import { Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './SearchBox.module.scss';

export interface ISearchBoxProps {
  /** Controlled value. Omit to let the box hold its own text. */
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
}

export const SearchBox: React.FC<ISearchBoxProps> = ({ value, placeholder, onChange }) => {
  const { t } = useTranslation();
  const [internalValue, setInternalValue] = React.useState('');
  const currentValue = value ?? internalValue;

  const handleChange = (next: string): void => {
    if (value === undefined) {
      setInternalValue(next);
    }
    onChange?.(next);
  };

  return (
    <div className={styles.searchBox}>
      <Search size={16} />
      <input
        type="text"
        value={currentValue}
        placeholder={placeholder ?? t('common.search')}
        aria-label={placeholder ?? t('common.search')}
        onChange={(e) => handleChange(e.target.value)}
      />
    </div>
  );
};
