import {
  buildAttachmentFolderPath,
  attachmentFolderReadCandidates,
  extractSerial,
} from '../attachmentFolderPath';

describe('extractSerial', () => {
  it('takes the trailing numeric group of a reference number', () => {
    expect(extractSerial('OQ8-LEG-LTR-26-0012')).toBe('0012');
  });
  it('is undefined when there is no reference or no trailing digits', () => {
    expect(extractSerial(undefined)).toBeUndefined();
    expect(extractSerial('DRAFT')).toBeUndefined();
  });
});

describe('buildAttachmentFolderPath', () => {
  it('folds a numbered item under Year/Month/Serial from its DateCreated + reference', () => {
    expect(
      buildAttachmentFolderPath({
        correspondenceId: '42',
        dateCreated: '2026-09-10T06:42:10Z',
        referenceNumber: 'OQ8-LEG-LTR-26-0012',
      })
    ).toBe('2026/09/0012');
  });

  it('falls back to the bare id for a draft with no reference number', () => {
    expect(buildAttachmentFolderPath({ correspondenceId: '42', dateCreated: '2026-09-10T06:42:10Z' })).toBe('42');
  });

  it('falls back to the bare id when the date is missing/unparseable', () => {
    expect(buildAttachmentFolderPath({ correspondenceId: '42', referenceNumber: 'OQ8-LEG-LTR-26-0012' })).toBe('42');
    expect(
      buildAttachmentFolderPath({ correspondenceId: '42', dateCreated: 'not-a-date', referenceNumber: 'X-0007' })
    ).toBe('42');
  });
});

describe('attachmentFolderReadCandidates', () => {
  it('lists the Year/Month/Serial path first, then the bare id (draft-era/legacy)', () => {
    expect(
      attachmentFolderReadCandidates({
        correspondenceId: '42',
        dateCreated: '2026-09-10T06:42:10Z',
        referenceNumber: 'OQ8-LEG-LTR-26-0012',
      })
    ).toEqual(['2026/09/0012', '42']);
  });

  it('is just [id] for an unnumbered draft (deduped)', () => {
    expect(attachmentFolderReadCandidates({ correspondenceId: '42', dateCreated: '2026-09-10T06:42:10Z' })).toEqual(['42']);
  });
});
