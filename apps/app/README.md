# GoGoSpend standalone client (Expo, SDK 58). Phase-1 scaffold.

## What is here

- `src/spend/` — working copy of the spend diary modules (seeded from
  `vendor/gogocash-apps-app-spend/`).
- `src/screens/CustomerSpend{,All,Import}Screen.tsx` — the three spend screens.
- `app/spend/{all,import}.tsx` — expo-router routes.

## What is NOT here yet (phase 2)

The screens resolve ~20 shared `@mobile/*` modules that still live in the
monorepo. Next extraction, in dependency order:

1. `theme/*` (11 files: colorPalettes, tokens, AppText, ThemeProvider,
   useThemedStyles, motion, animatedMotion, icons, elevation, tapTarget,
   stageChange, useSpringPop) + `hooks/useReducedMotion`
2. `i18n/useCopy` + spend catalog slice (reuses `tc()` English-first)
3. `api/client` + `api/sharedClient` repointed at this repo's API
4. `auth/useAuthGuardSession` + session store (same Firebase project = SSO)
5. `components/*` (CustomerSectionTabs, ProfileSubPageFrame, SpendDatePicker,
   SpendMediaPermissionPrimer, SpendNewCategorySheet)
6. `config/env`, `config/featureFlags` (spend-only subset), `navigation/appChrome`
   (spend-only subset), `consent/*` (spend slices), `lib/*` (clipboard,
   hapticMoment, openAppSettings), `analytics/bus` (spend events only)

`SpendIntroScreen` + `SpendSectionTabs` already travel inside `src/spend/`.
Diff working copies against `vendor/` with `npm run diff:app-spend`.
