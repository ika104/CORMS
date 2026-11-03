/**
 * Power Automate flow configuration read from CORMS_AdminConfig. SPFx owns no signing-provider
 * endpoint, credential, or provider-specific setting: the flows resolve those at runtime.
 */
export const SIGNATURE_FLOW_CONFIG_KEYS = {
  flowUrl: 'signature.flowUrl',
} as const;

/**
 * Provider connection settings the signing flow reads from CORMS_AdminConfig at runtime (Get items
 * filtered by Title), so switching environment or provider account is an Admin Settings edit, not
 * a flow edit. SPFx never resolves or sends these; they are provisioned here only so the rows
 * exist on the Admin Settings screen.
 */
export const SIGNATURE_PROVIDER_CONFIG_KEYS = {
  baseUrl: 'signature.providerBaseUrl',
  /** Base64 `clientId:clientSecret` sent as the Basic credential on the provider's token request. */
  clientCredentials: 'signature.providerClientCredentials',
  username: 'signature.providerUsername',
  password: 'signature.providerPassword',
} as const;

/**
 * Admin Config rows from earlier signing designs that nothing reads any more. Provisioning moves
 * them to the site recycle bin so the Admin Settings screen only shows live settings.
 */
export const RETIRED_SIGNATURE_CONFIG_KEYS = [
  'signnow.apiToken',
  'signnow.apiBaseUrl',
  'signnow.brokerUrl',
  'signature.providerApiToken',
] as const;

export interface ISignatureFlowConfig {
  flowUrl: string;
}

export function resolveSignatureFlowConfig(values: Record<string, string | undefined>): ISignatureFlowConfig {
  return {
    flowUrl: (values[SIGNATURE_FLOW_CONFIG_KEYS.flowUrl] ?? '').trim(),
  };
}
