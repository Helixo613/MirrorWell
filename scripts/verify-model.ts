// scripts/verify-model.ts, hash-verifies the model AND every bundled WASM runtime file
// against models.lock.json (docs/IMPLEMENTATION.md Task 4). Wired to `postinstall`, after
// copy-wasm.ts. Fails loudly (non-zero exit) on any missing, corrupted, or unexpected file
// this is the integrity backstop for assets that are never re-fetched at runtime.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const MODEL_PATH = join(ROOT, 'public', 'models', 'face_landmarker.task');
const WASM_DIR = join(ROOT, 'public', 'wasm');
const LOCK_PATH = join(ROOT, 'models.lock.json');

function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function collectFiles(): Record<string, string> {
  const files: Record<string, string> = {
    'public/models/face_landmarker.task': sha256(MODEL_PATH),
  };
  for (const name of readdirSync(WASM_DIR).sort()) {
    files[`public/wasm/${name}`] = sha256(join(WASM_DIR, name));
  }
  return files;
}

export function verifyModel(): void {
  if (!existsSync(LOCK_PATH)) {
    throw new Error('models.lock.json missing; run `node scripts/verify-model.ts --write` to generate it first');
  }
  const expected = JSON.parse(readFileSync(LOCK_PATH, 'utf8')) as Record<string, string>;
  const actual = collectFiles();
  const mismatches: string[] = [];

  for (const [file, expectedHash] of Object.entries(expected)) {
    const actualHash = actual[file];
    if (!actualHash) {
      mismatches.push(`${file}: MISSING`);
    } else if (actualHash !== expectedHash) {
      mismatches.push(`${file}: hash mismatch (expected ${expectedHash}, got ${actualHash})`);
    }
  }
  for (const file of Object.keys(actual)) {
    if (!(file in expected)) {
      mismatches.push(`${file}: unexpected file not present in models.lock.json`);
    }
  }

  if (mismatches.length > 0) {
    throw new Error(`Model/runtime integrity check FAILED:\n${mismatches.join('\n')}`);
  }
}

export function writeLock(): void {
  writeFileSync(LOCK_PATH, JSON.stringify(collectFiles(), null, 2) + '\n');
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  if (process.argv.includes('--write')) {
    writeLock();
    console.log(`Wrote ${LOCK_PATH}`);
  } else {
    try {
      verifyModel();
      console.log('Model and WASM runtime integrity verified.');
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  }
}
