import { SIGNATURE_FLOW_CONFIG_KEYS, resolveSignatureFlowConfig } from '../signatureFlowConfig';

describe('resolveSignatureFlowConfig', () => {
  it('reads and trims the single Power Automate signing flow URL', () => {
    expect(
      resolveSignatureFlowConfig({
        [SIGNATURE_FLOW_CONFIG_KEYS.flowUrl]: ' https://flow.example/signing ',
      })
    ).toEqual({
      flowUrl: 'https://flow.example/signing',
    });
  });

  it('leaves a missing flow unconfigured', () => {
    expect(resolveSignatureFlowConfig({})).toEqual({ flowUrl: '' });
  });
});
