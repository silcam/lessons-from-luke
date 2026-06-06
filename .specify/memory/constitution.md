<!--
Sync Impact Report:
- Version change: 1.0.0 → 1.1.0 (MINOR)
- Lineage: re-ratified from the turtlebased-ts constitution as v1.0.0 on 2026-06-05;
  this is the first amendment under the Lessons from Luke identity.
- Modified principles:
  - VI. Layered Architecture and Dual Deployment Targets — Persistence mandate
    scoped to DOMAIN data; new "Server-only infrastructure exemption" bullet
    permitting auth backends (better-auth) to own their storage; rationale extended.
- Unchanged: Preamble; Zeroth Principle; I. Test-First Development; II. Type Safety
  and Static Analysis; III. Code Quality Standards; IV. Pre-commit Quality Gates;
  V. Warning and Deprecation Policy; VII. Simplicity and Maintainability; Governance.
- Added sections: "Server-only infrastructure exemption" bullet under Principle VI.
- Removed sections: none.
- Templates checked:
  ✅ .specify/templates/plan-template.md (Constitution Check gate unaffected; no edit needed)
  ✅ .specify/templates/spec-template.md (no stale references; no edit needed)
  ✅ .specify/templates/checklist-template.md (no stale references; no edit needed)
  ✅ CLAUDE.md (unaffected; no edit needed)
  N/A .specify/templates/tasks-template.md (not present in this repo)
- Follow-up TODOs (tooling gaps vs. aspirational standards — carried forward):
  - TODO: raise jest coverage threshold 95 → 100 (jest.config.js coverageThreshold).
  - TODO: tighten ESLint `@typescript-eslint/no-explicit-any` warn → error.
  - TODO: add `@typescript-eslint/explicit-module-boundary-types` (explicit return types).
  - TODO: enforce `--max-warnings 0` in lint scripts.
-->

# Lessons from Luke Constitution

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
- False certainty ("the types prove it's correct").
- Cargo-cult rigor ("this is how it's done").
- Abdication of responsibility ("the process allowed it").

When rules conflict, **faithfulness to reality and the user's actual experience takes precedence**.

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

- 100% test coverage threshold MUST be maintained (branches, functions, lines, statements). This is the standing aspiration; the jest configuration presently enforces 95% (see Sync Impact Report follow-ups for the gap to close).
- Tests use `.test.ts`/`.test.tsx` (the established convention in this repo); `.spec.ts` is also accepted
- Watch mode (`yarn test`, the alias for jest in watch mode via `npx jest --runInBand`) MUST be used during development
- When achieving 100% coverage is difficult:
  - First, try mocking external dependencies
  - Second, try restructuring code to make it testable
  - Only as last resort, use istanbul ignore comments with clear justification
  - Acceptable uses: unreachable type guards, platform-specific errors, third-party library internals
  - Unacceptable uses: normal code paths, error handlers you can mock, edge cases you can simulate

**Scope**: All TypeScript/JavaScript source code under `src/` (the isomorphic `core`, the `server`, the `frontend`, and the `desktop` layers), `.claude/`, and similar application directories.

**Rationale**: Pre-written tests ensure code correctness, prevent regressions, and serve as living documentation. The strict red-green-refactor discipline prevents implementation drift and maintains high quality standards.

#### Document Processing and Multi-Layer Verification

Some surfaces cannot be honestly verified by pure unit TDD: ODT/XML document processing (`src/server/xml/`) depends on the LibreOffice binary, and end-user flows span the React UI, the Express API, and the Electron shell. These surfaces MUST be covered by the appropriate higher layer.

- ODT/XML processing and other surfaces that depend on external binaries or full document round-trips MUST be covered by **integration tests** (`*.integration.test.ts`, run via `yarn test:integration`, exercising LibreOffice through `soffice --headless` where conversion is involved)
- User-facing flows MUST be covered by **end-to-end tests**: Cypress for the web app and Playwright + Electron for the desktop app
- All integration and E2E suites MUST pass before commit and before any CI merge
- Coverage at these layers verifies behavior the unit layer cannot reach; it does not excuse skipping unit TDD for the imperative logic underneath

**Scope**: Document-processing code (`src/server/xml/`, USFM handling, ODT round-trips) and all user-facing flows across the web and desktop targets.

**Rationale**: Declarative output and external-binary surfaces are correctly verified by integration and end-to-end execution rather than pure unit TDD — the test must touch the same reality the user does. Requiring all suites green before commit mirrors the imperative-code discipline and prevents quality degradation at the seams between layers.

#### Development Workflow

When a change spans multiple layers or surfaces:

1. For TypeScript/JavaScript application code: follow strict TDD (red-green-refactor)
2. For document-processing and user-facing changes: validate with integration tests and E2E (Cypress for web, Playwright + Electron for desktop)
3. All relevant test suites MUST pass before committing
4. Pre-commit hooks and CI enforce these validation strategies automatically

### II. Type Safety and Static Analysis

Extremely strict type checking and linting standards MUST be enforced at all times. These are hard targets; where current tooling is more lenient, the gap is tracked as a follow-up (see Sync Impact Report), not a relaxation of the standard.

- TypeScript strict mode with ALL strict flags enabled
- Additional strict checks: `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`
- No unused locals/parameters, no implicit returns
- **Explicit return types required** on ALL functions
- **No `any` types** allowed (use `unknown` with type guards)
- **Strict boolean expressions**: no truthy/falsy checks on strings, numbers, nullable objects
- **Type imports**: Use `type` keyword for type-only imports
- ESLint max-warnings: 0 (zero tolerance for warnings)
- Compile target: ES2022, CommonJS modules, `moduleResolution: node`, strict

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

- `.husky/pre-commit` runs, in order:
  1. `yarn typecheck` — full project type-check across `core`, `server`, `desktop`, and `frontend` (it builds `src/core` declarations first because the other projects reference it, then runs `tsc --noEmit` against each)
  2. `npx lint-staged` — on staged files only:
     - `*.{ts,tsx}` → `eslint --fix` → `prettier --write` → `jest --findRelatedTests --bail --passWithNoTests --runInBand`
     - `*.{js,json,md,yml,yaml}` → `prettier --write`

- ALL quality checks MUST pass (no bypassing; never `--no-verify`)
- Commit messages MUST follow conventional commits format:
  - Types: feat, fix, docs, style, refactor, perf, test, chore, revert
  - Format: `type: lowercase subject` (no period, max 100 chars)

**Rationale**: Pre-commit gates catch issues before they enter the repository, maintaining a consistently high-quality codebase. Conventional commits enable automated changelog generation and semantic versioning.

### V. Warning and Deprecation Policy

ALL warnings and deprecations MUST be addressed immediately. No deferral allowed.

- Compiler warnings (TypeScript, ESLint) MUST be fixed before proceeding
- Deprecation warnings (dependencies, runtime) MUST be addressed
- Security advisories (`yarn audit`) MUST be resolved
- Test warnings or flaky tests MUST be fixed
- Never ignore or defer warnings

**Rationale**: Warnings are early indicators of problems. Addressing them immediately prevents technical debt accumulation and avoids compounding issues that become harder to fix later.

### VI. Layered Architecture and Dual Deployment Targets

The codebase is an isomorphic four-layer architecture serving two deployment targets behind a single storage abstraction. These boundaries MUST be respected.

- **Isomorphic core**: `src/core/` MUST remain platform-agnostic — no Node-only, DOM-only, or Electron-only APIs — so it runs unchanged on the server, the web frontend, and the desktop app.
- **Persistence abstraction**: all **domain** data access (languages, lessons, tStrings, and related curriculum/translation entities) MUST go through the `Persistence` interface (`src/core/interfaces/Persistence.ts`). Implementations: `PGStorage` (production), `PGTestStorage`/`TransactionalTestStorage` (test), `PGDevStorage` (development), and `LocalStorage` (desktop, offline-first). Layer dependency direction is one-way: `core` ← `server`/`frontend`/`desktop` (never the reverse).
- **Server-only infrastructure exemption**: dedicated **server-only** infrastructure that manages its own storage — notably authentication/session backends (e.g. better-auth) and the tables and database connection they own — is EXEMPT from the `Persistence` mandate, provided it (a) runs only on the server and is never imported into the isomorphic `core` or the desktop offline path, and (b) does not store or proxy domain data. Such infrastructure MAY own its own schema, migrations, and DB connection.
- **Two deployment targets**:
  - **Web**: Express server compiled to TypeScript/CommonJS, deployed via Capistrano + Passenger (Node 24 via nvm; appId `org.sil.cmb.lessons-from-luke`).
  - **Desktop**: Electron main process with the offline-first `LocalStorage`, packaged by electron-builder (`.dmg`/`.exe`). The desktop app MUST work offline and reconcile via sync.
- **Three isolated runtime environments**: production, development, and test each have a distinct `NODE_ENV`, storage class, database, and ODT root. They MUST NOT cross-contaminate — only the test environment mounts `/api/test/reset-storage`; dev resets through the `yarn reset:dev` CLI.
- **Target**: ES2022, CommonJS, strict.

**Rationale**: Keeping `core` isomorphic and routing all persistence through one interface is what makes a single codebase serve both an online server and an offline-capable desktop app correctly. Hard environment isolation prevents test fixtures or dev data from ever reaching production. The Persistence mandate governs domain data because that is what crosses the isomorphic-core and offline-desktop boundaries; server-only auth infrastructure never enters those paths, so it is scoped out rather than forced through an interface designed for domain persistence.

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

**Version**: 1.1.0 | **Ratified**: 2026-06-05 | **Last Amended**: 2026-06-05
