# Review Sections Reference

Detailed guidance for each section of the code review output.

## Review Orchestration

The code-review skill acts as an **orchestrator** that:

1. Gets code changes based on scope
2. Detects the current epic from the git branch
3. Invokes three specialized review subagents **in parallel**
4. Collects and deduplicates findings
5. Creates beads tasks for each finding
6. Generates a consolidated report

The skill does NOT perform reviews directly - it delegates to specialized subagents.

---

## 1. What Changed

**Purpose**: Help non-technical stakeholders understand the changes.

### Content Guidelines

- Write in plain English, avoiding jargon
- Focus on functionality and user-facing impact
- Explain the "why" behind changes
- Summarize in 2-3 bullet points for quick scanning

### Good Examples

```markdown
## What Changed

- Added a new endpoint for users to update their profile picture
- Fixed a bug where checkout would fail when cart items exceeded 100
- Improved page load speed by lazy-loading product images
```

### Bad Examples

```markdown
## What Changed

- Refactored UserController to use dependency injection
- Added try-catch blocks to async handlers
- Updated TypeScript types for the Cart interface
```

The bad examples focus on technical implementation rather than user value.

---

## 2. Does It Work

**Purpose**: Assess correctness, testing, and production-readiness.

**Audience**: Non-technical managers - explain in business terms.

### Evaluation Criteria

| Aspect               | Questions to Answer                                                 |
| -------------------- | ------------------------------------------------------------------- |
| **Tests**            | Are there tests? Do they cover the happy path and edge cases?       |
| **Safety**           | Error handling present? Validation of inputs? Graceful degradation? |
| **Production Ready** | Logging in place? Performance acceptable? Dependencies secure?      |

### Output Format (Non-Technical Language)

```markdown
## Does It Work

- **Tests**: The changes include automated tests that verify the new functionality works correctly in different scenarios
- **Safety**: The code handles errors gracefully and shows helpful messages when things go wrong
- **Production Ready**: Yes, includes proper logging for troubleshooting and won't slow down the system
```

### Good Examples (Plain English)

```markdown
## Does It Work

- **Tests**: Yes - includes tests that verify login works, handles wrong passwords, and prevents lockouts
- **Safety**: Good - validates all user inputs and shows clear error messages when data is invalid
- **Production Ready**: Yes - ready to deploy with monitoring in place
```

### Bad Examples (Too Technical)

```markdown
## Does It Work

- **Tests**: Unit and integration test coverage at 95%, mocks external dependencies
- **Safety**: Try-catch blocks around async operations with proper error propagation
- **Production Ready**: Implements circuit breaker pattern with exponential backoff
```

### Flags to Raise

- Missing tests for new functionality
- Unhandled error paths
- Missing validation on user inputs
- Performance concerns (N+1 queries, blocking operations)
- Missing logging for debugging

### Test Exemptions

The following file types are exempt from unit test requirements. They are covered by build smoke tests or other validation:

| File Pattern                          | Reason                                             |
| ------------------------------------- | -------------------------------------------------- |
| `hugo/**/*.html`                      | Hugo templates - covered by Hugo build smoke test  |
| `hugo/**/*.css`                       | Hugo styles - covered by TailwindCSS build process |
| `*.md`                                | Documentation - no executable code                 |
| `.github/workflows/*.yml`             | CI configs - covered by actionlint validation      |
| Config files (`.json`, `.toml`, etc.) | Configuration - validated by consuming tools       |

Do NOT flag missing tests for these file types. Instead, verify the appropriate validation exists (e.g., Hugo build passes, actionlint runs).

---

## 3. Simplicity & Maintainability

**Purpose**: Evaluate code clarity and long-term maintenance burden.

**Audience**: Non-technical managers - focus on business impact of complexity.

### Evaluation Criteria

| Aspect         | What to Look For                                         |
| -------------- | -------------------------------------------------------- |
| **Complexity** | Cyclomatic complexity, nesting depth, function length    |
| **Patterns**   | Follows project conventions? DRY? Single responsibility? |
| **Concerns**   | Magic numbers? Hardcoded values? Missing abstractions?   |

### Output Format (Non-Technical Language)

```markdown
## Simplicity & Maintainability

- **Complexity**: Low - the code is straightforward and easy for developers to understand
- **Patterns**: Follows the same patterns as the rest of the codebase
- **Concerns**: None - should be easy to modify and extend in the future
```

### Good Examples (Plain English)

```markdown
## Simplicity & Maintainability

- **Complexity**: Low - clear and easy to understand, which reduces future maintenance costs
- **Patterns**: Consistent with existing code, making it easier for the team to work with
- **Concerns**: None - well-organized and should be easy to modify when requirements change
```

### Bad Examples (Too Technical)

```markdown
## Simplicity & Maintainability

- **Complexity**: Cyclomatic complexity of 8, acceptable within threshold
- **Patterns**: Follows SOLID principles and repository pattern
- **Concerns**: Some code duplication but within acceptable DRY tolerance
```

### Common Issues to Flag

- Functions over 50 lines
- More than 3 levels of nesting
- Duplicated logic across files
- Inconsistent naming or patterns
- Over-engineering for simple problems
- Missing documentation on complex logic

---

## 4. Test Quality

**Purpose**: Evaluate test design when test files are included in changes.

> This section only appears when test files (`*.spec.ts`, `*.test.ts`, `test_*.py`, `*_test.py`) are in the diff.

See [test-quality.md](test-quality.md) for detailed evaluation criteria.

### Quick Checklist

- [ ] Tests are behavioral (test what, not how)
- [ ] Tests are readable and self-documenting
- [ ] Tests are fast and deterministic
- [ ] Tests are isolated (no shared mutable state)
- [ ] Tests are specific (clear failure messages)
- [ ] Mocking is appropriate (roles, not values)

---

## 5. Consolidated Findings from All Reviews

**Purpose**: Present all findings from the three review subagents in one organized section.

This section aggregates findings from:

- quality-review subagent
- security-review subagent
- clean-architecture-validator subagent

Findings are sorted by severity (Critical → High → Medium → Low) regardless of which review found them.

### Output Format

```markdown
## Findings

### Critical Issues

1. [security] SQL Injection in search handler - src/search/handler.ts:45
2. [security] XSS vulnerability in user input - src/ui/form.ts:102

### High Priority

1. [architecture] Layer violation: UI depends on infrastructure - src/pages/login.ts:23
2. [quality] Missing tests for error handling - src/auth/validate.spec.ts:0

### Medium Priority

1. [quality] Complex function needs refactoring - src/utils/parser.ts:88
2. [test] Over-mocking reduces test value - src/services/api.spec.ts:45

### Low Priority

1. [quality] Inconsistent variable naming - src/models/user.ts:12
```

### Finding Categories (from all three reviews)

| Category       | Source Review                | Examples                              |
| -------------- | ---------------------------- | ------------------------------------- |
| `security`     | security-review              | SQL injection, XSS, CSRF, auth issues |
| `architecture` | clean-architecture-validator | Layer violations, dependency issues   |
| `quality`      | quality-review               | Code smells, correctness issues       |
| `test`         | quality-review               | Test quality, coverage gaps           |
| `performance`  | Any review                   | N+1 queries, memory leaks             |

---

## 6. Beads Tasks Created

**Purpose**: Show which beads tasks were created for tracking fixes.

**IMPORTANT**: This section only appears when:

- An epic was found for the current branch
- Beads is initialized in the repository
- At least one finding exists

### Output Format

```markdown
## Beads Tasks Created

Created 6 tasks under epic `workspace-abc123`:

- `workspace-abc123-t1`: Fix: SQL injection in search handler (P0)
- `workspace-abc123-t2`: Fix: XSS vulnerability in user input (P0)
- `workspace-abc123-t3`: Fix: Layer violation in login page (P1)
- `workspace-abc123-t4`: Add tests for error handling (P1)
- `workspace-abc123-t5`: Refactor complex parser function (P2)
- `workspace-abc123-t6`: Improve variable naming consistency (P3)

View tasks: `br show workspace-abc123 --json | jq '.[0].dependents'`
```

### When to Skip This Section

- No epic found for current branch
- Beads not initialized (no .beads/ directory)
- No findings to report
- Beads task creation failed (note error in report)

---

## 7. Recommendations

**Purpose**: Provide prioritized, actionable items for improvement.

### Priority Levels

| Priority       | Action                                | Timeline                      |
| -------------- | ------------------------------------- | ----------------------------- |
| **Must Fix**   | Critical/High severity - blocks merge | Before approval               |
| **Should Fix** | Medium severity - recommended         | Before or shortly after merge |
| **Consider**   | Low severity - optional improvement   | When time permits             |

### Output Format

```markdown
## Recommendations

1. **Must Fix**: Fix SQL injection vulnerability in search handler (Critical)
2. **Should Fix**: Add test coverage for error handling paths
3. **Consider**: Extract common validation logic to shared utility
```

### Good Recommendations

- Specific: Reference exact file and line
- Actionable: Clear what needs to change
- Justified: Explain why it matters
- Prioritized: Help the author focus

---

## 8. Copy-Paste Prompt for Claude Code

**Purpose**: Provide a ready-to-use prompt for implementing recommendations.

**REQUIRED**: This section MUST be included when there are any findings (Must Fix, Should Fix, or Consider).

### When to Include

**ALWAYS** include this section when there are findings of any priority level.

### Format

```markdown
## Copy-Paste Prompt for Claude Code
```

Fix the following issues identified in code review:

1. SQL injection in src/search/handler.ts:45
   - Replace string concatenation with parameterized query
   - Use db.prepare().bind() pattern

2. Missing test coverage in src/search/handler.spec.ts
   - Add test case for empty search results
   - Add test case for special characters in search term

Start with the security issue first.

```

```

### Guidelines

- Be specific with file paths and line numbers
- Prioritize the order of fixes
- Include context from the review
- Make it copy-paste ready (no placeholders)
- Keep it focused on the recommendations

---

## Section Order

The consolidated review should follow this order:

1. Summary (1-2 sentences - problems only, or "No issues found")
2. Findings (aggregated from all three reviews, sorted by severity) - **only if findings exist**
3. Beads Tasks Created (if applicable)
4. Recommendations - **only if findings exist**
5. Copy-Paste Prompt (always include when findings exist)
6. Review Metadata

**Sections removed for conciseness:**

- ~~What Changed~~ - not needed for problem-focused reviews
- ~~Does It Work~~ - findings cover this
- ~~Simplicity & Maintainability~~ - findings cover this
- ~~Test Quality~~ - findings cover this

---

## Writing Style for Non-Technical Managers

**CRITICAL**: The entire review is written for non-technical managers, not developers.

### Target Scan Time: 30 Seconds

Busy managers need to quickly understand what must be fixed. Every review should be scannable in 30 seconds or less.

### Do

- **Focus exclusively on problems and fixes** - never acknowledge what's done well
- Use plain language at a 6th-grade reading level
- Keep findings to 2-3 lines maximum (file:line, problem, fix)
- Focus on business impact and risk (cost, security, user experience)
- Reference file paths and line numbers for developer handoff
- Only show sections that have problems (conditional sections)
- Make copy-paste prompts concise (3-5 lines maximum)

### Don't

- **NEVER include praise, positive feedback, or acknowledgment of good practices**
- Don't use analogies or metaphors - use plain language instead
- Don't show sections when there are no problems (e.g., "None found")
- Don't be verbose - compress findings to essential information
- Don't make vague suggestions - be specific with file:line references
- Don't assume technical knowledge

### Examples of Technical Terms with Explanations

**Good** (jargon + brief explanation):

- "SQL injection - inserting malicious database commands - could allow attackers to access customer data"
- "Race condition - when timing issues cause unpredictable behavior - could cause the system to fail when processing large orders"
- "Tight coupling - components depend too heavily on each other - makes the system harder to maintain, increasing future costs"

**Bad** (unexplained jargon):

- "SQL injection vulnerability in prepared statement"
- "Race condition in async handler"
- "Tight coupling violates dependency inversion principle"

**Also Bad** (overly simple without precision):

- "Database security issue"
- "Timing problem"
- "Code organization issue"
