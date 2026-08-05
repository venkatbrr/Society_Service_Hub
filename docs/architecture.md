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
`mcn_preorder_drops` and its item/order children, plus the host `profiles` row behind a drop (migrations `20260802010000`, `20260805000000`).

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
  myFundsAccessRequest: { id, status, rejection_reason, decided_at } | null
  activeCommunityRequest: { id, status, created_at, name } | null
  isLoading: boolean
  refreshSession: () => Promise<void>
  signOut: () => Promise<void>
}
```

Behaviors worth knowing before you touch this file:

- **Two-phase load.** `loadProfile()` sets profile/community/`isLoading=false` first, then fires a non-blocking `Promise.all` for community settings (`funds_enabled`, `blocks_enabled`, `block_label`) and `get_funds_access_status()`. Screens can therefore render before `fundsEnabled` settles — never assume it is final on first paint.
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

Enum values: `admin` · `community_admin` *(legacy)* · `resident` · `community_lead` *(legacy)* · `president` · `vice_president`

Migration `20260616000001_migrate_roles_and_functions.sql` moved every `community_lead` and `community_admin` row to `president` and redefined `public.is_community_lead()` to test for `president` or `vice_president`. The legacy values remain in the enum only because Postgres enum values cannot be dropped.

```typescript
isPlatformAdmin = appRole === 'admin'                              // or hardcoded platform-admin email
isCommunityLead = (appRole === 'president' || appRole === 'vice_president') && !!communityId
```

> **Do not write `app_role === 'community_lead'`.** Use `isCommunityLead` from `useAuth()` in TypeScript and `public.is_community_lead(auth.uid())` in SQL. President and vice-president have identical permissions; the distinction is presentational only.

Constraints: `admin` must have `community_id = NULL`. `president`/`vice_president` are only meaningful where `communities.funds_enabled = true` — funds activation is what promotes a resident to `president`.

### Fund roles — `fund_roles.role`

Per fund, independent of app role: `treasurer` (max 1, min 1) · `collector` (max 6, optionally block-scoped via `block_id`) · `resident` (implicit view-only fallback).

Resolution goes through `lib/fundRoles.ts` — see §12. `is_funds_enabled(community_id)` gates every funds RPC and trigger.

---

## 4. Database schema

Regenerate types after any change: `npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj`

### 4.1 Tenancy and identity

| Table | Key columns | Scope |
|-------|-------------|-------|
| `communities` | `name`, `code` (6-char join code), `funds_enabled`, `blocks_enabled`, `block_label`, `city`, `area`, `pincode`, `address`, `community_type`, `approximate_units` | Community |
| `profiles` | `id` (= `auth.users.id`), `full_name`, `email`, `phone_number`, `flat_number`, `app_role`, `community_id`, `block_id`, `avatar_url`, `expo_push_token`, `removed_at`, `removed_by` | Self / community |
| `community_requests` | `name`, `city`, `pincode`, `area`, `address`, `community_type`, `approximate_units`, `requester_flat_number`, `proof_photo_url`, `requested_by`, `status`, `rejection_reason`, `reviewed_by`, `reviewed_at`, `resulting_community_id` | Requester / platform |
| `community_blocks` | `community_id`, `name`, `archived_at` | Community |
| `profile_audit_log` | Audit trail for profile mutations | Platform |

### 4.2 Providers and trust

| Table | Key columns | Scope |
|-------|-------------|-------|
| `service_providers` | `name`, `phone`, `category`, `description`, `details` (JSONB, category-specific), `flat_block`, `avg_rating`, `rating_count`, `is_verified`, `is_trending`, `fraud_status`, `visibility`, `shared_by_community_id`, `created_by` | Community |
| `favorites` | Saved providers | User |
| `ratings` | 1–5 rating + review text, one per user/provider | Community read, owner write |
| `provider_hires` | Contact/hire log; drives the 24 h feedback reminder | Community |
| `provider_reports` | `reason`, `details`, `reported_by`, `status`, `reviewed_by` — one report per user/provider | Community |
| `provider_personal_notes` | Private per-resident note, one per user/provider pair | **User** |
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
| `event_transactions` | `event_id`, `type` (`income`/`expense`), `amount`, `title`, `description`, `category`, `contributor_user_id` (income only), `image_url` |
| `fund_roles` | `event_id`, `user_id`, `role`, `block_id` (nullable = whole community), `assigned_by` |
| `funds_access_requests` | `community_id`, `requested_by`, `contact_name`, `contact_phone`, `purpose`, `designated_lead_id`, `status`, `rejection_reason`, `decided_by`, `decided_at` |
| `funds_access_revocations` | Platform-admin revocation audit trail |

### 4.5 MCN — business directory

| Table | Key columns |
|-------|-------------|
| `mcn_business_categories` | `name`, `emoji`, `sort_order` — global lookup |
| `mcn_listings` | `name`, `description`, `contact_phone`, `image_url` (Cloudinary), `category_id`, `owner_id`, `is_active` |
| `mcn_products` | `listing_id`, `name`, `description`, `unit`, `price` (**nullable** = "Price on request"), `item_type` (`product`/`service`), `image_url`, `is_available`, `sort_order` |
| `mcn_orders` | `listing_id`, `buyer_id`, `buyer_phone`, `buyer_note`, `status` (`pending`/`fulfilled`/`cancelled`) |
| `mcn_order_items` | `order_id`, `product_id`, `quantity`, `unit_price` |

### 4.6 MCN — pre-order food drops

| Table | Key columns |
|-------|-------------|
| `mcn_preorder_drops` | `title`, `description`, `image_url`, `listing_id` (nullable), `created_by`, `fulfillment_date`, `fulfillment_time`, `cutoff_at`, `max_orders`, `status` (`open`/`closed`/`completed`/`cancelled`) |
| `mcn_preorder_items` | `drop_id`, `name`, `description`, `unit` (`piece`/`kg`/`box`/`pack`/`portion`/`litre`), `price`, `max_quantity`, `image_url` |
| `mcn_preorder_orders` | `drop_id`, `buyer_id`, `buyer_name`, `buyer_phone`, `flat_number`, `buyer_note`, `total_amount`, `status` (`confirmed`/`fulfilled`/`cancelled`) |
| `mcn_preorder_order_items` | `order_id`, `item_id`, `item_name`, `quantity` (numeric — supports 0.5), `unit_price` |

Per-item capacity is enforced server-side by `check_mcn_drop_item_capacity()` plus a trigger (migrations `20260803000000`, `20260804000000`), not only in the UI.

### 4.7 MCN — carpools

| Table | Key columns |
|-------|-------------|
| `mcn_carpools` | `title`, `role_type` (`offering`/`seeking`), `start_point`, `end_point`, `departure_time`, `return_time`, `recurring_days` (`TEXT[]`), `available_seats`, `vehicle_info`, `pricing_type` (`free`/`paid`), `price_per_seat`, `contact_phone`, `notes`, `status` (`active`/`paused`/`cancelled`/`completed`) |
| `mcn_carpool_requests` | `carpool_id`, `rider_id`, `rider_name`, `rider_phone`, `flat_number`, `seats_requested`, `note`, `status` (`pending`/`accepted`/`rejected`/`cancelled`) |

### 4.8 MCN — parents, schools, social

| Table | Key columns |
|-------|-------------|
| `mcn_parent_corner` | `student_name`, `institution_type` (`school`/`college`/`preschool`), `school_name`, `board`, `grade_class`, `parent_name`, `flat_number`, `contact_phone`, `notes` |
| `schools` | `name`, `level`, `syllabus`, `distance`, `fee_range`, `facilities` (`TEXT[]`), `area_locality`, `address`, `contact_phone`, `website`, `google_maps_link`, `google_rating`, plus trigger-maintained `avg_academics`, `avg_teachers`, `avg_infrastructure`, `avg_sports_activities`, `avg_safety`, `avg_transport`, `avg_value`, `avg_happiness`, `review_count` |
| `school_reviews` | `school_id` (accepts text IDs for curated schools), `child_grade`, eight `*_score` columns, eight optional `*_comment` columns, `overall_comment` |
| `mcn_posts` | `kind` (`business`/`borrow`), `title`, `description`, `contact_hint`, `is_available` |

### 4.9 Reminders, SOS, messaging

| Table | Key columns | Scope |
|-------|-------------|-------|
| `user_services` | `service_name`, `category`, `last_serviced_on`, `frequency_months`, `next_due_on` (computed), `notified_at`, `provider_id`, `notes` | **User** |
| `user_service_history` | `service_id`, `serviced_on`, `provider_id`, `provider_name_snapshot`, `cost_paid`, `note` | **User** |
| `blood_donors` | `blood_group`, `contact_phone`, `is_available`, `note` — one per user per community | Community |
| `emergency_contacts` | `name`, `phone`, `category`, `description`, `is_active`, `sort_order`; `community_id IS NULL` = global default | Community + global |
| `notifications` | `user_id`, `type`, `title`, `body`, `data` (JSONB), `is_read` | **User** |

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

`is_admin(p_user_id?)` · `is_platform_admin(p_user_id?)` · `is_community_lead(p_user_id?)` *(president or vice_president, `removed_at IS NULL`)* · `is_user_approved(p_user_id?)` · `is_funds_enabled(p_community_id)` · `is_blocks_enabled(p_community_id)` · `get_user_community_id()` · `get_my_block_id()`

### Providers and visits

`get_community_visits(...)` · `get_visit_joiners(p_visit_id)` · `auto_complete_past_visits()` · `platform_get_all_providers(...)` · `platform_get_provider_details(...)` · `platform_get_providers_by_category(...)` · `platform_delete_service_provider(...)`

### Hire feedback and reminders

`record_hire_feedback(p_hire_id, p_signal, p_note?)` · `get_my_provider_history(p_provider_id)` · `should_show_public_rating_nudge(p_provider_id)` · `mark_public_rating_nudge(p_provider_id, p_outcome)` · `get_my_upcoming_services()` · `get_my_due_soon_count()` · `mark_service_done(p_service_id, p_provider_id?, p_cost_paid?, p_note?)` · `get_service_history(p_service_id)` · `get_my_recent_service_history(p_limit)` · `notify_due_services()`

### Funds and blocks

`get_fund_role(p_event_id, p_user_id)` · `get_my_community_funds_overview()` · `set_fund_closed(p_event_id, p_is_closed)` · `delete_community_fund(...)` · `submit_funds_access_request(...)` · `withdraw_funds_access_request(...)` · `get_funds_access_status(p_community_id)` · `list_eligible_contributors_for_collector(...)` · `list_community_blocks(...)` · `set_community_blocks_enabled(...)` · `add_community_block(...)` · `rename_community_block(...)` · `archive_community_block(...)` · `set_resident_block(...)` · `set_my_block(...)` · `assign_block_in_charge(...)` · `remove_block_in_charge(...)`

### Community aggregates

`get_community_insights(...)` · `get_community_pulse(p_limit)` · `get_all_communities()`

### MCN

`check_mcn_drop_item_capacity(...)` — validates remaining capacity for a drop item before an order is accepted.

### Platform admin console

`platform_get_community_dashboard(...)` · `platform_get_community_funds(...)` · `platform_get_community_businesses(...)` · `platform_get_community_preorders(...)` · `platform_get_resident_details(...)` · `platform_approve_funds_access_request(p_request_id, p_lead_user_id)` · `platform_reject_funds_access_request(...)` · `platform_revoke_funds_access(...)` · `platform_set_community_lead(...)` · `platform_remove_community_lead(...)` · `platform_set_blocks_enabled(...)` · `platform_set_block_label(...)` · `platform_add_community_block(...)` · `platform_archive_community_block(...)` · `platform_assign_block_in_charge(...)` · `platform_remove_block_in_charge(...)`

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
| `event_transaction_guard` | `event_transactions` | INS/UPD | Funds-enabled gate, block-scope check for block in-charges |
| `profile_block_guard` | `profiles` | BEFORE INS/UPD | `block_id` must belong to the same community |
| `fund_role_block_guard` | `fund_roles` | BEFORE INS/UPD | `block_id` must belong to the fund's community |
| school-review aggregate trigger | `school_reviews` | INS/UPD/DEL | Recompute `schools.avg_*` and `review_count` |
| drop item capacity trigger | `mcn_preorder_order_items` | BEFORE INSERT | Reject orders exceeding `mcn_preorder_items.max_quantity` |
| `*_updated_at` triggers | `provider_personal_notes`, `blood_donors`, `emergency_contacts`, `mcn_carpools`, `mcn_carpool_requests`, `mcn_parent_corner`, and other MCN tables | BEFORE UPDATE | Refresh `updated_at` |

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
| `mcn_parent_corner`, `mcn_posts` | Community read; owner or lead writes |
| `schools`, `school_reviews` | Community read; author writes own review |

**Uniform MCN delete rule** (migration `20260814000000_mcn_deletion_permissions.sql`): `mcn_preorder_drops`, `mcn_listings`, `mcn_carpools`, `mcn_parent_corner`, and `mcn_posts` all allow DELETE when
`owner = auth.uid() OR public.is_community_lead(auth.uid()) OR public.is_admin(auth.uid())`.

Pending or removed users are blocked from community content even when a stale `community_id` remains on the profile.

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

**Live types**: `new_visit` · `visit_rescheduled` · `community_approved` · `community_rejected` · `removed_from_community` · `service_reminder` · `funds_access_requested` · `funds_access_approved` · `funds_access_rejected` · `community_lead_appointed` · `funds_access_revoked`

**Reserved (federation, unemitted)**: `partnership_request` · `partnership_accepted`

**Legacy, still routed defensively**: `new_community_request` · `new_promotion_request` · `promoted_to_admin` · `promotion_approved` · `promotion_rejected`

Hire feedback does **not** use a table row: it is a purely local `expo-notifications` schedule 24 h after a `provider_hires` insert, deep-linked via `data.kind = 'hire_feedback'` and handled in `app/_layout.tsx`.

Web push is not implemented — see [`archive/pwa-web-push-notifications-plan.md`](archive/pwa-web-push-notifications-plan.md) for the unbuilt design.

---

## 9. Navigation architecture

### Tabs (`app/(tabs)/_layout.tsx`)

Help · Saved · MCN · Community · Profile. `Ionicons` with filled/outline variants. Tab bar height is 70 px on web and `58 + safeAreaBottom` on native; web forces `insets.bottom = 0` so the bar cannot be pushed off-screen.

### Route-collision rule (read before adding any route)

**No two route files may resolve to the same URL pattern.** React Navigation treats this as a hard error — `getStateFromPath` throws *"Found conflicting screens with the same pattern"* — and expo-router only survives it by deleting that guard. The ambiguity does not fail loudly; it silently corrupts browser history at the boundary between the colliding subtrees.

This is exactly what broke MCN browser-back. `app/(tabs)/network.tsx` (the hub tab) and the old `app/network/` directory both claimed `/network`. Any navigation crossing that boundary — hub → `/network/drops` → a detail screen — lost its middle history entry, so browser-back skipped straight to the hub. Screens that never crossed it (`/network/business` → `/network/listing/:id`) worked fine, which is what made the bug look arbitrary.

**The fix:** the MCN sub-route tree lives at `app/mcn/` → `/mcn/*`, while the hub tab keeps `/network`. A tab screen and a route directory cannot share a name.

> **Known remaining collision:** `app/index.tsx` and `app/(tabs)/index.tsx` both claim `/`. `app/index.tsx` exists only to bounce web visitors to `/landing.html` and native to `/login`. It has not caused a reported bug, but it is the same class of defect. Resolving it means either moving the Help tab off `/` or handling the landing redirect outside the router — a product decision, not a mechanical fix.

To check for collisions after adding routes, build the linking config and run `getStateFromPath` over your new URLs; a collision throws with both conflicting screen names.

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

- `getImmediateParentRoute(path)` — maps every `/mcn/*` route (plus `/services/*`) to its logical parent, e.g. `/mcn/drops/manage/:id` → `/mcn/drops/:id` → `/mcn/drops` → `/network`. Accepts an optional query string because a few parents are context-dependent: `/mcn/schools/review?schoolId=X` → that school, and `/mcn/add?source=my-posts` → My Submissions.
- `goBackSmart(router, path)` — what header back buttons call. Pops with `router.back()` when the previous tracked route already **is** the logical parent (the common case, keeping history and forward in sync); otherwise falls back to `router.replace(parent)` for a cross-branch jump or a deep-link entry with nothing to pop.
- `normalizeRoute(route)` — canonical form for comparisons: strips query, hash, trailing slash, and expo-router group segments so `/(tabs)/network` and `/network` compare equal.
- `getPreviousRoute()` — the previous entry in the tracked stack.
- `useSyncedBackNavigation()` — runs in the root layout. Maintains the tracked stack and adds **one** Android guard: when `canGoBack()` is false (deep link into a nested screen), hardware back walks up the hierarchy instead of exiting the app. It deliberately does **not** listen to `popstate`.

**Tracked stack** — a `sessionStorage` array (in-memory on native), capped at 25 entries, reconciled on every pathname change by a **truncate-or-push** rule: if the route is already in the stack the user moved back, so truncate to that index; otherwise push. This self-heals. The earlier implementation pushed unconditionally, so back navigations *grew* the stack and its contents stopped matching real history after the first back press.

**When you add a `/mcn/*` route, add its parent mapping to `getImmediateParentRoute()`**, or back navigation falls through to the MCN hub.

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

`lib/database.types.ts` is generated — **never hand-edit it**. It exports `Tables<T>`, `InsertTables<T>`, `UpdateTables<T>`, `Enums<T>`, plus a few enriched app types (`ProviderWithInteraction`, `VisitWithJoinerData`).

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
getRestrictionHint(role)
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

The Supabase `community-uploads` bucket still exists but **no screen writes to it**. Profile avatars are deterministic initials via `components/Avatar.tsx` + `lib/avatarTint.ts` — there is no avatar upload.

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
