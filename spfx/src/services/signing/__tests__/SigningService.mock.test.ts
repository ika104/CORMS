import { SigningServiceMock } from '../SigningService.mock';

describe('CMS-007 — SigningServiceMock', () => {
  it('returns the seeded signing sessions and supports search', async () => {
    const svc = new SigningServiceMock();
    const all = await svc.getSessions();
    expect(all.length).toBeGreaterThan(0);
    const signed = await svc.getSessions({ status: 'Signed' });
    expect(signed.every((s) => s.status === 'Signed')).toBe(true);
    const bySigner = await svc.getSessions({ text: 'Layla' });
    expect(bySigner.every((s) => /layla/i.test(s.signerName))).toBe(true);
  });

  it('resend records a Resent event on a live request', async () => {
    const svc = new SigningServiceMock();
    const [session] = await svc.getSessions({ status: 'Sent' });
    const before = session.events.length;
    const updated = await svc.resend(session.id, 'Tester');
    expect(updated?.events.length).toBe(before + 1);
    expect(updated?.events[updated.events.length - 1]).toMatchObject({ event: 'Resent', actor: 'Tester' });
  });

  it('cancel moves the request to Cancelled and persists across reads', async () => {
    const svc = new SigningServiceMock();
    const [session] = await svc.getSessions({ status: 'Sent' });
    await svc.cancel(session.id, 'Tester', 'No longer needed');
    const reread = (await svc.getSessions()).find((s) => s.id === session.id);
    expect(reread?.status).toBe('Cancelled');
  });

  it('resend is a no-op (unchanged status) on a signed request', async () => {
    const svc = new SigningServiceMock();
    const [signed] = await svc.getSessions({ status: 'Signed' });
    const updated = await svc.resend(signed.id, 'Tester');
    expect(updated?.status).toBe('Signed');
  });

  it('createSession adds a new Sent request (with Created/Sent history) that reads back', async () => {
    const svc = new SigningServiceMock();
    const created = await svc.createSession(
      {
        correspondenceId: 'C-9',
        referenceNumber: 'REF-9',
        subject: 'Board Resolution',
        signerName: 'Omar Said',
        signerEmail: 'omar@example.com',
        externalDocumentId: 'external-doc-abc',
      },
      'Zeyad'
    );
    expect(created.status).toBe('Sent');
    expect(created.events.map((e) => e.event)).toEqual(['Created', 'Sent']);
    expect(created.events[0].detail).toContain('external-doc-abc');
    expect(created.externalDocumentId).toBe('external-doc-abc');

    const reread = (await svc.getSessions()).find((s) => s.id === created.id);
    expect(reread?.subject).toBe('Board Resolution');
    expect(reread?.signerEmail).toBe('omar@example.com');
  });
});
