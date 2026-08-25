# Plan — Unified Terms & Privacy screen

**Status:** completed
**Created:** 2026-08-10

## The actual problem

The legal copy is not empty. `public/privacy.html` (13 KB) and `public/terms.html` (10 KB) already
hold full drafts written against India's DPDP Act 2023. What is missing:

1. **No in-app screen.** Nothing in the Expo app renders either document. `app/login.tsx:345-347`
   calls `Linking.openURL(siteUrl('/terms'))`, which on native resolves to `https://wooru.in/terms` —
   a domain that is not live yet (`lib/siteUrl.ts:13`). So on Android/iOS the links dead-end.
2. **No entry point after sign-up.** `app/(tabs)/profile.tsx` has no legal row. Once a user is past
   login the documents are unreachable from anywhere in the product.
3. **Every placeholder is unfilled.** `[LEGAL ENTITY NAME]`, `[REGISTERED ADDRESS]`,
   `[CONTACT EMAIL]`, `[GRIEVANCE OFFICER NAME]`, `[LIABILITY CAP]`, `[JURISDICTION CITY]`, plus a
   "Draft pending legal review" callout on both pages.
4. **The policy promises a right the app cannot deliver.** Privacy §9 offers erasure; there is no
   account-deletion path anywhere in `app/`, `lib/`, or `supabase/migrations/`. Both app stores now
   require in-app account deletion for any app that allows account creation.

## Architecture — one source, two renderers

Decision: the copy lives once in a typed content module. The native screen renders it; a script
regenerates the public HTML from the same data.

```
data/legal.ts  ──▶ app/legal.tsx           (native + PWA render, Verandah-styled)
               └─▶ npm run legal:html
                     ├─ public/terms.html
                     └─ public/privacy.html
```

The public HTML must stay: Play Store and App Store both require a publicly reachable
privacy-policy URL that works before install. Generating it removes the drift risk of two
hand-maintained copies of a legal document.

### `data/legal.ts` shape

```ts
export type LegalBlock =
  | { kind: 'para'; text: string }          // supports **bold** and [text](url)
  | { kind: 'bullets'; items: string[] }
  | { kind: 'table'; head: [string, string]; rows: [string, string][] }
  | { kind: 'subheading'; text: string }
  | { kind: 'callout'; text: string };

export type LegalSection = { number: number; heading: string; blocks: LegalBlock[] };

export type LegalDocument = {
  id: 'terms' | 'privacy';
  title: string;
  lastUpdated: string;     // '8 August 2026'
  intro: LegalBlock[];
  sections: LegalSection[];
};

export const LEGAL_ENTITY = { name: '…', address: '…', email: '…', grievanceOfficer: '…', jurisdiction: '…', liabilityCap: '…' };
export const TERMS: LegalDocument = { … };
export const PRIVACY: LegalDocument = { … };
```

Entity details are referenced through `LEGAL_ENTITY`, not inlined, so filling the placeholders is a
one-object edit.

The inline-markup subset (`**bold**`, `[text](url)`) needs one tiny renderer used by both targets —
about 25 lines, no dependency. Everything in the current drafts fits these five block kinds; the
`table` kind covers Privacy §1/§3/§6.

## UI — single screen, segmented control

`app/legal.tsx`, one route, both documents:

```
┌──────────────────────────────────────┐
│ ‹  Terms & Privacy                   │  HeaderBackButton
├──────────────────────────────────────┤
│  ┌───────────┬────────────────────┐  │  segmented control
│  │  Terms    │  Privacy Policy    │  │  (my-posts.tsx pattern)
│  └───────────┴────────────────────┘  │
│  Last updated: 8 August 2026         │
│  ─────────────────────────────────── │
│  1. What Wooru is                    │  ScrollView, sections
│  Wooru is a coordination tool …      │
└──────────────────────────────────────┘
```

- Segmented control copied from the established pattern at `app/mcn/my-posts.tsx:273-290`
  (`segmentContainer` / `segmentBtn` / `segmentActive`).
- Deep-linkable: `?doc=privacy` selects the Privacy tab via `useLocalSearchParams`, mirroring how
  `my-posts.tsx:42-44` reads its `segment` param. Lets `/legal?doc=privacy` be linked directly.
- Scroll position resets on tab switch (separate `ScrollView` per doc, or a `scrollTo(0)` on change).
- Verandah tokens only — `Verandah`, `VerandahType`, `VerandahSpace`, `VerandahRadius`,
  `VerandahLayout`. No raw hex, no new colors. See `docs/verandah.md` before writing styles.

## Work items

### 1. Content module
- Create `data/legal.ts` with the types above, porting **all** existing copy from
  `public/terms.html` (17 sections) and `public/privacy.html` (12 sections) verbatim — this is a
  transcription, not a rewrite. Keep the DPDP framing, the multi-tenant visibility table, the
  "providers are not users" section, and the platform-not-a-party disclaimers; they are the parts
  that actually matter for this product.
- Add `LEGAL_ENTITY` and thread it through every former placeholder.
- Drop the "Draft pending legal review" callout only once real values land (see Inputs needed).

### 2. Inline-markup renderer
- `lib/legalMarkup.ts` — parse `**bold**` and `[text](url)` into segments.
- Native consumer maps segments to `<Text>` children, links via `Linking.openURL`.
- HTML consumer maps to `<strong>` / `<a>`, with escaping.

### 3. Native screen
- `app/legal.tsx` as described. `HeaderBackButton` for the header.
- Add `if (cleanPath === '/legal') return '/profile';` to `getImmediateParentRoute()` in
  `lib/navigation.ts` (near the `/services` mapping at line 376). Without it the default fallback
  sends back-navigation to `/network`, which is wrong.

### 4. Entry points
- **Profile tab** — new row in the grouped menu card in `app/(tabs)/profile.tsx` (after
  Notifications, ~line 285), `FileText`-style icon from `@untitledui/icons`, subtitle
  "Terms of service & privacy". This is the main fix: currently there is no post-signup access.
- **Login screen** — repoint `app/login.tsx:308`, `:345`, `:347` from
  `Linking.openURL(siteUrl('/terms'))` to `router.push('/legal')` /
  `router.push('/legal?doc=privacy')`. Fixes the native dead-end and keeps the user in the app
  during signup.

### 5. HTML generator
- `scripts/generate-legal-html.js` — reads the compiled content module, emits both files using the
  existing page chrome from `public/privacy.html` (same `:root` tokens, header, nav, footer, media
  query) so the public pages look unchanged.
- `"legal:html": "node scripts/generate-legal-html.js"` in `package.json`.
- Reading a `.ts` module from a plain Node script needs a step: simplest is `npx tsx` (or keep
  `data/legal.ts` free of imports and transpile it inline with `esbuild`, already present via Expo).
  Pick one and document it in `docs/CLAUDE.md`.
- Run the script and commit the regenerated output so `public/*.html` stays the deployed artifact —
  `vercel.json` rewrites `/terms` and `/privacy` to those files.

### 6. Docs (part of this change set, not a follow-up)
- `docs/features.md` — the Terms & Privacy screen and its entry points.
- `docs/architecture.md` — the `/legal` route and its `getImmediateParentRoute` mapping.
- `docs/CLAUDE.md` — the rule: **legal copy is edited in `data/legal.ts`, never in
  `public/*.html`; run `npm run legal:html` after editing.**
- `docs/verandah.md` — only if the segmented control gets extracted into a shared component.

### 7. Validation
- `npx tsc --noEmit` — the only gate in this repo.
- Manually check: both tabs render, deep link `?doc=privacy` lands correctly, back button returns to
  Profile from both a push and a cold deep link, and links inside the copy open.
- Confirm the regenerated HTML still renders at `/terms` and `/privacy`.

## Inputs needed from you

The drafts cannot ship as final without these. Everything else in the plan can be built first with
the placeholders left in place, so this is not a blocker to starting.

| Placeholder | Needed for |
|---|---|
| `[LEGAL ENTITY NAME]` | Terms intro, Privacy intro |
| `[REGISTERED ADDRESS]` | Terms intro, Privacy §10 |
| `[CONTACT EMAIL]` | Terms §17, Privacy §10 |
| `[GRIEVANCE OFFICER NAME]` | Privacy §10 — **mandatory** under the DPDP Act |
| `[LIABILITY CAP]` | Terms §12 |
| `[JURISDICTION CITY]` | Terms §15 |

## Deliberately out of scope

- **Account deletion.** The gap is real and store-blocking, but it is a feature with schema, RLS,
  and data-retention consequences, not a copy change. Tracked separately; the interim honest
  position is Privacy §9's "contact us" route, which the plan preserves.
- **Consent versioning.** Recording *which* version of the terms a user accepted, and re-prompting
  on change, needs a column and a gate. Terms §16's "continuing to use Wooru means you accept it"
  covers it for now.
- **Legal review.** Nothing here substitutes for a lawyer reading the final text.
