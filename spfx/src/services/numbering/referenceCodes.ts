// TODO(confirm): code mapping is a mock convenience — the live RecordsHub numbering list
// (ds.numbering) is the source of truth once available (TASK-05 §5 observed pattern).
export const FUNCTION_CODES: Record<string, string> = {
  'Executive Affairs': 'CEO',
  'Operations Management': 'OPS',
  'Financial Control': 'FIN',
  'Legal Affairs': 'LEG',
  'Human Resources': 'HRS',
  'Information Technology': 'TSD',
  Sustainability: 'SUS',
  Procurement: 'PRC',
  'Internal Audit': 'AUD',
  'Corporate Communications': 'COM',
  'Health, Safety & Environment': 'HSE',
};

export const CONTENT_TYPE_CODES: Record<string, string> = {
  Letter: 'LTR',
  Memo: 'MEM',
  Report: 'RPT',
  Circular: 'CIR',
  Minutes: 'MIN',
  Resolution: 'RES',
  Notice: 'NOT',
  Contract: 'CTR',
};

export function toFunctionCode(name?: string): string {
  return (name && FUNCTION_CODES[name]) || 'GEN';
}

export function toContentTypeCode(name?: string): string {
  return (name && CONTENT_TYPE_CODES[name]) || 'DOC';
}
