"use strict";
const { makeDbConnect } = require("./_helpers");

const dbConnect = makeDbConnect();

// Derived-status refactor (#115): the denormalized `status` column is the only
// reason the two lazy-expire UPDATEs exist. Replace it with a `retractedAt`
// timestamp so status can be DERIVED from (retractedAt, acceptedAt, expiresAt)
// in every SELECT — a single source of truth, no drift.
//
// Derivation rule (kept in sync with STATUS_CASE_SQL in invitationStore.ts):
//   retractedAt IS NOT NULL -> 'retracted'
//   acceptedAt  IS NOT NULL -> 'accepted'
//   expiresAt   <= now()    -> 'expired'
//   else                    -> 'pending'

module.exports.up = async () => {
  await dbConnect(async (sql) => {
    console.log("Adding invitation.retractedAt, dropping invitation.status...");

    // 1. Add the new nullable marker column.
    await sql`ALTER TABLE "invitation" ADD COLUMN "retractedAt" timestamptz`;

    // 2. Backfill: only 'retracted' rows need a marker. 'accepted' already has
    //    acceptedAt; 'expired' derives from expiresAt. createdAt is a safe
    //    non-null stand-in for the retraction time of legacy rows.
    await sql`
      UPDATE "invitation" SET "retractedAt" = "createdAt" WHERE "status" = 'retracted'
    `;

    // 3. Drop the old status-based partial unique index.
    await sql`DROP INDEX IF EXISTS "uq_invitation_one_pending_email"`;

    // 4. Create the new partial unique index (FR-005: one OPEN invite per email).
    //    "Open" = not accepted and not retracted (includes past-due rows, which
    //    re-invite refreshes in place via UPSERT).
    await sql`
      CREATE UNIQUE INDEX "uq_invitation_one_open_email"
        ON "invitation"(LOWER("email"))
        WHERE "acceptedAt" IS NULL AND "retractedAt" IS NULL
    `;

    // 5. Drop the denormalized status column.
    await sql`ALTER TABLE "invitation" DROP COLUMN "status"`;

    console.log("Done.");
  });
};

module.exports.down = async () => {
  await dbConnect(async (sql) => {
    console.log("Restoring invitation.status, dropping invitation.retractedAt...");

    // 1. Re-add the status column with the original default.
    await sql`ALTER TABLE "invitation" ADD COLUMN "status" text NOT NULL DEFAULT 'pending'`;

    // 2. Backfill status from the timestamps via the same derivation rule.
    await sql`
      UPDATE "invitation" SET "status" = CASE
        WHEN "retractedAt" IS NOT NULL THEN 'retracted'
        WHEN "acceptedAt"  IS NOT NULL THEN 'accepted'
        WHEN "expiresAt"   <= now()    THEN 'expired'
        ELSE 'pending'
      END
    `;

    // 3. Drop the open-email index.
    await sql`DROP INDEX IF EXISTS "uq_invitation_one_open_email"`;

    // 4. Recreate the original status-based partial unique index.
    await sql`
      CREATE UNIQUE INDEX "uq_invitation_one_pending_email"
        ON "invitation"(LOWER("email"))
        WHERE "status" = 'pending'
    `;

    // 5. Drop the retractedAt column.
    await sql`ALTER TABLE "invitation" DROP COLUMN "retractedAt"`;

    console.log("Done.");
  });
};
