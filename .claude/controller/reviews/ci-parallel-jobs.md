# Review: ci-parallel-jobs Run CI's suites in parallel jobs to halve each PR's wait, PR #377

- Reviewer: Opus, final review from a two-lens workflow, 10 Nov 2026. Read-only; every probe ran in a scratch copy.
  - The lenses: "split" covers the render split and the test's pins. "ci" covers the workflow's semantics and this PR's CI evidence.
  - Neither lens raised a blocker or a major, so no skeptic ran. Every finding below is the lens's, with its severity and carrier. I spot-checked each one (see "What was checked").
- Range: `origin/claude/p1a-vault-core...46b30a0` on `chore/ci-parallel-jobs`: one commit on `4850463`, 6 files (`backend.yml`, the workflow test, `handover.md`, `apps/app/package.json`, `README.md` and the receipt).
  - After `git fetch` the integration head is `ee12d43`. Since `4850463` it has gained #375, #374 and #376: 28 app files, 10 new routes and one new render file.
  - None of the PR's own files changed on the base, so the merge is clean (`mergeStateStatus` CLEAN).
- Spec: the brief `briefs/ci-parallel-jobs.md` (P1 to P14). The brief is the spec, because this follow-up is not in the backlog. Also R100 with its 1D-T8 correction, 1A-T10's minor 1 (`followups.md:110`), the implementer's logs in `scratch/ci-parallel-jobs/`, and `receipts/ci-parallel-jobs.md`.
- Scratch folder `/Users/kunanonjarat/Developer/jotbun/.claude/controller/scratch/ci-parallel-review/`:
  - `split/r2/`: the split lens's tree (a byte-identical `git archive 46b30a0`, sha256 `c8a91b2f`), its mutant runner `tools/review-mutants.mjs` and `tools/wrap-probe.mjs`, the split checks, and the planner sample.
  - `ci/r2/`: the nine job logs of run 42652925056, the old runs' logs and times, `setup-check.out`, `steps-compare.out`, and the `typecheck:routes` probe at the head.
  - `synth/`: my spot-checks (`run-times-42652925056.txt`, `ban-spot-check.mjs` and `.out`, and `backend-46b30a0.yml`).
- Integrity:
  - The worktree is clean at `46b30a0`. That is also `origin/chore/ci-parallel-jobs` and PR #377's head.
  - `apps/app/package.json` gains one script line and `handover.md` two lines, exactly as the brief's Appendix A.1 and A.2 say. There is no app, API, edge or package code change, and no dependency or lockfile change.

**VERDICT: Approved.** There is no blocker and no major.

- CI on #377 is green: nine of nine jobs, attempt 1, in run 42652925056.
  - Wall time is 285 s, inside the brief's 214 to 309 s.
  - The old three-job workflow took 737 s on the same content, and 615 to 747 s in the same hour.
- The render suite is whole.
  - 1289 + 162 + 196 + 218 = 1865 tests over 106 + 2 files. These are the totals the old single render job ran.
  - Each `sections-*` job skips exactly the other two parts' tests.
- The three patterns put every name in exactly one part. The split lens checked 9,188,891 names.
- The iOS export's first Linux run passes: 5760 modules and a 15 MB Hermes bundle.
- Every old step still runs, once. The only new steps are `typecheck:routes` and `export:ios`.
- There are three minors:
  - m1: the only run was against an old base. Before merging, the controller should get a fresh nine-job run on the current base.
  - m2: the `if:` ban misses quoted and spaced keys.
  - m3: the split case checks for doubled tests only on sample names.
- There are seven nits.

---

## Findings

### Blocker

None.

### Major

None.

### Minor

**m1 (ci-m1). PR #377's only CI run was against an old base. No nine-job run, and no CI iOS export, has built the tree this merge would create.**

- **Which tree CI built:**
  - The `checks` job's log, line 131, reads: `HEAD is now at c56e0e4 Merge 46b30a09942269eda0a98fbdaa197aaf7f70cfc6 into 4850463378b77a284b1451c3ed247f8dc597a1dd`.
  - `gh pr view 377` still gives `baseRefOid` `4850463` and `potentialMergeCommit` `c56e0e4`.
- **How far the base has moved:**
  - The integration head is now `ee12d43`, after #375 (`a915f95`), #374 (`1c14dd1`) and #376 (`712574d`).
  - They add 10 routes (`apps/app/app/spend/slips/*.tsx`) and a new render file (`src/slips/sharedSlipResources.render.test.tsx`), and change two other render files.
  - At the head, the render suite is 109 files and 1867 tests, against #377's 108 and 1865. This is run 42655149587 on `712574d`, promotion PR #381's run on the old workflow. `ee12d43` adds controller state only: the diff over `apps`, `packages`, `.github`, `scripts` and the lockfiles is empty.
- **The iOS export has not run on the head:**
  - The controller's own `.claude/controller/handover.md:78` reads "iOS not measured at the head (computed 5772: 5760 with 1D-T8 plus P4-T12's 12 modules)".
  - The controller's last iOS export ran on P4-T12's own branch `8b9e16e` (5769 modules), which did not include 1D-T8.
- **The other new step is proven at the head.** The CI lens ran `typecheck:routes` on `ee12d43` plus the PR's six files:
  - as committed, it exits 0;
  - with `/spend/slips/review` changed to `/spend/slips/reviewx`, it exits 2 (TS2820), while `typecheck:app` exits 0.
  - Logs: `ci/r2/typecheck-routes-head-merge.log`, `typecheck-routes-mutant.log` and `typecheck-app-mutant.log`. Probe: `ci/r2/probe-typecheck-routes-at-head.sh`.
- **The risk is small, but the merge script would not catch it:**
  - My check: the 28 changed app files add no dependency, lockfile change, app config or `.ios.`/`.native.` file.
  - The web export bundled the same code in run 42655149587.
  - Still, once this merges, a failing iOS export turns every pull request red.
  - `merge_task_pr.sh` checks only that the head starts with the reviewed SHA and that every check passed (lines 13 to 15). As things stand, it would merge on `c56e0e4`'s green.
- **Carrier: follow-up (the controller, before `merge_task_pr.sh 377 46b30a0`).** Get a fresh nine-job run on the current base, for example by closing and reopening #377, so that the reviewed head stays the same.
  - The workflow's `pull_request:` has no `types:`, so `reopened` triggers a run.
  - Re-running the old run's jobs is not enough: a re-run keeps the original commit, `c56e0e4`.
  - The new `checks` log should read `Merge 46b30a0... into <current integration head>`.
  - Expected counts, if no catalogue section changes first: render 107 files and 1291 tests, and sections 162, 196 and 218 of 576. No catalogue, sections or registry file has changed since `4850463`.

**m2 (split-1). The ban on `if:` and `continue-on-error:` misses other YAML spellings of the same keys** (P7, 1A-T10's minor 1).

- `scripts/ci/backend-workflow.test.mjs:281` checks the workflow with `/^\s*(?:-\s+)?(?:if|continue-on-error):/m`, the regex that 1A-T10's follow-up prescribed (`followups.md:110`).
- Six mutants each pass all 9 cases, while js-yaml reads their key as `if` or `continue-on-error`:

| Mutant | Change | Result |
| --- | --- | --- |
| G1 | `"if": false` on the `sections-3` job | SURVIVES, 9 of 9 |
| G2 | `'continue-on-error': true` on the `test:edge:workers` step | SURVIVES, 9 of 9 |
| G3 | `if : false` on the `database` job | SURVIVES, 9 of 9 |
| G4 | `- 'if': false` as the first key of a step, with `run:` under it (`test:db`) | SURVIVES, 9 of 9 |
| G5 | `continue-on-error : true` on the render step | SURVIVES, 9 of 9 |
| G7 | the explicit-key form `? if` / `: false` on the `image` job | SURVIVES, 9 of 9 |

- This is exactly the case 1A-T10's minor 1 asked the test to catch: a step switched off while every other case passes.
- G6 (an inline-map step, `{ if: false, run: npm run test:db }`) is killed, but only because the line reader loses the step.
- Quoted keys are ordinary YAML (the `"on":` habit), so G1, G2 and G4 are forms someone might plausibly write. GitHub's own parser was not run.
- Fix: the lens's widened regex, `/(?:^\s*(?:-\s+)?(?:\?\s+)?|[{,]\s*)(["']?)(?:if|continue-on-error)\1\s*(?::|$)/m`. It matches G1 to G7 and does not match the committed workflow.
- My spot-check agrees on standalone snippets (`synth/ban-spot-check.out`, js-yaml 4.3.2):
  - All six spellings parse as the key.
  - The committed regex misses all six and catches the plain forms (M14, M16).
  - The widened regex catches all eight, with no match on `backend.yml` at `46b30a0`.
- Probe: `split/r2/review-mutants.out` (tool `split/r2/tools/review-mutants.mjs`; probe trees in `split/r2/review-mutants/G1` to `G7`).
- **Carrier: P6C-T7** (it edits this test next).

**m3 (split-2). `renderSplitProblems` proves that no test is dropped, but checks for doubled tests only on its sample names.**

- How the check works (`backend-workflow.test.mjs:151-163`):
  - The last pattern must be the others negated, so every name matches at least one part.
  - Whether a name can match two parts is tested only on `sampleNames()`. Their ids are prefixes of `abc...789-` (`:116-124`).
- Two mutants keep the construction but overlap:
  - S2: part 1 gains a top-level `|tour`, and part 3 negates the new part 1.
  - S3: part 2 gains an `|import-[a-z0-9-]*` branch, and part 3 negates the new part 2.

  Both pass the split case, and only the exact layout list kills them (`tests 9, pass 8`). The layout case's comment asks that any deliberate change update that list in the same commit. With the list updated that way, all 9 cases pass (S2L, S3L).
- On the real names, the planner's split-check (`vitest list`) shows the doubled tests:
  - S2: 4 tour cases in two parts (166 + 196 + 218 of 576);
  - S3: 10 tests of `import-*` sections whose id length is a multiple of 3, such as `import-conflict`, in two parts (162 + 222 + 202 of 576).
- Today's three patterns are not affected. The layout case pins them, and the lens's property check found that every name matches exactly one (`split/r2/pattern-property.out`).
- The gap matters for the next split. The receipt (line 47) tells the integrator that the split case accepts "any number of parts built that way". The consequence would be doubled tests and CI time, never a dropped test.
- Fix:
  - Reject a top-level `|` in every pattern but the last, or require the `^(?:...)` form.
  - Add real-shaped samples, such as registry ids like `import-conflict` and a prefixed name like `x section abc ...`.
- Probes: `split/r2/review-mutants.out` (S2, S3, S2L, S3L), `split/r2/split-S2.out` and `split/r2/split-S3.out`.
- **Carrier: P6C-T7.**

### Nit

**n1 (ci-n1). The render job is the critical path, 37 s over its estimate. The receipt's scaling note covers only the sections jobs.**
- `run-times.mjs 42652925056` reads `283 s run ... Render (every file but the per-section suites)`, against brief P1's 179 to 246 s. This job sets the 285 s wall time.
- Its test step took 227 s (vitest: `Duration 226.54s`, tests 268.82 s).
- For the same 106 files, the old run 42644425491 spent about 231 s of test time: 750.90 s in all, less the catalogue's 393 s and the screen reader's 127 s. This is one sample, so a slower runner is plausible.
- The three sections jobs ran 162 to 210 s, 73 to 121 s under the render job.
- Receipt line 47 plans only a four-way sections split. Nothing says what to do when the render job (106 files, growing with every screen) passes the wall budget, for example `vitest --shard` across two jobs.
- Probe: `ci/r2/run-times-42652925056.txt`.
- **Carrier: follow-up** (the controller's "After, measured" housekeeping line: record that render is the critical path at 283 s).

**n2 (split-3). A describe wrapper in either per-section file would send all of that file's tests to `sections-3` without warning (each still runs once).**
- How vitest 4.1.12 matches `-t`:
  - It matches with `getTaskFullName(t).match(namePattern)` (`node_modules/@vitest/runner/dist/chunk-artifact.js:964`).
  - The full name is the describe titles and the test name, joined by spaces (`:1006-1008`).
  - Top-level tests have no parent suite, which is why today's names start with `section`.
- The lens's probes:
  - W1 wraps screenReader's `test.each` in `describe('screen reader')`. The split check still reads SPLIT OK, but the parts go from 162/196/218 to 81/98/397, with all 278 screen reader tests in part 3.
  - W12 adds odd cases: a capital or an underscore in the id, `sections ...`, `describe('section')` and `describe('catalogue')`. Each lands in exactly one part as predicted, and 585 of 585 run once.
- The workflow test still passes 9 of 9 on that tree, and split-check does not run in CI, so nothing reports the imbalance.
- Wrapping the catalogue file would put its roughly 390 s suite back in one job (`sections-3`). That was the critical path before the split, though it is still under the 20-minute timeout.
- Fix: a comment at both `test.each` calls saying that CI splits them by full test name, so they stay top-level.
- Probes: `split/r2/split-W1.out`, `split/r2/split-W12.out` and `split/r2/tree-w-node-test.log` (tool `split/r2/tools/wrap-probe.mjs`).
- **Carrier: follow-up.**

**n3 (split-4). The case "no job or step can be switched off" checks only `if:` and `continue-on-error:`.**
- These mutants pass all 9 cases:
  - G8: a step-level `shell: 'true {0}'` on the render step. It runs `true <script>`, which exits 0 without running anything.
  - G11: a job-level `defaults: run: shell: 'true {0}'` on `sections-1`.
  - G9: the same default at the workflow level.
  - T1: `pull_request: paths: ['README.md']`, which skips the whole workflow on every other pull request. The test did not pin the triggers before this task either.
- These are deliberate shapes, unlikely to happen by accident. The same check could also reject `shell:` and `defaults:`, and the triggers could be pinned.
- Probe: `split/r2/review-mutants.out` (G8, G9, G11, T1).
- **Carrier: follow-up.**

**n4 (split-5). `appFileExists` checks the case of the file name but not of its folders.**
- `backend-workflow.test.mjs:111-114` lists only the file's own folder.
- S5 puts `src/dev/Catalogue/` in the four steps and in the layout list. It passes 9 of 9 on macOS's case-insensitive disk.
- On Linux, both suites would run twice:
  - vitest's `--exclude` glob would not match the real path;
  - the parts' file filter is a case-insensitive substring match (`vitest/dist/chunks/cli-api.B0Pz1_R7.js:10927-10936`).
- CI still catches it: the workflow test runs in `test:ops` on Linux, where `existsSync` fails. Only a local macOS run misses it. The docstring at `:110` and brief P3 both say the exact spelling is checked.
- Probe: `split/r2/review-mutants.out` (S5).
- **Carrier: follow-up.**

**n5 (ci-n2). The README's own "full gate" block still lacks `typecheck:routes` and `export:ios`, although its new CI paragraph says CI runs them.**
- `README.md:244-259` at `46b30a0` ("Every change runs the full gate:") lists `typecheck:app` and then `export:web`, with neither new line.
- It also lacks `parser-sandbox-check` and the six edge lines; those gaps were already there.
- `README.md:273-276` now says CI runs "typecheck (also with Expo Router's typed routes)" and "the web and iOS exports".
- The handover's Full gate (`handover.md:53-77`), which the workflow test reads, has both new lines.
- Brief P10 (Appendix A.3) limited the README edit to the CI paragraph, so the implementer did as briefed.
- **Carrier: follow-up.**

**n6 (ci-n3). The receipt names `857b9f2` as the integration head at implementation time, but CI's merge ref shows it was `4850463`.**
- `receipts/ci-parallel-jobs.md:3` reads: "from `4850463`, on base `857b9f2` (the head of `origin/claude/p1a-vault-core` at the time)".
- The template read "from `[[HEAD]]` (the head of `origin/claude/p1a-vault-core` at the time)" (`PL/templates/ci-parallel-jobs.md.template:3`). The implementer's added "on base `857b9f2`" moved the parenthesis onto the wrong SHA.
- CI's merge ref is `Merge 46b30a0 into 4850463` (checks log, line 131). The receipt's own Deviations line says the sync to `4850463` was a fast-forward.
- **Carrier: follow-up** (fold it into the controller's "After, measured" housekeeping commit).

**n7 (ci-n4). Every job warns that the pinned checkout and setup-node actions target Node 20. The issue is not new, but it is now 9 annotations per run.**
- Each of the nine job logs of run 42652925056 has one line: `##[warning]Node.js 20 is deprecated. The following actions target Node.js 20 but are being forced to run on Node.js 24: actions/checkout@11bd719..., actions/setup-node@49933ea...`. The image job names checkout only.
- The same line appears in the old gate (129253725757) and database (129253725534) logs.
- P9 keeps these pins on purpose, so this PR does not regress anything; it only shows the warning in more places.
- **Carrier: follow-up** (bump both pins, by commit, to releases that run on Node 24).

---

## CI (PR #377, run 42652925056 on merge ref `c56e0e4` = `46b30a0` into `4850463`)

All nine jobs pass, attempt 1. The run went from 16:15:33 to 16:20:19 UTC on 9 Nov, and each job queued for 2 to 3 s. I reran `run-times.mjs 42652925056` and got the same times (`synth/run-times-42652925056.txt`).

| Job | Measured | Brief's estimate (P1) |
| --- | --- | --- |
| `checks`: Typecheck, unit, API, build | 158 s | 167 to 211 s |
| `exports`: web and iOS bundles | 217 s (`export:web` 81 s, `export:ios` 81 s) | 183 to 237 s |
| `render`: every file but the per-section suites | **283 s** (the critical path) | 179 to 246 s |
| `sections-1`: ids of length 3n | 162 s | 156 to 233 s |
| `sections-2`: ids of length 3n+1 | 196 s | 156 to 233 s |
| `sections-3`: every other test | 210 s | 156 to 233 s |
| `database`: SQL integration and ops | 198 s | 171 to 306 s |
| `edge`: Edge Worker | 248 s | 179 to 262 s |
| `image`: release image and smoke | 58 s | 53 to 68 s |
| **Wall time** | **285 s** | 214 to 309 s (median about 262 s) |

- **Before:**
  - Six runs of the old three-job workflow in the same hour (15:53 to 16:28 UTC) took 615 to 747 s of wall time.
  - The old run on the same content (42644425491) took 737 s; its gate job took 734 s, with a 457 s render step.
- **Runner time:** the nine jobs ran 1730 s together. The Actions-minutes cost is the owner's decision (P11). These are the measured times for it.
- **The render split** (job logs, colour codes stripped):

| Job | Files | Passed | Skipped | Of |
| --- | --- | --- | --- | --- |
| `render` | 106 | 1289 | 0 | 1289 |
| `sections-1` | 2 | 162 | 414 | 576 |
| `sections-2` | 2 | 196 | 380 | 576 |
| `sections-3` | 2 | 218 | 358 | 576 |

- **The split adds up:**
  - 1289 + 162 + 196 + 218 = 1865 tests, and 106 + 2 = 108 files. Those are run 42644425491's single render job's totals. That run's merge ref (`ce48506`) has the same code tree as `c56e0e4`, apart from the `export:ios` script line and the workflow test.
  - Each `sections-*` job skips exactly the other two parts' tests: 414 = 196 + 218, 380 = 162 + 218, and 358 = 162 + 196.
  - Per file: screenReader 81 + 98 + 99 = 278, and CatalogueScreen 81 + 98 + 119 = 298.
  - Every other render file runs once in the `render` job, with its old test count (`ci/r2/render-files-compare.out`).
  - The 368 names the sections logs list each match only their own job's pattern (`ci/r2/sections-names-check.out`).
  - Each `> vitest run` line in the logs carries its pattern byte for byte.
- **Every other suite matches the old run's counts:**
  - `test:api` 47 suites, 1000 tests; `test:app` 34; `test:unit` 927; `test:dev` 7.
  - `test:db` 41 suites, 694 tests.
  - `test:edge` 15 files, 176 tests; `test:edge:workers` 27 files, 638 passed and 3 todo; `test:edge:db` 9 files, 64 tests.
  - `test:ops` 111: the old 108 plus the 3 new workflow cases. All 9 workflow cases pass, and the local rehearsal ran with `GOGOSPEND_OPS_REQUIRE_DB: 1` (1427 ms), not skipped.
  - The web export has 4794 modules in both runs.
- **The iOS export, on Linux for the first time:**
  - It exits 0 in 81 s, inside P5's estimate of 80 to 112 s.
  - The log reads `iOS Bundled 78504ms node_modules/expo-router/entry.js (5760 modules)`. The output is one Hermes bytecode bundle, `_expo/static/js/ios/entry-9d0d4218a76afc7769d5b92f8da69011.hbc` (15 MB).
  - 5760 is the planner's macOS count at `857b9f2`.
- **Pending:** nothing for this run. No nine-job run has covered the current integration head (m1).

---

## What was checked and found right

**The render split and the test's pins** (split lens):
- **How vitest 4.1.12 reads the flags:**
  - It compiles `-t` as `new RegExp(pattern)` with no flags (`vitest/dist/chunks/coverage.DM_a_rWm.js:359`) and matches it against the full name: the describe titles and the test name.
  - The CLI's `--exclude` is appended to the config's exclude (`:355`).
  - Positional file filters are case-insensitive substring matches.
- **The three patterns put any name in exactly one part:**
  - The length classes 0 and 1 mod 3 are disjoint, and part 3 is their complement at position 0.
  - 9,188,891 names each match exactly one pattern. They cover all short tails after 8 prefixes (including describe-like prefixes and newlines) and 300,000 random names.
  - A 3000-character id takes 0.3 ms, so there is no backtracking problem.
- **The `--exclude` lists:**
  - The render job excludes exactly the two files, as literal paths, and each part names the same two.
  - None of the 108 render paths contains a glob character.
  - The local split-check (`vitest list`) reads 108 files, 106 in the render job, and parts of 162, 196 and 218 tests, 576 together, none in two parts (`split/r2/split-control.out`).
- **Planner mutants**, 10 of 19 rerun with the kit's `probes.mjs`: M1, M3, M4, M5, M6, M7, M8, M10, M14 and M15 all fail as expected, with no MISMATCH (`split/r2/planner-sample.out`).
- **The layout case** matches the YAML job by job. The test's line reader agrees with js-yaml on all 36 run steps, including job, run and env (`split/r2/parser-vs-yaml.out`).
- **The local-gate case:**
  - The handover's Full gate has `typecheck:routes` (line 57) and `export:ios` (line 69), the same strings as CI's steps (`backend.yml:52` and `:82`).
  - The implementer's RED flagged exactly those two lines.
  - L1 (CI drops `-- --max-workers 2` from the iOS export) is killed by the parity and layout cases. L2 (`typecheck:routes` moved to `exports`) is killed by the layout case.
- **The edge order (1A-T10):**
  - The six edge steps are in `edge`, after the API build.
  - E1 (workers and build swapped) is killed by the edge and layout cases. E2 (the API build after the PostgreSQL suites) is killed by the layout case.
- **The ban** catches plain `if:` and `continue-on-error:` on jobs and steps (M14, M15), and has no false positive on the committed workflow.
- **On Linux:** the workflow test passed in CI's `database` job (`test:ops`, 111 of 111).

**The workflow's semantics** (ci lens):
- **The setup** was parsed with PyYAML (`ci/r2/setup-check.out`: SETUP OK) and confirmed in the logs:
  - Checkout is pinned to `11bd719` with `persist-credentials: false` in all 9 jobs.
  - `fetch-depth` is 0 only in `checks`; the logs show 0 there and 1 elsewhere.
  - setup-node is pinned to `49933ea`, with `node-version: ${{ env.NODE_VERSION }}` and `cache: npm`, in all 8 npm jobs. Each log shows Node 26.9.0 and a cache hit.
  - `npm ci --ignore-scripts --no-audit --no-fund` runs in all 8 npm jobs.
  - `timeout-minutes` is 20, and 30 for `image`.
- **Unchanged from the base:**
  - These parts are identical: the triggers, `permissions` (`contents: read`), `concurrency` (`backend-${{ github.ref }}`, `cancel-in-progress`), `env` (`NODE_VERSION` 26.9.0, the Dockerfile's Node) and the `image` job.
  - There is no `needs`, `strategy`, `services`, `if` or `continue-on-error`.
  - A step `env` appears only on `test:ops`.
- **Every step of the old workflow still runs**, in a successful step of the new run (`ci/r2/steps-compare.out`).
  - Only the plain `test:render` is replaced, by its four split steps.
  - The new steps are `typecheck:routes` in `checks` and `export:ios` in `exports`.
  - That makes 25 run commands before and 36 now.
- **The two PostgreSQL containers:**
  - The `database` job's container comes from `test:db` (pull, create, start, healthy).
  - The `edge` job starts its own: `test:edge:db` runs `scripts/dev-v1.mjs db-up`, which runs `docker compose -f compose.postgres.yml -p gogospend-v1 up -d --wait postgres` (pinned digest, loopback port 55432).
  - The pull took 11 s, and the container was healthy 3 s later; P4 estimated about 18 s.
  - The parity suites against the built NestJS server pass afterwards.
- **`typecheck:routes` in CI:**
  - It exits 0 in 10 s.
  - The script exits 1 if Expo's generator returns no routes, so the step is not a no-op.
  - At the integration head, it catches a broken slip link that `typecheck:app` misses (m1).
- **The whitespace step** ran `git diff --check 4850463... HEAD` with full history.
- **Branch protection:** neither `claude/p1a-vault-core` nor `main` has branch protection or required checks, and `merge_task_pr.sh` does not depend on check names. The new check names therefore block nothing.
- **The README and the handover:**
  - The README's CI paragraph is accurate: 1 + 1 + 4 + 1 + 1 + 1 = 9 jobs, the release image's Node, and the edge and image bullets.
  - The handover's two new Full gate lines are byte-equal to the CI steps, and sit directly after `typecheck:app` and `export:web`.

**My spot-checks** (`synth/`):
- **The times:** `run-times.mjs 42652925056` gives the same nine times and 285 s of wall time.
- **The job logs:** the render totals, the four `> vitest run` lines and the iOS export lines read as above. Each of the nine logs has one Node 20 warning (n7).
- **The ban (m2):** `synth/ban-spot-check.mjs` parses each spelling with js-yaml 4.3.2 and tests both regexes. The results are as m2 says.
- **m1's premises:**
  - `gh pr view 377` shows the base `4850463`, the merge commit `c56e0e4`, and CLEAN.
  - `merge_task_pr.sh` checks only the head SHA and that every check passed (lines 13 to 15).
  - The workflow's `pull_request:` has no `types:`.
  - Run 42655149587 is PR #381's run on `712574d`, with 109 files and 1867 tests, and its tree's code is the head's.
  - From `4850463` to the head, these did not change: the PR's files, the dependencies, the app config, any platform-specific file, and any catalogue, sections or registry file.
- **The text nits:**
  - `README.md:244-259` and `:273-279` (n5).
  - `handover.md:53-77`.
  - The receipt's line 3 against the template (n6).
  - The `package.json` and handover diffs, exactly Appendix A.2 and A.1.

**Not run** (R100): the whole suites and the exports. CI ran all of them on this PR, including the iOS export.

---

## Notes for later tasks

- **The controller, before merging #377 (m1):**
  - Close and reopen #377, or take any step that makes a new `pull_request` event without moving the head.
  - Wait for nine green jobs whose `checks` log reads `Merge 46b30a0... into <integration head>`, with the counts m1 predicts.
  - Then run `merge_task_pr.sh 377 46b30a0`.
  - The merge also waits on the owner's Actions-minutes answer (P11). The measured times above are for that decision.
- **The controller's housekeeping commit after the merge:**
  - Add the receipt's "After, measured" line: run 42652925056, 285 s wall time, the nine job times, and `render` as the critical path at 283 s (n1). Add the fresh run's times too if m1's run is taken.
  - Fix the receipt's base wording (n6).
- **`followups.md`:**
  - Line 110 (1A-T10's minor 1) is done here, so drop it from P6C-T7. P6C-T7 carries m2 (the widened regex) and m3 (no top-level `|`, and real-shaped samples) instead.
  - Line 232 (1D-T8's n5) is done once #377 merges. Then the controller no longer runs the iOS export before merges, and R100's correction note in `protocol.md` ("Until it merges, record the iOS export in receipts as 'the controller's, not CI's'") can go.
- **Any task that edits the workflow updates the layout case in the same commit.**
  - P6A-T7's `check:native` step goes in `checks`. P6C-T7 and P6C-T9 also edit the workflow or the test next.
  - Briefs and receipts that say "CI's database job runs `test:edge:db`" now mean the `edge` job.
- **A future four-way split** (receipt line 47): prove it on the real names with the planner's split-check (`vitest list`), not only with the workflow test (m3). Keep both per-section files' `test.each` calls top-level (n2).
- **When the render job nears the budget (n1).** It is the critical path now, at 283 s for 106 files, and it grows with every screen. The next step is a `vitest --shard` of its files across two jobs, or moving a slow file into its own part.
- **The pinned actions (n7):** bump checkout and setup-node by commit, to releases that run on Node 24, in the next task that edits the workflow.
- **The README (n5):** add `typecheck:routes` and `export:ios` to its gate block, with the gaps already there, in the next README edit. `followups.md` already holds README nits for 1C-T12 and 1B-T13.

VERDICT: Approved
