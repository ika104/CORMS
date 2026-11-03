import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import { SPHttpClient } from '@microsoft/sp-http';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { ISharePointService } from '../interfaces/ISharePointService';
import { IPersonOption } from '../../models/ICorrespondenceMetadata';

interface IPeoplePickerEntity {
  Key: string;
  DisplayText: string;
  EntityType?: string;
  EntityData?: { Email?: string; PrincipalType?: string };
}

export class SharePointService implements ISharePointService {
  private readonly sp: SPFI;

  constructor(private readonly context: WebPartContext) {
    this.sp = spfi().using(SPFx(context));
  }

  public async getWebTitle(): Promise<string> {
    const web = await this.sp.web();
    return web.Title;
  }

  public async searchPeople(query: string, maxSuggestions = 20): Promise<IPersonOption[]> {
    const q = (query ?? '').trim();
    if (!q) return [];
    const webUrl = this.context.pageContext.web.absoluteUrl;
    // Primary: SharePoint's ClientPeoplePicker (searches the whole directory). It's a POST-only
    // action endpoint, so it needs the web's request digest — without it SharePoint rejects the
    // call. If it fails or returns nothing, fall back to the site's user list (GET, no digest).
    try {
      const people = await this.searchViaPeoplePicker(webUrl, q, maxSuggestions);
      if (people.length) return people;
    } catch {
      /* fall through to the site-users fallback */
    }
    return this.searchSiteUsers(webUrl, q, maxSuggestions);
  }

  private async searchViaPeoplePicker(webUrl: string, query: string, maxSuggestions: number): Promise<IPersonOption[]> {
    const digest = await this.getRequestDigest(webUrl);
    // spHttpClient speaks OData v4, so use v4 `odata.metadata=none` headers and a plain body with
    // NO `__metadata` block — the v3 `odata=verbose` + `__metadata` shape 400s here. PrincipalType
    // 1 = User; PrincipalSource 15 = all sources. The result comes back as a JSON *string*.
    const body = JSON.stringify({
      queryParams: {
        AllowEmailAddresses: true,
        AllowMultipleEntities: false,
        MaximumEntitySuggestions: maxSuggestions,
        PrincipalSource: 15,
        PrincipalType: 1,
        QueryString: query,
      },
    });
    const response = await this.context.spHttpClient.post(
      `${webUrl}/_api/SP.UI.ApplicationPages.ClientPeoplePickerWebServiceInterface.clientPeoplePickerSearchUser`,
      SPHttpClient.configurations.v1,
      {
        headers: {
          accept: 'application/json;odata.metadata=none',
          'content-type': 'application/json;odata.metadata=none',
          'X-RequestDigest': digest,
        },
        body,
      }
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as { value?: string; d?: { ClientPeoplePickerSearchUser?: string } };
    const entities = JSON.parse(payload.value ?? payload.d?.ClientPeoplePickerSearchUser ?? '[]') as IPeoplePickerEntity[];
    return entities.map((entity) => ({ id: entity.Key, name: entity.DisplayText, email: entity.EntityData?.Email }));
  }

  /** GET fallback: the site's own user list. Only returns users already present on the site (not
   * the full directory), but needs no digest and always works when the people picker is blocked. */
  private async searchSiteUsers(webUrl: string, query: string, maxSuggestions: number): Promise<IPersonOption[]> {
    const filter = `substringof('${query.replace(/'/g, "''")}', Title) and PrincipalType eq 1`;
    const url = `${webUrl}/_api/web/siteusers?$select=Id,Title,Email,LoginName&$top=${maxSuggestions}&$filter=${encodeURIComponent(filter)}`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) return [];
    const body = (await response.json()) as { value: Array<{ Id: number; Title: string; Email?: string; LoginName?: string }> };
    return body.value
      .filter((u) => {
        // Keep real people only — drop system/app principals (e.g. NT Service\spsearch,
        // app@sharepoint) that have no email and aren't membership (AAD) accounts.
        if (!u.Title) return false;
        return (u.LoginName ?? '').indexOf('|membership|') !== -1 || !!u.Email;
      })
      .map((u) => ({ id: u.LoginName || String(u.Id), name: u.Title, email: u.Email || undefined }));
  }

  private async getRequestDigest(webUrl: string): Promise<string> {
    const response = await this.context.spHttpClient.post(`${webUrl}/_api/contextinfo`, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    const body = (await response.json()) as { FormDigestValue?: string };
    return body.FormDigestValue ?? '';
  }
}
