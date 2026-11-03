import { applyCancel, applyResend, canCancel, canResend, filterSigningSessions } from '../signingDashboardLogic';
import { ISigningSession } from '../../../models/ISigningSession';

function session(overrides: Partial<ISigningSession> = {}): ISigningSession {
  return {
    id: 's1',
    correspondenceId: 'c1',
    referenceNumber: 'OUT-2026-0001',
    subject: 'Budget Letter',
    signerName: 'Layla Hassan',
    status: 'Sent',
    createdAt: '2026-09-01T09:00:00.000Z',
    updatedAt: '2026-09-01T09:00:00.000Z',
    events: [{ id: 's1-ev-1', event: 'Created', actor: 'Zeyad', timestamp: '2026-09-01T09:00:00.000Z' }],
    ...overrides,
  };
}

describe('CMS-007 AC2 — filterSigningSessions', () => {
  const sessions = [
    session({ id: 'a', signerName: 'Layla Hassan', referenceNumber: 'OUT-2026-0001', subject: 'Budget', status: 'Sent', createdAt: '2026-09-01T09:00:00.000Z' }),
    session({ id: 'b', signerName: 'Omar Al Farsi', referenceNumber: 'OUT-2026-0011', subject: 'Board Circular', status: 'Signed', createdAt: '2026-09-05T09:00:00.000Z' }),
    session({ id: 'c', signerName: 'Khalid', referenceNumber: 'OUT-2026-0022', subject: 'MoU', status: 'Sent', createdAt: '2026-08-20T09:00:00.000Z' }),
  ];

  it('returns everything with no filters', () => {
    expect(filterSigningSessions(sessions)).toHaveLength(3);
  });

  it('matches free text against signer, reference and subject', () => {
    expect(filterSigningSessions(sessions, { text: 'omar' }).map((s) => s.id)).toEqual(['b']);
    expect(filterSigningSessions(sessions, { text: '0022' }).map((s) => s.id)).toEqual(['c']);
    expect(filterSigningSessions(sessions, { text: 'budget' }).map((s) => s.id)).toEqual(['a']);
  });

  it('filters by status', () => {
    expect(filterSigningSessions(sessions, { status: 'Sent' }).map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('filters by createdAt date range (inclusive)', () => {
    expect(filterSigningSessions(sessions, { dateFrom: '2026-09-01', dateTo: '2026-09-30' }).map((s) => s.id)).toEqual(['a', 'b']);
    expect(filterSigningSessions(sessions, { dateTo: '2026-08-31' }).map((s) => s.id)).toEqual(['c']);
  });

  it('AND-combines criteria', () => {
    expect(filterSigningSessions(sessions, { status: 'Sent', dateFrom: '2026-08-25' }).map((s) => s.id)).toEqual(['a']);
  });
});

describe('CMS-007 AC3 — resend / cancel transitions', () => {
  it('canResend / canCancel reflect the request lifecycle', () => {
    expect(canResend('Sent')).toBe(true);
    expect(canResend('Expired')).toBe(true);
    expect(canResend('Signed')).toBe(false);
    expect(canCancel('Viewed')).toBe(true);
    expect(canCancel('Cancelled')).toBe(false);
    expect(canCancel('Signed')).toBe(false);
  });

  it('applyResend appends a Resent event and refreshes sentAt (re-opening an expired request)', () => {
    const out = applyResend(session({ status: 'Expired' }), 'Zeyad', '2026-09-10T10:00:00.000Z');
    expect(out.status).toBe('Sent');
    expect(out.sentAt).toBe('2026-09-10T10:00:00.000Z');
    expect(out.events[out.events.length - 1]).toMatchObject({ event: 'Resent', actor: 'Zeyad' });
  });

  it('applyResend is a no-op on a signed request', () => {
    const signed = session({ status: 'Signed' });
    expect(applyResend(signed, 'Zeyad', '2026-09-10T10:00:00.000Z')).toBe(signed);
  });

  it('applyCancel sets Cancelled with a reason event', () => {
    const out = applyCancel(session({ status: 'Sent' }), 'Zeyad', '2026-09-10T10:00:00.000Z', 'Superseded');
    expect(out.status).toBe('Cancelled');
    expect(out.events[out.events.length - 1]).toMatchObject({ event: 'Cancelled', detail: 'Superseded' });
  });

  it('applyCancel is a no-op on a terminal request', () => {
    const done = session({ status: 'Signed' });
    expect(applyCancel(done, 'Zeyad', '2026-09-10T10:00:00.000Z')).toBe(done);
  });
});
