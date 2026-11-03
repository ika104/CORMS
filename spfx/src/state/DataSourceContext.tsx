import * as React from 'react';
import { ICacheService } from '../services/interfaces';
import { IDevSettingsService } from '../services/interfaces/IDevSettingsService';
import { DataSourceConfig, DEFAULT_DATA_SOURCE_CONFIG, isDevModeActive } from '../services/dataSource/dataSourceConfig';
import { configToRows, rowsToConfig } from '../services/dataSource/devSettingsMapping';

const CACHE_NAMESPACE = 'corms.dataSource';
const CACHE_KEY = 'config';

export interface IDataSourceContextValue {
  config: DataSourceConfig;
  isLoading: boolean;
  isDevMode: boolean;
  /** Which backend actually served/persisted the config last: the live CORMS_DevSettings list, or the localStorage fallback (spec §5). */
  persistence: 'live' | 'localStorage';
  setConfig: (config: DataSourceConfig) => void;
  /** Persists the given config (or the current one if omitted), then re-reads (spec §5). */
  save: (config?: DataSourceConfig) => Promise<void>;
  reset: () => Promise<void>;
}

const DataSourceContext = React.createContext<IDataSourceContextValue | undefined>(undefined);

export interface IDataSourceProviderProps {
  liveService: IDevSettingsService;
  fallbackService: IDevSettingsService;
  cacheService: ICacheService;
  children: React.ReactNode;
}

// Loads/persists the DEV data-source config: primary CORMS_DevSettings list (TASK-04), falling
// back to localStorage when the list is absent (spec §5). Config is loaded once at app start and
// re-read after every Save.
export const DataSourceProvider: React.FC<IDataSourceProviderProps> = ({
  liveService,
  fallbackService,
  cacheService,
  children,
}) => {
  const [config, setConfigState] = React.useState<DataSourceConfig>(
    () => cacheService.get<DataSourceConfig>(CACHE_NAMESPACE, CACHE_KEY) ?? DEFAULT_DATA_SOURCE_CONFIG
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [persistence, setPersistence] = React.useState<'live' | 'localStorage'>('localStorage');

  const load = React.useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      let rows: Awaited<ReturnType<IDevSettingsService['getSettings']>>;
      let usedPersistence: 'live' | 'localStorage' = 'localStorage';
      try {
        rows = await liveService.getSettings();
        if (rows) {
          usedPersistence = 'live';
        }
      } catch {
        rows = undefined;
      }
      if (!rows) {
        rows = await fallbackService.getSettings();
      }
      const loaded = rows ? rowsToConfig(rows) : DEFAULT_DATA_SOURCE_CONFIG;
      setConfigState(loaded);
      setPersistence(usedPersistence);
      cacheService.set(CACHE_NAMESPACE, CACHE_KEY, loaded);
    } finally {
      setIsLoading(false);
    }
  }, [liveService, fallbackService, cacheService]);

  React.useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  const setConfig = React.useCallback((next: DataSourceConfig) => {
    setConfigState(next);
  }, []);

  const persist = React.useCallback(
    async (next: DataSourceConfig): Promise<void> => {
      const rows = configToRows(next);
      try {
        await liveService.saveSettings(rows);
        setPersistence('live');
      } catch {
        await fallbackService.saveSettings(rows);
        setPersistence('localStorage');
      }
      cacheService.set(CACHE_NAMESPACE, CACHE_KEY, next);
      await load();
    },
    [liveService, fallbackService, cacheService, load]
  );

  const save = React.useCallback(
    (next?: DataSourceConfig) => {
      const toSave = next ?? config;
      setConfigState(toSave);
      return persist(toSave);
    },
    [persist, config]
  );

  const reset = React.useCallback(() => {
    setConfigState(DEFAULT_DATA_SOURCE_CONFIG);
    return persist(DEFAULT_DATA_SOURCE_CONFIG);
  }, [persist]);

  const value = React.useMemo<IDataSourceContextValue>(
    () => ({
      config,
      isLoading,
      isDevMode: isDevModeActive(config),
      persistence,
      setConfig,
      save,
      reset,
    }),
    [config, isLoading, persistence, setConfig, save, reset]
  );

  return <DataSourceContext.Provider value={value}>{children}</DataSourceContext.Provider>;
};

export function useDataSource(): IDataSourceContextValue {
  const ctx = React.useContext(DataSourceContext);
  if (!ctx) {
    throw new Error('useDataSource must be used within a DataSourceProvider');
  }
  return ctx;
}
