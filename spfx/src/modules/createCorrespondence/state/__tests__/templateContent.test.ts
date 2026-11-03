import {
  buildSignOff,
  buildTemplateValues,
  composePrintableDocument,
  interpolatePlaceholders,
} from '../templateContent';
import { createInitialFormState, ICreateCorrespondenceFormState } from '../types';

function state(overrides: Partial<ICreateCorrespondenceFormState> = {}): ICreateCorrespondenceFormState {
  return { ...createInitialFormState('Alice Author'), ...overrides };
}

describe('CMS-005 — interpolatePlaceholders (AC14)', () => {
  it('replaces every known placeholder across a fragment', () => {
    const out = interpolatePlaceholders('Dear {{recipient}}, ref {{referenceNumber}} on {{date}}', {
      recipient: 'Bob',
      referenceNumber: 'OUT-2026-1',
      date: '2026-09-05',
    });
    expect(out).toBe('Dear Bob, ref OUT-2026-1 on 2026-09-05');
  });

  it('tolerates surrounding whitespace in the token', () => {
    expect(interpolatePlaceholders('Hello {{ sender }}', { sender: 'Alice' })).toBe('Hello Alice');
  });

  it('collapses a known-but-empty value (e.g. an unissued reference number) to nothing', () => {
    expect(interpolatePlaceholders('Ref: {{referenceNumber}}', { referenceNumber: '' })).toBe('Ref: ');
  });

  it('leaves an unknown placeholder untouched rather than blanking it', () => {
    expect(interpolatePlaceholders('Value: {{unknown}}', { sender: 'Alice' })).toBe('Value: {{unknown}}');
  });
});

describe('CMS-005 — buildTemplateValues', () => {
  it('projects the form state onto the placeholder value map', () => {
    const values = buildTemplateValues(
      state({ sender: 'Alice', recipientNames: ['Bob', 'Carol'], subject: 'Budget', dateCreated: '2026-09-05' }),
      'Director'
    );
    expect(values).toEqual({
      sender: 'Alice',
      recipient: 'Bob; Carol',
      referenceNumber: '',
      date: '2026-09-05',
      subject: 'Budget',
      role: 'Director',
    });
  });

  it('leaves role empty when it cannot be resolved', () => {
    expect(buildTemplateValues(state()).role).toBe('');
  });
});

describe('CMS-005 — buildSignOff (AC12)', () => {
  it('auto-fills "Yours faithfully," + name + role when the role is known', () => {
    expect(buildSignOff('Alice Author', 'Director of Finance')).toBe(
      'Yours faithfully,<br/>Alice Author<br/>Director of Finance'
    );
  });

  it('omits the role line entirely when the role cannot be resolved', () => {
    expect(buildSignOff('Alice Author')).toBe('Yours faithfully,<br/>Alice Author');
    expect(buildSignOff('Alice Author', '   ')).toBe('Yours faithfully,<br/>Alice Author');
  });

  it('escapes HTML-significant characters in the name/role', () => {
    expect(buildSignOff('A & B <Ltd>')).toBe('Yours faithfully,<br/>A &amp; B &lt;Ltd&gt;');
  });
});

describe('CMS-005 — composePrintableDocument (AC15)', () => {
  it('assembles header, body, sign-off and footer in order', () => {
    const html = composePrintableDocument({
      header: 'OQ8',
      bodyHtml: '<p>Body</p>',
      signOff: 'Yours faithfully,<br/>Alice',
      footer: 'Internal Use',
      dir: 'ltr',
    });
    expect(html).toBe(
      '<article class="corms-document" dir="ltr">' +
        '<header class="corms-doc-header">OQ8</header>' +
        '<main class="corms-doc-body"><p>Body</p></main>' +
        '<section class="corms-doc-signoff">Yours faithfully,<br/>Alice</section>' +
        '<footer class="corms-doc-footer">Internal Use</footer>' +
        '</article>'
    );
  });

  it('omits empty regions but always keeps the body, and carries RTL direction', () => {
    const html = composePrintableDocument({ header: '  ', bodyHtml: '<p>مرحبا</p>', signOff: '', footer: '', dir: 'rtl' });
    expect(html).toBe('<article class="corms-document" dir="rtl"><main class="corms-doc-body"><p>مرحبا</p></main></article>');
  });
});
