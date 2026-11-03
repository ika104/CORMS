import type { WebPartContext } from '@microsoft/sp-webpart-base';

export interface ILiveIdentity {
  displayName: string;
  email: string;
  photoUrl?: string;
  jobTitle?: string;
}

// Display name, email, and photo come straight off the SPFx context with no REST call — the
// signed-in user is always known when the web part is running inside a real SharePoint page, so
// there's no reason to ever serve a mocked name/photo. Job title lives in the User Profile
// service, a separate API that needs one best-effort call: some tenants don't have User Profiles
// provisioned, so a failure there is swallowed rather than blocking sign-in — shared by both the
// mock and live RecordsHub services so "who is signed in" is never a mock/live-toggle concern.
// `siteUrl` defaults to the web part's own site — GetMyProperties is a tenant-wide User Profile
// call, not scoped to the RecordsHub site, so any site URL works when a specific one isn't given.
export async function resolveLiveIdentity(context: WebPartContext, siteUrl?: string): Promise<ILiveIdentity> {
  const { displayName, email } = context.pageContext.user;
  const photoUrl = email
    ? `${context.pageContext.web.absoluteUrl}/_layouts/15/userphoto.aspx?size=L&accountname=${encodeURIComponent(email)}`
    : undefined;

  let jobTitle: string | undefined;
  try {
    // Imported lazily: this pulls in @microsoft/sp-http's whole barrel (SPHttpClient,
    // AadHttpClient, etc.), which is fine in the real SPFx runtime but drags an internal-only
    // transitive dependency (SPFlight) into any test's module graph that reaches this file at
    // load time. A dynamic import keeps it out of that graph unless this branch actually runs.
    const { SPHttpClient } = await import(/* webpackChunkName: 'corms-sp-http' */ '@microsoft/sp-http');
    const url = `${siteUrl ?? context.pageContext.web.absoluteUrl}/_api/SP.UserProfiles.PeopleManager/GetMyProperties?$select=Title`;
    const response = await context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (response.ok) {
      const body = (await response.json()) as { Title?: string };
      jobTitle = body.Title || undefined;
    }
  } catch {
    // Best-effort — see comment above.
  }

  return { displayName, email, photoUrl, jobTitle };
}
