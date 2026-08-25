# Implementation Plan — Font Consistency, Feedback Entry Point, Funds Empty-State Copy

Three independent changes, bundled because they were all requested against the Profile
screen in one pass. Each phase can be built and shipped separately — there is no ordering
dependency between them.

---

## Phase 1 — Make the app's fonts actually consistent across platforms

### Ground truth this depends on

| Fact | Where |
|---|---|
| The design system already defines exactly two font families: `Instrument Serif` (headings/display) and `Plus Jakarta Sans` (body/UI) | [constants/Verandah.ts:11-23](../../constants/Verandah.ts#L11-L23) |
| Web loads both correctly in production via a Google Fonts `<link>` injected into `dist/app.html`'s `<head>` | [build-admin.js:180-182](../../build-admin.js#L180-L182) (`APP_SHELL_HEAD`) |
| `app/+html.tsx` also declares the same Google Fonts link, but **it never ships** — `web.output: 'single'` means Expo Router ignores that file entirely in this project | [app/+html.tsx:1-24](../../app/+html.tsx#L1-L24), [docs/CLAUDE.md §9](../CLAUDE.md) ("Adding a `<meta>`, `<link>`, font, or script to `app/+html.tsx`") |
| **Nothing loads these fonts natively.** There is no `useFonts()` call, no `expo-font` `Font.loadAsync`, and no bundled `.ttf`/`.otf` for either family anywhere in the repo — confirmed by grepping `app/`, `components/`, and `assets/fonts/` | `assets/fonts/` only contains an unused `SpaceMono-Regular.ttf` (Expo template leftover, not referenced anywhere) |
| `VerandahType`'s `Platform.select` for `ios` names `'Instrument Serif'` / `'Plus Jakarta Sans'` directly, as if already available — without an embedded font file, iOS cannot resolve that family name and silently falls back to the system font (San Francisco) | [constants/Verandah.ts:12-23](../../constants/Verandah.ts#L12-L23) |
| `android` doesn't even attempt the brand fonts — it's hardcoded to the **generic** `'serif'` / `'sans-serif'` system families | same lines |
| `expo-font` (`~14.0.11`) is already a project dependency, just unused for this | [package.json:38](../../package.json#L38) |

**Net effect today:** web shows the intended Instrument Serif + Plus Jakarta Sans pairing;
iOS silently falls back to the system font despite the code claiming otherwise; Android
deliberately uses a different, generic system font. Three platforms, three different
results — this is almost certainly what "not the same font across the app" is describing,
not sloppy `fontFamily` usage (most screens already reference `VerandahType.sansFamily` /
`serifFamily` correctly).

### Recommendation

**Keep the existing two-family system — don't introduce a third font.** Instrument Serif
(display) + Plus Jakarta Sans (body) is already the documented "Verandah" identity, it's a
deliberate warm/editorial pairing (not a default), and it's already wired through virtually
every screen's styles via `VerandahType.serifFamily` / `sansFamily`. The actual bug is that
native builds never load the font files, so fix the loading gap rather than picking a
different font.

### Steps

1. **Get static font files.** Download from Google Fonts, matching the weights already
   requested in the web `<link>` tag (`build-admin.js:182`):
   - `Instrument Serif` — Regular + Italic (the web URL requests `ital@0;1`)
   - `Plus Jakarta Sans` — 400 / 500 / 600 / 700 / 800
   Place them under `assets/fonts/` (e.g. `InstrumentSerif-Regular.ttf`,
   `InstrumentSerif-Italic.ttf`, `PlusJakartaSans-Regular.ttf`, `PlusJakartaSans-Medium.ttf`,
   `PlusJakartaSans-SemiBold.ttf`, `PlusJakartaSans-Bold.ttf`,
   `PlusJakartaSans-ExtraBold.ttf`).
   - Confirm `SpaceMono-Regular.ttf` is genuinely unused (`grep -rn "SpaceMono" app/ components/`)
     before deleting it — it looks like dead Expo-template scaffolding but verify first.

2. **Load them at app startup.** In `app/_layout.tsx`, call `expo-font`'s `useFonts()` hook
   mapping family names to **exactly** the strings `VerandahType` already returns for `ios`
   (`'Instrument Serif'`, `'Plus Jakarta Sans'` — plus per-weight variants if you map weights
   to distinct family names rather than relying on `fontWeight`). Gate initial render (or at
   minimum keep the splash screen up) until fonts finish loading, using the standard
   `expo-splash-screen` `preventAutoHideAsync()` / `hideAsync()` pattern so there's no
   flash-of-unstyled-font on cold start.

3. **Fix the Android branch in `constants/Verandah.ts`.** `expo-font` works identically on
   iOS and Android — once the files are loaded, change `android: 'serif'` →
   `'Instrument Serif'` and `android: 'sans-serif'` → `'Plus Jakarta Sans'` (both instances,
   `serifFamily`/`sansFamily` and the `hero`/`screenTitle`-style tokens further down the
   file) so Android matches iOS and web instead of falling back to a generic system font.

4. **Sweep for text styles missing `fontFamily` entirely.** These render in the raw OS
   default regardless of step 1–3. Search `StyleSheet.create` blocks for a `fontSize` with no
   sibling `fontFamily` and add `VerandahType.sansFamily` (body/UI text) or
   `VerandahType.serifFamily` (only the single largest heading per screen — see
   [docs/verandah.md](../verandah.md) / [docs/CLAUDE.md §4](../CLAUDE.md)'s "reserve serif
   for the single largest title anchor" rule). Don't blind find-replace; a handful of
   `fontFamily: 'inherit'` on web-only date/number inputs (`app/visits/[id].tsx`,
   `app/visits/add.tsx`, `app/mcn/drops/add.tsx`, `components/DateField.tsx`) are
   intentional and should stay as-is.

5. **Verify on device/emulator**, not just `tsc`: `npm run android` and `npm run ios` (or at
   least one native target), and visually confirm a serif heading and Plus Jakarta Sans body
   text now match the web build.

### Docs to update (CLAUDE.md §7 routing)

- [`docs/verandah.md`](../verandah.md) — note that native font loading is now wired up
  (previously silently broken).
- [`docs/CLAUDE.md` §9 Known traps](../CLAUDE.md) — add an entry: referencing a
  `Platform.select` font family name on iOS without an `expo-font` `useFonts()` call is a
  silent no-op fallback to the system font, not an error. Worth capturing since it's exactly
  the class of trap that section exists for.

---

## Phase 2 — Merge Terms/Privacy into one Profile tile, add a feedback/bug-report screen under it

### Ground truth this depends on

| Fact | Where |
|---|---|
| Profile currently renders **two** separate menu rows — "Terms of service" → `/legal?doc=terms`, "Privacy policy" → `/legal?doc=privacy` | [app/(tabs)/profile.tsx:327-362](../../app/(tabs)/profile.tsx#L327-L362) |
| `/legal` (`app/legal.tsx`) **already merges both documents into one screen** behind an internal segmented tab control (Terms / Privacy), driven by `TERMS`/`PRIVACY` in `data/legal.ts` | [app/legal.tsx:166-257](../../app/legal.tsx#L166-L257) |
| The comment at `profile.tsx:329-331` explains the two-row split was deliberate (each doc has its own public URL residents look for by name) — that reasoning applies to the public `wooru.in/terms` / `wooru.in/privacy` pages, not to the in-app entry point, so it doesn't block merging the Profile rows | [app/(tabs)/profile.tsx:329-331](../../app/(tabs)/profile.tsx#L329-L331) |
| No table, screen, or route exists today for bug reports or feature requests | confirmed via repo search |
| Verandah conventions: use `SegmentedSlider` for contained toggle controls, `Toast` for submit feedback, `goBackSmart(router, path)` for the header back arrow, `@untitledui/icons` only (no emoji) | [docs/CLAUDE.md §3](../CLAUDE.md) |

### Design decision (stated explicitly — revisit if this isn't what's wanted)

The request was to keep Terms/Privacy as one Profile tile and put the new feedback entry
point **under** that same tile, not as a third top-level Profile row. `/legal`'s segmented
control is data-driven off structured `LegalDocument` content (paragraphs, bullets, tables)
— a submission form doesn't fit that shape, so don't force it in as a third tab. Instead:

- **Profile screen**: collapse the two menu rows into one — "Terms & Privacy" (keep the
  `File06` icon, subtitle e.g. "What you agree to and what we collect") → still opens
  `/legal` (defaulting to the `terms` tab, same as today).
- **`/legal` screen**: add a small link in the existing `footerWrap` section (next to
  "Public link" / "Open in browser" / "Share link") — e.g. "Found a bug or have an idea?
  Send feedback" → `router.push('/feedback')`. This keeps the new entry point reachable only
  through the merged Terms & Privacy tile, as asked, without restructuring the legal screen.

### Steps

1. **`app/(tabs)/profile.tsx`** — delete one of the two `TouchableOpacity` menu rows
   (`Terms of service` / `Privacy policy`, [lines 332-362](../../app/(tabs)/profile.tsx#L332-L362)),
   relabel the remaining one to "Terms & Privacy", and drop the `?doc=` param (or keep
   `?doc=terms` explicitly for clarity — either is fine since `/legal` already defaults to
   `terms`).

2. **New migration** `supabase/migrations/<timestamp>_add_feedback_reports.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS public.feedback_reports (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     user_id uuid NOT NULL REFERENCES auth.users(id),
     community_id uuid REFERENCES public.communities(id),
     kind text NOT NULL CHECK (kind IN ('bug', 'feature')),
     message text NOT NULL,
     image_url text,
     created_at timestamptz NOT NULL DEFAULT now()
   );

   ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

   DROP POLICY IF EXISTS feedback_reports_insert_own ON public.feedback_reports;
   CREATE POLICY feedback_reports_insert_own ON public.feedback_reports
     FOR INSERT WITH CHECK (user_id = auth.uid());

   DROP POLICY IF EXISTS feedback_reports_select_own ON public.feedback_reports;
   CREATE POLICY feedback_reports_select_own ON public.feedback_reports
     FOR SELECT USING (user_id = auth.uid());

   NOTIFY pgrst, 'reload schema';
   ```
   `image_url` is nullable — the attachment is optional. No UPDATE/DELETE policy — reports
   are immutable once filed. `community_id` is nullable context (useful later if this ever
   gets an admin-facing view), not an RLS scope column — don't add a community-scoped SELECT
   policy for it.
   **This table is intentionally write-mostly for v1** — there is no admin console surface
   to triage these yet. If that's needed, it's a separate follow-up against
   `admin-dashboard/`, not part of this plan; flag that explicitly to whoever picks this up
   rather than silently scoping it in.

3. **New screen `app/feedback.tsx`** — header with `HeaderBackButton` /
   `goBackSmart(router, '/legal')`, title "Send feedback". Fields:
   - A `SegmentedSlider` toggle for "Bug" vs "Feature idea" (`kind`).
   - A multiline `TextInput` for the description (`message`) — required, disable submit
     while empty or saving.
   - One optional screenshot: a single `ImageUploader` instance
     (`components/ImageUploader.tsx`) with `subfolder="feedback"`. That component already
     uploads through `uploadToCloudinary()` straight into a dedicated `wooru/feedback/`
     Cloudinary folder (the `subfolder` param namespaces it — no new upload code needed),
     keeping these attachments cleanly separable from listing/provider/event photos for
     later cleanup. `currentImageUrl` starts `null`; `onImageUploaded` sets local state,
     `onImageRemoved` clears it back to `null`. Nothing is uploaded until the resident
     actually picks a photo — submitting without one just leaves `image_url` as `null`.

   Submit inserts into `feedback_reports` with `user_id: user.id`,
   `community_id: communityId` (from `useAuth()`), `kind`, `message`,
   `image_url: imageUrl ?? null` — on success `Toast.show({ type: 'success', ... })` and
   navigate back; on error, toast the `error.message` (matches the pattern in
   `app/funds-access/request.tsx`'s `submit()`). Style with `Verandah` tokens only, per
   [docs/CLAUDE.md §4](../CLAUDE.md).

4. **`app/legal.tsx`** — inside `footerWrap` (near the existing `footerActions` row), add one
   more row/link to `/feedback`, matching the existing `footerBtn` style.

5. Not an `app/mcn/*` route, so `getImmediateParentRoute()` in `lib/navigation.ts` does
   **not** need a new mapping — don't add one.

6. **Deploy the migration yourself** per [docs/CLAUDE.md §6](../CLAUDE.md): `npm run
   db:push:prod` → `npm run types:prod` → re-add the hand-maintained enriched types block at
   the bottom of `lib/database.types.ts` (wiped by the previous step) → `npx tsc --noEmit`.
   (`:preprod` is a documented no-op placeholder in this repo — see
   [two-environment-setup-plan.md](two-environment-setup-plan.md) — so `prod` is the only
   real target today.)

### Docs to update

- [`docs/features.md`](../features.md) — Profile screen section: one "Terms & Privacy" row
  instead of two; new feedback entry point reachable from `/legal`.
- [`docs/architecture.md`](../architecture.md) — new `feedback_reports` table, its RLS, and
  the new `/feedback` route.

---

## Phase 3 — Shorten the funds "no president" copy to lead with "funds aren't active"

### Ground truth this depends on

| Fact | Where |
|---|---|
| `communityHasLead` is `false` when a community has no `president`/`vice_president`, and **fails open** (`true`) on a lookup error so a transient failure never wrongly hides funds | [context/AuthContext.tsx:310-317](../../context/AuthContext.tsx#L310-L317), [docs/CLAUDE.md §9](../CLAUDE.md) |
| The funds home screen **already** uses exactly the phrasing being asked for, for the separate `fundsEnabled === false` case: `"Funds are not active in this community."` | [app/funds/index.tsx:57-60](../../app/funds/index.tsx#L57-L60) |
| Three surfaces currently spell out the president/VP mechanic at length instead of leading with the simple fact: the Community tab's hero notice card, its "Funds support" CTA card, and the `/funds-access/request` guard screen — all gated on `!communityHasLead` | [app/(tabs)/community.tsx:267-282](../../app/(tabs)/community.tsx#L267-L282) and [:402-416](../../app/(tabs)/community.tsx#L402-L416), [app/funds-access/request.tsx:50-66](../../app/funds-access/request.tsx#L50-L66) |
| The hero notice card's copy — *"Your community has no president or vice president appointed. Everything neighbourly still works — services, food drops, businesses, rides and emergency numbers. Community funds and block in-charges open up once a president is in place."* — is the specific one flagged as too long/oddly worded ("neighbourly" isn't a leftover old brand name — the rebrand was Society Service Hub → Wooru — it's just a wordy adjective here) | [app/(tabs)/community.tsx:271-277](../../app/(tabs)/community.tsx#L271-L277) |
| `app/residents.tsx:185-192`'s notice ("No president or vice president has been appointed for your community yet.") is short already and is about the residents directory context specifically (who's in charge), not funds — out of scope here | [app/residents.tsx:182-192](../../app/residents.tsx#L182-L192) |

### Scope decision (stated explicitly)

All three funds-adjacent surfaces (hero notice card, funds CTA card, funds-access guard)
get shortened to lead with the plain fact — funds (and, on the hero card, block in-charges)
aren't active — rather than opening with an explanation of the leadership gap. Keep one
short second clause so it's still clear *why*, but drop the multi-clause "everything that
still works" list; that's already established elsewhere on the same screen (the sections
below the card just work, so the empty state doesn't need to enumerate them).
`app/residents.tsx` stays untouched — it's a different context and already concise.

### Steps

1. **`app/(tabs)/community.tsx:267-282`** (hero notice card) — replace the body text with
   something short, e.g.:
   > "Funds and block in-charges aren't active yet. They switch on once a president or vice
   > president is appointed."

   Keep the title ("No president yet"), the `Award01` icon, and the "See who is in your
   community" link unchanged — only the paragraph shrinks.

2. **`app/(tabs)/community.tsx:402-416`** (Funds support CTA card, `!communityHasLead`
   branch) — replace:
   > "Community funds need a president or vice president to appoint a treasurer and
   > collectors. Once your community has one, you can request funds support from here."

   with the same short framing as step 1, e.g.:
   > "Funds aren't active in this community yet. They'll switch on once a president or vice
   > president is appointed."

   (Keep the existing `hadHistoricalFunds` line beneath it unchanged.)

3. **`app/funds-access/request.tsx:50-66`** — same reword for the guard screen. Consider
   changing `styles.title` from "Request funds support" to "Funds aren't active" for this
   specific state (the button below it already correctly says "Back to community"), with
   body text mirroring step 2's wording.

### Docs to update

- [`docs/features.md`](../features.md) — the existing "No president yet" row should be
  updated to reflect the shorter copy on all three surfaces.
- [`docs/architecture.md`](../architecture.md) §3 "Leaderless communities" — if it quotes the
  old copy verbatim, sync it to match.

---

## Validation checklist (all phases)

- `npx tsc --noEmit` passes — the only automated gate in this repo.
- Phase 1: visually confirmed on both `npm run android`/`npm run ios` (native) and
  `npm run web`, not just typechecked.
- Phase 2: migration applied to prod, types regenerated with the enriched-types block
  re-appended, `/feedback` reachable from `/legal`'s footer, a submitted bug report and a
  submitted feature idea both land as rows in `feedback_reports`.
- Phase 3: viewed as a resident of a community with `communityHasLead = false` on both the
  Community tab and `/funds-access/request`.
