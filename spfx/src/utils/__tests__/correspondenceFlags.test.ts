import { isVettedForClassifiedCapture } from '../correspondenceFlags';
import { IUser } from '../../models/IUser';

function user(roles: string[]): IUser {
  return { id: 'u1', displayName: 'Test User', email: 'test@corp.com', roles };
}

// CMS-034 AC5 — "vetted" is a role gate (the same defensible signal canExpedite uses), distinct
// from clearance which AC8 already enforces on the security pills.
describe('isVettedForClassifiedCapture (CMS-034 AC5)', () => {
  it('is true for a vetting role', () => {
    expect(isVettedForClassifiedCapture(user(['Security Officer']))).toBe(true);
    expect(isVettedForClassifiedCapture(user(['Document Control']))).toBe(true);
    expect(isVettedForClassifiedCapture(user(['Administrator']))).toBe(true);
  });

  it('is false for a non-vetting role and for no user', () => {
    expect(isVettedForClassifiedCapture(user(['Originator']))).toBe(false);
    expect(isVettedForClassifiedCapture(user([]))).toBe(false);
    expect(isVettedForClassifiedCapture(undefined)).toBe(false);
  });
});
