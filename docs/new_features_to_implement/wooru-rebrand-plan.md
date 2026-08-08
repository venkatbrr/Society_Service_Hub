# Rebrand: Society Service Hub → Wooru

**Owner:** Venkat
**Created:** 2026-08-08 · **Last updated:** 2026-08-08
**Goal:** Remove every trace of "Society Service Hub" (and the two stray brands, `commloom` and `gatebond`) from the repo and the surrounding services, and establish **Wooru** on **wooru.in** as the single name — before the first production release.

**Why now:** nothing is in production, no user has installed the app, no link has been shared. Every item in §5 (identifier changes) is free today and expensive after launch. This is the last cheap moment.

**Relationship to [`two-environment-setup-plan.md`](two-environment-setup-plan.md):** that plan is blocked on decision **C — pick a domain**. This plan answers it: `wooru.in`. Do the rebrand **first**, then resume that plan — otherwise you configure Vercel domains, Google OAuth origins, and Supabase Auth URLs twice.

---

## 0. Status at a glance

| Phase | What | Status |
|---|---|---|
| 1 | Lock the naming table (§2) | ✅ Done — **A** = `Wooru`, **C** = yes, **B**/**D** settled; only **E** open |
| 2 | User-facing strings — 31 files | ✅ **Done 2026-08-08** — see §4.1 |
| 3 | Identifiers — scheme, package, slug, npm | ✅ **Done 2026-08-08** — code only; §5.0 external prep still outstanding |
| 4 | Platform admin email → DB migration | 🔄 Code + migration written; **migration not yet applied** — `npm run db:push:prod` was blocked by a permission prompt |
| 5 | External services — Expo, Google, Supabase, Cloudinary, GitHub | 🔄 Vercel renamed; rest pending |
| 6 | Domain cutover — resume the two-environment plan | ⏸️ Needs DNS for `wooru.in` |

Phases 2 and 3 are the only ones that touch code. Phase 4 is one migration. Phase 5 is all dashboards.

⚠️ **Vercel was renamed before its two prerequisite dashboard settings were confirmed** (§7.1 items 1 and 2). Until Supabase Auth URLs and the Google OAuth origins list `https://wooru.vercel.app`, **web Google sign-in is broken.** That is the most urgent open item.

---

## 1. Decisions I need from you

Everything else is derivable.

| # | Decision | Recommendation | Why it matters |
|---|---|---|---|
| **A** | **Exact display name.** Is it `Wooru`, or `Wooru` plus a descriptor (e.g. "Wooru — Community OS")? | `Wooru` alone as the product name; use a descriptor only in `<title>` and meta tags | Sets ~20 user-facing strings and the PWA `name`/`short_name` |
| **B** | ~~Platform admin email~~ | ✅ **Decided:** `societyservicehub@gmail.com` + `thewooru@gmail.com`, both admins; the hardcoded branch moves to `thewooru@gmail.com` only | See §6 — verified safe against prod, the old account keeps admin via its profile row |
| **C** | **Android package.** Keep `com.gatebond.app`, or change to `in.wooru.app`? | Change. Free today, permanent after the first Play Store upload | A package change is a *different app* — no upgrade path, and it needs a new Google Android OAuth client |
| **D** | **Rename the GitHub repo, Vercel project, and Supabase project?** | Vercel **yes** (it produces shared preview URLs); GitHub and Supabase optional but near-free | Full reasoning in §7.1 |
| **E** | **Apex or `www` canonical?** (carried over from the two-env plan) | Apex — `wooru.in`, with `www.wooru.in` redirecting | Determines `FALLBACK_SITE_URL` and every OAuth origin |

---

## 2. The naming table

This is the artifact everything else reads from. Nothing outside this table gets a new name.

| Namespace | Current | New |
|---|---|---|
| Product name (UI copy) | `Society Service Hub` | `Wooru` |
| Web `<title>` | `Society Service Hub — Resident Portal` | `Wooru — Resident Portal` |
| PWA `name` / `short_name` | `Society Service Hub` / `SSH` | `Wooru` / `Wooru` |
| Apple web-app title | `Society Hub` | `Wooru` |
| Admin console title | `Society Service Hub — Platform Admin` | `Wooru — Platform Admin` |
| Expo `name` | `Society_Service_Hub` | `Wooru` |
| Expo `slug` | `Society_Service_Hub` | `wooru` |
| Deep-link scheme | `societyservicehub://` | `wooru://` |
| Android package | `com.gatebond.app` | `in.wooru.app` |
| iOS bundle id | *(unset — defaults from slug)* | `in.wooru.app` (set it explicitly) |
| npm package `name` | `society_service_hub` | `wooru` |
| Service worker cache | `ssh-pwa-v2` | `wooru-pwa-v1` |
| Cloudinary folder | `society_hub` | `wooru` |
| Platform admin (hardcoded break-glass) | `societyservicehub@gmail.com` | `thewooru@gmail.com` |
| Platform admins (actual, via profile role) | `societyservicehub@gmail.com` | both `societyservicehub@gmail.com` and `thewooru@gmail.com` |
| Prod web origin | `commloom.vercel.app` | `wooru.in` |
| Staging web origin | *(none)* | `staging.wooru.in` |
| Dead share domain | `society-service-hub.app` | *(delete — see §4.3)* |
| GitHub repo | `venkatbrr/Society_Service_Hub` | `venkatbrr/wooru` |
| Supabase prod project | `societyservicehub@gmail.com's Project` | `wooru-prod` |
| Supabase preprod project | *(not created)* | `wooru-preprod` |

**`gatebond` and `commloom` are not aliases of the brand — they are leftovers.** `com.gatebond.app` is the Android package and `commloom.vercel.app` is the current live host. Both disappear here.

---

## 3. Full inventory

80 occurrences of the old brand across 51 files, plus 23 of `commloom`/`gatebond`/`society_hub`. Grouped by what breaks if you get it wrong.

### 3.1 Cosmetic — a typo is visible but harmless (Phase 2)

| File | What |
|---|---|
| [`app/login.tsx:214`](../../app/login.tsx#L214) | Login screen title |
| [`app/(tabs)/profile.tsx:265`](../../app/(tabs)/profile.tsx#L265) | Version footer `Society Service Hub v1.0.0` |
| [`app/(tabs)/index.tsx:135`](../../app/(tabs)/index.tsx#L135) | Invite share message |
| [`app/(tabs)/community.tsx:204`](../../app/(tabs)/community.tsx#L204) | Invite share message |
| [`app/community-request-submitted.tsx:77,86`](../../app/community-request-submitted.tsx#L77) | Invite share + WhatsApp message |
| [`app/mcn/my-orders.tsx:268`](../../app/mcn/my-orders.tsx#L268) | Order WhatsApp message |
| [`app/mcn/listing/orders/[id].tsx:149`](../../app/mcn/listing/orders/[id].tsx#L149) | Seller WhatsApp message |
| [`app/sos/index.tsx:262`](../../app/sos/index.tsx#L262) | Blood-donor WhatsApp message |
| [`app/admin-redirect.tsx:53`](../../app/admin-redirect.tsx#L53) | Hardcoded admin email in body copy — **update with decision B** |
| [`app/+html.tsx:18,28,60`](../../app/+html.tsx#L18) | `<title>`, apple web-app title, splash `brand-title` |
| [`public/manifest.json:2-3`](../../public/manifest.json#L2) | PWA `name`, `short_name` |
| [`public/service-worker.js:1`](../../public/service-worker.js#L1) | Header comment |
| [`public/landing.html`](../../public/landing.html) | 6 mentions: `<title>`, meta description, `og:title`, a testimonial, CTA copy, footer copyright |
| [`admin-dashboard/index.html:6,50,54`](../../admin-dashboard/index.html#L6) | Title, `<h1>`, sign-in blurb |
| [`lib/cloudinary.ts:2,5,35`](../../lib/cloudinary.ts#L2) | Doc comments + the `society_hub` folder constant |
| `CLAUDE.md`, `docs/*` (15 files), `.cursorrules`, `.windsurfrules`, `.github/copilot-instructions.md`, `.github/app-summary.md`, `.github/agents/test.agent.md` | Prose |

**Skip `docs/archive/`** — it is explicitly historical (per `docs/README.md`) and rewriting it destroys the record of what things were called when.

### 3.2 Identifiers — a mistake breaks the build or the app (Phase 3)

| File | What | Breaks if wrong |
|---|---|---|
| [`app.json:3-4`](../../app.json#L3) | `name`, `slug` | `eas build` fails on slug mismatch with expo.dev |
| [`app.json:8`](../../app.json#L8) | `scheme` | Password-reset deep link dies |
| [`app.json:27`](../../app.json#L27) | `android.package` | Native Google Sign-In dies (SHA-1 is registered per package) |
| [`lib/auth.ts:54`](../../lib/auth.ts#L54) | `redirectTo: 'societyservicehub://reset-password'` | Must change **with** `app.json:8`, and be allow-listed in Supabase Auth |
| [`package.json:2`](../../package.json#L2) + `package-lock.json` | npm `name` | Harmless, but regenerate the lock with `npm install` — never hand-edit it |
| [`public/service-worker.js:4`](../../public/service-worker.js#L4) | `CACHE_NAME` | Safe: the `activate` handler already deletes every cache whose name ≠ `CACHE_NAME`, so a rename self-purges |

### 3.3 Authorization — a mistake locks you out (Phase 4)

`societyservicehub@gmail.com` appears in **6 applied migrations** and **3 code files**:

- [`context/AuthContext.tsx:15`](../../context/AuthContext.tsx#L15) — `PLATFORM_ADMIN_EMAIL`
- [`admin-dashboard/js/auth.js:85`](../../admin-dashboard/js/auth.js#L85) — `isCanonicalAdmin`
- [`app/admin-redirect.tsx:53`](../../app/admin-redirect.tsx#L53) — display copy

Server side, it is baked into two functions (latest definitions in `20260427213000_restore_platform_admin_notifications.sql`):

```sql
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id UUID DEFAULT auth.uid())
...
  SELECT EXISTS (... p.app_role = 'admin' AND p.community_id IS NULL)
  OR EXISTS (... lower(u.email) = 'societyservicehub@gmail.com');   -- ← live check
```

plus `handle_new_user()`, which auto-promotes that email on signup.

⚠️ **The email branch is not a bootstrap — it is a permanent break-glass.** Anyone who signs in with that address is a platform admin regardless of their profile row. §6 handles it carefully.

### 3.4 Already broken — the rebrand fixes it as a side effect

[`api/share-drop.ts:12`](../../api/share-drop.ts#L12):

```ts
const APP_ORIGIN = 'https://society-service-hub.app';   // domain you have never owned
```

This is the Vercel serverless function that serves Open Graph tags to WhatsApp's link crawler for shared food drops. Every canonical URL and every share preview it has ever emitted pointed at a domain that does not resolve.

Line 68 also puts the brand name in the fallback OG description.

⚠️ **`api/*.ts` is excluded from `tsconfig.json`** (it runs in Vercel's separate Node runtime), so `npx tsc --noEmit` will **not** catch a mistake in this file. Verify it by deploying and running the URL through a link-preview debugger.

The two-environment plan already replaced eight other `society-service-hub.app` URLs with `siteUrl()` — this file was missed because it is server-side and cannot import `lib/siteUrl.ts`'s React Native dependency. Fix it by reading `process.env.EXPO_PUBLIC_SITE_URL` with a `https://wooru.in` fallback, matching how the same file already reads its Supabase config.

---

## 4. Phase 2 — user-facing strings ✅ DONE 2026-08-08

`Society Service Hub` and `Society Hub` → `Wooru` across **31 files** (26 code/config + 5 docs). `npx tsc --noEmit` passes.

Also done in the same pass:

| Change | File |
|---|---|
| `FALLBACK_SITE_URL` → `https://wooru.in` | [`lib/siteUrl.ts:14`](../../lib/siteUrl.ts#L14) |
| `APP_ORIGIN` → reads `EXPO_PUBLIC_SITE_URL`, falls back to `https://wooru.in` | [`api/share-drop.ts:12`](../../api/share-drop.ts#L12) — fixes §3.4 |
| PWA `short_name` `SSH` → `Wooru` | [`public/manifest.json:3`](../../public/manifest.json#L3) |
| `CACHE_NAME` `ssh-pwa-v2` → `wooru-pwa-v1` | [`public/service-worker.js:4`](../../public/service-worker.js#L4) |
| Cloudinary folder `society_hub/` → `wooru/` | [`lib/cloudinary.ts:75`](../../lib/cloudinary.ts#L75) |
| Added absolute `og:url` + `og:image` | [`public/landing.html`](../../public/landing.html) |

### 4.1 Found during the sweep — not in the original inventory

1. **[`lib/navigation.ts:37`](../../lib/navigation.ts#L37)** — `STACK_STORAGE_KEY = 'ssh_navigation_stack'`, now `wooru_navigation_stack`. Harmless: changing the key orphans any persisted nav stack, which just resets navigation state on next load.

2. ⚠️ **The Cloudinary upload preset is still named `society_hub_unsigned`** (`.env`, `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET`). The preset is a **Cloudinary dashboard object**, not a repo string — renaming the folder constant did not touch it. Worse, [`lib/cloudinary.ts:74`](../../lib/cloudinary.ts#L74) only sends a `folder` param **when a subfolder is passed**:

   ```ts
   if (subfolder) { formData.append('folder', `wooru/${subfolder}`); }
   ```

   So uploads *without* a subfolder still land wherever the preset's own default folder points. Two follow-ups: create a `wooru_unsigned` preset with default folder `wooru/`, and verify an unsigned preset in your account actually honours a client-supplied `folder` (some configurations lock it). **Test one upload of each kind before trusting this.**

3. **[`ui.xml`](../../ui.xml)** — a 1-line Android accessibility-tree dump committed to the repo root, full of `com.gatebond.app`. It is captured runtime junk, not a reference. Delete it or gitignore it; nothing reads it.

### 4.2 Deliberately left alone

`data/service-providers/extracted_providers.md`, `scratch/*`, `docs/fixes/done/*`, `docs/archive/**`, `supabase/.temp/linked-project.json` (CLI cache), and the applied migrations. All are historical records or regenerated artifacts.

---

## 4bis. Original Phase 2 scope (for reference)

Mechanical. Order does not matter; nothing here has an external dependency.

1. Replace the 20 code/asset files in §3.1.
2. Rewrite `public/landing.html` brand copy, and set `og:url` to `https://wooru.in` (it is currently absent) and `og:image` to an absolute `https://wooru.in/images/icon.png` — relative OG images are ignored by most crawlers.
3. Rename the Cloudinary folder constant to `wooru`. **No data migration needed:** existing images are referenced by absolute `secure_url` values already stored in the database, so old uploads keep resolving from `society_hub/` forever. Only new uploads land in `wooru/`.
4. Update the docs listed in §3.1, respecting the one-owning-file rule in `docs/CLAUDE.md` §7. `docs/archive/` is out of scope.
5. `npx tsc --noEmit`.

**Not covered by the type checker:** `public/landing.html`, `public/manifest.json`, `public/service-worker.js`, `admin-dashboard/*`, and `api/share-drop.ts`. Check those by eye and in a browser.

---

## 5. Phase 3 — identifiers

### 5.0 Do these *before* touching `app.json`

| Prep | Where | Why first |
|---|---|---|
| Rename the Expo project's **slug** to `wooru` | expo.dev → project settings | `eas build` compares `app.json`'s slug against the server's. Change the server first, or the next build fails. |
| **Keep `extra.eas.projectId` (`6dcab1c4-…`) exactly as is** | — | Push tokens are per-device-per-EAS-project. A new projectId forces every device to re-register. Rename the project, don't recreate it. |
| Create a new **Android OAuth client** for `in.wooru.app` + your keystore SHA-1 | Google Cloud Console → Credentials | Native Google Sign-In is bound to package + SHA-1. Missing this is the single most common failure here. |
| Add `wooru://**` to the Supabase Auth redirect allow-list | Supabase → Authentication → URL Configuration | Add it *before* shipping a build that uses it; leave `societyservicehub://**` in place until no old dev build matters. |

### 5.1 The edits ✅ DONE 2026-08-08

Confirmed by the user: not in production on web **or** Android, so the package change is free and the rebrand is strict — no compatibility shims, no dual-name period.

| File | Change |
|---|---|
| [`app.json:3-4`](../../app.json#L3) | `name` → `Wooru`, `slug` → `wooru` |
| [`app.json:8`](../../app.json#L8) | `scheme` → `wooru` |
| [`app.json:18`](../../app.json#L18) | **added** `ios.bundleIdentifier: "in.wooru.app"` — was unset and silently deriving from the slug |
| [`app.json:28`](../../app.json#L28) | `android.package` → `in.wooru.app` |
| [`lib/auth.ts:54`](../../lib/auth.ts#L54) | `wooru://reset-password` |
| [`package.json:2`](../../package.json#L2) | `name` → `wooru`; lock regenerated with `npm install --package-lock-only` |
| [`docs/features.md:44`](../features.md) | documented scheme updated |

`npx tsc --noEmit` passes.

⚠️ **The generated `/android` folder on disk is now stale** — it was prebuilt against `com.gatebond.app`. It is gitignored, so nothing is committed, but the next native build must regenerate it:

```bash
npx expo prebuild --clean
```

Skipping this means the old package id is still baked into the native project.

### 5.1bis Original edit list (reference)

- `app.json` — `name`, `slug`, `scheme`, `android.package`; add `ios.bundleIdentifier: "in.wooru.app"` (currently unset, so it silently derives from the slug — pin it now).
- `lib/auth.ts:54` — `wooru://reset-password`.
- `package.json` `name` → `wooru`, then `npm install` to regenerate `package-lock.json`.
- `public/service-worker.js` — `CACHE_NAME = 'wooru-pwa-v1'`.

### 5.2 Verify

```bash
npx tsc --noEmit
npm run web                                    # PWA name, title, splash brand
eas build --profile preview --platform android # slug accepted, app installs as in.wooru.app
```

Then on the dev build: Google Sign-In, and a password-reset email → confirm the link opens the app.

---

## 6. Phase 4 — the platform admin email

**This is the only step that can lock you out of the admin console.** Do it in this order.

### 6.1 Current state — verified against prod 2026-08-08

```sql
SELECT u.email, p.app_role, p.community_id, public.is_platform_admin(p.id)
FROM auth.users u JOIN public.profiles p ON p.id = u.id
WHERE p.app_role = 'admin' AND p.community_id IS NULL;
```

| auth email | app_role | community_id | `is_platform_admin` |
|---|---|---|---|
| `societyservicehub@gmail.com` | `admin` | `NULL` | `true` |

**Exactly one platform admin exists.** `thewooru@gmail.com` is **not** in `auth.users` at all — it has no account and no profile. It must be created (§6.2) before it can be an admin.

✅ **The critical precondition holds:** `societyservicehub@gmail.com` satisfies the *profile* branch (`app_role='admin' AND community_id IS NULL`) independently of the email branch. Removing its hardcoded email from `is_platform_admin()` therefore costs it nothing — it stays a platform admin. This is what makes §6.3 safe.

### 6.2 Create the second identity

`thewooru@gmail.com` is a Gmail address, so there is no mailbox to provision — just sign up.

1. Sign up in the app as `thewooru@gmail.com`. The `handle_new_user()` trigger will create it as `resident` (the email `CASE` only matches the old address).
2. Promote it:

```sql
UPDATE public.profiles
SET app_role = 'admin'::public.app_role_type, community_id = NULL
WHERE email = 'thewooru@gmail.com';
```

3. Confirm both are now admins:

```sql
SELECT u.email, public.is_platform_admin(p.id)
FROM auth.users u JOIN public.profiles p ON p.id = u.id
WHERE p.app_role = 'admin' AND p.community_id IS NULL;
```

Both rows must return `true` **before** you run the migration in §6.3.

### 6.3 The migration

New file, e.g. `supabase/migrations/20260901000000_rebrand_platform_admin_email.sql`.

⚠️ **Do not edit the 6 existing migrations that contain the old email.** `supabase db push` tracks migrations by *filename*, not content — an edit reports "up to date" and never lands (`docs/CLAUDE.md` §9). They stay as a historical record; the new migration supersedes them via `CREATE OR REPLACE`.

The migration should:

1. `CREATE OR REPLACE FUNCTION public.is_platform_admin(...)` with `thewooru@gmail.com` — and **only** that address — in the break-glass branch.
2. `CREATE OR REPLACE FUNCTION public.handle_new_user()` with the same address in its `CASE`.
3. Backfill, idempotently: `UPDATE public.profiles SET app_role='admin', community_id=NULL WHERE email='thewooru@gmail.com';`
4. End with `NOTIFY pgrst, 'reload schema';`.

**Why the old address does not need to stay in the function.** Per §6.1 it is already an admin through the profile branch, verified in prod. Listing both emails would keep the dead brand hardcoded in the database forever for no gain — the whole point of this phase. Both accounts keep working:

| Account | Admin via |
|---|---|
| `societyservicehub@gmail.com` | profile row — `app_role='admin'`, `community_id IS NULL` |
| `thewooru@gmail.com` | profile row **and** the break-glass email branch |

Keep the signatures byte-identical — `is_platform_admin` is `STABLE SECURITY DEFINER SET search_path = public` and is referenced by dozens of RLS policies. A changed signature would need `DROP FUNCTION` first, which would cascade.

### 6.4 The client side

- `context/AuthContext.tsx:15` → `thewooru@gmail.com`
- `admin-dashboard/js/auth.js:85` → `thewooru@gmail.com`
- `app/admin-redirect.tsx:53` → new address in the copy

**Checked — all three are safe to swap.** Two of them do gate access, but always as an *additive* OR alongside the profile role, so neither account loses anything:

| Site | What it does | Safe because |
|---|---|---|
| `AuthContext.tsx:196,398` | `isKnownPlatformAdminEmail` is OR'd into `isPlatformAdmin` (:401), forces `normalizeAppRole` → `admin` (:18), and pins `communityId = null` (:199) | `rawRole === 'admin'` already resolves from the profile row for both accounts |
| `AuthContext.tsx:144` | Picks `app_role` when *creating* a missing profile — the client-side mirror of `handle_new_user()` | Both accounts already have profiles. Keep it in sync with the DB trigger anyway. |
| `admin-dashboard/js/auth.js:90,98` | `profile.app_role !== 'admin' && !isCanonicalAdmin` → throw | Both accounts have `app_role='admin'`, so they pass on the profile check alone |

So a single-address constant is fine; it does not need to list both. Swap it to `thewooru@gmail.com` to match the DB break-glass branch and keep client and server telling the same story.

Then `node build-admin.js` and hard-refresh — `admin-dashboard/` is source only, and the browser caches the console aggressively.

### 6.5 Deploy and verify

Per `docs/CLAUDE.md` §6 the migration goes to preprod first — but preprod does not exist yet, so today this is a direct `npm run db:push:prod`. **That is the strongest argument for doing the two-environment setup before, not after, this step.** If you push straight to prod, verify immediately:

- Sign in to `/admin` as `admin@wooru.in` → community list loads (not an empty table, which is what an RLS failure looks like — see the trap in `docs/CLAUDE.md` §9)
- Sign in as the old gmail account → **should now be admin only via its profile row.** If it still works, that confirms 6.1 was true.

Only once both check out, decide whether to demote the old account. Keeping it costs nothing.

### 6.6 If you chose to keep the gmail address (decision B = no)

Skip all of §6. Nothing breaks, and the brand leak is confined to code and DB internals that no user ever sees. Revisit before you ever hand the admin console to someone else.

---

## 7. Phase 5 — external services

| Service | Action | Notes |
|---|---|---|
| **expo.dev** | Rename project → slug `wooru` | Before Phase 3. Keep the projectId. |
| **GitHub** | Rename repo → `wooru` | GitHub redirects the old URL indefinitely; Vercel's connection follows automatically. Then `git remote set-url origin https://github.com/venkatbrr/wooru.git`. |
| **Local folder** | `Society_Service_Hub/Society_Service_Hub` → `wooru` | Optional. Nothing in the repo hardcodes the absolute path; check `.mcp.json` and `.vscode/mcp.json` before moving. |
| **Supabase** | Rename prod project → `wooru-prod`; name the new one `wooru-preprod` | Cosmetic. The project **ref** (`mbzvcaoulawdugfearmj`) never changes and is what `package.json` scripts use. |
| **Supabase Auth** | Site URL → `https://wooru.in`; allow-list `https://wooru.in/**`, `https://staging.wooru.in/**`, `http://localhost:8081/**`, `wooru://**` | A wrong allow-list breaks sign-in instantly. Do it in a quiet window and test right after. |
| **Google Cloud** | **Keep the existing project** — see §7.3. Rename its display name; update the Branding page; add origins to the web client; create a new Android client for `in.wooru.app` + SHA-1. | Redirect URI stays `https://<ref>.supabase.co/auth/v1/callback` — it is keyed to the Supabase ref, not the domain. |
| **Cloudinary** | Nothing required | Same cloud, same presets. The folder name is a client-side constant; old URLs keep working. Optionally add a `wooru/` preset folder for tidiness. |
| **Vercel** | Add `wooru.in` (primary), `www.wooru.in` (redirect), `staging.wooru.in` (branch `preprod`) | This *is* §7 of the two-environment plan — do it there, not twice. |
| **Domain** | Point `wooru.in` DNS at Vercel | Records in `two-environment-setup-plan.md` §7.2 |

### 7.1 Is it OK to leave GitHub / Vercel / Supabase named "societyservicehub"?

**Short answer: yes for Supabase, yes for GitHub, no for Vercel.** None of the three ships in the app bundle, so none of them is a launch blocker — this is tidiness, with one real exception.

| Service | Leak surface | Verdict |
|---|---|---|
| **Supabase project name** | **None.** What a browser sees is `https://mbzvcaoulawdugfearmj.supabase.co` — the *ref*, a random string that never contained the brand. The name is a dashboard label and a line on an invoice. | **Fine to leave.** Renaming does not change the ref, so nothing breaks either way. |
| **GitHub repo** | Only if the repo is public — then `github.com/venkatbrr/Society_Service_Hub` is indexed and shows up against your own brand. Nothing in the app reads it. | **Fine to leave**, but renaming is genuinely free: GitHub redirects both web and git operations permanently, Vercel's link follows automatically, and issues/stars/PRs survive. Cost is one `git remote set-url`. |
| **Vercel project name** | **Real.** It determines the default `<project>.vercel.app` domain *and* every preview URL — `<project>-<branch>-<team>.vercel.app` — which get shared with testers. | **Rename now**, while no one holds the old URL. |

⚠️ **Your Vercel project is almost certainly named `commloom`, not `societyservicehub`.** `FALLBACK_SITE_URL` in [`lib/siteUrl.ts`](../../lib/siteUrl.ts) is `https://commloom.vercel.app`, and Vercel derives that host from the project name. Confirm in the dashboard before assuming which name you are cleaning up.

**Renaming the Vercel project changes its `.vercel.app` host**, so `commloom.vercel.app` stops resolving. That is normally a reason for caution — here it is the argument *for* doing it now:

- Nothing is in production and no one has the URL, so the "keep the old host as a redirect for a few weeks" step (Phase 6 of the two-environment plan) protects nobody. **That step can be dropped entirely.**
- Doing it after launch means invalidating a URL people have actually bookmarked.

✅ **Decided 2026-08-08:** project renamed `commloom` → `wooru`, choosing Vercel's **"Remove old domain"** rather than "Redirect old domain to new". Confirms the project was indeed named `commloom`.

⚠️ **Removal is permanent** — `commloom.vercel.app` returns to Vercel's global namespace and can be claimed by another account. Acceptable here only because no link to it exists outside this repo.

**Order of operations — do 1 and 2 before saving the rename.** Both dashboards accept hosts that do not resolve yet, so there is no chicken-and-egg problem, and skipping them breaks web Google sign-in the instant the rename lands.

| # | Where | Change |
|---|---|---|
| 1 | Supabase → Authentication → URL Configuration | Site URL `https://commloom.vercel.app` → `https://wooru.vercel.app`; add `https://wooru.vercel.app/**` to the redirect allow-list |
| 2 | Google Cloud → Credentials → Web OAuth client | Add `https://wooru.vercel.app` to Authorized JavaScript origins; drop the `commloom` entry. Redirect URI is unchanged — it is keyed to the Supabase ref, not the domain. |
| 3 | *(after saving)* [`lib/siteUrl.ts:14`](../../lib/siteUrl.ts#L14) | `FALLBACK_SITE_URL` → `https://wooru.in`. This is the **only** code reference to the old host, and it is the **native** fallback — web reads `window.location.origin`. An EAS build without `EXPO_PUBLIC_SITE_URL` would otherwise emit share links and an admin redirect pointing at a dead domain. |

All three get revisited once `wooru.in` itself is live (§7.2) — at that point the `.vercel.app` origins become redundant and can come off the allow-lists.

**The strongest reason to rename all three is not user-facing — it is you.** The two-environment plan ends with two Supabase projects, and `db:push:prod` vs `db:push:preprod` differ only by a 20-character ref. A dashboard listing `wooru-preprod` next to `societyservicehub@gmail.com's Project` is precisely the setup where a migration lands on the wrong environment. Consistent naming is a safety property of that plan, not decoration.

### 7.3 Google Cloud — keep the existing project ✅ decided 2026-08-08

A new project was considered and rejected. Three names exist in Google Cloud and only one is user-facing:

| Thing | Changeable | Seen by |
|---|---|---|
| Project display name | ✅ IAM & Admin → Settings | Console only |
| Project ID — `societyservicehub` | ❌ permanent | Nobody |
| Project number — `39089637830` | ❌ permanent | Nobody |
| **OAuth consent screen "App name"** | ✅ Branding page | **Every Google Sign-In user** |

The permanent identifiers are exactly the ones no end user ever sees, and the user-facing one is editable in place. A new project would mean rebuilding the consent screen, recreating every client, re-pasting the client ID and secret into Supabase's Google provider, and a window with sign-in broken — for no visible gain.

**Decisive advantage: client IDs are unchanged, so no code changes at all** — `.env`, [`app.json:40`](../../app.json#L40), [`admin-dashboard/js/auth.js:159`](../../admin-dashboard/js/auth.js#L159), and the Vercel env vars all stay as they are.

**To do in the console:**

1. **Branding** — App name → `Wooru`; support email → `thewooru@gmail.com`; logo; home page → `https://wooru.in`; privacy/terms URLs; authorized domain `wooru.in` (needs domain verification first, so likely a second pass after DNS).
2. **IAM & Admin → Settings** — rename display name to `Wooru`.
3. **IAM & Admin → IAM** — add `thewooru@gmail.com` as **Owner** if project ownership should move. This is the ownership fix that does *not* require a new project.
4. **Clients** — new Android client for `in.wooru.app` + SHA-1; update the web client's origins.
5. Check publishing status: **Testing** caps at 100 users and expires refresh tokens after 7 days. Only basic scopes (email/profile/openid) are used, so publishing to production needs no verification review.

### 7.4 The admin console hardcoded the Google client ID ✅ FIXED 2026-08-08

[`admin-dashboard/js/auth.js`](../../admin-dashboard/js/auth.js) contained a literal client ID — the same class of bug the two-environment plan fixed for the Supabase config in its §4.2, missed there because this one is an OAuth value rather than a Supabase one.

**To be clear on severity:** an OAuth **web client ID is public by design** — it ships to every browser. This was never a secret leak. It was environment coupling: preprod's admin console would have authenticated against the **prod** Google client.

**Fix:** [`build-admin.js`](../../build-admin.js) now drives substitution from a declarative `ADMIN_SUBSTITUTIONS` table mapping placeholders to env vars across multiple files, rather than the previous single-file hardcoded pair:

| Placeholder | Env var | File |
|---|---|---|
| `__SUPABASE_URL__` | `EXPO_PUBLIC_SUPABASE_URL` | `js/supabase-config.js` |
| `__SUPABASE_ANON_KEY__` | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `js/supabase-config.js` |
| `__GOOGLE_WEB_CLIENT_ID__` | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `js/auth.js` |

The build exits 1 if **any** mapped variable is missing, and again if any placeholder survives substitution.

**Both paths tested:**

- Missing env → `Missing EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` → exit 1
- Present env → all three substituted into `dist/admin/`, zero placeholders left, `admin-dashboard/` source unchanged

⚠️ **`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` must now be set at Production scope in Vercel**, alongside the two Supabase variables — the build fails without it. Adding a new placeholder means adding a new required env var.

### 7.2 What `wooru.in` unblocks in the two-environment plan

Decision **C** in that plan is now answered. Three files take the literal value:

| File | Set to |
|---|---|
| [`lib/siteUrl.ts`](../../lib/siteUrl.ts) `FALLBACK_SITE_URL` | `https://wooru.in` (currently `https://commloom.vercel.app`) |
| Vercel env `EXPO_PUBLIC_SITE_URL` | `https://wooru.in` (Production) / `https://staging.wooru.in` (Preview) |
| `eas.json` per build profile | same pair |

Plus `api/share-drop.ts` (§3.4), which that plan did not cover.

**Phase 6 of that plan is now obsolete.** It reads "keep `commloom.vercel.app` as a redirect for a few weeks, then remove it from the prod Google client's origins" — but per §7.1 the host was deleted outright, not redirected. Strike that phase; the origin cleanup it describes is folded into the table above.

---

## 8. Verification

**The gate.** After Phases 2–4, this should return only the acceptable survivors listed below:

```bash
grep -rniE "society.?service.?hub|societyservicehub|society_hub|commloom|gatebond" . \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  --exclude-dir=archive --exclude-dir=.expo
```

**Acceptable survivors:**
- the 6 applied migrations in `supabase/migrations/` containing the old admin email — immutable by rule
- `docs/archive/**` — deliberately excluded
- `supabase/.temp/linked-project.json` — CLI cache, regenerates on next `db:link`
- `docs/new_features_to_implement/*.md` — these plan documents, which necessarily name the old brand

Anything else is a miss.

**Then:**

- [ ] `npx tsc --noEmit` clean
- [ ] `npm run web` — title, PWA install prompt, splash, login screen all say Wooru
- [ ] `npm run build` — succeeds (it fails by design without Supabase env vars, per the two-env plan §4.2)
- [ ] `/admin` — title, sign-in blurb, and login with the new admin address
- [ ] `eas build --profile preview --platform android` — installs as `in.wooru.app`
- [ ] On device: Google Sign-In, password-reset deep link, one share link from a food drop
- [ ] Landing page OG preview via a link-preview debugger (this is the only way to test `api/share-drop.ts`)

---

## 9. Gotchas

1. **The admin email is a live authorization branch, not a bootstrap.** Changing it without §6.1 verified is how you lose the admin console. The overlap window in §6.2 is the whole safety mechanism.
2. **Never edit an applied migration.** `db push` tracks filenames. The old email stays in 6 files forever; a new migration supersedes it.
3. **`api/*.ts` is outside `tsconfig.json`.** `npx tsc --noEmit` — the repo's only validation gate — does not see `api/share-drop.ts`. A typo there ships silently.
4. **`admin-dashboard/` has no bundler.** Editing it is not enough; `node build-admin.js` copies it to `dist/admin/`, and browsers cache the console hard.
5. **Slug rename order.** expo.dev first, `app.json` second. The reverse fails the next build with a slug mismatch.
6. **Keep the EAS `projectId`.** Renaming the project preserves push-token registrations; recreating it invalidates every one.
7. **Android package change has no upgrade path.** It is a different app. Free today; after the first Play Store upload it means a new listing and lost installs.
8. **The Android SHA-1 is registered per package.** A new package with no matching OAuth client means native Google Sign-In fails with an opaque error.
9. **Old Cloudinary URLs keep working** and should be left alone — they are absolute URLs already persisted in the database. There is nothing to migrate.
10. **Do the rebrand before the two-environment setup**, or you configure Vercel domains, Supabase Auth URLs, and Google OAuth origins twice.
11. **`docs/archive/` is out of scope.** Rewriting history there destroys the record `docs/README.md` says it exists to preserve.

---

## 10. Suggested order

```
1. Answer §1 (A–E)
2. Phase 2 — strings, docs, landing page                    [no external deps]
3. §5.0 prep — expo.dev slug, Android OAuth client, Supabase allow-list
4. Phase 3 — identifiers, then dev build + sign-in test
5. §6.1 → §6.2 — verify fallback, create admin@wooru.in, overlap both admins
6. Resume two-environment-setup-plan.md with <DOMAIN> = wooru.in
   (preprod exists from here on — the migration below gets tested properly)
7. §6.3–6.5 — admin email migration, preprod first
8. Domain cutover to wooru.in (commloom.vercel.app already deleted — see §7.1)
```

Steps 6 and 7 are deliberately interleaved: the admin-email migration is the single riskiest change in this plan, and it is the one change that most deserves a staging environment to land on first.

---

## 11. Go-live runbook — the 8 remaining items

Everything in the repo is done and committed as `bcbd5d0` on branch `rebrand/wooru`. All 8 remaining items live in external dashboards.

**They are grouped by dependency, not by convenience.** Within a group, order does not matter. Across groups it does — the ordering notes are the whole point of this section.

### Group A — independent, do now

| # | Item | Verify |
|---|---|---|
| ~~**1**~~ | ✅ **DONE 2026-08-08** — `20260901000000_rebrand_platform_admin_email.sql` applied to prod | Verified: migration recorded; both functions contain `thewooru@gmail.com` and **zero** `societyservicehub` occurrences; both admins return `is_platform_admin = true` |
| ~~**2**~~ | ✅ **DONE 2026-08-08** — see §11.1. Turned out to be far bigger than "add one variable". | Verified by `vercel env pull`: all 6 read back correct, no trailing whitespace |
| **3** | **Google Cloud → Branding:** App name → `Wooru`, support email, logo, home page, privacy/terms | Start a Google sign-in; the consent dialog should say Wooru |

### 11.1 ⚠️ Vercel had **zero** environment variables

The task was "add `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`". `vercel env ls` returned **nothing at all** — not one variable had ever been set.

**Why the site worked anyway:** `.env` was committed to git, so every build read its configuration straight from the repo. Commit `d8bab61` untracked it (correctly — two-environment plan §4.1). From that commit onward **the next deploy would have shipped with no configuration**: an undefined Supabase URL in the bundle, and `build-admin.js` exiting 1. That breakage was latent and unrelated to the rebrand.

**Set at both Production and Preview scope:**

| Variable | Value |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `https://mbzvcaoulawdugfearmj.supabase.co` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_…` |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `39089637830-…` |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` | `xetj8taj` |
| `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | `society_hub_unsigned` — old preset, changes with §11 Group C |
| `EXPO_PUBLIC_SITE_URL` | `https://wooru.vercel.app` — **becomes `https://wooru.in` at Group D cutover** |

`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` deliberately **not** set — its `.env` value is the literal placeholder `your-ios-client-id.apps.googleusercontent.com`.

**Two deliberate choices worth revisiting:**

1. **Created with `--no-sensitive`.** Vercel's CLI now defaults to *Sensitive*, which is write-only — unreadable afterwards even via `vercel env pull`. Every one of these is an `EXPO_PUBLIC_*` value inlined into the browser bundle, so it is public by construction; marking it secret buys nothing and costs the ability to audit it. Recreated as readable and verified by readback.
2. **Preview scope points at *prod*.** The two-environment plan wants Preview pointing at preprod — but preprod does not exist yet, so the choice was between previews that hit prod and previews that fail to build. Pre-launch, with no real users, working previews win. ⚠️ **Repoint Preview to preprod the moment it exists** — that is the whole safety property of that plan.

### 11.2 Vercel naming — already clean, no action needed

An earlier draft of this section claimed the account slug `societyservicehub-6292` appears in preview URLs and needed renaming. **That was wrong**, and it is recorded here so nobody acts on it.

Verified 2026-08-08:

| Thing | Value | Status |
|---|---|---|
| Team name / slug | `wooru` | ✅ already renamed |
| Project name | `wooru` | ✅ already renamed |
| Personal account username | `societyservicehub-6292` | Cosmetic only — no project lives under it |

A Vercel deployment URL is `<project>-<hash>-<team-slug>.vercel.app`. The slug is the **team** slug, not the personal username, and the team is already `wooru`. Next deploy will be `wooru-<hash>-wooru.vercel.app`.

Historical URLs like `commloom-9dp7cm4p1-society-service-hub.vercel.app` show what the names were *at deploy time*. Vercel deployment URLs are immutable per deployment, so old ones keep the old names permanently. They are unlinked and unguessable without the hash — a record of the past, not a live leak. `vercel remove commloom --safe` prunes them if desired.

**Optional tidiness only:** rename the personal username at `vercel.com/account/general`; prune old `commloom-*` deployments.

### Group B — native ⏸️ DEFERRED (decided 2026-08-08)

**There is no Android app and none will be published for now.** The rename is done in code and that is all that was required:

| Already done | Value |
|---|---|
| `app.json` `android.package` | `in.wooru.app` |
| `app.json` `ios.bundleIdentifier` | `in.wooru.app` (pinned; was unset) |
| `app.json` `scheme` | `wooru` |
| `lib/auth.ts` reset redirect | `wooru://reset-password` |

**Nothing else is mandatory.** Web is unaffected by every item below — `getSiteUrl()` reads `window.location.origin` on web, and the `wooru://` deep link is simply unused without a native build.

**Deferred until the first native build is actually wanted** — do them in this order then, because each depends on the one before:

| Order | # | Item |
|---|---|---|
| B1 | 5 | expo.dev → rename project slug to `wooru` (keep the `projectId`) — `eas build` fails on a slug mismatch until this matches |
| B2 | 4 | Google Cloud → new Android client for `in.wooru.app` + keystore SHA-1 (`eas credentials`) |
| B3 | 6 | `npx expo prebuild --clean` — `/android` on disk is still built against `com.gatebond.app` |
| B4 | — | `eas build --profile preview --platform android`; test Google Sign-In and the password-reset deep link |

Also deferred, and only relevant to native: `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `app.json`'s `iosUrlScheme` are both still literal placeholders — iOS Google Sign-In has never been configured. Log it in [`disabled-features.md`](../disabled-features.md) if iOS stays out of scope.

### Group C — Cloudinary ✅ DONE 2026-08-08

The existing preset was **renamed in place** (`society_hub_unsigned` → `wooruin`) and its asset folder changed to `wooru` — rather than creating a new preset. Renaming avoids the settings-drift risk of rebuilding a preset from defaults, which was the main hazard here.

| Done | |
|---|---|
| Preset name | `society_hub_unsigned` → **`wooruin`** |
| Preset asset folder | `society_hub` → **`wooru`** |
| `.env` | `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET=wooruin` |
| Vercel Production + Preview | same, verified by readback |

⚠️ **Renaming a preset breaks uploads until every consumer is updated** — the app posts `upload_preset=<name>`, and the old name 404s the instant it changes. `.env` and Vercel were updated immediately; **a redeploy is still required** for the live site to pick it up.

#### Verified against the live Cloudinary API

Both code paths were exercised with real uploads, not assumed:

| Path | Call sites | Result |
|---|---|---|
| **No `folder` param** | [`app/services/add.tsx:464`](../../app/services/add.tsx#L464), [`app/services/[id].tsx:756`](../../app/services/[id].tsx#L756) | `secure_url` → `/upload/v…/<id>.png`, `asset_folder: wooru` |
| **`folder=wooru/<sub>`** | the other 8 `<ImageUploader>` usages | `secure_url` → `/upload/v…/wooru/<sub>/<id>.png`, `asset_folder: wooru` |

**The client-supplied `folder` is honoured** — the risk that an unsigned preset would reject or ignore it does not apply here.

#### Cloudinary has two independent folder concepts

Worth recording, because the first test run was confusing until this was clear:

- **`folder` upload param** → becomes the **public_id prefix**, and therefore appears in the URL. This is what [`lib/cloudinary.ts:75`](../../lib/cloudinary.ts#L75) sets.
- **Preset "Asset folder"** → media-library organization only. Does **not** affect the URL.

So the two no-subfolder call sites still produce URLs with no path prefix; they are merely filed under `wooru` in the library. That is cosmetic — the `secure_url` is what gets persisted to the database.

🧹 **Cleanup owed:** four 1×1 test PNGs were uploaded during verification and cannot be removed without the API secret. Delete them in the media library:
`xasvpb0nk3oinelatwdl` · `fwq7mdeyl7iz8awipyuh` · `wooru/testsub/hgolrxw9cwhnjlckd8be` · `wooru/testsub/lgfps6cy4y62phxdglvr`

### Group D — domain cutover, last

| Order | # | Item |
|---|---|---|
| D1 | **8** | Point `wooru.in` DNS at Vercel — records in [`two-environment-setup-plan.md`](two-environment-setup-plan.md) §7.2 |
| D2 | — | Vercel → Domains: add `wooru.in` as **primary**, `www.wooru.in` **redirecting to apex** (decision **E**) |
| D3 | — | Wait for TLS on both |
| D4 | — | Supabase → Auth → **Site URL** → `https://wooru.in` (allow-list already has the entries) |
| D5 | — | Google Cloud → Branding → **authorized domain** `wooru.in` — only possible once the domain verifies, which is why it is here and not in Group A |
| D6 | — | **Test Google sign-in on `wooru.in` before announcing anything** |
| D7 | — | Remove the four `localhost` entries from the Supabase redirect allow-list |

**Decision E — recommendation: apex canonical** (`wooru.in`, with `www` redirecting). One canonical origin means one set of OAuth origins and no duplicate-content ambiguity. The Google web client already has all three origins registered, so either choice works without further console work.

D7 is the production-hardening step flagged during the auth-config review — keep the localhost entries until you are done developing against prod.

### Deliberately *not* in this runbook

- **`FALLBACK_SITE_URL` is already `https://wooru.in`**, set ahead of DNS. Until D3 completes, **native builds must set `EXPO_PUBLIC_SITE_URL` explicitly** or share links point at a domain that does not resolve.
- **Preprod** — everything here targets prod only. Resume [`two-environment-setup-plan.md`](two-environment-setup-plan.md) afterwards; its decision **C** is now resolved.
- **Pushing `rebrand/wooru`** — do #2 first, or the preview build fails.

### Sequencing summary

```
A(1,2,3) ──┬── B1(5) → B2(4) → B3(6) → B4 test
           ├── C1(7) → C2 → C3 test
           └── D1(8) → D2 → D3 → D4 → D5 → D6 → D7
```

Group A gates nothing but should happen first because #2 unblocks all deploys. B, C, and D are independent of each other and can run in parallel.
