import { buildCorrespondenceRowActions } from '../correspondenceRowActions';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { IUser } from '../../models/IUser';

const admin = { id: '1', displayName: 'Admin', email: 'a@b.c', roles: ['Administrator'] } as IUser;
const plain = { id: '2', displayName: 'User', email: 'u@b.c', roles: [] as string[] } as IUser;

function row(overrides: Partial<ICorrespondenceStub> = {}): ICorrespondenceStub {
  return {
    id: '42',
    referenceNumber: 'OQ8-IN-LEG-DOC-26-0001',
    subject: 'Test',
    type: 'Incoming',
    direction: 'Incoming',
    status: 'Registered',
    priority: 'Normal',
    securityTier: 1,
    department: 'Legal',
    createdAt: '2026-01-01',
    hasAttachment: true,
    ...overrides,
  } as ICorrespondenceStub;
}

const keys = (items: { key: string }[]): string[] => items.map((i) => i.key);
const navigate = (): void => undefined;

describe('buildCorrespondenceRowActions', () => {
  it('received + registered + has doc: full Figma order with reply, no setReminder', () => {
    const items = buildCorrespondenceRowActions(row(), { navigate, currentUser: admin });
    expect(keys(items)).toEqual([
      'view',
      'preview',
      'editWord',
      'reply',
      'forward',
      'share',
      'download',
      'print',
      'annotate',
      'attachments',
      'timeline',
      // status Registered (not InReview) -> no approve/reject; routable -> reassign
      'reassign',
      'delegate',
    ]);
  });

  it('sent item: no Reply, adds Set Reminder', () => {
    const items = keys(buildCorrespondenceRowActions(row({ direction: 'Outgoing' }), { navigate, currentUser: admin }));
    expect(items).not.toContain('reply');
    expect(items).toContain('forward');
    expect(items).toContain('reminder');
  });

  it('non-privileged user: no workflow actions (approve/reject/reassign/delegate)', () => {
    const items = keys(buildCorrespondenceRowActions(row({ status: 'InReview' }), { navigate, currentUser: plain }));
    expect(items).not.toContain('approve');
    expect(items).not.toContain('reassign');
    expect(items).not.toContain('delegate');
  });

  it('InReview + privileged: shows Approve and Reject', () => {
    const items = keys(buildCorrespondenceRowActions(row({ status: 'InReview' }), { navigate, currentUser: admin }));
    expect(items).toContain('approve');
    expect(items).toContain('reject');
  });

  it('no attachment: drops document-only actions (editWord/download/print/annotate)', () => {
    const items = keys(buildCorrespondenceRowActions(row({ hasAttachment: false }), { navigate, currentUser: admin }));
    ['editWord', 'download', 'print', 'annotate'].forEach((k) => expect(items).not.toContain(k));
    expect(items).toContain('attachments'); // still offered (opens the Files tab)
  });

  it('opens a draft in Create Correspondence edit mode instead of the read-only detail view', () => {
    const trackedNavigation = jest.fn();
    const items = buildCorrespondenceRowActions(row({ status: 'Draft' }), {
      navigate: trackedNavigation,
      currentUser: admin,
      originState: { originPath: '/inbox-sent/drafts', originLabel: 'Drafts' },
    });

    expect(keys(items)).toEqual(['view']);
    items[0].onClick?.();
    expect(trackedNavigation).toHaveBeenCalledWith('/correspondence/new', {
      state: { editDraftId: '42', originPath: '/inbox-sent/drafts', originLabel: 'Drafts' },
    });
  });

  it('offers the requestor-supplied draft delete action alongside Edit Draft', () => {
    const onDeleteDraft = jest.fn();
    const draft = row({ status: 'Draft' });
    const items = buildCorrespondenceRowActions(draft, { navigate, currentUser: admin, onDeleteDraft });

    expect(keys(items)).toEqual(['view', 'deleteDraft']);
    expect(items[1].dividerBefore).toBe(true);
    items[1].onClick?.();
    expect(onDeleteDraft).toHaveBeenCalledWith(draft);
  });

  it('marks a divider before the first item of each following group', () => {
    const items = buildCorrespondenceRowActions(row(), { navigate, currentUser: admin });
    expect(items[0].dividerBefore).toBeFalsy(); // first item, no divider
    const byKey = (k: string): boolean => !!items.find((i) => i.key === k)?.dividerBefore;
    expect(byKey('reply')).toBe(true); // start of group 2
    expect(byKey('download')).toBe(true); // start of group 3
  });
});
