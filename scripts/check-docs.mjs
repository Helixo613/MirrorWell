#!/usr/bin/env node
/**
 * check-docs.mjs, lightweight doc integrity gate (Task A4).
 *
 * Fails if:
 *  (1) A PascalCase type in ARCHITECTURE.md §12 "Metrics & types" glossary
 *      lacks a definition in §13 (or an explicit DATABASE ownership note /
 *      API error-model note for row types / MirrorWellError).
 *  (2) An obvious `§n` cross-reference in docs/*.md targets a missing section
 *      in the resolved doc file.
 *
 * Not perfect NLP, catches the common breakage modes.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');

const errors = [];
const warnings = [];

function read(p) {
  return fs.readFileSync(p, 'utf8');
}

function listDocFiles() {
  return fs
    .readdirSync(DOCS)
    .filter((f) => f.endsWith('.md') && !f.startsWith('.'))
    .map((f) => path.join(DOCS, f));
}

/** Map short aliases → canonical filename */
const DOC_ALIASES = {
  ARCHITECTURE: 'ARCHITECTURE.md',
  'ARCHITECTURE.md': 'ARCHITECTURE.md',
  API: 'API.md',
  'API.md': 'API.md',
  BACKEND: 'BACKEND.md',
  'BACKEND.md': 'BACKEND.md',
  DATABASE: 'DATABASE.md',
  'DATABASE.md': 'DATABASE.md',
  FRONTEND: 'FRONTEND.md',
  'FRONTEND.md': 'FRONTEND.md',
  MODEL_AND_DATA: 'MODEL_AND_DATA.md',
  'MODEL_AND_DATA.md': 'MODEL_AND_DATA.md',
  SAFETY: 'SAFETY_AND_COMPLIANCE.md',
  SAFETY_AND_COMPLIANCE: 'SAFETY_AND_COMPLIANCE.md',
  'SAFETY_AND_COMPLIANCE.md': 'SAFETY_AND_COMPLIANCE.md',
  TESTS: 'TESTS.md',
  'TESTS.md': 'TESTS.md',
  IMPLEMENTATION: 'IMPLEMENTATION.md',
  'IMPLEMENTATION.md': 'IMPLEMENTATION.md',
  README: 'README.md',
  'README.md': 'README.md',
};

/**
 * Extract section numbers present in a markdown file.
 * Matches:
 *   ## 7. Title
 *   ## 13. Title
 *   ### 1.4 Title
 *   ### 3.1 Title
 *   ### 5.1 Title
 * Parent numbers are always implied when a child exists.
 */
function extractSections(md) {
  const sections = new Set();
  const lines = md.split(/\r?\n/);
  for (const line of lines) {
    // ## N. or ### N.M.  (optional trailing title)
    const m = line.match(/^#{2,3}\s+(\d+(?:\.\d+)*)\b/);
    if (m) {
      const full = m[1];
      sections.add(full);
      // add parents: 1.4 → 1 ; 3.1 → 3
      const parts = full.split('.');
      for (let i = 1; i < parts.length; i++) {
        sections.add(parts.slice(0, i).join('.'));
      }
    }
  }
  return sections;
}

function sectionExists(sections, ref) {
  if (sections.has(ref)) return true;
  // Bare §4.6 often means "section 4, step 6" not a subsection header
  // accept if the top-level section exists.
  const top = ref.split('.')[0];
  if (sections.has(top)) return true;
  return false;
}

// ── (1) Glossary types ↔ §13 ───────────────────────────────────────────────

const archPath = path.join(DOCS, 'ARCHITECTURE.md');
const arch = read(archPath);

// Slice §12 and §13 bodies
function sliceSection(md, n) {
  const reStart = new RegExp(`^## ${n}\\b.*$`, 'm');
  const startMatch = md.match(reStart);
  if (!startMatch) return null;
  const startIdx = startMatch.index;
  const rest = md.slice(startIdx + startMatch[0].length);
  const next = rest.match(/^## \d+\b/m);
  const body = next ? rest.slice(0, next.index) : rest;
  return body;
}

const sec12 = sliceSection(arch, 12);
const sec13 = sliceSection(arch, 13);

if (!sec12) errors.push('ARCHITECTURE.md: missing ## 12 (glossary)');
if (!sec13) errors.push('ARCHITECTURE.md: missing ## 13 (canonical type definitions)');

if (sec12 && sec13) {
  // Find the Metrics & types row cell contents
  const metricsRow = sec12
    .split('\n')
    .find((l) => /Metrics\s*&\s*types/i.test(l));

  if (!metricsRow) {
    errors.push('ARCHITECTURE.md §12: could not find "Metrics & types" glossary row');
  } else {
    // PascalCase identifiers inside backticks
    const types = [...metricsRow.matchAll(/`([A-Z][A-Za-z0-9]+)`/g)].map((m) => m[1]);
    const unique = [...new Set(types)];

    // Row types owned by DATABASE.md §2. §13 states they are not duplicated.
    // MirrorWellError is the API §1 error envelope (name field), not a §13 pipeline type.
    const DATABASE_OWNED = new Set([
      'UserProfile',
      'CalibrationBaseline',
      'SessionRecord',
      'ExerciseResult',
      'RepMetric',
      'AppSettings',
    ]);
    const API_OWNED = new Set(['MirrorWellError']);

    for (const t of unique) {
      if (DATABASE_OWNED.has(t)) {
        // Require §13 to mention DATABASE ownership so the exemption is documented
        if (!/DATABASE\.md\s*§?2|owned by `?DATABASE/i.test(sec13)) {
          errors.push(
            `ARCHITECTURE.md §12 type \`${t}\` is DATABASE-owned but §13 does not note DATABASE ownership`,
          );
        }
        continue;
      }
      if (API_OWNED.has(t)) {
        // Accept if API.md documents the name
        const api = read(path.join(DOCS, 'API.md'));
        if (!api.includes('MirrorWellError')) {
          errors.push(`§12 type \`${t}\` not found in API.md error model`);
        }
        continue;
      }

      // Defined in §13 as type X / interface X / in a code fence as `type X =` etc.
      const defined =
        new RegExp(`\\b(?:type|interface)\\s+${t}\\b`).test(sec13) ||
        new RegExp('`' + t + '`').test(sec13) ||
        new RegExp(`\\b${t}\\s*=`).test(sec13);

      if (!defined) {
        errors.push(
          `ARCHITECTURE.md §12 glossary type \`${t}\` has no definition in §13 (expected \`type ${t}\` / \`interface ${t}\` or code-block mention)`,
        );
      }
    }
  }

  // Reverse direction: every type/interface declared in §13 must appear in the
  // §12 glossary; a §13-only type is an invented identifier.
  const declared = [...sec13.matchAll(/^\s*(?:export\s+)?(?:type|interface)\s+([A-Z][A-Za-z0-9]+)\b/gm)].map(
    (m) => m[1],
  );
  for (const t of new Set(declared)) {
    if (!new RegExp('`' + t + '`').test(sec12)) {
      errors.push(
        `ARCHITECTURE.md §13 declares \`${t}\` but §12 glossary does not list it (no identifier may exist outside §12)`,
      );
    }
  }
}

// ── (2) Cross-references ───────────────────────────────────────────────────

/**
 * Patterns:
 *  - ARCHITECTURE.md §13
 *  - ARCHITECTURE §7
 *  - API.md §6
 *  - SAFETY §8
 *  - DATABASE §3
 *  - BACKEND §1.4
 *  - MODEL_AND_DATA §5
 *  - bare §12 (same-file)
 *
 * Skip: IMPLEMENTATION Task N, "§" inside code fences (approximate).
 */
const fileCache = new Map();
function sectionsFor(filename) {
  if (fileCache.has(filename)) return fileCache.get(filename);
  const p = path.join(DOCS, filename);
  if (!fs.existsSync(p)) {
    fileCache.set(filename, null);
    return null;
  }
  const secs = extractSections(read(p));
  fileCache.set(filename, secs);
  return secs;
}

const DOC_REF_RE =
  /\b(ARCHITECTURE|API|BACKEND|DATABASE|FRONTEND|MODEL_AND_DATA|SAFETY(?:_AND_COMPLIANCE)?|TESTS|IMPLEMENTATION|README)(?:\.md)?\s*§\s*(\d+(?:\.\d+)*)\b/g;

const BARE_SEC_RE = /(?<![\w.])§\s*(\d+(?:\.\d+)*)\b/g;

for (const filePath of listDocFiles()) {
  const base = path.basename(filePath);
  // Skip long historical plans under docs/superpowers and handoffs; not canonical
  if (filePath.includes(`${path.sep}superpowers${path.sep}`)) continue;
  if (filePath.includes(`${path.sep}handoffs${path.sep}`)) continue;

  const text = read(filePath);
  // Strip fenced code blocks so § inside examples is not validated as a ref
  const stripped = text.replace(/```[\s\S]*?```/g, (block) => block.replace(/§/g, ' S '));

  // Named doc refs
  for (const m of stripped.matchAll(DOC_REF_RE)) {
    const alias = m[1];
    const num = m[2];
    const targetName = DOC_ALIASES[alias] || DOC_ALIASES[`${alias}.md`];
    if (!targetName) {
      errors.push(`${base}: unknown doc alias in ref "${m[0]}"`);
      continue;
    }
    const secs = sectionsFor(targetName);
    if (!secs) {
      errors.push(`${base}: ref "${m[0]}" → missing file docs/${targetName}`);
      continue;
    }
    if (!sectionExists(secs, num)) {
      errors.push(
        `${base}: ref "${m[0]}" → docs/${targetName} has no section §${num} (found: ${[...secs].sort().join(', ') || 'none'})`,
      );
    }
  }

  // Bare §n, resolve against the current file only
  // Avoid double-counting positions already covered by DOC_REF_RE by
  // blanking those spans first.
  let bareSource = stripped;
  bareSource = bareSource.replace(DOC_REF_RE, (s) => ' '.repeat(s.length));
  // Also blank SAFETY §N style already handled; and "per §" etc. still ok

  const currentName = base;
  const currentSecs = sectionsFor(currentName);
  if (!currentSecs) continue;

  for (const m of bareSource.matchAll(BARE_SEC_RE)) {
    const num = m[1];
    // Skip very large numbers that aren't section refs (e.g. none expected)
    if (Number(num.split('.')[0]) > 30) continue;
    if (!sectionExists(currentSecs, num)) {
      // Bare § often means ARCHITECTURE in other docs when the number is
      // a well-known glossary/math section. Try ARCHITECTURE as fallback
      // only when current file has no such section.
      const archSecs = sectionsFor('ARCHITECTURE.md');
      if (archSecs && sectionExists(archSecs, num) && currentName !== 'ARCHITECTURE.md') {
        // Ambiguous but resolvable, warn only (many prose refs omit the doc name)
        warnings.push(
          `${base}: bare "§${num}" not in this file; exists in ARCHITECTURE.md (allowed)`,
        );
        continue;
      }
      errors.push(
        `${base}: bare ref "§${num}"; no matching section in ${currentName}` +
          (archSecs && sectionExists(archSecs, num) ? '' : ' or ARCHITECTURE.md'),
      );
    }
  }
}

// ── Report ─────────────────────────────────────────────────────────────────

if (warnings.length) {
  console.log(`check-docs: ${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  ⚠ ${w}`);
}

if (errors.length) {
  console.error(`check-docs: FAILED with ${errors.length} error(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}

console.log('check-docs: OK');
process.exit(0);
