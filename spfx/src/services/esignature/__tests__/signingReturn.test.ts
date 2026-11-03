import { buildSigningReturnUrl, parseSigningReturn } from '../signingReturn';

describe('signing return address', () => {
  const returnUrl = buildSigningReturnUrl('https://tenant.sharepoint.com');

  it('is a same-origin address carrying the CORMS marker', () => {
    expect(returnUrl).toBe('https://tenant.sharepoint.com/_layouts/15/images/blank.gif?cormsSigning=1');
  });

  it('reads the result the flow appended', () => {
    expect(parseSigningReturn(`${returnUrl}&signingResult=completed`, returnUrl)).toBe('completed');
    expect(parseSigningReturn(`${returnUrl}&signingResult=declined`, returnUrl)).toBe('declined');
    expect(parseSigningReturn(`${returnUrl}&signingResult=closed`, returnUrl)).toBe('closed');
    // A return without a result still means the page finished.
    expect(parseSigningReturn(returnUrl, returnUrl)).toBe('completed');
  });

  it('ignores any other page the frame shows', () => {
    expect(parseSigningReturn('about:blank', returnUrl)).toBeUndefined();
    expect(
      parseSigningReturn('https://tenant.sharepoint.com/_layouts/15/images/blank.gif', returnUrl)
    ).toBeUndefined();
    expect(parseSigningReturn('https://app.signnow.com/webapp/document/1', returnUrl)).toBeUndefined();
  });
});
