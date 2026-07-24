// tests/unit/no-exercise-branch.test.ts, Task A2 structural regression guard.
//
// Design contract (docs/IMPLEMENTATION.md Task 12 / plan Stream A task A2): exercise behaviour
// comes entirely from src/config/exercises.ts. No production code path may fork its CONTROL
// FLOW on a literal exercise id; if one is needed, the schema (ExerciseConfig) is wrong, not
// the code. This test greps the production src/ tree for exactly that shape: an equality/
// inequality comparison or a switch/case against a literal `'EX_...'` string.
//
// Matching rule and why it does not false-positive on legitimate, already-audited code:
//   - Only flags COMPARISON/BRANCH operators (===, !==, ==, !=, case) applied to an exercise-id
//     string literal; not every occurrence of the literal. This deliberately allows:
//       * src/data/schema.ts's `type ExerciseId = 'EX_BROW_RAISE' | ...` (a type union, no
//         comparison operator)
//       * src/data/storage.ts's `EXERCISE_IDS` array literal used for membership validation
//         (`.includes(ex)`, not per-id branching)
//       * src/config/exercises.ts and src/dev/** (excluded directories; config/exercises.ts IS
//         the config table itself, src/dev/** is a dev-only harness; both exempted by the task)
//   - Skips full-line comments (`//`, `*`, `/**` continuations) so prose that merely mentions an
//     exercise id (e.g. a comment discussing EX_PUCKER's open decision in metrics.ts) does not
//     trip the guard.
//   - Runs over every .ts/.tsx file under src/ except the excluded directories and *.test.ts(x)
//; no per-file allowlist, so a NEW per-exercise branch anywhere in production code fails
//     this test.
//
// Known gap (documented, not silently swept under the rug): this guard does not catch a
// lookup OBJECT keyed by literal exercise ids (e.g. `{ EX_SMILE: ..., EX_BROW_RAISE: ... }`)
// outside src/config; that shape has no `===`/`case` token to match, and a naive key-literal
// grep would false-positive on legitimate data tables (region→mesh maps in geometry.ts,
// validation arrays in storage.ts). None exist in src/ as of this task (verified by hand); a
// future one would need a human read, not a regex.
//
// Region-id literals ('REGION_BROW' etc.) were also searched by hand for the same
// comparison/switch shape (task A2 covers "exercise id or region id") and found clean; the
// only REGION_* occurrences outside src/config are src/metrics/geometry.ts's and
// src/metrics/normalize.ts's region→data lookup tables, iterated uniformly (`for (const
// region of REGION_IDS)`), not branched on. The guard itself stays scoped to exercise-id
// literals only, per the task brief.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '../../src');
// Excluded by absolute path (direct children of SRC_ROOT only); NOT by directory name at any
// depth, so a future src/session/config/ or src/metrics/dev/ is not silently exempted from the
// guard the way a name-only Set(['config', 'dev']) match would exempt it.
const EXCLUDED_DIRS = new Set([path.join(SRC_ROOT, 'config'), path.join(SRC_ROOT, 'dev')]);

const EXERCISE_ID_ALTERNATION = 'EX_(BROW_RAISE|EYE_CLOSURE|SMILE|PUCKER)';
const BRANCH_PATTERN = new RegExp(
  `(===|!==|==|!=)\\s*['"\`]${EXERCISE_ID_ALTERNATION}['"\`]` +
    `|['"\`]${EXERCISE_ID_ALTERNATION}['"\`]\\s*(===|!==|==|!=)` +
    `|case\\s+['"\`]${EXERCISE_ID_ALTERNATION}['"\`]`,
);

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(fullPath)) continue;
      out.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name)) {
      // Excludes src-colocated *.test.ts(x) too; this guard is scoped to the production
      // tree, not test code, which may legitimately assert against literal exercise ids.
      out.push(fullPath);
    }
  }
  return out;
}

function isCommentLine(trimmed: string): boolean {
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/**');
}

describe('no per-exercise branch outside src/config and src/dev', () => {
  // Self-verification: an empty `offenders` list is only meaningful if BRANCH_PATTERN can
  // actually match a real branch and actually ignores a real comment; otherwise a mistyped
  // regex would pass this test by matching nothing at all. These three lines pin that down.
  it('BRANCH_PATTERN matches real branches and ignores comments (guards the guard)', () => {
    expect(BRANCH_PATTERN.test("if (exerciseId === 'EX_SMILE') {")).toBe(true);
    expect(BRANCH_PATTERN.test("case 'EX_BROW_RAISE':")).toBe(true);
    expect(BRANCH_PATTERN.test("if ('EX_PUCKER' !== exerciseId) {")).toBe(true);
    expect(BRANCH_PATTERN.test("// EX_SMILE is the mouth exercise")).toBe(false);
    expect(BRANCH_PATTERN.test("type ExerciseId = 'EX_BROW_RAISE' | 'EX_SMILE';")).toBe(false);
  });

  it('contains no equality/switch branch keyed on a literal exercise id', () => {
    const offenders: string[] = [];
    for (const file of collectSourceFiles(SRC_ROOT)) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        const trimmed = line.trim();
        if (isCommentLine(trimmed)) return;
        if (BRANCH_PATTERN.test(line)) {
          offenders.push(`${path.relative(SRC_ROOT, file)}:${i + 1}: ${trimmed}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});
