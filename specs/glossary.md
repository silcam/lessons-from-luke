# Lessons from Luke — Ubiquitous Language Glossary

> Maintained by the `/glossary` skill. Single source of truth for domain terminology.
> Format: **Term** (part-of-speech): Definition. [See: related-term]

---

## A

**Account** (noun): The credential a recipient ends up with after redeeming an invitation, carrying the role granted by the invitation. Consists of a `user` row and a linked `account` (credential) row in the auth schema. Each email address maps to at most one Account. [See: User, Invitation]

**Administrator** (noun): A signed-in User with the `admin` flag set to `true`. The only actor who may create, list, retract, or re-copy Invitations. [See: User, Invitation]

**Accepted** (noun): Terminal status of an Invitation that has been successfully redeemed; an Account exists for the bound email. [See: Invitation, Pending, Retracted, Expired]

## E

**Expired** (noun): Terminal status of a Pending Invitation whose 14-day window has elapsed without redemption. The link no longer works; the record is retained for audit. [See: Invitation, Pending]

## I

**Invitation** (noun): An administrator-issued, single-use authorization to create one Account. Bound to a specific recipient email address and a granted role (administrator or standard). Key attributes: email, role, status, creation date, expiry date, acceptance date (when Accepted), creating administrator, and a secret redemption token. [Docs: specs/002-invitation-system/spec.md#key-entities] [See: Pending, Accepted, Retracted, Expired]

**Invitation link** (noun): The URL shared with a Recipient that encodes the redemption token. Format: `${BETTER_AUTH_URL}/invitation/${token}`. Single-use; valid only while the Invitation is Pending and non-expired. [See: Invitation, Token]

## A

**Archived** (adjective): Terminal, one-way status of a Language project that an Administrator has soft-deleted. Retains all translation data (TStrings, progress, uploaded documents) but is excluded from every language list and cannot be used as a translation target. No in-product restore exists. [Docs: specs/012-language-archive-routing/spec.md] [See: Language, Source language dependency]

## L

**Language** (noun): A translation target in the domain layer, with progress tracking and optional motherTongue variant. Managed through the `Persistence` interface. Can be Archived. [See: Persistence, Archived]

**Lesson** (noun): Domain entity organized by Book (Luke/Acts), Series, and Lesson number. Contains LessonStrings. [See: LessonString, TString]

**LessonString** (noun): Links a master string (TString) to a Lesson with type (content/styles/meta) and xpath.

## P

**Pending** (noun): The initial, active status of an Invitation. A Pending, non-expired Invitation has a working link; only Pending Invitations can be Retracted or redeemed. [See: Invitation, Accepted, Retracted, Expired]

**Persistence** (noun): The interface (`src/core/interfaces/Persistence.ts`) defining all domain data operations. All domain data access MUST go through this abstraction. [See: PGStorage, LocalStorage]

**PGStorage** (noun): PostgreSQL implementation of the `Persistence` interface for production. Uses the porsager `postgres@1` driver on the domain `pg.Pool`. [See: Persistence]

## R

**Recipient** (noun): The person who receives an Invitation link and redeems it to create their Account. Supplies a password and display name; their email is pre-bound by the Invitation. [See: Invitation, Account]

**Retracted** (noun): Terminal status of a Pending Invitation that an Administrator has explicitly cancelled. The link stops working immediately; the record is retained for audit. [See: Invitation, Pending]

## S

**Source language dependency** (noun): The relationship where one Language designates another as `defaultSrcLang`, the language it translates from. Any Language, not only English, can be a source for others. An active dependency blocks its target from being Archived until dependents are re-pointed. [Docs: specs/012-language-archive-routing/spec.md] [See: Language, Archived]

**Standard role** (noun): The non-administrator role granted to a newly created Account when the Invitation's role is `'standard'`. Maps to `user.admin = false`. [See: Administrator, Invitation]

## T

**Token** (noun): A 256-bit cryptographically random value (base64url, 43 chars) that forms the secret part of an Invitation link. Only the SHA-256 hash (`tokenHash`) is stored for lookup; an AES-256-GCM-encrypted copy (`tokenEnc`) is stored for re-copy without storing plaintext. [See: Invitation link, Invitation]

**TString** (noun): A translated string with history tracking, linked to a master ID. Core domain type.

## U

**User** (noun): The better-auth authentication entity (auth schema, `"user"` table). Holds `id`, `email`, `name`, `admin` (boolean), `emailVerified`. Created for an invitation Recipient at accept time via direct SQL. Distinct from the domain `Persistence` layer's data entities. [See: Account, Administrator, Recipient]
