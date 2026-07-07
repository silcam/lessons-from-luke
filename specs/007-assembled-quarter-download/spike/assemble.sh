#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# WS-2a spike: assemble a quarter (TOC + 13 lesson ODTs) into ONE editable
# .odt via LibreOffice headless. Mechanism: the insertDocumentFromURL UNO call
# driven from a StarBasic macro running in-process inside soffice.
#
# Why Basic and not Python-UNO: on this macOS build LibreOffice's bundled
# Python (a separate hardened-runtime nested .app) is SIGKILLed on launch
# (verified: dies even via osascript, i.e. outside the Claude Code sandbox).
# soffice itself runs fine, and a Basic macro runs in-process inside it, so it
# reaches the identical UNO surface. On the Linux production server the bundled
# Python has no such problem, so Python-UNO stays the intended server driver.
#
# Usage:  ./assemble.sh <book> <series> [outfile.odt]
#   e.g.  ./assemble.sh Luke 2 out/Luke-2-assembled.odt
#
# Resolves the 14 master paths (-99 TOC + 13 lessons) from test/docs/serverDocs
# by default; override the source dir with SPIKE_SRC_DIR.
# ---------------------------------------------------------------------------
set -euo pipefail

BOOK="${1:?usage: assemble.sh <book> <series> [outfile]}"
SERIES="${2:?usage: assemble.sh <book> <series> [outfile]}"
SPIKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SPIKE_DIR/../../.." && pwd)"
SRC_DIR="${SPIKE_SRC_DIR:-$REPO_ROOT/test/docs/serverDocs}"
OUT="${3:-$SPIKE_DIR/out/${BOOK}-${SERIES}-assembled.odt}"
SOFFICE="${SOFFICE:-soffice}"

mkdir -p "$(dirname "$OUT")"

# Lesson number ranges per series: series N covers lessons (N-1)*13+1 .. N*13.
first=$(( (SERIES - 1) * 13 + 1 ))
last=$(( SERIES * 13 ))

# Build the ordered file list: TOC (-99) first, then lessons first..last.
files=()
toc=$(printf '%s/%s-%s-99v01.odt' "$SRC_DIR" "$BOOK" "$SERIES")
[[ -f "$toc" ]] || { echo "ERROR: TOC not found: $toc" >&2; exit 1; }
files+=("$toc")
for n in $(seq "$first" "$last"); do
  f=$(printf '%s/%s-%s-%02dv01.odt' "$SRC_DIR" "$BOOK" "$SERIES" "$n")
  [[ -f "$f" ]] || { echo "ERROR: lesson master not found: $f" >&2; exit 1; }
  files+=("$f")
done
echo "Assembling ${#files[@]} files (1 TOC + $((${#files[@]}-1)) lessons) -> $OUT"

# Fresh isolated LibreOffice profile per run (proves the isolation pattern the
# real feature needs; none exists in the repo today).
PROFILE_ROOT="$(mktemp -d)"
PROFILE="$PROFILE_ROOT/spike-profile"
cleanup() { rm -rf "$PROFILE_ROOT"; }
trap cleanup EXIT

# Phase 1: warm up the profile so LO builds its user/basic tree, then inject
# our Assemble macro. (A brand-new profile has no basic library to invoke.)
warm="$PROFILE_ROOT/warm.txt"
echo "warmup" > "$warm"
"$SOFFICE" --headless --norestore --nologo \
  "-env:UserInstallation=file://$PROFILE" \
  --convert-to odt --outdir "$PROFILE_ROOT/warm_out" "$warm" >/dev/null 2>&1
cp "$SPIKE_DIR/macro-template/basic/Standard/Module1.xba" \
   "$PROFILE/user/basic/Standard/Module1.xba"

# The warmup soffice leaves a stale profile .lock behind after it exits; remove
# it so the macro launch doesn't see a "profile in use" condition.
rm -f "$PROFILE/.lock"

# IMPORTANT: LibreOffice on macOS is effectively single-instance — launching a
# second soffice while another is running makes the new one hang. Refuse to run
# if any other soffice is already up (the spike must own the only instance).
if pgrep -x soffice >/dev/null 2>&1 || pgrep -f "MacOS/soffice" >/dev/null 2>&1; then
  echo "ERROR: another soffice instance is running; close it first (LO is single-instance)." >&2
  exit 1
fi

# Phase 2: invoke the assembly macro. Inputs via env vars.
rm -f "$OUT" "$OUT.done"
printf -v joined '%s\n' "${files[@]}"
export SPIKE_FILES="$joined"
export SPIKE_OUT_URL="file://$OUT"

"$SOFFICE" --headless --norestore --nologo \
  "-env:UserInstallation=file://$PROFILE" \
  "macro:///Standard.Module1.Assemble" 2>&1 \
  | grep -v -iE "xpc|Connection invalid|NSXPC|endpoint for|Task policy" || true

if [[ -f "$OUT" ]]; then
  echo "OK: wrote $OUT ($(wc -c < "$OUT") bytes)"
  [[ -f "$OUT.done" ]] && echo "macro marker: $(cat "$OUT.done")"
else
  echo "FAIL: no output produced" >&2
  exit 1
fi
