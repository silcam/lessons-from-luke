# Solution Index

Solutions are organized by category. Each entry links to a detailed solution document.

## Categories

| Category              | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `cloudflare-workers/` | Runtime issues, D1/KV/R2 bindings, environment config |
| `test-coverage/`      | 100% coverage patterns, mocking, istanbul ignores     |
| `clean-architecture/` | Layer violations, dependency direction, DDD patterns  |
| `hugo-build/`         | Template issues, zero-warning policy, asset pipeline  |
| `type-safety/`        | Strict TS, ESLint rules, noUncheckedIndexedAccess     |
| `security/`           | Auth, headers, CSP, input validation                  |
| `performance/`        | Caching, query optimization, bundle size              |
| `tooling/`            | Build tools, pre-commit hooks, dependency conflicts   |

## Solutions

### tooling

- [ralph.sh Epic Detection Fails When Branch Uses Hyphens but Epic Title Uses Spaces](tooling/ralph-epic-detection-hyphens-vs-spaces.md) — `gsub("-"; " ")` normalizes branch hyphens before jq title match (2026-03-03)
- [Two Kinds of Remediation Tasks: Design Constraints vs Pre-Existing Code Fixes](tooling/remediation-task-classification.md) — findings for unwritten code belong in US story descriptions, not standalone tasks (2026-03-03)
- [Ralph ATDD Routing Blocks Acceptance-Spec-Only Tasks](tooling/ralph-atdd-routing-blocks-spec-only-tasks.md) — drop `US` prefix from spec-writing tasks so ralph doesn't route them to ATDD cycle (2026-03-27)
- [Spec-Kit Workflow Missing Acceptance Spec Phase](tooling/spec-kit-missing-acceptance-spec-phase.md) — sp:05-tasks must create acceptance spec files from GWT scenarios before implementation begins (2026-03-27)
- [Claude CLI Prompts Must Be Piped via stdin](tooling/claude-cli-stdin-piping.md) — long prompts exceed arg length limits; use spawn + stdin pipe, not execFile with -p arg (2026-03-31)
- [Model Returns Wrong Schema When Behavior Is Already Implemented](tooling/harness-model-schema-mismatch.md) — add explicit skip signal to RED schema so model can say "nothing to do" within expected shape (2026-03-31)
- [Harness-Driven TDD Enables Smaller Models](tooling/harness-driven-tdd-architecture.md) — constrain each model call to one micro-step with typed schema + oracle; Sonnet replaces Opus (2026-03-31)
