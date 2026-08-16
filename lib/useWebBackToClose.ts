import React from 'react';
import { Platform } from 'react-native';
import { noteOverlayHistoryPop } from './navigation';

/**
 * Marks the history entry an overlay owns while it is open. Kept alongside
 * expo-router's own `id` rather than replacing it — see below.
 */
const OVERLAY_HISTORY_KEY = '__wooruOverlay';

/**
 * Makes the browser back button (and the PWA's system back) dismiss a
 * full-screen overlay instead of leaving the screen underneath it.
 *
 * A `Modal` driven by component state owns no history entry, so back popped the
 * SCREEN's entry: the overlay closed *and* the user was thrown to the previous
 * screen in one press — two steps where they asked for one.
 *
 * The only way a web overlay can absorb a back press is to own an entry to
 * spend, so on open we push a duplicate of the current one. Two details make
 * that safe next to expo-router, and neither is optional:
 *
 *   1. The url never changes — we re-push `location.href`, so expo-router is
 *      never asked to resolve a different route. This is NOT the popstate-racing
 *      pattern that corrupted browser history before (see `docs/CLAUDE.md`);
 *      that was a `router.replace()` fighting expo-router over *which route to
 *      show*. Here there is no route change to contest: its popstate handler
 *      sees an unchanged path at an unchanged index and re-applies the state it
 *      already had.
 *   2. `history.state.id` is preserved. `createMemoryHistory` in expo-router
 *      derives its current index from that id; pushing null state would make the
 *      id undefined, collapse its index to 0, and desync every later push/pop.
 *
 * Native needs none of this — `Modal`'s `onRequestClose` already consumes the
 * Android hardware back button, and iOS has no back button at all.
 *
 * @param open  Whether the overlay is currently visible.
 * @param onClose  Closes the overlay. Called when the user presses back.
 */
export function useWebBackToClose(open: boolean, onClose: () => void) {
  const onCloseRef = React.useRef(onClose);
  React.useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !open) return;

    const previousState = window.history.state;
    window.history.pushState(
      { ...(previousState ?? {}), [OVERLAY_HISTORY_KEY]: true },
      '',
      window.location.href
    );

    // Flips as soon as our entry is gone, so the cleanup below never pops an
    // entry twice (which would walk the user back a real screen).
    let entryLive = true;

    const consumeEntry = () => {
      entryLive = false;
      window.removeEventListener('popstate', consumeEntry);
      // The module listener in lib/navigation.ts has already counted this
      // event; tell it the pop was ours so the route tracker stays in sync.
      noteOverlayHistoryPop();
      onCloseRef.current();
    };
    window.addEventListener('popstate', consumeEntry);

    return () => {
      // Back press already spent the entry and closed us.
      if (!entryLive) return;

      // Something navigated on top of our entry while the overlay was open, so
      // it is no longer the current one. Popping now would move the user back a
      // real screen; leave the stale duplicate alone instead.
      if ((window.history.state as any)?.[OVERLAY_HISTORY_KEY] !== true) {
        entryLive = false;
        window.removeEventListener('popstate', consumeEntry);
        return;
      }

      // Closed from the UI (✕ or tapping the backdrop). Spend our own entry so
      // it cannot swallow a later, genuine back press. `consumeEntry` stays
      // attached to catch the resulting popstate, re-sync the tracker, and
      // detach itself.
      window.history.back();
    };
  }, [open]);
}
