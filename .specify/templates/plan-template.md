# Implementation Plan: [FEATURE]

**Branch**: `[###-feature-name]` | **Date**: [DATE] | **Spec**: [link]
**Input**: Feature specification from `/specs/[###-feature-name]/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

[Extract from feature spec: primary requirement + technical approach from research]

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: [e.g., Python 3.11, Swift 5.9, Rust 1.75 or NEEDS CLARIFICATION]  
**Primary Dependencies**: [e.g., FastAPI, UIKit, LLVM or NEEDS CLARIFICATION]  
**Storage**: [if applicable, e.g., PostgreSQL, CoreData, files or N/A]  
**Testing**: [e.g., pytest, XCTest, cargo test or NEEDS CLARIFICATION]  
**Target Platform**: [e.g., Linux server, iOS 15+, WASM or NEEDS CLARIFICATION]
**Project Type**: [single/web/mobile - determines source structure]  
**Performance Goals**: [domain-specific, e.g., 1000 req/s, 10k lines/sec, 60 fps or NEEDS CLARIFICATION]  
**Constraints**: [domain-specific, e.g., <200ms p95, <100MB memory, offline-capable or NEEDS CLARIFICATION]  
**Scale/Scope**: [domain-specific, e.g., 10k users, 1M LOC, 50 screens or NEEDS CLARIFICATION]

## Presentation Design

> _Delete this section entirely for backend-only features with no user-facing UI._

**Component Framework**: [e.g., DaisyUI 5 + Tailwind CSS 4, or N/A]
**Interaction Patterns**: [e.g., HTMX partial swaps, Alpine.js reactive state, static Hugo pages]
**Accessibility Target**: [e.g., WCAG 2.2 AA, AAA, or N/A]

### UI Decisions

<!--
  For each user-facing screen or component introduced by this feature,
  document the design approach. These decisions feed into sp:05-tasks
  to generate presentation layer sub-tasks with the right design-* skills.
-->

| Screen / Component        | User Story | Approach                            | Design Skills                        |
| ------------------------- | ---------- | ----------------------------------- | ------------------------------------ |
| [e.g., 404 error page]    | US1        | [DaisyUI hero + alert, static HTML] | `/design-language-to-daisyui`        |
| [e.g., Onboarding wizard] | US2        | [Multi-step Alpine.js, empty state] | `/design-onboard`, `/design-clarify` |

### Quality Pass

**Design quality target**: [MVP / Production / Flagship]
**Post-implementation refinement**: [List applicable skills or "None planned"]

- e.g., `/design-polish`, `/design-audit`, `/design-adapt`

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

[Gates determined based on constitution file]

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
# [REMOVE IF UNUSED] Option 1: Single project (DEFAULT)
src/
├── models/
├── services/
├── cli/
└── lib/

tests/
├── contract/
├── integration/
└── unit/

# [REMOVE IF UNUSED] Option 2: Web application (when "frontend" + "backend" detected)
backend/
├── src/
│   ├── models/
│   ├── services/
│   └── api/
└── tests/

frontend/
├── src/
│   ├── components/
│   ├── pages/
│   └── services/
└── tests/

# [REMOVE IF UNUSED] Option 3: Mobile + API (when "iOS/Android" detected)
api/
└── [same as backend above]

ios/ or android/
└── [platform-specific structure: feature modules, UI flows, platform tests]
```

**Structure Decision**: [Document the selected structure and reference the real
directories captured above]

## Acceptance Test Strategy

> **ATDD Outer Loop**: Each user story with acceptance scenarios in the spec will have a corresponding acceptance spec file created during `sp:05-tasks`. These files live in `specs/acceptance-specs/` and follow the GWT format consumed by the acceptance pipeline. Ralph's ATDD cycle depends on these files existing before `US<N>` tasks are processed.

| User Story | Acceptance Spec File                       | Scenarios |
| ---------- | ------------------------------------------ | --------- |
| [US1: ...] | `specs/acceptance-specs/US<NN>-<slug>.txt` | [N]       |

**Pipeline**: `specs/acceptance-specs/*.txt` → `acceptance/parse-specs.ts` → `acceptance/generate-tests.ts` → `generated-acceptance-tests/*.spec.ts`

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                  | Why Needed         | Simpler Alternative Rejected Because |
| -------------------------- | ------------------ | ------------------------------------ |
| [e.g., 4th project]        | [current need]     | [why 3 projects insufficient]        |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient]  |
