import i18next from 'i18next';

export function getGridLocaleText(): Record<string, string> {
  const t = (key: string): string => i18next.t(key);
  return {
    page: t('grid.locale.page'),
    of: t('grid.locale.of'),
    to: t('grid.locale.to'),
    noRowsToShow: t('grid.locale.noRowsToShow'),
    loading: t('grid.locale.loading'),
    filterOoo: t('grid.locale.filterOoo'),
    equals: t('grid.locale.equals'),
    notEqual: t('grid.locale.notEqual'),
    contains: t('grid.locale.contains'),
    notContains: t('grid.locale.notContains'),
    startsWith: t('grid.locale.startsWith'),
    endsWith: t('grid.locale.endsWith'),
    blank: t('grid.locale.blank'),
    notBlank: t('grid.locale.notBlank'),
    lessThan: t('grid.locale.lessThan'),
    greaterThan: t('grid.locale.greaterThan'),
    lessThanOrEqual: t('grid.locale.lessThanOrEqual'),
    greaterThanOrEqual: t('grid.locale.greaterThanOrEqual'),
    inRange: t('grid.locale.inRange'),
    andCondition: t('grid.locale.andCondition'),
    orCondition: t('grid.locale.orCondition'),
    applyFilter: t('grid.locale.applyFilter'),
    resetFilter: t('grid.locale.resetFilter'),
    clearFilter: t('grid.locale.clearFilter'),
    sortAscending: t('grid.locale.sortAscending'),
    sortDescending: t('grid.locale.sortDescending'),
    sortUnSort: t('grid.locale.sortUnSort'),
  };
}
