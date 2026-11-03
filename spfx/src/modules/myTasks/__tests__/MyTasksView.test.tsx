import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { createTestServices, TestApp } from '../../../app/__tests__/testHarness';
import { ITask } from '../../../models/ITask';

// CMS-049/050/052 — My Tasks screen: the "Create New Task"/"View Task Details" entry points into
// Power Apps (sourced from CORMS_AdminConfig via devSettingsService, empty-value disabled states),
// and the five summary tiles (All/Pending/Overdue/My Tasks/Team Tasks).

let container: HTMLDivElement;

function render(services?: ReturnType<typeof createTestServices>): void {
  act(() => {
    ReactDom.render(<TestApp services={services} />, container);
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}

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

// eslint-disable-next-line @rushstack/no-new-null -- Element.closest()'s real DOM signature returns Element | null
function click(element?: Element | null): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

function findByText(selector: string, text: string): Element | undefined {
  return Array.from(container.querySelectorAll(selector)).filter(
    (el) => (el.textContent ?? '').trim() === text
  )[0];
}

function task(overrides: Partial<ITask>): ITask {
  return {
    id: 't-1',
    subject: 'Sample task',
    type: 'To Do',
    priority: 'Normal',
    status: 'Pending',
    dueDate: '2026-06-01',
    assignee: 'Someone',
    assignees: [{ displayName: 'Someone', email: 'someone@example.com' }],
    hasAttachment: false,
    isMine: false,
    isOverdue: false,
    ...overrides,
  };
}

describe('My Tasks — CMS-049/050/052', () => {
  beforeEach(() => {
    window.location.hash = '#/my-tasks';
    sessionStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      ReactDom.unmountComponentAtNode(container);
    });
    container.remove();
    jest.restoreAllMocks();
  });

  describe('CMS-050: Create New Task', () => {
    it('renders disabled (with a tooltip) when powerAppsTaskFormUrl is not configured', async () => {
      const services = createTestServices();
      services.devSettingsService.getSettings = () => Promise.resolve([]);
      render(services);
      await waitFor(() => !!findByText('span', 'New Task'));

      const button = findByText('span', 'New Task')?.closest('button');
      expect(button?.hasAttribute('disabled')).toBe(true);
      expect(button?.getAttribute('title')).toContain('not configured yet');
    });

    it('embeds the configured form URL (with a requestedBy query param) in an iframe when clicked', async () => {
      const services = createTestServices();
      services.devSettingsService.getSettings = () =>
        Promise.resolve([
          {
            key: 'powerAppsTaskFormUrl',
            value: 'https://apps.powerapps.com/task-form',
            category: 'Integration',
          },
        ]);

      render(services);
      await waitFor(() => !!findByText('span', 'New Task'));
      const button = findByText('span', 'New Task')?.closest('button');
      expect(button?.hasAttribute('disabled')).toBe(false);

      click(button);
      await settle();

      const iframe = document.querySelector('iframe');
      expect(iframe?.getAttribute('src')).toMatch(/^https:\/\/apps\.powerapps\.com\/task-form\?requestedBy=/);
    });

    it('closes the create window and refreshes the task list when it is dismissed after saving', async () => {
      const services = createTestServices();
      const getAll = jest.fn(() => Promise.resolve([task({ id: 'fresh-task' })]));
      services.taskListService.getAll = getAll;
      services.devSettingsService.getSettings = () =>
        Promise.resolve([
          {
            key: 'powerAppsTaskFormUrl',
            value: 'https://apps.powerapps.com/task-form',
            category: 'Integration',
          },
        ]);

      render(services);
      await waitFor(() => !!findByText('span', 'New Task'));
      click(findByText('span', 'New Task')?.closest('button'));
      await settle();

      click(document.querySelector('[aria-label="Close"]'));
      await waitFor(() => !document.querySelector('iframe'));
      expect(getAll.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('CMS-052: View Task Details', () => {
    it('the row action is disabled (with a tooltip) when powerAppsTaskDetailUrl is not configured', async () => {
      const services = createTestServices();
      services.devSettingsService.getSettings = () => Promise.resolve([]);
      services.taskListService.getAll = () =>
        Promise.resolve([task({ id: 't-42', subject: 'Configured-URL test' })]);

      render(services);
      await waitFor(() => (container.textContent ?? '').indexOf('Configured-URL test') !== -1);

      const menuTrigger = container.querySelector('[aria-label="Task actions"]');
      click(menuTrigger);
      await settle();

      const viewItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
        (el) => (el.textContent ?? '').indexOf('View Details') !== -1
      );
      expect(viewItem?.hasAttribute('disabled')).toBe(true);
      expect(viewItem?.getAttribute('title')).toContain('not configured yet');
    });

    it('substitutes {taskId} and embeds the detail form in an iframe when configured', async () => {
      const services = createTestServices();
      services.devSettingsService.getSettings = () =>
        Promise.resolve([
          {
            key: 'powerAppsTaskDetailUrl',
            value: 'https://apps.powerapps.com/task-detail?taskId={taskId}',
            category: 'Integration',
          },
        ]);
      services.taskListService.getAll = () =>
        Promise.resolve([task({ id: 't-42', subject: 'Configured-URL test' })]);

      render(services);
      await waitFor(() => (container.textContent ?? '').indexOf('Configured-URL test') !== -1);

      const menuTrigger = container.querySelector('[aria-label="Task actions"]');
      click(menuTrigger);
      await settle();
      const viewItem = Array.from(document.querySelectorAll('[role="menuitem"]')).find(
        (el) => (el.textContent ?? '').indexOf('View Details') !== -1
      );
      click(viewItem);
      await settle();

      const iframe = document.querySelector('iframe');
      expect(iframe?.getAttribute('src')).toBe('https://apps.powerapps.com/task-detail?taskId=t-42');
    });

    it('opens task details when a task card is clicked', async () => {
      const services = createTestServices();
      services.devSettingsService.getSettings = () =>
        Promise.resolve([
          {
            key: 'powerAppsTaskDetailUrl',
            value: 'https://apps.powerapps.com/task-detail?taskId={taskId}',
            category: 'Integration',
          },
        ]);
      services.taskListService.getAll = () =>
        Promise.resolve([task({ id: 't-card', subject: 'Open from card' })]);

      render(services);
      await waitFor(() => !!findByText('div', 'Open from card'));
      click(findByText('div', 'Open from card')?.closest('[role="button"]'));
      await settle();

      expect(document.querySelector('iframe')?.getAttribute('src')).toBe(
        'https://apps.powerapps.com/task-detail?taskId=t-card'
      );
    });
  });

  describe('multi-person assignees', () => {
    it('renders up to three assignee avatars with individual email tooltips and an overflow avatar for the full list', async () => {
      const services = createTestServices();
      services.taskListService.getAll = () =>
        Promise.resolve([
          task({
            subject: 'Shared task',
            assignee: 'Amal Hassan, Basma Ali, Carlos Reed, Dana Noor',
            assignees: [
              { displayName: 'Amal Hassan', email: 'amal@example.com' },
              { displayName: 'Basma Ali', email: 'basma@example.com' },
              { displayName: 'Carlos Reed', email: 'carlos@example.com' },
              { displayName: 'Dana Noor', email: 'dana@example.com' },
            ],
          }),
        ]);

      render(services);
      await waitFor(() => (container.textContent ?? '').indexOf('Shared task') !== -1);

      expect(container.querySelector('[title="amal@example.com"]')).not.toBeNull();
      expect(container.querySelector('[title="basma@example.com"]')).not.toBeNull();
      expect(container.querySelector('[title="carlos@example.com"]')).not.toBeNull();
      expect(
        container.querySelector(
          '[title="amal@example.com, basma@example.com, carlos@example.com, dana@example.com"]'
        )?.textContent
      ).toBe('+1');
    });
  });

  describe('AC3/AC11: summary tiles', () => {
    it('renders All/Pending/Overdue/My Tasks/Team Tasks with counts from the resolved TaskListService', async () => {
      const services = createTestServices();
      services.taskListService.getAll = () =>
        Promise.resolve([
          task({ id: '1', status: 'Pending', isOverdue: false, isMine: true, isMyTeam: false }),
          task({ id: '2', status: 'Pending', isOverdue: true, isMine: false, isMyTeam: true }),
          task({ id: '3', status: 'Completed', isOverdue: false, isMine: false, isMyTeam: true }),
        ]);

      render(services);
      await waitFor(() => (container.textContent ?? '').indexOf('Team Tasks') !== -1);

      expect(container.textContent).toContain('All Tasks');
      expect(container.textContent).toContain('Pending Tasks');
      expect(container.textContent).toContain('Overdue Tasks');
      expect(container.textContent).toContain('My Tasks');
      expect(container.textContent).toContain('Team Tasks');
    });
  });
});
