# Full-screen photo overlays — browser back should close the photo, not leave the screen

**Date:** 2026-08-16
**Status:** Fixed, verified with Playwright against the real food-drop image modal, and confirmed working by the reporter.
**Reported symptom:** Open a photo on any screen, then press the browser back button. Instead of just closing the photo, it went "two steps back" — the image closed *and* the app navigated to the previous screen in a single press.

**Separate from** [`mcn-nested-navigation-back-fix.md`](mcn-nested-navigation-back-fix.md). That was an upstream expo-router routing defect; this is a pre-existing gap in our own overlay code. Neither fix was modified to make the other work, and the earlier fix was re-verified afterwards (see [Verification](#verification)).

---

## Files changed

| File | Change |
|---|---|
| `lib/useWebBackToClose.ts` | **New.** Shared hook — gives a web overlay a history entry to spend so back dismisses it. |
| `components/ImageViewer.tsx` | Calls the hook. Covers `app/events/[id].tsx` and `app/mcn/listing/[id].tsx`. |
| `app/mcn/drops/[id].tsx` | Hand-rolled image `<Modal>` — opts into the hook explicitly (food drops). |
| `app/services/[id].tsx` | Hand-rolled image `<Modal>` — opts into the hook explicitly (service reminders). |
| `lib/navigation.ts` | Additive `noteOverlayHistoryPop()` so an overlay's popstate doesn't desync the route tracker. No existing branch changed. |
| `docs/CLAUDE.md` | Records the sanctioned exception to the "never intercept `popstate`" rule. |

---

## The mistake that cost a round-trip: there are four overlays, not one

**The first attempt fixed only `components/ImageViewer.tsx` and appeared to change nothing.** The reporter tested again and said *"still is going back two steps."*

The reason: only **two** of the four full-screen photo overlays actually use the shared component. The other two are hand-rolled `<Modal>`s written directly into their screens — and one of them is **food drops**, which is exactly where the bug was being reported from. So the first fix was real, but it landed on screens the reporter wasn't looking at.

| Overlay | Implementation | Screens |
|---|---|---|
| `components/ImageViewer.tsx` | shared component | `app/events/[id].tsx`, `app/mcn/listing/[id].tsx` |
| inline `<Modal>` + `selectedImageUrl` | hand-rolled, opts into the hook | `app/mcn/drops/[id].tsx` — **food drops** |
| inline `<Modal>` + `previewImage` | hand-rolled, opts into the hook | `app/services/[id].tsx` — service reminders |

**Lesson for the next person:** fixing the shared component is not the same as fixing the behavior. `docs/CLAUDE.md` tells you to reuse `ImageViewer` for cropped cover images, which makes it easy to assume every photo overlay goes through it. Two do not. Before declaring an overlay-wide behavior fixed:

```bash
grep -rn "selectedImage\|previewImage\|ImageViewer\|fullScreenImage" app/ components/
```

If a fifth overlay appears, it needs `useWebBackToClose` too.

---

## Root cause

Every full-screen photo overlay in the app is a React Native `Modal` whose visibility is component state. On web these render as a DOM overlay inside the current document and **create no browser history entry of their own**.

So when the overlay was open, the browser's back button had nothing belonging to the overlay to pop — it popped the *screen's* entry instead:

1. Browser pops the current screen's history entry.
2. expo-router navigates to the previous screen.
3. The screen unmounts, taking the modal (and its `uri`/`selectedImageUrl` state) with it — so the photo "closes" as a side effect.

Both things happened on one press, which is exactly the "two steps" the report describes.

**Reproduced with Playwright.** First against a temporary `ImageViewer` probe mounted on the public food-drop detail screen (probe reverted), then confirmed identically against the screen's own real image modal:

```
on detail screen: /mcn/drops/3d8d106d-...
--- open image overlay ---
overlay state: IMAGE_OPEN | history.length: 3     <- unchanged by opening
--- browser BACK once ---
overlay state after back: (screen unmounted)
URL after back: /mcn/drops                        <- navigated away too
VERDICT: FAIL — back navigated the screen instead of closing overlay
```

`history.length` staying at 3 across the open is the whole bug in one number: the overlay owns nothing to spend.

---

## The fix

A web overlay can only absorb a back press if it **owns a history entry to spend**. `useWebBackToClose(open, onClose)` in `lib/useWebBackToClose.ts` does this once; every photo overlay calls it. On open (web only) it pushes a duplicate of the current entry, so a back press pops *that* entry — closing the overlay and leaving the underlying screen untouched.

```ts
const previousState = window.history.state;
window.history.pushState(
  { ...(previousState ?? {}), [OVERLAY_HISTORY_KEY]: true },
  '',
  window.location.href
);
```

Two details make this safe next to expo-router — both deliberate, neither optional:

1. **The URL never changes.** We re-push `window.location.href`, so expo-router is never asked to resolve a *different* route. Its popstate handler sees an unchanged path at an unchanged index and re-applies the state it already had. This is **not** the popstate-racing pattern that corrupted browser history in this codebase before (`docs/CLAUDE.md`: *"Never intercept `popstate`"*) — that failure was a manual `router.replace()` fighting expo-router mid-navigation over *which route to show*. Here there is no route change to fight over.

2. **`history.state.id` is preserved.** Verified at runtime that expo-router's state is `{"id":"nnET7zxDnAmxMQdbb-sNY"}`. `createMemoryHistory` derives its current index from that id:

   ```js
   get index() {
     const id = window.history.state?.id;
     if (id) { const i = items.findIndex(x => x.id === id); return i > -1 ? i : 0; }
     return 0;   // <- what a null-state push would collapse to
   }
   ```

   Pushing `null`/`{}` state would leave the id undefined, collapse expo-router's index to `0`, and desync every subsequent push/pop delta. Spreading the previous state keeps the id intact.

### Cleanup on the other exit paths

The entry must not outlive the overlay, or it would silently swallow a *later*, genuine back press. The effect cleanup handles the non-back exits (✕ button, backdrop tap):

- If a back press already spent the entry → do nothing (`entryLive` guard), so we never pop twice and walk the user back a real screen.
- If something navigated on top of our entry while the overlay was open (our marker is no longer the current `history.state`) → leave the stale duplicate alone rather than popping someone else's entry.
- Otherwise → `window.history.back()` to spend our own entry. The `popstate` listener stays attached to catch the resulting event, re-sync the tracker, and detach itself.

### Why `lib/navigation.ts` needed a small addition

Popping the overlay's entry fires a real `popstate` **at the same URL**. The module-level listener in `lib/navigation.ts` counts every popstate, but because the pathname never changes, `syncNavigationStack` never runs to re-sync `lastSeenPopSeq`. Left alone the counter stays permanently ahead, and the next undeclared `router.push()` resolves as `locate` instead of `push` — a push to a route already in the stack would then truncate it, which is the exact desync class `docs/CLAUDE.md` warns about.

`noteOverlayHistoryPop()` is called from the overlay's own popstate handler (*after* the module listener has counted the event) and re-syncs both signals:

```ts
export function noteOverlayHistoryPop() {
  lastSeenPopSeq = popStateSeq;
  sawPopStateAt = 0;
}
```

Purely additive — no existing branch in `lib/navigation.ts` was changed, and the earlier MCN navigation fix is untouched.

### Native is unaffected

No native change was needed. `Modal`'s `onRequestClose` already consumes the Android hardware back button and closes the overlay, and iOS has no back button. The hook early-returns on anything but web (`Platform.OS !== 'web'`), so native behavior is byte-for-byte what it was.

---

## Verification

**Against the real food-drop image modal** — the screen the bug was reported from, no test probe, clicking the actual cover photo:

| Check | Result |
|---|---|
| Opening the photo creates a history entry (`history.length` 3 → 4) | **PASS** |
| Browser back → URL stays on `/mcn/drops/<id>` | **PASS** |
| Browser back → the dark overlay is genuinely gone from the DOM, not just the URL holding | **PASS** |
| A second back → leaves to `/mcn/drops` as normal | **PASS** |

All four exit paths, driven against a temporary probe (reverted):

| Case | Result |
|---|---|
| Browser back while overlay open → overlay closes, URL unchanged | **PASS** |
| A second back press after that → navigates normally to the list | **PASS** |
| Close via UI (✕ / backdrop), then back → goes to the list, i.e. the press was *not* swallowed by a leftover entry | **PASS** |
| Navigation consistency after overlay use → back still resolves correctly | **PASS** |

Regression check on the separate MCN navigation fix, run after this change: drops list → detail → browser back still lands on `/mcn/drops` (not `/network`) — **PASS**.

`npx tsc --noEmit` clean across all touched files; the only remaining errors are the pre-existing `database.types` / `block_label` ones unrelated to this work.

Reporter confirmed the fix working after the second pass.

### Not directly tested

`app/services/[id].tsx` (service reminders) and `app/events/[id].tsx` (events) both sit behind a login that was not available during this work, so they were **not** exercised in a browser. They call the same hook as the verified food-drops path, so they are expected to behave identically — but they are reasoned-about, not device-tested. Worth a manual check on each before relying on them.

---

## Known limitation

If the app navigates programmatically *while* an overlay is open (not currently reachable — the overlay covers the screen and only offers close), the cleanup deliberately declines to pop and leaves one stale duplicate history entry behind rather than risk moving the user back a real screen. That would cost one extra back press in that scenario. Chosen as the safer failure mode; revisit only if an overlay ever gains in-content navigation.
