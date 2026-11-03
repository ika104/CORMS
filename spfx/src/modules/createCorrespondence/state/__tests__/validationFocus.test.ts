import { firstInvalidField, focusFirstInvalidField, validationSection } from '../validationFocus';

describe('Create Correspondence validation focus', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('uses the form order rather than the error object order', () => {
    expect(firstInvalidField({ composeDocument: 'required', recipient: 'required' })).toBe('recipient');
    expect(validationSection({ composeDocument: 'required', recipient: 'required' })).toBe('coreMetadata');
  });

  it('sends an empty approval group error to the approval section, after the document', () => {
    expect(validationSection({ approvalWorkflow: 'required' })).toBe('approvalWorkflow');
    expect(validationSection({ approvalWorkflow: 'required', composeDocument: 'required' })).toBe(
      'composeDocument'
    );
  });

  it('scrolls and focuses the first invalid native field', () => {
    const subject = document.createElement('input');
    subject.dataset.validationField = 'subject';
    const scrollIntoView = jest.fn();
    subject.scrollIntoView = scrollIntoView;
    document.body.appendChild(subject);

    expect(focusFirstInvalidField({ subject: 'required', composeDocument: 'required' })).toBe(true);
    expect(document.activeElement).toBe(subject);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('routes classified-capture validation to the security custom widget', () => {
    const securityWidget = document.createElement('div');
    securityWidget.tabIndex = -1;
    securityWidget.dataset.validationField = 'securityTier';
    document.body.appendChild(securityWidget);

    expect(focusFirstInvalidField({ classifiedCapture: 'restricted' })).toBe(true);
    expect(document.activeElement).toBe(securityWidget);
  });

  it('does not move focus when no matching rendered control exists', () => {
    const existingFocus = document.createElement('button');
    document.body.appendChild(existingFocus);
    existingFocus.focus();

    expect(focusFirstInvalidField({ recipient: 'required' })).toBe(false);
    expect(document.activeElement).toBe(existingFocus);
  });
});
