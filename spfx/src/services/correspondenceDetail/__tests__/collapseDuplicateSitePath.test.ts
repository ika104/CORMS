import { collapseDuplicateSitePath } from '../CorrespondenceDetailServiceCore';

describe('collapseDuplicateSitePath', () => {
  it('collapses a duplicated site segment introduced by the old existing-document bug', () => {
    expect(
      collapseDuplicateSitePath(
        'https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2/sites/SPEDRMSRecordsHubDev2/RH_Disposition_NRAA01_2019/Document1.docx'
      )
    ).toBe(
      'https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2/RH_Disposition_NRAA01_2019/Document1.docx'
    );
  });

  it('leaves a correct URL unchanged', () => {
    const url = 'https://ssloman.sharepoint.com/sites/SPEDRMSRecordsHubDev2/RH_Disposition_NRAA01_2019/Document1.docx';
    expect(collapseDuplicateSitePath(url)).toBe(url);
  });

  it('does not touch a duplicated segment that is not a /sites/ path', () => {
    const url = 'https://ssloman.sharepoint.com/sites/CORMS/CORMS_Attachments/CORMS_Attachments/x.pdf';
    expect(collapseDuplicateSitePath(url)).toBe(url);
  });
});
