# Brief ci-parallel-jobs: Run CI's suites in parallel jobs to halve each PR's wait

You are the implementer (Haiku) for the controller's follow-up task ci-parallel-jobs, which the owner approved on 9 November 2026 to speed development up, with the controller's amendment from the 1D-T8 review's n5. You replace CI's three jobs with nine jobs that run in parallel, add the iOS export and `typecheck:routes` to CI, change the workflow test test-first, add one npm script and two lines to the handover's full gate, update the README's CI paragraph, and write the receipt. **No app, API, edge or package code changes, and no dependency or lockfile changes.** The planner wrote every file and proved it in scratch copies of the integration head `0bd5659`, and rechecked it at `857b9f2` (after 1D-T8 merged as #372, which changed only app files and its receipt): the RED, the GREEN, a control, 19 mutants and one accepted alternative, the render split on the real test names with `vitest list`, sample runs of the split's patterns through npm, the iOS export and `typecheck:routes` at the head, and the fast local gate. You copy files, run the checks and fill the receipt. Do exactly what this brief says.

Read first, in this order:

1. The protocol, which is binding: `/Users/kunanonjarat/Developer/jotbun/.claude/controller/protocol.md`. Note **R87** (the receipt is its own file, `docs/implementation/receipts/ci-parallel-jobs.md`) and **R100** (CI runs the whole suites; you run only the fast local gate in Step 6).
2. The "Planner rulings" section at the end of this brief: it says why each part is the way it is.

## Readiness (the planner's ruling, for you and the reviewer)

- **Starts after:** nothing. This is the controller's follow-up (handover.md, "ci-parallel-jobs planner"), approved by the owner on 9 November 2026. It folds in 1A-T10's review minor 1 (`followups.md`, under 1A-T10, moved here from P6C-T7); 1A-T10 merged as #363 (`4407025`). The amendment (the iOS export and `typecheck:routes` in CI) came from the controller on 9 November.
- **Nothing to set up:** no package, Cloudflare resource, secret, owner decision or account setting. The repo is private on the Free plan: up to 20 jobs run at once, and a run now uses 9.
- **Docker is stopped and must stay stopped. Never run** `npm run test:db`, `npm run test:edge:db`, `npm run db:v1:up` or `node scripts/dev-v1.mjs`: each starts Docker.
- **R100: never run locally** the full `test:render`, `export:web`, the iOS export (`export:ios`), `test:edge:workers`, the database suites or `test:ops`. This pull request's CI runs every one of them.

## Files

| File | Change | Shared? |
| --- | --- | --- |
| `.github/workflows/backend.yml` | Replaced: nine jobs (`checks`, `exports`, `render`, `sections-1`, `sections-2`, `sections-3`, `database`, `edge`, `image`). Copied whole from the kit. | P6A-T7 and P6C-T9 add steps later, P6C-T7 adds `deploy.yml`. No open pull request or in-flight task edits it. |
| `scripts/ci/backend-workflow.test.mjs` | 9 cases, 6 before: 3 new, 3 changed. Copied whole. | P6C-T7 edits it later. No open pull request or in-flight task edits it. |
| `docs/implementation/handover.md` | Two lines in the "Full gate" block (Appendix A.1). | Rarely edited (last `b1befec`, 25 October). No open pull request touches it. |
| `apps/app/package.json` | One script line, `export:ios` (Appendix A.2). | P4 tasks may add dependencies later; the line is in `scripts`. The open pull requests (#373 to #376, checked file by file) do not touch it. |
| `README.md` | The CI paragraph, 4 lines replaced by 7 (Appendix A.3). | No open pull request touches it. |
| `docs/implementation/receipts/ci-parallel-jobs.md` | Create, from the planner's template. | New. |

## Paths and rules used below

- **WT** = `/Users/kunanonjarat/Developer/jotbun/.claude/worktrees/ci-parallel`, on branch `chore/ci-parallel-jobs`, which the orchestrator cut from `origin/claude/p1a-vault-core`. Work only here. If WT does not exist, stop: BLOCKED.
- **S** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/ci-parallel-jobs-impl`, your scratch folder. Create it with `mkdir -p`. Keep logs and probe trees only there, never under `/private/tmp`.
- **PL** = `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/ci-parallel-jobs-planner`, the planner's kit. Read it and `cp` from it; never write into it. It holds:
  - `real/`: the five final repo files at their repo paths; `orig/`: the same five at `0bd5659`; `diffs/`: one diff per file;
  - `SHA256SUMS.base` (the five at `0bd5659`) and `SHA256SUMS.real` (the five final files), both with worktree paths, so you check them from WT;
  - `templates/ci-parallel-jobs.md.template`: the receipt;
  - `tools/`: `probes.mjs` (the RED, control and mutant runner; it never writes into WT), `split-check.mjs` (the render split on the real test names, with `vitest list`), `yaml-check.py` (parses the workflow with a real YAML parser), and the planner's timing tools (`steps.mjs`, `render-files.mjs`, `split-balance.mjs`, `residue-balance.mjs`, `estimate.mjs`, `run-times.mjs`);
  - `evidence/`: the CI runs the timings come from;
  - `SHA256SUMS`, the kit's own; `logs/` and `SHA256SUMS.logs`, the planner's runs. Do not check `SHA256SUMS.logs`: its `*.log` files may be missing after the kit moved machines.
- Every shell call starts in a fresh directory, so type full paths. In the commands below, WT, S and PL stand for those full paths.
  - Git: `/usr/bin/git -C WT <command>`, one git command per call.
  - npm: `cd WT && npm run <script>`.
- **If a result differs from an "Expected" line, stop and report BLOCKED with the output.** Do not change the test, the workflow, the probes or the template to make a result match.

## Step 0: Sync and check the base

1. `/usr/bin/git -C WT fetch origin claude/p1a-vault-core`, then `/usr/bin/git -C WT merge --no-edit origin/claude/p1a-vault-core`. Expected: "Already up to date." or a clean merge.
2. `/usr/bin/git -C WT rev-parse --short HEAD`. Record it as your **HEAD**. The planner measured at `0bd5659` and rechecked at `857b9f2`: the five files are the same at both (`check_kit.sh` passes), and the GREEN, the split check, `typecheck:routes` and the iOS export passed at both.
3. `mkdir -p S`, then `cd WT && shasum -a 256 -c PL/SHA256SUMS.base > S/base-check.txt 2>&1; echo exit=$?`, then `cat S/base-check.txt`. Expected: `exit=0` and five `OK` lines.
   - If `.github/workflows/backend.yml` or `scripts/ci/backend-workflow.test.mjs` is not OK: stop, BLOCKED (the RED and the mutants assume them).
   - If `docs/implementation/handover.md`, `apps/app/package.json` or `README.md` is not OK, someone changed it after the planner. **Do not `cp` that file** in Steps 2 and 3. Make its edit by hand from Appendix A. If an edit's anchor text is gone, stop: BLOCKED. Record the difference as a deviation.
4. `ls WT/docs/implementation/receipts/ci-parallel-jobs.md`. Expected: "No such file or directory".
5. The kit: `cd PL && shasum -a 256 -c SHA256SUMS > S/kit-check.txt 2>&1; echo exit=$?`, then `grep -c ': OK$' S/kit-check.txt`. Expected: `exit=0` and `46`.

## Step 1: Install

If `WT/node_modules` is missing: `cd WT && npm ci --ignore-scripts --no-audit --no-fund > S/npm-ci.log 2>&1; echo exit=$?`. Expected: `exit=0`. There is no edge install: no edge step runs locally.

## Step 2: The tests first (RED)

The workflow test reads the handover's full gate as the list of commands CI must run, so the handover's two new lines go in with the test.

1. `cp PL/real/scripts/ci/backend-workflow.test.mjs WT/scripts/ci/backend-workflow.test.mjs`
2. `cp PL/real/docs/implementation/handover.md WT/docs/implementation/handover.md` (only if its Step 0.3 line was OK; otherwise apply Appendix A.1 by hand).
3. `cd WT && node --test scripts/ci/backend-workflow.test.mjs > S/red.log 2>&1; echo exit=$?`. Expected: `exit=1`, and at the end of `S/red.log`: `ℹ tests 9`, `ℹ pass 4`, `ℹ fail 5`. The five failing cases (`sed -n '/failing tests:/,$p' S/red.log`):
   - `the workflow parser sees steps, their settings and the jobs they run in`
   - `every local gate command runs in CI with the same settings`
   - `the render suite runs every test exactly once across its jobs`
   - `each job runs its own steps, in order`
   - `the edge steps run in the edge job in order, the workers suite between the unit tests and the build`
4. `grep -A 12 "every local gate command runs in CI" S/red.log | grep "run: '"`. Expected: two lines, `run: 'npm run typecheck:routes -w gogospend-app'` and `run: 'npm run export:ios -w gogospend-app -- --max-workers 2'`: CI lacked both. Record `tests 9, pass 4, fail 5` as the RED. Every failure is an `AssertionError`, not an import error.

## Step 3: The workflow, the script and the README (GREEN)

1. `cp PL/real/.github/workflows/backend.yml WT/.github/workflows/backend.yml`
2. `cp PL/real/apps/app/package.json WT/apps/app/package.json` (only if its Step 0.3 line was OK; otherwise Appendix A.2 by hand).
3. `cp PL/real/README.md WT/README.md` (only if its Step 0.3 line was OK; otherwise Appendix A.3 by hand).
4. `cd WT && shasum -a 256 -c PL/SHA256SUMS.real`. Expected: five `OK` lines (a file you edited by hand shows FAILED; that is the recorded deviation).
5. `cd WT && node --test scripts/ci/backend-workflow.test.mjs > S/green.log 2>&1; echo exit=$?`. Expected: `exit=0`, `ℹ tests 9`, `ℹ pass 9`, `ℹ fail 0`.
6. `/usr/bin/git -C WT diff --stat`. Expected, with the cp route: `5 files changed, 277 insertions(+), 30 deletions(-)` (`backend.yml` 123 and 14, the test 144 and 12, `handover.md` 2 and 0, `package.json` 1 and 0, `README.md` 7 and 4).

## Step 4: Mutation check (in probes, never in WT)

1. `node PL/tools/probes.mjs WT S/probes all > S/probes.out 2>&1; echo exit=$?`, then `grep -v "not ok" S/probes.out`. Expected: `exit=0` and exactly these 22 lines (the failing case names under each are in `S/probes.out`):
   ```
   red      tests 9 pass 4 fail 5  fails as expected  (the new test and handover against the workflow before this task)
   control  tests 9 pass 9 fail 0  passes  (the tree's own files)
   M1       tests 9 pass 6 fail 3  fails as expected  (part 2 dropped: ids of length 3n+1 run nowhere)
   M2       tests 9 pass 6 fail 3  fails as expected  (part 2 runs part 1's pattern: 3n twice, 3n+1 nowhere)
   M3       tests 9 pass 6 fail 3  fails as expected  (part 2's pattern matches nothing: 3n+1 nowhere)
   M4       tests 9 pass 6 fail 3  fails as expected  (the last pattern stops negating part 2: 3n+1 twice)
   M5       tests 9 pass 6 fail 3  fails as expected  (the parts leave out the screen reader suite: it runs nowhere)
   M6       tests 9 pass 6 fail 3  fails as expected  (the render job excludes the whole catalogue folder: two files run nowhere)
   M7       tests 9 pass 7 fail 2  fails as expected  (the render job excludes nothing: the per-section suites run twice)
   M8       tests 9 pass 6 fail 3  fails as expected  (the screen reader path miscased in all four steps (a case-insensitive disk still finds it))
   M9       tests 9 pass 7 fail 2  fails as expected  (test:unit dropped)
   M10      tests 9 pass 7 fail 2  fails as expected  (the ops suite loses GOGOSPEND_OPS_REQUIRE_DB)
   M11      tests 9 pass 7 fail 2  fails as expected  (the workers suite moved to the database job)
   M12      tests 9 pass 8 fail 1  fails as expected  (the edge job no longer builds the API before its suites)
   M13      tests 9 pass 8 fail 1  fails as expected  (test:ops moved to the edge job)
   M14      tests 9 pass 8 fail 1  fails as expected  (if: false on a job)
   M15      tests 9 pass 8 fail 1  fails as expected  (if: on a step)
   M16      tests 9 pass 8 fail 1  fails as expected  (continue-on-error: true on a step)
   M17      tests 9 pass 7 fail 2  fails as expected  (the iOS export dropped)
   M18      tests 9 pass 7 fail 2  fails as expected  (typecheck:routes dropped)
   M19      tests 9 pass 8 fail 1  fails as expected  (the iOS export moved to the checks job)
   A1       tests 9 pass 8 fail 1  fails as expected  (not a mutant: a correct two-way split by id parity)
   ```
   Any `MISMATCH`, or exit 1: stop, BLOCKED, with `S/probes.out` and the matching `S/probes/probe-<name>.log`.
2. Which case catches what (the expected sets are in `probes.mjs`): M1 to M6 and M8 fail the render split, the local gate and the layout; M7 the render split and the layout (its suites run twice, so the local gate still finds the plain command); M9, M17 and M18 the local gate and the layout; M10 the local gate and the ops case; M11 the layout and 1A-T10's case; M12, M13 and M19 the layout only; M14 to M16 the new `if:` case only. A1 is a correct split of another shape: it passes the render split case and fails only the exact layout, so the split case checks the construction, not today's three patterns. Survivors: none.
3. `/usr/bin/git -C WT status --short`. Expected: exactly the five ` M` lines of Step 3, and nothing else.

## Step 5: The split on the real test names

`split-check.mjs` reads the render steps from WT's workflow and asks vitest (`vitest list`, which collects tests and runs none) whether the render job and the three parts run every render test exactly once.

1. `node PL/tools/split-check.mjs WT S/split > S/split.out 2>&1; echo exit=$?`, then `cat S/split.out`. Expected: `exit=0`, every check line starting `ok`, and the last line `SPLIT OK`. It takes about 25 seconds.
2. Record the lines `render files: ...`, `the --exclude step runs ...`, the three `part N: ... tests` lines and `the parts together are all ... tests` for the receipt. Their counts move with the head (R100: they are not Expected lines). At `0bd5659` the planner saw 106 render files, 104 in the render job, and 158, 194 and 214 tests in the parts, 566 together; at `857b9f2`, 108, 106, and 162, 196 and 218, 576 together.

## Step 6: The fast local gate (R100)

From WT, in this order, recording each result:

1. `node --test scripts/ci/backend-workflow.test.mjs`: the Step 3.5 GREEN.
2. `cd WT && npm run typecheck:app > S/typecheck-app.log 2>&1; echo exit=$?`. Expected: `exit=0`.
3. `cd WT && npm run typecheck:routes -w gogospend-app > S/typecheck-routes.log 2>&1; echo exit=$?`. Expected: `exit=0`. This is the new CI step, at your head.
4. `cd WT && npm run test:app > S/test-app.log 2>&1; echo exit=$?`. Expected: `exit=0` and `ℹ fail 0`; record the `ℹ tests` count.
5. `cd WT && npm run test:unit > S/test-unit.log 2>&1; echo exit=$?`. Expected: `exit=0` and `ℹ fail 0`; record the `ℹ tests` count.
6. `python3 PL/tools/yaml-check.py WT/.github/workflows/backend.yml > S/yaml.log 2>&1; echo exit=$?`, then `cat S/yaml.log`. Expected: `exit=0`, nine job lines (`checks`, `exports`, `render`, `sections-1`, `sections-2`, `sections-3`, `database`, `edge`, `image`), each ending `forbidden=[]`, and `concurrency: {'group': 'backend-${{ github.ref }}', 'cancel-in-progress': True}`.
7. `which actionlint`. Expected: nothing found; record "actionlint: not installed" (the YAML check above stands in for it).
8. `/usr/bin/git -C WT diff --check`. Expected: no output.

Not run here, recorded as "CI" (R100): the full `test:render` (CI's `render` and `sections-*` jobs), `export:web` and the iOS export (`exports`), `test:db` and `test:ops` (`database`), `test:edge:workers` and `test:edge:db` (`edge`), and the image and its smoke (`image`). Not run at all: `test:api`, `test:edge` and the builds, because no API, edge or app code changes (CI runs them too).

## Step 7: The receipt

1. `cp PL/templates/ci-parallel-jobs.md.template WT/docs/implementation/receipts/ci-parallel-jobs.md`
2. Replace each placeholder with your own result:
   - `[[HEAD]]`: your Step 0.2 short SHA.
   - `[[SPLIT]]`: `SPLIT OK` at `<HEAD>`, then your Step 5.2 lines in one sentence, for example: `SPLIT OK at 0bd5659: 106 render files, 104 in the render job and the two suites in the parts; the parts list 158, 194 and 214 tests, 566 together, none in two parts.`
   - `[[TEST_APP]]` and `[[TEST_UNIT]]`: your Step 6.4 and 6.5 counts, as `tests <n>, pass <n>, fail 0`.
   - `[[DEVIATIONS]]`: `None.`, or one short sentence per difference from this brief (a file edited by hand from Appendix A, and why).
3. `grep -c '\[\[' WT/docs/implementation/receipts/ci-parallel-jobs.md`. Expected: `0`.
4. Change nothing else in the template. The "After, measured" line stays as it is: the controller adds this pull request's CI times after it runs.
5. `grep -c $'\xe2\x80\x94' WT/docs/implementation/receipts/ci-parallel-jobs.md` (the em dash, as UTF-8 bytes). Expected: `0`.

## Step 8: Commit (locally only; never push)

1. `/usr/bin/git -C WT add .github/workflows/backend.yml scripts/ci/backend-workflow.test.mjs docs/implementation/handover.md apps/app/package.json README.md docs/implementation/receipts/ci-parallel-jobs.md`
2. `/usr/bin/git -C WT status --short`. Expected: those 6 files staged (`M ` five times, `A ` once) and nothing else. There must be no `apps/app/dist/` or `.expo/` (both gitignored; nothing in this brief writes them).
3. `/usr/bin/git -C WT diff --cached --check`. Expected: no output.
4. Commit with this summary line (ruling P13), a short body, then a blank line and the trailer:
   ```
   Run CI in nine parallel jobs and build the iOS bundle on every pull request

   The render suite runs in four jobs (the two per-section suites split
   by test name, so every test still runs once), the exports and the edge
   Worker get their own jobs, and CI now also runs the iOS export and
   typecheck:routes. The workflow test pins which job runs each step,
   checks that the render split leaves nothing out, and rejects if: and
   continue-on-error:.

   Co-Authored-By: Claude Haiku 5.5 <noreply@anthropic.com>
   ```
5. `/usr/bin/git -C WT log --oneline -1`, `/usr/bin/git -C WT show --stat HEAD` (expected, with the cp route: `6 files changed, 325 insertions(+), 30 deletions(-)`, the receipt 48 lines), and `/usr/bin/git -C WT diff --check origin/claude/p1a-vault-core...HEAD` (no output).

## Your final message

As the protocol says: `STATUS: DONE` or `STATUS: BLOCKED: <reason>` on the first line. Then the commit SHA and branch, and the 6 files; the RED (`tests 9, pass 4, fail 5`) and the GREEN (`tests 9, pass 9`); the probes (the 22 lines of `S/probes.out` without the `not ok` lines); the split check's lines; each gate command and its result; SKIPPED and CI items; deviations. Put this line first under the status: **"CI's whole suites run on this pull request's own CI, in nine jobs; the controller reads its wall time there and adds it to the receipt."**

## Planner rulings

- **P1. Nine jobs, and why each one.** The old critical path was the gate job, 574 to 734 s on 8 runs (`PL/evidence/`), because its full render suite took 359 to 457 s; the database job took 298 to 493 s. Every step stays as it was; the jobs regroup them so the slowest job is about half the old wall time:
  - `checks`: the typechecks (now with `typecheck:routes`), `test:api`, `test:app`, `test:unit`, `test:dev`, the API build, the release graph, the parser sandbox and the whitespace check (it keeps `fetch-depth: 0`). Expected 167 to 211 s.
  - `exports`: `export:web` (moved out of the old gate job) and the iOS export. Expected 183 to 237 s.
  - `render` and `sections-1` to `sections-3`: the render suite (P2). Expected 179 to 246 s and 156 to 233 s.
  - `database`: `test:db`, then `test:ops` with `GOGOSPEND_OPS_REQUIRE_DB=1`, in the same container. Expected 171 to 306 s.
  - `edge`: the six edge steps (P4). Expected 179 to 262 s.
  - `image`: unchanged, 53 to 68 s.
  The expected times come from the measured steps of the same 8 runs (`PL/tools/estimate.mjs`; `typecheck:routes` and the iOS export are estimates, see P5). Expected wall time: 214 to 309 s, median about 262 s (4.4 minutes), against 577 to 737 s, median about 626 s (10.4 minutes), measured.
- **P2. The render split.** Vitest's `--shard` splits by file, and the catalogue suite (`src/dev/catalogue/CatalogueScreen.render.test.tsx`) took 386 and 393 s alone in one worker on the latest runs, and the screen reader suite (`screenReader.render.test.tsx`) 122 and 127 s. So the shard holding the catalogue could never get under about 6.5 minutes. Both files are one test per catalogue section (`section <id> renders ...` and `section <id>: every control has a name ...`), so CI splits them by test name, and runs every other render file in one job (`--exclude` for exactly those two files).
  - The parts follow the length of the section id: a multiple of 3 (`^section (?:[a-z0-9-]{3})+(?![a-z0-9-])`), one more than a multiple of 3 (`^section (?:[a-z0-9-]{3})*[a-z0-9-](?![a-z0-9-])`), and everything else (`^(?!A)(?!B)` of those two: ids two more than a multiple of 3, and the catalogue's other cases). Ids are `[a-z0-9]+(-[a-z0-9]+)*` (the catalogue's registry case enforces it).
  - **Nothing can be dropped:** the third pattern is the other two negated, so every test name matches one part. The workflow test checks that construction on the YAML's own patterns, compiled with `new RegExp(pattern)` as vitest does (`resolved.testNamePattern`, vitest 4.1.12), and on sample names that every name matches exactly one part. On the real names at `0bd5659`, `vitest list` gives 158, 194 and 214 tests, 566 together (the two files' 293 and 273), with no test in two parts and none missing; a narrowed real run of each pattern shape through `npm run test:render -w gogospend-app --` passed, and npm 11 passes the patterns byte for byte (`PL/logs/split/`).
  - Why the length: by first letter, the slowest sections cluster (the `import-*` screens take 5 to 10 s each), and the P2 plan's 90 coming `bw-*` sections would all land in one part. Length modulo 3 spreads them: the parts held 106, 131 and 148 s of the catalogue on the latest run, against 174 and 211 s for a two-way split by parity. A four-way split later is one more part (Notes for the integrator).
  - Vitest exits 0 when `-t` matches nothing (`PL/logs/split/run-none.log`), so a broken positive pattern alone would not fail CI. That is why the construction, not the exit code, is what the test pins.
- **P3. The render job excludes exactly two files.** Each `--exclude` names one file, and each part names the same two files. A folder glob (`src/dev/catalogue/**`) would also drop `catalogueRoute.render.test.tsx` and `largeText.render.test.tsx` (mutant M6). The test checks that both lists are the same set and that each file is there with exactly that spelling, by listing its folder, since `existsSync` alone ignores case on macOS (mutant M8).
- **P4. The edge job.** The six edge steps keep their order, now in `edge`, after `npm run build -w gogospend-api` (the differential run needs the built NestJS server; mutant M12). `test:edge:db` starts its own PostgreSQL container: `apps/edge`'s `test:db` script begins with `node ../../scripts/dev-v1.mjs db-up`, whose `db-up` mode only runs `docker compose up -d --wait postgres`. Each test database and its roles are made by the API's harness (`createTestDatabase`, migrations from `0001`). Pulling and starting the container takes about 18 s (it was inside `test:db`'s time before).
- **P5. The amendment: the iOS export and `typecheck:routes`.**
  - `typecheck:routes` goes in `checks`, after `typecheck:app`: it is the same `tsc` run with Expo Router's generated routes (`apps/app/scripts/typecheck-with-routes.mjs`). It passed at `0bd5659` and `857b9f2` (`PL/logs/typecheck-routes*.log`). Its CI time is estimated as `typecheck:app`'s, 11 to 15 s.
  - The iOS export gets an npm script, `"export:ios": "expo export --platform ios"`, beside `export:web`, and CI runs `npm run export:ios -w gogospend-app -- --max-workers 2`, the same shape as the web export's step. It writes the default `apps/app/dist`, which `.gitignore` already covers. GitHub Actions sets `CI=true`, so the script needs no `CI=1`. The controller's command (`CI=1 npx expo export --platform ios --max-workers 2 --output-dir <a temporary dir>`, as `baseline.sh` runs it) differs only in the output folder, which CI throws away with the runner.
  - Both go in `exports`, where the web export now runs: `checks` would have grown to about 5 minutes with them. Both are also new lines of the handover's full gate, so the local-gate case requires them in CI (mutants M17 and M18), as well as the layout case.
  - **The iOS export has not run on Linux before.** The planner ran it at `0bd5659` and again at `857b9f2`, on macOS, through the new script with `CI=1`: exit 0, 5757 and 5760 modules, a 15 MB Hermes bytecode bundle (`PL/logs/export-ios.log`, `PL/logs/export-ios-857b9f2.log`). The `hermes-compiler` package ships a Linux `hermesc` (an executable x86-64 ELF), which the iOS export needs on CI. If this pull request's `exports` job fails on the iOS export, that is a finding for the controller, not something to work around here. The planner ran it locally although R100 keeps the iOS export in CI, because a step that fails at the head would turn every pull request red. Its CI time is estimated at 1.2 times the web export plus 15 s for `hermesc`, 80 to 112 s.
- **P6. The test changes.** New: `the render suite runs every test exactly once across its jobs` (P2, P3); `each job runs its own steps, in order` (which job runs each step, the controller's ask; a layout change updates this list in the same commit); `no job or step can be switched off: no if: and no continue-on-error:` (P7). Changed: the parser case's job names; the local-gate case accepts the render command when the split passes (`renderSplitProblems` returns `[]`), and otherwise still requires the plain command; 1A-T10's case pins the six edge steps in `edge`. `workflowRuns` and `localGate` do not change. The new helpers (`RENDER`, `sampleNames`, `renderSplitProblems`) are exported like the old ones.
- **P7. 1A-T10's minor 1 is its own case.** The follow-up's regex, `/^\s*(?:-\s+)?(?:if|continue-on-error):/m`, runs on the whole workflow, so it covers every job and step (mutants M14 to M16), and a failure names the problem. The follow-up said to add it at the end of 1A-T10's case; as its own case it does not depend on the edge steps.
- **P8. Timeouts.** Every npm job stops after 20 minutes (45 before). Each now takes under 6 minutes on the slowest measured runner, so 20 leaves more than three times the room, and a hung job stops 25 minutes sooner. The image job keeps its 30.
- **P9. What does not change, and what is not used.** The triggers, `permissions: contents: read`, `concurrency` with `cancel-in-progress: true`, `NODE_VERSION`, the two actions (same commits) and the image job stay as they were; no secret, deploy or hosted service is added. Not used: `needs:` (it would make jobs wait), `strategy: matrix` and YAML anchors (the test's line reader reads plain jobs, and explicit jobs keep the layout readable), and a local composite action for the shared setup (the pinned-by-commit case rejects a local `uses:`).
- **P10. The README.** Its CI paragraph described the three jobs this task replaces (and already named Node 24.22.0 and left out the edge steps), so it now lists the nine. The suite table above it ("Count at v0.1.0") is a record of v0.1.0 and stays.
- **P11. Cost.** Each npm job pays its own `npm ci` (20 to 42 s with the cache), so a typical run (42630710521) would take about 31 billable minutes instead of 18, and a run uses 9 of the Free plan's 20 concurrent jobs: two runs at once fit, a third queues. Merging `image` into `exports`, or splitting the per-section suites two ways instead of three, would each save a job, at less headroom (P2). The slowest runs are set by `database`, when `import-confirmation.integration.spec.ts` is slow (206 s in run 42644425491, 71 s in run 42630710521); one file cannot be split by `jest --shard`, so speeding that suite up is the next step if every run must stay under 5 minutes.
- **P12. The gate (R100).** The focused test file RED to GREEN; `typecheck:app` and `typecheck:routes` (the new CI step); `test:app` and `test:unit`, because `apps/app/package.json` changes; the YAML parse (actionlint is not installed); `git diff --check`. No export runs locally (R100; see P5 for the planner's one iOS run). The whole suites are this pull request's CI.
- **P13. The commit summary line** says what a reader of the history needs: CI runs in parallel jobs, and the iOS bundle is now built on every pull request.
- **P14. 1A-T10's nits.** The workflow's header line "it has not run on GitHub yet (E4)" is gone with the rewritten header. The edge case's comment "in the local gate's order" stays: it is true, though nothing checks it.

## For the reviewer and the controller

- **How this behaves on open pull requests.** A `pull_request` run checks out the merge of the head into the current base, so an open pull request (#374, #375 and #376 were open into the integration branch when the planner finished) runs the nine jobs the next time CI runs on a new merge ref. None of them edits the workflow, the test or the handover, so they pass whenever their code passes every suite. `merge_task_pr.sh` needs every check to pass, whatever the names; `main` has no required checks.
- **Check first:**
  - `renderSplitProblems` against the workflow's four render steps, and the probe output (Step 4);
  - the layout case's list against the YAML, job by job;
  - the `edge` job's container (P4) and the `exports` job's iOS step (P5);
  - this pull request's CI: nine jobs green. The render suite is whole when the `render` job's passed tests plus the three `sections-*` jobs' passed tests equal the full suite (at `857b9f2`: 1289 + 162 + 196 + 218 = 1865 tests, 106 + 2 files, the totals run 42644425491 ran in one job), and each `sections-*` job skips exactly the other parts' tests (at `857b9f2`, `Tests  162 passed | 414 skipped (576)` and so on).
- **After CI runs:** `node PL/tools/run-times.mjs <run-id>` prints each job's time and the wall time. Add them to the receipt's "After, measured" line (a one-file housekeeping commit after the merge, or a fix round before it).
- **Notes to update elsewhere:** P6C-T7 no longer carries 1A-T10's minor 1 (`followups.md`). Briefs and receipts that say "CI's database job runs `test:edge:db`" now mean the `edge` job. P6A-T7's `check:native` step goes in `checks`, and updates the layout case.
- The planner's numbers at `0bd5659`: RED `tests 9, pass 4, fail 5`, GREEN `9, 9`; probes as in Step 4; split check `SPLIT OK` (106 files, 104 + 2; parts 158, 194 and 214 of 566); `typecheck:app`, `typecheck:routes` exit 0; `test:app` 34, `test:unit` 922; the iOS export exit 0 (5757 modules). Rechecked at `857b9f2`: GREEN `9, 9`; `SPLIT OK` (108 files, 106 + 2; parts 162, 196 and 218 of 576); `typecheck:routes` exit 0; the iOS export exit 0 (5760 modules); `check_kit.sh` passes. Logs: `PL/logs/`.

## Appendix A: the edits to hand-apply if a base file changed (Step 0.3)

`backend.yml` and the test are always copied whole (Step 0.3 stops if their base differs).

### A.1 `docs/implementation/handover.md`

In the fenced block under `**Full gate**`:
- directly after the line `npm run typecheck:app`, add the line `npm run typecheck:routes -w gogospend-app`;
- directly after the line `npm run export:web -w gogospend-app -- --max-workers 2`, add the line `npm run export:ios -w gogospend-app -- --max-workers 2`.

Nothing else changes. The file gains 2 lines.

### A.2 `apps/app/package.json`

In `scripts`, directly after the line `    "export:web": "expo export --platform web",`, add:
```
    "export:ios": "expo export --platform ios",
```
Nothing else changes; no dependency and no lockfile change.

### A.3 `README.md`

Replace these four lines:
```
CI (`.github/workflows/backend.yml`) runs three jobs on Ubuntu with Node 24.22.0:
1. typecheck, unit, render, build and web export;
2. SQL integration and ops against a PostgreSQL 17 container;
3. a release-image build with a smoke test. The image is never pushed.
```
with these seven:
```
CI (`.github/workflows/backend.yml`) runs nine jobs in parallel on Ubuntu, with the release image's Node, so a pull request waits for the slowest job rather than for all of them:
- typecheck (also with Expo Router's typed routes), unit and API tests, and the API build;
- the web and iOS exports;
- the render suite in four jobs: every render file but the two per-section suites, and those two suites in three parts by test name;
- SQL integration and ops against a PostgreSQL 17 container;
- the edge Worker: types, unit tests, the workerd suites and the build, then its PostgreSQL suites;
- a release-image build with a smoke test. The image is never pushed.
```
