import { SPHttpClient } from '@microsoft/sp-http';
import { WebPartContext } from '@microsoft/sp-webpart-base';
import { ITemplatesService } from '../interfaces/ITemplatesService';
import { ICorrespondenceTemplate } from '../../models/ICorrespondenceMetadata';

interface ITemplateListItem {
  Id: number;
  Title: string;
  Header?: string;
  Footer?: string;
  BodyHtml?: string;
  Approved?: boolean;
  // CMS-037 AC4 — the template's version, bumped on each save (see saveTemplate). Named
  // TemplateVersion, NOT Version: "Version" is a reserved SharePoint column name, so a custom field
  // called Version provisions under a mangled internal name and every write keyed "Version" 400s
  // ("property 'Version' does not exist") — same collision class as ContentType->ContentTypeName.
  TemplateVersion?: number;
}

// Live SP REST implementation of ds.templates (D-TBD, TASK-05 §8 item 2). CMS-005 AC13 adds the
// Administration author/edit surface (create/update/delete) alongside the read.
export class TemplatesServiceLive implements ITemplatesService {
  constructor(
    private readonly context: WebPartContext,
    private readonly siteUrl: string,
    private readonly listName: string = 'CORMS_Templates'
  ) {}

  private itemsUrl(): string {
    return `${this.siteUrl}/_api/web/lists/getbytitle('${this.listName}')/items`;
  }

  public async getTemplates(): Promise<ICorrespondenceTemplate[]> {
    const url = `${this.itemsUrl()}?$select=Id,Title,Header,Footer,BodyHtml,Approved,TemplateVersion`;
    const response = await this.context.spHttpClient.get(url, SPHttpClient.configurations.v1, {
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      throw new Error(`Failed to read ${this.listName}: ${response.status} ${response.statusText}`);
    }
    const body = (await response.json()) as { value: ITemplateListItem[] };
    return body.value.map((item) => ({
      id: String(item.Id),
      name: item.Title,
      header: item.Header ?? '',
      footer: item.Footer ?? '',
      bodyHtml: item.BodyHtml ?? '',
      // Absent column is treated as approved so pre-existing rows keep working (mirrors the client).
      approved: item.Approved !== false,
      // CMS-037 AC4 — absent/zero TemplateVersion reads as 1 so pre-existing rows without the column
      // behave as a first version rather than an unversioned template.
      version: item.TemplateVersion && item.TemplateVersion > 0 ? item.TemplateVersion : 1,
    }));
  }

  private toListItem(template: ICorrespondenceTemplate, version: number): Partial<ITemplateListItem> {
    return {
      Title: template.name,
      Header: template.header,
      Footer: template.footer,
      BodyHtml: template.bodyHtml,
      Approved: template.approved !== false,
      // CMS-037 AC4 — the version resolved by saveTemplate (1 on create, bumped on each edit).
      TemplateVersion: version,
    };
  }

  public async saveTemplate(template: ICorrespondenceTemplate): Promise<ICorrespondenceTemplate> {
    const isUpdate = !!template.id;
    const url = isUpdate ? `${this.itemsUrl()}(${template.id})` : this.itemsUrl();
    // CMS-037 AC4 — every save is a new revision: a create starts at version 1, an edit bumps the
    // current version by one so records stamped with the version they were authored from can be told
    // apart from those built on a later revision.
    const version = isUpdate ? (template.version && template.version > 0 ? template.version : 1) + 1 : 1;
    const response = await this.context.spHttpClient.post(url, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'Content-Type': 'application/json;odata=nometadata',
        ...(isUpdate ? { 'IF-MATCH': '*', 'X-HTTP-Method': 'MERGE' } : {}),
      },
      body: JSON.stringify(this.toListItem(template, version)),
    });
    if (!response.ok) {
      throw new Error(`Failed to save ${this.listName} item: ${response.status} ${response.statusText}`);
    }
    if (isUpdate) {
      return { ...template, version };
    }
    // Create returns the new item (with its server-assigned Id) — MERGE/update returns 204 No Content.
    const created = (await response.json()) as ITemplateListItem;
    return { ...template, id: String(created.Id), version };
  }

  public async deleteTemplate(id: string): Promise<void> {
    const response = await this.context.spHttpClient.post(`${this.itemsUrl()}(${id})`, SPHttpClient.configurations.v1, {
      headers: {
        Accept: 'application/json;odata=nometadata',
        'IF-MATCH': '*',
        'X-HTTP-Method': 'DELETE',
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to delete ${this.listName} item ${id}: ${response.status} ${response.statusText}`);
    }
  }
}
