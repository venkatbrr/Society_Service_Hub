# Plan — Sliding highlight animation for tab / filter buttons

**Status:** complete
**Created:** 2026-08-10

## Goal

Every tab strip and filter-chip row in the Providers screen and the MCN screens should get the
same moving-highlight behaviour the bottom nav already has: the coloured pill **slides** from the
old selection to the new one instead of disappearing and reappearing. Nothing else changes — no
new icons, no press bounce, no scroll-into-view, no colour redesign. Same geometry, same colours,
same labels; only the transition is new.

## What already exists

`components/GlobalBottomNav.tsx:239-312` is the reference implementation:

- One `Animated.Value` (`highlightX`) for the highlight's `translateX`.
- The bar measures itself via `onLayout`; `tabWidth = barWidth / TABS.length`.
- A `useEffect` on `activeIndex` runs `Animated.timing` — **460ms**, easing
  `Easing.bezier(0.34, 1.5, 0.5, 1)` (the springy overshoot), `useNativeDriver: false`.
- The highlight is `position: absolute` and `pointerEvents="none"`, painted *behind* the tabs.

`docs/verandah.md:163` fixes the house rules: React Native `Animated` only (Reanimated is a
dependency but unused and unconfigured for web), `useNativeDriver: false` everywhere because the
web/PWA target cannot use the native driver. This plan stays inside those rules — no new dependency.

## The two shapes we have to support

Auditing the screens turns up exactly two structural families. They need different mechanics, so
this plan builds **two** shared components rather than one.

### Family A — contained segmented control

A fixed-width row, equal-flex segments, a muted track behind them, and the **inactive segments have
no background of their own** — only the active one is filled. Because inactive segments are
transparent, this is a straight copy of the bottom-nav technique: one absolutely-positioned pill
behind the segments, `translateX = index × segmentWidth`.

| Where | Lines | Segments |
|---|---|---|
| [app/(tabs)/index.tsx](app/(tabs)/index.tsx#L505-L541) | 505–541 | Providers · Visits |
| [app/(tabs)/index.tsx](app/(tabs)/index.tsx#L679-L703) | 679–703 | Upcoming · Recent · Archived |
| [app/mcn/drops/index.tsx](app/mcn/drops/index.tsx#L323-L340) | 323–340 | Pre-order Food · Businesses |
| [app/mcn/business.tsx](app/mcn/business.tsx#L187-L203) | 187–203 | Pre-order Food · Businesses |
| [app/mcn/carpools/index.tsx](app/mcn/carpools/index.tsx#L257-L297) | 257–297 | All rides · Offering · Seeking · My carpools |

### Family B — pill / chip row

Variable-width chips, usually inside a horizontal `ScrollView`, and crucially the **inactive chips
carry their own opaque fill** (`Verandah.card` = `#FFFFFF`) plus a hairline border, sitting on a
`#FAF8F4` page. Widths are content-driven, so they must be measured, and the opaque fills create a
z-order problem (see "The z-order trap" below).

| Where | Lines | Chips |
|---|---|---|
| [app/mcn/drops/index.tsx](app/mcn/drops/index.tsx#L343-L373) | 343–373 | Open · Past · Mine |
| [components/CategoryFilter.tsx](components/CategoryFilter.tsx#L152-L195) | 152–195 | two rows: groups, then categories |
| [app/mcn/business.tsx](app/mcn/business.tsx#L230-L284) | 230–284 | All · Food & Beverages · … |
| [app/mcn/parents/index.tsx](app/mcn/parents/index.tsx#L515-L670) | 515–670 | four rows: type, board, intent, schools |
| [app/mcn/schools/index.tsx](app/mcn/schools/index.tsx#L365-L420) | 365–420 | two rows: locality, board |
| [app/mcn/my-posts.tsx](app/mcn/my-posts.tsx#L274-L315) | 274–315 | Local businesses · Borrow posts (bordered boxes, gap 10) |

Out of scope, but structurally identical if you want them later:
[app/legal.tsx](app/legal.tsx#L200-L230), [app/sos/index.tsx](app/sos/index.tsx#L513),
[app/sos/manage-contacts.tsx](app/sos/manage-contacts.tsx#L298).

## The z-order trap

This is the one thing that will silently break the effect if it is not designed for.

The bottom nav gets away with a pill painted *behind* its tabs because its tabs are transparent. A
Family-B chip row is not: while the pill flies from "Open" to "Mine" it passes underneath the
opaque white "Past" chip and vanishes for most of the transition. Painting the pill *above* the
chips instead is worse — a solid green rectangle sweeps over the neighbours' labels.

The pill has to live **above the chip fills and below the labels**. That means labels cannot stay
nested inside the chips. Resolution — three layers inside the row, all sharing one measured
geometry:

```
<View style={row}>                                  ← relative; the ScrollView contentContainer
  layer 1 (normal flow)   chips: border + inactive fill, pressable, label rendered at opacity 0
  layer 2 (absolute)      the pill: animated x / width / height, pointerEvents none
  layer 3 (absolute)      every label, drawn at its measured rect, animated colour, pointerEvents none
</View>
```

Layer 1 keeps its label at `opacity: 0` rather than removing it — the invisible text is what gives
each chip its natural width, so no label widths need hardcoding. Layer 3 then re-draws those same
labels at the rects reported by layer 1's `onLayout`, so the two layers are pixel-identical by
construction.

Family A needs none of this: its inactive segments have no fill, so the plain
pill-behind-the-buttons arrangement is correct and labels stay nested.

## Component 1 — `components/SegmentedSlider.tsx` (Family A)

```tsx
type SegmentedSliderProps<T extends string> = {
  segments: { key: T; label: string; renderLabel?: (active: boolean) => React.ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  /** Style overrides so each caller keeps its current look exactly. */
  trackStyle?: StyleProp<ViewStyle>;
  segmentStyle?: StyleProp<ViewStyle>;
  pillStyle?: StyleProp<ViewStyle>;
  activeTextStyle?: StyleProp<TextStyle>;
  inactiveTextStyle?: StyleProp<TextStyle>;
  /** Cross-route toggles: index the pill starts at on mount before sliding to `value`. */
  enterFromIndex?: number;
};
```

Mechanics:

1. **Measure each segment with its own `onLayout`** — do *not* compute
   `trackWidth / segments.length` the way the bottom nav does. The bottom nav can divide because its
   bar has no padding and no gap; these tracks do not match that. `masterToggleRow` carries
   `padding: 4` **and `gap: 4`** ([app/mcn/drops/index.tsx:676-684](app/mcn/drops/index.tsx#L676-L684),
   [app/mcn/business.tsx:466-474](app/mcn/business.tsx#L466-L474)), while
   `segmentedControl` uses `padding: 3` with no gap and `tabsContainer` uses `padding: 2` with no
   gap. Dividing gets the pill visibly wrong on the two master toggles. Measuring is also what
   Component 2 already does, so both components share one mechanism.
2. `Animated.parallel` on `pillX` and `pillW` from the measured rect — 460ms,
   `Easing.bezier(0.34, 1.5, 0.5, 1)`, `useNativeDriver: false`.
3. First layout **snaps** (`pillX.setValue`) — no animation on mount.
4. `renderLabel` exists for `my-posts` / `carpools`, whose segments contain an icon + text row.

The `enterFromIndex` prop exists for one specific case, below.

### Cross-route toggle: Pre-order Food ↔ Businesses

These two are not one component's state — they are two routes.
[app/mcn/drops/index.tsx](app/mcn/drops/index.tsx#L335) does `replaceTracked(router, '/mcn/business')`
and the destination screen mounts fresh with its own toggle already showing "Businesses" as active.
A slide inside one component is impossible here.

The illusion is restored by animating **on mount**: `business.tsx` renders the pill at index 0 and
immediately animates it to index 1; `drops/index.tsx` does the mirror. That is what `enterFromIndex`
is for. Both screens are always the same two-segment toggle, so the entry index is a constant per
screen — no navigation-param plumbing needed.

Caveat to accept: if the user lands on `/mcn/business` from somewhere other than the drops toggle
(deep link, back navigation), the pill still plays its slide-in. That is a one-off 460ms motion on
a screen that just appeared, and it reads as an entrance, not a glitch. The alternative — passing a
`from` param through `replaceTracked` and suppressing the animation otherwise — is more plumbing
than the effect is worth; do it only if the entrance turns out to be distracting in practice.

## Component 2 — `components/ChipRowSlider.tsx` (Family B)

```tsx
type Chip<T> = { key: T; label: string; icon?: React.ReactNode };

type ChipRowSliderProps<T> = {
  chips: Chip<T>[];
  value: T | null;
  onChange: (key: T) => void;
  scrollable?: boolean;            // wraps in a horizontal ScrollView (default true)
  chipStyle?: StyleProp<ViewStyle>;        // padding + radius, per caller
  inactiveChipStyle?: StyleProp<ViewStyle>;// fill + border
  pillStyle?: StyleProp<ViewStyle>;        // active fill + border
  activeColor: string;
  inactiveColor: string;
  textStyle?: StyleProp<TextStyle>;
  leading?: React.ReactNode;       // the "Board:" / "Looking for:" prefix labels
};
```

Mechanics:

1. Each chip's `onLayout` writes `{ x, width, height }` into a ref-backed array keyed by chip key.
   Because the pill lives inside the same `contentContainer`, these are content-space coordinates —
   it scrolls with the chips and needs no scroll-offset maths.
2. On `value` change, `Animated.parallel` over three values — `pillX`, `pillW`, `pillH` — all with
   **identical duration and easing** so the pill cannot distort mid-flight. Reuse the bottom nav's
   460ms + `Easing.bezier(0.34, 1.5, 0.5, 1)`. The overshoot applies to width as well as position,
   which reads as a slight rubber-band on the pill; if that turns out to be too much on the wide
   chips, drop these rows to `Easing.out(Easing.cubic)` at 320ms — that is the one tuning knob, and
   it should be a shared constant, not a per-caller prop.
3. Label colour crossfades over the same 460ms: one `Animated.Value` per chip, `interpolate`d over
   `[inactiveColor, activeColor]`. An instant colour swap while the pill is still in flight looks
   broken (dark-on-cream text where no pill has arrived yet), so the fade is not optional.
4. **Snap, don't slide, when the chip set changes.** `CategoryFilter`'s second row is rebuilt
   whenever the group changes, and `parents` / `schools` rows rebuild as data loads. Keep a
   signature of the chip keys in a ref; when it changes, `setValue` the pill to the new rect
   instead of animating, otherwise the pill slides from a rect that no longer exists.
5. Same snap-on-first-layout rule as Component 1.
6. `value: null` maps to a chip key rather than to "no pill". Checked across every row and this
   holds everywhere: each one has an All-style entry as its first chip — `'All'`
   ([CategoryFilter.tsx:190](components/CategoryFilter.tsx#L190)), `'All'`
   ([business.tsx:236-257](app/mcn/business.tsx#L236-L257)), `'All Types'` / `'All'` / `'All'` /
   `'All Schools'` ([parents/index.tsx:74-106](app/mcn/parents/index.tsx#L74-L106)), `'All Areas'` /
   `'All Boards'` ([schools/index.tsx:37-50](app/mcn/schools/index.tsx#L37-L50)). Deselecting an
   active chip sets state to `null` ([business.tsx:135](app/mcn/business.tsx#L135)), which is
   exactly the state that highlights the All chip — so the pill slides back to All instead of
   vanishing. **There is no empty-selection state to design for**, and no fade-out path is needed.
   Callers pass `'all'` as a real chip; `null` is accepted only for the transient pre-resolution
   render.

### Preserving each caller's look

Chip padding, radius, fill and border differ per screen — `drops` uses
`primary` fill with `primaryFg` text, `business` / `parents` / `schools` use `accentSoft` fill with
a `primary` or `accent` border. All of that stays exactly as it is today; it moves from the
caller's `styles` object into the `pillStyle` / `inactiveChipStyle` props. No colour token changes
anywhere in this plan.

## Accessibility

Both components keep what the current code has and the bottom nav sets:
`accessibilityRole="tab"`, `accessibilityState={{ selected }}`, `accessibilityLabel`. Layers 2 and
3 of the chip row are `pointerEvents="none"` and `accessibilityElementsHidden` / `importantForAccessibility="no-hide-descendants"`
so the duplicated label text is not announced twice.

`CategoryFilter` also carries the web drag-to-scroll handlers and the `suppressPressRef` guard
([components/CategoryFilter.tsx:88-124](components/CategoryFilter.tsx#L88-L124)) that stop a drag
from registering as a chip tap. `ChipRowSlider` must absorb that logic, not drop it — it is the
only thing making those rows draggable with a mouse in the PWA.

## Rollout order

Each step is independently shippable and independently verifiable.

1. **`SegmentedSlider`** + convert [app/(tabs)/index.tsx](app/(tabs)/index.tsx#L505-L541)
   Providers/Visits. Smallest possible surface, and it is the screen in the request.
2. Convert the remaining Family A rows: Visits sub-tabs, carpools, then the two cross-route master
   toggles with `enterFromIndex`.
3. **`ChipRowSlider`** + convert [app/mcn/drops/index.tsx](app/mcn/drops/index.tsx#L343-L373)
   Open/Past/Mine — a short, non-scrolling, fixed-content row, which is the easiest place to prove
   the three-layer measurement is pixel-identical to today's rendering.
4. Convert `CategoryFilter` (both rows, including the drag handlers). This is the highest-risk
   conversion: two rows, a changing chip set, and it is rendered on the Providers screen, so
   regressions here are visible immediately.
5. Convert `business` categories, then `parents` (four rows), `schools` (two rows), `my-posts`.

## Verification

- `npx tsc --noEmit` — the only gate this repo has.
- Manual pass on **web** (`npm run web`) and one native build. Web is where this can quietly fail:
  `useNativeDriver: false` is mandatory, and `onLayout` timing inside a horizontal `ScrollView`
  differs from native.
- Specific things to look at, since they are the failure modes this design is built around:
  the pill never disappears behind a neighbouring chip mid-flight; no label is ever covered by the
  pill; the pill does not slide in from a stale position when `CategoryFilter`'s group changes; the
  first render snaps rather than animating; drag-to-scroll on the PWA still does not fire a chip tap.

## Docs to update in the same change set

Per [CLAUDE.md](CLAUDE.md) routing, one owning file each:

- **`docs/verandah.md`** — the two new shared components, and the motion line at §163 extended with
  the segmented/chip slide timings. This file owns shared components and design tokens.
- **`docs/CLAUDE.md`** — one line in the traps section: tab strips use `SegmentedSlider` /
  `ChipRowSlider`; do not hand-roll a new one, and do not paint a highlight behind chips that have
  their own opaque fill.

No schema, RLS, route, or type changes — nothing for `docs/architecture.md` or
`.github/app-summary.md`, and no migration.
