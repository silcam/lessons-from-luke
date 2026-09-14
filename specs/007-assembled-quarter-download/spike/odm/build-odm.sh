#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# WS-2a' spike: assemble a quarter (TOC + 13 lesson ODTs) via the .ODM
# master-document route (approach A1 — Chris's manual SOP 13-15 workflow,
# scripted). Produces an intermediate .odm and a merged .odt in one soffice run.
#
# Reuses the WS-2a harness pattern verbatim: fresh isolated -env:UserInstallation
# profile per run; soffice run FOREGROUND/attached (backgrounding makes the macOS
# GUI app hang); single soffice instance at a time; rm the stale warmup .lock;
# drive UNO from a StarBasic macro (LO's bundled Python is SIGKILLed on this Mac).
#
# Usage:  ./build-odm.sh <book> <series> [outfile.odt]
#   e.g.  ./build-odm.sh Luke 2 out/Luke-2-odm.odt
#
# Resolves the 14 master paths (-99 TOC + 13 lessons) from test/docs/serverDocs
# by default; override the source dir with SPIKE_SRC_DIR.
# ---------------------------------------------------------------------------
set -euo pipefail

BOOK="${1:?usage: build-odm.sh <book> <series> [outfile]}"
SERIES="${2:?usage: build-odm.sh <book> <series> [outfile]}"
ODM_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$ODM_DIR/../../../.." && pwd)"
SRC_DIR="${SPIKE_SRC_DIR:-$REPO_ROOT/test/docs/serverDocs}"
OUT="${3:-$ODM_DIR/out/${BOOK}-${SERIES}-odm.odt}"
SOFFICE="${SOFFICE:-soffice}"

mkdir -p "$(dirname "$OUT")"
# Resolve OUT to an ABSOLUTE path: the macro builds file:// URLs from it, and a
# relative path yields a malformed URL (file://out/x → host=out) that makes the
# headless macro hang. Always absolutize before deriving the .odm sibling.
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
ODM="${OUT%.odt}.odm"

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
echo "Assembling ${#files[@]} files (1 TOC + $((${#files[@]}-1)) lessons) via .odm route"
echo "  .odm -> $ODM"
echo "  .odt -> $OUT"

# Fresh isolated LibreOffice profile per run.
PROFILE_ROOT="$(mktemp -d)"
PROFILE="$PROFILE_ROOT/spike-profile"
cleanup() { rm -rf "$PROFILE_ROOT"; }
trap cleanup EXIT

# Phase 1: warm up the profile so LO builds its user/basic tree, then inject the
# BuildAndExport macro.
warm="$PROFILE_ROOT/warm.txt"
echo "warmup" > "$warm"
"$SOFFICE" --headless --norestore --nologo \
  "-env:UserInstallation=file://$PROFILE" \
  --convert-to odt --outdir "$PROFILE_ROOT/warm_out" "$warm" >/dev/null 2>&1
cp "$ODM_DIR/macro-template/basic/Standard/Module1.xba" \
   "$PROFILE/user/basic/Standard/Module1.xba"

# The warmup soffice leaves a stale profile .lock behind; remove it.
rm -f "$PROFILE/.lock"

# LibreOffice on macOS is effectively single-instance — refuse to run if another
# soffice is already up (the spike must own the only instance).
if pgrep -x soffice >/dev/null 2>&1 || pgrep -f "MacOS/soffice" >/dev/null 2>&1; then
  echo "ERROR: another soffice instance is running; close it first (LO is single-instance)." >&2
  exit 1
fi

# Phase 2: invoke the build macro. Inputs via env vars.
# SPIKE_KEEP_ODM=1 preserves an existing (e.g. hand-patched) .odm for RenderOdm.
if [[ "${SPIKE_KEEP_ODM:-0}" == "1" ]]; then
  rm -f "$OUT" "$OUT.done" "$OUT.log"
else
  rm -f "$OUT" "$ODM" "$OUT.done" "$OUT.log"
fi
printf -v joined '%s\n' "${files[@]}"
export SPIKE_FILES="$joined"
export SPIKE_ODM_URL="file://$ODM"
export SPIKE_OUT_URL="file://$OUT"
export SPIKE_PDF_URL="file://${OUT%.odt}.pdf"

MACRO="${SPIKE_MACRO:-BuildAndExport}"
"$SOFFICE" --headless --norestore --nologo \
  "-env:UserInstallation=file://$PROFILE" \
  "macro:///Standard.Module1.$MACRO" 2>&1 \
  | grep -v -iE "xpc|Connection invalid|NSXPC|endpoint for|Task policy" || true

echo "---"
[[ -f "$ODM" ]] && echo "OK: wrote $ODM ($(wc -c < "$ODM") bytes)" || echo "WARN: no .odm produced"
if [[ -f "$OUT" ]]; then
  echo "OK: wrote $OUT ($(wc -c < "$OUT") bytes)"
  [[ -f "$OUT.done" ]] && echo "macro marker: $(cat "$OUT.done")"
else
  echo "FAIL: no merged .odt produced" >&2
  [[ -f "$OUT.log" ]] && { echo "--- macro log ---"; cat "$OUT.log"; }
  exit 1
fi
