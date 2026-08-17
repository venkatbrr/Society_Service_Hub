# Plan: notification delivery (web push) + coverage gaps + per-channel mute

**Status:** Completed (2026-08-17)
**Written:** 2026-08-17
**Supersedes:** [`archive/pwa-web-push-notifications-plan.md`](../archive/pwa-web-push-notifications-plan.md)


This plan is written to be handed to an implementing agent. Work the phases in order — Phase 1 is the reported bug, Phases 2–4 are the feature work, and Phase 4 depends on Phase 3's preferences table existing.

---

## 0. Why we are here — verified evidence

Diagnosed 2026-08-17 against **prod** (`mbzvcaoulawdugfearmj`). Do not re-derive this; it is confirmed.

**The database side works.** A visit posted from `venkat2011b@gmail.com` (resident) at 2026-08-17 10:00:58 UTC produced notification row `e49c86de-c38f-4ba0-a128-fec3d8dc3c36` for `venkatbrr@gmail.com` (president), type `new_visit`, `is_read = false`. Trigger `on_service_visit_created` fired, RLS grants the recipient `SELECT` (`is_user_approved` is true), and `public.notifications` is in the `supabase_realtime` publication with `relreplident = 'd'`.

**Nothing delivers it to a device. Three independent reasons:**

1. **The permission banner grants permission and then does nothing.** [`components/NotificationPermissionBanner.tsx:31-38`](../../components/NotificationPermissionBanner.tsx#L31-L38) calls `Notification.requestPermission()` and stops. There is no `pushManager.subscribe()`, no subscription persisted, no VAPID key anywhere in the repo. **This is exactly why the user "installed the app on Android and enabled notifications" and still got nothing** — the browser is willing, but nobody ever asked it for a push endpoint, and nobody ever sends to one.
2. **No `push` handler in the service worker.** [`public/service-worker.js`](../../public/service-worker.js) handles `install`, `activate`, `fetch` only. Even a delivered push would be dropped.
3. **No sender exists on any platform.** `profiles.expo_push_token` is written by [`context/NotificationContext.tsx:100-109`](../../context/NotificationContext.tsx#L100-L109) but **nothing in the repo or in the three Edge Functions ever posts to Expo's push API.** Both test profiles have `expo_push_token = null`. Native Android also has no `google-services.json` under `android/`, so an EAS build could not obtain an FCM token even if a sender existed.

**The affected install is the PWA** (browser "install app" / add to home screen on Android), confirmed by the user — not an APK. Web push is therefore the entire fix, and these prerequisites are already verified, so do not re-check them: the service worker is registered at `/service-worker.js` from `APP_SHELL_HEAD` in [`build-admin.js:235`](../../build-admin.js#L235), giving it scope `/`, so `navigator.serviceWorker.ready` resolves and its registration covers every app route; [`vercel.json:10-12`](../../vercel.json#L10-L12) serves the worker `max-age=0, must-revalidate`, so a new worker file lands on the next launch; and `manifest.json` pins `scope: "/"` with `start_url: /network`, so a notification click can navigate anywhere in the app.

So today the *only* device-visible notification is the local banner at [`NotificationContext.tsx:211-238`](../../context/NotificationContext.tsx#L211-L238), which is native-only **and** only fires while the app is open with a live realtime socket.

**Secondary bug (why it was also missing from the in-app list):** `fetchNotifications()` runs only when `userId` changes ([`NotificationContext.tsx:183-192`](../../context/NotificationContext.tsx#L183-L192)). When Android freezes a backgrounded PWA the realtime WebSocket dies silently and nothing resyncs on resume, so the list and the bell badge stay frozen until a hard reload. Compounding it, the bell only exists on the Home tab ([`app/(tabs)/index.tsx:461`](../../app/(tabs)/index.tsx#L461)) and as a Profile row — and the PWA's `start_url` is `/network`, which has no bell at all.

---

## Scope

| Phase | What | Blocking? |
|---|---|---|
| **1** | Web push end to end: subscription table, client subscribe, SW `push` handler, dispatch trigger, Edge Function sender | This is the reported bug |
| **2** | Resync on foreground + bell on `/network` | Small, independent, do it with Phase 1 |
| **3** | `notification_preferences` table + mute/unmute toggle in the Pre-order Food header | Prereq for Phase 4a/4c |
| **4** | Three new fan-outs: food drop published, pre-order received (host), Parent Corner posted | Depends on Phase 3 |

Out of scope, listed in §9: native Android/iOS push, order-cancellation notifications, digest/batching, quiet hours.

---

## Phase 1 — Web push delivery

### 1.1 Architecture

```
resident acts
  → existing fan-out trigger INSERTs rows into public.notifications
    → NEW statement-level trigger collects the inserted ids
      → net.http_post (pg_net) → Edge Function `send-web-push`
        → reads those rows + recipients' push_subscriptions (service role)
          → signs VAPID + encrypts, POSTs to each browser push service
            → service worker `push` event → showNotification
              → `notificationclick` → focus/open the deep link
```

**Use a statement-level trigger, not row-level.** A `new_visit` fan-out in a 200-flat society inserts 200 rows in one statement; a row-level trigger would fire 200 separate HTTP calls. One call carrying an id array is the whole point.

### 1.2 Generate VAPID keys (do this first — everything else depends on it)

```bash
npx web-push generate-vapid-keys
```

| Value | Goes to | Notes |
|---|---|---|
| Public key | `EXPO_PUBLIC_VAPID_PUBLIC_KEY` in `.env`, `.env.example`, **and Vercel env vars** | Publishable; shipped in the bundle |
| Private key | Supabase secret `VAPID_PRIVATE_KEY` (`npx supabase secrets set`) | **Never** commit, never `EXPO_PUBLIC_` |
| Subject | Supabase secret `VAPID_SUBJECT` = `mailto:support@wooru.in` | Required by the spec |

Also generate a random dispatch secret (`openssl rand -hex 32`): Supabase secret `WEB_PUSH_DISPATCH_SECRET`, and the same value into Supabase Vault so the trigger can read it (§1.5).

Remember `.env` is gitignored and untracked — update `.env.example` so the next person knows the var exists.

### 1.3 Migration A — subscriptions table

New file `supabase/migrations/<ts>_web_push_subscriptions.sql`. **Run `npx supabase migration list --linked` first** and pick a timestamp after the current latest (`20260915000200`); `20260916000000` is free at time of writing.

```sql
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  failure_count INT NOT NULL DEFAULT 0
);

-- The endpoint is globally unique per browser install. Key on it alone (not on
-- (user_id, endpoint)): when a second account signs in on the same handset the
-- endpoint must MOVE to the new user, not duplicate — otherwise the previous
-- user keeps receiving pushes on a device they no longer own. This is the same
-- class of bug already documented for expo_push_token in
-- docs/fixes/google-login-and-session-handling-review.md.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_select_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select_own ON public.push_subscriptions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_insert_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert_own ON public.push_subscriptions
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_update_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update_own ON public.push_subscriptions
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS push_subscriptions_delete_own ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete_own ON public.push_subscriptions
  FOR DELETE USING (user_id = auth.uid());

NOTIFY pgrst, 'reload schema';
```

`WITH CHECK` is written on the UPDATE policy deliberately — see the trap table in `docs/CLAUDE.md` §9.

**The client upsert must target the endpoint**, i.e. `.upsert(row, { onConflict: 'endpoint' })`, so a re-subscribe reassigns ownership rather than failing. Note the RLS consequence: user B upserting an endpoint currently owned by user A is an UPDATE, and `push_subscriptions_update_own`'s `USING` clause will not match A's row, so it fails. Handle it by deleting any local stale endpoint first from the client on sign-out (§1.4), and additionally clearing the row in `AuthContext.signOut` alongside the existing `expo_push_token` reset at [`context/AuthContext.tsx:630`](../../context/AuthContext.tsx#L630).

### 1.4 Client — `lib/webPush.ts` (new)

```ts
export type WebPushResult =
  | 'subscribed' | 'unsupported' | 'permission-default' | 'denied' | 'error';

export function isWebPushSupported(): boolean;

/** Idempotent. Safe to call on every app launch — re-subscribing is cheap and
 *  self-heals endpoints the browser silently rotated. */
export async function ensureWebPushSubscription(userId: string): Promise<WebPushResult>;

/** Called on sign-out: unsubscribe locally AND delete the row. */
export async function removeWebPushSubscription(): Promise<void>;
```

Implementation notes:

- Guard everything with `Platform.OS === 'web' && typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined'`.
- Return `'permission-default'` **without prompting** if `Notification.permission === 'default'`. The prompt must come from a user gesture (the banner), not from app boot — Chrome ignores/penalises non-gesture prompts.
- `const reg = await navigator.serviceWorker.ready;` then `reg.pushManager.getSubscription()` and reuse it if present, else `reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY!) })`.
- `userVisibleOnly: true` is mandatory in Chrome. Every push we send **must** result in a visible notification or Chrome will eventually revoke the subscription.
- Extract `endpoint`, `keys.p256dh`, `keys.auth` from `sub.toJSON()`. Upsert with `onConflict: 'endpoint'`, setting `user_id`, `last_seen_at: new Date().toISOString()`, `failure_count: 0`, `user_agent: navigator.userAgent`.
- Include the standard `urlBase64ToUint8Array` helper (base64url → `Uint8Array`).
- **Check the `error` on the upsert** and log it — a silent failure here is indistinguishable from working.

Wire-up:

| File | Change |
|---|---|
| [`context/NotificationContext.tsx:56-59`](../../context/NotificationContext.tsx#L56-L59) | The web early-return becomes `if (Platform.OS === 'web') { await ensureWebPushSubscription(userId); return; }` — everything below stays native-only |
| [`components/NotificationPermissionBanner.tsx:31-38`](../../components/NotificationPermissionBanner.tsx#L31-L38) | After `requestPermission()` returns `'granted'`, call `ensureWebPushSubscription(user.id)` and toast the outcome. **This is the actual fix for the reported bug.** Needs `useAuth()` for the id; keep the banner hidden when signed out |
| [`context/AuthContext.tsx`](../../context/AuthContext.tsx) (~line 630) | Call `removeWebPushSubscription()` next to the existing `expo_push_token: null` update, before the session is torn down |

### 1.5 Migration B — dispatch trigger

New file `supabase/migrations/<ts>_web_push_dispatch.sql`.

```sql
CREATE EXTENSION IF NOT EXISTS pg_net;
```

`pg_net` is **available but not installed** on this project (verified 2026-08-17: `pg_available_extensions` lists it at 0.20.0, `installed_version` null). Note it creates its own `net` schema. `pg_cron` and `http` are likewise available-but-not-installed; we are not using them.

Store the function URL and dispatch secret in Vault so they are not literals in a function body:

```sql
SELECT vault.create_secret(
  'https://<project-ref>.supabase.co/functions/v1/send-web-push',
  'web_push_endpoint_url', 'Edge Function URL for web push dispatch');
SELECT vault.create_secret('<the random hex>', 'web_push_dispatch_secret', 'Shared secret');
```

Write these as guarded `DO` blocks so re-running the migration does not error on a duplicate name. If Vault turns out to be unavailable on this project, the fallback is `ALTER DATABASE postgres SET app.settings.web_push_url = '…'` read via `current_setting('app.settings.web_push_url', true)` — **verify which one works before writing the whole migration.**

```sql
CREATE OR REPLACE FUNCTION public.dispatch_web_push()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ids    UUID[];
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT array_agg(id) INTO v_ids FROM inserted;
  IF v_ids IS NULL OR array_length(v_ids, 1) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_url
    FROM vault.decrypted_secrets WHERE name = 'web_push_endpoint_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'web_push_dispatch_secret';

  -- Missing config must never break the write that triggered it: the in-app
  -- notification row is the source of truth, push is best-effort on top.
  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'dispatch_web_push: missing vault config, skipping push';
    RETURN NULL;
  END IF;

  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-dispatch-secret', v_secret
    ),
    body    := jsonb_build_object('notification_ids', to_jsonb(v_ids)),
    timeout_milliseconds := 5000
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_notifications_dispatch_push ON public.notifications;
CREATE TRIGGER on_notifications_dispatch_push
  AFTER INSERT ON public.notifications
  REFERENCING NEW TABLE AS inserted
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.dispatch_web_push();

NOTIFY pgrst, 'reload schema';
```

`net.http_post` queues the request and the pg_net background worker sends it **after commit**, so a slow or dead Edge Function cannot block or fail the originating insert. Wrap the `PERFORM` in a `BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING …; END;` block anyway — this trigger sits on the write path of visits, events, drops and orders, and it must never be able to abort one.

### 1.6 Edge Function — `supabase/functions/send-web-push/index.ts` (new)

Responsibilities:

1. Reject unless `x-dispatch-secret` matches `Deno.env.get('WEB_PUSH_DISPATCH_SECRET')` — constant-time compare. Deploy with `--no-verify-jwt` since the caller is Postgres, not a user.
2. Read `notification_ids` from the body; `select id, user_id, type, title, body, data from notifications where id = any(...)` with the service-role key.
3. Join `push_subscriptions` on `user_id`. Users with no subscription are simply skipped.
4. For each subscription, send a payload:
   ```json
   { "title": "...", "body": "...", "url": "/visits/<id>", "tag": "<notification id>", "type": "new_visit" }
   ```
5. **Prune on failure:** HTTP `404` or `410` from the push service means the endpoint is permanently gone — `DELETE` that row. `429`/`5xx` are transient — increment `failure_count` and leave it. Delete any row whose `failure_count` exceeds ~10.
6. Return a JSON summary (`{sent, skipped, pruned, failed}`) and log it, so the function's logs are diagnosable via MCP `query_logs`.

**Library choice — verify before building on it.** Web push requires a VAPID JWT (ES256) plus aes128gcm payload encryption; do not hand-roll it. Candidates, in order: `jsr:@negrel/webpush` (Deno-native, WebCrypto) or `npm:web-push` (Supabase Edge Runtime has npm compat). Import the chosen one and run `npx supabase functions serve send-web-push` **before** writing the rest of the function — if the import does not resolve in the edge runtime, everything after it is wasted work.

**URL mapping.** The function needs `type → route`. Mirror [`app/notifications.tsx:89-187`](../../app/notifications.tsx#L89-L187) exactly and put a comment at both ends noting they must be kept in sync — this is a real duplication and it will drift otherwise. Add every type from §4 as you build it.

Deploy: `npm run fn:deploy:prod` (or `npx supabase functions deploy send-web-push --no-verify-jwt --project-ref …`).

### 1.7 Service worker

Edit [`public/service-worker.js`](../../public/service-worker.js):

```js
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch (_) { payload = {}; }

  const title = payload.title || 'Wooru';
  const options = {
    body: payload.body || '',
    icon: '/images/icon-192.png',
    badge: '/images/icon-192.png',
    tag: payload.tag || undefined,
    data: { url: payload.url || '/network' },
  };
  // userVisibleOnly:true means we MUST show something for every push, or
  // Chrome will eventually revoke the subscription.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/network';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
```

**Bump `CACHE_NAME` to `wooru-pwa-v11`** with a comment explaining why, exactly as v7–v10 did. Without the bump, installed clients keep running the old worker and the push handler never lands. Note also from `docs/CLAUDE.md` §9: an installed PWA picks up a new build on the launch *after* the one that fetched it (stale-while-revalidate) — so expect to launch the app twice, or use the long pull-to-refresh, before push starts working on a device that already has it installed.

### 1.8 Platform reality check (put this in the docs, and tell the user)

- **Android + Chrome, installed or in-tab:** works. This is the reported case.
- **Desktop Chrome/Edge/Firefox:** works.
- **iOS Safari:** web push requires iOS 16.4+ **and** the PWA to be installed to the Home Screen — it never works in a Safari tab. Permission must be requested from a user gesture. `IosInstallBanner` already covers the install nudge; the notification banner is the gesture.
- **The in-app list, badge and realtime path are unaffected** — push is strictly an additional delivery channel on top of the `notifications` row.

---

## Phase 2 — resync on foreground, and a bell on `/network`

Small, self-contained, and it fixes the *other* half of the original report ("I don't see it in the notification list either").

1. **Resync in `NotificationContext`.** Add an effect that calls `fetchNotifications()` when the app returns to the foreground:
   - web: `document.addEventListener('visibilitychange', …)` when `document.visibilityState === 'visible'`;
   - native: `AppState.addEventListener('change', …)` on `'active'`.

   Debounce to at most once every ~30s so tab-switching does not hammer PostgREST. Also re-subscribe the realtime channel if `channel.state !== 'joined'` — a frozen PWA's WebSocket dies silently and never recovers today.
2. **Bell on the MCN hub.** [`app/(tabs)/network.tsx`](../../app/(tabs)/network.tsx) is the PWA's `start_url` (`/network`) and has no notification affordance. Add the same bell + unread badge used at [`app/(tabs)/index.tsx:461-467`](../../app/(tabs)/index.tsx#L461-L467) into the hero row (~lines 139-170), pushing to `/notifications`. Extract it into a small shared `components/NotificationBell.tsx` rather than copy-pasting a third instance.

---

## Phase 3 — per-channel mute preferences

### 3.1 Migration C — `notification_preferences`

```sql
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel    TEXT NOT NULL CHECK (channel IN ('food_drops', 'parent_corner')),
  muted      BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, channel)
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
-- Four explicit own-row policies (select / insert / update / delete), same shape
-- as push_subscriptions above. UPDATE needs both USING and WITH CHECK.
```

**Absence of a row means "not muted."** Only an explicit `muted = true` suppresses. This keeps the fan-outs correct for every existing user with no backfill.

The `CHECK` list is deliberate — adding a channel later costs one migration, which is the right trade against free-text channel names drifting between the trigger and the client.

Helper for the fan-outs (`STABLE`, `SECURITY DEFINER`, `SET search_path = public`):

```sql
CREATE OR REPLACE FUNCTION public.is_channel_muted(p_user_id UUID, p_channel TEXT)
RETURNS BOOLEAN ...
```

but in the fan-out queries prefer the inline `NOT EXISTS` form so the planner can use the primary key:

```sql
AND NOT EXISTS (
  SELECT 1 FROM public.notification_preferences np
  WHERE np.user_id = p.id AND np.channel = 'food_drops' AND np.muted
)
```

### 3.2 Client — `lib/useNotificationMute.ts` (new hook)

```ts
export function useNotificationMute(channel: 'food_drops' | 'parent_corner'): {
  muted: boolean;
  loading: boolean;
  toggle: () => Promise<void>;
};
```

- Loads the row with `.maybeSingle()` (never `.single()`).
- `toggle()` sets state optimistically, upserts `{ user_id, channel, muted, updated_at }` with `onConflict: 'user_id,channel'`, and **reverts on error** with an error toast.
- Toast copy: *"Food drop notifications muted"* / *"Food drop notifications on"*.
- **Not** community-scoped — this is a user preference, like `user_services`. Do not pass `communityId`.

### 3.3 UI — the toggle in the Pre-order Food header

[`app/mcn/drops/index.tsx:564-569`](../../app/mcn/drops/index.tsx#L564-L569) already builds its header with `buildMcnHeaderOptions({ title: 'Pre-order Food', onBack })`, and [`lib/mcnHeader.tsx:10`](../../lib/mcnHeader.tsx#L10) already accepts an optional `headerRight`. So:

```tsx
options={buildMcnHeaderOptions({
  title: 'Pre-order Food',
  onBack: handleBack,
  headerRight: user?.id ? () => <MuteToggleButton channel="food_drops" /> : undefined,
})}
```

- Icons: `Bell01` (unmuted) / `BellOff01` (muted) from `@untitledui/icons` — both are already imported elsewhere in the app, no new dependency.
- Style the pressable as the mirror of `HeaderBackButton`'s circle in `buildMcnHeaderOptions` (36×36, `VerandahRadius.pill`, `borderWidth: 0.5`, `borderColor: Verandah.borderHair`, `backgroundColor: Verandah.card`, `marginRight: 10`) so the two ends of the header match. Verandah tokens only — no raw hex, no hand-written shadows.
- **Hide it when signed out.** This screen supports anonymous browsing (see `requireLoginForAction` at [`app/mcn/drops/index.tsx:549-560`](../../app/mcn/drops/index.tsx#L549-L560)); a preference toggle for a user with no id makes no sense.
- Add `accessibilityLabel` — "Mute food drop notifications" / "Unmute food drop notifications".
- Apply the identical pattern to `app/mcn/parents/index.tsx` with `channel="parent_corner"` when Phase 4c lands.

---

## Phase 4 — the three new fan-outs

One migration, three functions. All `SECURITY DEFINER` + `SET search_path = public` — a fan-out must see every profile in the community, not just the rows the poster's own RLS grants them (this is why `handle_community_event_published` is written that way; copy it as the reference implementation).

### 4a. Food drop published → community

```sql
CREATE OR REPLACE FUNCTION public.handle_drop_published() ...
```

- Trigger: `AFTER INSERT ON public.mcn_preorder_drops FOR EACH ROW`.
- Early-return unless `NEW.status = 'open' AND NEW.flagged_for_review_at IS NULL`.
- Type `drop_posted`, title `New food drop`, body `'<host> is cooking "<title>" for <fulfillment_date>.'` with `COALESCE(NULLIF(TRIM(full_name),''), 'A neighbour')` — same guard as the events trigger.
- `data`: `jsonb_build_object('drop_id', NEW.id)`. Route `/mcn/drops/<id>`.
- Recipients: `community_id = NEW.community_id AND id <> NEW.created_by AND removed_at IS NULL` **and** not muted on `food_drops`.

> **Known trade-off, accept it deliberately:** the drop row and its items are two separate client round trips ([`app/mcn/drops/add.tsx:552-580`](../../app/mcn/drops/add.tsx#L552-L580)), so an `AFTER INSERT` trigger on the drop fires before any items exist, and a failed item insert leaves a notification for an empty drop. A drop with no items is already a reachable state today and the notification body does not mention items, so this is tolerable. If it turns out to matter, the correct fix is to move drop creation into a `place`-style `SECURITY DEFINER` RPC that writes drop + items in one transaction — the same reasoning `docs/CLAUDE.md` §9 gives for `place_mcn_preorder()`. **Do not** work around it by triggering off the items table.

### 4b. Pre-order placed → host

Not a trigger. Add the insert inside **`public.place_mcn_preorder(p_drop_id, p_items, p_buyer_name, p_buyer_phone, p_flat_number, p_buyer_note, p_order_id)`**, immediately before its final `RETURN v_order_id;` (after `total_amount` is updated, so the body can quote the real total).

- Skip when `v_drop.created_by = auth.uid()` — a host ordering from their own drop notifies nobody.
- Type `preorder_received`, title `New pre-order`, body `'<buyer_name> (<flat>) ordered <v_units> item(s) — ₹<v_total>.'`
- `data`: `jsonb_build_object('drop_id', p_drop_id, 'order_id', v_order_id)`. Route to the host dashboard `/mcn/drops/manage/<drop_id>`, **not** the public drop page.
- **Deliberately not muteable.** `food_drops` mutes the community broadcast; this is a transactional notification about the host's own money. Do not apply the mute filter here.
- Changing the function body is a `CREATE OR REPLACE` with an unchanged signature, so no `DROP FUNCTION` is needed. Re-run the whole existing body from the current definition — do **not** hand-edit the deployed function in the dashboard.

### 4c. Parent Corner entry posted → community

- Trigger: `AFTER INSERT ON public.mcn_parent_corner FOR EACH ROW`. **INSERT only** — edits must not re-notify.
- Type `parent_corner_posted`, title `New Parent Corner post`, body `'<parent_name> added <student_name> (<grade_class>) to Parent Corner.'`
- `data`: `jsonb_build_object('entry_id', NEW.id)`. Route `/mcn/parents` — there is no detail route (the module is `index.tsx` + `add.tsx` only), so do not invent a deep link to one.
- Recipients: community minus `NEW.user_id` minus removed, and not muted on `parent_corner`.

### 4d. Client wiring for all three

In [`app/notifications.tsx`](../../app/notifications.tsx):

| Type | Icon (`getNotificationIconComponent`) | Route (`handleNotificationPress`) |
|---|---|---|
| `drop_posted` | reuse the drops icon family — `Flag01` is moderation, so use something neutral like `ShoppingBag01` or `Calendar` | `/mcn/drops/{drop_id}` |
| `preorder_received` | same family | `/mcn/drops/manage/{drop_id}` |
| `parent_corner_posted` | `Users01` or similar | `/mcn/parents` |

Add all three to the Edge Function's `type → url` map too (§1.6), or push will open `/network` for them.

---

## 5. Deployment loop (per `CLAUDE.md`, non-negotiable)

For **every** migration in this plan:

1. `npm run db:push:prod`
2. `npm run types:prod`
3. **Re-append the hand-maintained enriched-types block** (`ProviderWithInteraction`, `VisitWithJoinerData`, `VisitJoinerWithProfile`) at the bottom of `lib/database.types.ts` — `types:*` redirects over the whole file and wipes it
4. `npx tsc --noEmit` — the only validation gate; there is no test suite or linter

Plus `npm run fn:deploy:prod` for the Edge Function, and `npx supabase secrets set` for `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `WEB_PUSH_DISPATCH_SECRET`.

Do not leave a migration unapplied or types unregenerated.

---

## 6. Docs to update (same change set — not a follow-up)

| File | What |
|---|---|
| `docs/architecture.md` §8 | Add `drop_posted`, `preorder_received`, `parent_corner_posted` to the live-types list. **Replace** "Web push is not implemented" with the delivery architecture and the platform matrix from §1.8 |
| `docs/architecture.md` §4 / trigger table | New tables `push_subscriptions`, `notification_preferences`; new triggers `on_notifications_dispatch_push`, `on_drop_published`, `on_parent_corner_posted`; `place_mcn_preorder` now emits `preorder_received` |
| `docs/features.md` | The mute toggle in the Pre-order Food header; what each new notification says and where it lands |
| `docs/CLAUDE.md` §1 | New env vars (`EXPO_PUBLIC_VAPID_PUBLIC_KEY`) and the three Supabase secrets |
| `docs/CLAUDE.md` §9 traps | (a) `userVisibleOnly: true` means every push must show a notification; (b) a new SW handler needs a `CACHE_NAME` bump *and* two launches to reach an installed PWA; (c) `push_subscriptions` is keyed on `endpoint` alone, on purpose; (d) the `type → url` map is duplicated between `app/notifications.tsx` and the Edge Function |
| `docs/disabled-features.md` | Update the entry that currently says push is unimplemented (it names the missing table, SW handler, and dispatch function — all three now exist) |
| `docs/archive/pwa-web-push-notifications-plan.md` | Add a header line pointing at this file as the implemented design, or delete it |
| `.env.example` | `EXPO_PUBLIC_VAPID_PUBLIC_KEY` |
| `.github/app-summary.md` | One line: notifications now have a delivery channel and per-channel mute |

Nothing here touches federation, so no `cross-community-changelog.md` entry is needed.

---

## 7. Verification

**Phase 1 (the reported bug) — do this on the actual Android handset with the PWA installed:**

1. `select count(*) from push_subscriptions where user_id = '<yours>'` → must be ≥ 1 after tapping **Enable** on the banner. **If this is 0, nothing else matters** — that is the exact failure being fixed.
2. Fully background or close the PWA. From the second account (`venkat2011b@gmail.com`), post a visit.
3. A system notification appears on the locked/home screen. Tapping it opens the app on `/visits/<id>`.
4. `mcp__supabase__query_logs` on the Edge Function → one invocation, `{sent: 1, …}`.
5. Kill switch check: temporarily point the Vault URL at a bad host and confirm posting a visit still succeeds and still writes the `notifications` row. Push must never be able to break a write.
6. Sign out → `push_subscriptions` row for that endpoint is gone. Sign in as the other account on the same handset → the row reappears with the new `user_id`, and the first account stops receiving pushes on that device.

**Phase 2:** background the PWA for 10+ minutes, post from the other account, foreground it — the row appears in the list and the badge increments without a reload.

**Phase 3:** mute on device A → post a drop from device B → device A gets no `drop_posted` row at all (verify in SQL, not just the UI). Unmute → next drop arrives. Confirm the toggle is absent when signed out.

**Phase 4:**
- Drop published: every other non-removed, non-muted member gets exactly one row; the host gets none.
- Pre-order: host gets exactly one `preorder_received`; buyer gets none; a host ordering from their own drop generates none. Confirm a **cancelled-then-replaced** order does not double-notify.
- Parent Corner: one row per member on insert; **editing an entry produces none**.
- Run each fan-out once in a community with ≥ 2 members and confirm the count with `select type, count(*) from notifications where created_at > now() - interval '2 min' group by type`.

**Always:** `npx tsc --noEmit` clean, and check `mcp__supabase__get_advisors` for new RLS/security warnings on the two new tables.

---

## 8. Test accounts

| Account | Role | Community |
|---|---|---|
| `venkatbrr@gmail.com` (`dd775f9b-f892-4dfb-b328-28e42e28030c`) | president | `64cd9fa6-ad3b-40f0-9f1e-6b9f6a6fce06` |
| `venkat2011b@gmail.com` (`39f36c4d-538b-45a2-beca-6ad4002e2b2c`) | resident | same |

Both currently have `expo_push_token = null`. The community has exactly these two members, so every fan-out should produce exactly **one** row — a very easy assertion.

---

## 9. Explicitly out of scope

- **Native Android/iOS push.** There is no `google-services.json` under `android/`, so an EAS build cannot obtain an FCM token, and no Expo-push sender exists. If native ships later, the same `send-web-push` dispatch trigger can fan out to `profiles.expo_push_token` as a second branch — design the Edge Function so that is an added function, not a rewrite. Note the known bug that `expo_push_token` is never cleared on sign-out (documented in `docs/fixes/google-login-and-session-handling-review.md`); fix it in the same pass as §1.4's `removeWebPushSubscription()`.
- Order cancellation → host, and drop cancellation → buyers. Natural follow-ups; not requested.
- Digest/batching, quiet hours, per-community preferences.
- Mute toggles for visits, events, carpools and moderation. The `notification_preferences` table generalises to them by adding channel values, but only `food_drops` and `parent_corner` were asked for.
- Backfilling push subscriptions for existing installs — impossible by construction; every device must re-grant.
