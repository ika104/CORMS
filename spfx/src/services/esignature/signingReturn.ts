/**
 * The in-app signing frame shows the provider's page, which CORMS cannot inspect. When the signer
 * finishes, declines or closes, the flow redirects that page to a return address on CORMS's own
 * origin; once the frame lands there it is readable again, so the app knows the session ended.
 */
export type SigningPageResult = 'completed' | 'declined' | 'closed';

const RETURN_MARKER = 'cormsSigning';
const RESULT_PARAM = 'signingResult';

/** A tiny same-origin resource, so returning to it is instant and the frame becomes readable. */
export function buildSigningReturnUrl(origin: string): string {
  return `${origin}/_layouts/15/images/blank.gif?${RETURN_MARKER}=1`;
}

/** The outcome the flow reported when the frame is back on the return address, else undefined. */
export function parseSigningReturn(href: string, returnUrl: string): SigningPageResult | undefined {
  if (href.split('?')[0] !== returnUrl.split('?')[0]) return undefined;
  const params = new URL(href).searchParams;
  if (params.get(RETURN_MARKER) !== '1') return undefined;
  const result = params.get(RESULT_PARAM);
  return result === 'declined' || result === 'closed' ? result : 'completed';
}

/** The return address for signing started from the current page. */
export function pageSigningReturnUrl(): string {
  return buildSigningReturnUrl(window.location.origin);
}
