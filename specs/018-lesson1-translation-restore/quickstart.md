# Operator Runbook: Luke Lesson 1 Translation Restoration

**Branch**: `018-lesson1-translation-restore` | **Date**: 2026-08-13

This is the runbook for the recovery. Follow it in order. Every step that
writes to production is gated by a step that does not.

**Do NOT run `cleanDB.ts` at any point.** Its `consolidateEnglish` deletes
translations across all languages.

---

## 0. Preconditions

- [ ] SSH access to `lukeproduction`; SSH key passphrase for the snapshot hop
      to hand (held by David, not committed anywhere).
- [ ] The snapshot server (`172.26.12.108`) is up and reachable **from**
      `lukeproduction`.
- [ ] The feature branch is deployed to production (or the built `dist/` is
      present): `tsc -b ./src/server` has run.
- [ ] Disk: at least 3× the production database size free wherever the dump
      will live. The tool checks this and aborts, but check first.

## 1. Positively identify both servers

On the production host:

```bash
ls ~/THIS_IS_THE_PRODUCTION_SERVER          # must exist
ssh 172.26.12.108 ls ~/THIS_IS_THE_SNAPSHOT_SERVER   # must exist
```

If either is missing, **stop**. The tool refuses to run without the production
marker, and the snapshot confirmation token you pass in step 3 asserts you saw
the snapshot's.

## 2. Open a read-only tunnel to the snapshot

```bash
ssh -f -N -L 5433:localhost:5432 172.26.12.108
export SNAPSHOT_DATABASE_URL='postgres://lessons-from-luke:<pw>@127.0.0.1:5433/lessons-from-luke'
```

The snapshot is **strictly read-only**: the tool's snapshot storage class
overrides every mutating method to throw, and opens its session with
`default_transaction_read_only = on`. Do not point `--snapshot-url` at
production; the tool's version check will abort, but do not rely on that.

## 3. Diagnose (no writes anywhere)

```bash
cd /var/www/lessons-from-luke/current
NODE_ENV=production node dist/server/tasks/restoreLesson/cli.js diagnose \
  --snapshot-url "$SNAPSHOT_DATABASE_URL" \
  --report ~/recovery/report.json \
  --snapshot-confirmed "marker-seen-$(date +%F)"
```

Read the summary. It tells you:

- which lesson(s) are affected and how many times each was re-uploaded
- whether the mapping uses the one-bump `findTSubs` bridge or snapshot-anchored
  reconstruction
- per language: intact / restorable / conflict / newer-work / lost counts
- which historical ODT under `docs/` matches the snapshot's English text
- how many master strings are shared with other lessons (blast radius)
- legacy `lessonStringId`-scoped row counts, and how many rows have a NULL
  `modified` (so you know how much the timestamps actually cover)

### Verify the dry run really wrote nothing (SC-005)

```bash
pg_dump -Fc lessons-from-luke > ~/recovery/before-dryrun.dump   # before step 3
# ...run diagnose...
pg_dump -Fc lessons-from-luke > ~/recovery/after-dryrun.dump
pg_restore -l ~/recovery/before-dryrun.dump | sha256sum
pg_restore -l ~/recovery/after-dryrun.dump  | sha256sum
```

Compare table row counts for `tstrings`, `lessonstrings`, `lessons` between the
two dumps; they must be identical.

## 4. Human review gate

**Stop here and read the report.** Nothing beyond this point is reversible
without the dump. Confirm:

- [ ] The affected lesson is the one you expect (Luke, correct series, lesson 1).
- [ ] The conflict list looks like genuine post-incident translation work, not
      like the tool mis-mapping strings.
- [ ] The matched master document is the real Lesson 1 document, **not** the
      cover file. Open it if you have any doubt.
- [ ] The blast radius (other lessons sharing strings) is understood and
      acceptable.

Note the `diagnosisId` from the report — you must pass it explicitly to every
subsequent write command.

## 5. Restore the English master

```bash
NODE_ENV=production node dist/server/tasks/restoreLesson/cli.js restore-english \
  --report ~/recovery/report.json \
  --diagnosis-id <id-from-step-4> \
  --master-document docs/Luke-<series>-01v<NN>.odt \
  --dump ~/recovery
```

This takes a fresh production dump first, then re-uploads the verified
historical document through the app's own upload pathway. Because the English
text is identical to the pre-incident text, the original master-string ids are
reused and most translations re-attach automatically.

Check the app: Luke Lesson 1 in English should show the real lesson, not the
cover page (SC-001).

## 6. Apply the translation restore

```bash
NODE_ENV=production node dist/server/tasks/restoreLesson/cli.js apply \
  --snapshot-url "$SNAPSHOT_DATABASE_URL" \
  --report ~/recovery/report.json \
  --diagnosis-id <id-from-step-4> \
  --dump ~/recovery
```

Guarantees, restated:

- Any string whose production value differs from the snapshot is **left alone**
  and stays on the conflict list. Post-incident work always wins.
- Overwritten values go into the string's `history`, so each change is
  reversible in the app.
- Re-running this command writes nothing further.

If it fails midway: the dump taken at the start of this step restores
production wholesale. Re-running `diagnose` will also show you exactly how far
the apply got.

## 7. Verify and regenerate derived data

```bash
NODE_ENV=production node dist/server/tasks/restoreLesson/cli.js verify \
  --snapshot-url "$SNAPSHOT_DATABASE_URL" \
  --report ~/recovery/report.json \
  --diagnosis-id <id-from-step-4> \
  --out ~/recovery/client-report.md

yarn generate-previews
```

`verify` awaits the language-progress recomputation (the server's normal path
fires it without awaiting, which a short-lived CLI can outrun). Then check in
the app:

- [ ] Lesson 1 shows correct English content.
- [ ] A sample language shows its pre-incident Lesson 1 translations.
- [ ] Language progress figures look right.
- [ ] The web preview for Lesson 1 renders the restored content.

Send `client-report.md` to the client.

---

## Notes and known consequences

**Desktop clients will sync the restored rows.** Restored translations are
stamped with the current `modified` timestamp, so desktop clients pull them on
their next connection. This is deliberate — a desktop client that keeps showing
the orphaned state is showing a lie. Translators working offline on the same
strings will see the usual sync reconciliation, not data loss.

**Archived languages are included in the diagnosis.** The app's normal reads
filter archived languages out; the diagnosis deliberately does not, so their
translations are neither silently lost nor silently restored — they are listed
and flagged.

**Rollback of the whole operation**: `pg_restore` from the dump taken in step 5
or 6 (`~/recovery/*.dump`). Rollback of a single string: its previous value is
the last entry in the string's `history` and is visible in the translation UI.

**Do not run the database cleanup task** (`dist/server/tasks/cleanDB.js`)
during or after this recovery.
