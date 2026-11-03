import { ITemplatesService } from '../interfaces/ITemplatesService';
import { ICorrespondenceTemplate } from '../../models/ICorrespondenceMetadata';
import templatesMock from '../../mocks/templates.json';

const SIMULATED_LATENCY_MS = 150;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

export class TemplatesServiceMock implements ITemplatesService {
  // A mutable in-memory copy seeded from the fixture, so Administration edits (CMS-005 AC13)
  // persist for the life of the session the same way the live list would, instead of the imported
  // JSON being handed back read-only.
  private templates: ICorrespondenceTemplate[] = (templatesMock as ICorrespondenceTemplate[]).map((tpl) => ({ ...tpl }));
  private idCounter = this.templates.length;

  public getTemplates(): Promise<ICorrespondenceTemplate[]> {
    return delay(this.templates.map((tpl) => ({ ...tpl })));
  }

  public saveTemplate(template: ICorrespondenceTemplate): Promise<ICorrespondenceTemplate> {
    if (template.id) {
      // CMS-037 AC4 — an edit is a new revision: bump the version so a record authored from the
      // earlier revision keeps its own stamped version (mirrors the live service).
      const nextVersion = (template.version && template.version > 0 ? template.version : 1) + 1;
      const updated: ICorrespondenceTemplate = { ...template, version: nextVersion };
      const index = this.templates.findIndex((tpl) => tpl.id === template.id);
      if (index !== -1) {
        this.templates[index] = updated;
      } else {
        this.templates.push(updated);
      }
      return delay({ ...updated });
    }
    this.idCounter += 1;
    // CMS-037 AC4 — a brand-new template starts at version 1.
    const created: ICorrespondenceTemplate = { ...template, id: `tpl-${this.idCounter}`, version: 1 };
    this.templates.push(created);
    return delay({ ...created });
  }

  public deleteTemplate(id: string): Promise<void> {
    this.templates = this.templates.filter((tpl) => tpl.id !== id);
    return delay(undefined);
  }
}
