#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Prototype for the Q2 pagination fix (planning direction): make each lesson
# begin on an odd/right-hand page with an auto-inserted blank verso.
#
# Mechanism: the lesson first-page master "First_20_Page" uses page-layout
# "Mpm2" (exclusive to it). Setting style:page-usage="right" on that layout
# makes LibreOffice place every lesson's first page on a right/odd page and
# insert a blank verso where needed (PrintEmptyPages is already true). This is
# a post-merge styles.xml edit — no re-flow of content.
#
# Usage: ./apply-odd-page-fix.sh <assembled.odt> [out.odt]
# ---------------------------------------------------------------------------
set -euo pipefail

IN="${1:?usage: apply-odd-page-fix.sh <assembled.odt> [out.odt]}"
OUT="${2:-${IN%.odt}-oddpage.odt}"
LAYOUT="${SPIKE_LAYOUT:-Mpm2}"     # the lesson first-page page-layout
# Resolve OUT to an absolute path (the repackage step cd's into $WORK).
mkdir -p "$(dirname "$OUT")"
OUT="$(cd "$(dirname "$OUT")" && pwd)/$(basename "$OUT")"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

unzip -q -o "$IN" -d "$WORK"

# Insert style:page-usage="right" into the <style:page-layout style:name="Mpm2" ...>
# opening tag (only the definition, not references). Idempotent.
python3 - "$WORK/styles.xml" "$LAYOUT" <<'PY'
import re, sys
path, layout = sys.argv[1], sys.argv[2]
xml = open(path, encoding="utf-8").read()
pat = re.compile(r'(<style:page-layout\b[^>]*\bstyle:name="%s")' % re.escape(layout))
def add(m):
    tag = m.group(1)
    if "style:page-usage" in tag:
        return re.sub(r'style:page-usage="[^"]*"', 'style:page-usage="right"', tag)
    return tag + ' style:page-usage="right"'
xml, n = pat.subn(add, xml, count=1)
if n == 0:
    sys.exit("ERROR: page-layout %s not found in styles.xml" % layout)
open(path, "w", encoding="utf-8").write(xml)
print("patched page-layout %s -> page-usage=right" % layout)
PY

# Repackage as a valid ODF: mimetype MUST be the first entry and STORED
# (uncompressed), everything else deflated.
rm -f "$OUT"
( cd "$WORK" && zip -q -X -0 packed.zip mimetype \
              && zip -q -rX packed.zip . -x mimetype -x packed.zip )
mv "$WORK/packed.zip" "$OUT"
echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
