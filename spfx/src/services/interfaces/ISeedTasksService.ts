export interface ISeedTasksResult {
  inserted: number;
  skippedExisting: number;
  total: number;
}

/** "Seed Sample Tasks" (Part 5) — a standalone concern from IProvisioningService, which only ever
 * creates schema, never sample data. See src/scripts/seedTasksCore.ts. */
export interface ISeedTasksService {
  run(): Promise<ISeedTasksResult>;
}
