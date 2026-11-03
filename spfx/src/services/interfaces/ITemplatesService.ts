import { ICorrespondenceTemplate } from '../../models/ICorrespondenceMetadata';

// Backs ds.templates (D-TBD, TASK-05 §8 item 2).
export interface ITemplatesService {
  getTemplates(): Promise<ICorrespondenceTemplate[]>;
  /** CMS-005 AC13 — administrators author/edit templates from Administration. Creates the template
   * when `id` is empty, otherwise updates it in place; returns the persisted template (with its
   * server-assigned id on create). */
  saveTemplate(template: ICorrespondenceTemplate): Promise<ICorrespondenceTemplate>;
  /** CMS-005 AC13 — removes a template. */
  deleteTemplate(id: string): Promise<void>;
}
