---
name: clean-architecture-validator
description: "Use when: (1) reviewing code for architecture compliance, (2) finding dependency violations, (3) validating layer boundaries, (4) checking interface placement, (5) refactoring for better separation."
---

# Clean Architecture Validator

Analyze code for Clean Architecture compliance focusing on the dependency rule: dependencies point inward, never outward.

## Style Requirements

**CRITICAL**: Write for non-technical managers using plain English (6th-grade reading level).

- **Report problems only** - never acknowledge what's done well or include praise
- **Target 30-second scan time** - compress findings to 2-3 lines maximum
- **Use plain language** - briefly explain technical terms
- **Focus on fixes** - one-sentence problem, one-line fix
- **Conditional sections** - only show sections with violations

## Layer Hierarchy (Inner to Outer)

```
Domain → Application → Infrastructure/Presentation
```

- **Domain**: Entities, Value Objects, Domain Services, Repository Interfaces
- **Application**: Use Cases, DTOs, Application Services
- **Infrastructure**: Repository Implementations, External APIs, Caches
- **Presentation**: Handlers, Controllers, Templates, UI

## The Dependency Rule

Inner layers must never depend on outer layers:

- Domain: Zero external dependencies (no framework imports, no infrastructure)
- Application: Depends only on Domain
- Infrastructure/Presentation: May depend on Application and Domain

## Analysis Workflow

1. **Map the codebase** - Identify layer boundaries from directory structure
2. **Scan imports** - Check each file's imports against allowed dependencies
3. **Classify violations** - Categorize by severity and type
4. **Report findings** - Present violations with refactoring suggestions

## Quick Violation Checks

**Domain layer violations** (most severe):

- Imports from `infrastructure/`, `presentation/`, framework packages
- Direct database/HTTP/file system calls
- Concrete repository implementations instead of interfaces

**Application layer violations**:

- Imports from `infrastructure/`, `presentation/`
- Direct infrastructure instantiation
- Framework-specific types in use case signatures

**Interface misplacement**:

- Repository interfaces in `infrastructure/` (should be in `domain/interfaces/`)
- Port interfaces outside domain layer

## Output Format

**COMPRESSED FORMAT** (2-3 lines per finding):

```markdown
## Architecture Review

### Critical

- src/domain/entities/User.ts:5: Domain imports infrastructure - violates dependency rule
  Fix: Move database logic to repository implementation in infrastructure layer

- src/domain/services/EmailService.ts:12: Domain imports external API client
  Fix: Define EmailPort interface in domain, implement in infrastructure

### High

- src/application/use-cases/CreateUser.ts:12: Instantiates concrete repository
  Fix: Accept UserRepository via constructor injection

### Medium

- src/infrastructure/UserRepository.ts:1: Interface defined in infrastructure layer
  Fix: Move interface to src/domain/interfaces/UserRepository.ts

## Copy-Paste Prompt for Claude Code

**REQUIRED when findings exist** (3-5 lines maximum):
```

Move database logic from src/domain/entities/User.ts:5 to repository implementation.
Define EmailPort interface in domain, implement in infrastructure.
Use constructor injection in src/application/use-cases/CreateUser.ts:12.
Move UserRepository interface to src/domain/interfaces/.

```

```

**DO NOT include:**

- ~~"None found"~~ sections - omit sections with no violations
- ~~Praise or positive feedback~~ - focus exclusively on problems
- ~~Lengthy explanations~~ - keep to 2-3 lines per finding

## Related Skills

This skill works together with:

- **security-review**: Authentication, data security, web security
- **quality-review**: Code correctness, test quality, general code standards
- **ddd-domain-modeling**: Entity design, value objects, repository interfaces
- **d1-repository-implementation**: Repository pattern, avoiding database schema pollution in domain
- **error-handling-patterns**: Result types, error hierarchies (domain errors should not depend on infrastructure)
- **cloudflare-use-case-creator**: Use case patterns, DTO mapping, application layer structure

When reviewing code, use multiple skills for comprehensive analysis:

1. **Architecture review** (this skill): Layer violations, dependency issues
2. **Security review**: Authentication, rate limiting, input validation, error disclosure
3. **Quality review**: Error handling, test coverage, code standards

## References

- **Detailed violation patterns**: See [references/violations.md](references/violations.md)
- **Layer rules and examples**: See [references/layer-rules.md](references/layer-rules.md)
