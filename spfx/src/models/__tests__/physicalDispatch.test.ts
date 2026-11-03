import { isPhysicalDispatchComplete, physicalDispatchDetail, IPhysicalDispatch } from '../IPhysicalDispatch';

describe('isPhysicalDispatchComplete', () => {
  it('requires the courier for a Courier dispatch', () => {
    expect(isPhysicalDispatchComplete({ method: 'Courier' })).toBe(false);
    expect(isPhysicalDispatchComplete({ method: 'Courier', courier: 'Asyad Express' })).toBe(true);
  });

  it('requires bearer name and date/time for In-Person', () => {
    expect(isPhysicalDispatchComplete({ method: 'InPerson', bearerName: 'Ali' })).toBe(false);
    expect(isPhysicalDispatchComplete({ method: 'InPerson', bearerName: 'Ali', bearerDateTime: '2026-09-01T10:00' })).toBe(true);
  });

  it('requires the postal service for Postal; receipt is optional', () => {
    expect(isPhysicalDispatchComplete({ method: 'Postal' })).toBe(false);
    expect(isPhysicalDispatchComplete({ method: 'Postal', postalService: 'Oman Post' })).toBe(true);
  });

  it('is false for undefined', () => {
    expect(isPhysicalDispatchComplete(undefined)).toBe(false);
  });
});

describe('physicalDispatchDetail', () => {
  const cases: [IPhysicalDispatch, string][] = [
    [{ method: 'Courier', courier: 'Nool Oman' }, 'Nool Oman'],
    [{ method: 'InPerson', bearerName: 'Sara' }, 'Sara'],
    [{ method: 'Postal', postalService: 'Oman Post' }, 'Oman Post'],
  ];
  it.each(cases)('summarises %o as "%s"', (dispatch, expected) => {
    expect(physicalDispatchDetail(dispatch)).toBe(expected);
  });
});
