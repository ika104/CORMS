import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act, Simulate } from 'react-dom/test-utils';
import { ApprovalDecisionModal } from '../ApprovalDecisionModal';
import { ApprovalDecision, IApprovalTask } from '../../../../models/IApprovalTask';

const TASK: IApprovalTask = {
  id: 't-1',
  correspondenceId: 'c-1',
  stepOrder: 1,
  stepType: 'Reviewer',
  stepName: 'Abdullah Reda',
  mode: 'All',
  requireSignature: true,
  status: 'Pending',
};

describe('ApprovalDecisionModal — in-app signing', () => {
  let container: HTMLDivElement;

  function render(
    onCheck: (externalDocumentId: string) => Promise<boolean>,
    onRequest: () => Promise<{ externalDocumentId: string; signingUrl: string }> = () =>
      Promise.resolve({ externalDocumentId: 'ext-1', signingUrl: 'https://sign.example/page' }),
    options: {
      task?: IApprovalTask;
      outcome?: ApprovalDecision;
      onConfirm?: (comment: string) => Promise<void> | void;
    } = {}
  ): void {
    act(() => {
      ReactDom.render(
        <ApprovalDecisionModal
          isOpen
          task={options.task ?? TASK}
          outcome={options.outcome ?? 'Approved'}
          title="Approve"
          confirmText="Approve"
          onRequestSignature={onRequest}
          onCheckSignatureCompletion={onCheck}
          onDismiss={() => undefined}
          onConfirm={options.onConfirm ?? (() => undefined)}
        />,
        container
      );
    });
  }

  function clickButton(label: string): void {
    const button = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === label);
    if (!button) throw new Error(`No button labelled ${label}`);
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  const buttonLabels = (): string[] =>
    Array.from(document.body.querySelectorAll('button')).map((b) => b.textContent ?? '');

  async function signAndClose(): Promise<void> {
    await act(async () => {
      clickButton('correspondenceDetail.approvals.signatureAction');
      await Promise.resolve();
    });
    expect(document.body.querySelector('iframe')?.getAttribute('src')).toBe('https://sign.example/page');
    act(() => clickButton('correspondenceDetail.eSignature.done'));
  }

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      ReactDom.unmountComponentAtNode(container);
    });
    container.remove();
  });

  it('shows the signing page in the app and checks the signature when it is closed', async () => {
    const onCheck = jest.fn().mockResolvedValue(true);
    render(onCheck);
    await signAndClose();
    await act(() => Promise.resolve());

    expect(document.body.querySelector('iframe')).toBeNull();
    expect(onCheck).toHaveBeenCalledWith('ext-1');
  });

  it('shows only a checking status while verifying, then both actions if the document is not signed yet', async () => {
    let finishCheck: (completed: boolean) => void = () => undefined;
    render(() => new Promise<boolean>((resolve) => (finishCheck = resolve)));
    await signAndClose();

    expect(document.body.textContent).toContain('correspondenceDetail.approvals.signatureChecking');
    expect(buttonLabels()).not.toContain('correspondenceDetail.approvals.signatureReopen');
    expect(buttonLabels()).not.toContain('correspondenceDetail.approvals.signatureCheckAction');

    await act(async () => {
      finishCheck(false);
      await Promise.resolve();
    });
    expect(document.body.textContent).toContain('correspondenceDetail.approvals.signaturePending');
    expect(buttonLabels()).toEqual(
      expect.arrayContaining([
        'correspondenceDetail.approvals.signatureReopen',
        'correspondenceDetail.approvals.signatureCheckAction',
      ])
    );
  });

  it('shows a loader in place of the button until the signing page opens', async () => {
    let openPage: () => void = () => undefined;
    render(
      () => Promise.resolve(true),
      () =>
        new Promise((resolve) => {
          openPage = () => resolve({ externalDocumentId: 'ext-3', signingUrl: 'https://sign.example/page' });
        })
    );

    act(() => clickButton('correspondenceDetail.approvals.signatureAction'));
    expect(document.body.textContent).toContain('correspondenceDetail.approvals.signatureSending');
    expect(buttonLabels()).not.toContain('correspondenceDetail.approvals.signatureAction');
    expect(document.body.querySelector('iframe')).toBeNull();

    await act(async () => {
      openPage();
      await Promise.resolve();
    });
    expect(document.body.querySelector('iframe')?.getAttribute('src')).toBe('https://sign.example/page');
    expect(document.body.textContent).not.toContain('correspondenceDetail.approvals.signatureSending');
  });

  it('shows a loader and prevents another decision while saving', async () => {
    let finishSave: () => void = () => undefined;
    const onConfirm = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          finishSave = resolve;
        })
    );
    render(() => Promise.resolve(true), undefined, {
      task: { ...TASK, requireSignature: false },
      onConfirm,
    });

    const textarea = document.body.querySelector('textarea') as HTMLTextAreaElement;
    act(() => {
      Simulate.change(textarea, { target: { value: 'Approved with comment' } as unknown as EventTarget });
    });
    act(() => clickButton('Approve'));

    expect(onConfirm).toHaveBeenCalledWith('Approved with comment');
    expect(document.body.textContent).toContain('approvalTasks.modal.savingDecision');
    expect(textarea.disabled).toBe(true);
    expect(buttonLabels().filter((label) => label === 'Approve')).toHaveLength(1);

    await act(async () => {
      finishSave();
      await Promise.resolve();
    });
  });
});
