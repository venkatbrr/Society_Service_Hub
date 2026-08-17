# App startup and runtime performance — "screens take time to load, the installed app takes time to open"

**Date:** 2026-08-17
**Status:** Implemented. `npx tsc --noEmit` passes and `npm run build` produces a clean deploy artifact. Bundle numbers below are **measured**; the round-trip and blocking-order claims are **read off the code**, not captured from a profiler. **Not yet verified in a browser or on a device** — see [What was not verified](#what-was-not-verified).
**Reported symptom:** "Sometimes app is taking time to load the screens or when we install it as app it is taking time to open the screen, it is taking much time on loading app."

The report describes two different problems that happened to share a page: **launch** (nothing on screen for seconds) and **navigation** (a screen you have already visited redrawing slowly). They had separate causes and are treated separately below.

---

## Files changed

| File | Change |
|---|---|
| `lib/authCache.ts` | **New.** Persisted per-user snapshot of resolved auth state, for warm starts. |
| `lib/webFonts.ts` | **New.** Injects the Google Fonts stylesheet on web when the shell has not already linked it (i.e. the dev server). |
| `context/AuthContext.tsx` | Parallelised the launch round trips, deduped `loadProfile`, added the warm-start snapshot, stopped reloading the profile on `TOKEN_REFRESHED`, made the safety timer unconditional. |
| `context/NotificationContext.tsx` | Keyed every callback and the realtime subscription on `user?.id` instead of the `user` object. |
| `app/_layout.tsx` | Web no longer blocks the React tree on `useFonts`. |
| `app/(tabs)/index.tsx` | Removed a dead query, bounded the `provider_hires` read and moved it to a second wave, fixed the visits debounce dependency, parallelised the visits sub-queries. **Removed the greeting line** (product change, requested in the same pass). |
| `components/GlobalBottomNav.tsx` | Native driver for transform/opacity animations; the perpetual disc float no longer runs on web. |
| `components/AnimatedTileGlyph.tsx` | Same driver rule. |
| `components/SchoolRadarChart.web.tsx` | Reimplemented without `framer-motion`, using CSS keyframes. |
| `package.json` | Removed `framer-motion`. |
| `build-admin.js` | Google Fonts stylesheet made non-render-blocking; `preconnect` to the Supabase origin. |
| `public/service-worker.js` | App-shell navigations moved from network-first to stale-while-revalidate (`CACHE_NAME` → `wooru-pwa-v10`). |
| `docs/architecture.md`, `docs/CLAUDE.md`, `docs/features.md`, `docs/verandah.md`, `docs/hidden-features/mcn-schools-and-borrow.md` | Documentation, same change set. |

---

## Part 1 — Launch: four serial waits before the first pixel

Nothing rendered until **all** of the following had finished, in this order:

1. `RootLayout` returned `null` until `useFonts` resolved **7 local TTFs, ~443 KB**.
2. `AuthContext.fetchSession()` awaited `supabase.auth.getSession()` (local, fast).
3. …then awaited `supabase.auth.getUser()` — **a network round trip**.
4. …then awaited `loadProfile()` — **another network round trip**, and one more for `community_requests` on the no-community path.
5. Only then did `isLoading` clear; `RootLayoutNav` showed a full-screen spinner for the whole sequence.

On top of that, `onAuthStateChange` fires `INITIAL_SESSION` at subscribe time, which called `loadProfile()` a **second** time — so every launch issued two racing `profiles` reads.

### 1a. Fonts no longer block the tree on web

`app/_layout.tsx` loaded nine `useFonts` entries (seven unique files) and returned `null` until they arrived. On web this was **entirely redundant**: `APP_SHELL_HEAD` in `build-admin.js` already links the Google Fonts stylesheet serving the same two families as woff2 with `display=swap`, and `constants/Verandah.ts` names them with web-safe fallbacks.

Web now gets `useFonts({})` and never blocks. Native keeps `NATIVE_FONTS` and must — naming a `Platform.select` family that expo-font never loaded silently falls back to the system font, with no error (`docs/CLAUDE.md` §9).

The one gap this opened: the **dev server** serves Expo's own boilerplate shell and never runs `build-admin.js`, so it has no font link at all. `lib/webFonts.ts` injects one at runtime, guarded on an existing `fonts.googleapis.com` stylesheet so it is a no-op in production.

> **If you add a web font family, it must go in two places** — the URL in `build-admin.js` *and* the URL in `lib/webFonts.ts`. Adding it to `useFonts` does nothing on web.

The TTFs are still emitted into `dist/assets/` because `require()` at module scope registers them as assets. They are never fetched on web — a `require` produces a URI, not a download.

### 1b. Session validation runs beside the profile load, not in front of it

`getUser()` exists to catch deleted/banned users, since `getSession()` only reads the cached JWT. It does not gate the profile read and never did, so it now runs in the same `Promise.all`. One full RTT off cold start.

### 1c. Warm start from a persisted snapshot (`lib/authCache.ts`)

After each successful load, the resolved state (profile row, community, block/flat, `fundsEnabled`, `blocksEnabled`, `blockLabel`, `communityHasLead`, `isEventOrganizer`) is written to localStorage on web / AsyncStorage on native. The next launch applies it and clears `isLoading` immediately, then revalidates behind it.

Guard rails, because this is a cache masquerading as state:

- **Keyed by user id** — a different account can never read the previous one's state.
- **Versioned** (`SNAPSHOT_VERSION`) — an old shape is ignored, not misread.
- **Cleared** on sign-out, on `SIGNED_OUT`, and in `clearLocalSession()`.
- **Never overwrites fresh data.** `fetchSession()` skips the snapshot if `snapshotRef.current` is already set, i.e. if the real load beat the storage read.
- **Second-phase flags carry over** across a reload for the same user *and* the same community, instead of resetting to `false`. Without this, an app closed between the two load phases would persist `fundsEnabled: false` and hide funds on the next warm start.

Treat any snapshot-sourced field on frame one exactly the way `docs/CLAUDE.md` already says to treat `fundsEnabled`: **"not known yet", not "false"**.

### 1d. `loadProfile` deduping and last-write-wins

- An in-flight read is shared rather than duplicated, which kills the `fetchSession` / `INITIAL_SESSION` race.
- `{ force: true }` bypasses the dedupe. `refreshSession()` uses it, because every one of its ~12 call sites is "I just wrote something the profile must reflect" (joining a community, picking a flat, editing the profile).
- A monotonic `profileLoadSeqRef` means only the most recently **started** load may write. Without it, `force` alone would be unsafe: a read issued before the write could resolve after the forced refresh and put the pre-change answer back on screen.
- `authGenerationRef` does the same for teardown — a slow read cannot repopulate state for a user who has just been signed out.

### 1e. `TOKEN_REFRESHED` no longer reloads the profile

The event changes the JWT and nothing else. Reloading cost a `profiles` round trip roughly hourly *and* replaced the `user` object, which cascaded (see Part 3).

### 1f. Safety timer

Was `setTimeout(() => { if (!sessionRef.current) setIsLoading(false); }, 8000)`. The guard meant the one case that can actually wedge the splash — a session present, its profile read hanging — was the one case the timer refused to release. Now unconditional at 6 s.

---

## Part 2 — The installed PWA: every launch waited on the network for the shell

`public/service-worker.js` served navigations **network-first**. For an installed PWA that means each cold launch blocked on a round trip for `/app.html` before the browser could even parse the script tag and start fetching the (already cached) bundle. Offline or on a bad connection it waited for that fetch to fail first.

Now **stale-while-revalidate**: the cached shell is returned immediately and refreshed behind it via `event.waitUntil`. If nothing is cached for that URL, it falls back to the previous behaviour (network, then the precached shell).

**The trade, stated plainly:** a deploy reaches an installed client on the launch *after* the one that fetched it. That is the standard PWA bargain, and it is already anticipated in this codebase — the long pull-to-refresh (`HARD_RELOAD_THRESHOLD` in `components/useWebPullToRefresh.ts`) exists precisely so a user can force a new build immediately.

`CACHE_NAME` was bumped to `wooru-pwa-v10` so installed clients pick up the new strategy.

Also in the shell (`build-admin.js`):

- The Google Fonts stylesheet is loaded `media="print"` → `onload="this.media='all'"`, with a `<noscript>` fallback. A plain third-party `rel="stylesheet"` blocks first paint on that request even though `display=swap` means the font itself does not. `lib/webFonts.ts` treats it as satisfied either way.
- `<link rel="preconnect">` to the Supabase origin, derived from `EXPO_PUBLIC_SUPABASE_URL`. The first thing the app does after the bundle evaluates is hit that origin, so paying DNS + TCP + TLS in parallel with the bundle download rather than serially after it removes a handshake from cold start.

`public/landing.html` was **deliberately not** given the non-blocking font treatment. It is a static marketing page where type is the content, and it is what Google's OAuth reviewer reads without JavaScript.

---

## Part 3 — Per-screen work

### The worst one: an unfiltered whole-table read on the landing list

`app/(tabs)/index.tsx` ran this on **every load of the Providers screen**, which is the app's Help tab:

```ts
supabase.from('provider_hires').select('provider_id, user_id')   // no filter at all
```

It fetched every hire row for every provider in every community, to compute a contact count for at most 100 providers — and the list could not paint until it returned. It grows without bound with usage, so this got worse over time, which matches "*sometimes* app is taking time".

`provider_hires` has no `community_id` column, so it cannot be scoped the usual way. It is now scoped to the provider IDs actually on screen and moved to a **second wave**: the list paints as soon as `service_providers` + `favorites` land, and counts patch in when they arrive. Counts already seen are held in a ref for the session so a refetch does not flash every tile back to "0 contacts".

> `docs/features.md` claimed this query was "scoped to `communityId`". It never was, and it could not have been. The doc has been corrected.

### A query whose result was never rendered

`fetchCommunityStats()` fetched the newest `events` row *and all its `event_transactions`*, summed the income, and stored it in `activeFund` — which nothing read. It ran on mount and on every pull-to-refresh. Deleted.

### The visits fetch ignored its own debounce

`fetchVisits` was declared `useCallback(..., [communityId, user?.id, searchQuery])` — the **raw** input, not `debouncedSearchQuery`. Every keystroke on the Visits tab re-ran a three-query load. This violated the repo's own rule in `docs/CLAUDE.md` §3 ("that state goes in the fetch dependency array. Never the raw input"). Fixed.

Its two independent follow-up reads (creator profiles, joiner counts) also ran as separate `await`s and are now a single `Promise.all`.

### Contexts keyed on the `user` object

Supabase returns a **new object identity** on every auth event. `NotificationContext` depended on `[user]`, so it tore down and rebuilt its realtime channel and refetched 50 notification rows on every one of them — including the hourly token refresh. Now keyed on `user?.id`.

### Focus refetching was left alone, on purpose

Every list screen refetches on focus. That is a documented convention (`docs/CLAUDE.md` §3) and it is why a provider you just created appears when you navigate back. A staleness TTL would have made returning to a tab cheaper at the cost of breaking exactly that. It was not added.

The reason focus refetching does not *look* slow is that no screen clears its list first — the previous data stays on screen and `ListEmptyComponent`'s spinner only renders when there is genuinely nothing to show. That property is now stated in `docs/features.md` so it does not get "cleaned up" later.

---

## Part 4 — Always-on animations

`components/GlobalBottomNav.tsx` ran an `Animated.loop` on the centre MCN disc with `useNativeDriver: false`, for as long as MCN was the active tab — i.e. **permanently, on the app's landing tab**. On the JS driver that holds a 60 fps animation frame plus a bridge write alive forever. Three `AnimatedTileGlyph` loops on the MCN hub did the same.

Every one of these animates **transform and opacity only**, so on native they can run on the UI thread. `USE_NATIVE_DRIVER` in both files now does that.

`react-native-web` has no native driver at all, which is what `docs/verandah.md` originally documented — and that documentation was correct for web and over-generalised to native. On web the perpetual disc float is now **skipped entirely** (`RUN_IDLE_DISC_FLOAT`) rather than competing for the main thread the rail shares with scrolling; the disc still settles to −3. The highlight slide stays JS-driven on both, as before.

The tile glyphs keep their web loops — they are documented design intent and already honour `useReduceMotion()`.

---

## Part 5 — Bundle: `framer-motion` for a feature nobody can reach

`components/SchoolRadarChart.web.tsx` was the only importer of `framer-motion` in the codebase. Because `web.output: 'single'` ships the whole app as one bundle with no code splitting, **every visitor downloaded it on every cold load** — for a chart that only appears inside the schools catalog, which is hidden behind `SCHOOLS_CATALOG_ENABLED = false`.

Measured by exporting with and without it:

| | raw | gzip |
|---|---|---|
| Before | 3,114,713 B | 772,916 B |
| After | 2,764,875 B | 687,134 B |
| **Saved** | **−349,838 B (−11.2%)** | **−85,782 B (−11.1%)** |

The animations were **reimplemented, not dropped** — entrance staggers, the rotating dashed ring, the idle breathe and the stroke draw-on are now CSS keyframes at the same timings, plus a `prefers-reduced-motion` block the framer version never had. Two techniques worth knowing if you touch that file:

- SVG's `pathLength="1"` renormalises a path's length to 1, so `stroke-dasharray`/`stroke-dashoffset` can be written in units of "the whole path" — the CSS equivalent of framer's `pathLength`.
- Each animated element's **base style is its final state** and the keyframes run `animation-fill-mode: both`. That is what lets the reduce-motion block simply switch every animation off and land on a correct static chart.

`framer-motion` was removed from `package.json`. **Do not reintroduce it.** Noted in `docs/hidden-features/mcn-schools-and-borrow.md` so it gets re-checked when the flag flips.

`xlsx` is also in `package.json` and also unused by the app — but it is not reachable from any import, so Metro never bundles it and removing it would save nothing at runtime. Left alone.

---

## Product change in the same pass

The **greeting line on the Providers screen** ("Good morning, <name>") was removed, along with its `greeting`/`firstName` memos and styles. The header's `paddingBottom` went 4 → 12 to absorb the spacing the greeting used to provide.

The MCN screen was left as-is: it has no greeting and never did — its hero is the serif "My Community Network" title.

---

## What was not verified

Honest limits on the above:

- **No browser or device run.** There is no browser automation in the environment this was done in. Validation was `npx tsc --noEmit` plus a full `npm run build`, and the bundle sizes were measured from real `expo export` output. Nothing here was observed rendering.
- **No before/after timing numbers.** The serial-round-trip and render-blocking claims come from reading the code, not from a profiler trace or a Lighthouse run. The direction is not in doubt; the magnitude is unmeasured.
- **The two changes most worth eyeballing on a real device** are (a) the web font swap — first paint now uses the fallback stack until the woff2 lands, and Plus Jakarta Sans / Instrument Serif have different metrics from system sans / Georgia; and (b) the warm-start path across sign-out → sign-in and across joining a community, where a stale snapshot would show for one frame before the live load corrects it.
- **Service worker v10 only takes effect once the new worker activates.** Existing installs keep v9 behaviour until then. Verify with DevTools → Application → Service Workers that `wooru-pwa-v10` is active before concluding the launch path changed.

---

## Follow-ups not taken

Deliberately left, with reasons:

1. **Precache the hashed JS bundle in the service worker.** `build-admin.js` knows the bundle's hashed filename and could inject it into `dist/service-worker.js`'s `STATIC_ASSETS`, and could derive `CACHE_NAME` from content — which would also permanently fix the "forgot to bump `CACHE_NAME`" trap in `docs/CLAUDE.md`. Skipped as scope: the cache-first branch already caches the bundle on first fetch, so the gain is limited to the very first launch after install, and a wrong cache name breaks offline for everyone.
2. **Code-split the web bundle.** 687 KB gzip is large. Expo/Metro can emit async chunks, but `output: 'single'` currently forbids it and verifying lazy routes is a project of its own.
3. **Collapse the MCN hub's six count queries into one RPC.** They already run in parallel and the cards render without waiting, so this is bytes rather than latency — but it is a clean win if that screen is touched again.
4. **`NotificationContext` fetches 50 full rows at startup** to derive a badge count. A `head: true, count: 'exact'` read for the badge plus a lazy list load on the notifications screen would be cheaper.
