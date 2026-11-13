#!/bin/zsh
# The planner's: writes SHA256SUMS (every kit file but the .log files, the working copies and
# itself) and SHA256SUMS.logs (every .log file under proof/). Paths are relative to this folder.
# Not covered by either: tree/ and dry/ (the planner's working copies), checks/ (applycheck.sh's).
setopt extended_glob null_glob
kit=${0:A:h}
cd $kit || exit 1
proof=(proof/**/*(.))
kept=(SHA256SUMS.base applycheck.sh locked.sh make-diffs.sh make-sums.sh mutants.py diffs/*.diff(.) orig/**/*(.) real/**/*(.) ${proof:#*.log})
logs=(${(M)proof:#*.log})
shasum -a 256 ${(o)kept} > SHA256SUMS
shasum -a 256 ${(o)logs} > SHA256SUMS.logs
print "SHA256SUMS: $(wc -l < SHA256SUMS | tr -d ' ') files; SHA256SUMS.logs: $(wc -l < SHA256SUMS.logs | tr -d ' ') logs"
