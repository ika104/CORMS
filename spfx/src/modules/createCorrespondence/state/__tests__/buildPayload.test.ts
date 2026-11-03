import { buildComposedDocumentHtml, buildPayloadFromFormState } from '../buildPayload';
import { createInitialFormState, ICreateCorrespondenceFormState } from '../types';

function state(overrides: Partial<ICreateCorrespondenceFormState> = {}): ICreateCorrespondenceFormState {
  return {
    ...createInitialFormState('Alice Author'),
    subject: 'Budget',
    recipientNames: ['Bob'],
    recipientIds: ['bob'],
    securityTier: 2,
    ...overrides,
  };
}

describe('CMS-005 AC15 — buildComposedDocumentHtml', () => {
  it('assembles the print-ready document for an outgoing template-authored item', () => {
    const html = buildComposedDocumentHtml(
      state({
        correspondenceType: 'Outgoing',
        selectedTemplateId: 'tpl-1',
        templateHeader: 'Ref: {{referenceNumber}}',
        templateFooter: '{{subject}} — Internal',
        bodyHtml: '<p>Dear Bob,</p>',
        referenceNumber: 'OUT-2026-9',
      }),
      'Director'
    );
    expect(html).toContain('<header class="corms-doc-header">Ref: OUT-2026-9</header>');
    expect(html).toContain('<main class="corms-doc-body"><p>Dear Bob,</p></main>');
    expect(html).toContain(
      '<section class="corms-doc-signoff">Yours faithfully,<br/>Alice Author<br/>Director</section>'
    );
    expect(html).toContain('<footer class="corms-doc-footer">Budget — Internal</footer>');
  });

  it('omits the sign-off role line when the role is unknown', () => {
    const html = buildComposedDocumentHtml(
      state({ correspondenceType: 'Outgoing', selectedTemplateId: 'tpl-1', bodyHtml: '<p>Body</p>' })
    );
    expect(html).toContain('<section class="corms-doc-signoff">Yours faithfully,<br/>Alice Author</section>');
  });

  it('is undefined for an uploaded (non-template) outgoing item', () => {
    expect(
      buildComposedDocumentHtml(
        state({ correspondenceType: 'Outgoing', composeMode: 'upload', uploadedDocumentName: 'x.pdf' })
      )
    ).toBeUndefined();
  });

  it('is undefined for an incoming item even if a stale template id lingers', () => {
    expect(
      buildComposedDocumentHtml(
        state({ correspondenceType: 'Incoming', selectedTemplateId: 'tpl-1', bodyHtml: '<p>x</p>' })
      )
    ).toBeUndefined();
  });

  it('is undefined when the body is empty', () => {
    expect(
      buildComposedDocumentHtml(
        state({ correspondenceType: 'Outgoing', selectedTemplateId: 'tpl-1', bodyHtml: '   ' })
      )
    ).toBeUndefined();
  });
});

describe('CMS-005 — buildPayloadFromFormState carries the composed document', () => {
  it('includes composedDocumentHtml for an outgoing template item', () => {
    const payload = buildPayloadFromFormState(
      state({ correspondenceType: 'Outgoing', selectedTemplateId: 'tpl-1', bodyHtml: '<p>Body</p>' }),
      'Director'
    );
    expect(payload.templateReference).toBe('tpl-1');
    expect(payload.composedDocumentHtml).toContain('corms-doc-body');
  });

  it('leaves composedDocumentHtml undefined for an uploaded item', () => {
    const payload = buildPayloadFromFormState(
      state({ correspondenceType: 'Outgoing', composeMode: 'upload', uploadedDocumentName: 'x.pdf' })
    );
    expect(payload.composedDocumentHtml).toBeUndefined();
  });
});

describe('CMS-006 AC8/AC9 — buildPayloadFromFormState carries the approval chain', () => {
  const reviewer = {
    id: 's1',
    kind: 'reviewer' as const,
    userId: 'u-1',
    userName: 'Alice',
    requireSignature: false,
    signaturePlacement: { page: 1, x: 70, y: 85, width: 20, height: 8 },
  };

  it('serialises the ordered steps for an outgoing item with reviewers', () => {
    const payload = buildPayloadFromFormState(
      state({ correspondenceType: 'Outgoing', approvalSteps: [reviewer] })
    );
    expect(payload.approvalChain).toHaveLength(1);
    expect(payload.approvalChain?.[0]).toMatchObject({ order: 1, type: 'Reviewer', name: 'Alice' });
  });

  it('is undefined for an outgoing item with no steps', () => {
    expect(
      buildPayloadFromFormState(state({ correspondenceType: 'Outgoing', approvalSteps: [] })).approvalChain
    ).toBeUndefined();
  });

  it('is undefined for an incoming item even if steps linger in state', () => {
    expect(
      buildPayloadFromFormState(state({ correspondenceType: 'Incoming', approvalSteps: [reviewer] }))
        .approvalChain
    ).toBeUndefined();
  });
  it('routes no chain for an uploaded document marked as already signed', () => {
    const payload = buildPayloadFromFormState(
      state({
        correspondenceType: 'Outgoing',
        composeMode: 'upload',
        mainDocumentSigned: true,
        approvalSteps: [reviewer],
      })
    );
    expect(payload.mainDocumentSigned).toBe(true);
    expect(payload.approvalChain).toBeUndefined();
  });

  it('ignores the signed flag for a template letter, which CORMS itself generates', () => {
    const payload = buildPayloadFromFormState(
      state({
        correspondenceType: 'Outgoing',
        composeMode: 'template',
        mainDocumentSigned: true,
        approvalSteps: [reviewer],
      })
    );
    expect(payload.mainDocumentSigned).toBe(false);
    expect(payload.approvalChain).toHaveLength(1);
  });
});
