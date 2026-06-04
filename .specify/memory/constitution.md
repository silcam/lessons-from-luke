# turtlebased-ts Constitution

<!-- STARTUPFIXME: Rename "turtlebased-ts" in the title above and the "TURTLEBASED-TS" header below to your project name. -->

<!--
Sync Impact Report:
- Version: 1.2.0 → 1.2.1 (PATCH - Clarified 100% coverage achievement strategies)
- Modified principles:
  - I.A Application Code: Added guidance for achieving 100% test coverage
  - Added acceptable/unacceptable uses of istanbul ignore comments
  - Added escalation strategy: mock → refactor → istanbul ignore (as last resort)
- Added sections: None
- Removed sections: None
- Templates requiring updates:
  ✅ plan-template.md - No changes needed
  ✅ spec-template.md - No changes needed
- Implementation changes:
  - .claude/skills/typescript-unit-testing/SKILL.md: Added "100% Coverage Requirement" section
  - .claude/skills/code-review/references/test-quality.md: Added "Coverage Verification" section
  - CLAUDE.md: Strengthened coverage requirement language and added verification steps
- Follow-up TODOs: None
-->

# TURTLEBASED-TS Constitution

## Preamble: Alignment and Purpose

This constitution governs a development process designed to **minimize harm and maximize durable benefit** by aligning code with reality, responsibility, and clarity.

It is ordered toward three non-negotiable ends:

### Truth (Accuracy and Correspondence)

- Code must behave as specified, tested, and reasoned about.
- Tests, types, and static analysis exist to **detect error early** and prevent false confidence.
- Any process that produces passing checks while masking incorrect behavior is harmful.

**Harm avoided**: silent failures, false assurances, regression, brittle systems.
**Benefit preserved**: correctness, predictability, trustworthy behavior.

### Good (Responsibility and Stewardship)

- Development decisions affect users, operators, and future maintainers.
- Strict processes exist to **reduce downstream cost, risk, and cognitive burden**.
- Short-term convenience that creates long-term fragility is a violation of intent.

**Harm avoided**: user-facing defects, operational risk, technical debt, burnout.
**Benefit preserved**: safety, maintainability, accountability, sustainable velocity.

### Beauty (Clarity and Order)

- Clear structure, readable code, and disciplined simplicity improve understanding.
- Beauty here is not aesthetics but **legibility**: code that can be reasoned about without guesswork.
- Cleverness that obscures intent is harmful, even if correct.

**Harm avoided**: confusion, misinterpretation, accidental misuse.
**Benefit preserved**: comprehension, refactorability, calm maintenance.

All rules that follow are tools in service of these ends.
Passing checks is necessary but not sufficient; **understanding and fidelity are required**.

No optimization, shortcut, or interpretation is valid if it undermines truth, responsibility, or clarity—even if it satisfies automated enforcement.

---

## Zeroth Principle: Fidelity to Reality and Stewardship

All development governed by this constitution exists to **faithfully serve reality**, not to simulate progress, satisfy tooling, or produce the appearance of rigor.

Accordingly:

- The purpose of every test, type, rule, and gate is **truthful correspondence between intent, behavior, and outcome**.
- Correctness is valued over cleverness, integrity over speed, and clarity over persuasion.
- Process exists to **reveal errors early**, not to conceal uncertainty or manufacture confidence.
- Rigor is a moral discipline: shortcuts, bypasses, or ritual compliance that undermine understanding are violations of this constitution, even if all checks pass.

This system is built for **stewardship**:

- Stewardship of users, who rely on correct behavior.
- Stewardship of future developers, who inherit the code.
- Stewardship of tools, which must not be treated as oracles.
- Stewardship of judgment, which cannot be delegated to automation.

No rule in this constitution may be interpreted in a way that excuses:

- Willful blindness ("the tests passed").
- False certainty ("the types prove it’s correct").
- Cargo-cult rigor ("this is how it’s done").
- Abdication of responsibility ("the process allowed it").

When rules conflict, **faithfulness to reality and the user’s actual experience takes precedence**.

This principle is not optional, optimizable, or enforceable by tooling.
It is the condition under which all other principles remain valid.

---

## Core Principles

### I. Test-First Development (NON-NEGOTIABLE)

All code changes MUST be tested before implementation. The testing strategy depends on the code type:

#### Application Code (TypeScript/JavaScript)

Test-Driven Development is MANDATORY for all application code. No exceptions.

- Tests MUST be written BEFORE implementation code
- Red-Green-Refactor cycle MUST be strictly followed:
  1. **Red**: Write failing test first
  2. **Green**: Write minimal code to pass
  3. **Refactor**: Improve code while maintaining green tests

- 100% test coverage threshold MUST be maintained (branches, functions, lines, statements)
- Tests use `.spec.ts` or `.test.ts` suffix
- Watch mode (`npx vitest`) MUST be used during development
- When achieving 100% coverage is difficult:
  - First, try mocking external dependencies
  - Second, try restructuring code to make it testable
  - Only as last resort, use istanbul ignore comments with clear justification
  - Acceptable uses: unreachable type guards, platform-specific errors, third-party library internals
  - Unacceptable uses: normal code paths, error handlers you can mock, edge cases you can simulate

**Scope**: All TypeScript/JavaScript source code in `src/`, `.claude/`, and similar application directories.

**Rationale**: Pre-written tests ensure code correctness, prevent regressions, and serve as living documentation. The strict red-green-refactor discipline prevents implementation drift and maintains high quality standards.

#### Static Site Code (Hugo)

Build verification testing is MANDATORY for all Hugo static site changes.

- Hugo MUST build successfully with zero errors and zero warnings
- Build verification tests (`cd hugo && npm test`) MUST pass:
  - Validates build completes with no errors or warnings
  - Verifies required output files exist (index.html, CSS, 404.html)
  - Confirms output directory structure is correct
- Changes to templates, content, or configuration MUST be validated by successful build
- Build tests are enforced in pre-commit hooks and CI

**Scope**: All Hugo files in `hugo/` directory including:

- Content files (`content/**/*.md`)
- Templates and layouts (`layouts/**/*.html`)
- Configuration (`config/**/*.yaml`, `hugo.yaml`)
- Data files (`data/**/*.yaml`)
- Styling (`assets/css/**/*.css`)

**Rationale**: Hugo content and templates are declarative rather than imperative. Build verification is the appropriate testing strategy - if the site builds successfully and produces the expected output structure, the code is correct. Traditional TDD with unit tests is not applicable to markup, content, and configuration files. Zero-warning policy mirrors TypeScript's strictness and prevents quality degradation.

#### Development Workflow

When adding functionality that spans both application and static site code:

1. For TypeScript/JavaScript: Follow strict TDD (red-green-refactor)
2. For Hugo changes: Validate with build tests
3. Both test suites MUST pass before committing
4. Pre-commit hooks enforce both validation strategies automatically

### II. Type Safety and Static Analysis

Extremely strict type checking and linting standards MUST be enforced at all times.

- TypeScript strict mode with ALL strict flags enabled
- Additional strict checks: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`
- No unused locals/parameters, no implicit returns
- **Explicit return types required** on ALL functions
- **No `any` types** allowed (use `unknown` with type guards)
- **Strict boolean expressions**: no truthy/falsy checks on strings, numbers, nullable objects
- **Type imports**: Use `type` keyword for type-only imports
- ESLint max-warnings: 0 (zero tolerance for warnings)

**Rationale**: Strict type safety catches bugs at compile time, improves IDE intelligence, and makes refactoring safer. Zero-warning policy prevents gradual quality degradation.

### III. Code Quality Standards

Consistent code style, documentation, and naming conventions MUST be maintained.

- **JSDoc required** for all public functions, methods, classes, interfaces, types, enums
- **Naming conventions**:
  - Interfaces: PascalCase (no `I` prefix)
  - Type aliases: PascalCase
  - Enums: PascalCase with UPPER_CASE members

- **Import order**: builtin → external → internal → parent → sibling → index (alphabetized)
- Prettier formatting enforced automatically
- All code MUST pass lint-staged checks before commit

**Rationale**: Consistent style reduces cognitive load, improves maintainability, and enables effective code review. JSDoc documentation ensures APIs are self-documenting.

### IV. Pre-commit Quality Gates

Automated quality gates MUST pass before ANY commit is accepted.

- Husky + lint-staged enforce:
  - Prettier formatting
  - ESLint (max-warnings: 0)
  - TypeScript type checking
  - Jest tests for changed files

- ALL quality checks MUST pass (no bypassing)
- Commit messages MUST follow conventional commits format:
  - Types: feat, fix, docs, style, refactor, perf, test, chore, revert
  - Format: `type: lowercase subject` (no period, max 100 chars)

**Rationale**: Pre-commit gates catch issues before they enter the repository, maintaining a consistently high-quality codebase. Conventional commits enable automated changelog generation and semantic versioning.

### V. Warning and Deprecation Policy

ALL warnings and deprecations MUST be addressed immediately. No deferral allowed.

- Compiler warnings (TypeScript, ESLint) MUST be fixed before proceeding
- Deprecation warnings (dependencies, runtime) MUST be addressed
- Security advisories (`npm audit`) MUST be resolved
- Test warnings or flaky tests MUST be fixed
- Never ignore or defer warnings

**Rationale**: Warnings are early indicators of problems. Addressing them immediately prevents technical debt accumulation and avoids compounding issues that become harder to fix later.

### VI. Cloudflare Workers Target Environment

Code MUST be compatible with Cloudflare Workers runtime constraints.

- Target: ES2022, NodeNext modules
- No Node.js-specific APIs unless polyfilled
- Respect Workers runtime limits (CPU time, memory, size)
- Code MUST work in the Workers V8 isolate environment

**Rationale**: Cloudflare Workers has specific runtime constraints different from Node.js. Code that doesn't respect these constraints will fail in production.

### VII. Simplicity and Maintainability

Start simple, build only what's needed, maintain clarity over cleverness.

- YAGNI (You Aren't Gonna Need It) - no speculative features
- KISS (Keep It Simple, Stupid) - prefer simplicity over complexity
- DRY (Don't Repeat Yourself) - abstract common functionality
- Clear, descriptive names over terse abbreviations
- Comments explain "why", not "what" (code should be self-documenting)

**Rationale**: Simple code is easier to understand, maintain, test, and debug. Premature optimization and feature speculation create unnecessary complexity and technical debt.

**Reference**: The `/prefactoring` skill provides detailed guidance on applying these principles during design and implementation, including:

- Architecture and system design patterns (separation of concerns, hierarchy, modularity)
- Domain type creation (value objects, constants, data grouping)
- Naming conventions and self-documenting code
- Policy/implementation separation
- Error handling strategies

---

## Governance

### Amendment Procedure

1. Propose amendment with clear rationale
2. Identify affected templates and code
3. Create migration plan for existing code if needed
4. Update constitution with version bump
5. Propagate changes to all dependent templates
6. Update CLAUDE.md if runtime guidance affected
7. Commit with message: `docs: amend constitution to vX.Y.Z (summary)`

### Versioning Policy

Constitution follows semantic versioning:

- **MAJOR**: Backward incompatible governance/principle removals or redefinitions
- **MINOR**: New principle/section added or materially expanded guidance
- **PATCH**: Clarifications, wording, typo fixes, non-semantic refinements

### Compliance Review

- Constitution supersedes all other practices and documentation
- All PRs/reviews MUST verify compliance with constitution
- Any complexity introduced MUST be justified
- Violations require either fix or constitutional amendment
- Use CLAUDE.md for runtime development guidance to Claude Code

**Version**: 1.2.1 | **Ratified**: 2026-01-13 | **Last Amended**: 2026-01-23
