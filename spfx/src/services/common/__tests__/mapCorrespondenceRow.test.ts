import { CORRESPONDENCE_LIST_SELECT, mapCorrespondenceRowToStub, mapStatus } from '../mapCorrespondenceRow';

describe('mapCorrespondenceRowToStub', () => {
  it('keeps the route direction separate from the Content Type used by Triage', () => {
    const stub = mapCorrespondenceRowToStub({
      Id: 1,
      Title: 'Budget memo',
      CorrespondenceType: 'Incoming',
      Direction: 'Incoming',
      ContentTypeName: 'Memo',
    });

    expect(stub.type).toBe('Incoming');
    expect(stub.contentType).toBe('Memo');
  });

  it('requests ContentTypeName in shared correspondence-list queries', () => {
    expect(CORRESPONDENCE_LIST_SELECT).toContain('ContentTypeName');
  });
});

describe('mapStatus', () => {
  it("reads both the 'In Review' list choice and rows saved with the raw 'InReview' token", () => {
    expect(mapStatus('In Review')).toBe('InReview');
    expect(mapStatus('InReview')).toBe('InReview');
  });
});
