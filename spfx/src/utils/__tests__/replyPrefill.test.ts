import { buildForwardPrefill, buildReplyPrefill } from '../replyPrefill';

describe('CMS-041 — buildReplyPrefill', () => {
  it('AC3: prefixes the subject with "RE: " for a fresh subject', () => {
    const p = buildReplyPrefill({ id: '7', subject: 'Budget review' });
    expect(p.subject).toBe('RE: Budget review');
  });

  it('AC3: does not double the prefix when the subject already starts with RE:', () => {
    expect(buildReplyPrefill({ id: '7', subject: 'RE: Budget review' }).subject).toBe('RE: Budget review');
    expect(buildReplyPrefill({ id: '7', subject: 're: budget' }).subject).toBe('re: budget');
    expect(buildReplyPrefill({ id: '7', subject: '  Re: budget' }).subject).toBe('  Re: budget');
  });

  it('AC1: the reply is addressed to the original sender', () => {
    expect(buildReplyPrefill({ id: '7', subject: 'x', senderName: 'Finance Dept' }).recipientName).toBe('Finance Dept');
    expect(buildReplyPrefill({ id: '7', subject: 'x' }).recipientName).toBe('');
  });

  it('AC4/CMS-022: inherits the chain, falling back to the reference number, and records the parent', () => {
    expect(buildReplyPrefill({ id: '7', subject: 'x', chainId: 'C-1', referenceNumber: 'R-9' }).chainId).toBe('C-1');
    expect(buildReplyPrefill({ id: '7', subject: 'x', referenceNumber: 'R-9' }).chainId).toBe('R-9');
    expect(buildReplyPrefill({ id: '7', subject: 'x' }).chainId).toBeUndefined();
    expect(buildReplyPrefill({ id: '7', subject: 'x' }).parentId).toBe('7');
  });

  it('AC8: carries the source core metadata', () => {
    const p = buildReplyPrefill({
      id: '7',
      subject: 'x',
      priority: 'High',
      securityTier: 3,
      recordClassificationId: 'RC-1',
      recordClassificationName: '9974 - Finance',
      originatingFunction: 'Treasury',
    });
    expect(p.priority).toBe('High');
    expect(p.securityTier).toBe(3);
    expect(p.recordClassificationId).toBe('RC-1');
    expect(p.recordClassificationLabel).toBe('9974 - Finance');
    expect(p.originatingFunction).toBe('Treasury');
  });

  it('AC8: the classification name doubles as the id when only a name is stored (the picker keys on id)', () => {
    const p = buildReplyPrefill({ id: '7', subject: 'x', recordClassificationName: '9974 - Finance' });
    // Without this fallback the compose form's classification picker (keyed on id) would stay empty.
    expect(p.recordClassificationId).toBe('9974 - Finance');
    expect(p.recordClassificationLabel).toBe('9974 - Finance');
  });

  it('Forward joins the source thread but is not a reply to the parent', () => {
    const forward = buildForwardPrefill({ id: '7', subject: 'Budget review', chainId: 'CHAIN-1' });

    expect(forward.subject).toBe('FW: Budget review');
    expect(forward.chainId).toBe('CHAIN-1');
    expect(forward.parentId).toBeUndefined();
    expect(forward.recipientName).toBe('');
  });
});
