# AGENTS.md — Skill & Token Policy (portable)

Applies to any coding agent reading this file (Claude Code, Codex CLI, Cursor, others). Native/built-in skills and MCP tools are always allowed when they fit better. If a tool below is unavailable in the current environment, apply its principle manually (fallback column).

## Core loop

Think → locate cheaply → read minimally → patch surgically → validate compressed → summarize briefly.

## Discipline

Think before coding. Prefer simplicity; no unnecessary abstractions. Smallest safe change; never touch unrelated files. Preserve existing style, patterns, components. No new dependencies without justification. Verify before saying done.

## Tool routing — one lane per job, never stack overlapping tools

| Job | Tool | Fallback |
|---|---|---|
| Code structure, callers, impact radius, review context | code-review-graph MCP | trace imports manually |
| Precise symbol lookup, references, definitions | Serena MCP (LSP) | SymDex MCP, then `rg`/`fd` |
| Folder-level intent, constraints, pitfalls | nested AGENTS.md maps (Intent Layer) | read the folder's key file headers |
| Noisy shell output (build/test/lint/git/logs) | prefix commands with `rtk` | summarize only relevant lines |
| Large tool output, logs, JSON, web pages to analyze | context-mode (`ctx_batch_execute`, `ctx_execute`, `ctx_fetch_and_index` → `ctx_search`) | extract only needed lines |
| Session memory / prior decisions | context-mode `ctx_search` (timeline) | ask user |
| Context near limit / ending session | Handoff skill — structured handoff doc, not lossy compaction | write manual handoff notes before compacting |
| PDF/DOCX/PPTX/XLSX/CSV/HTML ingestion | `markitdown <file> -o out.md` | extract needed sections only |
| Frontend UI design reference | refero MCP — real-app patterns before building screens | frontend-design skill |
| Final implementation summary | Caveman format: Changed / Validated / Issues / Next | keep it short anyway |
| Tiny isolated low-risk polish | Ponytail | scope strictly |
| Pack repo for external model review | `repomix` | targeted file bundle |
| Periodic setup audit (configs, unused skills, ghost tokens) | Token Optimizer skill | manual /context review |

Navigation order: graph → Serena/SymDex → ripgrep. Never read whole directories, generated files, or lockfiles without cause.

## Workflow skills — load only when triggered

- Bug unclear, or one fix already failed → systematic-debugging.
- Complex core logic (parsing, state machines, business rules) → TDD.
- Pre-merge, risky, or security-sensitive change → code-review / security-review.
- Before claiming done → verification-before-completion.
- Multi-part independent work → dispatch parallel subagents; keep main thread lean.

## Risk rules

High risk (auth, payments, migrations, security, prod config, architecture): full reasoning, no Ponytail, no compressed reasoning, review skill mandatory. Caveman is for summaries only — never for architecture decisions, tradeoff analysis, or teaching.

## Validation & git

Run smallest relevant check first (`rtk npm test`, `rtk pytest`, ...). Never claim validation passed without running it; if it can't run, say why. No commit, push, or destructive commands unless explicitly instructed.

## Anti-patterns

Every skill on every task · loading broad context before searching · pasting huge logs · full-file dumps · broad refactors for small bugs · Ponytail on risky work · relying on lossy auto-compaction near context limit · skipping validation.

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
