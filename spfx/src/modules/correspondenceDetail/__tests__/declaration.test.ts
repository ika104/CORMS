import {
  applyDeclaration,
  canDeclare,
  canDeliverExternally,
  formatRecordSerial,
  isImmutable,
} from '../declaration';
import { ICorrespondenceDetail, IDeclarationResult } from '../../../models/ICorrespondenceDetail';
import { CorrespondenceStatus } from '../../../models/ICorrespondence';

function detail(status: CorrespondenceStatus): ICorrespondenceDetail {
  return {
    id: '12',
    referenceNumber: 'OUT-2026-0007',
    subject: 'Budget Letter',
    type: 'Letter',
    direction: 'Outgoing',
    status,
    priority: 'Normal',
    securityTier: 2,
    department: 'Finance',
    createdAt: '2026-09-01',
    recordClassificationName: '500012 — Minutes of Meeting',
  };
}

describe('CMS-008 AC1 — canDeclare (approval complete)', () => {
  it('allows declaration only once approved or signed', () => {
    expect(canDeclare('Approved')).toBe(true);
    expect(canDeclare('Signed')).toBe(true);
  });
  it('rejects declaration before approval or once already declared', () => {
    (['Draft', 'PendingNumber', 'Registered', 'InReview', 'Declared', 'Delivered'] as CorrespondenceStatus[]).forEach((s) =>
      expect(canDeclare(s)).toBe(false)
    );
  });
});

describe('CMS-008 AC2 — isImmutable', () => {
  it('is immutable once declared or delivered', () => {
    expect(isImmutable('Declared')).toBe(true);
    expect(isImmutable('Delivered')).toBe(true);
    expect(isImmutable('Approved')).toBe(false);
    expect(isImmutable('Draft')).toBe(false);
  });
});

describe('CMS-008 AC4 — canDeliverExternally', () => {
  it('permits external delivery only once declared (or delivered)', () => {
    expect(canDeliverExternally('Declared')).toBe(true);
    expect(canDeliverExternally('Delivered')).toBe(true);
    expect(canDeliverExternally('Approved')).toBe(false);
    expect(canDeliverExternally('Signed')).toBe(false);
    expect(canDeliverExternally('Draft')).toBe(false);
  });
});

describe('CMS-008 AC7 — formatRecordSerial', () => {
  it('formats REC-{year}-{6-digit sequence}', () => {
    expect(formatRecordSerial(2026, 12)).toBe('REC-2026-000012');
    expect(formatRecordSerial(2026, 1234567)).toBe('REC-2026-1234567');
  });
});

describe('CMS-008 AC2/AC3/AC7 — applyDeclaration', () => {
  it('stamps status, attribution, timestamp and serial (and keeps the classification)', () => {
    const result: IDeclarationResult = {
      declaredBy: 'Layla Hassan',
      declaredAt: '2026-09-05T10:00:00.000Z',
      recordSerialNumber: 'REC-2026-000012',
      recordClassification: '500012 — Minutes of Meeting',
    };
    const out = applyDeclaration(detail('Approved'), result);
    expect(out).toMatchObject({
      status: 'Declared',
      declaredBy: 'Layla Hassan',
      declaredAt: '2026-09-05T10:00:00.000Z',
      recordSerialNumber: 'REC-2026-000012',
      recordClassificationName: '500012 — Minutes of Meeting',
    });
  });

  it('does not mutate the input', () => {
    const input = detail('Approved');
    applyDeclaration(input, { declaredBy: 'X', declaredAt: 't', recordSerialNumber: 'REC-2026-000001' });
    expect(input.status).toBe('Approved');
    expect(input.recordSerialNumber).toBeUndefined();
  });
});
