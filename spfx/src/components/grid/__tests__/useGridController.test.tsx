import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ServiceProvider } from '../../../services/ServiceProvider';
import { createTestServices } from '../../../app/__tests__/testHarness';
import { useGridController, GridControllerState } from '../useGridController';

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  ReactDom.unmountComponentAtNode(container);
  container.remove();
});

function renderController(resultRef: { current: GridControllerState | undefined }): void {
  const Harness: React.FC = () => {
    const controller = useGridController({ gridId: 'test-grid', enableViewToggle: false });
    resultRef.current = controller;
    return null;
  };
  act(() => {
    ReactDom.render(
      <ServiceProvider services={createTestServices()}>
        <Harness />
      </ServiceProvider>,
      container
    );
  });
}

describe('CMS-044', () => {
  it('page-size change resets to page 1 (page 0, zero-indexed)', () => {
    const resultRef: { current: GridControllerState | undefined } = { current: undefined };
    renderController(resultRef);

    act(() => {
      resultRef.current?.setPage(3);
    });
    expect(resultRef.current?.page).toBe(3);

    act(() => {
      resultRef.current?.setPageSize(50);
    });

    expect(resultRef.current?.pageSize).toBe(50);
    expect(resultRef.current?.page).toBe(0);
  });
});
