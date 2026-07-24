// scripts/seed-dev.ts, Node CLI entrypoint for src/dev/seed.ts (docs/DATABASE.md §6).
// PLATFORM NOTE: 'fake-indexeddb/auto' is imported FIRST and ONLY here, never inside
// src/dev/seed.ts itself; that file is also imported directly by DebugHud in the browser
// (Task 8), where it must use the REAL IndexedDB, not this polyfill.
import 'fake-indexeddb/auto';
import { seedDev } from '../src/dev/seed.ts';
import { inspectDb } from '../src/dev/inspect.ts';

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  await seedDev();
  // fake-indexeddb is in-memory per-process: a separate `node inspect-db.ts` run afterwards
  // would see an empty database, so this script inspects in the same process (Task 2 Test line).
  console.log('Seeded mirrorwell_db (seed=42). Dumping via inspect-db in the same process:');
  console.log(JSON.stringify(await inspectDb(), null, 2));
}
