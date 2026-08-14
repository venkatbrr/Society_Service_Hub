# Architecture Reference

> Technical source of truth: auth, roles, database schema, RLS, RPCs, triggers, navigation, state, types, and error handling.
> For *what a screen does*, read [`features.md`](features.md). For *rules you must follow while coding*, read [`CLAUDE.md`](CLAUDE.md).

**Contents:** [1 Layers](#1-layers-and-data-flow) · [2 Auth](#2-auth-architecture) · [3 Roles](#3-role-system) · [4 Schema](#4-database-schema) · [5 RPC index](#5-rpc-index) · [6 Triggers](#6-triggers) · [7 RLS](#7-rls-model) · [8 Notifications](#8-realtime-notifications) · [9 Navigation](#9-navigation-architecture) · [10 State](#10-state-management-patterns) · [11 Types](#11-type-system) · [12 Fund permissions](#12-fund-permissions) · [13 Errors](#13-error-handling) · [14 Storage](#14-storage-and-media) · [15 Web/PWA](#15-web-and-pwa-architecture) · [16 Federation](#16-cross-community-federation-backend-only)

---

## 1. Layers and data flow

```
User interaction
  → Screen state (useState / useEffect / useFocusEffect)
    → Supabase query or RPC
      → Postgres: tables, triggers, RPCs, RLS
    → Local screen state update
  → UI re-render
```

There is **no data-fetching library and no global store**. Every screen owns its own fetch, loading, and error state. Only two React Contexts exist.

| Directory | Responsibility |
|-----------|---------------|
| `app/` | expo-router screens. File path = route. |
| `components/` | Shared UI. `.web.tsx` siblings override native-only rendering. |
| `context/` | `AuthContext`, `NotificationContext` — the only global state |
| `lib/` | Supabase client, auth helpers, generated types, fund logic, phone/Cloudinary/fraud/navigation helpers |
| `constants/` | Design tokens (`Colors`, `Verandah`) and domain vocabularies (`categories`, `providerDetails`, `schoolReviewAspects`, `sos`, `emojis`) |
| `supabase/migrations/` | Ordered SQL migrations, applied with `npm run db:push` |
| `supabase/functions/` | Edge Functions: `check_due_services`, `fraud-check` |
| `admin-dashboard/` | Vanilla-JS platform admin console (separate app) |
| `data/` | Static seed data — notably `westHyderabadSchools.ts` |

### Query scoping rule

Community-scoped queries **must** filter by `communityId` from `useAuth()`. Server-side, RLS compares against `public.get_user_community_id()`, which reads `profiles.community_id` first and falls back to JWT metadata.

**User-scoped tables** — no community filter, RLS is `auth.uid() = user_id`, no lead or admin override:
`user_services` · `user_service_history` · `hire_feedback` · `provider_public_rating_nudges` · `provider_personal_notes` · `favorites`

**Publicly readable** — no session required, so shared links resolve for logged-out visitors:
`mcn_preorder_drops` and its item/order children. Public host profile metadata (`full_name`, `avatar_url`, `flat_number`) for host cards is served via `get_public_host_profiles(uuid[])` RPC (migrations `20260802010000`, `20260805000000`, `20260903000100`). `communities` table reads are restricted to authenticated members (`communities_select_own`) via `get_user_community_id()`, with pre-join requests using `get_my_requested_community()`.

**Globally readable lookups**: `mcn_business_categories`, and `emergency_contacts` rows with `community_id IS NULL`.

---

## 2. Auth architecture

### Provider tree (`app/_layout.tsx`)

`SafeAreaProvider` → `AuthProvider` → `NotificationProvider` → `WebDesktopFrame` → (`PwaInstallBanner`, `RootLayoutNav`, `Toast`, `StatusBar`).

`RootLayoutNav` calls `configureGoogleSignIn()` on mount, runs `useSyncedBackNavigation()`, owns all redirect logic, and registers the native handler for `hire_feedback` notification taps.

### Redirect logic — evaluation order

```text
isLoading                                    → full-screen ActivityIndicator
!session                                     → /login
    public exceptions (no redirect):
      • web pathname === "/"                 (Vercel rewrites to landing.html)
      • /mcn/drops and /mcn/drops/*   (public food-drop links)
isPlatformAdmin && web && !/admin*           → window.location.replace('/admin/index.html')
isPlatformAdmin && native                    → /admin-redirect
!communityId && activeCommunityRequest       → /community-request-submitted
!communityId && !activeCommunityRequest      → /community-select
communityId && on login/select/request/…     → savedTargetRoute ?? /(tabs)
```

Two guards prevent redirect loops: `lastRedirectRef` blocks repeating the same target, and `alreadyOnTarget` skips navigation when the user is already there. Before bouncing an unauthenticated user to `/login`, the intended pathname is stored in `savedTargetRouteRef` and restored after sign-in — this is what makes deep links survive login.

`/community-join-block` is **not** in the redirect tree. It is a post-join handoff from `app/community-select.tsx`, entered after `join_community_by_code()` succeeds when the community has `blocks_enabled = true`.

### AuthContext (`context/AuthContext.tsx`)

```typescript
type AuthContextType = {
  session: Session | null
  user: User | null
  profile: Tables<'profiles'> | null
  appRole: Enums<'app_role_type'>          // 'admin' | 'president' | 'vice_president' | 'resident' | legacy
  communityId: string | null
  isPlatformAdmin: boolean
  isCommunityLead: boolean
  fundsEnabled: boolean
  blocksEnabled: boolean
  blockLabel: string                        // 'Block' | 'Tower'
  myBlockId: string | null
  communityHasLead: boolean                 // any president/vice_president in the community
  myFundsAccessRequest: { id, status, rejection_reason, decided_at } | null
  activeCommunityRequest: { id, status, created_at, name } | null
  isLoading: boolean
  refreshSession: () => Promise<void>
  signOut: () => Promise<void>
}
```

Behaviors worth knowing before you touch this file:

- **Two-phase load.** `loadProfile()` sets profile/community/`isLoading=false` first, then fires a non-blocking `Promise.all` for community settings (`funds_enabled`, `blocks_enabled`, `block_label`), `get_funds_access_status()`, the events-coordinator grant, and the `communityHasLead` count. Screens can therefore render before `fundsEnabled` or `communityHasLead` settle — never assume either is final on first paint.
- **`communityHasLead` fails open.** It is a `head: true, count: 'exact'` query for `profiles` in the community with `app_role IN ('president','vice_president')` and `removed_at IS NULL`. On error it is set to **`true`**, not `false`: a transient failure must not hide an established community's funds behind a "no president yet" notice. See §Leaderless communities below.
- **Self-healing profiles.** If the session is valid but the `profiles` row is missing, the provider recreates it from auth metadata. If recreation fails, it clears the local session.
- **Server-side validation on launch.** `getSession()` only reads the cached JWT, so `fetchSession()` also calls `getUser()` to catch deleted or banned users, then signs them out locally.
- **Community ID resolution**: `profile.community_id` → `user_metadata.community_id` → `app_metadata.community_id` → `null`. Forced to `null` for platform admins regardless of stale linkage.
- **Platform-admin email override**: a hardcoded `PLATFORM_ADMIN_EMAIL` always resolves to `admin`.
- **Resilience**: profile-load network errors retain the existing profile rather than dropping the user to `/community-select`; a 3.5 s safety timer guarantees `isLoading` clears; native apps re-verify the session on `AppState` → `active`.

### Auth helpers (`lib/auth.ts`)

`configureGoogleSignIn()` · `signUpWithEmail(email, password, fullName, flatNumber?)` · `signInWithEmail(email, password)` · `resetPassword(email)` · `getAuthErrorMessage(error)`

Session persistence uses an **AsyncStorage** adapter, not SecureStore (Android caps SecureStore entries at 2 KB, which Supabase JWTs exceed).

---

## 3. Role system

### App roles — `profiles.app_role`, enum `app_role_type`

Enum values: `admin` · `resident` · `president` · `vice_president`

Migration `20260616000001_migrate_roles_and_functions.sql` moved every `community_lead` and `community_admin` row to `president` and redefined `public.is_community_lead()` to test for `president` or `vice_president`. Those two legacy values were physically removed from the enum on 2026-08-22 by `20260822000200_drop_legacy_app_role_enum_values.sql` (rename type → recreate → recast column → drop old), after `20260822000000` repointed the last 7 RLS policies and 5 functions that still compared against the dead `community_lead` literal.

```typescript
isPlatformAdmin = appRole === 'admin'                              // or hardcoded platform-admin email
isCommunityLead = (appRole === 'president' || appRole === 'vice_president') && !!communityId
```

> President and vice-president have identical permissions; the distinction is presentational only. Use `isCommunityLead` from `useAuth()` in TypeScript and `public.is_community_lead(auth.uid())` in SQL — never compare `app_role` to a role literal directly.

**Platform admin outranks both.** `admin` (with `community_id IS NULL`) has ultimate powers across every community — everything a president/VP can do and more. Grant it in RLS with `public.is_platform_admin(auth.uid())`.

> ⚠️ **`public.is_admin()` is a misnomer** — it is only an alias that calls `is_community_lead()`, so it grants a platform admin *nothing*. A policy reading `is_community_lead() OR is_admin()` has a duplicated clause and no admin override. Always use `is_platform_admin()` for the platform-admin escape hatch.

Constraints: `admin` must have `community_id = NULL`. `president`/`vice_president` are only meaningful where `communities.funds_enabled = true` — funds activation is what promotes a resident to `president`.

### Leaderless communities

A community can exist, be approved, and fill with residents **before anyone holds
`president` or `vice_president`** — the seat is filled by the platform admin, not
by the join flow. `AuthContext.communityHasLead` exposes this to the UI.

The split is deliberate and should be preserved when adding features:

| Stays open without a lead | Waits for a lead |
|---|---|
| MCN (business directory, food drops, carpools, parent corner), service providers, visits, SOS and emergency numbers, community events, residents directory | Community funds (`/funds-access/request` and the request CTA), fund roles, block-wise collection |

The rule is *who answers for the money*: anything needing a trusted signatory —
a treasurer, a collector, a balance someone is accountable for — has nobody to
appoint it, so it is withheld rather than shown and then failing. Neighbourly
features need no such authority and stay on.

Surfaces: a `sand` notice card at the top of the Community tab, a matching strip
above the residents directory list, and a self-guard on `/funds-access/request`
(deep-linkable, so it re-checks rather than trusting its entry point).

### Fund roles — `fund_roles.role`

Per fund, independent of app role: `treasurer` (max 1, min 1) · `collector` (max 6, optionally block-scoped via `block_id`) · `resident` (implicit view-only fallback).

**These grants are per fund, not per community** — a community with three funds has three independent treasurers and three independent collector sets. Any UI listing them must group by fund.

Resolution goes through `lib/fundRoles.ts` — see §12. `is_funds_enabled(community_id)` gates every funds RPC and trigger.

`getEffectiveFundRole(appRole, assignments, userId)` collapses app roles `admin`, `president`, and `vice_president` into a single internal fund capacity `'admin'`. Because three distinct app roles share one capacity, **never render that capacity directly as a role name** — `formatRoleForFundContext(fundRole, assignment, appRole)` takes the app role as a third argument so the banner reads "President" / "Vice President" / "Platform admin" rather than an invented "Fund admin". Capability wording belongs in `getRoleAccessSummary()` instead.

**Who can change a treasurer:** community leads and admins go through `fund_roles` RLS (`20260813000000`). Those policies are keyed on `get_user_community_id()` and therefore never match a platform admin, who instead uses `platform_set_fund_treasurer()` (§5).

`list_eligible_contributors_for_collector(p_event_id)` (redefined in migration `20260816000000`) returns `resident`, `president`, and `vice_president` profiles — a lead can record a contribution for themselves, not just other residents. A block-scoped collector (`fund_roles.block_id` set) only sees profiles in that block; a collector with no block, the treasurer, and leads see the whole community.

### Who paid — member vs outside sponsor

Every income row names its payer, and there are exactly two ways to do that (migration `20260825000000`, enforced by the `event_transactions_payer_shape` check and `event_transaction_guard`):

- **Member** — `contributor_user_id` set, sponsor columns null. Recordable by a collector, treasurer, or lead. `unique_income_contribution_per_member` gives each member **exactly one contribution row per fund** — deliberately, so a fund reads as a paid/unpaid roll rather than a running account. Correcting an amount means editing that row.
- **Outside sponsor** — `sponsor_name` set (required, ≤ 80 chars), `contributor_user_id` null, with optional `sponsor_phone` and `sponsor_note`. **Only a president / vice president / platform admin** may record one; a treasurer or collector attempting it is rejected by the trigger. Sponsors sit outside the unique index, so the same sponsor may contribute more than once.

There is no third case: an income row with neither payer is rejected, so **money can never be recorded anonymously**.

`amount` carries a money shape rather than a bare `> 0` check: the trigger rounds to 2 decimal places and rejects anything above **10,00,000 per transaction**, with `event_transactions_amount_bounds` as a direct-SQL backstop. Both constraints are `NOT VALID`, so rows predating the migration are grandfathered rather than rewritten.

Block scoping and the "assigned fund members only" rule apply on **UPDATE as well as INSERT**. They were previously wrapped in `IF TG_OP = 'INSERT'`, which let a block in-charge insert a contribution for their own block and then repoint `contributor_user_id` at another block's resident.

---

## 4. Database schema

Regenerate types after any change: `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj`

### 4.1 Tenancy and identity

| Table | Key columns | Scope |
|-------|-------------|-------|
| `communities` | `name`, `code` (6-char join code), `funds_enabled`, `blocks_enabled`, `block_label`, `city`, `area`, `pincode`, `address`, `community_type`, `approximate_units` | Community |
| `profiles` | `id` (= `auth.users.id`), `full_name`, `email`, `phone_number`, `flat_id`, `flat_number`, `app_role`, `community_id`, `block_id`, `avatar_url`, `expo_push_token`, `removed_at`, `removed_by` | Self / community |
| `community_requests` | `name`, `city`, `pincode`, `area`, `address`, `community_type`, `approximate_units`, `requester_flat_number`, `proof_photo_url`, `requested_by`, `status`, `rejection_reason`, `reviewed_by`, `reviewed_at`, `resulting_community_id`, `block_label`, `block_details` | Requester / platform |
| `community_blocks` | `community_id`, `name`, `archived_at` | Community |
| `community_flats` | `community_id`, `block_id`, `flat_number`, `floor_label`, `archived_at` | Community |
| `flat_addition_requests` | `community_id`, `block_id`, `requested_by`, `flat_number`, `status`, `rejection_reason`, `reviewed_by`, `reviewed_at` | Resident / lead / platform |
| `profile_audit_log` | Audit trail for profile mutations | Platform |
| `community_events` | ⚠️ Not the funds `events` table (§4.4) — deliberately renamed to avoid the collision. `title`, `category` (cultural/sports/festival/meeting/workshop/other), `description`, `image_url`, `venue`, `event_date` (local `YYYY-MM-DD`), `start_time`, `end_time`, `registration_last_date`, `entry_fee` (display only), `registration_link`, `status` (`published`/`cancelled`), `cancelled_at`, `cancellation_note`, `created_by` | Community |
| `community_event_contacts` | `event_id`, `name`, `phone`, `role_label`, `sort_order` — max 3 per event, trigger-enforced | Scoped via parent event |
| `community_event_organizers` | `community_id`, `user_id`, `granted_by` — the "events coordinator" grant. Not an `app_role` value; any number of residents can hold it alongside their existing role | Community |

**Flat and Block Normalization Model** (migrations `20260904000000`–`20260904000300`):
- `community_flats` is the canonical inventory of verified units in a community.
- `profiles.flat_id` is the primary foreign key. A database trigger (`sync_profile_flat_denorm`) maintains `profiles.flat_number` (formatted as `<block>-<flat>`, e.g. `A-412`) and `profiles.block_id` in sync automatically.
- Downstream tables (`mcn_preorder_orders`, `mcn_carpool_requests`, `mcn_parent_corner`, `visit_joiners`) preserve immutable textual `flat_number` snapshots.
- Missing flats are submitted via `request_flat_addition()` and reviewed by community leads or platform admins.

### 4.2 Providers and trust

| Table | Key columns | Scope |
|-------|-------------|-------|
| `service_providers` | `name` (2-80), `phone`, `category`, `description` (≤1000), `details` (JSONB), `flat_block`, `avg_rating`, `rating_count`, `is_verified` (RPC locked), `is_trending`, `fraud_status` (`pass`/`queued_low`/`hidden`/`blocked`), `visibility`, `shared_by_community_id`, `created_by` | Community |
| `favorites` | Saved providers | User |
| `ratings` | 1–5 rating + `review_text` (≤1000) + optional `image_url` (one photo, Cloudinary `subfolder="reviews"`), one per user/provider or user/listing (`provider_id`/`listing_id` — same table backs both provider ratings and business-listing reviews) | Community read, owner write |
| `provider_hires` | Contact/hire log; `contact_date` generated column with unique index `(user_id, provider_id, contact_date)` | Community |
| `provider_reports` | `reason` (wrong_info/spam/inappropriate/unavailable/other), `status` (pending/reviewed/dismissed), `details` (≤500), `reported_by`, `reviewed_by`, `reviewed_at` | Community |
| `provider_personal_notes` | Private per-resident note (≤1000), one per user/provider pair | **User** |
| `provider_public_rating_nudges` | One-time nudge memory per user/provider | **User** |
| `hire_feedback` | `signal` (`positive`/`negative`/`skipped`), `note`, per `hire_id` | **User** |
| `fraud_verdicts` | `entity_type`, `entity_id`, `action`, `triggered_rules` (JSONB), `flag_count`, `hard_block_triggered`, `input_snapshot`, `summary` | Platform |

### 4.3 Service visits

| Table | Key columns |
|-------|-------------|
| `service_visits` | `title`, `category`, `visit_date` (local `YYYY-MM-DD`), `visit_time_slot`, `provider_id`, `provider_name`, `provider_phone`, `provider_whatsapp`, `estimated_cost`, `max_joiners`, `status` (`upcoming`/`in_progress`/`completed`/`cancelled`), `is_cross_community`, `host_community_id` |
| `visit_joiners` | `visit_id`, `user_id`, flat number, note |

### 4.4 Funds

| Table | Key columns |
|-------|-------------|
| `events` | A fund. `title`, `description`, `event_date`, `goal_amount`, `is_closed`, `fund_scope`, `group_id`, `partnership_id` |
| `event_transactions` | `event_id`, `type` (`income`/`expense`), `amount`, `title`, `description`, `category`, `contributor_user_id` (member income only), `sponsor_name` / `sponsor_phone` / `sponsor_note` (outside-sponsor income only), `image_url` |
| `fund_roles` | `event_id`, `user_id`, `role`, `block_id` (nullable = whole community), `assigned_by` |
| `funds_access_requests` | `community_id`, `requested_by`, `contact_name`, `contact_phone`, `purpose`, `designated_lead_id`, `status`, `rejection_reason`, `decided_by`, `decided_at` |
| `funds_access_revocations` | Platform-admin revocation audit trail |

### 4.5 MCN — business directory

| Table | Key columns |
|-------|-------------|
| `mcn_business_categories` | `name`, `emoji`, `sort_order` — global lookup |
| `mcn_listings` | `name`, `description`, `contact_phone`, `image_url` (Cloudinary), `category_id`, `owner_id`, `is_active`, `flagged_for_review_at` (set when auto-hidden by reports) |
| `mcn_products` | `listing_id`, `name`, `description`, `unit`, `price` (**nullable** = "Price on request"), `item_type` (`product`/`service`), `image_url`, `is_available`, `sort_order` |
| `mcn_orders` | `listing_id`, `buyer_id`, `buyer_phone`, `buyer_note`, `status` (`pending`/`fulfilled`/`cancelled`) — **dormant since 2026-08-09**, no screen writes here |
| `mcn_order_items` | `order_id`, `product_id`, `quantity`, `unit_price` — dormant, see above |
| `mcn_listing_reports` | `listing_id`, `reported_by`, `reason`, `details`, `status`, `reviewed_by` — one report per user/listing, mirrors `provider_reports` |

**Anti-spam triggers on `mcn_listings`** (migrations `20260819000000`, `20260821000000`, `20260821000200`), enforced server-side, not just in the UI:
- One listing per `(owner_id, category_id)` — blocks both insert and edit.
- Max 5 listings per owner with `is_active = true` at once.
- Max 1 new listing per owner per rolling 24 hours.
- `mcn_listing_reports` insert trigger auto-sets `is_active = false` and `flagged_for_review_at = now()` once a listing collects 3 pending reports, and notifies leads (`notifications.type = 'listing_auto_hidden'`, or `'listing_reported'` below the threshold). A separate trigger then blocks the *owner* from flipping `is_active` back to true while `flagged_for_review_at` is set — only a lead or platform admin can clear it (by reactivating from the existing Manage listing screen, which nulls the flag).

### 4.6 MCN — pre-order food drops

| Table | Key columns |
|-------|-------------|
| `mcn_preorder_drops` | `title`, `description`, `image_url`, `listing_id` (nullable), `created_by`, `fulfillment_date`, `fulfillment_time`, `cutoff_at`, `max_orders`, `status` (`open`/`closed`/`completed`/`cancelled`) |
| `mcn_preorder_items` | `drop_id`, `name`, `description`, `unit` (`piece`/`kg`/`box`/`pack`/`portion`/`litre`), `price`, `max_quantity`, `image_url` |
| `mcn_preorder_orders` | `drop_id`, `buyer_id`, `buyer_name`, `buyer_phone`, `flat_number`, `buyer_note`, `total_amount`, `status` (`confirmed`/`fulfilled`/`cancelled`), `cancelled_by`, `cancelled_at`, `cancellation_note` |
| `mcn_preorder_order_items` | `order_id`, `item_id`, `item_name`, `quantity` (numeric — supports 0.5), `unit_price`. Unique on `(order_id, item_id)` — one line per item per order |

Drop-wide total item capacity (`mcn_preorder_drops.max_orders`) is enforced server-side by `check_mcn_drop_item_capacity()` plus a trigger (migrations `20260803000000`, `20260804000000`), not only in the UI.

Per-item capacity (`mcn_preorder_items.max_quantity`) is a separate, smaller cap: the total quantity of *that one item* across every buyer's orders combined, not a per-order allowance. It is enforced by `check_mcn_drop_item_quantity_capacity()` (pre-flight check) and `get_mcn_drop_item_availability()` (remaining-stock display), backed by triggers on `mcn_preorder_order_items` and `mcn_preorder_orders` (migration `20260816000000`).

**Cancellation attribution and note** (migration `20260905000000`): `mcn_preorder_orders` tracks `cancelled_by`, `cancelled_at`, and `cancellation_note`. Trigger `stamp_mcn_preorder_cancellation` (`BEFORE UPDATE`) automatically stamps `cancelled_by = auth.uid()` and `cancelled_at = now()` whenever status transitions to `cancelled`, preventing clients from forging attribution. When un-cancelling, attribution and notes are reset to NULL.

**Orders are placed and edited through `place_mcn_preorder()` only** (migration `20260824000000`) — never by writing `mcn_preorder_orders` and `mcn_preorder_order_items` from the client. The client previously inserted the order row, then the line items, as two round trips; when the cap trigger rejected the second call the first was already committed, leaving a `confirmed` order with a `total_amount`, no line items, and a phantom contribution to the host's Est. Revenue. Every over-cap attempt minted one. The RPC does the whole thing in one transaction under a `FOR UPDATE` lock on the drop and each item, re-checks both caps, and derives `unit_price` and `total_amount` from `mcn_preorder_items` rather than trusting the client. Cancelling an order is still a direct `status` update.

Migration `20260824000000` fixed the app's code path but left the database open: `mcn_preorder_orders` still had a permissive INSERT policy, so anything that was not the RPC — a **stale client bundle**, a direct PostgREST call — could still commit a bare order row and have its line items rejected a round trip later. Migration `20260826000000` closes it two ways: a **deferred** constraint trigger (`trg_mcn_order_has_items`) requires ≥ 1 line item at commit, so a two-round-trip client now fails its *first* commit instead of orphaning; and INSERT is revoked (`WITH CHECK (false)`) on both tables, making placement RPC-only.

**Diagnosing one of these rows:** the RPC inserts the order with `total_amount = 0` and writes the real total only after every line is in. An item-less order carrying a **non-zero** total therefore had its total supplied by a client — it did not come from `place_mcn_preorder`.

**All four pre-order capacity triggers must stay `SECURITY DEFINER`** (migration `20260823000000`). They were originally invoker-rights, so the `SUM(quantity)` they compare against the cap ran under the buyer's own RLS and counted only that buyer's orders — every other resident's quantity was invisible and both caps could be overshot. The pre-flight RPCs were always `SECURITY DEFINER`, which is why the caps looked correct until a second buyer ordered.

`mcn_preorder_order_items` also needs UPDATE and DELETE policies (buyer's own `confirmed` order), added in the same migration. Editing a pre-order deletes the old lines and re-inserts them; with SELECT/INSERT policies only, the delete silently matched zero rows while the insert succeeded, so the order kept both the old and new line and its displayed items no longer matched `total_amount`. The `(order_id, item_id)` unique index makes that failure mode loud instead of silent.

**Anti-spam cap on concurrent open drops** (migration `20260821000100`): a host can have at most 3 drops with `status = 'open'` and `cutoff_at` in the future at the same time, enforced by a trigger on `mcn_preorder_drops`. Unlike business listings, drops have no "one per type" rule — hosting a new drop every week is the intended pattern; this only stops flooding the Open Pre-orders tab with many drops at once.

### 4.7 MCN — carpools

| Table | Key columns |
|-------|-------------|
| `mcn_carpools` | `title`, `role_type` (`offering`/`seeking`), `start_point`, `end_point`, `departure_time`, `return_time`, `trip_date` (`DATE`, nullable — non-null for one-off/outstation trips, null for recurring), `recurring_days` (`TEXT[]`), `available_seats` (immutable capacity 1–6), `vehicle_info`, `pricing_type` (`free`/`paid`), `price_per_seat` (legacy display string), `price_per_seat_amount` (`NUMERIC(10,2)`), `contact_phone`, `notes`, `status` (`active`/`paused`/`cancelled`/`completed`) |
| `mcn_carpool_requests` | `carpool_id`, `community_id`, `rider_id`, `rider_name`, `rider_phone`, `flat_number`, `seats_requested`, `note`, `status` (`pending`/`accepted`/`rejected`/`cancelled`). Unique partial index `mcn_carpool_requests_one_open_idx` on `(carpool_id, rider_id)` where `status IN ('pending', 'accepted')`. |

**Carpool capacity & transition invariants** (migrations `20260828000000`, `20260828000100`, `20260829000000`):
- `available_seats` is published vehicle capacity and is **never adjusted directly by the client**.
- Live occupancy and remaining seats are dynamically computed via `get_mcn_carpool_seats(p_carpool_id)`.
- `check_mcn_carpool_request_validity()` is a `SECURITY DEFINER` trigger that validates offering role, active status, cross-community match, requester identity (`rider_id <> created_by`), and verifies remaining seat capacity before allowing `accepted` requests.
- `enforce_mcn_carpool_request_transition()` ensures column-level authorization: riders can only edit pending requests or cancel their own; hosts (and leads/admins) can only transition pending requests to accepted/rejected/cancelled.
- `enforce_mcn_carpool_immutables()` prevents reassigning `created_by` or `community_id`, and prevents lowering capacity below seats already confirmed.
- Cancelling a ride (`status = 'cancelled'`) cascades to cancel all pending and accepted requests and triggers notifications via `handle_mcn_carpool_status_changed()`.
- Public passenger roster is retrieved via `get_mcn_carpool_passengers(p_carpool_id)` without exposing phone numbers.

### 4.8 MCN — parents, schools, social

| Table | Key columns |
|-------|-------------|
| `mcn_parent_corner` | `student_name`, `institution_type` (`school`/`college`/`preschool`), `school_name`, `school_catalog_id` (nullable `TEXT`, no FK — set when the parent picked from `data/westHyderabadSchools.ts` via `components/SchoolPicker.tsx` rather than typing free text), `board`, `grade_class`, `parent_name`, `flat_number`, `contact_phone`, `intents` (`TEXT[]`, GIN-indexed — structured tags: `carpool`, `study_group`, `homework_help`, `school_info`, `activities`, `playdate`, `other`), `notes`. Constrained by `mcn_parent_corner_text_lengths` (`student_name` ≤60, `school_name` ≤100, `board` ≤40, `grade_class` ≤40, `parent_name` ≤60, `flat_number` ≤12, `contact_phone` ≤15, `notes` ≤300) and `mcn_parent_corner_intents_valid` (`<= 7` items from the allowed set). |
| `schools` | `name`, `level`, `syllabus`, `distance`, `fee_range`, `facilities` (`TEXT[]`), `area_locality`, `address`, `contact_phone`, `website`, `google_maps_link`, `google_rating`, plus trigger-maintained `avg_academics`, `avg_teachers`, `avg_infrastructure`, `avg_sports_activities`, `avg_safety`, `avg_transport`, `avg_value`, `avg_happiness`, `review_count` |
| `school_reviews` | `school_id` (accepts text IDs for curated schools), `child_grade`, eight `*_score` columns, eight optional `*_comment` columns, `overall_comment` |
| `mcn_posts` | `kind` (`business`/`borrow`), `title`, `description`, `contact_hint`, `is_available` |

### 4.9 Reminders, SOS, messaging

| Table | Key columns | Scope |
|-------|-------------|-------|
| `user_services` | `service_name`, `category`, `last_serviced_on`, `frequency_months`, `next_due_on` (computed), `images` (JSONB array), `notified_at`, `notify_count` (smallint), `provider_id`, `notes` | **User** |
| `user_service_history` | `service_id`, `serviced_on`, `provider_id`, `provider_name_snapshot`, `cost_paid`, `note` | **User** |
| `blood_donors` | `blood_group`, `contact_phone`, `is_available`, `note` — one per user per community | Community |
| `emergency_contacts` | `name`, `phone`, `category`, `description`, `is_active`, `sort_order`; `community_id IS NULL` = global default | Community + global |
| `notifications` | `user_id`, `type`, `title`, `body`, `data` (JSONB), `is_read` | **User** |

**Service reminder backend logic** (migration `20260827000000`):
- `public.today_ist()` computes local Indian Standard Time date (`(now() AT TIME ZONE 'Asia/Kolkata')::date`).
- Date validation constraints (`last_serviced_on <= CURRENT_DATE`) are trigger-enforced using `today_ist()` (`user_services_compute_fields` and `user_service_history_validate`).
- `user_service_history_sync_parent` trigger automatically updates `user_services.last_serviced_on = MAX(serviced_on)` whenever history rows are inserted, updated, or deleted.
- `notify_due_services()` enforces repeating notification cadence (at most 1 per rolling 6.5 days, capped at 5 pings per 6-month cycle).
- `mark_service_done` is standardized to a single 4-arg RPC (`p_service_id`, `p_provider_id`, `p_cost_paid`, `p_note`) and resets `notified_at` and `notify_count`. `get_my_upcoming_services` returns `images` JSONB array.

### 4.10 Federation (backend only, no UI)

`community_partnerships` · `community_groups` · `community_group_members` · `provider_shares` · `service_visit_communities` · `community_announcements` · `announcement_audiences`

Full reference: [`cross-community.md`](cross-community.md).

### 4.11 Removed

`resident_businesses` · `business_offerings` · `business_inquiries` — dropped in `20260422010000_simplify_roles_and_remove_marketplace.sql`. `favorites` and `ratings` became single-target as a result.

---

## 5. RPC index

### Identity, onboarding, directory

| Function | Purpose |
|----------|---------|
| `handle_new_user()` | Trigger: create `profiles` row on signup, copy `flat_number` from signup metadata |
| `join_community_by_code(p_code)` | Immediate join by 6-char code |
| `generate_community_code()` | Produce a unique community code |
| `submit_community_request(...)` | Insert a community-creation request |
| `platform_approve_community_request(p_request_id)` | Create community + code, assign requester as `resident` |
| `platform_reject_community_request(p_request_id, p_rejection_reason)` | Reject a pending request |
| `get_residents_directory(p_include_phone)` | Resident list with block grouping and conditional phone visibility |
| `community_lead_remove_resident(p_target_profile_id)` | Lead removes a non-lead resident |
| `platform_soft_remove_resident(p_target_profile_id, p_reason)` | Platform-admin soft removal |
| `set_audit_actor(...)` / `set_audit_context(...)` | Attach audit metadata to profile mutations |
| `normalize_indian_mobile(p_value)` | Canonicalize flexible phone input to a validated 10-digit mobile |

### Predicates

`is_admin(p_user_id?)` *(⚠️ alias for `is_community_lead` — NOT a platform-admin check)* · `is_platform_admin(p_user_id?)` *(`app_role = 'admin'` and `community_id IS NULL`)* · `is_community_lead(p_user_id?)` *(president or vice_president, `removed_at IS NULL`)* · `is_event_organizer(p_user_id?)` *(holds a `community_event_organizers` grant in their own community — pure "has the grant" check; call sites compose it with `OR is_community_lead()` for the lead override, the same way `fund_roles` capability checks stay separate from lead checks)* · `is_user_approved(p_user_id?)` · `is_funds_enabled(p_community_id)` · `is_blocks_enabled(p_community_id)` · `get_user_community_id()` · `get_my_block_id()`

### Providers and visits

`get_community_visits(p_community_id, p_user_id, p_status, p_time_scope)` (SECURITY DEFINER, search_path = public, authenticated only; authorizes via `get_user_partner_community_ids` & `can_user_see_visit`, ignores `p_user_id` parameter to derive caller from `auth.uid()`) · `get_visit_joiners(p_visit_id)` (SECURITY DEFINER, search_path = public, authenticated only; authorizes via `can_user_see_visit`) · `platform_get_all_providers(...)` · `platform_get_provider_details(...)` · `platform_get_providers_by_category(...)` · `platform_delete_service_provider(...)`

### Hire feedback and reminders

`record_hire_feedback(p_hire_id, p_signal, p_note?)` · `get_my_provider_history(p_provider_id)` · `should_show_public_rating_nudge(p_provider_id)` · `mark_public_rating_nudge(p_provider_id, p_outcome)` · `get_my_upcoming_services()` · `get_my_due_soon_count()` · `mark_service_done(p_service_id, p_provider_id?, p_cost_paid?, p_note?)` · `get_service_history(p_service_id)` · `get_my_recent_service_history(p_limit)` · `notify_due_services()`

### Funds and blocks

`get_fund_role(p_event_id, p_user_id)` · `get_my_community_funds_overview()` · `set_fund_closed(p_event_id, p_is_closed)` · `delete_community_fund(...)` · `submit_funds_access_request(...)` · `withdraw_funds_access_request(...)` · `get_funds_access_status(p_community_id)` · `list_eligible_contributors_for_collector(...)` · `list_community_blocks(...)` · `rename_community_block(...)` · `set_resident_block(...)` · `set_my_block(...)` · `assign_block_in_charge(...)` · `remove_block_in_charge(...)`

**Block inventory is platform-admin-only (2026-08-14, `20260908000200`).** `set_community_blocks_enabled(BOOLEAN)`, `add_community_block(TEXT)` and `archive_community_block(UUID)` still exist but `EXECUTE` is revoked from `authenticated`, `anon` and `PUBLIC` — calling them from the app raises a permission error. Blocks define resident flat scoping, fund collection scopes and the per-block collector cap, and turning them off unscopes every resident and in-charge in one tap, so creating/archiving/toggling belongs to the admin console via `platform_add_community_block(...)`, `platform_archive_community_block(...)` and `platform_set_blocks_enabled(...)`. `rename_community_block(...)` is still granted to community leads: it is cosmetic and reversible, and is the one correction a president legitimately needs. `app/community/blocks.tsx` is therefore a read-plus-rename screen.

### Community aggregates

`get_community_insights(...)` · `get_community_pulse(p_limit)` · `get_all_communities()`

### Community events

`upsert_community_event(p_event_id, p_title, p_category, p_description, p_image_url, p_venue, p_event_date, p_start_time, p_end_time, p_registration_last_date, p_entry_fee, p_registration_link, p_contacts)` — the only supported way to create or edit an event; writes the event row and its 1–3 `community_event_contacts` in one transaction so a contact-cap rejection cannot leave an event with no way to reach its organizers (mirrors `place_mcn_preorder()`). `p_event_id NULL` creates, non-null edits (existing contacts are cleared and re-inserted). Derives scope from `auth.uid()`; caller must hold the `is_event_organizer()` grant or be a lead. Cancelling is not an RPC — it's a direct `UPDATE community_events SET status = 'cancelled'` under RLS, since it's a single-table change with no atomicity concern.

### MCN

`place_mcn_preorder(p_drop_id, p_items, p_buyer_name, p_buyer_phone, p_flat_number, p_buyer_note, p_order_id)` — **the only supported way to place or edit a pre-order.** `p_items` is `[{"item_id": uuid, "quantity": numeric}]`, aggregated by item so a repeated id cannot bypass the cap; a non-null `p_order_id` edits that order (its existing lines are cleared first, so the buyer's own prior quantity is excluded from the cap sums rather than double-counted). Returns the order id. `check_mcn_drop_item_capacity(...)` — validates a drop's total `max_orders` cap. `check_mcn_drop_item_quantity_capacity(...)` — same idea, scoped to one item's `max_quantity` shared across every buyer. `get_mcn_drop_item_availability(p_drop_id)` — remaining stock per item, for display; the drop screen re-reads it on focus because another resident's order makes it stale.

`place_mcn_order(p_listing_id, p_items, p_buyer_phone, p_buyer_note, p_order_id)` — **the atomic way to place or edit a business listing order.** Inserts/updates `mcn_orders` and `mcn_order_items` in a single transaction under `enforce_mcn_order_immutable_fields` trigger, ensuring consistency and preventing owner self-orders. ⚠️ **No caller since 2026-08-09** — in-app business ordering was hidden and the function is dormant, not dropped. If ordering returns, route it back through here rather than writing to the tables directly. See [`disabled-features.md`](disabled-features.md) §2b.

`get_mcn_carpool_seats(p_carpool_id)` — returns `(total_seats INT, booked_seats INT, remaining_seats INT)` dynamically derived from accepted requests.
`get_mcn_carpool_passengers(p_carpool_id)` — returns `(passenger_name TEXT, passenger_flat TEXT, seats INT)` for society co-passenger roster visibility (excludes phone numbers).

`get_listing_og_card(p_id)` / `get_community_og_card(p_id)` *(added `20260906000000`)* — `SECURITY DEFINER`, granted to `anon` and `authenticated`, each returning only the 2–3 columns a link-preview crawler needs (`name`/`description`/`image_url`; `name`/`address`). Exist because `mcn_listings_select` and `communities_select_own` are both scoped to `get_user_community_id()`, which resolves to nothing for an unauthenticated crawler — a direct table read from `api/share-listing.ts` / `api/share-community.ts` would silently return zero rows. `mcn_preorder_drops` needs no equivalent: it already has a deliberate anon-readable policy (`20260802010000_allow_public_food_drop_read.sql`, "Allow anonymous users to browse food drops"), so `api/share-drop.ts` reads the table directly.

### Platform admin console

`platform_get_community_dashboard(...)` · `platform_get_community_dashboard_v2(...)` · `platform_get_community_funds(...)` · `platform_get_community_businesses(...)` · `platform_get_community_preorders(...)` · `platform_get_resident_details(...)` · `platform_approve_funds_access_request(p_request_id, p_lead_user_id)` · `platform_reject_funds_access_request(...)` · `platform_revoke_funds_access(...)` · `platform_set_community_lead(...)` · `platform_remove_community_lead(...)` · `platform_set_fund_treasurer(p_event_id, p_target_user_id)` · `platform_set_blocks_enabled(...)` · `platform_set_block_label(...)` · `platform_add_community_block(...)` · `platform_archive_community_block(...)` · `platform_assign_block_in_charge(...)` · `platform_remove_block_in_charge(...)`

All are `SECURITY DEFINER` and raise unless `is_platform_admin(auth.uid())`. **They exist because a platform admin has no RLS grant on community-scoped tables** — `is_platform_admin()` requires `community_id IS NULL`, so every policy keyed on `get_user_community_id()` matches nothing for them. A direct `supabase.from('<table>')` read from the admin console therefore returns `[]` silently rather than erroring. See [`platform-admin.md`](platform-admin.md) §1a.

`platform_set_fund_treasurer(p_event_id, p_target_user_id)` *(added `20260820000000`)* — assigns or replaces a fund's treasurer. Deletes the existing `fund_roles` treasurer row and inserts the new one in one transaction, keeping the one-treasurer-per-fund invariant in `validate_fund_role_change` satisfied. Rejects a target who is removed, in another community, or holds `admin`/`president`/`vice_president`. Community leads manage their own funds' treasurers through `fund_roles` RLS instead; those policies key on `get_user_community_id()` and never apply to a platform admin.

**Counting convention** — `orders_count` / `total_preorders` / `total_food_revenue` all **exclude `cancelled` orders**, matching what the resident-facing "My Pre-order Food Performance" panel shows. Corrected in `20260817000000`; before that the counts included cancelled rows while revenue did not.

`platform_get_community_businesses` reads listing ratings from the shared **`public.ratings`** table filtered by `listing_id` (the same table used for provider ratings) — there is no separate `mcn_listing_ratings` table. It referenced that nonexistent table, and used a bare `listing_id` that collided with its own `RETURNS TABLE` OUT parameter, until `20260818000000`. Both faults only surfaced at call time, which is why they survived unnoticed until the console started calling the function.

### Federation (no UI)

`get_user_partner_community_ids(...)` · `can_user_see_provider(...)` · `can_user_see_visit(...)` · `can_user_see_announcement(...)` · `request_community_partnership(...)` · `accept_community_partnership(...)` · `set_partnership_status(...)` · `set_provider_visibility(...)` · `list_visible_providers(...)` · `list_partner_communities()`

> **Naming convention for new federation RPCs**: `list_visible_*`, `can_user_see_*`, `set_*_visibility`, `*_community_partnership`. Never modify `get_user_community_id()` for federation behavior — use `get_user_partner_community_ids()`.

---

## 6. Triggers

| Trigger | Table | Event | Action |
|---------|-------|-------|--------|
| `on_auth_user_created` | `auth.users` | INSERT | Create the `profiles` row |
| `on_rating_change` | `ratings` | INS/UPD/DEL | Recompute `service_providers.avg_rating` / `rating_count` |
| `service_provider_phone_guard_trigger` | `service_providers` | BEFORE INS/UPD | Normalize phone, reject same-community duplicates |
| `on_service_visit_created` | `service_visits` | INSERT | Emit `new_visit` notifications |
| `on_service_visit_rescheduled` | `service_visits` | UPDATE of date/slot | Emit `visit_rescheduled` notifications |
| `user_services_compute_fields_trigger` | `user_services` | BEFORE INS/UPD | Recompute `next_due_on`, clear `notified_at` |
| `fund_role_guard` | `fund_roles` | INS/UPD/DEL | Funds-enabled gate, treasurer cap (1), collector caps (global + per block) |
| `event_transaction_guard` | `event_transactions` | INS/UPD | Funds-enabled gate, amount rounding + bounds, payer resolution (member vs sponsor), block-scope check for block in-charges |
| `profile_block_guard` | `profiles` | BEFORE INS/UPD | `block_id` must belong to the same community |
| `fund_role_block_guard` | `fund_roles` | BEFORE INS/UPD | `block_id` must belong to the fund's community |
| school-review aggregate trigger | `school_reviews` | INS/UPD/DEL | Recompute `schools.avg_*` and `review_count` |
| `enforce_mcn_item_max_quantity_trigger` | `mcn_preorder_order_items` | AFTER INS/UPD | Reject orders exceeding `mcn_preorder_items.max_quantity`. `SECURITY DEFINER` |
| `enforce_mcn_item_max_quantity_order_trigger` | `mcn_preorder_orders` | AFTER UPD OF `status` | Re-check item caps when an order returns to a counted status. `SECURITY DEFINER` |
| `enforce_mcn_drop_capacity_trigger` | `mcn_preorder_order_items` | AFTER INS/UPD | Reject orders exceeding `mcn_preorder_drops.max_orders`. `SECURITY DEFINER` |
| `trg_mcn_order_has_items` | `mcn_preorder_orders` | AFTER INS, **DEFERRED** | At commit, an order must have ≥ 1 line item — kills the item-less orphan at the source. `SECURITY DEFINER` |
| `enforce_mcn_drop_capacity_order_trigger` | `mcn_preorder_orders` | AFTER UPD OF `status` | Re-check the drop cap on status change. `SECURITY DEFINER` |
| `enforce_mcn_item_max_quantity_floor` | `mcn_preorder_items` | BEFORE UPDATE | Reject lowering `max_quantity` below what is already pre-ordered |
| `trg_mcn_preorder_order_immutable_fields` | `mcn_preorder_orders` | BEFORE UPDATE | Enforces total amount and ownership immutability outside `place_mcn_preorder()` RPC |
| `trg_mcn_order_immutable_fields` | `mcn_orders` | BEFORE UPDATE | Enforces buyer, listing, and community immutability outside `place_mcn_order()` RPC |
| `mcn_carpool_request_validity` | `mcn_carpool_requests` | BEFORE INS/UPD | Validates role, active status, community scope, requester identity, and remaining seat capacity. `SECURITY DEFINER` |
| `mcn_carpool_request_transition` | `mcn_carpool_requests` | BEFORE UPDATE | Enforces column-level authorization and legal status transitions. `SECURITY DEFINER` |
| `mcn_carpools_immutables` | `mcn_carpools` | BEFORE UPDATE | Prevents mutating `created_by` or `community_id`, and prevents lowering capacity below confirmed seats. `SECURITY DEFINER` |
| `on_mcn_carpool_request_created` | `mcn_carpool_requests` | AFTER INSERT | Emits `carpool_request` notification to host |
| `on_mcn_carpool_request_status` | `mcn_carpool_requests` | AFTER UPDATE | Emits `carpool_request_accepted` / `_rejected` / `_cancelled` notifications |
| `on_mcn_carpool_status` | `mcn_carpools` | AFTER UPDATE | Emits `carpool_cancelled` / `carpool_paused` to confirmed passengers and cascades request cancellations |
| `prevent_mcn_item_delete_with_orders` | `mcn_preorder_items` | BEFORE DELETE | Reject removing an item residents have pre-ordered. Skipped when the parent drop is itself being deleted, so whole-drop deletion still cascades |
| `*_updated_at` triggers | `provider_personal_notes`, `blood_donors`, `emergency_contacts`, `mcn_carpools`, `mcn_carpool_requests`, `mcn_parent_corner`, and other MCN tables | BEFORE UPDATE | Refresh `updated_at` |
| `trg_community_event_contact_cap` | `community_event_contacts` | BEFORE INSERT | Reject a 4th contact on the same event. `SECURITY DEFINER` |
| `trg_community_event_immutables` | `community_events` | BEFORE UPDATE | Prevents mutating `community_id` or `created_by`; stamps `updated_at`. `SECURITY DEFINER` |
| `trg_community_event_stamp_cancellation` | `community_events` | BEFORE UPDATE | Stamps/clears `cancelled_at` on a `status` transition to/from `cancelled` (mirrors `stamp_mcn_preorder_cancellation`). `SECURITY DEFINER` |
| `trg_community_event_creator_cap` | `community_events` | BEFORE INSERT | Anti-spam: at most 5 published, future-dated events per creator at a time (same shape as the food-drop concurrent-open cap, `20260821000100`). `SECURITY DEFINER` |
| `on_community_event_published` | `community_events` | AFTER INSERT | Emits `community_event_posted` to every non-removed profile in the community except the poster. `SECURITY DEFINER` so the fan-out sees all profiles, not just the ones the poster's RLS grants. Fires once per event — `upsert_community_event()` edits with an UPDATE, so editing never re-notifies (`20260908000000`) |
| `on_community_event_cancelled` | `community_events` | AFTER UPDATE OF `status` | Emits `community_event_cancelled` to the same audience when `status` first becomes `cancelled`, appending `cancellation_note` when set. `SECURITY DEFINER` (`20260908000000`) |


---

## 7. RLS model

RLS is enabled on every active table.

| Table group | Access model |
|-------------|--------------|
| `profiles` | Own row, or same community |
| `community_requests` | Requester reads own; platform admins review |
| `service_providers` | Same community read; insert requires `created_by = auth.uid()`; creator/lead/admin manage |
| `service_visits`, `visit_joiners` | Same community read; creator manages the visit; users manage their own joins |
| `ratings` | Same-community read, owner write |
| `provider_hires`, `provider_reports` | Community-scoped |
| `favorites`, `hire_feedback`, `provider_personal_notes`, `provider_public_rating_nudges`, `user_services`, `user_service_history` | **User-owned only** — `auth.uid() = user_id`, no lead or admin override |
| `events`, `event_transactions`, `fund_roles` | Community-scoped read, role-gated write, plus trigger guards |
| `community_events` | Community-scoped read; insert/update requires `is_event_organizer()` OR `is_community_lead()` (plus `created_by = auth.uid()` on insert, creator-or-lead on update); delete adds `is_platform_admin()` |
| `community_event_contacts` | Visibility and write both follow the parent event's community/creator-or-lead check — no independent policy of its own |
| `community_event_organizers` | Community-scoped read; insert/delete lead-only |
| `funds_access_requests`, `community_blocks` | Community-visible read; **writes are RPC-only** |
| `funds_access_revocations` | Platform-admin read; RPC-only write |
| `notifications` | User-owned read and mark-read |
| `blood_donors` | Community read; residents write only their own row |
| `emergency_contacts` | Community + global read; writes limited to leads (own community) and platform admins (including global rows) |
| `mcn_business_categories` | Authenticated read-only lookup |
| `mcn_listings`, `mcn_products` | Community read; owner writes |
| `mcn_orders`, `mcn_order_items` | Buyer or listing owner read; buyer inserts/cancels; owner updates status |
| `mcn_preorder_drops` + children | **Public read**; creator writes; item and order policies chain through the parent drop |
| `mcn_carpools` | Community read; creator or lead writes |
| `mcn_carpool_requests` | Rider or ride host read; rider inserts; either side updates |
| `mcn_parent_corner` | Community read; owner or lead writes (scoped to `community_id = get_user_community_id()`) |
| `mcn_posts` | Community read; owner or lead writes |
| `schools`, `school_reviews` | Community read; author writes own review. Leads and platform admins may also edit/delete any row (`20260822000000`). |

**Uniform MCN owner-or-lead rule** — `mcn_preorder_drops`, `mcn_listings`, `mcn_carpools`, `mcn_parent_corner`, and `mcn_posts` allow the write when
`owner = auth.uid() OR public.is_community_lead(auth.uid()) OR public.is_platform_admin(auth.uid())`.

Applies to DELETE (`20260814000000`, corrected to `is_platform_admin` in `20260822000100`) and to UPDATE (`20260822000000`, which also repointed `schools_update`/`schools_delete` and `school_reviews_delete`). The original DELETE rule used `is_admin()`, which is only an alias for `is_community_lead()` and therefore gave the platform admin no override at all. Note: `mcn_parent_corner` UPDATE and DELETE policies (`20260831000000`) additionally pin `community_id = get_user_community_id()` in both `USING` and `WITH CHECK` for owner/lead branches, making `mcn_parent_corner` strictly community-scoped. This community pin has not yet been applied to its four sibling MCN tables.

Pending or removed users are blocked from community content even when a stale `community_id` remains on the profile.

### The 2026-08-22 role cleanup — what to know

Migration `20260616000001` renamed the roles but left **12 call sites still comparing against the literal `'community_lead'`**. Since no row could hold that value anymore, each was permanently `FALSE` — failing open in some places and closed in others, all silently. Three migrations closed this out:

| Migration | What it did |
|-----------|-------------|
| `20260822000000` | Repointed all 12 dead checks — 7 RLS policies (`schools_update/delete`, `school_reviews_delete`, `mcn_posts_update`, `mcn_carpools_update`, `mcn_parent_corner_update`, `mcn_preorder_drops_update`) and 5 functions (`platform_soft_remove_resident`, `community_lead_remove_resident`, `validate_event_transaction`, `handle_provider_report_notification`, `request_community_partnership`) |
| `20260822000100` | Replaced the `is_admin()` alias with `is_platform_admin()` on the 5 MCN delete policies, giving the platform admin a real override |
| `20260822000200` | Dropped `community_lead` / `community_admin` from `app_role_type` via type swap |

**Behavior that was broken and is now restored:**

- Presidents/VPs could not edit schools, posts, carpools, parent-corner entries, or others' food drops, and could not delete school reviews.
- `platform_soft_remove_resident`'s "cannot remove the only community lead" guard never fired — a platform admin could strand a community with **no lead at all**.
- `community_lead_remove_resident`'s guard never fired — one president could remove another.
- `validate_event_transaction` blocked a president/VP with no `fund_roles` row from recording a contribution.
- `provider_reported` and `partnership_request` notifications selected recipients on the dead value and **delivered to nobody**.

**Deliberately not changed:** the `events` / `fund_roles` policies named "Admins and community leads can …". They are gated on `community_id = get_user_community_id()`, which is `NULL` for a platform admin, so no role clause can make them pass. Platform admins act on those through `SECURITY DEFINER` `platform_*` RPCs by design.

**Enum swap mechanics** (reusable recipe — Postgres has no `ALTER TYPE … DROP VALUE`): drop dependent function signatures and the column default, drop any trigger whose `WHEN` clause names the column (`profile_audit_log_on_profiles` does), `ALTER TYPE … RENAME`, `CREATE TYPE` fresh, `ALTER COLUMN … TYPE … USING col::TEXT::newtype`, restore default, `DROP TYPE …_old`, then recreate the function and trigger. Function *bodies* re-resolve at runtime and need no edit. The whole migration runs in one transaction, so a missed dependency rolls back cleanly rather than leaving a half-swapped type.

`profile_audit_log.old_value` / `new_value` are `TEXT` and still contain historical `'community_lead'` strings. That is intentional — it is an audit log of what actually happened.

### Funds activation lifecycle

1. **Default** — `funds_enabled = false`, `blocks_enabled = false`, no community lead.
2. **Activated** — platform admin approves a funds-access request; the same transaction sets `funds_enabled = true` and promotes the designated resident to `president`.
3. **Revoked** — `platform_revoke_funds_access(...)` sets both flags false, demotes the lead to `resident`, and clears block scopes **without touching ledger history**.

`fund_role_guard` and `event_transaction_guard` hard-reject writes whenever funds are inactive.

---

## 8. Realtime notifications

`NotificationProvider` (`context/NotificationContext.tsx`):

- loads the latest 50 `notifications` rows for the signed-in user
- tracks `unreadCount` in memory
- subscribes to `postgres_changes` INSERT filtered by `user_id`
- requests permissions and creates the Android `default` channel on native
- stores `profiles.expo_push_token` when Expo token registration succeeds

On arrival: prepend to local state → increment `unreadCount` → schedule a local device notification on iOS/Android.

**Live types**: `new_visit` · `visit_rescheduled` · `community_approved` · `community_rejected` · `removed_from_community` · `service_reminder` · `funds_access_requested` · `funds_access_approved` · `funds_access_rejected` · `community_lead_appointed` · `community_lead_removed` · `funds_access_revoked` · `new_community_request` · `provider_reported` · `community_event_posted` · `community_event_cancelled`

> `community_event_posted` / `community_event_cancelled` carry `data.event_id` and `data.category`, and `app/notifications.tsx` deep-links them to `/events/[id]`.

> `community_lead_appointed` / `community_lead_removed` are notification **type strings**, unrelated to the removed `community_lead` role value.
>
> **Lead fan-out notifications must select recipients via `president`/`vice_president`.** `provider_reported` (`handle_provider_report_notification`) and `partnership_request` (`request_community_partnership`) both selected on the dead `community_lead` role and silently delivered to zero recipients until `20260822000000`. Any new "notify the leads" query should filter `app_role IN ('president','vice_president') AND removed_at IS NULL`.

**Reserved (federation, unemitted)**: `partnership_request` · `partnership_accepted`

**Legacy, still routed defensively**: `new_community_request` · `new_promotion_request` · `promoted_to_admin` · `promotion_approved` · `promotion_rejected`

Hire feedback does **not** use a table row: it is a purely local `expo-notifications` schedule 24 h after a `provider_hires` insert, deep-linked via `data.kind = 'hire_feedback'` and handled in `app/_layout.tsx`.

Web push is not implemented — see [`archive/pwa-web-push-notifications-plan.md`](archive/pwa-web-push-notifications-plan.md) for the unbuilt design.

---

## 9. Navigation architecture

### Tabs (`app/(tabs)/_layout.tsx`) and the global bottom nav

Help · Saved · MCN · Community · Profile. The `Tabs` navigator in `(tabs)/_layout.tsx` still owns routing between the five tab screens, but its own bar is hidden (`tabBarStyle: { display: 'none' }`) — expo-router only renders a `Tabs` bar for screens inside that group, so it would disappear on every non-tab route (`/funds`, `/mcn/*`, `/services`, `/sos`, ...). The bar users actually see is `components/GlobalBottomNav.tsx`, rendered once as a flex sibling to the root `<Stack>` in `app/_layout.tsx` so it stays visible on every screen. It derives the active tab from `usePathname()` (e.g. `/funds*`, `/sos`, `/residents` all highlight Community) and pushes to the five tab-root routes on tap. It renders only once `session`, `communityId`, and `!isLoading` are all true — hidden pre-login and pre-community-selection. Height is 52 px on web / `46 + safeAreaBottom` on native (smaller than the old per-tab bar).

### Route-collision rule (read before adding any route)

**No two route files may resolve to the same URL pattern.** React Navigation treats this as a hard error — `getStateFromPath` throws *"Found conflicting screens with the same pattern"* — and expo-router only survives it by deleting that guard. The ambiguity does not fail loudly; it silently corrupts browser history at the boundary between the colliding subtrees.

This is exactly what broke MCN browser-back. `app/(tabs)/network.tsx` (the hub tab) and the old `app/network/` directory both claimed `/network`. Any navigation crossing that boundary — hub → `/network/drops` → a detail screen — lost its middle history entry, so browser-back skipped straight to the hub. Screens that never crossed it (`/network/business` → `/network/listing/:id`) worked fine, which is what made the bug look arbitrary.

**The fix:** the MCN sub-route tree lives at `app/mcn/` → `/mcn/*`, while the hub tab keeps `/network`. A tab screen and a route directory cannot share a name.

> **Resolved 2026-08-09 — this collision did cause a bug.** `app/index.tsx` and `app/(tabs)/index.tsx` both claimed `/`. Because `app/index.tsx` ran `window.location.replace('/landing.html')` on mount, any browser-back that landed on `/` — including a signed-in user returning to the Home tab from `/provider/:id` — was thrown out of the app onto the marketing page.
>
> `app/index.tsx` has been **deleted**. `/` now unambiguously means the Home tab. Its two jobs moved into the `app/_layout.tsx` guard: signed-out web visitors at `/` get `window.location.replace('/landing.html')`, and native falls through to the existing `redirectTo = '/login'` branch. The landing redirect is additionally skipped when the user arrived via browser-back, so it cannot re-form the same trap.

To check for collisions after adding routes, build the linking config and run `getStateFromPath` over your new URLs; a collision throws with both conflicting screen names.

**Not a collision, despite looking like one:** a tab file plus a same-named subdirectory (`app/(tabs)/community.tsx` owning `/community` alongside `app/community/blocks.tsx` and `app/community/flats.tsx` owning `/community/blocks` and `/community/flats`) is fine — the collision rule only bites when two files resolve to the **exact same** path, not when one is a sub-path of the other. `app/(tabs)/profile.tsx` + `app/profile/edit.tsx` is the same shape and has never caused a problem. When a president reported blocks/flats "not visible" (2026-08-13), this was the leading hypothesis and it was wrong — traced to a stale-render bug in the screens instead (see §5 in features.md and the block-list note above). Don't re-reach for this explanation without checking the actual URLs first.

### Back navigation (`lib/navigation.ts`)

The app distinguishes **two different meanings of "back"**, and conflating them is what previously broke browser history.

| Concept | Trigger | Meaning | Who implements it |
|---------|---------|---------|-------------------|
| **Chronological back** | Browser back button, Android hardware back | "the screen I was on before" | expo-router / React Navigation — **we do not intercept it** |
| **Hierarchical up** | The in-app header back arrow | "the logical parent of this screen" | `goBackSmart()` |

**The invariant everything depends on:** forward navigation always uses `router.push()`, so each screen owns exactly one browser history entry. Back navigation must therefore **pop** that entry (`router.back()`), never replace it.

`router.replace()` overwrites the current history entry instead of removing it. Using it for back navigation leaves the browser's back stack one level shallower than the visual depth — so the next browser-back skips a level — and destroys the forward button. Reserve `replace()` for:
- post-save redirects (so back does not return to a submitted form),
- redirect bridges such as `/mcn/drops?id=…` and `/mcn/drops/manage` (so the bridge URL keeps no history entry of its own — with `push()` these create an infinite back loop),
- sibling-tab toggles like drops ⇄ business, which are one logical level and must not stack entries.

**API**

- `getImmediateParentRoute(path)` — maps every `/mcn/*` route (plus `/services/*`, `/legal`, `/funds/*`, `/sos/*`, `/events/*`, and `/community/blocks`+`/community/flats`) to its logical parent, e.g. `/legal` → `/profile`, `/mcn/drops/manage/:id` → `/mcn/drops/:id` → `/mcn/drops` → `/network`, `/funds/add-transaction?event_id=X` → `/funds/X` → `/funds` → `/community`, `/sos/donor` → `/sos` → `/community`, or `/events/add?id=X` → `/events/X` (edit) / `/events` (create) → `/community`. Accepts an optional query string because a few parents are context-dependent: `/mcn/schools/review?schoolId=X` → that school, `/mcn/add?source=my-posts` → My Submissions, `/funds/add-transaction?event_id=X` → that fund, and `/events/add?id=X` → that event.
- `goBackSmart(router, path)` — what header back buttons call. Pops with `backTracked()` when the previous tracked route already **is** the logical parent (the common case, keeping history and forward in sync); otherwise falls back to `replaceTracked(parent)` for a cross-branch jump or a deep-link entry with nothing to pop. Its correctness rests entirely on the tracked stack matching real history — see the reducer below.
- `normalizeRoute(route)` — canonical form for comparisons: strips query, hash, trailing slash, and expo-router group segments so `/(tabs)/network` and `/network` compare equal.
- `getPreviousRoute()` — the previous entry in the tracked stack.
- `replaceTracked(router, route)` / `pushTracked` / `backTracked` — thin wrappers that call `setNavIntent()` before delegating to the router. **Every `router.replace()` in `app/` goes through `replaceTracked`** (verified by grep; only `router.back()` is still called raw, which is safe — see below).
- `useSyncedBackNavigation()` — runs in the root layout. Maintains the tracked stack and adds **one** Android guard: when `canGoBack()` is false (deep link into a nested screen), hardware back walks up the hierarchy instead of exiting the app. It observes `popstate` but never calls `preventDefault` and never navigates in response.

**Tracked stack** — a `sessionStorage` array (in-memory on native), capped at 25 entries, reset to the current route on every fresh document load (React Navigation starts empty after a reload, but `sessionStorage` does not).

It is reconciled on each pathname change by an **intent-driven reducer**, not by inspecting the pathname. This is the crux: *navigating to a route already in the stack* and *going back to it* are the same observation with opposite effects on history.

```
stack [N, B, L, M], replace(B)  ->  real [N, B, L, B]   4 entries, M consumed
stack [N, B, L, B], back()      ->  real [N, B, L]      3 entries
```

The previous **truncate-or-push** rule guessed "already in the stack means back" and produced `[N, B]` for both. After a post-delete `replace`, tracked claimed depth 2 while the browser held 4 — so `goBackSmart` believed a pop would reach the parent, called `router.back()`, and landed the user on the record they had just deleted. The same ambiguity collapsed the tab bar's `Home → Network → Home` (three real entries, tracked as one).

How the intent is resolved, strongest signal first:

| Signal | Action |
|---|---|
| Explicit intent from a `*Tracked` helper | Apply it. Replaces are *always* explicit, so nothing below needs to detect one. |
| Web, `popstate` fired since last sync | Browser back/forward. Direction unknown, so locate the route: back truncates to it, forward re-appends. |
| Web, no popstate | A plain `router.push()` — append, even if the route is already in the stack. |
| Native (no History API) | Landing on the entry directly beneath the current one is a pop (`router.back()`, hardware back, swipe-back); anything else is a push. |

`window.history.length` is **not** a usable push-vs-replace signal: after a back, a push drops the forward entries, so the length can *shrink* on a push.

The popstate counter the reducer reads is deliberately separate from the `sawPopStateAt` flag that `consumeHistoryPop()` clears — effects in `app/_layout.tsx` may run first, and one shared flag means whichever ran first ate the signal.

**When you add a `/mcn/*`, `/funds/*`, or `/sos/*` route, add its parent mapping to `getImmediateParentRoute()`**, or back navigation falls through to the MCN hub. Every header back button — MCN, funds, SOS, or `/community/blocks`+`/community/flats` — must call `goBackSmart(router, path)`, not raw `router.back()`: a plain `router.back()` silently does nothing on a deep-linked or freshly-loaded screen with no history to pop. This was the exact bug on `/sos/index.tsx`, `/sos/donor.tsx`, and `/sos/manage-contacts.tsx` (fixed 2026-08-13, alongside adding the missing `/sos/*` mapping — it had none before, so even a correct `goBackSmart` call would have fallen through to `/network` instead of `/community`).

### Shared MCN header

`lib/mcnHeader.tsx` exports `buildMcnHeaderOptions({ title, onBack, headerRight })` — the standard stack header for MCN screens (surface background, no shadow, `HeaderBackButton` on the left).

### Route parameter patterns

- Help tab preserves `segment` and `visitTab` through params on drill-in/return
- `/residents?returnTo=community|profile`
- `/funds/add-transaction?event_id=…&type=income|expense`
- `/mcn/drops?id=…&tab=active|closed|my_drops` — the `id` form redirects into the drop detail (web deep-link bridge)
- `/mcn/schools/compare?ids=a,b,c` — max 3

### Platform admin console routing

Hash-based SPA: `#dashboard` · `#approvals` · `#communities` · `#providers` · `#funds-requests`. Unknown hashes fall back to `#dashboard`.

---

## 10. State management patterns

1. `useEffect` for initial and dependency-driven fetches.
2. `useFocusEffect` for screens that must refresh on return (nearly all list screens).
3. `useCallback`-wrapped loaders so focus effects have stable dependencies.
4. `Promise.all` for batched reads — see the MCN hub's six parallel count queries.
5. Optimistic updates for cheap toggles (favorites, mark-as-read).

Standard screen state: `loading` (initial), `refreshing` (pull-to-refresh), `isLoading` (form submit).

### Debounced search — required for every text-driven list query

```tsx
const [searchQuery, setSearchQuery] = useState('');
const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');

useEffect(() => {
  const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
  return () => clearTimeout(t);
}, [searchQuery]);
```

Use `debouncedSearchQuery` — never the raw input — in fetch dependency arrays.

### Category group filter (Help tab)

Two cooperating states drive the provider query:

1. `selectedCategory: string | null` → `.eq('category', selectedCategory)`
2. `selectedGroupCategories: string[] | null` → `.in('category', selectedGroupCategories)`, applied only when no specific category is active

`CategoryFilter` derives groups from `CATEGORY_GROUPS` in `constants/categories.ts` and reports group taps through `onSelectGroupCategories`. Both states reset on tab switch or search clear, and both belong in `fetchProviders` dependencies. The same grouped picker is reused in `app/provider/add.tsx` and `app/visits/add.tsx`.

Query-scoping notes: the Help tab scopes `provider_hires` to `communityId`, and scopes `visit_joiners` to the current page's visit IDs to avoid full-table scans.

---

## 11. Type system

`lib/database.types.ts` is generated — **never hand-edit the generated portion**. It exports `Tables<T>`, `InsertTables<T>`, `UpdateTables<T>`, `Enums<T>`, plus a hand-maintained block of enriched app types appended at the very end of the file (`ProviderWithInteraction`, `VisitWithJoinerData`, `VisitJoinerWithProfile`). `npx supabase gen types` overwrites the **entire file**, deleting that block — re-add it every time you regenerate (CLAUDE.md §6). If a screen import from `database.types.ts` breaks right after a regen, this is why.

```typescript
type AppRole = Tables<'profiles'>['app_role']       // Enums<'app_role_type'>
type AssignmentRole = Tables<'fund_roles'>['role']  // 'treasurer' | 'collector' | ...
type FundAccessRole = 'admin' | AssignmentRole | 'resident'
```

Screen-local enriched types are declared next to their screen (for example `ParentCornerItem` in `app/mcn/parents/index.tsx`, `PreorderDropItem` in `components/PreorderDropCard.tsx`).

Strict mode is on; `@/*` maps to the project root.

---

## 12. Fund permissions

`lib/fundRoles.ts` is the only place fund permissions are decided.

```typescript
MAX_TREASURERS = 1
MIN_TREASURERS = 1
MAX_COLLECTORS = 6

getEffectiveFundRole(appRole, assignments, userId)   // 'admin' | 'treasurer' | 'collector' | 'resident'
getFundPermissions(role)                             // → { canCreateFund, canManageTreasurers,
                                                     //     canManageCollectors, canAddContribution, canAddExpense }
formatRole(role) / formatRoleForFundContext(role, assignment)
isFundsEnabled(community) / isBlockScopedAssignment(assignment)
getRoleAccessSummary(role)                           // one-line "what can I do" summary shown on the fund detail screen
```

`getEffectiveFundRole()` resolves `admin`, `president`, and `vice_president` to fund-admin level. The database remains the real authority through RLS plus `fund_role_guard` and `event_transaction_guard`.

---

## 13. Error handling

`lib/supabaseErrors.ts`:

| Helper | Use |
|--------|-----|
| `isSupabaseSchemaError(error)` | Generic missing-table/column detection — lets a screen render a "feature not deployed" state instead of a crash (see `app/mcn/parents/index.tsx`) |
| `isMissingFundSchemaError(error)` / `getMissingFundSchemaMessage()` | Funds-specific schema gaps |
| `isMissingOnboardingSchemaError(error)` / `getMissingOnboardingSchemaMessage()` | Onboarding-specific schema gaps |

`lib/auth.ts` → `getAuthErrorMessage(error)` maps Supabase auth failures to user-facing copy.

Standard shape:

```typescript
try {
  const { data, error } = await supabase.from('table').select('*');
  if (error) throw error;
  setData(data);
} catch (error: any) {
  Toast.show({ type: 'error', text1: 'Error', text2: error.message });
} finally {
  setLoading(false);
}
```

Destructive actions must confirm first, and confirmation is **platform-split** — `window.confirm` on web, `Alert.alert` on native (native `Alert` does not render on web).

---

## 14. Storage and media

Images go to **Cloudinary**, not Supabase Storage.

`lib/cloudinary.ts` → `uploadToCloudinary(...)` performs an unsigned upload to `https://api.cloudinary.com/v1_1/{cloud}/image/upload`, configured by `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` and `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET`. Picking is handled by `expo-image-picker` behind the shared `components/ImageUploader.tsx`.

Used by: `mcn_listings.image_url`, `mcn_products.image_url`, `mcn_preorder_drops.image_url`, `mcn_preorder_items.image_url`, `event_transactions.image_url`, `community_requests.proof_photo_url`.

**Never render a stored `secure_url` directly.** The upload preset keeps the original at full camera resolution, so a raw URL ships a multi-megabyte image into a 40 px thumbnail. Wrap every `<Image source={{ uri }}>` in `cloudinaryUrl(url, transform?)` from `lib/cloudinary.ts`, which injects a delivery transformation after `/image/upload/`. Defaults are `w_800,c_scale,q_auto,f_auto` (plus `dpr_auto` on web only — native doesn't send the client hints Cloudinary reads) — 800 px wide, no cropping, auto quality, and auto format (AVIF/WebP where the client accepts it, JPEG otherwise). Pass `{ width, height, crop: 'fill' }` for fixed-size thumbnails. The helper is idempotent and returns non-Cloudinary URLs (local `file://` picker previews, Google OAuth avatars) untouched, so it is safe to apply unconditionally. `components/ImageUploader.tsx`'s picker asks for JPEG quality `0.7` — the incoming upload preset and delivery `q_auto` both recompress anyway, so a higher client-side quality only costs the resident's mobile data.

**No profile-photo upload** — removed 2026-08-13 to save space on the Profile tab and Edit Profile (see `docs/features.md` §7). `profiles.avatar_url` is still read everywhere a person renders (`components/Avatar.tsx`, falling back to deterministic initials tinted by `lib/avatarTint.ts`) and still round-trips unchanged through every profile save, so a Google OAuth photo already on the row keeps showing — there is just no in-app way to set or change one anymore.

The Supabase `community-uploads` bucket still exists but **no screen writes to it**.

**Sharing / link previews** — every in-app share (food drops, business listings, provider contacts, visits, carpools, community invites) builds its message text itself, then hands off to `shareOrCopy({ title, message })` from `lib/share.ts` — never call `Share.share` directly. `Share.share` rejects on desktop web when `navigator.share` is absent; `shareOrCopy` branches on `Platform.OS === 'web' && navigator.share`, falls back to `expo-clipboard` with a "Link copied" toast on web without it, and swallows a user-dismissed share sheet without an error toast. Three Vercel serverless functions (`api/share-drop.ts`, `api/share-listing.ts`, `api/share-community.ts`, sharing helpers from `api/_og.ts`) exist because the web build is a client-rendered SPA with no per-page `<meta>` tags — a bare app URL has nothing for WhatsApp/Facebook/etc.'s crawler to read, so shared links route through these endpoints instead, which detect the crawler by user-agent, serve real `og:*` tags (image forced through `ogImageUrl()` to a 1200×630 JPEG crop — WhatsApp silently drops an untransformed multi-MB original), and redirect everyone else straight into the app.

Bundled assets live in `assets/images/`. Keep import extensions matched to the real file type: the Community tab funds background is `funds_bg.jpg`, and importing it as `.png` breaks Android release resource compilation.

---

## 15. Web and PWA architecture

1. **Viewport height** — `app/+html.tsx` sets `html`, `body`, `#root` to `height: 100%` and `#root` to `display: flex`. `100vh` is unreliable with dynamic browser chrome and lets the tab bar scroll off-screen.
2. **Focus outlines** — `input:focus, textarea:focus, select:focus { outline: none; }` in `app/+html.tsx`.
3. **Safe insets** — web forces `insets.bottom = 0` in `app/(tabs)/_layout.tsx`.
4. **Pull-to-refresh** — `RefreshControl` is native-only and fixed body height disables the browser's own gesture, so lists use `components/useWebPullToRefresh.ts` plus `WebPullIndicator`.
5. **Service worker** — registration checks `document.readyState` for `complete`/`interactive` so it still runs when the bundle loads after the load event.
6. **Desktop frame** — `WebDesktopFrame` constrains the app to a phone-shaped frame on wide viewports.
7. **Platform-specific components** — `.web.tsx` siblings exist for `AppIcon`, `EmojiRating`, `HeaderBackButton`, `NetworkTileIcon`, `SchoolAspectIcon`, `SchoolRadarChart`, `ScoreSentimentIcon`, `MotionWrapper`.
8. **Routing/deploy** — `vercel.json` rewrites `/` → `landing.html`, `/admin*` → the console, everything else → SPA `index.html`. `npm run build` runs `expo export --platform web` then `node build-admin.js` to copy `admin-dashboard/` into `dist/admin` and `public/admin`.

---

## 16. Cross-community federation (backend only)

Schema, helper predicates, and RPCs are live in Postgres; **no screen calls them**. RLS additions are strictly additive — new permissive `SELECT` policies that union with existing ones, so single-community behavior is unchanged.

- Schema: [`cross-community.md`](cross-community.md) §4
- Helpers: [`cross-community.md`](cross-community.md) §5
- Additive-RLS rationale: [`decisions/0001-additive-rls-for-cross-community.md`](decisions/0001-additive-rls-for-cross-community.md)

Any change touching federation objects **must** append an entry to [`cross-community-changelog.md`](cross-community-changelog.md) in the same change set.
