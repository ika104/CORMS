import type { SPFI } from '@pnp/sp';

/**
 * Resolves the signed-in user's numeric id in whichever site `sp` was built against. Shared by
 * every Epic 1 Core class that needs to filter a People/User field by "the current user"
 * (CORMS_UserRoles.User, CORMS_ReadReceipts.UserId, CORMS_CustomFolders.OwnerUser,
 * CORMS_Correspondence.AssignedTo/Sender) — deliberately resolved against CORMS's own site
 * (config.siteUrl), not RecordsHub's, since every list these Core classes touch lives on CORMS's
 * own site and SharePoint user ids are scoped per site collection.
 *
 * `import type` only — no runtime @pnp/sp import, so this stays safe for Core classes to import
 * (see provisioningCore.ts's file comment on why). The real `sp.web.currentUser` fluent surface
 * is registered at runtime only by each service's *.live.ts wrapper (`import '@pnp/sp/site-users/web'`).
 */
export async function getCurrentSiteUserId(sp: SPFI): Promise<number> {
  const user = await sp.web.currentUser();
  return (user as { Id: number }).Id;
}

/**
 * Parses a caller-supplied user id into the positive integer a `UserId eq {n}` / `ManagerUserId eq
 * {n}` clause needs, or `undefined` when it isn't one.
 *
 * `Number.isFinite(Number(x))` is not enough on its own: `Number('')` is 0 and `Number(null)` is 0,
 * so a blank id sails through and turns into a real query for the site's user 0 rather than being
 * recognized as "no id". Every id arriving from outside a Core class goes through here first.
 */
export function parseSiteUserId(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}
