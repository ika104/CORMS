import { mergeFoldersIntoNav } from '../mergeFolders';
import { INavGroup } from '../../../models/INavModel';
import { IUserFolder } from '../../../models/IFolder';

const FOLDERS: IUserFolder[] = [{ id: '7', name: 'Legal Watch', criteria: {}, manualIds: [] }];

/** The two shapes the rail is actually fed. `src/mocks/nav.json` (the fallback used until the
 * live fetch resolves) keys the Inbox entry `inbox`; CORMS_NavigationMenu's seed keys it
 * `inboxSent.inbox`, and NavigationServiceCore copies `Key` straight onto `INavItem.id`. */
function buildGroups(inboxId: string): INavGroup[] {
  return [
    {
      id: 'main',
      items: [
        { id: 'myCorrespondence', labelKey: 'nav.myCorrespondence', icon: 'inbox', path: '/my-correspondence' },
        {
          id: 'inboxSent',
          labelKey: 'nav.inboxSent',
          icon: 'mail',
          children: [
            { id: inboxId, labelKey: 'nav.inbox', icon: 'mailOpen', path: '/inbox-sent/inbox' },
            { id: 'sent', labelKey: 'nav.sent', icon: 'send', path: '/inbox-sent/sent' },
          ],
        },
      ],
    },
  ];
}

function folderChildIds(groups: INavGroup[]): string[] | undefined {
  const inbox = groups[0].items
    .find((i) => i.id === 'inboxSent')
    ?.children?.find((c) => c.path === '/inbox-sent/inbox');
  return inbox?.children?.map((c) => c.id);
}

describe('CMS-054 AC6 / CMS-039 AC13 — custom folders nest under Inbox in the left nav', () => {
  it('nests folders under the fallback nav shape (Inbox keyed "inbox")', () => {
    const merged = mergeFoldersIntoNav(buildGroups('inbox'), FOLDERS);

    expect(folderChildIds(merged)).toEqual(['folder-7']);
  });

  it('nests folders under the CORMS_NavigationMenu shape (Inbox keyed "inboxSent.inbox")', () => {
    // Regression guard: matching the Inbox entry by `id === 'inbox'` silently stopped nesting the
    // moment the shell switched from the mock nav to NavigationService's CORMS_NavigationMenu
    // tree, because the live seed's Key — and therefore the nav item's id — is 'inboxSent.inbox'.
    const merged = mergeFoldersIntoNav(buildGroups('inboxSent.inbox'), FOLDERS);

    expect(folderChildIds(merged)).toEqual(['folder-7']);
  });

  it('routes each nested folder entry at its own folder path', () => {
    const merged = mergeFoldersIntoNav(buildGroups('inboxSent.inbox'), FOLDERS);

    const inbox = merged[0].items
      .find((i) => i.id === 'inboxSent')
      ?.children?.find((c) => c.path === '/inbox-sent/inbox');
    expect(inbox?.children?.[0].path).toBe('/inbox-sent/folder/7');
    expect(inbox?.children?.[0].label).toBe('Legal Watch');
  });

  it('never nests folders under Sent, and leaves the tree untouched when there are no folders', () => {
    const groups = buildGroups('inboxSent.inbox');
    const merged = mergeFoldersIntoNav(groups, FOLDERS);

    const sent = merged[0].items.find((i) => i.id === 'inboxSent')?.children?.find((c) => c.id === 'sent');
    expect(sent?.children).toBeUndefined();
    expect(mergeFoldersIntoNav(groups, [])).toBe(groups);
  });
});
