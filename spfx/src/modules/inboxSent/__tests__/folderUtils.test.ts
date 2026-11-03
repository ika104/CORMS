import { matchesFolderCriteria } from '../folderUtils';
import { ICorrespondenceStub } from '../../../models/ICorrespondence';

function stub(overrides: Partial<ICorrespondenceStub> = {}): ICorrespondenceStub {
  return {
    id: '1',
    referenceNumber: 'REF-1',
    subject: 'Subject',
    type: 'Letter',
    direction: 'Incoming',
    status: 'Registered',
    priority: 'Normal',
    securityTier: 1,
    department: 'Finance',
    createdAt: '2026-01-01T00:00:00Z',
    senderName: 'Alice',
    ...overrides,
  };
}

describe('CMS-054', () => {
  it('criteria-match: an item matching every set criterion matches the folder', () => {
    const item = stub({ status: 'Registered', securityTier: 2, priority: 'High', senderName: 'Finance Team' });

    const matches = matchesFolderCriteria(item, { status: 'Registered', securityTier: 2, priority: 'High', sender: 'finance' });

    expect(matches).toBe(true);
  });

  it('criteria-match: failing any single set criterion excludes the item (criteria are ANDed)', () => {
    const item = stub({ status: 'Registered', priority: 'Normal' });

    expect(matchesFolderCriteria(item, { status: 'Registered', priority: 'High' })).toBe(false);
  });

  it('criteria-match: an unset field is ignored ("Any")', () => {
    const item = stub({ status: 'Approved' });

    expect(matchesFolderCriteria(item, {})).toBe(true);
  });

  it('criteria-match: sender criterion is a case-insensitive contains match', () => {
    const item = stub({ senderName: 'Finance Department' });

    expect(matchesFolderCriteria(item, { sender: 'FINANCE' })).toBe(true);
    expect(matchesFolderCriteria(item, { sender: 'legal' })).toBe(false);
  });
});
