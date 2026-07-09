// scripts/inspect-db.ts — dumps every mirrorwell_db table as JSON (docs/IMPLEMENTATION.md Task 2).
//
// PLATFORM NOTE (not obvious, worth stating): under plain Node, indexedDB is polyfilled by
// fake-indexeddb, which is IN-MEMORY per process. Running `npm run seed:dev` and then a
// SEPARATE `node ... inspect-db.ts` process will show an EMPTY database — the two processes
// don't share memory. That's why seed-dev.ts calls inspectDb() itself at the end, in the same
// process, to satisfy "seed then inspect-db shows 6 weeks of sessions" (Task 2 Test line).
// In the browser (via DebugHud, Task 8) IndexedDB is real and persists, so this constraint
// doesn't apply there — inspectDb() can be called standalone at any time.
import 'fake-indexeddb/auto';
import { db } from '../src/data/schema.ts';

export async function inspectDb(): Promise<Record<string, unknown[]>> {
  const dump: Record<string, unknown[]> = {};
  for (const table of db.tables) {
    dump[table.name] = await table.toArray();
  }
  return dump;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const dump = await inspectDb();
  console.log(JSON.stringify(dump, null, 2));
}
