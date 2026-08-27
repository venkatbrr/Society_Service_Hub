# MCN nested-screen back navigation — browser back & Android hardware back

**Status:** Fixed 2026-08-27. Root cause found and removed; reproduced, fixed, and re-verified in headless Chrome against the local dev server.
**Scope:** deleted `app/mcn/_layout.tsx`; simplified `lib/navigation.ts`.
**History:** an earlier pass on 2026-08-16 misdiagnosed this and shipped a timing-window workaround. That workaround is now removed. §4 keeps the record of why it looked right.

---

## 1. The report

Browser-back from `/mcn/listing-add`, `/mcn/parents/add`, `/mcn/drops/add` or `/mcn/carpools/add` landed on the **Borrow & Share composer** — the hidden `/mcn/add` screen — while the address bar correctly read the parent route (`/mcn/business`, etc.). Correct URL, wrong screen.

It had been reported before, on 2026-08-16, with a *different* visible symptom: back dropped the user on `/network` (or `/login` when signed out). Same bug — see §4.

## 2. Root cause

`app/mcn/_layout.tsx` rendered a `<Stack>` nested inside the root `<Stack>`. Its `screenOptions` were byte-identical to the root Stack's (`headerShown: false`, `contentStyle: { backgroundColor: Verandah.surface }`), so it changed nothing — it existed only because the folder had a layout file. That nested navigator was the whole problem.

The failure chain, in order:

1. **A cross-branch push records an incomplete history entry.** Cross into `/mcn/*` from a root-Stack sibling with `router.push()`. `expo-router`'s `useLinking.js` writes the history entry from its `state` listener the moment the push commits — which is *before* the freshly-mounted `mcn` navigator has any state of its own. The recorded entry's path is correct; its state has the `mcn` route with **no child state**.

2. **Browser-back replays that entry verbatim.** `useLinking.js`'s popstate handler does:
   ```js
   const record = history.get(index);
   if (record?.path === path && record?.state) { navigation.resetRoot(record.state); return; }
   ```
   The record matches by path, so its stateless snapshot is what gets restored.

3. **The nested stack rehydrates to its fallback initial route.** `StackRouter.getRehydratedState` filters the incoming routes against `routeNames`, finds none for the `mcn` stack, and takes the `routes.length === 0` branch:
   ```js
   const initialRouteName = options.initialRouteName !== undefined ? options.initialRouteName : routeNames[0];
   ```

4. **`routeNames[0]` was `add`.** `app/mcn/` has no `index.tsx` and the layout set no `initialRouteName`, so the fallback fell to whatever expo-router sorted first. Its tiebreak (`expo-router/build/sortRoutes.js`) is `a.route.length - b.route.length` — **route-name length**. `add` (3 chars) is the shortest name in the folder, so the fallback was the hidden Borrow & Share composer.

The root Stack meanwhile kept the correct route and URL, which is why the address bar looked right.

Measured directly (headless Chrome, `navigationRef.getRootState()` snapshots around the back press):

```
before back:  [stack {legal/navtest, *mcn}] -> [stack idx=1 {drops/navtest, *drops/add}]
after  back:  [stack {legal/navtest, *mcn}] -> [stack idx=0 {*add}]        <- fallback initial route
URL after back: /mcn/drops/navtest                                          <- correct
```

`usePathname()` also reads `/mcn/drops/navtest` after the back — expo-router's store and the navigator state genuinely disagree, which is why no path-comparison guard inside the app can detect this. It has to be fixed at the navigator.

## 3. The fix

**Deleted `app/mcn/_layout.tsx`.** A folder without a layout is flattened into its parent navigator, so `/mcn/*` screens became plain root-Stack screens (route names `mcn/business`, `mcn/drops/add`, …). With no nested navigator, there is nothing to mis-rehydrate: the recorded history state is always complete, because no navigator mounts mid-push.

What did **not** change:
- URLs, `href`s, and `getImmediateParentRoute()` — those key off pathnames, not route names.
- Headers. MCN screens set their own via `<Stack.Screen options={buildMcnHeaderOptions(...)} />`, which targets the nearest Stack — now the root one. Verified by screenshot: serif title, circled back arrow, correct surface.
- Screen options. The root Stack already sets both options the deleted layout set.

One intentional difference: `/mcn/*` screens now inherit the root Stack's `animation: 'slide_from_right'`, which the mcn Stack did not set. That matches the rest of the app.

Also removed from `lib/navigation.ts`: the 2026-08-16 workaround (`lastPopLandedRoute`, `lastPopLandedAt`, `SPURIOUS_DRIFT_WINDOW_MS`, and the guard block in `syncNavigationStack`, whose `router` parameter is now unnecessary). See §4.

## 4. Why the 2026-08-16 diagnosis looked right — and was wrong

At that time `app/mcn/add.tsx` was a bare `<Redirect href="/(tabs)/network" />` (it had been stubbed out in `ce09600`). So step 4 above rendered a redirect, and the user was thrown to `/network` — then on to `/login` for an anonymous test session. The investigation measured exactly that and concluded expo-router was "independently re-resolving to the default landing route ~180ms after the popstate, with no new popstate and nothing in this app requesting it."

That reading was reproducible but wrong about the cause: the "unexplained" navigation was `mcn/add`'s own `Redirect`, mounted because the stack had fallen back to it. The 600ms window it shipped treated a symptom, and it could hijack a genuine Network-tab tap made within 600ms of a browser-back.

The bug resurfaced as "back shows Borrow & Share" when `a89c42d` (2026-08-27) restored `add.tsx` to a real screen — removing the redirect that had been disguising it.

Confirmed by re-running the repro with the old `<Redirect>` restored: the instrumented log reproduces the original fingerprint exactly.

```
t=  531  pushState    /mcn/drops/add
t= 3198  replaceState /login
t= 3199  replaceState /login
t= 3199  replaceState /login
t= 3199  popstate     /login
```

**If a `/network` drift is ever observed again, it means a different navigator is mis-rehydrating. Fix that navigator; do not re-add a timing window.**

## 5. Verification

Driven over the Chrome DevTools Protocol against the local dev server. The mechanism needs no session, so the harness used two throwaway public routes — one root-Stack sibling under `/legal/*` and one inside `/mcn/drops/*` (both are unauthenticated per the guard in `app/_layout.tsx`) — and asserted the **rendered screen** as well as the URL. The harness routes were deleted afterwards.

| # | Case | Before | After |
|---|---|---|---|
| A | cross-branch entry, 3 pushes, 3 backs | back #2 → Borrow & Share | pass ×4 |
| B | forward button after backs | pass | pass ×2 |
| C | cold deep-link into a nested route, push, back | pass | pass ×2 |
| D | cross-branch entry, one push, one back | **Borrow & Share** | pass |
| E | push to a sibling list route, back | (unreachable — page was Borrow & Share) | pass ×2 |

11/11 after the fix; 2 hard failures plus one aborted case before it, on the same suite. Header back arrow (`goBackSmart`) checked separately: `/mcn/drops/add` → `/mcn/drops`, correct.

`npx tsc --noEmit` clean.

## 6. Not verified

- **Native Android/iOS.** Web/PWA is the shipping target. The Android `hardwareBackPress` workaround in `useSyncedBackNavigation` is unchanged and still warranted — `(tabs)` remains a navigator under the root Stack — but no device pass was done.
- **`(tabs)`.** The same expo-router mechanism could in principle affect the one remaining nested navigator. It was not reproduced, and a `Tabs` navigator rehydrates differently (`TabRouter` builds all tab routes rather than falling back to a single one), so the blast radius is smaller. Not investigated further.

## 7. The rule this leaves behind

**Do not give an `app/` sub-folder a `_layout.tsx` unless it sets options the parent navigator does not already set.** A layout file is not free structure — it creates a navigator, and a navigator nested under the root Stack is what broke this twice. Recorded in `docs/CLAUDE.md` §9 and `docs/architecture.md` §9.
