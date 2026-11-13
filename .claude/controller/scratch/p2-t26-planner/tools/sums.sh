#!/bin/bash
# Writes the kit's checksums (run from the kit folder): SHA256SUMS for every kit file but the logs (gitignored, lost
# in state commits) and the proof tree; SHA256SUMS.logs for the logs.
set -euo pipefail
find HEAD.txt real stubs orig diffs tools logs -type f ! -name '*.log' ! -path '*/__pycache__/*' -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS
find logs -type f -name '*.log' -print0 | sort -z | xargs -0 shasum -a 256 > SHA256SUMS.logs
wc -l SHA256SUMS SHA256SUMS.logs
