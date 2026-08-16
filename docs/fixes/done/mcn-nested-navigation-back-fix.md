# MCN nested-screen back navigation — Android hardware back & web browser back

**Date:** 2026-08-16
**Status:** Fixed and verified (Android: confirmed via matching upstream issue + code fix; Web: confirmed via Playwright repro, fixed, and re-verified against the same repro; iOS: not affected by either bug's mechanism, reasoned from code — not verified on a real device/simulator, see §2 below).
**Scope:** `lib/navigation.ts` (`useSyncedBackNavigation`, `syncNavigationStack`), affects every `/mcn/*` module reached from a sibling top-level route — food drops, carpooling, parent corner.

**Reported symptom:** From a nested MCN screen (e.g. a food drop's detail or manage screen, a carpool detail, a parent-corner nested screen), pressing the Android hardware back button — or, more importantly since this app is shipping as a web/PWA first, clicking the browser's back button — skipped the immediate previous screen and dropped the user all the way back to `/network` (the MCN hub / post-auth landing route), or to `/login` if signed out.

---

## Two independent bugs, one unaffected platform, same reported symptom

Android and web failed for **different, unrelated reasons**; both are now fixed in `lib/navigation.ts`. iOS was never affected by either mechanism (see below).

### 1. Android — hardware back deferred to a buggy internal handler

`useSyncedBackNavigation`'s `hardwareBackPress` listener used to do this when `router.canGoBack()` was true:

```ts
setNavIntent('back');
return false; // defer to React Navigation's own listener
```

Returning `false` is the standard React Native pattern for "not handled here, let the next listener try" — normally React Navigation's own internal `hardwareBackPress` listener (registered by the Stack/Tabs navigators) picks it up and pops correctly.

`/mcn` is a Stack navigator nested under the root Stack (a sibling of the `(tabs)` group), and React Navigation has a confirmed, still-open upstream bug with hardware-back deferral in exactly this shape: [expo/expo#33489](https://github.com/expo/expo/issues/33489) ("Android back button is closing the app on a nested stack inside tabs"). Deferring can pop the wrong navigator entirely, landing on the root instead of the previous nested screen.

**Fix:** drive the pop ourselves and swallow the event instead of deferring:

```ts
if (typeof router.canGoBack === 'function' && router.canGoBack()) {
  backTracked(router);
  return true;
}
```

This is the standard community workaround for the linked upstream issue. It's a small, low-risk change — one hook, mounted once at the root layout, so it covers every `/mcn/*` module automatically.

### 2. iOS — not affected by either bug, not separately tested

No iOS-specific code change was made, and none was needed for the two bugs above:

- **The Android bug doesn't apply.** iOS has no hardware back button, so it never fires `hardwareBackPress` and never goes through `useSyncedBackNavigation`'s Android-only branch (`if (Platform.OS !== 'android' ...) return;`). Back navigation on iOS is the native edge-swipe gesture and the header back button, both handled entirely inside `react-native-screens`' native stack (`UINavigationController`), outside any JS listener chain this app owns.
- **The web bug doesn't apply.** It's specific to `expo-router`'s browser `popstate`/DOM-history sync (`useLinking.js`), which only runs on web.

**Caveat — this was reasoned from the code, not verified on a device or simulator.** No iOS hardware/simulator was available in this environment, so there is no equivalent Playwright-style repro for iOS the way there is for Android (matched against a public upstream issue) and web (reproduced directly). `react-native-screens`' native stack implementation is shared across Android and iOS, and the nested-Stack-under-root-Stack shape that triggered the Android bug is identical on iOS, so a *different*, iOS-specific manifestation of a similar nested-stack issue can't be fully ruled out from code reading alone. This was explicitly deprioritized per the product decision to ship web/PWA first and not worry about the native apps for now — flag it for a real device pass before native Android/iOS builds matter again.

### 3. Web — browser back correct for one frame, then silently overridden

This one took real reproduction work to pin down, because the obvious suspect (`lib/navigation.ts`'s tracked-stack bookkeeping) turned out to be innocent. That bookkeeping only feeds `goBackSmart()` (the in-app header back arrow) — it never touches real browser history, and the docs already document (see `docs/CLAUDE.md` §"Never intercept `popstate`") that this codebase was previously burned by code that tried to react to `popstate` and raced expo-router's own handler, corrupting browser history. That prior incident made it important **not** to reach for the same kind of fix again without solid evidence.

**Reproduction (Playwright, headless Chromium against the local dev server):**

1. Cross into `/mcn/*` from a *different* root-Stack sibling via `router.push()` (e.g. `/network` → `/mcn/drops`, mounting the `mcn` Stack navigator fresh for that session).
2. Push once more inside it (e.g. drop list → drop detail).
3. Press browser back **once**.

Instrumenting `window.history.pushState`/`replaceState` with `performance.now()` timestamps showed:

```
t=10ms    POPSTATE   /mcn/drops        <- correct, real browser back
t=186ms   REPLACE    /login            <- wrong, and not caused by us
t=186ms   REPLACE    /login
t=187ms   REPLACE    /login
```

`window.location.pathname` genuinely read the correct parent URL for one render immediately after the `popstate` event. Then, ~180ms later, with **no new `popstate` event** and **nothing in this app's code requesting it**, `expo-router`'s web history sync (`node_modules/expo-router/build/fork/useLinking.js`) independently re-resolved the navigation state to the app's default/initial route (`/network`). That transition doesn't originate from our reducer — it reproduces identically with `lib/navigation.ts`'s bookkeeping mentally subtracted from the picture, confirmed by instrumenting `app/_layout.tsx`'s auth guard directly and watching `usePathname()` pass through `/network` as a real, distinct render before our own `!session` guard (correctly, on its own terms) then redirected an anonymous test session onward to `/login` — which is exactly why the anonymous repro shows `/login` while a real signed-in user (who has no reason to be redirected away from `/network`) would just silently land on `/network` instead, matching the original report.

A cold, direct page-load into `/mcn/drops` (no cross-branch push involved) does **not** exhibit this — the mcn Stack has to be freshly mounted via a client-side push during the session. Swapping `router.push()` for `router.navigate()` on the cross-branch hop does not avoid it either (tested).

This matches community reports of the same class of expo-router/React Navigation web defect with nested Stacks reached via a cross-branch push (see e.g. [expo/expo#35140](https://github.com/expo/expo/issues/35140) and the substack post "Constructing route stack history with Expo Router") — it is an upstream limitation, not a mistake in this codebase.

**Fix — a post-hoc correction, not a `popstate` interception.** `syncNavigationStack()` now arms a one-shot marker whenever it resolves a genuine pop:

```ts
let lastPopLandedRoute: string | null = null;
let lastPopLandedAt = 0;
const SPURIOUS_DRIFT_WINDOW_MS = 600; // measured drift is ~180-300ms
```

If the *very next* pathname change is unexplained — no new `popstate`, no declared `pushTracked`/`replaceTracked`/`backTracked` intent — and it lands specifically on `POST_AUTH_LANDING_ROUTE` (`/network`) within that window, it's recognized as the drift artifact and reversed with a single `replaceTracked()` back to the real destination:

```ts
if (
  router && Platform.OS === 'web' && !hadExplicitIntent && intent === 'push' &&
  lastPopLandedRoute && route === normalizeRoute(POST_AUTH_LANDING_ROUTE) &&
  route !== lastPopLandedRoute && Date.now() - lastPopLandedAt < SPURIOUS_DRIFT_WINDOW_MS
) {
  const correctTo = lastPopLandedRoute;
  lastPopLandedRoute = null;
  replaceTracked(router, correctTo as any);
  return stack;
}
```

**Why this doesn't repeat the historical `popstate` mistake:** the earlier corruption came from reacting *mid-flight* — a manual `router.replace()` racing expo-router's own popstate handler while both were mutating navigation state at the same time. This guard does the opposite: it only acts *after* expo-router's own (wrong) resolution has already fully committed, using the same `replaceTracked()` helper every other correction in this app already goes through. It's a narrow, specific fingerprint (unexplained + lands on the one known default route + tight time window), not a general popstate handler.

**Verified with Playwright:**
- First back press: lands correctly on the list screen (was landing on `/network`/`/login` before the fix).
- Second consecutive back press: correctly continues to the screen before that.
- Forward navigation afterward: unaffected.
- Confirmed the correction only actually appears in the final URL when there's no competing redirect — an authenticated user (the real-world case) has no such competitor, since `/network` is always a valid destination for them.

---

## Known trade-off

`SPURIOUS_DRIFT_WINDOW_MS = 600` is a timing window, not a structural guarantee. Measured drift lands ~180-300ms after the real `popstate`, so 600ms leaves comfortable headroom for slower devices while staying well under normal human click-reaction time — a user pressing back and then deliberately tapping the Network tab within 600ms is possible but unlikely. If this ever needs revisiting, the fingerprint (unexplained pathname change, no popstate, lands on `POST_AUTH_LANDING_ROUTE`) is the part to keep narrow; widening the time window is the least safe way to make it more aggressive.

## Where this is also documented

`docs/CLAUDE.md` §9 (Known traps) carries both entries with the full evidence trail, so this isn't re-investigated or accidentally reverted later:
- "Returning `false` from the Android `hardwareBackPress` handler..."
- "Web: browser-back from a nested `/mcn/*` screen lands on `/network`..."
