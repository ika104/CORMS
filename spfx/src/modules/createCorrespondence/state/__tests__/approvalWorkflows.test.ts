import {
  parseApprovalWorkflowsJson,
  serializeApprovalWorkflows,
} from '../approvalWorkflows';

describe('approval workflow configuration', () => {
  it('restores the required workflows when configuration is missing or malformed', () => {
    expect(parseApprovalWorkflowsJson(undefined).map((workflow) => workflow.id)).toEqual(['standard', 'board', 'fast-track']);
    expect(parseApprovalWorkflowsJson('{not valid json}').map((workflow) => workflow.id)).toEqual([
      'standard',
      'board',
      'fast-track',
    ]);
  });

  it('preserves edited standard workflows and custom workflows through JSON', () => {
    const configured = parseApprovalWorkflowsJson(
      '[{"id":"standard","name":"Operations review","steps":[]},{"id":"legal","name":"Legal review","steps":[]}]'
    );

    expect(configured.map((workflow) => workflow.name)).toEqual([
      'Operations review',
      'Board-Level Approval',
      'Fast Track',
      'Legal review',
    ]);
    const serialized = serializeApprovalWorkflows(configured);
    expect(JSON.parse(serialized)).toHaveProperty('workflows');
    expect(parseApprovalWorkflowsJson(serialized)).toEqual(configured);
  });
});
