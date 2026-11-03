import { isAssignedTo } from '../roleHelpers';
import { IUser } from '../../../models/IUser';

const user: IUser = { id: '7', displayName: 'Layla Hassan', email: 'layla@example.com', roles: ['Reviewer'] };

describe('isAssignedTo', () => {
  it('matches the assignee by display name, case-insensitively', () => {
    expect(isAssignedTo(user, 'Layla Hassan')).toBe(true);
    expect(isAssignedTo(user, '  layla hassan  ')).toBe(true);
  });

  it('matches the assignee by email', () => {
    expect(isAssignedTo(user, 'LAYLA@EXAMPLE.COM')).toBe(true);
  });

  it('is false for a different person, and for missing values', () => {
    expect(isAssignedTo(user, 'Omar Said')).toBe(false);
    expect(isAssignedTo(user, undefined)).toBe(false);
    expect(isAssignedTo(undefined, 'Layla Hassan')).toBe(false);
    expect(isAssignedTo(user, '')).toBe(false);
  });
});
