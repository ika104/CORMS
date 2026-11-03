import * as React from 'react';
import * as ReactDom from 'react-dom';
import { act } from 'react-dom/test-utils';
import { ServiceProvider } from '../../../services/ServiceProvider';
import { createTestServices } from '../../../app/__tests__/testHarness';
import { useServerGrid, IUseServerGridResult } from '../useServerGrid';

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  ReactDom.unmountComponentAtNode(container);
  container.remove();
});

function renderHook(
  resultRef: { current: IUseServerGridResult<number> | undefined },
  queryFn: () => Promise<number[]>,
  cacheKey: string
): void {
  const Harness: React.FC = () => {
    const result = useServerGrid<number>({ cacheNamespace: 'test.useServerGrid', cacheKey, queryFn, deps: [cacheKey] });
    resultRef.current = result;
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

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('CMS-044', () => {
  it('fetches rows on mount via queryFn', async () => {
    const queryFn = jest.fn(() => Promise.resolve([1, 2, 3]));
    const resultRef: { current: IUseServerGridResult<number> | undefined } = { current: undefined };

    renderHook(resultRef, queryFn, 'key-a');
    await flush();

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(resultRef.current?.rows).toEqual([1, 2, 3]);
    expect(resultRef.current?.loading).toBe(false);
  });

  it('AC6: refresh() genuinely re-queries — the underlying fetch is actually called again, not just a re-render', async () => {
    const queryFn = jest.fn(() => Promise.resolve([1, 2, 3]));
    const resultRef: { current: IUseServerGridResult<number> | undefined } = { current: undefined };

    renderHook(resultRef, queryFn, 'key-b');
    await flush();
    expect(queryFn).toHaveBeenCalledTimes(1);

    act(() => {
      resultRef.current?.refresh();
    });
    await flush();

    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it('changing the cache key (e.g. a filter change) triggers a fresh fetch', async () => {
    const queryFn = jest.fn(() => Promise.resolve([1]));
    const resultRef: { current: IUseServerGridResult<number> | undefined } = { current: undefined };

    renderHook(resultRef, queryFn, 'key-c1');
    await flush();
    expect(queryFn).toHaveBeenCalledTimes(1);

    renderHook(resultRef, queryFn, 'key-c2');
    await flush();

    expect(queryFn).toHaveBeenCalledTimes(2);
  });
});
