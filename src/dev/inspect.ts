// src/dev/inspect.ts — dumps every mirrorwell_db table as JSON (docs/IMPLEMENTATION.md Task 2).
// Browser-safe: no fake-indexeddb import, no `process` usage (see src/dev/seed.ts header for
// why that split matters — this file is reachable from DebugHud in the browser, Task 8).
import { db } from '../data/schema.ts';

export async function inspectDb(): Promise<Record<string, unknown[]>> {
  const dump: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    dump[table.name] = await table.toArray();
  }
  return dump;
}
