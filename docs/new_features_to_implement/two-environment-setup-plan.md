# Preprod + Prod: Two-Environment Setup

**Owner:** Venkat
**Created:** 2026-08-08 · **Last updated:** 2026-08-08
**Goal:** Go from one production environment to exactly two — **preprod** (staging) and **prod** — across Supabase, Vercel, Google OAuth, Cloudinary, and EAS, on a custom domain.

---

## 0. Status at a glance

| Phase | What | Status |
|---|---|---|
| 0 | Repo prep — make the codebase environment-aware | ✅ **Done** (2026-08-08) |
| — | Prod audit — establish a known-good baseline | ✅ **Done** (2026-08-08) |
| 1 | Create + populate the preprod Supabase project | ⛔ **Blocked** — needs the project created |
| 2 | Vercel branch, env vars, build config | ⛔ **Blocked** — needs Phase 1 |
| 3 | Domain + DNS | ⏸️ **Waiting** — domain not chosen yet |
| 4 | Google OAuth + Cloudinary per environment | ⛔ **Blocked** — needs Phases 1 and 3 |
| 5 | EAS mobile build profiles | ⛔ **Blocked** — needs Phase 1 |
| 6 | Retire the old `*.vercel.app` URL | ⛔ **Blocked** — needs Phase 3 |

**Nothing is committed.** All Phase 0 changes are in the working tree for review.

---

## 1. What I need from you

This is the whole list. Everything else is either done or derivable from these.

### 1.1 Blocking — needed to make any further progress

| # | What | Why I can't do it myself |
|---|---|---|
| **A** | **Create the preprod Supabase project.** Dashboard → New project. Same organization, **same region** as prod. Name it `wooru-preprod`. Then send me the **project ref** (the 20-char string in the project URL). | The Supabase MCP server is scoped to a single project and exposes no `create_project` tool. The CLI *could* do it via `supabase projects create`, but that provisions billable infrastructure under your organization — that's your decision to make, not mine. |
| **B** | **Give me MCP access to preprod.** Either repoint the existing MCP server, or add a second entry (e.g. `supabase-preprod`) in `.mcp.json`. Setup steps are in [`../supabase-mcp.md`](../supabase-mcp.md). | The current MCP connection only reaches prod. Without this I can't verify preprod's schema matches. |
| ~~**C**~~ | ✅ **Resolved** — the domain is `wooru.in`. See §3. DNS is not yet pointed at Vercel; the live host remains `wooru.vercel.app` in the meantime. | — |

### 1.2 Non-blocking — decisions I need eventually

| # | What | Default if you don't care |
|---|---|---|
| **D** | Fix the three prod findings in §14 (edge functions never deployed, fraud check inert, reminders never fire)? | Leave them; fix on preprod first once it exists |
| **E** | Apex or `www` as the canonical URL? | Apex, with `www` redirecting to it |
| **F** | Password-protect staging, or just `noindex`? | `noindex` — password protection needs Vercel Pro |
| **G** | Separate Android package for preprod builds? | No — only needed if you want both apps installed at once |

### 1.3 One thing to do before anything else

⚠️ **Three migrations are applied to prod but untracked in git:**

```
supabase/migrations/20260831000000_parent_corner_fixes.sql
supabase/migrations/20260831000100_secure_visit_rpcs.sql
supabase/migrations/20260831000200_visit_capacity_and_lifecycle.sql
```

They're live on prod but not committed. **Commit them before preprod is created**, or preprod gets built from an incomplete history and diverges from prod on day one.

---

## 2. Target topology

| Layer | Preprod | Prod |
|---|---|---|
| Supabase project | new — `wooru-preprod` | existing — `mbzvcaoulawdugfearmj` |
| Database contents | fake seed data | real |
| Git branch | `preprod` | `main` |
| Vercel | same project, `preprod` branch | same project, `main` branch |
| Web URL | `staging.wooru.in` | `wooru.in` + `www.wooru.in` |
| Admin console | `staging.wooru.in/admin` | `wooru.in/admin` |
| Google OAuth client | new, separate | existing |
| Cloudinary | same cloud, `preprod/` folder + own preset | existing preset |
| Mobile (EAS) | `preview` profile | `production` profile |

**Promotion flow:**

```
feature/* → PR → preprod → verify on staging.wooru.in → PR → main → prod
```

### Why one Vercel project rather than two

A single project keeps env vars, domains, and build settings in one place, and Vercel's **Preview** scope automatically gives every feature-branch preview the preprod Supabase keys — which is exactly the safe default. Two separate projects would double the configuration and point feature previews at prod.

---

## 3. The domain ✅ decided — `wooru.in`

This section used to carry a `<DOMAIN>` placeholder. The domain is now settled as **`wooru.in`**, purchased alongside the rebrand — see [`wooru-rebrand-plan.md`](wooru-rebrand-plan.md).

| Where | Value | Status |
|---|---|---|
| [`../../lib/siteUrl.ts`](../../lib/siteUrl.ts) | `FALLBACK_SITE_URL = 'https://wooru.in'` | ✅ done 2026-08-08 |
| [`../../api/share-drop.ts`](../../api/share-drop.ts) | `APP_ORIGIN` reads `EXPO_PUBLIC_SITE_URL`, falls back to `https://wooru.in` | ✅ done 2026-08-08 |
| Vercel env vars (§6.2) | `https://wooru.in` (Production) / `https://staging.wooru.in` (Preview) | ⛔ pending |
| [`../../eas.json`](../../eas.json) (§9) | `EXPO_PUBLIC_SITE_URL` per build profile | ⛔ pending — `eas.json` still has no `env` blocks at all |

Plus the dashboard-only settings in §7 and §8 (Vercel domains, Supabase Auth URLs, Google OAuth origins). None of those live in git.

⚠️ **`wooru.in` DNS is not pointed at Vercel yet.** Until it resolves, the live host is `wooru.vercel.app` — which is what Supabase's Site URL and the Google OAuth origins currently point at. `FALLBACK_SITE_URL` is deliberately set ahead of DNS, so **native builds must set `EXPO_PUBLIC_SITE_URL` explicitly** until the domain is live.

Everything else already reads the origin dynamically, so the domain choice does not ripple into application code.

---

## 4. Phase 0 — repo prep ✅ DONE

The codebase had four things that would have leaked prod into preprod. All are fixed; `npx tsc --noEmit` passes.

### 4.1 `.env` was committed to git

`.gitignore` only excluded `.env*.local`, so `.env` — Supabase URL, anon key, Google client IDs, Cloudinary config — was tracked and present in every checkout and every branch build.

**Done:**
- `git rm --cached .env` (file remains on disk; the staged `D` is index-only)
- `.gitignore` now excludes `.env`
- Added [`../../.env.example`](../../.env.example) with every variable documented and blank

### 4.2 The admin console hardcoded prod credentials

[`../../admin-dashboard/js/supabase-config.js`](../../admin-dashboard/js/supabase-config.js) contained the literal prod URL and anon key. The admin console is plain files copied verbatim by `build-admin.js` — it has **no bundler**, so it can never read `process.env` at runtime.

**Done:**
- Config file now uses `__SUPABASE_URL__` / `__SUPABASE_ANON_KEY__` placeholders
- [`../../build-admin.js`](../../build-admin.js) substitutes them into `dist/admin` at build time from `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- The build **exits 1** if either variable is missing, rather than shipping a broken dashboard
- Both paths tested — missing-env fails, present-env substitutes correctly

⚠️ **Consequence:** the Vercel build now fails without those env vars. Set them at Production scope (§6.2) **before merging this branch**.

### 4.3 `public/admin/` was a committed duplicate

`build-admin.js` copied the admin console into *both* `dist/admin` and `public/admin` — and `public/admin/` (11 files) was committed, carrying the same hardcoded prod credentials as a stale second copy.

**Done:**
- Untracked all 11 files and added `public/admin/` to `.gitignore`
- Removed the redundant `public/admin` copy from `build-admin.js`

`dist/admin` is written directly by `build-admin.js` after `expo export`, so nothing depended on the `public/admin` copy.

### 4.4 Eight hardcoded absolute URLs

Every share link repeated the same `Platform.OS === 'web' ? window.location.origin : '<hardcoded>'` ternary. **Seven of the eight pointed at `society-service-hub.app` — a domain that is not your live host, so native share links were already broken**, independently of this work.

| File | Was |
|---|---|
| `app/admin-redirect.tsx` | `https://wooru.in/admin/index.html` |
| `app/mcn/drops/[id].tsx` | `https://society-service-hub.app/api/share-drop?id=…` |
| `app/provider/[id].tsx` | `https://society-service-hub.app/provider/…` |
| `app/visits/[id].tsx` | `https://society-service-hub.app/visits/…` |
| `components/McnListingCard.tsx` | `https://society-service-hub.app/mcn/listing/…` |
| `components/PreorderDropCard.tsx` | `https://society-service-hub.app/mcn/drops?id=…` |
| `components/ProviderCard.tsx` | `https://society-service-hub.app/provider/…` |
| `components/VisitCard.tsx` | `https://society-service-hub.app/visits/…` |

**Done:** added [`../../lib/siteUrl.ts`](../../lib/siteUrl.ts) and replaced all eight with `siteUrl('/path')`.

```ts
export function getSiteUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;   // preprod links stay on preprod
  }
  const configured = process.env.EXPO_PUBLIC_SITE_URL;
  return (configured || FALLBACK_SITE_URL).replace(/\/+$/, '');
}
```

This also fixes the broken native share links as a side effect.

### 4.5 `db:link` hardcoded the prod project ref

With two projects, a stale link is how a preprod migration lands on prod.

**Done:** every DB script is now environment-suffixed, with no unqualified `db:push`:

```
db:push:preprod   db:push:prod
types:preprod     types:prod
fn:deploy:preprod fn:deploy:prod
db:link:preprod   db:link:prod
```

The `:preprod` scripts contain a literal `PREPROD_REF_TODO` placeholder — they fail loudly instead of silently targeting prod. Replace once you send me the ref.

### 4.6 Documentation

[`../CLAUDE.md`](../CLAUDE.md) updated with the new commands, the preprod-first migration workflow, and four new entries in the traps table — per the repo's own doc-sync rule.

---

## 5. Phase 1 — Supabase preprod ⛔ BLOCKED on §1.1-A

### 5.1 Create the project

Same org, **same region** as prod (so latency behaviour matches). Record the project ref, anon key, and DB password.

**Free-plan caveat:** a free organization allows two active projects, so this costs nothing — but free projects **pause after ~7 days of inactivity**, and a paused preprod is a confusing failure mode. Either accept manual un-pausing, or plan to touch staging weekly.

**On Supabase Branching:** it's the official alternative to a second project, but it's a paid, per-branch feature aimed at *ephemeral* PR databases. For a persistent two-environment setup, a second project is simpler and cheaper. Not recommended here.

### 5.2 Replay the migrations

124 migration files. Applying them to an empty project both builds preprod *and* proves the migration history genuinely reproduces prod.

```bash
npm run db:push:preprod    # replay all 124
npm run types:preprod      # regenerate lib/database.types.ts
# re-append the hand-maintained enriched types block — see docs/CLAUDE.md §6
npx tsc --noEmit
```

### 5.3 Drift check — do not skip

`supabase db diff --linked` is the textbook tool, but it needs a Docker shadow database and **Docker is not installed on this machine**. Rather than make Docker a prerequisite, the check runs as pure SQL.

[`../../supabase/checks/schema-fingerprint.sql`](../../supabase/checks/schema-fingerprint.sql) hashes the `public` schema in ten sections — columns, constraints, indexes, policies, RLS flags, functions, triggers, enums, extensions, migrations. Run it on both projects and compare. A differing *section* tells you exactly where the drift is, which a single whole-schema hash would not.

The prod baseline is already captured in [`../../supabase/checks/baseline-prod.md`](../../supabase/checks/baseline-prod.md). **Recapture it after every push to prod.**

**Already verified (2026-08-08):** prod has exactly the same 124 migrations as `supabase/migrations/`, with an identical version fingerprint (`5ca9a420…`). That proves the same *files* were applied. It does **not** prove the resulting schema is identical — a dashboard-made edit would not show up in that check. Sections 02–09 of the fingerprint cover that, and can only be compared once preprod exists.

Any mismatch is a prod-only change never captured as a migration. Fix it by writing a catch-up migration and applying it to both — never by hand-editing one environment to match the other.

### 5.4 Auth configuration (dashboard-only — not in git)

**Preprod** → Authentication → URL Configuration:
- Site URL: `https://staging.wooru.in`
- Redirect allow-list:
  - `https://staging.wooru.in/**`
  - `http://localhost:8081/**`
  - `societyservicehub://**` — the native deep link, used by `lib/auth.ts` for password reset

**Prod** — at cutover only (§7), change Site URL from the current `*.vercel.app` value to `https://wooru.in` and add `https://wooru.in/**` to the allow-list.

Also per-project and **not** captured in git: Google provider credentials, email templates, rate limits, JWT expiry. **Write down anything you change** — these are the easiest settings to lose.

### 5.5 Edge functions

Two exist in the repo: `check_due_services` and `fraud-check`. Both read `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase injects automatically per project — no secret plumbing needed.

⚠️ **Neither is currently deployed anywhere — prod has zero edge functions.** See §14. Preprod is the right place to test them before they ever reach prod.

```bash
npm run fn:deploy:preprod
```

### 5.6 Cron — currently a no-op, on prod too

`20260426000000_add_user_services.sql` tries to schedule `check-due-services` via `pg_cron` inside a conditional `DO` block that silently takes the `ELSE` branch when the extension is absent.

**`pg_cron` is not installed on prod.** Installed extensions are exactly: `pg_stat_statements`, `pg_trgm`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`.

For preprod this is convenient — the same block will no-op there too, so preprod cannot fire notification jobs by accident. **Do not enable `pg_cron` on preprod** unless actively testing reminders, and if you do, pair it with the fake seed data below.

If you fix this on prod, do it **in a migration** (`create extension if not exists pg_cron;` then the schedule), not through the dashboard — dashboard changes are exactly how drift starts.

### 5.7 Preprod data

**Do not clone prod data.** It's real residents' names, flat numbers, and phone numbers, and preprod is the environment with test notifications going out and weaker access discipline.

Write `supabase/seed/preprod-seed.sql` (kept **outside** `migrations/`) creating:
- 2 fake communities
- ~10 users spanning all four roles — `admin`, `resident`, `president`, `vice_president`
- a handful of providers, visits, and drops
- phone numbers you own, or obviously invalid ones

### 5.8 Storage

Images go to **Cloudinary** ([`../../lib/cloudinary.ts`](../../lib/cloudinary.ts)), not Supabase Storage — no buckets to replicate. See §8.2.

---

## 6. Phase 2 — Vercel ⛔ BLOCKED on Phase 1

**Direct answer to "any changes needed for Vercel?"** — yes, but they're almost entirely *configuration*. [`../../vercel.json`](../../vercel.json) itself needs only the optional `noindex` header in §7.4; its rewrites and redirects are environment-agnostic and stay as they are.

### 6.1 Git settings

- **Settings → Git → Production Branch:** `main`
- Preview deployments enabled (default)

```bash
git checkout -b preprod && git push -u origin preprod
```

Then on GitHub: require PRs into `main`, no direct pushes.

### 6.2 Environment variables

**Settings → Environment Variables.** Every variable is set **twice** — once at *Production* scope, once at *Preview*.

| Variable | Production | Preview |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | prod project URL | preprod project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | prod anon key | preprod anon key |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | prod web client | preprod web client |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` | prod iOS client | preprod iOS client |
| `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` | same | same |
| `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | prod preset | `preprod_unsigned` |
| `EXPO_PUBLIC_SITE_URL` | `https://wooru.in` | `https://staging.wooru.in` |

Leaving *Preview* unrestricted rather than pinning it to the `preprod` branch is deliberate: every feature-branch preview then points at preprod, which is the safe default.

### 6.3 Build settings

Confirm under **Settings → Build & Deployment**:
- Build command: `npm run build` → `expo export --platform web && node build-admin.js`
- Output directory: `dist`

After §4.2, the build fails loudly if Supabase env vars are missing — by design.

### 6.4 The serverless function

[`../../api/share-drop.ts`](../../api/share-drop.ts) reads `EXPO_PUBLIC_SUPABASE_URL` / `_ANON_KEY` from `process.env` at request time, so it automatically follows the deployment's scope. No change needed — it just starts behaving correctly once the vars are scoped.

---

## 7. Phase 3 — domain + DNS ⏸️ WAITING on §1.1-C

### 7.1 Buying

Any registrar works. Buying through Vercel is the least effort (DNS auto-configured); Cloudflare or Namecheap are cheaper. Nothing here depends on the registrar.

### 7.2 DNS records

If you buy at Vercel: nothing to do manually.

Otherwise, either delegate nameservers to Vercel, or keep your registrar's DNS and add:

| Host | Type | Value |
|---|---|---|
| `@` (apex) | `A` | `76.76.21.21` |
| `www` | `CNAME` | `cname.vercel-dns.com` |
| `staging` | `CNAME` | `cname.vercel-dns.com` |

Vercel prints the exact current values when you add each domain — **use what the dashboard shows**, in case these have changed.

### 7.3 Domain assignment

**Project → Settings → Domains:**

1. `wooru.in` → production branch (`main`); set as primary
2. `www.wooru.in` → redirect to apex
3. `staging.wooru.in` → **set Git Branch = `preprod`**

Step 3 is the key one: a branch-assigned domain always serves that branch's latest deployment, so staging gets a stable URL instead of a per-commit preview hash.

TLS certificates issue automatically once DNS resolves.

### 7.4 Keep staging out of Google

Add to `vercel.json`:

```json
"headers": [
  {
    "source": "/(.*)",
    "has": [{ "type": "host", "value": "staging.wooru.in" }],
    "headers": [{ "key": "X-Robots-Tag", "value": "noindex, nofollow" }]
  }
]
```

On Vercel Pro, also enable **Deployment Protection → Password Protection** for previews.

### 7.5 Cutover checklist

- [ ] Update prod Supabase Site URL + redirect allow-list (§5.4)
- [ ] Add the new domain to the prod Google OAuth client (§8.1)
- [ ] Update `FALLBACK_SITE_URL` in `lib/siteUrl.ts` (§3)
- [ ] **Test Google sign-in on prod at the new domain before announcing it**

---

## 8. Phase 4 — third-party services ⛔ BLOCKED on Phases 1 and 3

### 8.1 Google OAuth

Create a **second Web OAuth client** — same Google Cloud project is fine — named `Wooru — Preprod`.

**Preprod client:**
- Authorized JavaScript origins: `https://staging.wooru.in`, `http://localhost:8081`
- Authorized redirect URI: `https://<PREPROD_REF>.supabase.co/auth/v1/callback`

**Prod client** — add alongside existing entries:
- Origins: add `https://wooru.in`, `https://www.wooru.in`
- Redirect URI unchanged: `https://mbzvcaoulawdugfearmj.supabase.co/auth/v1/callback`

Paste each client ID + secret into the matching Supabase project's Google provider settings.

⚠️ **Native Android:** the SHA-1 fingerprint of the build's signing key must be registered on an Android OAuth client. If preprod builds use a different keystore, register that fingerprint too — this is the most common native-auth failure when adding an environment.

### 8.2 Cloudinary

One account is fine. Create a second **unsigned upload preset** named `preprod_unsigned` with its target folder set to `preprod/`. Keeps test uploads out of the production media library and makes them bulk-deletable.

### 8.3 Expo push notifications

The EAS `projectId` in [`../../app.json`](../../app.json) is **shared** across both environments, and should stay that way — push tokens are per-device-per-EAS-project, and splitting it would force every device to re-register.

Separation comes from the *database*: preprod tokens live in the preprod DB, so preprod code can only reach preprod devices. The residual risk is a preprod job pushing to a token copied from prod — §5.7 (fake seed data) and §5.6 (no cron) both prevent that.

---

## 9. Phase 5 — mobile builds ⛔ BLOCKED on Phase 1

Add `env` blocks to [`../../eas.json`](../../eas.json):

```jsonc
{
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "https://<PREPROD_REF>.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<preprod anon key>",
        "EXPO_PUBLIC_SITE_URL": "https://staging.wooru.in"
      }
    },
    "preview": {
      "distribution": "internal",
      "env": { /* same as development */ }
    },
    "production": {
      "env": {
        "EXPO_PUBLIC_SUPABASE_URL": "https://mbzvcaoulawdugfearmj.supabase.co",
        "EXPO_PUBLIC_SUPABASE_ANON_KEY": "<prod anon key>",
        "EXPO_PUBLIC_SITE_URL": "https://wooru.in"
      }
    }
  }
}
```

`eas.json` is committed, so only publishable values belong here — anon keys and public client IDs qualify. Anything genuinely secret goes in EAS environment variables instead.

**Same-package caveat:** both profiles install as `com.gatebond.app`, so a preprod build *replaces* a prod build on the same device. For side-by-side installs you'd need an `app.config.ts` switching `android.package` to `com.gatebond.app.preprod` behind a flag — plus a separate Google OAuth Android client. Only worth it if you actually need both at once (decision **G**).

---

## 10. Execution checklist

**Phase 0 — repo prep** ✅ **DONE 2026-08-08**
- [x] `.env` untracked, `.gitignore` updated, `.env.example` added
- [x] `public/admin/` (11 files) untracked and gitignored; redundant copy removed from `build-admin.js`
- [x] Admin config placeholder-ised; build-time substitution with fail-fast (both paths tested)
- [x] `lib/siteUrl.ts` added; all 8 hardcoded URLs replaced
- [x] `db:*` scripts split per environment
- [x] `docs/CLAUDE.md` updated
- [x] `npx tsc --noEmit` clean
- [ ] **Commit the 3 applied-but-untracked migrations** (§1.3)
- [ ] **Set Production-scope env vars in Vercel before merging** (§4.2)

**Phase 1 — Supabase preprod**
- [ ] Create project; record ref + keys → *needs §1.1-A*
- [ ] Replace `PREPROD_REF_TODO` in `package.json`
- [ ] `npm run db:push:preprod` — replay 124 migrations
- [ ] Run the schema fingerprint; compare against `baseline-prod.md`; resolve any drift
- [ ] `npm run types:preprod`; re-append enriched types block; `npx tsc --noEmit`
- [ ] Deploy edge functions to preprod (decision **D**)
- [ ] Confirm `pg_cron` absent / no scheduled jobs
- [ ] Write and run `preprod-seed.sql`
- [ ] Configure preprod Auth URLs

**Phase 2 — Vercel + branch**
- [ ] Create and push `preprod`; protect `main`
- [ ] Add env vars at both scopes
- [ ] Deploy `preprod`; verify on the auto-generated preview URL
- [ ] Confirm `/admin` connects to preprod (check the network tab for the preprod ref)

**Phase 3 — domain**
- [ ] Buy `wooru.in` → *needs §1.1-C*
- [ ] Add apex + `www` → `main`; `staging` → branch `preprod`
- [ ] Wait for TLS on all three
- [ ] Add the `noindex` header
- [ ] Complete the §7.5 cutover checklist

**Phase 4 — OAuth + Cloudinary**
- [ ] Create preprod Google Web client; wire into preprod Supabase
- [ ] Create `preprod_unsigned` Cloudinary preset
- [ ] Update Preview-scope env vars; redeploy
- [ ] End-to-end on staging: sign up, sign in, image upload, share link, a visit flow

**Phase 5 — mobile**
- [ ] Add `env` blocks to `eas.json`
- [ ] `eas build --profile preview --platform android`; verify it hits preprod
- [ ] Register the preprod signing SHA-1 if native sign-in fails

**Phase 6 — retire the old URL** — ✅ **obsolete, nothing to do**

The Vercel project was renamed `commloom` → `wooru` on 2026-08-08 using **"Remove old domain"**, not "Redirect". `commloom.vercel.app` no longer resolves and has been dropped from the Google client's origins. Nothing held that URL, so no redirect period was needed. See [`wooru-rebrand-plan.md`](wooru-rebrand-plan.md) §7.1.

---

## 11. Day-to-day workflow after cutover

**A schema change:**

1. Write the migration in `supabase/migrations/` on a feature branch
2. `npm run db:push:preprod` → `npm run types:preprod` → re-append enriched types → `npx tsc --noEmit`
3. PR into `preprod`; verify on `staging.wooru.in`
4. PR `preprod` → `main`
5. **After merging:** `npm run db:push:prod`, then `npm run types:prod` to confirm

**Rules:**
- Migrations reach preprod **first**, always.
- A migration never lands on prod before its code is merged to `main`.
- Both environments run the same files. **Never edit an already-applied migration** — write a new one.
- Recapture the prod fingerprint baseline after every prod push.

⚠️ **Migrations are not applied by CI.** Merging to `main` deploys *code*, not *schema*. Step 5 is manual, and skipping it breaks prod. If it keeps getting forgotten, the fix is a GitHub Action on `main` running `supabase db push` with the project ref and an access token in repo secrets — out of scope here, but the obvious follow-up.

---

## 12. Cost

| Item | Cost |
|---|---|
| Domain (`.com`) | ~₹800–1,200/yr |
| Vercel Hobby | ₹0 (Pro ~$20/mo only for password-protected previews) |
| Supabase preprod | ₹0 on free plan — **pauses after ~7 days idle** |
| Supabase prod | unchanged |
| Cloudinary | unchanged — one account |
| EAS | unchanged |

Realistically this costs the price of a domain. The one thing worth paying for is **Supabase Pro on prod** (backups, no pausing), if you aren't already.

---

## 13. Gotchas

1. **Schema drift is the main risk.** If prod was ever modified through the dashboard, the migration replay produces a preprod that differs from prod, and preprod stops being a valid test. §5.3 is mandatory.
2. **Migrations are not applied by CI.** A deploy whose migration wasn't pushed will break prod.
3. **Preprod cron can send real notifications.** Fake seed data and no `pg_cron` are the two defenses.
4. **Anon keys are public; service role keys are not.** Anon keys in `eas.json`/Vercel are fine. A service role key must never leave Supabase's own function environment.
5. **The admin console has no bundler.** Any future config must go through the `build-admin.js` substitution — it will never read `process.env` at runtime.
6. **A wrong redirect allow-list breaks sign-in immediately.** Changing the prod Site URL logs nobody out, but get the allow-list wrong and auth dies. Do it in a quiet window and test right after.
7. **`npx tsc --noEmit` is the only validation gate** — no test framework, no lint script.

---

## 14. Prod audit findings (2026-08-08)

Surfaced while establishing the baseline. **None are caused by this work, and none are fixed here** — they change production behaviour, so they're your call (decision **D**). Preprod is where you'd want to fix them first.

### 14.1 No edge functions are deployed

`list_edge_functions` on `mbzvcaoulawdugfearmj` returns an empty list. Both `check_due_services` and `fraud-check` exist in the repo but have never been deployed.

### 14.2 Fraud checking is inert and fails silently

[`../../lib/fraudCheck.ts`](../../lib/fraudCheck.ts) calls `supabase.functions.invoke('fraud-check')` in two places. Because the function isn't deployed, every call errors — and both call sites catch it and return a default **PASS**:

```ts
if (error) {
  console.warn('Fraud check failed, defaulting to PASS:', error.message);
  return createDefaultPassVerdict('provider', 'new');
}
```

Failing open is a defensible design choice. The net effect, though, is that **every provider and every review currently passes fraud screening unchecked**, with only a `console.warn` as evidence — nothing surfaces it in the UI or in logs you'd routinely read.

### 14.3 Service reminders never fire

`public.notify_due_services()` exists, but `pg_cron` is not installed (§5.6) and the `check_due_services` edge function is not deployed — so there is no scheduler of either kind. The daily 9:00 AM IST reminder described in the migration does not happen.

Worth cross-checking against commit `674eead` ("enhance service reminders…"), which suggests reminders are believed to be working.

### 14.4 Confirmed healthy

- All **49** public tables have RLS enabled — no exceptions.
- Prod's applied migrations match `supabase/migrations/` exactly: 124/124, identical fingerprint.

---

## 15. Reference — what was verified vs. assumed

Recorded so nobody re-litigates it later.

| Claim | Basis |
|---|---|
| 124 migrations, matching fingerprint | Queried `supabase_migrations.schema_migrations` via MCP; compared against a locally computed hash of the filenames |
| All 49 tables have RLS | Queried `pg_class.relrowsecurity` via MCP |
| `pg_cron` not installed | Queried `pg_extension`; `cron.job` does not exist |
| Zero edge functions deployed | MCP `list_edge_functions` returned `[]` |
| Fraud check fails open | Read the error branches in `lib/fraudCheck.ts` |
| Docker unavailable | `docker --version` → command not found |
| `.env` and `public/admin/` were tracked | `git ls-files` |
| Admin build substitution works | Ran `build-admin.js` both with and without env vars; verified output and exit codes |
| `npx tsc --noEmit` passes | Run after every edit |
| Schema *contents* identical between environments | ❌ **Not verifiable until preprod exists** — this is what §5.3 is for |
