import directory from '../../mocks/delegationDirectory.json';
import itemsSeed from '../../mocks/teamInboxItems.json';
import { IDirectoryPerson } from '../../models/IDelegation';
import { ITeamInboxItem } from '../../models/ITeamInbox';

export const TEAM_DIRECTORY = directory as IDirectoryPerson[];
export const INITIAL_TEAM_INBOX_ITEMS = itemsSeed as ITeamInboxItem[];

// TODO(confirm): the signed-in supervisor is hard-coded to Sara Al-Mansour until real
// RecordsHub identity + an org-chart service exist — mirrors the CURRENT_USER_ID pattern in
// MyCorrespondenceView.tsx. The app's only mock currentUser is an Administrator with no
// direct reports, so Team Inbox is demoed as Sara's view regardless of who is logged in.
export const CURRENT_SUPERVISOR_ID = 'u-sara';
export const SUBORDINATE_IDS = ['u-layla', 'u-ahmed', 'u-nour'];

export function getSupervisorClearance(): number {
  return TEAM_DIRECTORY.find((p) => p.id === CURRENT_SUPERVISOR_ID)?.clearanceTier ?? 0;
}

export function getSubordinates(): IDirectoryPerson[] {
  return TEAM_DIRECTORY.filter((p) => SUBORDINATE_IDS.indexOf(p.id) !== -1);
}

export function getPersonName(id: string): string {
  return TEAM_DIRECTORY.find((p) => p.id === id)?.displayName ?? id;
}
