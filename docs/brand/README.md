# Jotbun brand assets

The product is **Jotbun**. The source icons were selected on 17 October 2026: the lavender bun mascot holding a blue receipt, with no wordmark.

| File | Size | Use |
| --- | --- | --- |
| `jotbun-app-store-1024.png` | 1024 × 1024, opaque RGB | iOS app icon source; also `apps/app/assets/icon.png` (Expo `icon`) |
| `jotbun-google-play-512.png` | 512 × 512, opaque RGBA | Google Play store listing icon (uploaded in Play Console, not bundled) |

## Applied in the app

- `apps/app/app.json` sets `"name": "Jotbun"` and `"icon": "./assets/icon.png"`.
- User-facing copy in English, Thai and Vietnamese, and screen titles, say Jotbun.

## Deliberately unchanged

These are identifiers, not branding. Changing them is a separate, coordinated decision.
- **Expo project link:** `slug` (`gogospend`) ties the app to its Expo project.
- **Auth0 callback:** the URL `scheme` (`gogospend`) is part of the callback, so changing it needs E2.
- **Store identity:** the Android package `co.gogocash.spend` and the future iOS bundle identifier (E2).
- **API protocol:** the `X-GoGoSpend-*` HTTP headers.
- **Internal names:** package names (`gogospend-api`, `@gogospend/contracts`), database roles (`gogospend_*`), and code comments.

## Still to do

- **Android adaptive icon:** the launcher needs a foreground layer with a safe zone (the artwork fills the square). `android.adaptiveIcon` still has only a background colour.
- **Splash screen** artwork.
- **Visual check on devices** (E2).
