# Society Service Hub - Application Summary

> **Purpose**: Single-source overview for AI agents and maintainers working in this repository.

---

## 1. What This App Is

Society Service Hub is a multi-tenant community management app for gated residential communities. The current product helps residents and admins:

- discover trusted local service providers
- coordinate shared service visits
- run a local business directory and social sharing surface (My Community Network)
- manage community funds with transparent role-based ledgers
- track personal maintenance reminders for appliances and recurring services
- access emergency contacts and blood donor registries (SOS)
- handle community onboarding and platform-reviewed community creation
- receive realtime notifications about visits, onboarding outcomes, and due services

The app targets iOS, Android, and Web from one Expo codebase. The web app is a fully installable PWA with offline capabilities.

---

## 2. Technology Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Expo SDK 54 / React Native 0.81 | Dev client setup, typed routes enabled |
| Language | TypeScript | Strict mode |
| Routing | `expo-router` | File-based routing |
| Backend | Supabase | PostgreSQL, Auth, Realtime, RPCs, Edge Functions |
| State | React Context | `AuthContext` and `NotificationContext` |
| Notifications | `expo-notifications` | Local mobile alerts and Expo token registration |
| Auth | Supabase Auth + Google Sign-In | Email/password, reset password, Google token exchange |
| UI Design System | Verandah | Light-mode-only, flat surfaces, no shadows, Verandah tokens |
| Image Upload | Cloudinary | Unsigned HTTP upload for listing/product images |

### Key Dependencies

- `@supabase/supabase-js`
- `@react-native-google-signin/google-signin`
- `@react-native-community/datetimepicker`
- `expo-linear-gradient`
- `expo-notifications`
- `expo-image-picker`
- `react-native-toast-message`
- `@expo/vector-icons`

---

## 3. Active Route Surface

### Root-level screens

- `/login`
- `/forgot-password`
- `/community-select`
- `/community-request`
- `/community-request-submitted`
- `/community-join-block`
- `/notifications`
- `/residents`
- `/admin-redirect`

### Main tabs (`app/(tabs)`) — 5 tabs

- `index.tsx`: Help dashboard with Providers (two-level category group filters) and Visits (grouped by category, split into Upcoming, Recent, and Archived) segments. Uses compact WhatsApp chat-tile inspired UI density.
- `favorites.tsx`: Saved providers
- `network.tsx`: MCN (My Community Network) — business directory with listings, offerings, orders; plus borrow & share social posts
- `community.tsx`: Community tab with funds status (activation CTA, pending request, rejected, or active overview), residents shortcut, SOS shortcut, and community info
- `profile.tsx`: Personal hub for identity, reminders shortcut, recent service history, my orders, my posts, and sign-out

### Feature route groups

- `/provider/[id]`, `/provider/add`
- `/visits/[id]`, `/visits/add`
- `/funds/[id]`, `/funds/add`, `/funds/add-transaction`
- `/funds-access/request`
- `/community-join-block`, `/community/blocks`
- `/hire-feedback/[hireId]`
- `/services`, `/services/add`, `/services/[id]`
- `/profile/edit`
- `/sos`, `/sos/donor`, `/sos/manage-contacts`
- `/network/add`, `/network/my-posts`, `/network/my-orders`
- `/network/listing-add`, `/network/listing/[id]`, `/network/listing/manage/[id]`, `/network/listing/orders/[id]`

### Removed route area

The former marketplace routes under `app/business/*` do not exist in the current app.

---

## 4. Boot Flow and Routing Rules

### Startup

1. Root layout configures Google Sign-In
2. `AuthProvider` loads session and profile
3. `NotificationProvider` attaches notification state for authenticated users
4. Root redirect logic routes users into onboarding, platform admin, or main app areas

### Redirect Rules

```text
No session -> /login
Platform admin -> /admin-redirect
Authenticated, no community, active request -> /community-request-submitted
Authenticated, no community, no request -> /community-select
Authenticated with community -> /(tabs)
```

---

## 5. Core Feature Areas

### Providers and Visits

- Residents can add providers to the trusted provider list
- Provider categories include Photography and Decoration (with category-specific detail fields) alongside the full list of community service types
- The provider filter uses a two-level grouped navigation: a group row (All Services, Home Support, Repairs & Maintenance, Healthcare & Wellness, Personal Care, Transport & Vehicle Care, Events & Occasions, Education & Coaching, Government & Docs, Other) followed by a category chip row that shows only categories within the selected group
- Residents can rate, save, call, message, and share provider contacts
- Existing ratings can be reused when updating review text without re-tapping stars
- Residents can create shared service visits and manage participation; visit categories also include Photography and Decoration
- Only the creator can move a visit between status values and reschedule an upcoming visit; rescheduling updates the date/time and emits a `visit_rescheduled` community notification to other residents
- Visit joiners can reuse their saved flat number in the join modal and edited flat numbers are formatted to uppercase without spaces or hyphens on blur
- Recent (Past) and Archived visits are shown without an `upcoming` status badge even when stale visit status values exist
- The Help tab preserves segment and visit-subtab state through route params
- Provider and visit search inputs are debounced (300 ms) to avoid query-per-keystroke on Supabase
- Service Visits are displayed grouped by category (SectionList) instead of a horizontal filter strip; each section header shows the category emoji (via `getServiceCategoryEmoji`), name, and a visit count badge; sections are sorted by count (busiest first) and empty categories are hidden automatically
- Category emojis are shared between the Providers `CategoryFilter` and the Service Visits section headers via the same `getServiceCategoryEmoji` helper
- Residents can report service providers for predefined reasons (Wrong info, Spam, etc.) which notifications alert community leads; community leads and platform admins can delete providers
- Residents can add private personal notes to provider profiles, which are visible only to the resident who wrote them
- **Compact UI**: The entire Help screen uses a WhatsApp chat-tile inspired information density. Provider cards are single-row horizontal tiles (avatar · name · inline meta · bookmark). Visit cards use reduced padding and smaller avatars. Search bars are 36px tall, category chips have compact padding, and the header uses a reduced title size.

### My Community Network (MCN)

- Dedicated MCN tab (3rd tab, "MCN" label) for local business directory and social sharing
- Business listings are community-scoped and searchable with category-based filtering via `mcn_business_categories`
- Listings include cover photos uploaded to Cloudinary, business category badges, and owner information
- Offering details support products and services with optional pricing (nullable price = "Price on request")
- Residents can place, update, and cancel orders against business listings
- Owners can manage listings (toggle active/paused, add/edit/delete products/services, view/manage orders)
- Borrow & Share posts allow lightweight social sharing for borrowing/free items
- Community leads can moderate (delete) any post or remove any listing

### SOS & Emergency

- Emergency directory with community-specific and global default emergency numbers
- Blood donor registry with opt-in profiles, availability toggles, and blood group filtering
- Call-confirm dialogs prevent accidental dialing
- Community leads manage emergency contacts; platform admins can manage global entries

### Funds

- Community funds live in `events`
- Treasurers and collectors are assigned through `fund_roles`
- Ledger rows live in `event_transactions`
- Existing contributions can be edited by collectors and treasurers
- Community leads can mark funds as 'closed' to block further transactions and edits
- The Community tab funds overview banner uses the bundled JPEG asset `assets/images/funds_bg.jpg`; mismatched static-image extensions can break Android release builds
- The intended product rule is community-lead-administered funds, though some fund code still tolerates a legacy `community_admin` string internally

### Onboarding and Platform Review

- Residents can join communities instantly by code
- New communities require a platform approval workflow
- Approvals create the community and assign the requester to that community as `resident`
- Email sign-up requires a flat number; the value is normalized before signup and stored in `profiles.flat_number` via the auth trigger
- Community-request flat or house numbers are formatted in uppercase and strip spaces and hyphens on blur for cleaner approval records
- Platform admins can seed block/tower names and select the block label (Block or Tower) at community approval time, enabling block support

### Blocks / Towers (Optional)

- Blocks/towers are decoupled from funds activation and are configured per community via a `block_label` (e.g., Block or Tower)
- When blocks are active, residents are required to select their block and enter their flat number during onboarding (`/community-join-block`) or via their profile
- Community leads can enable/disable block scoping, manage active blocks, or archive blocks (with automatic restoration on re-adding archived names) via `/community/blocks`
- Contribution logs and collector assignments can be block-scoped, restricting block in-charges to their assigned block residents

### Hire Feedback & Public Nudges

- Contacting a provider schedules a local 24-hour reminder to collect private hire feedback (`positive`, `negative`, or `skipped`)
- Recording positive feedback can prompt a one-time rating nudge to encourage residents to submit public reviews on the provider's profile

### Personal Service Reminders

- Users can maintain private reminders in `user_services`
- Reminder detail/edit screens read by reminder ID from `user_services` for reliable single-record edits
- Reminders can be mapped or remapped to any provider shown in the saved provider picker list, with picker search by provider name or phone number
- Home and Profile both surface due-soon reminders
- Due reminders generate `service_reminder` notifications through the daily scheduler flow

### Profile & Directory

- Residents can edit their full name and email address. Email updates require verification.
- The residents directory displays residents grouped by block when `blocks_enabled` is true, along with email addresses and conditionally visible phone numbers.

### Cross-Community Federation (Backend Active, UI Deferred)

- Cross-community schema, helper predicates, and RPCs are live in Supabase
- Existing app screens do not call cross-community RPCs yet
- Current user-visible behavior remains single-community by default
- Canonical backend reference: `docs/cross-community.md`

---

## 6. Roles

### App roles

| Role | Meaning |
|------|---------|
| `admin` | Platform admin with no community assignment |
| `community_lead` | Lead for a specific community |
| `resident` | Default member |

### Fund roles

| Role | Meaning |
|------|---------|
| `treasurer` | Manage collectors and all ledger actions |
| `collector` | Record contributions only |
| `resident` | View-only fallback |

---

## 7. Active Tables

- `communities`
- `profiles`
- `community_requests`
- `profile_audit_log`
- `service_providers`
- `service_visits`
- `visit_joiners`
- `favorites`
- `ratings`
- `provider_hires`
- `provider_reports`
- `provider_personal_notes`
- `provider_public_rating_nudges`
- `hire_feedback`
- `events`
- `event_transactions`
- `fund_roles`
- `funds_access_requests`
- `funds_access_revocations`
- `community_blocks`
- `notifications`
- `user_services`
- `blood_donors`
- `emergency_contacts`
- `mcn_posts`
- `mcn_listings`
- `mcn_products`
- `mcn_business_categories`
- `mcn_orders`
- `mcn_order_items`
- `community_partnerships` (backend only)
- `community_groups` (backend only)
- `community_group_members` (backend only)
- `provider_shares` (backend only)
- `service_visit_communities` (backend only)
- `community_announcements` (backend only)
- `announcement_audiences` (backend only)

Removed marketplace tables:

- `resident_businesses`
- `business_offerings`
- `business_inquiries`

---

## 8. Notifications

Notification state is managed by `NotificationContext` and backed by Supabase Realtime plus `expo-notifications`.

Live product notification types include:

- `new_visit`
- `visit_rescheduled` (sent when a visit is rescheduled)
- `community_approved`
- `community_rejected`
- `removed_from_community`
- `service_reminder`
- `funds_access_requested`
- `funds_access_approved`
- `funds_access_rejected`
- `community_lead_appointed`
- `funds_access_revoked`

Reserved for cross-community workflows (backend available, no current UI emission path):

- `partnership_request`
- `partnership_accepted`

The notification screen also contains compatibility handling for some older promotion-related payloads.

---

## 9. UI Conventions

- **Verandah design system** is the only active UI language:
  - Colors from `constants/Colors.ts` (`Verandah` palette: surface `#FAF8F4`, card `#FFFFFF`, accent `#0F6E56`, etc.)
  - Typography, spacing, radius from `constants/Verandah.ts`
  - No shadows, elevation, or glassmorphism on cards. Flat surfaces with hairline borders.
  - Font weights capped at 400 and 500. Sentence case only.
- Shared components: `BaseCard`, `Avatar`, `Rupees`, `EmptyState`
- `Ionicons` from `@expo/vector-icons` for interactive icons
- `react-native-toast-message` for success and failure feedback
- Tab icons use `Ionicons` with filled/outline variants for active/inactive states
- The Help tab uses **compact WhatsApp chat-tile inspired density** for provider and visit cards

---

## 10. Storage and Assets

- Cloudinary is used for business listing cover photos and product images via unsigned HTTP upload
- The Supabase setup still includes a public `community-uploads` bucket, but no current screen writes to it
- Profile avatars use deterministic initials via the `Avatar` component (no photo upload)
- The Community tab funds overview background is a bundled JPEG asset at `assets/images/funds_bg.jpg`

---

## 11. Commands

```bash
npm start
npm run web
npm run android
npm run ios
npx tsc --noEmit
npm run db:push
npm run db:link
npx supabase gen types typescript --project-id mbzvcaoulawdugfearmj
```

---

## 12. Current Product Boundaries

- The former marketplace is removed, not hidden. Replaced by MCN (My Community Network) business directory.
- Community membership does not use a resident approval queue
- `user_services` is user-scoped, not community-scoped
- Platform admins are separated from community members by the `admin` plus no-community rule; they are redirected to `/admin-redirect` in the mobile app
- Cross-community UI is deferred even though backend federation objects are active
