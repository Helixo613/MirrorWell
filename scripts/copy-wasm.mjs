import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const target = join(root, 'public', 'wasm');

if (!existsSync(source)) {
  console.warn('copy-wasm: @mediapipe/tasks-vision wasm not found — run npm install');
  process.exit(0);
}

mkdirSync(target, { recursive: true });
for (const file of readdirSync(source)) {
  cpSync(join(source, file), join(target, file), { force: true });
}

console.log('copy-wasm: copied MediaPipe WASM runtime to public/wasm/');
