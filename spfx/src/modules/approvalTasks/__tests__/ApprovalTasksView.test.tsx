import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { createTestServices, TestApp } from '../../../app/__tests__/testHarness';
import { IApprovalInboxSource } from '../../../models/IApprovalInbox';

let container: HTMLDivElement;

async function waitFor(predicate: () => boolean, budgetMs = 5000): Promise<void> {
  const stepMs = 25;
  for (let waited = 0; waited <= budgetMs; waited += stepMs) {
    if (predicate()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, stepMs));
    });
  }
  throw new Error(`waitFor: condition not met within ${budgetMs}ms`);
}

const bodyText = (): string => document.body.textContent ?? '';

// The demo user (src/mocks/users.json) is the assignee of the first step, so it is theirs to act on.
const SOURCE: IApprovalInboxSource = {
  tasks: [
    {
      id: 'apt-1',
      correspondenceId: 'c-9',
      stepOrder: 1,
      stepType: 'Reviewer',
      stepName: 'Legal review',
      mode: 'All',
      requireSignature: true,
      status: 'Pending',
      assignedToId: 'i:0#.f|membership|zeyad.elmaghraby@gmail.com',
      assignedToName: 'Zeyad El Maghraby',
    },
  ],
  correspondences: [{ id: 'c-9', subject: 'Supplier contract renewal', referenceNumber: 'OQ8-LEG-LTR-26-0009' }],
};

describe('Approval Tasks', () => {
  beforeEach(() => {
    window.location.hash = '#/approval-tasks';
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      ReactDom.unmountComponentAtNode(container);
    });
    container.remove();
  });

  it('lists the approver\'s task and opens it with the decision actions', async () => {
    const services = createTestServices();
    services.approvalTaskService.getInbox = () => Promise.resolve(SOURCE);
    act(() => {
      ReactDom.render(<TestApp services={services} />, container);
    });

    await waitFor(() => bodyText().indexOf('Supplier contract renewal') !== -1);
    expect(bodyText()).toContain('Waiting for your action (1)');

    const card = Array.from(container.querySelectorAll('[role="button"]')).find(
      (el) => (el.textContent ?? '').indexOf('Supplier contract renewal') !== -1
    );
    act(() => {
      card?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    await waitFor(() => bodyText().indexOf('Approval progress') !== -1);
    const labels = Array.from(document.body.querySelectorAll('button')).map((b) => b.textContent ?? '');
    expect(labels).toEqual(expect.arrayContaining(['Approve', 'Reject', 'Return']));
  });
});
