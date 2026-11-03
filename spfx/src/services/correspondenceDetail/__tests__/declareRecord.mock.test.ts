import { CorrespondenceDetailServiceMock } from '../CorrespondenceDetailService.mock';
import { isAccessDenied } from '../../interfaces/ICorrespondenceDetailService';

describe('CMS-008 — CorrespondenceDetailServiceMock.declareRecord', () => {
  it('returns a declaration result with attribution, timestamp and a REC serial (AC3/AC7)', async () => {
    const svc = new CorrespondenceDetailServiceMock();
    const result = await svc.declareRecord('12', 'Layla Hassan');
    if (isAccessDenied(result)) throw new Error('unexpected non-declaration result');
    expect(result.declaredBy).toBe('Layla Hassan');
    expect(result.recordSerialNumber).toMatch(/^REC-\d{4}-\d{6}$/);
    expect(Number.isNaN(Date.parse(result.declaredAt))).toBe(false);
  });

  it('issues distinct serials for successive declarations', async () => {
    const svc = new CorrespondenceDetailServiceMock();
    const a = await svc.declareRecord('12', 'A');
    const b = await svc.declareRecord('13', 'B');
    if (isAccessDenied(a) || isAccessDenied(b)) {
      throw new Error('unexpected non-declaration result');
    }
    expect(a.recordSerialNumber).not.toBe(b.recordSerialNumber);
  });
});
