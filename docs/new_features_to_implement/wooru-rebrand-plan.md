# Rebrand: Society Service Hub → Wooru

**Owner:** Venkat
**Created:** 2026-08-08 · **Last updated:** 2026-08-08
**Goal:** Remove every trace of "Society Service Hub" (and the two stray brands, `commloom` and `gatebond`) from the repo and the surrounding services, and establish **Wooru** on **wooru.in** as the single name — before the first production release.

**Why now:** nothing is in production, no user has installed the app, no link has been shared. Every item in §5 (identifier changes) is free today and expensive after launch. This is the last cheap moment.

**Relationship to [`two-environment-setup-plan.md`](two-environment-setup-plan.md):** that plan is blocked on decision **C — pick a domain**. This plan answers it: `wooru.in`. Do the rebrand **first**, then resume that plan — otherwise you configure Vercel domains, Google OAuth origins, and Supabase Auth URLs twice.

---

## 0. Status at a glance

| Phase | What | Blocked by |
|---|---|---|
| 1 | Lock the naming table (§2) | You — §1 |
| 2 | User-facing strings — 20 files | Phase 1 |
| 3 | Identifiers — scheme, package, slug, PWA, npm | Phase 1 + external prep (§5.0) |
| 4 | Platform admin email → DB migration | Decision **B** |
| 5 | External services — Expo, Google, Supabase, Cloudinary, GitHub | Phases 1–4 |
| 6 | Domain cutover — resume the two-environment plan | Phase 5 |

Phases 2 and 3 are the only ones that touch code. Phase 4 is one migration. Phase 5 is all dashboards.

---

## 1. Decisions I need from you

Everything else is derivable.

| # | Decision | Recommendation | Why it matters |
|---|---|---|---|
| **A** | **Exact display name.** Is it `Wooru`, or `Wooru` plus a descriptor (e.g. "Wooru — Community OS")? | `Wooru` alone as the product name; use a descriptor only in `<title>` and meta tags | Sets ~20 user-facing strings and the PWA `name`/`short_name` |
| **B** | **Platform admin email.** Keep `societyservicehub@gmail.com`, or move to `admin@wooru.in`? | Move — but see §6, this is the one item that can lock you out | It is a **live authorization branch** inside `is_platform_admin()`, not just a signup bootstrap |
| **C** | **Android package.** Keep `com.gatebond.app`, or change to `in.wooru.app`? | Change. Free today, permanent after the first Play Store upload | A package change is a *different app* — no upgrade path, and it needs a new Google Android OAuth client |
| **D** | **Rename the GitHub repo and local folder?** | Yes for GitHub (it redirects); local folder is optional | Cosmetic, but `Society_Service_Hub` is in the clone URL you'll paste for years |
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
| Platform admin email | `societyservicehub@gmail.com` | `admin@wooru.in` *(decision B)* |
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

## 4. Phase 2 — user-facing strings

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

### 5.1 The edits

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

### 6.1 Before anything, confirm the fallback works

The profile branch of `is_platform_admin()` must already be true for your account, so removing the email branch is survivable:

```sql
SELECT p.id, p.email, p.app_role, p.community_id
FROM public.profiles p
WHERE p.app_role = 'admin' AND p.community_id IS NULL;
```

If your account is not in that result, **stop** — fix the profile row first. Everything below assumes it is.

### 6.2 Create the new identity

1. Provision `admin@wooru.in` — Google Workspace, Zoho Mail (free tier), or a registrar catch-all forward. It must be able to receive mail (password reset, email confirmation).
2. Sign up in the app with that address so an `auth.users` row exists.
3. Promote it:

```sql
UPDATE public.profiles
SET app_role = 'admin'::public.app_role_type, community_id = NULL
WHERE email = 'admin@wooru.in';
```

Now **two** accounts are platform admins. That overlap is the safety margin — do not skip it.

### 6.3 The migration

New file, e.g. `supabase/migrations/20260901000000_rebrand_platform_admin_email.sql`.

⚠️ **Do not edit the 6 existing migrations that contain the old email.** `supabase db push` tracks migrations by *filename*, not content — an edit reports "up to date" and never lands (`docs/CLAUDE.md` §9). They stay as a historical record; the new migration supersedes them via `CREATE OR REPLACE`.

The migration should:

1. `CREATE OR REPLACE FUNCTION public.is_platform_admin(...)` with `admin@wooru.in` in the break-glass branch.
2. `CREATE OR REPLACE FUNCTION public.handle_new_user()` with the same address in its `CASE`.
3. Optionally backfill: `UPDATE public.profiles SET app_role='admin', community_id=NULL WHERE email='admin@wooru.in';` — idempotent, harmless if 6.2 already ran.
4. End with `NOTIFY pgrst, 'reload schema';`.

Keep the signatures byte-identical — `is_platform_admin` is `STABLE SECURITY DEFINER SET search_path = public` and is referenced by dozens of RLS policies. A changed signature would need `DROP FUNCTION` first, which would cascade.

### 6.4 The client side

- `context/AuthContext.tsx:15` → `admin@wooru.in`
- `admin-dashboard/js/auth.js:85` → `admin@wooru.in`
- `app/admin-redirect.tsx:53` → new address in the copy

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
| **Google Cloud** | Web client: add origins `https://wooru.in`, `https://www.wooru.in`, `https://staging.wooru.in`. New Android client for `in.wooru.app` + SHA-1. | Redirect URI stays `https://<ref>.supabase.co/auth/v1/callback` — it is keyed to the Supabase ref, not the domain. |
| **Cloudinary** | Nothing required | Same cloud, same presets. The folder name is a client-side constant; old URLs keep working. Optionally add a `wooru/` preset folder for tidiness. |
| **Vercel** | Add `wooru.in` (primary), `www.wooru.in` (redirect), `staging.wooru.in` (branch `preprod`) | This *is* §7 of the two-environment plan — do it there, not twice. |
| **Domain** | Point `wooru.in` DNS at Vercel | Records in `two-environment-setup-plan.md` §7.2 |

### 7.1 What `wooru.in` unblocks in the two-environment plan

Decision **C** in that plan is now answered. Three files take the literal value:

| File | Set to |
|---|---|
| [`lib/siteUrl.ts`](../../lib/siteUrl.ts) `FALLBACK_SITE_URL` | `https://wooru.in` (currently `https://commloom.vercel.app`) |
| Vercel env `EXPO_PUBLIC_SITE_URL` | `https://wooru.in` (Production) / `https://staging.wooru.in` (Preview) |
| `eas.json` per build profile | same pair |

Plus `api/share-drop.ts` (§3.4), which that plan did not cover.

`commloom.vercel.app` stays live as a redirect for a few weeks (Phase 6 of that plan), then comes off the Google client's origin list.

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
8. Domain cutover, retire commloom.vercel.app
```

Steps 6 and 7 are deliberately interleaved: the admin-email migration is the single riskiest change in this plan, and it is the one change that most deserves a staging environment to land on first.
