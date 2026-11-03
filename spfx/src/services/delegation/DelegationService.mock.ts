import { IDirectoryPerson } from '../../models/IDelegation';
import {
  ICreateDelegationInput,
  IDelegationAttachmentRecord,
  IDelegationAuditSummaryRow,
  IDelegationLedgerEntry,
  IDelegationLedgerFilters,
  IDelegationListFilters,
  IDelegationRecord,
  IDelegationService,
} from '../interfaces/IDelegationService';
import { applyDelegationSearch } from './delegationSearch';
import { INITIAL_DELEGATIONS, DELEGATION_AUDIT_ROWS, DELEGATION_DIRECTORY } from '../../modules/delegation/mockData';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

// No signed-in-user concept in mock mode (no auth) — a stable seed identity stands in for the one
// DelegationServiceCore resolves via getCurrentSiteUserId, used by both create() and listMine() so
// mock mode writes and reads back under the same identity.
const MOCK_CURRENT_USER_ID = 'u-ali';

type IMockDelegation = (typeof INITIAL_DELEGATIONS)[number];

function toRecord(d: IMockDelegation): IDelegationRecord {
  return {
    id: d.id,
    delegatorId: d.fromUserId,
    delegatorName: d.fromUserName,
    delegateId: d.toUserId,
    delegateName: d.toUserName,
    reason: d.reason,
    startDate: d.startDate,
    endDate: d.endDate,
    status: d.status,
    // IDelegation (the mock model) has no createdBy field — mock data predates the
    // self-service/admin distinction, so the delegator is assumed to be the creator.
    createdBy: d.fromUserId,
  };
}

/**
 * In-memory stand-in for DelegationServiceLive, backed by the existing Delegation Management mock
 * fixtures (src/mocks/delegations.json, delegationDirectory.json, delegationAudit.json via
 * src/modules/delegation/mockData.ts) — same session-only-mutation-of-an-in-memory-copy /
 * simulated-latency shape as OrgHierarchyServiceMock and AuditTrailServiceMock. Toggled via the
 * `app.delegationDataSource` key (delegationDataSourceConfig.ts).
 */
export class DelegationServiceMock implements IDelegationService {
  private delegations: IMockDelegation[] = INITIAL_DELEGATIONS.map((d) => ({ ...d }));
  private nextId = INITIAL_DELEGATIONS.length + 1;

  public create(input: ICreateDelegationInput): Promise<IDelegationRecord> {
    // Mirrors DelegationServiceCore.create's AC1 rule: a self-service create always attributes
    // to the acting (mock) user, never the client-supplied delegator.
    const delegatorId = input.isAdmin ? input.delegator : MOCK_CURRENT_USER_ID;
    // Mirrors DelegationServiceCore.create's server-side gate — the real check, not just the
    // picker's client-side filter, so mock and live mode reject the same input the same way.
    // A rejected promise, not a synchronous throw: this method isn't `async`, and every caller
    // (CreateDelegationModal, DelegationView) attaches `.catch()` to the returned promise rather
    // than wrapping the call itself in try/catch.
    if (delegatorId === input.delegate) {
      return Promise.reject(new Error('A delegation cannot be created with the same user as both delegator and delegate.'));
    }
    const delegatorPerson = DELEGATION_DIRECTORY.find((p) => p.id === delegatorId);
    const delegatePerson = DELEGATION_DIRECTORY.find((p) => p.id === input.delegate);

    const created: IMockDelegation = {
      id: `del-${this.nextId++}`,
      fromUserId: delegatorId,
      fromUserName: delegatorPerson?.displayName ?? '',
      toUserId: input.delegate,
      toUserName: delegatePerson?.displayName ?? '',
      reason: input.reason,
      startDate: input.startDate,
      endDate: input.endDate,
      status: 'Active',
    };
    this.delegations = [created, ...this.delegations];
    return delay(toRecord(created));
  }

  public revoke(delegationId: string, _reason: string): Promise<void> {
    this.delegations = this.delegations.map((d) => (d.id === delegationId ? { ...d, status: 'Revoked' } : d));
    return delay(undefined);
  }

  /** Mock mode has no signed-in user, so "mine" resolves to the same MOCK_CURRENT_USER_ID
   * create() attributes self-service delegations to — otherwise a newly created delegation would
   * be filed under one identity and read back under another, and never appear in the list. */
  public listMine(filters?: IDelegationListFilters): Promise<IDelegationRecord[]> {
    const records = this.delegations.filter((d) => d.fromUserId === MOCK_CURRENT_USER_ID).map(toRecord);
    return delay(applyDelegationSearch(records, filters?.search));
  }

  public listAll(filters?: IDelegationListFilters): Promise<IDelegationRecord[]> {
    return delay(applyDelegationSearch(this.delegations.map(toRecord), filters?.search));
  }

  public getAuditSummary(): Promise<IDelegationAuditSummaryRow[]> {
    // DELEGATION_AUDIT_ROWS (delegationAudit.json) predates the `revoked` counter added by this
    // task's interface — synthesized here from the live in-memory delegations rather than left
    // unset, so mock mode's shape stays honest against IDelegationAuditSummaryRow.
    const rows: IDelegationAuditSummaryRow[] = DELEGATION_AUDIT_ROWS.map((row) => ({
      ...row,
      revoked: this.delegations.filter((d) => d.fromUserId === row.userId && d.status === 'Revoked').length,
    }));
    return delay(rows);
  }

  public getDelegationLedger(userId: string, filters?: IDelegationLedgerFilters): Promise<IDelegationLedgerEntry[]> {
    let records = applyDelegationSearch(this.delegations.filter((d) => d.fromUserId === userId).map(toRecord), filters?.search);
    if (filters?.team) {
      const person = DELEGATION_DIRECTORY.find((p) => p.id === userId);
      if ((person?.team ?? '') !== filters.team) records = [];
    }
    // No mock attachment fixture exists for delegation attachments (checked src/mocks/ first) —
    // ledger entries carry an empty attachments array in mock mode.
    const entries: IDelegationLedgerEntry[] = records.map((r) => ({ ...r, attachments: [] as IDelegationAttachmentRecord[] }));
    return delay(entries);
  }

  public listDirectory(): Promise<IDirectoryPerson[]> {
    return delay(DELEGATION_DIRECTORY);
  }

  public getMyDirectoryId(): Promise<string> {
    return delay(MOCK_CURRENT_USER_ID);
  }
}
