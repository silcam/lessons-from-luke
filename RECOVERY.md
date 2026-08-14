# Production recovery: restoreLesson runbook

All steps run on the prod host (`lukeproduction`, user `lessons`) from the
deployed app root: `cd /var/www/lessons-from-luke/current`. The
`~/THIS_IS_THE_PRODUCTION_SERVER` marker must exist there (it does; the CLI
aborts without it). Prerequisite: restore the pre-incident backup into a
snapshot DB (e.g. `lessons-from-luke-snapshot` on your workstation) and open an
SSH tunnel to it from the prod host, e.g. `ssh -N -L 15432:127.0.0.1:5432 you@workstation`.
Never point `SNAPSHOT_DATABASE_URL` at secrets.json values — the write side
reads secrets.json and it already points at the live DB; no editing needed.

## Step 1 of 4 — diagnose (read-only, takes no lock, safe to re-run to a new path):

```shell
export RECOVERY_PATH=~/recovery
export SNAPSHOT_DATABASE_URL='postgres://<user>:<pass>@127.0.0.1:15432/lessons-from-luke-snapshot'
export NODE_ENV=production
mkdir -p $RECOVERY_PATH && chmod 700 $RECOVERY_PATH
node dist/server/tasks/restoreLesson/cli.js diagnose \
  --report $RECOVERY_PATH/report.json \
  --snapshot-confirmed "restored-from-backup-<backup-timestamp>" \
  --book Luke
```

`--snapshot-confirmed` records real provenance (the backup's timestamp) — it
lands in the report for the human-review gate. A non-loopback tunnel host
prints a non-TLS warning; expected.

Expected: `Luke 1-1 (production v160, Snapshot v159, bumpCount=1)`, a
`Recommended master ... docs/Luke-1-01v159.odt` line, and a fully filled
`Next:` command. Take note of the `diagnosisId`. The planned-write count here
(hundreds) is measured against the broken state — most rows get reattached by
step 2, so step 3 will write far fewer. That gap is normal.

## Step 2 of 4 — restore-english (first write; takes the advisory lock, dumps the DB first, then re-uploads the master through the app's own upload path):

```shell
export RECOVERY_PATH=~/recovery
export DIAGNOSIS_ID=<diagnosisId>
export CORRECT_DOCUMENT_PATH=<absolute path exactly as the report lists it>
export NODE_ENV=production
node dist/server/tasks/restoreLesson/cli.js restore-english \
  --report $RECOVERY_PATH/report.json \
  --diagnosis-id $DIAGNOSIS_ID \
  --master-document $CORRECT_DOCUMENT_PATH \
  --dump $RECOVERY_PATH
```

The master lives under the deployed docs root (`current/docs/` →
`shared/docs/`); use the absolute path from the report's `Recommended master`
line — a relative path aborts with exit 22. The `pg_dump` is of the real
production DB, so check disk headroom (a failed or unsafe dump aborts 23
before any write). Exit 31 afterward means file modes on the new ODT/preview
need the printed fix command.

Expected: exit 0, method=upload, `newLessonVersion=161` (v160 is the cover
incident; it stays on disk as the record), and a dump path printed.

## Step 3 of 4 — apply (writes the non-English translation rows still missing after step 2):

```shell
export RECOVERY_PATH=~/recovery
export DIAGNOSIS_ID=<diagnosisId>
export NODE_ENV=production
node dist/server/tasks/restoreLesson/cli.js apply \
  --report $RECOVERY_PATH/report.json \
  --diagnosis-id $DIAGNOSIS_ID \
  --dump $RECOVERY_PATH
```

Expected: exit 0 with a small write count (rehearsals applied 15–29; apply
recomputes the plan against the live DB, so it only writes what step 2's
re-upload didn't already reattach). Exit 27 means "applied, but some rows
drifted since diagnosis" — likely in production if translators worked between
snapshot and recovery; it's a normal outcome to review, not an alarm. Remedy:
re-diagnose to a new report path with `--prior-report`, review, re-apply.
**Never re-run restore-english.** Exit 32 means a batch failed mid-run; the
pre-apply dump path and journal it prints are the recovery inputs.

## Step 4 of 4 — verify (writes the client-facing report):

```shell
export RECOVERY_PATH=~/recovery
export DIAGNOSIS_ID=<diagnosisId>
export NODE_ENV=production
node dist/server/tasks/restoreLesson/cli.js verify \
  --report $RECOVERY_PATH/report.json \
  --diagnosis-id $DIAGNOSIS_ID \
  --offline \
  --out $RECOVERY_PATH/client-report.md
```

Use `--offline`: verify computes from the stored report plus live production
and never needs the snapshot (the flag only adds a reachability check), so no
tunnel URL on this step. In the per-language table, Before/After are computed
over different reachable sets and aren't comparable to each other; read
**Restored** and **Withheld (drift)** (want zeros) instead. Afterward, spot-check
the web preview for v161 — it's what translators now see.
