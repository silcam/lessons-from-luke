#!/bin/bash
set -e

echo "=== Phase 4: Test Reliability Verification ==="

echo ""
echo "--- Run 1: Default order ---"
yarn test:once

echo ""
echo "--- Run 2: Reverse order ---"
yarn test:reverse

for i in 1 2 3 4 5; do
  echo ""
  echo "--- Randomized run $i of 5 ---"
  yarn test:random
done

echo ""
echo "=== All 7 verification runs passed. Test suite is deterministic. ==="
