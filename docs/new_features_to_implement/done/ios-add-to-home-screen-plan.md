# Plan — iOS "Add to Home Screen" install nudge

**Status:** complete
**Created:** 2026-08-16
**Implemented:** 2026-08-16 — Phase 1 (`public/landing.html`: `#wn-ios-install`) and Phase 2
(`components/IosInstallBanner.tsx`, mounted in `app/_layout.tsx`) both shipped. Shared detection
(`isIOSSafari`) lives in `lib/pwaInstall.ts`, duplicated in `landing.html` per the plan (static file,
outside the bundle). `CACHE_NAME` bumped to `wooru-pwa-v9`. Docs updated: `features.md` §12,
`CLAUDE.md` §9, `disabled-features.md` §8. Out-of-scope items (VAPID, subscription table, SW push
handler, dispatch function) remain unbuilt, as planned.

## Goal

Give iPhone/iPad visitors a visible, dismissible prompt explaining how to install Wooru
(**Share → Add to Home Screen**), because iOS offers no programmatic install and today those
users see nothing at all.

Scope is **instructional UI plus platform detection only**. No backend, no migration, no
service-worker push handler, no VAPID keys.

## Why this matters

1. **The PWA is currently the only iOS distribution channel.** `app.config.js:19-21` declares an
   iOS target (`bundleIdentifier: 'in.wooru.app'`), but there is **no `ios/` native directory**
   (only `android/`), and `eas.json` has no iOS build profile — its `development` profile is
   Android-only. A native iOS app needs an Apple Developer account, a build, and App Store review.
   Until then, "Add to Home Screen" is the only way Wooru reaches an iPhone home screen.

2. **It unblocks notifications on iOS.** iOS grants web push (16.4+) **only to installed PWAs** —
   never to a normal Safari tab. `components/NotificationPermissionBanner.tsx:13` early-returns
   when `Notification` is undefined, which is exactly the state of iOS Safari before install. So
   **today no iOS user can ever receive a notification**, and no amount of backend work changes
   that until they install. This nudge is the prerequisite.

3. **It is cheap** — no schema, no edge function, no App Store dependency.

## Platform facts that constrain the design

| Fact | Consequence |
|---|---|
| Safari never fires `beforeinstallprompt` | `#wn-install` in `public/landing.html:482` and `PwaInstallBanner.tsx` both gate on that event, so **neither ever renders on iOS**. Nothing to "fix" — they are correctly hidden; iOS needs a separate surface. |
| There is no JS API to trigger Add to Home Screen | The prompt must be **instructional text**, never a button that claims to install. |
| iPadOS 13+ reports itself as `MacIntel` | UA sniffing alone misses iPads. Needs the `maxTouchPoints` check (below). |
| All iOS browsers are WebKit; only Safari's Add to Home Screen flow is canonical | Gate to Safari. Chrome iOS (`CriOS`) has its own variant flow — giving Safari instructions there would be wrong. |
| iOS exposes **no way to detect an existing install** from a Safari tab | `navigator.standalone` is `false` in the tab even when the icon is already on the home screen. A user who installed will still be nudged — see [Known limitations](#known-limitations). |
| Safari's Share button sits in the **bottom** toolbar on iPhone, **top** on iPad | Do not write "tap the button at the bottom". Name the control and show its glyph; never describe its position. |

## What already exists (reuse, do not re-derive)

| Asset | Location | Use |
|---|---|---|
| `isRunningAsInstalledPwa()` | `lib/pwaInstall.ts` | Already checks `display-mode: standalone` **and** `navigator.standalone`. Reuse verbatim; do not fork it. |
| Dismiss-cooldown pattern | `components/PwaInstallBanner.tsx:10-19` | 3-day `localStorage` cooldown. Copy the shape, use a **new key**. |
| Banner visual language | `components/PwaInstallBanner.tsx:108-157` | Icon chip + title/subtitle + action button + close. Match it. |
| ~~Slide-in animation~~ | — | **Do not add one.** `PwaInstallBanner` briefly carried an `Animated.timing` slide-in; it is being **removed** again (staged deletion as of 2026-08-16). Render the banner statically. If you later decide motion is needed, `docs/verandah.md:265` binds you to built-in `Animated` with `useNativeDriver: false` — Reanimated is a dependency but unused and unconfigured for web. |
| Bottom-toast CSS | `public/landing.html` — `.wn-open-toast` block | Fixed bottom, `translateY(160%) → 0` on `.is-visible`. The iOS banner should reuse this pattern. |
| iOS share glyph | `@untitledui/icons/Upload01` | **Verified**: `Upload01` is a box with an arrow exiting the top — the actual iOS share glyph. `Share03`/`Share04` are *external-link* arrows and are the wrong shape. |

## Architecture — two surfaces, two phases

The marketing page and the app are **separate documents**. In production `build-admin.js:120-142`
copies `public/landing.html` over `dist/index.html` and moves the Expo shell to `dist/app.html`.
An iOS user's first visit is the static landing page, which React never touches.

### Phase 1 — `public/landing.html` (do this first)

Highest value: it is the first touchpoint, and it is where the Android install button already lives.

**Implementation** — vanilla JS/CSS in the existing `<!-- PWA INSTALL -->` script block
(`public/landing.html:981`), alongside the `isInstalled()` / `showOpenApp()` helpers already there.

> **Line numbers in this plan were verified on 2026-08-16.** `public/landing.html` is edited
> frequently; if a reference does not match, grep for the named symbol rather than trusting the number.

1. Add markup next to the existing `#wn-open-toast` node (`public/landing.html:882`), modelled on it.
   Both share the `.wn-open-toast` class and therefore the same fixed bottom position — that is
   **safe and intentional**: `#wn-open-toast` only appears on `appinstalled`, which never fires on
   iOS, so the two can never be visible at once. Do not add offset/stacking logic for them.

```html
<div id="wn-ios-install" class="wn-open-toast" role="status" aria-live="polite">
  <img src="/images/icon-512.png" alt="" width="40" height="40" class="wn-open-toast-icon">
  <div class="wn-open-toast-body">
    <div class="wn-open-toast-title">Add Wooru to your home screen</div>
    <div class="wn-open-toast-sub">
      Tap
      <svg class="wn-ios-share-glyph" width="13" height="13" viewBox="0 0 24 24" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
           aria-label="Share" role="img">
        <path d="M21 15v1.2c0 1.68 0 2.52-.327 3.162a3 3 0 0 1-1.311 1.311C18.72 21 17.88 21 16.2 21H7.8c-1.68 0-2.52 0-3.162-.327a3 3 0 0 1-1.311-1.311C3 18.72 3 17.88 3 16.2V15"/>
        <path d="m17 8-5-5m0 0L7 8m5-5v12"/>
      </svg>
      Share, then "Add to Home Screen"
    </div>
  </div>
  <button type="button" id="wn-ios-install-close" class="wn-open-toast-close" aria-label="Dismiss">
    <!-- reuse the same × svg as #wn-open-toast-close -->
  </button>
</div>
```

The glyph must sit **inline in the sentence** (`vertical-align: -2px`), so it reads as the button
the user is looking for rather than decoration.

2. Add detection + gating JS:

```js
// iPadOS 13+ masquerades as macOS, so the UA alone is not enough — a Mac with
// touch points is an iPad. `navigator.platform` is deprecated but is still the
// only reliable signal for this and is not going away while iPadOS does it.
function isIOSDevice() {
  var ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Every iOS browser is WebKit, but only Safari's UA lacks a vendor marker.
// Chrome=CriOS, Firefox=FxiOS, Edge=EdgiOS, Opera=OPiOS. We gate to Safari
// because the Add to Home Screen flow differs elsewhere and wrong instructions
// are worse than none.
function isIOSSafari() {
  var ua = navigator.userAgent;
  return isIOSDevice() && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}
```

3. Show only when **all** hold:
   - `isIOSSafari()`
   - `!isInstalled()` — the helper already at `public/landing.html:1007`
   - dismiss cooldown elapsed, key `wooru_ios_install_dismissed_at`, **7 days**
     (longer than the Android banner's 3, because this ask is manual and higher-friction)

4. Delay the reveal ~1.5s after load so it does not fight the hero for attention, then add
   `.is-visible`. **Do not auto-hide** — unlike the post-install toast, this is an instruction the
   user needs while they hunt for the Share button. Dismiss only on × or after they navigate away.

5. **Respect `prefers-reduced-motion`** — the file already has a `@media (prefers-reduced-motion: reduce)`
   block; add the iOS banner's transition to it.

### Phase 2 — in-app React banner (optional, parity)

Catches already-signed-in iOS Safari users, who are the most likely to actually install.

Create `components/IosInstallBanner.tsx`, modelled directly on `PwaInstallBanner.tsx`:

- Move `isIOSSafari()` into `lib/pwaInstall.ts` and export it, so both phases share one definition.
  (Phase 1 cannot import it — landing.html is a static file outside the bundle — so the landing copy
  is a deliberate duplicate. Add a comment in **both** places pointing at the other, matching how
  `build-admin.js:167` already documents the `APP_SHELL_HEAD` duplication.)
- Gate: `Platform.OS === 'web'` && `isIOSSafari()` && `!isRunningAsInstalledPwa()` && cooldown.
- Mount in `app/_layout.tsx` beside `<PwaInstallBanner />` and `<NotificationPermissionBanner />`.
- Render statically — no entry animation (see the table above).

**Verandah rules apply to Phase 2 only** (`docs/CLAUDE.md` §4) — tokens from `constants/Colors.ts`
and `constants/Verandah.ts` only, no raw hex, `VerandahBorder.control` (0.5) for control borders,
`VerandahRadius.pill` for the button. Phase 1 is vanilla CSS and uses landing.html's own custom
properties (`--ink`, `--emerald`, `--hair-strong`, …).

**If you add motion despite the above, reduce-motion is a hard requirement.** `docs/verandah.md:223`
sets the house rule: animations must honour `AccessibilityInfo.isReduceMotionEnabled()`, and *"a
perpetual loop is precisely what that OS setting exists to stop; any future always-on animation
should do the same."* In particular **never add a looping/pulsing attention animation** to this
banner — that violates the rule outright. (Phase 1's landing-page banner is separately covered by
the existing `@media (prefers-reduced-motion: reduce)` block in `public/landing.html`.)

## Copy

Sentence case throughout (`docs/CLAUDE.md` §4). No emojis — icons only.

- **Title:** `Add Wooru to your home screen`
- **Body:** `Tap [share glyph] Share, then "Add to Home Screen"`
- **Dismiss affordance:** offer **two** exits, not one:
  - `×` → 7-day cooldown
  - a small text button `Already added` → sets a **permanent** flag
    (`wooru_ios_install_dismissed_permanently`)

The second exit is the mitigation for the "cannot detect existing install" limitation below. Without
it, a user who already installed gets nagged every 7 days forever with no way to say so.

## Known limitations (state these in the PR, do not try to solve them)

1. **No install detection from a Safari tab.** `navigator.standalone` is `false` in the tab even
   when the icon exists on the home screen. The `Already added` button is the only workaround.
2. **Instructional prompts convert worse than a real install button** — it is a two-step manual
   action. Expect low conversion; this is inherent to iOS, not a defect in the implementation.
3. **Non-Safari iOS browsers get nothing** in this scope. If wanted later, the follow-up is a
   variant reading `Open in Safari to install` rather than reusing the Safari instructions.
4. **Private Browsing** — `localStorage` writes can throw in older iOS private mode, and this is
   an iOS-specific feature, so it is a live risk here rather than a theoretical one. Wrap every
   `localStorage` access in `try/catch`. `app/_layout.tsx:47` shows the house pattern
   (`try { … } catch {}`), though it guards `sessionStorage` rather than `localStorage`. Note the
   existing banner only checks `typeof localStorage !== 'undefined'`
   (`components/PwaInstallBanner.tsx:14,59`), which does **not** catch the private-mode throw —
   the object exists, the write rejects. Do not copy that pattern; if the read or write throws,
   the banner should fail open and show, not crash the render tree.

## Deployment steps (do not skip)

1. **Bump `CACHE_NAME` in `public/service-worker.js:11` to the next `wooru-pwa-vN`.**
   Read the current value first and increment it — do **not** trust a version number quoted in this
   plan. As of 2026-08-16 committed `HEAD` held `v7` while the working tree held an uncommitted
   bump to `v8`, so the correct target depends on what has landed by the time you start.
   **This is mandatory**: `/landing.html` is in `STATIC_ASSETS` (`public/service-worker.js:24`) and
   is precached, so without the bump every already-installed client keeps serving the old landing
   page and never sees the banner. This is a documented trap in `docs/CLAUDE.md` §9.
2. `npx tsc --noEmit` — the only validation gate (Phase 2 only; Phase 1 is not typechecked).
3. Verify no migration is involved — there is none in this plan.

## Testing

Real-device testing is required; there is no emulator path that reproduces `navigator.standalone`.

| Case | Expected |
|---|---|
| iPhone Safari, not installed | Banner appears ~1.5s after load |
| iPhone Safari, launched from home screen | **No banner** (`navigator.standalone === true`) |
| iPad Safari, not installed | Banner appears (proves the `MacIntel` + `maxTouchPoints` branch) |
| Desktop Mac Safari | **No banner** (proves the same branch does not over-match) |
| iPhone Chrome (`CriOS`) | **No banner** in this scope |
| Android Chrome | **No banner**; existing `#wn-install` button still works, unchanged |
| Dismiss via × , reload | No banner; reappears after 7 days |
| Dismiss via `Already added`, reload | Never reappears |
| `prefers-reduced-motion: reduce` | No slide transition |

Desktop Safari can be forced into the iOS path for a smoke test via **Develop → User Agent → iPhone**,
but that does **not** exercise `navigator.standalone` — device testing is still required.

## Docs to update in the same change set

Per `docs/CLAUDE.md` §7, route each fact to exactly one owner:

- **`docs/features.md`** — the user-visible banner behaviour (when it shows, the two dismiss paths).
- **`docs/CLAUDE.md` §9** — a new trap row: *"Expecting `beforeinstallprompt` to fire on iOS"* →
  it never does; iOS install is manual and lives behind a separate instructional banner.
- **`docs/disabled-features.md` §8** — amend the PWA-web-push entry to note that iOS web push
  additionally requires an installed PWA, and that this banner is the prerequisite path.
- Do **not** restate detection logic in `features.md` — keep implementation detail in the code.

## Out of scope

Explicitly not part of this work — the second half of the notification story, still blueprinted in
`docs/archive/pwa-web-push-notifications-plan.md`:

- VAPID keys, `web_push_subscriptions` table, `pushManager.subscribe()`
- A `push` / `notificationclick` handler in `public/service-worker.js`
- Any dispatch Edge Function

Granting notification permission still results in **no delivered notifications** on any platform
until that work lands. This plan only ensures iOS users can reach the state where it becomes possible.
