import directory from '../../mocks/delegationDirectory.json';
import delegationsSeed from '../../mocks/delegations.json';
import auditSeed from '../../mocks/delegationAudit.json';
import { IDelegation, IDelegationAuditRow, IDirectoryPerson } from '../../models/IDelegation';

export const DELEGATION_DIRECTORY = directory as IDirectoryPerson[];
export const INITIAL_DELEGATIONS = delegationsSeed as IDelegation[];
export const DELEGATION_AUDIT_ROWS = auditSeed as IDelegationAuditRow[];
