import { canSee, parsePermissions } from '../resolvePermissions';

describe('CMS-055 AC3 — per-user permission resolution', () => {
  describe('parsePermissions', () => {
    it('parses a valid permissions object', () => {
      expect(parsePermissions('{"views":{"statistics":false}}')).toEqual({ views: { statistics: false } });
    });

    it('returns undefined for blank/absent/whitespace input (default-allow, hides nothing)', () => {
      expect(parsePermissions(undefined)).toBeUndefined();
      expect(parsePermissions('')).toBeUndefined();
      expect(parsePermissions('   ')).toBeUndefined();
    });

    it('returns undefined for malformed JSON or a non-object rather than throwing', () => {
      expect(parsePermissions('{not json')).toBeUndefined();
      expect(parsePermissions('[1,2,3]')).toBeUndefined();
      expect(parsePermissions('"a string"')).toBeUndefined();
      expect(parsePermissions('null')).toBeUndefined();
    });
  });

  describe('canSee (default-allow)', () => {
    it('allows when permissions is undefined', () => {
      expect(canSee(undefined, 'views', 'statistics')).toBe(true);
    });

    it('allows when the category map is undefined', () => {
      expect(canSee({ buttons: { export: false } }, 'views', 'statistics')).toBe(true);
    });

    it('allows a key the admin has not listed', () => {
      expect(canSee({ views: { search: false } }, 'views', 'statistics')).toBe(true);
    });

    it('hides only a key explicitly set to false', () => {
      expect(canSee({ views: { statistics: false } }, 'views', 'statistics')).toBe(false);
    });

    it('allows a key explicitly set to true', () => {
      expect(canSee({ views: { statistics: true } }, 'views', 'statistics')).toBe(true);
    });

    it('resolves across the other categories', () => {
      const perms = { tabs: { audit: false }, buttons: { delete: false }, dashboards: { bi: false } };
      expect(canSee(perms, 'tabs', 'audit')).toBe(false);
      expect(canSee(perms, 'buttons', 'delete')).toBe(false);
      expect(canSee(perms, 'dashboards', 'bi')).toBe(false);
      expect(canSee(perms, 'tabs', 'details')).toBe(true);
    });
  });
});
