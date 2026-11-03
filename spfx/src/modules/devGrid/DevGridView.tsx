import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { DataGrid, DataGridColumn } from '../../components/grid/DataGrid';

interface IDemoRow {
  id: string;
  name: string;
  department: string;
  status: string;
  amount: number;
  date: string;
}

const STATUSES = ['Active', 'Pending', 'Completed', 'Cancelled', 'Draft'];
const DEPARTMENTS_EN = [
  'Engineering',
  'Human Resources',
  'Finance',
  'Legal',
  'Marketing',
  'Operations',
  'IT',
  'Security',
  'Compliance',
  'Procurement',
];
const NAMES_MIXED = [
  'أحمد محمد',
  'أَحْمَد مُحَمَّد',
  'احمد محمد',
  'عبدالله الشريف',
  'عبد الله الشّريف',
  'فاطمة الزهراء',
  'فاطمه الزهراء',
  'محمد علي',
  'مُحَمَّد عَلِيّ',
  'محمد على',
  'سارة إبراهيم',
  'ساره ابراهيم',
  'خالد العتيبي',
  'خـالـد العتيبي',
  'نورة الدوسري',
  'نوره الدوسرى',
  'يوسف آل سعود',
  'يوسف ال سعود',
  'مريم القحطاني',
  'مريم القحطانى',
  'عمر بن الخطاب',
  'عمر بن الخطّاب',
  'John Smith',
  'Jane Doe',
  'María García',
  'José López',
  'François Müller',
  'André Dupont',
  'Hans Günther',
  'Alice Johnson',
  'Bob Williams',
  'Charlie Brown',
];

function pad2(n: number): string {
  return n < 10 ? '0' + String(n) : String(n);
}

const DEMO_ROW_COUNT = 137;

function generateMockRows(): IDemoRow[] {
  const rows: IDemoRow[] = [];
  for (let i = 1; i <= DEMO_ROW_COUNT; i++) {
    rows.push({
      id: `demo-${i}`,
      name: NAMES_MIXED[i % NAMES_MIXED.length],
      department: DEPARTMENTS_EN[i % DEPARTMENTS_EN.length],
      status: STATUSES[i % STATUSES.length],
      amount: Math.round((i * 173.57 + 200) * 100) / 100,
      date: `2025-${pad2((i % 12) + 1)}-${pad2((i % 28) + 1)}`,
    });
  }
  return rows;
}

function StatusPill({ status }: { status: string }): React.ReactElement {
  const colorMap: Record<string, { color: string; bg: string }> = {
    Active: { color: '#107c10', bg: '#dff6dd' },
    Pending: { color: '#835b00', bg: '#fff4ce' },
    Completed: { color: '#0070d0', bg: '#e8f0fb' },
    Cancelled: { color: '#c50f1f', bg: '#fde7e9' },
    Draft: { color: '#605e5c', bg: '#f3f2f1' },
  };
  const cfg = colorMap[status] || { color: '#605e5c', bg: '#f3f2f1' };
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 500,
        color: cfg.color,
        background: cfg.bg,
      }}
    >
      {status}
    </span>
  );
}

const INITIAL_ROWS = generateMockRows();

const DevGridView: React.FC = () => {
  const { t } = useTranslation();
  const [rows, setRows] = React.useState<IDemoRow[]>(INITIAL_ROWS);
  const [loading, setLoading] = React.useState(false);

  const columns: DataGridColumn<IDemoRow>[] = React.useMemo(
    () => [
      { field: 'id', headerKey: 'grid.column.reference', filter: 'text' as const, width: 120 },
      { field: 'name', headerKey: 'grid.demo.name', filter: 'text' as const, flex: 2 },
      { field: 'department', headerKey: 'grid.demo.department', filter: 'text' as const, flex: 1 },
      {
        field: 'status',
        headerKey: 'grid.demo.status',
        filter: 'text' as const,
        width: 140,
        cellRenderer: (row: IDemoRow) => <StatusPill status={row.status} />,
      },
      { field: 'amount', headerKey: 'grid.demo.amount', filter: 'number' as const, width: 120 },
      { field: 'date', headerKey: 'grid.demo.date', filter: 'date' as const, width: 140 },
    ],
    []
  );

  const handleRefresh = React.useCallback(() => {
    setLoading(true);
    setTimeout(() => {
      setRows(generateMockRows());
      setLoading(false);
    }, 800);
  }, []);

  const cardRenderer = React.useCallback(
    (row: IDemoRow) => (
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{row.name}</div>
        <div style={{ fontSize: 12, color: 'var(--corms-text-secondary)' }}>{row.id}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
          <StatusPill status={row.status} />
          <span style={{ fontSize: 12, color: 'var(--corms-text-secondary)' }}>{row.department}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 12 }}>
          <span style={{ color: 'var(--corms-text-secondary)' }}>{row.date}</span>
          <span style={{ fontWeight: 600 }}>{row.amount.toLocaleString()}</span>
        </div>
      </div>
    ),
    []
  );

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ margin: '0 0 16px', fontSize: 18, color: 'var(--corms-text-primary)' }}>
        {t('grid.demo.title')} — CMS-044 Verification Harness
      </h2>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--corms-text-secondary)' }}>
        {DEMO_ROW_COUNT} rows | Arabic diacritics test: type &quot;محمد&quot; or &quot;احمد&quot; in the Name
        filter
      </p>
      <DataGrid<IDemoRow>
        columns={columns}
        rows={rows}
        loading={loading}
        onRefresh={handleRefresh}
        getRowId={(row) => row.id}
        defaultViewMode="cards"
        enableViewToggle={true}
        cardRenderer={cardRenderer}
        gridId="dev-grid-demo"
        emptyStateKey="grid.empty.default"
      />
    </div>
  );
};

export default DevGridView;
