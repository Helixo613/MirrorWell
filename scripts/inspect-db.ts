// scripts/inspect-db.ts, Node CLI entrypoint for src/dev/inspect.ts (docs/IMPLEMENTATION.md Task 2).
// PLATFORM NOTE: 'fake-indexeddb/auto' is imported FIRST and ONLY here, never inside
// src/dev/inspect.ts itself; that file is also imported directly by DebugHud in the browser
// (Task 8), where IndexedDB is real and this polyfill must never be loaded.
import 'fake-indexeddb/auto';
import { inspectDb } from '../src/dev/inspect.ts';

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const dump = await inspectDb();
  console.log(JSON.stringify(dump, null, 2));
}
