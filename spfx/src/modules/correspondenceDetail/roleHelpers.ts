import { IUser } from '../../models/IUser';

// TODO(confirm): "Records Admin" is mapped to the existing 'Administrator' role — the only
// elevated role modelled in mock data today (see AdministrationView.tsx's ADMIN_ROLE / users.json).
// Confirm the exact role name once the real RBAC model exists.
const RECORDS_ADMIN_ROLE = 'Administrator';

export function isRecordsAdmin(user: IUser | undefined): boolean {
  return !!user && user.roles.indexOf(RECORDS_ADMIN_ROLE) !== -1;
}

/** Details tab's "Fields editable" toggle — Records Admin only for now. */
export function canEditDetailFields(user: IUser | undefined): boolean {
  return isRecordsAdmin(user);
}

/** True when the current user is the person the correspondence is assigned to. `assignedTo` is the
 * stored display name (CORMS_Correspondence.AssignedTo/Title), matched case-insensitively against
 * the user's display name or email — so whoever holds the assignment can act on the item even
 * without an elevated role (see canEditDetailFields callers). */
export function isAssignedTo(user: IUser | undefined, assignedTo: string | undefined): boolean {
  if (!user || !assignedTo) return false;
  const target = assignedTo.trim().toLowerCase();
  return (
    (!!user.displayName && target === user.displayName.trim().toLowerCase()) ||
    (!!user.email && target === user.email.trim().toLowerCase())
  );
}

/** Mock permission check gating the Share Link action (CMS-035). */
export function canShareCorrespondence(user: IUser | undefined): boolean {
  return !!user && (user.roles.indexOf('Administrator') !== -1 || user.roles.indexOf('Supervisor') !== -1);
}

/** Re-classification (CMS-023): Records Admin changes go direct; everyone else routes through
 * maker-checker approval. */
export function reclassifyGoesDirect(user: IUser | undefined): boolean {
  return isRecordsAdmin(user);
}

/** Gates the Delivery sub-section's "Record Acknowledgement" action (CMS-020/021). */
export function canRecordAcknowledgement(user: IUser | undefined): boolean {
  return !!user && (user.roles.indexOf('Administrator') !== -1 || user.roles.indexOf('Document Control') !== -1);
}

/** CMS-008 AC1 — the Declare permission: only Document Control (and Administrators) may manually
 * declare a draft as a final record. TODO(confirm): the exact "Declare" permission once the real
 * RBAC model exists — mapped to the same Administrator/Document Control set as acknowledgement. */
export function canDeclareRecord(user: IUser | undefined): boolean {
  return !!user && (user.roles.indexOf('Administrator') !== -1 || user.roles.indexOf('Document Control') !== -1);
}
