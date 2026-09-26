# The Ledger — mobile app

Expo (React Native) client for the stocks-advisory-platform API, built with the New Architecture
(Fabric + TurboModules), TypeScript strict mode, and a feature-based architecture designed to
scale. Visual language follows "The Ledger" design shared with the web client (Groww-style green,
AA-safe text and button tones).

## Stack

- **Expo SDK 57** — dev-client & EAS build ready. React Native's legacy architecture has been
  removed as of this SDK, so every app now runs on the New Architecture (Fabric + TurboModules)
  by default; there's no `newArchEnabled` flag to set anymore.
- **TypeScript** (strict) with `@/*` path aliases
- **Expo Router** — file-based routing, typed routes, auth-protected route groups
- **NativeWind (Tailwind)** styling, components built gluestack-ui v2 style (NativeWind +
  `tailwind-variants`, copied into your repo under `src/components/ui`, not a runtime UI library)
- **TanStack Query v5** for server state, persisted to encrypted storage for offline-first reads
- **Zustand** for client state (auth, theme, preferences), persisted via MMKV
- **react-native-mmkv** (encrypted) for fast local storage; **expo-secure-store** for auth tokens
- **Axios** with auth-token injection and a single-flight refresh-token interceptor
- **React Hook Form + Zod** for forms and validation
- **Reanimated + Gesture Handler**, **@gorhom/bottom-sheet**, **lucide-react-native** icons,
  **expo-haptics**, **expo-notifications**, **expo-local-authentication** (biometrics)

## Getting started

```bash
npm install
cp .env.example .env      # defaults to the local API on http://localhost:4000/api/v1
npm run prebuild           # generates native ios/ android projects (New Architecture is on by default)
npm start                  # or: npm run ios / npm run android / npm run web
```

**Expo Go** runs the app for quick UI work: it lacks the MMKV native module, so there app data
falls back to unencrypted AsyncStorage (auth tokens stay in SecureStore — see
`src/lib/storage/appStorage.ts`). Use a development build (`npm run android` / `npm run ios`, or
`npm run build:dev`) for anything that should behave like production.

Requires Node 20+, and Xcode/Android Studio for native builds. This project uses Expo dev-client —
if you install any native module, re-run `npm run prebuild` (or an EAS dev build) before running
`ios`/`android`.

### API endpoint

`EXPO_PUBLIC_API_URL` is the only value to change to point the app at a different server. Start
the local API from `stocks-advisory-platform` with `npm run dev:server` (port 4000). API docs live
in that repo at `server/src/docs/specs/*.routes.yaml` (served as Swagger by the server).

- **Development**: a `localhost` host is rewritten at runtime to the machine running Metro, so the
  same `.env` works on the iOS simulator, the Android emulator and a physical phone on the same
  Wi-Fi (`src/config/env.ts`). Debug builds allow cleartext http for this.
- **Preview / production**: set a public `https://` URL per EAS profile (`eas env:create`, or the
  `env` block in `eas.json`). `app.config.ts` fails the build if a release profile would ship
  with a missing, `http://` or localhost URL.
- `EXPO_PUBLIC_*` values are inlined at bundle time: restart Metro with `npx expo start --clear`
  after editing `.env`.

## Project structure

```text
src/
├── app/                     # Expo Router routes (file-based)
│   ├── auth/                # signed-out stack — welcome, login, register, forgot/reset password
│   ├── (app)/(tabs)/        # the five main menus — (markets), trade, fno, intel, settings —
│   │                        #   each a folder whose files are that menu's sub-tabs
│   ├── (app)/               # drill-in screens pushed over the tabs (stock, order, article…)
│   ├── _layout.tsx          # root providers, cold-start bootstrap, brand splash
│   └── +not-found.tsx
├── components/
│   ├── brand/               # Logo, BrandSplash
│   ├── ui/                  # base primitives — Button, Input, Section, Tabs, OptionSheet…
│   ├── market/              # StockRow, StockTile, StockLogo, Sparkline, charts
│   ├── navigation/          # AppHeader, TabScreen, StackScreen
│   ├── common/              # ErrorBoundary, InlineError, EmptyState
│   └── providers/           # AppProviders (query, theme, gesture, bottom sheet, toast)
├── features/                # feature modules — api, hooks, components, lib, types
│   ├── auth/  home/  market/  portfolio/  watchlists/  insights/  alerts/  trading/  stock/
├── hooks/                   # generic reusable hooks (useDebounce, useAppStateStatus)
├── services/
│   ├── api/                 # axios instance, envelope unwrapping, auth API
│   ├── realtime/            # Socket.IO index feed
│   └── notifications/       # expo-notifications registration
├── store/                   # zustand stores (auth, theme, preferences)
├── lib/                     # utils, constants, validators, storage (mmkv/secure-store)
├── theme/                   # design tokens + ThemeProvider (light/dark)
├── config/                  # typed env + app config
└── types/                   # global TS types
```

## Navigation

The menu mirrors the web client's `NAV_GROUPS` (`client/src/shared/constants/nav.ts`), declared
once in `src/config/navigation.ts`:

| Bottom tab   | Sub-tabs (top row)                                                         |
| ------------ | -------------------------------------------------------------------------- |
| Markets      | Today · Strong picks · Explore · Market heatmap · News                     |
| Trade        | Trade · mStock portfolio · Groww portfolio · Watchlists · Paper trading    |
| F&O          | Explore · Positions · Orders · Paper trading                               |
| Intelligence | Recommendations · Strategies · Screeners · Signals · Live · Matrix · Build |
| Settings     | Preferences · Automations · Admin (administrators only)                    |

Each bottom tab is a folder under `src/app/(app)/(tabs)/` whose layout (`GroupTabs`) renders the
app bar plus a Groww-style scrollable sub-tab row (`GroupTabBar`); sub-screens use `GroupScreen`
and stay mounted after their first visit. Markets is the route group `(markets)`, so Today is `/`.
Drill-ins (a stock, an article, the option chain, a strategy…) are stack screens under
`src/app/(app)/` using `StackScreen`. A test (`src/config/__tests__/navigation.test.ts`) fails if a
menu entry has no route file.

**Errors**: every main-menu layout exports `ErrorBoundary` (`RouteErrorBoundary`), so a crash inside
one screen shows the error page in that tab with the bottom menu still usable; a crash anywhere
else falls back to the root `ErrorBoundary`. Both render `ErrorScreen`.

## Auth flow

Endpoints (server `auth.routes.ts`): `POST /auth/login`, `/auth/register`, `/auth/refresh`,
`/auth/forgot-password`, `/auth/reset-password`. Every response is the server envelope
`{ success, message, data, errors[], requestId }`; the axios client unwraps `data` and turns
failures into a typed `ApiError` (field errors, rate-limit wait, request id). There is no
`/auth/me` or `/auth/logout` on this server.

- **Cold start** (`src/app/_layout.tsx`): the MMKV key and the auth tokens are read from the
  Keychain in parallel, every persisted store hydrates, and the session is restored from the stored
  refresh token + profile — no network round trip behind the splash. `BrandSplash` then takes over
  from the native splash with a pixel-identical first frame, lifts the mark, fades in the wordmark
  and fades out (~0.75 s, a plain fade with Reduce Motion) while the first screen mounts and starts
  fetching underneath.
- **Routing**: the root `Stack` uses `Stack.Protected` guards on `isAuthenticated`. Signing in or
  out only flips the store; the router moves the user. First launch lands on `/auth/welcome`,
  later sign-outs on `/auth/login` (email prefilled).
- **Registration** never issues tokens — accounts wait for administrator approval, and sign-in
  explains a pending/rejected account rather than reporting a wrong password.
- **Tokens** (`src/services/api/client.ts`): refreshed ahead of expiry, or on a 401, through a
  single in-flight refresh (tokens are single-use: each refresh rotates the pair). The session ends
  only when the server rejects the refresh token — a network blip never signs anyone out. Public
  auth routes pass `skipAuth` and never enter the refresh path.
- **Sign-out** is local: tokens, profile, socket and the persisted query cache are all cleared.
- **Password reset** links point at `/auth/reset-password?token=…` on the web client. The app
  route has the same path, so enabling iOS Associated Domains / Android App Links for that domain
  opens the link in-app with no extra mapping.

## Theming

Design tokens live in `src/theme/tokens.ts` and mirror the web client's `tokens.css`; the same
names exist as Tailwind classes in `tailwind.config.js` (`bg-canvas dark:bg-canvas-dark`,
`text-ink`, `bg-brand-strong`…). Brand green has three roles: `brand` (vivid fill, icons only),
`brand-strong` (buttons, AA with white text) and `brand-text` (links/gains, AA on the page).
`ThemeProvider` resolves `light` / `dark` / `system` and keeps three things in sync: NativeWind's
`dark:` classes (set before the first frame by the root layout), React Navigation's theme (so
transitions and modals never flash white), and the native root background. Every colour class
needs its `dark:` counterpart; JS colours (SVG, icons) come from `useTheme().colors`. Typography uses the platform system font — nothing to download at startup.

## Brand assets and icons

`src/components/brand/Logo.tsx` is the logo: a bold rising arrow over three soft volume bars on a
mint-to-emerald gradient tile. Launcher icons, the Android adaptive icon (glyph + gradient
background) and themed monochrome icon, splash, favicon and notification icon are generated from
the same geometry: `python scripts/generate-brand-assets.py` (needs Pillow), then
`npm run prebuild`. The five main-menu icons are drawn in `src/components/navigation/GroupIcon.tsx`
(two-tone when active); menus use `IconTile` for coloured icon tiles.

UI icons come from `lucide-react-native`, imported one per file
(`import Mail from 'lucide-react-native/icons/mail'`). ESLint rejects the barrel import because
Metro would bundle all ~1,850 icons.

## Home screen (Markets › Today)

Groww's Stocks layout (`src/app/(app)/(tabs)/(markets)/index.tsx`, sections in `src/features/home`). Every
section loads, fails and retries on its own, and pull-to-refresh refetches them all.

| Section          | Source                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Index ticker     | Socket.IO `/indices` (works without a broker), `GET /market/indices` as first paint           |
| Holdings         | `GET /portfolio` (mStock) → `GET /portfolio/linked/:broker` (Groww) → `GET /portfolio/manual` |
| Top movers       | `GET /stocks/top-gainers` · `top-losers` · `top-volume`, NSE only, optional `cap`             |
| Products & tools | Links into the existing screens                                                               |
| Watchlist        | `GET /watchlists` → first manual list's `GET /watchlists/:id`                                 |
| Stocks in news   | `GET /news/analysis` (impact-ranked), one story per verified stock                            |
| Today's pick     | `GET /recommendations/today`                                                                  |

"Live" under the ticker needs both the feed's flag and the IST clock: the feed replays its last
in-session frame, still marked open, to anyone who joins after the close.

## Scripts

| Script                                               | Description                                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `npm start`                                          | Start the Metro dev server                                                               |
| `npm run ios` / `android`                            | Run a native dev build                                                                   |
| `npm run web`                                        | Browser preview — not a supported target: SecureStore and encrypted MMKV are native-only |
| `npm run prebuild`                                   | Regenerate native projects                                                               |
| `npm run lint` / `lint:fix`                          | ESLint                                                                                   |
| `npm run format`                                     | Prettier                                                                                 |
| `npm run typecheck`                                  | `tsc --noEmit`                                                                           |
| `npm test` / `test:watch` / `test:coverage`          | Jest + React Native Testing Library                                                      |
| `npm run doctor`                                     | `expo-doctor` project health check                                                       |
| `npm run build:dev` / `build:preview` / `build:prod` | EAS builds                                                                               |

## Notes

- Server-side gaps the app works around but can't fix: password-reset emails link to the web
  client (`CLIENT_APP_URL`); hand-tracked holdings are never priced for users without a broker
  (`priceUnavailable` is always true); push notifications need FCM device tokens registered at
  `POST /notifications/devices`, which the app doesn't do yet (it only gets an Expo token).
- Set a real `eas.projectId` in `app.config.ts` before running EAS builds.
- Wire a crash reporter (Sentry, etc.) in `ErrorBoundary.componentDidCatch` and the mutation
  `onError` in `src/lib/query/queryClient.ts`.
