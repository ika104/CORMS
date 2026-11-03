import { IUser } from '../../models/IUser';

// CMS-009: the queue serves every authorized *receiving* role, not just Document Control —
// 'CEO Office' and 'System Administrator' are named explicitly in the story. The mock user
// model only carries 'Administrator' as an elevated role (see users.json / AdministrationView's
// ADMIN_ROLE), so that's mapped to 'System Administrator' here, same convention roleHelpers.ts
// in correspondenceDetail already uses for 'Records Admin' -> 'Administrator'.
const TRIAGE_ROLES = ['Document Control', 'Administrator', 'CEO Office'];

export function canAccessTriageQueue(user: IUser | undefined): boolean {
  return !!user && user.roles.some((role) => TRIAGE_ROLES.indexOf(role) !== -1);
}
