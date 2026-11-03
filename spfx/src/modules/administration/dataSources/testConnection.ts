export interface IConnectionTestResult {
  ok: boolean;
  count?: number;
  message?: string;
}

// Best-effort DEV connectivity probe — plain fetch with the browser's ambient session
// (same-origin/SharePoint auth cookie), independent of whichever service instance the
// mock/live toggle currently resolves to, so a feature can be verified *before* flipping it live.
export async function testSpRestConnection(siteUrl: string, listName?: string): Promise<IConnectionTestResult> {
  if (!siteUrl) {
    return { ok: false, message: 'No site URL configured' };
  }
  const url = listName
    ? `${siteUrl}/_api/web/lists/getbytitle('${listName}')/items?$top=1`
    : `${siteUrl}/_api/web`;
  try {
    const response = await fetch(url, {
      credentials: 'include',
      headers: { Accept: 'application/json;odata=nometadata' },
    });
    if (!response.ok) {
      return { ok: false, message: `${response.status} ${response.statusText}` };
    }
    if (!listName) {
      return { ok: true };
    }
    const body = (await response.json()) as { value: unknown[] };
    return { ok: true, count: body.value.length };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error' };
  }
}

export async function testElasticConnection(elasticUrl: string | undefined): Promise<IConnectionTestResult> {
  if (!elasticUrl) {
    return { ok: false, message: 'No Elastic URL configured' };
  }
  try {
    const response = await fetch(`${elasticUrl}/_cluster/health`, { credentials: 'include' });
    return response.ok ? { ok: true } : { ok: false, message: `${response.status} ${response.statusText}` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error' };
  }
}
