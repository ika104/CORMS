import { buildFilePlanInfo } from '../filePlanInfo';

describe('buildFilePlanInfo (CMS-027 AC3)', () => {
  it('returns undefined when the item is unclassified', () => {
    expect(buildFilePlanInfo(undefined)).toBeUndefined();
    expect(buildFilePlanInfo('')).toBeUndefined();
    expect(buildFilePlanInfo('   ')).toBeUndefined();
  });

  it('splits "<code> - <title>" into file number, name and file-plan position', () => {
    expect(buildFilePlanInfo('10773 - التنظيم العام للجهة')).toEqual({
      fileNumber: '10773',
      fileName: 'التنظيم العام للجهة',
      filePlanPosition: '10773',
    });
  });

  it('handles an em-dash separator (the Triage/Classify picker label format)', () => {
    expect(buildFilePlanInfo('1000 — التنظيم العام للجهة')).toEqual({
      fileNumber: '1000',
      fileName: 'التنظيم العام للجهة',
      filePlanPosition: '1000',
    });
  });

  it('handles an en-dash separator and a dotted classification code', () => {
    expect(buildFilePlanInfo('10.7.3 – General Administration')).toEqual({
      fileNumber: '10.7.3',
      fileName: 'General Administration',
      filePlanPosition: '10.7.3',
    });
  });

  it('keeps a hyphen inside the title (only the first separator splits)', () => {
    expect(buildFilePlanInfo('4501 - Finance - Budget')).toEqual({
      fileNumber: '4501',
      fileName: 'Finance - Budget',
      filePlanPosition: '4501',
    });
  });

  it('falls back to the whole value as both name and position when there is no separator', () => {
    expect(buildFilePlanInfo('General Correspondence')).toEqual({
      fileNumber: 'General Correspondence',
      fileName: 'General Correspondence',
      filePlanPosition: 'General Correspondence',
    });
  });
});
