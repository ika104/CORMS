import {
  CLASSIFY_FIELDS,
  IClassificationSnapshot,
  buildClassificationAuditDetails,
  describeChanges,
  diffClassification,
  includesSecurityChange,
  securityLevelName,
  snapshotFromDraft,
  snapshotFromItem,
} from '../classificationAudit';
import { ICorrespondenceStub } from '../../../models/ICorrespondence';
import { ITriageDraft } from '../types';

const baseItem: ICorrespondenceStub = {
  id: 'c1',
  referenceNumber: 'REF-1',
  subject: 'Subject',
  type: 'Letter',
  direction: 'Incoming',
  status: 'Registered',
  priority: 'Normal',
  securityTier: 3,
  department: 'Legal',
  createdAt: '2025-01-01',
  dueDate: '2025-02-01',
  recordClassificationName: 'FIN-01 — Finance',
};

function draft(overrides: Partial<ITriageDraft> = {}): ITriageDraft {
  return { priority: 'Normal', ...overrides };
}

describe('CMS-010 classificationAudit — diff (AC5)', () => {
  it('reports one before/after entry per changed core field', () => {
    const before = snapshotFromItem(baseItem);
    const after: IClassificationSnapshot = {
      type: 'Memo',
      priority: 'High',
      securityTier: 4,
      recordClassificationLabel: 'FIN-01 — Finance',
      responseDeadline: '2025-02-01',
    };
    const changes = diffClassification(before, after);
    expect(changes.map((c) => c.field).sort()).toEqual(['priority', 'securityTier', 'type']);
    const security = changes.find((c) => c.field === 'securityTier')!;
    expect(security.from).toBe('Confidential');
    expect(security.to).toBe('Secret');
  });

  it('no change when the after matches the baseline', () => {
    const snap = snapshotFromItem(baseItem);
    expect(diffClassification(snap, snap)).toEqual([]);
  });
});

describe('CMS-010 classificationAudit — unset fields are not clears (AC8)', () => {
  it('a draft that leaves Security Level and Record Classification unset produces no change for them', () => {
    const before = snapshotFromItem(baseItem);
    const after = snapshotFromDraft(draft({ priority: 'High' })); // security/record/type/deadline all undefined
    const changes = diffClassification(before, after);
    expect(changes.map((c) => c.field)).toEqual(['priority']);
  });

  it('an empty-string value is treated the same as unset', () => {
    const before = snapshotFromItem(baseItem);
    const after: IClassificationSnapshot = { recordClassificationLabel: '' };
    expect(diffClassification(before, after)).toEqual([]);
  });
});

describe('CMS-010 classificationAudit — security-change detection (AC9)', () => {
  it('detects a Security Level change', () => {
    const before = snapshotFromItem(baseItem);
    expect(includesSecurityChange(diffClassification(before, { securityTier: 5 }))).toBe(true);
    expect(includesSecurityChange(diffClassification(before, { priority: 'High' }))).toBe(false);
  });

  it('names the tier for the audit trail (Secret -> Top Secret example)', () => {
    expect(securityLevelName(4)).toBe('Secret');
    expect(securityLevelName(5)).toBe('Top Secret');
    expect(securityLevelName(undefined)).toBe('—');
  });
});

describe('CMS-010 classificationAudit — audit payload (AC5/AC9)', () => {
  it('serialises before/after changes and the amendment reason', () => {
    const before = snapshotFromItem(baseItem);
    const changes = diffClassification(before, { securityTier: 5 });
    const details = buildClassificationAuditDetails({ changes, reason: 'Re-classified per DG memo #12' });
    const parsed = JSON.parse(details);
    expect(parsed.changes).toEqual([{ field: 'securityTier', from: 'Confidential', to: 'Top Secret' }]);
    expect(parsed.reason).toBe('Re-classified per DG memo #12');
  });

  it('omits reason when none is given (initial capture)', () => {
    const changes = diffClassification(snapshotFromItem(baseItem), { priority: 'High' });
    const parsed = JSON.parse(buildClassificationAuditDetails({ changes }));
    expect(parsed.reason).toBeUndefined();
  });

  it('describeChanges renders a readable summary via a label resolver', () => {
    const changes = diffClassification(snapshotFromItem(baseItem), { securityTier: 4, priority: 'High' });
    const summary = describeChanges(changes, (f) => (f === 'securityTier' ? 'Security Level' : 'Priority'));
    expect(summary).toBe('Priority: Normal → High; Security Level: Confidential → Secret');
  });
});

describe('CMS-010 classificationAudit — field set (AC1/AC3/AC7)', () => {
  it('covers type, priority, security, record classification, and the response deadline', () => {
    expect(CLASSIFY_FIELDS).toEqual(['type', 'priority', 'securityTier', 'recordClassification', 'responseDeadline']);
  });
});
