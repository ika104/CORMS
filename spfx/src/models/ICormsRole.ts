/**
 * CORMS_UserRoles.Role — the source of truth for role-gated navigation (CMS-038 AC6), clearance
 * enforcement, and role-gated bulk actions across the Epic 1 workspace-shell-backend task. Distinct
 * from the older, unrelated `IUser.roles: string[]` literal set ('Administrator', 'Supervisor',
 * 'Manager', 'Auditor') used by pre-existing admin screens — TODO(confirm): the two vocabularies are
 * not reconciled by this task; see README "Decisions log" for why.
 */
import { IUserPermissions } from './IUserPermissions';

export type CormsRole =
  | 'Originator'
  | 'Reviewer'
  | 'Recipient'
  | 'DocumentControl'
  | 'CEOTriageOfficer'
  | 'SupervisorManager'
  | 'SystemAdministrator'
  | 'Auditor';

export const CORMS_ROLES: CormsRole[] = [
  'Originator',
  'Reviewer',
  'Recipient',
  'DocumentControl',
  'CEOTriageOfficer',
  'SupervisorManager',
  'SystemAdministrator',
  'Auditor',
];

/** Role assigned to a signed-in user with no CORMS_UserRoles row yet (RoleService.getCurrentUserRole). */
export const DEFAULT_UNPROVISIONED_ROLE: CormsRole = 'Recipient';

/** i18n key per role — shared by the nav footer's role label (CMS-038 AC8) and the Navigation
 * Menu admin screen's Required Roles column, so there's exactly one CormsRole -> label mapping. */
export const CORMS_ROLE_TRANSLATION_KEY: Record<CormsRole, string> = {
  Originator: 'role.originator',
  Reviewer: 'role.reviewer',
  Recipient: 'role.recipient',
  DocumentControl: 'role.documentControl',
  CEOTriageOfficer: 'role.ceoTriageOfficer',
  SupervisorManager: 'role.supervisorManager',
  SystemAdministrator: 'role.systemAdministrator',
  Auditor: 'role.auditor',
};

export interface ICurrentUserRole {
  role: CormsRole;
  /** False when the user had no CORMS_UserRoles row and the default was applied. */
  isProvisioned: boolean;
  /** CMS-055 AC3 — the signed-in user's per-user permission configuration
   * (CORMS_UserRoles.PermissionsJson), parsed. Undefined when the column is blank/absent/malformed
   * (default-allow — nothing is hidden). Consumed by NavigationServiceCore (view visibility) and
   * the usePermissions() hook. */
  permissions?: IUserPermissions;
  department?: string;
  /** Whether the signed-in user is a member of the site's associated Owners SharePoint group
   * (`sp.web.associatedOwnerGroup`) — deliberately the Owners *group*, not SP.User.IsSiteAdmin
   * (a narrower, separate "site collection administrator" flag many legitimate site owners don't
   * have). Only meaningful as a bootstrap fallback while `isProvisioned` is false (see useNav.ts's
   * file comment): it lets a site owner into Administration before CORMS_UserRoles has a row for
   * them, and stops mattering for that user the moment they're given a real CormsRole, even a
   * non-admin one. */
  isSiteOwner: boolean;
  /** The signed-in user's max security clearance from CORMS_UserRoles.ClearanceTier (ascending
   * 1=Unclassified..5=Top Secret — see SECURITY_TIERS). Undefined when the user has no role row or
   * the column is blank; consumers fall back to the safe default (tier 1). This is the live source
   * of truth for the current user's clearance that RecordsHub's getCurrentUser() never populated. */
  clearanceTier?: number;
}
