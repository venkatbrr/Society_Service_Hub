# Cross-Community Pre-order Food — implementation plan

**Status: proposal, not started.** Nothing in here is built. The federation
backend it builds on *is* live (see [cross-community.md](../cross-community.md)).

---

## 0. What is already true (verified against the code, not the docs)

| Fact | Where |
|------|-------|
| The federation backend is live and typed: `community_partnerships`, `community_groups`, `get_user_partner_community_ids(capability, user)`, `list_partner_communities()`, the partnership lifecycle RPCs. Zero rows, zero UI. | `20260507000000_cross_community_foundation.sql`, `lib/database.types.ts` |
| `visibility` on federated tables is **TEXT + CHECK**, not a PG enum — `('community','partners','group','public')`. Mirror that; do not invent an enum. | foundation migration L107, L195 |
| **`mcn_preorder_drops` SELECT is already `USING (true)`.** Reads are wide open to everyone including `anon`. | `20260802010000_allow_public_food_drop_read.sql` |
| Community scoping for drops is therefore **client-side only** — `.eq('community_id', communityId)`. Logged out, `communityId` is null, so an anonymous browser already sees every society's open drops. | `app/mcn/drops/index.tsx:230-233` |
| Order placement is **RPC-only**. Direct INSERT is revoked on both order tables, so the `mcn_preorder_orders_insert` RLS policy is moot. | `20260826000000_preorder_orders_rpc_only.sql` |
| The *only* thing blocking a cross-community order today is one `IF NOT EXISTS` inside `place_mcn_preorder` checking `p.community_id = v_drop.community_id`. | `20260824000000_atomic_preorder_placement.sql` |
| `mcn_preorder_orders.community_id` is the **drop's** community, not the buyer's — the RPC stamps it from `v_drop.community_id`. | same file |
| OG-card RPCs are `SECURITY DEFINER` and granted to `anon`, so tightening the anon SELECT policy will **not** break link previews. | `20260906000000_og_card_rpcs.sql` |
| Feature flags today are **compile-time constants**, not data. There is no flag table and no admin toggle for them. | `constants/featureFlags.ts` |
| The admin console already has a working per-community toggle pattern: a checkbox → `platform_set_blocks_enabled` RPC → reload. | `admin-dashboard/js/communities.js:566,1187` |

Two consequences worth naming up front:

1. **The read path is not the hard part.** It is already open. The work is
   making that openness *deliberate, scoped and revocable* — and the plan
   below actually *narrows* the anonymous surface on the way past.
2. **The write path is one function.** Cross-community ordering is a change to
   `place_mcn_preorder` and nothing else. There is no second gate to find.

---

## 1. The admin switchboard (build this first)

You asked for a button per feature. Flags need to become **data**, because
`constants/featureFlags.ts` requires a rebuild and redeploy to flip — that is
not a switch an admin can throw.

Two layers, and a feature is live only when **both** are true:

| Layer | Who controls it | Where it lives | Answers |
|-------|-----------------|----------------|---------|
| **Platform flag** | Platform admin, admin console | new `platform_feature_flags` table | "Is this feature turned on for the product at all?" |
| **Partnership capability** | Community lead of each side | existing `community_partnerships.scope` JSON | "Have these two societies agreed to share *this* thing?" |

This is deliberately not one layer. The platform flag is a **kill switch** —
one click collapses every society back to home-community behaviour without
touching a single partnership row, so a rollback is not a data migration. The
capability is **consent** — a lead must still opt their society in, and can
revoke without waiting for you.

### 1.1 Schema

```sql
CREATE TABLE public.platform_feature_flags (
  key         TEXT PRIMARY KEY,
  enabled     BOOLEAN NOT NULL DEFAULT false,
  label       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;

-- Readable by everyone including anon: the drops catalog is anon-browsable,
-- so a logged-out visitor must be able to resolve the flag too.
CREATE POLICY platform_feature_flags_select
  ON public.platform_feature_flags FOR SELECT USING (true);

-- Writes only ever go through the RPC.
CREATE POLICY platform_feature_flags_no_write
  ON public.platform_feature_flags FOR ALL USING (false) WITH CHECK (false);
```

Seed rows (all `false`):

`cross_community_partnerships` · `cross_community_providers` ·
`cross_community_business` · `cross_community_preorders` ·
`cross_community_carpools` · `cross_community_events` ·
`cross_community_announcements`

### 1.2 Functions

```sql
public.is_feature_enabled(p_key TEXT) RETURNS BOOLEAN
  -- STABLE, SECURITY DEFINER. Unknown key => false. Fails closed.

public.platform_set_feature_flag(p_key TEXT, p_enabled BOOLEAN) RETURNS VOID
  -- SECURITY DEFINER. Raises unless is_platform_admin(auth.uid()).
  -- Stamps updated_by / updated_at.

public.list_feature_flags() RETURNS SETOF platform_feature_flags
  -- granted to anon, authenticated.
```

`is_feature_enabled` returning `false` for an unknown key is the important
detail: a migration that adds a flag can land before the row does, and a
half-deployed flag must mean "off", never "on".

### 1.3 Admin console

New `#features` route in `admin-dashboard/js/router.js`, a `features.js`
module, and a nav entry. One card per flag: label, description, last-changed
by/when, and a toggle wired exactly like `blocks-enabled-toggle` — optimistic
flip, `platform_set_feature_flag`, revert the checkbox on error. Group the
cross-community flags under one heading with a short warning that turning one
off hides content residents may already have ordered from.

### 1.4 App layer

- `AuthContext` gains `featureFlags: Record<string, boolean>` and
  `partnerCommunityIds: string[]`, hydrated in the existing profile-fetch pass
  and cached in `lib/authCache.ts` alongside `fundsEnabled` — same
  "false on first render means *not known yet*" caveat that already applies to
  `fundsEnabled` (`context/AuthContext.tsx:70`).
- `lib/features.ts` exporting `useFeature('cross_community_preorders')`.
- **`constants/featureFlags.ts` stays.** It keeps its current job: parking
  finished UI that is not being offered yet (`SCHOOLS_CATALOG_ENABLED`,
  `DROP_SORT_MOST_ORDERED_ENABLED`). Add a comment to each file saying which
  is which, or they will drift within a month.

---

## 2. Feature A — Cross-community pre-order food

### 2.1 Schema

```sql
ALTER TABLE public.mcn_preorder_drops
  ADD COLUMN IF NOT EXISTS visibility TEXT NOT NULL DEFAULT 'community'
    CHECK (visibility IN ('community','partners','group')),
  ADD COLUMN IF NOT EXISTS fulfillment_mode TEXT NOT NULL DEFAULT 'home_only'
    CHECK (fulfillment_mode IN ('home_only','guest_pickup','host_delivers')),
  ADD COLUMN IF NOT EXISTS guest_fulfillment_note TEXT;

CREATE INDEX IF NOT EXISTS mcn_preorder_drops_visibility_idx
  ON public.mcn_preorder_drops (visibility) WHERE visibility <> 'community';

ALTER TABLE public.mcn_preorder_orders
  ADD COLUMN IF NOT EXISTS buyer_community_id UUID REFERENCES public.communities(id);
UPDATE public.mcn_preorder_orders SET buyer_community_id = community_id
  WHERE buyer_community_id IS NULL;
```

**No `'public'` value for drops.** A drop tile carries the host's real name,
flat number and a callable phone. `public` would put a named neighbour's home
address in front of anyone who can make an account. `partners` and `group`
keep the audience to societies a lead has explicitly agreed with, which is a
list someone is accountable for.

**`buyer_community_id` is additive, not a rename.** `community_id` on the
order stays the drop's community, so every host-side query, revenue rollup and
platform analytic keeps working untouched. The new column answers the only new
question: which society is this buyer from — which is what the packing list
needs.

**`fulfillment_mode` is not optional polish.** Food has to physically cross
between two gated societies. A buyer two societies away who cannot tell
whether to walk over or wait at their own gate will simply not order, and the
host will get a phone call instead. `home_only` is the default and means the
drop never leaves its own society regardless of `visibility`.

### 2.2 Visibility helper

```sql
public.can_user_see_drop(p_drop_id UUID, p_user_id UUID DEFAULT auth.uid())
  RETURNS BOOLEAN
```

Mirrors `can_user_see_provider`: home community always true; otherwise
`visibility IN ('partners','group')` **and** the drop's community is in
`get_user_partner_community_ids('preorders', p_user_id)` **and**
`is_feature_enabled('cross_community_preorders')`. Hidden drops
(`flagged_for_review_at IS NOT NULL`) are never visible cross-community — a
guest society is not where you want a moderation queue leaking.

Add `preorders` to the partnership `scope` shape documented in
`cross-community.md` §4. A missing key means `false`, so existing rows are
unaffected.

### 2.3 RLS — tighten, then widen

This is the one step that *removes* access, and it should land before anything
user-visible does.

```sql
-- Was USING (true) for every role.
DROP POLICY IF EXISTS mcn_preorder_drops_select_public ON public.mcn_preorder_drops;

CREATE POLICY mcn_preorder_drops_select_anon
  ON public.mcn_preorder_drops FOR SELECT TO anon
  USING (status = 'open' AND flagged_for_review_at IS NULL);

CREATE POLICY mcn_preorder_drops_select_cross_community
  ON public.mcn_preorder_drops FOR SELECT TO authenticated
  USING (public.can_user_see_drop(id, auth.uid()));
```

The existing community-scoped `mcn_preorder_drops_select` is left alone.
Permissive policies OR together, so home-community reads — including the
host's Mine tab and a lead's Review tab, which need flagged rows — keep
working through it. Mirror the same narrowing on
`mcn_preorder_items_select_public`.

Net effect: anonymous visitors see exactly what the app already shows them
(`status = 'open'`), authenticated residents lose the ability to read other
societies' drops by hand-editing a query, and partner drops become visible
only through a partnership someone consented to. The OG-card RPCs are
`SECURITY DEFINER`, so previews of closed drops keep working.

### 2.4 Ordering — `place_mcn_preorder`

One block changes. Replace the membership check:

```sql
IF NOT EXISTS (SELECT 1 FROM public.profiles p
               WHERE p.id = v_user AND p.community_id = v_drop.community_id
                 AND p.removed_at IS NULL) THEN
  RAISE EXCEPTION 'You are not a member of this community';
END IF;
```

with: resolve `v_buyer_community` from the caller's profile (still requiring
`removed_at IS NULL`); allow when it equals the drop's community, **or** when
`can_user_see_drop(p_drop_id, v_user)` is true **and**
`v_drop.fulfillment_mode <> 'home_only'`. Then stamp `buyer_community_id` on
insert. Everything downstream — the per-item `max_quantity` sum, the
`max_orders` sum, the `FOR UPDATE` locking — is already global across all
buyers and needs no change.

Keep the error messages distinct. "This menu is only open to residents of
\<society\>" and "This host is not delivering outside \<society\>" are
different problems with different fixes, and a buyer who hits the second one
should be told to go and ask.

### 2.5 Notifications — do not fan out in phase 1

`handle_drop_published` pushes `drop_posted` to every profile in
`NEW.community_id`. **Leave it community-scoped.** Partner drops should appear
in the catalog, not in everyone's notification tray. Two societies of a few
hundred flats each will double a resident's food-drop notifications overnight,
and the `food_drops` mute toggle already exists precisely because that channel
is the noisiest one in the app. Losing the channel to mutes costs more than
cross-community discovery gains.

The transactional notifications are the opposite case and need widening now:
`preorder_received` to the host must name the buyer's society, and the
`drop_hidden_buyer` fan-out must reach buyers in partner communities — a
moderation notice that stops at the border leaves a guest buyer waiting for
food that is not coming.

### 2.6 App changes

| File | Change |
|------|--------|
| `app/mcn/drops/index.tsx` | New **"Nearby"** tab, rendered only when the flag is on and `partnerCommunityIds.length > 0`. On that tab only, `.eq('community_id', communityId)` becomes `.in('community_id', [communityId, ...partnerCommunityIds])`. Every other tab untouched — that is what makes this reversible. |
| — | **Chip-row trap.** The lead's 4-chip row already needed `ChipRowSlider` with `flex: 1` to fit beside the filter/sort pills (`features.md` §4.3). A 5th chip means the row must scroll for leads. Reuse the existing slider; do not lay out a new row. |
| `components/PreorderDropCard.tsx` | "From \<Community\>" pill when `drop.community_id !== communityId`. Build it as the shared cross-community origin badge — providers and business listings will need the identical thing. |
| `app/mcn/drops/[id].tsx` | Fulfilment line in the reserve sheet: "Collect from \<Host society\> gate, 1–3 PM" or "Host delivers to your gate". Without it the buyer does not know how the food arrives, which is the entire difference from the in-society flow. |
| `app/mcn/drops/add.tsx` | New "Who can order?" card — *Just my society* (default) / *My society + partner societies* — plus the fulfilment mode picker and note when partners is chosen. Gate on flag + partners existing. Follow the `add.tsx` house style: its own titled card section, not a sub-label (the meal picker was moved for exactly this reason). |
| `app/mcn/drops/manage/[id].tsx` | Group the packing list by buyer society. |
| `lib/csvExport.ts` | Society column on the host's order export. |
| `app/mcn/my-orders.tsx` | Already `buyer_id`-scoped, so it works unchanged — but the card should name the host's society. |
| `lib/navigation.ts` | No new routes, so `getImmediateParentRoute()` is untouched. Confirm this at the end. |

### 2.7 Moderation across the border

The **home** community's lead owns the drop: hide, restore, `flagged_prev_status`
— all unchanged. A **guest** community's lead has no per-drop control in phase 1;
their lever is revoking the `preorders` capability on the partnership, which
withdraws every partner menu at once.

State that limitation out loud rather than letting it be discovered. If a guest
lead needs to remove one specific drop from their own catalog, that is a phase-2
`drop_community_blocks` table — do not improvise it into phase 1, because
"whose moderation decision wins" is a policy question, not a schema question.

### 2.8 The trust question, which is not a technical one

Pre-orders settle in cash or UPI directly between neighbours. There is no
escrow and no refund path in the app. In-society, that is underwritten by
living in the same building — you know where the host lives. Across the
border, it is not.

Recommended for phase 1, though it is your call:

- Partner-visible drops require the host to have a linked `mcn_listings`
  business, so there is a standing identity behind the menu.
- Show the host's completed-drop count on partner cards.
- Cap partner-visible drops per host per week, reusing the existing open-host
  cap machinery (`20260821000100_food_drop_open_host_cap.sql`).

---

## 3. "Nearby" — proximity without maps

### 3.1 The three things that get conflated

"We are not accessing maps" usually bundles together three separate
capabilities. Only one of them is actually needed:

| | What it is | Cost | Needed? |
|---|---|---|---|
| **Map SDK / tiles** | `react-native-maps`, Google Maps JS — an interactive map on screen | Heavy dep, API key, per-load billing | **No.** Nothing in this feature renders a map. |
| **Device geolocation** | `expo-location`, `navigator.geolocation` — where the *user* is right now | Permission prompt on every resident's device | **No.** See below. |
| **Coordinates** | A lat/lng pair stored against a community | One lookup per community, ever | **Yes.** This is the whole requirement. |

The decisive point: **the unit of proximity here is the society, not the
person.** A society has one location and never moves. So the coordinate is a
property of the `communities` row, captured once at approval, and every
distance calculation afterwards is arithmetic on two numbers already in the
database. No resident is ever asked for location permission, no map component
is ever mounted, and there is no per-query cost.

That is why device geolocation is the wrong tool even though it sounds like
the obvious one. Asking 67 residents for GPS permission to work out something
that is true of the building they live in would be both intrusive and less
accurate than one lookup done properly at onboarding.

### 3.2 Capturing the coordinate — three ways, pick two

A community is created through `platform_approve_community_request`
(`20260418230000_platform_admin_and_promotions.sql:464`), driven from the
admin console's Approvals page (`admin-dashboard/js/approvals.js:303`). That
approval step is the natural capture point: a platform admin is already
looking the society up to verify it is real.

**A — Admin pastes a Google Maps link (recommended primary).** Zero API key,
zero vendor, zero cost, zero new dependency. The admin is on the map anyway
during verification; they paste the share URL into a field on the approval
form and a regex pulls the pair out:

```
https://www.google.com/maps/place/.../@17.4821,78.2891,17z/   →  17.4821, 78.2891
https://www.google.com/maps?q=17.4821,78.2891                 →  17.4821, 78.2891
```

Short `maps.app.goo.gl` links redirect and need one server-side resolve —
`pg_net` is already installed, or use an Edge Function. Accept a raw
`lat, lng` paste too; it costs one extra branch in the regex.

**B — Automatic geocode at approval (recommended fallback).** Address + area +
city + pincode → lat/lng, once per community, in an Edge Function during
approval. Nominatim/OpenStreetMap is free and needs no key (it asks for a
User-Agent and ~1 req/sec, which is irrelevant at one call per community).
Store the result as a *suggestion* the admin can override with A — geocoders
are unreliable on Indian gated-community names, and "IRA Aspiration" will
resolve to something vaguer than the admin pasting the pin.

**C — President confirms from inside the society (optional, later).** The
browser's built-in `navigator.geolocation`, once, from the president's phone
while they are standing in the society. No SDK — it is a web platform API, and
the PWA is the shipping target. Most accurate of the three, but it is one
permission prompt for one person, so treat it as a "confirm this pin" nicety
rather than the capture mechanism.

Build **A + B**. C is a refinement that only pays off once there are enough
communities for a bad pin to matter.

### 3.3 Storage

```sql
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS latitude       NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS longitude      NUMERIC(9,6),
  ADD COLUMN IF NOT EXISTS geo_source     TEXT
    CHECK (geo_source IN ('admin_pin','geocoded','president_gps')),
  ADD COLUMN IF NOT EXISTS geo_updated_at TIMESTAMPTZ;
```

`NUMERIC(9,6)` is ~10 cm of precision — far more than enough, and exact rather
than the drifting `FLOAT` you get from a naive `DOUBLE PRECISION`. Both
columns **nullable**: a community with no coordinate simply never appears as
nearby and never sees anyone as nearby. That fails closed, which is the safe
direction, and it means this can ship before every community is pinned.

`geo_source` earns its place because the three capture paths have genuinely
different trust levels, and when a pin turns out to be wrong the first
question is where it came from.

### 3.4 Distance — plain haversine, no extension

`postgis`, `cube` and `earthdistance` are all **available but not installed**
on this project (verified). Do not install any of them.

At one community — or fifty, or five hundred — a haversine expression over a
sequential scan is microseconds. PostGIS is a large extension to adopt, keep
upgraded and reason about in RLS for a table that will not need a spatial
index for years. Add `earthdistance` + a GiST index the day `communities`
passes a few thousand rows and the query shows up in `pg_stat_statements`;
that day is not close.

```sql
CREATE OR REPLACE FUNCTION public.community_distance_km(p_a UUID, p_b UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT ROUND((6371 * 2 * asin(sqrt(
      power(sin(radians(b.latitude - a.latitude) / 2), 2)
    + cos(radians(a.latitude)) * cos(radians(b.latitude))
    * power(sin(radians(b.longitude - a.longitude) / 2), 2)
  )))::NUMERIC, 2)
  FROM public.communities a, public.communities b
  WHERE a.id = p_a AND b.id = p_b
    AND a.latitude IS NOT NULL AND b.latitude IS NOT NULL;
$$;

-- Discovery: who is close enough to be worth partnering with?
public.get_nearby_communities(p_radius_km NUMERIC DEFAULT 3)
  RETURNS TABLE (community_id UUID, name TEXT, distance_km NUMERIC,
                 resident_count BIGINT, partnership_status TEXT)
```

**Default radius 3 km, and cap it.** This is a number about food, not about
geography: a pre-order has to physically travel between two gated societies,
usually on foot or a two-wheeler, and it is hot when it leaves. A 25 km
"nearby" in Hyderabad traffic is ninety minutes and a cold tiffin. Make the
radius a platform-admin setting so it can be tuned without a deploy, but start
tight — a too-small radius is a feature that looks empty, a too-large one is a
feature that produces angry residents.

### 3.5 The rule that keeps this safe: proximity suggests, partnership grants

Distance must **never** be an access control input. If it were, any society
that onboards within 3 km would automatically gain access to your residents'
menus, host names, flat numbers and phone numbers, with nobody on either side
having agreed to anything.

So:

- **Geo drives discovery and ranking.** `get_nearby_communities()` populates
  the partnerships screen — "3 societies near you" — and sorts partner content
  by distance.
- **`community_partnerships` still drives access**, exactly as designed in §2.
  `can_user_see_drop` does not read latitude at all.

This keeps everything in §2 intact and makes geo purely additive. It also
means a bad pin is a cosmetic bug — a society shows up in the wrong suggestion
list — rather than a data leak.

### 3.6 What this changes in §2

- The catalog tab is no longer called **"Nearby"** on faith. Either label it
  with the actual distance the card shows ("**1.2 km away**" per tile, tab
  reads **Nearby**), or, until coordinates exist, call it **Partner societies**
  — an honest name for a consent-based list. Do not ship the word "Nearby"
  attached to a list that is not sorted by distance.
- `get_nearby_communities` sorts the Nearby tab and the partner-suggestion list.
- The fulfilment line in the reserve sheet (§2.6) can state the distance:
  "Collect from IRA Aspiration — 1.2 km away".

### 3.7 Sequencing, given there is exactly one community

Today the platform has **one** community: IRA Aspiration, Kollur, pincode
502300, 67 residents. Both `community_requests` rows are duplicates of it and
were rejected. So there is nothing to be near, and `get_nearby_communities()`
would return zero rows for everyone.

That does not make this premature — it makes the *capture* urgent and the
*query* patient:

1. **Ship capture now** (§3.2, §3.3). Every community approved from here on
   gets a coordinate at birth. If you skip this and add it in six months, you
   will be hand-pinning however many societies onboarded in between.
2. **Backfill IRA Aspiration by hand** — one row, one paste. Do not let anyone
   guess the coordinate; open the society on a map and take the real pin.
3. **Ship the distance query and the Nearby tab later**, when community #2
   exists and there is something to sort.

Kollur is a good place to be starting from: it is dense with large gated
projects, so community #2 through #10 are likely to be genuinely walkable from
community #1 — which is exactly the condition under which cross-community food
pre-orders make sense at all.

---

## 4. Other cross-community features, ranked

Ordered by value ÷ risk, not by appeal.

| # | Feature | Why it ranks here | New schema |
|---|---------|-------------------|------------|
| 1 | **Service providers** (Help tab) | Already 100% built in the backend — `visibility`, `provider_shares`, `set_provider_visibility`, `list_visible_providers` all live and typed. UI-only work. A plumber who works two adjacent societies is the most obvious shared resource a gated-community app has. | **None** |
| 2 | **Community business directory** (`mcn_listings`) | A listing is an advert, not a transaction: no perishable good to move, no capacity race, no money. Already has the report/hide moderation. The cheapest honest proof that the federation works. | `visibility` column + helper |
| 3 | **Pre-order food** | The requested feature. High delight, but the only one that moves physical goods, money and a home address across the border at once. | §2.1 |
| 4 | **Carpools** | The one feature where crossing the border *is* the point — neighbouring societies share the same airport and office runs. Ranked below food only because "get into a stranger's car" needs a safety story the app does not have yet. | `visibility` + seat caps |
| 5 | **Community events** | Joint Diwali, sports day, society-vs-society cricket. `events.fund_scope` / `partnership_id` / `group_id` groundwork already exists. Keep it RSVP-only; the moment a joint event collects money it becomes item 7. | Partly built |
| 6 | **Announcements** | `community_announcements` + `announcement_audiences` + `can_user_see_announcement` are live with **no UI at all**. Nearly free. Ranked low only because there is not much to announce across societies yet. | **None** |
| 7 | **Parent Corner** | School runs and tuition groups genuinely cluster across societies. Last because it is children's data — do this after the moderation model has been proven on three other features. | `visibility` column |

**Not recommended: funds.** `event_transactions` is a ledger, and
`cross-community.md` §5 already commits to keeping it siloed for good reasons.
Do not federate money.

---

## 5. The blocker to decide first

**There is no way to create a partnership today except raw SQL.** Every
feature above depends on a partnership row, and no screen writes one. Two
routes:

**A — Partnerships UI first (recommended).** Build
`app/community/partners.tsx` for leads: search a community, request, accept,
pause, revoke, per-capability toggles. The lifecycle RPCs already exist, so
this is one screen calling four RPCs. It unblocks everything permanently and
means the platform admin never becomes the bottleneck for two societies who
want to talk to each other.

**B — Seed one pilot pair by SQL.** Insert one `active` partnership between
two real neighbouring societies, ship pre-order food directly to them, and
build the partnerships UI once the feature has proven itself. Faster to a
demo; you personally become the partnership-creation mechanism until the UI
lands.

Take A unless there is a demo date driving this. The UI is small, and B has a
way of lasting nine months.

---

## 6. Suggested build order

| Phase | Ships | Visible to users? |
|-------|-------|-------------------|
| 0 | `platform_feature_flags`, RPCs, `#features` admin page, `AuthContext` wiring | No |
| 1 | RLS tightening on `mcn_preorder_drops` / `_items` | No (closes an unused hole) |
| 2 | Partnerships UI for leads + `cross_community_partnerships` flag | Leads only |
| 3 | Providers cross-community — zero new schema, proves the model end to end | Behind flag |
| 4 | Business listings cross-community | Behind flag |
| 5 | **Pre-order food cross-community** (§2) | Behind flag |
| 6 | Carpools, events, announcements | Behind flag |

Pre-order food lands at phase 5 on purpose. Phases 3 and 4 exercise the same
partnership plumbing, the same origin badge and the same segmented-tab pattern
against content where a bug is an embarrassment rather than a neighbour
standing at the wrong gate holding cash.

---

## 7. Open decisions

1. **Partnership vs. group for the pilot** — two named societies, or a
   geographic cluster ("West Hyderabad")? Groups scale better; partnerships
   are easier to explain to a president.
2. **Does a guest lead need per-drop moderation in phase 1?** (§2.7)
3. **Do host ratings and order counts pool across communities, or stay
   siloed?** `cross-community.md` §12 already lists this as open for
   providers; the same answer should cover both.
4. **Is `partners` visibility the host's choice or the lead's?** The plan
   assumes the host's, bounded by whatever the lead permitted in the
   partnership scope.
5. **Should a partner drop count against the host's open-drop cap?** The plan
   assumes yes, same pool.

---

## 8. Docs to update when this ships

Per root `CLAUDE.md`, route each fact to exactly one owner:

- `docs/cross-community.md` — `preorders` capability, `can_user_see_drop`, new
  RPCs, phase table.
- `docs/cross-community-changelog.md` — **mandatory**, one entry per PR.
- `docs/architecture.md` — new columns, policies, helpers, `AuthContext`
  fields.
- `docs/features.md` — the Nearby tab, origin badge, fulfilment line, audience
  picker. No schema columns.
- `docs/CLAUDE.md` §9 — the two-flag-system trap.
- `docs/platform-admin.md` — the `#features` page.
- `.github/app-summary.md` — one line, since this adds a cross-community
  surface.
