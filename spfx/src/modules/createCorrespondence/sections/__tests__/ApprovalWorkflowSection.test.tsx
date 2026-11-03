import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ServiceProvider } from '../../../../services/ServiceProvider';
import { createTestServices } from '../../../../app/__tests__/testHarness';
import { ApprovalWorkflowSection } from '../ApprovalWorkflowSection';
import { IUseCreateCorrespondenceForm, useCreateCorrespondenceForm } from '../../state/useCreateCorrespondenceForm';

const PEOPLE = [
  { id: 'u-1', name: 'Yahya Mohamed', email: 'yahya@example.com' },
  { id: 'u-2', name: 'Layla Hassan', email: 'layla@example.com' },
];

describe('ApprovalWorkflowSection — groups', () => {
  let container: HTMLDivElement;
  let form: IUseCreateCorrespondenceForm | undefined;

  const Harness: React.FC = () => {
    form = useCreateCorrespondenceForm('');
    return <ApprovalWorkflowSection form={form} showPresets={false} />;
  };

  function click(label: string): void {
    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes(label));
    if (!button) throw new Error(`No button labelled ${label}`);
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    const services = createTestServices();
    services.sharePointService = { ...services.sharePointService, searchPeople: () => Promise.resolve(PEOPLE) };
    act(() => {
      ReactDom.render(
        <ServiceProvider services={services}>
          <Harness />
        </ServiceProvider>,
        container
      );
    });
  });

  afterEach(() => {
    act(() => {
      ReactDom.unmountComponentAtNode(container);
    });
    container.remove();
    jest.useRealTimers();
  });

  it('adds an empty group, then fills it from a multi-select people picker', async () => {
    click('createCorrespondence.approval.addGroup');
    click('createCorrespondence.approval.addNewGroup');

    const group = form!.state.approvalSteps[0];
    expect(group).toMatchObject({ kind: 'group', memberIds: [] });
    expect(container.textContent).toContain('createCorrespondence.approval.groupMembersRequired');

    click('createCorrespondence.approval.addMember');
    await act(async () => {
      jest.advanceTimersByTime(250);
      await Promise.resolve();
    });
    click('Yahya Mohamed');
    click('Layla Hassan');

    expect(form!.state.approvalSteps[0]).toMatchObject({
      kind: 'group',
      memberIds: ['u-1', 'u-2'],
      memberNames: ['Yahya Mohamed', 'Layla Hassan'],
    });
    // Picking a member keeps the picker open for the next one; picking again removes them.
    click('Layla Hassan');
    expect(form!.state.approvalSteps[0]).toMatchObject({ memberIds: ['u-1'] });
  });
});
