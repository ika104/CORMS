import { IElasticSearchResult, IElasticService } from '../interfaces/IElasticService';
import { ICorrespondenceStub } from '../../models/ICorrespondence';
import { ITask } from '../../models/ITask';
import { parseSearchQuery } from '../../modules/search/searchQuery';
import { buildSnippet, correspondenceMatchesFilters } from './elasticQuery';
import correspondenceMock from '../../mocks/correspondence.json';
import tasksMock from '../../mocks/tasks.json';

const SIMULATED_LATENCY_MS = 200;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), SIMULATED_LATENCY_MS));
}

// TODO(confirm): correspondence has no dedicated "content"/body field in the mock model yet
// (CMS-026 — full-text/OCR search) — subject, reference number, department, sender and
// recipient stand in for full-text content until a real indexed body field exists.
function correspondenceHaystack(item: ICorrespondenceStub): string {
  return [item.subject, item.referenceNumber, item.department, item.senderName, item.recipientName, item.type]
    .filter(Boolean)
    .join(' ');
}

function matchesCorrespondenceTerm(item: ICorrespondenceStub, term: string): boolean {
  if (!term) return true;
  return correspondenceHaystack(item).toLowerCase().indexOf(term.toLowerCase()) !== -1;
}

function matchesTaskTerm(task: ITask, term: string): boolean {
  if (!term) return true;
  const haystack = `${task.subject} ${task.assignee}`.toLowerCase();
  return haystack.indexOf(term.toLowerCase()) !== -1;
}

function matchesTaskFilters(task: ITask, filters: Record<string, string>): boolean {
  if (filters.type && task.type !== filters.type) return false;
  if (filters.priority && task.priority !== filters.priority) return false;
  if (filters.status && task.status !== filters.status) return false;
  if (filters.assignee && task.assignee.toLowerCase().indexOf(filters.assignee.toLowerCase()) === -1) return false;
  return true;
}

// Mock stand-in for Elasticsearch (ds.search, D-05) — `query` carries a JSON-encoded
// {term, filters} payload built by searchQuery.ts (see its own TODO on the DSL mismatch with
// ElasticService.live.ts). Swap the binding in bootstrap.ts for the live transport once the
// real Elastic endpoint/index mapping exists.
export class ElasticServiceMock implements IElasticService {
  public search<T>(index: string, query: string): Promise<IElasticSearchResult<T>> {
    const { term, filters } = parseSearchQuery(query);

    if (index === 'tasks') {
      const items = (tasksMock as ITask[]).filter((task) => matchesTaskTerm(task, term) && matchesTaskFilters(task, filters));
      return delay({ total: items.length, items: items as unknown as T[] });
    }

    // CMS-026 AC3 — attach a snippet around the matched keyword (mock stand-in for the ES
    // highlight). Cloned, never mutating the imported seed rows, so it stays scoped to this search.
    const items = (correspondenceMock as ICorrespondenceStub[])
      .filter((item) => matchesCorrespondenceTerm(item, term) && correspondenceMatchesFilters(item, filters))
      .map((item) => {
        const snippet = buildSnippet(correspondenceHaystack(item), term);
        return snippet ? { ...item, searchSnippet: snippet } : item;
      });
    return delay({ total: items.length, items: items as unknown as T[] });
  }
}
