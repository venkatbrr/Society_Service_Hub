# Verandah Design Reference

This document is the canonical reference for the Verandah UI system used in Wooru.

## Principles

1. **Warm over cold**: Embrace soft, warm neutral surfaces (`#FAF8F4` / `surface`) over sterile white or harsh grays to create an inviting, human environment.
2. **Restraint over decoration**: Prioritize calm utility and content structure. Eliminate design fluff like complex gradients and decorative emojis. Depth is allowed but rationed — only the three elevation tokens, only on the surfaces listed under [Elevation](#elevation).
3. **Numbers with respect**: Format currency (e.g., using `<Rupees>`), counts, dates, and times with meticulous attention. Never prepend signs like `+` unless explicitly representing transaction ledgers.
4. **Serif moments sans body**: Reserve serif/display typography (Georgia/display) for the single largest, most prominent title anchor on the screen. All other titles, secondary headings, and body copy must remain sans-serif.
5. **Sentence case everywhere**: Write all user-facing strings, actions, headers, and form labels in clean sentence case (e.g., "Email address" instead of "EMAIL ADDRESS" or "Email Address").

## Token Sources

- Color tokens: `constants/Colors.ts` (`Verandah`)
- Type, spacing, radius, border, layout tokens: `constants/Verandah.ts` (`VerandahType`, `VerandahSpace`, `VerandahRadius`, `VerandahBorder`, `VerandahLayout`)

No production UI should define parallel visual token sets.

## Brand Mark

The logo is an arch resting on a rounded baseline bar, both in `Verandah.primaryFg` (`#F0EDE3`) on `Verandah.primary` (`#0F3732`) — the icon set is drawn from the palette, so never introduce a separate "brand green". The bar is wider than the arch, so the mark's bounding box is set by the bar, not the arch legs.

| File | Canvas | Composition | Used by |
|------|--------|-------------|---------|
| `assets/images/icon.png` | 1024² | Full-bleed green, opaque | App icon (iOS + store), login header |
| `assets/images/adaptive-icon.png` | 1024² | Cream mark on **transparent**, safe-zone inset | Android adaptive foreground, Android notification icon |
| `assets/images/splash-icon.png` | 1024² | Rounded green tile on transparent | Splash (`resizeMode: contain` over `#FAF8F4`) |
| `assets/images/favicon.png` | 48² | Rounded green tile on **transparent** | Web favicon (Expo `web.favicon`) |
| `public/images/icon-512.png` | 512² | Full-bleed green | PWA `any`, landing + desktop-panel lockups |
| `public/images/icon-192.png` | 192² | Full-bleed green | PWA `any` |
| `public/images/icon-512-maskable.png` | 512² | Full-bleed green, mark inset to the maskable safe zone | PWA `maskable` |
| `public/images/icon.png` | 1024² | Full-bleed green | PWA `any`, Open Graph image (`api/share-drop.ts`, `landing.html`) |
| `public/images/apple-touch-180.png` | 180² | Full-bleed green, opaque | `apple-touch-icon` (app, landing, admin console) |
| `public/images/favicon.png` / `favicon-32.png` / `favicon-16.png` | 48² / 32² / 16² | Rounded green tile on **transparent** | Browser tab icons everywhere |
| `public/images/adaptive-icon.png` | 1024² | Cream mark on **transparent**, safe-zone inset | Web mirror of the Android foreground |

Two rules decide which composition a slot gets:

- **The platform masks it** (app icon, `apple-touch-icon`, PWA `any`/`maskable`, splash) → **opaque full-bleed green**. Pre-rounded art with transparent corners gets rounded a second time, and iOS composites alpha against *black*, not the brand green.
- **The icon stands free** (browser tab favicons) → the **rounded tile on transparent**, which is what the design set ships.

The same applies to in-app lockups: `.logo-icon` / `.brand-logo-icon` are `overflow: hidden` rounded containers filled by `icon-512.png`, so they need the full-bleed file — see the note below.

The two inset renders (`adaptive-icon`, `icon-512-maskable`) place the mark inside the **inner 66%** of the canvas and centre its *bounding box*, rather than reusing the full-bleed composition — which sits low, so that the arch reads as grounded on the bar. Reusing it verbatim pushes the bar toward the crop edge on round Android masks.

`public/images/` is a hand-maintained mirror for the web build — it is not generated from `assets/images/`. Replacing a logo means updating **both** trees, then bumping `CACHE_NAME` in `public/service-worker.js`.

Render the mark as an image, never as a substitute glyph. Where a lockup needs a rounded container, give the container `overflow: 'hidden'` and let `icon.png` fill it rather than compositing a small arch over a green square — the two read differently at small sizes.

## Full Palette

From `Verandah`:

- `surface`: `#FAF8F4`
- `card`: `#FFFFFF`
- `cardMuted`: `#F1EFE8`
- `primary`: `#0F3732`
- `primaryFg`: `#F0EDE3`
- `accent`: `#0F6E56`
- `accentSoft`: `#E1F5EE`
- `caution`: `#854F0B`
- `cautionSoft`: `#FAEEDA`
- `danger`: `#A32D2D`
- `dangerSoft`: `#FCEBEB`
- `textPrimary`: `#1F2A28`
- `textSecondary`: `#6B6F6D`
- `textTertiary`: `#888780`
- `textMuted`: `#B4B2A9`
- `border`: `rgba(15, 55, 50, 0.08)`
- `borderStrong`: `rgba(15, 55, 50, 0.15)`
- `borderHair`: `rgba(15, 55, 50, 0.18)` — default tile/card border (raised from `0.10` 2026-08-13; the old value was too faint to read as a border against the paper/cream surfaces)
- `borderWhisper`: `rgba(15, 55, 50, 0.06)` — deliberately fainter than `borderHair`, for controls that should recede rather than read as a bordered surface (unselected category/sub-category chips in `CategoryFilter`). Pair with `StyleSheet.hairlineWidth` instead of a fixed `0.5` — at DPR 1 on web, `0.5` rounds up to a full device pixel and looks heavier than intended.

Avatar tint families:

- teal: bg `#E1F5EE`, fg `#0F6E56`
- amber: bg `#FAEEDA`, fg `#854F0B`
- purple: bg `#EEEDFE`, fg `#3C3489`
- pink: bg `#FBEAF0`, fg `#993556`
- blue: bg `#E6F1FB`, fg `#185FA5`

## Typography Scale

Font families:
- Headings & display: `Instrument Serif` (`VerandahType.serifFamily`, regular & italic)
- UI & body: `Plus Jakarta Sans` (`VerandahType.sansFamily`, 400/500/600/700/800)
- Loaded via Google Fonts link on web, and via `expo-font` `useFonts()` from bundled `.ttf` files in `assets/fonts/` on native iOS and Android.

From `VerandahType`. **Serif (Instrument Serif) — all weight 400, since that is the only cut the family ships:**

| Token | Size / line | Letter spacing |
|---|---|---|
| `hero` | 46/50 | −0.4 |
| `screenTitle` | 28/32 | −0.4 |
| `display` | 28/32 | −0.4 |
| `cardTitle` | 24/28 | −0.3 |
| `section` | 22/26 | −0.3 |

**Sans (Plus Jakarta Sans):**

| Token | Size / line | Weight |
|---|---|---|
| `title` | 18/24 | 600 |
| `button` | 16/20 | 700 |
| `tileTitle` | 15/20 | 700 |
| `body` | 14/20 | 400 |
| `bodyBold` | 14/20 | 600 |
| `caption` | 12/16 | 400 |
| `captionBold` | 12/16 | 600 |
| `meta` | 11/14 | 400 |
| `sectionLabel` | 11, uppercase, ls 0.5 | 600 |
| `micro` | 10/13 | 500 |
| `navLabel` | 10/12 | 600 |

Weight policy: `400`–`700`. Nothing above `700` — the family loads up to 800 but no token uses it, and an 800 label beside a 700 one reads as a rendering bug rather than emphasis.

### Serif has a floor: 22px

**Below 22px, use sans.** This is not a taste rule. Instrument Serif is a
high-contrast *display* face drawn for 40px+ headlines — its hairline strokes
fall under one device pixel at small sizes and anti-alias to grey, and its small
x-height makes it read optically shorter than a sans caption several points
below it. It also ships **weight 400 only**, so there is no heavier cut to
compensate with; setting `fontWeight: '600'` on it just asks the browser for a
smeared synthetic bold.

This is the mechanism behind principle 4 above. A title that repeats once per
card in a scrolling list is never the screen's largest anchor — the stack header
is — so **feed-tile titles are sans**, via the `tileTitle` token.

`PreorderDropCard` and `EventCard` both used serif at 18/400 until 2026-08-17,
which left each card's own subject as the faintest text on it, lighter than the
11.5px host caption above and the 11px meta chips below. `tileTitle` (15/700)
sits one step above `bodyBold` (14/600), so the title outranks the host name.
Four modal/section titles remain at 20px serif; they are isolated anchors on
plain surfaces rather than repeated list items, which is why they hold up.

## Spacing Scale

From `VerandahSpace`:

- `xs`: 4
- `sm`: 8
- `md`: 12
- `lg`: 16
- `xl`: 20
- `xxl`: 24
- `xxxl`: 32

## Radius Scale

From `VerandahRadius`:

- `sm`: 8
- `md`: 12
- `lg`: 16
- `xl`: 20
- `pill`: 999
- `frame`: 32

## Border Widths

From `VerandahBorder`. Two values, and the split is what keeps a tile legible:

- `tile`: **1** — the outline of any card/tile surface: feed cards, section panels, grid tiles, stacked list rows, `BaseCard`. Raised from `0.5` on 2026-08-14; paired with `borderHair` at 0.18 alpha, a half-pixel line was too weak to separate one tile from the next, so a scrolling stack read as a single continuous surface with no edge between the card above and the card below.
- `control`: **0.5** — chips, badges, inputs, icon buttons, segmented tracks, counter steppers. These sit *inside* a tile; giving them the tile weight makes the tile stop reading as the outer container.

Never hardcode the number. A new card gets `VerandahBorder.tile`, a new chip gets `VerandahBorder.control` — that is the whole decision. `borderWhisper` controls stay on `StyleSheet.hairlineWidth` (see the palette note above).

## Layout Tokens

From `VerandahLayout` — these differ by platform because web has no status bar:

- `screenPaddingTop`: 16 on web, 60 on native
- `mcnHeaderToContentGap`: 4

Also exported from `constants/Verandah.ts`:

- `getNetworkTileImageHeight(windowHeight?)` → ~11.5% of viewport (clamp 84–130). Cover height on a **feed tile**. Still the token for Community Events, and the floor/fallback for the two tiles that size from the photo. It is a *consequence* of the card body, not a free dial — the tile budget is `(viewport − ~270px chrome) / 3`, so every ~65px added to the photo drops a card off the fold.
- `getTopCropTileImageStyle(naturalAspectRatio, windowHeight?)` → a style object showing the **top 30% of the photo itself** (`TILE_IMAGE_TOP_FRACTION`). Used by `PreorderDropCard` and `McnListingCard`. Returns `{ aspectRatio: naturalAspectRatio / 0.3, minHeight, maxHeight }`, so it needs no measured card width; pass `null` until expo-image's `onLoad` reports `source.width` / `source.height` and it falls back to `getNetworkTileImageHeight()`.
- `getMediaHeroHeight(windowHeight?)` → 30% of viewport (clamp 150–280). Cover height on a **detail-screen hero**. See [Component Rules](#component-rules) for why the two differ so much.
- `format12HourTime(timeStr)` → converts `"13:00"` to `"01:00 pm"`. Use this rather than hand-rolling AM/PM formatting; it passes through strings that already carry am/pm.

## Component Rules

Reuse these instead of building local variants:

| Component | Use for |
|-----------|---------|
| `BaseCard` | Default wrapper for cards and grouped informational sections |
| `Avatar` | All person entities — creators, residents, joiners, contributors |
| `Rupees` | Rupee amounts; avoid manual `Rs`/`₹` string formatting |
| `EmptyState` | Standard empty / list-zero rendering |
| `SearchBar` | Any list search input (36 px tall on the Help tab) |
| `CategoryFilter` | The two-level provider/visit category picker |
| `SegmentedSlider` | Contained segmented controls with sliding highlight (Family A) |
| `ChipRowSlider` | Variable-width chip rows with 3-layer z-order sliding highlight & web drag-to-scroll (Family B) |
| `HeaderBackButton` | Stack header back affordance |
| `ImageUploader` | Any Cloudinary image upload |
| `ImageViewer` | Full-screen tap-to-dismiss photo viewer. Pair it with **every** cropped cover image — a `contentFit="cover"` thumbnail hides part of the photo, and residents need a way to see the whole thing |

**Cover photo heights** are two tokens in `constants/Verandah.ts`, both viewport-relative and both fed the live height from `useWindowDimensions()`:

| Token | Height | Where |
|---|---|---|
| `getNetworkTileImageHeight()` | ~11.5% of viewport (clamp 84–130) | `EventCard`, and the lower bound / pre-load fallback for the other two tiles. Sized backwards from "three tiles on the fold", not chosen visually — see the source comment before changing it |
| `getTopCropTileImageStyle()` | top 30% of the photo's own height, bounded by the two tokens above | `PreorderDropCard`, `McnListingCard`. Hosts upload portrait posters, and a fixed slab showed a thin strip of one; deriving the height from the picture keeps a readable share of every cover |
| `getMediaHeroHeight()` | 30% of viewport (clamp 150–280) | Detail-screen heroes — food drop, business listing, event |

The tile is deliberately shorter than the hero: on a tile the photo competes with the next card and the second card should peek above the fold; on a detail screen the photo is what the resident came to look at. All three use `contentPosition="top"` — `contentFit="cover"` centre-crops, which beheads people and cuts the top off a plated dish. Because `getTopCropTileImageStyle()` sizes from the photo, tile heights now vary between cards; `maxHeight` (the hero token) is what stops a very tall poster from owning the whole fold.

`ChipRowSlider` needs a **bounded height slot** — its root is a horizontal `ScrollView` with no intrinsic height, so in a `flex: 1` column it stretches and its centred chips drift out of alignment with the animated pill. Wrap it in a fixed-height `View` or set `maxHeight` on `containerStyle`.
| `DateField` | Cross-platform date picker (`input[type=date]` on web, `DateTimePicker` modal on native) |
| `ComingSoonTile` | The placeholder card standing in for a hidden section — see below |
| `AnimatedTileGlyph` | MCN section-card glyphs; wraps `NetworkTileIcon` in a per-kind idle motion |
| `useReduceMotion()` | **Required** by any always-on animation — see below |
| `RatingStars` / `EmojiRating` | Provider star ratings / school aspect emoji scale |
| `VerandahType.tileTitle` | The title line of any repeated feed tile — sans, never serif (see [Serif has a floor](#serif-has-a-floor-22px)) |

### Idle motion — MCN section glyphs

Every glyph in the MCN hub's icon circles carries a slow idle motion matched to its subject, via `AnimatedTileGlyph`:

| Kind | Motion | Cycle | Delay |
|---|---|---|---|
| `food` | Rotate −5° → 5° with a 1px lift — a bag swinging in the hand | 2000ms | 0 |
| `business` | `translateY` 0 → −1.5 — a shutter lifting at opening time | 1900ms | 220ms |
| `carpool` | `translateX` −2 → 2 — a car easing forward and back | 1600ms | 150ms |
| `parents` | Scale 1 → 1.07 — a group drawing together | 1850ms | 300ms |
| `schools` | `translateY` 1 → −2 — a cap tossed and caught *(hidden today)* | 1750ms | 100ms |
| `borrow` | `translateX` 2 → −2 — two things trading places *(hidden today)* | 1700ms | 380ms |

All on `Easing.inOut(Easing.sin)`, which has no hard stop at either end — the glyph never appears to hit a wall.

Two constraints that are not stylistic preferences:

- **Nothing exceeds 2px, 5°, or 7%.** These loop forever on a screen residents open with intent — to check a fund, look up a number. The bar is "alive when you look at it", not "asking for attention". If you can read the animation from across the room, it is too big.
- **Never give two sibling glyphs the same cycle or phase.** The durations above are deliberately unequal and each starts on its own delay. Aligned loops make the whole screen pulse in unison, which is far more distracting than any single glyph.

A new MCN section adds its entry to `MOTION_BY_KIND`; the two hidden kinds already have theirs, so a flag flip does not surface a dead glyph next to moving ones.

### Reduce motion — `useReduceMotion()`

**Any always-on animation must call it and render a static state when it returns true.** A perpetual loop is exactly what the OS setting exists to stop, and it is a real setting real residents turn on. `ComingSoonTile` drops its rings and sparkles entirely and freezes its subtitle; `AnimatedTileGlyph` renders a bare `NetworkTileIcon`.

One-shot transitions — a highlight sliding to the tab you just tapped — are not the target and need no guard.

### Coming-soon tile — `ComingSoonTile`

The card that occupies the slot of a feature hidden behind a flag ([`hidden-features/`](hidden-features/README.md)). Card geometry is identical to a real MCN section card — 40px icon circle in `accentSoft`, 12px gutter, 15px title, 12px subtitle, 12.5px description — so the row reads as part of the same list rather than as an error state.

Two rules define it:

- **Never pressable.** There is nothing to open. A card that looks tappable and does nothing reads as a bug, so it renders as a plain `BaseCard` with no `onPress`.
- **The motion is the message.** A static placeholder reads as an empty slot; a moving one reads as something arriving.

| Layer | Spec |
|---|---|
| Ping rings | Two 40px `accent`-stroked rings behind the circle, each scaling 1 → **1.65** while fading 0.5 → 0 over 1800ms, ring B offset by half a cycle so the ping never gaps. **1.65 is a ceiling, not a taste call** — `BaseCard` is `overflow: 'hidden'` and the slot sits at the card's 14px padding, so anything larger clips at the left border. |
| Glyph | `Stars02` in `accent`, breathing scale 1 → 1.14 and rotate −7° → 7° on a 1800ms `Easing.inOut(Easing.sin)` loop |
| Sparkles | Two dots (5px top-right, 3.5px bottom-left) twinkling opacity 0 → 1 → 0 over 1250ms, with 280ms / 880ms offsets — deliberately off-beat, so the tile does not read as a metronome |
| Subtitle | Cross-fades between teaser lines every 2600ms (180ms out, 240ms in) |

Motion follows the same rules as the rail below: built-in `Animated`, `useNativeDriver: false`. **It also honours `AccessibilityInfo.isReduceMotionEnabled()`** — with reduce-motion on, the rings and sparkles are not rendered at all and the subtitle stays on its first line. A perpetual loop is precisely what that OS setting exists to stop; any future always-on animation should do the same.

### Destructive host action — `DangerZone`

The one shared way to offer delete on a host-owned object (food drops, business listings). Never hand-roll a delete button beside the routine actions.

| Aspect | Spec |
|---|---|
| Placement | **Bottom of the scroll view, always last.** Delete previously sat inline in header action rows next to Edit and Mark completed — one mis-tap from routine work, and it is the only action on those screens that cannot be undone. Reaching the bottom is the friction. |
| Frame | `dangerSoft` fill, `danger` border at `VerandahBorder.tile`, `VerandahRadius.md`, 12px padding, 18px top margin |
| Content | `AlertTriangle` + title, then a **specific** consequence line (name the object and what else dies with it), then the shared spam caution, then the button |
| Button | Full-width, 44px, `card` fill with a `danger` border and `danger` label — outlined, not filled: a solid red slab at the foot of every host screen reads as an error state |
| Confirmation | Owned by the component via `confirmAction`, so callers pass a plain `onDelete` that runs only after the user has confirmed. Do not wrap `onDelete` in a second confirm. |
| Copy | `SPAM_CAUTION` is exported and shared — deliberately identical everywhere, so the warning reads as a platform rule rather than one screen's opinion |

### Diet mark — `DietDot`

The square-outline-with-a-filled-dot that Indian menus use for veg / non-veg. Renders from `mcn_preorder_items.diet_type` (`veg` | `egg` | `non_veg`) and appears beside each item on a drop's menu, beside the title on each catalog tile, and inside the diet filter chips.

Drawn as two nested `View`s rather than imported as an icon — it is a bordered box around a circle, and every packaged version of it is a raster that goes soft at 11–12px.

| Aspect | Spec |
|---|---|
| Colours | veg `Verandah.green600` · egg `#B45309` · non-veg `Verandah.danger`. Sourced from `DIET_META` in [`constants/diet.ts`](../constants/diet.ts) — never re-declare them at a call site |
| Geometry | Square, `borderWidth: 1.5`, `borderRadius: 2.5`; inner dot is half the outer size, fully round |
| Sizes in use | 11px on tiles and chips, 12px on the menu row |
| Fallback | `dietMeta()` returns veg for anything unrecognised or null, matching the column's `DEFAULT 'veg'` |

**It is always `aria-hidden`.** The mark never appears without its diet label as text beside it — on the filter chips the label is the chip, and on a menu row the item's own name carries the accessible content. Labelling the dot as well would make a screen reader announce the diet twice. Colour alone is also why: a red/green pair is the single most common confusion in the palette, so the text is the real signal and the dot is the fast visual index.

### Bottom navigation — "Threshold Rail"

`GlobalBottomNav` is a light rail on `Verandah.paper` (`#FAF8F4`), **60px** tall, with the home-indicator inset padded *below* the bar rather than inside it. Each tab is a 48px column of two fixed-height rows — a 24px icon row and a 12px label row, 2px apart — so revealing the active label can never push the icons off their shared baseline. The bottom safe-area inset is **capped at 5px** (and 5px flat when the reported inset is 0): the raw inset is 34px+ on gesture-bar devices and left a visibly dead strip under the rail. This is a deliberate override of the system inset — the rail sits closer to the gesture bar than the safe area asks for.

| Element | Spec |
|---------|------|
| Active icon / label | `Verandah.primary` `#0F3732`, stroke 2.2, icon scaled 1.1 in place |
| Inactive icon | `Verandah.textDisabled` `#9A988F`, stroke 1.9, scale 1 |
| Label | 10px / 700 (800 on MCN), letter-spacing 0.3 — **opacity 1 on the active tab only**, but always occupying its row |
| Active highlight | Arch-topped slab behind the active tab: fill `rgba(15,55,50,.07)`, border `rgba(15,55,50,.08)`, radius `18 18 14 14`, inset 6px vertically and 12px within the tab slot |
| Centre MCN tab | 38×38 teal disc, radius 13, holding `assets/images/adaptive-icon.png` in a 44px box (`resizeMode: contain`) |

Motion uses React Native's built-in `Animated` (**not** Reanimated — it is a dependency but unused, and unconfigured for web). The shared springy curve is `Easing.bezier(0.34, 1.5, 0.5, 1)`: highlight slide 460ms (shared by bottom nav, `SegmentedSlider`, and `ChipRowSlider`), icon scale 400ms, label opacity 300ms. While MCN is active its disc breathes between `translateY` −3 and −6 on a 3s loop; on deactivation it settles to 0.

**Driver rule (revised 2026-08-17).** The highlight slide stays on the JS driver — it animates layout-adjacent values, and `react-native-web` has no native driver at all, so web is JS-driven throughout. But the per-tab icon scale, label opacity and centre-disc lift animate *only* `transform` and `opacity`, so on native they now run with `useNativeDriver: true` (`USE_NATIVE_DRIVER` in `GlobalBottomNav.tsx`). This matters most for the disc's breathe loop, which **never ends**: on the JS driver it held a 60fps animation frame plus a bridge write alive for as long as MCN was the active tab, i.e. permanently on the app's landing tab. For the same reason the loop is skipped entirely on web (`RUN_IDLE_DISC_FLOAT`), where it cannot be moved off the main thread the rail shares with scrolling; the disc still settles to −3 there. `AnimatedTileGlyph` follows the same rule.

If you add an always-on animation, animate transform/opacity only, drive it natively where a native driver exists, and gate it on `useReduceMotion()`.

The disc's drop shadow is `Verandah.shadowRaised` — see [Elevation](#elevation).

### Bespoke glyphs

`@untitledui/icons` is the default for every control and indicator, but a handful of glyphs are hand-drawn because the set has no equivalent. All of them keep Untitled UI's drawing contract exactly — **24×24 viewBox, `strokeWidth: 2`, round caps and joins, `currentColor`, no fill, DOM SVG** — so they sit flush with their neighbours. Match that contract or the icon reads as imported from somewhere else.

| Glyph | File | Why bespoke |
|---|---|---|
| Nav: house-with-heart, buildings pair, brand arch | `NavIcons.tsx` | Wooru-specific silhouettes |
| `ParentChildIcon` (Parent Corner tile) | `ParentChildIcon.tsx` | Every `Users*` variant is two adults at the same height, which reads as "neighbours". A parent and a child needs a height difference — the child stands at **63% of the adult**, both on a shared baseline. |

When drawing one, check the arcs are realizable (chord ≤ 2r) — renderers silently scale an impossible arc instead of failing, which is how a hand-written glyph comes out subtly wrong rather than visibly broken. Leave ≥3 units between separate figures: at `strokeWidth: 2` each outline eats 1 unit, and anything tighter smears two silhouettes into one shape at 20px.

Four of the five bottom-nav glyphs live in `components/NavIcons.tsx` rather than `@untitledui/icons`, because two are bespoke: the house carries a heart, and the buildings pair is Wooru-specific. They keep Untitled UI geometry (24×24, round caps, `currentColor`) and render as DOM SVG, exactly as `@untitledui/icons` does.

**The MCN mark is not a glyph** — it is `assets/images/adaptive-icon.png` rendered as an `Image`, per the "render the mark as an image, never as a substitute glyph" rule above. Do not re-draw it in SVG "to match the icon set": a traced arch silently drifts from the brand every time the logo is revised, and the disc then keeps showing a stale mark after the assets are updated. The asset is cream on transparent, so it needs no tint on the teal disc; it is inset to the safe zone, so its 44px box deliberately overhangs the 38px disc to bring the visible arch up to ~65% of it.

### Platform-specific variants

Some components ship a `.web.tsx` sibling because their native rendering does not translate to the browser: `AppIcon`, `EmojiRating`, `HeaderBackButton`, `NetworkTileIcon`, `SchoolAspectIcon`, `SchoolRadarChart`, `ScoreSentimentIcon`, `MotionWrapper`.

**Prefer adding a `.web.tsx` sibling over branching on `Platform.OS` inside a render tree.** Metro resolves the variant automatically.

General constraints:

- Avoid `LinearGradient` for card/chrome/button surfaces.
- Never hand-roll `shadow*` / `elevation` values — use the elevation tokens below.
- Keep copy in sentence case.
- Prefer tokenized semantic color meanings over ad-hoc visual accents.

## Elevation

Verandah is a flat language, but "flat" was over-applied: full-width content cards
sat on the same paper as the page with only a 0.5px hairline separating them, and
on a phone in daylight the boundary disappeared. Depth is therefore **tokenized,
not banned** — three tokens in `constants/Colors.ts`, and nothing else.

| Token | Use on | Not on |
|---|---|---|
| `Verandah.shadowCard` | **Big tiles**: anything a resident taps to open a screen or that is the subject of its row — feed cards (`PreorderDropCard`, `McnListingCard`, `EventCard`, `BaseCard`), hub tiles, notice/banner cards, search bars | Dense list rows |
| `Verandah.shadowRaised` | Floating and inverted surfaces: FABs, the teal info panel, the MCN nav disc | Ordinary cards |
| `Verandah.shadowDevice` | The landing page's device mockup only | Anything in-app |

**Small tiles stay flat.** Provider name tiles on the Help tab, chips, category
pills, badges, avatars, segmented-control segments, and any row inside an
already-elevated card keep the hairline border and no shadow — stacking shadows
inside a shadowed card is what makes a screen look muddy.

`BaseCard` already carries `shadowCard`; do not cancel it with
`shadowColor: 'transparent'` / `elevation: 0` (this is what `McnListingCard` did,
and it was the one card in the network feed that looked unclickable).

## Avatar Tint Algorithm Rationale

The app intentionally uses deterministic initials avatars rather than mixed photo + fallback rendering.

Rationale:

1. Consistency: avoids mixed-quality user photo presentation.
2. Recognition: same person always maps to the same tint family.
3. Performance: no image fetch dependency for identity rendering.
4. Privacy: no pressure to upload photos for core app use.

`getAvatarTint(name)` creates a stable mapping so each name consistently resolves to one tint pair.

## Rupees Rules

Use `Rupees` for monetary presentation:

- Applies Indian digit grouping (`en-IN`)
- Formats symbol, integer, decimal parts consistently
- Supports tone:
  - `in`: positive contribution style
  - `out`: outgoing/default
  - `neutral`: default neutral style

Do not hand-build currency strings in UI when `Rupees` can be used.

## Common Mistakes to Avoid

To maintain strict conformance to the Verandah design language, be vigilant against these frequent design anti-patterns:

- **Ad-hoc uppercase styling**: Do not define custom uppercase form labels (e.g., `<Text>NAME</Text>`) or use `textTransform: 'uppercase'` on regular body/title texts. Let the design system's `sectionLabel` token handle uppercase transformations under precise hierarchy.
- **Hand-rolled shadow values**: Never write raw `shadowColor` / `shadowOffset` / `shadowOpacity` / `shadowRadius` / `elevation` in a stylesheet. Spread an elevation token (`...Verandah.shadowCard`) instead, and only on the surfaces listed under [Elevation](#elevation) — small tiles keep the flat `0.5px` hairline. Equally, never *cancel* a token with `shadowColor: 'transparent'` or `elevation: 0`.
- **Custom color mappings**: Avoid hardcoding hex color values (e.g., `#FAF8F4` or `#0F3732`) directly inside stylesheets. Always map colors through the local `colors` object bound to `Verandah` tokens, or read from `Verandah` directly to guarantee visual consistency and theme compliance.
- **Legacy glassmorphism variables**: Do not declare or use legacy aliases like `colors.glass` or `colors.glassBorder` inside component local color maps. Replace all glassmorphism references with canonical tokens: use `colors.card` (`Verandah.card`) for background panels and `colors.border` (`Verandah.border`) for hairline frames.
- **Decorative emojis in core UI chrome**: Do not use random emojis as decorative bullets in profile screens, list items, or navigation bars (e.g., "⚙️ Settings"). Rely on elegant outline icon packages (such as `Ionicons` 18px in `Verandah.textTertiary`) for consistent and restrained chrome illustration. Emojis are reserved only for dynamic category tags (like AC or Pest Control category icons).

## Out-of-Register Appendix

Out-of-register means any active UI that does not fully match Verandah constraints.

Each entry should list:

- File path
- Deviation summary
- Why it is currently required
- Follow-up action and owner

Current entries:

- **`components/PreorderDropCard.tsx` → `ReserveButton`**
  - *Deviation*: uses `LinearGradient`, which the general constraints tell you to avoid on card/chrome/button surfaces.
  - *Why*: the gradient is not the button's **surface** — the fill stays a flat `Verandah.primary`. It paints only the travelling highlight (transparent → 42% white → transparent) that drifts continuously across the pill (two bands, half a cycle apart, 2.6s per traversal) to draw the eye to the CTA in a scrolling feed. A hard-edged translucent bar was tried first and reads as a glitch; soft edges are what make it look like light rather than a rectangle.
  - *Scope*: one 44px-wide `Animated.View` clipped inside the pill's `overflow: 'hidden'`. Gated on `useReduceMotion()` and only rendered while `active`, so it is neither always-on nor present on muted/closed states.
  - *Second user (2026-08-24)*: the host's **Republish** action on their own tiles under Mine. It takes `tone="accent"` and a leading `RefreshCw01`, and shimmers like a live CTA — it is the one action a repeat cook opens that tab looking for, and in the muted style it read as disabled. The follow-up below was honoured by **generalising `ReserveButton` in place** (`tone` + `leading` props) rather than copying the gradient into a second button.
  - *Follow-up*: none required. A third shimmering CTA should still go through `ReserveButton` — add a `tone`, never a second `SheenBand`.

- **`components/WhatsAppIcon.tsx`, plus the `#25D366` buttons in `components/PreorderDropCard.tsx` and `app/mcn/drops/[id].tsx`**
  - *Deviation*: a raw hex brand colour (WhatsApp green) instead of a `Verandah` token, and a **filled** glyph where the icon set is outline-only.
  - *Why*: a share-to-WhatsApp button is recognised by its colour and its mark. Painted `Verandah.primary` it reads as "some other share thing", which defeats the point of putting it beside the generic Share button. `@untitledui/icons` carries no brand marks at all — its nearest, `MessageChatCircle`, is a generic bubble. The glyph is a bespoke SVG rather than the 💬-style emoji originally asked for, because the repo bans emoji in UI chrome (`docs/CLAUDE.md` §3) and emoji render differently on every platform, with some shipping no WhatsApp glyph at all.
  - *Scope*: two 30–32px circular buttons — one on the drop tile's host row, one on the drop detail header row. The colour appears nowhere else.
  - *Follow-up*: none required. If a WhatsApp affordance is added to a third surface, take the button (not just the icon) into a shared component so the hex stays in one file.
