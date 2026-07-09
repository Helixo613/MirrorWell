// Polyfills indexedDB globally BEFORE any module (schema.ts, storage.ts) can import it —
// schema.ts constructs the Dexie db singleton at module-load time.
import 'fake-indexeddb/auto';
