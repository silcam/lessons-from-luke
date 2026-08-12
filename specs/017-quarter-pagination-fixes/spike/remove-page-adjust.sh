#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# 017 US1-T2 (contracts/pagination-and-assembly.md §1): remove the
# `text:page-adjust` attribute from the `Front_20_matter` master's footer
# page-number field in a quarter-styles-template .odt asset, in place.
#
# Technique: extract styles.xml, strip the attribute with a targeted regex
# (only the `text:page-number` field's `text:page-adjust="..."` attribute —
# nothing else in the file matches that field-plus-attribute shape), then
# update the single styles.xml zip entry in place. `zip`'s update-in-place
# on an existing archive rewrites only the named entry's data and its
# central-directory record; it does not touch, reorder, or recompress any
# other entry, so `mimetype` (already stored first/uncompressed in every
# committed asset) stays exactly where it is. This is the in-place
# alternative to rezipWithMimetypeFirst.ts's full extract-and-repack, named
# in the contract as an equally valid technique for a single-entry edit.
#
# Usage:  ./remove-page-adjust.sh <asset.odt>
#
# Verifies the archive's entry list is otherwise unchanged and that exactly
# one `text:page-adjust` occurrence was removed from styles.xml.
# ---------------------------------------------------------------------------
set -euo pipefail

ASSET="${1:?usage: remove-page-adjust.sh <asset.odt>}"
[[ -f "$ASSET" ]] || { echo "ERROR: file not found: $ASSET" >&2; exit 1; }
ASSET="$(cd "$(dirname "$ASSET")" && pwd)/$(basename "$ASSET")"

WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

before_entries="$WORKDIR/before-entries.txt"
unzip -l "$ASSET" | awk 'NR>3 {print $4}' | sed '/^$/d' | sed '$d' | sort > "$before_entries"

unzip -o -q "$ASSET" styles.xml -d "$WORKDIR"
before_count=$(grep -o 'text:page-adjust="[^"]*"' "$WORKDIR/styles.xml" | wc -l | tr -d ' ' || true)
if [[ "$before_count" -ne 1 ]]; then
  echo "ERROR: expected exactly 1 text:page-adjust occurrence in $ASSET, found $before_count" >&2
  exit 1
fi

# Strip only the text:page-adjust="..." attribute (with its leading space),
# leaving the rest of the text:page-number field element untouched.
sed -E 's/ text:page-adjust="[^"]*"//g' "$WORKDIR/styles.xml" > "$WORKDIR/styles.xml.new"
after_count=$(grep -o 'text:page-adjust="[^"]*"' "$WORKDIR/styles.xml.new" | wc -l | tr -d ' ' || true)
if [[ "$after_count" -ne 0 ]]; then
  echo "ERROR: text:page-adjust still present after edit ($after_count occurrences)" >&2
  exit 1
fi
mv "$WORKDIR/styles.xml.new" "$WORKDIR/styles.xml"

# Update the single styles.xml entry in place. No -0/-X flags needed here:
# we are not touching mimetype, and zip's default update-in-place leaves
# every other entry (including mimetype's position and store method)
# untouched.
(cd "$WORKDIR" && zip -q "$ASSET" styles.xml)

after_entries="$WORKDIR/after-entries.txt"
unzip -l "$ASSET" | awk 'NR>3 {print $4}' | sed '/^$/d' | sed '$d' | sort > "$after_entries"
if ! diff -q "$before_entries" "$after_entries" >/dev/null; then
  echo "ERROR: archive entry list changed by the edit" >&2
  diff "$before_entries" "$after_entries" >&2 || true
  exit 1
fi

echo "OK: removed 1 text:page-adjust occurrence from $(basename "$ASSET")'s styles.xml"
