## Summary
- **P6B-T14: remote flags after yes, flag exposure and the rollout layer (B25).**
- **Flags only after yes (P4 to P8):**
  - `/flags` is asked for only when the person has said yes and the client was identified with an analytics id.
  - A no, an open question or a sign-out erases the kept flags and drops any still on their way. Flags never outlive the yes that loaded them.
  - `flag(key)` reads the client only in yes, and only after a push since its last reset.
- **No key, no client (P8):** there is no PostHog key yet (1D's Q5), so there is no client. Nothing is asked for, every rollout reads its default (off), and every experiment reads `control`. Two tests pin it.
- **The gate and the exposure (P9):** `$feature_flag_called` passes only with consent, payloads are stripped from every event, and a sentinel case shows nothing typed leaks.
- **The rollout layer:** `rollout/rollout.ts`, `experiments.ts` and `useRollout()` (`useSyncExternalStore` over `analytics.subscribe`, P12).
- **The installed SDK (P2):** posthog-react-native 4.85.1 on `@posthog/core` 1.62.0, read where the plan cites 4.83.0 on 1.60.1. `PostHogLike` gains the plan's two methods (P10).
- **The shared test helper (P11):** `recordAnalytics` keeps its signature and fields; the change is additive. Every CI-waiting PR whose tests use it or `fakeConsent` (#456, #460, #464 to #467) was proven with this task's files laid over its head at planning.
- **The second review's fix (the controller's commit `899f6652`).** Sonnet's verdict was Needs fixes on one major finding; Opus approved.
  - **M1:** after a relaunch the SDK holds an earlier yes's flags and puts them on every event until the controller's first reset. So a crash report sent before consent is known (crash reports are on by default) carried flag keys and variants. `scrubException` now drops `$active_feature_flags` and every `$feature/` key before yes.
  - **m1:** a kept read that rejects counts as none, so the load still runs.
  - **m4:** a gate case pins payload stripping on a crash report, before and after yes.
  - **m2:** the comments and the receipt now say React Native's fetch ignores `redirect: 'error'`, so the proxy host must never redirect (P6C).
  - **m3** (a `useRollout` mounted before the controller is installed) goes to P6B-T15, whose hooks gate real features.
- **The controller accepted the planner's calls P1 to P16.**
  - Planned on Claude Opus, built on Claude Haiku 5.5.
  - The controller checked the commit: all 20 `real/` files are byte-identical, the receipt included (the planner wrote it).
  - No route, app entry, `app.json`, config, package, lockfile, edge or database change.

## Test plan
- [x] RED: Node 20 of 64 and render 3 of 16 failing, every one an `AssertionError`.
- [x] GREEN: Node 64 of 64; render 16 of 16.
- [x] 55 of 55 mutants killed (46 on the Node runner, 9 in vitest), every failing case an assertion, identical to the planner's.
- [x] R100's fast gate:
  - `typecheck:app`;
  - `test:app` 37 and `test:unit` 1128;
  - 35 render files, 676 tests: every user of the two shared helpers, `RootLayout` and the four routes tests;
  - `git diff --check`.
- [x] The second review's fix (`899f6652`), under the heavy lock:
  - `gate`, `controller`, `remoteFlags` and `neverSent` 64 of 64, and `typecheck:app`;
  - mutants F1 to F4 and the review's M10 are each killed on an assertion.

  Proof: `.claude/controller/scratch/p6b-t14-fix/`.
- [ ] CI on this pull request is green: the nine jobs, on GitHub's runners.
- [x] Independent review (Opus): approved. Second review (Sonnet): Needs fixes (M1), answered by `899f6652`.
- [ ] The Opus reviewer confirms `899f6652`, folding in the second review.
- [ ] SKIPPED: real PostHog flags (no key yet, Q5), and React Native's handling of `redirect: 'error'` on a device (P16).

Closes #298 once merged (closed by hand, since the base is not the default branch).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
