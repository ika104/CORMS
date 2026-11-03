import * as React from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { ModuleHeader } from '../../shell/ModuleHeader';
import { EmptyState } from '../../components/common/EmptyState';
import { useServices } from '../../services/ServiceProvider';
import { useNav } from '../../state/hooks/useNav';
import DataSourcesPanel from './dataSources/DataSourcesPanel';
import WorkflowMatrixPanel from './workflowMatrix/WorkflowMatrixPanel';
import AdminConfigPanel from './adminConfig/AdminConfigPanel';
import TranslationsPanel from './translations/TranslationsPanel';
import ProvisionListsPanel from './provisionLists/ProvisionListsPanel';
import NavigationMenuPanel from './navigationMenu/NavigationMenuPanel';
import UserPermissionsPanel from './userPermissions/UserPermissionsPanel';
import ReclassificationsPanel from './reclassifications/ReclassificationsPanel';
import TemplatesPanel from './templates/TemplatesPanel';
import ApprovalWorkflowsPanel from './approvalWorkflows/ApprovalWorkflowsPanel';
import { useAuditViewEvent } from '../../state/hooks';

const tabLabelKeys: { [segment: string]: string } = {
  'workflow-matrix': 'nav.workflowMatrix',
  'approval-workflows': 'nav.approvalWorkflows',
  'admin-config': 'nav.adminConfig',
  translations: 'nav.translations',
  'data-sources': 'nav.dataSources',
  'provision-lists': 'nav.provisionLists',
  'navigation-menu': 'nav.navigationMenu',
  'user-permissions': 'nav.userPermissions',
  reclassifications: 'nav.reclassifications',
  templates: 'nav.templates',
};

// TODO(confirm): role literal — the repo's mock users use 'Administrator' (see src/mocks/users.json);
// the task spec calls it "System Administrator". Using the existing role literal until confirmed.
const ADMIN_ROLE = 'Administrator';
// CMS-055/CMS-056: Admin Config and Translations are "restricted to System Administrator (and
// Document Control) roles" — a wider gate than Workflow Matrix's Administrator-only one below.
const ADMIN_CONFIG_ROLES = ['Administrator', 'Document Control'];

const AdministrationView: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const { configService } = useServices();
  const { currentUser, currentRole } = useNav();
  const segment = location.pathname.split('/').pop() ?? 'admin-config';
  const tabLabelKey = tabLabelKeys[segment];
  useAuditViewEvent(tabLabelKey ? t(tabLabelKey) : t('module.administration.title'));

  const title = tabLabelKey
    ? `${t('module.administration.title')} — ${t(tabLabelKey)}`
    : t('module.administration.title');

  // A CORMS_UserRoles 'SystemAdministrator' (RoleService, Epic 1) is the authoritative admin role
  // and unlocks every Administration panel — independent of the older, unrelated
  // currentUser.roles: ['Administrator'] literal set (RecordsHub identity), which stays as an
  // additional path. Without this, assigning someone SystemAdministrator turned OFF the site-owner
  // bootstrap (which only applies to users with no role row) yet did NOT unlock these panels,
  // because they only checked the legacy literal — locking out a genuine System Administrator.
  const isSystemAdministrator = currentRole === 'SystemAdministrator';
  const isAdmin = isSystemAdministrator || (!!currentUser && currentUser.roles.indexOf(ADMIN_ROLE) !== -1);
  const canAccessAdminConfig =
    isSystemAdministrator || (!!currentUser && currentUser.roles.some((role) => ADMIN_CONFIG_ROLES.indexOf(role) !== -1));

  if (segment === 'admin-config') {
    return (
      <>
        <ModuleHeader icon="settings" title={title} />
        {canAccessAdminConfig ? (
          <AdminConfigPanel />
        ) : (
          <EmptyState title={t('adminConfig.panelTitle')} description={t('dataSource.accessDenied')} />
        )}
      </>
    );
  }

  if (segment === 'data-sources') {
    // The mock/live data-source toggle (TASK-03) is a distinct, dev-only concern from
    // CMS-055's RecordsHub Configuration List (Admin Config above) — its own screen under
    // Administration rather than stacked beneath Admin Config, gated the same way it always was.
    const isDevEnv = configService.getConfig().environment === 'dev';

    return (
      <>
        <ModuleHeader icon="database" title={title} />
        {isAdmin && isDevEnv ? (
          <DataSourcesPanel />
        ) : (
          <EmptyState title={t('dataSource.panelTitle')} description={t('dataSource.accessDenied')} />
        )}
      </>
    );
  }

  if (segment === 'workflow-matrix') {
    return (
      <>
        <ModuleHeader icon="workflow" title={title} />
        {isAdmin ? (
          <WorkflowMatrixPanel />
        ) : (
          <EmptyState title={t('workflowMatrix.panelTitle')} description={t('workflowMatrix.accessDenied')} />
        )}
      </>
    );
  }

  if (segment === 'approval-workflows') {
    return (
      <>
        <ModuleHeader icon="workflow" title={title} />
        {isAdmin ? (
          <ApprovalWorkflowsPanel />
        ) : (
          <EmptyState title={t('approvalWorkflows.panelTitle')} description={t('workflowMatrix.accessDenied')} />
        )}
      </>
    );
  }

  if (segment === 'provision-lists') {
    // In-app SharePoint list provisioning writes lists/fields to the site — same
    // Administrator-only gate as Workflow Matrix, not the wider Admin Config/Translations one.
    return (
      <>
        <ModuleHeader icon="listChecks" title={title} />
        {isAdmin ? (
          <ProvisionListsPanel />
        ) : (
          <EmptyState title={t('provisionLists.panelTitle')} description={t('provisionLists.accessDenied')} />
        )}
      </>
    );
  }

  if (segment === 'navigation-menu') {
    return (
      <>
        <ModuleHeader icon="list" title={title} />
        {isSystemAdministrator ? (
          <NavigationMenuPanel />
        ) : (
          <EmptyState title={t('navigationMenu.panelTitle')} description={t('navigationMenu.accessDenied')} />
        )}
      </>
    );
  }

  if (segment === 'user-permissions') {
    // CMS-055 AC3 — per-user permission (views/tabs/buttons/dashboards) configuration. Restricted
    // to System Administrator + Document Control, the same wider gate as Admin Config/Translations.
    return (
      <>
        <ModuleHeader icon="userCog" title={title} />
        {canAccessAdminConfig ? (
          <UserPermissionsPanel />
        ) : (
          <EmptyState title={t('userPermissions.panelTitle')} description={t('dataSource.accessDenied')} />
        )}
      </>
    );
  }

  if (segment === 'translations') {
    return (
      <>
        <ModuleHeader icon="languages" title={title} />
        {canAccessAdminConfig ? (
          <TranslationsPanel />
        ) : (
          <EmptyState title={t('translations.panelTitle')} description={t('dataSource.accessDenied')} />
        )}
      </>
    );
  }

  if (segment === 'reclassifications') {
    // CMS-023 AC2 — the maker-checker review queue. Records Admins / Document Control act as checkers.
    return (
      <>
        <ModuleHeader icon="shieldCheck" title={title} />
        {canAccessAdminConfig ? (
          <ReclassificationsPanel />
        ) : (
          <EmptyState title={t('reclassifications.panelTitle')} description={t('dataSource.accessDenied')} />
        )}
      </>
    );
  }

  if (segment === 'templates') {
    // CMS-005 AC13 — SSL Oman's correspondence templates are authored/edited here; updates apply to
    // correspondence authored thereafter. Same Administrator-only gate as Workflow Matrix.
    return (
      <>
        <ModuleHeader icon="fileText" title={title} />
        {isAdmin ? (
          <TemplatesPanel />
        ) : (
          <EmptyState title={t('templates.panelTitle')} description={t('workflowMatrix.accessDenied')} />
        )}
      </>
    );
  }

  return (
    <>
      <ModuleHeader icon="settings" title={title} />
      <EmptyState title={t('common.comingSoon')} description={t('common.comingSoonDescription')} />
    </>
  );
};

export default AdministrationView;
