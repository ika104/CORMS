import {
  DEFAULT_ESCALATION_DAYS,
  parseEscalationDays,
  escalationDueAt,
  pendingResponseState,
  isEscalationOverdue,
  filterOverdueEscalations,
} from '../pendingResponseEscalation';
import { ICorrespondenceStub } from '../../../models/ICorrespondence';

function stub(overrides: Partial<ICorrespondenceStub>): ICorrespondenceStub {
  return {
    id: 'c1',
    referenceNumber: 'R1',
    subject: 'S',
    type: 'Letter',
    direction: 'Outgoing',
    status: 'Registered',
    priority: 'Normal',
    securityTier: 1,
    department: 'Ops',
    createdAt: '2026-09-01',
    ...overrides,
  };
}

function flagged(flaggedAt: string): ICorrespondenceStub {
  return stub({
    pendingResponse: true,
    pendingResponseDetail: { awaitedParty: { name: 'Ministry X', type: 'External' }, flaggedAt, flaggedBy: 'u' },
  });
}

describe('parseEscalationDays (CMS-014 AC4)', () => {
  it('parses a positive number, else falls back to the default', () => {
    expect(parseEscalationDays('5')).toBe(5);
    expect(parseEscalationDays('  ')).toBe(DEFAULT_ESCALATION_DAYS);
    expect(parseEscalationDays('abc')).toBe(DEFAULT_ESCALATION_DAYS);
    expect(parseEscalationDays('0')).toBe(DEFAULT_ESCALATION_DAYS);
    expect(parseEscalationDays('-2')).toBe(DEFAULT_ESCALATION_DAYS);
  });
});

describe('escalationDueAt', () => {
  it('adds the deadline to flaggedAt', () => {
    expect(escalationDueAt('2026-09-01T00:00:00.000Z', 3)).toBe('2026-09-04T00:00:00.000Z');
  });
  it('is undefined for a missing or unparseable flaggedAt', () => {
    expect(escalationDueAt(undefined, 3)).toBeUndefined();
    expect(escalationDueAt('not-a-date', 3)).toBeUndefined();
  });
});

describe('pendingResponseState / isEscalationOverdue', () => {
  const now = '2026-09-10T00:00:00.000Z';
  it('none when not flagged', () => {
    expect(pendingResponseState(stub({}), 3, now)).toBe('none');
  });
  it('pending within the deadline, overdue past it', () => {
    expect(pendingResponseState(flagged('2026-09-08T00:00:00.000Z'), 3, now)).toBe('pending');
    expect(pendingResponseState(flagged('2026-09-06T00:00:00.000Z'), 3, now)).toBe('overdue');
    expect(isEscalationOverdue(flagged('2026-09-01T00:00:00.000Z'), 3, now)).toBe(true);
  });
  it('a longer configured deadline pushes the escalation out', () => {
    // flagged 4 days ago: overdue at 3 days, still pending at 7.
    expect(pendingResponseState(flagged('2026-09-06T00:00:00.000Z'), 7, now)).toBe('pending');
  });
  it('CMS-015 AC4: an expedited item escalates sooner using the shortened window', () => {
    // flagged 2 days ago; normal 3-day window is still pending, but the 1-day expedited window is overdue.
    const twoDaysAgo = '2026-09-08T00:00:00.000Z';
    const normal = flagged(twoDaysAgo);
    const expedited = { ...flagged(twoDaysAgo), expedited: { reason: 'urgent', expeditedBy: 'u', expeditedAt: twoDaysAgo } };
    expect(pendingResponseState(normal, 3, now, 1)).toBe('pending');
    expect(pendingResponseState(expedited, 3, now, 1)).toBe('overdue');
  });

  it('stays pending (never auto-overdue) when flaggedAt is unknown', () => {
    const noTime = stub({ pendingResponse: true });
    expect(pendingResponseState(noTime, 3, now)).toBe('pending');
  });
});

describe('filterOverdueEscalations', () => {
  it('returns only the flagged items past their deadline', () => {
    const now = '2026-09-10T00:00:00.000Z';
    const items = [
      stub({ id: 'notflagged' }),
      { ...flagged('2026-09-09T00:00:00.000Z'), id: 'recent' },
      { ...flagged('2026-09-01T00:00:00.000Z'), id: 'stale' },
    ];
    expect(filterOverdueEscalations(items, 3, now).map((i) => i.id)).toEqual(['stale']);
  });
});
