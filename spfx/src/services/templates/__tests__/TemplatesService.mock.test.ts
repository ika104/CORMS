import { TemplatesServiceMock } from '../TemplatesService.mock';
import { ICorrespondenceTemplate } from '../../../models/ICorrespondenceMetadata';

function draft(overrides: Partial<ICorrespondenceTemplate> = {}): ICorrespondenceTemplate {
  return { id: '', name: 'New Template', header: '', footer: '', bodyHtml: '', approved: true, ...overrides };
}

describe('CMS-037 AC4 — TemplatesServiceMock version tracking', () => {
  it('a brand-new template is created at version 1', async () => {
    const svc = new TemplatesServiceMock();
    const created = await svc.saveTemplate(draft());
    expect(created.version).toBe(1);
    expect(created.id).toBeTruthy();
  });

  it('editing an existing template bumps its version', async () => {
    const svc = new TemplatesServiceMock();
    const created = await svc.saveTemplate(draft());
    const edited = await svc.saveTemplate({ ...created, name: 'Renamed' });
    expect(edited.version).toBe(2);

    const bumpedAgain = await svc.saveTemplate({ ...edited, footer: 'x' });
    expect(bumpedAgain.version).toBe(3);
  });

  it('an edit to a versionless (pre-existing) template settles at version 2', async () => {
    const svc = new TemplatesServiceMock();
    // Seeded fixtures start at version 1; simulate a legacy row that never carried the column.
    const seeded = (await svc.getTemplates())[0];
    const edited = await svc.saveTemplate({ ...seeded, version: undefined, name: 'Edited legacy' });
    expect(edited.version).toBe(2);
  });
});
