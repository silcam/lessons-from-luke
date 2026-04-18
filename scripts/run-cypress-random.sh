#!/bin/bash
set -e
for i in 1 2 3; do
  echo "--- Randomized run $i of 3 ---"
  yarn cypress:run:random
done
