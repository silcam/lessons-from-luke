# Output Format Reference

Structured output format for the code-review skill. This format is designed to be:

1. **Scannable in 30 seconds** for busy non-technical managers
2. **Problem-focused only** - never include praise or acknowledgment of what's done well
3. Parseable by the `/sp:review` command for beads issue creation
4. Consistent across all invocation environments

## CRITICAL Requirements

1. **Audience**: Write for non-technical managers using plain English (6th-grade reading level)
2. **Problem-focused**: Report problems only, never praise or positive feedback
3. **Concise**: 2-3 lines per finding maximum
4. **Copy-Paste Prompt**: ALWAYS include when findings exist (concise, 3-5 lines)
5. **Conditional Sections**: Only show sections that have problems
6. **Beads Tasks**: Create beads tasks for all findings under the current epic
7. **Parallel Reviews**: Invoke quality-review, security-review, and clean-architecture-validator in parallel

---

## Complete Output Template

````markdown
# Code Review: [Brief Description]

**Files**: [N] changed (+[A]/-[R] lines) | **Date**: [YYYY-MM-DD]

## Summary

[1-2 sentence overview - problems only, or "No issues found"]

---

## Findings

> Only show this section if findings exist. Group by severity.

### Critical

- [file.ts:45](#L45): [One-sentence problem]
  Fix: [Concise fix with code example if needed]

### High

- [file.ts:23](#L23): [One-sentence problem]
  Fix: [Concise fix]

### Medium

- [file.ts:67](#L67): [One-sentence problem]
  Fix: [Concise fix]

---

## Beads Tasks Created

> This section appears when beads tasks were created from findings.

The following tasks have been created under epic `[epic-id]`:

- `[task-id-1]`: Fix: [Finding 1 Title] (Priority: P0)
- `[task-id-2]`: Fix: [Finding 2 Title] (Priority: P1)

View tasks:

```bash
br show [epic-id] --json | jq '.[0].dependents'
```

> **Note**: If epic was closed, note "Epic `[epic-id]` was reopened to track these findings" appears here.

---

## Recommendations

> Only show this section if findings exist.

- **Must Fix**: [Critical/High items that block merge]
- **Should Fix**: [Medium items recommended before merge]
- **Consider**: [Low priority improvements]

---

## Copy-Paste Prompt for Claude Code

> REQUIRED when any findings exist. Concise, 3-5 lines maximum.

```
[Specific prompt with file:line references addressing all Must Fix and Should Fix items]
```

### Guidelines for Copy-Paste Prompts

- Specific file paths with line numbers (e.g., src/handler.ts:45)
- Prioritize by severity (Critical → High → Medium)
- Truly copy-paste ready - no placeholders
- Concise but complete (3-5 lines)
- Focus on actions, not problems

---

## Review Metadata

- **Reviewer**: Claude | **Changeset**: [Small|Medium|Large|Very Large] | **Findings**: [N] ([C]/[H]/[M]/[L])
````

---

## Compressed Finding Format

**OLD (7 fields, verbose):**

```markdown
### Finding: SQL Injection in Search Query

- **Severity**: Critical
- **Category**: security
- **File**: src/search/handler.ts
- **Line**: 45
- **Description**: The search feature directly inserts user input into database queries...
- **Risk**: Attackers could access, modify, or delete customer data...
- **Fix**: Use parameterized queries that safely separate user input...
```

**NEW (2-3 lines, scannable):**

```markdown
### Critical

- src/search/handler.ts:45: SQL injection - user input concatenated into query
  Fix: `db.prepare('SELECT * FROM items WHERE name LIKE ?').bind(searchTerm)`
```

---

## Finding Categories

| Category       | Description              | Examples                                          |
| -------------- | ------------------------ | ------------------------------------------------- |
| `security`     | Security vulnerabilities | SQL injection, XSS, auth bypass, secrets exposure |
| `test`         | Test quality issues      | Missing tests, flaky tests, wrong assertions      |
| `quality`      | Code quality problems    | Dead code, poor naming, high complexity           |
| `architecture` | Structural issues        | Layer violations, coupling, wrong patterns        |
| `performance`  | Performance concerns     | N+1 queries, memory leaks, blocking calls         |

---

## Severity Levels

| Level      | Criteria                                                   | Beads Priority | Action Required               |
| ---------- | ---------------------------------------------------------- | -------------- | ----------------------------- |
| `Critical` | Security vulnerability, data loss risk, production blocker | P0             | Fix immediately, blocks merge |
| `High`     | Significant bug, test gap, important pattern violation     | P1             | Fix before merge              |
| `Medium`   | Code smell, minor bug, improvement opportunity             | P2             | Should fix before merge       |
| `Low`      | Style issue, optional enhancement, documentation           | P3             | Consider fixing               |

---

## Parsing Rules for sp:review

The `/sp:review` command parses findings using these patterns:

### Detection Patterns for Compressed Format

```text
Severity Section: /^### (Critical|High|Medium|Low)$/
Finding Line:     /^- (.+?):(\d+): (.+)$/
  Captures: [file, line, description]
Fix Line:         /^\s+Fix: (.+)$/
```

### Legacy Format (Still Supported)

```text
Finding Start: /^### Finding: (.+)$/
Severity:      /^\- \*\*Severity\*\*: (Critical|High|Medium|Low)$/i
Category:      /^\- \*\*Category\*\*: (security|test|quality|architecture|performance)$/i
File:          /^\- \*\*File\*\*: (.+)$/
Line:          /^\- \*\*Line\*\*: (\d+)$/
Description:   /^\- \*\*Description\*\*: (.+)$/
Risk:          /^\- \*\*Risk\*\*: (.+)$/
Fix:           /^\- \*\*Fix\*\*: (.+)$/
```

### Duplicate Key

Findings are uniquely identified by: `{File}:{Line}:{Category}`

---

## Examples

### Clean Review (No Issues)

```markdown
# Code Review: Add user preferences endpoint

**Files**: 2 changed (+45/-10 lines) | **Date**: 2026-01-31

## Findings

No issues found. Ready to merge.

## Review Metadata

- **Reviewer**: Claude | **Changeset**: Small | **Findings**: 0
```

### Review with Findings

````markdown
# Code Review: Implement search feature

**Files**: 5 changed (+234/-12 lines) | **Date**: 2026-01-31

## Summary

Security and test coverage issues must be fixed before merge.

## Findings

### Critical

- src/search/handler.ts:45: SQL injection - user input concatenated into database query
  Fix: `db.prepare('SELECT * FROM items WHERE name LIKE ?').bind(searchTerm)`

### Medium

- src/search/handler.spec.ts:0: Missing test for empty search results
  Fix: Add test case verifying graceful handling of no results

## Beads Tasks Created

The following tasks have been created under epic `feat-search-123`:

- `task-001`: Fix: SQL injection in search handler (Priority: P0)
- `task-002`: Fix: Add empty results test (Priority: P2)

View tasks:

```bash
br show feat-search-123 --json | jq '.[0].dependents'
```

## Recommendations

- **Must Fix**: SQL injection (Critical)
- **Should Fix**: Empty results test case (Medium)

## Copy-Paste Prompt for Claude Code

```
Fix SQL injection in src/search/handler.ts:45 using parameterized queries.
Add test for empty search results in src/search/handler.spec.ts.
```

## Review Metadata

- **Reviewer**: Claude | **Changeset**: Medium | **Findings**: 2 (1 Critical, 1 Medium)
````

---

## Changeset Size Thresholds

| Size       | Line Count | Review Approach                        |
| ---------- | ---------- | -------------------------------------- |
| Small      | < 100      | Full detailed review                   |
| Medium     | 100-499    | Full review, prioritize complexity     |
| Large      | 500-999    | Thorough review, may chunk analysis    |
| Very Large | 1000+      | Summary mode, focus on high-risk files |

For very large changesets, include a note:

```markdown
> **Note**: This changeset exceeds 1000 lines. Review focuses on high-risk files.
> Consider splitting into smaller, focused pull requests for more thorough review.
```
