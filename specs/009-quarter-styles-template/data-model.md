# Data Model: Automated Quarter-Styles Template Application (009)

This feature adds **no persistent storage, no tables, no migration, and no new
domain entity**. The "entities" below are static assets and in-process values in
the existing 007 assembly pipeline. Included for completeness of the design
contract.

---

## Quarter styles template (application asset)

A single, global, swappable style-source document whose named styles are applied
onto every assembled quarter book during assembly.

| Attribute       | Value                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Kind            | Static, version-controlled binary asset (`.odt`).                                                                             |
| Location        | `assets/quarter-styles-template.odt` (repo root), resolved at runtime from `process.cwd()`.                                   |
| Cardinality     | Exactly one, global — same file for all languages, books, quarters, modes.                                                    |
| Lifecycle       | Build/deploy-time artifact; shipped with the app (Capistrano checkout). Never user-managed, never runtime-generated.          |
| Mutability      | Read-only at runtime. Replaced only by a maintainer file swap (FR-005).                                                       |
| Stand-in source | Derived from `test/docs/references/English_Luke-Q2-Master-bilingual.odt`, style definitions preserved verbatim (research R3). |
| Validation      | Per-job, before the `soffice` run: MUST exist and be non-empty. Failure ⇒ job `failed` with a curated reason (FR-004).        |

**Style-family scope actually applied** (research R2): only paragraph +
character styles are imported and overwritten
(`LoadTextStyles=True, OverwriteStyles=True`); page styles and numbering styles
are explicitly NOT imported (`LoadPageStyles=False, LoadNumberingStyles=False`).

**Observable guarantee** (FR-002 / SC-003, scoped per research R3): after
application, the `M.T.*` **body paragraph** family carries no background
highlight. (`M.T. Text` = `transparent` in the stand-in; the two cover paragraph
styles and one `text`-family highlight style retain the reference's own
`#ffffcc` — see plan Acceptance Test Strategy scope note.)

---

## Template application step (in-process macro value)

Not a stored entity — a transient value flowing through the pipeline.

| Field                | Type / shape                         | Source → sink                                                              |
| -------------------- | ------------------------------------ | -------------------------------------------------------------------------- |
| `templatePath`       | absolute `string`                    | `quarterStylesTemplate.resolve()` → `assembleQuarter` → `sofficeAssemble`. |
| `SPIKE_TEMPLATE_URL` | `file://<templatePath>` env string   | `sofficeAssemble` sets it on the run child → macro `Environ()`.            |
| load properties      | `com.sun.star.beans.PropertyValue[]` | Constructed inside the macro (fixed flag set, research R2).                |

**State transitions (assembly job — existing 007 states, one new failure cause)**:

```
queued → running → ready            (template applied successfully)
queued → running → failed(reason)   NEW reason causes:
                                       - "quarter styles template asset is missing or unreadable"  (pre-run validation)
                                       - existing "assembly produced no result"                     (macro aborted before storeToURL on load error)
```

No new job state; the template failure reuses the existing `failed`-with-reason
terminal state and the existing curated-reason hygiene (no raw `soffice` stderr,
no stack, no absolute path in the caller-facing reason).

---

## Unchanged entities (referenced, not modified)

- **Assembled quarter book** (007): same structural guarantees; only its
  `M.T.*` paragraph styling changes.
- **Assembly job / `AssemblyJobRegistry`** (007): unchanged shape; gains one
  failure cause, surfaced through the existing state machine.
- **`Persistence` / domain data**: untouched. The template is a static asset, not
  domain data, so the `Persistence` mandate (constitution VI) does not apply.
