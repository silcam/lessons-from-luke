# Operator Runbook: Luke Lesson 1 Translation Restoration

**Branch**: `018-lesson1-translation-restore` | **Date**: 2026-08-13

This is the runbook for the recovery. Follow it in order. Every step that
writes to production is gated by a step that does not.

**Do NOT run `cleanDB.ts` at any point.** Its `consolidateEnglish` deletes
translations across all languages.

---

## Known version facts for this incident

| Thing                                      | Value                    |
| ------------------------------------------ | ------------------------ |
| Affected lesson                            | Luke 1-1                 |
| Mistaken cover-file upload                 | version **158**          |
| Correct pre-incident master                | version **157**          |
| Expected restore source (on the server)    | `docs/Luke-1-01v157.odt` |
| Known-bad file — never upload this again   | `docs/Luke-1-01v158.odt` |
| Expected `bumpCount` / mapping strategy    | 1 / `findTSubsBridge`    |
| Version after a successful English restore | **159**                  |

The tool re-derives every one of these from the databases and aborts on
mismatch. If `diagnose` reports a `bumpCount` other than 1, **stop and
re-review** — something moved since this runbook was written.

## 0. Preconditions

- [ ] SSH access to `lukeproduction`; SSH key passphrase for the snapshot hop
      to hand (held by David, not committed anywhere).
- [ ] The snapshot server (`172.26.12.108`) is up and reachable **from**
      `lukeproduction`.
- [ ] The feature branch is deployed to production (or the built `dist/` is
      present): `tsc -b ./src/server` has run.
- [ ] `docs/Luke-1-01v157.odt` exists on the production server. Historical
      masters are never overwritten (`saveDoc` writes to a version-suffixed
      path), so it should be there. If it is **not**, the English restore falls
      back to `--force-relink` from the snapshot's linkage rows.
- [ ] Disk: at least **4×** the production database size free wherever the dumps
      will live — `restore-english` and `apply` each take a full dump. The tool
      checks before each dump and aborts, but check first.
- [ ] A low-traffic window for the client's timezone (WAT). Both dumps add I/O
      load, and fewer concurrent translator edits means less apply-time drift.

```bash
mkdir -p ~/recovery && chmod 700 ~/recovery
```

Do **not** set a restrictive `umask` in your shell before running the tool. The
tool applies one around its own dump and report writes; a shell-wide `umask 077`
would also apply to the master document and web preview `restore-english`
writes into `docs/`, which the **web server** reads — leaving Lesson 1
unreadable, which is worse than the incident. The tool checks those file modes
after the upload and aborts if they do not match their siblings.

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

# Note the LEADING SPACE: keeps the password out of shell history.
# Percent-encode SNAPSHOT_PW before interpolating it: an unencoded '/', '@',
# ':', or whitespace in the password breaks URL parsing and can defeat the
# tool's connection-string redaction (amkj.12). jq's @uri filter is a quick
# way to do this from the shell.
 read -rs SNAPSHOT_PW && SNAPSHOT_PW_ENCODED=$(jq -rn --arg pw "$SNAPSHOT_PW" '$pw|@uri') && export SNAPSHOT_DATABASE_URL="postgres://lessons-from-luke:${SNAPSHOT_PW_ENCODED}@127.0.0.1:5433/lessons-from-luke" && unset SNAPSHOT_PW SNAPSHOT_PW_ENCODED
```

Use the **environment variable**, not `--snapshot-url`. A password on the
command line is readable by every other user on the box via `ps` and
`/proc/<pid>/cmdline`. The tool warns if you pass the flag anyway, and redacts
the URL everywhere it prints or records it.

The snapshot is **strictly read-only** three ways: the storage class overrides
every mutating method to throw, the session opens with
`default_transaction_read_only = on`, and the role should hold `SELECT` only.
Do not point `--snapshot-url` at production; the tool's version check will
abort, but do not rely on that.

Close the tunnel when you are done (step 8).

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

- [ ] The affected lesson is Luke 1-1, at production version **158** against
      snapshot version **157** — `bumpCount` 1, strategy `findTSubsBridge`.
      Anything else: stop.
- [ ] The conflict list looks like genuine post-incident translation work, not
      like the tool mis-mapping strings.
- [ ] The matched master document is `docs/Luke-1-01v157.odt` — the real Lesson
      1 document, **not** `docs/Luke-1-01v158.odt` (the cover file, which the
      tool flags `isKnownBadUpload` and refuses outright). Open it if you have
      any doubt.
- [ ] The planned write count is in the right order of magnitude. The tool caps
      it by default at 1.2× the snapshot's reachable count and aborts above
      that, but a plan much smaller than expected is also a signal.
- [ ] `languageIdentityChecks` shows every language agreeing on `languageId`
      across the two databases, and `matchedBy` names the key it could actually
      use. The tool aborts with **exit 15** if the ids disagree (the snapshot is
      not an ancestor of this production database, and applying it would write
      one language's translations into another's) or if neither `code` nor
      `name` is non-null and unique on both sides — in that case, tidy the
      `languages` rows it names and re-run.
- [ ] The blast radius (other lessons sharing strings) is understood and
      acceptable.

Note the `diagnosisId` from the report — you must pass it explicitly to every
subsequent write command.

## 5. Restore the English master

```bash
NODE_ENV=production node dist/server/tasks/restoreLesson/cli.js restore-english \
  --report ~/recovery/report.json \
  --diagnosis-id <id-from-step-4> \
  --master-document docs/Luke-1-01v157.odt \
  --dump ~/recovery
```

This takes a fresh production dump first, then re-uploads the verified
historical document through the app's own upload pathway, landing as version
**159** (`docs/Luke-1-01v159.odt`). Because the English text is identical to the
pre-incident text, the original master-string ids are reused and most
translations re-attach automatically.

The source document is **copied, not moved** — `docs/Luke-1-01v157.odt` is
still there afterwards, and the tool aborts if source and destination ever
resolve to the same path. Confirm it survived:

```bash
ls -l docs/Luke-1-01v157.odt docs/Luke-1-01v159.odt
```

Check the app: Luke Lesson 1 in English should show the real lesson, not the
cover page (SC-001).

**Exit code 31 means the upload succeeded but the new files are not
app-readable** — Lesson 1 may be broken right now. The tool tries to repair the
modes itself first; if it still aborts, run the fix command it prints, then
re-check the app before continuing to step 6.

## 6. Apply the translation restore

```bash
NODE_ENV=production node dist/server/tasks/restoreLesson/cli.js apply \
  --report ~/recovery/report.json \
  --diagnosis-id <id-from-step-4> \
  --dump ~/recovery
```

`apply` takes **no `--snapshot-url`** and opens no snapshot connection: the
planned text, the mappings, and the count bounding `--max-writes` all come from
the checksum-gated report, and the drift re-check reads live production. The
snapshot only has to be up for step 2's `diagnose` and for a non-`--offline`
`verify`.

Guarantees, restated:

- Any string whose production value differs from the snapshot is **left alone**
  and stays on the conflict list. Post-incident work always wins.
- Every planned write is **re-checked against live production immediately
  before it is written**, so a translation someone created between step 3 and
  now is never overwritten and never duplicated.
- Overwritten values go into the string's `history`, so each change is
  reversible in the app.
- Re-running this command writes nothing further.
- The report is flushed after each language batch, so even a dropped SSH
  session leaves a complete record of what was written.

**Exit code 27 means "applied, with drift".** Some planned writes were withheld
because production changed under us. This is not a failure — the safe writes
landed and are journaled — but the restore is incomplete. Read the `driftSkips`
list, then re-run `diagnose` (to a **new** report path) and repeat steps 4 and 6
for the remainder — and **pass `--prior-report` pointing at the first report**:

```bash
NODE_ENV=production node dist/server/tasks/restoreLesson/cli.js diagnose \
  --snapshot-url "$SNAPSHOT_DATABASE_URL" \
  --report ~/recovery/report-2.json \
  --prior-report ~/recovery/report.json \
  --snapshot-confirmed "marker-seen-$(date +%F)"
```

Without `--prior-report` the second diagnosis loses the pinned `knownBadVersions`
(so the cover file stops being denied) and mis-warns on `bumpCount`. The tool
**aborts (exit 14)** if you omit it beside an existing report. It also verifies
the prior report's checksums and database name before trusting it (exit 20) —
that file is what supplies the cover-file denial, so it is a trust input, not a
convenience.

Do **not** re-run `restore-english` for the remainder. `--prior-report` carries
the first report's `englishRestore` forward, so `apply` against `report-2.json`
sees the English master as already restored and proceeds; running it again
would bump production to v160 for nothing.

On that re-diagnosis, `bumpCount` will be **2** and the strategy
`snapshotAnchored`, because `restore-english` bumped production to 159. That is
correct and expected — the tool compares against `expectedBumpCount`, so it
will not raise the step-4 alarm. Benign drift (someone typed the exact text we
were going to write) is recorded but does not cause exit 27.

**Exit code 32 means a language batch failed and the run stopped.** No further
languages were attempted — deliberately, because the cause is unknown. The tool
prints the dump path and the journal path. Read `applyState.languageBatches` for
the `failureMessage`, fix the cause, then re-diagnose with `--prior-report` and
repeat.

If it fails midway: the dump taken at the start of this step restores
production wholesale. Re-running `diagnose` will also show you exactly how far
the apply got, and the report's `applyState` names the last completed batch.

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
- [ ] The web preview for Lesson 1 renders the restored content — the app must
      serve the **v159** preview, not the lingering v158 (cover) one.
- [ ] Lesson 1's TSub substitution suggestions are sane. They now diff v159
      against v158 (the cover page), so they may be nonsense. Note what you see
      in the client report rather than letting a translator find it.
- [ ] The duplicate **delta** is empty (`verify` exits 0, not 30). `tstrings`
      has no unique constraint, so a translator saving the same string in the
      sub-second window between the tool's re-check and its write could produce
      a duplicate row. `verify` compares its sweep against the
      `duplicateRowsBaseline` taken at diagnosis, so duplicates that predate the
      recovery are listed as pre-existing rather than blamed on it. Resolve any
      **new** ones by hand before sending the client report.

Read `client-report.md` before sending it. It must contain no server
addresses, filesystem paths, database names, or credentials — only counts,
language names, lesson identity, and conflict sample text. Then send it.

If the snapshot server has already been torn down, add `--offline` and drop
`--snapshot-url`; the report is then computed from stored counts plus live
production, and is labelled as such.

## 8. Close out

```bash
pkill -f 'ssh -f -N -L 5433'            # close the tunnel
unset SNAPSHOT_DATABASE_URL
```

**Delete the dumps once the client confirms the restoration.** Each
`~/recovery/*.dump` is a full-database dump — it contains the `user` and
`account` tables (password hashes), live `session` rows, and `invitation`
tokens, not just translations. Until then:

- [ ] They stay `0600` inside `0700 ~/recovery`.
- [ ] They are **never** copied off the production host — not to a laptop, not
      to cloud storage, and nothing from them is attached to client email.

```bash
shred -u ~/recovery/*.dump 2>/dev/null || rm -f ~/recovery/*.dump
```

Keep **every** report, its journal, and `client-report.md` (all `0600`) as the
record of the recovery. Each report has its own journal, named after it —
`report.json` → `report.journal.jsonl`, `report-2.json` →
`report-2.journal.jsonl` — so a drift recovery leaves two pairs, and both belong
in the record. The journal is the append-only write log; if it and its report
ever disagree, the journal is the truth.

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

**Do not run two write commands at once.** `restore-english`, `apply`, **and
`verify`** each take a Postgres advisory lock and exit 28 if another is running
— `verify` is included because it writes `languages.progress` and rewrites
`report.json`, so overlapping it with `apply` loses whichever run's audit
record is written first. `tstrings`
has no unique constraint, so overlapping writes are how duplicate rows get
made. If you see exit 28, find the other session before retrying.

**Do not run the database cleanup task** (`dist/server/tasks/cleanDB.js`)
during or after this recovery.
