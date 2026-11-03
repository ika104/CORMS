import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid, DataGridColumn } from '../../../components/grid/DataGrid';
import { Icon } from '../../../components/icons/Icon';
import { ISecurityPrincipal } from '../../../models/ICorrespondenceDetail';
import gridStyles from '../../../components/grid/DataGrid.module.scss';
import styles from './SecurityTab.module.scss';

export interface ISecurityTabProps {
  loadPrincipals: () => Promise<ISecurityPrincipal[]>;
  onOpenReclassify: () => void;
}

export const SecurityTab: React.FC<ISecurityTabProps> = ({ loadPrincipals, onOpenReclassify }) => {
  const { t } = useTranslation();
  const [principals, setPrincipals] = React.useState<ISecurityPrincipal[]>([]);
  const [loading, setLoading] = React.useState(true);

  const refresh = React.useCallback(() => {
    setLoading(true);
    loadPrincipals()
      .then((result) => {
        setPrincipals(result);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [loadPrincipals]);

  React.useEffect(() => {
    refresh();
  }, []);

  const columns: DataGridColumn<ISecurityPrincipal>[] = [
    { field: 'principal', headerKey: 'correspondenceDetail.security.col.principal', filter: 'text', flex: 1, minWidth: 180 },
    {
      field: 'permissionLevel',
      headerKey: 'correspondenceDetail.security.col.permissionLevel',
      filter: 'text',
      width: 160,
    },
    { field: 'type', headerKey: 'correspondenceDetail.security.col.type', filter: 'text', width: 160 },
  ];

  return (
    <div className={styles.tab}>
      <DataGrid<ISecurityPrincipal>
        columns={columns}
        rows={principals}
        loading={loading}
        onRefresh={refresh}
        getRowId={(row) => row.id}
        enableViewToggle={false}
        gridId="correspondence-detail-security"
        toolbarRightActions={
          <button type="button" className={gridStyles.gridToolbarBtnPrimary} onClick={onOpenReclassify}>
            <Icon name="shieldCheck" size={14} />
            <span>{t('correspondenceDetail.security.reclassify')}</span>
          </button>
        }
      />
    </div>
  );
};
