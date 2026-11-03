import * as React from 'react';
import { SearchBox } from '../components/common/SearchBox';
import styles from './SplitPane.module.scss';

export interface ISplitPaneProps {
  listContent: React.ReactNode;
  detailContent: React.ReactNode;
  onListSearch?: (value: string) => void;
  listSearchPlaceholder?: string;
}

// List/tree panel with its own search box, beside a detail panel on the right (§2, §8).
export const SplitPane: React.FC<ISplitPaneProps> = ({
  listContent,
  detailContent,
  onListSearch,
  listSearchPlaceholder,
}) => (
  <div className={styles.splitPane}>
    <div className={styles.listPanel}>
      <div className={styles.listSearch}>
        <SearchBox placeholder={listSearchPlaceholder} onChange={onListSearch} />
      </div>
      <div className={styles.listBody}>{listContent}</div>
    </div>
    <div className={styles.detailPanel}>{detailContent}</div>
  </div>
);
