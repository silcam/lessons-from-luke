# Lessons from Luke — Ubiquitous Language Glossary

> Maintained by the `/glossary` skill. Single source of truth for domain terminology.
> Format: **Term** (part-of-speech): Definition. [See: related-term]

---

## A

**Assembled quarter book** (noun): The deliverable of the assembled-quarter-download feature — a single, self-contained, fully editable document for one (Language, Book, Quarter, Assembly mode) consisting of the Table of Contents followed by lessons 1–13 in order, with continuous page numbering and per-lesson first-page number suppression. [Docs: specs/007-assembled-quarter-download/spec.md] [See: Quarter, Assembly job, Assembly mode, TOC lesson]

**Assembly job** (noun): The transient, background unit of work that produces one Assembled quarter book. Has an observable status (in progress → ready / failed) and, on failure, a human-readable reason. Not required to survive an interruption of the serving process. [See: Assembled quarter book]

**Assembly mode** (noun): Whether an Assembled quarter book is produced bilingually (mother tongue alongside a majority/reference language) or single-language (mother tongue only), mirroring the two existing per-lesson download modes. [See: Assembled quarter book]

**Account** (noun): The credential a recipient ends up with after redeeming an invitation, carrying the role granted by the invitation. Consists of a `user` row and a linked `account` (credential) row in the auth schema. Each email address maps to at most one Account. [See: User, Invitation]

**Administrator** (noun): A signed-in User with the `admin` flag set to `true`. The only actor who may create, list, retract, or re-copy Invitations. [See: User, Invitation]

**Accepted** (noun): Terminal status of an Invitation that has been successfully redeemed; an Account exists for the bound email. [See: Invitation, Pending, Retracted, Expired]

## E

**Expired** (noun): Terminal status of a Pending Invitation whose 14-day window has elapsed without redemption. The link no longer works; the record is retained for audit. [See: Invitation, Pending]

## I

**Invitation** (noun): An administrator-issued, single-use authorization to create one Account. Bound to a specific recipient email address and a granted role (administrator or standard). Key attributes: email, role, status, creation date, expiry date, acceptance date (when Accepted), creating administrator, and a secret redemption token. [Docs: specs/002-invitation-system/spec.md#key-entities] [See: Pending, Accepted, Retracted, Expired]

**Invitation link** (noun): The URL shared with a Recipient that encodes the redemption token. Format: `${BETTER_AUTH_URL}/invitation/${token}`. Single-use; valid only while the Invitation is Pending and non-expired. [See: Invitation, Token]

## L

**Language** (noun): A translation target in the domain layer, with progress tracking and optional motherTongue variant. Managed through the `Persistence` interface. [See: Persistence]

**Lesson** (noun): Domain entity organized by Book (Luke/Acts), Series, and Lesson number. Contains LessonStrings. [See: LessonString, TString]

**LessonString** (noun): Links a master string (TString) to a Lesson with type (content/styles/meta) and xpath.

## P

## Q

**Quarter** (noun): A grouping of 13 lessons plus a Table of Contents within a Book — the `series` field on a Lesson (`BaseLesson.series`). Rendered as `Q{series}` in document names (e.g. `English_Luke-Q1-…`). "Quarter" (product/publishing term) and "series" (code field) refer to the same concept. [See: Lesson, Assembled quarter book, TOC lesson]

## P

**Pending** (noun): The initial, active status of an Invitation. A Pending, non-expired Invitation has a working link; only Pending Invitations can be Retracted or redeemed. [See: Invitation, Accepted, Retracted, Expired]

**Persistence** (noun): The interface (`src/core/interfaces/Persistence.ts`) defining all domain data operations. All domain data access MUST go through this abstraction. [See: PGStorage, LocalStorage]

**PGStorage** (noun): PostgreSQL implementation of the `Persistence` interface for production. Uses the porsager `postgres@1` driver on the domain `pg.Pool`. [See: Persistence]

## R

**Recipient** (noun): The person who receives an Invitation link and redeems it to create their Account. Supplies a password and display name; their email is pre-bound by the Invitation. [See: Invitation, Account]

**Retracted** (noun): Terminal status of a Pending Invitation that an Administrator has explicitly cancelled. The link stops working immediately; the record is retained for audit. [See: Invitation, Pending]

## S

**Standard role** (noun): The non-administrator role granted to a newly created Account when the Invitation's role is `'standard'`. Maps to `user.admin = false`. [See: Administrator, Invitation]

## T

**Token** (noun): A 256-bit cryptographically random value (base64url, 43 chars) that forms the secret part of an Invitation link. Only the SHA-256 hash (`tokenHash`) is stored for lookup; an AES-256-GCM-encrypted copy (`tokenEnc`) is stored for re-copy without storing plaintext. [See: Invitation link, Invitation]

**TOC lesson** (noun): The Table of Contents of a Quarter, modeled as a special Lesson with number 99 (`TOC_LESSON`, `isTOCLesson()` in `src/core/models/Lesson.ts`). Assembled first, ahead of lessons 1–13, in an Assembled quarter book. [See: Lesson, Quarter, Assembled quarter book]

**TString** (noun): A translated string with history tracking, linked to a master ID. Core domain type.

## U

**User** (noun): The better-auth authentication entity (auth schema, `"user"` table). Holds `id`, `email`, `name`, `admin` (boolean), `emailVerified`. Created for an invitation Recipient at accept time via direct SQL. Distinct from the domain `Persistence` layer's data entities. [See: Account, Administrator, Recipient]
