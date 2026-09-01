#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 017 spike: assemble an EXPLICIT list of .odt files into one editable .odt
# via LibreOffice headless, reusing the 007 spike's Assemble macro (which
# already reads SPIKE_FILES as a newline-separated absolute-path list). This
# generalizes 007's assemble.sh (which only builds a full TOC+13-lesson
# quarter) to arbitrary small constituent sets, needed for the R2
# discriminating check (research.md) and other targeted merges.
#
# Usage:  ./assemble-files.sh <outfile.odt> <file1.odt> [file2.odt ...]
# ---------------------------------------------------------------------------
set -euo pipefail

OUT="${1:?usage: assemble-files.sh <outfile.odt> <file1.odt> [file2.odt ...]}"
shift
SPIKE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOFFICE="${SOFFICE:-soffice}"

# macOS-only fix for a Claude-Code-harness-specific hang: the Aqua VCL backend
# spins up an NSApplication that needs its run loop pumped by a real
# foreground terminal session; under this harness's Bash tool (no controlling
# TTY / not truly foregrounded) it wedges indefinitely at ~0% CPU inside
# Application::Yield, exactly as 007's FINDINGS.md caveat 3 documents. Forcing
# the headless "svp" VCL plugin bypasses Aqua entirely (no windowing, no
# run-loop dependency) and the same macro completes normally. Safe to leave
# set on Linux too (svp is also the production headless backend there).
export SAL_USE_VCLPLUGIN="${SAL_USE_VCLPLUGIN:-svp}"

files=()
for f in "$@"; do
  [[ -f "$f" ]] || { echo "ERROR: file not found: $f" >&2; exit 1; }
  files+=("$(cd "$(dirname "$f")" && pwd)/$(basename "$f")")
done
[[ ${#files[@]} -gt 0 ]] || { echo "ERROR: no input files given" >&2; exit 1; }

mkdir -p "$(dirname "$OUT")"
echo "Assembling ${#files[@]} file(s) -> $OUT"

if pgrep -x soffice >/dev/null 2>&1 || pgrep -f "MacOS/soffice" >/dev/null 2>&1; then
  echo "ERROR: another soffice instance is running; close it first (LO is single-instance)." >&2
  exit 1
fi

PROFILE_ROOT="$(mktemp -d)"
PROFILE="$PROFILE_ROOT/spike-profile"
cleanup() { rm -rf "$PROFILE_ROOT"; }
trap cleanup EXIT

warm="$PROFILE_ROOT/warm.txt"
echo "warmup" > "$warm"
"$SOFFICE" --headless --norestore --nologo \
  "-env:UserInstallation=file://$PROFILE" \
  --convert-to odt --outdir "$PROFILE_ROOT/warm_out" "$warm" >/dev/null 2>&1
mkdir -p "$PROFILE/user/basic/Standard"
cp "$SPIKE_DIR/macro-template/basic/Standard/Module1.xba" \
   "$PROFILE/user/basic/Standard/Module1.xba"
cp "$SPIKE_DIR/macro-template/basic/Standard/script.xlb" \
   "$PROFILE/user/basic/Standard/script.xlb"
rm -f "$PROFILE/.lock"

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
