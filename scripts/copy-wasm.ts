// scripts/copy-wasm.ts — bundles the @mediapipe/tasks-vision WASM runtime (docs/IMPLEMENTATION.md
// Task 4). MANDATORY: the package's own examples load this from a CDN via FilesetResolver;
// that breaks the no-network gate and the offline PWA. Copying it here lets
// FilesetResolver.forVisionTasks('/wasm') resolve same-origin instead.
// Wired to `postinstall` so public/wasm/ is always in sync with the installed package version.
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = join(import.meta.dirname, '..', 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const DEST_DIR = join(import.meta.dirname, '..', 'public', 'wasm');

export function copyWasm(): string[] {
  mkdirSync(DEST_DIR, { recursive: true });
  const files = readdirSync(SRC_DIR);
  for (const file of files) {
    copyFileSync(join(SRC_DIR, file), join(DEST_DIR, file));
  }
  return files;
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const files = copyWasm();
  console.log(`Copied ${files.length} WASM runtime file(s) to public/wasm/:`, files.join(', '));
}
